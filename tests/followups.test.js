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
  FOS_QUESTIONS, VULNERABILITY_VALUES, VULNERABILITY_NONE,
  UNKNOWN_LABEL, VULNERABILITY_DECLINE_LABEL
} = require('../lib/questions-fos');

const html = fs.readFileSync('public/index.html', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');

const CAT = VULNERABILITY_VALUES;

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
  const out = { id, question: [], answer: [], options: [] };
  let marker = null;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\[[A-Z0-9_]+\]/.test(line)) break;
    const mk = /^(QUESTION|NOTE|OPTIONS|CLIENT ANSWER):$/.exec(line);
    if (mk) { marker = mk[1]; continue; }
    if (!/^ {2}/.test(line)) { marker = null; continue; }
    const content = line.slice(2);
    if (marker === 'QUESTION') out.question.push(content);
    if (marker === 'OPTIONS' && content.startsWith('• ')) out.options.push(content.slice(2));
    if (marker === 'CLIENT ANSWER') out.answer.push(content);
  }
  return out;
}
const answerOf = (text, id) => { const b = block(text, id); return b ? b.answer.join('\n') : null; };
const questionOf = (text, id) => { const b = block(text, id); return b ? b.question.join('\n') : null; };

// ============================ 1. multiple categories preserved ============

test('1. every selected vulnerability category is preserved individually', () => {
  const four = CAT.slice(0, 4);
  const r = valid({ fosVulnerabilities: four, fosVulnerabilityExplanation: 'All four applied.' });
  assert.deepEqual(r.value.fosVulnerabilities, four, 'all four survive validation, in questionnaire order');

  const { text } = record({ fosVulnerabilities: four, fosVulnerabilityExplanation: 'All four applied.' });
  const answer = answerOf(text, 'FOS_VULNERABILITY');
  for (const c of four) {
    assert.ok(answer.includes(`SELECTED: ${c}`), `record must name ${c.slice(0, 40)} individually`);
  }
  assert.ok(answer.includes(`not selected: ${VULNERABILITY_NONE}`));
  // Not collapsed into one generic answer.
  assert.equal(answer.split('\n').length, 5, 'one line per option, never merged');
});

test('1b. two categories out of four are each named, and the rest marked not selected', () => {
  const { text } = record({ fosVulnerabilities: [CAT[1], CAT[3]], fosVulnerabilityExplanation: 'Two applied.' });
  const answer = answerOf(text, 'FOS_VULNERABILITY');
  assert.ok(answer.includes(`SELECTED: ${CAT[1]}`));
  assert.ok(answer.includes(`SELECTED: ${CAT[3]}`));
  assert.ok(answer.includes(`not selected: ${CAT[0]}`));
  assert.ok(answer.includes(`not selected: ${CAT[2]}`));
});

// ============================ 2-3. explanation and decline ================

test('2. a free-text explanation is required once a category is selected, and recorded', () => {
  assert.ok(invalid({ fosVulnerabilities: [CAT[0]] }).fosVulnerabilityExplanation, 'neither answer given');
  const { text } = record({ fosVulnerabilities: [CAT[0]], fosVulnerabilityExplanation: 'I was unwell for months.' });
  assert.equal(questionOf(text, 'FOS_VULNERABILITY_EXPLANATION'), 'Please briefly tell us what applied to you.');
  assert.equal(answerOf(text, 'FOS_VULNERABILITY_EXPLANATION'), 'I was unwell for months.');
});

test('3. the decline alternative is accepted and recorded as itself', () => {
  const { text, html: htmlPart } = record({ fosVulnerabilities: [CAT[0], CAT[1]], fosVulnerabilityExplanationDeclined: true });
  assert.equal(answerOf(text, 'FOS_VULNERABILITY_EXPLANATION'), VULNERABILITY_DECLINE_LABEL);
  assert.ok(!answerOf(text, 'FOS_VULNERABILITY_EXPLANATION').includes(NOT_PROVIDED), 'never recorded as a blank');
  // The label carries an apostrophe, so the HTML part escapes it. Compare the
  // escaped form rather than asserting the raw string is present unescaped.
  assert.ok(htmlPart.includes(esc(VULNERABILITY_DECLINE_LABEL)));
  assert.ok(!htmlPart.includes(VULNERABILITY_DECLINE_LABEL), 'the raw apostrophe never reaches the HTML unescaped');
});

