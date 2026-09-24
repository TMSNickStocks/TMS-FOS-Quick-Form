# TMS-FOS-Quick-Form

A mobile-first questionnaire that staff send to an existing client by a
short-lived encrypted link. The client answers on their phone; the completed
questionnaire is emailed to TMS Legal as an evidence record. There is no
database.

Two questionnaire modes, chosen by staff:

- **FOS questionnaire only** (`FOS_ONLY`)
- **Time-Bar + FOS questionnaire** (`TIMEBAR_AND_FOS`) — the approved Time-Bar
  questionnaire first, then the FOS questionnaire.

This application is a standalone clone of the architecture proven by
TMS-Timebar-Quick-Form. It has its own repository, its own Vercel project and
its own credentials. **It does not share configuration with, deploy over, or
modify TMS-Timebar-Quick-Form or TMS-Timebar-Portal.**

---

## Wording provenance

| Questionnaire | Source | Guard |
|---|---|---|
| FOS | `FOS Q's for clients.pdf` | `tests/questions.test.js` asserts every question, heading, note, option and example appears verbatim in `public/index.html` |
| Time-Bar | the live, approved TMS-Timebar-Quick-Form, plus the amendments TMS approved on 2026-09-24 | a locked SHA-256 of the approved wording in `tests/validation.test.js` fails the build on any edit |

No source question has been reworded, expanded, reordered or simplified except
where TMS has approved it in writing, below.

**Approved 2026-09-24 (Time-Bar questionnaire).** The form asked the same two
first-awareness facts twice — once in the "yes, I had thought about it" branch
and again in the "no / not sure" branch. They are now asked **once**: a date,
whether that date is an estimate, and what caused the awareness. The branching
question and the awareness-source options are unchanged. Two blocks were added:
section 4, whether the client complained as soon as payments became
unaffordable, and section 5, repayment difficulties and whether the lender
offered support. `lib/questions-timebar.js` records the detail in place.

**Approved 2026-09-24 (FOS questionnaire).** "Have any outstanding balances been
paid?" is unchanged; a Yes now opens one further question, the date the account
was repaid.

Three changes were made on TMS instruction on 2026-09-15, and only these three.
Each is marked in place in `lib/questions-fos.js`; anything without such a
marker is source wording and must not be edited.

1. **Presentation headings** for sections 1 and 6 (see "Source ambiguities"
   below). Headings only — no question, option, example or evidence wording was
   touched.
2. **One added answer:** `I don't remember the exact date`, offered against the
   otherwise unchanged question `When did the lending start?`.
3. **Six conditional follow-ups** (approved 2026-09-15), each shown only when
   the answer above it opens it, and each offering an explicit alternative to
   answering:

   | Opened by | Follow-up |
   |---|---|
   | each selected circumstance, separately | Please list any issues and tell us about how they affected you. |
   | savings = Yes | Approximately how much did you have in savings? |
   | dependants = Yes | How many dependants did you have? |
   | further lending = Yes | What type of further lending did you apply for? |
   | further lending = Yes | Who was the further lending with? |
   | further lending = Yes | Approximately how much was the further lending for? |

   The source questionnaire records a bare Yes for savings, dependants and
   further lending; these capture the substance behind it. The conditional
   rules are enforced server side as well as in the browser: a follow-up
   answered against a branch that was not taken is rejected as contradictory,
   and an opened branch must carry exactly one of the value or its alternative.

   The approved set of alternatives is fixed, and a test fails the build if one
   is added, removed or reworded.

4. **Each circumstance is explained separately.** The four substantive
   categories each carry their own follow-up, revealed beneath that category
   and answered independently, so the record shows which explanation belongs to
   which circumstance. This replaced a single combined explanation and the
   source PDF's own optional "anything else" box; both were removed and their
   fields are no longer accepted.

---

## Source ambiguities, and how they were resolved

Each was flagged to TMS rather than guessed at. Items 1 and 4 were resolved by
TMS on 2026-09-15; the rest are recorded for provenance.

