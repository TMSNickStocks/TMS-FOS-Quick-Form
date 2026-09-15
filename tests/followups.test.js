// Regression cover for the follow-up questions approved on 2026-09-15:
// the vulnerability explanation, the savings amount, the dependants count and
// the three further-lending answers.
//
// Each is checked at every layer it passes through - what the validator
// accepts, what the evidence record says, and how the form is wired - so a
// change to one layer alone cannot silently break the others.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { validateSubmission, MODE_FOS_ONLY, MODE_TIMEBAR_AND_FOS } = require('../lib/validation');
const { buildEmail, esc, NOT_PROVIDED } = require('../lib/email-template');
const {
  FOS_QUESTIONS, VULNERABILITY_VALUES, VULNERABILITY_NONE, VULNERABILITY_DETAILS,
  VULNERABILITY_DETAIL_QUESTION, UNKNOWN_LABEL, VULNERABILITY_DECLINE_LABEL
} = require('../lib/questions-fos');

const html = fs.readFileSync('public/index.html', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');

const CAT = VULNERABILITY_VALUES;
const DET = VULNERABILITY_DETAILS;
// Select the given categories and answer each, so a test only has to say which
// categories it cares about. Pass 'decline' to use the alternative instead.
const withCategories = (indexes, answers = {}) => {
  const over = { fosVulnerabilities: indexes.map((i) => CAT[i]) };
  indexes.forEach((i) => {
    if (answers[i] === 'decline') over[DET[i].declinedField] = true;
    else if (answers[i] === undefined) over[DET[i].field] = `Explanation for category ${i + 1}.`;
    else over[DET[i].field] = answers[i];
  });
  return over;
};

// A submission with every branch closed: "none of these apply", and No to
// savings, dependants and further lending. Each test opens only what it needs.
const BASE = {
  mode: MODE_FOS_ONLY, reference: '200000001', clientName: 'Test Person',
  lender: 'Test Lender', product: 'Credit card',
  fosVulnerabilities: [VULNERABILITY_NONE],
  fosCourtAction: 'No', fosLendingStart: '2015-06-01', fosLendingAmount: '5000',
  fosBalancesPaid: 'Yes', fosSavings: 'No', fosDependants: 'No', fosFurtherLending: 'No',
  confirmation: true, website: '', startedAt: Date.now() - 9999
};
const TIMEBAR = {
  communicationEvent: 'a test annual statement', communicationDate: 'March 2020',
  q1ThoughtBefore: 'No', q1AwarenessSource: 'From information I found myself',
  q2Remember: 'No', q3Circumstances: 'No'
};
const sub = (over = {}) => ({ ...BASE, ...over });
const valid = (over = {}) => {
  const r = validateSubmission(sub(over));
  assert.deepEqual(r.errors, {}, 'expected a valid submission');
  return r;
};
const invalid = (over = {}) => {
  const r = validateSubmission(sub(over));
  assert.equal(r.ok, false, 'expected the submission to be rejected');
  return r.errors;
};
const record = (over = {}) => {
  const r = valid(over);
  return buildEmail(r.value, { submissionId: 'test', completedAt: '2026-09-15T12:00:00+01:00' });
};

// The block a given id produced in a record, parsed back out of the text part.
function block(text, id) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`[${id}]`));
  if (start < 0) return null;
  const out = { id, context: [], question: [], answer: [], options: [] };
  let marker = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\[[A-Z0-9_]+\]/.test(line)) break;
    const mk = /^(CONTEXT|QUESTION|NOTE|OPTIONS|CLIENT ANSWER):$/.exec(line);
    if (mk) { marker = mk[1]; continue; }
    if (!/^ {2}/.test(line)) { marker = null; continue; }
    const content = line.slice(2);
    if (marker === 'CONTEXT') out.context.push(content);
    if (marker === 'QUESTION') out.question.push(content);
    if (marker === 'OPTIONS' && content.startsWith('• ')) out.options.push(content.slice(2));
    if (marker === 'CLIENT ANSWER') out.answer.push(content);
  }
  return out;
}
const answerOf = (text, id) => { const b = block(text, id); return b ? b.answer.join('\n') : null; };
const questionOf = (text, id) => { const b = block(text, id); return b ? b.question.join('\n') : null; };

// ============ 1-4. circumstances, each answered on its own terms ==========

