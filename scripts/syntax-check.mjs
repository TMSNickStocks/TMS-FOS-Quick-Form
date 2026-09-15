import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const targets = ['api', 'lib', 'tests'];
const files = ['dev-server.js'];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.js')) files.push(p);
  }
}
for (const t of targets) if (fs.existsSync(t)) walk(t);

let bad = [];
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    bad.push(`${f}: ${String(err.stderr || err.message).trim().split('\n')[0]}`);
  }
}
if (bad.length) {
  console.error('Syntax check failed:\n' + bad.join('\n'));
  process.exit(1);
}
console.log(`Syntax check passed: ${files.length} files.`);
