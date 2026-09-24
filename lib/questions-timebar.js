// The approved TIME-BAR questionnaire wording.
//
// Copied verbatim from the live, approved TMS-Timebar-Quick-Form
// (lib/questions.js), which carries the wording approved in
// TMS-Timebar-Questionnaire-Quick.docx. It is reproduced here so this app is
// standalone; it is NOT re-worded, re-ordered or simplified, and the
// conditional branches behave exactly as they do in the live form.
//
// TMS has since approved amendments on top of that source, each marked in
// place below with the date. Anything not carrying such a marker is source
// wording and must not be edited.
//
// --- Approved 2026-09-24 ----------------------------------------------------
//
// 1. FIRST AWARENESS, ASKED ONCE. The source asked when the client first
//    thought something was wrong twice — once inside the "yes, I had thought
//    about it" branch ("Approximately when did you first think this?" plus
//    "What happened or what information made you think...") and again inside
//    the "no / not sure" branch ("Approximate month/year" plus "Please briefly
//    explain how you first became aware"). Both pairs captured the same two
//    substantive facts, so a client answering either branch was asked the same
//    question twice in different words.
//
//    They are replaced by one first-awareness group, asked once whichever
//    branch the client is in: a date, whether that date is an estimate, and
//    what caused the awareness. The branching question itself (Q1) and the
//    "no / not sure" awareness-source options are unchanged, because they
//    capture something the group does not: whether the client had thought
//    about it at all, and where the awareness came from.
//
//    Retired fields: q1YesMonthYear, q1YesWhy, q1NoMonthYear, q1NoExplain.
//    They are no longer accepted, so a payload still carrying them is rejected
//    as an unknown field rather than silently ignored.
//
//    The month/year free text became a real date control with an explicit
//    "is this an estimate?" answer beside it. A client who is unsure no longer
//    has to write "early 2020" into a text box and leave the reader guessing
//    whether that was precise: the date is the date, and the estimate flag
//    says how firm it is.
//
// 2. TWO NEW BLOCKS, sections 4 and 5: whether the client complained as soon
//    as payments became unaffordable (and why not, if they did not), and
//    whether they had repayment problems (and what happened, and whether the
//    lender supported them). Sections 1 to 3 are untouched and keep their
//    numbering.
//
// tests/questions.test.js asserts every string here appears verbatim in
// public/index.html, and tests/validation.test.js pins the whole of this
// wording to a hash, so an unapproved edit fails the build.

const YES = 'Yes';
const NO = 'No';
const NOT_SURE = 'Not sure';

const isYes = (v) => v === YES;
const isNoOrUnsure = (v) => v === NO || v === NOT_SURE;

// Q2's opening sentence is completed with the staff-entered lender event and
// date, exactly as the client saw it on screen.
const Q2_CONTEXT_PREFIX = 'The lender says its records show that ';
const Q2_CONTEXT_MIDDLE = ' occurred on or around ';
const q2RecordsSentence = (event, date) => `${Q2_CONTEXT_PREFIX}${event}${Q2_CONTEXT_MIDDLE}${date}.`;

// True once the client has given a first-awareness date. The estimate
// question and the validator both key off this one function, so "a date was
// supplied" means exactly the same thing on screen and on the server.
function hasAwarenessDate(data) {
  return String((data && data.q1AwarenessDate) || '').trim() !== '';
}

