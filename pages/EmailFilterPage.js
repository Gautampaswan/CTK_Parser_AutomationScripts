// Email Filter (related list on Email Parser): Email Filter Name, Source, Header Name (only when Source=Header), Operation, Value, Sequence.
const u = require('../helpers/uiFactory');
// Org Operation picklist labels (verified live 2026-11-05):
// Contains, Starts with, Ends With, Matches Text, Matches Regex, Has Attachments, Is Auto-Reply
const OP = {
  'starts with': 'Starts with', startswith: 'Starts with',
  'ends with': 'Ends With', endswith: 'Ends With',
  'matches text': 'Matches Text', matches: 'Matches Text',
  'matches regex': 'Matches Regex', regex: 'Matches Regex',
  contains: 'Contains',
  'has attachments': 'Has Attachments', hasattachments: 'Has Attachments',
  'is auto-reply': 'Is Auto-Reply', 'is auto reply': 'Is Auto-Reply', isautoreply: 'Is Auto-Reply',
};
const normOp = (o) => (o ? OP[String(o).toLowerCase().replace(/\.$/, '')] || o : o);

// Lightning sometimes shows a 'Sorry to interrupt – CSS Error' popup after a layout re-render; close it
async function dismissInterrupt(page) {
  const d = page.getByRole('dialog').filter({ hasText: 'Sorry to interrupt' });
  if (await d.count()) await d.locator('button').first().click({ force: true }).catch(() => {});
}
class EmailFilterPage {
  constructor(page) { this.page = page; }
  async openNew(parserId) { this.dlg = await u.openNewRelated(this.page, parserId, u.REL.filters); return this.dlg; }
  operationCombo() { return this.dlg.getByRole('combobox', { name: 'Operation', exact: true }); }
  async fill(f) {
    // Source=Header adds '*Header Name' to the layout and Lightning re-renders the modal -> fill in two steps and re-acquire the dialog
    await u.fillFilterForm(this.page, this.dlg, { name: f.name, source: f.source });
    if (f.source === 'Header') { await this.page.waitForTimeout(2500); await dismissInterrupt(this.page); this.dlg = u.dialog(this.page); await this.dlg.locator('input[name="ctkemailparser__HeaderName__c"]').waitFor({ timeout: 20000 }); }
    await u.fillFilterForm(this.page, this.dlg, { headerName: f.source === 'Header' && f.headerName ? f.headerName : undefined,
      operation: normOp(f.operation), value: f.value, sequence: f.sequence });
  }
  save() { return u.saveDialog(this.page); }
  async create(parserId, f) {
    await this.openNew(parserId);
    await this.fill(f);
    await this.save();
    await require('@playwright/test').expect(u.toastWith(this.page, /was created/)).toBeVisible({ timeout: 20000 });
  }
}
module.exports = { EmailFilterPage, normOp };
