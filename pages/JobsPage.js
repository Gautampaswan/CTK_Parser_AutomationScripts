// Email Parser Jobs: find by subject/token, read log, tick Replay Job checkbox, wait for Status=Completed.
// Replay UI (verified 2026-11-05 on EPJ-000019): Edit → checkbox name=ctkemailparser__ReplayJob__c label "Replay Job" → Save.
// No separate Replay button (header has Download (EML) / Edit / Delete).
const fs = require('fs');
const { expect } = require('@playwright/test');
const u = require('../helpers/uiFactory');

const logUiPauseMs = () => Number(process.env.CTK_LOG_UI_PAUSE_MS || 3500);

class JobsPage {
  constructor(page) { this.page = page; }

  static isJobRecordHref(href) {
    return !!(href && /\/lightning\/r\/a02[0-9A-Za-z]{13,18}\/view/.test(href));
  }

  /** EPJ record links in the list grid only (never /lightning/o/.../home). */
  jobRecordLinks() {
    return this.page.locator(
      '[role="grid"] a[href*="/lightning/r/a02"], table a[href*="/lightning/r/a02"]',
    );
  }

  /** Recently Viewed often shows 0 jobs — open that list-view dropdown and pick All. */
  async gotoAllJobsList() {
    await this.page.goto('/lightning/o/ctkemailparser__EmailParserJob__c/list?filterName=All');
    await this.page.waitForTimeout(2500);
    // Do not click nav "Email Parser Jobs" — that opens object /home, not the list.

    for (let attempt = 0; attempt < 4; attempt++) {
      const header = await this.page.locator('.slds-page-header, [class*="page-header"]').first().innerText().catch(() => '');
      if (/^All$/m.test(header) || /All Email Parser Jobs/i.test(header)) break;
      if (!/Recently Viewed/i.test(header) && attempt > 0) break;

      let opened = false;
      const pickers = [
        this.page.getByRole('button', { name: /^Recently Viewed$/i }).first(),
        this.page.getByRole('button', { name: /Select a List View:\s*Email Parser Jobs/i }).first(),
        this.page.getByRole('button', { name: /Select a List View/i }).first(),
        this.page.locator('button[title*="Select a List View"]').first(),
      ];
      for (const p of pickers) {
        if (!(await p.count())) continue;
        await p.click();
        opened = true;
        break;
      }
      if (!opened) {
        const chevron = this.page.locator('.slds-page-header').getByRole('button').filter({ has: this.page.locator('svg, lightning-icon') }).first();
        if (await chevron.count()) await chevron.click();
      }

      await this.page.waitForTimeout(1200);
      const allChoices = [
        this.page.getByRole('option', { name: /^All$/i }).first(),
        this.page.getByRole('option', { name: /All Email Parser Jobs/i }).first(),
        this.page.getByRole('menuitem', { name: /^All$/i }).first(),
        this.page.locator('[role="listbox"] [role="option"], [role="menu"] a, [role="menu"] span').filter({ hasText: /^All$/ }).first(),
        this.page.getByText(/^All$/, { exact: true }).last(),
      ];
      for (const choice of allChoices) {
        if (!(await choice.count())) continue;
        await choice.click();
        await this.page.waitForTimeout(3000);
        break;
      }
    }

    const after = await this.page.locator('.slds-page-header, [class*="page-header"]').first().innerText().catch(() => '');
    console.log(`[jobs] list view header: ${after.replace(/\s+/g, ' ').slice(0, 100)}`);
  }

  async findBySubject(tok, { timeoutMs = Number(process.env.POLL_TIMEOUT_MS || 240000) } = {}) {
    const end = Date.now() + timeoutMs;
    const needle = String(tok || '').trim();
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    while (Date.now() < end) {
      await this.gotoAllJobsList();
      const s = this.page.getByPlaceholder('Search this list...');
      if (!(await s.waitFor({ timeout: 20000 }).then(() => true).catch(() => false))) {
        await this.page.waitForTimeout(5000);
        continue;
      }
      await s.fill('');
      await s.fill(needle);
      await s.press('Enter');
      await this.page.waitForTimeout(5000);
      if (esc) {
        const row = this.page.getByRole('row').filter({ hasText: new RegExp(esc, 'i') }).first();
        if (await row.count()) {
          const rowLink = row.locator('a[href*="/lightning/r/a02"]').first();
          if (await rowLink.count()) return rowLink.getAttribute('href');
        }
      }
      const ids = await u.globalSearchIds(this.page, needle, 'a02').catch(() => []);
      for (const id of ids) {
        const href = `/lightning/r/${id}/view`;
        if (await this.jobHrefMatches(href, { subject: needle, messageId: needle })) return href;
      }
      await this.page.waitForTimeout(15000);
    }
    return null;
  }

