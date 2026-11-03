# Implantação RADAR 360 — Cloudflare

Este repositório contém o portal estático e a base inicial de uma API Worker. A implantação ainda depende da criação dos recursos na conta Cloudflare do proprietário e da configuração de segredos. Nenhuma credencial deve ser enviada pelo chat ou commitada no Git.

## Recursos necessários

1. Worker chamado `radar-360`.
2. Banco D1 chamado `radar-360-db`; copie o ID real para `wrangler.toml`.
3. Bucket R2 chamado `radar-360-images`.
4. Bindings do Worker: `DB` (D1), `IMAGES` (R2) e `ASSETS` (arquivos estáticos).
5. Segredos: `ADMIN_PASSWORD_SALT`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`.

## Preparar senha administrativa

Use Node.js localmente para gerar salt e hash de uma senha forte (mínimo 14 caracteres):

```bash
node scripts/hash-password.mjs 'SUA-SENHA-FORTE-AQUI'
```

Copie os dois valores impressos para os secrets do Worker. Gere um segredo aleatório separado para `SESSION_SECRET`; nunca reutilize a senha administrativa.

```bash
npx wrangler secret put ADMIN_PASSWORD_SALT
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put SESSION_SECRET
```

## Banco de dados

Após substituir o ID em `wrangler.toml`, aplique a migração:

```bash
npx wrangler d1 migrations apply radar-360-db --remote
```

## Publicação

Revise primeiro o projeto e os recursos na conta Cloudflare. Para implantar:

```bash
npx wrangler deploy
```

Não execute o deploy antes de criar D1 e R2, configurar os bindings e inserir os secrets.

## Rotas API iniciais

- `GET /api/health`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/session`
- `GET /api/news`
- `GET /api/news/:slug`
- `GET /api/admin/news`
- `POST /api/admin/news`
- `PUT /api/admin/news/:id`
- `DELETE /api/admin/news/:id`
- `POST /api/admin/upload`

## Limitações desta etapa

O painel HTML atual ainda é uma prévia e precisa ser conectado às rotas acima. O upload devolve uma chave R2; antes de mostrar imagens publicamente, implemente uma rota de entrega de imagens ou um domínio público controlado para o bucket. Adicione CAPTCHA ou proteção adicional contra abuso, política de retenção de logs, verificação de conteúdo e revisão de segurança antes de produção.

A API limita tentativas de login por IP com D1, mas isso não substitui proteção de borda/WAF e rate limiting configurado no Cloudflare. Não use conteúdo demonstrativo como notícia real.
