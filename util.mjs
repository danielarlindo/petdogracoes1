// Utilitários portáveis (Web Crypto + APIs padrão). Funcionam em Cloudflare Workers, Node 20+, Deno e navegadores.
const enc = new TextEncoder();
export const utf8 = (s) => enc.encode(s);
export function bytesToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }
export function b64ToBytes(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
export const b64u = (u8) => bytesToB64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s) => b64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
export const toHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
export const randomHex = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256Hex(str) { return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(str)))); }
export async function hmacB64u(secret, data) {
  const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8(data))));
}
export function ctEqual(a, b) { // comparação em tempo constante
  const x = typeof a === 'string' ? utf8(a) : a, y = typeof b === 'string' ? utf8(b) : b;
  if (x.length !== y.length) return false;
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
