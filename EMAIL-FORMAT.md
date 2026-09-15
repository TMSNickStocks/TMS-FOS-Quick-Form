# Email format contract — `TMS-FOS-V1`

The submission email is the evidence record. It reproduces the full approved
question immediately before every answer, so a reviewer can see what was asked,
what the client was shown, and what they replied, without opening any
questionnaire template. It is not a field dump.

It is also machine-parsable. `tests/email.test.js` contains a parser written
from this document; if the emitted format drifts from what is written here, the
build fails.

## Envelope

```
FOS QUESTIONNAIRE ANSWERS
--------------------------------
Format: TMS-FOS-V1
Questionnaire mode: FOS_ONLY | TIMEBAR_AND_FOS
Questionnaire: FOS questionnaire only | Time-Bar + FOS questionnaire
Submission ID: <request id>
Date completed: <ISO 8601, Europe/London>
```

`Questionnaire mode` is the fixed machine-readable marker. `Questionnaire` is
the human label for the same thing.

The record ends with `END FOS QUESTIONNAIRE ANSWERS` at column 0.

## Subject line

Exactly:

```
FOS Questionnaire Answers
```

Fixed in `lib/mail.js`, not configurable by environment. It never carries the
client name, TMS reference, lender, product, any answer, or any vulnerability
information.

## Section order

| Order | Section | Present in |
|---|---|---|
| 1 | `ADMIN / MATTER INFORMATION` | both modes |
| 2 | `TIME-BAR QUESTIONNAIRE RESPONSES` | `TIMEBAR_AND_FOS` only |
| 3 | `FOS QUESTIONNAIRE RESPONSES` | both modes |
| 4 | `CONFIRMATION` | both modes |

In `FOS_ONLY` the Time-Bar section is omitted completely: no heading, no blocks,
no Time-Bar wording anywhere in the record, and the two Time-Bar admin rows are
absent.

## Headings

Block headings are presentation only. Two of them are the client-facing
headings TMS approved on 2026-09-15 in place of the source's own
representative-facing ones:

| Source heading | Heading used |
|---|---|
| `1. Vulnerabilities ("Tailoring to their circumstances")` | `1. Your circumstances` |
| `6. "Your customer's finances when they borrowed"` | `6. Your finances when you borrowed` |

Every question, option, example and piece of evidence wording beneath them is
unchanged. The record uses the same headings the client saw, so it still shows
exactly what was put to them.

## Admin section

`Label: value` lines. Continuation lines are indented two spaces. Which labels
appear is driven by the mode, from `adminFields()` in `lib/questions.js`, so the
form and the record can never disagree.

## Question blocks

```
[BLOCK_ID] Optional heading
CONTEXT:
  one indented paragraph per line
QUESTION:
  the full approved question
  • an approved bullet, if the question has any
NOTE:
  the approved note, if any
OPTIONS:
  • every option the client was shown
  a single trailing note about the "See examples" controls
CLIENT ANSWER:
  one indented line per answer line
```

Rules a parser may rely on, and which client text cannot break:

- a block starts with `[ID]` at column 0, `ID` matching `^[A-Z0-9_]+$`;
- `CONTEXT:` `QUESTION:` `NOTE:` `OPTIONS:` `STATEMENT:` `CLIENT ANSWER:` are
  marker lines at column 0, alone on the line;
- **every** content line — question wording and client answers alike — is
  indented by exactly two spaces.

Because nothing a client types ever reaches column 0, free text cannot forge a
block id, a marker, a section heading, the format marker, the mode marker or the
end marker. This is asserted directly in `tests/email.test.js`.

Block ids are stable and match the ids in `lib/questions-timebar.js` and
`lib/questions-fos.js`.

## Circumstance output

Which blocks appear depends on what was selected, and the two cases are
mutually exclusive.

**One or more circumstances selected.** Each gets its own block naming the
circumstance it explains, and the aggregate `FOS_VULNERABILITY` block is
**omitted** - it would restate in a bullet list exactly what those blocks
already say.

A consequence worth knowing when reading a record: which circumstances applied
stays explicit (one block each, each naming its category in full), but which
did **not** apply is now read from the absence of a block rather than from a
`not selected:` line.

**`None of these apply` selected.** There are no circumstance blocks, so the
aggregate `FOS_VULNERABILITY` block is kept and is the only record of the
answer. It reproduces the full primary question (`Do any of the following
apply?`), its instruction (`Please select all that apply:`), all five options
under `OPTIONS:`, and every option under `CLIENT ANSWER:` prefixed
`SELECTED: ` or `not selected: ` - so the answer is stated, never inferred.

### Section heading

Every circumstance block carries the section heading `1. Your circumstances`,
because any of them may be the first one recorded. The record prints a heading
once per run of blocks that share it, so the section is headed exactly once
wherever that run begins.

The example lists behind the `See examples` controls are **not** reproduced.
They sit behind a collapsed disclosure, so they were available to the client but
not necessarily read; reproducing four lists would bury the answer without
evidencing anything the client was actively shown. Instead one line records that
the controls were there:

