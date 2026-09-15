const test = require('node:test');
const assert = require('node:assert/strict');
const {
  esc, buildEmail, londonIso, poundsDisplay, moneyLine, dateLine,
  FORMAT_VERSION, HEADER, FOOTER, NOT_PROVIDED, EXAMPLES_NOTE,
  SECTION_ADMIN, SECTION_TIMEBAR, SECTION_FOS, SECTION_CONFIRMATION
} = require('../lib/email-template');
const { MODE_FOS_ONLY, MODE_TIMEBAR_AND_FOS, CONFIRMATION_STATEMENT, adminFields } = require('../lib/questions');
const { TIMEBAR_QUESTIONS } = require('../lib/questions-timebar');
const { FOS_QUESTIONS, VULNERABILITY_VALUES, VULNERABILITY_NONE, INCOME_ROWS, OUTGOING_ROWS } = require('../lib/questions-fos');

const FOS_BASE = {
  mode: MODE_FOS_ONLY,
  clientName: 'Test Person', reference: '200000001', lender: 'Test Lender', product: 'Credit card',
  fosVulnerabilities: [VULNERABILITY_VALUES[0], VULNERABILITY_VALUES[2]],
  fosVulnerabilityExplanation: 'Synthetic combined explanation.',
  fosVulnerabilityDetail: 'Synthetic extra detail.',
  fosCourtAction: 'No',
  fosLendingStart: '2015-06-01',
  fosLendingAmount: '5000',
  fosBalancesPaid: 'Yes',
  fosIncomeEmployment: '1500.00', fosIncomeBenefits: '', fosIncomeMaintenance: '', fosIncomePension: '320',
  fosSavings: 'No',
  fosOutHousing: '600', fosOutUtilities: '150.50', fosOutFood: '250', fosOutTransport: '',
  fosOtherExpenses: '',
  fosDependants: 'Yes', fosDependantsCount: '2',
  fosFurtherLending: 'No'
};
const TIMEBAR_BASE = {
  communicationEvent: 'a test annual statement', communicationDate: 'March 2020',
  q1ThoughtBefore: 'No', q1AwarenessSource: 'From information I found myself',
  q1NoMonthYear: 'June 2024', q1NoExplain: 'Synthetic explanation.',
  q2Remember: 'No', q2OtherMemory: 'Synthetic note.',
  q3Circumstances: 'No'
};

const META = { submissionId: 'test-id', completedAt: '2026-09-15T12:00:00+01:00' };
const fosOnly = (over = {}) => buildEmail({ ...FOS_BASE, ...over }, META);
const combined = (over = {}) => buildEmail({ ...FOS_BASE, mode: MODE_TIMEBAR_AND_FOS, ...TIMEBAR_BASE, ...over }, META);
const approvedFos = (id) => FOS_QUESTIONS.find((q) => q.id === id);

// Parser written from the contract in EMAIL-FORMAT.md. If the emitted format
// drifts from the documented contract, these tests fail.
function parse(text) {
  const blocks = [];
  const fields = {};
  const sections = [];
  let block = null;
  let marker = null;
  for (const line of text.split('\n')) {
    const open = /^\[([A-Z0-9_]+)\](?: (.*))?$/.exec(line);
    if (open) {
      block = { id: open[1], heading: open[2] || '', context: [], question: [], bullets: [], note: [], options: [], optionsNote: [], statement: [], answer: [], order: [] };
      blocks.push(block);
      marker = null;
      continue;
    }
    const mk = /^(CONTEXT|QUESTION|NOTE|OPTIONS|STATEMENT|CLIENT ANSWER):$/.exec(line);
    if (mk && block) {
      marker = { CONTEXT: 'context', QUESTION: 'question', NOTE: 'note', OPTIONS: 'options', STATEMENT: 'statement', 'CLIENT ANSWER': 'answer' }[mk[1]];
      block.order.push(mk[1]);
      continue;
    }
    if (/^ {2}/.test(line)) {
      if (!block || !marker) continue;
      const content = line.slice(2);
      // A leading bullet marks a list item: question bullets under QUESTION,
      // and the option list under OPTIONS. Anything else under OPTIONS is the
      // trailing note about the "See examples" controls.
      if (content.startsWith('• ')) {
        if (marker === 'question') block.bullets.push(content.slice(2));
        else if (marker === 'options') block.options.push(content.slice(2));
        else block[marker].push(content);
      } else if (marker === 'options') {
        block.optionsNote.push(content);
      } else {
        block[marker].push(content);
      }
      continue;
    }
    marker = null;
    if (line === HEADER || line === FOOTER) continue;
    if (/^[A-Z][A-Z /-]+$/.test(line)) { sections.push(line); continue; }
    const kv = /^([^:[\]]+): (.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2];
  }
  return { blocks, fields, sections, byId: Object.fromEntries(blocks.map((b) => [b.id, b])) };
}
const idsOf = (text) => parse(text).blocks.map((b) => b.id);