1. **Two headings addressed a professional representative, not the client.**
   The source prints `1. Vulnerabilities ("Tailoring to their circumstances")`
   and `6. "Your customer's finances when they borrowed"`. Both are written from
   the point of view of someone completing the FOS form *about* a customer,
   while the questions beneath them are in the second person ("Did *you* have
   any savings..."). **Resolved: TMS approved client-facing presentation
   headings** - `1. Your circumstances` and `6. Your finances when you
   borrowed`. This is a presentation change only; every question, answer option,
   example and piece of evidence wording beneath them is unchanged, which
   `tests/questions.test.js` and `tests/email.test.js` both assert.

2. **`See examples (dropdown)`** - "(dropdown)" is an authoring instruction, not
   client-facing text. The visible control label is `See examples`; the
   disclosure itself is the dropdown.

3. **The two-line table labels in section 6** (`Housing costs (like mortgage,
   rent or council housing payment)` and the utilities row) are printed across
   two lines inside one table cell. They are treated as one label each.

4. **The source marks nothing as mandatory.** Choices made:
   - **Required:** the vulnerability question (at least one box, since a
     `None of these apply` option only means something if an answer is
     expected), court action, lending start date, initial lending amount,
     balances paid, savings, dependants, further lending, and — approved
     2026-09-24 — the repayment date wherever balances have been paid.
   - **Optional:** every income and outgoings amount, and all three free-text
     boxes.
   - The lending start date was originally a dead end for a client who could not
     recall it. **Resolved: TMS approved an "I don't remember the exact date"
     alternative** for that question only. The approved question is unchanged;
     the two answers are mutually exclusive; and choosing the alternative never
     generates or infers a date.

5. **`For example 01/01/2025`** implies DD/MM/YYYY. The form uses a native date
   control, so the client picks a date and the ambiguity does not arise; the
   record prints DD/MM/YYYY alongside the ISO value.

## Deliberate differences from TMS-Timebar-Quick-Form

1. **A staff-issued link is mandatory.** The Time-Bar form falls back to manual
   entry when opened without a token. Here the questionnaire mode decides which
   questions are asked and which sections appear in the record, so it is only
   ever read from the sealed token — never from client input. Opening the bare
   URL tells the client to use the link TMS Legal sent.
2. **Solid buttons use a darker blue** (`--brand-strong`, `#20699e`). White on
   the original `--brand` is 4.32:1, below the WCAG AA 4.5:1 minimum for 16px
   bold text. `--brand` is retained for borders and the progress fill, which
   carry no text. `tests/mobile.test.js` computes every contrast pair.

---

## Presentation rules

1. **The introduction is shown exactly once, on the first step.** The heading,
   the two lead paragraphs, the Ombudsman disclaimer and the privacy link are
   hidden in the markup and revealed by `showStep` on step 1 - which is where
   the mode-specific wording is finally known - then hidden from every step
   after. The landing page asks for the reference alone. Repeated above each
   question the block pushed the question itself below the fold on a phone, and
   it has no place on the review page. A privacy link remains reachable
   everywhere: the footer carries one on every page, and the review step has
   its own alongside its notice.

2. **Each circumstance is shown once.** Where one or more circumstances were
   selected, the review screen and the record show each through its own block
   and omit the aggregate bullet list. Where "None of these apply" was
   selected there are no blocks, so the aggregate question and that answer are
   kept.

---

## Architecture

```
api/       csrf, prefill-create, prefill-resolve, submit   (Vercel functions)
lib/       questions-timebar, questions-fos, questions (mode assembly),
           validation, prefill, short-link, email-template, mail, security,
           rate-limit
public/    index.html, app.js, admin.html, admin.js, styles.css
scripts/   static-check, syntax-check, credential-scan, sample-emails
tests/     node:test suites
fixtures/  worked email examples for both modes
```

- **No database, no Supabase, no analytics, no third-party scripts.** The one
  external service is Upstash Redis, which holds short-link codes only and is
  optional: without it the app issues the legacy long links. See
  `SHORT-LINKS.md`.
- Matter details travel in an AES-256-GCM token in the URL **fragment**, so they
  never reach a server log or a Referer header. The token is stripped from the
  address bar as soon as it is read.
- The client must enter the matching 9-digit TMS reference before any matter
  detail is shown.
- Links expire after 30 days (720 hours).
- Staff links are shortened to `/q/<code>`, an opaque 80-bit code that resolves
  server side to the same sealed token. Legacy long links still work. See
  `SHORT-LINKS.md`.

---

## Security controls

- Server-side validation with strict schemas; unknown fields rejected outright
  (in `FOS_ONLY`, Time-Bar fields are unknown fields).
- Origin check and double-submit CSRF on every state-changing endpoint.
- Staff link builder additionally requires `ADMIN_ACCESS_KEY`, compared in
  constant time.
- Rate limiting keyed on HMACs of the IP and the reference — the raw reference is
  never used as a key and never logged.
- Honeypot field and a minimum completion time.
- Maximum body size 32 KB.
- CSP, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `nosniff`,
  `noindex`, `no-store` (see `vercel.json`).
- Success is reported **only** after Gmail returns a provider message id. Any
  other outcome shows the safe failure screen with a phone number.
- Logs carry a request id, a provider message id, the questionnaire mode, a
  delivery outcome and a duration — nothing about the client or their answers.
  `tests/logging.test.js` enforces this statically.
- No answers in `localStorage`, `sessionStorage` or any URL.

Privacy notice: https://pba-claims.co.uk/website-privacy-policy.php

---

## Email

Sent to `info@moneysolicitor.com` via Google Workspace Gmail API, send-only
scope (`gmail.send`). Subject is exactly `FOS Questionnaire Answers`.
Format `TMS-FOS-V1` — see `EMAIL-FORMAT.md`.

OAuth credentials are supplied as environment variables for **this app only**.
Never reuse credentials from another TMS project and never commit real values.

---

## Environment

See `.env.example`. `MAIL_MODE=fake` accepts submissions and sends nothing;
keep it until live email is approved.

---

## Local development

```bash
npm install
npm run dev     # http://localhost:8787
npm run build   # typecheck + lint + credential scan + tests
```

To create a test link locally:

```bash
node -e "const{encryptPrefill}=require('./lib/prefill');console.log('http://localhost:8787/#t='+encryptPrefill({mode:'FOS_ONLY',clientName:'Alex Sample',reference:'200000001',lender:'Example Bank plc',product:'Credit card'}))"
```

---

## Related, and untouched

- `TMS-Timebar-Quick-Form` — live and approved; used here as a read-only
  reference only.
- `TMS-Timebar-Portal` — not involved.
