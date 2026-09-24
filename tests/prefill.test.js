const test=require('node:test'); const assert=require('node:assert/strict');
process.env.PREFILL_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64'); process.env.PREFILL_TTL_HOURS='1';
const {encryptPrefill,decryptPrefill}=require('../lib/prefill');
test('prefill round trip',()=>{const p={reference:'234567890',clientName:'Jane Example'};const t=encryptPrefill(p);assert.doesNotMatch(t,/Jane|234567890/);assert.deepEqual(decryptPrefill(t),p);});
test('tampered token rejected',()=>{const t=encryptPrefill({reference:'234567890'});const i=Math.floor(t.length/2);const c=t[i]==='A'?'B':'A';const bad=t.slice(0,i)+c+t.slice(i+1);assert.throws(()=>decryptPrefill(bad));});

// Regression: a non-numeric PREFILL_TTL_HOURS produced NaN, JSON.stringify
// wrote it as null, and every issued link was rejected on arrival.
const { ttlHours, DEFAULT_TTL_HOURS, MAX_TTL_HOURS, prefillExpiry } = require('../lib/prefill');

function withTtl(value, fn) {
  const saved = process.env.PREFILL_TTL_HOURS;
  if (value === undefined) delete process.env.PREFILL_TTL_HOURS;
  else process.env.PREFILL_TTL_HOURS = value;
  try { fn(); }
  finally { if (saved === undefined) delete process.env.PREFILL_TTL_HOURS; else process.env.PREFILL_TTL_HOURS = saved; }
}

test('a non-numeric TTL falls back to the approved default, never NaN', () => {
  for (const bad of ['seventy-two', '72 hours', '72h', 'null', 'NaN', '', '  ', undefined, '-5', '0']) {
    withTtl(bad, () => {
      assert.equal(ttlHours(), DEFAULT_TTL_HOURS, `TTL ${JSON.stringify(bad)} must fall back to the default`);
      const token = encryptPrefill({ reference: '234567890' });
      // the decisive check: the link must still resolve
      assert.deepEqual(decryptPrefill(token), { reference: '234567890' });
    });
  }
});

test('a valid TTL is honoured and clamped to sane bounds', () => {
  withTtl('72', () => assert.equal(ttlHours(), 72));
  withTtl('1', () => assert.equal(ttlHours(), 1));
  withTtl('99999', () => assert.equal(ttlHours(), 720));
});

// Approved 2026-09-24: a new link lasts 30 days.
test('the default link expiry is 30 days', () => {
  assert.equal(DEFAULT_TTL_HOURS, 720, '720 hours');
  assert.equal(MAX_TTL_HOURS, 720, 'and that is also the ceiling a configured value is clamped to');
  withTtl(undefined, () => assert.equal(ttlHours(), 720, 'an unconfigured deployment issues 30-day links'));
});

test('a sealed token minted with the default is valid for 30 days', () => {
  withTtl(undefined, () => {
    const token = encryptPrefill({ reference: '234567890' });
    const expiry = prefillExpiry(token);
    const days = (expiry - Date.now()) / 86400000;
    assert.ok(days > 29.99 && days <= 30, `${days} days`);
    // And it still resolves, which is the answer that matters to a client.
    assert.deepEqual(decryptPrefill(token), { reference: '234567890' });
  });
});

test('the issued envelope always carries a finite numeric expiry', () => {
  withTtl('not-a-number', () => {
    const crypto = require('node:crypto');
    const token = encryptPrefill({ reference: '234567890' });
    const buf = Buffer.from(token, 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(process.env.PREFILL_ENCRYPTION_KEY, 'base64'), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    const env = JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString());
    assert.equal(typeof env.exp, 'number', 'exp must be a number, never null');
    assert.ok(Number.isFinite(env.exp) && env.exp > Date.now(), 'exp must be a finite future timestamp');
  });
});
