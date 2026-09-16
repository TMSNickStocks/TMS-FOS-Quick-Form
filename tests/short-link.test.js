// Short client links: /q/<code> resolves, server side, to the existing sealed
// prefill token.
//
// The tests below hold two lines at once. The first is that the indirection is
// safe on its own terms - the code is unguessable, Redis holds nothing but the
// sealed token, the mapping cannot outlive it. The second is that nothing
// downstream changed: the reference gate, the sealed token, the questionnaire,
// the record and the legacy links all behave exactly as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

process.env.NODE_ENV = 'test';
process.env.APP_ORIGIN = 'https://example.test';
process.env.PREFILL_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString('base64');
process.env.SECURITY_HMAC_KEY = 'test-hmac-key';
process.env.MAIL_MODE = 'fake';
process.env.ADMIN_ACCESS_KEY = 'test-admin-key';

const shortLink = require('../lib/short-link');
const { encryptPrefill, decryptPrefill } = require('../lib/prefill');
const { csrfCookieValue } = require('../lib/security');
const { MODE_FOS_ONLY, MODE_TIMEBAR_AND_FOS } = require('../lib/questions');

const createHandler = require('../api/prefill-create');
const resolveHandler = require('../api/prefill-resolve');

const CSRF = 'test-csrf-token';
const MATTER_FOS = {
  mode: MODE_FOS_ONLY, clientName: 'Test Person', reference: '200000001',
  lender: 'Test Lender', product: 'Credit card'
};
const MATTER_COMBINED = {
  ...MATTER_FOS, mode: MODE_TIMEBAR_AND_FOS,
  communicationEvent: 'a test annual statement', communicationDate: 'March 2020'
};

// --- a stand-in for Redis -------------------------------------------------
// Records what was written so the tests can inspect it, honours TTL, and can
// be made to fail on demand.
function fakeStore() {
  const entries = new Map();
  const store = {
    writes: [],
    fail: false,
    async set(key, value, ttlSeconds) {
      if (store.fail) throw new Error('redis unavailable');
      store.writes.push({ key, value, ttlSeconds });
      entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async get(key) {
      if (store.fail) throw new Error('redis unavailable');
      const hit = entries.get(key);
      if (!hit) return null;
      if (hit.expiresAt <= Date.now()) { entries.delete(key); return null; }
      return hit.value;
    },
    expire(key) { entries.delete(key); },
    get size() { return entries.size; }
  };
  return store;
}

let store;
test.beforeEach(() => { store = fakeStore(); shortLink._setStore(store); });
test.after(() => shortLink._setStore(null));

// --- request helpers ------------------------------------------------------
let ipSeq = 0;
function makeRes() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}
function makeReq(body, over = {}) {
  const { headers: headerOverrides, ...rest } = over;
  ipSeq += 1;
  return {
    method: 'POST',
    socket: { remoteAddress: '10.1.0.1' },
    body,
    ...rest,
    headers: {
      origin: 'https://example.test',
      'x-csrf-token': CSRF,
      cookie: `tms_csrf=${encodeURIComponent(csrfCookieValue(CSRF))}`,
      'x-admin-key': 'test-admin-key',
      'x-forwarded-for': `10.1.${Math.floor(ipSeq / 250) % 250}.${(ipSeq % 250) + 1}`,
      ...headerOverrides
    }
  };
}
async function create(matter, over) {
  const res = makeRes();
  await createHandler(makeReq(matter, over), res);
  return res;
}
async function resolve(body, over) {
  const res = makeRes();
  await resolveHandler(makeReq(body, over), res);
  return res;
}
const codeOf = (link) => (/\/q\/([0-9A-HJ-NP-TV-Z]{16})$/.exec(link) || [])[1];

// ===================== 1-2. code generation and format ====================

test('1. codes are generated from a CSPRNG and never repeat in practice', () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i += 1) seen.add(shortLink.generateCode());
  assert.equal(seen.size, 5000, 'no collision across 5000 codes');

  // Every position must vary: a stuck or padded position would silently cut
  // the entropy without changing the length.
  for (let pos = 0; pos < shortLink.CODE_LENGTH; pos += 1) {
    const chars = new Set([...seen].map((c) => c[pos]));
    assert.ok(chars.size > 20, `position ${pos} varies (${chars.size} distinct)`);
  }
});

