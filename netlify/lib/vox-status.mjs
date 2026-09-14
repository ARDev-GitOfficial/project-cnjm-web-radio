import { createHash } from "node:crypto";

const VOX_BASE_URL = String(process.env.CNJM_VOX_CONTROL_PANEL_URL || "https://vox.svrdedicado.org").replace(/\/+$/, "");
const VOX_STATUS_CACHE_MS = 15_000;
const VOX_SESSION_CACHE_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

let statusCache = null;
let sessionCache = null;
let pendingRead = null;

export function normalizeVoxLogin(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function parseVoxDjStatusHtml(html) {
  const tables = [...String(html || "").matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map((match) => match[0]);
  const table = tables.find((candidate) => /login\s*(?:do\s*)?dj/i.test(stripTags(candidate))) || "";
  if (!table) return {};

  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => cellsFromRow(match[1]));
  const header = rows.find((cells) => cells.some((cell) => /login\s*(?:do\s*)?dj/i.test(cell))) || [];
  const loginIndex = header.findIndex((cell) => /login\s*(?:do\s*)?dj/i.test(cell));
  const statusIndex = header.findIndex((cell) => /^status$/i.test(cell));
  const result = {};

  for (const cells of rows) {
    if (!cells.length || cells === header) continue;
    const detectedStatus = cells.find((cell) => /^(?:des)?conectado$/i.test(cell));
    const status = /^desconectado$/i.test(detectedStatus || "")
      ? "offline"
      : /^conectado$/i.test(detectedStatus || "")
        ? "online"
        : null;
    if (!status) continue;

    const login = normalizeVoxLogin(
      loginIndex >= 0 ? cells[loginIndex] : cells[Math.max(0, (statusIndex >= 0 ? statusIndex : cells.indexOf(detectedStatus)) - 1)],
    );
    // The Vox page lists the latest event first. Keep only that event per login.
    if (login && !result[login]) result[login] = { status };
  }

  return result;
}

export async function readVoxDjConnectionStatuses(credentials, options = {}) {
  return (await readVoxDjConnectionSnapshot(credentials, options)).statuses;
}

export async function readVoxDjConnectionSnapshot(credentials, { forceRefresh = false } = {}) {
  const normalized = normalizeCredentials(credentials);
  if (!normalized) throw new Error("A conexão privada do Vox não está completa.");

  if (!forceRefresh && statusCache?.key === normalized.key && Date.now() - statusCache.cachedAt < VOX_STATUS_CACHE_MS) {
    return { ...statusCache, fromCache: true };
  }
  if (pendingRead?.key === normalized.key) return pendingRead.promise;

  const promise = refreshStatuses(normalized)
    .finally(() => {
      if (pendingRead?.promise === promise) pendingRead = null;
    });
  pendingRead = { key: normalized.key, promise };
  return promise;
}

async function refreshStatuses(credentials) {
  const startedAt = Date.now();
  let session = reusableSession(credentials);
  let page = session ? await requestStatusPage(session.cookies) : null;

  if (!page || !isUsableStatusPage(page)) {
    clearSession(credentials.key);
    session = await createSession(credentials);
    page = await requestStatusPage(session.cookies);
  }
  if (!isUsableStatusPage(page)) {
    clearSession(credentials.key);
    throw new Error("O Vox não autorizou a consulta de status dos DJs.");
  }

  const snapshot = {
    key: credentials.key,
    statuses: parseVoxDjStatusHtml(page.body),
    cachedAt: Date.now(),
    latencyMs: Date.now() - startedAt,
    fromCache: false,
  };
  statusCache = snapshot;
  return snapshot;
}

function normalizeCredentials(credentials) {
  const port = String(credentials?.port || "").trim();
  const password = String(credentials?.password || "");
  if (!port || !password) return null;
  return {
    port,
    password,
    key: createHash("sha256").update(`${port}\u0000${password}`).digest("base64url"),
  };
}

function reusableSession(credentials) {
  if (!sessionCache || sessionCache.key !== credentials.key || sessionCache.expiresAt <= Date.now()) return null;
  return sessionCache;
}

async function createSession(credentials) {
  const loginPage = await requestVox("/");
  const csrf = extractInputValue(loginPage.body, "csrf");
  if (!loginPage.ok || !csrf) throw new Error("O Vox não disponibilizou a confirmação de login.");

  const loginResponse = await requestVox("/login-autentica", {
    method: "POST",
    cookies: loginPage.cookies,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ porta: credentials.port, senha: credentials.password, csrf }).toString(),
  });
  const cookies = mergeCookies(loginPage.cookies, loginResponse.cookies);
  if (!cookies) throw new Error("O Vox não autorizou a conexão privada.");

  sessionCache = {
    key: credentials.key,
    cookies,
    expiresAt: Date.now() + VOX_SESSION_CACHE_MS,
  };
  return sessionCache;
}

function clearSession(key) {
  if (sessionCache?.key === key) sessionCache = null;
  if (statusCache?.key === key) statusCache = null;
}

async function requestStatusPage(cookies) {
  return requestVox("/gerenciar-djs", { cookies });
}

function isUsableStatusPage(page) {
  return Boolean(page?.ok && !isVoxLoginPage(page.body) && /login\s*(?:do\s*)?dj/i.test(stripTags(page.body)));
}

async function requestVox(path, { method = "GET", headers = {}, body, cookies = "" } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(new URL(path, `${VOX_BASE_URL}/`).href, {
      method,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "CNJM-Radio-Status/1.0",
        ...(cookies ? { cookie: cookies } : {}),
        ...headers,
      },
      body,
      redirect: "manual",
      signal: controller.signal,
    });
    return {
      ok: response.ok,
      location: response.headers.get("location"),
      cookies: responseCookies(response),
      body: await response.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractInputValue(html, name) {
  const escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const input = String(html || "").match(new RegExp(`<input[^>]+name=["']${escapedName}["'][^>]*>`, "i"))?.[0] || "";
  return decodeHtml(input.match(/\bvalue=["']([^"']*)["']/i)?.[1] || "");
}

function responseCookies(response) {
  const rawValues = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return rawValues
    .map((value) => String(value).match(/^\s*([^;]+)/)?.[1] || "")
    .filter(Boolean)
    .join("; ");
}

function mergeCookies(left, right) {
  const values = new Map();
  for (const entry of `${left || ""}; ${right || ""}`.split(";")) {
    const [name, ...parts] = entry.trim().split("=");
    if (name && parts.length) values.set(name, `${name}=${parts.join("=")}`);
  }
  return [...values.values()].join("; ");
}

function isVoxLoginPage(html) {
  return /login-autentica|name=["']senha["']/i.test(String(html || ""));
}

function cellsFromRow(html) {
  return [...String(html || "").matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => stripTags(match[1]));
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}