// Several FOS blocks are conditional follow-ups, so "every question" means
// every question this particular client was actually asked.
const FOS_DATA = FOS_BASE;
const appliedFos = (data = FOS_DATA) => FOS_QUESTIONS.filter((q) => q.applies(data));

// ---------------------------------------------------------------- envelope

test('the format marker is TMS-FOS-V1', () => {
  assert.equal(FORMAT_VERSION, 'TMS-FOS-V1');
  assert.match(fosOnly().text, /^Format: TMS-FOS-V1$/m);
  assert.ok(fosOnly().html.includes('TMS-FOS-V1'));
  assert.match(combined().text, /^Format: TMS-FOS-V1$/m);
  assert.ok(combined().html.includes('TMS-FOS-V1'));
});

test('the questionnaire mode marker is fixed and machine-readable', () => {
  assert.match(fosOnly().text, /^Questionnaire mode: FOS_ONLY$/m);
  assert.match(combined().text, /^Questionnaire mode: TIMEBAR_AND_FOS$/m);
  assert.ok(fosOnly().html.includes('Questionnaire mode: FOS_ONLY'));
  assert.ok(combined().html.includes('Questionnaire mode: TIMEBAR_AND_FOS'));
  // and the readable label sits alongside it
  assert.match(fosOnly().text, /^Questionnaire: FOS questionnaire only$/m);
  assert.match(combined().text, /^Questionnaire: Time-Bar \+ FOS questionnaire$/m);
});

test('the header and end marker frame the record', () => {
  for (const build of [fosOnly, combined]) {
    const text = build().text;
    assert.ok(text.startsWith(`${HEADER}\n`));
    assert.match(text, new RegExp(`^${FOOTER}$`, 'm'));
  }
});

test('the submission id and completion date are recorded', () => {
  const f = parse(fosOnly().text).fields;
  assert.equal(f['Submission ID'], 'test-id');
  assert.equal(f['Date completed'], '2026-09-15T12:00:00+01:00');
});

test('londonIso produces a valid UK offset timestamp', () => {
  assert.match(londonIso(new Date('2026-01-15T12:00:00Z')), /^2026-01-15T12:00:00\+00:00$/);
  assert.match(londonIso(new Date('2026-07-15T12:00:00Z')), /^2026-07-15T13:00:00\+01:00$/);
});

// ----------------------------------------------------------- section order

test('FOS-only omits the Time-Bar section completely', () => {
  const { text, html } = fosOnly();
  assert.ok(!text.includes(SECTION_TIMEBAR), 'no Time-Bar heading in the text record');
  assert.ok(!html.includes(SECTION_TIMEBAR), 'no Time-Bar heading in the HTML record');
  const ids = idsOf(text);
  for (const q of TIMEBAR_QUESTIONS) assert.ok(!ids.includes(q.id), `${q.id} must not appear in a FOS-only record`);
  // and no Time-Bar wording leaks in by another route
  assert.ok(!text.includes('The lender says its records show that'));
  assert.ok(!text.includes('Lender communication/event'));
});

test('FOS-only section order is admin, FOS, confirmation', () => {
  assert.deepEqual(parse(fosOnly().text).sections, [SECTION_ADMIN, SECTION_FOS, SECTION_CONFIRMATION]);
});

