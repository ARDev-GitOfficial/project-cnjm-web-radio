import { getStore } from "@netlify/blobs";
import { getDatabase } from "@netlify/database";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export const AD_BANNER_WIDTH = 1700;
export const AD_BANNER_HEIGHT = 450;
const MAX_ADS = 100;
const MAX_DJS = 100;
const PROGRAM_LOGO_MAX_SIZE = 2_500_000;
const PROGRAM_LOGO_MAX_DIMENSION = 1800;
const LIVE_TEST_DEFAULT_LISTENERS = 2;
const LIVE_TEST_DEFAULT_VISITORS = 49_823;
const LIVE_TEST_DEFAULT_MOVEMENT = 32;
const LIVE_TEST_DEFAULT_LIVE_BOOST = 65;
const LIVE_TEST_DEFAULT_GROWTH = 12;
const LIVE_TEST_MAX_LISTENERS = 999_999;
const LIVE_TEST_MAX_VISITORS = 9_999_999;
const LIVE_TEST_MAX_PERCENT = 200;
const LIVE_TEST_MAX_GROWTH_PERCENT = 100;
const LIVE_TEST_STATES = new Set(["online", "connecting", "offline", "live", "off"]);
const ADS_BLOB_STORE = "cnjm-ad-images";
const PUBLIC_DATA_CACHE_KEY = "public-data-cache-v1.json";
const PUBLIC_DATA_MEMORY_TTL_MS = 15 * 60 * 1000;
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

