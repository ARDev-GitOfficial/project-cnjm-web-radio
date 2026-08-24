import { connectLambda } from "@netlify/blobs";
import {
  adminSessionPayload,
  deleteAd,
  deleteDj,
  deleteProgram,
  getAdSettings,
  isAdminRequest,
  isValidAdminLogin,
  listAdminAds,
  listAdminDjs,
  listAdminPrograms,
  listPublicAds,
  listPublicDjs,
  listPublicPrograms,
  readAdImage,
  saveAd,
  saveAdImage,
  saveAdSettings,
  saveDj,
  saveProgram,
  saveProgramLogo,
  updateAdStats,
} from "../lib/ads-store.mjs";

const STATS_URL = "https://s03.svrdedicado.org:7586/stats?sid=1&json=1";
const STATISTICS_URL = "https://s03.svrdedicado.org:7586/statistics?json=1";
const HISTORY_URL = "https://s03.svrdedicado.org:7586/played?sid=1";
const CAMERA_PAGE_URL = "https://player.svrdedicado.org/one-page/7586";
const COVER_URL = "https://player.svrdedicado.org/one-page/7586/cover";
const CHAT_MESSAGES_URL = "https://player.svrdedicado.org/chat/7586/lista?limit=80";
const MUSIC_LOOKUP_URL = "https://itunes.apple.com/search";

const SAFE_NOW_PLAYING = "Web Rádio Conexão Jamaica - Programação ao vivo";
let lastPublicTrack = null;

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

