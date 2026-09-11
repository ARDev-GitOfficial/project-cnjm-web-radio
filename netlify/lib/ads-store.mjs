import { getStore } from "@netlify/blobs";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export const AD_BANNER_WIDTH = 1700;
export const AD_BANNER_HEIGHT = 450;
const MAX_ADS = 100;
const MAX_DJS = 100;
const PROGRAM_LOGO_MAX_SIZE = 2_500_000;
const PROGRAM_LOGO_MAX_DIMENSION = 1800;
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
const IMAGE_CONTENT_TYPES = new Set(["image/png", "image/webp"]);
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
    const djs = cache.djs.map(serializeDj).slice(0, MAX_DJS);

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
  const normalized = Array.isArray(djs) ? djs.map(serializeDj).slice(0, MAX_DJS) : [];
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
    version: 1,
    updatedAt: new Date().toISOString(),
    ads: [],
    settings: serializeSettings(null),
    programs: defaultProgramRows().map(serializeProgram),
    djs: [],
    liveStatusTest: defaultLiveStatus(),
  };
}

function serializeSiteContent(value = {}) {
  const defaults = defaultSiteContent();
  return {
    version: 1,
    updatedAt: iso(value.updatedAt) || new Date().toISOString(),
    ads: Array.isArray(value.ads) ? value.ads.map(serializeAd).slice(0, MAX_ADS) : defaults.ads,
    settings: serializeSettings(value.settings),
    programs: Array.isArray(value.programs)
      ? value.programs.map(serializeProgram).slice(0, MAX_ADS).sort(sortPrograms)
      : defaults.programs,
    djs: Array.isArray(value.djs) ? value.djs.map(serializeDj).slice(0, MAX_DJS) : defaults.djs,
    liveStatusTest: serializeLiveStatus(value.liveStatusTest || defaults.liveStatusTest),
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

async function publishSiteContent(content) {
  const now = new Date();
  const ads = visibleAds(content.ads, now);
  const programs = content.programs.filter((program) => program.active).map(serializeProgram).sort(sortPrograms);
  const djs = content.djs.filter((dj) => dj.active).map(serializeDj).slice(0, MAX_DJS);

  await Promise.all([
    writePublicDataCache({ ads, settings: content.settings, programs, djs }),
    writePublicDjsCache(djs),
    writeLiveStatusCache(content.liveStatusTest),
  ]);
}

async function updateSiteContent(mutator) {
  const write = async () => {
    const current = await readSiteContent({ forceRefresh: true });
    const next = serializeSiteContent(await mutator(cloneSiteContent(current)));
    next.updatedAt = new Date().toISOString();
    await siteContentStore().setJSON(CONTENT_BLOB_KEY, next);
    siteContentMemoryCache = {
      content: next,
      savedAt: Date.now(),
    };
    await publishSiteContent(next);
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

  return {
    id: String(dj.id || randomUUID()),
    signatures: normalizeDjSignatures(signatures).join("\n"),
    djName: String(dj.djName || "").trim(),
    programName: String(dj.programName || "").trim(),
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
    updatedAt,
    scheduleProfiles: normalizeAudienceScheduleProfiles(payload.scheduleProfiles),
    djProfiles: normalizeAudienceDjProfiles(payload.djProfiles),
    liveDjControl: normalizeLiveDjControl(payload.liveDjControl),
  };
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
  return {
    id: row.id,
    signatures: normalizeDjSignatures(row.signatures || "").join("\n"),
    djName: row.djName || "",
    programName: row.programName || "",
    active: Boolean(row.active),
    sortOrder: Number(row.sortOrder || 0),
    createdAt: iso(row.createdAt) || new Date().toISOString(),
    updatedAt: iso(row.updatedAt) || new Date().toISOString(),
  };
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
    updatedAt: row?.updatedAt,
    scheduleProfiles: row?.scheduleProfiles,
    djProfiles: row?.djProfiles,
    liveDjControl: row?.liveDjControl,
    ...config,
  });

  return {
    ...normalized,
    appliedAt: iso(normalized.appliedAt) || new Date().toISOString(),
    updatedAt: iso(normalized.updatedAt) || new Date().toISOString(),
  };
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

  const visitorBase = test.visitorBase ?? test.visitors ?? LIVE_TEST_DEFAULT_VISITORS;
  const visitorTarget = typeof test.visitorTarget === "number" && test.visitorTarget > visitorBase
    ? test.visitorTarget
    : Math.round(visitorBase * (1 + Math.min(0.9, profile.visitorGrowthPercent / 140)));
  const visitorGrowthMinutes = 4 + (1 - profile.visitorGrowthPercent / 100) * 24;
  const visitorProgress = easedProgress(elapsedMinutes, visitorGrowthMinutes);
  const rampFromVisitors = normalizeRunCount(test.rampFromVisitors, visitorBase, 0, LIVE_TEST_MAX_VISITORS);
  const visitorPulse = 1 + softWave * 0.018 * Math.max(0.2, movement) * visitorProgress;
  const visitors = normalizeRunCount(
    (rampFromVisitors + (visitorTarget - rampFromVisitors) * visitorProgress) * visitorPulse,
    visitorBase,
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
    visitorGrowthPercent: test.visitorGrowthPercent ?? test.growthPercent ?? LIVE_TEST_DEFAULT_GROWTH,
  };
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
      visitorGrowthPercent: scheduleProfile.visitorGrowthPercent,
    };
  }

  return globalProfile;
}

