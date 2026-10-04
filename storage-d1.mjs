// Camada de armazenamento (Cloudflare D1 / SQLite). Para trocar de banco no futuro, reimplemente só este arquivo.
export function createStore(db) {
  const first = (sql, ...p) => db.prepare(sql).bind(...p).first();
  const all = async (sql, ...p) => (await db.prepare(sql).bind(...p).all()).results || [];
  const run = (sql, ...p) => db.prepare(sql).bind(...p).run();
  const USER = 'SELECT id, email, name, role, hash, sv, created_at AS createdAt FROM users';
  const chunks = (a, n = 90) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  return {
    async getDoc(k) { const r = await first('SELECT value FROM docs WHERE key = ?', k); return r ? JSON.parse(r.value) : null; },
    setDoc: (k, v) => run('INSERT INTO docs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, JSON.stringify(v)),
    countUsers: async () => (await first('SELECT COUNT(*) AS n FROM users')).n,
    listUsers: () => all(USER + ' ORDER BY created_at'),
    getUser: (id) => first(USER + ' WHERE id = ?', id),
    getUserByEmail: (email) => first(USER + ' WHERE email = ?', email),
    // cria o primeiro usuário de forma atômica: só insere se a tabela estiver vazia
    async insertFirstUser(u) { const r = await run('INSERT INTO users (id, email, name, role, hash, sv, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)', u.id, u.email, u.name, u.role, u.hash, u.sv, u.createdAt); return r.meta.changes === 1; },
    insertUser: (u) => run('INSERT INTO users (id, email, name, role, hash, sv, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', u.id, u.email, u.name, u.role, u.hash, u.sv, u.createdAt),
    updateUser: (u) => run('UPDATE users SET name = ?, role = ?, hash = ?, sv = ? WHERE id = ?', u.name, u.role, u.hash, u.sv, u.id),
    deleteUser: (id) => run('DELETE FROM users WHERE id = ?', id),
    getRL: (k) => first('SELECT n, first, until FROM rate_limits WHERE key = ?', k),
    setRL: (k, r) => run('INSERT INTO rate_limits (key, n, first, until) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET n = excluded.n, first = excluded.first, until = excluded.until', k, r.n, r.first, r.until || 0),
    delRL: (k) => run('DELETE FROM rate_limits WHERE key = ?', k),
    putImage: (id, type, b64) => run('INSERT INTO images (id, type, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET type = excluded.type, data = excluded.data', id, type, b64, new Date().toISOString()),
    getImage: (id) => first('SELECT type, data FROM images WHERE id = ?', id),
    async getImages(ids) { const out = []; for (const c of chunks(ids)) out.push(...(await all(`SELECT id, type, data FROM images WHERE id IN (${c.map(() => '?').join(',')})`, ...c))); return out; },
    async deleteImages(ids) { for (const c of chunks(ids)) await run(`DELETE FROM images WHERE id IN (${c.map(() => '?').join(',')})`, ...c); },
  };
}
