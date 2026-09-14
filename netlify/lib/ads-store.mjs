import { getStore } from "@netlify/blobs";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const AD_BANNER_WIDTH = 1700;
export const AD_BANNER_HEIGHT = 450;
const MAX_ADS = 100;
const MAX_DJS = 100;
const PROGRAM_LOGO_MAX_SIZE = 2_500_000;
const PROGRAM_LOGO_MAX_DIMENSION = 1800;
const DJ_LOGO_SIZE = 512;
const MAX_MEDIA_SOURCE_SIZE = 5_000_000;
const MAX_MEDIA_PIXELS = 40_000_000;
const LIVE_TEST_DEFAULT_LISTENERS = 2;
const LIVE_TEST_DEFAULT_VISITORS = 49_823;
const LIVE_TEST_DEFAULT_LISTENERS_MIN = 2;
const LIVE_TEST_DEFAULT_LISTENERS_MAX = 12;
const LIVE_TEST_DEFAULT_MOVEMENT = 32;
const LIVE_TEST_DEFAULT_EXIT = 36;
const LIVE_TEST_DEFAULT_TRANSITION = 58;
const LIVE_TEST_DEFAULT_LIVE_BOOST = 65;
const LIVE_TEST_DEFAULT_GROWTH = 12;
const LIVE_TEST_MAX_LISTENERS = 999_999;
const LIVE_TEST_MAX_VISITORS = 9_999_999;
const LIVE_TEST_MAX_PERCENT = 200;
const LIVE_TEST_MAX_GROWTH_PERCENT = 100;
const LIVE_TEST_STATES = new Set(["online", "connecting", "offline", "live", "off"]);
const DJ_DETECTION_POLL_SECONDS = new Set([15, 30, 60]);
const DJ_DETECTION_EARLY_WINDOW_MINUTES = new Set([0, 15, 30, 45, 60]);
const DJ_PANEL_REFRESH_SECONDS = new Set([15, 30, 60]);
const DJ_DETECTION_MAX_CONFIRMATIONS = 5;
const DJ_TITLE_STALE_MS = 90 * 1000;
const AUDIENCE_DAY_IDS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ADS_BLOB_STORE = "cnjm-ad-images";
const CONTENT_BLOB_STORE = "cnjm-site-content";
const CONTENT_BLOB_KEY = "site-content-v1.json";
const CONTENT_MEMORY_TTL_MS = 30 * 1000;
const PUBLIC_DATA_CACHE_KEY = "public-data-cache-v1.json";
const PUBLIC_DATA_MEMORY_TTL_MS = 15 * 60 * 1000;
const PUBLIC_DJS_CACHE_KEY = "public-djs-cache-v1.json";
const PUBLIC_DJS_MEMORY_TTL_MS = 30 * 60 * 1000;
const LIVE_STATUS_PUBLIC_CACHE_KEY = "public-live-status-cache-v1.json";
const LIVE_STATUS_MEMORY_TTL_MS = 5 * 60 * 1000;
const IMAGE_CONTENT_TYPES = new Set(["image/webp"]);
const SOURCE_IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const IS_LOCAL_NETLIFY_DEV = process.env.NETLIFY_DEV === "true";
const LEGACY_ADMIN_LOGIN = "AdminRoots";
const LEGACY_ADMIN_PASSWORD_HASH = "3365305e71f599bc6859e66c1c02d2f1e546010adc10f02e3b3364ebf1241b33";
const ADMIN_LOGIN = process.env.CNJM_ADS_ADMIN_LOGIN || LEGACY_ADMIN_LOGIN;
const ADMIN_PASSWORD_HASH =
  process.env.CNJM_ADS_ADMIN_PASSWORD_HASH ||
  (process.env.CNJM_ADS_ADMIN_PASSWORD
    ? sha256Hex(process.env.CNJM_ADS_ADMIN_PASSWORD)
    : LEGACY_ADMIN_PASSWORD_HASH);
const ADMIN_TOKEN_SEED = firstEnv(["SITE_ID", "NETLIFY_SITE_ID", "NETLIFY_BLOBS_SITE_ID"]);
const ADMIN_TOKEN =
  process.env.CNJM_ADS_ADMIN_TOKEN ||
  ((ADMIN_TOKEN_SEED || IS_LOCAL_NETLIFY_DEV) ? sha256Hex(`${ADMIN_PASSWORD_HASH}:${ADMIN_TOKEN_SEED || "local-dev"}`) : "");
const BLOB_SITE_ID_ENV_KEYS = ["NETLIFY_BLOBS_SITE_ID", "NETLIFY_BLOBS_SITEID", "NETLIFY_SITE_ID", "SITE_ID"];
const BLOB_TOKEN_ENV_KEYS = ["NETLIFY_BLOBS_TOKEN", "NETLIFY_AUTH_TOKEN", "NETLIFY_API_TOKEN"];
const DAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LABELS = {
  Sun: "Domingo",
  Mon: "Segunda",
  Tue: "Terça",
  Wed: "Quarta",
  Thu: "Quinta",
  Fri: "Sexta",
  Sat: "Sábado",
};

let publicDataMemoryCache = null;
let publicDjsMemoryCache = null;
let liveStatusMemoryCache = null;
let siteContentMemoryCache = null;
let siteContentWriteQueue = Promise.resolve();
let sharpLoader = null;

async function loadSharp() {
  if (!sharpLoader) {
    sharpLoader = import("sharp")
      .then((module) => module.default)
      .catch((error) => {
        sharpLoader = null;
        throw new Error("O conversor de imagens não está disponível nesta implantação.", { cause: error });
      });
  }

  return sharpLoader;
}

function firstEnv(keys) {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }

  return "";
}

function manualBlobConfig() {
  const siteID = firstEnv(BLOB_SITE_ID_ENV_KEYS);
  const token = firstEnv(BLOB_TOKEN_ENV_KEYS);

  return siteID && token ? { siteID, token } : null;
}

function blobConfigError() {
  return new Error(
    "Netlify Blobs ainda não está configurado para uploads. Adicione NETLIFY_BLOBS_SITE_ID com o Project ID e NETLIFY_BLOBS_TOKEN com um Personal Access Token nas variáveis de ambiente do Netlify.",
  );
}

function adImageStore() {
  return namedBlobStore(ADS_BLOB_STORE);
}

function siteContentStore() {
  return namedBlobStore(CONTENT_BLOB_STORE);
}

function namedBlobStore(name) {
  try {
    const manualConfig = manualBlobConfig();
    return manualConfig ? getStore({ name, ...manualConfig }) : getStore(name);
  } catch (error) {
    if (error?.name === "MissingBlobsEnvironmentError") {
      throw blobConfigError();
    }

    throw error;
  }
}

async function readPublicDataCache() {
  if (
    publicDataMemoryCache?.data &&
    Date.now() - publicDataMemoryCache.savedAt < PUBLIC_DATA_MEMORY_TTL_MS
  ) {
    return publicDataMemoryCache.data;
  }

  try {
    const cache = await adImageStore().get(PUBLIC_DATA_CACHE_KEY, { type: "json" });
    if (!cache || typeof cache !== "object") return null;

    publicDataMemoryCache = {
      data: cache,
      savedAt: Date.now(),
    };
    return cache;
  } catch {
    return null;
  }
}

async function writePublicDataCache(payload) {
  const cachePayload = {
    version: 1,
    cachedAt: new Date().toISOString(),
    ...payload,
  };

  publicDataMemoryCache = {
    data: cachePayload,
    savedAt: Date.now(),
  };

  try {
    await adImageStore().setJSON(PUBLIC_DATA_CACHE_KEY, cachePayload);
  } catch {
    // The canonical content document remains available even if this public cache cannot update.
  }
}

async function readPublicDjsCache() {
  if (
    Array.isArray(publicDjsMemoryCache?.data) &&
    Date.now() - publicDjsMemoryCache.savedAt < PUBLIC_DJS_MEMORY_TTL_MS
  ) {
    return publicDjsMemoryCache.data;
  }

  try {
    const cache = await adImageStore().get(PUBLIC_DJS_CACHE_KEY, { type: "json" });
    if (!Array.isArray(cache?.djs)) return null;
    const djs = cache.djs.map(serializePublicDj).slice(0, MAX_DJS);

    publicDjsMemoryCache = {
      data: djs,
      savedAt: Date.now(),
    };
    return djs;
  } catch {
    return null;
  }
}

async function writePublicDjsCache(djs) {
  const normalized = Array.isArray(djs) ? djs.map(serializePublicDj).slice(0, MAX_DJS) : [];
  publicDjsMemoryCache = {
    data: normalized,
    savedAt: Date.now(),
  };

  try {
    await adImageStore().setJSON(PUBLIC_DJS_CACHE_KEY, {
      version: 1,
      cachedAt: new Date().toISOString(),
      djs: normalized,
    });
  } catch {
    // Public reads can still use in-memory cache or fallback sources.
  }
}

async function readLiveStatusCache() {
  if (
    liveStatusMemoryCache?.data &&
    Date.now() - liveStatusMemoryCache.savedAt < LIVE_STATUS_MEMORY_TTL_MS
  ) {
    return liveStatusMemoryCache.data;
  }

  try {
    const cache = await adImageStore().get(LIVE_STATUS_PUBLIC_CACHE_KEY, { type: "json" });
    if (!cache || typeof cache !== "object") return null;

    const liveStatusTest = cache.liveStatusTest && typeof cache.liveStatusTest === "object"
      ? serializeLiveStatus(cache.liveStatusTest)
      : null;
    if (!liveStatusTest) return null;

    liveStatusMemoryCache = {
      data: liveStatusTest,
      savedAt: Date.now(),
    };
    return liveStatusTest;
  } catch {
    return null;
  }
}

async function writeLiveStatusCache(liveStatusTest) {
  const normalized = serializeLiveStatus(liveStatusTest);
  liveStatusMemoryCache = {
    data: normalized,
    savedAt: Date.now(),
  };

  try {
    await adImageStore().setJSON(LIVE_STATUS_PUBLIC_CACHE_KEY, {
      version: 1,
      cachedAt: new Date().toISOString(),
      liveStatusTest: normalized,
    });
  } catch {
    // The canonical content document remains available even if this public cache cannot update.
  }
}

function defaultSiteContent() {
  return {
    version: 5,
    updatedAt: new Date().toISOString(),
    mediaMigrationVersion: 0,
    ads: [],
    settings: serializeSettings(null),
    programs: defaultProgramRows().map(serializeProgram),
    djs: [],
    liveStatusTest: defaultLiveStatus(),
    djDetectionState: defaultDjDetectionState(),
    voxIntegration: defaultVoxIntegration(),
  };
}

function serializeSiteContent(value = {}) {
  const defaults = defaultSiteContent();
  const liveStatusTest = serializeLiveStatus(value.liveStatusTest || defaults.liveStatusTest);
  const djs = consolidateLegacyDjConfiguration(
    Array.isArray(value.djs) ? value.djs.map(serializeDj).slice(0, MAX_DJS) : defaults.djs,
    liveStatusTest,
  );
  return {
    version: 5,
    updatedAt: iso(value.updatedAt) || new Date().toISOString(),
    mediaMigrationVersion: Number(value.mediaMigrationVersion || 0) >= 1 ? 1 : 0,
    ads: Array.isArray(value.ads) ? value.ads.map(serializeAd).slice(0, MAX_ADS) : defaults.ads,
    settings: serializeSettings(value.settings),
    programs: Array.isArray(value.programs)
      ? value.programs.map(serializeProgram).slice(0, MAX_ADS).sort(sortPrograms)
      : defaults.programs,
    djs,
    liveStatusTest: clearLegacyDjConfiguration(liveStatusTest, djs),
    djDetectionState: normalizeDjDetectionState(value.djDetectionState),
    voxIntegration: serializeVoxIntegration(value.voxIntegration),
  };
}

function cloneSiteContent(content) {
  return JSON.parse(JSON.stringify(content));
}

async function createContentFromLegacyBlobs() {
  const [legacyPublic, legacyDjs, legacyLive] = await Promise.all([
    readPublicDataCache(),
    readPublicDjsCache(),
    readLiveStatusCache(),
  ]);

  return serializeSiteContent({
    ads: legacyPublic?.ads,
    settings: legacyPublic?.settings,
    programs: legacyPublic?.programs,
    djs: Array.isArray(legacyPublic?.djs) && legacyPublic.djs.length ? legacyPublic.djs : legacyDjs,
    liveStatusTest: legacyLive,
  });
}

async function readSiteContent({ forceRefresh = false } = {}) {
  if (
    !forceRefresh &&
    siteContentMemoryCache?.content &&
    Date.now() - siteContentMemoryCache.savedAt < CONTENT_MEMORY_TTL_MS
  ) {
    return siteContentMemoryCache.content;
  }

  const stored = await siteContentStore().get(CONTENT_BLOB_KEY, { type: "json" });
  const content = stored && typeof stored === "object"
    ? serializeSiteContent(stored)
    : await createContentFromLegacyBlobs();

  if (!stored) {
    await siteContentStore().setJSON(CONTENT_BLOB_KEY, content);
  }

  siteContentMemoryCache = {
    content,
    savedAt: Date.now(),
  };
  return content;
}

async function publishSiteContent(content, scope = "all") {
  if (scope === "none") return;
  if (scope === "live") {
    await writeLiveStatusCache(content.liveStatusTest);
    return;
  }

  const now = new Date();
  const ads = visibleAds(content.ads, now);
  const allDjs = content.djs.filter((dj) => dj.active).map(serializeDj).slice(0, MAX_DJS);
  const djs = allDjs.map(serializePublicDj);
  const programs = programsData(content.programs, { publicOnly: true, djs: allDjs }).programs;

  await Promise.all([
    writePublicDataCache({ ads, settings: content.settings, programs, djs }),
    writePublicDjsCache(djs),
    writeLiveStatusCache(content.liveStatusTest),
  ]);
}

function sameSiteContent(left, right) {
  const normalizeForComparison = (content) => {
    const normalized = cloneSiteContent(serializeSiteContent(content));
    delete normalized.updatedAt;
    return normalized;
  };
  return JSON.stringify(normalizeForComparison(left)) === JSON.stringify(normalizeForComparison(right));
}

async function updateSiteContent(mutator, { publish = "all" } = {}) {
  const write = async () => {
    const current = await readSiteContent({ forceRefresh: true });
    const next = serializeSiteContent(await mutator(cloneSiteContent(current)));
    if (sameSiteContent(current, next)) return current;
    next.updatedAt = new Date().toISOString();
    await siteContentStore().setJSON(CONTENT_BLOB_KEY, next);
    siteContentMemoryCache = {
      content: next,
      savedAt: Date.now(),
    };
    await publishSiteContent(next, publish);
    return next;
  };

  const task = siteContentWriteQueue.then(write, write);
  siteContentWriteQueue = task.catch(() => undefined);
  return task;
}

function normalizeOptionalUrl(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";

  try {
    const url = new URL(clean);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return clean.startsWith("/api/ads/image/") ? clean : "";
  }
}

function normalizeManagedImageUrl(value) {
  const clean = String(value || "").trim();
  return clean.startsWith("/api/ads/image/") ? clean : "";
}

function normalizeWebpImageKey(value) {
  const clean = String(value || "").trim().replace(/^\/+/, "");
  return clean.toLowerCase().endsWith(".webp") && !clean.includes("..") ? clean : "";
}

function assertManagedWebpImage(imageUrl, imageKey, imageContentType, label) {
  if (!imageUrl && !imageKey) return;
  if (!normalizeManagedImageUrl(imageUrl) || !normalizeWebpImageKey(imageKey) || String(imageContentType || "").toLowerCase() !== "image/webp") {
    throw new Error(`${label} precisa ser importada para o Blob em WebP antes de salvar.`);
  }
}

