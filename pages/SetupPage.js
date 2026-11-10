// Page object: CTK Email Parser Setup tab (Export / Import / Ingest Emails via Document Upload)
const { expect } = require('@playwright/test');

class SetupPage {
  constructor(page) { this.page = page; }
  async open() {
    await this.page.goto('/lightning/n/ctkemailparser__CTKEmailParserSetup');
    await expect(this.page.getByText('Export Email Parsers').first()).toBeVisible({ timeout: 40000 });
    return this;
  }
  section(name) { return this.page.getByText(name, { exact: true }).first(); }
  hideInactive() { return this.page.getByRole('checkbox', { name: /Hide Inactive/i }).or(this.page.getByLabel(/Hide Inactive/i)).first(); }
  async exportGridText() { return this.page.locator('table').first().innerText().catch(() => this.page.locator('body').innerText()); }
  rowFor(name) { return this.page.locator('tr').filter({ hasText: name }).first(); }
  async exportParsers(names) {
    for (const n of names) await this.rowFor(n).getByRole('checkbox').first().check({ force: true });
    const [dl] = await Promise.all([this.page.waitForEvent('download', { timeout: 60000 }), this.page.getByRole('button', { name: 'Export', exact: true }).click()]);
    return dl;
  }
  async openImport() { await this.section('Import Email Parser').click().catch(() => {}); }
  fileInput() { return this.page.locator('input[type="file"]').first(); }
  importButton() { return this.page.getByRole('button', { name: 'Import', exact: true }); }
  replaceToggle() { return this.page.getByRole('checkbox', { name: /Replace/i }).or(this.page.getByLabel(/Replace/i)).first(); }
}
module.exports = { SetupPage };
