// Regenerates the worked examples in fixtures/ from the real email builder,
// so the samples can never drift from what the app actually sends.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildEmail } = require('../lib/email-template.js');
const { VULNERABILITY_VALUES, VULNERABILITY_DETAILS } = require('../lib/questions-fos.js');

const META = { submissionId: 'SAMPLE-ONLY-NOT-A-REAL-SUBMISSION', completedAt: '2026-09-15T14:32:07+01:00' };

const FOS = {
  clientName: 'Alex Sample', reference: '200000001', lender: 'Example Bank plc', product: 'Credit card',
  fosVulnerabilities: [VULNERABILITY_VALUES[0], VULNERABILITY_VALUES[1]],
  // One explanation per selected circumstance, each answered on its own terms.
  [VULNERABILITY_DETAILS[0].field]: 'A long-term health condition meant I was signed off work for several months and could not keep on top of the paperwork.',
  [VULNERABILITY_DETAILS[1].declinedField]: true,
  fosCourtAction: 'No',
  fosLendingStart: '2016-04-18',
  fosLendingStartUnknown: false,
  fosLendingAmount: '1200',
  fosBalancesPaid: 'Yes',
  fosIncomeEmployment: '1450.00', fosIncomeBenefits: '', fosIncomeMaintenance: '', fosIncomePension: '',
  fosSavings: 'Yes',
  fosSavingsAmount: '350',
  fosOutHousing: '620', fosOutUtilities: '180.50', fosOutFood: '260', fosOutTransport: '95',
  fosOtherExpenses: 'Mobile phone contract and a small catalogue repayment.',
  fosDependants: 'Yes',
  fosDependantsCount: '2',
  // The worked example from the brief: the type and lender are remembered,
  // the amount is not.
  fosFurtherLending: 'Yes',
  fosFurtherLendingType: 'Credit card',
  fosFurtherLendingLender: 'Barclays',
  fosFurtherLendingAmountUnknown: true
};
const TIMEBAR = {
  communicationEvent: 'an annual statement showing the credit limit increase', communicationDate: 'March 2019',
  q1ThoughtBefore: 'No',
  q1AwarenessSource: 'When the basis of my current complaint was explained to me',
  q1NoMonthYear: 'January 2025',
  q1NoExplain: 'I only understood there might be a problem once it was explained to me.',
  q2Remember: 'Not sure',
  q2OtherMemory: 'I do not recall that statement specifically.',
  q3Circumstances: 'Yes',
  q3Dates: '2019 to 2021',
  q3Explain: 'I was unwell for a long period and struggled to deal with correspondence.'
};

const out = [
  ['fos-only', { ...FOS, mode: 'FOS_ONLY' }],
  // The combined example also exercises the approved "I don't remember the exact
  // date" answer, so both lending-date paths appear in the worked examples.
  // The combined sample exercises the other side of each alternative: the
  // lending date, the savings amount and the dependants count are all unknown.
  ['timebar-and-fos', {
    ...FOS, ...TIMEBAR, mode: 'TIMEBAR_AND_FOS',
    fosLendingStart: '', fosLendingStartUnknown: true,
    fosSavingsAmount: '', fosSavingsAmountUnknown: true,
    fosDependantsCount: '', fosDependantsCountUnknown: true,
  }]
];
for (const [name, data] of out) {
  const { text, html } = buildEmail(data, META);
  fs.writeFileSync(`fixtures/sample-email-${name}.txt`, text, 'utf8');
  fs.writeFileSync(`fixtures/sample-email-${name}.html`, html, 'utf8');
  console.log(`fixtures/sample-email-${name}.txt  (${text.split('\n').length} lines)`);
}
