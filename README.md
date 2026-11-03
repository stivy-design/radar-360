# RADAR 360

**Informação que move o mundo.**

Portal de notícias em português com identidade editorial responsiva, painel administrativo e base inicial de API para Cloudflare Workers + D1 + R2.

## Estrutura

- `public/` — arquivos estáticos servidos pelo Cloudflare Worker.
- `public/index.html` — portal público.
- `public/noticia.html` — página individual de matéria.
- `public/admin.html` — painel editorial com autenticação via API.
- `public/privacidade.html` e `public/contato.html` — páginas institucionais iniciais.
- `src/index.js` — Worker/API.
- `migrations/0001_initial.sql` — migração D1.
- `wrangler.toml` — configuração inicial do Worker.
- `scripts/hash-password.mjs` — gerador local de hash PBKDF2 para a senha administrativa.

## Funcionalidades preparadas no código

- Listagem pública de matérias publicadas, busca e filtro por categoria.
- Página individual de notícia.
- Login administrativo com sessão assinada HMAC, cookie HttpOnly/Secure/SameSite e verificação de senha PBKDF2.
- Limitação inicial de tentativas de login por IP com D1.
- Cadastro, edição, exclusão, rascunho, revisão e publicação de matérias via API.
- Upload de imagens com validação de tipo e tamanho para R2.
- Espaços reservados para anúncios.

## Atenção: implantação ainda pendente

O código foi enviado ao GitHub, mas **o portal ainda não está implantado nem pronto para uso público**. É necessário criar os recursos na conta Cloudflare do proprietário, substituir o ID de D1 em `wrangler.toml`, configurar bindings e secrets, aplicar a migração e executar testes no ambiente remoto. A conexão ao Cloudflare não está disponível nesta sessão, portanto nenhuma implantação foi realizada.

Siga `DEPLOY-CLOUDFLARE.md` quando for configurar a conta. Não compartilhe senha, token ou chave secreta no chat.

## Segurança e qualidade editorial

- Não há credenciais administrativas no frontend.
- Nunca publicar matéria sem checagem, contexto e atribuição de fontes.
- Use apenas imagens próprias, licenciadas ou autorizadas.
- Não copiar conteúdo de outros veículos.
- Não incentivar cliques em anúncios, tráfego artificial ou impressões inválidas.
- A política de privacidade e o contato precisam ser completados com dados reais antes do lançamento.
- A monetização depende da aprovação e das regras da rede de anúncios escolhida; não existe pagamento garantido por visitante.

## Desenvolvimento

Requer Node.js e Wrangler. Configure D1, R2, bindings e secrets antes de executar `npx wrangler deploy`. Consulte `DEPLOY-CLOUDFLARE.md` para o roteiro.
