// UI helpers / page-object functions for CTK Email Parser (Lightning). No API needed.
// Locators verified in org 04-Nov-2026: inputs by name="<field API>", comboboxes by exact aria-label.
const { expect } = require('@playwright/test');

const REL = {
  filters: 'ctkemailparser__Email_Filters__r',
  fieldParsers: 'ctkemailparser__FieldParsers__r',
  actions: 'ctkemailparser__EmailParserActions__r',
};
const ACTIVE_BANNER = 'Active Email Parser cannot be modified. To make any modifications to Email parser or related configurations, please deactivate email parser.';
const ACTIVE_ERROR = /Active email parser details cannot be modified/i;
const idFromUrl = (u) => (/\/(a0[0-9A-Za-z]{13,16})\/view/.exec(u) || [])[1];
const autoName = (tag) => `AUTO_${tag}_${Date.now().toString(36).toUpperCase()}`;

// note: the 'We hit a snag' popover is also role=dialog, so pick the modal that has a footer button
const dialog = (page) => page.locator('[role="dialog"]:has(button:text-is("Cancel")), [role="dialog"]:has(button:text-is("Next")), [role="dialog"]:has(button:text-is("Finish"))').first();
const toast = (page) => page.locator('.slds-notify_toast, .toastMessage').last();
const toastWith = (page, re) => page.locator('.slds-notify_toast, .toastMessage').filter({ hasText: re }).first();

async function pickCombo(page, scope, label, option) {
  const cb = scope.getByRole('combobox', { name: label, exact: true });
  await cb.scrollIntoViewIfNeeded();
  const current = ((await cb.innerText().catch(() => '')) || (await cb.getAttribute('data-value')) || '').trim();
  if (current === option) return;
  const esc = option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const opt = page.locator('[role="option"]:visible').filter({ hasText: new RegExp(`^\\s*${esc}\\s*$`) }).first();
  for (let i = 0; i < 4; i++) {
    await cb.click({ force: i > 0 });
    try { await opt.waitFor({ state: 'attached', timeout: 4000 }); break; } catch (e) {
      if (i === 3) throw e;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    }
  }
  // Lightning dropdowns can render outside the modal viewport -> DOM click is reliable
  await opt.evaluate((el) => el.click());
}

async function comboOptions(page, scope, label) {
  const cb = scope.getByRole('combobox', { name: label, exact: true });
  await cb.click();
  await page.waitForTimeout(800);
  const opts = await page.locator('[role="option"]:visible').allInnerTexts();
  await page.keyboard.press('Escape');
  return opts.map((o) => o.trim()).filter(Boolean);
}

async function saveDialog(page) {
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
}

// ---------- Email Parser ----------
async function openNewParserForm(page) {
  await page.goto('/lightning/o/ctkemailparser__Email_Parser__c/new');
  const dlg = dialog(page);
  await dlg.locator('input[name="ctkemailparser__Name__c"]').waitFor({ timeout: 30000 });
  return dlg;
}

/** Create INACTIVE Email Parser via UI; returns record Id. */
async function createParserUI(page, name, filterEvaluation = 'AND', customFilter) {
  const dlg = await openNewParserForm(page);
  await dlg.locator('input[name="ctkemailparser__Name__c"]').fill(name);
  if (filterEvaluation !== 'AND') await pickCombo(page, dlg, 'Filter Evaluation', filterEvaluation);
  if (customFilter !== undefined) await dlg.locator('input[name="ctkemailparser__Custom_Filter__c"]').fill(customFilter);
  await saveDialog(page);
  await page.waitForURL(/\/lightning\/r\/(ctkemailparser__Email_Parser__c\/)?a0[0-9A-Za-z]+\/view/, { timeout: 30000 });
  return idFromUrl(page.url());
}

async function openRecord(page, id) {
  await page.goto(`/lightning/r/${id}/view`);
  await page.getByRole('button', { name: 'Delete', exact: true }).first().waitFor({ timeout: 30000 });
  await closeModals(page);
}

async function closeModals(page) {
  for (let i = 0; i < 3; i++) {
    const m = page.locator('.slds-modal.slds-fade-in-open, div[role="dialog"][aria-modal="true"]').filter({ has: page.getByRole('button', { name: 'Cancel' }) });
    if (!(await m.count())) return;
    await m.last().getByRole('button', { name: 'Cancel' }).last().click({ timeout: 5000 }).catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(800);
  }
}

async function editParserUI(page, id, { name, active, filterEvaluation, customFilter } = {}) {
  await openRecord(page, id);
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const dlg = dialog(page);
  await dlg.locator('input[name="ctkemailparser__Name__c"]').waitFor({ timeout: 20000 });
  if (name !== undefined) await dlg.locator('input[name="ctkemailparser__Name__c"]').fill(name);
  if (filterEvaluation) await pickCombo(page, dlg, 'Filter Evaluation', filterEvaluation);
  if (customFilter !== undefined) await dlg.locator('input[name="ctkemailparser__Custom_Filter__c"]').fill(customFilter);
  if (active !== undefined) {
    const cb = dlg.locator('input[name="ctkemailparser__Active__c"]');
    if ((await cb.isChecked()) !== active) await cb.click({ force: true });
  }
  await saveDialog(page);
  return dlg;
}