test('2. the format carries at least 72 bits and is URL-safe', () => {
  assert.ok(shortLink.CODE_BITS >= 72, `${shortLink.CODE_BITS} bits of entropy`);
  assert.equal(shortLink.CODE_BITS, 80);
  assert.equal(shortLink.ALPHABET.length, 32, 'a power of two, so no modulo bias');
  // Crockford base32: no I, L, O or U, so nothing is misread when retyped.
  for (const ambiguous of ['I', 'L', 'O', 'U']) {
    assert.ok(!shortLink.ALPHABET.includes(ambiguous), `${ambiguous} excluded`);
  }
  for (let i = 0; i < 200; i += 1) {
    const code = shortLink.generateCode();
    assert.match(code, /^[0-9A-HJ-NP-TV-Z]{16}$/, `URL-safe: ${code}`);
    assert.equal(encodeURIComponent(code), code, 'needs no escaping in a URL');
    assert.ok(shortLink.isValidCode(code));
  }
});

test('2b. the code carries no client information', () => {
  // It is generated before anything about the matter is consulted, so it
  // cannot encode any of it. Same input, different code, every time.
  const codes = new Set();
  for (let i = 0; i < 50; i += 1) codes.add(shortLink.generateCode());
  assert.equal(codes.size, 50, 'not derived from anything deterministic');
  for (const code of codes) {
    for (const leak of ['200000001', 'TESTPERSON', 'TESTLENDER', 'CREDITCARD']) {
      assert.ok(!code.includes(leak), `code must not contain ${leak}`);
    }
  }
});

// ===================== 3-5. what Redis holds ==============================

test('3. Redis stores the sealed token and nothing else', async () => {
  const res = await create(MATTER_FOS);
  assert.equal(res.statusCode, 200);
  assert.equal(store.writes.length, 1);
  const [write] = store.writes;
  assert.equal(write.key, `fos-short:v1:${codeOf(res.body.link)}`);
  // The value is exactly the sealed token from the fallback link, byte for byte.
  const sealed = res.body.fallbackLink.split('#t=')[1];
  assert.equal(write.value, sealed);
  assert.equal(typeof write.value, 'string', 'a bare string, not an object');
});

test('4. no plaintext client information reaches Redis', async () => {
  const res = await create(MATTER_COMBINED);
  const [write] = store.writes;
  const stored = `${write.key} ${write.value}`;
  for (const secret of ['Test Person', '200000001', 'Test Lender', 'Credit card',
    'a test annual statement', 'March 2020', MODE_TIMEBAR_AND_FOS]) {
    assert.ok(!stored.includes(secret), `Redis must not hold: ${secret}`);
  }
  // It is genuinely the sealed form: unreadable without the encryption key,
  // and it decrypts back to the matter.
  assert.deepEqual(decryptPrefill(write.value), {
    mode: MODE_TIMEBAR_AND_FOS, clientName: 'Test Person', reference: '200000001',
    lender: 'Test Lender', product: 'Credit card',
    communicationEvent: 'a test annual statement', communicationDate: 'March 2020'
  });
  assert.equal(res.statusCode, 200);
});

test('5. the TTL is at most 72 hours and never outlives the sealed token', async () => {
  await create(MATTER_FOS);
  const { ttlSeconds } = store.writes[0];
  assert.ok(ttlSeconds > 0, 'positive');
  assert.ok(ttlSeconds <= 72 * 3600, `${ttlSeconds}s is within 72 hours`);
  assert.ok(ttlSeconds > 71 * 3600, 'and close to it for a freshly minted token');
  assert.equal(shortLink.MAX_TTL_SECONDS, 72 * 3600);
});

test('5b. a shorter prefill expiry shortens the mapping with it', () => {
  const saved = process.env.PREFILL_TTL_HOURS;
  process.env.PREFILL_TTL_HOURS = '2';
  try {
    const token = encryptPrefill(MATTER_FOS);
    const ttl = shortLink.ttlSecondsFor(token);
    assert.ok(ttl <= 2 * 3600 && ttl > 2 * 3600 - 60, `${ttl}s tracks the 2-hour token`);
  } finally {
    if (saved === undefined) delete process.env.PREFILL_TTL_HOURS;
    else process.env.PREFILL_TTL_HOURS = saved;
  }
});

