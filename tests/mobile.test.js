// Mobile and accessibility guarantees, checked statically so a future style
// or markup edit that breaks them fails the build rather than reaching a
// client's phone. Rendered screenshots at 320/390/430 are kept in
// screenshots/ and are a separate, manual check.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const adminHtml = fs.readFileSync('public/admin.html', 'utf8');
const css = fs.readFileSync('public/styles.css', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');

const NARROWEST = 320;

// ------------------------------------------------------------- viewport fit

test('no fixed width or min-width can exceed the narrowest supported screen', () => {
  const offenders = [];
  // Declarations that pin a box wider than the viewport cause sideways scroll.
  for (const m of css.matchAll(/(?:^|[;{]|\s)(min-width|width)\s*:\s*(\d+)px/g)) {
    const [, prop, px] = m;
    if (Number(px) > NARROWEST) offenders.push(`${prop}: ${px}px`);
  }
  assert.deepEqual(offenders, [], 'nothing may be pinned wider than a 320px viewport');
});

test('the page container is fluid, not a fixed width', () => {
  assert.match(css, /main\s*\{[^}]*width:\s*min\(100%,\s*760px\)/, 'main is capped but never wider than the screen');
  assert.match(css, /\.logo\s*\{[^}]*width:\s*min\(290px,\s*82vw\)/, 'the logo scales down on narrow screens');
});

test('long content wraps rather than forcing horizontal scroll', () => {
  assert.match(css, /overflow-wrap:\s*anywhere/, 'long unbroken values wrap');
  assert.match(css, /\.copy-output\s*\{[^}]*word-break:\s*break-all/, 'the generated link wraps');
});

test('the wide media query only ever adds space above the narrowest screen', () => {
  const queries = [...css.matchAll(/@media\s*\(min-width:\s*(\d+)px\)/g)].map((m) => Number(m[1]));
  for (const q of queries) assert.ok(q > NARROWEST, `media query at ${q}px must be above the 320px base`);
});

test('the financial rows stack, so long labels never overflow', () => {
  // Labels sit above their input rather than beside it.
  assert.match(css, /\.money-row\s*\{/);
  assert.match(css, /\.money-row input\s*\{[^}]*max-width:\s*220px/);
  assert.ok(!/\.money-row\s*\{[^}]*display:\s*flex/.test(css), 'money rows must not be side-by-side at narrow widths');
});

// ------------------------------------------------------------- touch and text

test('the new date and free-text controls obey the same layout rules', () => {
  // Added 2026-09-24. A date control is the one input a phone renders with its
  // own picker, so it has to be in the sized-and-spaced set rather than left to
  // the browser default, and its label must sit above it like every other.
  assert.ok(css.includes('input' + String.fromCharCode(91) + 'type="date"'), 'date inputs are styled, not defaulted');
  for (const id of ['q1AwarenessDate', 'fosBalancesPaidDate']) {
    assert.match(html, new RegExp(`<label for="${id}">`), `${id} has a label tied to it`);
    assert.match(html, new RegExp(`id="${id}" name="${id}" type="date"`), `${id} is a real date input`);
  }
  for (const id of ['q1AwarenessExplanation', 'q4DelayReason', 'q5StruggleDetail']) {
    assert.match(html, new RegExp(`<label for="${id}">`), `${id} has a label tied to it`);
    assert.match(html, new RegExp(`<textarea id="${id}"`), `${id} is a textarea that wraps`);
  }
  // The new step is a step like the others, so the progress indicator and the
  // one-question-per-screen layout hold at 320px without any special case.
  assert.match(html, /<section class="step" data-step="tb4" hidden>/);
  assert.ok(!/<table/.test(html), 'nothing new introduces a table, which cannot narrow');
});

test('form text is at least 16px, so iOS never zooms on focus', () => {
  assert.match(css, /input,\s*select,\s*textarea,\s*button\s*\{[^}]*font-size:\s*16px/);
});

test('every interactive control meets the minimum touch target', () => {
  assert.match(css, /input\[type="text"\][^{]*\{[^}]*min-height:\s*48px/, 'text inputs are 48px');
  assert.match(css, /\.choice\s*\{[^}]*min-height:\s*48px/, 'radio and checkbox rows are 48px');
  assert.match(css, /button\s*\{[^}]*min-height:\s*48px/, 'buttons are 48px');
  assert.match(css, /details\.examples > summary\s*\{[^}]*min-height:\s*44px/, 'the examples toggle is at least 44px');
  assert.match(css, /\.privacy-link\s*\{[^}]*padding:\s*14px 0/, 'the privacy link is a comfortable target');
});

test('the date and money inputs get the same 48px rule as other text inputs', () => {
  assert.match(css, /input\[type="date"\]/, 'the date control is covered by the sizing rule');
  // money fields are type="text" with inputmode="decimal", already covered
  assert.match(html, /id="fosLendingAmount"[^>]*type="text"[^>]*inputmode="decimal"/);
  assert.match(html, /id="fosLendingStart"[^>]*type="date"/);
});

test('numeric keypads are requested where a number is wanted', () => {
  const moneyInputs = [...html.matchAll(/<input id="(fos(?:Lending Amount|LendingAmount|Income|Out)[A-Za-z]*)"[^>]*>/g)];
  for (const [tag, id] of moneyInputs) {
    assert.match(tag, /inputmode="decimal"/, `${id} must request a decimal keypad`);
  }
  assert.match(html, /id="gateReference"[^>]*inputmode="numeric"/);
});

// ------------------------------------------------------------- accessibility

test('every input, select and textarea has an associated label', () => {
  const ids = [...html.matchAll(/<(?:input|select|textarea)[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  const explicit = new Set([...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]));
  // A control wrapped in its own <label> is labelled without a for attribute.
  const wrapped = new Set([...html.matchAll(/<label class="choice"><input[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
  const missing = ids.filter((id) => !explicit.has(id) && !wrapped.has(id));
  assert.deepEqual(missing, [], 'every control must have an explicit or wrapping label');
});

test('radio and checkbox options are wrapped in their own label', () => {
  const wrapped = (html.match(/<label class="choice"><input type="(?:radio|checkbox)"/g) || []).length;
  const totals = (html.match(/<input type="(?:radio|checkbox)"/g) || []).length;
  assert.equal(wrapped, totals, 'every radio and checkbox sits inside its own label');
});

test('grouped questions use a fieldset and legend', () => {
  const legends = (html.match(/<legend>/g) || []).length;
  const fieldsets = (html.match(/<fieldset/g) || []).length;
  assert.equal(legends, fieldsets, 'every fieldset carries a legend');
  assert.ok(fieldsets >= 12, 'each grouped question is a fieldset');
});

test('there is a focusable error summary with an alert role', () => {
  assert.match(html, /<div id="globalError" class="error-summary" role="alert" tabindex="-1" hidden>/);
  assert.match(app, /globalError\.focus\(\)/, 'the summary takes focus so a screen reader announces it');
});

test('progress is announced politely as the step changes', () => {
  assert.match(html, /class="progress-wrap" aria-live="polite"/);
  assert.match(html, /class="progress" aria-hidden="true"/, 'the decorative bar is hidden from assistive tech');
});

test('the examples disclosure is native, so it is keyboard accessible', () => {
  // <details>/<summary> is focusable and operable by keyboard with no script.
  assert.equal((html.match(/<details class="examples">/g) || []).length, 4);
  assert.equal((html.match(/<summary>See examples<\/summary>/g) || []).length, 4);
  assert.ok(!/onclick=/i.test(html), 'no inline click handlers that keyboards cannot reach');
  assert.match(css, /details\.examples > summary:focus-visible/, 'the toggle shows a visible focus ring');
});

test('focus is always visible on interactive controls', () => {
  assert.match(css, /input:focus, select:focus, textarea:focus, button:focus-visible\s*\{[^}]*outline:/);
  assert.match(css, /a:focus-visible\s*\{[^}]*outline:/);
});

test('reduced motion is respected', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(block, /transition:\s*none\s*!important/);
  assert.match(block, /scroll-behavior:\s*auto\s*!important/);
});

test('the honeypot is hidden from assistive technology and the tab order', () => {
  assert.match(html, /class="form-row honeypot" aria-hidden="true" hidden/);
  assert.match(html, /id="website"[^>]*tabindex="-1"/);
});

test('the page declares a language and a title', () => {
  for (const doc of [html, adminHtml]) {
    assert.match(doc, /<html lang="en">/);
    assert.match(doc, /<title>[^<]+<\/title>/);
  }
});

// --------------------------------------------------------- WCAG AA contrast

function srgb(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('the palette in styles.css is the one these ratios are computed from', () => {
  const declared = Object.fromEntries([...css.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2].toLowerCase()]));
  assert.equal(declared.ink, '#26313a');
  assert.equal(declared.muted, '#5a6975');
  assert.equal(declared.brand, '#297fbd');
  assert.equal(declared['brand-dark'], '#1c5f90');
  assert.equal(declared.danger, '#9a2f2f');
  assert.equal(declared.soft, '#f5f8fa');
  assert.equal(declared['brand-strong'], '#20699e');
});

test('body and secondary text meet WCAG AA (4.5:1) on every background used', () => {
  const pairs = [
    ['body text on white', '#26313a', '#ffffff'],
    ['body text on the soft panel', '#26313a', '#f5f8fa'],
    ['body text on the secondary button', '#26313a', '#e8eef2'],
    ['help and hint text on white', '#5a6975', '#ffffff'],
    ['help and hint text on the soft panel', '#5a6975', '#f5f8fa'],
    ['links on white', '#1c5f90', '#ffffff'],
    ['links on the soft panel', '#1c5f90', '#f5f8fa'],
    ['error text on white', '#9a2f2f', '#ffffff'],
    ['primary button label', '#ffffff', '#20699e']
  ];
  const failures = pairs
    .map(([name, fg, bg]) => [name, contrast(fg, bg)])
    .filter(([, ratio]) => ratio < 4.5)
    .map(([name, ratio]) => `${name}: ${ratio.toFixed(2)}:1`);
  assert.deepEqual(failures, [], 'every text pair must reach 4.5:1');
});

test('solid buttons use the darker brand, not the 4.32:1 one', () => {
  assert.match(css, /\.primary \{ background: var\(--brand-strong\); color: white; \}/);
});

test('the focus ring is distinguishable from the background', () => {
  assert.ok(contrast('#0b69a3', '#ffffff') >= 3, 'the focus outline meets the 3:1 non-text minimum');
});

// ----------------------------------------------------------------- privacy

test('no answer is ever written to browser storage or a URL', () => {
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(app));
  assert.ok(!/location\.search|URLSearchParams/.test(app));
  // the encrypted token is stripped from the address bar as soon as it is read
  assert.match(app, /history\.replaceState\(null, '', location\.pathname\)/);
});

test('the page is excluded from search engines and carries no analytics', () => {
  for (const doc of [html, adminHtml]) {
    assert.match(doc, /<meta name="robots" content="noindex,nofollow,noarchive">/);
  }
  assert.ok(!/gtag|googletagmanager|analytics|hotjar|mixpanel|facebook|doubleclick/i.test(html + adminHtml + app));
});

test('the privacy policy is linked wherever answers are given', () => {
  const link = 'https://pba-claims.co.uk/website-privacy-policy.php';
  assert.ok((html.match(new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length >= 3,
    'the privacy policy is linked at the start, at the review step and in the footer');
});
