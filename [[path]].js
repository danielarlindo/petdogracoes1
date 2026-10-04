// Adaptador fino do Cloudflare Pages Functions: liga o núcleo (server/core.mjs) ao banco D1 (binding "DB") e aos secrets.
import { handle } from '../../server/core.mjs';
import { createStore } from '../../server/storage-d1.mjs';

export async function onRequest({ request, env }) {
  if (!env.DB) { // binding D1 não configurado: devolve diagnóstico claro em vez de falhar em silêncio
    const status = new URL(request.url).pathname.endsWith('/status');
    return new Response(JSON.stringify(status ? { setupOpen: false, storage: 'erro' } : { error: 'Banco D1 não conectado (binding DB).' }), { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return handle(request, { store: createStore(env.DB), env, ip: request.headers.get('CF-Connecting-IP') || 'unknown' });
}