function isSupportedImageContentType(contentType) {
  return IMAGE_CONTENT_TYPES.has(String(contentType || "").toLowerCase());
}

function imageExtensionForContentType(contentType) {
  return String(contentType || "").toLowerCase() === "image/webp" ? "webp" : "png";
}

function imageContentTypeFromKey(key) {
  return String(key || "").toLowerCase().endsWith(".webp") ? "image/webp" : "image/png";
}

async function deleteStoredImage(key) {
  const safeKey = String(key || "").replace(/^\/+/, "");
  if (!safeKey || safeKey.includes("..")) return;

  try {
    await adImageStore().delete(safeKey);
  } catch {
    // Storage cleanup should never block saving metadata.
  }
}

function normalizePlacement(value) {
  return value === "program" ? "program" : "commercial";
}

function normalizeIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function defaultVoxIntegration() {
  return {
    enabled: false,
    port: "",
    passwordCiphertext: "",
    updatedAt: null,
  };
}

function normalizeVoxPort(value) {
  const port = String(value || "").trim();
  const numeric = Number(port);
  return /^\d{2,5}$/.test(port) && Number.isInteger(numeric) && numeric > 0 && numeric <= 65_535 ? port : "";
}

function normalizeVoxDjLogin(value) {
  const login = String(value || "").trim().toLowerCase();
  return /^[a-z0-9._-]{1,64}$/.test(login) ? login : "";
}

function serializeVoxIntegration(value) {
  const item = value && typeof value === "object" ? value : {};
  const passwordCiphertext = String(item.passwordCiphertext || "").trim();
  return {
    enabled: item.enabled === true,
    port: normalizeVoxPort(item.port),
    passwordCiphertext: /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(passwordCiphertext)
      ? passwordCiphertext
      : "",
    updatedAt: iso(item.updatedAt),
  };
}

function voxEncryptionKey() {
  const encoded = String(process.env.CNJM_VOX_CREDENTIALS_ENCRYPTION_KEY || "").trim();
  if (!encoded) {
    throw new Error("Defina CNJM_VOX_CREDENTIALS_ENCRYPTION_KEY antes de salvar a senha do Vox.");
  }

  const key = /^[a-f0-9]{64}$/i.test(encoded)
    ? Buffer.from(encoded, "hex")
    : Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("CNJM_VOX_CREDENTIALS_ENCRYPTION_KEY precisa ter 32 bytes em Base64 ou hexadecimal.");
  }
  return key;
}

function encryptVoxPassword(password) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", voxEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptVoxPassword(ciphertext) {
  const parts = String(ciphertext || "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("A senha protegida do Vox é inválida.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", voxEncryptionKey(), Buffer.from(parts[1], "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Não foi possível ler a senha protegida do Vox. Confira a chave privada do ambiente.");
  }
}

function publicVoxIntegrationStatus(value) {
  const integration = serializeVoxIntegration(value);
  let encryptionReady = false;
  try {
    voxEncryptionKey();
    encryptionReady = true;
  } catch {
    // The UI should guide the administrator without exposing a secret or its validation details.
  }
  return {
    enabled: integration.enabled,
    port: integration.port,
    passwordConfigured: Boolean(integration.passwordCiphertext),
    encryptionReady,
    updatedAt: integration.updatedAt,
  };
}

export function normalizeAdPayload(ad = {}) {
  const now = new Date();

  return {
    id: String(ad.id || randomUUID()),
    title: String(ad.title || "").trim(),
    description: String(ad.description || "").trim(),
    imageUrl: normalizeOptionalUrl(ad.imageUrl || ""),
    imageKey: String(ad.imageKey || "").trim(),
    imageWidth: Number.isFinite(Number(ad.imageWidth)) ? Number(ad.imageWidth) : null,
    imageHeight: Number.isFinite(Number(ad.imageHeight)) ? Number(ad.imageHeight) : null,
    imageContentType: ad.imageContentType ? String(ad.imageContentType) : null,
    imageSize: Number.isFinite(Number(ad.imageSize)) ? Number(ad.imageSize) : null,
    linkUrl: normalizeOptionalUrl(ad.linkUrl || ""),
    buttonLabel: String(ad.buttonLabel || "Abrir anúncio").trim(),
    placement: normalizePlacement(ad.placement),
    section: String(ad.section || "Principal").trim(),
    active: ad.active !== false,
    impressions: Math.max(0, Number(ad.impressions ?? 0) || 0),
    clicks: Math.max(0, Number(ad.clicks ?? 0) || 0),
    sortOrder: Number.isFinite(Number(ad.sortOrder)) ? Number(ad.sortOrder) : 0,
    startsAt: normalizeIso(ad.startsAt),
    endsAt: normalizeIso(ad.endsAt),
    createdAt: normalizeIso(ad.createdAt) || now,
    updatedAt: now,
  };
}

export function normalizeSettingsPayload(settings = {}) {
  return {
    id: "global",
    enabled: settings.enabled !== false,
    scheduleEnabled: Boolean(settings.scheduleEnabled),
    startTime: /^\d{2}:\d{2}$/.test(settings.startTime || "") ? settings.startTime : "08:00",
    endTime: /^\d{2}:\d{2}$/.test(settings.endTime || "") ? settings.endTime : "22:00",
    commercialRuns: normalizeRunCount(settings.commercialRuns, 3, 1, 12),
    programRuns: normalizeRunCount(settings.programRuns, 1, 0, 6),
    updatedAt: new Date(),
  };
}

export function normalizeProgramPayload(program = {}) {
  const now = new Date();
  const dayId = DAY_ORDER.includes(program.dayId) ? program.dayId : "Mon";

  return {
    id: String(program.id || randomUUID()),
    dayId,
    dayLabel: DAY_LABELS[dayId],
    startTime: /^\d{2}:\d{2}$/.test(program.startTime || "") ? program.startTime : "00:00",
    endTime: /^\d{2}:\d{2}$/.test(program.endTime || "") ? program.endTime : "23:59",
    program: String(program.program || "").trim(),
    host: String(program.host || "Web Rádio Conexão Jamaica").trim(),
    logoUrl: normalizeOptionalUrl(program.logoUrl || ""),
    logoKey: String(program.logoKey || "").trim(),
    active: program.active !== false,
    sortOrder: Number.isFinite(Number(program.sortOrder)) ? Number(program.sortOrder) : 0,
    createdAt: normalizeIso(program.createdAt) || now,
    updatedAt: now,
  };
}

export function normalizeDjPayload(dj = {}) {
  const now = new Date();
  const signatures = Array.isArray(dj.signatures)
    ? dj.signatures.join("\n")
    : String(dj.signatures || "");
  const listenersMin = normalizeRunCount(dj.listenersMin, 60, 0, LIVE_TEST_MAX_LISTENERS);

  return {
    id: String(dj.id || randomUUID()),
    signatures: normalizeDjSignatures(signatures).join("\n"),
    djName: String(dj.djName || "").trim(),
    programName: String(dj.programName || "").trim(),
    voxLogin: normalizeVoxDjLogin(dj.voxLogin),
    logoUrl: normalizeManagedImageUrl(dj.logoUrl || ""),
    logoKey: normalizeWebpImageKey(dj.logoKey || ""),
    logoWidth: normalizeRunCount(dj.logoWidth, 0, 0, DJ_LOGO_SIZE),
    logoHeight: normalizeRunCount(dj.logoHeight, 0, 0, DJ_LOGO_SIZE),
    logoContentType: String(dj.logoContentType || "").toLowerCase() === "image/webp" ? "image/webp" : "",
    logoSize: normalizeRunCount(dj.logoSize, 0, 0, PROGRAM_LOGO_MAX_SIZE),
    scheduleEnabled: dj.scheduleEnabled === true,
    dayIds: normalizeAudienceDayIds(dj.dayIds),
    startTime: normalizeTime(dj.startTime, "18:00"),
    endTime: normalizeTime(dj.endTime, "23:59"),
    listenersMin,
    listenersMax: normalizeRunCount(dj.listenersMax, Math.max(listenersMin, 160), listenersMin, LIVE_TEST_MAX_LISTENERS),
    active: dj.active !== false,
    sortOrder: Number.isFinite(Number(dj.sortOrder)) ? Number(dj.sortOrder) : 0,
    createdAt: normalizeIso(dj.createdAt) || now,
    updatedAt: now,
  };
}

export function normalizeLiveStatusPayload(payload = {}) {
  const legacyState = LIVE_TEST_STATES.has(String(payload.state)) ? String(payload.state) : "off";
  const enabled = typeof payload.enabled === "boolean" ? payload.enabled : legacyState !== "off";
  const legacyListeners = normalizeRunCount(payload.listeners, LIVE_TEST_DEFAULT_LISTENERS, 0, LIVE_TEST_MAX_LISTENERS);
  const listenersMin = normalizeRunCount(
    payload.listenersMin,
    Math.max(0, Math.round(legacyListeners * 0.82)) || LIVE_TEST_DEFAULT_LISTENERS_MIN,
    0,
    LIVE_TEST_MAX_LISTENERS,
  );
  const listenersMax = normalizeRunCount(
    payload.listenersMax,
    Math.max(listenersMin, Math.round(legacyListeners * 1.18), LIVE_TEST_DEFAULT_LISTENERS_MAX),
    listenersMin,
    LIVE_TEST_MAX_LISTENERS,
  );
  const visitorBase = normalizeRunCount(
    payload.visitorBase ?? payload.visitors,
    LIVE_TEST_DEFAULT_VISITORS,
    0,
    LIVE_TEST_MAX_VISITORS,
  );
  const visitorGrowthPercent = normalizeRunCount(
    payload.visitorGrowthPercent ?? payload.growthPercent,
    LIVE_TEST_DEFAULT_GROWTH,
    0,
    LIVE_TEST_MAX_GROWTH_PERCENT,
  );
  const updatedAt = normalizeIso(payload.updatedAt) || new Date();

  return {
    mode: "audience",
    enabled,
    state: enabled ? "online" : "off",
    djName: String(payload.djName || "DJ Leo").trim(),
    programName: String(payload.programName || "Roots Strike").trim(),
    listeners: legacyListeners,
    visitors: visitorBase,
    listenersMin,
    listenersMax,
    visitorBase,
    visitorTarget: normalizeNullableRunCount(payload.visitorTarget, visitorBase, LIVE_TEST_MAX_VISITORS),
    movementPercent: normalizeRunCount(payload.movementPercent, LIVE_TEST_DEFAULT_MOVEMENT, 0, LIVE_TEST_MAX_PERCENT),
    exitPercent: normalizeRunCount(payload.exitPercent, LIVE_TEST_DEFAULT_EXIT, 0, LIVE_TEST_MAX_PERCENT),
    transitionPercent: normalizeRunCount(payload.transitionPercent, LIVE_TEST_DEFAULT_TRANSITION, 0, 100),
    liveBoostPercent: normalizeRunCount(payload.liveBoostPercent, LIVE_TEST_DEFAULT_LIVE_BOOST, 0, LIVE_TEST_MAX_PERCENT),
    growthPercent: visitorGrowthPercent,
    visitorGrowthPercent,
    rampFromListeners: normalizeRunCount(payload.rampFromListeners, legacyListeners, 0, LIVE_TEST_MAX_LISTENERS),
    rampFromVisitors: normalizeRunCount(payload.rampFromVisitors, visitorBase, 0, LIVE_TEST_MAX_VISITORS),
    seed: normalizeRunCount(payload.seed, 731, 1, 999_999),
    appliedAt: normalizeIso(payload.appliedAt) || updatedAt,
    visitorAppliedAt: normalizeIso(payload.visitorAppliedAt) || null,
    updatedAt,
    scheduleProfiles: normalizeAudienceScheduleProfiles(payload.scheduleProfiles),
    djProfiles: normalizeAudienceDjProfiles(payload.djProfiles),
    liveDjControl: normalizeLiveDjControl(payload.liveDjControl),
    djDetectionConfig: normalizeDjDetectionConfig(payload.djDetectionConfig),
    djSkips: normalizeDjSkips(payload.djSkips),
  };
}

