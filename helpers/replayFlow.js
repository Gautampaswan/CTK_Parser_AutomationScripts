// One parameter × operation test (8 steps). Only one parser active at a time.
// Each test: activate → send master-case email → capture job → validate → deactivate/delete parser → delete job.
const { expect, test } = require('@playwright/test');
const { EmailParserPage } = require('../pages/EmailParserPage');
const { EmailFilterPage, normOp } = require('../pages/EmailFilterPage');
const { FieldParserPage } = require('../pages/FieldParserPage');
const { BuildEditorPage } = require('../pages/BuildEditorPage');
const { ParserActionPage } = require('../pages/ParserActionPage');
const { JobsPage } = require('../pages/JobsPage');
const { ensureMasterJob, clearMasterJob } = require('./masterJob');
const { validateEmailParserJobViaAttachment } = require('./executionLogUi');
const { smtpStatus } = require('./mailer');
const { fieldParserBuild } = require('./scenarios');
const { runId } = require('./runId');
const u = require('./uiFactory');

function step(param, op, n, total, msg) {
  console.log(`[${param} | ${op}] Step ${n}/${total}: ${msg}`);
}

async function operationAvailable(page, dlg, wantOp) {
  const ops = await u.comboOptions(page, dlg, 'Operation').catch(() => []);
  if (!ops.length) return { ok: true, ops }; // cannot probe – try anyway
  const ok = ops.some((o) => o === wantOp || o.toLowerCase() === String(wantOp).toLowerCase());
  return { ok, ops };
}

