import { getStore } from "@netlify/blobs";
import { getDatabase } from "@netlify/database";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export const AD_BANNER_WIDTH = 1700;
export const AD_BANNER_HEIGHT = 450;
const MAX_ADS = 100;
const ADS_BLOB_STORE = "cnjm-ad-images";
const ADMIN_LOGIN = process.env.CNJM_ADS_ADMIN_LOGIN || "AdminRoots";
const DEFAULT_ADMIN_PASSWORD_HASH = "3365305e71f599bc6859e66c1c02d2f1e546010adc10f02e3b3364ebf1241b33";
const ADMIN_PASSWORD_HASH =
  process.env.CNJM_ADS_ADMIN_PASSWORD_HASH ||
  (process.env.CNJM_ADS_ADMIN_PASSWORD ? sha256Hex(process.env.CNJM_ADS_ADMIN_PASSWORD) : DEFAULT_ADMIN_PASSWORD_HASH);
const ADMIN_TOKEN = process.env.CNJM_ADS_ADMIN_TOKEN || ADMIN_PASSWORD_HASH;

function db() {
  return getDatabase().sql;
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

function normalizePlacement(value) {
  return ["banner", "sponsor", "general"].includes(value) ? value : "banner";
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
    updatedAt: new Date(),
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
    placement: row.placement,
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
      end_time AS "endTime"
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
      end_time AS "endTime"
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
      updated_at
    )
    VALUES (
      'global',
      ${normalized.enabled},
      ${normalized.scheduleEnabled},
      ${normalized.startTime},
      ${normalized.endTime},
      ${normalized.updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      schedule_enabled = EXCLUDED.schedule_enabled,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      updated_at = EXCLUDED.updated_at
    RETURNING
      enabled,
      schedule_enabled AS "scheduleEnabled",
      start_time AS "startTime",
      end_time AS "endTime"
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

export async function saveAdImage(payload) {
  const contentType = String(payload.contentType || "").toLowerCase();
  const width = Number(payload.width || 0);
  const height = Number(payload.height || 0);
  const dataBase64 = String(payload.dataBase64 || "");

  if (contentType !== "image/png") throw new Error("Envie um arquivo PNG.");
  if (width !== AD_BANNER_WIDTH || height !== AD_BANNER_HEIGHT) {
    throw new Error(`O PNG precisa ter ${AD_BANNER_WIDTH}x${AD_BANNER_HEIGHT}px.`);
  }
  if (!dataBase64) throw new Error("Arquivo inválido.");

  const bytes = Buffer.from(dataBase64, "base64");
  const key = `ad-${Date.now()}-${randomUUID()}.png`;
  const store = getStore(ADS_BLOB_STORE);
  await store.set(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {
    metadata: {
      contentType,
      width,
      height,
      originalName: String(payload.fileName || "anuncio.png"),
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

  const store = getStore(ADS_BLOB_STORE);
  const blob = await store.get(safeKey, { type: "arrayBuffer" });
  if (!blob) return null;

  return {
    body: Buffer.from(blob).toString("base64"),
    contentType: "image/png",
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

function sha256Hex(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function constantTimeTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
