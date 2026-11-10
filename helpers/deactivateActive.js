// Finds every Active Email Parser in the org (AUTO_ and user's) and deactivates them.
// Non-AUTO parsers are NEVER deleted – only deactivated. Names are printed and saved to
// test-results/deactivated-parsers.json so the user can re-activate later if needed.
const fs = require('fs');
const path = require('path');
const u = require('./uiFactory');
const { EmailParserPage } = require('../pages/EmailParserPage');

const OUT = path.join(__dirname, '..', 'test-results', 'deactivated-parsers.json');

async function isParserActive(page, id) {
  await page.goto(`/lightning/r/${id}/view`);
  await page.getByRole('button', { name: 'Delete', exact: true }).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  // Active banner appears only when Active=true; also check the detail text
  if (await page.getByText('Active Email Parser cannot be modified').count()) return true;
  const t = await page.locator('body').innerText();
  // Lightning often shows "Active\nChecked" or a checked checkbox near Active
  if (/\nActive\n(?:Help[^\n]*\n)?Checked\b/i.test(t)) return true;
  if (/\nActive\n(?:Help[^\n]*\n)?True\b/i.test(t)) return true;
  return false;
}

/** Collect candidate parser Ids from All + Recent list views (no name filter). */
async function listParserIds(page) {
  const ids = new Set();
  for (const view of ['All', '__Recent']) {
    await page.goto(`/lightning/o/ctkemailparser__Email_Parser__c/list?filterName=${view}`);
    const ready = await page.getByPlaceholder('Search this list...').waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
    if (!ready) continue;
    await page.waitForTimeout(4000);
    const hrefs = await page.locator('a[href*="/lightning/r/a0"]').evaluateAll((a) => [...new Set(a.map((x) => x.getAttribute('href')))]);
    for (const h of hrefs) {
      const id = u.idFromUrl(h);
      if (id) ids.add(id);
    }
  }
  // Also pick up AUTO_ via search (covers parsers not on Recent)
  for (const id of await u.findParsersUI(page, 'AUTO_').catch(() => [])) ids.add(id);
  return [...ids];
}

/**
 * Deactivate every active Email Parser. Returns [{id, name}].
 * Writes test-results/deactivated-parsers.json.
 */
async function deactivateAllActiveParsers(page, { log = console.log } = {}) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const ids = await listParserIds(page);
  log(`[setup] scanning ${ids.length} Email Parser candidate(s) for Active=true`);
  const deactivated = [];
  const ep = new EmailParserPage(page);
  for (const id of ids) {
    const name = await u.parserNameUI(page, id).catch(() => '');
    const active = await isParserActive(page, id).catch(() => false);
    if (!active) {
      log(`[setup] skip inactive: ${name || id}`);
      continue;
    }
    log(`[setup] deactivating ACTIVE parser: ${name || id}`);
    await ep.deactivate(id);
    deactivated.push({ id, name: name || id, at: new Date().toISOString() });
  }
  fs.writeFileSync(OUT, JSON.stringify({ deactivated, scanned: ids.length, at: new Date().toISOString() }, null, 2));
  log(`[setup] deactivated ${deactivated.length} parser(s) → ${OUT}`);
  if (deactivated.length) {
    for (const d of deactivated) log(`  - ${d.name} (${d.id})`);
  }
  return deactivated;
}

module.exports = { deactivateAllActiveParsers, isParserActive, listParserIds, OUT };
