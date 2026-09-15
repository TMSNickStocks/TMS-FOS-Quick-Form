// Questionnaire submission email - format TMS-FOS-V1.
//
// The email is the evidence record. For EVERY answer it reproduces the full
// approved question immediately before the answer, so a reviewer can see what
// was asked, what the client was told, and what they replied, without opening
// the questionnaire template. It is not a field dump.
//
// It is also machine-parsable. See EMAIL-FORMAT.md for the contract.
//
// Section order:
//   ADMIN / MATTER INFORMATION
//   TIME-BAR QUESTIONNAIRE RESPONSES   (combined mode only - omitted entirely
//                                       in FOS_ONLY, heading included)
//   FOS QUESTIONNAIRE RESPONSES
//   CONFIRMATION
//
// Structural rules the parser depends on, and which client text cannot break:
//  - a block starts with `[ID]` at column 0;
//  - `CONTEXT:` / `QUESTION:` / `NOTE:` / `OPTIONS:` / `STATEMENT:` /
//    `CLIENT ANSWER:` are marker lines at column 0, alone on the line;
//  - EVERY content line - question wording and client answers alike - is
//    indented by exactly two spaces. Nothing a client types ever reaches
//    column 0, so free text cannot forge an id, a marker, a section heading
//    or the end marker.
//
// No affordability calculation is performed on the financial answers and no
// advice is given to the client anywhere in this record.

const {
  MODE_LABELS, isCombined, adminFields, timebarBlocks, fosBlocks,
  CONFIRMATION_HEADING, CONFIRMATION_STATEMENT
} = require('./questions');
const { VULNERABILITY_NONE, EXAMPLES_TOGGLE } = require('./questions-fos');

const FORMAT_VERSION = 'TMS-FOS-V1';
const HEADER = 'FOS QUESTIONNAIRE ANSWERS';
const FOOTER = 'END FOS QUESTIONNAIRE ANSWERS';
const RULE = '--------------------------------';
const NOT_PROVIDED = 'Not provided';
const INDENT = '  ';

const SECTION_ADMIN = 'ADMIN / MATTER INFORMATION';
const SECTION_TIMEBAR = 'TIME-BAR QUESTIONNAIRE RESPONSES';
const SECTION_FOS = 'FOS QUESTIONNAIRE RESPONSES';
const SECTION_CONFIRMATION = 'CONFIRMATION';

const MARK_CONTEXT = 'CONTEXT:';
const MARK_QUESTION = 'QUESTION:';
const MARK_NOTE = 'NOTE:';
const MARK_OPTIONS = 'OPTIONS:';
const MARK_STATEMENT = 'STATEMENT:';
const MARK_ANSWER = 'CLIENT ANSWER:';

const SELECTED = 'SELECTED';
const NOT_SELECTED = 'not selected';

// Stated instead of reproducing the example lists. The examples sit behind a
// collapsed "See examples" control, so they were available to the client but
// not necessarily read; dumping every list into the record would bury the
// answer without evidencing anything the client actually saw.
const EXAMPLES_NOTE = `Each option above except “${VULNERABILITY_NONE}” had a “${EXAMPLES_TOGGLE}” control the client could open for examples.`;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Normalise a client value: CR stripped, trailing whitespace removed, blank
// interior lines dropped. A whitespace-only line would be ambiguous once
// indented, and mail transports may strip trailing spaces.
function fieldValue(raw) {
  const v = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .filter((line) => line.trim() !== '')
    .join('\n')
    .trim();
  return v === '' ? NOT_PROVIDED : v;
}

