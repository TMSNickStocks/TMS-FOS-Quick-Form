// The email reproduces approved legal wording. These tests assert that every
// string the email puts in the record appears verbatim in the form the client
// actually saw, so the record can never claim the client was asked something
// different from what was on screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  MODES, MODE_FOS_ONLY, MODE_TIMEBAR_AND_FOS, MODE_LABELS, adminFields,
  CONFIRMATION_HEADING, CONFIRMATION_STATEMENT,
  Q2_CONTEXT_PREFIX, Q2_CONTEXT_MIDDLE
} = require('../lib/questions');
const { TIMEBAR_QUESTIONS } = require('../lib/questions-timebar');
const {
  FOS_QUESTIONS, VULNERABILITY_OPTIONS, VULNERABILITY_VALUES, VULNERABILITY_NONE,
  EXAMPLES_INTRO, EXAMPLES_TOGGLE, UNKNOWN_DATE_LABEL, UNKNOWN_LABEL,
  VULNERABILITY_DECLINE_LABEL, INCOME_ROWS, OUTGOING_ROWS,
  INCOME_GROUP_LABEL, INCOME_AMOUNT_LABEL, OUTGOING_GROUP_LABEL, OUTGOING_AMOUNT_LABEL
} = require('../lib/questions-fos');

const html = fs.readFileSync('public/index.html', 'utf8');
const adminHtml = fs.readFileSync('public/admin.html', 'utf8');
// Compare on collapsed whitespace: the HTML wraps and indents, the strings do not.
const formText = html.replace(/\s+/g, ' ');
const inForm = (s) => formText.includes(s.replace(/\s+/g, ' '));

const ALL_QUESTIONS = TIMEBAR_QUESTIONS.concat(FOS_QUESTIONS);

// ------------------------------------------------------------- FOS wording

test('every FOS question, heading and note appears verbatim in the client form', () => {
  const missing = [];
  for (const q of FOS_QUESTIONS) {
    if (!inForm(q.question)) missing.push(`${q.id} question`);
    if (q.heading && !inForm(q.heading)) missing.push(`${q.id} heading`);
    if (q.note && !inForm(q.note)) missing.push(`${q.id} note: ${q.note}`);
  }
  assert.deepEqual(missing, [], 'wording in lib/questions-fos.js must match public/index.html exactly');
});

test('every vulnerability option appears verbatim in the client form', () => {
  for (const v of VULNERABILITY_VALUES) assert.ok(inForm(v), `vulnerability option missing: ${v}`);
  assert.equal(VULNERABILITY_VALUES.length, 5);
  assert.equal(VULNERABILITY_VALUES[4], VULNERABILITY_NONE, '"None of these apply" is the last option');
});

test('every "See examples" list appears verbatim in the client form', () => {
  const missing = [];
  assert.ok(inForm(EXAMPLES_TOGGLE), 'examples toggle label');
  assert.ok(inForm(EXAMPLES_INTRO), 'examples intro line');
  for (const opt of VULNERABILITY_OPTIONS) {
    for (const ex of opt.examples) if (!inForm(ex)) missing.push(`${opt.value.slice(0, 30)}: ${ex}`);
  }
  assert.deepEqual(missing, [], 'every example from the source PDF must appear in the form');
});

test('the example lists match the counts printed in the source PDF', () => {
  assert.deepEqual(VULNERABILITY_OPTIONS.map((o) => o.examples.length), [8, 11, 3, 6, 0]);
});

test('the financial group labels and every row label appear verbatim', () => {
  for (const s of [INCOME_GROUP_LABEL, INCOME_AMOUNT_LABEL, OUTGOING_GROUP_LABEL, OUTGOING_AMOUNT_LABEL]) {
    assert.ok(inForm(s), `group label missing: ${s}`);
  }
  for (const [label] of INCOME_ROWS.concat(OUTGOING_ROWS)) {
    assert.ok(inForm(label), `row label missing: ${label}`);
  }
});

