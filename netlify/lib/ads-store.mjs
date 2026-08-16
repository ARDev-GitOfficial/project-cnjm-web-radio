import { getStore } from "@netlify/blobs";
import { getDatabase } from "@netlify/database";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export const AD_BANNER_WIDTH = 1700;
export const AD_BANNER_HEIGHT = 450;
const MAX_ADS = 100;
const PROGRAM_LOGO_MAX_SIZE = 2_500_000;
const PROGRAM_LOGO_MAX_DIMENSION = 1800;
const ADS_BLOB_STORE = "cnjm-ad-images";
const IMAGE_CONTENT_TYPES = new Set(["image/png", "image/webp"]);
const ADMIN_LOGIN = process.env.CNJM_ADS_ADMIN_LOGIN || "AdminRoots";
const DEFAULT_ADMIN_PASSWORD_HASH = "3365305e71f599bc6859e66c1c02d2f1e546010adc10f02e3b3364ebf1241b33";
const ADMIN_PASSWORD_HASH =
  process.env.CNJM_ADS_ADMIN_PASSWORD_HASH ||
  (process.env.CNJM_ADS_ADMIN_PASSWORD ? sha256Hex(process.env.CNJM_ADS_ADMIN_PASSWORD) : DEFAULT_ADMIN_PASSWORD_HASH);
const ADMIN_TOKEN = process.env.CNJM_ADS_ADMIN_TOKEN || ADMIN_PASSWORD_HASH;
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

export async function listPublicAds() {
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

  return serializeSettings(settings);
}

export async function saveAd(payload) {
  const normalized = normalizeAdPayload(payload);
  const [ad] = await db()`
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

  return serializeAd(ad);
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
  return ad ? serializeAd(ad) : null;
}

export async function updateAdStats(id, field) {
  if (!["impressions", "clicks"].includes(field)) {
    throw new Error("Invalid stats field.");
  }

  const updatedAt = new Date();
  const [ad] = field === "impressions"
    ? await db()`
        UPDATE site_ads
        SET impressions = impressions + 1, updated_at = ${updatedAt}
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
      `
    : await db()`
        UPDATE site_ads
        SET clicks = clicks + 1, updated_at = ${updatedAt}
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

  return ad ? serializeAd(ad) : null;
}

export async function listPublicPrograms() {
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

export async function saveProgram(payload) {
  const normalized = normalizeProgramPayload(payload);
  if (!normalized.program) throw new Error("Informe o nome do programa.");

  const [program] = await db()`
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

  return serializeProgram(program);
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

  return program ? serializeProgram(program) : null;
}

export async function saveAdImage(payload) {
  const contentType = String(payload.contentType || "").toLowerCase();
  const width = Number(payload.width || 0);
  const height = Number(payload.height || 0);
  const dataBase64 = String(payload.dataBase64 || "");

  if (!isSupportedImageContentType(contentType)) throw new Error("Envie uma imagem PNG ou WebP.");
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

  if (!isSupportedImageContentType(contentType)) throw new Error("Envie uma logo PNG ou WebP.");
  if (!width || !height || width > PROGRAM_LOGO_MAX_DIMENSION || height > PROGRAM_LOGO_MAX_DIMENSION) {
    throw new Error(`A logo precisa ter até ${PROGRAM_LOGO_MAX_DIMENSION}px de largura e altura.`);
  }
  if (!dataBase64) throw new Error("Arquivo inválido.");

  const bytes = Buffer.from(dataBase64, "base64");
  if (bytes.byteLength > PROGRAM_LOGO_MAX_SIZE) {
    throw new Error("A logo precisa ter até 2,5 MB.");
  }

  const key = `program-${Date.now()}-${randomUUID()}.${imageExtensionForContentType(contentType)}`;
  const store = adImageStore();
  await store.set(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {
    metadata: {
      contentType,
      width,
      height,
      originalName: String(payload.fileName || `programa.${imageExtensionForContentType(contentType)}`),
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
  return Boolean(token) && constantTimeTextEqual(token, ADMIN_TOKEN);
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