function defaultDjDetectionConfig() {
  return {
    enabled: true,
    pollSeconds: 15,
    earlyWindowMinutes: 30,
    panelRefreshSeconds: 30,
    enterConfirmations: 3,
    exitConfirmations: 2,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDjDetectionConfig(value) {
  const item = value && typeof value === "object" ? value : {};
  const pollSeconds = Number(item.pollSeconds);
  const earlyWindowMinutes = Number(item.earlyWindowMinutes);
  const panelRefreshSeconds = Number(item.panelRefreshSeconds);
  return {
    enabled: item.enabled !== false,
    pollSeconds: DJ_DETECTION_POLL_SECONDS.has(pollSeconds) ? pollSeconds : 15,
    earlyWindowMinutes: DJ_DETECTION_EARLY_WINDOW_MINUTES.has(earlyWindowMinutes) ? earlyWindowMinutes : 30,
    panelRefreshSeconds: DJ_PANEL_REFRESH_SECONDS.has(panelRefreshSeconds) ? panelRefreshSeconds : 30,
    enterConfirmations: normalizeRunCount(item.enterConfirmations, 3, 1, DJ_DETECTION_MAX_CONFIRMATIONS),
    exitConfirmations: normalizeRunCount(item.exitConfirmations, 2, 1, DJ_DETECTION_MAX_CONFIRMATIONS),
    updatedAt: iso(item.updatedAt) || new Date().toISOString(),
  };
}

function defaultDjDetectionState() {
  return {
    mode: "waiting",
    djId: null,
    enterCount: 0,
    exitCount: 0,
    confidence: 0,
    activation: null,
    classification: null,
    source: "none",
    expectedEndAt: null,
    overrunAcknowledgedAt: null,
    forceEnded: false,
    lastMusicFingerprint: null,
    musicFingerprintSinceAt: null,
    exitMusicFingerprint: null,
    streamFingerprint: null,
    titleStale: false,
    streamChanged: false,
    signals: [],
    observedAt: null,
    latencyMs: null,
    lastError: null,
    voxUnavailable: false,
    lastTransition: null,
    lastTransitionAt: null,
    lastTransitionReason: null,
    updatedAt: null,
  };
}

function normalizeDjDetectionState(value) {
  const item = value && typeof value === "object" ? value : {};
  const mode = ["waiting", "entering", "live", "leaving", "overrun"].includes(item.mode) ? item.mode : "waiting";
  const classification = ["music", "no-metadata", "unknown"].includes(item.classification)
    ? item.classification
    : null;
  const source = ["metadata", "shoutcast", "marker", "confirmation", "vox", "none"].includes(item.source) ? item.source : "none";
  return {
    mode,
    djId: item.djId ? String(item.djId).trim() : null,
    enterCount: normalizeRunCount(item.enterCount, 0, 0, DJ_DETECTION_MAX_CONFIRMATIONS),
    exitCount: normalizeRunCount(item.exitCount, 0, 0, DJ_DETECTION_MAX_CONFIRMATIONS),
    confidence: normalizeRunCount(item.confidence, 0, 0, 100),
    activation: ["automatic", "marker", "confirmation", "vox"].includes(item.activation) ? item.activation : null,
    classification,
    source,
    expectedEndAt: iso(item.expectedEndAt),
    overrunAcknowledgedAt: iso(item.overrunAcknowledgedAt),
    forceEnded: item.forceEnded === true,
    lastMusicFingerprint: String(item.lastMusicFingerprint || "").trim().slice(0, 128) || null,
    musicFingerprintSinceAt: iso(item.musicFingerprintSinceAt),
    exitMusicFingerprint: String(item.exitMusicFingerprint || "").trim().slice(0, 128) || null,
    streamFingerprint: String(item.streamFingerprint || "").trim().slice(0, 128) || null,
    titleStale: item.titleStale === true,
    streamChanged: item.streamChanged === true,
    signals: Array.isArray(item.signals) ? item.signals.map(String).filter(Boolean).slice(0, 8) : [],
    observedAt: iso(item.observedAt),
    latencyMs: Number.isFinite(Number(item.latencyMs)) ? Math.max(0, Math.round(Number(item.latencyMs))) : null,
    lastError: String(item.lastError || "").trim().slice(0, 240) || null,
    voxUnavailable: item.voxUnavailable === true,
    lastTransition: String(item.lastTransition || "").trim().slice(0, 120) || null,
    lastTransitionAt: iso(item.lastTransitionAt),
    lastTransitionReason: String(item.lastTransitionReason || "").trim().slice(0, 180) || null,
    updatedAt: iso(item.updatedAt),
  };
}

function detectionStateWithTransition(previous, next, nowMs, explicit = null) {
  const before = normalizeDjDetectionState(previous);
  const after = normalizeDjDetectionState(next);
  const startedLive = !isLiveDetectionMode(before.mode) && isLiveDetectionMode(after.mode);
  const endedLive = isLiveDetectionMode(before.mode) && !isLiveDetectionMode(after.mode);
  const becameOverrun = before.mode !== "overrun" && after.mode === "overrun";
  const voxUnavailable = after.voxUnavailable && !before.voxUnavailable;
  let transition = explicit;

  if (!transition && startedLive) {
    transition = after.activation === "vox"
      ? { label: "DJ conectado", reason: "Conexão confirmada pelo Vox" }
      : after.activation === "confirmation"
        ? { label: "Entrada confirmada", reason: "Ação do painel" }
        : after.activation === "marker"
          ? { label: "DJ conectado", reason: "Marcador reconhecido" }
          : { label: "DJ conectado", reason: "Detecção confirmada" };
  } else if (!transition && endedLive) {
    transition = after.classification === "music"
      ? { label: "AutoDJ confirmado", reason: "Música normal voltou" }
      : { label: "Sessão encerrada", reason: "Transmissão deixou de estar ativa" };
  } else if (!transition && becameOverrun) {
    transition = { label: "Horário excedido", reason: "O DJ segue conectado após o fim previsto" };
  } else if (!transition && voxUnavailable) {
    transition = { label: "Vox indisponível", reason: "A detecção seguirá pela contingência segura" };
  }

  if (!transition) return after;
  return {
    ...after,
    lastTransition: transition.label,
    lastTransitionReason: transition.reason,
    lastTransitionAt: new Date(nowMs).toISOString(),
  };
}

function normalizeDjSkips(value) {
  if (!Array.isArray(value)) return [];
  const nowMs = Date.now();
  return value
    .map((item) => ({
      djId: String(item?.djId || "").trim(),
      occurrenceKey: String(item?.occurrenceKey || "").trim(),
      expiresAt: iso(item?.expiresAt),
    }))
    .filter((item) => item.djId && /^\d{4}-\d{2}-\d{2}$/.test(item.occurrenceKey) && item.expiresAt && Date.parse(item.expiresAt) > nowMs)
    .slice(0, MAX_DJS);
}

function serializeAd(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    imageKey: row.imageKey,
    imageWidth: row.imageWidth,
    imageHeight: row.imageHeight,
    imageContentType: row.imageContentType,
    imageSize: row.imageSize,
    linkUrl: row.linkUrl,
    buttonLabel: row.buttonLabel,
    placement: normalizePlacement(row.placement),
    section: row.section,
    active: Boolean(row.active),
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    sortOrder: Number(row.sortOrder || 0),
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    createdAt: iso(row.createdAt) || new Date().toISOString(),
    updatedAt: iso(row.updatedAt) || new Date().toISOString(),
  };
}

function serializeSettings(row) {
  return {
    enabled: row?.enabled !== false,
    scheduleEnabled: Boolean(row?.scheduleEnabled),
    startTime: row?.startTime || "08:00",
    endTime: row?.endTime || "22:00",
    commercialRuns: normalizeRunCount(row?.commercialRuns, 3, 1, 12),
    programRuns: normalizeRunCount(row?.programRuns, 1, 0, 6),
  };
}

function serializeProgram(row) {
  const dayId = DAY_ORDER.includes(row?.dayId) ? row.dayId : "Mon";

  return {
    id: row.id,
    dayId,
    dayLabel: DAY_LABELS[dayId],
    startTime: row.startTime || "00:00",
    endTime: row.endTime || "23:59",
    program: row.program || "Programação musical",
    host: row.host || "Web Rádio Conexão Jamaica",
    logoUrl: row.logoUrl || "",
    logoKey: row.logoKey || "",
    active: Boolean(row.active),
    sortOrder: Number(row.sortOrder || 0),
    createdAt: iso(row.createdAt) || new Date().toISOString(),
    updatedAt: iso(row.updatedAt) || new Date().toISOString(),
  };
}

function serializeDj(row) {
  const listenersMin = normalizeRunCount(row.listenersMin, 60, 0, LIVE_TEST_MAX_LISTENERS);
  return {
    id: row.id,
    signatures: normalizeDjSignatures(row.signatures || "").join("\n"),
    djName: row.djName || "",
    programName: row.programName || "",
    voxLogin: normalizeVoxDjLogin(row.voxLogin),
    logoUrl: normalizeManagedImageUrl(row.logoUrl || ""),
    logoKey: normalizeWebpImageKey(row.logoKey || ""),
    logoWidth: normalizeRunCount(row.logoWidth, 0, 0, DJ_LOGO_SIZE),
    logoHeight: normalizeRunCount(row.logoHeight, 0, 0, DJ_LOGO_SIZE),
    logoContentType: String(row.logoContentType || "").toLowerCase() === "image/webp" ? "image/webp" : "",
    logoSize: normalizeRunCount(row.logoSize, 0, 0, PROGRAM_LOGO_MAX_SIZE),
    scheduleEnabled: row.scheduleEnabled === true,
    dayIds: normalizeAudienceDayIds(row.dayIds),
    startTime: normalizeTime(row.startTime, "18:00"),
    endTime: normalizeTime(row.endTime, "23:59"),
    listenersMin,
    listenersMax: normalizeRunCount(row.listenersMax, Math.max(listenersMin, 160), listenersMin, LIVE_TEST_MAX_LISTENERS),
    active: Boolean(row.active),
    sortOrder: Number(row.sortOrder || 0),
    createdAt: iso(row.createdAt) || new Date().toISOString(),
    updatedAt: iso(row.updatedAt) || new Date().toISOString(),
  };
}

function serializePublicDj(row) {
  const { voxLogin: _voxLogin, ...publicDj } = serializeDj(row);
  return publicDj;
}

function serializeLiveStatus(row) {
  const config = parseStoredAudienceConfig(row?.config);
  const normalized = normalizeLiveStatusPayload({
    enabled: row?.enabled,
    mode: row?.mode,
    state: row?.state,
    djName: row?.djName,
    programName: row?.programName,
    listeners: row?.listeners,
    visitors: row?.visitors,
    listenersMin: row?.listenersMin,
    listenersMax: row?.listenersMax,
    visitorBase: row?.visitorBase,
    visitorTarget: row?.visitorTarget,
    movementPercent: row?.movementPercent,
    exitPercent: row?.exitPercent,
    transitionPercent: row?.transitionPercent,
    liveBoostPercent: row?.liveBoostPercent,
    growthPercent: row?.growthPercent,
    visitorGrowthPercent: row?.visitorGrowthPercent,
    rampFromListeners: row?.rampFromListeners,
    rampFromVisitors: row?.rampFromVisitors,
    seed: row?.seed,
    appliedAt: row?.appliedAt,
    visitorAppliedAt: row?.visitorAppliedAt,
    updatedAt: row?.updatedAt,
    scheduleProfiles: row?.scheduleProfiles,
    djProfiles: row?.djProfiles,
    liveDjControl: row?.liveDjControl,
    djDetectionConfig: row?.djDetectionConfig,
    djSkips: row?.djSkips,
    ...config,
  });

  return {
    ...normalized,
    appliedAt: iso(normalized.appliedAt) || new Date().toISOString(),
    updatedAt: iso(normalized.updatedAt) || new Date().toISOString(),
  };
}

function consolidateLegacyDjConfiguration(existingDjs, liveStatusTest) {
  const djs = Array.isArray(existingDjs) ? existingDjs.map(serializeDj) : [];
  const legacySchedules = liveStatusTest?.liveDjControl?.schedules || [];
  const legacyProfiles = liveStatusTest?.djProfiles || [];

  for (const schedule of legacySchedules) {
    const index = findLegacyDjIndex(djs, schedule);
    const current = index >= 0 ? djs[index] : null;
    const next = normalizeDjPayload({
      ...current,
      id: current?.id || schedule.stationDjId || undefined,
      djName: current?.djName || schedule.djName,
      programName: current?.programName || schedule.programName,
      active: current?.active !== false,
      scheduleEnabled: schedule.enabled !== false,
      dayIds: schedule.dayIds,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      createdAt: current?.createdAt,
    });
    if (!next.djName || !next.programName) continue;
    if (index >= 0) djs[index] = serializeDj(next);
    else djs.push(serializeDj(next));
  }

  for (const profile of legacyProfiles) {
    const index = findLegacyDjIndex(djs, profile);
    const current = index >= 0 ? djs[index] : null;
    const next = normalizeDjPayload({
      ...current,
      id: current?.id || undefined,
      djName: current?.djName || profile.djName,
      programName: current?.programName || profile.programName,
      signatures: current?.signatures || profile.signatures,
      listenersMin: profile.listenersMin,
      listenersMax: profile.listenersMax,
      active: current?.active !== false,
      createdAt: current?.createdAt,
    });
    if (!next.djName || !next.programName) continue;
    if (index >= 0) djs[index] = serializeDj(next);
    else djs.push(serializeDj(next));
  }

  return djs.slice(0, MAX_DJS);
}

function clearLegacyDjConfiguration(liveStatusTest, djs) {
  const control = liveStatusTest?.liveDjControl || defaultLiveDjControl();
  const selected = control.stationDjId
    ? djs.find((dj) => dj.id === control.stationDjId)
    : djs.find((dj) => legacyDjMatches(dj, control));

  return serializeLiveStatus({
    ...liveStatusTest,
    djProfiles: [],
    liveDjControl: {
      ...control,
      stationDjId: selected?.id || control.stationDjId || null,
      schedules: [],
    },
  });
}

function findLegacyDjIndex(djs, value) {
  const stationDjId = String(value?.stationDjId || "").trim();
  if (stationDjId) {
    const byId = djs.findIndex((dj) => dj.id === stationDjId);
    if (byId >= 0) return byId;
  }
  return djs.findIndex((dj) => legacyDjMatches(dj, value));
}

function legacyDjMatches(dj, value) {
  const djName = comparableAudienceText(dj?.djName);
  const valueName = comparableAudienceText(value?.djName);
  const programName = comparableAudienceText(dj?.programName);
  const valueProgram = comparableAudienceText(value?.programName);
  return Boolean(djName && valueName && djName === valueName && (!valueProgram || !programName || programName === valueProgram));
}

function parseStoredAudienceConfig(value) {
  if (!value) return {};
  if (typeof value === "object") return value;

  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveLiveStatusMetrics(payload, nowMs = Date.now(), liveDj = null) {
  const test = serializeLiveStatus(payload);
  const profile = resolveLiveStatusAudienceProfile(test, nowMs, liveDj);
  const liveBoost = liveDj?.isLive ? profile.liveBoostPercent / 100 : 0;
  const minListeners = Math.max(0, Math.round(profile.listenersMin * (1 + liveBoost)));
  const maxListeners = Math.max(minListeners, Math.round(profile.listenersMax * (1 + liveBoost)));
  const movement = profile.movementPercent / 100;
  const exitPressure = profile.exitPercent / 100;
  const startedAt = new Date(test.appliedAt || test.updatedAt).getTime();
  const elapsedMinutes = Number.isNaN(startedAt) ? 0 : Math.max(0, (nowMs - startedAt) / 60_000);
  const seed = (test.seed ?? 731) / 97;
  const seconds = nowMs / 1000;
  const wave = Math.sin(seconds / 11 + seed) * 0.52 + Math.sin(seconds / 31 + seed * 1.7) * 0.34 + Math.cos(seconds / 53 + seed * 0.8) * 0.14;
  const softWave = Math.max(0, Math.min(1, (wave + 1) / 2));
  const exitBias = wave < 0 ? Math.abs(wave) * 0.18 * exitPressure : 0;
  const position = Math.max(0, Math.min(1, 0.5 + wave * 0.5 * Math.max(0.08, movement) - exitBias));
  const targetListeners = minListeners + (maxListeners - minListeners) * position;
  const transitionProgress = easedProgress(elapsedMinutes, transitionMinutes(profile.transitionPercent));
  const rampFromListeners = normalizeRunCount(test.rampFromListeners, targetListeners, 0, LIVE_TEST_MAX_LISTENERS);
  const listeners = normalizeRunCount(
    rampFromListeners + (targetListeners - rampFromListeners) * transitionProgress,
    targetListeners,
    0,
    LIVE_TEST_MAX_LISTENERS,
  );

  // Visits are intentionally isolated from listener waves, DJ boosts, and schedules.
  const visitorBase = test.visitorBase ?? test.visitors ?? LIVE_TEST_DEFAULT_VISITORS;
  const rampFromVisitors = normalizeRunCount(test.rampFromVisitors, visitorBase, 0, LIVE_TEST_MAX_VISITORS);
  const visitorAnchor = Math.max(visitorBase, rampFromVisitors);
  const visitorTarget = typeof test.visitorTarget === "number" && test.visitorTarget > visitorAnchor
    ? test.visitorTarget
    : null;
  const visitorGrowthPercent = Math.max(1, test.visitorGrowthPercent ?? test.growthPercent ?? LIVE_TEST_DEFAULT_GROWTH);
  const visitorStartedAt = test.visitorAppliedAt ? new Date(test.visitorAppliedAt).getTime() : Number.NaN;
  const visitorElapsedMinutes = Number.isNaN(visitorStartedAt) ? 0 : Math.max(0, (nowMs - visitorStartedAt) / 60_000);
  const targetDurationMinutes = 4 + (1 - visitorGrowthPercent / 100) * 24;
  const targetProgress = visitorTarget ? easedProgress(visitorElapsedMinutes, targetDurationMinutes) : 0;
  const targetValue = visitorTarget
    ? visitorAnchor + (visitorTarget - visitorAnchor) * targetProgress
    : visitorAnchor;
  const ongoingMinutes = visitorTarget
    ? Math.max(0, visitorElapsedMinutes - targetDurationMinutes)
    : visitorElapsedMinutes;
  const ongoingBase = visitorTarget ?? visitorAnchor;
  const ongoingGrowth = ongoingBase * (visitorGrowthPercent / 100) * (ongoingMinutes / (24 * 60));
  const visitors = normalizeRunCount(
    Math.max(visitorAnchor, targetValue + ongoingGrowth),
    visitorAnchor,
    0,
    LIVE_TEST_MAX_VISITORS,
  );

  return { listeners, visitors };
}

export function resolveLiveStatusAudienceProfile(payload, nowMs = Date.now(), liveDj = null) {
  const test = serializeLiveStatus(payload);
  const globalProfile = {
    source: "global",
    label: "Base global",
    listenersMin: test.listenersMin ?? LIVE_TEST_DEFAULT_LISTENERS_MIN,
    listenersMax: test.listenersMax ?? LIVE_TEST_DEFAULT_LISTENERS_MAX,
    movementPercent: test.movementPercent ?? LIVE_TEST_DEFAULT_MOVEMENT,
    exitPercent: test.exitPercent ?? LIVE_TEST_DEFAULT_EXIT,
    transitionPercent: test.transitionPercent ?? LIVE_TEST_DEFAULT_TRANSITION,
    liveBoostPercent: test.liveBoostPercent ?? LIVE_TEST_DEFAULT_LIVE_BOOST,
  };
  if (liveDj?.isLive && Number.isFinite(Number(liveDj.listenersMin)) && Number.isFinite(Number(liveDj.listenersMax))) {
    const listenersMin = normalizeRunCount(liveDj.listenersMin, globalProfile.listenersMin, 0, LIVE_TEST_MAX_LISTENERS);
    return {
      ...globalProfile,
      source: "dj",
      label: liveDj.djName || liveDj.programName || "DJ ao vivo",
      listenersMin,
      listenersMax: normalizeRunCount(liveDj.listenersMax, Math.max(listenersMin, globalProfile.listenersMax), listenersMin, LIVE_TEST_MAX_LISTENERS),
      liveBoostPercent: 0,
    };
  }
  const djProfile = matchingDjAudienceProfile(test.djProfiles || [], liveDj);
  if (djProfile) {
    return {
      ...globalProfile,
      source: "dj",
      label: djProfile.djName || djProfile.programName || "DJ ao vivo",
      listenersMin: djProfile.listenersMin,
      listenersMax: djProfile.listenersMax,
      movementPercent: djProfile.movementPercent,
      exitPercent: djProfile.exitPercent,
      transitionPercent: djProfile.transitionPercent,
      liveBoostPercent: djProfile.liveBoostPercent,
    };
  }

  const scheduleProfile = matchingScheduleAudienceProfile(test.scheduleProfiles || [], nowMs);
  if (scheduleProfile) {
    return {
      ...globalProfile,
      source: "schedule",
      label: scheduleProfile.label,
      listenersMin: scheduleProfile.listenersMin,
      listenersMax: scheduleProfile.listenersMax,
      movementPercent: scheduleProfile.movementPercent,
      exitPercent: scheduleProfile.exitPercent,
      transitionPercent: scheduleProfile.transitionPercent,
    };
  }

  return globalProfile;
}

export function applyLiveStatusSimulation(data, payload) {
  const test = serializeLiveStatus(payload);
  const manualLiveDj = resolveManualLiveDjStatus(test);
  const liveDj = data.liveDj?.isLive ? data.liveDj : manualLiveDj || data.liveDj;
  const track = liveDj?.isLive ? trackFromLiveDj(data.track, liveDj) : data.track;
  if (!test.enabled && !manualLiveDj) return { ...data, track, liveDj, liveStatusTest: test };

  const { listeners, visitors } = resolveLiveStatusMetrics(test, Date.now(), liveDj);

  return {
    ...data,
    track,
    stats: {
      ...data.stats,
      listeners,
      peakListeners: Math.max(Number(data.stats?.peakListeners || 0), listeners),
      uniqueListeners: Math.max(Number(data.stats?.uniqueListeners || 0), listeners),
      streamHits: visitors,
      isOnline: data.stats?.isOnline,
    },
    liveDj,
    liveStatusTest: test,
  };
}

function normalizeDjSignatures(value) {
  return String(value || "")
    .split(/[\n,;]+/)
    .map((signature) => signature.trim())
    .filter(Boolean)
    .filter((signature, index, list) => list.indexOf(signature) === index)
    .slice(0, 12);
}

function visibleAds(ads, now = new Date()) {
  const time = now.getTime();
  return ads
    .map(serializeAd)
    .filter((ad) => {
      if (!ad.active) return false;
      const startsAt = ad.startsAt ? new Date(ad.startsAt).getTime() : null;
      const endsAt = ad.endsAt ? new Date(ad.endsAt).getTime() : null;
      return (!startsAt || startsAt <= time) && (!endsAt || endsAt >= time);
    })
    .sort((left, right) => left.sortOrder - right.sortOrder || String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, MAX_ADS);
}

function programsData(programs, { publicOnly = false, djs = [] } = {}) {
  const serialized = programs
    .map(serializeProgram)
    .filter((program) => !publicOnly || program.active)
    .sort(sortPrograms);
  const fallback = serialized.length || !publicOnly
    ? serialized
    : defaultProgramRows().map(serializeProgram).sort(sortPrograms);
  const combined = publicOnly
    ? [...fallback, ...scheduledDjProgramRows(djs)].sort(sortPrograms)
    : fallback;

  return {
    programs: combined,
    days: programsToScheduleDays(combined),
    currentProgram: currentProgramFromPrograms(combined),
  };
}

async function refreshPublicDataCache() {
  const content = await readSiteContent();
  await publishSiteContent(content);
  return {
    adsData: { ads: visibleAds(content.ads), settings: content.settings },
    programsData: programsData(content.programs, { publicOnly: true, djs: content.djs }),
    djs: content.djs
      .filter((dj) => dj.active)
      .map(serializePublicDj)
      .sort((left, right) => left.sortOrder - right.sortOrder || String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .slice(0, MAX_DJS),
  };
}

export async function listPublicAds() {
  const content = await readSiteContent();
  return {
    ads: visibleAds(content.ads),
    settings: serializeSettings(content.settings),
  };
}

export async function listAdminAds() {
  const content = await readSiteContent();
  return {
    ads: content.ads.map(serializeAd).sort((left, right) => left.sortOrder - right.sortOrder || String(right.updatedAt).localeCompare(String(left.updatedAt))),
    settings: serializeSettings(content.settings),
  };
}

export async function getAdSettings() {
  return serializeSettings((await readSiteContent()).settings);
}

export async function saveAdSettings(payload) {
  const settings = serializeSettings(normalizeSettingsPayload(payload));
  await updateSiteContent((content) => ({ ...content, settings }));
  return settings;
}

export async function saveAd(payload) {
  let previousImageKey = "";
  let savedAd = null;
  const requestedId = String(payload?.id || "").trim();

  await updateSiteContent((content) => {
    const index = content.ads.findIndex((ad) => ad.id === requestedId);
    const current = index >= 0 ? serializeAd(content.ads[index]) : null;
    const normalized = normalizeAdPayload({
      ...payload,
      id: requestedId || undefined,
      createdAt: current?.createdAt || payload?.createdAt,
      impressions: current?.impressions ?? payload?.impressions,
      clicks: current?.clicks ?? payload?.clicks,
    });
    assertManagedWebpImage(normalized.imageUrl, normalized.imageKey, normalized.imageContentType, "A imagem do anúncio");
    previousImageKey = current?.imageKey || "";
    savedAd = serializeAd(normalized);

    if (index >= 0) content.ads[index] = savedAd;
    else content.ads.push(savedAd);
    return content;
  });

  if (previousImageKey && previousImageKey !== savedAd.imageKey) {
    await deleteStoredImage(previousImageKey);
  }
  return savedAd;
}

export async function deleteAd(id) {
  let deleted = null;
  await updateSiteContent((content) => {
    const index = content.ads.findIndex((ad) => ad.id === String(id));
    if (index >= 0) deleted = serializeAd(content.ads.splice(index, 1)[0]);
    return content;
  });
  if (deleted?.imageKey) await deleteStoredImage(deleted.imageKey);
  return deleted;
}

export async function updateAdStats(id, field) {
  if (field !== "clicks") throw new Error("Invalid stats field.");

  let updated = null;
  await updateSiteContent((content) => {
    const index = content.ads.findIndex((ad) => ad.id === String(id));
    if (index < 0) return content;

    const current = serializeAd(content.ads[index]);
    if (!current.linkUrl) return content;
    updated = {
      ...current,
      clicks: current.clicks + 1,
      updatedAt: new Date().toISOString(),
    };
    content.ads[index] = updated;
    return content;
  }, { publish: "none" });
  return updated;
}

export async function listPublicPrograms() {
  const content = await readSiteContent();
  return programsData(content.programs, { publicOnly: true, djs: content.djs });
}

export async function listPublicDjs() {
  return (await readSiteContent()).djs
    .filter((dj) => dj.active)
    .map(serializePublicDj)
    .sort((left, right) => left.sortOrder - right.sortOrder || String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, MAX_DJS);
}

export async function getConfiguredLiveDjStatus(options = {}) {
  const { cacheOnly = false, nowMs = Date.now() } = options;
  const content = await readSiteContent({ forceRefresh: cacheOnly });
  return resolveConfiguredLiveDjStatus(content.liveStatusTest, content.djs, nowMs, content.programs);
}

function defaultLiveStatus() {
  return serializeLiveStatus({ state: "off" });
}

export async function getLiveStatusTest(options = {}) {
  const { useCache = false, cacheOnly = false } = options;
  if (useCache && !cacheOnly) {
    const cached = await readLiveStatusCache();
    if (cached) return cached;
  }

  const liveStatusTest = serializeLiveStatus((await readSiteContent({ forceRefresh: cacheOnly })).liveStatusTest);
  if (useCache) await writeLiveStatusCache(liveStatusTest);
  return liveStatusTest;
}

export async function saveLiveStatusTest(payload) {
  const normalized = serializeLiveStatus(normalizeLiveStatusPayload(payload));
  await updateSiteContent((content) => {
    const previousControl = serializeLiveStatus(content.liveStatusTest).liveDjControl;
    const nextControl = normalized.liveDjControl;
    content.liveStatusTest = normalized;
    if (previousControl?.active !== nextControl?.active) {
      content.djDetectionState = detectionStateWithTransition(
        content.djDetectionState,
        content.djDetectionState,
        Date.now(),
        nextControl?.active
          ? { label: "Sessão manual iniciada", reason: "Ativação manual pelo painel" }
          : { label: "Sessão manual encerrada", reason: "Desligamento manual pelo painel" },
      );
    }
    return content;
  }, { publish: "live" });
  return normalized;
}

export async function listAdminPrograms() {
  return programsData((await readSiteContent()).programs);
}

export async function listAdminDjs() {
  return (await readSiteContent()).djs
    .map(serializeDj)
    .sort((left, right) => left.sortOrder - right.sortOrder || String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, MAX_DJS);
}

export async function getVoxIntegrationStatus() {
  const content = await readSiteContent();
  return publicVoxIntegrationStatus(content.voxIntegration);
}

export async function saveVoxIntegration(payload = {}) {
  const password = String(payload.password || "");
  const clearPassword = payload.clearPassword === true;
  let saved = null;

  await updateSiteContent((content) => {
    const current = serializeVoxIntegration(content.voxIntegration);
    const next = {
      ...current,
      enabled: payload.enabled === true,
      port: normalizeVoxPort(payload.port),
      updatedAt: new Date().toISOString(),
    };
    if (password) next.passwordCiphertext = encryptVoxPassword(password);
    if (clearPassword) next.passwordCiphertext = "";
    if (next.enabled && !next.port) throw new Error("Informe a porta principal da rádio no Vox.");
    if (next.enabled && !next.passwordCiphertext) throw new Error("Informe a senha do painel Vox antes de ativar a verificação.");
    content.voxIntegration = serializeVoxIntegration(next);
    saved = publicVoxIntegrationStatus(content.voxIntegration);
    return content;
  }, { publish: "none" });

  return saved;
}

export async function getVoxIntegrationCredentials() {
  const integration = serializeVoxIntegration((await readSiteContent()).voxIntegration);
  if (!integration.enabled || !integration.port || !integration.passwordCiphertext) return null;
  return {
    port: integration.port,
    password: decryptVoxPassword(integration.passwordCiphertext),
  };
}

export async function saveDj(payload) {
  let previousLogoKey = "";
  let savedDj = null;
  const requestedId = String(payload?.id || "").trim();
  await updateSiteContent((content) => {
    const index = content.djs.findIndex((dj) => dj.id === requestedId);
    const current = index >= 0 ? serializeDj(content.djs[index]) : null;
    const normalized = normalizeDjPayload({
      ...payload,
      id: requestedId || undefined,
      createdAt: current?.createdAt || payload?.createdAt,
    });
    if (!normalized.djName) throw new Error("Informe o nome público do DJ.");
    if (!normalized.programName) throw new Error("Informe o nome do programa ao vivo.");
    assertManagedWebpImage(
      normalized.logoUrl,
      normalized.logoKey,
      normalized.logoContentType,
      "A logo do DJ",
    );
    if (normalized.scheduleEnabled && normalized.startTime === normalized.endTime) {
      throw new Error("A entrada e a saída do DJ não podem ser iguais.");
    }
    if (normalized.scheduleEnabled && hasDjScheduleConflict(content.djs, normalized)) {
      throw new Error("Já existe outro DJ ativo neste horário. Ajuste a agenda para não sobrepor transmissões.");
    }
    if (normalized.active && hasDjMarkerConflict(content.djs, normalized)) {
      throw new Error("Já existe outro DJ ativo com o mesmo nome e programa do marcador ao vivo.");
    }
    if (normalized.active && normalized.voxLogin && hasVoxLoginConflict(content.djs, normalized)) {
      throw new Error("Este login do Vox já está associado a outro DJ ativo.");
    }
    previousLogoKey = current?.logoKey || "";
    savedDj = serializeDj(normalized);
    if (index >= 0) content.djs[index] = savedDj;
    else content.djs.push(savedDj);
    if (!savedDj.active) {
      const liveStatusTest = serializeLiveStatus(content.liveStatusTest);
      const manualMatchesDj = liveStatusTest.liveDjControl?.stationDjId === savedDj.id ||
        Boolean(findConfiguredDj([savedDj], liveStatusTest.liveDjControl));
      if (liveStatusTest.liveDjControl?.active && manualMatchesDj) {
        content.liveStatusTest = serializeLiveStatus({
          ...liveStatusTest,
          liveDjControl: { ...liveStatusTest.liveDjControl, active: false, stationDjId: null, updatedAt: new Date().toISOString() },
        });
        content.djDetectionState = detectionStateWithTransition(
          content.djDetectionState,
          content.djDetectionState,
          Date.now(),
          { label: "Sessão manual encerrada", reason: "DJ desativado no painel" },
        );
      }
      content.liveStatusTest = serializeLiveStatus({
        ...content.liveStatusTest,
        djSkips: serializeLiveStatus(content.liveStatusTest).djSkips.filter((skip) => skip.djId !== savedDj.id),
      });
    }
    return content;
  });
  if (previousLogoKey && previousLogoKey !== savedDj.logoKey) await deleteStoredImage(previousLogoKey);
  return savedDj;
}

export async function deleteDj(id) {
  let deleted = null;
  await updateSiteContent((content) => {
    const index = content.djs.findIndex((dj) => dj.id === String(id));
    const state = normalizeDjDetectionState(content.djDetectionState);
    const manual = serializeLiveStatus(content.liveStatusTest).liveDjControl;
    if (
      index >= 0 &&
      ((state.djId === String(id) && isLiveDetectionMode(state.mode)) ||
        (manual?.active && manual.stationDjId === String(id)))
    ) {
      throw new Error("Não é possível excluir um DJ que está no ar. Encerre a sessão ou aguarde a desconexão antes de excluir.");
    }
    if (index >= 0) deleted = serializeDj(content.djs.splice(index, 1)[0]);
    if (deleted) {
      const liveStatusTest = serializeLiveStatus(content.liveStatusTest);
      content.liveStatusTest = serializeLiveStatus({
        ...liveStatusTest,
        liveDjControl: liveStatusTest.liveDjControl?.stationDjId === deleted.id
          ? { ...liveStatusTest.liveDjControl, active: false, stationDjId: null, updatedAt: new Date().toISOString() }
          : liveStatusTest.liveDjControl,
        djSkips: liveStatusTest.djSkips.filter((skip) => skip.djId !== deleted.id),
      });
      if (content.djDetectionState?.djId === deleted.id) content.djDetectionState = defaultDjDetectionState();
    }
    return content;
  });
  if (deleted?.logoKey) await deleteStoredImage(deleted.logoKey);
  return deleted;
}

export async function saveProgram(payload) {
  let previousLogoKey = "";
  let savedProgram = null;
  const requestedId = String(payload?.id || "").trim();
  await updateSiteContent((content) => {
    const index = content.programs.findIndex((program) => program.id === requestedId);
    const current = index >= 0 ? serializeProgram(content.programs[index]) : null;
    const normalized = normalizeProgramPayload({
      ...payload,
      id: requestedId || undefined,
      createdAt: current?.createdAt || payload?.createdAt,
    });
    assertManagedWebpImage(normalized.logoUrl, normalized.logoKey, "image/webp", "A logo do programa");
    if (!normalized.program) throw new Error("Informe o nome do programa.");
    previousLogoKey = current?.logoKey || "";
    savedProgram = serializeProgram(normalized);
    if (index >= 0) content.programs[index] = savedProgram;
    else content.programs.push(savedProgram);
    return content;
  });
  if (previousLogoKey && previousLogoKey !== savedProgram.logoKey) {
    await deleteStoredImage(previousLogoKey);
  }
  return savedProgram;
}

export async function deleteProgram(id) {
  let deleted = null;
  await updateSiteContent((content) => {
    const index = content.programs.findIndex((program) => program.id === String(id));
    if (index >= 0) deleted = serializeProgram(content.programs.splice(index, 1)[0]);
    return content;
  });
  if (deleted?.logoKey) await deleteStoredImage(deleted.logoKey);
  return deleted;
}

export async function saveAdImage(payload) {
  return storeImagePayload("ad", payload, "anuncio");
}

export async function saveProgramLogo(payload) {
  return storeImagePayload("program", payload, "programa");
}

export async function saveDjLogo(payload) {
  return storeImagePayload("dj", payload, "dj");
}

export async function importSiteImage(payload) {
  const kind = normalizeMediaKind(payload?.kind);
  const sourceUrl = validateRemoteImageUrl(payload?.url);
  const input = await fetchRemoteImage(sourceUrl);
  if (isWebpBuffer(input)) {
    return storeExistingWebpImage({ kind, input, fileName: sourceUrl.pathname.split("/").pop() || kind });
  }
  return storeOptimizedImage({ kind, input, fileName: sourceUrl.pathname.split("/").pop() || kind });
}

async function storeImagePayload(kind, payload, fallbackFileName) {
  const input = decodeImagePayload(payload);
  const fileName = payload?.fileName || fallbackFileName;
  if (String(payload?.contentType || "").toLowerCase() === "image/webp") {
    return storeExistingWebpImage({ kind, input, fileName });
  }
  return storeOptimizedImage({ kind, input, fileName });
}

function normalizeMediaKind(value) {
  if (value === "ad" || value === "program" || value === "dj") return value;
  throw new Error("Tipo de imagem inválido.");
}

function decodeImagePayload(payload) {
  const declaredType = String(payload?.contentType || "").toLowerCase();
  if (!SOURCE_IMAGE_CONTENT_TYPES.has(declaredType)) {
    throw new Error("Envie PNG, JPEG, WebP ou AVIF.");
  }

  const dataBase64 = String(payload?.dataBase64 || "").replace(/^data:[^;]+;base64,/i, "");
  if (!dataBase64) throw new Error("Arquivo inválido.");
  const bytes = Buffer.from(dataBase64, "base64");
  if (!bytes.byteLength || bytes.byteLength > MAX_MEDIA_SOURCE_SIZE) {
    throw new Error("A imagem de origem precisa ter até 5 MB.");
  }
  return bytes;
}

function validateRemoteImageUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error("Informe uma URL HTTPS de imagem válida.");
  }

  if (url.protocol !== "https:" || isBlockedImageHost(url.hostname)) {
    throw new Error("A URL precisa apontar para uma imagem pública em HTTPS.");
  }
  return url;
}

function isBlockedImageHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

async function fetchRemoteImage(initialUrl) {
  let url = initialUrl;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirecionamento de imagem inválido.");
      url = validateRemoteImageUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new Error("Não foi possível baixar a imagem da URL.");
    const headerLength = Number(response.headers.get("content-length") || 0);
    if (headerLength > MAX_MEDIA_SOURCE_SIZE) throw new Error("A imagem da URL ultrapassa 5 MB.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_MEDIA_SOURCE_SIZE) {
      throw new Error("A imagem da URL ultrapassa 5 MB.");
    }
    return bytes;
  }
  throw new Error("A URL possui redirecionamentos demais.");
}

