# Test results

`npm run build` = typecheck → lint → credential scan → tests. All green.

| Suite | Tests | Covers |
|---|---|---|
| `questions.test.js` | 23 | FOS and Time-Bar wording appears verbatim in the form; every option, example and financial label; example counts match the PDF (8/11/3/6); exactly one approved "I don't remember" answer and no other; **approved presentation headings, with the substantive wording beneath them unchanged**; no calculation shown; both admin modes; mode-driven step sequence |
| `validation.test.js` | 43 | money parsing and rejection; date validity and future-date block; multi-select; **"None of these apply" exclusivity**; mode enum; admin fields by mode; Time-Bar fields rejected as unknown in FOS-only; required vs optional; **exact date vs "I don't remember the exact date", mutual exclusivity, no inferred date**; Time-Bar conditional branches; honeypot, timing, confirmation; **locked hash of the approved Time-Bar wording** |
| `email.test.js` | 45 | `TMS-FOS-V1` marker; questionnaire-mode marker; section order in both modes; **Time-Bar section omitted in FOS-only**; full question before every answer; vulnerability selected/not-selected output; examples not dumped; money and date output; **"I don't remember the exact date" recorded with the full question and no generated date**; approved headings in the record; no affordability total; HTML escaping; **structural injection**; stable block ids |
| `submit.test.js` | 19 | both modes end to end; link mandatory; tampered link; **mode cannot be forged in either direction**; altered matter details; origin, CSRF, method, body size; **failed Gmail delivery cannot produce success**; 200-with-no-message-id treated as failure; no client data in a failure response; rate limiting |
| `mobile.test.js` | 26 | nothing pinned wider than 320px; fluid container; wrapping; 16px inputs; 48px controls and 44px examples toggle; labels; fieldset/legend; error summary; keyboard-accessible disclosure; focus rings; reduced motion; **computed WCAG AA contrast for every text pair**; no storage, no URL data, no analytics |
| `mail.test.js` | 12 | **subject is exactly "FOS Questionnaire Answers"**; subject carries no client data and is not configurable; recipient fixed server-side; OAuth and send failures; **200 with no message id rejected**; header injection |
| `logging.test.js` | 5 | no `console.*` in `api/` or `lib/` references client data or credentials; submit logs only id, message id, mode, outcome, duration; `lib/mail.js` never logs |
| `prefill.test.js` | 5 | encryption round trip; tampered token rejected; TTL fallback; finite expiry |
| `rate-limit.test.js` | 1 | window behaviour |
| `followups.test.js` | 46 | the follow-ups approved 2026-09-15: **one follow-up per selected circumstance**, each answered independently (text or decline); two and four categories with separate explanations; mixed explained/declined; unticking clears and invalidates; None-of-these clears all four; **the removed combined fields rejected as unknown and absent from the app**; savings Yes+amount / Yes+unknown / No; dependants Yes+count / Yes+unknown / No and the 1-or-more rule; further lending with all three answers, mixed known/unknown, and No; review wiring; record output; full question before every answer; **every contradictory payload rejected server-side**; no follow-up answer in logs; both modes |
| `presentation.test.js` | 19 | the introduction is one block, hidden in the markup, shown on the first step only and hidden from the landing page, every later step and review, with its own wording per mode and the disclaimer and privacy link intact; the aggregate circumstance list is omitted once a circumstance is selected and kept for "None of these apply"; the section heading prints exactly once; no evidence lost; both modes; layout at 320/390/430 |
| **Total** | **244** | |

## Static checks (`npm run lint`)

viewport meta · labels present · error summary role · 16px form text · 48px
controls · 44px examples toggle · reduced motion · no localStorage · no mailto ·
no analytics · privacy policy linked · privacy links open safely · admin offers
both modes · admin hides time-bar fields by default · 4 expandable examples ·
4 examples toggles labelled · 5 vulnerability checkboxes · honeypot present ·
no query-string prefill

Syntax check: 23 files. Credential scan: passed. Typecheck: passed.

## Manual browser verification (Chromium, emulated phone widths)

| Check | Result |
|---|---|
| FOS-only: step sequence | `details → fos1 → fos2 → fos3 → review`, "Step n of 5" |
| Combined: step sequence | `details → tb1 → tb2 → tb3 → fos1 → fos2 → fos3 → review`, "Step n of 8" |
| Combined: lender event | shown on the details card and inside Q2 |
| Vulnerability: multi-select | options 1 and 3 selected together |
| Vulnerability: exclusivity | clicking "None of these apply" cleared the others; clicking a category then cleared "None" |
| Expandable examples | 4 disclosures, collapsed by default, 8/11/3/6 items |
| Step validation | empty step blocked with per-field errors and an error summary |
| Date validation | future date rejected in the browser |
| Money validation | free text rejected in the browser |
| Review page | all answers, formatted money and DD/MM/YYYY date, **no Time-Bar rows in FOS-only** |
| Client-facing headings | "1. Your circumstances" and "6. Your finances when you borrowed" rendered |
| Date exclusivity | ticking "I don't remember the exact date" cleared and disabled the date field; entering a date then unticked the checkbox |
| Unknown date path | step advanced with no date; review showed "I don't remember the exact date"; submitted successfully |
| Confirmation | submit blocked until ticked |
| Submission | both modes returned the success screen |
| Server log | `requestId`, `messageId`, `mode`, `delivery`, `durationMs` only |
| 320 / 390 / 430 px | no horizontal scroll at any width |
| Introduction | hidden on the landing page; shown on step 1 only; hidden from step 2 onward and on review, in both modes |
| Combined-mode introduction | its own wording shown on step 1, then hidden |
| Review, circumstances selected | no aggregate list; one block per circumstance with its own answer |
| Review, "None of these apply" | aggregate question and that answer retained |
| Circumstance branches | each follow-up opens and closes with its own category only; "None of these apply" closes all four |
| Unticking a category | cleared its textarea and its alternative flag |
| Independent validation | two categories selected, one answered: blocked with the error on the unanswered one |
| Explanation exclusivity | typing cleared the decline tick; ticking decline cleared and disabled the text |
| Follow-up branches | savings / dependants / further lending blocks opened on Yes, each blocking independently until answered |
| Mixed known/unknown | type and lender entered, amount marked not known - accepted |
| Review screen | each selected circumstance as its own block: category, follow-up question, answer; removed questions absent |
| Submission | accepted end to end; log carried only id, message id, mode, outcome, duration |
