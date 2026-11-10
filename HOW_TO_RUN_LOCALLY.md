# How to run CTK_Automation_Testscript on your Windows PC

Suite = Playwright (Chromium default, Firefox optional) + nodemailer.  
Flow = deactivate active parsers → first test: build parser, activate, send **one** master email → later tests: build parser, activate, **Replay** that job.

## 1. Install Node.js (one time)

Download **Node.js LTS** from https://nodejs.org, install, then in PowerShell:

```bat
node -v
npm -v
```

## 2. Unzip and open

1. Unzip `CTK_Automation_Testscript.zip` (e.g. `C:\CTK_Automation_Testscript`).
2. Open that folder in **VS Code**.
3. **Terminal → New Terminal**.

## 3. Install dependencies

```bat
npm install
npx playwright install chromium
```

## 4. Create `.env`

```bat
copy .env.example .env
```

Fill at least:

| Variable | Value |
|---|---|
| `SF_USERNAME` | Your Salesforce username |
| `SF_PASSWORD` | Your Salesforce password (quotes OK) |
| `SF_SECURITY_TOKEN` | Leave blank / commented (`SF_API_ENABLED=false`) |
| `GMAIL_USER` | `gautipaswan252@gmail.com` |
| `GMAIL_APP_PASSWORD` | 16-character **Google App Password** (not normal Gmail password) |
| `SMTP_PORT` | `465` |
| `CTK_INBOUND_ADDRESS` | Keep the inbound address from `.env.example` |

App Password: https://myaccount.google.com/apppasswords

### Optional SMTP check

```bat
Test-NetConnection smtp.gmail.com -Port 465
```

```bat
node -e "require('dotenv').config();require('nodemailer').createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}}).verify().then(()=>console.log('SMTP OK')).catch(e=>console.log('SMTP FAIL:',e.message))"
```

## 5. Log in once

```bat
npm run login
```

Trusted IP (Setup → Network Access) should skip OTP. If console says `OTP_REQUIRED`, put the code in `auth\otp.txt`. Success prints `SAVED` and writes `auth\storageState.json`.

Tip: Session Settings → Timeout **24 hours**.

## 6. Run

| Command | What |
|---|---|
| `npm test` | All tests in Chromium (setup + param matrix) |
| `npm run test:firefox` | All in Firefox |
| `npm run test:from` | Only From (5 operations) |
| `npm run test:to` / `test:cc` / `test:fromname` | … |
| `npm run test:textbody` / `test:htmlbody` / `test:subject` / `test:header` | … |
| `npm run test:messageid` | Message Id parameter (skipped – not on Filter Source) |
| `npm run test:attachment` | Attachments (Has Attachments) |
| `npm run test:attachmentfilenames` | Attachment File Names (5 ops) |
| `npm run list` | List without running |
| `npx playwright show-report` or `npm run report` | HTML report |
| `npm run cleanup` | Delete leftover `AUTO_` parsers |

## 7. What the run does

1. SMTP pre-check (`global-setup.js`).
2. `tests/00-setup`: deactivate **all** active parsers (list saved).
3. `tests/01-params`: first test — create parser/filter/field parser/action → activate → **send master email once** → save job id → wait Completed; later tests — same build → activate → **Replay** job → wait Completed → deactivate → delete `AUTO_` parser.
4. Teardown / `npm run cleanup`: delete remaining `AUTO_` only.

Master email format: `data/master-email.md`.

## If something fails

- Session expired → `npm run login` again.
- Email skipped → check App Password and port 465.
- Replay checkbox / Source option not found → send the Playwright error + screenshot; locators may need a one-line fix for your org.
- Your parsers left inactive → open `test-results\deactivated-parsers.json` and re-activate those names in Salesforce.
