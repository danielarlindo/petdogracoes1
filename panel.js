'use strict';
/* Painel (entregue pelo servidor somente a sessões autenticadas). Usa h, say, api e field definidos em /admin/login.js. */
(function () {
let data = { products: [], settings: null, gallery: [], categories: [] }, tab = 'produtos', editing = null, admins = [];
const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const CATS = ['Produtos para cães', 'Produtos para gatos', 'Produtos para aves', 'Medicamentos', 'Higiene e perfumaria', 'Rações', 'Acessórios'];
const DEF = { hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, open: d === 0 ? '07:30' : d === 6 ? '07:30' : '08:00', close: d === 0 ? '13:00' : d === 6 ? '14:00' : '18:30' })), phone: '7532258574', whatsapp: '', instagram: 'petdogracoes.pets', street: 'Av. João Durval Carneiro, 2927' };

const money = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
function shrink(file, max, q) {
  return new Promise((ok, no) => {
    const fr = new FileReader();
    fr.onerror = () => no(new Error('Não foi possível ler a imagem.'));
    fr.onload = () => { const im = new Image(); im.onerror = () => no(new Error('Imagem inválida.'));
      im.onload = () => { const s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', q)); };
      im.src = fr.result; };
    fr.readAsDataURL(file);
  });
}
const upload = async (file, max) => (await api('/admin/upload', 'POST', { dataUrl: await shrink(file, max, 0.8) })).url;

async function load() {
  data = await (await fetch('/api/public', { cache: 'no-store' })).json(); data.settings = data.settings || DEF;
  if (!data.categories || !data.categories.length) { const s = new Set(CATS); data.products.forEach((p) => s.add(p.category)); data.categories = [...s]; }
  admins = me.role === 'owner' ? (await api('/admin/admins')).admins : [];
}
function render() {
  $hdr.replaceChildren(h('span', { style: 'color:#ddd;margin-right:8px' }, me.email + ' (' + (me.role === 'owner' ? 'proprietário' : 'editor') + ')'), h('a', { class: 'btn', href: '/', target: '_blank', rel: 'noopener', style: 'margin-right:8px' }, 'Ver site'),
    h('button', { onclick: async () => { try { await api('/logout', 'POST', {}); } catch {} location.reload(); } }, 'Sair'));
  const tabs = [['produtos', 'Produtos'], ['ofertas', 'Ofertas'], ['categorias', 'Categorias'], ['galeria', 'Galeria'], ['loja', 'Loja e horários'], ...(me.role === 'owner' ? [['admins', 'Administradores'], ['backup', 'Backup']] : []), ['conta', 'Minha conta']];
  $app.replaceChildren(h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, t]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; editing = null; render(); } }, t))), ({ produtos, ofertas, categorias, galeria, loja, admins: adminsView, backup, conta }[tab])());
}
/* ---------- produtos ---------- */
async function saveCatalog(products, okMsg) { const r = await api('/admin/catalog', 'PUT', { products }); data.products = r.products; if (r.categories) data.categories = r.categories; say(okMsg || 'Salvo. Já aparece no site.'); render(); }
function produtos() {
  if (editing) return productForm(editing === 'new' ? { available: true } : data.products.find((p) => p.id === editing));
  return h('div', { class: 'card' }, h('h2', null, 'Produtos'), h('button', { onclick: () => { editing = 'new'; render(); } }, '+ Adicionar produto'),
    data.products.length ? data.products.map((p) => h('div', { class: 'item' }, p.photo ? h('img', { src: p.photo, alt: '' }) : h('span', { class: 'ph' }),
      h('div', { class: 'grow' }, h('b', null, p.name), h('small', null, p.category + ' · ' + (p.promo != null ? money(p.promo) + ' (de ' + money(p.price) + ')' : money(p.price)) + (p.stock != null ? ' · estoque ' + p.stock : '') + (p.top ? ' · mais procurado' : ''))),
      h('div', { class: 'acts' }, h('button', { class: 'sec', onclick: () => saveCatalog(data.products.map((x) => (x.id === p.id ? { ...x, available: !x.available } : x)), 'Disponibilidade alterada.') }, p.available ? 'Disponível ✓' : 'Indisponível'),
        h('button', { class: 'sec', onclick: () => { editing = p.id; render(); } }, 'Editar'),
        h('button', { class: 'danger', onclick: (e) => { if (e.target.dataset.s) return saveCatalog(data.products.filter((x) => x.id !== p.id), 'Produto excluído.'); e.target.dataset.s = 1; e.target.textContent = 'Confirmar?'; } }, 'Excluir')))) : h('p', { class: 'mut' }, 'Nenhum produto cadastrado.'));
}
function productForm(p) {
  const f = { name: h('input', { value: p.name || '' }), cat: h('input', { value: p.category || '', list: 'cats' }), desc: h('textarea', { rows: 3 }, p.desc || ''), price: h('input', { inputmode: 'decimal', value: p.price ?? '' }),
    promo: h('input', { inputmode: 'decimal', value: p.promo ?? '' }), stock: h('input', { inputmode: 'numeric', value: p.stock ?? '' }), av: h('input', { type: 'checkbox' }), top: h('input', { type: 'checkbox' }), file: h('input', { type: 'file', accept: 'image/*' }) };
  f.av.checked = p.available !== false; f.top.checked = !!p.top; let photo = p.photo || '';
  const num = (v) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const save = async () => {
    try {
      if (f.file.files[0]) photo = await upload(f.file.files[0], 700);
      const item = { id: p.id, name: f.name.value, category: f.cat.value, desc: f.desc.value, price: num(f.price.value), promo: num(f.promo.value), stock: num(f.stock.value), available: f.av.checked, top: f.top.checked, photo };
      const list = p.id ? data.products.map((x) => (x.id === p.id ? item : x)) : [...data.products, item]; editing = null; await saveCatalog(list);
    } catch (x) { say(x.message, true); }
  };
  return h('div', { class: 'card' }, h('h2', null, p.id ? 'Editar produto' : 'Novo produto'), field('Nome', f.name), h('datalist', { id: 'cats' }, data.categories.map((c) => h('option', { value: c }))), field('Categoria (escolha ou digite uma nova)', f.cat), field('Descrição curta', f.desc),
    h('div', { class: 'row3' }, field('Preço (R$)', f.price), field('Preço promocional (R$)', f.promo), field('Estoque (vazio = sem controle)', f.stock)),
    h('p', null, h('label', null, f.av, ' Disponível'), h('label', null, f.top, ' Mais procurado')), photo ? h('img', { src: photo, alt: '', style: 'width:96px;border-radius:10px' }) : null, field('Foto (trocar ou adicionar)', f.file),
    h('p', { class: 'mut' }, 'Para criar uma oferta, preencha o preço promocional (menor que o preço).'), h('p', { class: 'acts' }, h('button', { onclick: save }, 'Salvar'), h('button', { class: 'sec', onclick: () => { editing = null; render(); } }, 'Cancelar')));
}
function ofertas() {
  return h('div', { class: 'card' }, h('h2', null, '🔥 Ofertas'), h('p', { class: 'mut' }, 'Defina o preço promocional de qualquer produto. Para remover a oferta, apague o valor e salve.'),
    data.products.length ? [...data.products].sort((a, b) => (b.promo != null) - (a.promo != null)).map((p) => { const i = h('input', { inputmode: 'decimal', value: p.promo ?? '', placeholder: 'Preço promocional' });
      return h('div', { class: 'item' }, p.photo ? h('img', { src: p.photo, alt: '' }) : h('span', { class: 'ph' }), h('div', { class: 'grow' }, h('b', null, p.name), h('small', null, 'Preço: ' + money(p.price))), h('div', { style: 'width:170px' }, i),
        h('button', { onclick: () => saveCatalog(data.products.map((x) => (x.id === p.id ? { ...x, promo: i.value.trim() === '' ? null : Number(i.value.replace(',', '.')) } : x)), 'Oferta atualizada.').catch((e) => say(e.message, true)) }, 'Salvar')); })
      : h('p', { class: 'mut' }, 'Cadastre produtos primeiro, na aba Produtos.'));
}

