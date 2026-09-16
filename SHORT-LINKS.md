# Short client links

Staff used to hand a client a URL carrying the whole sealed prefill token —
around 265 characters. Long enough to wrap in a text message, be truncated by
an email client, or simply look untrustworthy. A short link replaces it:

```
https://tms-fos-quick-form.vercel.app/q/K7P4X9M2TQ6BW8DF     40 characters
```

The code is an opaque lookup key. It resolves, server side, to **exactly the
same sealed prefill token** the long link carries. That indirection is the
whole feature: nothing about the sealed token, the 72-hour expiry, the
reference gate, the questionnaire, the evidence record or Gmail delivery
changes, and the old long links keep working.

---

## Flow

```
staff /admin
  └─ POST /api/prefill-create
       ├─ seal the matter into the existing encrypted prefill token
       ├─ generate an opaque 80-bit code
       ├─ Redis SET fos-short:v1:<code> = <sealed token>   TTL ≤ 72h
       └─ return  link: <SHORT_LINK_ORIGIN>/q/<code>
                  fallbackLink: <APP_ORIGIN>/#t=<sealed token>

client opens /q/<code>
  └─ Vercel rewrites it to the existing client page — no redirect, the short
     URL stays in the address bar
  └─ client enters their 9-digit TMS reference
       └─ POST /api/prefill-resolve { code, reference }
            ├─ Redis GET fos-short:v1:<code>  →  sealed token
            ├─ the EXISTING decryption and reference check run on that token
            └─ on success the sealed token is returned to the browser

from here the flow is byte-identical to a legacy link
```

The sealed token reaches the browser **only after** the reference gate passes.
On a short link that is strictly later exposure than before, where the token
sat in the URL from the first click.

---

## Short URL format

```
<SHORT_LINK_ORIGIN>/q/<code>
```

`<code>` is 16 characters of Crockford base32 — `0-9`, `A-Z` excluding
`I`, `L`, `O`, `U`, so nothing is misread when retyped or read aloud.

| | |
|---|---|
| Alphabet | 32 characters (a power of two, so no modulo bias) |
| Length | 16 |
| Entropy | **80 bits** (requirement: ≥ 72) |
| Source | `crypto.randomBytes`, five bits taken per character |
| Contains | nothing — generated before the matter is consulted |

No sequential ids, no reference, no name, no lender, no PII, and URL-safe
without escaping.

---

## Redis

### Environment variables

The Vercel Upstash integration for this project was added with a custom
prefix, so the standard names are not what it created. Each list is tried in
order and the first name that is set wins:

| Purpose | Names tried, in order |
|---|---|
| REST URL | `UPSTASH_REDIS_REST_API_URL` → `UPSTASH_REDIS_REST_URL` → `KV_REST_API_URL` |
| REST token | `UPSTASH_REDIS_REST_API_TOKEN` → `UPSTASH_REDIS_REST_TOKEN` → `KV_REST_API_TOKEN` |

Nothing is renamed or duplicated, and `Redis.fromEnv()` is deliberately not
used — it would look for names this project does not have.

`UPSTASH_REDIS_REST_API_READ_ONLY_TOKEN` is **never** used: creating a link is
a write. `UPSTASH_REDIS_KV_URL` and `UPSTASH_REDIS_REDIS_URL` are the native
Redis protocol and are unused; this app talks to the REST API only.

Values are never logged, printed or returned. `configuredVarNames()` reports
which variable *names* are in use for diagnostics, never their contents.

### Key and value

| | |
|---|---|
| Key | `fos-short:v1:<code>` |
| Value | the sealed prefill token, as a bare string, and nothing else |
| TTL | `min(72 hours, time remaining on the sealed token)` |

Redis never holds a client name, TMS reference, lender, product, questionnaire
mode or any answer. Those live encrypted inside the token and are useless
without `PREFILL_ENCRYPTION_KEY` — and still require the client to enter their
reference.

The TTL is read from the token's own expiry, so a mapping can never outlive
the thing it resolves to. If `PREFILL_TTL_HOURS` is shortened the mapping
shortens with it; if it is lengthened the mapping is still capped at 72 hours.

### Links are reusable

Opening a link does not consume it. A client can close the page and come back
during the 72 hours, as often as they need.

---

## `SHORT_LINK_ORIGIN`

Defaults to `APP_ORIGIN`. Set it to change only the origin links are built on:

```
SHORT_LINK_ORIGIN=https://q.moneysolicitor.com
```

**To move to `q.moneysolicitor.com` later:** add the domain to the Vercel
project, point DNS at it, then set `SHORT_LINK_ORIGIN` and redeploy. No code
change. Existing links keep working on whatever origin they were issued with,
since the code is looked up the same way on both.

The fallback link always points at `APP_ORIGIN`, which is where it must work.

---

## When Redis is unavailable

A short link is an improvement, not a dependency.

If Redis is down, unreachable, or simply not configured, `createShortCode`
returns `null` — it never throws — and staff are handed the legacy long link
as the primary one. They can still issue the questionnaire, and beyond the
first click the client experience is identical.

The failure logs one fixed marker, `fos_short_link_create_failed`, with no
interpolation. Staff see no technical detail.

---

## Admin UI

```
Client questionnaire link
Questionnaire: FOS questionnaire only

https://…/q/T1S3FRARQRGV51DP
[Copy link]

▸ Show fallback link
```

The fallback is offered behind a collapsed disclosure whenever it differs from
the primary link — so staff have a second option if a short link is blocked in
transit, without the long URL cluttering the normal case. No Redis
terminology appears anywhere in the staff UI.

---

## Backward compatibility

Legacy `/#t=<token>` links are unchanged and still work. `prefill-resolve`
accepts either `{ token, reference }` or `{ code, reference }`; a short code is
exchanged for the sealed token and then both follow one path.

---

## Security

Everything already in place is preserved: CSRF, origin checks, keyed rate
limiting, the sealed prefill, the 72-hour expiry, CSP, HSTS, `no-store`,
`noindex`, `no-referrer`, unknown-field rejection and the client-reference
gate. The short link adds a lookup in front of the existing path, not a way
around it.

**No enumeration oracle.** A missing, malformed, unknown or expired code, a
token that will not decrypt, and Redis being unreachable all return the same
message:

> This link is invalid or has expired. Please ask TMS Legal to send a new link.

A client can never learn whether a code ever existed. A malformed code is
rejected before Redis is touched at all.

**Rate limiting.** Resolution uses the existing keyed limit — 20 per 15
minutes per HMAC'd IP — which covers both link kinds. Guessing an 80-bit code
is not a practical attack; the limit exists to stop the endpoint being used as
a probe.

**Logging.** The short-link module makes exactly two log calls, each a fixed
string with no interpolation:

```
fos_short_link_create_failed
fos_short_link_resolve_failed
```

Never logged: the Redis URL or token, any Redis value, the sealed token, the
short code, the TMS reference, client name, lender, product or any answer.

---

## Tests

`tests/short-link.test.js` — 38 tests covering code generation and entropy,
what Redis holds, TTL bounds, resolution and every failure mode, the absence of
an enumeration oracle, rate limiting, Redis-down and unconfigured fallback,
legacy compatibility, both questionnaire modes, logging, CSRF and origin,
routing and mobile layout, and that email generation and Gmail delivery are
untouched.
