// Replay-based tests for Source = Attachments
const { test } = require('@playwright/test');
const { allScenarios } = require('../../helpers/scenarios');
const { readMasterJob } = require('../../helpers/masterJob');
const { runReplayScenario } = require('../../helpers/replayFlow');

test.describe.configure({ mode: 'serial' });

const runtime = () => {
  const m = readMasterJob() || {};
  return { messageId: m.messageId, sendDate: m.sendDate };
};

for (const scenario of allScenarios(runtime()).filter((s) => s.param === 'Attachments')) {
  test(scenario.title, { tag: [scenario.tag, scenario.opTag, '@attachment'] }, async ({ page }) => {
    test.setTimeout(12 * 60 * 1000);
    const rt = runtime();
    const live = allScenarios(rt).find((s) => s.param === scenario.param && s.op === scenario.op);
    await runReplayScenario(page, live || scenario);
  });
}
