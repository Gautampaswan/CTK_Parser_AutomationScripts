// Sends email with nodemailer (Gmail SMTP). Needs GMAIL_USER + GMAIL_APP_PASSWORD (16-char Google App Password,
// NOT the normal Gmail password) and CTK_INBOUND_ADDRESS. Runs in Node.js – browser choice does not matter.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const gmailPass = () => (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const mailReady = () => !!(process.env.GMAIL_USER && gmailPass() && process.env.CTK_INBOUND_ADDRESS);
const MAIL_SKIP = 'Email sending skipped: set GMAIL_USER, GMAIL_APP_PASSWORD (Google App Password) and CTK_INBOUND_ADDRESS in .env';
const token = () => `AUTO-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4)}`;
const port = () => Number(process.env.SMTP_PORT || 465);
const transport = () => nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com', port: port(), secure: port() === 465,
  connectionTimeout: 20000, auth: { user: process.env.GMAIL_USER, pass: gmailPass() },
});

function smtpStatus() {
  const f = path.join(__dirname, '..', 'test-results', '.smtp-status.json');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return mailReady() ? { ok: true, reason: 'no pre-check file' } : { ok: false, reason: MAIL_SKIP }; }
}

/**
 * email = { subject, text, html, attachments:[{filename,content}|filename], cc, to, fromName, headers, exactSubject }
 * Subject gets ' [AUTO-<token>]' unless exactSubject (token then goes into body + X-CTK-Token header).
 */
async function sendCaseEmail(email, tok = token()) {
  const subject = email.exactSubject ? email.subject : `${email.subject ? `${email.subject} ` : ''}[${tok}]`;
  const attachments = (email.attachments || []).map((a) => (typeof a === 'string'
    ? { filename: a, content: fs.readFileSync(path.join(__dirname, '..', 'data', 'emails', a)) }
    : a));
  let text = email.text;
  if (email.exactSubject && text !== undefined) text = `${text}\n\n[${tok}]`;
  const from = email.fromName ? { name: email.fromName, address: process.env.GMAIL_USER } : process.env.GMAIL_USER;
  const info = await transport().sendMail({
    from,
    to: email.to || process.env.CTK_INBOUND_ADDRESS,
    cc: email.cc,
    subject,
    text,
    html: email.html,
    attachments,
    headers: { 'X-CTK-Token': tok, ...(email.headers || {}) },
  });
  return { tok, subject, search: email.exactSubject ? email.subject : tok, messageId: info.messageId };
}

const isNetworkError = (e) => /ESOCKET|ETIMEDOUT|ECONNREFUSED|ECONNRESET|socket disconnected|Greeting never received/i.test(`${e.code} ${e.message}`);
module.exports = { isNetworkError, mailReady, MAIL_SKIP, sendCaseEmail, token, transport, smtpStatus };
