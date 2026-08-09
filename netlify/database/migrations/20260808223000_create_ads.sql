CREATE TABLE IF NOT EXISTS site_ads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  image_key TEXT NOT NULL DEFAULT '',
  image_width INTEGER,
  image_height INTEGER,
  image_content_type TEXT,
  image_size INTEGER,
  link_url TEXT NOT NULL DEFAULT '',
  button_label TEXT NOT NULL DEFAULT 'Abrir anúncio',
  placement TEXT NOT NULL DEFAULT 'banner',
  section TEXT NOT NULL DEFAULT 'Principal',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_ads_public
ON site_ads (active, placement, sort_order, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_ads_schedule
ON site_ads (starts_at, ends_at)
WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS ad_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  start_time TEXT NOT NULL DEFAULT '08:00',
  end_time TEXT NOT NULL DEFAULT '22:00',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ad_settings (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;
