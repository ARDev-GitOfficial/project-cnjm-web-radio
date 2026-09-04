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
  streamSource?: string | null;
};

export type BroadcastState = "online" | "connecting" | "offline" | "live";

export type LiveDjStatus = {
  state: BroadcastState;
  isLive: boolean;
  djName: string | null;
  programName: string | null;
  matchedSignature?: string | null;
  detectedValue?: string | null;
  source: "autodj" | "dj" | "test" | "fallback";
};

export type AudienceScheduleProfile = {
  id: string;
  label: string;
  enabled: boolean;
  dayIds: string[];
  startTime: string;
  endTime: string;
  listenersMin: number;
  listenersMax: number;
  movementPercent: number;
  exitPercent: number;
  transitionPercent: number;
  visitorGrowthPercent: number;
};

export type AudienceDjProfile = {
  id: string;
  enabled: boolean;
  djName: string;
  programName: string;
  signatures: string;
  listenersMin: number;
  listenersMax: number;
  movementPercent: number;
  exitPercent: number;
  transitionPercent: number;
  liveBoostPercent: number;
};

export type ManualLiveDjSchedule = {
  id: string;
  stationDjId?: string | null;
  enabled: boolean;
  djName: string;
  programName: string;
  dayIds: string[];
  startTime: string;
  endTime: string;
};

export type ManualLiveDjControl = {
  enabled: boolean;
  active: boolean;
  djName: string;
  programName: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  schedules: ManualLiveDjSchedule[];
};

export type LiveStatusSimulation = {
  state?: BroadcastState | "off";
  enabled?: boolean;
  mode?: "audience";
  djName?: string;
  programName?: string;
  listeners?: number;
  visitors?: number;
  listenersMin?: number;
  listenersMax?: number;
  visitorBase?: number;
  visitorTarget?: number | null;
  movementPercent?: number;
  exitPercent?: number;
  transitionPercent?: number;
  liveBoostPercent?: number;
  growthPercent?: number;
  visitorGrowthPercent?: number;
  rampFromListeners?: number;
  rampFromVisitors?: number;
  seed?: number;
  updatedAt?: string;
  appliedAt?: string;
  scheduleProfiles?: AudienceScheduleProfile[];
  djProfiles?: AudienceDjProfile[];
  liveDjControl?: ManualLiveDjControl;
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
  liveDj: LiveDjStatus;
  liveStatusTest?: LiveStatusSimulation | null;
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