test('1. one selected category, answered in the client own words', () => {
  const { text } = record(withCategories([0], { 0: 'My illness made letters impossible.' }));
  const b = block(text, DET[0].id);
  assert.equal(b.id, 'FOS_VULNERABILITY_HEALTH_DETAIL');
  assert.equal(questionOf(text, DET[0].id), VULNERABILITY_DETAIL_QUESTION);
  assert.equal(answerOf(text, DET[0].id), 'My illness made letters impossible.');
  // The other three were never asked.
  for (const d of DET.slice(1)) assert.equal(block(text, d.id), null, `${d.id} must not appear`);
});

test('2. one selected category, answered with the decline alternative', () => {
  const { text, html: htmlPart } = record(withCategories([1], { 1: 'decline' }));
  assert.equal(answerOf(text, DET[1].id), VULNERABILITY_DECLINE_LABEL);
  assert.ok(!answerOf(text, DET[1].id).includes(NOT_PROVIDED), 'never recorded as a blank');
  assert.ok(htmlPart.includes(esc(VULNERABILITY_DECLINE_LABEL)));
});

test('3. two selected categories keep separate explanations', () => {
  const { text } = record(withCategories([0, 1], {
    0: 'Health: I was signed off work.',
    1: 'Life event: my mother died.'
  }));
  assert.equal(answerOf(text, DET[0].id), 'Health: I was signed off work.');
  assert.equal(answerOf(text, DET[1].id), 'Life event: my mother died.');
  // Each block names the circumstance its answer belongs to, so two answers
  // can never be read as one combined explanation.
  assert.equal(block(text, DET[0].id).context.join('\n'), CAT[0]);
  assert.equal(block(text, DET[1].id).context.join('\n'), CAT[1]);
  assert.notEqual(answerOf(text, DET[0].id), answerOf(text, DET[1].id));
});

test('4. a mixed case: one explained, one declined', () => {
  const { text } = record(withCategories([0, 2], { 0: 'Health explanation.', 2: 'decline' }));
  assert.equal(answerOf(text, DET[0].id), 'Health explanation.');
  assert.equal(answerOf(text, DET[2].id), VULNERABILITY_DECLINE_LABEL);
  assert.equal(block(text, DET[1].id), null);
  assert.equal(block(text, DET[3].id), null);
});

test('5. all four selected, each answered independently', () => {
  const answers = { 0: 'One.', 1: 'decline', 2: 'Three.', 3: 'Four.' };
  const r = valid(withCategories([0, 1, 2, 3], answers));
  assert.deepEqual(r.value.fosVulnerabilities, CAT.slice(0, 4), 'every category preserved, in order');

  const { text } = record(withCategories([0, 1, 2, 3], answers));
  assert.equal(answerOf(text, DET[0].id), 'One.');
  assert.equal(answerOf(text, DET[1].id), VULNERABILITY_DECLINE_LABEL);
  assert.equal(answerOf(text, DET[2].id), 'Three.');
  assert.equal(answerOf(text, DET[3].id), 'Four.');
  // Four separate blocks, each naming its own circumstance.
  DET.forEach((d, i) => assert.equal(block(text, d.id).context.join('\n'), CAT[i]));
});

test('5b. the selection block still names every category as selected or not', () => {
  const { text } = record(withCategories([1, 3]));
  const answer = answerOf(text, 'FOS_VULNERABILITY');
  assert.ok(answer.includes(`SELECTED: ${CAT[1]}`));
  assert.ok(answer.includes(`SELECTED: ${CAT[3]}`));
  assert.ok(answer.includes(`not selected: ${CAT[0]}`));
  assert.ok(answer.includes(`not selected: ${CAT[2]}`));
  assert.ok(answer.includes(`not selected: ${VULNERABILITY_NONE}`));
  assert.equal(answer.split('\n').length, 5, 'one line per option, never merged');
});

test('6. a selected category must be answered one way or the other, never both', () => {
  for (let i = 0; i < 4; i += 1) {
    const chosen = { fosVulnerabilities: [CAT[i]] };
    assert.ok(validateSubmission(sub(chosen)).errors[DET[i].field], `${DET[i].id}: neither answer given`);
    assert.match(
      invalid({ ...chosen, [DET[i].field]: 'x', [DET[i].declinedField]: true })[DET[i].field],
      /not both/,
      `${DET[i].id}: both answers given`
    );
  }
});

test('7. unticking a category makes its answer inadmissible', () => {
  // Health selected, but a life-event answer left behind.
  const stale = invalid({ ...withCategories([0]), [DET[1].field]: 'stale text' });
  assert.equal(stale[DET[1].field], 'This question was not asked');
  const staleFlag = invalid({ ...withCategories([0]), [DET[1].declinedField]: true });
  assert.equal(staleFlag[DET[1].field], 'This question was not asked');
});