function mediaProfile(kind) {
  return {
    ad: { width: AD_BANNER_WIDTH, height: AD_BANNER_HEIGHT, fit: "cover", quality: 84, prefix: "ad" },
    program: { width: PROGRAM_LOGO_MAX_DIMENSION, height: PROGRAM_LOGO_MAX_DIMENSION, fit: "inside", quality: 86, prefix: "program" },
    dj: { width: DJ_LOGO_SIZE, height: DJ_LOGO_SIZE, fit: "cover", quality: 86, prefix: "dj" },
  }[normalizeMediaKind(kind)];
}

function isWebpBuffer(input) {
  return Buffer.isBuffer(input) &&
    input.length >= 16 &&
    input.toString("ascii", 0, 4) === "RIFF" &&
    input.toString("ascii", 8, 12) === "WEBP";
}

function readWebpDimensions(input) {
  if (!isWebpBuffer(input)) throw new Error("O arquivo informado não é um WebP válido.");

  for (let offset = 12; offset + 8 <= input.length;) {
    const chunk = input.toString("ascii", offset, offset + 4);
    const length = input.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + length > input.length) break;

    if (chunk === "VP8X" && length >= 10) {
      return {
        width: input.readUIntLE(dataOffset + 4, 3) + 1,
        height: input.readUIntLE(dataOffset + 7, 3) + 1,
      };
    }
    if (chunk === "VP8L" && length >= 5 && input[dataOffset] === 0x2f) {
      const bits = input.readUInt32LE(dataOffset + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === "VP8 " && length >= 10 && input[dataOffset + 3] === 0x9d && input[dataOffset + 4] === 0x01 && input[dataOffset + 5] === 0x2a) {
      return {
        width: input.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: input.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }

    offset = dataOffset + length + (length % 2);
  }

  throw new Error("Não foi possível identificar as dimensões do WebP.");
}

function assertDirectWebpProfile(kind, width, height) {
  const profile = mediaProfile(kind);
  if (!width || !height) throw new Error("WebP sem dimensões válidas.");
  if (kind === "ad" && (width !== profile.width || height !== profile.height)) {
    throw new Error(`O banner WebP precisa medir exatamente ${AD_BANNER_WIDTH} x ${AD_BANNER_HEIGHT}px.`);
  }
  if (kind === "dj" && (width !== DJ_LOGO_SIZE || height !== DJ_LOGO_SIZE)) {
    throw new Error(`A logo WebP do DJ precisa medir exatamente ${DJ_LOGO_SIZE} x ${DJ_LOGO_SIZE}px.`);
  }
  if (kind === "program" && (width > PROGRAM_LOGO_MAX_DIMENSION || height > PROGRAM_LOGO_MAX_DIMENSION)) {
    throw new Error(`A logo WebP precisa ter até ${PROGRAM_LOGO_MAX_DIMENSION}px de largura e altura.`);
  }
}

async function persistWebpImage({ kind, data, width, height, fileName }) {
  const profile = mediaProfile(kind);
  if (!data.byteLength || data.byteLength > PROGRAM_LOGO_MAX_SIZE) {
    throw new Error("A imagem WebP final precisa ter até 2,5 MB.");
  }

  const key = `${profile.prefix}-${Date.now()}-${randomUUID()}.webp`;
  await adImageStore().set(key, data, {
    metadata: {
      contentType: "image/webp",
      width,
      height,
      originalName: String(fileName || `${profile.prefix}.webp`),
      kind,
    },
  });
  return {
    imageKey: key,
    imageUrl: `/api/ads/image/${encodeURIComponent(key)}`,
    imageWidth: width,
    imageHeight: height,
    imageContentType: "image/webp",
    imageSize: data.byteLength,
  };
}

async function storeExistingWebpImage({ kind, input, fileName }) {
  const { width, height } = readWebpDimensions(input);
  assertDirectWebpProfile(kind, width, height);
  return persistWebpImage({ kind, data: input, width, height, fileName });
}

async function storeOptimizedImage({ kind, input, fileName }) {
  const profile = mediaProfile(kind);
  const sharp = await loadSharp();
  const source = sharp(input, { animated: false, limitInputPixels: MAX_MEDIA_PIXELS }).rotate();
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height || !["jpeg", "png", "webp", "heif"].includes(metadata.format || "")) {
    throw new Error("Formato de imagem não suportado. Use PNG, JPEG, WebP ou AVIF.");
  }

  const output = await source
    .resize(profile.width, profile.height, { fit: profile.fit, position: "centre", withoutEnlargement: kind === "program" })
    .webp({ quality: profile.quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  return persistWebpImage({
    kind,
    data: output.data,
    width: output.info.width,
    height: output.info.height,
    fileName,
  });
}

export async function readAdImage(key) {
  const safeKey = String(key || "").replace(/^\/+/, "");
  if (!safeKey || safeKey.includes("..") || !safeKey.toLowerCase().endsWith(".webp")) return null;

  const store = adImageStore();
  const blob = await store.get(safeKey, { type: "arrayBuffer" });
  if (!blob) return null;

  return {
    body: Buffer.from(blob).toString("base64"),
    contentType: imageContentTypeFromKey(safeKey),
  };
}

export async function migrateStoredMediaToWebp() {
  const content = await readSiteContent({ forceRefresh: true });
  const jobs = mediaMigrationJobs(content);
  const migrated = [];
  const failed = [];

  for (const job of jobs) {
    try {
      const input = await migrationSourceBytes(job);
      const image = await storeOptimizedImage({ kind: job.kind, input, fileName: job.fileName });
      migrated.push({ ...job, image });
    } catch (error) {
      failed.push({ id: job.id, kind: job.kind, message: error instanceof Error ? error.message : "Imagem indisponível." });
    }
  }

  const replacedKeys = [];
  if (migrated.length || !failed.length) {
    await updateSiteContent((next) => {
      for (const item of migrated) {
        const record = next[item.collection].find((entry) => entry.id === item.id);
        if (!record) continue;
        const oldKey = item.key || "";
        if (item.kind === "ad") {
          Object.assign(record, {
            imageUrl: item.image.imageUrl,
            imageKey: item.image.imageKey,
            imageWidth: item.image.imageWidth,
            imageHeight: item.image.imageHeight,
            imageContentType: item.image.imageContentType,
            imageSize: item.image.imageSize,
          });
        } else if (item.kind === "program") {
          Object.assign(record, {
            logoUrl: item.image.imageUrl,
            logoKey: item.image.imageKey,
          });
        } else {
          Object.assign(record, {
            logoUrl: item.image.imageUrl,
            logoKey: item.image.imageKey,
            logoWidth: item.image.imageWidth,
            logoHeight: item.image.imageHeight,
            logoContentType: item.image.imageContentType,
            logoSize: item.image.imageSize,
          });
        }
        if (oldKey && oldKey !== item.image.imageKey) replacedKeys.push(oldKey);
      }
      if (!failed.length) next.mediaMigrationVersion = 1;
      return next;
    });
  }

  for (const key of replacedKeys) await deleteStoredImage(key);
  const removedOrphans = await removeOrphanedLegacyImages();
  return {
    complete: failed.length === 0,
    migrated: migrated.length,
    removedOrphans,
    failed,
  };
}

function mediaMigrationJobs(content) {
  const jobs = [];
  for (const ad of content.ads.map(serializeAd)) {
    if (needsWebpMigration(ad.imageUrl, ad.imageKey, ad.imageContentType)) {
      jobs.push({ collection: "ads", id: ad.id, kind: "ad", key: ad.imageKey, url: ad.imageUrl, fileName: ad.imageKey || ad.title || "anuncio" });
    }
  }
  for (const program of content.programs.map(serializeProgram)) {
    if (needsWebpMigration(program.logoUrl, program.logoKey, "")) {
      jobs.push({ collection: "programs", id: program.id, kind: "program", key: program.logoKey, url: program.logoUrl, fileName: program.logoKey || program.program || "programa" });
    }
  }
  for (const dj of content.djs.map(serializeDj)) {
    if (needsWebpMigration(dj.logoUrl, dj.logoKey, dj.logoContentType)) {
      jobs.push({ collection: "djs", id: dj.id, kind: "dj", key: dj.logoKey, url: dj.logoUrl, fileName: dj.logoKey || dj.djName || "dj" });
    }
  }
  return jobs;
}

function needsWebpMigration(url, key, contentType) {
  if (!url && !key) return false;
  return !(
    normalizeManagedImageUrl(url) &&
    normalizeWebpImageKey(key) &&
    (!contentType || String(contentType).toLowerCase() === "image/webp")
  );
}

async function migrationSourceBytes(job) {
  const key = String(job.key || "").trim();
  if (key && !key.includes("..")) {
    const bytes = await adImageStore().get(key, { type: "arrayBuffer" });
    if (bytes) return Buffer.from(bytes);
  }
  if (job.url && /^https:\/\//i.test(job.url)) return fetchRemoteImage(validateRemoteImageUrl(job.url));
  throw new Error("A imagem original não está disponível no Blob.");
}

async function removeOrphanedLegacyImages() {
  const store = adImageStore();
  let removed = 0;
  for await (const page of store.list({ paginate: true })) {
    for (const blob of page.blobs) {
      if (!/\.(?:png|jpe?g|avif)$/i.test(blob.key)) continue;
      await deleteStoredImage(blob.key);
      removed += 1;
    }
  }
  return removed;
}

export function isValidAdminLogin(payload = {}) {
  if (!ADMIN_LOGIN || !ADMIN_PASSWORD_HASH || !ADMIN_TOKEN) return false;
  return payload.login === ADMIN_LOGIN && constantTimeTextEqual(sha256Hex(payload.password || ""), ADMIN_PASSWORD_HASH);
}

export function adminSessionPayload() {
  return {
    token: ADMIN_TOKEN,
    login: ADMIN_LOGIN,
  };
}

export function isAdminRequest(event) {
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  const [, token = ""] = authorization.match(/^Bearer\s+(.+)$/i) || [];
  return Boolean(token && ADMIN_TOKEN) && constantTimeTextEqual(token, ADMIN_TOKEN);
}

function defaultProgramRows() {
  return DAY_ORDER.flatMap((dayId) => {
    const dayLabel = DAY_LABELS[dayId];
    return [
      {
        id: `${dayId.toLowerCase()}-madrugada`,
        dayId,
        dayLabel,
        startTime: "00:00",
        endTime: "04:59",
        program: "Madrugada Reggae",
        host: "Web Rádio Conexão Jamaica",
        sortOrder: 1,
        active: true,
      },
      {
        id: `${dayId.toLowerCase()}-manha`,
        dayId,
        dayLabel,
        startTime: "05:00",
        endTime: "11:59",
        program: "Conexão Jamaica Manhã",
        host: "Web Rádio Conexão Jamaica",
        sortOrder: 2,
        active: true,
      },
      {
        id: `${dayId.toLowerCase()}-tarde-noite`,
        dayId,
        dayLabel,
        startTime: "12:00",
        endTime: "23:59",
        program: dayId === "Sat" ? "Sábado Reggae Vibes" : dayId === "Sun" ? "Domingo Roots" : "Reggae em todas as vertentes",
        host: "Web Rádio Conexão Jamaica",
        sortOrder: 3,
        active: true,
      },
    ];
  });
}

function currentDayId(now = new Date()) {
  return DAY_ORDER[now.getDay()] || "Sun";
}

function scheduledDjProgramRows(djs) {
  return (Array.isArray(djs) ? djs : [])
    .map(serializeDj)
    .filter((dj) => dj.active && dj.scheduleEnabled && dj.djName && dj.programName)
    .flatMap((dj) => dj.dayIds.map((dayId) => ({
      id: `dj-${dj.id}-${dayId}`,
      dayId,
      dayLabel: DAY_LABELS[dayId],
      startTime: dj.startTime,
      endTime: dj.endTime,
      program: dj.programName,
      host: dj.djName,
      logoUrl: dj.logoUrl || "",
      logoKey: dj.logoKey || "",
      active: true,
      sortOrder: -10_000 + Number(dj.sortOrder || 0),
      createdAt: dj.createdAt,
      updatedAt: dj.updatedAt,
    })));
}

function timeToMinutes(value) {
  const [hours = "0", minutes = "0"] = String(value || "00:00").split(":");
  return Number(hours) * 60 + Number(minutes);
}

function isProgramCurrent(program, now = new Date()) {
  const start = timeToMinutes(program.startTime);
  const end = timeToMinutes(program.endTime);
  const currentDay = currentDayId(now);
  const current = now.getHours() * 60 + now.getMinutes();
  if (start < end) return program.dayId === currentDay && current >= start && current < end;
  if (program.dayId === currentDay && current >= start) return true;
  return program.dayId === previousAudienceDay(currentDay) && current < end;
}

function programsToScheduleDays(programs, now = new Date()) {
  return DAY_ORDER.map((dayId) => {
    const slots = programs
      .filter((program) => program.active && program.dayId === dayId)
      .sort(sortPrograms)
      .map((program) => ({
        id: program.id,
        time: `${program.startTime} - ${program.endTime}`,
        program: program.program,
        host: program.host,
        logoUrl: program.logoUrl || null,
        isNow: isProgramCurrent(program, now),
      }));

    return {
      id: dayId,
      label: DAY_LABELS[dayId],
      active: dayId === currentDayId(now),
      slots,
    };
  }).filter((day) => day.slots.length > 0);
}

function currentProgramFromPrograms(programs, now = new Date()) {
  return programs.filter((program) => program.active && isProgramCurrent(program, now)).sort(sortPrograms)[0] || null;
}

function sortPrograms(left, right) {
  if (DAY_ORDER.indexOf(left.dayId) !== DAY_ORDER.indexOf(right.dayId)) {
    return DAY_ORDER.indexOf(left.dayId) - DAY_ORDER.indexOf(right.dayId);
  }
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  return timeToMinutes(left.startTime) - timeToMinutes(right.startTime);
}

function matchingDjAudienceProfile(profiles, liveDj) {
  if (!liveDj?.isLive) return null;
  const candidates = [liveDj.djName, liveDj.programName, liveDj.matchedSignature, liveDj.detectedValue].filter(Boolean);
  if (!candidates.length) return null;

  return profiles.find((profile) => {
    if (!profile.enabled) return false;
    const signatures = normalizeDjSignatures([
      profile.signatures,
      profile.djName,
      profile.programName,
    ].filter(Boolean).join("\n"));

    return signatures.some((signature) => {
      const cleanSignature = comparableAudienceText(signature);
      if (cleanSignature.length < 3) return false;
      return candidates.some((candidate) => {
        const cleanCandidate = comparableAudienceText(candidate);
        return cleanCandidate === cleanSignature ||
          cleanCandidate.includes(cleanSignature) ||
          cleanSignature.includes(cleanCandidate);
      });
    });
  }) || null;
}

function matchingScheduleAudienceProfile(profiles, nowMs) {
  const parts = saoPauloTimeParts(nowMs);
  return profiles.find((profile) => {
    return profile.enabled && isAudienceScheduleActive(profile.dayIds, profile.startTime, profile.endTime, parts);
  }) || null;
}

function isAudienceScheduleActive(dayIds, startTime, endTime, parts) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (start < end) {
    return dayIds.includes(parts.dayId) && isMinuteWithinWindow(parts.minuteOfDay, start, end);
  }

  if (parts.minuteOfDay >= start) return dayIds.includes(parts.dayId);
  if (parts.minuteOfDay < end) return dayIds.includes(previousAudienceDay(parts.dayId));
  return false;
}

function hasDjScheduleConflict(djs, candidate) {
  return djs
    .map(serializeDj)
    .filter((dj) => dj.id !== candidate.id && dj.active && dj.scheduleEnabled)
    .some((dj) => schedulesOverlap(dj, candidate));
}

function hasDjMarkerConflict(djs, candidate) {
  const candidateKey = djMarkerKey(candidate);
  if (!candidateKey) return false;
  return djs
    .map(serializeDj)
    .filter((dj) => dj.id !== candidate.id && dj.active)
    .some((dj) => djMarkerKey(dj) === candidateKey);
}

function hasVoxLoginConflict(djs, candidate) {
  const candidateLogin = normalizeVoxDjLogin(candidate?.voxLogin);
  if (!candidateLogin) return false;
  return djs
    .map(serializeDj)
    .filter((dj) => dj.id !== candidate.id && dj.active)
    .some((dj) => normalizeVoxDjLogin(dj.voxLogin) === candidateLogin);
}

function djMarkerKey(dj) {
  const djName = comparableAudienceText(dj?.djName);
  const programName = comparableAudienceText(dj?.programName);
  return djName && programName ? `${djName}|${programName}` : "";
}

function schedulesOverlap(left, right) {
  return AUDIENCE_DAY_IDS.some((dayId) => {
    const leftWindows = scheduleWindowsForDay(left, dayId);
    const rightWindows = scheduleWindowsForDay(right, dayId);
    return leftWindows.some((leftWindow) => rightWindows.some((rightWindow) =>
      leftWindow.start < rightWindow.end && rightWindow.start < leftWindow.end,
    ));
  });
}

function scheduleWindowsForDay(schedule, dayId) {
  const start = timeToMinutes(schedule.startTime);
  const end = timeToMinutes(schedule.endTime);
  const previousDay = previousAudienceDay(dayId);
  if (start < end) {
    return schedule.dayIds.includes(dayId) ? [{ start, end }] : [];
  }

  const windows = [];
  if (schedule.dayIds.includes(dayId)) windows.push({ start, end: 24 * 60 });
  if (schedule.dayIds.includes(previousDay)) windows.push({ start: 0, end });
  return windows;
}

function previousAudienceDay(dayId) {
  const index = AUDIENCE_DAY_IDS.indexOf(dayId);
  return AUDIENCE_DAY_IDS[(index + AUDIENCE_DAY_IDS.length - 1) % AUDIENCE_DAY_IDS.length] || "Sun";
}

function easedProgress(elapsedMinutes, durationMinutes) {
  if (durationMinutes <= 0) return 1;
  const progress = Math.max(0, Math.min(1, elapsedMinutes / durationMinutes));
  return 1 - Math.pow(1 - progress, 3);
}

function transitionMinutes(percent) {
  const speed = Math.max(0, Math.min(100, percent)) / 100;
  return 2 + (1 - speed) * 18;
}

function comparableAudienceText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function saoPauloTimeParts(nowMs) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  return {
    dayId: value("weekday"),
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    minuteOfDay: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function isMinuteWithinWindow(current, start, end) {
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function normalizeRunCount(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function normalizeNullableRunCount(value, min, max) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : null;
}

function normalizeAudienceScheduleProfiles(value) {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 28).map((profile) => {
    const listenersMin = normalizeRunCount(profile?.listenersMin, 40, 0, LIVE_TEST_MAX_LISTENERS);
    return {
      id: String(profile?.id || randomUUID()),
      label: String(profile?.label || "Horário especial").trim(),
      enabled: profile?.enabled !== false,
      dayIds: normalizeAudienceDayIds(profile?.dayIds),
      startTime: normalizeTime(profile?.startTime, "18:00"),
      endTime: normalizeTime(profile?.endTime, "23:59"),
      listenersMin,
      listenersMax: normalizeRunCount(profile?.listenersMax, Math.max(listenersMin, 120), listenersMin, LIVE_TEST_MAX_LISTENERS),
      movementPercent: normalizeRunCount(profile?.movementPercent, LIVE_TEST_DEFAULT_MOVEMENT, 0, LIVE_TEST_MAX_PERCENT),
      exitPercent: normalizeRunCount(profile?.exitPercent, LIVE_TEST_DEFAULT_EXIT, 0, LIVE_TEST_MAX_PERCENT),
      transitionPercent: normalizeRunCount(profile?.transitionPercent, LIVE_TEST_DEFAULT_TRANSITION, 0, 100),
    };
  });
}

function normalizeAudienceDjProfiles(value) {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 100).map((profile) => {
    const listenersMin = normalizeRunCount(profile?.listenersMin, 60, 0, LIVE_TEST_MAX_LISTENERS);
    return {
      id: String(profile?.id || randomUUID()),
      enabled: profile?.enabled !== false,
      djName: String(profile?.djName || "").trim(),
      programName: String(profile?.programName || "").trim(),
      signatures: normalizeDjSignatures(profile?.signatures || "").join("\n"),
      listenersMin,
      listenersMax: normalizeRunCount(profile?.listenersMax, Math.max(listenersMin, 160), listenersMin, LIVE_TEST_MAX_LISTENERS),
      movementPercent: normalizeRunCount(profile?.movementPercent, LIVE_TEST_DEFAULT_MOVEMENT, 0, LIVE_TEST_MAX_PERCENT),
      exitPercent: normalizeRunCount(profile?.exitPercent, LIVE_TEST_DEFAULT_EXIT, 0, LIVE_TEST_MAX_PERCENT),
      transitionPercent: normalizeRunCount(profile?.transitionPercent, LIVE_TEST_DEFAULT_TRANSITION, 0, 100),
      liveBoostPercent: normalizeRunCount(profile?.liveBoostPercent, 35, 0, LIVE_TEST_MAX_PERCENT),
    };
  });
}

export function resolveManualLiveDjStatus(payload, nowMs = Date.now()) {
  const control = serializeLiveStatus(payload).liveDjControl || defaultLiveDjControl();
  if (!control.enabled) return null;

  if (control.active) {
    return manualLiveDjStatus(control.djName, control.programName, "manual", "controle manual");
  }
  return null;
}

export function resolveConfiguredLiveDjStatus(payload, djs, nowMs = Date.now(), programs = []) {
  const control = serializeLiveStatus(payload).liveDjControl || defaultLiveDjControl();
  const configuredDjs = Array.isArray(djs)
    ? djs.map(serializeDj).filter((dj) => dj.active)
    : [];

  if (control.enabled && control.active) {
    const manualDj = findConfiguredDj(configuredDjs, control);
    return manualDj
      ? liveDjStatusFromDj(manualDj, "manual", "controle manual", programs)
      : manualLiveDjStatus(control.djName, control.programName, "manual", "controle manual");
  }

  return null;
}

export async function getCurrentLiveDjStatus(options = {}) {
  const snapshot = await getDjDetectionSnapshot(options);
  return snapshot.liveDj;
}

export async function getDjDetectionSnapshot(options = {}) {
  const { forceRefresh = false, nowMs = Date.now() } = options;
  const content = await readSiteContent({ forceRefresh });
  return resolveDjDetectionSnapshot(content, nowMs);
}

export async function advanceDjDetectionObservation(observation = {}) {
  const nowMs = Number.isFinite(Number(observation.nowMs)) ? Number(observation.nowMs) : Date.now();
  let result = null;

  await updateSiteContent((content) => {
    const snapshot = resolveDjDetectionSnapshot(content, nowMs, observation);
    const nextState = detectionStateWithTransition(
      content.djDetectionState,
      nextDjDetectionState(snapshot, observation, nowMs),
      nowMs,
    );
    if (sameDjDetectionState(content.djDetectionState, nextState)) {
      result = snapshot;
      return content;
    }
    content.djDetectionState = nextState;
    result = resolveDjDetectionSnapshot(content, nowMs, observation);
    return content;
  }, { publish: "none" });

  return result;
}

export async function setDjSkippedToday(djId, skipped, nowMs = Date.now()) {
  const requestedId = String(djId || "").trim();
  if (!requestedId) throw new Error("DJ inválido.");
  let liveStatusTest = null;

  await updateSiteContent((content) => {
    const dj = content.djs.map(serializeDj).find((item) => item.id === requestedId);
    if (!dj) throw new Error("DJ não encontrado.");
    const occurrence = djSkipOccurrence(dj, nowMs);
    if (!occurrence) throw new Error("Este DJ não possui uma sessão restante para pular hoje.");

    const current = serializeLiveStatus(content.liveStatusTest);
    const remaining = current.djSkips.filter((item) => item.djId !== requestedId || item.occurrenceKey !== occurrence.occurrenceKey);
    const djSkips = skipped
      ? [...remaining, { djId: requestedId, occurrenceKey: occurrence.occurrenceKey, expiresAt: occurrence.expiresAt }]
      : remaining;
    content.liveStatusTest = serializeLiveStatus({ ...current, djSkips, updatedAt: new Date().toISOString() });
    liveStatusTest = content.liveStatusTest;
    return content;
  }, { publish: "none" });

  return liveStatusTest;
}

export async function controlDjLiveSession(djId, action, minutes, nowMs = Date.now()) {
  const requestedId = String(djId || "").trim();
  const requestedAction = String(action || "").trim();
  if (!requestedId) throw new Error("DJ inválido.");
  if (!["confirm", "acknowledge", "end", "extend"].includes(requestedAction)) {
    throw new Error("Ação de sessão inválida.");
  }

  let result = null;
  await updateSiteContent((content) => {
    const liveStatusTest = serializeLiveStatus(content.liveStatusTest);
    const allDjs = content.djs.map(serializeDj);
    const dj = allDjs.find((item) => item.id === requestedId);
    if (!dj) throw new Error("DJ não encontrado.");
    if (requestedAction === "confirm" && !dj.active) throw new Error("Reative o DJ antes de confirmar uma nova entrada.");
    const activeDjs = allDjs.filter((item) => item.active);
    if (resolveConfiguredLiveDjStatus(liveStatusTest, activeDjs, nowMs)?.source === "manual") {
      throw new Error("Desligue a ativação manual antes de controlar a confirmação automática.");
    }

    const current = normalizeDjDetectionState(content.djDetectionState);
    const occurrence = djScheduleOccurrence(dj, nowMs);
    const expectedEndAt = current.djId === dj.id && current.expectedEndAt
      ? current.expectedEndAt
      : occurrence?.expiresAt || null;

    if (requestedAction === "confirm") {
      content.djDetectionState = detectionStateWithTransition(
        current,
        createConfirmedDjState(dj, expectedEndAt, nowMs),
        nowMs,
        { label: "Entrada confirmada", reason: "Ação do painel" },
      );
    } else {
      if (current.djId !== dj.id || !isLiveDetectionMode(current.mode)) {
        throw new Error("Este DJ não possui uma sessão automática ativa.");
      }

      if (requestedAction === "end") {
        content.djDetectionState = detectionStateWithTransition(current, {
          ...defaultDjDetectionState(),
          djId: dj.id,
          expectedEndAt,
          forceEnded: true,
          classification: current.classification,
          source: "confirmation",
          observedAt: new Date(nowMs).toISOString(),
          updatedAt: new Date(nowMs).toISOString(),
          signals: ["Sessão encerrada pelo painel"],
        }, nowMs, { label: "Sessão encerrada", reason: "Encerramento pelo painel" });
      } else if (requestedAction === "extend") {
        const extension = [30, 60, 120].includes(Number(minutes)) ? Number(minutes) : 30;
        const baseMs = Math.max(nowMs, Date.parse(expectedEndAt || "") || nowMs);
        content.djDetectionState = detectionStateWithTransition(current, {
          ...current,
          mode: "live",
          expectedEndAt: new Date(baseMs + extension * 60 * 1000).toISOString(),
          overrunAcknowledgedAt: null,
          updatedAt: new Date(nowMs).toISOString(),
          signals: [...current.signals.filter((signal) => signal !== "Horário excedido"), `Extensão de ${extension} minutos`].slice(-8),
        }, nowMs, { label: "Horário estendido", reason: `Extensão de ${extension} minutos` });
      } else {
        content.djDetectionState = detectionStateWithTransition(current, {
          ...current,
          overrunAcknowledgedAt: new Date(nowMs).toISOString(),
          updatedAt: new Date(nowMs).toISOString(),
          signals: [...current.signals.filter((signal) => signal !== "Horário excedido"), "Continuidade confirmada pelo painel"].slice(-8),
        }, nowMs, { label: "DJ mantido no ar", reason: "Continuidade reconhecida pelo painel" });
      }
    }

    result = resolveDjDetectionSnapshot(content, nowMs);
    return content;
  }, { publish: "none" });

  return result;
}

function resolveDjDetectionSnapshot(content, nowMs, observation = null) {
  const liveStatusTest = serializeLiveStatus(content.liveStatusTest);
  const config = liveStatusTest.djDetectionConfig;
  const allDjs = content.djs.map(serializeDj);
  const djs = allDjs.filter((dj) => dj.active);
  const manualLiveDj = resolveConfiguredLiveDjStatus(liveStatusTest, djs, nowMs, content.programs);
  const state = normalizeDjDetectionState(content.djDetectionState);
  const scheduledDj = manualLiveDj ? null : findEligibleDj(djs, liveStatusTest.djSkips, nowMs);
  const markerDj = scheduledDj && observation?.marker && markerMatchesDj(scheduledDj, observation.marker)
    ? scheduledDj
    : null;
  // A DJ who was already confirmed stays on air after the scheduled end only
  // until normal music is confirmed again. A new scheduled DJ always wins.
  const currentSessionDj = manualLiveDj ? null : findOverrunningDj(allDjs, state);
  // A schedule change never hides a DJ who is still connected. The next DJ
  // replaces them only after their own Vox login is actually connected.
  const continuingDj = currentSessionDj && currentSessionDj.id !== scheduledDj?.id
    ? currentSessionDj
    : null;
  const voxCandidates = manualLiveDj
    ? []
    : findVoxDjCandidates(djs, liveStatusTest.djSkips, state, continuingDj, config, nowMs);
  const voxCandidate = connectedVoxDjCandidate(voxCandidates, observation?.vox?.statuses);
  const voxDj = voxCandidate?.dj || null;
  const eligibleDj = voxDj || markerDj || scheduledDj || continuingDj;
  const activeOccurrence = voxCandidate?.dj.id === eligibleDj?.id
    ? voxCandidate.occurrence
    : scheduledDj && scheduledDj.id === eligibleDj?.id
      ? djScheduleOccurrence(scheduledDj, nowMs)
      : null;
  const stateMatchesEligibleDj = state.djId === eligibleDj?.id;
  const isDetectedLive = Boolean(
    eligibleDj &&
    !state.forceEnded &&
    isLiveDetectionMode(state.mode) &&
    stateMatchesEligibleDj &&
    (config.enabled || state.activation === "confirmation" || state.activation === "vox"),
  );
  const expectedEndAt = stateMatchesEligibleDj
    ? state.expectedEndAt || activeOccurrence?.expiresAt || null
    : activeOccurrence?.expiresAt || null;
  const isOverrun = Boolean(isDetectedLive && expectedEndAt && Date.parse(expectedEndAt) <= nowMs);
  const effectiveState = isOverrun && state.mode === "live" ? { ...state, mode: "overrun" } : state;
  const liveDj = manualLiveDj || (isDetectedLive
    ? liveDjStatusFromDj(
        eligibleDj,
        liveDjMatchSource(state.activation),
        liveDjDescription(state, continuingDj, isOverrun),
        content.programs,
      )
    : null);

  return {
    liveDj,
    eligibleDj,
    markerDj,
    voxDj,
    voxCandidates,
    isDetectionWindowActive: Boolean(scheduledDj || continuingDj || voxCandidates.length > 0),
    config,
    state: effectiveState,
    nextEligibleAt: nextEligibleDjStart(djs, liveStatusTest.djSkips, nowMs),
    nextDetectionAt: nextVoxEligibleDjStart(djs, liveStatusTest.djSkips, config, nowMs),
    sessionEndsAt: expectedEndAt && Date.parse(expectedEndAt) > nowMs ? expectedEndAt : null,
    expectedEndAt,
    isOverrun,
    diagnostic: observation ? normalizeDjDetectionDiagnostic(observation, effectiveState) : null,
  };
}

function nextDjDetectionState(snapshot, observation, nowMs) {
  const current = snapshot.state;
  const config = snapshot.config;
  const classification = ["music", "no-metadata", "unknown"].includes(observation.classification)
    ? observation.classification
    : "unknown";
  const source = ["metadata", "shoutcast", "vox"].includes(observation.source) ? observation.source : "none";
  const diagnostic = normalizeDjDetectionDiagnostic({ ...observation, classification, source }, current);
  const eligibleDj = snapshot.eligibleDj;
  const belongsToEligibleDj = current.djId === eligibleDj?.id;
  const expectedEndAt = current.expectedEndAt || snapshot.sessionEndsAt || null;
  const streamFingerprint = observationFingerprint(observation.streamIdentity, observation.streamFingerprint);
  const streamChanged = Boolean(streamFingerprint && current.streamFingerprint && current.streamFingerprint !== streamFingerprint);
  const titleFingerprint = observationFingerprint(observation.songTitle, observation.titleFingerprint);

  if (snapshot.liveDj?.source === "manual") return current;
  if ((!config.enabled && current.activation !== "confirmation") || !eligibleDj) {
    return current.mode === "waiting" && !current.djId
      ? current
      : { ...defaultDjDetectionState(), updatedAt: new Date(nowMs).toISOString() };
  }

  if (current.forceEnded && belongsToEligibleDj && isForceEndedForCurrentOccurrence(current, nowMs)) {
    if (classification === "music") {
      return stateFromObservation(defaultDjDetectionState(), diagnostic, nowMs, {
        djId: eligibleDj.id,
        classification,
        source,
        titleFingerprint,
        streamFingerprint,
      });
    }
    return stateFromObservation(current, diagnostic, nowMs, {
      djId: eligibleDj.id,
      classification,
      source,
      streamFingerprint,
      signals: ["Sessão encerrada pelo painel"],
    });
  }

  if (
    current.activation !== "manual" &&
    belongsToEligibleDj &&
    current.djId &&
    voxStatusForDj(snapshot.voxCandidates, observation?.vox?.statuses, current.djId) === "offline"
  ) {
    return stateFromObservation(defaultDjDetectionState(), diagnostic, nowMs, {
      classification,
      source: "vox",
      signals: ["Desconexão confirmada pelo Vox"],
    });
  }

  if (snapshot.voxDj) {
    return createVoxDjState(
      eligibleDj,
      belongsToEligibleDj ? expectedEndAt || snapshot.sessionEndsAt : snapshot.sessionEndsAt,
      diagnostic,
      nowMs,
      streamFingerprint,
    );
  }

  if (snapshot.markerDj) {
    return createMarkerDjState(eligibleDj, snapshot.sessionEndsAt, diagnostic, nowMs, streamFingerprint);
  }

  if (observation.marker) {
    const next = stateFromObservation(belongsToEligibleDj ? current : defaultDjDetectionState(), diagnostic, nowMs, {
      djId: eligibleDj.id,
      classification: "unknown",
      source: "marker",
      streamFingerprint,
      signals: ["Marcador do encoder não corresponde ao DJ agendado"],
    });
    return sameDjDetectionState(current, next) ? current : next;
  }

  if (classification === "unknown") {
    if (
      current.djId === eligibleDj.id &&
      current.classification === "unknown" &&
      current.source === diagnostic.source &&
      current.lastError === diagnostic.lastError
    ) {
      return current;
    }
    const next = stateFromObservation(belongsToEligibleDj ? current : defaultDjDetectionState(), diagnostic, nowMs, {
      djId: eligibleDj.id,
      classification: "unknown",
      source: diagnostic.source,
      streamFingerprint,
    });
    return sameDjDetectionState(current, next) ? current : { ...next, updatedAt: new Date(nowMs).toISOString() };
  }

  if (classification === "no-metadata") {
    if (belongsToEligibleDj && isLiveDetectionMode(current.mode)) {
      const next = stateFromObservation(current, diagnostic, nowMs, {
        mode: isPast(expectedEndAt, nowMs) ? "overrun" : "live",
        exitCount: 0,
        classification,
        source: diagnostic.source,
        expectedEndAt,
        streamFingerprint,
        streamChanged,
        titleStale: false,
        signals: detectionSignals({
          enterCount: current.enterCount,
          config,
          reason: observation.reason,
          streamChanged,
          activation: current.activation,
          overrun: isPast(expectedEndAt, nowMs),
        }),
      });
      if (sameDjDetectionState(current, next)) {
        return current;
      }
      return { ...next, updatedAt: new Date(nowMs).toISOString() };
    }

    const enterCount = Math.min(config.enterConfirmations, (belongsToEligibleDj ? current.enterCount : 0) + 1);
    const nextExpectedEnd = belongsToEligibleDj ? current.expectedEndAt || snapshot.sessionEndsAt : snapshot.sessionEndsAt;
    return stateFromObservation(defaultDjDetectionState(), diagnostic, nowMs, {
      mode: enterCount >= config.enterConfirmations
        ? (isPast(nextExpectedEnd, nowMs) ? "overrun" : "live")
        : "entering",
      djId: eligibleDj.id,
      enterCount,
      exitCount: 0,
      confidence: automaticConfidence(enterCount, config, observation.reason, streamChanged),
      activation: "automatic",
      classification,
      source: diagnostic.source,
      expectedEndAt: nextExpectedEnd,
      streamFingerprint,
      streamChanged,
      signals: detectionSignals({ enterCount, config, reason: observation.reason, streamChanged, overrun: isPast(nextExpectedEnd, nowMs) }),
    });
  }

  if (belongsToEligibleDj && isLiveDetectionMode(current.mode)) {
    const isDistinctMusic = Boolean(titleFingerprint && titleFingerprint !== current.exitMusicFingerprint);
    const exitCount = isDistinctMusic
      ? Math.min(config.exitConfirmations, current.exitCount + 1)
      : current.exitCount;
    if (exitCount >= config.exitConfirmations) {
      return stateFromObservation(defaultDjDetectionState(), diagnostic, nowMs, {
        classification,
        source: diagnostic.source,
        titleFingerprint,
        streamFingerprint,
        signals: ["AutoDJ confirmado por faixas diferentes"],
      });
    }
    return stateFromObservation(current, diagnostic, nowMs, {
      mode: "leaving",
      exitCount,
      classification,
      source: diagnostic.source,
      exitMusicFingerprint: isDistinctMusic ? titleFingerprint : current.exitMusicFingerprint,
      lastMusicFingerprint: titleFingerprint || current.lastMusicFingerprint,
      musicFingerprintSinceAt: titleFingerprint === current.lastMusicFingerprint
        ? current.musicFingerprintSinceAt
        : diagnostic.observedAt,
      streamFingerprint,
      streamChanged,
      titleStale: titleIsStale(current, titleFingerprint, nowMs),
      signals: [
        "Saída aguardando confirmação",
        isDistinctMusic ? `Faixa válida ${exitCount}/${config.exitConfirmations}` : "Mesma faixa mantida como possível atraso",
      ],
    });
  }

  const sameTitle = belongsToEligibleDj && titleFingerprint && titleFingerprint === current.lastMusicFingerprint;
  const musicFingerprintSinceAt = sameTitle ? current.musicFingerprintSinceAt || diagnostic.observedAt : diagnostic.observedAt;
  const titleStale = Boolean(sameTitle && Date.parse(musicFingerprintSinceAt) && nowMs - Date.parse(musicFingerprintSinceAt) >= DJ_TITLE_STALE_MS);
  const next = stateFromObservation(defaultDjDetectionState(), diagnostic, nowMs, {
    djId: eligibleDj.id,
    classification,
    source: diagnostic.source,
    lastMusicFingerprint: titleFingerprint,
    musicFingerprintSinceAt,
    streamFingerprint,
    streamChanged,
    titleStale,
    signals: titleStale ? ["Título repetido: tratado como possível metadado atrasado"] : ["Música válida identificada"],
  });
  return sameDjDetectionState(current, next) ? current : next;
}

function stateFromObservation(current, diagnostic, nowMs, patch = {}) {
  return {
    ...current,
    ...patch,
    observedAt: diagnostic.observedAt,
    latencyMs: diagnostic.latencyMs,
    lastError: diagnostic.lastError,
    voxUnavailable: diagnostic.voxUnavailable,
    updatedAt: new Date(nowMs).toISOString(),
  };
}

function createConfirmedDjState(dj, expectedEndAt, nowMs) {
  return {
    ...defaultDjDetectionState(),
    mode: isPast(expectedEndAt, nowMs) ? "overrun" : "live",
    djId: dj.id,
    confidence: 100,
    activation: "confirmation",
    source: "confirmation",
    expectedEndAt,
    observedAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
    signals: ["Entrada confirmada pelo painel"],
  };
}

function createMarkerDjState(dj, expectedEndAt, diagnostic, nowMs, streamFingerprint) {
  return stateFromObservation(defaultDjDetectionState(), diagnostic, nowMs, {
    mode: isPast(expectedEndAt, nowMs) ? "overrun" : "live",
    djId: dj.id,
    confidence: 100,
    activation: "marker",
    classification: "no-metadata",
    source: "marker",
    expectedEndAt,
    streamFingerprint,
    signals: ["Marcador explícito do encoder"],
  });
}

function createVoxDjState(dj, expectedEndAt, diagnostic, nowMs, streamFingerprint) {
  return stateFromObservation(defaultDjDetectionState(), diagnostic, nowMs, {
    mode: isPast(expectedEndAt, nowMs) ? "overrun" : "live",
    djId: dj.id,
    confidence: 100,
    activation: "vox",
    classification: diagnostic.classification,
    source: "vox",
    expectedEndAt,
    streamFingerprint,
    signals: ["Conexão do DJ confirmada pelo Vox"],
  });
}

function normalizeDjDetectionDiagnostic(value, state = null) {
  return {
    classification: ["music", "no-metadata", "unknown"].includes(value?.classification) ? value.classification : "unknown",
    source: ["metadata", "shoutcast", "marker", "confirmation", "vox"].includes(value?.source) ? value.source : "none",
    observedAt: iso(value?.observedAt) || new Date().toISOString(),
    latencyMs: Number.isFinite(Number(value?.latencyMs)) ? Math.max(0, Math.round(Number(value.latencyMs))) : null,
    cacheHit: value?.cacheHit === true,
    lastError: String(value?.lastError || "").trim().slice(0, 240) || null,
    voxUnavailable: value?.voxUnavailable === true,
    confidence: normalizeRunCount(value?.confidence ?? state?.confidence, 0, 0, 100),
    signals: Array.isArray(value?.signals) ? value.signals.map(String).filter(Boolean).slice(0, 8) : (state?.signals || []),
  };
}

function sameDjDetectionState(left, right) {
  const normalizeForComparison = (state) => {
    const normalized = normalizeDjDetectionState(state);
    delete normalized.observedAt;
    delete normalized.latencyMs;
    delete normalized.updatedAt;
    return normalized;
  };
  return JSON.stringify(normalizeForComparison(left)) === JSON.stringify(normalizeForComparison(right));
}

function isLiveDetectionMode(mode) {
  return ["live", "leaving", "overrun"].includes(mode);
}

function isPast(value, nowMs) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) && time <= nowMs;
}