async function setActiveUI(page, id, active) {
  await editParserUI(page, id, { active });
  await expect(toastWith(page, /was saved/)).toBeVisible({ timeout: 20000 });
}

/** Deactivate (if needed) and delete parser; children cascade. Only for AUTO_ records. */
async function deleteParserUI(page, parserId) {
  await openRecord(page, parserId);
  await closeModals(page);
  await page.getByRole('button', { name: 'Delete', exact: true }).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  if (await page.getByText('Active Email Parser cannot be modified').count()) {
    await setActiveUI(page, parserId, false).catch(() => {});
    await openRecord(page, parserId);
  }
  await closeModals(page);
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').filter({ has: page.locator('button:text-is("Delete")') }).last()
    .getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(toastWith(page, /was deleted/)).toBeVisible({ timeout: 20000 });
}

async function cloneParserUI(page, id, cloneName) {
  await openRecord(page, id);
  await page.getByRole('button', { name: /Show more actions/ }).first().click();
  await page.getByRole('menuitem', { name: 'Clone' }).click();
  const dlg = dialog(page);
  const input = dlg.locator('input[name="txtParserName"]');
  await input.waitFor({ timeout: 20000 });
  const prefilled = await input.inputValue();
  await input.fill(cloneName);
  await dlg.getByRole('button', { name: 'Next', exact: true }).click();
  return { dlg, prefilled };
}

// ---------- Related records ----------
async function dismissInterrupt(page) {
  const d = page.getByRole('dialog').filter({ hasText: 'Sorry to interrupt' });
  if (await d.count()) await d.locator('button').first().click({ force: true }).catch(() => {});
}
async function openNewRelated(page, parserId, rel) {
  // retried once: the org intermittently shows 'Sorry to interrupt' / slow related-list rendering
  for (let i = 0; ; i++) {
    try {
      await page.goto(`/lightning/r/${parserId}/related/${rel}/view`);
      await page.getByRole('button', { name: 'New', exact: true }).first().click();
      const dlg = dialog(page);
      await dlg.getByRole('button', { name: 'Save', exact: true }).waitFor({ timeout: 30000 });
      return dlg;
    } catch (e) { if (i >= 1) throw e; await dismissInterrupt(page); }
  }
}

async function firstRelatedId(page, parserId, rel, linkRe) {
  await page.goto(`/lightning/r/${parserId}/related/${rel}/view`);
  const link = page.getByRole('link', { name: linkRe }).first();
  await link.waitFor({ timeout: 20000 });
  return idFromUrl(await link.getAttribute('href'));
}

async function relatedCount(page, parserId, rel) {
  await page.goto(`/lightning/r/${parserId}/related/${rel}/view`);
  await page.waitForTimeout(5000);
  const t = await page.locator('body').innerText();
  const m = /(\d+)\s+items?\s+•/.exec(t);
  return m ? Number(m[1]) : 0;
}

async function fillFilterForm(page, dlg, { name, source, operation, value, sequence, headerName }) {
  if (name !== undefined) await dlg.locator('input[name="Name"]').fill(name);
  if (source) await pickCombo(page, dlg, 'Source', source);
  if (headerName !== undefined) await dlg.locator('input[name="ctkemailparser__HeaderName__c"]').fill(headerName);
  if (operation) await pickCombo(page, dlg, 'Operation', operation);
  if (value !== undefined) await dlg.locator('input[name="ctkemailparser__Value__c"]').fill(value);
  if (sequence !== undefined) await dlg.locator('input[name="ctkemailparser__Sequence__c"]').fill(String(sequence));
}

async function createFilterUI(page, parserId, f) {
  const dlg = await openNewRelated(page, parserId, REL.filters);
  await fillFilterForm(page, dlg, f);
  await saveDialog(page);
  await expect(toastWith(page, /was created/)).toBeVisible({ timeout: 20000 });
}

async function fillFieldParserForm(page, dlg, { referenceName, type, outputType, source }) {
  if (type) await pickCombo(page, dlg, 'Type', type);
  if (referenceName !== undefined) await dlg.locator('input[name="ctkemailparser__ReferenceName__c"]').fill(referenceName);
  if (outputType && outputType !== 'Text') await pickCombo(page, dlg, 'Output Type', outputType);
  if (source) await pickCombo(page, dlg, 'Source', source);
}

/** Create Field Parser from parser related list; returns FP record Id. */
async function createFieldParserUI(page, parserId, { referenceName, type = 'Text', outputType = 'Text', source = 'Text Body' }) {
  const dlg = await openNewRelated(page, parserId, REL.fieldParsers);
  await fillFieldParserForm(page, dlg, { referenceName, type, outputType, source });
  await saveDialog(page);
  await expect(toastWith(page, /was created/)).toBeVisible({ timeout: 20000 });
  return firstRelatedId(page, parserId, REL.fieldParsers, /^FP-\d+$/);
}

