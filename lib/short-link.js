// Short client links.
//
// Staff used to hand a client a URL carrying the whole sealed prefill token -
// several hundred characters, awkward to send by text and easy to truncate.
// A short link replaces it with an opaque code that resolves, server side, to
// exactly the same sealed token:
//
//   https://<origin>/q/K7P4X9M2TQ6BW8DF   ->   Redis   ->   sealed token
//
// The indirection is all this module adds. Nothing about the sealed token, the
// 72-hour expiry, the reference gate or the questionnaire changes: once the
// code has been exchanged for the token, the flow is byte-identical to the
// legacy one, and the legacy links keep working.
//
// What is stored is the sealed token and nothing else. Redis never sees a
// client name, reference, lender, product or answer - those live encrypted
// inside the token, which is useless without PREFILL_ENCRYPTION_KEY and still
// requires the client to enter their reference.

const crypto = require('crypto');
const { ttlHours, prefillExpiry } = require('./prefill');

const KEY_PREFIX = 'fos-short:v1:';

// Redis may hold a code for at most 72 hours, and never longer than the sealed
// token it points at: an expired token would fail anyway, and leaving the
// mapping behind would keep answering "that code exists".
const MAX_TTL_SECONDS = 72 * 3600;

// Crockford base32: no I, L, O or U, so a code can be read aloud or retyped
// without the usual 1/I and 0/O confusion. 16 characters at 5 bits each is 80
// bits of entropy, comfortably above the 72-bit floor.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 16;
const CODE_BITS = CODE_LENGTH * 5;
const CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

// The Vercel Upstash integration was added with a custom prefix, so the
// standard UPSTASH_REDIS_REST_URL / _TOKEN names are not what it created. Each
// candidate list is tried in order and the first name that is set wins, so the
// app works whichever naming the integration used without anything being
// renamed or duplicated.
//
// The read-only token is deliberately absent: creating a link is a write.
const URL_VARS = [
  'UPSTASH_REDIS_REST_API_URL',   // the custom-prefixed name in this project
  'UPSTASH_REDIS_REST_URL',       // Upstash default
  'KV_REST_API_URL'               // Vercel KV naming
];
const TOKEN_VARS = [
  'UPSTASH_REDIS_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_TOKEN',
  'KV_REST_API_TOKEN'
];

function firstSet(names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return { name, value: value.trim() };
  }
  return null;
}

// Which variable NAMES are in use. Values are never returned, logged or
// exposed; this exists so configuration can be diagnosed without them.
function configuredVarNames() {
  const url = firstSet(URL_VARS);
  const token = firstSet(TOKEN_VARS);
  return { url: url ? url.name : null, token: token ? token.name : null };
}

function isConfigured() {
  const { url, token } = configuredVarNames();
  return Boolean(url && token);
}

// --- the store ------------------------------------------------------------
// A tiny get/set interface rather than the Upstash client directly, so the
// short-link rules can be tested without a network and without credentials.

let injectedStore = null;
let cachedStore = null;

function upstashStore() {
  const url = firstSet(URL_VARS);
  const token = firstSet(TOKEN_VARS);
  if (!url || !token) return null;
  // Required lazily: a deployment with no Redis configured never loads it.
  const { Redis } = require('@upstash/redis');
  const redis = new Redis({ url: url.value, token: token.value });
  return {
    async set(key, value, ttlSeconds) { await redis.set(key, value, { ex: ttlSeconds }); },
    async get(key) { return redis.get(key); }
  };
}

function store() {
  if (injectedStore) return injectedStore;
  if (cachedStore === null) cachedStore = upstashStore() || false;
  return cachedStore || null;
}

// Test seam. Pass a { set, get } object to stand in for Redis, or null to
// restore the real client.
function _setStore(fake) {
  injectedStore = fake;
  cachedStore = null;
}

// --- codes ----------------------------------------------------------------

// Uniform over the alphabet: five bits are taken at a time from random bytes
// and the alphabet is exactly 2^5 long, so there is no modulo bias and no
// value has to be rejected and retried.
function generateCode() {
  const bytes = crypto.randomBytes(Math.ceil((CODE_BITS + 7) / 8));
  let bits = 0;
  let pool = 0;
  let out = '';
  for (const byte of bytes) {
    pool = (pool << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < CODE_LENGTH) {
      bits -= 5;
      out += ALPHABET[(pool >> bits) & 31];
    }
  }
  return out;
}

function isValidCode(code) {
  return typeof code === 'string' && CODE_PATTERN.test(code);
}

function keyFor(code) {
  return `${KEY_PREFIX}${code}`;
}

// How long the mapping may live: never past the sealed token it points at, and
// never more than 72 hours whatever the token says.
function ttlSecondsFor(sealedToken) {
  let remaining = ttlHours() * 3600;
  const expiry = prefillExpiry(sealedToken);
  if (Number.isFinite(expiry)) remaining = Math.floor((expiry - Date.now()) / 1000);
  return Math.max(1, Math.min(MAX_TTL_SECONDS, remaining));
}

// --- create and resolve ---------------------------------------------------

// Returns a code, or null if Redis is unavailable or misconfigured. Never
// throws: staff must still be able to issue a questionnaire when Redis is
// down, falling back to the legacy long link.
async function createShortCode(sealedToken) {
  if (typeof sealedToken !== 'string' || !sealedToken) return null;
  const s = store();
  if (!s) return null;
  const code = generateCode();
  try {
    await s.set(keyFor(code), sealedToken, ttlSecondsFor(sealedToken));
    return code;
  } catch {
    // Deliberately opaque: the reason may name a host or a credential.
    console.warn('fos_short_link_create_failed');
    return null;
  }
}

// Returns the sealed token, or null for anything that does not resolve -
// unknown, expired, malformed, or Redis unreachable. The caller must answer
// all of those identically, so a client can never learn whether a code existed.
async function resolveShortCode(code) {
  if (!isValidCode(code)) return null;
  const s = store();
  if (!s) return null;
  try {
    const value = await s.get(keyFor(code));
    return typeof value === 'string' && value ? value : null;
  } catch {
    console.warn('fos_short_link_resolve_failed');
    return null;
  }
}

// The origin short links are built on. Defaults to APP_ORIGIN, so pointing
// links at q.moneysolicitor.com later is a configuration change, not a
// redesign.
function shortLinkOrigin(fallbackOrigin) {
  const configured = String(process.env.SHORT_LINK_ORIGIN || '').trim();
  return (configured || fallbackOrigin || '').replace(/\/+$/, '');
}

function shortLinkUrl(origin, code) {
  return `${shortLinkOrigin(origin)}/q/${code}`;
}

module.exports = {
  createShortCode, resolveShortCode, generateCode, isValidCode,
  shortLinkOrigin, shortLinkUrl, ttlSecondsFor, keyFor,
  isConfigured, configuredVarNames,
  KEY_PREFIX, MAX_TTL_SECONDS, CODE_LENGTH, CODE_BITS, ALPHABET, CODE_PATTERN,
  URL_VARS, TOKEN_VARS,
  _setStore
};
