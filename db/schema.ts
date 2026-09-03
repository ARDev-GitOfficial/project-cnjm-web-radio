import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const siteAds = pgTable("site_ads", {
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

export const adSettings = pgTable("ad_settings", {
  id: text("id").primaryKey().default("global"),
  enabled: boolean("enabled").notNull().default(true),
  scheduleEnabled: boolean("schedule_enabled").notNull().default(false),
  startTime: text("start_time").notNull().default("08:00"),
  endTime: text("end_time").notNull().default("22:00"),
  commercialRuns: integer("commercial_runs").notNull().default(3),
  programRuns: integer("program_runs").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stationPrograms = pgTable("station_programs", {
  id: text("id").primaryKey(),
  dayId: text("day_id").notNull().default("Mon"),
  dayLabel: text("day_label").notNull().default("Segunda"),
  startTime: text("start_time").notNull().default("00:00"),
  endTime: text("end_time").notNull().default("23:59"),
  program: text("program").notNull().default(""),
  host: text("host").notNull().default("Web Rádio Conexão Jamaica"),
  logoUrl: text("logo_url").notNull().default(""),
  logoKey: text("logo_key").notNull().default(""),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stationDjs = pgTable("station_djs", {
  id: text("id").primaryKey(),
  signatures: text("signatures").notNull().default(""),
  djName: text("dj_name").notNull().default(""),
  programName: text("program_name").notNull().default(""),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const liveStatusSimulation = pgTable("live_status_simulation", {
  id: text("id").primaryKey().default("global"),
  state: text("state").notNull().default("off"),
  djName: text("dj_name").notNull().default("DJ Leo"),
  programName: text("program_name").notNull().default("Roots Strike"),
  listeners: integer("listeners").notNull().default(2),
  visitors: integer("visitors").notNull().default(49823),
  movementPercent: integer("movement_percent").notNull().default(32),
  liveBoostPercent: integer("live_boost_percent").notNull().default(65),
  growthPercent: integer("growth_percent").notNull().default(12),
  seed: integer("seed").notNull().default(731),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
