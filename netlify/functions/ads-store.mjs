import { getStore } from "@netlify/blobs";
import { drizzle } from "drizzle-orm/netlify-db";
import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
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

const siteAds = pgTable("site_ads", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  imageKey: text("image_key").notNull().default(""),
  imageWidth: integer("image_width"),
  imageHeight: integer("image_height"),
  imageContentType: text("image_content_type"),
  imageSize: integer("image_size"),
  linkUrl: text("link_url").notNull().default(""),
  buttonLabel: text("button_label").notNull().default("Abrir anúncio"),
  placement: text("placement").notNull().default("banner"),
  section: text("section").notNull().default("Principal"),
  active: boolean("active").notNull().default(true),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

const adSettings = pgTable("ad_settings", {
  id: text("id").primaryKey().default("global"),
  enabled: boolean("enabled").notNull().default(true),
  scheduleEnabled: boolean("schedule_enabled").notNull().default(false),
  startTime: text("start_time").notNull().default("08:00"),
  endTime: text("end_time").notNull().default("22:00"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

function db() {
  return drizzle({ schema: { siteAds, adSettings } });
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

function publicAdFilter(now = new Date()) {
  return and(
    eq(siteAds.active, true),
    or(isNull(siteAds.startsAt), lte(siteAds.startsAt, now)),
    or(isNull(siteAds.endsAt), gte(siteAds.endsAt, now)),
  );
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
    database
      .select()
      .from(siteAds)
      .where(publicAdFilter(now))
      .orderBy(siteAds.sortOrder, desc(siteAds.updatedAt))
      .limit(MAX_ADS),
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
    database.select().from(siteAds).orderBy(siteAds.sortOrder, desc(siteAds.updatedAt)).limit(MAX_ADS),
  ]);

  return {
    ads: ads.map(serializeAd),
    settings,
  };
}

export async function getAdSettings() {
  const database = db();
  const rows = await database.select().from(adSettings).where(eq(adSettings.id, "global")).limit(1);
  if (rows[0]) return serializeSettings(rows[0]);

  const [created] = await database.insert(adSettings).values({ id: "global" }).returning();
  return serializeSettings(created);
}

export async function saveAdSettings(payload) {
  const normalized = normalizeSettingsPayload(payload);
  const [settings] = await db()
    .insert(adSettings)
    .values(normalized)
    .onConflictDoUpdate({
      target: adSettings.id,
      set: {
        enabled: normalized.enabled,
        scheduleEnabled: normalized.scheduleEnabled,
        startTime: normalized.startTime,
        endTime: normalized.endTime,
        updatedAt: normalized.updatedAt,
      },
    })
    .returning();

  return serializeSettings(settings);
}

export async function saveAd(payload) {
  const normalized = normalizeAdPayload(payload);
  const [ad] = await db()
    .insert(siteAds)
    .values(normalized)
    .onConflictDoUpdate({
      target: siteAds.id,
      set: {
        title: normalized.title,
        description: normalized.description,
        imageUrl: normalized.imageUrl,
        imageKey: normalized.imageKey,
        imageWidth: normalized.imageWidth,
        imageHeight: normalized.imageHeight,
        imageContentType: normalized.imageContentType,
        imageSize: normalized.imageSize,
        linkUrl: normalized.linkUrl,
        buttonLabel: normalized.buttonLabel,
        placement: normalized.placement,
        section: normalized.section,
        active: normalized.active,
        sortOrder: normalized.sortOrder,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        updatedAt: normalized.updatedAt,
      },
    })
    .returning();

  return serializeAd(ad);
}

export async function deleteAd(id) {
  const [ad] = await db().delete(siteAds).where(eq(siteAds.id, String(id))).returning();
  return ad ? serializeAd(ad) : null;
}

export async function updateAdStats(id, field) {
  if (!["impressions", "clicks"].includes(field)) {
    throw new Error("Invalid stats field.");
  }

  const column = field === "impressions" ? siteAds.impressions : siteAds.clicks;
  const [ad] = await db()
    .update(siteAds)
    .set({ [field]: sql`${column} + 1`, updatedAt: new Date() })
    .where(eq(siteAds.id, String(id)))
    .returning();

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