export function applyLiveStatusSimulation(data, payload) {
  const test = serializeLiveStatus(payload);
  const manualLiveDj = resolveManualLiveDjStatus(test);
  const liveDj = manualLiveDj || data.liveDj;
  const track = manualLiveDj ? trackFromLiveDj(data.track, manualLiveDj) : data.track;
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

function programsData(programs, { publicOnly = false } = {}) {
  const serialized = programs
    .map(serializeProgram)
    .filter((program) => !publicOnly || program.active)
    .sort(sortPrograms);
  const fallback = serialized.length || !publicOnly
    ? serialized
    : defaultProgramRows().map(serializeProgram).sort(sortPrograms);

  return {
    programs: fallback,
    days: programsToScheduleDays(fallback),
    currentProgram: currentProgramFromPrograms(fallback),
  };
}

async function refreshPublicDataCache() {
  const content = await readSiteContent();
  await publishSiteContent(content);
  return {
    adsData: { ads: visibleAds(content.ads), settings: content.settings },
    programsData: programsData(content.programs, { publicOnly: true }),
    djs: content.djs
      .filter((dj) => dj.active)
      .map(serializeDj)
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
  });
  return updated;
}

export async function listPublicPrograms() {
  return programsData((await readSiteContent()).programs, { publicOnly: true });
}

export async function listPublicDjs() {
  return (await readSiteContent()).djs
    .filter((dj) => dj.active)
    .map(serializeDj)
    .sort((left, right) => left.sortOrder - right.sortOrder || String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, MAX_DJS);
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
  await updateSiteContent((content) => ({ ...content, liveStatusTest: normalized }));
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

export async function saveDj(payload) {
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
    savedDj = serializeDj(normalized);
    if (index >= 0) content.djs[index] = savedDj;
    else content.djs.push(savedDj);
    return content;
  });
  return savedDj;
}

export async function deleteDj(id) {
  let deleted = null;
  await updateSiteContent((content) => {
    const index = content.djs.findIndex((dj) => dj.id === String(id));
    if (index >= 0) deleted = serializeDj(content.djs.splice(index, 1)[0]);
    return content;
  });
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
  const contentType = String(payload.contentType || "").toLowerCase();
  const width = Number(payload.width || 0);
  const height = Number(payload.height || 0);
  const dataBase64 = String(payload.dataBase64 || "");

  if (contentType !== "image/webp") throw new Error("Envie uma imagem WebP otimizada.");
  if (width !== AD_BANNER_WIDTH || height !== AD_BANNER_HEIGHT) {
    throw new Error(`A imagem precisa ter ${AD_BANNER_WIDTH}x${AD_BANNER_HEIGHT}px.`);
  }
  if (!dataBase64) throw new Error("Arquivo inválido.");

  const bytes = Buffer.from(dataBase64, "base64");
  const key = `ad-${Date.now()}-${randomUUID()}.${imageExtensionForContentType(contentType)}`;
  const store = adImageStore();
  await store.set(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {
    metadata: {
      contentType,
      width,
      height,
      originalName: String(payload.fileName || `anuncio.${imageExtensionForContentType(contentType)}`),
    },
  });

  return {
    imageKey: key,
    imageUrl: `/api/ads/image/${encodeURIComponent(key)}`,
    imageWidth: width,
    imageHeight: height,
    imageContentType: contentType,
    imageSize: bytes.byteLength,
  };
}

