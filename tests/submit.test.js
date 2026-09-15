// End-to-end behaviour of the submission handler: the questionnaire mode is
// only ever honoured from the sealed link, and a failed delivery can never be
// reported to the client as success.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.APP_ORIGIN = 'https://example.test';
process.env.PREFILL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.SECURITY_HMAC_KEY = 'test-hmac-key';
process.env.MAIL_MODE = 'fake';

const { csrfCookieValue } = require('../lib/security');
const { encryptPrefill } = require('../lib/prefill');
const { MODE_FOS_ONLY, MODE_TIMEBAR_AND_FOS } = require('../lib/questions');
const { VULNERABILITY_VALUES, VULNERABILITY_DETAILS } = require('../lib/questions-fos');
const handler = require('../api/submit');

const CSRF = 'test-csrf-token';

function makeRes() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}
function makeReq(body, over = {}) {
  const { headers: headerOverrides, ...rest } = over;
  return {
    method: 'POST',
    socket: { remoteAddress: '10.0.0.1' },
    body,
    ...rest,
    headers: {
      origin: 'https://example.test',
      'content-length': String(JSON.stringify(body).length),
      'x-csrf-token': CSRF,
      cookie: `tms_csrf=${encodeURIComponent(csrfCookieValue(CSRF))}`,
      // A fresh IP per request, so the per-IP limit does not colour unrelated
      // assertions; the per-reference limit is exercised deliberately below.
      'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250) + 1}`,
      ...headerOverrides
    }
  };
}

const MATTER_FOS = { mode: MODE_FOS_ONLY, clientName: 'Test Person', reference: '200000001', lender: 'Test Lender', product: 'Credit card' };
const MATTER_COMBINED = { ...MATTER_FOS, mode: MODE_TIMEBAR_AND_FOS, communicationEvent: 'a test annual statement', communicationDate: 'March 2020' };

const FOS_ANSWERS = {
  fosVulnerabilities: [VULNERABILITY_VALUES[0]],
  [VULNERABILITY_DETAILS[0].field]: 'Synthetic explanation.',
  fosCourtAction: 'No', fosLendingStart: '2015-06-01', fosLendingAmount: '5000', fosBalancesPaid: 'Yes',
  fosIncomeEmployment: '1500', fosIncomeBenefits: '', fosIncomeMaintenance: '', fosIncomePension: '',
  fosSavings: 'No',
  fosOutHousing: '600', fosOutUtilities: '', fosOutFood: '', fosOutTransport: '',
  fosOtherExpenses: '', fosDependants: 'No', fosFurtherLending: 'No'
};
const TIMEBAR_ANSWERS = {
  q1ThoughtBefore: 'No', q1AwarenessSource: 'From information I found myself', q1YesMonthYear: '', q1YesWhy: '',
  q1NoMonthYear: 'June 2024', q1NoExplain: 'Synthetic.',
  q2Remember: 'No', q2RememberWhat: '', q2MadeThink: '', q2Explain: '', q2OtherMemory: '',
  q3Circumstances: 'No', q3Dates: '', q3Explain: ''
};

// A fresh reference per submission, so the per-reference rate limit (5/hour)
// only ever fires in the test that deliberately exercises it.
let refSeq = 300000000;
const freshFos = () => ({ ...MATTER_FOS, reference: String(refSeq += 1) });
const freshCombined = () => ({ ...MATTER_COMBINED, reference: String(refSeq += 1) });

const payload = (matter, answers, over = {}) => ({
  ...matter, ...answers,
  prefillToken: encryptPrefill(matter),
  confirmation: true, website: '', startedAt: Date.now() - 9999,
  ...over
});

async function run(body, over) {
  const res = makeRes();
  await handler(makeReq(body, over), res);
  return res;
}

// ------------------------------------------------------------ happy paths

