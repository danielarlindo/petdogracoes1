// Servidor local que imita o Cloudflare Pages: arquivos de /public + Function de /api/* (D1 simulado em memória) + _headers.
// Uso: SESSION_SECRET=... SETUP_TOKEN=... node tests/dev-server.mjs   (porta 8788). Para o ambiente real use: npm run dev (wrangler).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { onRequest } from '../functions/api/[[path]].js'; import { createD1 } from './d1-shim.mjs';
const ROOT = new URL('../public', import.meta.url).pathname, PORT = +process.env.PORT || 8788;
const env = { DB: createD1(new URL('../migrations/0001_init.sql', import.meta.url).pathname), SESSION_SECRET: process.env.SESSION_SECRET, SETUP_TOKEN: process.env.SETUP_TOKEN };
const csp = /Content-Security-Policy: (.+)/.exec(fs.readFileSync(ROOT + '/_headers', 'utf8'))[1];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost:' + PORT);
  if (u.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await onRequest({ request: new Request(u, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env });
    const h = {}; r.headers.forEach((v, k) => (h[k] = v)); const sc = r.headers.getSetCookie?.(); if (sc?.length) h['set-cookie'] = sc;
    res.writeHead(r.status, h); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  const p = u.pathname === '/admin' ? '/admin/index.html' : u.pathname.endsWith('/') ? u.pathname + 'index.html' : u.pathname, f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || p.startsWith('/_')) { res.writeHead(404); return res.end('404'); }
  const h = { 'content-type': mime[path.extname(f)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' };
  if (u.pathname.startsWith('/admin')) h['content-security-policy'] = csp;
  res.writeHead(200, h); res.end(fs.readFileSync(f));
}).listen(PORT, () => console.log('http://localhost:' + PORT));