test('combined section order is admin, Time-Bar, FOS, confirmation', () => {
  assert.deepEqual(parse(combined().text).sections, [SECTION_ADMIN, SECTION_TIMEBAR, SECTION_FOS, SECTION_CONFIRMATION]);
});

test('the combined HTML record carries the sections in the same order', () => {
  const html = combined().html;
  const at = (s) => html.indexOf(s);
  assert.ok(at(SECTION_ADMIN) < at(SECTION_TIMEBAR));
  assert.ok(at(SECTION_TIMEBAR) < at(SECTION_FOS));
  assert.ok(at(SECTION_FOS) < at(SECTION_CONFIRMATION));
});

test('combined records the Time-Bar answers before the FOS answers', () => {
  const ids = idsOf(combined().text);
  const lastTimebar = Math.max(...TIMEBAR_QUESTIONS.map((q) => ids.indexOf(q.id)).filter((i) => i >= 0));
  const firstFos = Math.min(...FOS_QUESTIONS.map((q) => ids.indexOf(q.id)).filter((i) => i >= 0));
  assert.ok(lastTimebar >= 0 && firstFos > lastTimebar, 'every Time-Bar block precedes every FOS block');
});

// ------------------------------------------------------------------- admin

test('the admin block carries only the fields the mode collected', () => {
  const f = parse(fosOnly().text).fields;
  assert.equal(f['Client name'], 'Test Person');
  assert.equal(f['TMS reference'], '200000001');
  assert.equal(f.Lender, 'Test Lender');
  assert.equal(f.Product, 'Credit card');
  assert.equal(f['Lender communication/event'], undefined, 'not collected in FOS-only mode');
  assert.equal(f['Lender event date'], undefined);

  const c = parse(combined().text).fields;
  assert.equal(c['Lender communication/event'], 'a test annual statement');
  assert.equal(c['Lender event date'], 'March 2020');
});

test('adminFields drives the record, so the two can never disagree', () => {
  for (const mode of [MODE_FOS_ONLY, MODE_TIMEBAR_AND_FOS]) {
    const build = mode === MODE_FOS_ONLY ? fosOnly() : combined();
    const f = parse(build.text).fields;
    for (const [label] of adminFields(mode)) assert.ok(label in f, `${mode}: ${label} must be recorded`);
  }
});

// -------------------------------------------- full question before answer

test('every FOS answer is preceded by the full approved question', () => {
  const { byId } = parse(fosOnly().text);
  for (const q of appliedFos()) {
    const b = byId[q.id];
    assert.ok(b, `${q.id} missing from the record`);
    assert.equal(b.question.join('\n'), q.question, `${q.id} must reproduce its question verbatim`);
    assert.ok(b.order.indexOf('QUESTION') < b.order.indexOf('CLIENT ANSWER'), `${q.id}: question must come before the answer`);
    if (q.heading) assert.equal(b.heading, q.heading, `${q.id} must reproduce its heading verbatim`);
    if (q.note) assert.equal(b.note.join('\n'), q.note, `${q.id} must reproduce its note verbatim`);
  }
});

test('every Time-Bar answer is preceded by the full approved question', () => {
  const { byId } = parse(combined().text);
  const data = { ...FOS_BASE, mode: MODE_TIMEBAR_AND_FOS, ...TIMEBAR_BASE };
  for (const q of TIMEBAR_QUESTIONS.filter((x) => x.applies(data))) {
    const b = byId[q.id];
    assert.ok(b, `${q.id} missing from the record`);
    assert.equal(b.question.join('\n'), q.question);
    assert.ok(b.order.indexOf('QUESTION') < b.order.indexOf('CLIENT ANSWER'));
  }
});

test('the HTML record also shows every question next to its answer', () => {
  const html = fosOnly().html;
  for (const q of appliedFos()) {
    assert.ok(html.includes(esc(q.question)), `${q.id} question missing from HTML`);
    assert.ok(html.indexOf(esc(q.question)) < html.indexOf('CLIENT ANSWER', html.indexOf(esc(q.question))));
  }
});

