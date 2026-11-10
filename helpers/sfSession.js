function storageHasSid(cookies) {
  return (cookies || []).some(
    (c) => c.name === 'sid' && /\.(force\.com|my\.salesforce\.com)/i.test(c.domain || ''),
  );
}

async function loginPromptVisible(page) {
  if (await page.locator('#username:visible').count()) return true;
  return page.getByText(/log in to salesforce/i).first().isVisible().catch(() => false);
}

/** Poll until Salesforce sets sid and Lightning URL is not the embedded login gate. */
async function waitForUiSession(context, page, lightningBase, maxMs = 180000) {
  const home = `${lightningBase.replace(/\/$/, '')}/lightning/page/home`;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (!/lightning\.force\.com/i.test(page.url())) {
      await page.goto(home, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    const cookies = await context.cookies();
    if (storageHasSid(cookies) && !(await loginPromptVisible(page))) return true;
    await page.waitForTimeout(2500);
  }
  return false;
}

module.exports = { loginPromptVisible, storageHasSid, waitForUiSession };
