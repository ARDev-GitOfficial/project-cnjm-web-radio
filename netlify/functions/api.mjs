import { connectLambda } from "@netlify/blobs";
import {
  adminSessionPayload,
  applyLiveStatusSimulation,
  advanceDjDetectionObservation,
  controlDjLiveSession,
  deleteAd,
  deleteDj,
  deleteProgram,
  getAdSettings,
  getCurrentLiveDjStatus,
  getDjDetectionSnapshot,
  getLiveStatusTest,
  importSiteImage,
  isAdminRequest,
  isValidAdminLogin,
  listAdminAds,
  listAdminDjs,
  listAdminPrograms,
  listPublicAds,
  listPublicPrograms,
  migrateStoredMediaToWebp,
  readAdImage,
  saveAd,
  saveAdImage,
  saveAdSettings,
  saveDj,
  saveDjLogo,
  saveLiveStatusTest,
  saveProgram,
  saveProgramLogo,
  setDjSkippedToday,
  updateAdStats,
} from "../lib/ads-store.mjs";

const STATISTICS_URL = "https://s03.svrdedicado.org:7586/statistics?json=1";
const HISTORY_URL = "https://s03.svrdedicado.org:7586/played?sid=1";
const CAMERA_PAGE_URL = "https://player.svrdedicado.org/one-page/7586";
const CHAT_MESSAGES_URL = "https://player.svrdedicado.org/chat/7586/lista?limit=80";
const STREAM_METADATA_URL = String(process.env.CNJM_STREAM_METADATA_URL || "").trim();

const SAFE_NOW_PLAYING = "Web Rádio Conexão Jamaica - Programação ao vivo";

function connectNetlifyBlobs(event) {
  if (!event?.blobs) return;

  try {
    connectLambda(event);
  } catch {
    // Manual NETLIFY_BLOBS_SITE_ID/NETLIFY_BLOBS_TOKEN config remains available.
  }
}

const dayOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayNames = {
  Sun: "Domingo",
  Mon: "Segunda",
  Tue: "Terça",
  Wed: "Quarta",
  Thu: "Quinta",
  Fri: "Sexta",
  Sat: "Sábado",
};

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
  /\bsinal\s+de\s+hora\b/i,
  /\bhora\s+certa\b/i,
  /conex[aã]o\s+jamaica\s+power\s+\d+(?:\s+mp3)?(?:\.mp3)?/i,
  /programa\s+reggae\s+point\s*2\s*mp3(?:\.mp3)?/i,
  /\b(?:vinheta|jingle|chamada|comercial|publicidade|patroc[ií]nio|patrocinador)\b/i,
  /^7586\b/i,
  /^empty\s+title$/i,
  /^(?:unknown|untitled|sem\s+título|sem\s+titulo)$/i,
];

const technicalTrackPhrases = [
  "a verdadeira musica da jamaica",
  "conexao jamaica power",
  "jamaica vem ate vc",
  "jamaica vem ate voce",
  "no clima da jamica",
  "no clima da jamaica",
  "pdras rolam aqui",
  "pedras rolam aqui",
  "programa reggae point",
  "sinta se na jamaica",
  "uma viagem",
  "whatsapp audio",
  "hora certa voz masculina",
];

const baseHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization",
};

