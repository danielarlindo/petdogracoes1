// Núcleo da API da PetDog Rações. Independente de hospedagem: recebe um Request padrão e devolve um Response padrão.
// Dependências injetadas: store (banco), env (segredos) e ip. Para outra hospedagem, basta um novo adaptador fino.
import { PANEL_JS } from './panel-ui.mjs';
import { hashPw, checkPw, fakeCheck, makeToken, readToken, setCookie, clearCookie, COOKIE } from './auth.mjs';
import { sha256Hex, randomHex, ctEqual, bytesToB64, utf8 } from './util.mjs';
import { str, IMG, IMG_ID, EMAIL, cleanProducts, cleanGallery, cleanSettings, cleanPw, cleanCategories, checkImage } from './validate.mjs';

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });
const fail = (status, error) => json({ error }, status);
const pub = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt });
const httpErr = (status, msg) => Object.assign(new Error(msg), { status });

export async function handle(req, { store, env, ip = 'unknown' }) {
  const secret = env.SESSION_SECRET && env.SESSION_SECRET.length >= 32 ? env.SESSION_SECRET : null;
  const setupToken = env.SETUP_TOKEN && env.SETUP_TOKEN.length >= 16 ? env.SETUP_TOKEN : null;
  const url = new URL(req.url), method = req.method;
  const path = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/';

  async function currentUser() {
    if (!secret) return null;
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.get('cookie') || '');
    const p = m && (await readToken(secret, m[1]));
    if (!p) return null;
    const u = await store.getUser(p.u); // revalida no servidor a cada requisição
    return u && u.sv === p.sv ? u : null;
  }
  async function locked(keys) { for (const k of keys) { const r = await store.getRL(k); if (r && r.until > Date.now()) return true; } return false; }
  async function addFailure(keys) {
    for (const k of keys) {
      const r = (await store.getRL(k)) || { n: 0, first: Date.now(), until: 0 };
      if (Date.now() - r.first > 15 * 60e3) { r.n = 0; r.first = Date.now(); }
      r.n++; if (r.n >= 5) { r.until = Date.now() + 15 * 60e3; r.n = 0; }
      await store.setRL(k, r);
    }
  }
  const photosOf = async () => { const [p, g] = await Promise.all([store.getDoc('catalog'), store.getDoc('gallery')]); return { products: (p || []).map((x) => x.photo).filter(Boolean), gallery: (g || []).map((x) => x.src).filter(Boolean) }; };
  const dropOrphans = async (before, after) => { const keep = new Set(after), gone = before.filter((u) => u && !keep.has(u)).map((u) => u.split('/').pop()); if (gone.length) await store.deleteImages(gone); };

  try {
    // ---- públicas (somente leitura) ----
    if (method === 'GET' && path === '/public') {
      const [products, settings, gallery, categories] = await Promise.all([store.getDoc('catalog'), store.getDoc('settings'), store.getDoc('gallery'), store.getDoc('categories')]);
      return json({ products: products || [], settings: settings || null, gallery: gallery || [], categories: categories || [] }, 200, { 'cache-control': 'no-cache' });
    }
    const im = /^\/img\/([a-f0-9]{24})$/.exec(path);
    if (method === 'GET' && im) {
      const r = await store.getImage(im[1]);
      if (!r) return fail(404, 'Não encontrada.');
      const bin = Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
      return new Response(bin, { headers: { 'content-type': r.type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
    }
    if (method === 'GET' && path === '/status') {
      try {
        const open = (await store.countUsers()) === 0;
        return json(open ? { setupOpen: true, ready: { session: !!secret, setup: !!setupToken } } : { setupOpen: false });
      } catch (e) { console.error('status/db:', e); return json({ setupOpen: false, storage: 'erro' }, 500); }
    }

    // ---- proteção CSRF para qualquer escrita ----
    if (method !== 'GET') {
      const origin = req.headers.get('origin');
      if (req.headers.get('x-pd') !== '1' || (origin && origin !== url.origin)) return fail(403, 'Requisição bloqueada.');
    }
    if (!secret) return fail(500, 'Servidor não configurado: cadastre o secret SESSION_SECRET (32+ caracteres) no Cloudflare Pages.');
    let body = {};
    if (method !== 'GET') { try { body = await req.json(); } catch { body = {}; } }

    // ---- primeiro administrador (só se não existir nenhum; exige SETUP_TOKEN secreto) ----
    if (method === 'POST' && path === '/setup') {
      if ((await store.countUsers()) > 0) return fail(403, 'A configuração inicial já foi concluída.');
      if (!setupToken) return fail(500, 'Cadastre o secret SETUP_TOKEN (16+ caracteres) no Cloudflare Pages.');
      const keys = [await sha256Hex('ip:' + ip)];
      if (await locked(keys)) return fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
      if (!ctEqual(await sha256Hex(String(body.token || '')), await sha256Hex(setupToken))) { await addFailure(keys); return fail(403, 'Código de configuração incorreto.'); }
      const email = str(body.email, 254).toLowerCase();
      if (!EMAIL.test(email)) return fail(400, 'E-mail inválido.');
      const user = { id: randomHex(8), email, name: str(body.name, 80) || email, role: 'owner', hash: await hashPw(cleanPw(body.password)), sv: 1, createdAt: new Date().toISOString() };
      if (!(await store.insertFirstUser(user))) return fail(403, 'A configuração inicial já foi concluída.');
      return json({ ok: true });
    }

    // ---- login / logout ----
    if (method === 'POST' && path === '/login') {
      const email = str(body.email, 254).toLowerCase(), pw = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
      const keys = [await sha256Hex('ip:' + ip), await sha256Hex('em:' + email)];
      if (await locked(keys)) return fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
      const user = await store.getUserByEmail(email);
      const good = user ? await checkPw(pw, user.hash) : (await fakeCheck(pw), false);
      if (!good) { await addFailure(keys); return fail(401, 'E-mail ou senha incorretos.'); }
      for (const k of keys) await store.delRL(k);
      return json({ ok: true, user: pub(user) }, 200, { 'set-cookie': setCookie(await makeToken(secret, user)) });
    }
    if (method === 'POST' && path === '/logout') {
      const u = await currentUser();
      if (u) { u.sv++; await store.updateUser(u); } // invalida a sessão no servidor
      return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
    }

    // ---- TUDO abaixo exige sessão válida (verificada no servidor) ----
    if (!path.startsWith('/admin')) return fail(404, 'Não encontrado.');
    const me = await currentUser();
    if (!me) return fail(401, 'Não autenticado.');
    const sub = path.slice('/admin'.length) || '/';
    const owner = () => { if (me.role !== 'owner') throw httpErr(403, 'Somente proprietários podem fazer isso.'); };

    if (method === 'GET' && sub === '/me') return json({ user: pub(me) });
    if (method === 'GET' && sub === '/app.js') return new Response(PANEL_JS, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }); // o painel só é entregue a quem está autenticado
    if (method === 'PUT' && sub === '/categories') { const categories = cleanCategories(body.categories); await store.setDoc('categories', categories); return json({ ok: true, categories }); }
    if (method === 'PUT' && sub === '/catalog') {
      const before = await photosOf(), products = cleanProducts(body.products);
      await store.setDoc('catalog', products);
      const cats = (await store.getDoc('categories')) || []; let grew = false;
      for (const p of products) if (!cats.includes(p.category)) { cats.push(p.category); grew = true; }
      if (grew) await store.setDoc('categories', cats);
      await dropOrphans(before.products, [...products.map((p) => p.photo), ...before.gallery]);
      return json({ ok: true, products, categories: cats });
    }
    if (method === 'PUT' && sub === '/gallery') {
      const before = await photosOf(), gallery = cleanGallery(body.gallery);
      await store.setDoc('gallery', gallery);
      await dropOrphans(before.gallery, [...gallery.map((g) => g.src), ...before.products]);
      return json({ ok: true, gallery });
    }
    if (method === 'PUT' && sub === '/settings') { const settings = cleanSettings(body.settings || {}); await store.setDoc('settings', settings); return json({ ok: true, settings }); }
    if (method === 'POST' && sub === '/upload') {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.dataUrl || '');
      if (!m) throw new Error('Imagem inválida.');
      checkImage(m[1], m[2]); const id = randomHex(12); await store.putImage(id, m[1], m[2]);
      return json({ ok: true, url: '/api/img/' + id });
    }
    if (method === 'POST' && sub === '/password') {
      if (!(await checkPw(String(body.current || ''), me.hash))) return fail(403, 'Senha atual incorreta.');
      me.hash = await hashPw(cleanPw(body.password)); me.sv++; await store.updateUser(me);
      return json({ ok: true }, 200, { 'set-cookie': setCookie(await makeToken(secret, me)) });
    }

    // ---- backup / restauração / importação (somente proprietários) ----
    if (method === 'GET' && sub === '/export') {
      owner();
      const [catalog, settings, gallery, categories] = await Promise.all([store.getDoc('catalog'), store.getDoc('settings'), store.getDoc('gallery'), store.getDoc('categories')]);
      const ids = [...new Set([...(catalog || []).map((p) => p.photo), ...(gallery || []).map((g) => g.src)].filter(Boolean).map((u) => u.split('/').pop()))];
      const images = {}; for (const r of await store.getImages(ids)) images[r.id] = { type: r.type, data: r.data };
      return json({ app: 'petdog', version: 1, exportedAt: new Date().toISOString(), catalog: catalog || [], settings, gallery: gallery || [], categories: categories || [], images });
    }
    if (method === 'POST' && sub === '/restore/images') {
      owner();
      const entries = Object.entries(body.images || {});
      if (entries.length > 20) throw new Error('Envie no máximo 20 imagens por vez.');
      for (const [id, v] of entries) { if (!IMG_ID.test(id)) throw new Error('Imagem inválida.'); checkImage(v.type, v.data); await store.putImage(id, v.type, v.data); }
      return json({ ok: true, count: entries.length });
    }
    if (method === 'POST' && (sub === '/import/fetch' || sub === '/import/image')) { // lê dados PÚBLICOS de outro site (ex.: o site antigo) – não altera o site de origem
      owner();
      let base; try { base = new URL(String(body.url || '')); } catch { throw new Error('Endereço inválido.'); }
      if (base.protocol !== 'https:' || base.username || base.password) throw new Error('Use um endereço https:// sem usuário/senha.');
      const get = (p) => fetch(base.origin + p, { signal: AbortSignal.timeout(10000), redirect: 'follow' });
      if (sub === '/import/fetch') {
        const r = await get('/api/public'); if (!r.ok) throw new Error('O site informado não respondeu em /api/public (HTTP ' + r.status + ').');
        const d = await r.json().catch(() => null); if (!d || !Array.isArray(d.products)) throw new Error('Resposta inesperada do site informado.');
        const paths = [...new Set([...d.products.map((p) => p.photo), ...(d.gallery || []).map((g) => g.src)].filter((x) => x && IMG.test(x)))];
        return json({ ok: true, data: { products: d.products, settings: d.settings || null, gallery: d.gallery || [], categories: d.categories || [] }, images: paths });
      }
      if (!IMG.test(body.path || '')) throw new Error('Caminho de imagem inválido.');
      const r = await get(body.path); if (!r.ok) throw new Error('Imagem não encontrada (HTTP ' + r.status + ').');
      const type = (r.headers.get('content-type') || '').split(';')[0], buf = new Uint8Array(await r.arrayBuffer());
      const b64 = bytesToB64(buf); checkImage(type, b64); await store.putImage(body.path.split('/').pop(), type, b64);
      return json({ ok: true });
    }

    // ---- administradores (somente proprietários) ----
    if (sub === '/admins' || sub.startsWith('/admins/')) {
      owner();
      const users = await store.listUsers(), id = sub.split('/')[2];
      if (method === 'GET' && !id) return json({ admins: users.map(pub) });
      if (method === 'POST' && !id) {
        const email = str(body.email, 254).toLowerCase();
        if (!EMAIL.test(email)) return fail(400, 'E-mail inválido.');
        if (users.some((u) => u.email === email)) return fail(409, 'Este e-mail já tem conta.');
        await store.insertUser({ id: randomHex(8), email, name: str(body.name, 80) || email, role: body.role === 'owner' ? 'owner' : 'editor', hash: await hashPw(cleanPw(body.password)), sv: 1, createdAt: new Date().toISOString() });
        return json({ ok: true, admins: (await store.listUsers()).map(pub) });
      }
      const target = users.find((u) => u.id === id);
      if (!target) return fail(404, 'Administrador não encontrado.');
      const owners = users.filter((u) => u.role === 'owner').length;
      if (method === 'PATCH') {
        if (body.role) { const r = body.role === 'owner' ? 'owner' : 'editor'; if (target.role === 'owner' && r !== 'owner' && owners < 2) return fail(400, 'Deve existir ao menos um proprietário.'); target.role = r; }
        if (body.password) { target.hash = await hashPw(cleanPw(body.password)); target.sv++; }
        await store.updateUser(target);
        return json({ ok: true, admins: (await store.listUsers()).map(pub) });
      }
      if (method === 'DELETE') {
        if (target.id === me.id) return fail(400, 'Você não pode remover a própria conta.');
        if (target.role === 'owner' && owners < 2) return fail(400, 'Deve existir ao menos um proprietário.');
        await store.deleteUser(id);
        return json({ ok: true, admins: (await store.listUsers()).map(pub) });
      }
    }
    return fail(404, 'Não encontrado.');
  } catch (e) {
    return fail(e.status || 400, e.status ? e.message : e.message || 'Erro.');
  }
}