test('the record is not a field dump: no answer appears without a question marker', () => {
  const text = fosOnly().text;
  const answers = (text.match(/^CLIENT ANSWER:$/gm) || []).length;
  const questions = (text.match(/^QUESTION:$/gm) || []).length;
  assert.equal(answers, questions, 'exactly one question marker per answer marker');
  assert.equal(answers, appliedFos().length);
});

// ------------------------------------------------------ vulnerability output

test('the vulnerability question reproduces its full primary question and instruction', () => {
  const b = parse(fosOnly().text).byId.FOS_VULNERABILITY;
  assert.equal(b.heading, approvedFos('FOS_VULNERABILITY').heading);
  assert.equal(b.question.join('\n'), 'Do any of the following apply?');
  assert.equal(b.note.join('\n'), 'Please select all that apply:');
});

test('every vulnerability category is recorded as selected or not selected', () => {
  const b = parse(fosOnly().text).byId.FOS_VULNERABILITY;
  assert.equal(b.options.length, 5, 'all five options are listed');
  assert.deepEqual(b.answer, [
    `SELECTED: ${VULNERABILITY_VALUES[0]}`,
    `not selected: ${VULNERABILITY_VALUES[1]}`,
    `SELECTED: ${VULNERABILITY_VALUES[2]}`,
    `not selected: ${VULNERABILITY_VALUES[3]}`,
    `not selected: ${VULNERABILITY_NONE}`
  ]);
});

test('"None of these apply" is recorded explicitly when chosen', () => {
  const b = parse(fosOnly({ fosVulnerabilities: [VULNERABILITY_NONE] }).text).byId.FOS_VULNERABILITY;
  assert.ok(b.answer.includes(`SELECTED: ${VULNERABILITY_NONE}`), 'the "none" answer is stated, not implied by absence');
  for (const v of VULNERABILITY_VALUES.slice(0, 4)) assert.ok(b.answer.includes(`not selected: ${v}`));
  assert.ok(fosOnly({ fosVulnerabilities: [VULNERABILITY_NONE] }).html.includes(esc(VULNERABILITY_NONE)));
});

test('all four categories selected are all recorded', () => {
  const four = VULNERABILITY_VALUES.slice(0, 4);
  const b = parse(fosOnly({ fosVulnerabilities: four }).text).byId.FOS_VULNERABILITY;
  for (const v of four) assert.ok(b.answer.includes(`SELECTED: ${v}`), `${v} must be recorded as selected`);
  assert.ok(b.answer.includes(`not selected: ${VULNERABILITY_NONE}`));
});

test('the example lists are not dumped into the record, but their availability is stated', () => {
  const { text } = fosOnly();
  for (const ex of ['long-term or severe illness', 'bereavement', 'poor digital skills', 'criminal conviction']) {
    assert.ok(!text.includes(ex), `example "${ex}" must not be reproduced in the record`);
  }
  const b = parse(text).byId.FOS_VULNERABILITY;
  assert.equal(b.optionsNote.join('\n'), EXAMPLES_NOTE, 'the record states that examples were available behind the control');
});

test('the vulnerability free-text answer reproduces its exact question', () => {
  const b = parse(fosOnly().text).byId.FOS_VULNERABILITY_DETAIL;
  assert.equal(b.question.join('\n'), approvedFos('FOS_VULNERABILITY_DETAIL').question);
  assert.equal(b.answer.join('\n'), 'Synthetic extra detail.');
  const blank = parse(fosOnly({ fosVulnerabilityDetail: '' }).text).byId.FOS_VULNERABILITY_DETAIL;
  assert.equal(blank.answer.join('\n'), NOT_PROVIDED);
});

// --------------------------------------------------------- financial output

test('amounts are shown human-readably with an unambiguous numeric value', () => {
  assert.equal(poundsDisplay('1500.00'), '£1,500.00');
  assert.equal(poundsDisplay('5000'), '£5,000.00');
  assert.equal(moneyLine('1500.00'), '£1,500.00 [value: 1500.00]');
  assert.equal(moneyLine(''), NOT_PROVIDED);
  const b = parse(fosOnly().text).byId.FOS_LENDING_AMOUNT;
  assert.equal(b.answer.join('\n'), '£5,000.00 [value: 5000]');
});

