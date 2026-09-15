const test = require('node:test');
const assert = require('node:assert/strict');
const { sendMail, SUBJECT } = require('../lib/mail');

const ENV_KEYS = ['MAIL_MODE', 'MAIL_TO', 'GMAIL_SENDER', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'];
const MESSAGE = { text: 'body', html: '<p>body</p>' };

function withEnv(overrides, fn) {
  const saved = {};
  ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  Object.entries(overrides).forEach(([k, v]) => { process.env[k] = v; });
  const savedFetch = global.fetch;
  return (async () => {
    try { return await fn((impl) => { global.fetch = impl; }); }
    finally {
      global.fetch = savedFetch;
      ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
    }
  })();
}

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('fake mode returns an acceptance id and sends nothing', () => withEnv({ MAIL_MODE: 'fake' }, async (setFetch) => {
  let called = false;
  setFetch(async () => { called = true; return json(200, {}); });
  const r = await sendMail(MESSAGE);
  assert.match(r.id, /^fake-/);
  assert.equal(called, false, 'fake mode must not make a network call');
}));

test('unsupported MAIL_MODE throws rather than silently succeeding', () => withEnv({ MAIL_MODE: 'smtp' }, async () => {
  await assert.rejects(() => sendMail(MESSAGE), /Unsupported MAIL_MODE/);
}));

test('gmail_api without credentials throws instead of sending', () => withEnv({ MAIL_MODE: 'gmail_api' }, async (setFetch) => {
  let called = false;
  setFetch(async () => { called = true; return json(200, {}); });
  await assert.rejects(() => sendMail(MESSAGE), /Missing Gmail configuration/);
  assert.equal(called, false, 'must not reach the network without credentials');
}));

const CREDS = {
  MAIL_MODE: 'gmail_api', GMAIL_SENDER: 'info@moneysolicitor.com',
  GMAIL_CLIENT_ID: 'test-client-id', GMAIL_CLIENT_SECRET: 'test-secret', GMAIL_REFRESH_TOKEN: 'test-refresh'
};

test('OAuth failure surfaces as an error, never a success', () => withEnv(CREDS, async (setFetch) => {
  setFetch(async () => json(400, { error: 'invalid_grant' }));
  await assert.rejects(() => sendMail(MESSAGE), /Gmail OAuth failed/);
}));

test('missing access token surfaces as an error', () => withEnv(CREDS, async (setFetch) => {
  setFetch(async () => json(200, {}));
  await assert.rejects(() => sendMail(MESSAGE), /No Gmail access token/);
}));

test('Gmail send rejection surfaces as an error', () => withEnv(CREDS, async (setFetch) => {
  setFetch(async (url) => (String(url).includes('oauth2')
    ? json(200, { access_token: 'token' })
    : json(500, { error: 'backend' })));
  await assert.rejects(() => sendMail(MESSAGE), /Gmail send failed/);
}));

// The false-success guard: Gmail answers 200 but gives no message id.
test('a 200 with no message id is treated as failure', () => withEnv(CREDS, async (setFetch) => {
  setFetch(async (url) => (String(url).includes('oauth2')
    ? json(200, { access_token: 'token' })
    : json(200, { labelIds: ['SENT'] })));
  await assert.rejects(() => sendMail(MESSAGE), /did not return a message id/);
}));

test('successful send returns the provider message id', () => withEnv(CREDS, async (setFetch) => {
  let sendBody = null;
  setFetch(async (url, opts) => {
    if (String(url).includes('oauth2')) return json(200, { access_token: 'token' });
    sendBody = JSON.parse(opts.body);
    return json(200, { id: 'gmail-message-id-123' });
  });
  const r = await sendMail(MESSAGE);
  assert.equal(r.id, 'gmail-message-id-123');
  assert.ok(sendBody.raw, 'raw MIME payload sent');
  const decoded = Buffer.from(sendBody.raw, 'base64url').toString('utf8');
  assert.match(decoded, /^To: info@moneysolicitor\.com$/m, 'recipient fixed server-side');
  assert.match(decoded, /^Subject: FOS Questionnaire Answers$/m);
}));

test('recipient comes from MAIL_TO and cannot be overridden by the caller', () => withEnv({ ...CREDS, MAIL_TO: 'info@moneysolicitor.com' }, async (setFetch) => {
  let decoded = '';
  setFetch(async (url, opts) => {
    if (String(url).includes('oauth2')) return json(200, { access_token: 'token' });
    decoded = Buffer.from(JSON.parse(opts.body).raw, 'base64url').toString('utf8');
    return json(200, { id: 'x' });
  });
  // a caller trying to smuggle a recipient in the payload must have no effect
  await sendMail({ ...MESSAGE, to: 'attacker@example.com', from: 'attacker@example.com' });
  assert.match(decoded, /^To: info@moneysolicitor\.com$/m);
  assert.ok(!decoded.includes('attacker@example.com'));
}));

// ---------------------------------------------------------------- subject

test('the subject line is exactly the approved string', () => {
  assert.equal(SUBJECT, 'FOS Questionnaire Answers');
});

test('the subject carries no client name, reference, lender, product or answer', () => {
  // Built from a submission whose every field is a distinctive marker; none of
  // them may reach the subject.
  const markers = ['Marker Person', '200000001', 'Marker Lender', 'Credit card', 'MarkerAnswer', 'health condition'];
  for (const m of markers) assert.ok(!SUBJECT.includes(m), `subject leaks ${m}`);
  assert.equal(/[0-9]/.test(SUBJECT), false, 'subject contains no digits, so it cannot carry a reference');
});

test('the subject is fixed in code and not taken from the environment', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync('lib/mail.js', 'utf8');
  assert.match(source, /const subject = SUBJECT;/);
  assert.ok(!/process\.env\.[A-Z_]*SUBJECT/.test(source), 'subject must not be configurable');
});
