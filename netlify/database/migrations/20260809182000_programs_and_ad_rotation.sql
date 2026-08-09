ALTER TABLE ad_settings
ADD COLUMN IF NOT EXISTS commercial_runs INTEGER NOT NULL DEFAULT 3;

ALTER TABLE ad_settings
ADD COLUMN IF NOT EXISTS program_runs INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS station_programs (
  id TEXT PRIMARY KEY,
  day_id TEXT NOT NULL DEFAULT 'Mon',
  day_label TEXT NOT NULL DEFAULT 'Segunda',
  start_time TEXT NOT NULL DEFAULT '00:00',
  end_time TEXT NOT NULL DEFAULT '23:59',
  program TEXT NOT NULL DEFAULT '',
  host TEXT NOT NULL DEFAULT 'Web Rádio Conexão Jamaica',
  logo_url TEXT NOT NULL DEFAULT '',
  logo_key TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_station_programs_public
ON station_programs (active, day_id, sort_order, start_time);

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
ON CONFLICT (id) DO NOTHING;
