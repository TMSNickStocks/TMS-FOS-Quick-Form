// The approved FOS questionnaire wording, reproduced from
// "FOS Q's for clients.pdf".
//
// Every question, option and example transcribed from that PDF is reproduced
// exactly: none has been re-worded, reordered or simplified, and no
// affordability calculation is derived from the financial answers.
//
// TMS has since approved additions on top of that source, each marked in place
// below with the date: two client-facing presentation headings, and a set of
// follow-up questions that capture the substance behind a bare Yes. Anything
// not carrying such a marker is source wording and must not be edited.
//
// Two section headings in the source are written from the perspective of a
// professional representative rather than the client, and would confuse a
// client reading them. TMS approved replacing them with client-facing
// headings on 2026-09-15:
//
//   1. Vulnerabilities ("Tailoring to their circumstances")
//        -> 1. Your circumstances
//   6. "Your customer's finances when they borrowed"
//        -> 6. Your finances when you borrowed
//
// These are PRESENTATION HEADINGS ONLY. Every substantive question, answer
// option, example and piece of evidence wording beneath them is unchanged from
// the source PDF. tests/questions.test.js asserts that the substantive wording
// still matches the source and that the old headings appear nowhere.
//
// This module is the single source of truth shared by the form and the
// submission email. tests/questions-fos.test.js asserts every string here
// appears verbatim in public/index.html, so the two can never drift apart.

const YES_NO = ['Yes', 'No'];

// --- Section 1: vulnerabilities -------------------------------------------
// Option order, labels and example lists are exactly as printed in the PDF.
// "See examples (dropdown)" in the source is an authoring instruction; the
// visible control label is "See examples" and the disclosure itself is the
// dropdown. The example lists are held here so the email can state exactly
// what the client had available to read when answering.

const VULNERABILITY_NONE = 'None of these apply';

const VULNERABILITY_OPTIONS = [
  {
    value: 'A physical or mental health condition which means you find everyday tasks or decision making more difficult',
    examples: [
      'long-term or severe illness',
      'physical disability',
      'sensory impairment (e.g. sight or hearing loss)',
      'mental-health conditions',
      'addictions',
      'cognitive impairment, dementia',
      'learning difficulty',
      'low emotional resilience (stress, anxiety)'
    ]
  },
  {
    value: 'You’ve experienced a major change in your personal life',
    examples: [
      'bereavement',
      'relationship breakdown, separation or divorce',
      'serious accident',
      'large financial loss or gain',
      'job loss, redundancy or retirement',
      'caring responsibilities',
      'maternity, paternity',
      'changes in family circumstances',
      'domestic abuse, including financial abuse',
      'migration',
      'criminal conviction'
    ]
  },
  {
    value: 'You struggle to deal with unexpected financial or emotional changes',
    examples: [
      'erratic or insufficient income',
      'over-indebtedness, heavy credit use, mortgage arrears',
      'no or very low savings / safety net'
    ]
  },
  {
    value: 'You sometimes need extra help to understand information or make decisions',
    examples: [
      'low numeracy or literacy',
      'limited knowledge of financial products',
      'low confidence in managing money',
      'poor digital skills',
      'limited English',
      'learning difficulties'
    ]
  },
  { value: VULNERABILITY_NONE, examples: [] }
];

const VULNERABILITY_VALUES = VULNERABILITY_OPTIONS.map((o) => o.value);
const EXAMPLES_INTRO = 'Some examples of this could include:';
const EXAMPLES_TOGGLE = 'See examples';

// --- Section 6: financial groups ------------------------------------------
const INCOME_ROWS = [
  ['Employment', 'fosIncomeEmployment'],
  ['Benefits', 'fosIncomeBenefits'],
  ['Maintenance', 'fosIncomeMaintenance'],
  ['Pension', 'fosIncomePension']
];

// The source prints these labels over two lines inside a table cell; they are
// one label and are reproduced here as one line.
const OUTGOING_ROWS = [
  ['Housing costs (like mortgage, rent or council housing payment)', 'fosOutHousing'],
  ['Utilities (like gas, electric, phone, council tax, water)', 'fosOutUtilities'],
  ['Food or grocery costs', 'fosOutFood'],
  ['Fuel or transport costs', 'fosOutTransport']
];

// --- Section 3: lending start date ----------------------------------------
// Approved 2026-09-15: a client must not be forced to invent an exact date.
// The approved question is unchanged; this is an alternative answer to it, and
// is mutually exclusive with the date. When it is chosen no date is generated
// or inferred - the record simply carries this answer.
const UNKNOWN_DATE_LABEL = "I don't know the exact date";

