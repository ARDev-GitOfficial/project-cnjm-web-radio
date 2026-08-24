CREATE TABLE IF NOT EXISTS station_djs (
  id TEXT PRIMARY KEY,
  signatures TEXT NOT NULL DEFAULT '',
  dj_name TEXT NOT NULL DEFAULT '',
  program_name TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_station_djs_public
ON station_djs (active, sort_order, updated_at DESC);
