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
);

INSERT INTO live_status_simulation (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;
