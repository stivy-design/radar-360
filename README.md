# RADAR 360

**Slogan:** Informação que move o mundo.

Portal de notícias em português com identidade editorial premium e responsiva.

## Estado atual

Esta primeira entrega é uma **prévia visual estática**. Ela contém:
- Página inicial responsiva.
- Navegação por categorias e filtros.
- Busca local nos cards demonstrativos.
- Espaços reservados para publicidade.
- Páginas iniciais de Privacidade e Contato.

Os textos e cards de notícias são conteúdo ilustrativo. Não representam notícias publicadas nem fontes jornalísticas reais.

## Arquivos

- `index.html` — página inicial.
- `styles.css` — identidade visual e responsividade.
- `app.js` — busca, filtros e menu mobile.
- `privacidade.html` — texto inicial que precisa de revisão antes do lançamento.
- `contato.html` — página inicial de contato.

## Próximas etapas antes de operar

1. Revisar a prévia visual e aprovar a identidade.
2. Implementar backend com Cloudflare Workers, banco D1 e armazenamento R2.
3. Implementar autenticação administrativa segura no servidor (sem senha fixa no HTML ou JavaScript).
4. Criar cadastro, edição, rascunho, publicação e gerenciamento de imagens.
5. Implementar páginas individuais de notícias, busca real e compartilhamento.
6. Adicionar política editorial, expediente, identificação do responsável e contato real.
7. Configurar consentimento e privacidade conforme as ferramentas efetivamente usadas.
8. Só então integrar uma rede de anúncios, após cumprir os requisitos e obter aprovação.

## Segurança e integridade editorial

- Nunca armazenar credenciais administrativas no frontend.
- Validar e autorizar operações no servidor.
- Usar conteúdo original, checar fatos e atribuir fontes.
- Não copiar matérias de outros veículos.
- Não incentivar cliques em anúncios nem gerar tráfego artificial.

## Prévia

Abra `index.html` em um navegador ou publique temporariamente como prévia para revisar em computador e celular. Esta entrega ainda não deve ser tratada como portal operacional ou pronta para monetização.