test('8. "None of these apply" clears every category follow-up', () => {
  const r = valid({ fosVulnerabilities: [VULNERABILITY_NONE] });
  for (const d of DET) {
    assert.equal(r.value[d.field], '', `${d.field} empty`);
    assert.equal(r.value[d.declinedField], false, `${d.declinedField} false`);
  }
  const { text } = record({ fosVulnerabilities: [VULNERABILITY_NONE] });
  for (const d of DET) assert.equal(block(text, d.id), null, `${d.id} must not appear`);
  assert.ok(answerOf(text, 'FOS_VULNERABILITY').includes(`SELECTED: ${VULNERABILITY_NONE}`),
    'the "none" answer is stated explicitly');
});

test('8b. a detail supplied against "None of these apply" is rejected', () => {
  for (const d of DET) {
    assert.equal(invalid({ [d.field]: 'smuggled' })[d.field], 'This question was not asked');
    assert.equal(invalid({ [d.declinedField]: true })[d.field], 'This question was not asked');
  }
});

test('9. "None of these apply" cannot be combined with a category', () => {
  for (let i = 0; i < 4; i += 1) {
    const errors = invalid({ fosVulnerabilities: [CAT[i], VULNERABILITY_NONE] });
    assert.match(errors.fosVulnerabilities, /None of these apply/);
  }
});

test('9b. stale values are forced empty, so nothing can leak into the record', () => {
  const r = validateSubmission(sub({ ...withCategories([0]), [DET[1].field]: 'stale text' }));
  assert.equal(r.value[DET[1].field], '');
  assert.equal(r.value[DET[1].declinedField], false);
});

// ============ 10. the removed combined fields =============================

test('10. the removed combined vulnerability fields are rejected as unknown', () => {
  const removed = ['fosVulnerabilityExplanation', 'fosVulnerabilityExplanationDeclined', 'fosVulnerabilityDetail'];
  for (const field of removed) {
    const r = validateSubmission(sub({ ...withCategories([0]), [field]: 'x' }));
    assert.equal(r.errors._form, 'Unknown field', `${field} must be rejected`);
  }
});

test('10b. the removed questions appear nowhere in the app', () => {
  const gone = [
    'Please briefly tell us what applied to you.',
    'anything else you’d like to tell us about this',
    // Bare field names: any surviving reference at all, not just a quoted one.
    // An earlier version of this list matched only `fosVulnerabilityDetail"`
    // and so missed a dead validator entry that used `fosVulnerabilityDetail:`.
    'fosVulnerabilityExplanation',
    'fosVulnerabilityDetail'
  ];
  // Checked against what actually runs. Comments are stripped first, because
  // the code deliberately names these fields where it explains why they are no
  // longer accepted, and that explanation is worth keeping.
  const stripComments = (src) => src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const sources = {
    'public/index.html': html,
    'public/app.js': app,
    'lib/questions-fos.js': fs.readFileSync('lib/questions-fos.js', 'utf8'),
    'lib/validation.js': fs.readFileSync('lib/validation.js', 'utf8')
  };
  for (const [name, source] of Object.entries(sources)) {
    const live = stripComments(source);
    for (const phrase of gone) {
      assert.ok(!live.includes(phrase), `${name} still references: ${phrase}`);
    }
  }
  // No block id survives for either, and neither field is accepted.
  const ids = FOS_QUESTIONS.map((q) => q.id);
  assert.ok(!ids.includes('FOS_VULNERABILITY_EXPLANATION'));
  assert.ok(!ids.includes('FOS_VULNERABILITY_DETAIL'));
  const { FOS_FIELDS } = require('../lib/validation');
  for (const f of ['fosVulnerabilityExplanation', 'fosVulnerabilityExplanationDeclined', 'fosVulnerabilityDetail']) {
    assert.ok(!FOS_FIELDS.includes(f), `${f} must not be an accepted field`);
  }
});

// ============================ 5-7. savings ================================

test('5. savings Yes with an amount is accepted and recorded both ways', () => {
  const { text } = record({ fosSavings: 'Yes', fosSavingsAmount: '£1,250.50' });
  assert.equal(questionOf(text, 'FOS_SAVINGS_AMOUNT'), 'Approximately how much did you have in savings?');
  assert.equal(answerOf(text, 'FOS_SAVINGS_AMOUNT'), '£1,250.50 [value: 1250.50]');
});