async function runReplayScenario(page, scenario) {
  const total = 8;
  const { param, op } = scenario;
  if (scenario.skipReason) { test.skip(true, scenario.skipReason); return; }

  const smtp = smtpStatus();
  if (!smtp.ok) { test.skip(true, `Master email unavailable – ${smtp.reason}`); return; }

  const ep = new EmailParserPage(page);
  const parserName = `${scenario.parserName}_${runId}`.slice(0, 80);
  let parserId;
  let jobInfo = null;
  const jobs = new JobsPage(page);

  try {
    step(param, op, 1, total, `create Email Parser "${parserName}"`);
    parserId = await ep.create(parserName, 'AND');

    const sourceOrg = scenario.sourceOrg || param;
    const wantOp = scenario.opOrg || normOp(op);
    step(param, op, 2, total, `create Filter Source=${sourceOrg} Operation=${wantOp} Value=${scenario.filterValue}`);
    const fp = new EmailFilterPage(page);
    await fp.openNew(parserId);
    await u.fillFilterForm(page, fp.dlg, { name: scenario.filterName, source: sourceOrg });
    // Dependent Operation picklist needs time to refresh after Source change
    await page.waitForTimeout(2000);
    fp.dlg = u.dialog(page);
    if (param === 'Header') {
      await page.waitForTimeout(1500);
      fp.dlg = u.dialog(page);
      await fp.dlg.locator('input[name="ctkemailparser__HeaderName__c"]').waitFor({ timeout: 20000 });
      await fp.dlg.locator('input[name="ctkemailparser__HeaderName__c"]').fill(scenario.headerName);
    }
    // Probe Source options – compare against org picklist label
    const sources = await u.comboOptions(page, fp.dlg, 'Source').catch(() => []);
    if (sources.length && !sources.some((s) => s === sourceOrg || s.toLowerCase() === String(sourceOrg).toLowerCase())) {
      await page.keyboard.press('Escape').catch(() => {});
      await u.closeModals(page);
      test.skip(true, `Org has no Source "${sourceOrg}" (param ${param}). Available: ${sources.join(' | ')}`);
      return;
    }
    // Re-select source after probing Source list (Escape closed list) and wait for Operation refresh
    await u.fillFilterForm(page, fp.dlg, { source: sourceOrg });
    for (let i = 0; i < 12; i++) {
      const dis = await fp.dlg.getByRole('combobox', { name: 'Operation', exact: true }).getAttribute('aria-disabled').catch(() => 'true');
      if (dis !== 'true') break;
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1000);
    if (param === 'Header') {
      await page.waitForTimeout(1000);
      fp.dlg = u.dialog(page);
    }
    const probe = await operationAvailable(page, fp.dlg, wantOp);
    if (!probe.ok) {
      await page.keyboard.press('Escape').catch(() => {});
      await u.closeModals(page);
      test.skip(true, `Org has no Operation "${wantOp}" for Source=${sourceOrg}. Available: ${probe.ops.join(' | ')}`);
      return;
    }
    const filterPatch = { operation: wantOp, sequence: 1 };
    if (scenario.filterValue !== undefined && scenario.filterValue !== null && scenario.filterValue !== '') {
      filterPatch.value = scenario.filterValue;
    }
    await u.fillFilterForm(page, fp.dlg, filterPatch);
    await fp.save();
    await expect(u.toastWith(page, /was created/)).toBeVisible({ timeout: 20000 });

    const fieldSource = scenario.fieldSourceOrg || sourceOrg;
    step(param, op, 3, total, `create Field Parser reference=${scenario.referenceName} Source=${fieldSource}`);
    const fpId = await new FieldParserPage(page).create(parserId, {
      referenceName: scenario.referenceName,
      type: 'Text',
      outputType: 'Text',
      source: fieldSource,
      headerName: scenario.headerName,
    });
    const be = await new BuildEditorPage(page).open(fpId);
    const { build, testSample } = fieldParserBuild(param, scenario.sample);
    const skipped = await be.configure(
      { type: 'Text', source: fieldSource },
      build,
    );
    const testResult = await be.test(testSample);
    const testAreaPreview = String(testResult).replace(/\s+/g, ' ').trim();
    console.log(`[${param} | ${op}] Test Area value = ${JSON.stringify(testAreaPreview.slice(0, 300))}`);
    step(param, op, 3, total, `Field Parser built + Test Area printed (buildSkipped=${JSON.stringify(skipped)})`);
    const saved = await be.save();
    if (!saved.closed) {
      await be.cancel();
      throw new Error(`Build save failed: ${saved.err}`);
    }
    // Test Area is build-preview only; org often differs from replay (do not fail the test here).
    if (scenario.expectContains && !String(testResult).includes(scenario.expectContains)) {
      console.log(`[${param} | ${op}] Test Area note: preview did not include "${scenario.expectContains}" (replay log is authoritative)`);
    }

    step(param, op, 4, total, `create Parser Action Create Record Account, Name ← ${scenario.referenceName}`);
    await new ParserActionPage(page).create(parserId, {
      name: scenario.actionName,
      type: 'Create Record',
      sequence: 1,
      objectType: 'Account',
      mapping: { Name: scenario.referenceName },
    });

    step(param, op, 5, total, 'activate Email Parser (only one active)');
    await ep.activate(parserId);

    step(param, op, 6, total, 'send master-case email (with attachment) and capture Email Parser Job');
    try {
      jobInfo = await ensureMasterJob(page, { forceResend: true, log: console.log });
    } catch (e) {
      if (e.code === 'SMTP_SKIP') { test.skip(true, e.message); return; }
      throw e;
    }

    step(param, op, 7, total, 'EPJ → Related → Email Parser Log → pass if Status=Completed');
    const result = await validateEmailParserJobViaAttachment(page, {
      jobHref: jobInfo.href,
      waitForCompleted: true,
      log: (msg) => console.log(`[${param} | ${op}] ${msg}`),
    });
    console.log(`[${param} | ${op}] validation: ${result.message}`);
    expect(result.ok, result.message || 'Email Parser Job did not reach Status=Completed').toBeTruthy();

    step(param, op, 8, total, 'deactivate Email Parser');
    await ep.deactivate(parserId);
  } finally {
    if (parserId) {
      await ep.delete(parserId).catch(async (e) => {
        console.warn(`[${param} | ${op}] delete parser failed (${e.message}); forcing deactivate`);
        await ep.deactivate(parserId).catch(() => {});
      });
    }
    if (jobInfo?.href) {
      await jobs.delete(jobInfo.href).catch((e) => {
        console.warn(`[${param} | ${op}] delete job failed (${e.message})`);
      });
      clearMasterJob();
    }
  }
}

module.exports = { runReplayScenario, step };