  /** First EPJ row on All list (prior jobs deleted each test → newest job is row 1). */
  async firstJobHrefInAllList() {
    await this.gotoAllJobsList();
    const gridLinks = this.jobRecordLinks();
    const n = await gridLinks.count();
    for (let i = 0; i < n; i++) {
      const href = await gridLinks.nth(i).getAttribute('href');
      if (JobsPage.isJobRecordHref(href)) return href;
    }
    const rows = this.page.getByRole('row');
    for (let i = 0; i < await rows.count(); i++) {
      const rowLink = rows.nth(i).locator('a[href*="/lightning/r/a02"]').first();
      if (!(await rowLink.count())) continue;
      const href = await rowLink.getAttribute('href');
      if (JobsPage.isJobRecordHref(href)) return href;
    }
    const epj = this.page.getByRole('link', { name: /^EPJ-\d+/i }).first();
    if (await epj.count()) {
      const href = await epj.getAttribute('href');
      if (JobsPage.isJobRecordHref(href)) return href;
    }
    return null;
  }

  /**
   * After SMTP send: Email Parser Jobs → All → first job in list (list search often empty in this org).
   */
  async findJobForEmail({ subject, messageId, timeoutMs = Number(process.env.POLL_TIMEOUT_MS || 240000) } = {}) {
    const end = Date.now() + timeoutMs;
    const mid = String(messageId || '').replace(/^<|>$/g, '');
    while (Date.now() < end) {
      const href = await this.firstJobHrefInAllList();
      if (href && JobsPage.isJobRecordHref(href)) {
        console.log(`[jobs] using first Email Parser Job in All list: ${href}`);
        const body = await this.openAndReadLog(href);
        const fields = this.parseJobFields(body);
        if (subject && fields.subject && !fields.subject.includes(subject)) {
          console.warn(`[jobs] first job subject="${fields.subject}" (expected to contain "${subject}")`);
        }
        if (mid && fields.messageId && !fields.messageId.toLowerCase().includes(mid.toLowerCase())) {
          console.warn(`[jobs] first job messageId="${fields.messageId}" (expected "${mid}")`);
        }
        return href;
      }
      await this.page.waitForTimeout(12000);
    }
    return null;
  }

  async searchAllJobsList(term) {
    const needle = String(term || '').trim();
    if (!needle) return null;
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await this.gotoAllJobsList();
    const s = this.page.getByPlaceholder('Search this list...');
    if (!(await s.waitFor({ timeout: 20000 }).then(() => true).catch(() => false))) return null;
    await s.fill('');
    await s.fill(needle);
    await s.press('Enter');
    await this.page.waitForTimeout(5000);
    const row = this.page.getByRole('row').filter({ hasText: new RegExp(esc, 'i') }).first();
    if (!(await row.count())) return null;
    const rowLink = row.locator('a[href*="/lightning/r/a02"]').first();
    if (!(await rowLink.count())) return null;
    return rowLink.getAttribute('href');
  }

  async jobHrefMatches(href, { subject, messageId } = {}) {
    const body = await this.openAndReadLog(href);
    if (!/Email Parser Job|EPJ-\d+/i.test(body)) return false;
    const fields = this.parseJobFields(body);
    if (subject && fields.subject && !fields.subject.includes(subject)) return false;
    if (messageId && fields.messageId) {
      const a = messageId.toLowerCase();
      const b = fields.messageId.toLowerCase();
      if (!b.includes(a) && !a.includes(b.replace(/^<|>$/g, ''))) return false;
    } else if (messageId && !fields.messageId && subject && !fields.subject) {
      return false;
    }
    return true;
  }