test('6. savings Yes with the unknown alternative is recorded as itself, not as zero', () => {
  const { text } = record({ fosSavings: 'Yes', fosSavingsAmountUnknown: true });
  const answer = answerOf(text, 'FOS_SAVINGS_AMOUNT');
  assert.equal(answer, UNKNOWN_LABEL);
  assert.ok(!answer.includes('£0'), 'no fabricated zero');
  assert.ok(!answer.includes(NOT_PROVIDED), 'not recorded as a blank');
});

test('7. savings No omits the follow-up entirely', () => {
  const { text } = record({ fosSavings: 'No' });
  assert.equal(block(text, 'FOS_SAVINGS_AMOUNT'), null);
  assert.equal(answerOf(text, 'FOS_SAVINGS'), 'No');
});

test('7b. savings contradictions are rejected', () => {
  assert.equal(invalid({ fosSavings: 'No', fosSavingsAmount: '500' }).fosSavingsAmount, 'This question was not asked');
  assert.equal(invalid({ fosSavings: 'No', fosSavingsAmountUnknown: true }).fosSavingsAmount, 'This question was not asked');
  assert.ok(invalid({ fosSavings: 'Yes' }).fosSavingsAmount, 'Yes with neither answer');
  assert.match(invalid({ fosSavings: 'Yes', fosSavingsAmount: '500', fosSavingsAmountUnknown: true }).fosSavingsAmount, /not both/);
});

// ============================ 8-10. dependants ============================

test('8. dependants Yes with a count is accepted and recorded', () => {
  const { text } = record({ fosDependants: 'Yes', fosDependantsCount: '3' });
  assert.equal(questionOf(text, 'FOS_DEPENDANTS_COUNT'), 'How many dependants did you have?');
  assert.equal(answerOf(text, 'FOS_DEPENDANTS_COUNT'), '3');
});

test('9. dependants Yes with the unknown alternative is recorded as itself', () => {
  const { text } = record({ fosDependants: 'Yes', fosDependantsCountUnknown: true });
  const answer = answerOf(text, 'FOS_DEPENDANTS_COUNT');
  assert.equal(answer, UNKNOWN_LABEL);
  assert.ok(!answer.includes('0'), 'no fabricated zero');
});

test('10. dependants No omits the follow-up entirely', () => {
  const { text } = record({ fosDependants: 'No' });
  assert.equal(block(text, 'FOS_DEPENDANTS_COUNT'), null);
});

test('10b. the count must be a whole number of at least one, since it follows a Yes', () => {
  assert.match(invalid({ fosDependants: 'Yes', fosDependantsCount: '0' }).fosDependantsCount, /1 or more/);
  for (const bad of ['-1', '2.5', 'two', '1e2', '999']) {
    assert.ok(invalid({ fosDependants: 'Yes', fosDependantsCount: bad }).fosDependantsCount, `must reject ${bad}`);
  }
  valid({ fosDependants: 'Yes', fosDependantsCount: '1' });
});

test('10c. dependants contradictions are rejected', () => {
  assert.equal(invalid({ fosDependants: 'No', fosDependantsCount: '2' }).fosDependantsCount, 'This question was not asked');
  assert.equal(invalid({ fosDependants: 'No', fosDependantsCountUnknown: true }).fosDependantsCount, 'This question was not asked');
  assert.ok(invalid({ fosDependants: 'Yes' }).fosDependantsCount);
  assert.match(invalid({ fosDependants: 'Yes', fosDependantsCount: '2', fosDependantsCountUnknown: true }).fosDependantsCount, /not both/);
});

// ============================ 11-13. further lending ======================

const FURTHER_ALL = {
  fosFurtherLending: 'Yes',
  fosFurtherLendingType: 'Credit card',
  fosFurtherLendingLender: 'Barclays',
  fosFurtherLendingAmount: '2000'
};

test('11. further lending Yes with all three answers, each under its own question', () => {
  const { text } = record(FURTHER_ALL);
  assert.equal(questionOf(text, 'FOS_FURTHER_LENDING_TYPE'), 'What type of further lending did you apply for?');
  assert.equal(answerOf(text, 'FOS_FURTHER_LENDING_TYPE'), 'Credit card');
  assert.equal(questionOf(text, 'FOS_FURTHER_LENDING_LENDER'), 'Who was the further lending with?');
  assert.equal(answerOf(text, 'FOS_FURTHER_LENDING_LENDER'), 'Barclays');
  assert.equal(questionOf(text, 'FOS_FURTHER_LENDING_AMOUNT'), 'Approximately how much was the further lending for?');
  assert.equal(answerOf(text, 'FOS_FURTHER_LENDING_AMOUNT'), '£2,000.00 [value: 2000]');
});