function db() {
  return getDatabase().sql;
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
  try {
    const manualConfig = manualBlobConfig();
    return manualConfig ? getStore({ name: ADS_BLOB_STORE, ...manualConfig }) : getStore(ADS_BLOB_STORE);
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
    // Public reads can fall back to the database if the lightweight cache is unavailable.
  }
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
  const state = LIVE_TEST_STATES.has(String(payload.state)) ? String(payload.state) : "off";
  return {
    state,
    djName: String(payload.djName || "DJ Leo").trim(),
    programName: String(payload.programName || "Roots Strike").trim(),
    listeners: normalizeRunCount(payload.listeners, LIVE_TEST_DEFAULT_LISTENERS, 0, LIVE_TEST_MAX_LISTENERS),
    visitors: normalizeRunCount(payload.visitors, LIVE_TEST_DEFAULT_VISITORS, 0, LIVE_TEST_MAX_VISITORS),
    movementPercent: normalizeRunCount(payload.movementPercent, LIVE_TEST_DEFAULT_MOVEMENT, 0, LIVE_TEST_MAX_PERCENT),
    liveBoostPercent: normalizeRunCount(payload.liveBoostPercent, LIVE_TEST_DEFAULT_LIVE_BOOST, 0, LIVE_TEST_MAX_PERCENT),
    growthPercent: normalizeRunCount(payload.growthPercent, LIVE_TEST_DEFAULT_GROWTH, 0, LIVE_TEST_MAX_GROWTH_PERCENT),
    seed: normalizeRunCount(payload.seed, 731, 1, 999_999),
    updatedAt: normalizeIso(payload.updatedAt) || new Date(),
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
  const normalized = normalizeLiveStatusPayload({
    state: row?.state,
    djName: row?.djName,
    programName: row?.programName,
    listeners: row?.listeners,
    visitors: row?.visitors,
    movementPercent: row?.movementPercent,
    liveBoostPercent: row?.liveBoostPercent,
    growthPercent: row?.growthPercent,
    seed: row?.seed,
    updatedAt: row?.updatedAt,
  });

  return {
    ...normalized,
    updatedAt: iso(normalized.updatedAt) || new Date().toISOString(),
  };
}

export function resolveLiveStatusMetrics(payload, nowMs = Date.now()) {
  const test = serializeLiveStatus(payload);
  const baseListeners = test.listeners ?? LIVE_TEST_DEFAULT_LISTENERS;
  const baseVisitors = test.visitors ?? LIVE_TEST_DEFAULT_VISITORS;
  const movement = (test.movementPercent ?? LIVE_TEST_DEFAULT_MOVEMENT) / 100;
  const liveBoost = test.state === "live" ? (test.liveBoostPercent ?? LIVE_TEST_DEFAULT_LIVE_BOOST) / 100 : 0;
  const growth = (test.growthPercent ?? LIVE_TEST_DEFAULT_GROWTH) / 100;
  const startedAt = new Date(test.updatedAt).getTime();
  const elapsedMinutes = Number.isNaN(startedAt) ? 0 : Math.max(0, (nowMs - startedAt) / 60_000);
  const seed = (test.seed ?? 731) / 97;
  const seconds = nowMs / 1000;
  const wave = Math.sin(seconds / 9 + seed) * 0.56 + Math.sin(seconds / 23 + seed * 1.8) * 0.32;
  const softWave = (wave + 1) / 2;
  const stateFactor = test.state === "connecting" ? 0.62 : 1;
  const listenerMovement = 1 + wave * 0.3 * movement;
  const visitorGrowth = 1 + Math.min(0.72, (elapsedMinutes / 240) * growth);
  const visitorPulse = 1 + softWave * 0.045 * movement + liveBoost * 0.34;
  const listeners = test.state === "offline" || test.state === "off"
    ? 0
    : normalizeRunCount(baseListeners * stateFactor * listenerMovement * (1 + liveBoost), 0, 0, LIVE_TEST_MAX_LISTENERS);
  const visitors = test.state === "off"
    ? baseVisitors
    : normalizeRunCount(baseVisitors * visitorGrowth * visitorPulse, baseVisitors, 0, LIVE_TEST_MAX_VISITORS);

  return { listeners, visitors };
}

export function applyLiveStatusSimulation(data, payload) {
  const test = serializeLiveStatus(payload);
  if (test.state === "off") return { ...data, liveStatusTest: test };

  const { listeners, visitors } = resolveLiveStatusMetrics(test);
  const liveDj = {
    state: test.state,
    isLive: test.state === "live",
    djName: test.state === "live" ? test.djName || "DJ Leo" : null,
    programName: test.state === "live" ? test.programName || "Roots Strike" : null,
    matchedSignature: "modo-global",
    detectedValue: "simulação global",
    source: "test",
  };

  return {
    ...data,
    ok: test.state !== "offline",
    stats: {
      ...data.stats,
      listeners,
      peakListeners: Math.max(Number(data.stats?.peakListeners || 0), listeners),
      uniqueListeners: Math.max(Number(data.stats?.uniqueListeners || 0), listeners),
      streamHits: visitors,
      isOnline: test.state !== "offline",
    },
    liveDj,
    track: test.state === "live"
      ? {
          ...data.track,
          title: liveDj.programName || "Programa Ao Vivo",
          artist: liveDj.djName || "DJ ao vivo",
          raw: `${liveDj.djName || "DJ ao vivo"} - ${liveDj.programName || "Programa Ao Vivo"}`,
        }
      : data.track,
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

async function queryPublicAdsFromDb() {
  const database = db();
  const now = new Date();
  const [settings, ads] = await Promise.all([
    getAdSettings(),
    database`
      SELECT
        id,
        title,
        description,
        image_url AS "imageUrl",
        image_key AS "imageKey",
        image_width AS "imageWidth",
        image_height AS "imageHeight",
        image_content_type AS "imageContentType",
        image_size AS "imageSize",
        link_url AS "linkUrl",
        button_label AS "buttonLabel",
        placement,
        section,
        active,
        impressions,
        clicks,
        sort_order AS "sortOrder",
        starts_at AS "startsAt",
        ends_at AS "endsAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM site_ads
      WHERE active = TRUE
        AND (starts_at IS NULL OR starts_at <= ${now})
        AND (ends_at IS NULL OR ends_at >= ${now})
      ORDER BY sort_order ASC, updated_at DESC
      LIMIT ${MAX_ADS}
    `,
  ]);

  return {
    ads: ads.map(serializeAd),
    settings,
  };
}

function adsFromPublicCache(cache) {
  if (!Array.isArray(cache?.ads)) return null;

  return {
    ads: cache.ads.map(serializeAd).slice(0, MAX_ADS),
    settings: serializeSettings(cache.settings),
  };
}

async function refreshPublicDataCache() {
  const [adsData, programsData, djs] = await Promise.all([
    queryPublicAdsFromDb(),
    queryPublicProgramsFromDb(),
    queryPublicDjsFromDb(),
  ]);
  await writePublicDataCache({
    ads: adsData.ads,
    settings: adsData.settings,
    programs: programsData.programs,
    djs,
  });
  return { adsData, programsData, djs };
}

async function refreshPublicDataCacheBestEffort() {
  try {
    await refreshPublicDataCache();
  } catch {
    // Admin writes should still succeed if cache refresh fails.
  }
}

export async function listPublicAds() {
  const cached = adsFromPublicCache(await readPublicDataCache());
  if (cached) return cached;

  const { adsData } = await refreshPublicDataCache();
  return adsData;
}

export async function listAdminAds() {
  const database = db();
  const [settings, ads] = await Promise.all([
    getAdSettings(),
    database`
      SELECT
        id,
        title,
        description,
        image_url AS "imageUrl",
        image_key AS "imageKey",
        image_width AS "imageWidth",
        image_height AS "imageHeight",
        image_content_type AS "imageContentType",
        image_size AS "imageSize",
        link_url AS "linkUrl",
        button_label AS "buttonLabel",
        placement,
        section,
        active,
        impressions,
        clicks,
        sort_order AS "sortOrder",
        starts_at AS "startsAt",
        ends_at AS "endsAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM site_ads
      ORDER BY sort_order ASC, updated_at DESC
      LIMIT ${MAX_ADS}
    `,
  ]);

  return {
    ads: ads.map(serializeAd),
    settings,
  };
}

export async function getAdSettings() {
  const database = db();
  const rows = await database`
    SELECT
      enabled,
      schedule_enabled AS "scheduleEnabled",
      start_time AS "startTime",
      end_time AS "endTime",
      commercial_runs AS "commercialRuns",
      program_runs AS "programRuns"
    FROM ad_settings
    WHERE id = 'global'
    LIMIT 1
  `;
  if (rows[0]) return serializeSettings(rows[0]);

  const [created] = await database`
    INSERT INTO ad_settings (id)
    VALUES ('global')
    ON CONFLICT (id) DO NOTHING
    RETURNING
      enabled,
      schedule_enabled AS "scheduleEnabled",
      start_time AS "startTime",
      end_time AS "endTime",
      commercial_runs AS "commercialRuns",
      program_runs AS "programRuns"
  `;
  if (!created) return serializeSettings(null);

  return serializeSettings(created);
}

export async function saveAdSettings(payload) {
  const normalized = normalizeSettingsPayload(payload);
  const [settings] = await db()`
    INSERT INTO ad_settings (
      id,
      enabled,
      schedule_enabled,
      start_time,
      end_time,
      commercial_runs,
      program_runs,
      updated_at
    )
    VALUES (
      'global',
      ${normalized.enabled},
      ${normalized.scheduleEnabled},
      ${normalized.startTime},
      ${normalized.endTime},
      ${normalized.commercialRuns},
      ${normalized.programRuns},
      ${normalized.updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      schedule_enabled = EXCLUDED.schedule_enabled,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      commercial_runs = EXCLUDED.commercial_runs,
      program_runs = EXCLUDED.program_runs,
      updated_at = EXCLUDED.updated_at
    RETURNING
      enabled,
      schedule_enabled AS "scheduleEnabled",
      start_time AS "startTime",
      end_time AS "endTime",
      commercial_runs AS "commercialRuns",
      program_runs AS "programRuns"
  `;

  const serialized = serializeSettings(settings);
  await refreshPublicDataCacheBestEffort();
  return serialized;
}

export async function saveAd(payload) {
  const normalized = normalizeAdPayload(payload);
  const database = db();
  const [currentAd] = await database`
    SELECT image_key AS "imageKey"
    FROM site_ads
    WHERE id = ${normalized.id}
    LIMIT 1
  `;
  const [ad] = await database`
    INSERT INTO site_ads (
      id,
      title,
      description,
      image_url,
      image_key,
      image_width,
      image_height,
      image_content_type,
      image_size,
      link_url,
      button_label,
      placement,
      section,
      active,
      impressions,
      clicks,
      sort_order,
      starts_at,
      ends_at,
      created_at,
      updated_at
    )
    VALUES (
      ${normalized.id},
      ${normalized.title},
      ${normalized.description},
      ${normalized.imageUrl},
      ${normalized.imageKey},
      ${normalized.imageWidth},
      ${normalized.imageHeight},
      ${normalized.imageContentType},
      ${normalized.imageSize},
      ${normalized.linkUrl},
      ${normalized.buttonLabel},
      ${normalized.placement},
      ${normalized.section},
      ${normalized.active},
      ${normalized.impressions},
      ${normalized.clicks},
      ${normalized.sortOrder},
      ${normalized.startsAt},
      ${normalized.endsAt},
      ${normalized.createdAt},
      ${normalized.updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      image_url = EXCLUDED.image_url,
      image_key = EXCLUDED.image_key,
      image_width = EXCLUDED.image_width,
      image_height = EXCLUDED.image_height,
      image_content_type = EXCLUDED.image_content_type,
      image_size = EXCLUDED.image_size,
      link_url = EXCLUDED.link_url,
      button_label = EXCLUDED.button_label,
      placement = EXCLUDED.placement,
      section = EXCLUDED.section,
      active = EXCLUDED.active,
      sort_order = EXCLUDED.sort_order,
      starts_at = EXCLUDED.starts_at,
      ends_at = EXCLUDED.ends_at,
      updated_at = EXCLUDED.updated_at
    RETURNING
      id,
      title,
      description,
      image_url AS "imageUrl",
      image_key AS "imageKey",
      image_width AS "imageWidth",
      image_height AS "imageHeight",
      image_content_type AS "imageContentType",
      image_size AS "imageSize",
      link_url AS "linkUrl",
      button_label AS "buttonLabel",
      placement,
      section,
      active,
      impressions,
      clicks,
      sort_order AS "sortOrder",
      starts_at AS "startsAt",
      ends_at AS "endsAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;

  if (currentAd?.imageKey && currentAd.imageKey !== ad.imageKey) {
    await deleteStoredImage(currentAd.imageKey);
  }

  const serialized = serializeAd(ad);
  await refreshPublicDataCacheBestEffort();
  return serialized;
}

export async function deleteAd(id) {
  const [ad] = await db()`
    DELETE FROM site_ads
    WHERE id = ${String(id)}
    RETURNING
      id,
      title,
      description,
      image_url AS "imageUrl",
      image_key AS "imageKey",
      image_width AS "imageWidth",
      image_height AS "imageHeight",
      image_content_type AS "imageContentType",
      image_size AS "imageSize",
      link_url AS "linkUrl",
      button_label AS "buttonLabel",
      placement,
      section,
      active,
      impressions,
      clicks,
      sort_order AS "sortOrder",
      starts_at AS "startsAt",
      ends_at AS "endsAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;
  if (ad?.imageKey) {
    await deleteStoredImage(ad.imageKey);
  }
  await refreshPublicDataCacheBestEffort();
  return ad ? serializeAd(ad) : null;
}

export async function updateAdStats(id, field) {
  if (field !== "clicks") {
    throw new Error("Invalid stats field.");
  }

  const updatedAt = new Date();
  const [ad] = await db()`
    UPDATE site_ads
    SET clicks = clicks + 1, updated_at = ${updatedAt}
    WHERE id = ${String(id)}
      AND link_url IS NOT NULL
      AND link_url <> ''
    RETURNING
      id,
      title,
      description,
      image_url AS "imageUrl",
      image_key AS "imageKey",
      image_width AS "imageWidth",
      image_height AS "imageHeight",
      image_content_type AS "imageContentType",
      image_size AS "imageSize",
      link_url AS "linkUrl",
      button_label AS "buttonLabel",
      placement,
      section,
      active,
      impressions,
      clicks,
      sort_order AS "sortOrder",
      starts_at AS "startsAt",
      ends_at AS "endsAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;

  return ad ? serializeAd(ad) : null;
}

async function queryPublicProgramsFromDb() {
  await ensureDefaultPrograms();
  const programs = await db()`
    SELECT
      id,
      day_id AS "dayId",
      day_label AS "dayLabel",
      start_time AS "startTime",
      end_time AS "endTime",
      program,
      host,
      logo_url AS "logoUrl",
      logo_key AS "logoKey",
      active,
      sort_order AS "sortOrder",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM station_programs
    WHERE active = TRUE
    ORDER BY day_id ASC, sort_order ASC, start_time ASC
  `;
  const serialized = programs.map(serializeProgram).sort(sortPrograms);

  return {
    programs: serialized,
    days: programsToScheduleDays(serialized),
    currentProgram: currentProgramFromPrograms(serialized),
  };
}

function programsFromPublicCache(cache) {
  if (!Array.isArray(cache?.programs)) return null;

  const serialized = cache.programs.map(serializeProgram).sort(sortPrograms);
  return {
    programs: serialized,
    days: programsToScheduleDays(serialized),
    currentProgram: currentProgramFromPrograms(serialized),
  };
}

export async function listPublicPrograms() {
  const cached = programsFromPublicCache(await readPublicDataCache());
  if (cached) return cached;

  const { programsData } = await refreshPublicDataCache();
  return programsData;
}

async function queryPublicDjsFromDb() {
  try {
    const djs = await db()`
      SELECT
        id,
        signatures,
        dj_name AS "djName",
        program_name AS "programName",
        active,
        sort_order AS "sortOrder",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM station_djs
      WHERE active = TRUE
      ORDER BY sort_order ASC, updated_at DESC
      LIMIT ${MAX_DJS}
    `;
    return djs.map(serializeDj);
  } catch {
    return [];
  }
}

function djsFromPublicCache(cache) {
  if (!Array.isArray(cache?.djs)) return null;
  return cache.djs.map(serializeDj).slice(0, MAX_DJS);
}

export async function listPublicDjs() {
  const cached = djsFromPublicCache(await readPublicDataCache());
  if (cached) return cached;

  const { djs } = await refreshPublicDataCache();
  return djs;
}

let liveStatusTableReady = false;

async function ensureLiveStatusTable() {
  if (liveStatusTableReady) return;

  await db()`
    CREATE TABLE IF NOT EXISTS live_status_simulation (
      id TEXT PRIMARY KEY DEFAULT 'global',
      state TEXT NOT NULL DEFAULT 'off',
      dj_name TEXT NOT NULL DEFAULT 'DJ Leo',
      program_name TEXT NOT NULL DEFAULT 'Roots Strike',
      listeners INTEGER NOT NULL DEFAULT 2,
      visitors INTEGER NOT NULL DEFAULT 49823,
      movement_percent INTEGER NOT NULL DEFAULT 32,
      live_boost_percent INTEGER NOT NULL DEFAULT 65,
      growth_percent INTEGER NOT NULL DEFAULT 12,
      seed INTEGER NOT NULL DEFAULT 731,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await db()`
    INSERT INTO live_status_simulation (id)
    VALUES ('global')
    ON CONFLICT (id) DO NOTHING
  `;

  liveStatusTableReady = true;
}

export async function getLiveStatusTest() {
  await ensureLiveStatusTable();

  const rows = await db()`
    SELECT
      state,
      dj_name AS "djName",
      program_name AS "programName",
      listeners,
      visitors,
      movement_percent AS "movementPercent",
      live_boost_percent AS "liveBoostPercent",
      growth_percent AS "growthPercent",
      seed,
      updated_at AS "updatedAt"
    FROM live_status_simulation
    WHERE id = 'global'
    LIMIT 1
  `;

  return serializeLiveStatus(rows[0]);
}

export async function saveLiveStatusTest(payload) {
  await ensureLiveStatusTable();

  const normalized = normalizeLiveStatusPayload(payload);
  const [row] = await db()`
    INSERT INTO live_status_simulation (
      id,
      state,
      dj_name,
      program_name,
      listeners,
      visitors,
      movement_percent,
      live_boost_percent,
      growth_percent,
      seed,
      updated_at
    )
    VALUES (
      'global',
      ${normalized.state},
      ${normalized.djName},
      ${normalized.programName},
      ${normalized.listeners},
      ${normalized.visitors},
      ${normalized.movementPercent},
      ${normalized.liveBoostPercent},
      ${normalized.growthPercent},
      ${normalized.seed},
      ${normalized.updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      state = EXCLUDED.state,
      dj_name = EXCLUDED.dj_name,
      program_name = EXCLUDED.program_name,
      listeners = EXCLUDED.listeners,
      visitors = EXCLUDED.visitors,
      movement_percent = EXCLUDED.movement_percent,
      live_boost_percent = EXCLUDED.live_boost_percent,
      growth_percent = EXCLUDED.growth_percent,
      seed = EXCLUDED.seed,
      updated_at = EXCLUDED.updated_at
    RETURNING
      state,
      dj_name AS "djName",
      program_name AS "programName",
      listeners,
      visitors,
      movement_percent AS "movementPercent",
      live_boost_percent AS "liveBoostPercent",
      growth_percent AS "growthPercent",
      seed,
      updated_at AS "updatedAt"
  `;

  return serializeLiveStatus(row);
}

export async function listAdminPrograms() {
  await ensureDefaultPrograms();
  const programs = await db()`
    SELECT
      id,
      day_id AS "dayId",
      day_label AS "dayLabel",
      start_time AS "startTime",
      end_time AS "endTime",
      program,
      host,
      logo_url AS "logoUrl",
      logo_key AS "logoKey",
      active,
      sort_order AS "sortOrder",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM station_programs
    ORDER BY day_id ASC, sort_order ASC, start_time ASC
  `;
  const serialized = programs.map(serializeProgram).sort(sortPrograms);

  return {
    programs: serialized,
    days: programsToScheduleDays(serialized),
    currentProgram: currentProgramFromPrograms(serialized),
  };
}

export async function listAdminDjs() {
  try {
    const djs = await db()`
      SELECT
        id,
        signatures,
        dj_name AS "djName",
        program_name AS "programName",
        active,
        sort_order AS "sortOrder",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM station_djs
      ORDER BY sort_order ASC, updated_at DESC
      LIMIT ${MAX_DJS}
    `;
    return djs.map(serializeDj);
  } catch {
    return [];
  }
}

export async function saveDj(payload) {
  const normalized = normalizeDjPayload(payload);
  if (!normalized.djName) throw new Error("Informe o nome público do DJ.");
  if (!normalized.programName) throw new Error("Informe o nome do programa ao vivo.");
  if (!normalized.signatures) throw new Error("Cadastre pelo menos uma assinatura de login.");

  const [dj] = await db()`
    INSERT INTO station_djs (
      id,
      signatures,
      dj_name,
      program_name,
      active,
      sort_order,
      created_at,
      updated_at
    )
    VALUES (
      ${normalized.id},
      ${normalized.signatures},
      ${normalized.djName},
      ${normalized.programName},
      ${normalized.active},
      ${normalized.sortOrder},
      ${normalized.createdAt},
      ${normalized.updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      signatures = EXCLUDED.signatures,
      dj_name = EXCLUDED.dj_name,
      program_name = EXCLUDED.program_name,
      active = EXCLUDED.active,
      sort_order = EXCLUDED.sort_order,
      updated_at = EXCLUDED.updated_at
    RETURNING
      id,
      signatures,
      dj_name AS "djName",
      program_name AS "programName",
      active,
      sort_order AS "sortOrder",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;

  const serialized = serializeDj(dj);
  await refreshPublicDataCacheBestEffort();
  return serialized;
}

export async function deleteDj(id) {
  const [dj] = await db()`
    DELETE FROM station_djs
    WHERE id = ${String(id)}
    RETURNING
      id,
      signatures,
      dj_name AS "djName",
      program_name AS "programName",
      active,
      sort_order AS "sortOrder",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;

  await refreshPublicDataCacheBestEffort();
  return dj ? serializeDj(dj) : null;
}

export async function saveProgram(payload) {
  const normalized = normalizeProgramPayload(payload);
  if (!normalized.program) throw new Error("Informe o nome do programa.");

  const database = db();
  const [currentProgram] = await database`
    SELECT logo_key AS "logoKey"
    FROM station_programs
    WHERE id = ${normalized.id}
    LIMIT 1
  `;
  const [program] = await database`
    INSERT INTO station_programs (
      id,
      day_id,
      day_label,
      start_time,
      end_time,
      program,
      host,
      logo_url,
      logo_key,
      active,
      sort_order,
      created_at,
      updated_at
    )
    VALUES (
      ${normalized.id},
      ${normalized.dayId},
      ${normalized.dayLabel},
      ${normalized.startTime},
      ${normalized.endTime},
      ${normalized.program},
      ${normalized.host},
      ${normalized.logoUrl},
      ${normalized.logoKey},
      ${normalized.active},
      ${normalized.sortOrder},
      ${normalized.createdAt},
      ${normalized.updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      day_id = EXCLUDED.day_id,
      day_label = EXCLUDED.day_label,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      program = EXCLUDED.program,
      host = EXCLUDED.host,
      logo_url = EXCLUDED.logo_url,
      logo_key = EXCLUDED.logo_key,
      active = EXCLUDED.active,
      sort_order = EXCLUDED.sort_order,
      updated_at = EXCLUDED.updated_at
    RETURNING
      id,
      day_id AS "dayId",
      day_label AS "dayLabel",
      start_time AS "startTime",
      end_time AS "endTime",
      program,
      host,
      logo_url AS "logoUrl",
      logo_key AS "logoKey",
      active,
      sort_order AS "sortOrder",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;

  if (currentProgram?.logoKey && currentProgram.logoKey !== program.logoKey) {
    await deleteStoredImage(currentProgram.logoKey);
  }

  const serialized = serializeProgram(program);
  await refreshPublicDataCacheBestEffort();
  return serialized;
}

export async function deleteProgram(id) {
  const [program] = await db()`
    DELETE FROM station_programs
    WHERE id = ${String(id)}
    RETURNING
      id,
      day_id AS "dayId",
      day_label AS "dayLabel",
      start_time AS "startTime",
      end_time AS "endTime",
      program,
      host,
      logo_url AS "logoUrl",
      logo_key AS "logoKey",
      active,
      sort_order AS "sortOrder",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;
  if (program?.logoKey) {
    await deleteStoredImage(program.logoKey);
  }

  await refreshPublicDataCacheBestEffort();
  return program ? serializeProgram(program) : null;
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

async function ensureDefaultPrograms() {
  await db()`
    INSERT INTO station_programs (id, day_id, day_label, start_time, end_time, program, host, sort_order)
    VALUES
      ('sun-madrugada', 'Sun', 'Domingo', '00:00', '04:59', 'Madrugada Reggae', 'Web Rádio Conexão Jamaica', 1),
      ('sun-manha', 'Sun', 'Domingo', '05:00', '11:59', 'Conexão Jamaica Manhã', 'Web Rádio Conexão Jamaica', 2),
      ('sun-tarde-noite', 'Sun', 'Domingo', '12:00', '23:59', 'Domingo Roots', 'Web Rádio Conexão Jamaica', 3),
      ('mon-madrugada', 'Mon', 'Segunda', '00:00', '04:59', 'Madrugada Reggae', 'Web Rádio Conexão Jamaica', 1),
      ('mon-manha', 'Mon', 'Segunda', '05:00', '11:59', 'Conexão Jamaica Manhã', 'Web Rádio Conexão Jamaica', 2),
      ('mon-tarde-noite', 'Mon', 'Segunda', '12:00', '23:59', 'Reggae em todas as vertentes', 'Web Rádio Conexão Jamaica', 3),
      ('tue-madrugada', 'Tue', 'Terça', '00:00', '04:59', 'Madrugada Reggae', 'Web Rádio Conexão Jamaica', 1),
      ('tue-manha', 'Tue', 'Terça', '05:00', '11:59', 'Conexão Jamaica Manhã', 'Web Rádio Conexão Jamaica', 2),
      ('tue-tarde-noite', 'Tue', 'Terça', '12:00', '23:59', 'Reggae em todas as vertentes', 'Web Rádio Conexão Jamaica', 3),
      ('wed-madrugada', 'Wed', 'Quarta', '00:00', '04:59', 'Madrugada Reggae', 'Web Rádio Conexão Jamaica', 1),
      ('wed-manha', 'Wed', 'Quarta', '05:00', '11:59', 'Conexão Jamaica Manhã', 'Web Rádio Conexão Jamaica', 2),
      ('wed-tarde-noite', 'Wed', 'Quarta', '12:00', '23:59', 'Reggae em todas as vertentes', 'Web Rádio Conexão Jamaica', 3),
      ('thu-madrugada', 'Thu', 'Quinta', '00:00', '04:59', 'Madrugada Reggae', 'Web Rádio Conexão Jamaica', 1),
      ('thu-manha', 'Thu', 'Quinta', '05:00', '11:59', 'Conexão Jamaica Manhã', 'Web Rádio Conexão Jamaica', 2),
      ('thu-tarde-noite', 'Thu', 'Quinta', '12:00', '23:59', 'Reggae em todas as vertentes', 'Web Rádio Conexão Jamaica', 3),
      ('fri-madrugada', 'Fri', 'Sexta', '00:00', '04:59', 'Madrugada Reggae', 'Web Rádio Conexão Jamaica', 1),
      ('fri-manha', 'Fri', 'Sexta', '05:00', '11:59', 'Conexão Jamaica Manhã', 'Web Rádio Conexão Jamaica', 2),
      ('fri-tarde-noite', 'Fri', 'Sexta', '12:00', '23:59', 'Reggae em todas as vertentes', 'Web Rádio Conexão Jamaica', 3),
      ('sat-madrugada', 'Sat', 'Sábado', '00:00', '04:59', 'Madrugada Reggae', 'Web Rádio Conexão Jamaica', 1),
      ('sat-manha', 'Sat', 'Sábado', '05:00', '11:59', 'Conexão Jamaica Manhã', 'Web Rádio Conexão Jamaica', 2),
      ('sat-tarde-noite', 'Sat', 'Sábado', '12:00', '23:59', 'Sábado Reggae Vibes', 'Web Rádio Conexão Jamaica', 3)
    ON CONFLICT (id) DO NOTHING
  `;
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

function normalizeRunCount(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function constantTimeTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
