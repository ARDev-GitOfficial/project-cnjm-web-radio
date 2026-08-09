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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