test('12. knowing the lender but not the amount does not force unknown on the others', () => {
  // The worked example from the brief: lender Barclays, type credit card,
  // amount not known.
  const { text } = record({
    fosFurtherLending: 'Yes',
    fosFurtherLendingType: 'Credit card',
    fosFurtherLendingLender: 'Barclays',
    fosFurtherLendingAmountUnknown: true
  });
  assert.equal(answerOf(text, 'FOS_FURTHER_LENDING_TYPE'), 'Credit card');
  assert.equal(answerOf(text, 'FOS_FURTHER_LENDING_LENDER'), 'Barclays');
  assert.equal(answerOf(text, 'FOS_FURTHER_LENDING_AMOUNT'), UNKNOWN_LABEL);
});

test('12b. every other mix of known and unknown is accepted', () => {
  const mixes = [
    { fosFurtherLendingTypeUnknown: true, fosFurtherLendingLender: 'Barclays', fosFurtherLendingAmount: '500' },
    { fosFurtherLendingType: 'Loan', fosFurtherLendingLenderUnknown: true, fosFurtherLendingAmount: '500' },
    { fosFurtherLendingType: 'Loan', fosFurtherLendingLender: 'Barclays', fosFurtherLendingAmountUnknown: true },
    { fosFurtherLendingTypeUnknown: true, fosFurtherLendingLenderUnknown: true, fosFurtherLendingAmountUnknown: true }
  ];
  for (const mix of mixes) valid({ fosFurtherLending: 'Yes', ...mix });
});

test('13. further lending No omits all three follow-ups', () => {
  const { text } = record({ fosFurtherLending: 'No' });
  for (const id of ['FOS_FURTHER_LENDING_TYPE', 'FOS_FURTHER_LENDING_LENDER', 'FOS_FURTHER_LENDING_AMOUNT']) {
    assert.equal(block(text, id), null, `${id} must not appear`);
  }
});

test('13b. further lending contradictions are rejected, field by field', () => {
  const fields = [
    ['fosFurtherLendingType', 'fosFurtherLendingTypeUnknown', 'Credit card'],
    ['fosFurtherLendingLender', 'fosFurtherLendingLenderUnknown', 'Barclays'],
    ['fosFurtherLendingAmount', 'fosFurtherLendingAmountUnknown', '2000']
  ];
  for (const [valueField, unknownField, sample] of fields) {
    assert.equal(invalid({ [valueField]: sample })[valueField], 'This question was not asked',
      `${valueField} supplied against a No`);
    assert.equal(invalid({ [unknownField]: true })[valueField], 'This question was not asked',
      `${unknownField} ticked against a No`);
    assert.match(invalid({ ...FURTHER_ALL, [unknownField]: true })[valueField], /not both/);
  }
  // Yes with nothing at all fails on all three independently.
  const errors = invalid({ fosFurtherLending: 'Yes' });
  assert.ok(errors.fosFurtherLendingType && errors.fosFurtherLendingLender && errors.fosFurtherLendingAmount);
});

// ============================ 14. review screen ===========================

test('14. the review screen renders every conditional answer', () => {
  // The review builder is client-side, so this asserts the wiring: each
  // follow-up question appears, gated on the answer that opens it, and each
  // reads its own alternative flag.
  const expectations = [
    ['VULNERABILITY_DETAIL_QUESTION', 'VULNERABILITY_DETAILS'],
    ["'Approximately how much did you have in savings?'", 'fosSavingsAmountUnknown'],
    ["'How many dependants did you have?'", 'fosDependantsCountUnknown'],
    ["'What type of further lending did you apply for?'", 'fosFurtherLendingTypeUnknown'],
    ["'Who was the further lending with?'", 'fosFurtherLendingLenderUnknown'],
    ["'Approximately how much was the further lending for?'", 'fosFurtherLendingAmountUnknown']
  ];
  const review = app.slice(app.indexOf('function renderReview'));
  for (const [question, flag] of expectations) {
    assert.ok(review.includes(question), `review must show ${question}`);
    assert.ok(review.includes(flag), `review must read ${flag}`);
  }
  assert.ok(review.includes('d.fosVulnerabilities.includes(category)'), 'each category row is gated on that category');
  assert.ok(review.includes("d.fosSavings === 'Yes'"), 'savings follow-up gated on Yes');
  assert.ok(review.includes("d.fosDependants === 'Yes'"), 'dependants follow-up gated on Yes');
  assert.ok(review.includes("d.fosFurtherLending === 'Yes'"), 'further lending follow-ups gated on Yes');
});

