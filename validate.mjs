// Validação e normalização (nada do cliente é confiável). Funções puras, sem dependência de plataforma.
import { randomHex, b64ToBytes } from './util.mjs';
export const str = (v, max) => String(v ?? '').trim().slice(0, max);
const money = (v) => { if (v === null || v === '' || v === undefined) return null; const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 1e6 ? Math.round(n * 100) / 100 : undefined; };
const intOrNull = (v) => { if (v === null || v === '' || v === undefined) return null; const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 1e6 ? n : undefined; };
export const IMG = /^\/api\/img\/[a-f0-9]{24}$/;
export const IMG_ID = /^[a-f0-9]{24}$/;
export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export function cleanProducts(list) {
  if (!Array.isArray(list) || list.length > 500) throw new Error('Lista de produtos inválida.');
  return list.map((p) => {
    const price = money(p.price), promo = money(p.promo), stock = intOrNull(p.stock);
    if (!str(p.name, 120)) throw new Error('Todo produto precisa de nome.');
    if (price === undefined || promo === undefined || stock === undefined) throw new Error('Preço ou estoque inválido.');
    if (p.photo && !IMG.test(p.photo)) throw new Error('Foto inválida.');
    return { id: /^p[a-z0-9]{5,24}$/.test(p.id || '') ? p.id : 'p' + randomHex(6), name: str(p.name, 120), category: str(p.category, 60) || 'Outros', desc: str(p.desc, 400),
      price, promo: promo !== null && price !== null && promo < price ? promo : null, stock, available: p.available !== false, top: !!p.top, photo: p.photo || '' };
  });
}
export function cleanGallery(list) {
  if (!Array.isArray(list) || list.length > 40) throw new Error('Galeria inválida.');
  return list.map((g) => { if (!IMG.test(g.src || '')) throw new Error('Foto inválida.'); return { src: g.src, alt: str(g.alt, 120) || 'Foto da PetDog Rações' }; });
}
export function cleanSettings(s) {
  const hours = (Array.isArray(s.hours) ? s.hours : []).slice(0, 7).map((h) => {
    const d = Number(h.d), t = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!(d >= 0 && d <= 6)) throw new Error('Horário inválido.');
    if (!h.open && !h.close) return { d, open: '', close: '' };
    if (!t.test(h.open) || !t.test(h.close) || h.open >= h.close) throw new Error('Horário inválido.');
    return { d, open: h.open, close: h.close };
  });
  if (hours.length !== 7) throw new Error('Informe os 7 dias.');
  const phone = String(s.phone || '').replace(/\D/g, ''), wa = String(s.whatsapp || '').replace(/\D/g, ''), ig = String(s.instagram || '').replace(/^@/, '');
  if (!/^\d{10,11}$/.test(phone)) throw new Error('Telefone inválido (DDD + número).');
  if (wa && !/^\d{10,13}$/.test(wa)) throw new Error('WhatsApp inválido.');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(ig)) throw new Error('Instagram inválido.');
  return { hours, phone, whatsapp: wa, instagram: ig, street: str(s.street, 120) };
}
export const cleanPw = (p) => { if (typeof p !== 'string' || p.length < 10 || p.length > 200) throw new Error('A senha deve ter de 10 a 200 caracteres.'); return p; };
export const cleanCategories = (c) => { const l = Array.isArray(c) ? c.map((x) => str(x, 60)).filter(Boolean) : null; if (!l || l.length > 60 || new Set(l).size !== l.length) throw new Error('Lista de categorias inválida.'); return l; };
// valida bytes de imagem (tipo declarado x assinatura do arquivo x tamanho)
export function checkImage(type, b64) {
  if (!/^[A-Za-z0-9+/=]+$/.test(b64 || '') || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new Error('Imagem inválida.');
  const b = b64ToBytes(b64), asc = (i, n) => String.fromCharCode(...b.slice(i, i + n));
  const ok = (type === 'image/jpeg' && b[0] === 0xff && b[1] === 0xd8) || (type === 'image/png' && b[0] === 0x89 && asc(1, 3) === 'PNG') || (type === 'image/webp' && asc(0, 4) === 'RIFF' && asc(8, 4) === 'WEBP');
  if (!ok || b.length > 800 * 1024) throw new Error('Imagem inválida ou maior que 800 KB.');
  return b.length;
}
