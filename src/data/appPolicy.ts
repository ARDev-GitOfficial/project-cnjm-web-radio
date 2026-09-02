export type AppPolicySection = {
  title: string;
  body: string;
  bullets: string[];
};

export const appPrivacyPolicy = {
  version: "2026.08.16",
  updatedAt: "2026-08-16",
  title: "Politica de Privacidade e Termos do Aplicativo",
  subtitle: "Web Radio Conexao Jamaica para Android",
  pageUrl: "https://webradioconexaojamaica.com/privacidade-app",
  contactLabel: "WhatsApp oficial",
  contactValue: "+55 92 98422-7531",
  sections: [
    {
      title: "1. Quem somos e a quem esta politica se aplica",
      body:
        "Esta politica explica como o aplicativo Web Radio Conexao Jamaica para Android trata informacoes ao oferecer radio online, programacao, anuncios, bate-papo, pedidos musicais, camera do estudio, notificacao de audio e visualizadores. Ela tambem serve como termos de uso basicos do app.",
      bullets: [
        "Responsavel pelo app e pela experiencia da radio: Web Radio Conexao Jamaica.",
        "Site oficial: https://webradioconexaojamaica.com/.",
        "Contato para privacidade, moderacao, remocao de conteudo e duvidas: WhatsApp +55 92 98422-7531.",
        "O app e destinado ao publico 13+. Ele nao e direcionado a criancas menores de 13 anos.",
      ],
    },
    {
      title: "2. Dados tecnicos recebidos automaticamente",
      body:
        "Para tocar a radio e carregar informacoes atualizadas, o app se comunica com servidores da radio, do site e de provedores tecnicos. Como em qualquer conexao pela internet, esses provedores podem receber dados tecnicos necessarios para entregar o servico.",
      bullets: [
        "Podem existir registros tecnicos como endereco IP, data e hora, URL acessada, status da requisicao, modelo aproximado de navegador/app, user-agent e informacoes de erro.",
        "Esses dados sao usados para entregar o stream, proteger a infraestrutura, diagnosticar falhas, medir disponibilidade e impedir abuso.",
        "O app nao cria conta obrigatoria para ouvir a radio.",
        "O app nao vende dados pessoais dos ouvintes.",
      ],
    },
    {
      title: "3. Radio, nome da musica, artista, album e capa",
      body:
        "A tela inicial e a notificacao do player mostram metadados da transmissao ao vivo, incluindo musica, artista, album e capa quando disponiveis.",
      bullets: [
        "O app consulta o site oficial para buscar o que esta tocando agora.",
        "Quando necessario, o app ou o site podem consultar catalogos publicos de musica usando titulo e artista da faixa para melhorar nome, album e capa.",
        "Essas consultas usam dados da musica, nao dados pessoais do usuario.",
        "A capa exibida na notificacao pode vir do site da radio ou de um catalogo publico de musica.",
      ],
    },
    {
      title: "4. Microfone e visualizadores de audio",
      body:
        "O app pode solicitar a permissao de microfone para animar visualizadores de audio conforme o som que esta tocando no proprio aparelho.",
      bullets: [
        "O microfone e usado somente para gerar efeitos visuais reativos no dispositivo.",
        "O audio captado para o visualizador nao e gravado pelo app, nao e salvo e nao e enviado para servidores da radio.",
        "Se a permissao for recusada, a radio continua funcionando; apenas efeitos reativos podem ficar indisponiveis ou reduzidos.",
        "A permissao pode ser removida a qualquer momento nas configuracoes do Android.",
      ],
    },
    {
      title: "5. Bate-papo ao vivo",
      body:
        "Ao usar o bate-papo, o nome escolhido e as mensagens enviadas sao transmitidos para o servidor do chat e podem aparecer para outros ouvintes.",
      bullets: [
        "Nao envie documentos, senhas, dados bancarios, dados de saude, endereco completo ou qualquer dado sensivel no chat.",
        "Mensagens podem ser carregadas novamente para manter o historico recente e a lista de participantes online.",
        "O app pode guardar localmente a sessao do chat, bloqueios e preferencias de moderacao para melhorar a experiencia neste aparelho.",
        "Conteudo ofensivo, discriminatorio, ilegal, ameacas, assedio, spam, divulgacao de dados de terceiros e abuso de menores sao proibidos.",
        "A radio pode moderar, remover ou bloquear conteudos e usuarios quando necessario para seguranca da comunidade.",
      ],
    },
    {
      title: "6. Pedidos musicais e contato",
      body:
        "Quando o usuario envia um pedido musical pelo formulario do app, os dados informados sao transmitidos ao servico de pedidos da radio para que a equipe possa receber e organizar a solicitacao.",
      bullets: [
        "O formulario pode pedir nome, e-mail, artista e musica solicitada.",
        "Esses dados sao usados para processar o pedido, responder quando necessario e evitar abuso do formulario.",
        "Ao usar botoes de WhatsApp, Instagram, site ou links externos, o usuario passa a usar servicos de terceiros com suas proprias politicas.",
        "Pedidos enviados por canais externos podem ser tratados conforme as regras e registros desses servicos externos.",
      ],
    },
    {
      title: "7. Camera do estudio",
      body:
        "A tela de camera apenas carrega a transmissao ou embed publico disponibilizado pelo provedor da radio quando esse recurso esta no ar.",
      bullets: [
        "O app nao usa a camera do aparelho do usuario para essa funcao.",
        "O app nao grava imagem, video ou audio do usuario ao abrir a camera do estudio.",
        "A disponibilidade da camera pode mudar conforme o provedor e a programacao da radio.",
        "O provedor da transmissao pode receber dados tecnicos normais de acesso ao video, como IP, horario e user-agent.",
      ],
    },
    {
      title: "8. Publicidade, banners e patrocinadores",
      body:
        "O app pode exibir banners publicitarios e chamadas de parceiros na tela inicial. Esses anuncios sao carregados pela internet a partir do site oficial ou de fontes controladas pela radio.",
      bullets: [
        "Os anuncios aparecem identificados como publicidade.",
        "O app pode carregar imagem, identificador do anuncio, destino do link e informacoes basicas da campanha.",
        "Ao tocar em um anuncio com link, o usuario pode ser redirecionado para site, WhatsApp, rede social ou pagina externa do anunciante.",
        "O app nao deve exibir publicidade enganosa, conteudo sexual explicito, conteudo ilegal, discurso de odio, golpe, malware ou anuncios inadequados ao publico 13+.",
        "Na versao atual, a publicidade do app e formada por banners diretos da radio/parceiros; nao ha perfil de publicidade personalizada criado dentro do app.",
        "Se no futuro for adicionado SDK de anuncios, analytics ou personalizacao, esta politica e a declaracao da Play Store devem ser atualizadas antes da publicacao.",
      ],
    },
    {
      title: "9. Estatisticas de anuncios",
      body:
        "Para controle interno, o app pode registrar quando um banner com link foi tocado.",
      bullets: [
        "As estatisticas podem incluir identificador do anuncio, tipo de evento, data/hora tecnica e contador de clique.",
        "Essas estatisticas sao usadas para medir interesse em campanhas e prestar contas a parceiros.",
        "O app nao precisa identificar nominalmente o ouvinte para registrar clique em banner.",
        "Sites externos abertos apos o clique podem coletar seus proprios dados conforme suas politicas.",
      ],
    },
    {
      title: "10. Preferencias locais e funcionamento do app",
      body:
        "O app pode salvar configuracoes no proprio aparelho para melhorar uso e desempenho.",
      bullets: [
        "Podem ser salvas preferencias como inicio automatico da radio, ajustes de visual, estado de permissao respondida, equalizador, sessao do chat, usuarios bloqueados e configuracoes de moderacao local.",
        "Essas informacoes ficam no aparelho e podem ser apagadas ao limpar dados do app ou desinstalar.",
        "O backup automatico do app fica desativado para reduzir copia indevida de dados locais.",
        "Aumentos de fonte e acessibilidade do Android sao respeitados nas telas comuns; a marca visual da tela inicial usa tamanho fixo para preservar identidade grafica.",
      ],
    },
    {
      title: "11. Permissoes do Android",
      body:
        "O app solicita apenas permissoes ligadas as funcoes oferecidas.",
      bullets: [
        "Internet: necessaria para tocar a radio, carregar site, programacao, chat, pedidos, anuncios, camera e politicas.",
        "Microfone: usado somente para visualizador de audio reativo, quando autorizado pelo usuario.",
        "Servico em primeiro plano e reproducao de midia: usados para manter a radio tocando e exibir notificacao/controle de audio.",
        "Modificar configuracoes de audio: usado para recursos de audio/equalizador quando suportado pelo aparelho.",
      ],
    },
    {
      title: "12. Compartilhamento e provedores",
      body:
        "Para funcionar, o app depende de provedores tecnicos de streaming, hospedagem, banco de dados, chat, pedidos, camera, catalogos de musica e links externos.",
      bullets: [
        "Dados sao compartilhados somente quando necessario para entregar a funcao solicitada, operar a infraestrutura, moderar conteudo, medir publicidade direta ou cumprir obrigacoes legais.",
        "Provedores externos podem tratar logs tecnicos conforme suas proprias politicas.",
        "O app nao autoriza parceiros a usar dados do ouvinte para golpes, spam ou venda de informacoes pessoais.",
        "Links para WhatsApp, Instagram, sites de anunciantes e outros servicos externos ficam sujeitos aos termos desses servicos.",
      ],
    },
    {
      title: "13. Seguranca e retencao",
      body:
        "A radio adota medidas razoaveis para reduzir risco de acesso indevido, perda ou abuso de dados.",
      bullets: [
        "Sempre que possivel, o trafego e feito por HTTPS.",
        "Dados podem ser mantidos pelo tempo necessario para operar o servico, resolver problemas, moderar abuso, cumprir obrigacoes legais ou administrar campanhas.",
        "Mensagens de chat, pedidos, logs tecnicos e estatisticas podem ter prazos diferentes conforme o provedor usado.",
        "Nenhum sistema e totalmente livre de risco; por isso o usuario deve evitar enviar dados sensiveis por chat ou pedidos musicais.",
      ],
    },
    {
      title: "14. Direitos, remocao e contato",
      body:
        "O usuario pode pedir informacoes, correcao ou remocao de dados relacionados ao app quando isso for tecnicamente possivel e legalmente aplicavel.",
      bullets: [
        "Para pedidos de privacidade, moderacao, remocao de mensagem, duvidas sobre anuncios ou solicitacao de exclusao, fale pelo WhatsApp oficial +55 92 98422-7531.",
        "Para localizar um conteudo, informe nome usado, data aproximada, tela/funcao e descricao do pedido.",
        "Alguns registros tecnicos podem permanecer por periodo necessario para seguranca, auditoria, cumprimento legal ou funcionamento do provedor.",
        "Se o pedido envolver um servico externo, tambem pode ser necessario contatar esse servico diretamente.",
      ],
    },
    {
      title: "15. Alteracoes nesta politica",
      body:
        "Esta politica pode ser atualizada quando o app, o site, os anuncios, provedores ou exigencias legais mudarem.",
      bullets: [
        "A versao e data de atualizacao ficam indicadas no topo da politica.",
        "Mudancas relevantes devem ser refletidas no app, no site e na declaracao de seguranca de dados da loja.",
        "Continuar usando o app apos uma atualizacao significa ciencia das regras atualizadas, quando aplicavel.",
      ],
    },
    {
      title: "16. Termos de uso essenciais",
      body:
        "Ao usar o app, o usuario concorda em usar as funcoes de forma legal, respeitosa e compatível com a comunidade da radio.",
      bullets: [
        "E proibido tentar invadir, sobrecarregar, copiar indevidamente, burlar moderacao ou prejudicar a infraestrutura do app/site.",
        "E proibido publicar conteudo ilegal, ofensivo, discriminatorio, enganoso, pornografico, violento, de odio, assedio, ameaca, spam ou dados pessoais de terceiros.",
        "A radio pode alterar programacao, camera, chat, anuncios, links e recursos sem aviso previo por motivos tecnicos, editoriais, comerciais ou de seguranca.",
        "A transmissao e os conteudos podem depender de provedores externos e podem ficar indisponiveis temporariamente.",
      ],
    },
  ],
} as const;

export function appPrivacyPolicyPlainText() {
  return [
    appPrivacyPolicy.title,
    appPrivacyPolicy.subtitle,
    `Versao: ${appPrivacyPolicy.version}`,
    `Atualizado em: ${appPrivacyPolicy.updatedAt}`,
    `URL publica: ${appPrivacyPolicy.pageUrl}`,
    `Contato: ${appPrivacyPolicy.contactValue}`,
    "",
    ...appPrivacyPolicy.sections.flatMap((section) => [
      section.title,
      section.body,
      ...section.bullets.map((bullet) => `- ${bullet}`),
      "",
    ]),
  ].join("\n");
}