test('3b. text and the decline alternative are mutually exclusive', () => {
  const errors = invalid({ fosVulnerabilities: [CAT[0]], fosVulnerabilityExplanation: 'x', fosVulnerabilityExplanationDeclined: true });
  assert.match(errors.fosVulnerabilityExplanation, /not both/);
});

test('3c. one explanation covers every selected category - none is asked for separately', () => {
  valid({ fosVulnerabilities: CAT.slice(0, 4), fosVulnerabilityExplanation: 'One combined answer.' });
  const explanationBlocks = FOS_QUESTIONS.filter((q) => q.id.startsWith('FOS_VULNERABILITY_EXPLANATION'));
  assert.equal(explanationBlocks.length, 1, 'exactly one explanation question exists');
});

// ============================ 4. None-of-these exclusivity ================

test('4. "None of these apply" cannot be combined with a category', () => {
  for (let i = 0; i < 4; i += 1) {
    const errors = invalid({ fosVulnerabilities: [CAT[i], VULNERABILITY_NONE] });
    assert.match(errors.fosVulnerabilities, /None of these apply/);
  }
});

test('4b. "None of these apply" alone closes the explanation follow-up', () => {
  const r = valid({ fosVulnerabilities: [VULNERABILITY_NONE] });
  assert.equal(r.value.fosVulnerabilityExplanation, '');
  assert.equal(r.value.fosVulnerabilityExplanationDeclined, false);
  const { text } = record({ fosVulnerabilities: [VULNERABILITY_NONE] });
  assert.equal(block(text, 'FOS_VULNERABILITY_EXPLANATION'), null, 'the follow-up is not in the record at all');
  assert.equal(answerOf(text, 'FOS_VULNERABILITY'), [
    ...CAT.slice(0, 4).map((c) => `not selected: ${c}`),
    `SELECTED: ${VULNERABILITY_NONE}`
  ].join('\n'));
});

test('4c. an explanation supplied against "None of these apply" is rejected', () => {
  assert.equal(invalid({ fosVulnerabilityExplanation: 'smuggled' }).fosVulnerabilityExplanation, 'This question was not asked');
  assert.equal(invalid({ fosVulnerabilityExplanationDeclined: true }).fosVulnerabilityExplanation, 'This question was not asked');
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
    ["'Please briefly tell us what applied to you.'", 'fosVulnerabilityExplanationDeclined'],
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
    'fosVulnerabilityExplanation', 'fosVulnerabilityExplanationDeclined',
    'fosSavingsAmount', 'fosSavingsAmountUnknown',
    'fosDependantsCount', 'fosDependantsCountUnknown',
    'fosFurtherLendingType', 'fosFurtherLendingTypeUnknown',
    'fosFurtherLendingLender', 'fosFurtherLendingLenderUnknown',
    'fosFurtherLendingAmount', 'fosFurtherLendingAmountUnknown'
  ];
  for (const f of newFields) assert.ok(collect.includes(f), `collect() must send ${f}`);
});

// ============================ 15-16. email record =========================