/* ---------- galeria ---------- */
async function saveGallery(g, m) { const r = await api('/admin/gallery', 'PUT', { gallery: g }); data.gallery = r.gallery; say(m || 'Galeria atualizada.'); render(); }
function galeria() {
  const f = h('input', { type: 'file', accept: 'image/*', multiple: true });
  const add = async () => { try { const out = [...data.gallery]; for (const file of f.files) out.push({ src: await upload(file, 1100), alt: 'Foto da PetDog Rações' }); await saveGallery(out, 'Fotos adicionadas.'); } catch (x) { say(x.message, true); } };
  return h('div', { class: 'card' }, h('h2', null, 'Galeria'), h('p', { class: 'mut' }, 'Quando houver ao menos uma foto aqui, ela substitui as fotos padrão do site. Só use fotos que a loja tenha direito de usar.'),
    field('Adicionar fotos', f), h('p', null, h('button', { onclick: add }, 'Enviar fotos')),
    data.gallery.length ? h('div', { class: 'gal' }, data.gallery.map((g, i) => h('figure', null, h('img', { src: g.src, alt: g.alt }), h('button', { class: 'danger', style: 'width:100%;margin-top:6px', onclick: (e) => { if (e.target.dataset.s) return saveGallery(data.gallery.filter((_, j) => j !== i), 'Foto removida.').catch((x) => say(x.message, true)); e.target.dataset.s = 1; e.target.textContent = 'Confirmar?'; } }, 'Remover')))) : h('p', { class: 'mut' }, 'Sem fotos próprias: o site exibe as fotos padrão.'));
}

