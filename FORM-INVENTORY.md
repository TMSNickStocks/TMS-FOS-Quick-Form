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
| `FOS_VULNERABILITY_DETAIL` | `fosVulnerabilityDetail` | textarea | no | 1400 |
| `FOS_COURT_ACTION` | `fosCourtAction` | radio Yes/No | yes | — |
| `FOS_LENDING_START` | `fosLendingStart` | date | yes, unless the client does not know it | real past date, ≥ 1900, not future |
| `FOS_LENDING_START` | `fosLendingStartUnknown` | checkbox “I don't know the exact date” | no | boolean; mutually exclusive with the date |
| `FOS_LENDING_AMOUNT` | `fosLendingAmount` | text, decimal keypad | yes | pounds, ≤ 2 dp |
| `FOS_BALANCES_PAID` | `fosBalancesPaid` | radio Yes/No | yes | — |
| `FOS_INCOME` | `fosIncomeEmployment` | text, decimal keypad | no | pounds |
| `FOS_INCOME` | `fosIncomeBenefits` | text, decimal keypad | no | pounds |
| `FOS_INCOME` | `fosIncomeMaintenance` | text, decimal keypad | no | pounds |
| `FOS_INCOME` | `fosIncomePension` | text, decimal keypad | no | pounds |
| `FOS_SAVINGS` | `fosSavings` | radio Yes/No | yes | — |
| `FOS_OUTGOINGS` | `fosOutHousing` | text, decimal keypad | no | pounds |
| `FOS_OUTGOINGS` | `fosOutUtilities` | text, decimal keypad | no | pounds |
| `FOS_OUTGOINGS` | `fosOutFood` | text, decimal keypad | no | pounds |
| `FOS_OUTGOINGS` | `fosOutTransport` | text, decimal keypad | no | pounds |
| `FOS_OTHER_EXPENSES` | `fosOtherExpenses` | textarea | no | 1400 |
| `FOS_DEPENDANTS` | `fosDependants` | radio Yes/No | yes | — |
| `FOS_FURTHER_LENDING` | `fosFurtherLending` | radio Yes/No | yes | — |

### Vulnerability options (exact, in source order)

1. A physical or mental health condition which means you find everyday tasks or decision making more difficult — **See examples** (8 items)
2. You've experienced a major change in your personal life — **See examples** (11 items)
3. You struggle to deal with unexpected financial or emotional changes — **See examples** (3 items)
4. You sometimes need extra help to understand information or make decisions — **See examples** (6 items)
5. None of these apply — no examples

"None of these apply" is mutually exclusive with the other four, enforced in the
browser **and** on the server.

Selecting a vulnerability category never obliges the client to type an
explanation: the source questionnaire does not require it.

### Lending start date

Approved 2026-09-15: a client is never forced to invent a date. The approved
question is unchanged and the client answers it either with an exact date or by
ticking **I don't know the exact date**.

- The two are mutually exclusive, enforced in the browser **and** on the server.
- Ticking the checkbox clears and disables the date field; entering a date
  unticks the checkbox.
- When the checkbox is ticked the date is **not** required, and no date is
  generated or inferred — the stored value is forced empty.
- The review page shows `I don't know the exact date`.
- The record reproduces the full question and records
  `CLIENT ANSWER: I don't know the exact date`.

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
- FOS question blocks: **12**; FOS accepted keys: **19** (the two financial
  groups carry four fields each, and the lending-date question carries the
  date plus its “I don't know” checkbox)
- Common keys (matter details, token, confirmation, bot controls): **9**
- **Total accepted keys: 28 (FOS-only) / 44 (combined).** Anything else is
  rejected as an unknown field.
