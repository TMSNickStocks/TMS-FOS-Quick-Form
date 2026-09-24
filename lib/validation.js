const { MODES, MODE_FOS_ONLY, MODE_TIMEBAR_AND_FOS, isCombined } = require('./questions');
const { hasAwarenessDate } = require('./questions-timebar');
const {
  VULNERABILITY_VALUES, VULNERABILITY_NONE, YES_NO, UNKNOWN_DATE_LABEL,
  UNKNOWN_LABEL, VULNERABILITY_DECLINE_LABEL, categorySelected, VULNERABILITY_DETAILS,
  INCOME_ROWS, OUTGOING_ROWS
} = require('./questions-fos');

const PRODUCTS = ['Credit card', 'Loan', 'Overdraft', 'Catalogue', 'Store card', 'Other'];
const YES_NO_UNSURE = ['Yes', 'No', 'Not sure'];
const AWARENESS = [
  'When the basis of my current complaint was explained to me',
  'From information I found myself',
  'From another person or organisation',
  'I am not sure',
  'Other — please explain'
];

const MONEY_FIELD_NAMES = INCOME_ROWS.concat(OUTGOING_ROWS).map(([, f]) => f);

function cleanText(value, max, required = false) {
  if (typeof value !== 'string') return required ? { error: 'Required' } : { value: '' };
  const v = value.trim().replace(/\r\n/g, '\n');
  if (required && !v) return { error: 'Required' };
  if (v.length > max) return { error: 'Too long' };
  if (/\u0000/.test(v)) return { error: 'Invalid text' };
  return { value: v };
}

function enumValue(value, allowed, required = true) {
  if (!value && !required) return { value: '' };
  return allowed.includes(value) ? { value } : { error: 'Invalid choice' };
}

function reference(value) {
  return /^\d{9}$/.test(String(value || '')) ? { value: String(value) } : { error: 'Reference must be 9 digits' };
}

// Pounds. Accepts what a client would actually type - a leading £, thousands
// separators, spaces - and stores one canonical form ("1234.56"), so the email
// can print a human-readable amount and an unambiguous numeric value from the
// same source. Never negative: the questionnaire asks for amounts received and
// amounts paid, and a negative would be meaningless in either group.
function money(value, { required = false } = {}) {
  if (value === undefined || value === null) return required ? { error: 'Required' } : { value: '' };
  const raw = String(value).trim();
  if (!raw) return required ? { error: 'Please enter an amount' } : { value: '' };
  const stripped = raw.replace(/[£\s,]/g, '');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(stripped)) return { error: 'Please enter an amount in pounds, for example 250 or 1250.50' };
  const num = Number(stripped);
  if (!Number.isFinite(num) || num < 0) return { error: 'Please enter an amount in pounds, for example 250 or 1250.50' };
  if (num > 100000000) return { error: 'Please enter an amount in pounds, for example 250 or 1250.50' };
  return { value: stripped.includes('.') ? num.toFixed(2) : String(num) };
}

// An ISO date from <input type="date">. Must be a real calendar date, not in
// the future, and not absurdly old. A future lending start date cannot be
// correct, and silently accepting one would corrupt the evidence record.
function isoDate(value, { required = true } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return required ? { error: 'Please enter the date the lending started' } : { value: '' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return { error: 'Please enter a valid date' };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { error: 'Please enter a valid date' };
  if (y < 1900) return { error: 'Please enter a valid date' };
  // Compare against today in UTC so a same-day answer is never rejected.
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (dt.getTime() > todayUtc) return { error: 'The date cannot be in the future' };
  return { value: raw };
}

// A checkbox. Only a real boolean is accepted; an absent value means unticked.
// A string like "false" or "on" is a sign the payload was not built by this
// form, so it is rejected rather than guessed at.
function checkbox(value) {
  if (value === true || value === false) return { value };
  if (value === undefined || value === null) return { value: false };
  return { error: 'Invalid choice' };
}

// A whole number of people. `min` is 1 wherever the question follows a Yes,
// because zero would contradict the answer it is a follow-up to.
function wholeNumber(value, { min = 0, max = 50 } = {}) {
  if (value === undefined || value === null) return { value: '' };
  const raw = String(value).trim();
  if (!raw) return { value: '' };
  if (!/^\d{1,3}$/.test(raw)) return { error: 'Please enter a whole number' };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    return { error: min > 0 ? `Please enter a whole number of ${min} or more` : 'Please enter a whole number' };
  }
  return { value: String(n) };
}

