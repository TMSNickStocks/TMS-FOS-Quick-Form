# Field inventory — TMS-FOS-Quick-Form

Every field the application accepts, in the order it is asked. Nothing else is
accepted: the submission validator rejects any key not listed for the selected
questionnaire mode.

Source of the FOS wording: `FOS Q's for clients.pdf`.
Source of the Time-Bar wording: the live, approved TMS-Timebar-Quick-Form
(reproduced byte-for-byte; a locked hash in `tests/validation.test.js` fails the
build if a single character changes).

---

## Questionnaire modes

| Mode | Label shown to staff | Sections asked |
|---|---|---|
| `FOS_ONLY` | FOS questionnaire only | FOS |
| `TIMEBAR_AND_FOS` | Time-Bar + FOS questionnaire | Time-Bar, then FOS |

The mode is chosen by staff, sealed inside the encrypted link, and re-checked
server side. A client cannot change it.

---

## 1. Admin / matter information (staff, link builder)

| Field | Control | Required | Max | Modes |
|---|---|---|---|---|
| `mode` | radio | yes | — | both |
| `clientName` | text | yes | 120 | both |
| `reference` | text, numeric keypad | yes, exactly 9 digits | 9 | both |
| `lender` | text | yes | 120 | both |
| `product` | select | yes, one of the six approved values | — | both |
| `communicationEvent` | textarea | yes | 500 | `TIMEBAR_AND_FOS` only |
| `communicationDate` | text | yes | 60 | `TIMEBAR_AND_FOS` only |

`product` values: Credit card, Loan, Overdraft, Catalogue, Store card, Other.

In `FOS_ONLY` the two Time-Bar fields are not shown, not sent, and **rejected as
unknown fields** if posted anyway.

---

## 2. Time-Bar questionnaire — `TIMEBAR_AND_FOS` only

Approved wording, unchanged. Conditional branches behave exactly as the live
form. Omitted entirely in `FOS_ONLY`.

| Block ID | Field | Control | Required | Max | Shown when |
|---|---|---|---|---|---|
| `Q1` | `q1ThoughtBefore` | radio Yes/No/Not sure | yes | — | always |
| `Q1_DATE` | `q1YesMonthYear` | text (free text) | no | 60 | Q1 = Yes |
| `Q1_EXPLANATION` | `q1YesWhy` | textarea | yes | 800 | Q1 = Yes |
| `Q1_AWARENESS` | `q1AwarenessSource` | radio, 5 approved options | yes | — | Q1 = No / Not sure |
| `Q1_AWARENESS_DATE` | `q1NoMonthYear` | text (free text) | no | 60 | Q1 = No / Not sure |
| `Q1_AWARENESS_EXPLANATION` | `q1NoExplain` | textarea | no | 800 | Q1 = No / Not sure |
| `Q2` | `q2Remember` | radio Yes/No/Not sure | yes | — | always |
| `Q2_RECOLLECTION` | `q2RememberWhat` | textarea | yes | 1000 | Q2 = Yes |
| `Q2_CAUSED_CONCERN` | `q2MadeThink` | radio Yes/No/Not sure | yes | — | Q2 = Yes |
| `Q2_EXPLANATION` | `q2Explain` | textarea | yes | 1000 | Q2 = Yes |
| `Q2_OTHER_RECOLLECTION` | `q2OtherMemory` | textarea | no | 1000 | Q2 = No / Not sure |
| `Q3` | `q3Circumstances` | radio Yes/No/Not sure | yes | — | always |
| `Q3_DATES` | `q3Dates` | text | no | 120 | Q3 = Yes |
| `Q3_EXPLANATION` | `q3Explain` | textarea | yes | 1400 | Q3 = Yes |

---

## 3. FOS questionnaire — both modes

