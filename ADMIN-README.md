# Painel editorial — RADAR 360

Acesse `admin.html` para visualizar a proposta do painel.

**Importante:** este é somente um protótipo de interface. O formulário adiciona uma linha temporária à tabela no navegador, sem persistência. Não há autenticação, API, banco de dados ou publicação real. Não insira senhas ou informações confidenciais.

## Backend necessário antes do uso real

- Cloudflare Workers para API e validação de sessão.
- D1 para matérias, categorias, usuários, permissões e histórico.
- R2 para imagens e arquivos.
- Autenticação segura no servidor, senhas com hash forte, cookies de sessão seguros, proteção CSRF e limitação de tentativas.
- Validação de conteúdo e upload, permissões por função e trilha de auditoria.
- Fluxo editorial: rascunho, revisão, agendamento e publicação.
- Nunca colocar credenciais, tokens ou segredos no HTML ou JavaScript do navegador.
