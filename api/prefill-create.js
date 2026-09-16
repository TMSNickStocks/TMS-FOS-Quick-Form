const { validateAdmin } = require('../lib/validation');
const { encryptPrefill } = require('../lib/prefill');
const { createShortCode, shortLinkUrl } = require('../lib/short-link');
const { originAllowed, timingSafeEqualText, csrfValid, clientIp, hmac } = require('../lib/security');
const { allow } = require('../lib/rate-limit');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!originAllowed(req) || !csrfValid(req)) return res.status(403).json({ error: 'Request not allowed' });
  const configured = process.env.ADMIN_ACCESS_KEY || '';
  const supplied = String(req.headers['x-admin-key'] || '');
  if (!configured || !timingSafeEqualText(configured, supplied)) return res.status(403).json({ error: 'Request not allowed' });
  if (!allow(`admin:${hmac(clientIp(req))}`, 20, 15 * 60 * 1000).ok) return res.status(429).json({ error: 'Please try again later' });
  const body = req.body || {};
  const result = validateAdmin(body);
  if (!result.ok) return res.status(400).json({ error: 'Please check the form', fields: result.errors });
  const token = encryptPrefill(result.value);
  const origin = process.env.APP_ORIGIN || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
  const legacyLink = `${origin}/#t=${token}`;

  // A short link is an improvement, not a dependency. If Redis is unavailable
  // or unconfigured, createShortCode returns null and staff are handed the
  // legacy link instead: they can still issue the questionnaire, and beyond
  // the first click the client experience is identical either way.
  const code = await createShortCode(token);
  const link = code ? shortLinkUrl(origin, code) : legacyLink;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    link,
    // Always supplied, so staff have something to fall back on if a short link
    // is mangled or blocked in transit.
    fallbackLink: legacyLink,
    short: Boolean(code)
  });
};