function isForceEndedForCurrentOccurrence(state, nowMs) {
  return !state.expectedEndAt || Date.parse(state.expectedEndAt) > nowMs;
}

function automaticConfidence(enterCount, config, reason, streamChanged) {
  const confirmationProgress = config.enterConfirmations > 0
    ? Math.round((Math.min(enterCount, config.enterConfirmations) / config.enterConfirmations) * 60)
    : 0;
  return Math.min(100, 20 + confirmationProgress + (reason === "technical" ? 10 : 0) + (streamChanged ? 10 : 0));
}

function detectionSignals({ enterCount, config, reason, streamChanged, activation, overrun }) {
  const signals = [];
  if (activation === "marker") signals.push("Marcador explícito do encoder");
  else if (activation === "confirmation") signals.push("Entrada confirmada pelo painel");
  else signals.push("Janela de agenda ativa");
  if (enterCount) signals.push(`Leituras sem música ${enterCount}/${config.enterConfirmations}`);
  if (reason === "technical") signals.push("Título técnico ou genérico");
  if (streamChanged) signals.push("Mudança de origem ou reinício do stream");
  if (overrun) signals.push("Horário excedido");
  return signals.slice(0, 8);
}

function titleIsStale(state, titleFingerprint, nowMs) {
  if (!titleFingerprint || titleFingerprint !== state.lastMusicFingerprint || !state.musicFingerprintSinceAt) return false;
  const startedAt = Date.parse(state.musicFingerprintSinceAt);
  return Number.isFinite(startedAt) && nowMs - startedAt >= DJ_TITLE_STALE_MS;
}

