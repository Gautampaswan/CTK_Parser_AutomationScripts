// Step 0: deactivate EVERY active Email Parser (including the user's non-AUTO ones).
// Names are printed and saved to test-results/deactivated-parsers.json. Non-AUTO are never deleted.
const fs = require('fs');
const { test } = require('@playwright/test');
const { deactivateAllActiveParsers } = require('../../helpers/deactivateActive');
const { OUT: MASTER_JOB_FILE } = require('../../helpers/masterJob');

test.describe.configure({ mode: 'serial' });

test('Deactivate all active Email Parsers before the suite', { tag: ['@setup', '@deactivate'] }, async ({ page }) => {
  test.setTimeout(30 * 60 * 1000);
  await deactivateAllActiveParsers(page, { log: console.log });
  if (fs.existsSync(MASTER_JOB_FILE)) {
    fs.unlinkSync(MASTER_JOB_FILE);
    console.log('[setup] cleared', MASTER_JOB_FILE, '(each param test sends email after its parser is activated)');
  }
});