| Block ID | Field | Control | Required | Max / format |
|---|---|---|---|---|
| `FOS_VULNERABILITY` | `fosVulnerabilities` | 5 checkboxes | yes, at least one | array of approved option strings |
| `FOS_VULNERABILITY_HEALTH_DETAIL` | `fosVulnerabilityHealthDetail` | textarea | yes, when category 1 is selected | 1400 |
| `FOS_VULNERABILITY_HEALTH_DETAIL` | `fosVulnerabilityHealthDetailDeclined` | checkbox | no | boolean; mutually exclusive with the text |
| `FOS_VULNERABILITY_LIFE_EVENT_DETAIL` | `fosVulnerabilityLifeEventDetail` | textarea | yes, when category 2 is selected | 1400 |
| `FOS_VULNERABILITY_LIFE_EVENT_DETAIL` | `fosVulnerabilityLifeEventDetailDeclined` | checkbox | no | boolean; mutually exclusive with the text |
| `FOS_VULNERABILITY_RESILIENCE_DETAIL` | `fosVulnerabilityResilienceDetail` | textarea | yes, when category 3 is selected | 1400 |
| `FOS_VULNERABILITY_RESILIENCE_DETAIL` | `fosVulnerabilityResilienceDetailDeclined` | checkbox | no | boolean; mutually exclusive with the text |
| `FOS_VULNERABILITY_CAPABILITY_DETAIL` | `fosVulnerabilityCapabilityDetail` | textarea | yes, when category 4 is selected | 1400 |
| `FOS_VULNERABILITY_CAPABILITY_DETAIL` | `fosVulnerabilityCapabilityDetailDeclined` | checkbox | no | boolean; mutually exclusive with the text |
| `FOS_COURT_ACTION` | `fosCourtAction` | radio Yes/No | yes | — |
| `FOS_LENDING_START` | `fosLendingStart` | date | yes, unless the client does not know it | real past date, ≥ 1900, not future |
| `FOS_LENDING_START` | `fosLendingStartUnknown` | checkbox “I don't remember the exact date” | no | boolean; mutually exclusive with the date |
| `FOS_LENDING_AMOUNT` | `fosLendingAmount` | text, decimal keypad | yes | pounds, ≤ 2 dp |
| `FOS_BALANCES_PAID` | `fosBalancesPaid` | radio Yes/No | yes | — |
| `FOS_INCOME` | `fosIncomeEmployment` | text, decimal keypad | no | pounds |
| `FOS_INCOME` | `fosIncomeBenefits` | text, decimal keypad | no | pounds |
| `FOS_INCOME` | `fosIncomeMaintenance` | text, decimal keypad | no | pounds |
| `FOS_INCOME` | `fosIncomePension` | text, decimal keypad | no | pounds |
| `FOS_SAVINGS` | `fosSavings` | radio Yes/No | yes | — |
| `FOS_SAVINGS_AMOUNT` | `fosSavingsAmount` | text, decimal keypad | yes, when savings = Yes | pounds |
| `FOS_SAVINGS_AMOUNT` | `fosSavingsAmountUnknown` | checkbox | no | boolean; mutually exclusive with the amount |
| `FOS_OUTGOINGS` | `fosOutHousing` | text, decimal keypad | no | pounds |
| `FOS_OUTGOINGS` | `fosOutUtilities` | text, decimal keypad | no | pounds |
| `FOS_OUTGOINGS` | `fosOutFood` | text, decimal keypad | no | pounds |
| `FOS_OUTGOINGS` | `fosOutTransport` | text, decimal keypad | no | pounds |
| `FOS_OTHER_EXPENSES` | `fosOtherExpenses` | textarea | no | 1400 |
| `FOS_DEPENDANTS` | `fosDependants` | radio Yes/No | yes | — |
| `FOS_DEPENDANTS_COUNT` | `fosDependantsCount` | text, numeric keypad | yes, when dependants = Yes | whole number, 1–50 |
| `FOS_DEPENDANTS_COUNT` | `fosDependantsCountUnknown` | checkbox | no | boolean; mutually exclusive with the count |
| `FOS_FURTHER_LENDING` | `fosFurtherLending` | radio Yes/No | yes | — |
| `FOS_FURTHER_LENDING_TYPE` | `fosFurtherLendingType` | text | yes, when further lending = Yes | 300 |
| `FOS_FURTHER_LENDING_TYPE` | `fosFurtherLendingTypeUnknown` | checkbox | no | boolean; mutually exclusive with the text |
| `FOS_FURTHER_LENDING_LENDER` | `fosFurtherLendingLender` | text | yes, when further lending = Yes | 300 |
| `FOS_FURTHER_LENDING_LENDER` | `fosFurtherLendingLenderUnknown` | checkbox | no | boolean; mutually exclusive with the text |
| `FOS_FURTHER_LENDING_AMOUNT` | `fosFurtherLendingAmount` | text, decimal keypad | yes, when further lending = Yes | pounds |
| `FOS_FURTHER_LENDING_AMOUNT` | `fosFurtherLendingAmountUnknown` | checkbox | no | boolean; mutually exclusive with the amount |

### Vulnerability options (exact, in source order)

1. A physical or mental health condition which means you find everyday tasks or decision making more difficult — **See examples** (8 items)
2. You've experienced a major change in your personal life — **See examples** (11 items)
3. You struggle to deal with unexpected financial or emotional changes — **See examples** (3 items)
4. You sometimes need extra help to understand information or make decisions — **See examples** (6 items)
5. None of these apply — no examples

"None of these apply" is mutually exclusive with the other four, enforced in the
browser **and** on the server.

The review screen and the evidence record show the aggregate list **only** when
no circumstance was selected - that is, when the answer was
"None of these apply", where it is the only record of the answer. With
circumstances selected, each appears once through its own block instead.