  async open(hrefOrId) {
    const href = hrefOrId.startsWith('/') ? hrefOrId : `/lightning/r/${hrefOrId}/view`;
    if (!JobsPage.isJobRecordHref(href)) {
      throw new Error(`Not an Email Parser Job record URL: ${href}`);
    }
    await this.page.goto(href);
    const heading = this.page.getByRole('heading', { name: /EPJ-\d+|Email Parser Job/i }).first();
    // Do not use status.or(heading) — both match on EPJ detail and Playwright strict mode throws.
    await expect(heading).toBeVisible({ timeout: 45000 });
    return href;
  }

  /** Details tab body text only (Status polling). Does not open Related or Email Parser Log. */
  async openAndReadDetailsBody(href) {
    await this.open(href);
    return this.page.locator('body').innerText();
  }

  /** @deprecated use openAndReadDetailsBody */
  async openAndReadLog(href) {
    return this.openAndReadDetailsBody(href);
  }

  relatedTabOnRecord() {
    const layout = this.page.locator('records-record-layout-event-broker, records-lwc-detail-panel, .slds-tabs_card').first();
    return layout.getByRole('tab', { name: /^Related$/i }).first();
  }

  notesAndAttachmentsBlock() {
    return this.page.locator('article, section, [class*="relatedList"], force-related-list-single-container')
      .filter({ hasText: /Notes & Attachments/i }).first();
  }

  /** Lightning file links: role=link, forceContent link, or title containing Email Parser Log. */
  emailParserLogLink(scope = this.page) {
    const inScope = (loc) => loc.first();
    const candidates = [
      inScope(scope.getByRole('link', { name: /Email Parser Log/i })),
      inScope(scope.locator('a[title*="Email Parser Log" i], a[download*="Email Parser Log" i]')),
      inScope(scope.locator('a, span.forceContentFileCard, span[role="button"]').filter({ hasText: /Email Parser Log/i })),
      inScope(scope.getByText(/Email Parser Log/i)),
    ];
    return candidates;
  }

  async findEmailParserLogLink({ log } = {}) {
    const say = (msg) => { if (log) log(msg); };
    const notesBlock = this.notesAndAttachmentsBlock();
    const scopes = (await notesBlock.count()) ? [notesBlock, this.page] : [this.page];
    for (const scope of scopes) {
      for (const loc of this.emailParserLogLink(scope)) {
        if (await loc.count()) return loc;
      }
    }
    const notesText = (await notesBlock.innerText().catch(() => '')) || '';
    if (notesText) say(`[log] Notes & Attachments visible text: ${notesText.slice(0, 400).replace(/\s+/g, ' ')}`);
    return null;
  }