test('a valid FOS-only submission is accepted', async () => {
  const res = await run(payload(freshFos(), FOS_ANSWERS));
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.ok, true);
  assert.ok(res.body.requestId);
});

test('a valid combined submission is accepted', async () => {
  const res = await run(payload(freshCombined(), { ...FOS_ANSWERS, ...TIMEBAR_ANSWERS }));
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.ok, true);
});

// ------------------------------------------------------------ link required

test('a submission with no link is refused', async () => {
  const body = payload(MATTER_FOS, FOS_ANSWERS);
  body.prefillToken = '';
  const res = await run(body);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /link TMS Legal sent you/);
});

test('an unreadable or tampered link is refused', async () => {
  const body = payload(MATTER_FOS, FOS_ANSWERS);
  const t = body.prefillToken;
  const i = Math.floor(t.length / 2);
  body.prefillToken = t.slice(0, i) + (t[i] === 'A' ? 'B' : 'A') + t.slice(i + 1);
  const res = await run(body);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /invalid or has expired/);
});

// ------------------------------------------------- the mode cannot be forged

test('a client cannot switch questionnaire mode away from the sealed link', async () => {
  // Link issued for FOS-only; the browser claims the combined questionnaire.
  const body = {
    ...MATTER_COMBINED, ...FOS_ANSWERS, ...TIMEBAR_ANSWERS,
    prefillToken: encryptPrefill(MATTER_FOS),
    confirmation: true, website: '', startedAt: Date.now() - 9999
  };
  const res = await run(body);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /could not be verified/);
});

test('a client cannot downgrade a combined link to FOS-only', async () => {
  const body = {
    ...MATTER_FOS, ...FOS_ANSWERS,
    prefillToken: encryptPrefill(MATTER_COMBINED),
    confirmation: true, website: '', startedAt: Date.now() - 9999
  };
  const res = await run(body);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /could not be verified/);
});

test('altered matter details are refused even with a genuine link', async () => {
  for (const field of ['clientName', 'lender', 'product', 'reference']) {
    const body = payload(MATTER_FOS, FOS_ANSWERS);
    body[field] = field === 'reference' ? '299999999' : field === 'product' ? 'Loan' : 'Someone Else';
    const res = await run(body);
    assert.equal(res.statusCode, 400, `${field} must be verified against the link`);
  }
});

test('an altered lender event is refused in combined mode', async () => {
  for (const field of ['communicationEvent', 'communicationDate']) {
    const body = payload(MATTER_COMBINED, { ...FOS_ANSWERS, ...TIMEBAR_ANSWERS });
    body[field] = 'something the lender never said';
    const res = await run(body);
    assert.equal(res.statusCode, 400, `${field} must be verified against the link`);
    assert.match(res.body.error, /could not be verified/);
  }
});

// -------------------------------------------------------- request controls

test('a non-POST request is refused', async () => {
  const res = makeRes();
  await handler(makeReq(payload(MATTER_FOS, FOS_ANSWERS), { method: 'GET' }), res);
  assert.equal(res.statusCode, 405);
});

test('a wrong origin is refused', async () => {
  const res = await run(payload(MATTER_FOS, FOS_ANSWERS), { headers: { origin: 'https://attacker.test' } });
  assert.equal(res.statusCode, 403);
});

test('a missing or mismatched CSRF token is refused', async () => {
  const a = await run(payload(MATTER_FOS, FOS_ANSWERS), { headers: { 'x-csrf-token': '' } });
  assert.equal(a.statusCode, 403);
  const b = await run(payload(MATTER_FOS, FOS_ANSWERS), { headers: { cookie: 'tms_csrf=wrong' } });
  assert.equal(b.statusCode, 403);
});

test('an oversized body is refused before validation', async () => {
  const res = await run(payload(MATTER_FOS, FOS_ANSWERS), { headers: { 'content-length': '40000' } });
  assert.equal(res.statusCode, 413);
});