// "1250.5" -> "£1,250.50". Human-readable for the reviewer; the canonical
// numeric value is printed alongside it so nothing has to be re-parsed out of
// a formatted string later.
function poundsDisplay(canonical) {
  const raw = String(canonical ?? '').trim();
  if (!raw) return NOT_PROVIDED;
  const num = Number(raw);
  if (!Number.isFinite(num)) return NOT_PROVIDED;
  return '£' + num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moneyLine(canonical) {
  const raw = String(canonical ?? '').trim();
  if (!raw) return NOT_PROVIDED;
  return `${poundsDisplay(raw)} [value: ${raw}]`;
}

// "2015-06-01" -> "01/06/2015 [value: 2015-06-01]", matching the DD/MM/YYYY
// form the source questionnaire uses in its own example.
function dateLine(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return NOT_PROVIDED;
  return `${m[3]}/${m[2]}/${m[1]} [value: ${m[1]}-${m[2]}-${m[3]}]`;
}

// A plain count. Printed as the client gave it, with no unit invented around
// it and no zero substituted for a missing answer.
function integerLine(value) {
  const raw = String(value ?? '').trim();
  return raw === '' ? NOT_PROVIDED : raw;
}

// ISO 8601 in Europe/London, e.g. 2026-08-29T18:48:56+01:00.
function londonIso(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMinutes = Math.round((asIfUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

// Continuation folding for the ADMIN `Label: value` lines.
function fold(value) {
  return String(value).split('\n').map((line, i) => (i === 0 ? line : INDENT + line)).join('\n');
}

// Indent every line. Used for all questionnaire content, so nothing reaches
// column 0 and no client text can be mistaken for structure.
function indentAll(value) {
  return String(value).split('\n').map((line) => INDENT + line).join('\n');
}

// Turn a question definition plus the client's data into the block the record
// prints. `answer` is always an array of already-formatted lines, so a group
// of amounts and a single free-text answer are rendered the same way.
function resolveBlock(q, data) {
  const base = {
    id: q.id,
    heading: q.heading || '',
    context: typeof q.context === 'function' ? q.context(data) : (q.context || []),
    question: q.question,
    bullets: q.bullets || [],
    note: q.note || '',
    options: [],
    answer: []
  };

  if (q.kind === 'multi') {
    const chosen = Array.isArray(data[q.field]) ? data[q.field] : [];
    base.options = q.options.map((o) => o.value);
    base.answer = q.options.map((o) => (chosen.includes(o.value) ? `${SELECTED}: ${o.value}` : `${NOT_SELECTED}: ${o.value}`));
    base.optionsNote = EXAMPLES_NOTE;
    return base;
  }
  if (q.kind === 'group') {
    base.answer = q.rows.map(([label, field]) => `${label}: ${moneyLine(data[field])}`);
    return base;
  }
  // A question may offer an explicit alternative to answering - "I don't remember",
  // "I don't remember the exact date", "prefer not to add details". Choosing it is
  // a real answer, so it is recorded as itself and always wins over the value
  // field: nothing is generated, inferred or shown as blank or zero.
  if (q.unknownField && data[q.unknownField] === true) { base.answer = [q.unknownLabel]; return base; }

  if (q.kind === 'money') { base.answer = [moneyLine(data[q.field])]; return base; }
  if (q.kind === 'date') { base.answer = [dateLine(data[q.field])]; return base; }
  if (q.kind === 'integer') { base.answer = [integerLine(data[q.field])]; return base; }

  base.answer = fieldValue(data[q.field]).split('\n');
  return base;
}

// A section heading belongs to a run of blocks, not to each one. Every
// circumstance block carries "1. Your circumstances" because any of them may be
// the first one recorded; printing it on each would head the section four
// times. Blanking the repeats prints it exactly once, wherever the run starts.
function headOnce(blocks) {
  let previous = '';
  return blocks.map((b) => {
    const repeated = b.heading !== '' && b.heading === previous;
    if (b.heading) previous = b.heading;
    return repeated ? { ...b, heading: '' } : b;
  });
}

function blocksFor(data) {
  return {
    timebar: headOnce(timebarBlocks(data).map((q) => resolveBlock(q, data))),
    fos: headOnce(fosBlocks(data).map((q) => resolveBlock(q, data)))
  };
}

// --- plain text ------------------------------------------------------------

function pushBlock(out, b) {
  out.push(b.heading ? `[${b.id}] ${b.heading}` : `[${b.id}]`);
  if (b.context.length) {
    out.push(MARK_CONTEXT);
    b.context.forEach((p) => out.push(indentAll(p)));
  }
  out.push(MARK_QUESTION);
  out.push(indentAll(b.question));
  b.bullets.forEach((bullet) => out.push(indentAll(`• ${bullet}`)));
  if (b.note) { out.push(MARK_NOTE); out.push(indentAll(b.note)); }
  if (b.options.length) {
    out.push(MARK_OPTIONS);
    b.options.forEach((o) => out.push(indentAll(`• ${o}`)));
    if (b.optionsNote) out.push(indentAll(b.optionsNote));
  }
  out.push(MARK_ANSWER);
  b.answer.forEach((line) => out.push(indentAll(line)));
  out.push('');
}

function buildText(data, blocks, meta) {
  const out = [
    HEADER, RULE,
    `Format: ${FORMAT_VERSION}`,
    `Questionnaire mode: ${data.mode}`,
    `Questionnaire: ${MODE_LABELS[data.mode]}`,
    `Submission ID: ${meta.submissionId}`,
    `Date completed: ${meta.completedAt}`,
    ''
  ];

  out.push(SECTION_ADMIN, '');
  adminFields(data.mode).forEach(([label, field]) => out.push(`${label}: ${fold(fieldValue(data[field]))}`));
  out.push('');

  if (isCombined(data.mode)) {
    out.push(SECTION_TIMEBAR, '');
    blocks.timebar.forEach((b) => pushBlock(out, b));
  }

  out.push(SECTION_FOS, '');
  blocks.fos.forEach((b) => pushBlock(out, b));

  out.push(SECTION_CONFIRMATION, '');
  out.push(`[CONFIRMATION] ${CONFIRMATION_HEADING}`);
  out.push(MARK_STATEMENT);
  out.push(indentAll(CONFIRMATION_STATEMENT));
  out.push('');
  out.push('Client confirmation: Yes');
  out.push(`Date completed: ${meta.completedAt}`);
  out.push('');
  out.push(FOOTER, '');
  return out.join('\n');
}

// --- html ------------------------------------------------------------------
// Inline styles only: Gmail strips <style> blocks. Single column, 640px, so it
// reads on a phone and prints on one page width.
const S = {
  wrap: 'max-width:640px;margin:0 auto;padding:0 4px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#26313a',
  h1: 'margin:0 0 2px;font-size:19px;color:#1c5f90',
  meta: 'margin:0 0 22px;font-size:12px;color:#5a6975',
  section: 'margin:26px 0 14px;padding:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#1c5f90;border-bottom:2px solid #297fbd',
  adminTable: 'border-collapse:collapse;width:100%;font-size:14px',
  adminTh: 'text-align:left;vertical-align:top;padding:7px 10px 7px 0;width:38%;color:#5a6975;font-weight:700;border-bottom:1px solid #e6ecf0',
  adminTd: 'text-align:left;vertical-align:top;padding:7px 0;border-bottom:1px solid #e6ecf0;white-space:pre-wrap',
  block: 'margin:0 0 20px;padding:0 0 18px;border-bottom:1px solid #e6ecf0',
  id: 'margin:0 0 3px;font-family:Consolas,Menlo,monospace;font-size:11px;letter-spacing:.06em;color:#7c8b96',
  heading: 'margin:0 0 9px;font-size:15px;font-weight:700;color:#1c5f90',
  context: 'margin:0 0 9px;padding:9px 12px;background:#f5f8fa;border:1px solid #e6ecf0;font-size:13px;color:#5a6975',
  contextP: 'margin:0 0 7px',
  question: 'margin:0 0 4px;font-weight:700;color:#26313a',
  bullets: 'margin:4px 0 0;padding:0 0 0 20px;color:#26313a',
  note: 'margin:5px 0 0;font-size:12px;color:#5a6975;font-style:italic',
  answerBox: 'margin:10px 0 0;padding:9px 12px;background:#f5f8fa;border-left:3px solid #297fbd',
  answerLabel: 'margin:0 0 3px;font-family:Consolas,Menlo,monospace;font-size:11px;letter-spacing:.06em;color:#5a6975',
  answerValue: 'margin:0;white-space:pre-wrap;color:#26313a',
  selected: 'margin:0 0 3px;color:#26313a;font-weight:700',
  unselected: 'margin:0 0 3px;color:#7c8b96',
  statement: 'margin:0 0 12px;padding:11px 13px;background:#f5f8fa;border-left:3px solid #2e6d47;font-style:italic',
  footer: 'margin:26px 0 0;padding:10px 0 0;border-top:1px solid #e6ecf0;font-family:Consolas,Menlo,monospace;font-size:11px;color:#7c8b96'
};

function answerHtml(b) {
  let inner;
  if (b.options.length) {
    inner = b.answer.map((line) => {
      const isSelected = line.startsWith(`${SELECTED}: `);
      const style = isSelected ? S.selected : S.unselected;
      const mark = isSelected ? '☑' : '☐';
      const text = line.slice(line.indexOf(': ') + 2);
      return `<p style="${style}">${mark} ${esc(text)}</p>`;
    }).join('');
  } else {
    inner = `<div style="${S.answerValue}">${esc(b.answer.join('\n'))}</div>`;
  }
  return `<div style="${S.answerBox}"><div style="${S.answerLabel}">CLIENT ANSWER</div>${inner}</div>`;
}

function blockHtml(b) {
  let h = `<div style="${S.block}"><div style="${S.id}">${esc(b.id)}</div>`;
  if (b.heading) h += `<div style="${S.heading}">${esc(b.heading)}</div>`;
  if (b.context.length) {
    h += `<div style="${S.context}">`
      + b.context.map((p, i) => `<p style="${S.contextP}${i === b.context.length - 1 ? ';margin-bottom:0' : ''}">${esc(p)}</p>`).join('')
      + `</div>`;
  }
  h += `<p style="${S.question}">${esc(b.question)}</p>`;
  if (b.bullets.length) h += `<ul style="${S.bullets}">` + b.bullets.map((x) => `<li>${esc(x)}</li>`).join('') + `</ul>`;
  if (b.note) h += `<p style="${S.note}">${esc(b.note)}</p>`;
  h += answerHtml(b);
  if (b.optionsNote) h += `<p style="${S.note}">${esc(b.optionsNote)}</p>`;
  return h + `</div>`;
}

function buildHtml(data, blocks, meta) {
  const adminRows = adminFields(data.mode).map(([label, field]) =>
    `<tr><th style="${S.adminTh}">${esc(label)}</th><td style="${S.adminTd}">${esc(fieldValue(data[field]))}</td></tr>`).join('');

  let body = `<html><body style="margin:0;padding:18px 12px;background:#ffffff">`
    + `<div style="${S.wrap}">`
    + `<h1 style="${S.h1}">${esc(HEADER)}</h1>`
    + `<p style="${S.meta}">Format: ${esc(FORMAT_VERSION)}`
    + `<br>Questionnaire mode: ${esc(data.mode)}`
    + `<br>Questionnaire: ${esc(MODE_LABELS[data.mode])}`
    + `<br>Submission ID: ${esc(meta.submissionId)}`
    + `<br>Date completed: ${esc(meta.completedAt)}</p>`
    + `<div style="${S.section}">${esc(SECTION_ADMIN)}</div>`
    + `<table style="${S.adminTable}">${adminRows}</table>`;

  if (isCombined(data.mode)) {
    body += `<div style="${S.section}">${esc(SECTION_TIMEBAR)}</div>` + blocks.timebar.map(blockHtml).join('');
  }

  body += `<div style="${S.section}">${esc(SECTION_FOS)}</div>` + blocks.fos.map(blockHtml).join('')
    + `<div style="${S.section}">${esc(SECTION_CONFIRMATION)}</div>`
    + `<div style="${S.id}">CONFIRMATION</div>`
    + `<div style="${S.heading}">${esc(CONFIRMATION_HEADING)}</div>`
    + `<div style="${S.statement}">&ldquo;${esc(CONFIRMATION_STATEMENT)}&rdquo;</div>`
    + `<table style="${S.adminTable}">`
    + `<tr><th style="${S.adminTh}">Client confirmation</th><td style="${S.adminTd}">Yes</td></tr>`
    + `<tr><th style="${S.adminTh}">Date completed</th><td style="${S.adminTd}">${esc(meta.completedAt)}</td></tr>`
    + `</table>`
    + `<div style="${S.footer}">${esc(FOOTER)}</div>`
    + `</div></body></html>`;
  return body;
}

function buildEmail(data, meta = {}) {
  const resolved = {
    completedAt: meta.completedAt || londonIso(new Date()),
    submissionId: String(meta.submissionId || '').trim() || NOT_PROVIDED
  };
  const blocks = blocksFor(data);
  return { text: buildText(data, blocks, resolved), html: buildHtml(data, blocks, resolved) };
}

module.exports = {
  esc, buildEmail, londonIso, fold, indentAll, fieldValue, blocksFor, resolveBlock,
  poundsDisplay, moneyLine, dateLine, integerLine,
  FORMAT_VERSION, HEADER, FOOTER, NOT_PROVIDED, EXAMPLES_NOTE,
  SECTION_ADMIN, SECTION_TIMEBAR, SECTION_FOS, SECTION_CONFIRMATION,
  MARK_CONTEXT, MARK_QUESTION, MARK_NOTE, MARK_OPTIONS, MARK_STATEMENT, MARK_ANSWER,
  SELECTED, NOT_SELECTED
};
