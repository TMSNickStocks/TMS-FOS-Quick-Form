const { validateSubmission } = require('../lib/validation');
const { decryptPrefill } = require('../lib/prefill');
const { isCombined } = require('../lib/questions');
const { buildEmail } = require('../lib/email-template');
const { sendMail } = require('../lib/mail');
const { originAllowed, csrfValid, timingSafeEqualText, clientIp, requestId } = require('../lib/security');
const { allow, submissionRateKeys } = require('../lib/rate-limit');

module.exports = async function handler(req, res) {
  const rid = requestId();
  const started = Date.now();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!originAllowed(req) || !csrfValid(req)) return res.status(403).json({ error: 'Request not allowed' });
  const bodySize = Number(req.headers['content-length'] || 0);
  if (bodySize > 32768) return res.status(413).json({ error: 'Submission too large' });

  const result = validateSubmission(req.body || {});
  if (!result.ok) return res.status(400).json({ error: 'Please check your answers', fields: result.errors });

  // Unlike the Time-Bar form, a staff-issued link is mandatory here. The
  // questionnaire mode decides which questions are asked and which sections
  // appear in the evidence record, so it is only ever read from the sealed
  // token - never from whatever the browser posted.
  if (!result.value.prefillToken) {
    return res.status(400).json({ error: 'This questionnaire must be opened from the link TMS Legal sent you.' });
  }

  let sealed;
  try {
    sealed = decryptPrefill(result.value.prefillToken);
  } catch {
    return res.status(400).json({ error: 'This link is invalid or has expired. Please ask TMS Legal to send a new link.' });
  }

  const sameBase = timingSafeEqualText(sealed.reference, result.value.reference)
    && sealed.mode === result.value.mode
    && sealed.clientName === result.value.clientName
    && sealed.lender === result.value.lender
    && sealed.product === result.value.product;
  // In FOS-only mode the sealed token carries no lender event, and the
  // validator has already rejected those fields as unknown, so there is
  // nothing to compare.
  const sameEvent = !isCombined(sealed.mode)
    || (sealed.communicationEvent === result.value.communicationEvent
      && sealed.communicationDate === result.value.communicationDate);
  if (!sameBase || !sameEvent) {
    return res.status(400).json({ error: 'The pre-populated details could not be verified. Please ask TMS Legal to send a new link.' });
  }

  const keys = submissionRateKeys(clientIp(req), result.value.reference);
  if (!allow(keys.ip, 8, 15 * 60 * 1000).ok || !allow(keys.ref, 5, 60 * 60 * 1000).ok) {
    return res.status(429).json({ error: 'Please wait before trying again' });
  }

  try {
    const email = buildEmail(result.value, { submissionId: rid });
    const sent = await sendMail(email);
    if (!sent?.id) throw new Error('No provider id');
    // messageId is the mail provider's own identifier. It carries no client
    // data and is not a credential; it is logged so a submission can be tied
    // to a delivered message for audit without logging anything about the
    // client or the email body. The questionnaire mode is logged because it
    // identifies which record shape was sent, and reveals nothing about the
    // client or their answers.
    console.info('fos_submission_ok', {
      requestId: rid, messageId: sent.id, mode: result.value.mode,
      delivery: 'accepted', durationMs: Date.now() - started
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, requestId: rid });
  } catch {
    console.error('fos_submission_failed', { requestId: rid, delivery: 'failed', durationMs: Date.now() - started });
    return res.status(502).json({ error: 'We could not confirm receipt. Please try again later.' });
  }
};
