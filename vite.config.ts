import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";

const STATS_URL = "https://s03.svrdedicado.org:7586/stats?sid=1&json=1";
const HISTORY_URL = "https://s03.svrdedicado.org:7586/played?sid=1";
const TIMETABLE_URL = "https://radioconexcaojamaica.com.br/timetable";
const CAMERA_PAGE_URL = "https://player.svrdedicado.org/one-page/7586";
const COVER_URL = "https://player.svrdedicado.org/one-page/7586/cover";
const CHAT_MESSAGES_URL = "https://player.svrdedicado.org/chat/7586/lista?limit=80";

type ResponseLike = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

type StatsPayload = {
  currentlisteners?: number;
  peaklisteners?: number;
  servergenre?: string;
  songtitle?: string;
  streamstatus?: number;
  streamuptime?: number;
  bitrate?: string;
};

const dayOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayNames: Record<string, string> = {
  Sun: "Domingo",
  Mon: "Segunda",
  Tue: "Terça",
  Wed: "Quarta",
  Thu: "Quinta",
  Fri: "Sexta",
  Sat: "Sábado",
};

const SAFE_NOW_PLAYING = "Web Rádio Conexão Jamaica - Programação ao vivo";
const technicalTrackPatterns = [
  new RegExp(["shout", "cast"].join(""), "i"),
  new RegExp(["stream", "history"].join("\\s+"), "i"),
  /server\s+v?\d/i,
  new RegExp(["po", "six"].join(""), "i"),
  new RegExp(["lin", "ux"].join(""), "i"),
  /\bsid\s*=/i,
  /\.m3u8\b/i,
  new RegExp(["play", "list"].join(""), "i"),
  /\bhttps?:/i,
  new RegExp(["whats", "app\\s+audio"].join(""), "i"),
  /\baudio\s+20\d{2}\b/i,
  /conex[aã]o\s+jamaica\s+power\s+\d+(?:\s+mp3)?(?:\.mp3)?/i,
  /programa\s+reggae\s+point\s*2\s*mp3(?:\.mp3)?/i,
  /\b(?:vinheta|jingle|chamada)\b/i,
  /^7586\b/i,
  /^empty\s+title$/i,
  /^(?:unknown|untitled|sem\s+título|sem\s+titulo)$/i,
];