export async function saveProgramLogo(payload) {
  const contentType = String(payload.contentType || "").toLowerCase();
  const width = Number(payload.width || 0);
  const height = Number(payload.height || 0);
  const dataBase64 = String(payload.dataBase64 || "");

  if (contentType !== "image/webp") throw new Error("Envie uma logo WebP. O painel converte PNG antes de salvar.");
  if (!width || !height || width > PROGRAM_LOGO_MAX_DIMENSION || height > PROGRAM_LOGO_MAX_DIMENSION) {
    throw new Error(`A logo precisa ter até ${PROGRAM_LOGO_MAX_DIMENSION}px de largura e altura.`);
  }
  if (!dataBase64) throw new Error("Arquivo inválido.");

  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.byteLength > PROGRAM_LOGO_MAX_SIZE) {
    throw new Error("A logo precisa ter até 2,5 MB.");
  }

  const key = `program-${Date.now()}-${randomUUID()}.webp`;
  const store = adImageStore();
  await store.set(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {
    metadata: {
      contentType,
      width,
      height,
      originalName: String(payload.fileName || "programa.webp"),
    },
  });

  return {
    imageKey: key,
    imageUrl: `/api/ads/image/${encodeURIComponent(key)}`,
    imageWidth: width,
    imageHeight: height,
    imageContentType: contentType,
    imageSize: bytes.byteLength,
  };
}

export async function readAdImage(key) {
  const safeKey = String(key || "").replace(/^\/+/, "");
  if (!safeKey || safeKey.includes("..")) return null;

  const store = adImageStore();
  const blob = await store.get(safeKey, { type: "arrayBuffer" });
  if (!blob) return null;

  return {
    body: Buffer.from(blob).toString("base64"),
    contentType: imageContentTypeFromKey(safeKey),
  };
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

function timeToMinutes(value) {
  const [hours = "0", minutes = "0"] = String(value || "00:00").split(":");
  return Number(hours) * 60 + Number(minutes);
}

function isProgramCurrent(program, now = new Date()) {
  if (program.dayId !== currentDayId(now)) return false;

  const start = timeToMinutes(program.startTime);
  let end = timeToMinutes(program.endTime);
  let current = now.getHours() * 60 + now.getMinutes();

  if (end <= start) end += 24 * 60;
  if (current < start && end > 24 * 60) current += 24 * 60;

  return current >= start && current <= end;
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
  if (parts.minuteOfDay <= end) return dayIds.includes(previousAudienceDay(parts.dayId));
  return false;
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
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  return {
    dayId: value("weekday"),
    minuteOfDay: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function isMinuteWithinWindow(current, start, end) {
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
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
      visitorGrowthPercent: normalizeRunCount(profile?.visitorGrowthPercent, LIVE_TEST_DEFAULT_GROWTH, 0, LIVE_TEST_MAX_GROWTH_PERCENT),
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

  const activeSchedule = matchingManualLiveDjSchedule(control.schedules, nowMs);
  if (!activeSchedule) return null;

  return manualLiveDjStatus(
    activeSchedule.djName,
    activeSchedule.programName,
    "agenda-manual",
    `${activeSchedule.startTime}-${activeSchedule.endTime}`,
  );
}

function defaultLiveDjControl() {
  return {
    enabled: true,
    active: false,
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
    source: "test",
  };
}

function trackFromLiveDj(track, liveDj) {
  return {
    ...track,
    artist: liveDj.djName || "DJ ao vivo",
    title: liveDj.programName || "Programa Ao Vivo",
    raw: `${liveDj.djName || "DJ ao vivo"} - ${liveDj.programName || "Programa Ao Vivo"}`,
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
