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

## Vulnerability output

The block reproduces the full primary question (`Do any of the following apply?`)
and its instruction (`Please select all that apply:`), lists all five options
under `OPTIONS:`, and then records **every** option under `CLIENT ANSWER:`
prefixed either `SELECTED: ` or `not selected: `.

This means:

- selecting several categories records each one explicitly;
- selecting `None of these apply` records that explicitly, rather than leaving it
  to be inferred from absence;
- which categories were *not* selected is equally unambiguous.

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

If the client typed anything in the follow-up free text, its exact approved
question is reproduced with their answer in its own block,
`FOS_VULNERABILITY_DETAIL`.

## Financial output

Both financial groups print the full group question and then one line per row:

```
[FOS_INCOME] 6. “Your customer's finances when they borrowed”
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
