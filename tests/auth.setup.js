// Auth: 1) reuse auth/storageState.json if still valid (create it with scripts/login-with-otp.js — handles SMS OTP);
// 2) else API session via frontdoor.jsp (needs SF_SECURITY_TOKEN or trusted IP / JWT).
require('dotenv').config();
const fs = require('fs');
const { test: setup, expect } = require('@playwright/test');
const { storageHasSid, waitForUiSession } = require('../helpers/sfSession');
const STATE = 'auth/storageState.json';

function stateFileHasSid() {
  try {
    return storageHasSid(JSON.parse(fs.readFileSync(STATE, 'utf8')).cookies);
  } catch {
    return false;
  }
}

setup('authenticate', async ({ browser }) => {
  if (fs.existsSync(STATE) && !stateFileHasSid()) {
    console.warn('[auth.setup] auth/storageState.json has no sid cookie — run npm run login:headed');
    fs.unlinkSync(STATE);
  }
  if (fs.existsSync(STATE)) {
    const ctx = await browser.newContext({ storageState: STATE });
    const page = await ctx.newPage();
    if (await waitForUiSession(page.context(), page, process.env.SF_LIGHTNING_URL, 45000)) {
      await ctx.storageState({ path: STATE });
      await ctx.close();
      return;
    }
    await ctx.close();
  }
  if (process.env.SF_API_ENABLED !== 'true') {
    throw new Error(
      'Salesforce UI session in auth/storageState.json is missing or expired (SF_API_ENABLED=false). '
      + 'Run `npm run login:headed`, complete OTP if prompted, wait for `SAVED auth/storageState.json`, then re-run tests.',
    );
  }
  const { getConnection } = require('../helpers/sfClient');
  const conn = await getConnection(); // throws LOGIN_MUST_USE_SECURITY_TOKEN without token/trusted IP
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${conn.instanceUrl}/secur/frontdoor.jsp?sid=${encodeURIComponent(conn.accessToken)}&retURL=/lightning/page/home`);
  await expect(page).toHaveURL(/lightning/, { timeout: 60000 });
  await ctx.storageState({ path: STATE });
});