test('15. every conditional answer is reproduced in the record when its branch is open', () => {
  const { text } = record({
    fosVulnerabilities: [CAT[0], CAT[2]], fosVulnerabilityExplanation: 'Health and money.',
    fosSavings: 'Yes', fosSavingsAmount: '800',
    fosDependants: 'Yes', fosDependantsCount: '2',
    ...FURTHER_ALL
  });
  const expected = {
    FOS_VULNERABILITY_EXPLANATION: 'Health and money.',
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
    fosVulnerabilities: [CAT[0]], fosVulnerabilityExplanation: 'x',
    fosSavings: 'Yes', fosSavingsAmountUnknown: true,
    fosDependants: 'Yes', fosDependantsCountUnknown: true,
    ...FURTHER_ALL
  });
  const lines = text.split('\n');
  const ids = [
    'FOS_VULNERABILITY_EXPLANATION', 'FOS_SAVINGS_AMOUNT', 'FOS_DEPENDANTS_COUNT',
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
  const NEW = [
    'FOS_VULNERABILITY_EXPLANATION', 'FOS_SAVINGS_AMOUNT', 'FOS_DEPENDANTS_COUNT',
    'FOS_FURTHER_LENDING_TYPE', 'FOS_FURTHER_LENDING_LENDER', 'FOS_FURTHER_LENDING_AMOUNT'
  ];
  const ids = FOS_QUESTIONS.map((q) => q.id);
  for (const id of NEW) {
    assert.ok(ids.includes(id), `${id} exists`);
    assert.match(id, /^[A-Z0-9_]+$/);
  }
  // The source PDF's own free-text question keeps its original id, so that id
  // still means what it meant in every record already sent.
  assert.ok(ids.includes('FOS_VULNERABILITY_DETAIL'));
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
  const flags = [
    'fosVulnerabilityExplanationDeclined', 'fosSavingsAmountUnknown', 'fosDependantsCountUnknown',
    'fosFurtherLendingTypeUnknown', 'fosFurtherLendingLenderUnknown', 'fosFurtherLendingAmountUnknown'
  ];
  for (const flag of flags) {
    const r = validateSubmission(sub({ [flag]: 'yes' }));
    assert.equal(r.errors[flag], 'Invalid choice', `${flag} must reject a string`);
  }
});

// ============================ 18. logging =================================

test('18. no follow-up answer can reach a log', () => {
  const sources = ['api/submit.js', 'lib/validation.js', 'lib/email-template.js', 'lib/questions-fos.js']
    .map((f) => fs.readFileSync(f, 'utf8'));
  const forbidden = [
    'fosVulnerabilityExplanation', 'fosSavingsAmount', 'fosDependantsCount',
    'fosFurtherLendingType', 'fosFurtherLendingLender', 'fosFurtherLendingAmount'
  ];
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
    fosVulnerabilities: [CAT[0]], fosVulnerabilityExplanation: 'Health.',
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
  for (const id of ['FOS_VULNERABILITY_EXPLANATION', 'FOS_SAVINGS_AMOUNT', 'FOS_DEPENDANTS_COUNT',
    'FOS_FURTHER_LENDING_TYPE', 'FOS_FURTHER_LENDING_LENDER', 'FOS_FURTHER_LENDING_AMOUNT']) {
    assert.ok(block(rec.text, id), `${id} present in the combined record`);
  }

  // FOS-only still omits the Time-Bar section entirely.
  const fosRec = buildEmail(fosOnly.value, { submissionId: 'test' });
  assert.ok(!fosRec.text.includes('TIME-BAR QUESTIONNAIRE RESPONSES'));
});

// ============================ form wiring =================================

test('the form offers every follow-up control, hidden until its branch opens', () => {
  for (const id of ['fosVulnerabilityExplanationBlock', 'fosSavingsAmountBlock', 'fosDependantsCountBlock', 'fosFurtherLendingBlock']) {
    assert.match(html, new RegExp(`<div id="${id}" class="conditional" hidden>`), `${id} starts hidden`);
  }
  const controls = [
    'fosVulnerabilityExplanation', 'fosVulnerabilityExplanationDeclined',
    'fosSavingsAmount', 'fosSavingsAmountUnknown',
    'fosDependantsCount', 'fosDependantsCountUnknown',
    'fosFurtherLendingType', 'fosFurtherLendingTypeUnknown',
    'fosFurtherLendingLender', 'fosFurtherLendingLenderUnknown',
    'fosFurtherLendingAmount', 'fosFurtherLendingAmountUnknown'
  ];
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
    'fosVulnerabilityExplanation', 'fosSavingsAmount', 'fosDependantsCount',
    'fosFurtherLendingType', 'fosFurtherLendingLender', 'fosFurtherLendingAmount'
  ]) {
    assert.ok(pairs.includes(pair), `${pair} is paired with its alternative`);
  }
  const fn = app.slice(app.indexOf('function enforceEitherOr'));
  assert.ok(fn.includes("valueEl.value = ''"), 'ticking the alternative clears the value');
  assert.ok(fn.includes('unknownEl.checked = false'), 'entering a value unticks the alternative');
});
