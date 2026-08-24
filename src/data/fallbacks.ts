import type {
  CameraResponse,
  ChatResponse,
  NowPlayingResponse,
  ScheduleResponse,
} from "../types";

const fetchedAt = () => new Date().toISOString();

export const fallbackNowPlaying = (): NowPlayingResponse => ({
  ok: false,
  source: "fallback",
  track: {
    artist: "Web Rádio Conexão Jamaica",
    title: "Reggae ao vivo",
    raw: "Web Rádio Conexão Jamaica - Reggae ao vivo",
    coverUrl: null,
  },
  stats: {
    listeners: 0,
    peakListeners: 0,
    uniqueListeners: 0,
    streamHits: 0,
    genre: "Reggae",
    bitrate: "128",
    isOnline: true,
    uptimeSeconds: null,
    streamSource: null,
  },
  liveDj: {
    state: "online",
    isLive: false,
    djName: null,
    programName: null,
    matchedSignature: null,
    detectedValue: null,
    source: "fallback",
  },
  history: [
    {
      id: "fallback-1",
      time: "Agora",
      artist: "Web Rádio Conexão Jamaica",
      title: "Programação ao vivo",
      raw: "Web Rádio Conexão Jamaica - Programação ao vivo",
      isCurrent: true,
    },
    {
      id: "fallback-2",
      time: "Horário indisponível",
      artist: "Reggae de raiz",
      title: "Seleção musical",
      raw: "Reggae de raiz - Seleção musical",
    },
  ],
  fetchedAt: fetchedAt(),
  message: "Dados ao vivo indisponíveis no momento.",
});

export const fallbackSchedule = (): ScheduleResponse => ({
  ok: false,
  source: "fallback",
  days: [
    {
      id: "Mon",
      label: "Segunda",
      active: true,
      slots: [
        {
          id: "mon-1",
          time: "00:00 - 04:59",
          program: "Programação musical da madrugada",
          host: "Cleusson da Silva",
        },
        {
          id: "mon-2",
          time: "05:00 - 11:59",
          program: "Programação musical da manhã",
          host: "Cleusson da Silva",
        },
        {
          id: "mon-3",
          time: "12:00 - 23:59",
          program: "Programação musical da tarde e noite",
          host: "Cleusson da Silva",
        },
      ],
    },
    {
      id: "Tue",
      label: "Terça",
      slots: [
        {
          id: "tue-1",
          time: "00:00 - 23:59",
          program: "Programação musical contínua",
          host: "Web Rádio Conexão Jamaica",
        },
      ],
    },
  ],
  fetchedAt: fetchedAt(),
  message: "Grade real indisponível no momento.",
});

export const fallbackCamera = (): CameraResponse => ({
  ok: false,
  source: "fallback",
  playlistUrl: null,
  embedUrl: null,
  fetchedAt: fetchedAt(),
  message: "Câmera indisponível no momento.",
});

export const fallbackChat = (): ChatResponse => ({
  ok: false,
  source: "fallback",
  messages: [
    {
      id: "fallback-chat-1",
      author: "Web Rádio Conexão Jamaica",
      text: "Bate-papo em leitura segura.",
      timestamp: fetchedAt(),
    },
  ],
  fetchedAt: fetchedAt(),
  message: "Mensagens reais indisponíveis no momento.",
});
