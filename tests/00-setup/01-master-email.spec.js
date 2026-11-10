// Master email is sent once after the first Email Parser is activated (helpers/replayFlow.js).
// See data/master-email.md. This placeholder keeps @setup ordering docs clear.
const { test } = require('@playwright/test');

test.describe.configure({ mode: 'serial' });

test.skip('Master email is sent after first parser activation (not in setup)', { tag: ['@setup', '@master'] }, async () => {});
