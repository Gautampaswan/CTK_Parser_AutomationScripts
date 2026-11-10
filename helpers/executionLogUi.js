/**
 * Execution log UI helpers.
 * Primary path (all param tests): validateEmailParserJobViaAttachment — manual parity only.
 */
const { JobsPage } = require('../pages/JobsPage');

const LOG_OBJECT_APIS = [
  'ctkemailparser__EmailParserLog__c',
  'ctkemailparser__Email_Parser_Log__c',
  'ctkemailparser__ParserExecutionLog__c',
  'ctkemailparser__EmailParserExecutionLog__c',
];

const PARSER_REL_APIS = [
  'ctkemailparser__EmailParserLogs__r',
  'ctkemailparser__Email_Parser_Logs__r',
  'ctkemailparser__Execution_Logs__r',
  'ctkemailparser__Parser_Logs__r',
];

async function bodyText(page) {
  return page.locator('body').innerText();
}

function logLike(text) {
  return /PROCESSING STARTS|Parsed Data|EXECUTION COMPLETED/i.test(String(text || ''));
}

async function clickRelatedTab(page) {
  const tab = page.getByRole('tab', { name: /^Related$/i });
  if (!(await tab.count())) return false;
  await tab.first().click();
  await page.waitForTimeout(2500);
  return true;
}

/** Open first record link under a related list whose heading mentions Log / Execution. */
async function openFirstLogRelatedRecord(page) {
  const lists = page.locator('article, li').filter({ hasText: /Email Parser Log|Execution Log|Parser Log/i });
  const n = await lists.count();
  for (let i = 0; i < n; i++) {
    const block = lists.nth(i);
    const link = block.getByRole('link').filter({ hasText: /^(EPL-|LOG-|EPJ-|EP-|\d)/i }).first();
    if (await link.count()) {
      await link.click();
      await page.waitForTimeout(3000);
      return true;
    }
    const anyLink = block.getByRole('link').first();
    if (await anyLink.count()) {
      await anyLink.click();
      await page.waitForTimeout(3000);
      return true;
    }
  }
  return false;
}

async function readFromParserRelatedLists(page, parserId) {
  let best = '';
  for (const rel of PARSER_REL_APIS) {
    const res = await page.goto(`/lightning/r/${parserId}/related/${rel}/view`).catch(() => null);
    if (!res || res.status() >= 400) continue;
    await page.waitForTimeout(2500);
    const text = await bodyText(page);
    if (logLike(text) && text.length > best.length) best = text;
    if (await openFirstLogRelatedRecord(page)) {
      const detail = await bodyText(page);
      if (logLike(detail)) best = `${best}\n${detail}`;
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }
  return best;
}

async function searchLogObjectList(page, query) {
  if (!query) return '';
  let best = '';
  for (const api of LOG_OBJECT_APIS) {
    const res = await page.goto(`/lightning/o/${api}/list?filterName=__Recent`).catch(() => null);
    if (!res || res.status() >= 400) continue;
    await page.waitForTimeout(2000);
    const landing = await bodyText(page);
    if (/Page doesn't exist|Invalid Page|Insufficient/i.test(landing)) continue;

    const search = page.getByPlaceholder(/Search this list/i);
    if (!(await search.count())) continue;
    await search.fill(String(query).slice(0, 80));
    await search.press('Enter');
    await page.waitForTimeout(4000);

    const rowLink = page.locator('a[href*="/lightning/r/"]').first();
    if (!(await rowLink.count())) continue;
    await rowLink.click();
    await page.waitForTimeout(3000);
    const detail = await bodyText(page);
    if (logLike(detail) && detail.length > best.length) best = detail;
  }
  return best;
}

async function readFromAppNavEmailParserLogs(page, query) {
  await page.goto('/lightning/page/home').catch(() => {});
  await page.waitForTimeout(1500);
  const nav = page.getByRole('link', { name: /Email Parser Logs/i });
  if (!(await nav.count())) return '';
  await nav.first().click();
  await page.waitForTimeout(3000);
  if (query) {
    const global = page.getByPlaceholder(/Search/i).first();
    if (await global.count()) {
      await global.fill(String(query).slice(0, 60));
      await global.press('Enter');
      await page.waitForTimeout(4000);
    }
  }
  const text = await bodyText(page);
  if (logLike(text)) return text;
  if (await openFirstLogRelatedRecord(page)) return bodyText(page);
  return text;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ jobHref?: string, parserId?: string, master?: object }} opts
 */
async function gatherExecutionLogText(page, { jobHref, parserId, master, requireJobAttachment = false } = {}) {
  const jobs = new JobsPage(page);

  if (jobHref) {
    try {
      const fromAttachment = await jobs.readExecutionLogFromJob(jobHref, { log: console.log });
      if (logLike(fromAttachment)) {
        console.log('[log] source=EPJ Related → Email Parser Log attachment (manual parity path)');
        return fromAttachment;
      }
      const bad = 'Email Parser Log attachment did not contain PROCESSING STARTS / Parsed Data / EXECUTION COMPLETED';
      if (requireJobAttachment) throw new Error(bad);
      console.warn(`[log] ${bad}`);
    } catch (e) {
      if (requireJobAttachment) throw e;
      console.warn(`[log] Email Parser Log attachment: ${e.message}`);
    }
  }

  if (requireJobAttachment) {
    throw new Error('Execution log must come from EPJ → Related → Email Parser Log; attachment path failed');
  }

  let combined = '';
  if (parserId) combined = await readFromParserRelatedLists(page, parserId);
  if (logLike(combined)) return combined;

  const q = master?.messageId || master?.subject || master?.tok || '';
  combined += `\n${await searchLogObjectList(page, q)}`;
  if (logLike(combined)) return combined;

  combined += `\n${await readFromAppNavEmailParserLogs(page, q)}`;
  return combined;
}

/**
 * Param test step 7 — manual UI + Status=Completed pass:
 * 1 Open Email Parser Job
 * 2 Click Related
 * 3 Click Email Parser Log (tab or download)
 * 4 Pass when EPJ Status is Completed
 */
async function validateEmailParserJobViaAttachment(page, {
  jobHref,
  waitForCompleted = true,
  log = console.log,
} = {}) {
  if (!jobHref) throw new Error('jobHref required for Email Parser Job validation');
  const jobs = new JobsPage(page);
  let status = '';

  if (waitForCompleted) {
    log('[jobs] wait for Status=Completed on EPJ Details');
    const { fields } = await jobs.waitForStatus(jobHref, /^Completed$/i, { log });
    status = (fields.status || '').trim();
    log(`[jobs] Status=${status} on ${jobHref}`);
  }

  await jobs.openJobRelatedAndEmailParserLog(jobHref, { log });

  if (!status) {
    status = await jobs.readStatusOnDetails(jobHref);
  }
  log(`[validate 4/4] Pass when Status=Completed (current="${status}")`);

  const ok = /^Completed$/i.test(status);
  return {
    ok,
    status,
    message: ok ? `Email Parser Job Status is Completed` : `Expected Status=Completed, got "${status}"`,
  };
}

module.exports = { gatherExecutionLogText, logLike, validateEmailParserJobViaAttachment };