function publicCacheHeaders({ browserMaxAge = 60, cdnMaxAge = 300, staleWhileRevalidate = 900 } = {}) {
  return {
    "cache-control": `public, max-age=${browserMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
    "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${cdnMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
  };
}

const publicAdsCacheHeaders = publicCacheHeaders({
  browserMaxAge: 600,
  cdnMaxAge: 1800,
  staleWhileRevalidate: 3600,
});
const publicProgramsCacheHeaders = publicCacheHeaders({
  browserMaxAge: 900,
  cdnMaxAge: 3600,
  staleWhileRevalidate: 7200,
});
const nowPlayingCacheHeaders = publicCacheHeaders({
  browserMaxAge: 120,
  cdnMaxAge: 120,
  staleWhileRevalidate: 600,
});
const liveDjNowPlayingCacheHeaders = publicCacheHeaders({
  browserMaxAge: 15,
  cdnMaxAge: 30,
  staleWhileRevalidate: 0,
});
const recentTracksCacheHeaders = publicCacheHeaders({
  browserMaxAge: 600,
  cdnMaxAge: 900,
  staleWhileRevalidate: 3600,
});
const cameraCacheHeaders = publicCacheHeaders({
  browserMaxAge: 3600,
  cdnMaxAge: 14400,
  staleWhileRevalidate: 86400,
});
const chatCacheHeaders = publicCacheHeaders({
  browserMaxAge: 180,
  cdnMaxAge: 600,
  staleWhileRevalidate: 1800,
});
const publicImageCacheHeaders = {
  "cache-control": "public, max-age=31536000, immutable",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=31536000",
};

function json(statusCode, payload, headers = {}) {
  return {
    statusCode,
    headers: {
      ...baseHeaders,
      ...headers,
    },
    body: JSON.stringify(payload),
  };
}

function methodNotAllowed() {
  return json(405, { ok: false, message: "Método não permitido." });
}

function badRequest(message = "Requisição inválida.") {
  return json(400, { ok: false, message });
}

function unauthorized() {
  return json(401, { ok: false, message: "Acesso administrativo necessário." });
}

function serverError(error, fallback = "Não foi possível concluir a operação.") {
  return json(500, {
    ok: false,
    message: error instanceof Error && error.message ? error.message : fallback,
  });
}

function fallbackAdSettings() {
  return {
    enabled: true,
    scheduleEnabled: false,
    startTime: "08:00",
    endTime: "22:00",
  };
}

function readJsonBody(event) {
  if (!event.body) return {};
  const body = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  return JSON.parse(body);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let response;

  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "CNJMRadioSite/1.0",
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let response;

  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "CNJMRadioSite/1.0",
        Accept: "application/json",
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function decodeHtml(value) {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeHtml(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function normalizePublicText(value) {
  return decodeHtml(value).normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normalizeComparableTrackText(value) {
  return normalizePublicText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/, " ")
    .replace(/[_-]+/g, " ")
    .replace(/(?:\s+mp3|\.(?:mp3|wav|aac|m4a|ogg|flac))+$/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanTrackPart(value) {
  return normalizePublicText(value)
    .replace(/^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/, "")
    .replace(/(?:\s+mp3|\.(?:mp3|wav|aac|m4a|ogg|flac))+$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTechnicalTrack(...values) {
  const fields = values.map(normalizePublicText).filter(Boolean);
  const text = fields.join(" ");
  if (!text) return true;

  const comparableFields = fields.map(normalizeComparableTrackText).filter(Boolean);
  const comparableText = comparableFields.join(" ");

  return fields.some((field) => technicalTrackPatterns.some((pattern) => pattern.test(field))) ||
    technicalTrackPatterns.some((pattern) => pattern.test(text)) ||
    technicalTrackPhrases.some((phrase) =>
      comparableFields.some((field) => field.includes(phrase)) || comparableText.includes(phrase),
    );
}

function isDisplayableHistoryTime(value) {
  return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(normalizePublicText(value));
}

function isValidHttpsPlaylist(candidate) {
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

function isSafeCoverUrl(candidate) {
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

function parseTrack(rawValue) {
  const raw = cleanTrackPart(rawValue || "Web Rádio Conexão Jamaica - Reggae ao vivo");
  const parts = raw.split(/\s(?:-|–|—|\||\/)\s/).map(cleanTrackPart).filter(Boolean);

  if (parts.length >= 2) {
    return {
      artist: cleanTrackPart(parts[0]),
      title: cleanTrackPart(parts.slice(1).join(" - ")),
      raw,
    };
  }

  return {
    artist: "Web Rádio Conexão Jamaica",
    title: raw,
    raw,
  };
}

function normalizeStreamStatsPayload(payload) {
  if (Array.isArray(payload?.streams) && payload.streams[0]) return payload.streams[0];
  return payload || {};
}

async function fetchStreamStats() {
  return normalizeStreamStatsPayload(await fetchJson(STATISTICS_URL));
}

function readXmlField(xml, fieldName) {
  const escaped = String(fieldName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(xml).match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? normalizePublicText(stripTags(match[1])) : "";
}

function readMetadataField(payload, xml, ...names) {
  for (const name of names) {
    const value = payload && typeof payload === "object" ? payload[name] : "";
    const clean = normalizePublicText(value || "");
    if (clean) return clean;

    const xmlValue = readXmlField(xml, name);
    if (xmlValue) return xmlValue;
  }
  return "";
}

function parsePrimaryStreamMetadata(rawResponse) {
  const text = String(rawResponse || "").trim();
  let payload = null;
  if (text.startsWith("{")) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  const fields = payload?.info && typeof payload.info === "object" ? payload.info : payload;
  const status = readMetadataField(fields, text, "status");
  const songTitle = readMetadataField(fields, text, "musica_atual", "musicaAtual", "songtitle", "songTitle");
  const coverUrl = readMetadataField(fields, text, "capa_musica", "capaMusica", "coverUrl", "cover_url");
  const listeners = Number(readMetadataField(fields, text, "ouvintes_conectados", "ouvintesConectados", "currentlisteners")) || 0;
  const bitrate = readMetadataField(fields, text, "plano_bitrate", "planoBitrate", "bitrate") || "128";
  const genre = readMetadataField(fields, text, "genero", "genre") || "Reggae";

  if (!status && !songTitle) throw new Error("Resposta de metadados da rádio inválida.");

  return {
    songTitle,
    coverUrl: isSafeCoverUrl(coverUrl) ? coverUrl : null,
    listeners,
    bitrate,
    genre,
    isOnline: /^(ligado|online|on|1|true)$/i.test(status) || Boolean(songTitle),
  };
}

async function fetchPrimaryStreamMetadata() {
  if (!STREAM_METADATA_URL) throw new Error("CNJM_STREAM_METADATA_URL não configurada.");
  return parsePrimaryStreamMetadata(await fetchText(STREAM_METADATA_URL));
}

function classifyDjMetadata(songTitle) {
  const title = normalizePublicText(songTitle);
  return title && !isTechnicalTrack(title) ? "music" : "no-metadata";
}

function parseLiveDjMarker(value) {
  const match = normalizePublicText(value).match(/^ao\s+vivo\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*$/i);
  if (!match) return null;
  const djName = normalizePublicText(match[1]);
  const programName = normalizePublicText(match[2]);
  return djName && programName ? { djName, programName } : null;
}

function isLiveDjMarker(value) {
  return Boolean(parseLiveDjMarker(value));
}

function genericLiveTrack() {
  return {
    artist: "Web Rádio Conexão Jamaica",
    title: "Reggae ao vivo",
    raw: "Web Rádio Conexão Jamaica - Reggae ao vivo",
    album: null,
    coverUrl: null,
  };
}

function publicDetectionError(error) {
  if (error instanceof Error && /abort/i.test(error.name || "")) return "Tempo limite ao consultar a rádio.";
  if (error instanceof Error && /^HTTP\s+\d+/i.test(error.message)) return "A rádio não respondeu à consulta de metadados.";
  return "Metadados da rádio indisponíveis.";
}

async function fetchDjDetectionObservation() {
  const startedAt = Date.now();

  try {
    const metadata = await fetchPrimaryStreamMetadata();
    const marker = parseLiveDjMarker(metadata.songTitle);
    return {
      classification: marker ? "no-metadata" : classifyDjMetadata(metadata.songTitle),
      source: "metadata",
      songTitle: metadata.songTitle,
      marker,
      reason: marker ? "marker" : !normalizePublicText(metadata.songTitle) ? "empty" : isTechnicalTrack(metadata.songTitle) ? "technical" : "music",
      observedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      lastError: null,
    };
  } catch (primaryError) {
    try {
      const stats = await fetchStreamStats();
      const songTitle = stats.songtitle ?? "";
      const marker = parseLiveDjMarker(songTitle);
      return {
        classification: marker ? "no-metadata" : classifyDjMetadata(songTitle),
        source: "shoutcast",
        songTitle,
        marker,
        streamIdentity: `${stats.streamsource ?? ""}|${stats.streamuptime ?? ""}`,
        reason: marker ? "marker" : !normalizePublicText(songTitle) ? "empty" : isTechnicalTrack(songTitle) ? "technical" : "music",
        observedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        lastError: null,
      };
    } catch (fallbackError) {
      return {
        classification: "unknown",
        source: "none",
        observedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        lastError: publicDetectionError(fallbackError || primaryError),
      };
    }
  }
}

function trackFromPrimaryMetadata(metadata) {
  const rawValue = metadata.songTitle || SAFE_NOW_PLAYING;
  if (isLiveDjMarker(rawValue)) return genericLiveTrack();
  const track = isTechnicalTrack(rawValue) ? parseTrack(SAFE_NOW_PLAYING) : parseTrack(rawValue);
  return {
    ...track,
    album: null,
    coverUrl: metadata.coverUrl,
  };
}

function trackFromShoutcastFallback(rawValue) {
  if (isLiveDjMarker(rawValue)) return genericLiveTrack();
  const raw = normalizePublicText(rawValue) || SAFE_NOW_PLAYING;
  return {
    artist: "Web Rádio Conexão Jamaica",
    title: raw,
    raw,
    album: null,
    coverUrl: null,
  };
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

function parseCells(rowHtml) {
  return [...String(rowHtml).matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) =>
    stripTags(match[1]),
  );
}

function parseHistory(html) {
  const rows = [...String(html).matchAll(/<tr[\s\S]*?<\/tr>/gi)];

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

function parseSchedule(html) {
  const buttons = [...String(html).matchAll(/<button([^>]*)data-bs-target=["']#nav-([^"']+)["'][^>]*>([\s\S]*?)<\/button>/gi)]
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

        return {
          id: `${button.id}-${index}`,
          time: cells[0].replace(/^Agora mesmo\s*/i, ""),
          program: cells[1],
          host: cells[2],
          isNow: /active|success|agora/i.test(row[1] + row[0] + cells[0]),
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
  if (!iframeSrc) throw new Error("Camera iframe unavailable.");

  const embedUrl = new URL(iframeSrc, CAMERA_PAGE_URL).href;
  const embedHtml = await fetchText(embedUrl);
  const playlist =
    embedHtml.match(/\bsource\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i)?.[1] ??
    embedHtml.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i)?.[0];

  if (!playlist) throw new Error("Camera playlist unavailable.");

  const playlistUrl = new URL(playlist.replaceAll("\\/", "/"), embedUrl).href.replace(/^http:/, "https:");
  if (!isValidHttpsPlaylist(playlistUrl)) throw new Error("Invalid camera playlist.");

  return {
    embedUrl,
    playlistUrl,
  };
}

function parseChatMessages(html) {
  return [...String(html).matchAll(/<li[^>]*data-id=["']?([^"'\s>]+)["']?[\s\S]*?<\/li>/gi)]
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

async function handleNowPlaying() {
  const [liveStatusTest, configuredLiveDj] = await Promise.all([
    getLiveStatusTest().catch(() => ({ state: "off" })),
    getCurrentLiveDjStatus().catch(() => null),
  ]);

  if (configuredLiveDj?.isLive) {
    return json(200, applyLiveStatusSimulation({
      ok: true,
      source: "live",
      track: {
        artist: configuredLiveDj.djName || "DJ ao vivo",
        title: configuredLiveDj.programName || "Programa Ao Vivo",
        raw: `${configuredLiveDj.djName || "DJ ao vivo"} - ${configuredLiveDj.programName || "Programa Ao Vivo"}`,
        album: null,
        coverUrl: configuredLiveDj.logoUrl || null,
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
        streamSource: "programação de DJ",
      },
      liveDj: configuredLiveDj,
      history: safeHistoryFallback(),
      fetchedAt: new Date().toISOString(),
    }, liveStatusTest), liveDjNowPlayingCacheHeaders);
  }

  try {
    const metadata = await fetchPrimaryStreamMetadata();

    return json(200, applyLiveStatusSimulation({
      ok: true,
      source: "live",
      track: trackFromPrimaryMetadata(metadata),
      stats: {
        listeners: metadata.listeners,
        peakListeners: metadata.listeners,
        uniqueListeners: metadata.listeners,
        streamHits: 0,
        genre: metadata.genre,
        bitrate: metadata.bitrate,
        isOnline: metadata.isOnline,
        uptimeSeconds: null,
        streamSource: "API da rádio",
      },
      liveDj: {
        state: metadata.isOnline ? "online" : "offline",
        isLive: false,
        djName: null,
        programName: null,
        matchedSignature: null,
        detectedValue: null,
        source: "metadata",
      },
      history: safeHistoryFallback(),
      fetchedAt: new Date().toISOString(),
    }, liveStatusTest), nowPlayingCacheHeaders);
  } catch {
    try {
      const stats = await fetchStreamStats();
      const rawSongTitle = stats.songtitle ?? "";
      const liveDj = {
        state: Number(stats.streamstatus ?? 0) === 1 ? "online" : "offline",
        isLive: false,
        djName: null,
        programName: null,
        matchedSignature: null,
        detectedValue: null,
        source: "autodj",
      };
      const track = trackFromShoutcastFallback(rawSongTitle);

      return json(200, applyLiveStatusSimulation({
        ok: true,
        source: "live",
        track,
        stats: {
          listeners: Number(stats.currentlisteners ?? 0),
          peakListeners: Number(stats.peaklisteners ?? 0),
          uniqueListeners: Number(stats.uniquelisteners ?? 0),
          streamHits: Number(stats.streamhits ?? 0),
          genre: stats.servergenre ?? "Reggae",
          bitrate: stats.bitrate ?? "128",
          isOnline: Number(stats.streamstatus ?? 0) === 1,
          uptimeSeconds: Number(stats.streamuptime ?? 0) || null,
          streamSource: stats.streamsource ?? stats.source ?? null,
        },
        liveDj,
        history: safeHistoryFallback(),
        fetchedAt: new Date().toISOString(),
      }, liveStatusTest), nowPlayingCacheHeaders);
    } catch {
      return json(200, applyLiveStatusSimulation({
        ok: false,
        source: "fallback",
        track: {
          ...parseTrack(SAFE_NOW_PLAYING),
          album: null,
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
          state: "connecting",
          isLive: false,
          djName: null,
          programName: null,
          matchedSignature: null,
          detectedValue: null,
          source: "fallback",
        },
        history: safeHistoryFallback(),
        fetchedAt: new Date().toISOString(),
        message: "Dados ao vivo indisponíveis no momento.",
      }, liveStatusTest), nowPlayingCacheHeaders);
    }
  }
}

function liveStateCacheHeaders(snapshot) {
  const configuredSeconds = snapshot?.config?.enabled && (snapshot?.eligibleDj || snapshot?.liveDj?.isLive)
    ? Number(snapshot.config.pollSeconds) || 15
    : 60;
  const boundary = snapshot?.sessionEndsAt || snapshot?.nextEligibleAt;
  const untilBoundary = boundary ? Math.max(1, Math.ceil((Date.parse(boundary) - Date.now()) / 1_000)) : configuredSeconds;
  const pollSeconds = Math.max(1, Math.min(configuredSeconds, untilBoundary));
  return publicCacheHeaders({
    browserMaxAge: pollSeconds,
    cdnMaxAge: pollSeconds,
    staleWhileRevalidate: 0,
  });
}

function publicLiveStatePayload(snapshot) {
  const state = snapshot?.state || {};
  const eligibleDj = snapshot?.eligibleDj;
  return {
    ok: true,
    liveDj: snapshot?.liveDj || null,
    eligibleDj: eligibleDj
      ? {
          id: eligibleDj.id,
          djName: eligibleDj.djName,
          programName: eligibleDj.programName,
          startTime: eligibleDj.startTime,
          endTime: eligibleDj.endTime,
        }
      : null,
    state: {
      mode: state.mode || "waiting",
      djId: state.djId || null,
      enterCount: Number(state.enterCount || 0),
      exitCount: Number(state.exitCount || 0),
      confidence: Number(state.confidence || 0),
      activation: state.activation || null,
      classification: state.classification || null,
      source: state.source || "none",
      expectedEndAt: state.expectedEndAt || snapshot?.expectedEndAt || null,
      overrunAcknowledgedAt: state.overrunAcknowledgedAt || null,
      forceEnded: state.forceEnded === true,
      titleStale: state.titleStale === true,
      streamChanged: state.streamChanged === true,
      signals: Array.isArray(state.signals) ? state.signals : [],
      observedAt: state.observedAt || null,
      updatedAt: state.updatedAt || null,
    },
    config: {
      enabled: snapshot?.config?.enabled !== false,
      pollSeconds: Number(snapshot?.config?.pollSeconds) || 15,
      enterConfirmations: Number(snapshot?.config?.enterConfirmations) || 3,
      exitConfirmations: Number(snapshot?.config?.exitConfirmations) || 2,
    },
    nextEligibleAt: snapshot?.nextEligibleAt || null,
    sessionEndsAt: snapshot?.sessionEndsAt || null,
    expectedEndAt: snapshot?.expectedEndAt || null,
    isOverrun: snapshot?.isOverrun === true,
    version: state.updatedAt || snapshot?.liveDj?.sessionId || "waiting",
    fetchedAt: new Date().toISOString(),
  };
}

function adminDjDetectionPayload(snapshot) {
  const payload = publicLiveStatePayload(snapshot);
  return {
    ...payload,
    diagnostic: snapshot?.diagnostic || {
      classification: snapshot?.state?.classification || "unknown",
      source: snapshot?.state?.source || "none",
      observedAt: snapshot?.state?.observedAt || null,
      latencyMs: snapshot?.state?.latencyMs || null,
      lastError: snapshot?.state?.lastError || null,
      confidence: Number(snapshot?.state?.confidence || 0),
      signals: Array.isArray(snapshot?.state?.signals) ? snapshot.state.signals : [],
    },
  };
}

async function evaluateDjDetection({ probe = false } = {}) {
  let snapshot = await getDjDetectionSnapshot();
  const manualIsLive = snapshot.liveDj?.source === "manual";
  const confirmationNeedsMonitoring = snapshot.state?.activation === "confirmation" && snapshot.liveDj?.isLive;
  const shouldObserve = Boolean(
    snapshot.eligibleDj &&
    !manualIsLive &&
    (snapshot.config?.enabled || confirmationNeedsMonitoring) &&
    (probe || isDjDetectionDue(snapshot)),
  );

  if (shouldObserve) {
    snapshot = await advanceDjDetectionObservation(await fetchDjDetectionObservation());
  } else if (!snapshot.liveDj?.isLive && !snapshot.eligibleDj && (snapshot.state?.mode !== "waiting" || snapshot.state?.djId)) {
    snapshot = await advanceDjDetectionObservation({
      classification: "unknown",
      source: "none",
      observedAt: new Date().toISOString(),
      latencyMs: null,
      lastError: null,
    });
  }

  return snapshot;
}

function isDjDetectionDue(snapshot) {
  const observedAt = Date.parse(snapshot?.state?.observedAt || "");
  const intervalMs = (Number(snapshot?.config?.pollSeconds) || 15) * 1_000;
  return !Number.isFinite(observedAt) ||
    snapshot?.state?.djId !== snapshot?.eligibleDj?.id ||
    Date.now() - observedAt >= intervalMs;
}

async function handlePublicLiveState() {
  try {
    const snapshot = await evaluateDjDetection();
    return json(200, publicLiveStatePayload(snapshot), liveStateCacheHeaders(snapshot));
  } catch {
    return json(200, {
      ok: false,
      liveDj: null,
      eligibleDj: null,
      state: { mode: "waiting", djId: null, enterCount: 0, exitCount: 0, classification: "unknown", source: "none", observedAt: null, updatedAt: null },
      config: { enabled: true, pollSeconds: 60, enterConfirmations: 3, exitConfirmations: 2 },
      nextEligibleAt: null,
      sessionEndsAt: null,
      expectedEndAt: null,
      isOverrun: false,
      version: "unavailable",
      fetchedAt: new Date().toISOString(),
      message: "Estado ao vivo indisponível.",
    }, publicCacheHeaders({ browserMaxAge: 60, cdnMaxAge: 60, staleWhileRevalidate: 0 }));
  }
}

async function handleRecentTracks() {
  try {
    const history = parseHistory(await fetchText(HISTORY_URL));
    return json(200, {
      ok: true,
      source: "live",
      history: history.length > 0 ? history : safeHistoryFallback(),
      fetchedAt: new Date().toISOString(),
    }, recentTracksCacheHeaders);
  } catch {
    return json(200, {
      ok: false,
      source: "fallback",
      history: safeHistoryFallback(),
      fetchedAt: new Date().toISOString(),
      message: "Faixas recentes indisponíveis no momento.",
    }, recentTracksCacheHeaders);
  }
}

async function handleSchedule() {
  try {
    const data = await listPublicPrograms();

    return json(200, {
      ok: true,
      source: "live",
      days: data.days,
      fetchedAt: new Date().toISOString(),
    }, publicProgramsCacheHeaders);
  } catch (error) {
    return json(200, {
      ok: false,
      source: "fallback",
      days: [],
      fetchedAt: new Date().toISOString(),
      message: error instanceof Error && error.message ? error.message : "Grade real indisponível no momento.",
    }, publicProgramsCacheHeaders);
  }
}

async function handleCamera() {
  try {
    const camera = await resolveCamera();
    return json(200, {
      ok: true,
      source: "live",
      playlistUrl: camera.playlistUrl,
      embedUrl: camera.embedUrl,
      fetchedAt: new Date().toISOString(),
    }, cameraCacheHeaders);
  } catch {
    return json(200, {
      ok: false,
      source: "fallback",
      playlistUrl: null,
      embedUrl: null,
      fetchedAt: new Date().toISOString(),
      message: "Câmera indisponível no momento.",
    }, cameraCacheHeaders);
  }
}

async function handleChatMessages() {
  try {
    const html = await fetchText(CHAT_MESSAGES_URL);
    return json(200, {
      ok: true,
      source: "live",
      messages: parseChatMessages(html),
      fetchedAt: new Date().toISOString(),
    }, chatCacheHeaders);
  } catch {
    return json(200, {
      ok: false,
      source: "fallback",
      messages: [],
      fetchedAt: new Date().toISOString(),
      message: "Mensagens reais indisponíveis no momento.",
    }, chatCacheHeaders);
  }
}

function apiPath(event) {
  const path = event.path ?? "";
  return path
    .replace(/^\/api\/?/, "/")
    .replace(/^\/\.netlify\/functions\/api\/?/, "/")
    .replace(/\/$/, "") || "/";
}

async function handleAds(event, pathname) {
  const method = event.httpMethod || "GET";
  const parts = pathname.split("/").filter(Boolean);

  if (pathname === "/ads/login") {
    if (method !== "POST") return methodNotAllowed();

    try {
      const payload = readJsonBody(event);
      if (!isValidAdminLogin(payload)) {
        return json(401, { ok: false, message: "Login ou senha inválidos." });
      }

      return json(200, {
        ok: true,
        session: adminSessionPayload(),
      });
    } catch {
      return badRequest("Não foi possível ler o login enviado.");
    }
  }

  if (parts[0] === "ads" && parts[1] === "image") {
    if (method !== "GET") return methodNotAllowed();

    try {
      const image = await readAdImage(decodeURIComponent(parts.slice(2).join("/")));
      if (!image) return json(404, { ok: false, message: "Imagem não encontrada." });

      return {
        statusCode: 200,
        isBase64Encoded: true,
        headers: {
          "content-type": image.contentType,
          ...publicImageCacheHeaders,
          "access-control-allow-origin": "*",
        },
        body: image.body,
      };
    } catch (error) {
      return serverError(error, "Não foi possível abrir a imagem do anúncio.");
    }
  }

  if (pathname === "/ads") {
    if (method === "GET") {
      try {
        const data = await listPublicAds();
        return json(200, {
          ok: true,
          source: "blobs",
          ...data,
          fetchedAt: new Date().toISOString(),
        }, publicAdsCacheHeaders);
      } catch (error) {
        return json(200, {
          ok: false,
          source: "fallback",
          ads: [],
          settings: fallbackAdSettings(),
          fetchedAt: new Date().toISOString(),
          message: error instanceof Error && error.message ? error.message : "Conteúdo de anúncios indisponível.",
        }, publicAdsCacheHeaders);
      }
    }

    if (method === "POST") {
      if (!isAdminRequest(event)) return unauthorized();

      try {
        const payload = readJsonBody(event);
        const ad = await saveAd(payload.ad ?? payload);
        return json(200, { ok: true, ad });
      } catch (error) {
        return serverError(error, "Não foi possível salvar o anúncio.");
      }
    }

    return methodNotAllowed();
  }

  if (pathname === "/ads/admin") {
    if (method !== "GET") return methodNotAllowed();
    if (!isAdminRequest(event)) return unauthorized();

    try {
      const data = await listAdminAds();
      return json(200, {
        ok: true,
        source: "blobs",
        ...data,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      return serverError(error, "Não foi possível carregar os anúncios.");
    }
  }

  if (pathname === "/ads/settings") {
    if (!isAdminRequest(event)) return unauthorized();

    if (method === "GET") {
      try {
        const settings = await getAdSettings();
        return json(200, { ok: true, settings });
      } catch (error) {
        return serverError(error, "Não foi possível carregar as configurações.");
      }
    }

    if (method === "PUT" || method === "POST") {
      try {
        const payload = readJsonBody(event);
        const settings = await saveAdSettings(payload.settings ?? payload);
        return json(200, { ok: true, settings });
      } catch (error) {
        return serverError(error, "Não foi possível salvar as configurações.");
      }
    }

    return methodNotAllowed();
  }

  if (pathname === "/ads/upload") {
    if (method !== "POST") return methodNotAllowed();
    if (!isAdminRequest(event)) return unauthorized();

    try {
      const payload = readJsonBody(event);
      const image = await saveAdImage(payload);
      return json(200, { ok: true, image });
    } catch (error) {
      return serverError(error, "Não foi possível enviar a imagem.");
    }
  }

  if (pathname === "/ads/import-image") {
    if (method !== "POST") return methodNotAllowed();
    if (!isAdminRequest(event)) return unauthorized();

    try {
      const payload = readJsonBody(event);
      const image = await importSiteImage(payload);
      return json(200, { ok: true, image });
    } catch (error) {
      return serverError(error, "Não foi possível importar e converter a imagem.");
    }
  }

  if (pathname === "/ads/migrate-webp") {
    if (method !== "POST") return methodNotAllowed();
    if (!isAdminRequest(event)) return unauthorized();

    try {
      const result = await migrateStoredMediaToWebp();
      return json(200, { ok: true, ...result });
    } catch (error) {
      return serverError(error, "Não foi possível migrar as imagens para WebP.");
    }
  }

  if (parts[0] === "ads" && parts[2] === "stats") {
    if (method !== "POST") return methodNotAllowed();

    try {
      const payload = readJsonBody(event);
      if (payload.field !== "clicks") {
        return json(200, {
          ok: true,
          skipped: true,
          message: "Somente toques em flyers com link são gravados.",
        });
      }
      const ad = await updateAdStats(parts[1], "clicks");
      return json(200, { ok: true, ad });
    } catch (error) {
      return serverError(error, "Não foi possível atualizar as métricas.");
    }
  }

  if (parts[0] === "ads" && parts[1]) {
    if (!isAdminRequest(event)) return unauthorized();

    if (method === "PUT") {
      try {
        const payload = readJsonBody(event);
        const ad = await saveAd({ ...(payload.ad ?? payload), id: parts[1] });
        return json(200, { ok: true, ad });
      } catch (error) {
        return serverError(error, "Não foi possível atualizar o anúncio.");
      }
    }

    if (method === "DELETE") {
      try {
        const ad = await deleteAd(parts[1]);
        return json(200, { ok: true, ad });
      } catch (error) {
        return serverError(error, "Não foi possível excluir o anúncio.");
      }
    }
  }

  return json(404, { ok: false, message: "Endpoint de anúncios não encontrado." });
}

async function handlePrograms(event, pathname) {
  const method = event.httpMethod || "GET";
  const parts = pathname.split("/").filter(Boolean);

  if (pathname === "/programs") {
    if (method === "GET") {
      try {
        const data = await listPublicPrograms();
        return json(200, {
          ok: true,
          source: "blobs",
          ...data,
          fetchedAt: new Date().toISOString(),
        }, publicProgramsCacheHeaders);
      } catch (error) {
        return json(200, {
          ok: false,
          source: "fallback",
          programs: [],
          days: [],
          currentProgram: null,
          fetchedAt: new Date().toISOString(),
          message: error instanceof Error && error.message ? error.message : "Programação indisponível.",
        }, publicProgramsCacheHeaders);
      }
    }

    if (method === "POST") {
      if (!isAdminRequest(event)) return unauthorized();

      try {
        const payload = readJsonBody(event);
        const program = await saveProgram(payload.program ?? payload);
        return json(200, { ok: true, program });
      } catch (error) {
        return serverError(error, "Não foi possível salvar o programa.");
      }
    }

    return methodNotAllowed();
  }

  if (pathname === "/programs/admin") {
    if (method !== "GET") return methodNotAllowed();
    if (!isAdminRequest(event)) return unauthorized();

    try {
      const data = await listAdminPrograms();
      return json(200, {
        ok: true,
        source: "blobs",
        ...data,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      return serverError(error, "Não foi possível carregar a programação.");
    }
  }

  if (pathname === "/programs/upload-logo") {
    if (method !== "POST") return methodNotAllowed();
    if (!isAdminRequest(event)) return unauthorized();

    try {
      const payload = readJsonBody(event);
      const image = await saveProgramLogo(payload);
      return json(200, { ok: true, image });
    } catch (error) {
      return serverError(error, "Não foi possível enviar a logo do programa.");
    }
  }

  if (parts[0] === "programs" && parts[1]) {
    if (!isAdminRequest(event)) return unauthorized();

    if (method === "PUT") {
      try {
        const payload = readJsonBody(event);
        const program = await saveProgram({ ...(payload.program ?? payload), id: parts[1] });
        return json(200, { ok: true, program });
      } catch (error) {
        return serverError(error, "Não foi possível atualizar o programa.");
      }
    }

    if (method === "DELETE") {
      try {
        const program = await deleteProgram(parts[1]);
        return json(200, { ok: true, program });
      } catch (error) {
        return serverError(error, "Não foi possível excluir o programa.");
      }
    }
  }

  return json(404, { ok: false, message: "Endpoint de programação não encontrado." });
}

async function handleDjs(event, pathname) {
  const method = event.httpMethod || "GET";
  const parts = pathname.split("/").filter(Boolean);

  if (pathname === "/djs/upload-logo") {
    if (method !== "POST") return methodNotAllowed();
    if (!isAdminRequest(event)) return unauthorized();

    try {
      const payload = readJsonBody(event);
      const image = await saveDjLogo(payload);
      return json(200, { ok: true, image });
    } catch (error) {
      return serverError(error, "Não foi possível enviar a logo do DJ.");
    }
  }

  if (pathname === "/djs") {
    if (!isAdminRequest(event)) return unauthorized();

    if (method === "GET") {
      try {
        const djs = await listAdminDjs();
        return json(200, {
          ok: true,
          source: "blobs",
          djs,
          fetchedAt: new Date().toISOString(),
        });
      } catch (error) {
        return serverError(error, "Não foi possível carregar os DJs.");
      }
    }

    if (method === "POST") {
      try {
        const payload = readJsonBody(event);
        const dj = await saveDj(payload.dj ?? payload);
        return json(200, { ok: true, dj });
      } catch (error) {
        return serverError(error, "Não foi possível salvar o DJ.");
      }
    }

    return methodNotAllowed();
  }

  if (parts[0] === "djs" && parts[1]) {
    if (!isAdminRequest(event)) return unauthorized();

    if (parts[2] === "skip-today") {
      if (method !== "PUT") return methodNotAllowed();
      try {
        const payload = readJsonBody(event);
        const liveStatusTest = await setDjSkippedToday(parts[1], payload.skipped !== false);
        return json(200, { ok: true, liveStatusTest, fetchedAt: new Date().toISOString() });
      } catch (error) {
        return serverError(error, "Não foi possível pular a sessão de hoje.");
      }
    }

    if (parts[2] === "session") {
      if (method !== "PUT") return methodNotAllowed();
      try {
        const payload = readJsonBody(event);
        const snapshot = await controlDjLiveSession(parts[1], payload.action, payload.minutes);
        return json(200, { ok: true, ...adminDjDetectionPayload(snapshot) });
      } catch (error) {
        return serverError(error, "Não foi possível atualizar a sessão do DJ.");
      }
    }

    if (method === "PUT") {
      try {
        const payload = readJsonBody(event);
        const dj = await saveDj({ ...(payload.dj ?? payload), id: parts[1] });
        return json(200, { ok: true, dj });
      } catch (error) {
        return serverError(error, "Não foi possível atualizar o DJ.");
      }
    }

    if (method === "DELETE") {
      try {
        const dj = await deleteDj(parts[1]);
        return json(200, { ok: true, dj });
      } catch (error) {
        return serverError(error, "Não foi possível excluir o DJ.");
      }
    }
  }

  return json(404, { ok: false, message: "Endpoint de DJs não encontrado." });
}

async function handleLiveStatusTest(event, pathname) {
  const method = event.httpMethod || "GET";
  if (pathname !== "/live-status-test") return json(404, { ok: false, message: "Endpoint de audiência não encontrado." });

  if (method === "GET") {
    try {
      const liveStatusTest = await getLiveStatusTest();
      return json(200, {
        ok: true,
        source: "blobs",
        liveStatusTest,
        fetchedAt: new Date().toISOString(),
      }, nowPlayingCacheHeaders);
    } catch (error) {
      return json(200, {
        ok: false,
        source: "fallback",
        liveStatusTest: { state: "off" },
        fetchedAt: new Date().toISOString(),
        message: error instanceof Error && error.message ? error.message : "Audiência indisponível.",
      }, nowPlayingCacheHeaders);
    }
  }

  if (method === "PUT" || method === "POST") {
    if (!isAdminRequest(event)) return unauthorized();

    try {
      const payload = readJsonBody(event);
      const liveStatusTest = await saveLiveStatusTest(payload.liveStatusTest ?? payload);
      return json(200, {
        ok: true,
        source: "blobs",
        liveStatusTest,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      return serverError(error, "Não foi possível salvar a audiência.");
    }
  }

  return methodNotAllowed();
}

async function handleDjDetection(event, pathname) {
  if (pathname !== "/dj-detection") return json(404, { ok: false, message: "Central da API não encontrada." });
  if (!isAdminRequest(event)) return unauthorized();

  const method = event.httpMethod || "GET";
  if (method === "GET") {
    const url = new URL(event.rawUrl || `https://local${event.path || "/api/dj-detection"}`);
    const probe = url.searchParams.get("probe") === "1";
    try {
      const snapshot = probe ? await evaluateDjDetection({ probe: true }) : await getDjDetectionSnapshot();
      return json(200, adminDjDetectionPayload(snapshot));
    } catch (error) {
      return serverError(error, "Não foi possível consultar a detecção de DJ.");
    }
  }

  if (method === "PUT") {
    try {
      const payload = readJsonBody(event);
      const current = await getLiveStatusTest();
      const liveStatusTest = await saveLiveStatusTest({
        ...current,
        djDetectionConfig: payload.config ?? payload.djDetectionConfig ?? current.djDetectionConfig,
        updatedAt: new Date().toISOString(),
      });
      const snapshot = await getDjDetectionSnapshot({ forceRefresh: true });
      return json(200, { ok: true, liveStatusTest, ...adminDjDetectionPayload(snapshot) });
    } catch (error) {
      return serverError(error, "Não foi possível salvar o funcionamento da API.");
    }
  }

  return methodNotAllowed();
}

export async function handler(event) {
  connectNetlifyBlobs(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: baseHeaders, body: "" };
  }

  const pathname = apiPath(event);
  if (pathname === "/ads" || pathname.startsWith("/ads/")) return handleAds(event, pathname);
  if (pathname === "/programs" || pathname.startsWith("/programs/")) return handlePrograms(event, pathname);
  if (pathname === "/djs" || pathname.startsWith("/djs/")) return handleDjs(event, pathname);
  if (pathname === "/live-status-test") return handleLiveStatusTest(event, pathname);
  if (pathname === "/dj-detection") return handleDjDetection(event, pathname);

  if (event.httpMethod && event.httpMethod !== "GET") {
    return methodNotAllowed();
  }

  if (pathname === "/now-playing") return handleNowPlaying();
  if (pathname === "/live-state") return handlePublicLiveState();
  if (pathname === "/recent-tracks") return handleRecentTracks();
  if (pathname === "/schedule") return handleSchedule();
  if (pathname === "/camera") return handleCamera();
  if (pathname === "/chat/messages") return handleChatMessages();

  return json(404, { ok: false, message: "Endpoint não encontrado." });
}
