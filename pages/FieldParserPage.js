// Field Parser (related list on Email Parser): Type, Reference Name, Output Type, Source, Header Name.
const { expect } = require('@playwright/test');
const u = require('../helpers/uiFactory');
const normType = (t) => ({ text: 'Text', path: 'Path', fixed: 'Fixed', 'full value': 'Full Value', 'regex selector': 'Regex Selector' }[String(t).toLowerCase()] || t);
// Org rule: Reference Name cannot contain spaces (CSV values like 'Test Field Parser' are rejected) -> spaces become '_' (annotated)
const refName = (r) => String(r).trim().replace(/\.$/, '').replace(/\s+/g, '_');
// Prefer org Filter/Field Source picklist API-style labels when present (verified 2026-11-05).
const normSource = (s) => ({
  'html body': 'HTML Body',
  'text body': 'Text Body', textbody: 'Text Body',
  'from name': 'From Name', fromname: 'From Name',
  'attached file names': 'Attached File Names',
  'attachment file names': 'Attached File Names', attachmentfilenames: 'Attached File Names',
  attachments: 'Attached File Names', // Field Parser has no Attachments source; use file names
  specialflags: 'Special Flags', 'special flags': 'Special Flags',
  'message id': 'MessageId', messageid: 'MessageId',
  'email send date': 'Email Send Date',
  cc: 'CC', to: 'To', from: 'From', subject: 'Subject', header: 'Header',
}[String(s).toLowerCase()] || s);

class FieldParserPage {
  constructor(page) { this.page = page; }
  async openNew(parserId) { this.dlg = await u.openNewRelated(this.page, parserId, u.REL.fieldParsers); return this.dlg; }
  async fill(fp, dlg = this.dlg) {
    await u.fillFieldParserForm(this.page, dlg, { referenceName: refName(fp.referenceName), type: normType(fp.type), outputType: fp.outputType, source: normSource(fp.source) });
    if (normSource(fp.source) === 'Header' && fp.headerName) await dlg.locator('input[name="ctkemailparser__HeaderName__c"]').fill(fp.headerName);
  }
  async create(parserId, fp) {
    await this.openNew(parserId);
    await this.fill(fp);
    await u.saveDialog(this.page);
    await expect(u.toastWith(this.page, /was created/)).toBeVisible({ timeout: 20000 });
    return u.firstRelatedId(this.page, parserId, u.REL.fieldParsers, /^FP-\d+$/);
  }
  /** Edit an existing Field Parser record ("After Update" data). */
  async update(fpId, fp) {
    await this.page.goto(`/lightning/r/${fpId}/view`);
    await this.page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const dlg = u.dialog(this.page);
    await dlg.locator('input[name="ctkemailparser__ReferenceName__c"]').waitFor({ timeout: 20000 });
    await this.fill(fp, dlg);
    await u.saveDialog(this.page);
    return dlg;
  }
  buildButton() { return this.page.getByRole('button', { name: 'Build', exact: true }); }
}
module.exports = { FieldParserPage, normType, normSource, refName };
