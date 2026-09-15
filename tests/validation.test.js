const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  validateAdmin, validateSubmission, money, isoDate, vulnerabilities, mode,
  MODE_FOS_ONLY, MODE_TIMEBAR_AND_FOS
} = require('../lib/validation');
const { TIMEBAR_QUESTIONS } = require('../lib/questions-timebar');
const { VULNERABILITY_VALUES, VULNERABILITY_NONE } = require('../lib/questions-fos');

const FOS_ANSWERS = {
  fosVulnerabilities: [VULNERABILITY_VALUES[0]],
  fosVulnerabilityExplanation: 'I was unwell for a long period.',
  fosVulnerabilityDetail: '',
  fosCourtAction: 'No',
  fosLendingStart: '2015-06-01',
  fosLendingAmount: '5000',
  fosBalancesPaid: 'Yes',
  fosIncomeEmployment: '1500', fosIncomeBenefits: '', fosIncomeMaintenance: '', fosIncomePension: '',
  fosSavings: 'No',
  fosOutHousing: '600', fosOutUtilities: '150', fosOutFood: '250', fosOutTransport: '',
  fosOtherExpenses: '',
  fosDependants: 'Yes', fosDependantsCount: '2',
  fosFurtherLending: 'No'
};
const TIMEBAR_ANSWERS = {
  communicationEvent: 'a test annual statement', communicationDate: 'March 2020',
  q1ThoughtBefore: 'No', q1AwarenessSource: 'From information I found myself',
  q1NoMonthYear: 'June 2024', q1NoExplain: 'Synthetic explanation.',
  q2Remember: 'No', q2OtherMemory: 'Synthetic note.',
  q3Circumstances: 'No'
};
const base = (over = {}) => ({
  mode: MODE_FOS_ONLY, reference: '200000001', clientName: 'Test Person',
  lender: 'Test Lender', product: 'Credit card',
  ...FOS_ANSWERS, confirmation: true, website: '', startedAt: Date.now() - 9999, ...over
});
const combined = (over = {}) => base({ mode: MODE_TIMEBAR_AND_FOS, ...TIMEBAR_ANSWERS, ...over });

// ------------------------------------------------------------------- money

test('money accepts what a client actually types', () => {
  assert.equal(money('250').value, '250');
  assert.equal(money('1250.50').value, '1250.50');
  assert.equal(money('£1,250.50').value, '1250.50');
  assert.equal(money(' 1 250 ').value, '1250');
  assert.equal(money('0').value, '0');
  assert.equal(money('').value, '', 'blank is allowed where the source marks no requirement');
});

test('money rejects anything that is not a plain pounds amount', () => {
  for (const bad of ['-5', 'abc', '1.234', '1,2,3.456', '1e5', '£', '12..3', '1 000 000 000 0', 'NaN', 'Infinity', '<script>']) {
    assert.ok(money(bad).error, `must reject ${JSON.stringify(bad)}`);
  }
});

test('money is stored canonically so the email never re-parses a formatted string', () => {
  assert.equal(money('£1,250.5').value, '1250.50');
  assert.equal(money('1250.00').value, '1250.00');
});

// -------------------------------------------------------------------- date

test('isoDate accepts a real past date and rejects anything else', () => {
  assert.equal(isoDate('2015-06-01').value, '2015-06-01');
  assert.ok(isoDate('2015-02-30').error, 'a date that does not exist is rejected');
  assert.ok(isoDate('2015-13-01').error, 'month 13 is rejected');
  assert.ok(isoDate('01/01/2015').error, 'only ISO input from the date control is accepted');
  assert.ok(isoDate('1899-12-31').error, 'absurdly old dates are rejected');
  assert.ok(isoDate('').error, 'a missing date is rejected');
});

test('a future lending start date is rejected', () => {
  const future = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);
  assert.match(isoDate(future).error, /future/);
});

test('today is accepted', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(isoDate(today).value, today);
});

// --------------------------------------------------- vulnerability selection

test('multiple vulnerability categories can be selected together', () => {
  const r = vulnerabilities([VULNERABILITY_VALUES[2], VULNERABILITY_VALUES[0]]);
  assert.deepEqual(r.value, [VULNERABILITY_VALUES[0], VULNERABILITY_VALUES[2]], 'stored in questionnaire order');
});

test('all four categories can be selected at once', () => {
  const four = VULNERABILITY_VALUES.slice(0, 4);
  assert.deepEqual(vulnerabilities(four).value, four);
});

test('"None of these apply" is mutually exclusive with every other option', () => {
  for (let i = 0; i < 4; i += 1) {
    const r = vulnerabilities([VULNERABILITY_VALUES[i], VULNERABILITY_NONE]);
    assert.ok(r.error, `option ${i} combined with "none" must be rejected`);
    assert.match(r.error, /None of these apply/);
  }
  assert.deepEqual(vulnerabilities([VULNERABILITY_NONE]).value, [VULNERABILITY_NONE], 'alone it is valid');
});