test('5c. a longer prefill expiry is still capped at 72 hours', () => {
  const saved = process.env.PREFILL_TTL_HOURS;
  process.env.PREFILL_TTL_HOURS = '720';
  try {
    const token = encryptPrefill(MATTER_FOS);
    assert.equal(shortLink.ttlSecondsFor(token), 72 * 3600, 'capped, whatever the token says');
  } finally {
    if (saved === undefined) delete process.env.PREFILL_TTL_HOURS;
    else process.env.PREFILL_TTL_HOURS = saved;
  }
});

// ===================== 6-11. resolution ===================================

test('6. a valid short code resolves to the matter', async () => {
  const created = await create(MATTER_FOS);
  const code = codeOf(created.body.link);
  const res = await resolve({ code, reference: '200000001' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.clientName, 'Test Person');
  assert.equal(res.body.data.mode, MODE_FOS_ONLY);
});

test('6b. the same code keeps working - opening a link does not consume it', async () => {
  const created = await create(MATTER_FOS);
  const code = codeOf(created.body.link);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await resolve({ code, reference: '200000001' });
    assert.equal(res.statusCode, 200, `attempt ${attempt} still resolves`);
  }
  assert.equal(store.size, 1, 'the mapping is left in place');
});

test('7. the correct TMS reference unlocks, and the sealed token comes back', async () => {
  const created = await create(MATTER_FOS);
  const res = await resolve({ code: codeOf(created.body.link), reference: '200000001' });
  assert.equal(res.statusCode, 200);
  // Returned only now, after the gate - so the rest of the flow matches legacy.
  assert.equal(typeof res.body.token, 'string');
  assert.deepEqual(decryptPrefill(res.body.token), MATTER_FOS);
});