/* ---------- loja ---------- */
function loja() {
  const s = data.settings, hrs = DAYS.map((_, d) => s.hours.find((x) => x.d === d) || { d, open: '', close: '' });
  const rows = hrs.map((x) => ({ d: x.d, o: h('input', { type: 'time', value: x.open }), c: h('input', { type: 'time', value: x.close }) }));
  const ph = h('input', { inputmode: 'numeric', value: s.phone }), wa = h('input', { inputmode: 'numeric', value: s.whatsapp || '', placeholder: 'Opcional, com DDD' }), ig = h('input', { value: s.instagram }), st = h('input', { value: s.street || '' });
  const save = async () => { try { const r = await api('/admin/settings', 'PUT', { settings: { hours: rows.map((r) => ({ d: r.d, open: r.o.value, close: r.c.value })), phone: ph.value, whatsapp: wa.value, instagram: ig.value, street: st.value } }); data.settings = r.settings; say('Informações salvas.'); } catch (x) { say(x.message, true); } };
  return h('div', { class: 'card' }, h('h2', null, 'Horários'), h('p', { class: 'mut' }, 'Deixe abertura e fechamento vazios para marcar o dia como fechado.'),
    rows.map((r) => h('div', { class: 'row3', style: 'align-items:end' }, h('b', null, DAYS[r.d]), field('Abre', r.o), field('Fecha', r.c))), h('h3', null, 'Informações da loja'),
    h('div', { class: 'row' }, field('Telefone (DDD + número)', ph), field('WhatsApp (botão “Tenho interesse”)', wa), field('Instagram (sem @)', ig), field('Endereço (rua e número)', st)), h('p', null, h('button', { onclick: save }, 'Salvar')));
}