test('the vulnerability question must be answered', () => {
  assert.ok(vulnerabilities([]).error, 'no selection is rejected');
  assert.ok(vulnerabilities('a string').error, 'a non-array is rejected');
  assert.ok(vulnerabilities(undefined).error);
});

test('invented, duplicated or overlong vulnerability values are rejected', () => {
  assert.ok(vulnerabilities(['Something the form never offered']).error);
  assert.ok(vulnerabilities([VULNERABILITY_VALUES[0], VULNERABILITY_VALUES[0]]).error, 'duplicates rejected');
  assert.ok(vulnerabilities(VULNERABILITY_VALUES.concat(VULNERABILITY_VALUES)).error, 'oversized array rejected');
  assert.ok(vulnerabilities([{ toString: () => VULNERABILITY_VALUES[0] }]).error, 'non-string rejected');
});

test('the source PDF’s own optional free-text box stays optional', () => {
  // TMS approved a separate required follow-up (covered below). The source
  // questionnaire's own "anything else" box is still optional and must not
  // become mandatory as a side effect.
  const r = validateSubmission(base({
    fosVulnerabilities: VULNERABILITY_VALUES.slice(0, 4),
    fosVulnerabilityExplanation: 'One combined explanation.',
    fosVulnerabilityDetail: ''
  }));
  assert.equal(r.ok, true);
});

// -------------------------------------------------------------------- mode

test('only the two approved modes are accepted', () => {
  assert.equal(mode(MODE_FOS_ONLY).value, MODE_FOS_ONLY);
  assert.equal(mode(MODE_TIMEBAR_AND_FOS).value, MODE_TIMEBAR_AND_FOS);
  for (const bad of ['', 'fos_only', 'TIMEBAR', undefined, null, 0, {}, ['FOS_ONLY']]) {
    assert.ok(mode(bad).error, `must reject mode ${JSON.stringify(bad)}`);
  }
});

test('a submission with no mode is rejected outright', () => {
  const r = validateSubmission(base({ mode: undefined }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.mode);
});

// ------------------------------------------------------- admin, by mode

test('FOS-only admin needs only the four matter fields', () => {
  const r = validateAdmin({ mode: MODE_FOS_ONLY, clientName: 'A', reference: '200000001', lender: 'L', product: 'Loan' });
  assert.equal(r.ok, true);
  assert.equal(r.value.mode, MODE_FOS_ONLY);
});

test('FOS-only admin rejects the Time-Bar fields as unknown', () => {
  for (const extra of [{ communicationEvent: 'x' }, { communicationDate: 'x' }]) {
    const r = validateAdmin({ mode: MODE_FOS_ONLY, clientName: 'A', reference: '200000001', lender: 'L', product: 'Loan', ...extra });
    assert.equal(r.ok, false);
    assert.equal(r.errors._form, 'Unknown field');
  }
});

test('combined admin requires the lender event and its date', () => {
  const r = validateAdmin({ mode: MODE_TIMEBAR_AND_FOS, clientName: 'A', reference: '200000001', lender: 'L', product: 'Loan' });
  assert.equal(r.ok, false);
  assert.equal(r.errors.communicationEvent, 'Required');
  assert.equal(r.errors.communicationDate, 'Required');
  const ok = validateAdmin({ mode: MODE_TIMEBAR_AND_FOS, clientName: 'A', reference: '200000001', lender: 'L', product: 'Loan', communicationEvent: 'a statement', communicationDate: 'March 2020' });
  assert.equal(ok.ok, true);
});

test('admin rejects a bad reference and an unapproved product', () => {
  const bad = validateAdmin({ mode: MODE_FOS_ONLY, clientName: 'A', reference: '12345', lender: 'L', product: 'Mortgage' });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.reference, /9 digits/);
  assert.equal(bad.errors.product, 'Invalid choice');
});

// -------------------------------------------------- submission, by mode

test('a complete FOS-only submission is accepted', () => {
  const r = validateSubmission(base());
  assert.deepEqual(r.errors, {});
  assert.equal(r.ok, true);
});

test('a complete combined submission is accepted', () => {
  const r = validateSubmission(combined());
  assert.deepEqual(r.errors, {});
  assert.equal(r.ok, true);
});

test('FOS-only mode rejects every Time-Bar answer field as unknown', () => {
  for (const q of TIMEBAR_QUESTIONS) {
    const r = validateSubmission(base({ [q.field]: 'smuggled' }));
    assert.equal(r.ok, false, `${q.field} must be rejected in FOS-only mode`);
    assert.equal(r.errors._form, 'Unknown field', `${q.field} must be rejected as an unknown field`);
  }
  for (const f of ['communicationEvent', 'communicationDate']) {
    const r = validateSubmission(base({ [f]: 'smuggled' }));
    assert.equal(r.errors._form, 'Unknown field', `${f} must be rejected in FOS-only mode`);
  }
});