  /**
   * Steps 2–4 of manual-parity log read (caller opens EPJ record first).
   * Related → Notes & Attachments → Email Parser Log → plain text (tab or download).
   */
  async readEmailParserLogAttachmentText({ log, requireLogContent = true } = {}) {
    const say = (msg) => { if (log) log(msg); };
    const pause = logUiPauseMs();
    const logWaitMs = Number(process.env.CTK_LOG_ATTACHMENT_WAIT_MS || 120000);
    const logPollMs = Number(process.env.CTK_LOG_ATTACHMENT_POLL_MS || 5000);

    const clickRelated = async () => {
      let related = this.relatedTabOnRecord();
      if (!(await related.count())) related = this.page.getByRole('tab', { name: /^Related$/i }).first();
      if (!(await related.count())) throw new Error('Email Parser Job has no Related tab');
      await related.scrollIntoViewIfNeeded();
      await related.click();
      await expect(this.page.locator('body')).toContainText(/Notes & Attachments/i, { timeout: 30000 });
    };

    say('[validate 2/4] Click Related tab on Email Parser Job');
    await clickRelated();
    await this.page.waitForTimeout(Math.max(2500, pause));

    let logLink = null;
    const linkDeadline = Date.now() + logWaitMs;
    while (Date.now() < linkDeadline) {
      logLink = await this.findEmailParserLogLink({ log });
      if (logLink) break;
      say('[log] waiting for "Email Parser Log" under Notes & Attachments…');
      await this.page.waitForTimeout(logPollMs);
      await clickRelated().catch(() => {});
    }
    if (!logLink) {
      throw new Error('"Email Parser Log" attachment not found under Related → Notes & Attachments (waited for file to appear)');
    }

    say('[validate 3/4] Under Notes & Attachments, click "Email Parser Log"');
    const ctx = this.page.context();
    const popupWait = ctx.waitForEvent('page', { timeout: 45000 });
    const downloadWait = this.page.waitForEvent('download', { timeout: 45000 }).catch(() => null);
    await logLink.scrollIntoViewIfNeeded();
    await logLink.click();
    const preview = await popupWait.catch(() => null);

    let text = '';
    if (preview) {
      await preview.waitForLoadState('domcontentloaded');
      await preview.waitForTimeout(Math.max(2000, pause));
      text = await preview.locator('body').innerText().catch(() => '');
      if (!/PROCESSING STARTS|Parsed Data|EXECUTION COMPLETED/i.test(text)) {
        const pre = preview.locator('pre').first();
        if (await pre.count()) text = await pre.innerText();
      }
      say(`[validate 3/4] Email Parser Log opened in new tab (${text.length} chars)`);
      if (requireLogContent && (!/PROCESSING STARTS/i.test(text) || !/Parsed Data/i.test(text) || !/EXECUTION COMPLETED/i.test(text))) {
        throw new Error('Email Parser Log missing PROCESSING STARTS, Parsed Data, or EXECUTION COMPLETED');
      }
      if (log && text) {
        const show = text.length > 5000 ? `${text.slice(0, 5000)}\n…[truncated ${text.length - 5000} chars]` : text;
        log(`[log] ---------- Email Parser Log ----------\n${show}\n[log] ------------------------------------`);
      }
      if (process.env.CTK_KEEP_LOG_TAB !== '1') await preview.close().catch(() => {});
      else say('[log] CTK_KEEP_LOG_TAB=1 — log tab left open');
      return text;
    }

    const dl = await downloadWait;
    if (dl) {
      const path = await dl.path();
      text = fs.readFileSync(path, 'utf8');
      say(`[validate 3/4] Email Parser Log downloaded (${text.length} chars)`);
      if (requireLogContent && (!/PROCESSING STARTS/i.test(text) || !/Parsed Data/i.test(text) || !/EXECUTION COMPLETED/i.test(text))) {
        throw new Error('Email Parser Log missing PROCESSING STARTS, Parsed Data, or EXECUTION COMPLETED');
      }
      if (log && text) {
        const show = text.length > 5000 ? `${text.slice(0, 5000)}\n…[truncated]` : text;
        log(`[log] ---------- Email Parser Log ----------\n${show}\n[log] ------------------------------------`);
      }
      return text;
    }

    throw new Error('Clicking "Email Parser Log" did not open a new tab or download a file');
  }

  /** Read Status from EPJ Details tab (must already be on job record or pass href to navigate). */
  async readStatusOnDetails(hrefOrId) {
    if (hrefOrId) await this.open(hrefOrId);
    const body = await this.page.locator('body').innerText();
    return (this.parseJobFields(body).status || '').trim();
  }

  /**
   * Manual UI through Email Parser Log (steps 1–3). Does not assert log body content.
   * @returns {Promise<{ logText: string, logOpened: boolean }>}
   */
  async openJobRelatedAndEmailParserLog(hrefOrId, opts = {}) {
    const say = (msg) => { if (opts.log) opts.log(msg); };
    say(`[validate 1/4] Open Email Parser Job record ${hrefOrId}`);
    await this.open(hrefOrId);
    const logText = await this.readEmailParserLogAttachmentText({ ...opts, requireLogContent: false });
    return { logText, logOpened: true };
  }

  /** Steps 1–4: open EPJ → Related → Email Parser Log attachment → plain-text log. */
  async readExecutionLogFromJob(hrefOrId, opts = {}) {
    const say = (msg) => { if (opts.log) opts.log(msg); };
    say(`[validate 1/4] Open Email Parser Job record ${hrefOrId}`);
    await this.open(hrefOrId);
    return this.readEmailParserLogAttachmentText({ ...opts, requireLogContent: true });
  }