test('14b. selected categories reach the review as a list, not one merged string', () => {
  const review = app.slice(app.indexOf('function renderReview'));
  assert.ok(review.includes('d.fosVulnerabilities.slice()'), 'the array is passed through intact');
  assert.ok(!review.includes('d.fosVulnerabilities.join('), 'categories are never merged into one string');
  assert.ok(app.includes('Array.isArray(v)'), 'the renderer draws a list for an array answer');
});

test('14c. every field the form collects is sent, so nothing can silently vanish', () => {
  const collect = app.slice(app.indexOf('function collect()'), app.indexOf('function renderReview'));
  const newFields = [
    'fosSavingsAmount', 'fosSavingsAmountUnknown',
    'fosDependantsCount', 'fosDependantsCountUnknown',
    'fosFurtherLendingType', 'fosFurtherLendingTypeUnknown',
    'fosFurtherLendingLender', 'fosFurtherLendingLenderUnknown',
    'fosFurtherLendingAmount', 'fosFurtherLendingAmountUnknown'
  ];
  for (const f of newFields) assert.ok(collect.includes(f), `collect() must send ${f}`);
  assert.ok(collect.includes('VULNERABILITY_DETAILS.forEach'), 'the four category details are collected too');
});

// ============================ 15-16. email record =========================

test('15. every conditional answer is reproduced in the record when its branch is open', () => {
  const { text } = record({
    ...withCategories([0, 2], { 0: 'Health and money.', 2: 'decline' }),
    fosSavings: 'Yes', fosSavingsAmount: '800',
    fosDependants: 'Yes', fosDependantsCount: '2',
    ...FURTHER_ALL
  });
  const expected = {
    FOS_VULNERABILITY_HEALTH_DETAIL: 'Health and money.',
    FOS_SAVINGS_AMOUNT: '£800.00 [value: 800]',
    FOS_DEPENDANTS_COUNT: '2',
    FOS_FURTHER_LENDING_TYPE: 'Credit card',
    FOS_FURTHER_LENDING_LENDER: 'Barclays',
    FOS_FURTHER_LENDING_AMOUNT: '£2,000.00 [value: 2000]'
  };
  for (const [id, answer] of Object.entries(expected)) {
    assert.equal(answerOf(text, id), answer, `${id} answer`);
  }
});

test('16. the full question is reproduced immediately before every new answer', () => {
  const { text } = record({
    ...withCategories([0], { 0: 'x' }),
    fosSavings: 'Yes', fosSavingsAmountUnknown: true,
    fosDependants: 'Yes', fosDependantsCountUnknown: true,
    ...FURTHER_ALL
  });
  const lines = text.split('\n');
  const ids = [
    'FOS_VULNERABILITY_HEALTH_DETAIL', 'FOS_SAVINGS_AMOUNT', 'FOS_DEPENDANTS_COUNT',
    'FOS_FURTHER_LENDING_TYPE', 'FOS_FURTHER_LENDING_LENDER', 'FOS_FURTHER_LENDING_AMOUNT'
  ];
  for (const id of ids) {
    const q = FOS_QUESTIONS.find((x) => x.id === id);
    assert.equal(questionOf(text, id), q.question, `${id} reproduces its approved question verbatim`);
    const start = lines.findIndex((l) => l.startsWith(`[${id}]`));
    const qLine = lines.indexOf('QUESTION:', start);
    const aLine = lines.indexOf('CLIENT ANSWER:', start);
    assert.ok(qLine > start && aLine > qLine, `${id}: question comes before the answer`);
  }
});

test('16b. the new ids are stable and machine-readable', () => {
  const NEW = DET.map((d) => d.id).concat([
    'FOS_SAVINGS_AMOUNT', 'FOS_DEPENDANTS_COUNT',
    'FOS_FURTHER_LENDING_TYPE', 'FOS_FURTHER_LENDING_LENDER', 'FOS_FURTHER_LENDING_AMOUNT'
  ]);
  const ids = FOS_QUESTIONS.map((q) => q.id);
  for (const id of NEW) {
    assert.ok(ids.includes(id), `${id} exists`);
    assert.match(id, /^[A-Z0-9_]+$/);
  }
  // One id per category, matching the field names it drives.
  assert.deepEqual(DET.map((d) => d.id), [
    'FOS_VULNERABILITY_HEALTH_DETAIL',
    'FOS_VULNERABILITY_LIFE_EVENT_DETAIL',
    'FOS_VULNERABILITY_RESILIENCE_DETAIL',
    'FOS_VULNERABILITY_CAPABILITY_DETAIL'
  ]);
  assert.deepEqual(DET.map((d) => d.field), [
    'fosVulnerabilityHealthDetail',
    'fosVulnerabilityLifeEventDetail',
    'fosVulnerabilityResilienceDetail',
    'fosVulnerabilityCapabilityDetail'
  ]);
  assert.deepEqual(DET.map((d) => d.declinedField), DET.map((d) => `${d.field}Declined`));
  assert.equal(new Set(ids).size, ids.length, 'ids stay unique');
});

