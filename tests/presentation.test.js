// Presentation rules approved 2026-09-15:
//
//   - the introduction is shown on the first step only: not on the landing
//     page, which asks for the reference alone, and not above every step;
//   - the review screen and the evidence record show each selected circumstance
//     once, through its own block, rather than also listing them in aggregate.
//
// Both are about where content appears, not what it says, so these tests check
// placement while asserting the wording itself is untouched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { validateSubmission, MODE_FOS_ONLY, MODE_TIMEBAR_AND_FOS } = require('../lib/validation');
const { buildEmail } = require('../lib/email-template');
const {
  FOS_QUESTIONS, VULNERABILITY_VALUES, VULNERABILITY_NONE, VULNERABILITY_DETAILS,
  VULNERABILITY_DETAIL_QUESTION, VULNERABILITY_DECLINE_LABEL
} = require('../lib/questions-fos');

const html = fs.readFileSync('public/index.html', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');
const css = fs.readFileSync('public/styles.css', 'utf8');

const CAT = VULNERABILITY_VALUES;
const DET = VULNERABILITY_DETAILS;

const BASE = {
  mode: MODE_FOS_ONLY, reference: '200000001', clientName: 'Test Person',
  lender: 'Test Lender', product: 'Credit card',
  fosVulnerabilities: [VULNERABILITY_NONE],
  fosCourtAction: 'No', fosLendingStart: '2015-06-01', fosLendingAmount: '5000',
  fosBalancesPaid: 'Yes', fosBalancesPaidDate: '2020-01-15', fosSavings: 'No', fosDependants: 'No', fosFurtherLending: 'No',
  confirmation: true, website: '', startedAt: Date.now() - 9999
};
const TIMEBAR = {
  communicationEvent: 'a test annual statement', communicationDate: 'March 2020',
  q1ThoughtBefore: 'No', q1AwarenessSource: 'From information I found myself',
  q4ComplainedPromptly: 'Yes', q5RepaymentProblems: 'No',
  q2Remember: 'No', q3Circumstances: 'No'
};
const record = (over = {}) => {
  const r = validateSubmission({ ...BASE, ...over });
  assert.deepEqual(r.errors, {}, 'fixture must be valid');
  return buildEmail(r.value, { submissionId: 'test', completedAt: '2026-09-15T12:00:00+01:00' });
};
const hasBlock = (text, id) => text.split('\n').some((l) => l.startsWith(`[${id}]`));

// The introductory content, exactly as it stands. These strings are asserted
// unchanged: only where they appear was allowed to move.
const INTRO_CONTENT = [
  'These questions help us put your complaint forward. Please answer based on your own recollection.',
  'Approximate answers are acceptable where you are asked about things that happened some time ago.',
  'Submitting this questionnaire provides information to TMS Legal. It does not itself refer your complaint to the Financial Ombudsman Service or extend any applicable deadline.'
];

// ===================== 1. introduction: first step only ====================

test('the introduction is all inside one block, so it moves as a unit', () => {
  const start = html.indexOf('<section id="intro" hidden>');
  const end = html.indexOf('</section>', start);
  assert.ok(start > -1 && end > start, 'the intro block exists and starts hidden');
  const intro = html.slice(start, end);
  for (const line of INTRO_CONTENT) {
    assert.ok(intro.replace(/\s+/g, ' ').includes(line), `intro content missing: ${line.slice(0, 50)}`);
  }
  assert.ok(intro.includes('id="introTitle"'), 'the heading is inside the block');
  assert.ok(intro.includes('https://pba-claims.co.uk/website-privacy-policy.php'), 'the privacy link is inside the block');
});

test('the wording itself is unchanged - only its placement moved', () => {
  const collapsed = html.replace(/\s+/g, ' ');
  for (const line of INTRO_CONTENT) assert.ok(collapsed.includes(line), `wording changed: ${line.slice(0, 50)}`);
  // Both mode-specific opening lines still exist.
  assert.ok(app.includes('Questions about your complaint'));
  assert.ok(app.includes('Questions about the time limit raised in the lender'));
});

test('the introduction shows on the first step and is hidden from every later one', () => {
  // Driven from the step index in one place, so no step can reintroduce it.
  assert.ok(app.includes("$('#intro').hidden = state.index > 0;"),
    'intro visibility is derived from the step index');
  const showStep = app.slice(app.indexOf('function showStep'), app.indexOf('function selected'));
  assert.ok(showStep.includes("$('#intro').hidden"), 'the rule lives in showStep, so it applies to every transition');
  // Nothing re-shows it once the client is into the questionnaire.
  assert.ok(!app.includes("$('#intro').hidden = false"), 'nothing sets the intro visible again');
});

test('the introduction is hidden on the review step, which is always last', () => {
  // review is the final step in both sequences, so index > 0 always holds.
  assert.match(app, /FOS_ONLY:\s*\['details', 'fos1', 'fos2', 'fos3', 'review'\]/);
  assert.match(app, /TIMEBAR_AND_FOS:\s*\['details', 'tb1', 'tb2', 'tb3', 'tb4', 'fos1', 'fos2', 'fos3', 'review'\]/);
  for (const seq of [['details', 'fos1', 'fos2', 'fos3', 'review'],
    ['details', 'tb1', 'tb2', 'tb3', 'tb4', 'fos1', 'fos2', 'fos3', 'review']]) {
    assert.equal(seq[seq.length - 1], 'review');
    assert.ok(seq.indexOf('review') > 0, 'review is never the first step, so the intro is hidden there');
  }
});

test('both modes get their own introduction on their own first step', () => {
  // The mode-specific wording is written in loadPrefill, which runs before the
  // first step is shown - so each mode sees its own opening, once.
  const loadPrefill = app.slice(app.indexOf('function loadPrefill'), app.indexOf("$('#startBtn')"));
  assert.ok(loadPrefill.includes("$('#introTitle').textContent = INTRO[data.mode].title"));
  assert.ok(loadPrefill.includes("$('#introLead').textContent = INTRO[data.mode].lead"));
  const intro = app.slice(app.indexOf('const INTRO = {'), app.indexOf('const MONEY_FIELDS'));
  assert.ok(intro.includes('FOS_ONLY:'), 'FOS-only opening exists');
  assert.ok(intro.includes('TIMEBAR_AND_FOS:'), 'combined opening exists');
});

test('the first step carries the disclaimer and the privacy link', () => {
  const start = html.indexOf('<section id="intro" hidden>');
  const intro = html.slice(start, html.indexOf('</section>', start));
  assert.ok(intro.includes('It does not itself refer your complaint to the Financial Ombudsman Service'),
    'the disclaimer travels with the introduction');
  assert.match(intro, /class="privacy-link"[^>]*href="https:\/\/pba-claims\.co\.uk\/website-privacy-policy\.php"/);
});

test('a privacy link is still reachable from every page', () => {
  // The footer sits outside the steps, so it survives the intro being hidden,
  // and the review step carries its own link and notice.
  const footer = html.slice(html.indexOf('<footer>'));
  assert.ok(footer.includes('https://pba-claims.co.uk/website-privacy-policy.php'), 'footer privacy link');
  const review = html.slice(html.indexOf('data-step="review"'), html.indexOf('</section>', html.indexOf('data-step="review"')));
  assert.ok(review.includes('https://pba-claims.co.uk/website-privacy-policy.php'), 'review privacy link');
  assert.ok(review.includes('Your answers will be emailed securely to TMS Legal'), 'review notice');
});

test('the step heading and progress indicator are untouched', () => {
  assert.ok(html.includes('id="progressLabel"') && html.includes('id="progressTitle"'));
  assert.match(app, /Step \$\{state\.index \+ 1\} of \$\{state\.steps\.length\}/);
  // Every step still has its own visible heading.
  const steps = ['fos1', 'fos2', 'fos3'];
  for (const step of steps) {
    const section = html.slice(html.indexOf(`data-step="${step}"`));
    assert.match(section.slice(0, 400), /<h2>/, `${step} keeps its heading`);
  }
});

// ============ 2. no duplicate circumstance summary ========================

test('the review omits the aggregate list once a circumstance is selected', () => {
  const review = app.slice(app.indexOf('function renderReview'));
  assert.ok(review.includes('selectedCategories.length === 0'),
    'the aggregate row is gated on there being no circumstance blocks');
  assert.ok(review.includes('Do any of the following apply?'),
    'the aggregate question is still available for the "none" case');
  assert.ok(review.includes('VULNERABILITY_DETAIL_QUESTION'),
    'each selected circumstance gets its own row');
});

test('the record omits the aggregate list once a circumstance is selected', () => {
  const { text, html: htmlPart } = record({
    fosVulnerabilities: [CAT[0], CAT[1]],
    [DET[0].field]: 'Skits',
    [DET[1].field]: 'Death in family'
  });
  assert.ok(!hasBlock(text, 'FOS_VULNERABILITY'), 'no aggregate block');
  assert.ok(!text.includes('not selected:'), 'and no aggregate selected/not-selected list');
  // Each selected circumstance is still fully evidenced.
  assert.ok(hasBlock(text, DET[0].id));
  assert.ok(hasBlock(text, DET[1].id));
  assert.ok(text.includes(CAT[0]) && text.includes('Skits'));
  assert.ok(text.includes(CAT[1]) && text.includes('Death in family'));
  assert.ok(htmlPart.includes('Skits') && htmlPart.includes('Death in family'));
  // Each circumstance wording appears once, not twice.
  assert.equal((text.match(new RegExp(CAT[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1);
});

test('the section heading survives, printed exactly once', () => {
  const { text } = record({
    fosVulnerabilities: [CAT[0], CAT[1], CAT[3]],
    [DET[0].field]: 'a', [DET[1].field]: 'b', [DET[3].declinedField]: true
  });
  assert.equal((text.match(/1\. Your circumstances/g) || []).length, 1,
    'the section is headed once, wherever the run of blocks starts');
  assert.ok(text.includes('[FOS_VULNERABILITY_HEALTH_DETAIL] 1. Your circumstances'),
    'carried by the first circumstance block recorded');
});

test('"None of these apply" keeps the primary question and that answer', () => {
  const { text, html: htmlPart } = record({ fosVulnerabilities: [VULNERABILITY_NONE] });
  assert.ok(hasBlock(text, 'FOS_VULNERABILITY'), 'the aggregate block is the only evidence, so it is kept');
  assert.ok(text.includes('Do any of the following apply?'));
  assert.ok(text.includes(`SELECTED: ${VULNERABILITY_NONE}`), 'the answer is explicit, not inferred');
  assert.ok(htmlPart.includes(VULNERABILITY_NONE));
  for (const d of DET) assert.ok(!hasBlock(text, d.id), `${d.id} must not appear`);
  assert.ok(text.includes('1. Your circumstances'), 'the section is still headed');
});

test('no evidence is lost: every selected circumstance and answer is recorded', () => {
  const answers = {
    fosVulnerabilities: CAT.slice(0, 4),
    [DET[0].field]: 'One.', [DET[1].field]: 'Two.',
    [DET[2].declinedField]: true, [DET[3].field]: 'Four.'
  };
  const { text } = record(answers);
  for (let i = 0; i < 4; i += 1) {
    assert.ok(text.includes(CAT[i]), `category ${i + 1} named`);
    assert.ok(hasBlock(text, DET[i].id), `category ${i + 1} has its own block`);
  }
  for (const answer of ['One.', 'Two.', 'Four.', VULNERABILITY_DECLINE_LABEL]) {
    assert.ok(text.includes(answer), `answer preserved: ${answer}`);
  }
  assert.equal((text.match(/Please list any issues and tell us about how they affected you\./g) || []).length, 4,
    'one follow-up question per selected circumstance');
});

test('both modes behave the same way', () => {
  const selected = {
    fosVulnerabilities: [CAT[2]],
    [DET[2].field]: 'Money was always tight.'
  };
  const fosOnly = record(selected);
  const combined = record({ mode: MODE_TIMEBAR_AND_FOS, ...TIMEBAR, ...selected });
  for (const { text } of [fosOnly, combined]) {
    assert.ok(!hasBlock(text, 'FOS_VULNERABILITY'));
    assert.ok(hasBlock(text, DET[2].id));
    assert.ok(text.includes('Money was always tight.'));
  }
  assert.ok(combined.text.includes('TIME-BAR QUESTIONNAIRE RESPONSES'));
  assert.ok(!fosOnly.text.includes('TIME-BAR QUESTIONNAIRE RESPONSES'));

  // and the "none" case is identical in both modes
  const noneFos = record({ fosVulnerabilities: [VULNERABILITY_NONE] });
  const noneBoth = record({ mode: MODE_TIMEBAR_AND_FOS, ...TIMEBAR, fosVulnerabilities: [VULNERABILITY_NONE] });
  for (const { text } of [noneFos, noneBoth]) assert.ok(hasBlock(text, 'FOS_VULNERABILITY'));
});

test('the aggregate block is the only thing that moved - the question is unchanged', () => {
  const q = FOS_QUESTIONS.find((b) => b.id === 'FOS_VULNERABILITY');
  assert.equal(q.question, 'Do any of the following apply?');
  assert.equal(q.note, 'Please select all that apply:');
  assert.equal(q.options.length, 5);
  assert.equal(VULNERABILITY_DETAIL_QUESTION, 'Please list any issues and tell us about how they affected you.');
});

// ============ 3. mobile layout ============================================

test('the layout still holds at 320, 390 and 430px', () => {
  // Nothing may be pinned wider than the narrowest supported screen.
  const offenders = [];
  for (const m of css.matchAll(/(?:^|[;{]|\s)(min-width|width)\s*:\s*(\d+)px/g)) {
    if (Number(m[2]) > 320) offenders.push(`${m[1]}: ${m[2]}px`);
  }
  assert.deepEqual(offenders, [], 'nothing pinned wider than 320px');

  // The circumstance follow-up is indented, so it must not add a fixed width.
  const rule = css.slice(css.indexOf('.category-detail {'), css.indexOf('}', css.indexOf('.category-detail {')));
  assert.ok(!/width:/.test(rule), 'the indented follow-up uses margin and padding, not a width');
  assert.match(rule, /padding-left:\s*12px/);
  assert.match(rule, /margin:\s*4px 0 2px 10px/);

  // Review context lines wrap rather than overflow.
  assert.match(css, /\.summary-context\s*\{[^}]*font-size/);
  assert.match(css, /\.summary-item span \{[^}]*overflow-wrap: anywhere/);
});

test('hiding the introduction removes height, it does not collapse the layout', () => {
  // [hidden] is display:none, so the block takes no space when hidden and the
  // step below it moves up rather than being overlapped.
  assert.match(css, /\[hidden\] \{ display: none !important; \}/);
  assert.ok(html.includes('<section id="intro" hidden>'), 'the intro is its own section, so hiding it is total');
});

test('the landing page does not carry the introduction', () => {
  // It starts hidden in the markup, so the reference page shows only the
  // reference request. showStep reveals it when the first step opens.
  assert.match(html, /<section id="intro" hidden>/, 'hidden in the markup, so the landing page is clean');
  // Nothing reveals it before the first step is shown.
  const beforeStart = app.slice(0, app.indexOf("$('#startBtn')"));
  assert.ok(!beforeStart.includes("$('#intro').hidden = false"), 'nothing reveals it early');
  // showStep is the only thing that sets it, and only step 0 makes it visible.
  assert.ok(app.includes("$('#intro').hidden = state.index > 0;"));
  assert.equal((app.match(/#intro.\)\.hidden =/g) || []).length, 3,
    'set in exactly three places: showStep, and hidden on success and failure');
});

test('the introduction is shown exactly once in a run', () => {
  // Hidden in the markup, revealed on step 0, hidden again for every step
  // after - so a client sees it on one screen only.
  const showStep = app.slice(app.indexOf('function showStep'), app.indexOf('function selected'));
  assert.ok(showStep.includes("$('#intro').hidden = state.index > 0;"));
  // and the success and failure screens hide it too
  assert.ok(app.includes("$('#intro').hidden = true; $('#success').hidden = false;"));
  assert.ok(app.includes("$('#intro').hidden = true; $('#failure').hidden = false;"));
});
