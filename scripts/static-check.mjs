import fs from 'node:fs';

const html = fs.readFileSync('public/index.html', 'utf8');
const adminHtml = fs.readFileSync('public/admin.html', 'utf8');
const css = fs.readFileSync('public/styles.css', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');
const admin = fs.readFileSync('public/admin.js', 'utf8');

const checks = [
  ['viewport meta', /name="viewport"/.test(html)],
  ['labels present', /<label/.test(html)],
  ['error summary role', /role="alert"/.test(html)],
  ['16px form text', /font-size:\s*16px/.test(css)],
  ['48px controls', /min-height:\s*48px/.test(css)],
  ['44px examples toggle', /min-height:\s*44px/.test(css)],
  ['reduced motion', /prefers-reduced-motion/.test(css)],
  ['no localStorage', !/localStorage|sessionStorage/.test(app + admin)],
  ['no mailto', !/mailto:/i.test(html + adminHtml)],
  ['no analytics', !/gtag|googletagmanager|analytics|hotjar|segment\.io|mixpanel/i.test(html + adminHtml + app + admin)],
  ['privacy policy linked', /https:\/\/pba-claims\.co\.uk\/website-privacy-policy\.php/.test(html)],
  ['privacy links open safely', (html.match(/target="_blank"/g) || []).length === (html.match(/rel="noopener noreferrer"/g) || []).length],
  // Mode is the security boundary between the two questionnaires.
  ['admin offers both modes', /value="FOS_ONLY"/.test(adminHtml) && /value="TIMEBAR_AND_FOS"/.test(adminHtml)],
  ['admin hides time-bar fields by default', /id="timebarFields" hidden/.test(adminHtml)],
  ['expandable examples present', (html.match(/<details class="examples">/g) || []).length === 4],
  ['examples toggles labelled', (html.match(/<summary>See examples<\/summary>/g) || []).length === 4],
  ['vulnerability checkboxes present', (html.match(/name="fosVulnerabilities"/g) || []).length === 5],
  ['honeypot present', /name="website"/.test(html)],
  // No client detail may ever be placed in a readable query string.
  ['no query-string prefill', !/location\.search|URLSearchParams/.test(app)]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('Static checks failed:', failed.map(([n]) => n).join(', '));
  process.exit(1);
}
console.log('Static checks passed:', checks.map(([n]) => n).join(', '));