  /** Parse common fields from the job detail page body text. */
  parseJobFields(body) {
    const grab = (label) => {
      const re = new RegExp(`\\n${label}\\n(?:Help[^\\n]*\\n)?([^\\n]+)`, 'i');
      const m = re.exec(body);
      return m ? m[1].trim() : '';
    };
    let status = grab('Status');
    if (!status) {
      const m = /(?:^|\n)Status[\s\S]{0,160}?\b(Completed|In Progress|Failed|Error|Pending|Queued)\b/i.exec(body);
      if (m) status = m[1];
    }
    return {
      status,
      subject: grab('Subject'),
      from: grab('From') || grab('From Address'),
      to: grab('To') || grab('To Address'),
      messageId: grab('Message Id') || grab('Message ID') || grab('MessageId'),
      // Email Send Date is not on the job layout in this org; Created By line may include a date.
      createdBy: grab('Created By'),
      name: grab('Email Parser Job Name') || grab('Email Parser Job') || grab('Name'),
    };
  }

  idFromHref(href) { return u.idFromUrl(href); }

  /** Delete Email Parser Job from record header (Download / Edit / Delete). */
  async delete(hrefOrId) {
    await this.open(hrefOrId);
    const header = this.page.locator('.slds-page-header, records-record-layout-event-broker').first();
    let del = header.getByRole('button', { name: 'Delete', exact: true }).first();
    if (!(await del.isVisible().catch(() => false))) {
      del = this.page.getByRole('button', { name: 'Delete', exact: true }).first();
    }
    if (!(await del.isVisible().catch(() => false))) {
      const more = this.page.getByRole('button', { name: /Show more actions/i }).first();
      if (await more.count()) {
        await more.click();
        await this.page.waitForTimeout(800);
        del = this.page.getByRole('menuitem', { name: 'Delete' }).first();
      }
    }
    await del.click({ timeout: 15000 });
    const confirm = this.page.getByRole('dialog').filter({ hasText: /delete|sure/i }).last();
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(u.toastWith(this.page, /was deleted|deleted/i)).toBeVisible({ timeout: 30000 });
  }

  /**
   * Tick Replay Job on the job and Save. Returns after save toast.
   * Verified org locator: input[name="ctkemailparser__ReplayJob__c"] on Edit dialog.
   */
  async replay(hrefOrId) {
    const href = await this.open(hrefOrId);
    await this.page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const dlg = u.dialog(this.page);
    await dlg.waitFor({ timeout: 20000 });
    const byName = dlg.locator('input[name="ctkemailparser__ReplayJob__c"]');
    const byLabel = dlg.getByLabel(/Replay Job/i);
    if (await byName.count()) {
      const cb = byName.first();
      if (!(await cb.isChecked())) await cb.click({ force: true });
    } else if (await byLabel.count()) {
      const cb = byLabel.first();
      if (!(await cb.isChecked().catch(() => false))) await cb.click({ force: true });
    } else {
      const near = dlg.locator('lightning-input').filter({ hasText: /Replay/i }).locator('input[type="checkbox"]').first();
      if (!(await near.count())) throw new Error('Replay Job checkbox not found on job Edit dialog');
      if (!(await near.isChecked())) await near.click({ force: true });
    }
    await u.saveDialog(this.page);
    await expect(u.toastWith(this.page, /was saved|saved/i)).toBeVisible({ timeout: 30000 });
    return href;
  }

  /** Poll job page until Status field matches (default Completed). Does not match labels like "Email Parsers Processed". */
  async waitForStatus(hrefOrId, want = /^Completed$/i, { timeoutMs = Number(process.env.POLL_TIMEOUT_MS || 240000), intervalMs = 8000, log } = {}) {
    const say = (msg) => { if (log) log(msg); };
    say('[jobs] polling EPJ Details tab for Status=Completed (Related + log open only after this finishes)');
    const end = Date.now() + timeoutMs;
    let last = '';
    while (Date.now() < end) {
      const body = await this.openAndReadDetailsBody(hrefOrId);
      const fields = this.parseJobFields(body);
      last = (fields.status || '').trim();
      if (want.test(last)) return { body, fields };
      if (/^Failed|Error/i.test(last)) {
        throw new Error(`Email Parser Job status="${last}" (expected ${want})`);
      }
      await this.page.waitForTimeout(intervalMs);
    }
    throw new Error(`Timed out waiting for job status ${want}. Last status="${last}"`);
  }
}
module.exports = { JobsPage };