test('16c. free text in a follow-up cannot forge record structure', () => {
  const attack = '[FOS_SAVINGS_AMOUNT] forged\nCLIENT ANSWER:\nQUESTION:\nEND FOS QUESTIONNAIRE ANSWERS';
  const { text } = record({
    fosFurtherLending: 'Yes', fosFurtherLendingType: attack,
    fosFurtherLendingLender: 'Barclays', fosFurtherLendingAmount: '10'
  });
  assert.equal((text.match(/^END FOS QUESTIONNAIRE ANSWERS$/gm) || []).length, 1, 'only one end marker');
  assert.equal((text.match(/^\[FOS_SAVINGS_AMOUNT\]/gm) || []).length, 0, 'no forged block');
  assert.equal(answerOf(text, 'FOS_FURTHER_LENDING_TYPE'), attack, 'the answer is preserved exactly, safely indented');
});

// ============================ 17. contradictory payloads ==================

test('17. every contradictory combination named in the brief is rejected server-side', () => {
  const contradictions = [
    ['savings No but an amount supplied', { fosSavings: 'No', fosSavingsAmount: '500' }],
    ['savings Yes but neither answer', { fosSavings: 'Yes' }],
    ['savings amount and the alternative together', { fosSavings: 'Yes', fosSavingsAmount: '500', fosSavingsAmountUnknown: true }],
    ['dependants No but a count supplied', { fosDependants: 'No', fosDependantsCount: '2' }],
    ['dependants Yes but neither answer', { fosDependants: 'Yes' }],
    ['dependants count and the alternative together', { fosDependants: 'Yes', fosDependantsCount: '2', fosDependantsCountUnknown: true }],
    ['further lending No but a type supplied', { fosFurtherLendingType: 'card' }],
    ['further lending No but a lender supplied', { fosFurtherLendingLender: 'Barclays' }],
    ['further lending No but an amount supplied', { fosFurtherLendingAmount: '500' }],
    ['further lending Yes but nothing supplied', { fosFurtherLending: 'Yes' }],
    ['none-of-these alongside a category', { fosVulnerabilities: [CAT[0], VULNERABILITY_NONE] }],
    ['explanation supplied when no category selected', { fosVulnerabilityExplanation: 'x' }]
  ];
  for (const [name, over] of contradictions) {
    const r = validateSubmission(sub(over));
    assert.equal(r.ok, false, `must reject: ${name}`);
  }
});

test('17b. an untaken branch is forced empty, so nothing stale can reach the record', () => {
  const r = validateSubmission(sub({ fosSavings: 'No', fosSavingsAmount: '500' }));
  assert.equal(r.value.fosSavingsAmount, '');
  assert.equal(r.value.fosSavingsAmountUnknown, false);
});

test('17c. unknown fields are still rejected outright', () => {
  const r = validateSubmission(sub({ fosSavingsAmountGuess: '500' }));
  assert.equal(r.errors._form, 'Unknown field');
});

test('17d. the alternative flags must be real booleans', () => {
  const flags = DET.map((d) => d.declinedField).concat([
    'fosSavingsAmountUnknown', 'fosDependantsCountUnknown',
    'fosFurtherLendingTypeUnknown', 'fosFurtherLendingLenderUnknown', 'fosFurtherLendingAmountUnknown'
  ]);
  for (const flag of flags) {
    // A category flag is only reachable once that category is selected.
    const detail = DET.find((d) => d.declinedField === flag);
    const open = detail ? { fosVulnerabilities: [detail.category], [detail.field]: 'x' } : {};
    const r = validateSubmission(sub({ ...open, [flag]: 'yes' }));
    assert.equal(r.errors[flag], 'Invalid choice', `${flag} must reject a string`);
  }
});

// ============================ 18. logging =================================

