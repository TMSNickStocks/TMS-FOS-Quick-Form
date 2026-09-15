const crypto = require('crypto');

// The approved subject line. It must stay exactly this string and must never
// carry the client name, TMS reference, lender, any answer or any
// vulnerability information.
const SUBJECT = 'FOS Questionnaire Answers';

function base64url(s) { return Buffer.from(s, 'utf8').toString('base64url'); }
function safeHeader(value) {
  const v = String(value || '');
  if (/\r|\n/.test(v)) throw new Error('Invalid email header');
  return v;
}
function mimeMessage({ from, to, subject, text, html }) {
  [from, to, subject].forEach(safeHeader);
  const boundary = `tms_${crypto.randomBytes(12).toString('hex')}`;
  return [
    `From: TMS Legal <${from}>`, `To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', text, '',
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', html, '',
    `--${boundary}--`, ''
  ].join('\r\n');
}

async function gmailAccessToken() {
  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID || '', client_secret: process.env.GMAIL_CLIENT_SECRET || '',
    refresh_token: process.env.GMAIL_REFRESH_TOKEN || '', grant_type: 'refresh_token'
  });
  const resp = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params });
  if (!resp.ok) throw new Error('Gmail OAuth failed');
  const json = await resp.json();
  if (!json.access_token) throw new Error('No Gmail access token');
  return json.access_token;
}

async function sendMail({ text, html }) {
  const mode = process.env.MAIL_MODE || 'fake';
  const to = process.env.MAIL_TO || 'info@moneysolicitor.com';
  const from = process.env.GMAIL_SENDER || 'forms@moneysolicitor.com';
  const subject = SUBJECT;
  if (mode === 'fake') return { id: `fake-${crypto.randomBytes(8).toString('hex')}` };
  if (mode !== 'gmail_api') throw new Error('Unsupported MAIL_MODE');
  const required = ['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN','GMAIL_SENDER'];
  if (required.some((k) => !process.env[k])) throw new Error('Missing Gmail configuration');
  const raw = mimeMessage({ from, to, subject, text, html });
  const access = await gmailAccessToken();
  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: base64url(raw) })
  });
  if (!resp.ok) throw new Error('Gmail send failed');
  const json = await resp.json();
  if (!json.id) throw new Error('Gmail did not return a message id');
  return { id: json.id };
}

module.exports = { sendMail, mimeMessage, safeHeader, SUBJECT };
