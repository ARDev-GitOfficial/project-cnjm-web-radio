export type DataSource = "live" | "fallback";

export type Track = {
  title: string;
  artist: string;
  raw: string;
  album?: string | null;
  coverUrl?: string | null;
};

export type StreamStats = {
  listeners: number;
  peakListeners: number;
  uniqueListeners: number;
  streamHits: number;
  genre: string;
  bitrate: string;
  isOnline: boolean;
  uptimeSeconds: number | null;
};

export type HistoryItem = {
  id: string;
  time: string;
  title: string;
  artist: string;
  raw: string;
  isCurrent?: boolean;
};

export type NowPlayingResponse = {
  ok: boolean;
  source: DataSource;
  track: Track;
  stats: StreamStats;
  history: HistoryItem[];
  fetchedAt: string;
  message?: string;
};

export type ScheduleSlot = {
  id: string;
  time: string;
  program: string;
  host: string;
  logoUrl?: string | null;
  isNow?: boolean;
};

export type ScheduleDay = {
  id: string;
  label: string;
  active?: boolean;
  slots: ScheduleSlot[];
};

export type ScheduleResponse = {
  ok: boolean;
  source: DataSource;
  days: ScheduleDay[];
  fetchedAt: string;
  message?: string;
};

export type CameraResponse = {
  ok: boolean;
  source: DataSource;
  playlistUrl: string | null;
  embedUrl?: string | null;
  fetchedAt: string;
  message?: string;
};

export type ChatMessage = {
  id: string;
  author: string;
  text: string;
  timestamp: string;
  local?: boolean;
};

export type ChatResponse = {
  ok: boolean;
  source: DataSource;
  messages: ChatMessage[];
  fetchedAt: string;
  message?: string;
};
