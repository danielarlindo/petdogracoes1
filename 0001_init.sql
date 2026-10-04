-- Banco D1 (SQLite). Rode:  npx wrangler d1 execute petdog --remote --file=migrations/0001_init.sql
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('owner','editor')),
  hash       TEXT NOT NULL,              -- PBKDF2-SHA512 com salt; nunca a senha
  sv         INTEGER NOT NULL DEFAULT 1, -- versão da sessão (logout/troca de senha invalidam)
  created_at TEXT NOT NULL
);
-- documentos JSON: catalog (produtos), settings (loja/horários), gallery, categories
CREATE TABLE IF NOT EXISTS docs (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- imagens enviadas pelo painel (base64; limite de 800 KB por imagem na API)
CREATE TABLE IF NOT EXISTS images (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL CHECK (type IN ('image/jpeg','image/png','image/webp')),
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- limite de tentativas de login
CREATE TABLE IF NOT EXISTS rate_limits (
  key   TEXT PRIMARY KEY,
  n     INTEGER NOT NULL,
  first INTEGER NOT NULL,
  until INTEGER NOT NULL DEFAULT 0
);
