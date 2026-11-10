// Replay-based tests for Source = Subject
// Master email is sent once in tests/setup/01-master-email.spec.js; this file only Replays that job.
const { test } = require('@playwright/test');
const { allScenarios } = require('../../helpers/scenarios');
const { readMasterJob } = require('../../helpers/masterJob');
const { runReplayScenario } = require('../../helpers/replayFlow');

test.describe.configure({ mode: 'serial' });

const runtime = () => {
  const m = readMasterJob() || {};
  return { messageId: m.messageId, sendDate: m.sendDate };
};

for (const scenario of allScenarios(runtime()).filter((s) => s.param === 'Subject')) {
  test(scenario.title, { tag: [scenario.tag, scenario.opTag, '@subject'] }, async ({ page }) => {
    test.setTimeout(12 * 60 * 1000);
    // Refresh runtime values (Message Id / Send Date) from master-job.json
    const rt = runtime();
    const live = allScenarios(rt).find((s) => s.param === scenario.param && s.op === scenario.op);
    await runReplayScenario(page, live || scenario);
  });
}
