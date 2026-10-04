// Simula a API do D1 (prepare/bind/first/all/run) sobre o SQLite do Node, para testar sem a Cloudflare. Conta consultas por requisição.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function createD1(sqlFile) {
  const db = new DatabaseSync(':memory:'); db.exec(readFileSync(sqlFile, 'utf8'));
  const d1 = { queries: 0, prepare(sql) { const st = db.prepare(sql); let args = []; const o = {
    bind(...a) { args = a; return o; },
    async first() { d1.queries++; return st.get(...args) ?? null; },
    async all() { d1.queries++; return { results: st.all(...args) }; },
    async run() { d1.queries++; const r = st.run(...args); return { meta: { changes: Number(r.changes) } }; } }; return o; } };
  return d1;
}
