const crypto = require('crypto');

function encryptionKey() {
  const raw = process.env.PREFILL_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('Missing PREFILL_ENCRYPTION_KEY');
    return crypto.createHash('sha256').update('development-prefill-key').digest();
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('PREFILL_ENCRYPTION_KEY must decode to 32 bytes');
  return key;
}

// 30 days. Approved 2026-09-24: a client link stayed live for three days,
// which was routinely too short - a client who opened the text a week later
// had to ask for a new link, and staff had to reissue. The cap and the default
// are the same number and are stated once here, so the sealed token, the short
// link and the configuration can never disagree about what 30 days means.
const MAX_TTL_HOURS = 720;
const DEFAULT_TTL_HOURS = MAX_TTL_HOURS;

// A non-numeric PREFILL_TTL_HOURS used to produce NaN here, and JSON.stringify
// writes NaN as null, so every link was minted with exp:null and rejected on
// arrival. It failed safe rather than open, but it silently broke every client
// link. Anything not a finite positive number now falls back to the approved
// default instead of poisoning the envelope.
function ttlHours() {
  const raw = Number(process.env.PREFILL_TTL_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_HOURS;
  return Math.max(1, Math.min(MAX_TTL_HOURS, raw));
}

function encryptPrefill(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const exp = Date.now() + ttlHours() * 3600000;
  if (!Number.isFinite(exp)) throw new Error('Invalid prefill expiry');
  const envelope = JSON.stringify({ v: 1, exp, data: payload });
  const encrypted = Buffer.concat([cipher.update(envelope, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptPrefill(token) {
  const buf = Buffer.from(String(token || ''), 'base64url');
  if (buf.length < 29 || buf.length > 6000) throw new Error('Invalid token');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  const raw = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  const envelope = JSON.parse(raw);
  if (envelope.v !== 1 || !envelope.exp || envelope.exp < Date.now()) throw new Error('Expired token');
  return envelope.data;
}

// The expiry stamped inside a sealed token, or null if it cannot be read.
// Used to bound a short link's lifetime to the token it points at, so a
// mapping can never outlive the thing it resolves to. Returns the expiry only
// - never the payload - and never throws.
function prefillExpiry(token) {
  try {
    const buf = Buffer.from(String(token || ''), 'base64url');
    if (buf.length < 29 || buf.length > 6000) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const raw = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
    const exp = JSON.parse(raw).exp;
    return Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

module.exports = { encryptPrefill, decryptPrefill, prefillExpiry, ttlHours, DEFAULT_TTL_HOURS, MAX_TTL_HOURS };