test('any field the form never offered is rejected in both modes', () => {
  for (const payload of [base({ extra: 'x' }), combined({ extra: 'x' })]) {
    const r = validateSubmission(payload);
    assert.equal(r.errors._form, 'Unknown field');
  }
});

test('every FOS question that the source asks must be answered', () => {
  const required = ['fosCourtAction', 'fosLendingStart', 'fosLendingAmount', 'fosBalancesPaid', 'fosSavings', 'fosDependants', 'fosFurtherLending'];
  for (const f of required) {
    const r = validateSubmission(base({ [f]: '' }));
    assert.equal(r.ok, false, `${f} must be required`);
    assert.ok(r.errors[f], `${f} must report an error`);
  }
});

test('income and outgoings stay optional, and blank never becomes zero', () => {
  const blank = {
    fosIncomeEmployment: '', fosIncomeBenefits: '', fosIncomeMaintenance: '', fosIncomePension: '',
    fosOutHousing: '', fosOutUtilities: '', fosOutFood: '', fosOutTransport: ''
  };
  const r = validateSubmission(base(blank));
  assert.equal(r.ok, true, 'the source marks no requirement on these rows');
  for (const f of Object.keys(blank)) assert.equal(r.value[f], '', `${f} stays blank rather than becoming 0`);
});

test('a bad amount in any financial row is rejected', () => {
  for (const f of ['fosIncomeEmployment', 'fosOutHousing', 'fosLendingAmount']) {
    const r = validateSubmission(base({ [f]: 'about £500' }));
    assert.equal(r.ok, false, `${f} must reject free text`);
  }
});

test('the free-text answers accept ordinary punctuation and are length-capped', () => {
  const ok = validateSubmission(base({ fosOtherExpenses: 'Gym £25 & "pet insurance" <£30>' }));
  assert.equal(ok.ok, true);
  const long = validateSubmission(base({ fosOtherExpenses: 'x'.repeat(1401) }));
  assert.equal(long.errors.fosOtherExpenses, 'Too long');
});

test('the combined mode keeps the approved Time-Bar conditional branches', () => {
  const yes = validateSubmission(combined({ q1ThoughtBefore: 'Yes', q1AwarenessSource: '', q1YesWhy: '' }));
  assert.equal(yes.errors.q1YesWhy, 'Please answer this question');
  const unsure = validateSubmission(combined({ q1ThoughtBefore: 'Not sure', q1AwarenessSource: '' }));
  assert.equal(unsure.errors.q1AwarenessSource, 'Please select an answer');
  const q2 = validateSubmission(combined({ q2Remember: 'Yes', q2RememberWhat: '', q2MadeThink: '', q2Explain: '' }));
  assert.equal(q2.errors.q2RememberWhat, 'Please answer this question');
  assert.equal(q2.errors.q2MadeThink, 'Please select an answer');
  assert.equal(q2.errors.q2Explain, 'Please answer this question');
  const q3 = validateSubmission(combined({ q3Circumstances: 'Yes', q3Explain: '' }));
  assert.equal(q3.errors.q3Explain, 'Please answer this question');
});

// ------------------------------------------------------------- bot controls

test('the confirmation box is required', () => {
  for (const v of [false, undefined, 'yes', 1]) {
    assert.equal(validateSubmission(base({ confirmation: v })).errors.confirmation, 'Confirmation is required');
  }
});

test('a filled honeypot is rejected', () => {
  assert.equal(validateSubmission(base({ website: 'http://spam' })).errors._bot, 'Rejected');
});

test('a submission completed impossibly fast is rejected', () => {
  assert.equal(validateSubmission(base({ startedAt: Date.now() })).errors._bot, 'Rejected');
  assert.equal(validateSubmission(base({ startedAt: 'not-a-number' })).errors._bot, 'Rejected');
});

test('a 9-digit reference is required', () => {
  for (const bad of ['', '12345678', '1234567890', 'abcdefghi', '12345678 ']) {
    assert.match(validateSubmission(base({ reference: bad })).errors.reference, /9 digits/);
  }
});

// ------------------------------------------------- Time-Bar wording parity

