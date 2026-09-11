# Site Web Rádio Conexão Jamaica

Site React/Vite da Web Rádio Conexão Jamaica, pronto para deploy estático com funções serverless.

## Netlify

Use a pasta `site` como base do projeto.

- Build command: `pnpm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

O arquivo `netlify.toml` já configura essas opções e também:

- usa Node 24 e `pnpm@9.15.4` para evitar a falha de assinatura do Corepack no deploy;
- mantém as rotas do React funcionando ao atualizar a página;
- encaminha `/api/*` para as funções Netlify;
- publica os arquivos de `public/` junto com o build.

Se preencher o comando manualmente no painel do Netlify, use o mesmo comando do `netlify.toml`:

`pnpm run build`

## Anúncios globais

O painel `/ads` salva anúncios, programação, DJs e Central de Audiência em Netlify Blobs. As funções Netlify protegem as rotas administrativas e servem as imagens enviadas. Em `localhost`, ele pode cair em modo local apenas para teste.

No Netlify, confirme:

- os plugins antigos de AMP/feed/imagem estão removidos;
- Netlify Blobs está disponível para o projeto;
- as variáveis de admin foram configuradas no painel do site.

O site não depende de Netlify Database ou de migrações SQL. O conteúdo é mantido em um documento versionado no Blob e as imagens WebP permanecem em armazenamento separado, evitando consumo de tempo ativo de banco.

## Métricas econômicas e audiência

O site não grava exibições de anúncios. Para reduzir chamadas ao Netlify e manter a métrica mais útil, apenas flyers com link registram toques/cliques em `/api/ads/:id/stats`.

A Central de Audiência em `/ads/visitas` controla a apresentação pública de ouvintes e visitas com rascunho, aplicação gradual, base global, regras por horário, perfis de DJ, acionamento manual de DJ ao vivo e agenda automática de entrada/saída. O app Android lê `/api/now-playing`, então herda os números e o status ao vivo publicados pelo site.

## Upload

Para manter rádio, programação, câmera e chat com leitura real, faça deploy pelo Git ou Netlify CLI usando a pasta `site`, pois as funções em `netlify/functions` precisam ser enviadas junto.

Se enviar apenas a pasta `dist` como upload estático simples, o visual do site continua abrindo, mas as integrações externas entram nos estados seguros.
