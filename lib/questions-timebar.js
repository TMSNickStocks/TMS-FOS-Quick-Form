// The approved TIME-BAR questionnaire wording.
//
// Copied verbatim from the live, approved TMS-Timebar-Quick-Form
// (lib/questions.js), which carries the wording approved in
// TMS-Timebar-Questionnaire-Quick.docx. It is reproduced here so this app is
// standalone; it is NOT re-worded, re-ordered or simplified, and the
// conditional branches behave exactly as they do in the live form.
//
// tests/questions-timebar.test.js asserts every string here appears verbatim
// in public/index.html, and tests/parity.test.js asserts this file still
// matches the approved source wording. Do not edit any wording here.

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
    id: 'Q1_DATE',
    question: 'Approximately when did you first think this?',
    field: 'q1YesMonthYear',
    kind: 'text',
    applies: (d) => isYes(d.q1ThoughtBefore)
  },
  {
    id: 'Q1_EXPLANATION',
    question: 'What happened or what information made you think or question whether the lender might have done something wrong?',
    field: 'q1YesWhy',
    kind: 'text',
    applies: (d) => isYes(d.q1ThoughtBefore)
  },
  {
    id: 'Q1_AWARENESS',
    question: 'When did you first think or become aware that the lender might have done something wrong?',
    field: 'q1AwarenessSource',
    kind: 'choice',
    applies: (d) => isNoOrUnsure(d.q1ThoughtBefore)
  },
  {
    id: 'Q1_AWARENESS_DATE',
    question: 'Approximate month/year',
    field: 'q1NoMonthYear',
    kind: 'text',
    applies: (d) => isNoOrUnsure(d.q1ThoughtBefore)
  },
  {
    id: 'Q1_AWARENESS_EXPLANATION',
    question: 'Please briefly explain how you first became aware, if you can remember.',
    field: 'q1NoExplain',
    kind: 'text',
    applies: (d) => isNoOrUnsure(d.q1ThoughtBefore)
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
];

module.exports = {
  TIMEBAR_QUESTIONS,
  Q2_CONTEXT_PREFIX, Q2_CONTEXT_MIDDLE, q2RecordsSentence
};
