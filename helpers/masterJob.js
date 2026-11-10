// Send the master-case email after each parser is activated; capture that test's Email Parser Job.
// Persists test-results/master-job.json for the current test only (cleared after job delete).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MASTER } = require('./scenarios');
const { smtpStatus, sendCaseEmail, isNetworkError, mailReady, MAIL_SKIP } = require('./mailer');
const { JobsPage } = require('../pages/JobsPage');

const OUT = path.join(__dirname, '..', 'test-results', 'master-job.json');

function readMasterJob() {
  try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return null; }
}

function writeMasterJob(data) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
}

function clearMasterJob() {
  try { fs.unlinkSync(OUT); } catch { /* no file */ }
}

/** Email payload matching data/master-email.md */
function masterEmailPayload() {
  const fs = require('fs');
  const attachPath = MASTER.attachmentPath;
  const attachments = [];
  if (attachPath && fs.existsSync(attachPath)) {
    attachments.push({
      filename: MASTER.attachmentFilename || 'AUTO_Attached_Mail.eml',
      content: fs.readFileSync(attachPath),
      contentType: 'message/rfc822',
    });
  }
  return {
    fromName: MASTER.fromName,
    subject: MASTER.subject,
    exactSubject: true, // subject must stay exact for Subject filter Matches Text; token goes in body + X-CTK-Token
    text: MASTER.textBody,
    html: MASTER.htmlBody,
    cc: [MASTER.cc],
    to: process.env.CTK_INBOUND_ADDRESS,
    headers: { [MASTER.headerName]: MASTER.headerValue },
    attachments,
  };
}

/**
 * Send master email (if SMTP ok), find job by token/subject, parse fields, save JSON.
 * @returns master job info object for this send
 */
async function ensureMasterJob(page, { forceResend = true, log = console.log } = {}) {
  const existing = readMasterJob();
  if (!forceResend && existing && existing.href) {
    log(`[master] reusing saved job ${existing.href}`);
    return existing;
  }
  const smtp = smtpStatus();
  if (!smtp.ok) {
    const err = new Error(`Master email not sent – ${smtp.reason}`);
    err.code = 'SMTP_SKIP';
    throw err;
  }
  if (!mailReady()) {
    const err = new Error(MAIL_SKIP);
    err.code = 'SMTP_SKIP';
    throw err;
  }
  log('[master] sending master-case email…');
  let sent;
  try {
    sent = await sendCaseEmail(masterEmailPayload());
  } catch (e) {
    if (isNetworkError(e)) {
      const err = new Error(`SMTP blocked: ${e.code || e.message}`);
      err.code = 'SMTP_SKIP';
      throw err;
    }
    throw e;
  }
  log(`[master] sent subject="${sent.subject}" tok=${sent.tok} messageId=${sent.messageId || ''}`);

  const jobs = new JobsPage(page);
  let href = await jobs.findJobForEmail({
    subject: MASTER.subject,
    messageId: sent.messageId,
  });
  if (!href) throw new Error(`Email Parser Job not found on All list (wait for inbound job to appear)`);

  const body = await jobs.openAndReadLog(href);
  const fields = jobs.parseJobFields(body);
  const info = {
    href,
    id: jobs.idFromHref(href),
    tok: sent.tok,
    subject: sent.subject,
    smtpMessageId: sent.messageId,
    messageId: fields.messageId || sent.messageId || '',
    sendDate: fields.sendDate || '',
    from: fields.from || MASTER.from,
    to: fields.to || process.env.CTK_INBOUND_ADDRESS,
    status: fields.status,
    at: new Date().toISOString(),
  };
  writeMasterJob(info);
  log(`[master] saved ${OUT}`);
  log(`[master] messageId="${info.messageId}" sendDate="${info.sendDate}" status="${info.status}"`);
  return info;
}

module.exports = { ensureMasterJob, readMasterJob, writeMasterJob, clearMasterJob, masterEmailPayload, OUT };