// A question answered either by a value or by an explicit alternative such as
// "I don't remember". Exactly one of the two is required, never both and never
// neither, and the alternative is a real answer rather than a blank.
//
// `answered` says whether the value side carries anything. It is passed in
// because "carries anything" differs by type: a money field is canonicalised
// before it gets here, free text only needs trimming.
function eitherOr(answered, unknown, label, { required, question }) {
  if (unknown && answered) {
    return `Please either answer this question or tick “${label}”, not both`;
  }
  if (required && !unknown && !answered) {
    return question || `Please answer this question, or tick “${label}”`;
  }
  return null;
}

// The vulnerability question. "None of these apply" is mutually exclusive with
// every other option, enforced here as well as in the browser, so the record
// can never say both "none apply" and a category at once.
function vulnerabilities(value) {
  if (!Array.isArray(value)) return { error: 'Please select an answer' };
  if (value.length > VULNERABILITY_VALUES.length) return { error: 'Invalid choice' };
  const seen = new Set();
  for (const v of value) {
    if (typeof v !== 'string' || !VULNERABILITY_VALUES.includes(v)) return { error: 'Invalid choice' };
    if (seen.has(v)) return { error: 'Invalid choice' };
    seen.add(v);
  }
  if (seen.size === 0) return { error: 'Please select an answer' };
  if (seen.has(VULNERABILITY_NONE) && seen.size > 1) {
    return { error: 'Please either select “None of these apply” or the options that apply, not both' };
  }
  // Store in the questionnaire's own option order, not the order clicked, so
  // the record always reads in the order the client saw the options.
  return { value: VULNERABILITY_VALUES.filter((v) => seen.has(v)) };
}

function mode(value) {
  return MODES.includes(value) ? { value } : { error: 'Invalid questionnaire mode' };
}

// --- Admin -----------------------------------------------------------------

function validateAdmin(data) {
  const d = data || {};
  const m = mode(d.mode);
  if (m.error) return { ok: false, errors: { mode: m.error } };
  const combined = isCombined(m.value);

  const allowed = new Set(['mode', 'clientName', 'reference', 'lender', 'product']);
  if (combined) { allowed.add('communicationEvent'); allowed.add('communicationDate'); }
  for (const key of Object.keys(d)) if (!allowed.has(key)) return { ok: false, errors: { _form: 'Unknown field' } };

  const checks = {
    mode: m,
    clientName: cleanText(d.clientName, 120, true),
    reference: reference(d.reference),
    lender: cleanText(d.lender, 120, true),
    product: enumValue(d.product, PRODUCTS, true)
  };
  if (combined) {
    checks.communicationEvent = cleanText(d.communicationEvent, 500, true);
    checks.communicationDate = cleanText(d.communicationDate, 60, true);
  }
  const errors = Object.fromEntries(Object.entries(checks).filter(([, v]) => v.error).map(([k, v]) => [k, v.error]));
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.value || '']))
  };
}

// --- Submission ------------------------------------------------------------

