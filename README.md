# CTK Automation Testscript

Playwright suite for the CTK Email Parser. **Each** parameter × operation test builds its own parser, **activates**, **sends** the master-case email (`data/master-email.md`), validates the execution log, then **deactivates/deletes the parser** and **deletes that Email Parser Job** so the next test starts clean.

Full Windows steps: **`HOW_TO_RUN_LOCALLY.md`**.

## Idea

1. **Deactivate** every active Email Parser in the org (including your non-`AUTO_` ones — they are only deactivated, never deleted). Names go to `test-results/deactivated-parsers.json`.
2. For **every** parameter × operation test: create `AUTO_…` parser + filter + field parser + Account action → **activate** → **send** the master-case email (includes **`.eml` attachment** `AUTO_Attached_Mail.eml`) → find job on **All Email Parser Jobs** list → wait Completed → check log → deactivate → delete parser → delete job.

Parameters: To, From, From Name, CC, Text Body, HTML Body, Subject, Header (`X-CTK-Test`), Message Id, **Attachments**, **Attachment File Names**.
HTML Body / Message Id skip (not on Filter Source). **Email Send Date / Received Date scenarios removed.**  
**Text Body** org ops (verified): Contains, Matches Regex only — other ops are not generated.  
**Attachments** → Has Attachments. **Attachment File Names** → Contains / Starts with / Ends With / Matches Text / Matches Regex.  
Other sources: Contains, Starts with, Ends With, Matches Text, Matches Regex (runtime skip if picklist differs).

## Setup (Windows)

1. Unzip `CTK_Automation_Testscript.zip`, open in VS Code, open a terminal.
2. `npm install`
3. `npx playwright install chromium`
4. `copy .env.example .env` and fill `SF_USERNAME`, `SF_PASSWORD`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` (16-char Google App Password — **not** the normal Gmail password). Keep `SMTP_PORT=465`.
5. `npm run login` (trusted IP should avoid OTP; otherwise write the code to `auth\otp.txt`).
6. `npm test` (Chromium default) or `npm run test:firefox`.

## Scripts

| Script | Runs |
|---|---|
| `npm test` | Full suite in **Chromium** (default) |
| `npm run test:firefox` | Full suite in Firefox |
| `npm run test:all` | Chromium + Firefox |
| `npm run test:from` / `test:fromname` / `test:to` / `test:cc` | By parameter tag |
| `npm run test:textbody` / `test:htmlbody` / `test:subject` / `test:header` | By parameter tag |
| `npm run test:messageid` | By parameter tag |
| `npm run test:attachment` / `test:attachmentfilenames` | Attachments + Attachment File Names |
| `npm run cleanup` | Delete leftover `AUTO_` parsers only |
| `npm run list` | List tests without running |
| `npm run report` | Open HTML report |
| `npm run login` | Refresh `auth/storageState.json` |

## Layout

```
data/master-email.md       Master email format (sent once)
data/emails/AUTO_Attached_Mail.eml  Nested .eml attachment (message/rfc822)
data/org-picklists.json    Live Source/Operation labels
helpers/scenarios.js       Parameter × operation matrix + filter values
helpers/deactivateActive.js  Deactivate all active parsers
helpers/masterJob.js       Send once + save master-job.json
helpers/replayFlow.js      8-step Replay flow + step logging
helpers/mailer.js          nodemailer (Gmail SMTP)
pages/                     EmailParser, Filter, FieldParser, BuildEditor, Action, Jobs, …
tests/00-setup/            Deactivate + master email
tests/01-params/           One spec file per parameter (5 operations each)
```

## Logging

Each step prints like:

```
[From | Contains] Step 3/8: Field Parser built + Test Area printed …
[From | Contains] Test Area value = "gautipaswan252@gmail.com"
```

Test titles look like:  
`Test the functionality of From filter (Contains) to parse value using From parameter`

## Caveats (first org run)

- Replay Job is Edit → checkbox `ctkemailparser__ReplayJob__c` → Save (verified on EPJ-000019).
- Org Source/Operation labels re-verified live (wait for dependent Operation after Source). See `data/org-picklists.json`.
- Message Id / HTML Body filter tests skip (not on Filter Source). Message Id values still read from the job when needed.
- SMTP is blocked on the agent box; send the master email from your PC.
- If a run dies after deactivating your parsers, re-activate them from `test-results/deactivated-parsers.json` (or the Salesforce UI).
- `npm run cleanup` deletes only `AUTO_` parsers.