test('the Time-Bar wording is byte-identical to the approved live form', () => {
  // Locked hash of the approved wording carried over from
  // TMS-Timebar-Quick-Form (lib/questions.js at commit 6f5f026). If anyone
  // rewords, reorders or simplifies a Time-Bar question, this fails.
  const norm = TIMEBAR_QUESTIONS
    .map((q) => [q.id, q.heading || '', q.question, q.note || '', (q.bullets || []).join('|')].join(''))
    .join('');
  const ctx = TIMEBAR_QUESTIONS.find((q) => q.id === 'Q2')
    .context({ communicationEvent: 'E', communicationDate: 'D' }).join('');
  const hash = crypto.createHash('sha256').update(`${norm}${ctx}`, 'utf8').digest('hex');
  assert.equal(hash, 'b4f1b4dfdd97e08a0370b857231d09d9b76d70e9b076243814f7367e1f173583',
    'the approved Time-Bar wording must not be edited');
});

test('the Time-Bar field names are unchanged, so the record stays comparable', () => {
  assert.deepEqual(TIMEBAR_QUESTIONS.map((q) => q.field), [
    'q1ThoughtBefore', 'q1YesMonthYear', 'q1YesWhy', 'q1AwarenessSource', 'q1NoMonthYear', 'q1NoExplain',
    'q2Remember', 'q2RememberWhat', 'q2MadeThink', 'q2Explain', 'q2OtherMemory',
    'q3Circumstances', 'q3Dates', 'q3Explain'
  ]);
});

// ------------------------------------ lending start date / "I don't know"
//
// Approved 2026-09-15: a client must not be forced to invent an exact date.
// The two answers are mutually exclusive, and choosing "I don't know" must
// never cause a date to be generated or inferred.

const { UNKNOWN_DATE_LABEL } = require('../lib/questions-fos');

test('the approved label is exactly the wording TMS specified', () => {
  assert.equal(UNKNOWN_DATE_LABEL, "I don't know the exact date");
});

test('an exact date is still accepted and recorded', () => {
  const r = validateSubmission(base({ fosLendingStart: '2016-04-18' }));
  assert.equal(r.ok, true);
  assert.equal(r.value.fosLendingStart, '2016-04-18');
  assert.equal(r.value.fosLendingStartUnknown, false);
});

test('"I don\'t know the exact date" is accepted with no date at all', () => {
  const r = validateSubmission(base({ fosLendingStart: '', fosLendingStartUnknown: true }));
  assert.deepEqual(r.errors, {});
  assert.equal(r.ok, true);
  assert.equal(r.value.fosLendingStartUnknown, true);
  assert.equal(r.value.fosLendingStart, '', 'no date is generated or inferred');
});

test('the date is no longer required once the client says they do not know it', () => {
  const missing = validateSubmission(base({ fosLendingStart: '' }));
  assert.match(missing.errors.fosLendingStart, /Please enter the date/);
  const unknown = validateSubmission(base({ fosLendingStart: '', fosLendingStartUnknown: true }));
  assert.equal(unknown.errors.fosLendingStart, undefined);
});

test('a date and "I don\'t know" together are rejected as mutually exclusive', () => {
  const r = validateSubmission(base({ fosLendingStart: '2016-04-18', fosLendingStartUnknown: true }));
  assert.equal(r.ok, false);
  assert.match(r.errors.fosLendingStart, /not both/);
});

test('a date smuggled alongside "I don\'t know" never reaches the record', () => {
  // Even if the pair were somehow accepted, the stored date is forced empty so
  // nothing can be read back out of it later.
  const r = validateSubmission(base({ fosLendingStart: '2016-04-18', fosLendingStartUnknown: true }));
  assert.equal(r.value.fosLendingStart, '');
});

test('neither a date nor "I don\'t know" is still rejected', () => {
  const r = validateSubmission(base({ fosLendingStart: '', fosLendingStartUnknown: false }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.fosLendingStart);
});

test('the unknown-date flag must be a real boolean', () => {
  for (const bad of ['true', 'yes', 'on', 1, {}, []]) {
    const r = validateSubmission(base({ fosLendingStart: '', fosLendingStartUnknown: bad }));
    assert.equal(r.ok, false, `must reject ${JSON.stringify(bad)}`);
    assert.equal(r.errors.fosLendingStartUnknown, 'Invalid choice');
  }
  // absent is simply unticked
  const absent = validateSubmission(base({ fosLendingStart: '2016-04-18' }));
  assert.equal(absent.value.fosLendingStartUnknown, false);
});

test('an invalid or future date is still rejected when "I don\'t know" is not ticked', () => {
  assert.ok(validateSubmission(base({ fosLendingStart: '2016-02-30' })).errors.fosLendingStart);
  const future = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);
  assert.match(validateSubmission(base({ fosLendingStart: future })).errors.fosLendingStart, /future/);
});

test('the unknown-date field is accepted in both questionnaire modes', () => {
  for (const payload of [
    base({ fosLendingStart: '', fosLendingStartUnknown: true }),
    combined({ fosLendingStart: '', fosLendingStartUnknown: true })
  ]) {
    const r = validateSubmission(payload);
    assert.notEqual(r.errors._form, 'Unknown field');
    assert.equal(r.ok, true);
  }
});
