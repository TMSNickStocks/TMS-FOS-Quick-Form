// Guards the promise in PRIVACY-DATA-FLOW.md: application logs carry only a
// request id and a delivery outcome. This is a static check over the server
// code so that a future edit which logs an answer fails the build.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function serverFiles() {
  const out = [];
  for (const dir of ['api', 'lib']) {
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.js')) out.push(path.join(dir, name));
    }
  }
  return out;
}

// Identifiers that must never appear inside a console.* call.
const FORBIDDEN = [
  'reference', 'clientName', 'lender', 'product', 'communicationEvent', 'communicationDate',
  'q1', 'q2', 'q3', 'q4', 'q5', 'fosVulnerab', 'fosLending', 'fosIncome', 'fosOut', 'fosSavings',
  'fosDependants', 'fosCourt', 'fosBalances', 'fosOther', 'answers', 'prefill', 'token', 'email', 'html', 'raw', 'body',
  'ADMIN_ACCESS_KEY', 'PREFILL_ENCRYPTION_KEY', 'SECURITY_HMAC_KEY', 'GMAIL_'
];

function consoleCalls(source) {
  const calls = [];
  const re = /console\s*\.\s*\w+\s*\(/g;
  let m;
  while ((m = re.exec(source))) {
    // walk to the matching close paren so multi-line calls are captured whole
    let depth = 1;
    let i = re.lastIndex;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
      i++;
    }
    calls.push(source.slice(m.index, i));
  }
  return calls;
}

test('server code contains no console call referencing client data', () => {
  const offenders = [];
  for (const file of serverFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    for (const call of consoleCalls(source)) {
      for (const word of FORBIDDEN) {
        if (call.toLowerCase().includes(word.toLowerCase())) {
          offenders.push(`${file}: ${word} in ${call.replace(/\s+/g, ' ').slice(0, 120)}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], 'console calls must not reference client data');
});

test('the submit handler logs only an id, an outcome and a duration', () => {
  const source = fs.readFileSync(path.join('api', 'submit.js'), 'utf8');
  const calls = consoleCalls(source);
  assert.ok(calls.length > 0, 'submit handler still logs delivery outcome');
  // `mode` names which record shape was sent (FOS_ONLY / TIMEBAR_AND_FOS).
  // It says nothing about the client or their answers.
  const allowed = /^(requestId|messageId|delivery|durationMs|mode|fos_\w+)$/;
  for (const call of calls) {
    for (const key of call.match(/\b[A-Za-z_][A-Za-z0-9_]*\s*:/g) || []) {
      const name = key.replace(/\s*:$/, '');
      assert.ok(allowed.test(name), `unexpected key logged: ${name}`);
    }
  }
});

test('the provider message id is logged, but never a credential or token', () => {
  const source = fs.readFileSync(path.join('api', 'submit.js'), 'utf8');
  const calls = consoleCalls(source);
  assert.ok(calls.some((c) => /messageId/.test(c)), 'delivery log records the provider message id');
  // nothing resembling an OAuth credential may appear in any logged expression
  const credentialish = /access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|bearer|GMAIL_/i;
  for (const file of serverFiles()) {
    for (const call of consoleCalls(fs.readFileSync(file, 'utf8'))) {
      assert.ok(!credentialish.test(call), `${file} logs credential material: ${call.slice(0, 80)}`);
    }
  }
});

test('the mail adapter logs nothing at all', () => {
  const source = fs.readFileSync(path.join('lib', 'mail.js'), 'utf8');
  assert.deepEqual(consoleCalls(source), [], 'lib/mail.js handles tokens and MIME, so it must never log');
});

test('no logging of whole request or response objects', () => {
  for (const file of serverFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    for (const call of consoleCalls(source)) {
      assert.ok(!/\(\s*(req|res|result|data|payload)\s*[,)]/.test(call), `${file} logs a whole object: ${call.slice(0, 80)}`);
    }
  }
});
