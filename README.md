# Site Web Rádio Conexão Jamaica

Site React/Vite da Web Rádio Conexão Jamaica, pronto para deploy estático com funções serverless.

## Netlify

Use a pasta `site` como base do projeto.

- Build command: `pnpm install --frozen-lockfile && pnpm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

O arquivo `netlify.toml` já configura essas opções e também:

- usa Node 24 e `pnpm@9.15.4` para evitar a falha de assinatura do Corepack no deploy;
- mantém as rotas do React funcionando ao atualizar a página;
- encaminha `/api/*` para as funções Netlify;
- publica os arquivos de `public/` junto com o build.

Se preencher o comando manualmente no painel do Netlify, use o mesmo comando do `netlify.toml`:

`pnpm install --frozen-lockfile && pnpm run build`

## Upload

Para manter rádio, programação, câmera e chat com leitura real, faça deploy pelo Git ou Netlify CLI usando a pasta `site`, pois as funções em `netlify/functions` precisam ser enviadas junto.

Se enviar apenas a pasta `dist` como upload estático simples, o visual do site continua abrindo, mas as integrações externas entram nos estados seguros.
