const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const root = path.join(__dirname, 'public');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:8787';
process.env.ADMIN_ACCESS_KEY = process.env.ADMIN_ACCESS_KEY || 'dev-admin-key-change-me';
process.env.MAIL_MODE = process.env.MAIL_MODE || 'fake';

const api = {
  '/api/csrf': require('./api/csrf'), '/api/prefill-create': require('./api/prefill-create'), '/api/prefill-resolve': require('./api/prefill-resolve'), '/api/submit': require('./api/submit')
};
function responseAdapter(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('Content-Type','application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
  return res;
}
function sendStatic(file, res) {
  const ext=path.extname(file); const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.txt':'text/plain; charset=utf-8'};
  res.setHeader('Content-Type',types[ext]||'application/octet-stream'); res.setHeader('Cache-Control','no-store'); fs.createReadStream(file).pipe(res);
}
const server=http.createServer(async(req,res)=>{
  responseAdapter(res);
  const u=new URL(req.url,'http://localhost');
  if(api[u.pathname]){
    let raw=''; for await(const chunk of req) raw+=chunk;
    if(raw){ try{req.body=JSON.parse(raw);}catch{return res.status(400).json({error:'Invalid request'});} }
    req.headers.origin=req.headers.origin||process.env.APP_ORIGIN;
    return api[u.pathname](req,res);
  }
  let pathname=u.pathname==='/'?'/index.html':u.pathname==='/admin'?'/admin.html':u.pathname;
  const file=path.join(root,pathname.replace(/^\//,''));
  if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.statusCode=404;return res.end('Not found');}
  sendStatic(file,res);
});
server.listen(8787,()=>console.log('Dev server http://localhost:8787'));