function json(res: ResponseLike, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "CNJMRadioSite/0.1",
      Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "CNJMRadioSite/0.1",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function normalizePublicText(value: string) {
  return decodeHtml(value).normalize("NFKC").replace(/\s+/g, " ").trim();
}

function isTechnicalTrack(...values: string[]) {
  const fields = values.map(normalizePublicText).filter(Boolean);
  const text = fields.join(" ");
  if (!text) return true;

  return fields.some((field) => technicalTrackPatterns.some((pattern) => pattern.test(field))) ||
    technicalTrackPatterns.some((pattern) => pattern.test(text));
}

function isDisplayableHistoryTime(value: string) {
  return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(normalizePublicText(value));
}

function isValidHttpsPlaylist(candidate: string) {
  try {
    const url = new URL(candidate);
    return (
      url.protocol === "https:" &&
      url.hostname.length > 0 &&
      !url.hostname.startsWith(".") &&
      url.pathname.toLowerCase().endsWith(".m3u8")
    );
  } catch {
    return false;
  }
}

function isSafeCoverUrl(candidate: string) {
  try {
    const url = new URL(normalizePublicText(candidate));
    return (
      url.protocol === "https:" &&
      url.hostname.length > 0 &&
      !url.hostname.startsWith(".") &&
      /\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

async function fetchCoverUrl() {
  try {
    const response = await fetch(COVER_URL, {
      headers: {
        "User-Agent": "CNJMRadioSite/0.1",
        Accept: "image/avif,image/webp,image/png,image/jpeg,text/plain,*/*;q=0.8",
      },
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.startsWith("image/") && isSafeCoverUrl(response.url)) {
      return response.url;
    }

    const candidate = normalizePublicText(await response.text());
    return isSafeCoverUrl(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function parseTrack(rawValue: string) {
  const raw = decodeHtml(rawValue || "Web Rádio Conexão Jamaica - Reggae ao vivo");
  const parts = raw.split(/\s(?:-|–|—|\||\/)\s/).map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    return {
      artist: parts[0],
      title: parts.slice(1).join(" - "),
      raw,
    };
  }

  return {
    artist: "Web Rádio Conexão Jamaica",
    title: raw,
    raw,
  };
}

function parseSafeTrack(rawValue: string) {
  return isTechnicalTrack(rawValue) ? parseTrack(SAFE_NOW_PLAYING) : parseTrack(rawValue);
}

function safeHistoryFallback() {
  const track = parseTrack(SAFE_NOW_PLAYING);

  return [
    {
      id: "history-safe-programming",
      time: "agora",
      title: track.title,
      artist: track.artist,
      raw: track.raw,
      isCurrent: true,
    },
  ];
}

function parseCells(rowHtml: string) {
  return [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) =>
    stripTags(match[1]),
  );
}

function parseHistory(html: string) {
  const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)];

  return rows
    .map((match, index) => {
      const cells = parseCells(match[0]);
      if (cells.length < 2 || /played|song title/i.test(cells.join(" "))) return null;
      if (!isDisplayableHistoryTime(cells[0])) return null;

      const track = parseTrack(cells[1]);
      if (isTechnicalTrack(cells[0], track.raw, track.title, track.artist)) return null;

      return {
        id: `history-${index}-${track.raw}`,
        time: cells[0],
        title: track.title,
        artist: track.artist,
        raw: track.raw,
        isCurrent: /current song/i.test(match[0]),
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

function parseSchedule(html: string) {
  const buttons = [...html.matchAll(/<button([^>]*)data-bs-target=["']#nav-([^"']+)["'][^>]*>([\s\S]*?)<\/button>/gi)]
    .map((match) => ({
      id: match[2].replace(/^nav-/, ""),
      label: stripTags(match[3]),
      active: /active/.test(match[1]),
    }))
    .filter((button) => button.id && button.label);

  const days = buttons.map((button) => {
    const paneStart = html.search(new RegExp(`<div[^>]*id=["']nav-${button.id}["']`, "i"));
    const rest = paneStart >= 0 ? html.slice(paneStart + 1) : "";
    const nextPaneOffset = rest.search(/<div[^>]*class=["'][^"']*tab-pane/gi);
    const pane =
      paneStart >= 0
        ? html.slice(paneStart, nextPaneOffset >= 0 ? paneStart + 1 + nextPaneOffset : undefined)
        : "";
    const rows = [...pane.matchAll(/<tr([^>]*)>[\s\S]*?<\/tr>/gi)];
    const slots = rows
      .map((row, index) => {
        const cells = parseCells(row[0]);
        if (
          cells.length < 3 ||
          /^horário$/i.test(cells[0]) ||
          /^programa$/i.test(cells[1]) ||
          /^apresentador$/i.test(cells[2])
        ) {
          return null;
        }

        const isNow = /active|success|agora/i.test(row[1] + row[0] + cells[0]);

        return {
          id: `${button.id}-${index}`,
          time: cells[0].replace(/^Agora mesmo\s*/i, ""),
          program: cells[1],
          host: cells[2],
          isNow,
        };
      })
      .filter(Boolean);

    return {
      id: button.id,
      label: dayNames[button.id] ?? button.label,
      active: button.active,
      slots,
    };
  });

  return days.sort((a, b) => dayOrder.indexOf(a.id) - dayOrder.indexOf(b.id));
}

async function resolveCamera() {
  const stationHtml = await fetchText(CAMERA_PAGE_URL);
  const iframe = stationHtml.match(/<iframe[^>]*id=["']iframe_camera["'][^>]*>/i)?.[0];
  const iframeSrc = iframe?.match(/\ssrc=["']([^"']+)["']/i)?.[1];
  if (!iframeSrc) {
    throw new Error("Iframe da câmera não encontrado.");
  }

  const embedUrl = new URL(iframeSrc, CAMERA_PAGE_URL).href;
  const embedHtml = await fetchText(embedUrl);
  const playlist =
    embedHtml.match(/\bsource\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i)?.[1] ??
    embedHtml.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i)?.[0];

  if (!playlist) {
    throw new Error("Playlist HLS não encontrada.");
  }

  const playlistUrl = new URL(playlist.replaceAll("\\/", "/"), embedUrl).href.replace(/^http:/, "https:");
  if (!isValidHttpsPlaylist(playlistUrl)) {
    throw new Error("Playlist HLS inválida.");
  }

  return {
    embedUrl,
    playlistUrl,
  };
}

function parseChatMessages(html: string) {
  return [...html.matchAll(/<li[^>]*data-id=["']?([^"'\s>]+)["']?[\s\S]*?<\/li>/gi)]
    .map((match) => {
      const block = match[0];
      const author = stripTags(block.match(/<strong>([\s\S]*?)<\/strong>/i)?.[1] ?? "Ouvinte");
      const text = stripTags(block.match(/<span[^>]*class=["'][^"']*message[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "");
      const dateTime = block.match(/(\d{2}\/\d{2}\/\d{4})[\s\S]*?(\d{2}:\d{2}:\d{2})/);
      const timestamp = dateTime
        ? new Date(`${dateTime[1].split("/").reverse().join("-")}T${dateTime[2]}-04:00`).toISOString()
        : new Date().toISOString();

      return {
        id: `chat-${match[1]}`,
        author,
        text,
        timestamp,
      };
    })
    .filter((message) => message.text)
    .reverse();
}

async function handleNowPlaying(res: ResponseLike) {
  try {
    const [stats, historyHtml, coverUrl] = await Promise.all([
      fetchJson<StatsPayload>(STATS_URL),
      fetchText(HISTORY_URL),
      fetchCoverUrl(),
    ]);
    const track = {
      ...parseSafeTrack(stats.songtitle ?? ""),
      coverUrl,
    };
    const history = parseHistory(historyHtml);

    json(res, 200, {
      ok: true,
      source: "live",
      track,
      stats: {
        listeners: Number(stats.currentlisteners ?? 0),
        peakListeners: Number(stats.peaklisteners ?? 0),
        genre: stats.servergenre ?? "Reggae",
        bitrate: stats.bitrate ?? "128",
        isOnline: Number(stats.streamstatus ?? 0) === 1,
        uptimeSeconds: Number(stats.streamuptime ?? 0) || null,
      },
      history: history.length > 0 ? history : safeHistoryFallback(),
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    json(res, 200, {
      ok: false,
      source: "fallback",
      track: {
        ...parseTrack(SAFE_NOW_PLAYING),
        coverUrl: null,
      },
      stats: {
        listeners: 0,
        peakListeners: 0,
        genre: "Reggae",
        bitrate: "128",
        isOnline: true,
        uptimeSeconds: null,
      },
      history: safeHistoryFallback(),
      fetchedAt: new Date().toISOString(),
      message: "Dados ao vivo indisponíveis no momento.",
    });
  }
}

async function handleSchedule(res: ResponseLike) {
  try {
    const html = await fetchText(TIMETABLE_URL);
    const days = parseSchedule(html).filter((day) => day.slots.length > 0);
    if (days.length === 0) throw new Error("Grade vazia.");

    json(res, 200, {
      ok: true,
      source: "live",
      days,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    json(res, 200, {
      ok: false,
      source: "fallback",
      days: [],
      fetchedAt: new Date().toISOString(),
      message: "Grade real indisponível no momento.",
    });
  }
}

async function handleCamera(res: ResponseLike) {
  try {
    const camera = await resolveCamera();
    json(res, 200, {
      ok: true,
      source: "live",
      playlistUrl: camera.playlistUrl,
      embedUrl: camera.embedUrl,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    json(res, 200, {
      ok: false,
      source: "fallback",
      playlistUrl: null,
      embedUrl: null,
      fetchedAt: new Date().toISOString(),
      message: "Câmera indisponível no momento.",
    });
  }
}

async function handleChatMessages(res: ResponseLike) {
  try {
    const html = await fetchText(CHAT_MESSAGES_URL);
    json(res, 200, {
      ok: true,
      source: "live",
      messages: parseChatMessages(html),
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    json(res, 200, {
      ok: false,
      source: "fallback",
      messages: [],
      fetchedAt: new Date().toISOString(),
      message: "Mensagens reais indisponíveis no momento.",
    });
  }
}

function installApi(server: ViteDevServer | PreviewServer) {
  server.middlewares.use((req, res, next) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (!pathname.startsWith("/api/")) {
      next();
      return;
    }

    if (pathname === "/api/now-playing") {
      void handleNowPlaying(res);
      return;
    }
    if (pathname === "/api/schedule") {
      void handleSchedule(res);
      return;
    }
    if (pathname === "/api/camera") {
      void handleCamera(res);
      return;
    }
    if (pathname === "/api/chat/messages") {
      void handleChatMessages(res);
      return;
    }

    json(res, 404, { ok: false, message: "Endpoint não encontrado." });
  });
}

function cnjmApiPlugin(): Plugin {
  return {
    name: "cnjm-local-api",
    configureServer: installApi,
    configurePreviewServer: installApi,
  };
}

export default defineConfig({
  plugins: [cnjmApiPlugin(), react()],
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