test('the income group shows the full group question and every label and value', () => {
  const b = parse(fosOnly().text).byId.FOS_INCOME;
  assert.equal(b.heading, approvedFos('FOS_INCOME').heading);
  assert.equal(b.question.join('\n'), 'Income type — Monthly net amount (£)');
  assert.deepEqual(b.answer, [
    'Employment: £1,500.00 [value: 1500.00]',
    'Benefits: Not provided',
    'Maintenance: Not provided',
    'Pension: £320.00 [value: 320]'
  ]);
  for (const [label] of INCOME_ROWS) assert.ok(b.answer.some((a) => a.startsWith(`${label}: `)), `${label} recorded`);
});

test('the outgoings group shows the full group question and every label and value', () => {
  const b = parse(fosOnly().text).byId.FOS_OUTGOINGS;
  assert.equal(b.question.join('\n'), 'Essential outgoings — Monthly contribution (£)');
  assert.deepEqual(b.answer, [
    'Housing costs (like mortgage, rent or council housing payment): £600.00 [value: 600]',
    'Utilities (like gas, electric, phone, council tax, water): £150.50 [value: 150.50]',
    'Food or grocery costs: £250.00 [value: 250]',
    'Fuel or transport costs: Not provided'
  ]);
  for (const [label] of OUTGOING_ROWS) assert.ok(b.answer.some((a) => a.startsWith(`${label}: `)), `${label} recorded`);
});

test('the record performs no affordability calculation', () => {
  const { text, html } = fosOnly();
  for (const re of [/total/i, /disposable/i, /affordab/i, /surplus/i, /shortfall/i]) {
    assert.ok(!re.test(text), `record contains a calculation matching ${re}`);
    assert.ok(!re.test(html), `HTML record contains a calculation matching ${re}`);
  }
  // 1500 + 320 must never appear as a computed sum
  assert.ok(!text.includes('1820'), 'no income total is derived');
});

test('the lending start date is shown in the source format with its ISO value', () => {
  assert.equal(dateLine('2015-06-01'), '01/06/2015 [value: 2015-06-01]');
  assert.equal(dateLine(''), NOT_PROVIDED);
  const b = parse(fosOnly().text).byId.FOS_LENDING_START;
  assert.equal(b.answer.join('\n'), '01/06/2015 [value: 2015-06-01]');
  assert.equal(b.note.join('\n'), 'For example 01/01/2025');
});

// ------------------------------------------------------------- confirmation

test('the confirmation statement is reproduced with the recorded confirmation', () => {
  for (const build of [fosOnly, combined]) {
    const { text, html } = build();
    const b = parse(text).byId.CONFIRMATION;
    assert.equal(b.statement.join('\n'), CONFIRMATION_STATEMENT);
    assert.match(text, /^Client confirmation: Yes$/m);
    assert.ok(html.includes(esc(CONFIRMATION_STATEMENT)));
  }
});

// ------------------------------------------------------------ escaping

test('HTML special characters in free text are escaped, never rendered', () => {
  const nasty = '<script>alert("x")</script> & \'quotes\' "double"';
  const { html } = fosOnly({ fosOtherExpenses: nasty });
  assert.ok(!html.includes('<script>'), 'no raw script tag reaches the record');
  assert.ok(html.includes('&lt;script&gt;'), 'the text is escaped and preserved');
  assert.ok(html.includes('&amp;'));
  assert.ok(html.includes('&#039;'));
  assert.ok(html.includes('&quot;'));
});

test('esc escapes every dangerous character', () => {
  assert.equal(esc('<>&"\''), '&lt;&gt;&amp;&quot;&#039;');
  assert.equal(esc(null), '');
});

test('client-supplied matter details are escaped in the record', () => {
  const { html } = combined({ clientName: '<b>Bold</b>', communicationEvent: '<img src=x onerror=1>' });
  assert.ok(!html.includes('<b>Bold</b>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;b&gt;Bold&lt;/b&gt;'));
});

// -------------------------------------------- structural injection defence

