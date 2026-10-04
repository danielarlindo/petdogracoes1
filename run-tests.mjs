// Testes da API (núcleo portátil + D1 simulado). Execute: node tests/run-tests.mjs
import { handle } from '../server/core.mjs';
import { createStore } from '../server/storage-d1.mjs';
import { createD1 } from './d1-shim.mjs';
const env = { SESSION_SECRET: 'x'.repeat(40), SETUP_TOKEN: 'setup-token-1234567890' };
const d1 = createD1(new URL('../migrations/0001_init.sql', import.meta.url).pathname), store = createStore(d1), O = 'https://site.test';
let cookie = '', maxQ = 0, fails = 0;
async function call(method, path, body, { h = {}, ck = cookie, origin = true } = {}) {
  const headers = { 'content-type': 'application/json', ...(method !== 'GET' ? { 'x-pd': '1' } : {}), ...h }; if (ck) headers.cookie = ck; if (origin && method !== 'GET') headers.origin = O;
  d1.queries = 0; const r = await handle(new Request(O + path, { method, headers, body: body && method !== 'GET' ? JSON.stringify(body) : undefined }), { store, env, ip: '1.2.3.4' }); maxQ = Math.max(maxQ, d1.queries);
  const sc = r.headers.get('set-cookie'); const raw = await r.arrayBuffer(); let j = null; try { j = JSON.parse(new TextDecoder().decode(raw)); } catch {} return { s: r.status, j, sc, r, raw };
}
const ok = (n, c) => { if (!c) fails++; console.log((c ? 'PASS' : 'FAIL') + ' ' + n); };
let r = await call('GET', '/api/status'); ok('setup aberto sem admins (e checa as variáveis)', r.j.setupOpen === true && r.j.ready.session && r.j.ready.setup);
r = await call('GET', '/api/admin/me'); ok('visitante: /admin/me → 401', r.s === 401);
r = await call('GET', '/api/admin/app.js'); ok('visitante: código do painel → 401', r.s === 401);
for (const [m, u] of [['PUT', '/api/admin/catalog'], ['PUT', '/api/admin/gallery'], ['PUT', '/api/admin/settings'], ['PUT', '/api/admin/categories'], ['POST', '/api/admin/upload'], ['GET', '/api/admin/admins'], ['GET', '/api/admin/export'], ['POST', '/api/admin/restore/images'], ['POST', '/api/admin/import/fetch']]) { r = await call(m, u, {}); ok(`visitante: ${m} ${u} → 401`, r.s === 401); }
r = await call('POST', '/api/setup', { token: 'errado', email: 'dono@x.com', password: 'senha-segura-123' }); ok('setup com código errado → 403', r.s === 403);
r = await call('POST', '/api/setup', { token: env.SETUP_TOKEN, email: 'dono@x.com', password: 'curta' }); ok('senha curta rejeitada', r.s === 400);
r = await call('POST', '/api/setup', { token: env.SETUP_TOKEN, email: 'dono@x.com', password: 'senha-segura-123', name: 'Dono' }); ok('setup correto cria proprietário', r.s === 200);
r = await call('POST', '/api/setup', { token: env.SETUP_TOKEN, email: 'outro@x.com', password: 'senha-segura-123' }); ok('setup repetido → 403', r.s === 403);
const u = await store.getUserByEmail('dono@x.com'); ok('senha NÃO está em texto simples (hash PBKDF2)', u.hash.startsWith('p1$100000$') && !JSON.stringify(u).includes('senha-segura-123'));
r = await call('POST', '/api/login', { email: 'dono@x.com', password: 'errada-errada' }); ok('login com senha errada → 401', r.s === 401);
r = await call('POST', '/api/login', { email: 'dono@x.com', password: 'senha-segura-123' }); ok('login correto (cookie HttpOnly/Secure/SameSite=Strict)', r.s === 200 && /HttpOnly/.test(r.sc) && /Secure/.test(r.sc) && /SameSite=Strict/.test(r.sc));
cookie = r.sc.split(';')[0];
r = await call('GET', '/api/admin/me'); ok('com sessão: /admin/me → 200', r.s === 200 && r.j.user.role === 'owner');
r = await call('GET', '/api/admin/app.js'); ok('com sessão: painel é entregue', r.s === 200 && /PDPanel/.test(new TextDecoder().decode(r.raw)));
r = await call('GET', '/api/admin/me', null, { ck: cookie.slice(0, -3) + 'abc' }); ok('cookie adulterado → 401', r.s === 401);
r = await call('PUT', '/api/admin/catalog', { products: [] }, { h: { 'x-pd': '0' } }); ok('sem cabeçalho anti-CSRF → 403', r.s === 403);
{ const rr = await handle(new Request(O + '/api/admin/catalog', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-pd': '1', cookie, origin: 'https://evil.com' }, body: '{"products":[]}' }), { store, env, ip: '1.1.1.1' }); ok('origem estranha → 403', rr.status === 403); }
r = await call('PUT', '/api/admin/catalog', { products: [{ name: 'Petisco', category: 'Rações', price: 12, promo: 10, stock: 5, available: true, top: true }] }); ok('adicionar produto + oferta', r.s === 200 && r.j.products[0].promo === 10 && r.j.categories.includes('Rações'));
const pid = r.j.products[0].id;
r = await call('PUT', '/api/admin/catalog', { products: [{ id: pid, name: 'Petisco', category: 'Rações', price: 15, promo: 20 }] }); ok('alterar preço; promo ≥ preço descartada', r.s === 200 && r.j.products[0].price === 15 && r.j.products[0].promo === null);
r = await call('PUT', '/api/admin/catalog', { products: [{ name: 'X', price: -5 }] }); ok('preço negativo rejeitado', r.s === 400);
r = await call('PUT', '/api/admin/catalog', { products: [{ name: 'X', photo: 'http://evil/x.png' }] }); ok('foto externa rejeitada', r.s === 400);
const png = 'data:image/png;base64,' + btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82));
r = await call('POST', '/api/admin/upload', { dataUrl: png }); ok('upload de imagem', r.s === 200 && /^\/api\/img\/[a-f0-9]{24}$/.test(r.j.url)); const img = r.j.url;
r = await call('POST', '/api/admin/upload', { dataUrl: 'data:image/png;base64,' + btoa('<script>alert(1)</script>') }); ok('arquivo disfarçado de imagem rejeitado', r.s === 400);
r = await call('PUT', '/api/admin/catalog', { products: [{ id: pid, name: 'Petisco', category: 'Rações', price: 15, photo: img }] }); ok('trocar foto do produto', r.s === 200);
r = await call('PUT', '/api/admin/gallery', { gallery: [{ src: img, alt: 'Loja' }] }); ok('galeria', r.s === 200);
r = await call('PUT', '/api/admin/categories', { categories: ['Rações', 'Petiscos'] }); ok('categorias', r.s === 200 && r.j.categories.length === 2);
r = await call('PUT', '/api/admin/settings', { settings: { hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, open: '08:00', close: '18:00' })), phone: '75 3225-8574', whatsapp: '', instagram: '@petdogracoes.pets', street: 'Av. X, 1' } }); ok('horários e informações da loja', r.s === 200 && r.j.settings.phone === '7532258574');
r = await call('PUT', '/api/admin/settings', { settings: { hours: [], phone: '1' } }); ok('configurações inválidas rejeitadas', r.s === 400);
r = await call('GET', '/api/public', null, { ck: '' }); ok('visitante vê catálogo, galeria, categorias e horários', r.s === 200 && r.j.products.length === 1 && r.j.gallery.length === 1 && r.j.categories.length === 2 && r.j.settings.phone === '7532258574');
r = await call('GET', img, null, { ck: '' }); ok('imagem pública servida com tipo correto', r.s === 200 && r.r.headers.get('content-type') === 'image/png' && r.raw.byteLength === 16);
// backup / restauração
const ex = await call('GET', '/api/admin/export'); ok('exportar backup (inclui imagens)', ex.s === 200 && ex.j.app === 'petdog' && Object.keys(ex.j.images).length === 1);
r = await call('PUT', '/api/admin/catalog', { products: [] }); r = await call('PUT', '/api/admin/gallery', { gallery: [] }); r = await call('GET', img, null, { ck: '' }); ok('sem referências, imagem órfã é apagada', r.s === 404);
const [iid, iv] = Object.entries(ex.j.images)[0];
r = await call('POST', '/api/admin/restore/images', { images: { [iid]: iv } }); ok('restaurar imagens do backup', r.s === 200);
r = await call('PUT', '/api/admin/catalog', { products: ex.j.catalog }); r = await call('PUT', '/api/admin/gallery', { gallery: ex.j.gallery }); r = await call('GET', '/api/public', null, { ck: '' }); ok('restauração devolve produtos e galeria', r.j.products.length === 1 && r.j.gallery.length === 1);
r = await call('GET', img, null, { ck: '' }); ok('imagem restaurada volta a ser servida', r.s === 200);
// importação de outro site (fetch simulado)
const realFetch = globalThis.fetch; globalThis.fetch = async (u) => { u = String(u);
  if (u === 'https://antigo.example/api/public') return new Response(JSON.stringify({ products: [{ name: 'Importado', category: 'Rações', price: 9, photo: '/api/img/' + 'a'.repeat(24) }], settings: null, gallery: [], categories: ['Rações'] }), { headers: { 'content-type': 'application/json' } });
  if (u === 'https://antigo.example/api/img/' + 'a'.repeat(24)) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
  return new Response('nf', { status: 404 }); };