function observationFingerprint(rawValue, suppliedFingerprint) {
  const raw = String(rawValue || "").trim();
  if (raw) return sha256Hex(normalizeComparableDetectionText(raw));
  const supplied = String(suppliedFingerprint || "").trim();
  return /^[a-f0-9]{64}$/i.test(supplied) ? supplied : null;
}

function normalizeComparableDetectionText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function markerMatchesDj(dj, marker) {
  return comparableAudienceText(dj.djName) === comparableAudienceText(marker?.djName) &&
    comparableAudienceText(dj.programName) === comparableAudienceText(marker?.programName);
}

function liveDjMatchSource(activation) {
  if (activation === "marker") return "marker";
  if (activation === "confirmation") return "confirmed";
  if (activation === "vox") return "vox";
  return "detection";
}

function liveDjDescription(state, continuingDj, isOverrun) {
  if (state.activation === "marker") return "marcador confirmado pelo encoder";
  if (state.activation === "confirmation") return "entrada confirmada pelo painel";
  if (state.activation === "vox") return "conexão confirmada pelo Vox";
  if (isOverrun || continuingDj) return "transmissão continuada após o horário";
  return "metadados ausentes confirmados";
}

function findEligibleDj(djs, skips, nowMs) {
  return djs
    .filter((dj) => dj.scheduleEnabled && isDjScheduleActive(dj, nowMs) && !isDjSkipped(dj, skips, nowMs))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.startTime.localeCompare(right.startTime))[0] || null;
}