test('a bad answer is returned as a fixable field error, not a delivery failure', async () => {
  const body = payload(MATTER_FOS, { ...FOS_ANSWERS, fosLendingAmount: 'about five thousand' });
  const res = await run(body);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.fields.fosLendingAmount, 'the client is told which answer to fix');
});

// ------------------------------------------- delivery failure is never success
//
// These drive the real mail adapter rather than a stub, so the handler's
// success path is only ever reached through the same code that talks to Gmail.

const MAIL_ENV = ['MAIL_MODE', 'GMAIL_SENDER', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'];
async function withMail(env, fetchImpl, fn) {
  const saved = {};
  MAIL_ENV.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  Object.entries(env).forEach(([k, v]) => { process.env[k] = v; });
  const savedFetch = global.fetch;
  if (fetchImpl) global.fetch = fetchImpl;
  try { return await fn(); }
  finally {
    global.fetch = savedFetch;
    MAIL_ENV.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  }
}
const GMAIL = {
  MAIL_MODE: 'gmail_api', GMAIL_SENDER: 'info@moneysolicitor.com',
  GMAIL_CLIENT_ID: 'test-id', GMAIL_CLIENT_SECRET: 'test-secret', GMAIL_REFRESH_TOKEN: 'test-refresh'
};
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('a mail transport failure returns 502 and never reports success', async () => {
  await withMail({ MAIL_MODE: 'smtp' }, null, async () => {
    const res = await run(payload(freshFos(), FOS_ANSWERS));
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.ok, undefined, 'no ok flag on a failed delivery');
    assert.match(res.body.error, /could not confirm receipt/i);
  });
});

test('a Gmail send rejection returns 502', async () => {
  const fetchImpl = async (url) => (String(url).includes('oauth2')
    ? json(200, { access_token: 'token' })
    : json(500, { error: 'backend' }));
  await withMail(GMAIL, fetchImpl, async () => {
    const res = await run(payload(freshFos(), FOS_ANSWERS));
    assert.equal(res.statusCode, 502);
    assert.notEqual(res.body.ok, true);
  });
});

test('a provider reply with no message id is treated as a failure', async () => {
  // The dangerous case: Gmail answered 200, but gave no id evidencing delivery.
  const fetchImpl = async (url) => (String(url).includes('oauth2')
    ? json(200, { access_token: 'token' })
    : json(200, { labelIds: ['SENT'] }));
  await withMail(GMAIL, fetchImpl, async () => {
    const res = await run(payload(freshFos(), FOS_ANSWERS));
    assert.equal(res.statusCode, 502);
    assert.notEqual(res.body.ok, true);
  });
});

test('success is reported only after a provider message id comes back', async () => {
  const fetchImpl = async (url) => (String(url).includes('oauth2')
    ? json(200, { access_token: 'token' })
    : json(200, { id: 'provider-message-id' }));
  await withMail(GMAIL, fetchImpl, async () => {
    const res = await run(payload(freshFos(), FOS_ANSWERS));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
  });
});

test('the failure response leaks no client data', async () => {
  await withMail({ MAIL_MODE: 'smtp' }, null, async () => {
    const res = await run(payload(freshFos(), FOS_ANSWERS));
    const serialised = JSON.stringify(res.body);
    for (const leak of ['Test Person', '200000001', 'Test Lender', '5000', VULNERABILITY_VALUES[0]]) {
      assert.ok(!serialised.includes(leak), `failure response leaks ${leak}`);
    }
  });
});

// ---------------------------------------------------------- rate limiting

test('repeated submissions on one reference are rate limited', async () => {
  const seen = [];
  for (let i = 0; i < 7; i += 1) {
    const res = await run(payload({ ...MATTER_FOS, reference: '288888888' }, FOS_ANSWERS));
    seen.push(res.statusCode);
  }
  assert.ok(seen.includes(429), `expected a 429 once the per-reference limit is passed, saw ${seen.join(',')}`);
});
