// Safety net: deletes every Email Parser whose Name starts with AUTO_ (never touches anything else).
const { test } = require('@playwright/test');
const u = require('../helpers/uiFactory');
const { EmailParserPage } = require('../pages/EmailParserPage');
test('cleanup AUTO_ parsers', async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);
  const ids = await u.findParsersUI(page, 'AUTO_');
  for (const id of ids) await new EmailParserPage(page).delete(id).catch((e) => console.warn('cleanup', id, e.message));
  console.log(`teardown removed ${ids.length} AUTO_ parser(s)`);
});