/* ---------- administradores ---------- */
async function adminsAct(fn, m) { try { admins = (await fn()).admins; say(m); render(); } catch (x) { say(x.message, true); } }
function adminsView() {
  const n = h('input'), e = h('input', { type: 'email' }), p = h('input', { type: 'password', autocomplete: 'new-password' }), r = h('select', null, h('option', { value: 'editor' }, 'Editor (produtos, ofertas, galeria, loja)'), h('option', { value: 'owner' }, 'Proprietário (também gerencia administradores)'));
  return h('div', { class: 'card' }, h('h2', null, 'Administradores'), admins.map((a) => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, a.name), h('small', null, a.email)),
    h('select', { onchange: (ev) => adminsAct(() => api('/admin/admins/' + a.id, 'PATCH', { role: ev.target.value }), 'Permissão alterada.') }, h('option', { value: 'editor', selected: a.role === 'editor' }, 'Editor'), h('option', { value: 'owner', selected: a.role === 'owner' }, 'Proprietário')),
    h('button', { class: 'sec', onclick: () => { const np = prompt('Nova senha para ' + a.email + ' (mínimo 10 caracteres):'); if (np) adminsAct(() => api('/admin/admins/' + a.id, 'PATCH', { password: np }), 'Senha redefinida.'); } }, 'Redefinir senha'),
    h('button', { class: 'danger', disabled: a.id === me.id, onclick: (ev) => { if (ev.target.dataset.s) return adminsAct(() => api('/admin/admins/' + a.id, 'DELETE'), 'Administrador removido.'); ev.target.dataset.s = 1; ev.target.textContent = 'Confirmar?'; } }, 'Remover'))),
    h('h3', null, 'Adicionar administrador'), h('p', { class: 'mut' }, 'Cada pessoa tem a própria conta. Envie a senha inicial por um canal seguro e peça para ela trocar em “Minha conta”.'),
    h('div', { class: 'row' }, field('Nome', n), field('E-mail', e), field('Senha inicial (mín. 10)', p), field('Permissão', r)), h('p', null, h('button', { onclick: () => adminsAct(() => api('/admin/admins', 'POST', { name: n.value, email: e.value, password: p.value, role: r.value }), 'Administrador adicionado.') }, 'Adicionar')));
}
function conta() {
  const a = h('input', { type: 'password', autocomplete: 'current-password' }), b = h('input', { type: 'password', autocomplete: 'new-password' });
  return h('div', { class: 'card' }, h('h2', null, 'Minha conta'), h('p', null, me.email), field('Senha atual', a), field('Nova senha (mín. 10)', b),
    h('p', null, h('button', { onclick: async () => { try { await api('/admin/password', 'POST', { current: a.value, password: b.value }); a.value = b.value = ''; say('Senha alterada. Outras sessões foram encerradas.'); } catch (x) { say(x.message, true); } } }, 'Trocar senha')));
}

/* ---------- categorias ---------- */
async function saveCats(list, products, msg) {
  try { if (products) data.products = (await api('/admin/catalog', 'PUT', { products })).products; data.categories = (await api('/admin/categories', 'PUT', { categories: list })).categories; say(msg); render(); } catch (x) { say(x.message, true); }
}
function categorias() {
  const n = h('input', { placeholder: 'Nome da nova categoria' });
  return h('div', { class: 'card' }, h('h2', null, 'Categorias'), h('p', { class: 'mut' }, 'Os cards de setores da página inicial são fixos; as categorias criadas aqui aparecem nos filtros da loja online.'),
    data.categories.map((c) => { const used = data.products.filter((p) => p.category === c).length, i = h('input', { value: c });
      return h('div', { class: 'item' }, h('div', { class: 'grow' }, i, h('small', null, used + ' produto(s)')),
        h('button', { class: 'sec', onclick: () => { const v = i.value.trim(); if (!v || v === c) return; if (data.categories.includes(v)) return say('Essa categoria já existe.', true); saveCats(data.categories.map((x) => (x === c ? v : x)), data.products.map((p) => (p.category === c ? { ...p, category: v } : p)), 'Categoria renomeada.'); } }, 'Renomear'),
        h('button', { class: 'danger', disabled: used > 0, title: used ? 'Mova os produtos antes de excluir' : '', onclick: (e) => { if (e.target.dataset.s) return saveCats(data.categories.filter((x) => x !== c), null, 'Categoria excluída.'); e.target.dataset.s = 1; e.target.textContent = 'Confirmar?'; } }, used ? 'Em uso' : 'Excluir')); }),
    h('h3', null, 'Nova categoria'), n, h('p', null, h('button', { onclick: () => { const v = n.value.trim(); if (!v) return; if (data.categories.includes(v)) return say('Essa categoria já existe.', true); saveCats([...data.categories, v], null, 'Categoria criada.'); } }, 'Adicionar')));
}

