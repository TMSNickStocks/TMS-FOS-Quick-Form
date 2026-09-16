const { decryptPrefill } = require('../lib/prefill');
const { reference } = require('../lib/validation');
const { resolveShortCode } = require('../lib/short-link');
const { originAllowed, csrfValid, timingSafeEqualText, clientIp, hmac } = require('../lib/security');
const { allow } = require('../lib/rate-limit');

// Every failure answers with exactly this, whatever went wrong: an unknown
// code, an expired one, a malformed one, a sealed token that will not decrypt,
// or Redis being unreachable. A client can never learn from the response
// whether a code ever existed.
const GENERIC_FAILURE = 'This link is invalid or has expired. Please ask TMS Legal to send a new link.';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!originAllowed(req) || !csrfValid(req)) return res.status(403).json({ error: 'Request not allowed' });
  // One keyed limit covers both link kinds: resolving a short code is the same
  // operation with a single lookup in front of it.
  if (!allow(`resolve:${hmac(clientIp(req))}`, 20, 15 * 60 * 1000).ok) return res.status(429).json({ error: 'Please try again later' });

  const ref = reference(req.body?.reference);
  if (ref.error) return res.status(400).json({ error: 'Please check the reference' });

  // A short link carries a code; a legacy link carries the sealed token
  // itself. The code is exchanged for that same sealed token here, so from the
  // next line on the two are indistinguishable and follow one path.
  let sealed = req.body?.token;
  if (req.body?.code !== undefined) {
    sealed = await resolveShortCode(req.body.code);
    if (!sealed) return res.status(400).json({ error: GENERIC_FAILURE });
  }

  try {
    const data = decryptPrefill(sealed);
    if (!timingSafeEqualText(data.reference, ref.value)) return res.status(400).json({ error: 'Please check the reference' });
    res.setHeader('Cache-Control', 'no-store');
    // The sealed token goes back to the browser only now, after the reference
    // gate has passed, so the rest of the questionnaire runs exactly as it does
    // for a legacy link. On a short link that is strictly later exposure than
    // before: the token used to sit in the URL from the very first click.
    return res.status(200).json({ data, token: sealed });
  } catch {
    return res.status(400).json({ error: GENERIC_FAILURE });
  }
};
