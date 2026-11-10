// Email Parser record: create (always inactive – org blocks Active on create), Filter Evaluation, Custom Filter, activate, clone, delete.
const { expect } = require('@playwright/test');
const u = require('../helpers/uiFactory');

class EmailParserPage {
  constructor(page) { this.page = page; }
  async openNew() { this.dlg = await u.openNewParserForm(this.page); return this.dlg; }
  nameInput() { return this.dlg.locator('input[name="ctkemailparser__Name__c"]'); }
  customFilterInput() { return this.dlg.locator('input[name="ctkemailparser__Custom_Filter__c"]'); }
  async create(name, filterEvaluation = 'AND', customFilter) {
    const fe = String(filterEvaluation).toUpperCase() === 'CUSTOM' ? 'CUSTOM' : String(filterEvaluation).toUpperCase();
    return u.createParserUI(this.page, name, fe, customFilter);
  }
  open(id) { return u.openRecord(this.page, id); }
  edit(id, values) { return u.editParserUI(this.page, id, values); }
  activate(id) { return u.setActiveUI(this.page, id, true); }
  deactivate(id) { return u.setActiveUI(this.page, id, false); }
  activeBanner() { return this.page.getByText(u.ACTIVE_BANNER); }
  /** Clone flow: header ▾ → Clone → '*Clone Parser Name' → Next → 'Email Parser Cloned successfully.' → Finish. Returns clone Id. */
  async clone(id, cloneName) {
    const { dlg } = await u.cloneParserUI(this.page, id, cloneName);
    await expect(dlg.getByText('Email Parser Cloned successfully.')).toBeVisible({ timeout: 60000 });
    await dlg.getByRole('button', { name: 'Finish', exact: true }).click();
    await this.page.waitForTimeout(3000);
    const ids = await u.findParsersUI(this.page, cloneName);
    return ids[0];
  }
  /** Deactivate if needed, then delete (children cascade). Refuses non-AUTO_ names. */
  async delete(id) {
    const page = this.page;
    const name = await u.parserNameUI(page, id).catch(() => '');
    if (!name.startsWith('AUTO_')) throw new Error(`refusing to delete non-AUTO_ parser ${id} (${name})`);
    await u.openRecord(page, id);
    await page.waitForTimeout(1500);
    if (await page.getByText('Active Email Parser cannot be modified').count()) { await this.deactivate(id); await u.openRecord(page, id); }
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
    const confirm = page.getByRole('dialog').filter({ hasText: /Are you sure you want to delete/ }).last();
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(u.toastWith(page, /was deleted/)).toBeVisible({ timeout: 20000 });
  }
}
module.exports = { EmailParserPage };