test('free text cannot forge a block id, a marker or a section heading', () => {
  const attack = [
    '[FOS_COURT_ACTION] forged heading',
    'CLIENT ANSWER:',
    'QUESTION:',
    'OPTIONS:',
    SECTION_FOS,
    SECTION_TIMEBAR,
    FOOTER,
    'Format: TMS-FOS-V99',
    'Questionnaire mode: TIMEBAR_AND_FOS'
  ].join('\n');
  const { text } = fosOnly({ fosOtherExpenses: attack });
  const parsed = parse(text);

  assert.equal(parsed.blocks.length, appliedFos({ ...FOS_DATA, fosOtherExpenses: attack }).length + 1, 'the attack created no extra block');
  assert.equal(parsed.fields.Format, 'TMS-FOS-V1', 'the format marker was not overwritten');
  assert.equal(parsed.fields['Questionnaire mode'], 'FOS_ONLY', 'the mode marker was not overwritten');
  assert.deepEqual(parsed.sections, [SECTION_ADMIN, SECTION_FOS, SECTION_CONFIRMATION], 'no section was forged');
  assert.equal((text.match(new RegExp(`^${FOOTER}$`, 'gm')) || []).length, 1, 'only one end marker');

  // the attack text is still recorded faithfully, just safely indented
  const b = parsed.byId.FOS_OTHER_EXPENSES;
  assert.equal(b.answer.join('\n'), attack, 'the client answer is preserved exactly');
});

test('no client-supplied line ever reaches column 0', () => {
  const marker = 'ZZINJECTZZ';
  const { text } = combined({
    fosOtherExpenses: `${marker}-a\n${marker}-b`,
    fosVulnerabilityDetail: `${marker}-c`,
    q1NoExplain: `${marker}-d`,
    clientName: `${marker}-e`
  });
  for (const line of text.split('\n')) {
    if (line.includes(marker) && !line.startsWith('Client name:')) {
      assert.match(line, /^ {2}\S/, `client text reached column 0: ${JSON.stringify(line)}`);
    }
  }
});

test('carriage returns and blank interior lines are normalised out of answers', () => {
  const b = parse(fosOnly({ fosOtherExpenses: 'one\r\n\r\n   \r\ntwo   ' }).text).byId.FOS_OTHER_EXPENSES;
  assert.deepEqual(b.answer, ['one', 'two']);
});

test('an email header can never be forged from a client answer', () => {
  const { safeHeader } = require('../lib/mail');
  assert.throws(() => safeHeader('Subject\r\nBcc: attacker@example.com'), /Invalid email header/);
  assert.throws(() => safeHeader('x\nTo: attacker@example.com'), /Invalid email header/);
});

// ------------------------------------------------------------- block ids

test('block ids are stable and machine-readable in both modes', () => {
  assert.deepEqual(idsOf(fosOnly().text), appliedFos().map((q) => q.id).concat(['CONFIRMATION']));
  const data = { ...FOS_BASE, mode: MODE_TIMEBAR_AND_FOS, ...TIMEBAR_BASE };
  const expected = TIMEBAR_QUESTIONS.filter((q) => q.applies(data)).map((q) => q.id)
    .concat(appliedFos(data).map((q) => q.id))
    .concat(['CONFIRMATION']);
  assert.deepEqual(idsOf(combined().text), expected);
});

test('conditional Time-Bar branches change which blocks are recorded', () => {
  const yes = idsOf(combined({ q1ThoughtBefore: 'Yes', q1YesMonthYear: 'March 2020', q1YesWhy: 'Because.' }).text);
  assert.ok(yes.includes('Q1_DATE') && yes.includes('Q1_EXPLANATION'));
  assert.ok(!yes.includes('Q1_AWARENESS'), 'the branch not taken is not recorded');
  const no = idsOf(combined().text);
  assert.ok(no.includes('Q1_AWARENESS') && !no.includes('Q1_EXPLANATION'));
});

test('a missing submission id is recorded as not provided rather than blank', () => {
  const { text } = buildEmail({ ...FOS_BASE }, {});
  assert.match(text, new RegExp(`^Submission ID: ${NOT_PROVIDED}$`, 'm'));
});

// -------------------------------- lending date: exact vs "I don't know"

const { UNKNOWN_DATE_LABEL } = require('../lib/questions-fos');