test('8. an incorrect TMS reference fails, and reveals nothing', async () => {
  const created = await create(MATTER_FOS);
  const code = codeOf(created.body.link);
  const res = await resolve({ code, reference: '299999999' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'Please check the reference');
  assert.equal(res.body.data, undefined);
  assert.equal(res.body.token, undefined, 'no sealed token leaks on failure');
});

test('9. an expired short code fails', async () => {
  const created = await create(MATTER_FOS);
  const code = codeOf(created.body.link);
  store.expire(`fos-short:v1:${code}`);
  const res = await resolve({ code, reference: '200000001' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /invalid or has expired/);
});

test('10. an unknown short code fails', async () => {
  const res = await resolve({ code: 'ZZZZZZZZZZZZZZZZ', reference: '200000001' });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /invalid or has expired/);
});

test('11. a malformed short code fails without ever reaching Redis', async () => {
  const malformed = [
    '', 'short', 'ZZZZZZZZZZZZZZZ', 'ZZZZZZZZZZZZZZZZZ',
    'ILOU000000000000', 'abcdefghijklmnop', '../../etc/passwd',
    'AAAA AAAA AAAA A', 'AAAAAAAAAAAAAAA*', null, 123, {}, []
  ];
  for (const code of malformed) {
    const res = await resolve({ code, reference: '200000001' });
    assert.equal(res.statusCode, 400, `must reject ${JSON.stringify(code)}`);
    assert.match(res.body.error, /invalid or has expired/);
  }
  assert.equal(store.writes.length, 0, 'nothing was written');
});

test('11b. every failure mode answers identically - no code oracle', async () => {
  const created = await create(MATTER_FOS);
  const known = codeOf(created.body.link);
  store.expire(`fos-short:v1:${known}`);

  const answers = [];
  for (const code of [known, 'ZZZZZZZZZZZZZZZZ', 'not-a-code', '']) {
    const res = await resolve({ code, reference: '200000001' });
    answers.push(`${res.statusCode}:${res.body.error}`);
  }
  // Expired, never-existed, malformed and empty are indistinguishable.
  assert.equal(new Set(answers).size, 1, `all identical, got ${JSON.stringify(answers)}`);

  // And so is Redis being down.
  store.fail = true;
  const down = await resolve({ code: 'ABCDEFGHJKMNPQRS', reference: '200000001' });
  assert.equal(`${down.statusCode}:${down.body.error}`, answers[0]);
});

// ===================== 12. rate limiting ==================================

test('12. short-code resolution is rate limited per client', async () => {
  const created = await create(MATTER_FOS);
  const code = codeOf(created.body.link);
  const ip = '10.9.9.9';
  const seen = [];
  for (let i = 0; i < 25; i += 1) {
    const res = await resolve({ code, reference: '200000001' }, { headers: { 'x-forwarded-for': ip } });
    seen.push(res.statusCode);
  }
  assert.ok(seen.includes(429), `the limit engages, saw ${[...new Set(seen)].join(',')}`);
  assert.equal(seen[0], 200, 'but not before a genuine client gets through');
});

// ===================== 13. Redis unavailable ==============================

test('13. Redis being down still issues a questionnaire, on the legacy link', async () => {
  store.fail = true;
  const res = await create(MATTER_FOS);
  assert.equal(res.statusCode, 200, 'staff are not blocked');
  assert.equal(res.body.short, false);
  assert.ok(res.body.link.includes('/#t='), 'the primary link is the legacy one');
  assert.equal(res.body.link, res.body.fallbackLink);
  // And that link works.
  const opened = await resolve({ token: res.body.link.split('#t=')[1], reference: '200000001' });
  assert.equal(opened.statusCode, 200);
});

test('13b. no Redis configuration at all also falls back safely', async () => {
  shortLink._setStore(null);
  const savedEnv = {};
  for (const name of shortLink.URL_VARS.concat(shortLink.TOKEN_VARS)) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
  try {
    assert.equal(shortLink.isConfigured(), false);
    assert.deepEqual(shortLink.configuredVarNames(), { url: null, token: null });
    assert.equal(await shortLink.createShortCode('sealed'), null, 'no throw, just null');
    assert.equal(await shortLink.resolveShortCode('ABCDEFGHJKMNPQRS'), null);

    const res = await create(MATTER_FOS);
    assert.equal(res.statusCode, 200, 'admin link creation still works');
    assert.equal(res.body.short, false);
    assert.ok(res.body.link.includes('/#t='));
  } finally {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    shortLink._setStore(store);
  }
});

test('13c. the read-only token is never used for writes', () => {
  // A read-only token cannot create a link, so it must not be a candidate.
  for (const name of shortLink.URL_VARS.concat(shortLink.TOKEN_VARS)) {
    assert.ok(!/READ_ONLY/i.test(name), `${name} must not be used`);
  }
  const source = fs.readFileSync('lib/short-link.js', 'utf8');
  assert.ok(!source.includes('READ_ONLY_TOKEN'), 'the read-only token is not referenced');
});

test('13d. the variable names this project actually uses are supported first', () => {
  // The Vercel integration used a custom prefix, so these are the names in play.
  assert.equal(shortLink.URL_VARS[0], 'UPSTASH_REDIS_REST_API_URL');
  assert.equal(shortLink.TOKEN_VARS[0], 'UPSTASH_REDIS_REST_API_TOKEN');
  // Standard names still work if the integration is ever re-added plainly.
  assert.ok(shortLink.URL_VARS.includes('UPSTASH_REDIS_REST_URL'));
  assert.ok(shortLink.TOKEN_VARS.includes('UPSTASH_REDIS_REST_TOKEN'));

  const saved = process.env.UPSTASH_REDIS_REST_API_URL;
  process.env.UPSTASH_REDIS_REST_API_URL = 'https://example.invalid';
  try {
    assert.equal(shortLink.configuredVarNames().url, 'UPSTASH_REDIS_REST_API_URL');
  } finally {
    if (saved === undefined) delete process.env.UPSTASH_REDIS_REST_API_URL;
    else process.env.UPSTASH_REDIS_REST_API_URL = saved;
  }
});

// ===================== 14-16. compatibility ===============================

test('14. existing legacy links still work, unchanged', async () => {
  const token = encryptPrefill(MATTER_FOS);
  const res = await resolve({ token, reference: '200000001' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.clientName, 'Test Person');
  // A wrong reference still fails on a legacy link.
  const wrong = await resolve({ token, reference: '299999999' });
  assert.equal(wrong.statusCode, 400);
  assert.equal(wrong.body.error, 'Please check the reference');
});

test('14b. a legacy link is always offered alongside the short one', async () => {
  const res = await create(MATTER_FOS);
  assert.equal(res.body.short, true);
  assert.match(res.body.link, /^https:\/\/example\.test\/q\/[0-9A-HJ-NP-TV-Z]{16}$/);
  assert.ok(res.body.fallbackLink.startsWith('https://example.test/#t='));
  const opened = await resolve({ token: res.body.fallbackLink.split('#t=')[1], reference: '200000001' });
  assert.equal(opened.statusCode, 200, 'the fallback resolves too');
});

test('15. FOS_ONLY resolves through a short link', async () => {
  const created = await create(MATTER_FOS);
  const res = await resolve({ code: codeOf(created.body.link), reference: '200000001' });
  assert.equal(res.body.data.mode, MODE_FOS_ONLY);
  assert.equal(res.body.data.communicationEvent, undefined, 'no Time-Bar fields in FOS-only');
});

test('16. TIMEBAR_AND_FOS resolves through a short link', async () => {
  const created = await create(MATTER_COMBINED);
  const res = await resolve({ code: codeOf(created.body.link), reference: '200000001' });
  assert.equal(res.body.data.mode, MODE_TIMEBAR_AND_FOS);
  assert.equal(res.body.data.communicationEvent, 'a test annual statement');
  assert.equal(res.body.data.communicationDate, 'March 2020');
});

// ===================== 17. logging ========================================

test('17. nothing sensitive can reach a log', () => {
  // Substring matching is the wrong tool here: a marker named
  // fos_short_link_create_failed contains "link" and "code" while carrying no
  // data at all. What matters is that a call takes one literal string and
  // interpolates nothing - then there is no value it could possibly leak.
  const sources = ['lib/short-link.js', 'api/prefill-create.js', 'api/prefill-resolve.js']
    .map((f) => [f, fs.readFileSync(f, 'utf8')]);
  for (const [name, source] of sources) {
    const calls = source.match(/console\s*\.\s*\w+\s*\([\s\S]*?\)/g) || [];
    for (const call of calls) {
      const args = call.slice(call.indexOf('(') + 1, call.lastIndexOf(')')).trim();
      assert.match(args, /^'[a-z0-9_]+'$/,
        `${name}: a console call must take one plain literal, got ${args.slice(0, 60)}`);
      assert.ok(!call.includes('${') && !call.includes('`'), `${name}: no interpolation`);
      assert.ok(!call.includes('+'), `${name}: no concatenation`);
    }
  }
  // Redis credentials are read in exactly one place and never widened.
  const shortLinkSource = fs.readFileSync('lib/short-link.js', 'utf8');
  assert.equal((shortLinkSource.match(/process\.env\[name\]/g) || []).length, 1,
    'credentials are read through one lookup');
  assert.ok(!/console[\s\S]{0,80}process\.env/.test(shortLinkSource),
    'no environment value is ever passed to a log');
});

test('17b. short-link failures log a bare marker and nothing else', () => {
  const source = fs.readFileSync('lib/short-link.js', 'utf8');
  const calls = source.match(/console\s*\.\s*\w+\s*\([^)]*\)/g) || [];
  assert.deepEqual(calls, [
    "console.warn('fos_short_link_create_failed')",
    "console.warn('fos_short_link_resolve_failed')"
  ], 'a fixed string each, with no interpolation');
});

test('17c. a caught Redis error is never surfaced or rethrown', async () => {
  store.fail = true;
  // Both sides swallow and fall back rather than propagating a message that
  // could name a host or a credential.
  assert.equal(await shortLink.createShortCode('sealed-token'), null);
  assert.equal(await shortLink.resolveShortCode('ABCDEFGHJKMNPQRS'), null);
  const res = await resolve({ code: 'ABCDEFGHJKMNPQRS', reference: '200000001' });
  assert.match(res.body.error, /invalid or has expired/);
  assert.ok(!JSON.stringify(res.body).includes('redis'));
});

// ===================== 18. CSRF and origin ================================

test('18. CSRF and origin checks still guard both endpoints', async () => {
  const created = await create(MATTER_FOS);
  const code = codeOf(created.body.link);
  const cases = [
    ['create, foreign origin', () => create(MATTER_FOS, { headers: { origin: 'https://attacker.test' } })],
    ['create, no CSRF', () => create(MATTER_FOS, { headers: { 'x-csrf-token': '' } })],
    ['create, no admin key', () => create(MATTER_FOS, { headers: { 'x-admin-key': '' } })],
    ['resolve, foreign origin', () => resolve({ code, reference: '200000001' }, { headers: { origin: 'https://attacker.test' } })],
    ['resolve, no CSRF', () => resolve({ code, reference: '200000001' }, { headers: { 'x-csrf-token': '' } })],
    ['resolve, mismatched CSRF cookie', () => resolve({ code, reference: '200000001' }, { headers: { cookie: 'tms_csrf=wrong' } })]
  ];
  for (const [name, run] of cases) {
    const res = await run();
    assert.equal(res.statusCode, 403, `${name} must be refused`);
  }
});

test('18b. a short link cannot be minted without the admin key', async () => {
  const res = await create(MATTER_FOS, { headers: { 'x-admin-key': 'wrong-key' } });
  assert.equal(res.statusCode, 403);
  assert.equal(store.writes.length, 0, 'and nothing was written to Redis');
});

test('18c. the responses are never cached', async () => {
  const created = await create(MATTER_FOS);
  assert.equal(created.headers['Cache-Control'], 'no-store');
  const opened = await resolve({ code: codeOf(created.body.link), reference: '200000001' });
  assert.equal(opened.headers['Cache-Control'], 'no-store');
});

// ===================== 19. routing and layout =============================

test('19. /q/<code> serves the existing client page', () => {
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  // Vercel matches rewrites with path-to-regexp named parameters, and this is a
  // static site with cleanUrls, so the destination is the root rather than a
  // file path - the SPA form Vercel documents. Both halves are pinned because
  // a wrong pattern or destination fails only in production, as a 404 on
  // /q/<code> while /admin and the headers carry on working.
  const rewrite = vercel.rewrites.find((r) => r.source === '/q/:code');
  assert.ok(rewrite, 'the short path is rewritten with a named parameter');
  assert.ok(!vercel.rewrites.some((r) => /\(\.\*\)/.test(r.source)),
    'no raw regex group: it silently fails to match on Vercel');
  assert.equal(rewrite.destination, '/', 'served from the root, which already serves the client app');
  // The dev server mirrors it, so the flow can be exercised locally.
  assert.match(fs.readFileSync('dev-server.js', 'utf8'), /\/\^\\\/q\\\/\[\^\/\]\+\$\//);
  // Security headers still apply to every path.
  const headers = vercel.headers.find((h) => h.source === '/(.*)');
  assert.ok(headers, 'headers cover /q/<code> as well');
  const keys = headers.headers.map((h) => h.key);
  for (const required of ['Content-Security-Policy', 'X-Frame-Options', 'Referrer-Policy',
    'X-Robots-Tag', 'Cache-Control', 'X-Content-Type-Options']) {
    assert.ok(keys.includes(required), `${required} still set`);
  }
});

test('19b. the client page is unchanged, so mobile layout is unaffected', () => {
  const html = fs.readFileSync('public/index.html', 'utf8');
  const css = fs.readFileSync('public/styles.css', 'utf8');
  // No markup or styling was added for short links: the same page is served.
  assert.ok(!/short|q\//i.test(html.slice(0, html.indexOf('<form'))), 'no short-link chrome added');
  assert.match(html, /<meta name="viewport"/);
  const offenders = [...css.matchAll(/(?:^|[;{]|\s)(min-width|width)\s*:\s*(\d+)px/g)]
    .filter((m) => Number(m[2]) > 320);
  assert.deepEqual(offenders.map((m) => `${m[1]}: ${m[2]}px`), [], 'nothing pinned wider than 320px');
});

test('19c. the client reads the code from the path and keeps it in the address bar', () => {
  const app = fs.readFileSync('public/app.js', 'utf8');
  assert.match(app, /function codeFromPath/);
  assert.match(app, /\^\\\/q\\\/\(\[0-9A-HJ-NP-TV-Z\]\{16\}\)/, 'matches the generated format');
  // The code is opaque, so unlike the sealed token it is not stripped from the
  // URL - the client can reopen the same link during its 72 hours.
  const fn = app.slice(app.indexOf('function codeFromPath'), app.indexOf('function currentStep'));
  assert.ok(!fn.includes('replaceState'), 'the short code stays in the address bar');
  // The reference gate is still what unlocks the matter.
  assert.match(app, /state\.shortCode\s*\n?\s*\?\s*\{ code: state\.shortCode, reference \}/);
});

// ===================== 20-21. email and delivery ==========================

test('20. email generation is untouched by short links', () => {
  for (const file of ['lib/email-template.js', 'lib/questions-fos.js', 'lib/questions-timebar.js', 'lib/questions.js']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(!/short-link|shortCode|fos-short/i.test(source), `${file} knows nothing about short links`);
  }
  // And the record still builds identically from a short-link submission.
  const { buildEmail, FORMAT_VERSION } = require('../lib/email-template');
  const { VULNERABILITY_NONE } = require('../lib/questions-fos');
  const data = {
    ...MATTER_FOS, fosVulnerabilities: [VULNERABILITY_NONE],
    fosCourtAction: 'No', fosLendingStart: '2015-06-01', fosLendingAmount: '5000',
    fosBalancesPaid: 'Yes', fosSavings: 'No', fosDependants: 'No', fosFurtherLending: 'No'
  };
  const { text } = buildEmail(data, { submissionId: 'x', completedAt: '2026-09-16T12:00:00+01:00' });
  assert.equal(FORMAT_VERSION, 'TMS-FOS-V1');
  assert.match(text, /^Format: TMS-FOS-V1$/m);
  assert.match(text, /^Questionnaire mode: FOS_ONLY$/m);
  assert.ok(!text.includes('/q/'), 'no link of any kind appears in the record');
});

test('21. Gmail delivery is untouched', () => {
  const mail = fs.readFileSync('lib/mail.js', 'utf8');
  const submit = fs.readFileSync('api/submit.js', 'utf8');
  for (const source of [mail, submit]) {
    assert.ok(!/short-link|shortCode|fos-short|upstash|redis/i.test(source),
      'the delivery path knows nothing about short links');
  }
  const { SUBJECT } = require('../lib/mail');
  assert.equal(SUBJECT, 'FOS Questionnaire Answers');
  // Submission still accepts only the sealed token, never a short code.
  const { FOS_FIELDS, COMMON_FIELDS, TIMEBAR_FIELDS } = require('../lib/validation');
  const all = COMMON_FIELDS.concat(FOS_FIELDS, TIMEBAR_FIELDS);
  assert.ok(all.includes('prefillToken'));
  for (const field of ['code', 'shortCode', 'short']) {
    assert.ok(!all.includes(field), `${field} is not a submission field`);
  }
});

// ===================== origin configuration ===============================

test('SHORT_LINK_ORIGIN overrides the link origin without touching anything else', async () => {
  const saved = process.env.SHORT_LINK_ORIGIN;
  process.env.SHORT_LINK_ORIGIN = 'https://q.moneysolicitor.com';
  try {
    const res = await create(MATTER_FOS);
    assert.match(res.body.link, /^https:\/\/q\.moneysolicitor\.com\/q\/[0-9A-HJ-NP-TV-Z]{16}$/);
    // The fallback still points at the app itself, which is where it must work.
    assert.ok(res.body.fallbackLink.startsWith('https://example.test/#t='));
  } finally {
    if (saved === undefined) delete process.env.SHORT_LINK_ORIGIN;
    else process.env.SHORT_LINK_ORIGIN = saved;
  }
});

test('SHORT_LINK_ORIGIN defaults to APP_ORIGIN and tolerates a trailing slash', () => {
  const saved = process.env.SHORT_LINK_ORIGIN;
  delete process.env.SHORT_LINK_ORIGIN;
  try {
    assert.equal(shortLink.shortLinkOrigin('https://example.test'), 'https://example.test');
    process.env.SHORT_LINK_ORIGIN = 'https://q.moneysolicitor.com/';
    assert.equal(shortLink.shortLinkUrl('https://ignored.test', 'ABCDEFGHJKMNPQRS'),
      'https://q.moneysolicitor.com/q/ABCDEFGHJKMNPQRS');
  } finally {
    if (saved === undefined) delete process.env.SHORT_LINK_ORIGIN;
    else process.env.SHORT_LINK_ORIGIN = saved;
  }
});
