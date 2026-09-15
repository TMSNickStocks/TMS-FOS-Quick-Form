// Mode-aware assembly of the questionnaire.
//
// Two modes exist and nothing else is accepted anywhere in the app:
//
//   FOS_ONLY          the client answers the FOS questionnaire only.
//   TIMEBAR_AND_FOS   the client answers the approved Time-Bar questionnaire
//                     first, then the FOS questionnaire.
//
// The mode is chosen by staff, sealed inside the encrypted prefill token, and
// re-checked server side on submission. It is never taken from client input
// alone, so a client cannot switch questionnaire by editing a request.

const { TIMEBAR_QUESTIONS, Q2_CONTEXT_PREFIX, Q2_CONTEXT_MIDDLE, q2RecordsSentence } = require('./questions-timebar');
const { FOS_QUESTIONS } = require('./questions-fos');

const MODE_FOS_ONLY = 'FOS_ONLY';
const MODE_TIMEBAR_AND_FOS = 'TIMEBAR_AND_FOS';
const MODES = [MODE_FOS_ONLY, MODE_TIMEBAR_AND_FOS];

const MODE_LABELS = {
  [MODE_FOS_ONLY]: 'FOS questionnaire only',
  [MODE_TIMEBAR_AND_FOS]: 'Time-Bar + FOS questionnaire'
};

function isCombined(mode) {
  return mode === MODE_TIMEBAR_AND_FOS;
}

// The Time-Bar-specific matter details. Collected, shown and recorded only in
// combined mode; in FOS-only mode they are never requested and must be empty.
const TIMEBAR_ADMIN_FIELDS = [
  ['Lender communication/event', 'communicationEvent'],
  ['Lender event date', 'communicationDate']
];

const BASE_ADMIN_FIELDS = [
  ['Client name', 'clientName'],
  ['TMS reference', 'reference'],
  ['Lender', 'lender'],
  ['Product', 'product']
];

function adminFields(mode) {
  return isCombined(mode) ? BASE_ADMIN_FIELDS.concat(TIMEBAR_ADMIN_FIELDS) : BASE_ADMIN_FIELDS.slice();
}

// The Time-Bar blocks that applied to this client, in the order answered.
// Empty in FOS-only mode, so the Time-Bar section is omitted completely.
function timebarBlocks(data) {
  if (!isCombined(data.mode)) return [];
  return TIMEBAR_QUESTIONS.filter((q) => q.applies(data));
}

function fosBlocks(data) {
  return FOS_QUESTIONS.filter((q) => q.applies(data));
}

// Approved confirmation wording, carried over unchanged from the live
// Time-Bar Quick Form and used in both modes.
const CONFIRMATION_HEADING = 'Customer confirmation';
const CONFIRMATION_STATEMENT = 'I confirm that these answers are my own and reflect, to the best of my recollection, what I genuinely knew and understood at the relevant time.';

module.exports = {
  MODE_FOS_ONLY, MODE_TIMEBAR_AND_FOS, MODES, MODE_LABELS, isCombined,
  adminFields, BASE_ADMIN_FIELDS, TIMEBAR_ADMIN_FIELDS,
  timebarBlocks, fosBlocks,
  CONFIRMATION_HEADING, CONFIRMATION_STATEMENT,
  Q2_CONTEXT_PREFIX, Q2_CONTEXT_MIDDLE, q2RecordsSentence
};