test('every "I don\'t know" answer is one TMS approved, and no other exists', () => {
  // The approved set, and nothing else. A new alternative cannot be slipped in
  // without failing here, and none can quietly change its wording.
  const APPROVED = [
    ['FOS_VULNERABILITY_EXPLANATION', VULNERABILITY_DECLINE_LABEL],
    ['FOS_LENDING_START', UNKNOWN_DATE_LABEL],
    ['FOS_SAVINGS_AMOUNT', UNKNOWN_LABEL],
    ['FOS_DEPENDANTS_COUNT', UNKNOWN_LABEL],
    ['FOS_FURTHER_LENDING_TYPE', UNKNOWN_LABEL],
    ['FOS_FURTHER_LENDING_LENDER', UNKNOWN_LABEL],
    ['FOS_FURTHER_LENDING_AMOUNT', UNKNOWN_LABEL]
  ];
  assert.equal(UNKNOWN_DATE_LABEL, "I don't know the exact date");
  assert.equal(UNKNOWN_LABEL, 'I don’t know');
  assert.equal(VULNERABILITY_DECLINE_LABEL, 'I don’t know / prefer not to add details');

  const withAlternative = FOS_QUESTIONS.filter((q) => q.unknownField);
  assert.deepEqual(withAlternative.map((q) => [q.id, q.unknownLabel]), APPROVED);

  // Each alternative is rendered exactly once, and nothing else in the FOS
  // questions offers a "don't know" style answer. Counted over the markup with
  // comments stripped, so this measures what a client is actually shown.
  const fosMarkup = html
    .slice(html.indexOf('data-step="fos1"'), html.indexOf('data-step="review"'))
    .replace(/<!--[\s\S]*?-->/g, '');
  const occurrences = (fosMarkup.match(/don.t know/gi) || []).length;
  assert.equal(occurrences, APPROVED.length, 'one rendered alternative per approved question, and no more');
  for (const [, label] of APPROVED) assert.ok(inForm(label), `alternative missing from the form: ${label}`);
});

test('no other unapproved answer option was added to the FOS questions', () => {
  const banned = [/not sure/i, /prefer not to say/i, /unsure/i, /n\/a/i, /cannot remember/i];
  const fosMarkup = html.slice(html.indexOf('data-step="fos1"'), html.indexOf('data-step="review"'));
  for (const re of banned) assert.ok(!re.test(fosMarkup), `unapproved FOS answer option matching ${re}`);
});