// --- Follow-up questions (approved 2026-09-15) -----------------------------
// The source questionnaire records a bare Yes for savings, dependants and
// further lending, and records which vulnerability categories applied without
// asking what actually happened. TMS approved follow-ups so the evidence
// record carries the substance rather than just the flag.
//
// Every follow-up offers an explicit alternative rather than forcing a guess.
// Choosing it is a real answer: it is recorded as itself, never as a blank,
// a zero or "Not provided".
const UNKNOWN_LABEL = 'I don’t know';
const VULNERABILITY_DECLINE_LABEL = 'I don’t know / prefer not to add details';

// True once the client has selected at least one real vulnerability category.
// "None of these apply" is not a category, so it does not open the follow-up.
function hasVulnerabilityCategory(data) {
  const chosen = data && data.fosVulnerabilities;
  return Array.isArray(chosen) && chosen.some((v) => v !== VULNERABILITY_NONE && VULNERABILITY_VALUES.includes(v));
}

const INCOME_GROUP_LABEL = 'Income type';
const INCOME_AMOUNT_LABEL = 'Monthly net amount (£)';
const OUTGOING_GROUP_LABEL = 'Essential outgoings';
const OUTGOING_AMOUNT_LABEL = 'Monthly contribution (£)';

const FOS_QUESTIONS = [
  {
    id: 'FOS_VULNERABILITY',
    // Client-facing presentation heading (approved 2026-09-15). The source's
    // own heading was representative-facing; the question below is unchanged.
    heading: '1. Your circumstances',
    question: 'Do any of the following apply?',
    note: 'Please select all that apply:',
    field: 'fosVulnerabilities',
    kind: 'multi',
    options: VULNERABILITY_OPTIONS,
    applies: () => true
  },
  {
    // Approved 2026-09-15. Asked only once a real category is selected, and
    // answered once for all of them: the client is not made to explain each
    // category separately.
    //
    // The id is FOS_VULNERABILITY_EXPLANATION, not FOS_VULNERABILITY_DETAIL as
    // suggested, because FOS_VULNERABILITY_DETAIL already identifies the
    // source PDF's own optional free-text question below. Reusing it would
    // silently change what that id means in the evidence record.
    id: 'FOS_VULNERABILITY_EXPLANATION',
    question: 'Please briefly tell us what applied to you.',
    field: 'fosVulnerabilityExplanation',
    kind: 'text',
    unknownField: 'fosVulnerabilityExplanationDeclined',
    unknownLabel: VULNERABILITY_DECLINE_LABEL,
    applies: hasVulnerabilityCategory
  },
  {
    id: 'FOS_VULNERABILITY_DETAIL',
    question: 'If there’s anything else you’d like to tell us about this, you can do so here',
    note: 'Optional.',
    field: 'fosVulnerabilityDetail',
    kind: 'text',
    applies: () => true
  },
  {
    id: 'FOS_COURT_ACTION',
    heading: '2. Has there been any court action related to the complaint (or is any planned)?',
    question: 'Has there been any court action related to the complaint (or is any planned)?',
    field: 'fosCourtAction',
    kind: 'choice',
    applies: () => true
  },
  {
    id: 'FOS_LENDING_START',
    heading: '3. When did the lending start?',
    question: 'When did the lending start?',
    note: 'For example 01/01/2025',
    field: 'fosLendingStart',
    kind: 'date',
    unknownField: 'fosLendingStartUnknown',
    unknownLabel: UNKNOWN_DATE_LABEL,
    applies: () => true
  },
  {
    id: 'FOS_LENDING_AMOUNT',
    heading: '4. How much was the lending initially for?',
    question: 'How much was the lending initially for?',
    note: 'Enter amount (£)',
    field: 'fosLendingAmount',
    kind: 'money',
    applies: () => true
  },
  {
    id: 'FOS_BALANCES_PAID',
    heading: '5. Have any outstanding balances been paid?',
    question: 'Have any outstanding balances been paid?',
    field: 'fosBalancesPaid',
    kind: 'choice',
    applies: () => true
  },
  {
    id: 'FOS_INCOME',
    // Client-facing presentation heading (approved 2026-09-15). The source's
    // own heading was representative-facing; the group question and every row
    // label below are unchanged.
    heading: '6. Your finances when you borrowed',
    question: 'Income type — Monthly net amount (£)',
    groupLabel: INCOME_GROUP_LABEL,
    amountLabel: INCOME_AMOUNT_LABEL,
    rows: INCOME_ROWS,
    kind: 'group',
    applies: () => true
  },
  {
    id: 'FOS_SAVINGS',
    question: 'Did you have any savings at the time of the initial lending?',
    field: 'fosSavings',
    kind: 'choice',
    applies: () => true
  },
  {
    // Approved 2026-09-15. Asked only after Yes. A client who cannot recall
    // the figure answers "I don't know" rather than being pushed towards a
    // number, and the record never shows a fabricated £0.
    id: 'FOS_SAVINGS_AMOUNT',
    question: 'Approximately how much did you have in savings?',
    field: 'fosSavingsAmount',
    kind: 'money',
    unknownField: 'fosSavingsAmountUnknown',
    unknownLabel: UNKNOWN_LABEL,
    applies: (d) => d.fosSavings === 'Yes'
  },
  {
    id: 'FOS_OUTGOINGS',
    question: 'Essential outgoings — Monthly contribution (£)',
    groupLabel: OUTGOING_GROUP_LABEL,
    amountLabel: OUTGOING_AMOUNT_LABEL,
    rows: OUTGOING_ROWS,
    kind: 'group',
    applies: () => true
  },
  {
    id: 'FOS_OTHER_EXPENSES',
    question: 'Please provide details of any other regular expenses you had at that time (optional)',
    field: 'fosOtherExpenses',
    kind: 'text',
    applies: () => true
  },
  {
    id: 'FOS_DEPENDANTS',
    question: 'Did you have any dependants at the time?',
    field: 'fosDependants',
    kind: 'choice',
    applies: () => true
  },
  {
    // Approved 2026-09-15. Asked only after Yes, so the count must be at
    // least one: zero would contradict the answer it follows.
    id: 'FOS_DEPENDANTS_COUNT',
    question: 'How many dependants did you have?',
    field: 'fosDependantsCount',
    kind: 'integer',
    unknownField: 'fosDependantsCountUnknown',
    unknownLabel: UNKNOWN_LABEL,
    applies: (d) => d.fosDependants === 'Yes'
  },
  {
    id: 'FOS_FURTHER_LENDING',
    question: 'Did you apply for any further lending?',
    field: 'fosFurtherLending',
    kind: 'choice',
    applies: () => true
  },
  // Approved 2026-09-15. Three independent follow-ups, each with its own
  // "I don't know". A client who remembers the lender but not the amount
  // answers each one on its own terms; one gap never forces the others.
  {
    id: 'FOS_FURTHER_LENDING_TYPE',
    question: 'What type of further lending did you apply for?',
    field: 'fosFurtherLendingType',
    kind: 'text',
    unknownField: 'fosFurtherLendingTypeUnknown',
    unknownLabel: UNKNOWN_LABEL,
    applies: (d) => d.fosFurtherLending === 'Yes'
  },
  {
    id: 'FOS_FURTHER_LENDING_LENDER',
    question: 'Who was the further lending with?',
    field: 'fosFurtherLendingLender',
    kind: 'text',
    unknownField: 'fosFurtherLendingLenderUnknown',
    unknownLabel: UNKNOWN_LABEL,
    applies: (d) => d.fosFurtherLending === 'Yes'
  },
  {
    id: 'FOS_FURTHER_LENDING_AMOUNT',
    question: 'Approximately how much was the further lending for?',
    field: 'fosFurtherLendingAmount',
    kind: 'money',
    unknownField: 'fosFurtherLendingAmountUnknown',
    unknownLabel: UNKNOWN_LABEL,
    applies: (d) => d.fosFurtherLending === 'Yes'
  }
];

// Every money field in the questionnaire, in the order it is asked.
const MONEY_FIELDS = ['fosLendingAmount']
  .concat(INCOME_ROWS.map(([, f]) => f))
  .concat(OUTGOING_ROWS.map(([, f]) => f));

module.exports = {
  FOS_QUESTIONS, YES_NO,
  VULNERABILITY_OPTIONS, VULNERABILITY_VALUES, VULNERABILITY_NONE,
  EXAMPLES_INTRO, EXAMPLES_TOGGLE, UNKNOWN_DATE_LABEL,
  UNKNOWN_LABEL, VULNERABILITY_DECLINE_LABEL, hasVulnerabilityCategory,
  INCOME_ROWS, OUTGOING_ROWS, MONEY_FIELDS,
  INCOME_GROUP_LABEL, INCOME_AMOUNT_LABEL, OUTGOING_GROUP_LABEL, OUTGOING_AMOUNT_LABEL
};