```
Each option above except “None of these apply” had a “See examples” control the
client could open for examples.
```

The exact example wording lives in `lib/questions-fos.js` and is asserted
against the rendered form by `tests/questions.test.js`.

Two free-text blocks sit beneath the categories, and they are different things:

- `FOS_VULNERABILITY_EXPLANATION` — the approved follow-up, present only when a
  category was selected, and always answered (see **Conditional follow-ups**);
- `FOS_VULNERABILITY_DETAIL` — the source PDF's own optional "anything else"
  question, always present, and `Not provided` when left blank.

## Conditional follow-ups

Six questions are follow-ups, shown only when the answer above them opens them.
Each has its own stable id and, in the record, its own block carrying the full
approved question:

| Block id | Question | Opened by |
|---|---|---|
| `FOS_VULNERABILITY_HEALTH_DETAIL` | Please list any issues and tell us about how they affected you. | category 1 selected |
| `FOS_VULNERABILITY_LIFE_EVENT_DETAIL` | Please list any issues and tell us about how they affected you. | category 2 selected |
| `FOS_VULNERABILITY_RESILIENCE_DETAIL` | Please list any issues and tell us about how they affected you. | category 3 selected |
| `FOS_VULNERABILITY_CAPABILITY_DETAIL` | Please list any issues and tell us about how they affected you. | category 4 selected |
| `FOS_SAVINGS_AMOUNT` | Approximately how much did you have in savings? | savings = Yes |
| `FOS_DEPENDANTS_COUNT` | How many dependants did you have? | dependants = Yes |
| `FOS_FURTHER_LENDING_TYPE` | What type of further lending did you apply for? | further lending = Yes |
| `FOS_FURTHER_LENDING_LENDER` | Who was the further lending with? | further lending = Yes |
| `FOS_FURTHER_LENDING_AMOUNT` | Approximately how much was the further lending for? | further lending = Yes |

When a branch was not taken its block is **absent from the record entirely** -
not present-but-blank. A parser should treat a missing block as "the client was
never asked", which is different from "the client did not answer".

### Explicit alternatives

Each follow-up, and the lending start date, offers an explicit alternative to
answering. Choosing one is a real answer and is recorded as itself:

```
[FOS_SAVINGS_AMOUNT]
QUESTION:
  Approximately how much did you have in savings?
CLIENT ANSWER:
  I don't remember
```

Never as `Not provided`, never as a blank, and never as a fabricated `£0` or
`0`. The approved wording is `I don't remember` for every follow-up except the four
circumstance follow-ups, which use
`I don't remember / prefer not to add details`, and the lending start date, which
uses `I don't remember the exact date`.

The three further-lending answers are independent. A client who remembers the
lender but not the amount produces a record naming the lender and recording
`I don't remember` for the amount only.

## Financial output

Both financial groups print the full group question and then one line per row:

```
[FOS_INCOME] 6. Your finances when you borrowed
QUESTION:
  Income type — Monthly net amount (£)
CLIENT ANSWER:
  Employment: £1,450.00 [value: 1450.00]
  Benefits: Not provided
```

Each amount is given twice: human-readable pounds for the reviewer, and the
canonical numeric value in `[value: …]` for any later machine parsing. A blank
row is `Not provided`, never `0`.

The lending start date follows the same pattern in the source's own DD/MM/YYYY
form: `18/04/2016 [value: 2016-04-18]`.

If the client answered the same question by ticking **I don't remember the exact
date**, the block still reproduces the full approved question and its note, and
the answer is simply:

```
[FOS_LENDING_START] 3. When did the lending start?
QUESTION:
  When did the lending start?
NOTE:
  For example 01/01/2025
CLIENT ANSWER:
  I don't remember the exact date
```

No date is generated or inferred, no `[value: …]` is emitted, and it is not
recorded as `Not provided` — the record carries the answer the client actually
gave.

**No affordability calculation, total, surplus or shortfall is derived, and no
advice is given to the client.** `tests/email.test.js` asserts the record
contains no such value.

## Confirmation

```
CONFIRMATION

[CONFIRMATION] Customer confirmation
STATEMENT:
  I confirm that these answers are my own and reflect, to the best of my
  recollection, what I genuinely knew and understood at the relevant time.

Client confirmation: Yes
Date completed: <ISO 8601>
```

## HTML part

The same content, single column, 640px, inline styles only (Gmail strips
`<style>`). Every client value is HTML-escaped. Vulnerability options render as
☑ / ☐ so the selection is readable at a glance.

## Versioning

Increment the version when the **value format or structure** changes, since that
is what a parser keys on. `TMS-FOS-V1` is the first released format.

## Worked examples

- `fixtures/sample-email-fos-only.txt` / `.html`
- `fixtures/sample-email-timebar-and-fos.txt` / `.html`

Regenerate with `node scripts/sample-emails.mjs`. They are produced by the real
builder, so they cannot drift from what the app sends.
