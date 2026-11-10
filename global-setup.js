// Runs once before any project: checks SMTP login with nodemailer verify(). Result is written to
// test-results/.smtp-status.json; email tests read it and SKIP (with the reason) when SMTP is not usable.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { mailReady, MAIL_SKIP, transport } = require('./helpers/mailer');
const STATUS = path.join(__dirname, 'test-results', '.smtp-status.json');
module.exports = async () => {
  fs.mkdirSync(path.dirname(STATUS), { recursive: true });
  let status;
  if (!mailReady()) status = { ok: false, reason: MAIL_SKIP };
  else {
    try { await transport().verify(); status = { ok: true, reason: 'SMTP verify() OK' }; }
    catch (e) { status = { ok: false, reason: `SMTP pre-check failed (${process.env.SMTP_HOST || 'smtp.gmail.com'}:${process.env.SMTP_PORT || 465}): ${e.code || ''} ${e.message}` }; }
  }
  fs.writeFileSync(STATUS, JSON.stringify(status));
  console.log(`[global-setup] ${status.ok ? 'SMTP ready – email tests will run' : `EMAIL TESTS WILL BE SKIPPED – ${status.reason}`}`);
};
module.exports.STATUS = STATUS;
