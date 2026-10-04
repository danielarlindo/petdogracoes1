# PetDog Rações — Cloudflare Pages

Site público (`/`) + painel administrativo (`/admin`) com login real.
Hospedagem: **Cloudflare Pages** · API: **Pages Functions** · Banco: **D1 (SQLite)** · Imagens: **dentro do D1**.
O projeto do Netlify **não é tocado**: este é um projeto independente (use como backup até validar).

## Estrutura (cada camada separada)
| Camada | Onde |
|---|---|
| Frontend (site e tela de login) | `public/` |
| Painel (só é entregue depois do login) | `panel-src/panel.js` → gera `server/panel-ui.mjs` |
| API / regras / segurança (portátil, sem Cloudflare) | `server/core.mjs`, `server/validate.mjs` |
| Autenticação (senhas, sessões) | `server/auth.mjs` |
| Banco de dados e imagens | `server/storage-d1.mjs`, `migrations/0001_init.sql` |
| Adaptador Cloudflare (liga tudo) | `functions/api/[[path]].js` |
| Configuração | `public/_headers`, `public/_routes.json`, `.env.example` |
| Testes | `tests/` |

Para mudar de hospedagem no futuro: reescreva só `functions/api/[[path]].js` (adaptador) e, se trocar o banco, `server/storage-d1.mjs`.

## 1. Instalar
```
npm install
```
## 2. Rodar localmente
1. Copie `.env.example` para `.dev.vars` e preencha com valores SEUS (ex.: `openssl rand -base64 48`). `.dev.vars` é ignorado pelo Git.
2. `npm run db:local` (cria as tabelas no banco local) e depois `npm run dev` → http://localhost:8788
3. Sem Cloudflare/wrangler: `npm test` roda os testes da API.

## 3. Publicar no Cloudflare Pages
1. Crie o banco: `npx wrangler login` e `npx wrangler d1 create petdog`.
2. Aplique as tabelas: `npx wrangler d1 execute petdog --remote --file=migrations/0001_init.sql`
3. Suba esta pasta para um repositório GitHub (privado).
4. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → escolha o repositório.
   - Framework preset: **None** · Build command: **(vazio)** · Build output directory: **`public`** · Root directory: raiz do repositório.
5. No projeto criado: **Settings → Bindings → Add → D1 database** → Variable name **`DB`** → banco `petdog` (Production e Preview).
6. **Settings → Variables and Secrets → Add** (tipo **Secret**): `SESSION_SECRET` (32+ caracteres aleatórios) e `SETUP_TOKEN` (16+ caracteres aleatórios).
7. **Deployments → Retry deployment** (bindings e secrets só valem em deploys novos).
As Functions são detectadas automaticamente pela pasta `functions/`; `public/_routes.json` faz o Cloudflare chamar a Function só em `/api/*`.

## 4. Primeiro administrador e teste do login
1. Abra `https://SEU-PROJETO.pages.dev/admin`. Sem contas aparece **Primeiro acesso**.
2. Informe o `SETUP_TOKEN`, nome, e-mail e senha (10+ caracteres). A senha é gravada só como hash (PBKDF2-SHA512).
3. Depois disso a tela some. Entre pelo login. Teste: sair (logout) e tentar abrir `/api/admin/me` → deve dar 401.
4. Se a tela mostrar uma caixa vermelha, ela diz o que falta (secret, binding `DB` ou migração).

## 5. Trazer os dados do Netlify (sem alterar o Netlify)
No painel: **Backup → Importar de outro site da PetDog** → informe `https://SEU-SITE.netlify.app`. O painel lê só o endereço público (`/api/public` e as imagens) e copia produtos, categorias, galeria, horários e fotos. **Contas e senhas não migram**: crie o proprietário novo no passo 4.

## 6. Backup
- **Painel → Backup → Baixar backup (JSON)**: produtos, categorias, galeria, informações e imagens.
- **Restaurar**: mesma aba. Contas não entram no backup.
- Banco inteiro: `npx wrangler d1 export petdog --remote --output=backup.sql`.
- O D1 também tem recuperação por ponto no tempo (Time Travel); confira o período do seu plano na documentação da Cloudflare.

## 7. Atualizar no futuro
Altere os arquivos, rode `npm test`, faça `git push`: o Cloudflare publica sozinho. Se editar `panel-src/panel.js`, rode `npm run build:panel` antes. Mudanças de tabelas: crie `migrations/0002_*.sql` e aplique com `wrangler d1 execute`.

## Segurança
Sem senhas/tokens no código ou no frontend; segredos só como Secrets. Sessão por cookie HttpOnly/Secure/SameSite=Strict assinado (8 h), invalidada no logout e na troca de senha; permissões revalidadas no servidor a cada requisição; o código do painel só é entregue com sessão válida; bloqueio de 15 min após 5 erros; proteção CSRF; validação de campos e imagens (tipo, assinatura, 800 KB); proprietário x editor.

## Auditoria: dependências do Netlify
| Encontrado | Para que servia | Substituído por |
|---|---|---|
| `netlify/functions/api.mjs` (Functions v2) | API, login, regras | `functions/api/[[path]].js` + `server/core.mjs` |
| `export const config = { path: '/api/*' }` | rota da API | rota por arquivo `[[path]]` |
| `@netlify/blobs` | armazenamento de dados e imagens | D1 (`server/storage-d1.mjs`) |
| `Netlify.env` / variáveis do Netlify | segredos | Secrets do Cloudflare (`env`) |
| `context.ip` | IP para limite de tentativas | cabeçalho `CF-Connecting-IP` |
| `netlify.toml` (publish, functions, redirect `/admin`, headers) | build e cabeçalhos | `public/_headers`, `public/_routes.json`, pasta de saída `public` |
| `scrypt` (`node:crypto`), `Buffer` | hash e bytes | Web Crypto (PBKDF2) e APIs padrão |
| Netlify Identity | **não era usado** | — |
Sobra dependência do Netlify? Nenhuma no código. Só a importação opcional lê o endereço público do site antigo.

## Limites conhecidos
- Não testado na Cloudflare real (sem acesso daqui): testei o núcleo com D1 simulado sobre SQLite e o site/painel num navegador com servidor local que imita o Pages.
- Plano gratuito do D1: 50 consultas por requisição (o máximo observado nos testes foi bem menor), linha de até 2 MB e 100 parâmetros por consulta. Imagens ficam em base64 no D1 (máx. 800 KB cada). Para muitas fotos grandes, migre para R2 mudando só `storage-d1.mjs`.
- PBKDF2 usa 100.000 iterações (limite prático em Workers, valor abaixo do recomendado hoje para PBKDF2); a senha mínima é de 10 caracteres.
- Bairro, cidade e CEP seguem fixos no HTML.
