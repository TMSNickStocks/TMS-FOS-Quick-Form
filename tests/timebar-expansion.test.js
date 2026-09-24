// The 2026-09-24 questionnaire amendment: the Time-Bar first-awareness group
// asked once, sections 4 and 5, and the FOS account-repaid date.
//
// Every conditional is tested in BOTH directions, because a branch that is
// merely optional when it should be required, or merely ignored when it should
// be refused, is the failure that puts a contradictory answer in an evidence
// record: a delay explained by a client who says there was no delay, a
// repayment date against an account that was never repaid.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { validateSubmission, MODE_FOS_ONLY, MODE_TIMEBAR_AND_FOS } = require('../lib/validation');
const { buildEmail } = require('../lib/email-template');
// The subject is the mailer's, not the record builder's: it is asserted here
// because this change must not touch it.
const { SUBJECT } = require('../lib/mail');
const { TIMEBAR_QUESTIONS } = require('../lib/questions-timebar');
const { FOS_QUESTIONS, VULNERABILITY_NONE } = require('../lib/questions-fos');

const html = fs.readFileSync('public/index.html', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');
const formText = html.replace(/\s+/g, ' ');
const occurrences = (haystack, needle) => haystack.split(needle).length - 1;

// The exact wording TMS approved. Every assertion below quotes it rather than
// paraphrasing, so a re-wording fails here as well as in the hash test.
const W = {
  promptly: 'Did you complain to the lender as soon as payments became unaffordable?',
  delay: 'Please explain why there was a delay.',
  awarenessDate: 'When did you first think the lender acted unfairly?',
  estimated: 'Is this an estimated date?',
  cause: 'What was it that first made you aware the lender might not have acted fairly?',
  repayment: 'Did you have repayment problems?',
  struggle: 'When did you start to struggle to repay the borrowing? What was the impact of this, and how long did it last?',
  support: 'Did the lender provide any support when you were struggling financially (for example, offering payment deferrals or a repayment plan)?',
  repaidDate: 'What date was the account repaid?'
};

const FOS = {
  mode: MODE_FOS_ONLY, reference: '200000001', clientName: 'Test Person',
  lender: 'Test Lender', product: 'Credit card',
  fosVulnerabilities: [VULNERABILITY_NONE],
  fosCourtAction: 'No', fosLendingStart: '2015-06-01', fosLendingAmount: '5000',
  fosBalancesPaid: 'No',
  fosSavings: 'No', fosDependants: 'No', fosFurtherLending: 'No',
  confirmation: true, website: '', startedAt: Date.now() - 9999
};
const TIMEBAR = {
  communicationEvent: 'a test annual statement', communicationDate: 'March 2020',
  q1ThoughtBefore: 'No', q1AwarenessSource: 'From information I found myself',
  q1AwarenessDate: '2024-06-10', q1AwarenessDateEstimated: 'Yes',
  q1AwarenessExplanation: 'A letter about my arrears.',
  q2Remember: 'No', q3Circumstances: 'No',
  q4ComplainedPromptly: 'Yes', q5RepaymentProblems: 'No'
};
const fos = (over = {}) => ({ ...FOS, ...over });
const combined = (over = {}) => ({ ...FOS, mode: MODE_TIMEBAR_AND_FOS, ...TIMEBAR, ...over });

const ok = (payload, message) => {
  const r = validateSubmission(payload);
  assert.deepEqual(r.errors, {}, message || 'expected a valid submission');
  assert.equal(r.ok, true);
  return r;
};
const refused = (payload, field, expected) => {
  const r = validateSubmission(payload);
  assert.equal(r.ok, false, `${field} should have been refused`);
  if (expected) assert.equal(r.errors[field], expected);
  return r;
};

const META = { submissionId: 'test-id', completedAt: '2026-09-24T12:00:00+01:00' };
const emailOf = (payload) => buildEmail(validateSubmission(payload).value, META);
const blockIds = (text) => [...text.matchAll(/^\[([A-Z0-9_]+)\]/gmu)].map((m) => m[1]);

// ---------------------------------------------- complaining to the lender

test('6. complaining straight away is accepted, and asks nothing further', () => {
  const r = ok(combined({ q4ComplainedPromptly: 'Yes' }));
  assert.equal(r.value.q4ComplainedPromptly, 'Yes');
  assert.equal(r.value.q4DelayReason, '', 'nothing is recorded for a question that was not asked');
  const ids = blockIds(emailOf(combined({ q4ComplainedPromptly: 'Yes' })).text);
  assert.ok(ids.includes('Q4'));
  assert.ok(!ids.includes('Q4_DELAY'), 'no empty conditional block in the record');
});

test('7. a delayed complaint is accepted with its explanation, and both are recorded', () => {
  const payload = combined({ q4ComplainedPromptly: 'No', q4DelayReason: 'I did not know I could complain.' });
  const r = ok(payload);
  assert.equal(r.value.q4DelayReason, 'I did not know I could complain.');
  const { text } = emailOf(payload);
  assert.ok(blockIds(text).includes('Q4_DELAY'));
  assert.ok(text.includes(W.delay), 'the full question wording travels with the answer');
  assert.ok(text.includes('I did not know I could complain.'));
});

test('8. a delayed complaint with no explanation is refused', () => {
  refused(combined({ q4ComplainedPromptly: 'No' }), 'q4DelayReason', 'Please answer this question');
  refused(combined({ q4ComplainedPromptly: 'No', q4DelayReason: '   ' }), 'q4DelayReason');
});

test('9. an explanation sent alongside "I complained straight away" is refused as stale', () => {
  const r = refused(
    combined({ q4ComplainedPromptly: 'Yes', q4DelayReason: 'left over from before' }),
    'q4DelayReason',
    'This question was not asked'
  );
  assert.equal(r.value.q4DelayReason, '', 'and it never reaches the record');
});

test('9b. the complaint-timing answer itself is required, and is a closed set', () => {
  refused(combined({ q4ComplainedPromptly: '' }), 'q4ComplainedPromptly');
  refused(combined({ q4ComplainedPromptly: 'Maybe' }), 'q4ComplainedPromptly', 'Invalid choice');
  refused(combined({ q4ComplainedPromptly: 'Not sure' }), 'q4ComplainedPromptly', 'Invalid choice');
});

// ------------------------------------------------------- first awareness

test('10. the first-awareness date is recorded, in both readable and machine form', () => {
  const { text } = emailOf(combined({ q1AwarenessDate: '2024-06-10', q1AwarenessDateEstimated: 'No' }));
  assert.ok(text.includes(W.awarenessDate), 'the approved wording');
  assert.match(text, /10\/06\/2024 \[value: 2024-06-10\]/, 'the date, as the record prints dates');
  assert.ok(blockIds(text).includes('Q1_FIRST_AWARENESS_DATE'));
});

test('10b. a malformed or future first-awareness date is refused', () => {
  refused(combined({ q1AwarenessDate: '10/06/2024' }), 'q1AwarenessDate');
  refused(combined({ q1AwarenessDate: '2024-02-31' }), 'q1AwarenessDate');
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  refused(combined({ q1AwarenessDate: future }), 'q1AwarenessDate', 'The date cannot be in the future');
});

test('11. an estimated date is accepted and recorded as an estimate', () => {
  const payload = combined({ q1AwarenessDate: '2024-06-10', q1AwarenessDateEstimated: 'Yes' });
  assert.equal(ok(payload).value.q1AwarenessDateEstimated, 'Yes');
  const { text } = emailOf(payload);
  assert.ok(text.includes(W.estimated));
  assert.ok(blockIds(text).includes('Q1_FIRST_AWARENESS_DATE_ESTIMATED'));
});

test('12. a date the client is sure of is accepted and recorded as not an estimate', () => {
  const payload = combined({ q1AwarenessDate: '2024-06-10', q1AwarenessDateEstimated: 'No' });
  assert.equal(ok(payload).value.q1AwarenessDateEstimated, 'No');
  // "No" is a real answer, not an absence: the block is recorded either way.
  assert.ok(blockIds(emailOf(payload).text).includes('Q1_FIRST_AWARENESS_DATE_ESTIMATED'));
});

test('12b. a date without its estimate answer is refused, and the reverse is too', () => {
  refused(combined({ q1AwarenessDate: '2024-06-10', q1AwarenessDateEstimated: '' }),
    'q1AwarenessDateEstimated', 'Please select an answer');
  const stale = refused(combined({ q1AwarenessDate: '', q1AwarenessDateEstimated: 'Yes' }),
    'q1AwarenessDateEstimated', 'This question was not asked');
  assert.equal(stale.value.q1AwarenessDateEstimated, '');
  // With no date at all, nothing is asked and nothing is required.
  ok(combined({ q1AwarenessDate: '', q1AwarenessDateEstimated: '' }));
});

test('13. the explanation is required of a client who had already thought something was wrong', () => {
  refused(combined({ q1ThoughtBefore: 'Yes', q1AwarenessSource: '', q1AwarenessExplanation: '' }),
    'q1AwarenessExplanation', 'Please answer this question');
  const r = ok(combined({ q1ThoughtBefore: 'Yes', q1AwarenessSource: '', q1AwarenessExplanation: 'A letter.' }));
  assert.equal(r.value.q1AwarenessExplanation, 'A letter.');
  // And it is asked, but not compelled, of one who had not - which is the
  // requiredness the retired "if you can remember" box carried.
  ok(combined({ q1ThoughtBefore: 'No', q1AwarenessExplanation: '' }));
  const { text } = emailOf(combined());
  assert.ok(text.includes(W.cause));
  assert.ok(blockIds(text).includes('Q1_FIRST_AWARENESS_CAUSE'));
});

test('14. the client is asked each first-awareness fact exactly once', () => {
  // On screen: one date control, one estimate question, one cause box.
  for (const wording of [W.awarenessDate, W.estimated, W.cause]) {
    assert.equal(occurrences(formText, wording), 1, `asked more than once: ${wording}`);
  }
  assert.equal(occurrences(html, 'name="q1AwarenessDate"'), 1);
  assert.equal(occurrences(html, 'id="q1AwarenessExplanation"'), 1);
  // And the retired pairs are gone from the form, the payload and the record.
  for (const retired of [
    'Approximately when did you first think this?',
    'What happened or what information made you think or question whether the lender might have done something wrong?',
    'Approximate month/year',
    'Please briefly explain how you first became aware, if you can remember.'
  ]) {
    assert.ok(!formText.includes(retired), `retired question still on screen: ${retired}`);
  }
  for (const field of ['q1YesMonthYear', 'q1YesWhy', 'q1NoMonthYear', 'q1NoExplain']) {
    assert.ok(!html.includes(field), `retired field still in the form: ${field}`);
    assert.ok(!app.includes(field), `retired field still in the client script: ${field}`);
  }
  // Nor can a second date question reach the record: exactly one Time-Bar
  // question asks for a date at all.
  assert.deepEqual(
    TIMEBAR_QUESTIONS.filter((q) => q.kind === 'date').map((q) => q.id),
    ['Q1_FIRST_AWARENESS_DATE']
  );
});

// ---------------------------------------------------- repayment difficulties

test('15. no repayment problems is accepted, and asks nothing further', () => {
  const r = ok(combined({ q5RepaymentProblems: 'No' }));
  assert.equal(r.value.q5StruggleDetail, '');
  assert.equal(r.value.q5LenderSupport, '');
  const ids = blockIds(emailOf(combined({ q5RepaymentProblems: 'No' })).text);
  assert.ok(ids.includes('Q5'));
  assert.ok(!ids.includes('Q5_STRUGGLE') && !ids.includes('Q5_LENDER_SUPPORT'),
    'no empty conditional blocks in the record');
});

test('16. repayment problems with both follow-ups is accepted and recorded', () => {
  const payload = combined({
    q5RepaymentProblems: 'Yes',
    q5StruggleDetail: 'From mid-2019, for about two years.',
    q5LenderSupport: 'No'
  });
  const r = ok(payload);
  assert.equal(r.value.q5StruggleDetail, 'From mid-2019, for about two years.');
  const { text } = emailOf(payload);
  assert.ok(text.includes(W.struggle));
  assert.ok(text.includes(W.support));
  assert.ok(text.includes('From mid-2019, for about two years.'));
  const ids = blockIds(text);
  assert.ok(ids.includes('Q5_STRUGGLE') && ids.includes('Q5_LENDER_SUPPORT'));
});

test('17. the struggle details are required once repayment problems are reported', () => {
  refused(combined({ q5RepaymentProblems: 'Yes', q5LenderSupport: 'No' }),
    'q5StruggleDetail', 'Please answer this question');
  refused(combined({ q5RepaymentProblems: 'Yes', q5StruggleDetail: '  ', q5LenderSupport: 'No' }),
    'q5StruggleDetail');
});

test('18. lender support Yes is accepted and recorded', () => {
  const r = ok(combined({ q5RepaymentProblems: 'Yes', q5StruggleDetail: 'Two years.', q5LenderSupport: 'Yes' }));
  assert.equal(r.value.q5LenderSupport, 'Yes');
});

test('19. lender support No is accepted and recorded as an answer, not an absence', () => {
  const payload = combined({ q5RepaymentProblems: 'Yes', q5StruggleDetail: 'Two years.', q5LenderSupport: 'No' });
  assert.equal(ok(payload).value.q5LenderSupport, 'No');
  assert.match(emailOf(payload).text, /Did the lender provide any support[\s\S]*?No/);
  // Required, so an unanswered support question stops the submission.
  refused(combined({ q5RepaymentProblems: 'Yes', q5StruggleDetail: 'Two years.', q5LenderSupport: '' }),
    'q5LenderSupport', 'Please select an answer');
});

test('20. stale repayment follow-ups are refused and never reach the record', () => {
  const r = validateSubmission(combined({
    q5RepaymentProblems: 'No',
    q5StruggleDetail: 'left over',
    q5LenderSupport: 'Yes'
  }));
  assert.equal(r.ok, false);
  assert.equal(r.errors.q5StruggleDetail, 'This question was not asked');
  assert.equal(r.errors.q5LenderSupport, 'This question was not asked');
  assert.equal(r.value.q5StruggleDetail, '');
  assert.equal(r.value.q5LenderSupport, '');
});

test('20b. the repayment-problems answer itself is required, and is a closed set', () => {
  refused(combined({ q5RepaymentProblems: '' }), 'q5RepaymentProblems');
  refused(combined({ q5RepaymentProblems: 'Not sure' }), 'q5RepaymentProblems', 'Invalid choice');
});

// ------------------------------------------------ the account-repaid date

test('21. balances paid Yes requires the repayment date, and records it', () => {
  refused(fos({ fosBalancesPaid: 'Yes' }), 'fosBalancesPaidDate',
    'Please enter the date the account was repaid');
  const payload = fos({ fosBalancesPaid: 'Yes', fosBalancesPaidDate: '2021-11-30' });
  assert.equal(ok(payload).value.fosBalancesPaidDate, '2021-11-30');
  const { text } = emailOf(payload);
  assert.ok(text.includes(W.repaidDate));
  assert.match(text, /30\/11\/2021 \[value: 2021-11-30\]/);
  assert.ok(blockIds(text).includes('FOS_BALANCES_PAID_DATE'));
});

test('22. balances paid No asks for no date, and records no empty block', () => {
  const r = ok(fos({ fosBalancesPaid: 'No' }));
  assert.equal(r.value.fosBalancesPaidDate, '');
  const ids = blockIds(emailOf(fos({ fosBalancesPaid: 'No' })).text);
  assert.ok(ids.includes('FOS_BALANCES_PAID'));
  assert.ok(!ids.includes('FOS_BALANCES_PAID_DATE'));
});

test('23. a repayment date sent alongside "not paid" is refused as stale', () => {
  const r = refused(fos({ fosBalancesPaid: 'No', fosBalancesPaidDate: '2021-11-30' }),
    'fosBalancesPaidDate', 'This question was not asked');
  assert.equal(r.value.fosBalancesPaidDate, '');
});

test('23b. a malformed or future repayment date is refused', () => {
  refused(fos({ fosBalancesPaid: 'Yes', fosBalancesPaidDate: '30/11/2021' }), 'fosBalancesPaidDate');
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  refused(fos({ fosBalancesPaid: 'Yes', fosBalancesPaidDate: future }), 'fosBalancesPaidDate',
    'The date cannot be in the future');
});

// ------------------------------------------------------------ both modes

test('24. FOS-only gets the repayment date and none of the Time-Bar questions', () => {
  const ids = blockIds(emailOf(fos({ fosBalancesPaid: 'Yes', fosBalancesPaidDate: '2021-11-30' })).text);
  assert.ok(ids.includes('FOS_BALANCES_PAID_DATE'));
  for (const id of ['Q1_FIRST_AWARENESS_DATE', 'Q1_FIRST_AWARENESS_DATE_ESTIMATED',
    'Q1_FIRST_AWARENESS_CAUSE', 'Q4', 'Q4_DELAY', 'Q5', 'Q5_STRUGGLE', 'Q5_LENDER_SUPPORT']) {
    assert.ok(!ids.includes(id), `${id} must not reach a FOS-only record`);
  }
  // Not merely omitted from the record: refused outright on the way in, so a
  // FOS-only submission cannot smuggle a Time-Bar answer.
  for (const field of ['q1AwarenessDate', 'q1AwarenessDateEstimated', 'q1AwarenessExplanation',
    'q4ComplainedPromptly', 'q4DelayReason', 'q5RepaymentProblems', 'q5StruggleDetail', 'q5LenderSupport']) {
    const r = validateSubmission(fos({ [field]: 'Yes' }));
    assert.equal(r.ok, false, `${field} must be rejected in FOS-only mode`);
    assert.equal(r.errors._form, 'Unknown field');
  }
});

test('25. the combined mode gets both, in the order the client answered them', () => {
  const payload = combined({
    q4ComplainedPromptly: 'No', q4DelayReason: 'I did not know.',
    q5RepaymentProblems: 'Yes', q5StruggleDetail: 'Two years.', q5LenderSupport: 'No',
    fosBalancesPaid: 'Yes', fosBalancesPaidDate: '2021-11-30'
  });
  const ids = blockIds(emailOf(payload).text);
  const order = ['Q1', 'Q1_AWARENESS', 'Q1_FIRST_AWARENESS_DATE', 'Q1_FIRST_AWARENESS_DATE_ESTIMATED',
    'Q1_FIRST_AWARENESS_CAUSE', 'Q2', 'Q3', 'Q4', 'Q4_DELAY', 'Q5', 'Q5_STRUGGLE', 'Q5_LENDER_SUPPORT'];
  const positions = order.map((id) => ids.indexOf(id));
  assert.ok(positions.every((i) => i >= 0), `missing blocks: ${order.filter((id, i) => positions[i] < 0)}`);
  assert.deepEqual(positions.slice().sort((a, b) => a - b), positions, 'recorded in the order asked');
  assert.ok(ids.indexOf('FOS_BALANCES_PAID_DATE') > positions[positions.length - 1],
    'the FOS section follows the Time-Bar section');
});

test('25b. the new questions carry the Time-Bar section headings that number them', () => {
  const byId = Object.fromEntries(TIMEBAR_QUESTIONS.map((q) => [q.id, q]));
  assert.equal(byId.Q4.heading, '4. Complaining to the lender');
  assert.equal(byId.Q5.heading, '5. Repayment difficulties');
  // Sections 1 to 3 keep the approved numbering they always had.
  assert.match(byId.Q1.heading, /^1\. /);
  assert.match(byId.Q2.heading, /^2\. /);
  assert.match(byId.Q3.heading, /^3\. /);
});

// ------------------------------------------------------ review and email

test('26. every new answer appears on the review screen, and only when it applies', () => {
  // The review screen is built in the browser, so this is a static check over
  // the code that builds it: each new question's wording, pushed as a row.
  for (const wording of [W.awarenessDate, W.estimated, W.cause, W.promptly, W.delay,
    W.repayment, W.struggle, W.support, W.repaidDate]) {
    assert.ok(app.includes(wording), `the review screen does not show: ${wording}`);
  }
  // Conditional rows sit behind the answer that opens them.
  assert.match(app, /if \(d\.q1AwarenessDate\) rows\.push\(\['Is this an estimated date\?'/);
  assert.match(app, /if \(d\.q4ComplainedPromptly === 'No'\) rows\.push/);
  assert.match(app, /if \(d\.q5RepaymentProblems === 'Yes'\) \{/);
  assert.match(app, /if \(d\.fosBalancesPaid === 'Yes'\) rows\.push\(\['What date was the account repaid\?'/);
  // And the retired rows are gone.
  for (const gone of ['Approximately when?', 'What happened / what information?', 'Approximate month/year']) {
    assert.ok(!app.includes(`['${gone}'`), `retired review row still built: ${gone}`);
  }
});

test('27. the record carries a stable id, the full wording and the answer for each new question', () => {
  const payload = combined({
    q4ComplainedPromptly: 'No', q4DelayReason: 'I did not know.',
    q5RepaymentProblems: 'Yes', q5StruggleDetail: 'Two years of arrears.', q5LenderSupport: 'Yes',
    fosBalancesPaid: 'Yes', fosBalancesPaidDate: '2021-11-30'
  });
  const { text, html: body } = emailOf(payload);
  const expected = [
    ['Q1_FIRST_AWARENESS_DATE', W.awarenessDate, '10/06/2024'],
    ['Q1_FIRST_AWARENESS_DATE_ESTIMATED', W.estimated, 'Yes'],
    ['Q1_FIRST_AWARENESS_CAUSE', W.cause, 'A letter about my arrears.'],
    ['Q4', W.promptly, 'No'],
    ['Q4_DELAY', W.delay, 'I did not know.'],
    ['Q5', W.repayment, 'Yes'],
    ['Q5_STRUGGLE', W.struggle, 'Two years of arrears.'],
    ['Q5_LENDER_SUPPORT', W.support, 'Yes'],
    ['FOS_BALANCES_PAID_DATE', W.repaidDate, '30/11/2021']
  ];
  for (const [id, question, answer] of expected) {
    assert.ok(text.includes(`[${id}]`), `missing machine id ${id}`);
    assert.ok(text.includes(question), `missing question wording for ${id}`);
    assert.ok(text.includes(answer), `missing answer for ${id}`);
  }
  // The HTML half of the record carries the same three things.
  for (const [id, question] of expected) {
    assert.ok(body.includes(id), `HTML record is missing ${id}`);
    assert.ok(body.includes(question.replace(/&/g, '&amp;')), `HTML record is missing the wording for ${id}`);
  }
  assert.equal(SUBJECT, 'FOS Questionnaire Answers');
});

test('28. the evidence email subject and format version are untouched', () => {
  assert.equal(SUBJECT, 'FOS Questionnaire Answers');
  const { text, html: body } = emailOf(combined());
  assert.match(text, /TMS-FOS-V1/, 'the record format version is unchanged');
  assert.match(body, /TMS-FOS-V1/);
});

// -------------------------------------------------------------- the form

test('29. every new question appears in the form exactly as the record states it', () => {
  for (const q of TIMEBAR_QUESTIONS.concat(FOS_QUESTIONS)) {
    assert.ok(formText.includes(q.question.replace(/\s+/g, ' ')), `not on screen: ${q.question}`);
  }
});

test('30. hidden conditional inputs are cleared in the browser when the parent answer changes', () => {
  // The branch table drives both the hiding and the clearing; a block listed
  // without its fields would hide an answer while still submitting it.
  assert.match(app, /block: '#q4DelayBlock'[\s\S]{0,120}fields: \['q4DelayReason'\]/);
  assert.match(app, /block: '#q5Block'[\s\S]{0,160}fields: \['q5StruggleDetail'\][\s\S]{0,80}choices: \['q5LenderSupport'\]/);
  assert.match(app, /block: '#fosBalancesPaidDateBlock'[\s\S]{0,140}fields: \['fosBalancesPaidDate'\]/);
  assert.match(app, /block: '#q1AwarenessDateEstimatedBlock'[\s\S]{0,160}choices: \['q1AwarenessDateEstimated'\]/);
  // Radio groups are cleared too, not only text and checkbox controls.
  // Not just that the loop exists: that it selects the whole radio group. A
  // one-element selector here silently left the previous answer checked, and a
  // browser walkthrough is what found it.
  assert.ok(app.includes('b.choices.forEach'), 'closing a branch clears its radio groups too');
  const clearing = app.slice(app.indexOf('b.choices.forEach'), app.indexOf('b.choices.forEach') + 200);
  assert.ok(clearing.includes('$$('), 'every control in the group is cleared, not only the first');
  assert.ok(clearing.includes('el.checked = false'));
  assert.match(app, /el\.checked = false;/);
});

test('31. the new date controls are real date inputs, in both questionnaires', () => {
  assert.match(html, /<input id="q1AwarenessDate" name="q1AwarenessDate" type="date"/);
  assert.match(html, /<input id="fosBalancesPaidDate" name="fosBalancesPaidDate" type="date"/);
});