test('18. no follow-up answer can reach a log', () => {
  const sources = ['api/submit.js', 'lib/validation.js', 'lib/email-template.js', 'lib/questions-fos.js']
    .map((f) => fs.readFileSync(f, 'utf8'));
  const forbidden = DET.map((d) => d.field).concat([
    'fosSavingsAmount', 'fosDependantsCount',
    'fosFurtherLendingType', 'fosFurtherLendingLender', 'fosFurtherLendingAmount'
  ]);
  for (const source of sources) {
    const calls = source.match(/console\s*\.\s*\w+\s*\([\s\S]*?\)/g) || [];
    for (const call of calls) {
      for (const field of forbidden) {
        assert.ok(!call.includes(field), `a console call references ${field}`);
      }
    }
  }
});

// ============================ 19. both modes ==============================

test('19. both questionnaire modes accept the follow-ups', () => {
  const answers = {
    ...withCategories([0, 1], { 0: 'Health.', 1: 'decline' }),
    fosSavings: 'Yes', fosSavingsAmount: '800',
    fosDependants: 'Yes', fosDependantsCountUnknown: true,
    ...FURTHER_ALL
  };
  const fosOnly = validateSubmission(sub(answers));
  assert.deepEqual(fosOnly.errors, {});

  const both = validateSubmission(sub({ mode: MODE_TIMEBAR_AND_FOS, ...TIMEBAR, ...answers }));
  assert.deepEqual(both.errors, {});

  // The combined record carries the Time-Bar section and every FOS follow-up.
  const rec = buildEmail(both.value, { submissionId: 'test', completedAt: '2026-09-15T12:00:00+01:00' });
  assert.ok(rec.text.includes('TIME-BAR QUESTIONNAIRE RESPONSES'));
  for (const id of [DET[0].id, DET[1].id, 'FOS_SAVINGS_AMOUNT', 'FOS_DEPENDANTS_COUNT',
    'FOS_FURTHER_LENDING_TYPE', 'FOS_FURTHER_LENDING_LENDER', 'FOS_FURTHER_LENDING_AMOUNT']) {
    assert.ok(block(rec.text, id), `${id} present in the combined record`);
  }

  // FOS-only still omits the Time-Bar section entirely.
  const fosRec = buildEmail(fosOnly.value, { submissionId: 'test' });
  assert.ok(!fosRec.text.includes('TIME-BAR QUESTIONNAIRE RESPONSES'));
});

// ============================ form wiring =================================

test('the form offers every follow-up control, hidden until its branch opens', () => {
  for (const d of DET) {
    assert.match(html, new RegExp(`<div id="${d.field}Block" class="conditional category-detail" hidden>`),
      `${d.field} follow-up starts hidden, beneath its own category`);
  }
  for (const id of ['fosSavingsAmountBlock', 'fosDependantsCountBlock', 'fosFurtherLendingBlock']) {
    assert.match(html, new RegExp(`<div id="${id}" class="conditional" hidden>`), `${id} starts hidden`);
  }
  const controls = DET.flatMap((d) => [d.field, d.declinedField]).concat([
    'fosSavingsAmount', 'fosSavingsAmountUnknown',
    'fosDependantsCount', 'fosDependantsCountUnknown',
    'fosFurtherLendingType', 'fosFurtherLendingTypeUnknown',
    'fosFurtherLendingLender', 'fosFurtherLendingLenderUnknown',
    'fosFurtherLendingAmount', 'fosFurtherLendingAmountUnknown'
  ]);
  for (const name of controls) assert.ok(html.includes(`name="${name}"`), `${name} control exists`);
});

test('closing a branch clears the answers inside it', () => {
  assert.ok(app.includes('function updateBranches'), 'branches are driven from one place');
  const fn = app.slice(app.indexOf('function updateBranches'));
  assert.ok(fn.includes("el.value = ''"), 'values are cleared when a branch closes');
  assert.ok(fn.includes('el.checked = false'), 'flags are cleared when a branch closes');
});

test('every value control is paired with its alternative in both directions', () => {
  const pairs = app.slice(app.indexOf('const EITHER_OR'), app.indexOf('const BRANCHES'));
  for (const pair of [
    'fosSavingsAmount', 'fosDependantsCount',
    'fosFurtherLendingType', 'fosFurtherLendingLender', 'fosFurtherLendingAmount'
  ]) {
    assert.ok(pairs.includes(pair), `${pair} is paired with its alternative`);
  }
  assert.ok(pairs.includes('VULNERABILITY_DETAILS.map'), 'the four category pairs are derived too');
  const fn = app.slice(app.indexOf('function enforceEitherOr'));
  assert.ok(fn.includes("valueEl.value = ''"), 'ticking the alternative clears the value');
  assert.ok(fn.includes('unknownEl.checked = false'), 'entering a value unticks the alternative');
});
