// 'Field Parser Editor (FP-xxxxxx)' modal – opened by the Build header button on a Field Parser record.
// Live options (org, 04-Nov-2026): Range Start = Any of Characters|BlankSpace|Position|Regex|Text Delimiter;
// Range End = End of Line|Text Delimiter|Regex|Any of Characters|Position|BlankSpace; Multiple Results Handler = First|Last|All|Custom.
// Type=Text -> Range Start/End(+Value); Path -> Value, Deep Mode, Separator; Regex Selector -> Value; Fixed -> Value; Full Value -> nothing.
const { expect } = require('@playwright/test');
const u = require('../helpers/uiFactory');
const { normType, normSource } = require('./FieldParserPage');
const normRange = (r) => (r ? ({ 'text delimeter': 'Text Delimiter', 'text delimiter': 'Text Delimiter', 'end line': 'End of Line' }[String(r).toLowerCase().replace(/\.$/, '')] || r) : r);

class BuildEditorPage {
  constructor(page) { this.page = page; this.modal = page.getByRole('dialog').filter({ hasText: /Field Parser Editor/ }); this.skipped = []; }
  async open(fpId) {
    // header actions sometimes don't render on first load -> reload once
    for (let i = 0; i < 2; i++) {
      await this.page.goto(`/lightning/r/${fpId}/view`);
      if (await this.page.getByRole('button', { name: 'Build', exact: true }).waitFor({ timeout: 30000 }).then(() => true).catch(() => false)) break;
    }
    await this.page.getByRole('button', { name: 'Build', exact: true }).click();
    await expect(this.modal).toBeVisible({ timeout: 30000 });
    await this.page.waitForTimeout(2500);
    return this;
  }
  has(label) { return this.modal.getByRole('combobox', { name: label, exact: true }).count().then((n) => n > 0); }
  async combo(label, value) {
    if (!value) return;
    if (!(await this.has(label))) { this.skipped.push(`${label}=${value} (field not shown)`); return; }
    await u.pickCombo(this.page, this.modal, label, value);
    await this.page.waitForTimeout(600);
  }
  async text(label, value) {
    if (value === undefined || value === null) return;
    // inputs live in shadow DOM without aria labels -> find the lightning-input/textarea whose label text is '<*>label'
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const f = this.modal.locator('lightning-textarea, lightning-input').filter({ has: this.page.locator('label', { hasText: new RegExp(`^\\s*\\*?\\s*${esc}\\s*$`) }) }).locator('textarea, input').first();
    if (!(await f.count())) { this.skipped.push(`${label}=${value} (field not shown)`); return; }
    await f.fill(String(value));
  }
  /** fp = field parser from testcases.json; build = fp.build (CSV 'Build Parser' values) */
  async configure(fp, build = {}) {
    await this.combo('Type', normType(fp.type));
    await this.combo('Source', normSource(fp.source));
    await this.combo('Range Start', normRange(build.rangeStart));
    await this.text('Range Start Value', build.rangeStartValue);
    await this.combo('Range End', normRange(build.rangeEnd));
    await this.text('Range End Value', build.rangeEndValue);
    await this.text('Value', build.value ?? build.assumedValue);
    if (normType(fp.type) === 'Path') {
      // '*Separator' is required for Path but the CSV never gives one -> ',' (reported as an assumption)
      await this.text('Separator', build.separator || ',');
      if (!build.separator) this.skipped.push("ASSUMED Separator=',' (CSV gives none, field is required for Path)");
    }
    await this.combo('Multiple Results Handler', build.handler);
    if (build.trim) await this.modal.getByLabel('Trim Parsed Value').check({ force: true });
    if (build.convertHtml) await this.modal.getByLabel('Convert HTML Result to Text').check({ force: true });
    return this.skipped;
  }
  /** Test Area: '*Sample Content for testing Field Parser' + Test -> text under 'Test Results' */
  async test(sample) {
    await this.modal.getByLabel(/Sample Content for testing Field Parser/).fill(sample);
    await this.modal.getByRole('button', { name: 'Test', exact: true }).click();
    await this.page.waitForTimeout(4000);
    const t = await this.modal.innerText();
    const i = t.lastIndexOf('Test Results');
    return i >= 0 ? t.slice(i + 'Test Results'.length).trim() : '';
  }
  async save() {
    await this.modal.getByRole('button', { name: 'Save', exact: true }).first().click();
    const ok = await u.toastWith(this.page, /Field Parser updated successfully/).waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    const err = ok ? '' : (await this.modal.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    return { closed: ok, err };
  }
  async cancel() { await this.modal.getByRole('button', { name: 'Cancel', exact: true }).first().click().catch(() => this.page.keyboard.press('Escape')); }
}
module.exports = { BuildEditorPage, normRange };
