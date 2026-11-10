# CTK Email Parser — Automation Framework (1 page)

**Tool:** Playwright + Node.js | **Target:** Salesforce Lightning (CTK Email Parser) | **Email:** Gmail SMTP (real inbound mail)

---

## What it does

Automates what a tester does manually: build a parser in the UI, send a standard test email, check the **Email Parser Job**, then delete test data.  
**One test = one parameter + one filter operation** (e.g. Header + Contains).

---

## Run order

```
SMTP check → Salesforce login → Deactivate all active parsers → Param tests (serial) → Cleanup AUTO_ parsers
```

- **One browser worker** — single org, only one active parser at a time.
- **`AUTO_` names** — test data only; cleanup deletes these, not your manual parsers.

---

## Architecture (3 layers)

| Layer | Where | Purpose |
|-------|--------|---------|
| **Tests** | `tests/01-params/*.spec.js` | Loop scenarios; call one shared flow |
| **Pages** | `pages/` | Screen actions (Parser, Filter, Field Parser, Jobs, …) |
| **Helpers** | `helpers/` | `scenarios.js` (data), `replayFlow.js` (8 steps), `mailer.js` (SMTP) |

Every param test: **`runReplayScenario(page, scenario)`** in `helpers/replayFlow.js`.

---

## The 8 steps (every test)

| # | Step |
|---|------|
| 1 | Create Email Parser `AUTO_…` |
| 2 | Add Email **Filter** (Source / Operation / Value from `scenarios.js`) |
| 3 | Add **Field Parser** + Build editor |
| 4 | Add **Action** (e.g. Create Account) |
| 5 | **Activate** parser |
| 6 | **Send** master email (+ attachment) → capture **Email Parser Job** (All list) |
| 7 | **Status = Completed** → open job → **Related** → **Email Parser Log** |
| 8 | Deactivate → delete parser → delete job |

**Step 7 pass rule:** Job **Status is Completed** after opening Related + Email Parser Log (UI parity with manual testing).

---

## Two channels

```
[Playwright]  ←→  Salesforce (build parser, jobs, validation UI)
[nodemailer]  ──→  Inbound address (triggers real parsing)
```

---

## How scenarios are defined

`helpers/scenarios.js` → matrix of **parameter × operation** + values aligned with `data/master-email.md`.  
Each spec file filters one parameter (e.g. `from.spec.js`, `header.spec.js`).  
Tags: `@from`, `@contains`, … → `npm run test:from` or `--grep "Contains"`.

---

## Quick commands

| Command | Use |
|---------|-----|
| `npm run login` | Refresh Salesforce session |
| `npm test` | Full suite (Chromium) |
| `npm run test:header` | One parameter |
| `npx playwright test … --headed` | Watch the browser |
| `npm run report` | HTML report |

---

## 30-second pitch

*A shared 8-step Playwright recipe tests every email filter field and operation. Scenarios live in one data file; each test builds an AUTO_ parser, sends one real email, confirms the job Completed and opens the log like manual QA, then cleans up. Salesforce UI is automated through page objects; email goes through Gmail SMTP.*