// Ordered exactly as the client answered them.
const TIMEBAR_QUESTIONS = [
  {
    id: 'Q1',
    heading: '1. When did you first think the lender might have done something wrong?',
    question: 'Before making your current complaint, had you ever thought or questioned whether the lender might have done something wrong by providing, increasing or continuing your borrowing?',
    field: 'q1ThoughtBefore',
    kind: 'choice',
    applies: () => true
  },
  {
    id: 'Q1_AWARENESS',
    question: 'When did you first think or become aware that the lender might have done something wrong?',
    field: 'q1AwarenessSource',
    kind: 'choice',
    applies: (d) => isNoOrUnsure(d.q1ThoughtBefore)
  },
  // The first-awareness group (approved 2026-09-24). Asked once, whichever
  // branch above the client took, so the same fact is never collected twice.
  {
    id: 'Q1_FIRST_AWARENESS_DATE',
    question: 'When did you first think the lender acted unfairly?',
    field: 'q1AwarenessDate',
    kind: 'date',
    applies: () => true
  },
  {
    // Asked only once a date exists, because there is nothing to qualify
    // otherwise. Required whenever the date is supplied: a date whose
    // precision nobody recorded is a date a reader has to guess about.
    id: 'Q1_FIRST_AWARENESS_DATE_ESTIMATED',
    question: 'Is this an estimated date?',
    field: 'q1AwarenessDateEstimated',
    kind: 'choice',
    applies: (d) => hasAwarenessDate(d)
  },
  {
    id: 'Q1_FIRST_AWARENESS_CAUSE',
    question: 'What was it that first made you aware the lender might not have acted fairly?',
    field: 'q1AwarenessExplanation',
    kind: 'text',
    applies: () => true
  },
  {
    id: 'Q2',
    heading: '2. The communication or event identified by the lender',
    // Reproduced in the order the client read them on screen.
    context: (d) => [
      q2RecordsSentence(d.communicationEvent, d.communicationDate),
      'The lender relies on this communication or event as a reason why it says you were, or should reasonably have been, aware that you had cause to complain.',
      'We have not been provided with a copy of this communication, so please answer only from what you genuinely remember.'
    ],
    question: 'Do you remember receiving, discussing or becoming aware of this communication or event?',
    field: 'q2Remember',
    kind: 'choice',
    applies: () => true
  },
  {
    id: 'Q2_RECOLLECTION',
    question: 'What do you remember the communication or event being about, and what did you understand it to mean at the time?',
    field: 'q2RememberWhat',
    kind: 'text',
    applies: (d) => isYes(d.q2Remember)
  },
  {
    id: 'Q2_CAUSED_CONCERN',
    question: 'At the time, did it make you think or question whether the lender might previously have done something wrong by providing, increasing or continuing your borrowing?',
    field: 'q2MadeThink',
    kind: 'choice',
    applies: (d) => isYes(d.q2Remember)
  },
  {
    id: 'Q2_EXPLANATION',
    question: 'Please briefly explain your answer in your own words.',
    field: 'q2Explain',
    kind: 'text',
    applies: (d) => isYes(d.q2Remember)
  },
  {
    id: 'Q2_OTHER_RECOLLECTION',
    question: 'If there is anything else you genuinely remember about this communication or event, please tell us below.',
    note: 'Optional.',
    field: 'q2OtherMemory',
    kind: 'text',
    applies: (d) => isNoOrUnsure(d.q2Remember)
  },
  {
    id: 'Q3',
    heading: '3. Did any serious circumstances affect your understanding or ability to act?',
    question: 'Were there any serious health, personal or financial circumstances, including anything you have previously told us about, that made it harder for you to:',
    bullets: [
      'understand the lender’s communications or actions;',
      'realise that the lender might have done something wrong; or',
      'make a complaint sooner?'
    ],
    field: 'q3Circumstances',
    kind: 'choice',
    applies: () => true
  },
  {
    id: 'Q3_DATES',
    question: 'Approximate dates',
    field: 'q3Dates',
    kind: 'text',
    applies: (d) => isYes(d.q3Circumstances)
  },
  {
    id: 'Q3_EXPLANATION',
    question: 'Please briefly explain what happened, approximately when it affected you and how it made things harder.',
    field: 'q3Explain',
    kind: 'text',
    applies: (d) => isYes(d.q3Circumstances)
  }
  ,
  // --- Sections 4 and 5 (approved 2026-09-24) -------------------------------
  {
    id: 'Q4',
    heading: '4. Complaining to the lender',
    question: 'Did you complain to the lender as soon as payments became unaffordable?',
    field: 'q4ComplainedPromptly',
    kind: 'choice',
    applies: () => true
  },
  {
    id: 'Q4_DELAY',
    question: 'Please explain why there was a delay.',
    field: 'q4DelayReason',
    kind: 'text',
    applies: (d) => d.q4ComplainedPromptly === NO
  },
  {
    id: 'Q5',
    heading: '5. Repayment difficulties',
    question: 'Did you have repayment problems?',
    field: 'q5RepaymentProblems',
    kind: 'choice',
    applies: () => true
  },
  {
    id: 'Q5_STRUGGLE',
    question: 'When did you start to struggle to repay the borrowing? What was the impact of this, and how long did it last?',
    field: 'q5StruggleDetail',
    kind: 'text',
    applies: (d) => isYes(d.q5RepaymentProblems)
  },
  {
    id: 'Q5_LENDER_SUPPORT',
    question: 'Did the lender provide any support when you were struggling financially (for example, offering payment deferrals or a repayment plan)?',
    field: 'q5LenderSupport',
    kind: 'choice',
    applies: (d) => isYes(d.q5RepaymentProblems)
  }
];

module.exports = {
  TIMEBAR_QUESTIONS, hasAwarenessDate,
  Q2_CONTEXT_PREFIX, Q2_CONTEXT_MIDDLE, q2RecordsSentence
};
