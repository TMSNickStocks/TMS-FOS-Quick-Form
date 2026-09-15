# Test results

`npm run build` = typecheck → lint → credential scan → tests. All green.

| Suite | Tests | Covers |
|---|---|---|
| `questions.test.js` | 18 | FOS and Time-Bar wording appears verbatim in the form; every option, example and financial label; example counts match the PDF (8/11/3/6); no added "I don't know" answer; no calculation shown; both admin modes; mode-driven step sequence |
| `validation.test.js` | 33 | money parsing and rejection; date validity and future-date block; multi-select; **"None of these apply" exclusivity**; mode enum; admin fields by mode; Time-Bar fields rejected as unknown in FOS-only; required vs optional; Time-Bar conditional branches; honeypot, timing, confirmation; **locked hash of the approved Time-Bar wording** |
| `email.test.js` | 38 | `TMS-FOS-V1` marker; questionnaire-mode marker; section order in both modes; **Time-Bar section omitted in FOS-only**; full question before every answer; vulnerability selected/not-selected output; examples not dumped; money and date output; no affordability total; HTML escaping; **structural injection**; stable block ids |
| `submit.test.js` | 19 | both modes end to end; link mandatory; tampered link; **mode cannot be forged in either direction**; altered matter details; origin, CSRF, method, body size; **failed Gmail delivery cannot produce success**; 200-with-no-message-id treated as failure; no client data in a failure response; rate limiting |
| `mobile.test.js` | 26 | nothing pinned wider than 320px; fluid container; wrapping; 16px inputs; 48px controls and 44px examples toggle; labels; fieldset/legend; error summary; keyboard-accessible disclosure; focus rings; reduced motion; **computed WCAG AA contrast for every text pair**; no storage, no URL data, no analytics |
| `mail.test.js` | 12 | **subject is exactly "FOS Questionnaire Answers"**; subject carries no client data and is not configurable; recipient fixed server-side; OAuth and send failures; **200 with no message id rejected**; header injection |
| `logging.test.js` | 5 | no `console.*` in `api/` or `lib/` references client data or credentials; submit logs only id, message id, mode, outcome, duration; `lib/mail.js` never logs |
| `prefill.test.js` | 5 | encryption round trip; tampered token rejected; TTL fallback; finite expiry |
| `rate-limit.test.js` | 1 | window behaviour |
| **Total** | **157** | |

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
| Confirmation | submit blocked until ticked |
| Submission | both modes returned the success screen |
| Server log | `requestId`, `messageId`, `mode`, `delivery`, `durationMs` only |
| 320 / 390 / 430 px | no horizontal scroll at any width |