const weakLookupTokens = new Set([
  "web",
  "radio",
  "conexao",
  "jamaica",
  "reggae",
  "programacao",
  "vivo",
  "musica",
  "music",
  "official",
  "audio",
  "video",
  "remaster",
  "remastered",
  "the",
  "and",
  "feat",
  "ft",
  "com",
  "para",
  "das",
  "dos",
  "uma",
]);

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
  browserMaxAge: 30,
  cdnMaxAge: 45,
  staleWhileRevalidate: 180,
});
const cameraCacheHeaders = publicCacheHeaders({
  browserMaxAge: 1800,
  cdnMaxAge: 3600,
  staleWhileRevalidate: 86400,
});
const chatCacheHeaders = publicCacheHeaders({
  browserMaxAge: 45,
  cdnMaxAge: 90,
  staleWhileRevalidate: 240,
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
  const response = await fetch(url, {
    headers: {
      "User-Agent": "CNJMRadioSite/1.0",
      Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "CNJMRadioSite/1.0",
      Accept: "application/json",
    },
  });

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

function trackTokens(...values) {
  return values
    .flatMap((value) => normalizeComparableTrackText(value).split(/\s+/))
    .filter((token) => token.length > 2 && !weakLookupTokens.has(token));
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

async function fetchCoverUrl() {
  try {
    const response = await fetch(COVER_URL, {
      headers: {
        "User-Agent": "CNJMRadioSite/1.0",
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
  try {
    return normalizeStreamStatsPayload(await fetchJson(STATISTICS_URL));
  } catch {
    return normalizeStreamStatsPayload(await fetchJson(STATS_URL));
  }
}

function parseSafeTrack(rawValue) {
  return isTechnicalTrack(rawValue) ? parseTrack(SAFE_NOW_PLAYING) : parseTrack(rawValue);
}

function lookupCoverUrl(candidate) {
  const clean = normalizePublicText(candidate);
  if (!clean) return null;
  return clean
    .replace(/(?:30|60|100)x(?:30|60|100)bb\.(jpg|png|webp)$/i, "600x600bb.$1")
    .replace(/(?:30|60|100)x(?:30|60|100)-75\.(jpg|png|webp)$/i, "600x600-75.$1");
}

function isUsefulLookupResult(baseTrack, candidate) {
  const baseTokens = new Set(trackTokens(baseTrack.artist, baseTrack.title));
  const candidateTokens = new Set(trackTokens(candidate.artist, candidate.title));
  if (!baseTokens.size || !candidateTokens.size) return false;

  const overlap = [...baseTokens].filter((token) => candidateTokens.has(token)).length;
  return overlap >= Math.min(2, baseTokens.size);
}

async function lookupMusicTrack(baseTrack) {
  if (isTechnicalTrack(baseTrack.raw, baseTrack.title, baseTrack.artist)) return null;

  const term = [baseTrack.artist, baseTrack.title]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (trackTokens(term).length < 2) return null;

  try {
    const url = new URL(MUSIC_LOOKUP_URL);
    url.searchParams.set("term", term);
    url.searchParams.set("entity", "song");
    url.searchParams.set("media", "music");
    url.searchParams.set("limit", "5");
    url.searchParams.set("country", "BR");

    const payload = await fetchJson(url.href);
    const results = Array.isArray(payload.results) ? payload.results : [];
    const match = results
      .map((result) => ({
        artist: cleanTrackPart(result.artistName || ""),
        title: cleanTrackPart(result.trackName || ""),
        album: cleanTrackPart(result.collectionName || result.collectionCensoredName || ""),
        coverUrl: lookupCoverUrl(result.artworkUrl100 || result.artworkUrl60 || result.artworkUrl30 || ""),
      }))
      .find((candidate) => candidate.artist && candidate.title && isUsefulLookupResult(baseTrack, candidate));

    if (!match) return null;

    return {
      artist: match.artist,
      title: match.title,
      album: match.album || null,
      raw: `${match.artist} - ${match.title}`,
      coverUrl: isSafeCoverUrl(match.coverUrl) ? match.coverUrl : null,
    };
  } catch {
    return null;
  }
}

function safeTrackFromHistory(history) {
  const item = history.find((entry) => !isTechnicalTrack(entry.raw, entry.title, entry.artist));
  return item ? { artist: item.artist, title: item.title, raw: item.raw, album: null, coverUrl: null } : null;
}

async function resolveNowPlayingTrack(rawValue, coverUrl, history) {
  const directTrack = parseTrack(rawValue);
  const isBlocked = isTechnicalTrack(rawValue, directTrack.raw, directTrack.title, directTrack.artist);

  if (isBlocked) {
    return {
      ...(lastPublicTrack ?? safeTrackFromHistory(history) ?? parseTrack(SAFE_NOW_PLAYING)),
      coverUrl: lastPublicTrack?.coverUrl ?? coverUrl ?? null,
    };
  }

  const apiTrack = await lookupMusicTrack(directTrack);
  const nextTrack = {
    ...(apiTrack ?? directTrack),
    album: apiTrack?.album ?? null,
    coverUrl: apiTrack?.coverUrl ?? coverUrl ?? null,
  };

  lastPublicTrack = nextTrack;
  return nextTrack;
}

function comparableLiveValue(value) {
  return normalizePublicText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function djSignatures(dj) {
  return String(dj?.signatures || "")
    .split(/[\n,;]+/)
    .map((signature) => signature.trim())
    .filter(Boolean);
}

function maybeDjLoginValue(value) {
  const clean = normalizePublicText(value);
  return /^[a-z0-9_.-]+(?::[a-z0-9_.-]+)?$/i.test(clean) ? clean : null;
}

function liveDjCandidates(stats, rawValue) {
  return [
    stats.streamsource,
    stats.source,
    stats.dj,
    stats.dj_login,
    stats.djLogin,
    stats.currentdj,
    stats.currentDj,
    stats.encoder,
    stats.username,
    stats.user,
    stats.login,
    maybeDjLoginValue(rawValue),
  ].filter(Boolean);
}

function resolveLiveDjStatus(stats, rawValue, djs) {
  const isOnline = Number(stats.streamstatus ?? 0) === 1;
  if (!isOnline) {
    return {
      state: "offline",
      isLive: false,
      djName: null,
      programName: null,
      matchedSignature: null,
      detectedValue: null,
      source: "autodj",
    };
  }

  const candidates = liveDjCandidates(stats, rawValue);
  for (const dj of djs) {
    if (dj?.active === false) continue;

    for (const signature of djSignatures(dj)) {
      const cleanSignature = comparableLiveValue(signature);
      if (cleanSignature.length < 3) continue;

      const match = candidates.find((candidate) => {
        const cleanCandidate = comparableLiveValue(candidate);
        if (cleanCandidate.length < 3) return false;
        return cleanCandidate === cleanSignature ||
          cleanCandidate.includes(cleanSignature) ||
          cleanSignature.includes(cleanCandidate);
      });

      if (match) {
        return {
          state: "live",
          isLive: true,
          djName: dj.djName || "DJ ao vivo",
          programName: dj.programName || "Programa Ao Vivo",
          matchedSignature: signature,
          detectedValue: normalizePublicText(match),
          source: "dj",
        };
      }
    }
  }

  return {
    state: "online",
    isLive: false,
    djName: null,
    programName: null,
    matchedSignature: null,
    detectedValue: null,
    source: "autodj",
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
  try {
    const [stats, historyHtml, coverUrl, djs] = await Promise.all([
      fetchStreamStats(),
      fetchText(HISTORY_URL),
      fetchCoverUrl(),
      listPublicDjs(),
    ]);
    const history = parseHistory(historyHtml);
    const rawSongTitle = stats.songtitle ?? "";
    const track = await resolveNowPlayingTrack(rawSongTitle, coverUrl, history);
    const liveDj = resolveLiveDjStatus(stats, rawSongTitle, djs);
    const displayTrack = liveDj.isLive
      ? {
          ...track,
          artist: liveDj.djName || "DJ ao vivo",
          title: liveDj.programName || "Programa Ao Vivo",
          raw: `${liveDj.djName || "DJ ao vivo"} - ${liveDj.programName || "Programa Ao Vivo"}`,
        }
      : track;

    return json(200, {
      ok: true,
      source: "live",
      track: displayTrack,
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
      history: history.length > 0 ? history : safeHistoryFallback(),
      fetchedAt: new Date().toISOString(),
    }, nowPlayingCacheHeaders);
  } catch {
    return json(200, {
      ok: false,
      source: "fallback",
      track: {
        ...parseTrack(SAFE_NOW_PLAYING),
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
    }, nowPlayingCacheHeaders);
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
          source: "database",
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
          message: error instanceof Error && error.message ? error.message : "Banco de anúncios indisponível.",
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
        source: "database",
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

  if (parts[0] === "ads" && parts[2] === "stats") {
    if (method !== "POST") return methodNotAllowed();

    try {
      const payload = readJsonBody(event);
      if (payload.field === "impressions") {
        return json(200, { ok: true, skipped: true, message: "Exibições não são gravadas para economizar banco." });
      }
      const ad = await updateAdStats(parts[1], payload.field);
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
          source: "database",
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
        source: "database",
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

  if (pathname === "/djs") {
    if (!isAdminRequest(event)) return unauthorized();

    if (method === "GET") {
      try {
        const djs = await listAdminDjs();
        return json(200, {
          ok: true,
          source: "database",
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

export async function handler(event) {
  connectNetlifyBlobs(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: baseHeaders, body: "" };
  }

  const pathname = apiPath(event);
  if (pathname === "/ads" || pathname.startsWith("/ads/")) return handleAds(event, pathname);
  if (pathname === "/programs" || pathname.startsWith("/programs/")) return handlePrograms(event, pathname);
  if (pathname === "/djs" || pathname.startsWith("/djs/")) return handleDjs(event, pathname);

  if (event.httpMethod && event.httpMethod !== "GET") {
    return methodNotAllowed();
  }

  if (pathname === "/now-playing") return handleNowPlaying();
  if (pathname === "/schedule") return handleSchedule();
  if (pathname === "/camera") return handleCamera();
  if (pathname === "/chat/messages") return handleChatMessages();

  return json(404, { ok: false, message: "Endpoint não encontrado." });
}