function findVoxDjCandidates(djs, skips, state, continuingDj, config, nowMs) {
  const parts = saoPauloTimeParts(nowMs);
  const earlyWindowMs = (Number(config?.earlyWindowMinutes) || 0) * 60 * 1000;
  const candidates = [];
  const seen = new Set();

  for (let offset = -1; offset <= 1; offset += 1) {
    const date = shiftSaoPauloDate(parts, offset);
    const dayId = DAY_ORDER[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()] || "Sun";
    for (const dj of djs) {
      if (!dj.scheduleEnabled || !dj.voxLogin || !dj.dayIds.includes(dayId)) continue;
      const occurrence = djScheduleOccurrenceForDate(dj, date);
      if (!occurrence || isDjOccurrenceSkipped(dj, skips, occurrence)) continue;
      if (nowMs < occurrence.startsAt - earlyWindowMs || nowMs > occurrence.endsAt) continue;
      const key = `${dj.id}:${occurrence.occurrenceKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        dj,
        occurrence,
        priorityAt: occurrence.startsAt,
        isEarly: nowMs < occurrence.startsAt,
      });
    }
  }

  if (continuingDj?.voxLogin && !candidates.some((candidate) => candidate.dj.id === continuingDj.id)) {
    candidates.push({
      dj: continuingDj,
      occurrence: {
        occurrenceKey: `continuing:${continuingDj.id}`,
        startsAt: 0,
        endsAt: Date.parse(state.expectedEndAt || "") || nowMs,
        expiresAt: state.expectedEndAt || null,
      },
      priorityAt: 0,
      isEarly: false,
    });
  }

  return candidates.sort((left, right) => left.priorityAt - right.priorityAt);
}

function connectedVoxDjCandidate(candidates, statuses) {
  const statusMap = statuses && typeof statuses === "object" ? statuses : {};
  return candidates
    .filter((candidate) => statusMap[normalizeVoxDjLogin(candidate.dj.voxLogin)]?.status === "online")
    .sort((left, right) => right.priorityAt - left.priorityAt)[0] || null;
}

function voxStatusForDj(candidates, statuses, djId) {
  const candidate = candidates.find((item) => item.dj.id === djId);
  if (!candidate) return "unknown";
  return statuses?.[normalizeVoxDjLogin(candidate.dj.voxLogin)]?.status || "unknown";
}

function djScheduleOccurrenceForDate(dj, date) {
  if (!dj?.scheduleEnabled) return null;
  const start = timeToMinutes(dj.startTime);
  const end = timeToMinutes(dj.endTime);
  const endDate = shiftSaoPauloDate(date, start > end ? 1 : 0);
  const startsAt = saoPauloLocalEpoch(date, start);
  const endsAt = saoPauloLocalEpoch(endDate, end);
  return {
    occurrenceKey: saoPauloDateKey(date),
    startsAt,
    endsAt,
    expiresAt: new Date(endsAt).toISOString(),
  };
}

function isDjOccurrenceSkipped(dj, skips, occurrence) {
  return skips.some((skip) =>
    skip.djId === dj.id &&
    skip.occurrenceKey === occurrence.occurrenceKey &&
    Date.parse(skip.expiresAt) > occurrence.startsAt,
  );
}

function findOverrunningDj(djs, state) {
  if (!state?.djId || !isLiveDetectionMode(state.mode) || state.forceEnded) return null;

  return djs.find((dj) =>
    dj.id === state.djId &&
    (dj.scheduleEnabled || state.activation === "confirmation"),
  ) || null;
}

function isDjSkipped(dj, skips, nowMs) {
  const occurrence = djScheduleOccurrence(dj, nowMs);
  if (!occurrence) return false;
  return skips.some((skip) => skip.djId === dj.id && skip.occurrenceKey === occurrence.occurrenceKey && Date.parse(skip.expiresAt) > nowMs);
}

function djScheduleOccurrence(dj, nowMs) {
  if (!dj?.scheduleEnabled || !isDjScheduleActive(dj, nowMs)) return null;
  const parts = saoPauloTimeParts(nowMs);
  const start = timeToMinutes(dj.startTime);
  const end = timeToMinutes(dj.endTime);
  const startsPreviousDay = start > end && parts.minuteOfDay < end;
  const startDate = shiftSaoPauloDate(parts, startsPreviousDay ? -1 : 0);
  return djScheduleOccurrenceForDate(dj, startDate);
}

function djSkipOccurrence(dj, nowMs) {
  const activeOccurrence = djScheduleOccurrence(dj, nowMs);
  if (activeOccurrence) return activeOccurrence;
  if (!dj?.scheduleEnabled) return null;
  const parts = saoPauloTimeParts(nowMs);
  const start = timeToMinutes(dj.startTime);
  const end = timeToMinutes(dj.endTime);
  if (!dj.dayIds.includes(parts.dayId) || parts.minuteOfDay >= start) return null;
  const startDate = shiftSaoPauloDate(parts, 0);
  const endDate = shiftSaoPauloDate(startDate, start > end ? 1 : 0);
  return {
    occurrenceKey: saoPauloDateKey(startDate),
    expiresAt: new Date(saoPauloLocalEpoch(endDate, end)).toISOString(),
  };
}

function nextEligibleDjStart(djs, skips, nowMs) {
  const nowParts = saoPauloTimeParts(nowMs);
  let nearest = null;

  for (let offset = 0; offset <= 7; offset += 1) {
    const date = shiftSaoPauloDate(nowParts, offset);
    const dayId = DAY_ORDER[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()] || "Sun";
    for (const dj of djs) {
      if (!dj.active || !dj.scheduleEnabled || !dj.dayIds.includes(dayId)) continue;
      const startMs = saoPauloLocalEpoch(date, timeToMinutes(dj.startTime));
      if (startMs <= nowMs) continue;
      const occurrenceKey = saoPauloDateKey(date);
      const skipped = skips.some((skip) => skip.djId === dj.id && skip.occurrenceKey === occurrenceKey && Date.parse(skip.expiresAt) > startMs);
      if (skipped) continue;
      if (!nearest || startMs < nearest) nearest = startMs;
    }
  }

  return nearest ? new Date(nearest).toISOString() : null;
}

function nextVoxEligibleDjStart(djs, skips, config, nowMs) {
  const nowParts = saoPauloTimeParts(nowMs);
  const earlyWindowMs = (Number(config?.earlyWindowMinutes) || 0) * 60 * 1000;
  let nearest = null;

  for (let offset = 0; offset <= 7; offset += 1) {
    const date = shiftSaoPauloDate(nowParts, offset);
    const dayId = DAY_ORDER[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()] || "Sun";
    for (const dj of djs) {
      if (!dj.active || !dj.scheduleEnabled || !dj.voxLogin || !dj.dayIds.includes(dayId)) continue;
      const occurrence = djScheduleOccurrenceForDate(dj, date);
      if (!occurrence || isDjOccurrenceSkipped(dj, skips, occurrence)) continue;
      const startsAt = occurrence.startsAt - earlyWindowMs;
      if (startsAt <= nowMs) continue;
      if (!nearest || startsAt < nearest) nearest = startsAt;
    }
  }

  return nearest ? new Date(nearest).toISOString() : null;
}

function shiftSaoPauloDate(parts, offsetDays) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function saoPauloDateKey(date) {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function saoPauloLocalEpoch(date, minuteOfDay) {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return Date.UTC(date.year, date.month - 1, date.day, hour, minute) + 3 * 60 * 60 * 1000;
}

function findConfiguredDj(djs, control) {
  if (control.stationDjId) {
    const byId = djs.find((dj) => dj.id === control.stationDjId);
    if (byId) return byId;
  }
  const djName = comparableAudienceText(control.djName);
  const programName = comparableAudienceText(control.programName);
  return djs.find((dj) =>
    comparableAudienceText(dj.djName) === djName &&
    (!programName || comparableAudienceText(dj.programName) === programName),
  ) || null;
}

function isDjScheduleActive(dj, nowMs) {
  const parts = saoPauloTimeParts(nowMs);
  return isAudienceScheduleActive(dj.dayIds, dj.startTime, dj.endTime, parts);
}

function liveDjArtwork(dj, programs = []) {
  const djLogoUrl = normalizeManagedImageUrl(dj.logoUrl);
  if (djLogoUrl) return djLogoUrl;

  const programName = comparableAudienceText(dj.programName);
  if (!programName) return "";

  const matchingProgram = programs
    .map(serializeProgram)
    .find((program) => program.active &&
      comparableAudienceText(program.program) === programName &&
      normalizeManagedImageUrl(program.logoUrl));
  return matchingProgram ? normalizeManagedImageUrl(matchingProgram.logoUrl) : "";
}

function liveDjStatusFromDj(dj, matchedSignature, detectedValue, programs = []) {
  return {
    ...manualLiveDjStatus(dj.djName, dj.programName, matchedSignature, detectedValue),
    source: matchedSignature === "detection"
      ? "detection"
      : matchedSignature === "manual"
        ? "manual"
        : matchedSignature === "marker"
          ? "marker"
          : matchedSignature === "confirmed"
            ? "confirmed"
            : matchedSignature === "vox"
              ? "vox"
            : "dj",
    // The DJ artwork comes first; the program artwork is the branded fallback.
    logoUrl: liveDjArtwork(dj, programs),
    sessionId: dj.id,
    listenersMin: dj.listenersMin,
    listenersMax: dj.listenersMax,
  };
}

function defaultLiveDjControl() {
  return {
    enabled: true,
    active: false,
    stationDjId: null,
    djName: "",
    programName: "",
    startedAt: null,
    updatedAt: null,
    schedules: [],
  };
}

function normalizeLiveDjControl(value) {
  const item = value && typeof value === "object" ? value : {};
  return {
    enabled: item.enabled !== false,
    active: item.active === true,
    stationDjId: item.stationDjId ? String(item.stationDjId).trim() : null,
    djName: String(item.djName || "").trim(),
    programName: String(item.programName || "").trim(),
    startedAt: iso(item.startedAt) || null,
    updatedAt: iso(item.updatedAt) || null,
    schedules: normalizeManualLiveDjSchedules(item.schedules),
  };
}

function normalizeManualLiveDjSchedules(value) {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 56).map((schedule) => ({
    id: String(schedule?.id || randomUUID()),
    stationDjId: schedule?.stationDjId ? String(schedule.stationDjId).trim() : null,
    enabled: schedule?.enabled !== false,
    djName: String(schedule?.djName || "").trim(),
    programName: String(schedule?.programName || "").trim(),
    dayIds: normalizeAudienceDayIds(schedule?.dayIds),
    startTime: normalizeTime(schedule?.startTime, "18:00"),
    endTime: normalizeTime(schedule?.endTime, "23:59"),
  }));
}

function matchingManualLiveDjSchedule(schedules, nowMs) {
  const parts = saoPauloTimeParts(nowMs);
  return schedules.find((schedule) => {
    if (!schedule.enabled || !isAudienceScheduleActive(schedule.dayIds, schedule.startTime, schedule.endTime, parts)) return false;
    if (!schedule.djName.trim() && !schedule.programName.trim()) return false;
    return true;
  }) || null;
}

function manualLiveDjStatus(djName, programName, matchedSignature, detectedValue) {
  const cleanDjName = String(djName || "").trim() || "DJ ao vivo";
  const cleanProgramName = String(programName || "").trim() || "Programa Ao Vivo";
  return {
    state: "live",
    isLive: true,
    djName: cleanDjName,
    programName: cleanProgramName,
    matchedSignature,
    detectedValue,
    source: matchedSignature === "manual" ? "manual" : "test",
  };
}

function trackFromLiveDj(track, liveDj) {
  return {
    ...track,
    artist: liveDj.djName || "DJ ao vivo",
    title: liveDj.programName || "Programa Ao Vivo",
    raw: `${liveDj.djName || "DJ ao vivo"} - ${liveDj.programName || "Programa Ao Vivo"}`,
    coverUrl: liveDj.logoUrl || null,
  };
}

function normalizeAudienceDayIds(value) {
  if (!Array.isArray(value)) return [...AUDIENCE_DAY_IDS];
  const dayIds = value.map(String).filter((dayId) => AUDIENCE_DAY_IDS.includes(dayId));
  return dayIds.length ? dayIds : [...AUDIENCE_DAY_IDS];
}

function normalizeTime(value, fallback) {
  const clean = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(clean) ? clean : fallback;
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function constantTimeTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