Each of the four substantive categories carries **its own** follow-up, revealed
directly beneath that category:

> Please list any issues and tell us about how they affected you.

with the alternative **I don't remember / prefer not to add details** beneath
the textarea. Each is answered independently: selecting two categories means
answering two questions, and explaining one never satisfies the other.

| Category | Block id | Field |
|---|---|---|
| 1. health condition | `FOS_VULNERABILITY_HEALTH_DETAIL` | `fosVulnerabilityHealthDetail` |
| 2. major life change | `FOS_VULNERABILITY_LIFE_EVENT_DETAIL` | `fosVulnerabilityLifeEventDetail` |
| 3. unexpected changes | `FOS_VULNERABILITY_RESILIENCE_DETAIL` | `fosVulnerabilityResilienceDetail` |
| 4. extra help needed | `FOS_VULNERABILITY_CAPABILITY_DETAIL` | `fosVulnerabilityCapabilityDetail` |

Unticking a category hides its follow-up and clears both its textarea and its
alternative flag; a payload still carrying them is rejected server side.

### Removed

Two fields were removed outright and are **no longer accepted** - a payload
carrying any of them is rejected as an unknown field:

| Removed question | Removed fields |
|---|---|
| Please briefly tell us what applied to you. | `fosVulnerabilityExplanation`, `fosVulnerabilityExplanationDeclined` |
| If there's anything else you'd like to tell us about this, you can do so here | `fosVulnerabilityDetail` |

The first was a single combined explanation covering every selected category;
the second was the source PDF's own optional free-text box. Both were replaced
by the per-category follow-ups above.

### Lending start date

Approved 2026-09-15: a client is never forced to invent a date. The approved
question is unchanged and the client answers it either with an exact date or by
ticking **I don't remember the exact date**.

- The two are mutually exclusive, enforced in the browser **and** on the server.
- Ticking the checkbox clears and disables the date field; entering a date
  unticks the checkbox.
- When the checkbox is ticked the date is **not** required, and no date is
  generated or inferred — the stored value is forced empty.
- The review page shows `I don't remember the exact date`.
- The record reproduces the full question and records
  `CLIENT ANSWER: I don't remember the exact date`.

### Conditional follow-ups (approved 2026-09-15)

The source questionnaire records a bare Yes for savings, dependants and further
lending, and records which vulnerability categories applied without asking what
happened. These follow-ups capture the substance.

| Opened by | Follow-up | Alternative |
|---|---|---|
| each selected category, separately | Please list any issues and tell us about how they affected you. | I don't remember / prefer not to add details |
| savings = Yes | Approximately how much did you have in savings? | I don't remember |
| dependants = Yes | How many dependants did you have? | I don't remember |
| further lending = Yes | What type of further lending did you apply for? | I don't remember |
| further lending = Yes | Who was the further lending with? | I don't remember |
| further lending = Yes | Approximately how much was the further lending for? | I don't remember |

Rules, enforced in the browser **and** on the server:

- **Branch not taken** — nothing may be supplied for it. A savings amount sent
  alongside `savings: No` is contradictory and the submission is rejected. The
  field is also forced empty, so nothing stale can reach the record.
- **Branch taken** — exactly one of the value or its alternative must be
  supplied, never both and never neither.
- **Each further-lending answer is independent.** Knowing the lender but not the
  amount is an ordinary answer; one gap never forces the others.
- **Each selected circumstance is explained separately.** The record shows which
  explanation belongs to which circumstance, which one combined answer could not.
- An alternative is a real answer: it is recorded as itself, never as a blank,
  a zero or `Not provided`.

### Money handling

Input accepts `£`, thousands separators and spaces. Stored canonically
(`1250.50`). The record prints both a human-readable amount and the raw value:
`£1,250.50 [value: 1250.50]`. A blank stays blank and is recorded as
`Not provided` — never as `0`.

**No affordability calculation, total or advice is produced anywhere.**

---

## 4. Confirmation and controls

| Field | Purpose |
|---|---|
| `confirmation` | must be boolean `true`; approved statement reproduced in the record |
| `prefillToken` | the encrypted link; mandatory, verified against every matter field |
| `website` | honeypot; any value rejects the submission |
| `startedAt` | timing check; under 4 seconds rejects the submission |

---

## 5. Counts

- Admin fields collected by staff: **5** (FOS-only) / **7** (combined)
- Time-Bar question blocks: **14**; Time-Bar accepted keys: **16** (combined only,
  the 14 answers plus `communicationEvent` and `communicationDate`)
- FOS question blocks: **20**; FOS accepted keys: **36**
- Common keys (matter details, token, confirmation, bot controls): **9**
- **Total accepted keys: 45 (FOS-only) / 61 (combined).** Anything else is
  rejected as an unknown field.