const COMMON_FIELDS = [
  'mode', 'reference', 'clientName', 'lender', 'product', 'prefillToken', 'confirmation', 'website', 'startedAt'
];
const TIMEBAR_FIELDS = [
  'communicationEvent', 'communicationDate',
  // The first-awareness group, asked once (approved 2026-09-24). The retired
  // per-branch fields - q1YesMonthYear, q1YesWhy, q1NoMonthYear, q1NoExplain -
  // are deliberately absent, so a payload still carrying one is rejected as an
  // unknown field rather than quietly ignored.
  'q1ThoughtBefore', 'q1AwarenessSource',
  'q1AwarenessDate', 'q1AwarenessDateEstimated', 'q1AwarenessExplanation',
  'q2Remember', 'q2RememberWhat', 'q2MadeThink', 'q2Explain', 'q2OtherMemory',
  'q3Circumstances', 'q3Dates', 'q3Explain',
  'q4ComplainedPromptly', 'q4DelayReason',
  'q5RepaymentProblems', 'q5StruggleDetail', 'q5LenderSupport'
];
const FOS_FIELDS = [
  'fosVulnerabilities'
]
  // One detail field and one declined flag per category. The removed combined
  // fields (fosVulnerabilityExplanation, fosVulnerabilityExplanationDeclined,
  // fosVulnerabilityDetail) are deliberately absent, so a payload still
  // carrying them is rejected as an unknown field rather than ignored.
  .concat(VULNERABILITY_DETAILS.flatMap((d) => [d.field, d.declinedField]))
  .concat([
  'fosCourtAction',
  'fosLendingStart', 'fosLendingStartUnknown', 'fosLendingAmount',
  'fosBalancesPaid', 'fosBalancesPaidDate'
  ]).concat(INCOME_ROWS.map(([, f]) => f))
  .concat(['fosSavings', 'fosSavingsAmount', 'fosSavingsAmountUnknown'])
  .concat(OUTGOING_ROWS.map(([, f]) => f))
  .concat([
    'fosOtherExpenses',
    'fosDependants', 'fosDependantsCount', 'fosDependantsCountUnknown',
    'fosFurtherLending',
    'fosFurtherLendingType', 'fosFurtherLendingTypeUnknown',
    'fosFurtherLendingLender', 'fosFurtherLendingLenderUnknown',
    'fosFurtherLendingAmount', 'fosFurtherLendingAmountUnknown'
  ]);