async function fillActionForm(page, dlg, { name, type, sequence, objectType, mapping, filterCriteria, emailStatus, attachAs }) {
  if (name !== undefined) await dlg.locator('input[name="Name"]').fill(name);
  if (type) await pickCombo(page, dlg, 'Type', type);
  if (sequence !== undefined) await dlg.locator('input[name="ctkemailparser__Sequence__c"]').fill(String(sequence));
  if (objectType !== undefined) await dlg.locator('input[name="ctkemailparser__ObjectType__c"]').fill(objectType);
  if (mapping !== undefined) await dlg.getByLabel('Mapping').fill(typeof mapping === 'string' ? mapping : JSON.stringify(mapping));
  if (attachAs) await pickCombo(page, dlg, 'Attach as', attachAs);
  if (emailStatus) await pickCombo(page, dlg, 'Email Status', emailStatus);
  if (filterCriteria !== undefined) await dlg.getByLabel('Filter Criteria').fill(filterCriteria);
}

async function createActionUI(page, parserId, a) {
  const dlg = await openNewRelated(page, parserId, REL.actions);
  await fillActionForm(page, dlg, a);
  await saveDialog(page);
  await expect(toastWith(page, /was created/)).toBeVisible({ timeout: 20000 });
  return firstRelatedId(page, parserId, REL.actions, new RegExp(`^${a.name}$`));
}

/** Find parsers whose Name starts with prefix (Recently Viewed list search; org has no 'All' view). */
async function findParsersUI(page, prefix = 'AUTO_') {
  let ids = [];
  for (const view of ['All', '__Recent']) {
    await page.goto(`/lightning/o/ctkemailparser__Email_Parser__c/list?filterName=${view}`);
    const search = page.getByPlaceholder('Search this list...');
    if (!(await search.waitFor({ timeout: 30000 }).then(() => true).catch(() => false))) continue;
    await search.fill(prefix);
    await search.press('Enter');
    await page.waitForTimeout(6000);
    const hrefs = await page.locator('a[href*="/lightning/r/a0"]').evaluateAll((a) => [...new Set(a.map((x) => x.getAttribute('href')))]);
    ids = [...new Set(hrefs.map(idFromUrl).filter(Boolean))];
    if (ids.length) break;
  }
  if (!ids.length) ids = await globalSearchIds(page, prefix);
  const keep = [];
  for (const id of ids) {
    if (await parserNameUI(page, id).then((n) => n.startsWith(prefix)).catch(() => false)) keep.push(id);
  }
  return keep;
}

async function globalSearchIds(page, term, idPrefix = 'a03') {
  // search index can lag behind record creation -> poll
  for (let i = 0; i < 6; i++) {
    await page.goto('/lightning/page/home');
    await page.getByRole('button', { name: /^Search/ }).first().click();
    const box = page.getByRole('searchbox').or(page.getByPlaceholder(/Search/)).last();
    await box.fill(term);
    await box.press('Enter');
    await page.waitForTimeout(8000);
    const hrefs = await page.locator('a[href*="/lightning/r/"]').evaluateAll((a) => a.map((x) => x.getAttribute('href')));
    const ids = [...new Set(hrefs.map(idFromUrl).filter((x) => x && x.startsWith(idPrefix)))];
    if (ids.length) return ids;
    await page.waitForTimeout(10000);
  }
  return [];
}

async function parserNameUI(page, id) {
  await page.goto(`/lightning/r/${id}/view`);
  await page.getByRole('button', { name: 'Delete', exact: true }).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const t = await page.locator('body').innerText();
  const m = /\nName\n(?:Help[^\n]*\n)?([^\n]+)/.exec(t);
  return m ? m[1].trim() : '';
}

/** Org label EP-000123 from parser record layout (not list chrome). */
async function parserEpCodeUI(page, id) {
  await openRecord(page, id);
  await page.waitForTimeout(1500);
  const t = await page.locator('body').innerText();
  const m1 = /\n(?:Email Parser ID|Parser ID)\n(?:Help[^\n]*\n)?(EP-\d+)/i.exec(t);
  if (m1) return m1[1].trim();
  const m2 = /\nName\n(?:Help[^\n]*\n)?(EP-\d+)/i.exec(t);
  if (m2) return m2[1].trim();
  return null;
}

/** Tracks AUTO_ parsers created in a test and deletes them afterwards. */
function tracker() {
  const ids = new Set();
  return {
    add: (id) => { if (id) ids.add(id); return id; },
    async cleanup(page) {
      for (const id of ids) await deleteParserUI(page, id).catch((e) => console.warn('cleanup failed', id, e.message));
      ids.clear();
    },
  };
}

module.exports = { closeModals, dismissInterrupt,
  REL, toastWith, globalSearchIds, ACTIVE_BANNER, ACTIVE_ERROR, autoName, idFromUrl, dialog, toast, pickCombo, comboOptions, saveDialog,
  openNewParserForm, createParserUI, openRecord, editParserUI, setActiveUI, deleteParserUI, cloneParserUI,
  openNewRelated, firstRelatedId, relatedCount, fillFilterForm, createFilterUI, fillFieldParserForm, createFieldParserUI,
  fillActionForm, createActionUI, findParsersUI, parserNameUI, parserEpCodeUI, tracker,
};
