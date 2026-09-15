const crypto = require('crypto');

function getOrigin(req) {
  return String(req.headers?.origin || '');
}

function expectedOrigin() {
  return process.env.APP_ORIGIN || '';
}

function originAllowed(req) {
  const expected = expectedOrigin();
  const origin = getOrigin(req);
  if (!expected) return process.env.NODE_ENV !== 'production';
  if (origin) return origin === expected;
  try {
    const expectedUrl = new URL(expected);
    const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '');
    const fetchSite = String(req.headers?.['sec-fetch-site'] || '');
    return host === expectedUrl.host && (!fetchSite || fetchSite === 'same-origin' || fetchSite === 'same-site');
  } catch {
    return false;
  }
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function hmac(value) {
  const key = process.env.SECURITY_HMAC_KEY || 'development-only-not-for-production';
  return crypto.createHmac('sha256', key).update(String(value)).digest('base64url');
}

function timingSafeEqualText(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function csrfCookieValue(token) {
  return hmac(`csrf:${token}`);
}

function csrfValid(req) {
  const token = String(req.headers?.['x-csrf-token'] || '');
  if (!token || token.length > 200) return false;
  const cookies = parseCookies(req.headers?.cookie);
  const cookie = cookies['__Host-tms_csrf'] || cookies['tms_csrf'];
  if (!cookie) return false;
  return timingSafeEqualText(cookie, csrfCookieValue(token));
}

function requestId() {
  return crypto.randomBytes(10).toString('base64url');
}

function clientIp(req) {
  const fwd = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String(req.socket?.remoteAddress || 'unknown');
}

module.exports = { originAllowed, parseCookies, hmac, timingSafeEqualText, csrfCookieValue, csrfValid, requestId, clientIp };