function validateSubmission(data) {
  const d = data || {};
  const m = mode(d.mode);
  if (m.error) return { ok: false, errors: { mode: m.error } };
  const combined = isCombined(m.value);

  // In FOS-only mode the Time-Bar fields are not merely ignored - they are
  // rejected as unknown, so a FOS-only submission cannot smuggle Time-Bar
  // answers into the record.
  const allowed = new Set(COMMON_FIELDS.concat(FOS_FIELDS).concat(combined ? TIMEBAR_FIELDS : []));
  for (const key of Object.keys(d)) if (!allowed.has(key)) return { ok: false, errors: { _form: 'Unknown field' } };

  const checks = {
    mode: m,
    reference: reference(d.reference),
    clientName: cleanText(d.clientName, 120, true),
    lender: cleanText(d.lender, 120, true),
    product: enumValue(d.product, PRODUCTS, true),
    website: cleanText(d.website, 100),
    prefillToken: cleanText(d.prefillToken, 6000),

    fosVulnerabilities: vulnerabilities(d.fosVulnerabilities),
    fosCourtAction: enumValue(d.fosCourtAction, YES_NO, true),
    // The date is required only when the client has not said they do not know
    // it. Cross-checked below so the two can never both be given.
    fosLendingStartUnknown: checkbox(d.fosLendingStartUnknown),
    fosLendingStart: isoDate(d.fosLendingStart, { required: d.fosLendingStartUnknown !== true }),
    fosLendingAmount: money(d.fosLendingAmount, { required: true }),
    fosBalancesPaid: enumValue(d.fosBalancesPaid, YES_NO, true),
    // Shape only. Whether it was allowed to be given at all, and whether it
    // had to be, is decided with the other conditionals below.
    fosBalancesPaidDate: isoDate(d.fosBalancesPaidDate, { required: false }),
    fosSavings: enumValue(d.fosSavings, YES_NO, true),
    fosOtherExpenses: cleanText(d.fosOtherExpenses, 1400),
    fosDependants: enumValue(d.fosDependants, YES_NO, true),
    fosFurtherLending: enumValue(d.fosFurtherLending, YES_NO, true),

    // Follow-up answers. Each is shape-checked here; whether it was allowed to
    // be given at all, and whether it had to be, is decided by the conditional
    // rules further down, which key off the answer it follows.
    fosSavingsAmount: money(d.fosSavingsAmount),
    fosSavingsAmountUnknown: checkbox(d.fosSavingsAmountUnknown),
    fosDependantsCount: wholeNumber(d.fosDependantsCount, { min: 1 }),
    fosDependantsCountUnknown: checkbox(d.fosDependantsCountUnknown),
    fosFurtherLendingType: cleanText(d.fosFurtherLendingType, 300),
    fosFurtherLendingTypeUnknown: checkbox(d.fosFurtherLendingTypeUnknown),
    fosFurtherLendingLender: cleanText(d.fosFurtherLendingLender, 300),
    fosFurtherLendingLenderUnknown: checkbox(d.fosFurtherLendingLenderUnknown),
    fosFurtherLendingAmount: money(d.fosFurtherLendingAmount),
    fosFurtherLendingAmountUnknown: checkbox(d.fosFurtherLendingAmountUnknown)
  };
  // One detail field and one declined flag for each category.
  VULNERABILITY_DETAILS.forEach((detail) => {
    checks[detail.field] = cleanText(d[detail.field], 1400);
    checks[detail.declinedField] = checkbox(d[detail.declinedField]);
  });
  // Income and outgoings are optional in the source questionnaire; a blank
  // stays blank and is recorded as not provided rather than as zero.
  MONEY_FIELD_NAMES.forEach((f) => { checks[f] = money(d[f]); });

  if (combined) {
    Object.assign(checks, {
      communicationEvent: cleanText(d.communicationEvent, 500, true),
      communicationDate: cleanText(d.communicationDate, 60, true),
      q1ThoughtBefore: enumValue(d.q1ThoughtBefore, YES_NO_UNSURE, true),
      q1AwarenessSource: enumValue(d.q1AwarenessSource, AWARENESS, false),
      // The first-awareness group (approved 2026-09-24), asked once whichever
      // branch the client took. The date is optional, exactly as the month/year
      // it replaces was; the estimate answer is required the moment a date
      // exists, and refused when there is no date to qualify.
      q1AwarenessDate: isoDate(d.q1AwarenessDate, { required: false }),
      q1AwarenessDateEstimated: enumValue(d.q1AwarenessDateEstimated, YES_NO, false),
      q1AwarenessExplanation: cleanText(d.q1AwarenessExplanation, 800),
      q2Remember: enumValue(d.q2Remember, YES_NO_UNSURE, true),
      q2RememberWhat: cleanText(d.q2RememberWhat, 1000),
      q2MadeThink: enumValue(d.q2MadeThink, YES_NO_UNSURE, false),
      q2Explain: cleanText(d.q2Explain, 1000),
      q2OtherMemory: cleanText(d.q2OtherMemory, 1000),
      q3Circumstances: enumValue(d.q3Circumstances, YES_NO_UNSURE, true),
      q3Dates: cleanText(d.q3Dates, 120),
      q3Explain: cleanText(d.q3Explain, 1400),
      // Sections 4 and 5 (approved 2026-09-24).
      q4ComplainedPromptly: enumValue(d.q4ComplainedPromptly, YES_NO, true),
      q4DelayReason: cleanText(d.q4DelayReason, 1400),
      q5RepaymentProblems: enumValue(d.q5RepaymentProblems, YES_NO, true),
      q5StruggleDetail: cleanText(d.q5StruggleDetail, 1400),
      q5LenderSupport: enumValue(d.q5LenderSupport, YES_NO, false)
    });
  }

  const errors = Object.fromEntries(Object.entries(checks).filter(([, v]) => v.error).map(([k, v]) => [k, v.error]));

  // Time-Bar conditional branches. Sections 1 to 3 are unchanged from the
  // approved live form; the first-awareness group and sections 4 and 5 were
  // approved 2026-09-24.
  if (combined) {
    // The explanation carries the requiredness the two retired boxes had
    // between them: a client who had thought about it must say what made them
    // think it; one who had not is asked but not compelled, because "if you
    // can remember" was the approved wording of the box it replaces.
    if (d.q1ThoughtBefore === 'Yes' && !String(d.q1AwarenessExplanation || '').trim()) {
      errors.q1AwarenessExplanation = 'Please answer this question';
    }
    if ((d.q1ThoughtBefore === 'No' || d.q1ThoughtBefore === 'Not sure') && !AWARENESS.includes(d.q1AwarenessSource)) errors.q1AwarenessSource = 'Please select an answer';

    // A date and its precision travel together: neither a date whose precision
    // nobody recorded, nor a precision answered about no date at all.
    if (hasAwarenessDate(d)) {
      if (!YES_NO.includes(d.q1AwarenessDateEstimated)) errors.q1AwarenessDateEstimated = 'Please select an answer';
    } else if (d.q1AwarenessDateEstimated !== undefined && String(d.q1AwarenessDateEstimated).trim() !== '') {
      errors.q1AwarenessDateEstimated = 'This question was not asked';
      checks.q1AwarenessDateEstimated = { value: '' };
    }

    // Section 4. A delay is explained only where the client says there was
    // one; an explanation sent alongside "yes, I complained straight away"
    // contradicts the answer above it.
    if (d.q4ComplainedPromptly === 'No') {
      if (!String(d.q4DelayReason || '').trim()) errors.q4DelayReason = 'Please answer this question';
    } else if (String(d.q4DelayReason || '').trim()) {
      errors.q4DelayReason = 'This question was not asked';
      checks.q4DelayReason = { value: '' };
    }

    // Section 5. Both follow-ups belong to the Yes branch, and both are
    // inadmissible outside it rather than merely ignored.
    if (d.q5RepaymentProblems === 'Yes') {
      if (!String(d.q5StruggleDetail || '').trim()) errors.q5StruggleDetail = 'Please answer this question';
      if (!YES_NO.includes(d.q5LenderSupport)) errors.q5LenderSupport = 'Please select an answer';
    } else {
      if (String(d.q5StruggleDetail || '').trim()) {
        errors.q5StruggleDetail = 'This question was not asked';
        checks.q5StruggleDetail = { value: '' };
      }
      if (String(d.q5LenderSupport || '').trim()) {
        errors.q5LenderSupport = 'This question was not asked';
        checks.q5LenderSupport = { value: '' };
      }
    }
    if (d.q2Remember === 'Yes') {
      if (!String(d.q2RememberWhat || '').trim()) errors.q2RememberWhat = 'Please answer this question';
      if (!YES_NO_UNSURE.includes(d.q2MadeThink)) errors.q2MadeThink = 'Please select an answer';
      if (!String(d.q2Explain || '').trim()) errors.q2Explain = 'Please answer this question';
    }
    if (d.q3Circumstances === 'Yes' && !String(d.q3Explain || '').trim()) errors.q3Explain = 'Please answer this question';
  }

  // The exact date and "I don't remember the exact date" are mutually exclusive.
  // If the client says they do not know, no date is generated or inferred: the
  // field is forced empty so nothing can be read back out of it later.
  if (d.fosLendingStartUnknown === true) {
    if (String(d.fosLendingStart || '').trim()) {
      errors.fosLendingStart = `Please either enter the date or tick “${UNKNOWN_DATE_LABEL}”, not both`;
    }
    checks.fosLendingStart = { value: '' };
  }

  // --- Conditional follow-ups ------------------------------------------------
  //
  // Every follow-up is tied to the answer that opens it, and two rules apply:
  //
  //   branch not taken  nothing may be supplied for it. A payload carrying,
  //                     say, a savings amount alongside "savings: No" is
  //                     contradictory and is rejected rather than quietly kept.
  //   branch taken      exactly one of the value or its explicit alternative
  //                     must be supplied - never both, never neither.
  //
  // Anything belonging to an untaken branch is also forced empty, so a stale
  // answer left behind by a client changing their mind can never reach the
  // record even if it slipped past the browser.
  const supplied = (field) => String(d[field] ?? '').trim() !== '';

  function followUp({ open, valueField, unknownField, label, missing }) {
    const unknown = d[unknownField] === true;
    const answered = supplied(valueField);
    if (!open) {
      if (answered || unknown) errors[valueField] = 'This question was not asked';
      checks[valueField] = { value: '' };
      checks[unknownField] = { value: false };
      return;
    }
    const err = eitherOr(answered, unknown, label, { required: true, question: missing });
    if (err) errors[valueField] = err;
  }

  // Each category opens its own follow-up, answered independently. Selecting
  // two categories means answering two questions; explaining one never
  // satisfies the other, and unselecting a category makes its answer
  // inadmissible rather than merely ignored.
  VULNERABILITY_DETAILS.forEach((detail) => {
    followUp({
      open: categorySelected(d, detail.category),
      valueField: detail.field,
      unknownField: detail.declinedField,
      label: VULNERABILITY_DECLINE_LABEL,
      missing: `Please tell us how this affected you, or tick “${VULNERABILITY_DECLINE_LABEL}”`
    });
  });

  // The account-repaid date (approved 2026-09-24). Required under a Yes,
  // inadmissible under a No: a balance that was never repaid has no repayment
  // date, and a stale one left behind by a client changing their answer must
  // not reach the record.
  if (d.fosBalancesPaid === 'Yes') {
    if (!supplied('fosBalancesPaidDate')) {
      errors.fosBalancesPaidDate = 'Please enter the date the account was repaid';
    }
  } else if (supplied('fosBalancesPaidDate')) {
    errors.fosBalancesPaidDate = 'This question was not asked';
    checks.fosBalancesPaidDate = { value: '' };
  }

  followUp({
    open: d.fosSavings === 'Yes',
    valueField: 'fosSavingsAmount',
    unknownField: 'fosSavingsAmountUnknown',
    label: UNKNOWN_LABEL,
    missing: `Please enter roughly how much, or tick “${UNKNOWN_LABEL}”`
  });

  followUp({
    open: d.fosDependants === 'Yes',
    valueField: 'fosDependantsCount',
    unknownField: 'fosDependantsCountUnknown',
    label: UNKNOWN_LABEL,
    missing: `Please enter how many, or tick “${UNKNOWN_LABEL}”`
  });

  // Three independent follow-ups: knowing the lender but not the amount is an
  // ordinary answer, so each is required on its own and none forces the others.
  const furtherLending = d.fosFurtherLending === 'Yes';
  [
    ['fosFurtherLendingType', 'fosFurtherLendingTypeUnknown', 'Please tell us the type of lending'],
    ['fosFurtherLendingLender', 'fosFurtherLendingLenderUnknown', 'Please tell us who the lending was with'],
    ['fosFurtherLendingAmount', 'fosFurtherLendingAmountUnknown', 'Please enter roughly how much']
  ].forEach(([valueField, unknownField, missing]) => {
    followUp({
      open: furtherLending,
      valueField,
      unknownField,
      label: UNKNOWN_LABEL,
      missing: `${missing}, or tick “${UNKNOWN_LABEL}”`
    });
  });


  if (d.confirmation !== true) errors.confirmation = 'Confirmation is required';
  if (String(d.website || '').trim()) errors._bot = 'Rejected';
  const startedAt = Number(d.startedAt || 0);
  if (!Number.isFinite(startedAt) || Date.now() - startedAt < 4000) errors._bot = 'Rejected';

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.value === undefined ? '' : v.value]))
  };
}

module.exports = {
  PRODUCTS, YES_NO_UNSURE, YES_NO, AWARENESS, MODES, MODE_FOS_ONLY, MODE_TIMEBAR_AND_FOS,
  validateAdmin, validateSubmission, reference, money, isoDate, wholeNumber, vulnerabilities, mode,
  COMMON_FIELDS, TIMEBAR_FIELDS, FOS_FIELDS
};
