// Page object: Salesforce Setup > Email Services (classic page inside the Setup iframe).
// Used only by tests/e2e/attachment-setting-toggle.spec.js to switch "Accept Attachments" on the Email Parser service.
const { expect } = require('@playwright/test');
const SERVICE = process.env.CTK_EMAIL_SERVICE_NAME || 'parserinboundemailhandler';
class EmailServicePage {
  constructor(page) { this.page = page; }
  frame() { return this.page.frameLocator('iframe[title*="Email Services"], iframe[name^="vfFrameId"], iframe').first(); }
  async openList() {
    await this.page.goto('/lightning/setup/EmailToApexFunction/home');
    await expect(this.frame().getByText(/Email Services/i).first()).toBeVisible({ timeout: 60000 });
  }
  /** Opens the service detail and returns the current Accept Attachments value. */
  async openService() {
    await this.openList();
    const f = this.frame();
    const row = f.locator('tr').filter({ hasText: new RegExp(SERVICE, 'i') }).first();
    await row.getByRole('link').filter({ hasNotText: /^(Edit|Del|Activate|Deactivate)$/ }).first().click();
    await expect(f.getByText('Accept Attachments', { exact: false }).first()).toBeVisible({ timeout: 60000 });
  }
  async currentAcceptAttachments() {
    await this.openService();
    const cell = this.frame().locator('td.labelCol', { hasText: 'Accept Attachments' }).first().locator('xpath=following-sibling::td[1]');
    return (await cell.innerText()).trim();
  }
  /** value: 'All' | 'None' | 'Text Attachments Only' | 'Binary Attachments Only' */
  async setAcceptAttachments(value) {
    await this.openService();
    const f = this.frame();
    await f.locator('input[name="edit"], input[value=" Edit "], input[title="Edit"]').first().click();
    const sel = f.getByLabel(/Accept Attachments/i).or(f.locator('select[id*="attachment" i], select[name*="attachment" i]')).first();
    await sel.waitFor({ timeout: 60000 });
    await sel.selectOption({ label: value });
    await f.locator('input[name="save"], input[value=" Save "], input[title="Save"]').first().click();
    await expect(f.locator('td.labelCol', { hasText: 'Accept Attachments' }).first()).toBeVisible({ timeout: 60000 });
    const now = await this.currentAcceptAttachments();
    expect(now, `Accept Attachments after save`).toContain(value);
    return now;
  }
}
module.exports = { EmailServicePage, SERVICE };
