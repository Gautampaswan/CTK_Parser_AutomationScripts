// @ts-check
// Browsers: Chromium (default) and optional Firefox. Email via nodemailer (Node.js).
// workers:1 – one shared org. tests/00-setup/ deactivates parsers; first param test sends master email after activate;
// tests/01-params/ then Replay that job. Filtered greps lazy-init prep inside the first param test.
require('dotenv').config();
const { defineConfig, devices } = require('@playwright/test');
const AUTH = { storageState: 'auth/storageState.json' };
const IGNORE = /auth\.setup\.js|global-teardown/;
const CHROME = devices['Desktop Chrome'];
module.exports = defineConfig({
  testDir: './tests',
  globalSetup: require.resolve('./global-setup.js'),
  timeout: 12 * 60 * 1000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: process.env.SF_LIGHTNING_URL,
    actionTimeout: 30000,
    navigationTimeout: 60000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
      teardown: 'cleanup',
      use: { ...CHROME },
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: IGNORE,
      use: { ...CHROME, ...AUTH, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'firefox',
      dependencies: ['setup'],
      testIgnore: IGNORE,
      use: { ...devices['Desktop Firefox'], ...AUTH, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'cleanup',
      testMatch: /global-teardown/,
      use: { ...CHROME, ...AUTH },
    },
  ],
});