/* ---------- backup / restauração / importação ---------- */
function backup() {
  const out = h('p', { class: 'mut' }), file = h('input', { type: 'file', accept: 'application/json' }), site = h('input', { placeholder: 'https://seu-site-antigo.netlify.app' });
  const note = (t) => { out.textContent = t; };
  const putDocs = async (d) => {
    await api('/admin/catalog', 'PUT', { products: d.products || d.catalog || [] }); await api('/admin/gallery', 'PUT', { gallery: d.gallery || [] });
    if (d.categories && d.categories.length) await api('/admin/categories', 'PUT', { categories: d.categories });
    if (d.settings) await api('/admin/settings', 'PUT', { settings: d.settings });
    await load(); render();
  };
  const download = async () => {
    try { const r = await api('/admin/export'); const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(r)], { type: 'application/json' })), download: 'backup-petdog-' + new Date().toISOString().slice(0, 10) + '.json' }); document.body.append(a); a.click(); a.remove(); say('Backup baixado. Guarde o arquivo em local seguro.'); } catch (x) { say(x.message, true); }
  };
  const restore = async () => {
    try {
      const f = file.files[0]; if (!f) return say('Escolha o arquivo de backup.', true);
      const d = JSON.parse(await f.text()); if (d.app !== 'petdog') throw new Error('Este arquivo não é um backup da PetDog.');
      if (!confirm('Restaurar vai SUBSTITUIR produtos, categorias, galeria e informações atuais. Continuar?')) return;
      const ids = Object.keys(d.images || {});
      for (let i = 0; i < ids.length; i += 10) { note('Enviando imagens ' + Math.min(i + 10, ids.length) + '/' + ids.length + '…'); await api('/admin/restore/images', 'POST', { images: Object.fromEntries(ids.slice(i, i + 10).map((k) => [k, d.images[k]])) }); }
      note('Gravando dados…'); await putDocs(d); note('Backup restaurado.'); say('Backup restaurado.');
    } catch (x) { note(''); say(x.message, true); }
  };
  const importSite = async () => {
    try {
      if (!confirm('Importar vai SUBSTITUIR produtos, categorias, galeria e informações atuais pelos do site informado (somente leitura nele). Continuar?')) return;
      note('Lendo o site de origem…'); const r = await api('/admin/import/fetch', 'POST', { url: site.value });
      for (let i = 0; i < r.images.length; i++) { note('Copiando imagem ' + (i + 1) + '/' + r.images.length + '…'); await api('/admin/import/image', 'POST', { url: site.value, path: r.images[i] }); }
      note('Gravando dados…'); await putDocs(r.data); note('Importação concluída: ' + r.data.products.length + ' produto(s).'); say('Importação concluída.');
    } catch (x) { note(''); say(x.message, true); }
  };
  return h('div', { class: 'card' }, h('h2', null, 'Backup e importação'), h('p', { class: 'mut' }, 'Faça backup com frequência. O arquivo contém produtos, categorias, galeria, informações da loja e as imagens. Contas e senhas não entram no backup.'),
    h('p', null, h('button', { onclick: download }, 'Baixar backup (JSON)')), h('h3', null, 'Restaurar backup'), field('Arquivo de backup', file), h('p', null, h('button', { class: 'sec', onclick: restore }, 'Restaurar')),
    h('h3', null, 'Importar de outro site da PetDog'), h('p', { class: 'mut' }, 'Copia produtos, fotos e informações do endereço público de um site que use este mesmo painel (por exemplo, a versão antiga no Netlify). O site de origem não é alterado.'),
    field('Endereço do site (https://…)', site), h('p', null, h('button', { class: 'sec', onclick: importSite }, 'Importar')), out);
}
window.PDPanel = { async start(user) { me = user; await load(); render(); } };
})();
