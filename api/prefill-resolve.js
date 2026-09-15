const { decryptPrefill } = require('../lib/prefill');
const { reference } = require('../lib/validation');
const { originAllowed, csrfValid, timingSafeEqualText, clientIp, hmac } = require('../lib/security');
const { allow } = require('../lib/rate-limit');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!originAllowed(req) || !csrfValid(req)) return res.status(403).json({ error: 'Request not allowed' });
  if (!allow(`resolve:${hmac(clientIp(req))}`, 20, 15 * 60 * 1000).ok) return res.status(429).json({ error: 'Please try again later' });
  const ref = reference(req.body?.reference);
  if (ref.error) return res.status(400).json({ error: 'Please check the reference' });
  try {
    const data = decryptPrefill(req.body?.token);
    if (!timingSafeEqualText(data.reference, ref.value)) return res.status(400).json({ error: 'Please check the reference' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ data });
  } catch {
    return res.status(400).json({ error: 'This link is invalid or has expired. Please ask TMS Legal to send a new link.' });
  }
};
