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
  EXAMPLES_INTRO, EXAMPLES_TOGGLE, INCOME_ROWS, OUTGOING_ROWS,
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

test('no "I don\'t know" or other unapproved answer option was added', () => {
  const banned = [/don.t know/i, /not sure/i, /prefer not to say/i, /unsure/i, /n\/a/i];
  // Checked against the FOS steps only: "Not sure" is approved Time-Bar wording.
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
