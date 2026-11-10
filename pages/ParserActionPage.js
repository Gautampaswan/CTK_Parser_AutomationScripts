// Email Parser Action: Name, Type (Create Record | Attach To Record), Sequence, Object Type, Mapping JSON {"TargetField":"fieldParserReferenceName"}.
const u = require('../helpers/uiFactory');
class ParserActionPage {
  constructor(page) { this.page = page; }
  async openNew(parserId) { this.dlg = await u.openNewRelated(this.page, parserId, u.REL.actions); return this.dlg; }
  async create(parserId, a) {
    return u.createActionUI(this.page, parserId, { name: a.name, type: a.type, sequence: a.sequence, objectType: a.objectType, mapping: a.mapping });
  }
  buildButton() { return this.page.getByRole('button', { name: 'Build', exact: true }); }
}
module.exports = { ParserActionPage };
