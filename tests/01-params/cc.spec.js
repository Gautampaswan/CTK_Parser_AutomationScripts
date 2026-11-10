// CC param tests: each scenario sends master-case email after activate, then deletes parser + job.
const { test } = require('@playwright/test');
const { allScenarios } = require('../../helpers/scenarios');
const { readMasterJob } = require('../../helpers/masterJob');
const { runReplayScenario } = require('../../helpers/replayFlow');

test.describe.configure({ mode: 'serial' });

const runtime = () => {
  const m = readMasterJob() || {};
  return { messageId: m.messageId, sendDate: m.sendDate };
};

for (const scenario of allScenarios(runtime()).filter((s) => s.param === 'CC')) {
  test(scenario.title, { tag: [scenario.tag, scenario.opTag, '@cc'] }, async ({ page }) => {
    test.setTimeout(12 * 60 * 1000);
    // Refresh runtime values (Message Id / Send Date) from master-job.json
    const rt = runtime();
    const live = allScenarios(rt).find((s) => s.param === scenario.param && s.op === scenario.op);
    await runReplayScenario(page, live || scenario);
  });
}
