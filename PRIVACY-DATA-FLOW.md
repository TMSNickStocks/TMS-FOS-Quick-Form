# Privacy and data flow

No database. No Supabase. No analytics. Nothing is stored at rest by this
application; the completed questionnaire exists only as an email in the TMS
Legal mailbox.

Privacy notice: https://pba-claims.co.uk/website-privacy-policy.php

## 1. Staff create a link

Staff enter the questionnaire mode and the matter details in the link builder.
The server validates them, then encrypts them with AES-256-GCM into a token
carrying a 30-day expiry. The token is returned inside a link:

```
https://<app>/#t=<token>
```

The token sits in the URL **fragment**. Fragments are not sent to servers, so
the matter details never appear in an access log, a proxy log or a Referer
header. Nothing readable about the client appears in the URL.

## 2. The client opens the link

The page reads the token and immediately removes it from the address bar
(`history.replaceState`), so it does not persist in browser history UI.

The client must type the matching 9-digit TMS reference before anything is
decrypted and shown. A wrong reference returns the same generic message as an
expired link.

## 3. The client answers

Answers live only in the page's memory. Nothing is written to `localStorage`,
`sessionStorage`, IndexedDB or cookies, and nothing is placed in a URL. Closing
the tab discards everything.

## 4. Submission

The browser posts to `/api/submit` over HTTPS with a CSRF token. The server:

1. rejects any field the selected mode does not expect;
2. validates every value against a strict schema;
3. decrypts the link and verifies the mode and every matter field against it;
4. rate limits on HMACs of the IP and the reference;
5. builds the email;
6. sends it through the Gmail API.

Success is reported to the client **only** after Gmail returns a provider
message id. If anything fails, the client sees the failure screen with a phone
number, never a false confirmation.

## 5. What is logged

On success:

```
fos_submission_ok { requestId, messageId, mode, delivery, durationMs }
```

On failure:

```
fos_submission_failed { requestId, delivery, durationMs }
```

- `requestId` is random and carries no client data.
- `messageId` is the mail provider's own identifier. It is not a credential and
  contains no client data; it lets a submission be tied to a delivered message
  for audit.
- `mode` is `FOS_ONLY` or `TIMEBAR_AND_FOS`. It identifies the record shape and
  says nothing about the client.

Never logged: the client name, TMS reference, lender, product, any answer, any
vulnerability information, the prefill token, the email body, or any credential.
`tests/logging.test.js` enforces this by static analysis of every `console.*`
call in `api/` and `lib/`, so a future edit that logs an answer fails the build.
`lib/mail.js` handles tokens and MIME and must never log at all.

## 6. Special category data

The vulnerability question and the Time-Bar circumstances question may elicit
health or other special category data. Accordingly:

- the form says plainly, before submission, that answers are emailed to TMS
  Legal and may include sensitive personal information;
- the privacy notice is linked at the start, at the review step and in the
  footer;
- nothing is written to browser storage;
- no answer, and no vulnerability information, appears in the email subject;
- the record states only which categories were selected, not the example lists.

## 7. Retention

This application retains nothing. Retention is governed by the TMS Legal
mailbox and the privacy notice above.
