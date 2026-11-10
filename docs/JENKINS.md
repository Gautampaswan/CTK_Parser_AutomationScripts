# Jenkins — schedule CTK Playwright suite

## What Jenkins needs

| Requirement | Why |
|-------------|-----|
| **Windows agent** (or Linux + adjust `Jenkinsfile` `bat` → `sh`) | Same flow as `HOW_TO_RUN_LOCALLY.md` |
| **Node.js LTS** on the agent | `npm ci` |
| **Outbound HTTPS** | Salesforce Lightning |
| **SMTP 465** to `smtp.gmail.com` | Master email send (global-setup) |
| **6h+ job timeout** | Full suite is slow (`workers: 1`) |
| **No parallel runs** of this job | One org, one active parser (`disableConcurrentBuilds`) |

## 1. Put the job on Jenkins

**Option A — Pipeline from SCM**

1. Jenkins → **New Item** → **Pipeline** → name e.g. `CTK-Email-Parser-E2E`.
2. **Pipeline** → Definition: **Pipeline script from SCM** → Git → repo URL → branch → Script Path: `Jenkinsfile`.
3. Save.

**Option B — Copy repo to agent**

1. **Pipeline script** → paste `Jenkinsfile` and use **Pipeline from SCM** when you have Git.

## 2. Schedule (cron)

In the job:

- **Build Triggers** → **Build periodically**  
  Example: `H 2 * * 1-5` (weekdays ~2 AM)

Or edit `triggers { cron(...) }` in `Jenkinsfile`.

## 3. Credentials (never commit `.env`)

Create **Secret text** credentials in Jenkins (**Manage Jenkins → Credentials**):

| ID (example) | Maps to |
|--------------|---------|
| `ctk-sf-username` | `SF_USERNAME` |
| `ctk-sf-password` | `SF_PASSWORD` |
| `ctk-gmail-user` | `GMAIL_USER` |
| `ctk-gmail-app-password` | `GMAIL_APP_PASSWORD` (16-char App Password, no spaces) |

Create **Secret file** credential:

| ID (example) | File |
|--------------|------|
| `ctk-storage-state` | `auth/storageState.json` from a successful `npm run login` on your PC |

Refresh that file when Salesforce session expires (same as local: re-run login).

**Non-secret URLs** — set on the job under **Environment** or in Jenkinsfile `environment { }`:

- `SF_LIGHTNING_URL`
- `SF_LOGIN_URL` / `SF_INSTANCE_URL`
- `CTK_INBOUND_ADDRESS`

(Values from `.env.example`.)

## 4. Agent label

Edit `Jenkinsfile` → `agent { label 'windows' }` to match your node (e.g. `built-in` only for testing).

Linux agent example for **Node & Playwright** stage:

```sh
node -v && npm -v
npm ci
npx playwright install --with-deps chromium
```

## 5. Salesforce login on CI

With `SF_API_ENABLED=false` (default), tests **require** a valid `auth/storageState.json` (Secret file).

Alternatives:

- **Trusted IP** for the Jenkins agent → run `npm run login` once on the agent, archive `auth/storageState.json` as credential.
- **API login**: set `SF_API_ENABLED=true` + `SF_SECURITY_TOKEN` and adjust `auth.setup.js` path (only if API login works in your org).

OTP/SMS on every run is not suitable for unattended Jenkins.

## 6. Reports

After each build, open **Build Artifacts**:

- `playwright-report/index.html`
- `test-results/results.json`

Optional: install **HTML Publisher** plugin and publish `playwright-report`.

## 7. Smoke vs full

Use job parameter **TEST_SCOPE** (`full`, `from`, `header`, …) or add a second Jenkins job with:

```bat
npm run test:header
```

## 8. Checklist before first green build

1. Agent can `npm ci` and `npx playwright install chromium`.
2. SMTP verify works from agent (same as local `HOW_TO_RUN_LOCALLY.md` optional check).
3. `ctk-storage-state` credential is fresh.
4. All URL env vars set on the job.
5. Salesforce **Network Access** allows the agent IP if session drops often.