test('no affordability total, sum or calculation is shown to the client', () => {
  const app = fs.readFileSync('public/app.js', 'utf8');
  for (const re of [/\btotal\b/i, /\bdisposable\b/i, /\baffordab/i, /\bsurplus\b/i, /reduce\s*\(/]) {
    assert.ok(!re.test(html), `client form performs or displays a calculation matching ${re}`);
    assert.ok(!re.test(app), `client script performs or displays a calculation matching ${re}`);
  }
});

// --------------------------------------------------------- Time-Bar wording

test('every Time-Bar question wording appears verbatim in the client form', () => {
  const missing = [];
  for (const q of TIMEBAR_QUESTIONS) {
    if (!inForm(q.question)) missing.push(`${q.id} question`);
    if (q.heading && !inForm(q.heading)) missing.push(`${q.id} heading`);
    for (const b of q.bullets || []) if (!inForm(b)) missing.push(`${q.id} bullet: ${b}`);
  }
  assert.deepEqual(missing, [], 'wording in lib/questions-timebar.js must match public/index.html exactly');
});

test('static Q2 context wording appears verbatim in the client form', () => {
  assert.ok(inForm(Q2_CONTEXT_PREFIX), 'Q2 records-show prefix');
  assert.ok(inForm(Q2_CONTEXT_MIDDLE), 'Q2 records-show middle');
  const q2 = TIMEBAR_QUESTIONS.find((q) => q.id === 'Q2');
  const paras = q2.context({ communicationEvent: 'X', communicationDate: 'Y' });
  for (const p of paras.slice(1)) assert.ok(inForm(p), `Q2 context paragraph missing: ${p.slice(0, 60)}`);
});

test('the approved awareness options are unchanged in the client form', () => {
  const options = [
    'When the basis of my current complaint was explained to me',
    'From information I found myself',
    'From another person or organisation',
    'I am not sure',
    'Other — please explain'
  ];
  for (const o of options) assert.ok(inForm(o), `awareness option missing: ${o}`);
  const { AWARENESS } = require('../lib/validation');
  assert.deepEqual(AWARENESS, options);
});

// -------------------------------------------------------------- structural

test('confirmation wording appears verbatim in the client form', () => {
  assert.ok(inForm(CONFIRMATION_HEADING), 'confirmation heading');
  assert.ok(inForm(CONFIRMATION_STATEMENT), 'confirmation statement');
});

test('question ids are unique and machine-safe across both questionnaires', () => {
  const ids = ALL_QUESTIONS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
  for (const id of ids) assert.match(id, /^[A-Z0-9_]+$/, `id ${id} must be A-Z, 0-9 and underscore only`);
});

test('every FOS field is a field the validator accepts in both modes', () => {
  const { validateSubmission } = require('../lib/validation');
  for (const mode of MODES) {
    const payload = {
      mode, reference: '200000001', clientName: 'A', lender: 'B', product: 'Loan',
      confirmation: true, website: '', startedAt: Date.now() - 9999
    };
    if (mode === MODE_TIMEBAR_AND_FOS) {
      payload.communicationEvent = 'C';
      payload.communicationDate = 'D';
      for (const q of TIMEBAR_QUESTIONS) payload[q.field] = '';
    }
    for (const q of FOS_QUESTIONS) {
      if (q.kind === 'group') { for (const [, f] of q.rows) payload[f] = ''; }
      else if (q.kind === 'multi') payload[q.field] = [];
      else payload[q.field] = '';
    }
    const r = validateSubmission(payload);
    assert.notEqual(r.errors._form, 'Unknown field', `${mode}: every question field must be a known submission field`);
  }
});

test('every question block maps to a control that exists in the form', () => {
  const missing = [];
  for (const q of ALL_QUESTIONS) {
    if (q.kind === 'group') {
      for (const [, f] of q.rows) if (!html.includes(`name="${f}"`)) missing.push(f);
    } else if (!html.includes(`name="${q.field}"`)) missing.push(q.field);
  }
  assert.deepEqual(missing, [], 'every question must have a matching form control');
});

// -------------------------------------------------------------------- mode

test('both modes are offered on the admin page with the approved labels', () => {
  assert.deepEqual(MODES, [MODE_FOS_ONLY, MODE_TIMEBAR_AND_FOS]);
  assert.equal(MODE_LABELS[MODE_FOS_ONLY], 'FOS questionnaire only');
  assert.equal(MODE_LABELS[MODE_TIMEBAR_AND_FOS], 'Time-Bar + FOS questionnaire');
  const adminText = adminHtml.replace(/\s+/g, ' ');
  assert.ok(adminText.includes('Questionnaire required:'), 'admin asks which questionnaire is required');
  for (const m of MODES) {
    assert.ok(adminText.includes(`value="${m}"`), `admin offers ${m}`);
    assert.ok(adminText.includes(MODE_LABELS[m]), `admin labels ${m}`);
  }
});

test('the Time-Bar admin fields are collected only for the combined questionnaire', () => {
  assert.deepEqual(adminFields(MODE_FOS_ONLY).map(([, f]) => f),
    ['clientName', 'reference', 'lender', 'product']);
  assert.deepEqual(adminFields(MODE_TIMEBAR_AND_FOS).map(([, f]) => f),
    ['clientName', 'reference', 'lender', 'product', 'communicationEvent', 'communicationDate']);
});

test('the admin page hides the Time-Bar fields until the combined mode is chosen', () => {
  assert.match(adminHtml, /<div id="timebarFields" hidden>/);
  // both Time-Bar-only inputs must live inside that container
  const block = adminHtml.slice(adminHtml.indexOf('id="timebarFields"'));
  const end = block.indexOf('</div>\n\n    <button');
  const inside = block.slice(0, end > 0 ? end : block.indexOf('<button'));
  assert.ok(inside.includes('id="event"'), 'lender communication/event is inside the conditional block');
  assert.ok(inside.includes('id="eventDate"'), 'lender event date is inside the conditional block');
});

test('the client form adapts its step sequence to the questionnaire mode', () => {
  const app = fs.readFileSync('public/app.js', 'utf8');
  assert.match(app, /FOS_ONLY:\s*\['details', 'fos1', 'fos2', 'fos3', 'review'\]/);
  assert.match(app, /TIMEBAR_AND_FOS:\s*\['details', 'tb1', 'tb2', 'tb3', 'fos1', 'fos2', 'fos3', 'review'\]/);
  // the progress indicator is computed from the sequence, not hard-coded
  assert.match(app, /Step \$\{state\.index \+ 1\} of \$\{state\.steps\.length\}/);
});

// ------------------------------------------- approved presentation headings

// TMS approved replacing two representative-facing source headings with
// client-facing ones on 2026-09-15. These tests prove the change was
// presentation only: the substantive question, options, examples and evidence
// wording beneath each heading are still exactly the source wording.

// Distinctive fragments of the two source headings. "Vulnerabilities" alone is
// not listed because it is still the internal field name `fosVulnerabilities`,
// which no client or reviewer ever sees; the visible-heading check below covers
// that separately.
const OLD_HEADINGS = [
  'Tailoring to their circumstances',
  "Your customer's finances when they borrowed",
  'your customer',
  'when they borrowed'
];

test('the two approved client-facing headings are the ones shown', () => {
  assert.equal(FOS_QUESTIONS.find((q) => q.id === 'FOS_VULNERABILITY').heading, '1. Your circumstances');
  assert.equal(FOS_QUESTIONS.find((q) => q.id === 'FOS_INCOME').heading, '6. Your finances when you borrowed');
  assert.ok(inForm('1. Your circumstances'));
  assert.ok(inForm('6. Your finances when you borrowed'));
});

test('no representative-facing heading survives anywhere a client or reviewer can see', () => {
  const { buildEmail } = require('../lib/email-template');
  const record = buildEmail({
    mode: MODE_FOS_ONLY, clientName: 'A', reference: '200000001', lender: 'L', product: 'Loan',
    fosVulnerabilities: [VULNERABILITY_NONE], fosCourtAction: 'No', fosLendingStart: '2015-06-01',
    fosLendingAmount: '100', fosBalancesPaid: 'Yes', fosSavings: 'No', fosDependants: 'No', fosFurtherLending: 'No'
  }, { submissionId: 'x' });
  for (const old of OLD_HEADINGS) {
    assert.ok(!html.includes(old), `old heading fragment still in the form: ${old}`);
    assert.ok(!record.text.includes(old), `old heading fragment still in the text record: ${old}`);
    assert.ok(!record.html.includes(old), `old heading fragment still in the HTML record: ${old}`);
  }
  // No visible heading on the page says "Vulnerabilities" either.
  const visibleHeadings = [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
  for (const h of visibleHeadings) {
    assert.ok(!/vulnerabilit/i.test(h), `heading still uses the source's own label: ${h}`);
  }
});

test('the heading change did not touch the substantive wording beneath it', () => {
  // Section 1: the question, its instruction, all five options and every
  // example are still the source wording.
  const vuln = FOS_QUESTIONS.find((q) => q.id === 'FOS_VULNERABILITY');
  assert.equal(vuln.question, 'Do any of the following apply?');
  assert.equal(vuln.note, 'Please select all that apply:');
  assert.equal(VULNERABILITY_VALUES.length, 5);
  assert.deepEqual(VULNERABILITY_OPTIONS.map((o) => o.examples.length), [8, 11, 3, 6, 0]);
  assert.equal(VULNERABILITY_OPTIONS[0].examples[0], 'long-term or severe illness');
  assert.equal(VULNERABILITY_OPTIONS[1].examples[10], 'criminal conviction');

  // Section 6: the group question and every row label are still the source
  // wording, including the second-person rows the source itself uses.
  const income = FOS_QUESTIONS.find((q) => q.id === 'FOS_INCOME');
  assert.equal(income.question, 'Income type — Monthly net amount (£)');
  assert.deepEqual(INCOME_ROWS.map(([l]) => l), ['Employment', 'Benefits', 'Maintenance', 'Pension']);
  assert.deepEqual(OUTGOING_ROWS.map(([l]) => l), [
    'Housing costs (like mortgage, rent or council housing payment)',
    'Utilities (like gas, electric, phone, council tax, water)',
    'Food or grocery costs',
    'Fuel or transport costs'
  ]);
  assert.equal(FOS_QUESTIONS.find((q) => q.id === 'FOS_SAVINGS').question,
    'Did you have any savings at the time of the initial lending?');
  assert.equal(FOS_QUESTIONS.find((q) => q.id === 'FOS_OUTGOINGS').question,
    'Essential outgoings — Monthly contribution (£)');
});

test('only the two headings changed: every other FOS heading is still the source wording', () => {
  const headings = FOS_QUESTIONS.filter((q) => q.heading).map((q) => q.heading);
  assert.deepEqual(headings, [
    '1. Your circumstances',
    '2. Has there been any court action related to the complaint (or is any planned)?',
    '3. When did the lending start?',
    '4. How much was the lending initially for?',
    '5. Have any outstanding balances been paid?',
    '6. Your finances when you borrowed'
  ]);
});
