// Autenticação: senhas com PBKDF2-SHA512 (Web Crypto) e sessões em cookie assinado (HMAC-SHA256).
import { utf8, bytesToB64, b64ToBytes, b64u, unb64u, hmacB64u, ctEqual } from './util.mjs';
const ITER = 100000; // limite prático de iterações do PBKDF2 no ambiente Workers
export const COOKIE = '__Host-pd';
export const SESSION_SECONDS = 8 * 3600;
async function pbkdf2(pw, salt, iter) {
  const key = await crypto.subtle.importKey('raw', utf8(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-512', salt, iterations: iter }, key, 512));
}
export async function hashPw(pw) { const salt = crypto.getRandomValues(new Uint8Array(16)); return `p1$${ITER}$${bytesToB64(salt)}$${bytesToB64(await pbkdf2(pw, salt, ITER))}`; }
export async function checkPw(pw, stored) {
  const [v, it, s, h] = String(stored).split('$');
  if (v !== 'p1' || !it || !s || !h) return false;
  return ctEqual(await pbkdf2(pw, b64ToBytes(s), Number(it)), b64ToBytes(h));
}
let dummy;
export async function fakeCheck(pw) { dummy ??= await hashPw(b64u(crypto.getRandomValues(new Uint8Array(9)))); await checkPw(pw, dummy); }
export async function makeToken(secret, u) {
  const body = b64u(utf8(JSON.stringify({ u: u.id, sv: u.sv, exp: Date.now() + SESSION_SECONDS * 1000 })));
  return `${body}.${await hmacB64u(secret, body)}`;
}
export async function readToken(secret, tok) {
  const [body, sig] = String(tok).split('.');
  if (!body || !sig || !ctEqual(sig, await hmacB64u(secret, body))) return null;
  try { const p = JSON.parse(new TextDecoder().decode(unb64u(body))); return p.exp > Date.now() ? p : null; } catch { return null; }
}
export const setCookie = (tok) => `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
