const crypto = require('crypto');
const { csrfCookieValue, originAllowed } = require('../lib/security');
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!originAllowed(req)) return res.status(403).json({ error: 'Request not allowed' });
  const token = crypto.randomBytes(24).toString('base64url');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const cookieName = process.env.NODE_ENV === 'production' ? '__Host-tms_csrf' : 'tms_csrf';
  res.setHeader('Set-Cookie', `${cookieName}=${csrfCookieValue(token)}; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=3600`);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ token });
};
