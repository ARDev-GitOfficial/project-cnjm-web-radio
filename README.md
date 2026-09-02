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

O painel `/ads` só salva para todos os visitantes quando o deploy usa Netlify Functions, Netlify Database e Netlify Blobs. Em `localhost`, ele pode cair em modo local apenas para teste.

No Netlify, confirme:

- os plugins antigos de AMP/feed/imagem estão removidos;
- Netlify Database está ativo no projeto;
- as migrações em `netlify/database/migrations` foram enviadas;
- as variáveis de admin foram configuradas no painel do site.

## Métricas econômicas dos flyers

O site não grava exibições de anúncios nem simula visualizações públicas. Para reduzir chamadas ao Netlify e manter a métrica mais útil, apenas flyers com link registram toques/cliques em `/api/ads/:id/stats`.

O contador público exibido em `/api/now-playing`, dentro de `stats.streamHits`, vem diretamente do provedor de stream.

## Upload

Para manter rádio, programação, câmera e chat com leitura real, faça deploy pelo Git ou Netlify CLI usando a pasta `site`, pois as funções em `netlify/functions` precisam ser enviadas junto.

Se enviar apenas a pasta `dist` como upload estático simples, o visual do site continua abrindo, mas as integrações externas entram nos estados seguros.
