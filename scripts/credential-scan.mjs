import fs from 'node:fs'; import path from 'node:path';
const root=process.cwd(); const ignore=new Set(['node_modules','.git','screenshots']);
const suspicious=[/sk-ant-api\d*-[A-Za-z0-9_-]{20,}/, /AIza[0-9A-Za-z_-]{25,}/, /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/];
let bad=[];
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(ignore.has(e.name))continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p);else{const s=fs.readFileSync(p,'utf8');if(suspicious.some(r=>r.test(s)))bad.push(path.relative(root,p));}}}
walk(root); if(bad.length){console.error('Potential credential material:',bad.join(', '));process.exit(1);} console.log('Credential scan passed.');
