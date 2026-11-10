// Interactive-free UI login that waits for an OTP in auth/otp.txt (or SF_OTP env), ticks "Don't ask again",
// and saves auth/storageState.json. Usage: node scripts/login-with-otp.js [--headed]
// OTP: echo <code> > auth/otp.txt   or set SF_OTP
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { storageHasSid, waitForUiSession } = require('../helpers/sfSession');

const OTP_FILE = path.join(__dirname, '..', 'auth', 'otp.txt');
const STATE = path.join(__dirname, '..', 'auth', 'storageState.json');
const headed = process.argv.includes('--headed') || process.env.LOGIN_HEADED === '1';
const username = () => (process.env.SF_USERNAME || '').trim();
const password = () => (process.env.SF_PASSWORD || '').trim();

async function loginErrorText(page) {
  const err = page.locator('#error, .loginError, [id*="error"]:visible').first();
  if (await err.count()) {
    const t = (await err.innerText().catch(() => '')).trim();
    if (t) return t;
  }
  if (await page.getByText(/check your username and password/i).count()) {
    return (await page.getByText(/check your username and password/i).first().innerText()).trim();
  }
  return '';
}

(async () => {
  if (!process.env.SF_LOGIN_URL) throw new Error('Set SF_LOGIN_URL in .env');
  if (!username() || !password()) throw new Error('Set SF_USERNAME and SF_PASSWORD in .env');
  if (/example\.com|your-password/i.test(`${username()} ${password()}`)) {
    throw new Error('Update .env with real SF_USERNAME / SF_PASSWORD (not .env.example placeholders)');
  }
  fs.mkdirSync(path.dirname(OTP_FILE), { recursive: true });
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  if (fs.existsSync(OTP_FILE)) fs.unlinkSync(OTP_FILE);
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(process.env.SF_LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#username', { timeout: 60000 });
  await page.locator('#username').fill(username());
  if (!(await page.locator('#password').isVisible())) {
    await page.click('#Login');
    await page.waitForSelector('#password:visible', { timeout: 30000 });
  }
  await page.locator('#password').fill(password());
  await page.click('#Login');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  const badLogin = await loginErrorText(page);
  if (badLogin) {
    const shot = path.join(__dirname, '..', 'test-results', 'login-error.png');
    fs.mkdirSync(path.dirname(shot), { recursive: true });
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    throw new Error(`Salesforce rejected login: ${badLogin.replace(/\s+/g, ' ')} (see test-results/login-error.png)`);
  }

  if (/verification/i.test(page.url())) {
    const otpField = () => page.getByLabel(/Verification Code/i);
    console.log('OTP_REQUIRED');
    if (headed) {
      console.log('  Option A: type the code in the browser window and click Verify (script will detect it).');
      console.log('  Option B: save digits-only to', OTP_FILE);
    } else {
      console.log('  Write digits-only to', OTP_FILE, 'or set SF_OTP in .env');
    }
    let otp = (process.env.SF_OTP || '').trim();
    let manualDone = false;
    const deadline = Date.now() + 15 * 60 * 1000;
    while (!otp && !manualDone && Date.now() < deadline) {
      if (fs.existsSync(OTP_FILE)) otp = fs.readFileSync(OTP_FILE, 'utf8').replace(/\s+/g, '').trim();
      if (!/verification/i.test(page.url()) && storageHasSid(await context.cookies())) {
        manualDone = true;
        break;
      }
      if (await otpField().count()) {
        const typed = (await otpField().inputValue()).replace(/\s+/g, '').trim();
        if (typed.length >= 4) otp = typed;
      }
      await page.waitForTimeout(1000);
    }
    if (!otp && !manualDone) throw new Error('No OTP in 15 minutes (use auth/otp.txt, SF_OTP, or Verify in the browser when headed)');
    if (!manualDone) {
      if (await otpField().count()) await otpField().fill(otp);
      const dontAsk = page.getByLabel(/Don.t ask again/i);
      if (await dontAsk.count()) await dontAsk.check().catch(() => {});
      await page.getByRole('button', { name: /Verify/i }).click();
      await page.waitForLoadState('domcontentloaded');
    }
  }
  await page.waitForURL(/lightning|\/home|setup/i, { timeout: 120000 }).catch(() => {});
  console.log('Waiting for Salesforce session (sid cookie)…');
  if (!(await waitForUiSession(context, page, process.env.SF_LIGHTNING_URL))) {
    console.log('URL after login attempt:', page.url());
    throw new Error('No sid session cookie after OTP. Click Verify in the browser, wait until Lightning loads (not the login form), then re-run.');
  }
  await context.storageState({ path: STATE });
  console.log('SAVED', STATE);
  if (fs.existsSync(OTP_FILE)) fs.unlinkSync(OTP_FILE);
  await browser.close();
})().catch((e) => { console.error('LOGIN_FAILED', e.message); process.exit(1); });