r = await call('POST', '/api/admin/import/fetch', { url: 'http://antigo.example' }); ok('importar: exige https', r.s === 400);
r = await call('POST', '/api/admin/import/fetch', { url: 'https://antigo.example' }); ok('importar: lê dados públicos do site antigo', r.s === 200 && r.j.data.products.length === 1 && r.j.images.length === 1);
r = await call('POST', '/api/admin/import/image', { url: 'https://antigo.example', path: r.j.images[0] }); ok('importar: copia imagem validada', r.s === 200);
r = await call('POST', '/api/admin/import/image', { url: 'https://antigo.example', path: '/etc/passwd' }); ok('importar: caminho inválido rejeitado', r.s === 400);
globalThis.fetch = realFetch;
// administradores
r = await call('POST', '/api/admin/admins', { name: 'Ed', email: 'ed@x.com', password: 'outra-senha-123', role: 'editor' }); ok('proprietário cria 2º administrador', r.s === 200 && r.j.admins.length === 2);
r = await call('POST', '/api/login', { email: 'ed@x.com', password: 'outra-senha-123' }, { ck: '' }); const ed = r.sc.split(';')[0]; ok('editor faz login', r.s === 200);
r = await call('GET', '/api/admin/admins', null, { ck: ed }); ok('editor NÃO lista administradores → 403', r.s === 403);
r = await call('GET', '/api/admin/export', null, { ck: ed }); ok('editor NÃO exporta backup → 403', r.s === 403);
r = await call('PUT', '/api/admin/catalog', { products: [] }, { ck: ed }); ok('editor edita produtos', r.s === 200);
r = await call('POST', '/api/admin/admins', { email: 'z@x.com', password: 'senha-longa-123' }, { ck: ed }); ok('editor NÃO cria admin → 403', r.s === 403);
const admins = (await call('GET', '/api/admin/admins')).j.admins, me = admins.find((a) => a.role === 'owner'), edu = admins.find((a) => a.role === 'editor');
r = await call('DELETE', '/api/admin/admins/' + me.id); ok('não remove a própria conta / último proprietário', r.s === 400);
r = await call('DELETE', '/api/admin/admins/' + edu.id); ok('proprietário remove editor', r.s === 200);
r = await call('GET', '/api/admin/me', null, { ck: ed }); ok('sessão do editor removido deixa de valer', r.s === 401);
const owner = cookie; r = await call('POST', '/api/logout', {}); ok('logout invalida a sessão', r.s === 200 && /Max-Age=0/.test(r.sc));
r = await call('GET', '/api/admin/me', null, { ck: owner }); ok('cookie antigo não funciona após logout → 401', r.s === 401);
for (let i = 0; i < 5; i++) await call('POST', '/api/login', { email: 'dono@x.com', password: 'errada-errada' }, { ck: '' });
r = await call('POST', '/api/login', { email: 'dono@x.com', password: 'senha-segura-123' }, { ck: '' }); ok('bloqueio após 5 falhas → 429', r.s === 429);
ok(`consultas ao D1 por requisição ≤ 50 (limite do plano gratuito) — máximo observado: ${maxQ}`, maxQ <= 50);
console.log(fails ? `\n${fails} FALHA(S)` : '\nTodos os testes passaram.'); process.exit(fails ? 1 : 0);