test('an exact date is recorded with the full question and both formats', () => {
  const b = parse(fosOnly({ fosLendingStart: '2016-04-18', fosLendingStartUnknown: false }).text).byId.FOS_LENDING_START;
  assert.equal(b.question.join('\n'), 'When did the lending start?');
  assert.equal(b.answer.join('\n'), '18/04/2016 [value: 2016-04-18]');
});

test('"I don\'t know the exact date" is recorded as the answer, with the full question', () => {
  const { text, html } = fosOnly({ fosLendingStart: '', fosLendingStartUnknown: true });
  const b = parse(text).byId.FOS_LENDING_START;
  assert.equal(b.heading, '3. When did the lending start?');
  assert.equal(b.question.join('\n'), 'When did the lending start?', 'the approved question is still reproduced in full');
  assert.equal(b.note.join('\n'), 'For example 01/01/2025');
  assert.equal(b.answer.join('\n'), UNKNOWN_DATE_LABEL);
  assert.ok(html.includes(esc(UNKNOWN_DATE_LABEL)), 'and in the HTML record');
});

test('no date is generated or inferred when the client does not know it', () => {
  const { text, html } = fosOnly({ fosLendingStart: '', fosLendingStartUnknown: true });
  const b = parse(text).byId.FOS_LENDING_START;
  assert.ok(!/\d{2}\/\d{2}\/\d{4}/.test(b.answer.join('\n')), 'no DD/MM/YYYY date appears in the answer');
  assert.ok(!b.answer.join('\n').includes('[value:'), 'no machine value is emitted either');
  assert.ok(!b.answer.join('\n').includes(NOT_PROVIDED), 'and it is not recorded as a blank');
  // nowhere in the record does a fabricated date for this question appear
  assert.ok(!html.includes('1970'), 'no epoch date leaked into the record');
});

test('a stray date is ignored if the client said they do not know it', () => {
  // Defence in depth: the validator forces the date empty, but the record must
  // prefer the "I don't know" answer even if a date somehow reaches it.
  const b = parse(fosOnly({ fosLendingStart: '2016-04-18', fosLendingStartUnknown: true }).text).byId.FOS_LENDING_START;
  assert.equal(b.answer.join('\n'), UNKNOWN_DATE_LABEL);
  assert.ok(!b.answer.join('\n').includes('18/04/2016'));
});

test('the unknown-date answer appears in the combined record too', () => {
  const b = parse(combined({ fosLendingStart: '', fosLendingStartUnknown: true }).text).byId.FOS_LENDING_START;
  assert.equal(b.answer.join('\n'), UNKNOWN_DATE_LABEL);
});

// ------------------------------- approved client-facing presentation headings

test('the record carries the approved client-facing headings', () => {
  const { text, html } = fosOnly();
  const byId = parse(text).byId;
  assert.equal(byId.FOS_VULNERABILITY.heading, '1. Your circumstances');
  assert.equal(byId.FOS_INCOME.heading, '6. Your finances when you borrowed');
  assert.ok(html.includes('1. Your circumstances'));
  assert.ok(html.includes('6. Your finances when you borrowed'));
});

test('the heading change did not alter any question or answer in the record', () => {
  const byId = parse(fosOnly().text).byId;
  // Section 1: question, instruction and all five options are unchanged.
  assert.equal(byId.FOS_VULNERABILITY.question.join('\n'), 'Do any of the following apply?');
  assert.equal(byId.FOS_VULNERABILITY.note.join('\n'), 'Please select all that apply:');
  assert.equal(byId.FOS_VULNERABILITY.options.length, 5);
  // Section 6: group question and every row label are unchanged.
  assert.equal(byId.FOS_INCOME.question.join('\n'), 'Income type — Monthly net amount (£)');
  for (const [label] of INCOME_ROWS) {
    assert.ok(byId.FOS_INCOME.answer.some((a) => a.startsWith(`${label}: `)), `${label} still recorded`);
  }
  for (const [label] of OUTGOING_ROWS) {
    assert.ok(byId.FOS_OUTGOINGS.answer.some((a) => a.startsWith(`${label}: `)), `${label} still recorded`);
  }
});
