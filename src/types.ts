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
  logoUrl?: string | null;
  sessionId?: string | null;
  listenersMin?: number | null;
  listenersMax?: number | null;
  matchedSignature?: string | null;
  detectedValue?: string | null;
  source: "autodj" | "dj" | "test" | "manual" | "confirmed" | "marker" | "detection" | "vox" | "metadata" | "fallback";
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
  stationDjId?: string | null;
  djName: string;
  programName: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  schedules: ManualLiveDjSchedule[];
};

export type DjDetectionConfig = {
  enabled: boolean;
  pollSeconds: 15 | 30 | 60;
  earlyWindowMinutes: 0 | 15 | 30 | 45 | 60;
  panelRefreshSeconds: 15 | 30 | 60;
  enterConfirmations: number;
  exitConfirmations: number;
  updatedAt?: string | null;
};

export type DjSkip = {
  djId: string;
  occurrenceKey: string;
  expiresAt: string;
};

export type DjDetectionMode = "waiting" | "entering" | "live" | "leaving" | "overrun";
export type DjMetadataClassification = "music" | "no-metadata" | "unknown";
export type DjDetectionSource = "metadata" | "shoutcast" | "marker" | "confirmation" | "vox" | "none";
export type DjDetectionActivation = "automatic" | "marker" | "confirmation" | "vox" | null;

export type DjDetectionState = {
  mode: DjDetectionMode;
  djId: string | null;
  enterCount: number;
  exitCount: number;
  confidence: number;
  activation: DjDetectionActivation;
  classification: DjMetadataClassification | null;
  source: DjDetectionSource;
  expectedEndAt: string | null;
  overrunAcknowledgedAt: string | null;
  forceEnded: boolean;
  lastMusicFingerprint: string | null;
  musicFingerprintSinceAt: string | null;
  exitMusicFingerprint: string | null;
  streamFingerprint: string | null;
  titleStale: boolean;
  streamChanged: boolean;
  signals: string[];
  observedAt: string | null;
  latencyMs: number | null;
  lastError: string | null;
  voxUnavailable: boolean;
  lastTransition: string | null;
  lastTransitionAt: string | null;
  lastTransitionReason: string | null;
  updatedAt: string | null;
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
  /** Independent anchor for the monotonically increasing visit counter. */
  visitorAppliedAt?: string | null;
  scheduleProfiles?: AudienceScheduleProfile[];
  djProfiles?: AudienceDjProfile[];
  liveDjControl?: ManualLiveDjControl;
  djDetectionConfig?: DjDetectionConfig;
  djSkips?: DjSkip[];
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
  liveState?: {
    version: string;
    pollSeconds: number;
    nextEligibleAt?: string | null;
  } | null;
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
