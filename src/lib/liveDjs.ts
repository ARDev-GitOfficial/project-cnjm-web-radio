import type {
  AudienceDjProfile,
  AudienceScheduleProfile,
  LiveDjStatus,
  LiveStatusSimulation,
  ManualLiveDjControl,
  ManualLiveDjSchedule,
  NowPlayingResponse,
} from "../types";

export type StationDj = {
  id: string;
  signatures: string;
  djName: string;
  programName: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DjsSource = "blobs" | "local" | "fallback";

export type DjsPayload = {
  djs: StationDj[];
  source: DjsSource;
  fetchedAt: string;
  message?: string;
};

export type LiveStatusTestPayload = LiveStatusSimulation;

export type LiveStatusResolvedMetrics = {
  listeners: number;
  visitors: number;
};

export type LiveStatusTestSource = "blobs" | "local" | "fallback";

export type LiveStatusTestResponse = {
  liveStatusTest: LiveStatusTestPayload;
  source: LiveStatusTestSource;
  fetchedAt: string;
  message?: string;
};

type ApiDjsPayload = {
  ok?: boolean;
  source?: string;
  message?: string;
  djs?: Partial<StationDj>[];
  dj?: Partial<StationDj> | null;
  liveStatusTest?: Partial<LiveStatusTestPayload> | null;
  fetchedAt?: string;
};

export const DJ_STORAGE_KEY = "cnjm-station-djs-v1";
export const LIVE_STATUS_TEST_KEY = "cnjm-live-status-test-v1";
export const LIVE_TEST_DEFAULT_LISTENERS = 2;
export const LIVE_TEST_DEFAULT_VISITORS = 49_823;
export const LIVE_TEST_DEFAULT_LISTENERS_MIN = 2;
export const LIVE_TEST_DEFAULT_LISTENERS_MAX = 12;
export const LIVE_TEST_DEFAULT_MOVEMENT = 32;
export const LIVE_TEST_DEFAULT_EXIT = 36;
export const LIVE_TEST_DEFAULT_TRANSITION = 58;
export const LIVE_TEST_DEFAULT_LIVE_BOOST = 65;
export const LIVE_TEST_DEFAULT_GROWTH = 12;
export const LIVE_TEST_MAX_LISTENERS = 999_999;
export const LIVE_TEST_MAX_VISITORS = 9_999_999;
export const LIVE_TEST_MAX_PERCENT = 200;
export const LIVE_TEST_MAX_GROWTH_PERCENT = 100;
export const AUDIENCE_DAY_IDS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type AudienceContext = {
  liveDj?: LiveDjStatus | null;
};

type ActiveAudienceProfile = {
  source: "global" | "schedule" | "dj";
  label: string;
  listenersMin: number;
  listenersMax: number;
  movementPercent: number;
  exitPercent: number;
  transitionPercent: number;
  liveBoostPercent: number;
  visitorGrowthPercent: number;
};

const API_BASE = "/api/djs";

export const emptyDj = (): StationDj => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    signatures: "",
    djName: "",
    programName: "",
    active: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
};

export function normalizeDj(dj: Partial<StationDj>): StationDj {
  const fallback = emptyDj();
  const now = new Date().toISOString();

  return {
    ...fallback,
    ...dj,
    id: String(dj.id || fallback.id),
    signatures: normalizeSignatures(dj.signatures || ""),
    djName: String(dj.djName || "").trim(),
    programName: String(dj.programName || "").trim(),
    active: dj.active !== false,
    sortOrder: Number.isFinite(Number(dj.sortOrder)) ? Number(dj.sortOrder) : 0,
    createdAt: normalizeIsoString(dj.createdAt) || now,
    updatedAt: normalizeIsoString(dj.updatedAt) || now,
  };
}

export function loadDjs(): StationDj[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(DJ_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StationDj>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeDj).filter((dj) => dj.djName && dj.programName).sort(sortDjs);
  } catch {
    return [];
  }
}

export function saveDjs(djs: StationDj[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DJ_STORAGE_KEY, JSON.stringify(djs.map(normalizeDj).sort(sortDjs)));
}

export function localDjsPayload(message?: string): DjsPayload {
  return {
    djs: loadDjs(),
    source: "local",
    fetchedAt: new Date().toISOString(),
    message,
  };
}

export async function fetchAdminDjs(token: string, signal?: AbortSignal): Promise<DjsPayload> {
  const payload = await requestJson<ApiDjsPayload>(API_BASE, {
    signal,
    headers: authHeaders(token),
  });
  return hydrateDjsPayload(payload, "blobs");
}

export async function saveRemoteDj(token: string, dj: StationDj) {
  const isExisting = Boolean(dj.id);
  const url = isExisting ? `${API_BASE}/${encodeURIComponent(dj.id)}` : API_BASE;
  const payload = await requestJson<ApiDjsPayload>(url, {
    method: isExisting ? "PUT" : "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ dj }),
  });
  return normalizeDj(payload.dj || dj);
}

export async function deleteRemoteDj(token: string, id: string) {
  await requestJson(`${API_BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function fetchLiveStatusTest(signal?: AbortSignal): Promise<LiveStatusTestResponse> {
  try {
    const payload = await requestJson<ApiDjsPayload>("/api/live-status-test", { signal });
    return {
      liveStatusTest: normalizeLiveStatusTest(payload.liveStatusTest || { state: "off" }),
      source: payload.source === "blobs" ? "blobs" : "fallback",
      fetchedAt: payload.fetchedAt || new Date().toISOString(),
      message: payload.message,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audiência indisponível.";
    return canUseLocalFallback()
      ? localLiveStatusPayload(message)
      : {
          liveStatusTest: normalizeLiveStatusTest({ state: "off" }),
          source: "fallback",
          fetchedAt: new Date().toISOString(),
          message,
        };
  }
}

export async function saveRemoteLiveStatusTest(token: string, liveStatusTest: LiveStatusTestPayload) {
  const payload = await requestJson<ApiDjsPayload>("/api/live-status-test", {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ liveStatusTest }),
  });
  return normalizeLiveStatusTest(payload.liveStatusTest || liveStatusTest);
}

export function localLiveStatusPayload(message?: string): LiveStatusTestResponse {
  return {
    liveStatusTest: readLiveStatusTest(),
    source: "local",
    fetchedAt: new Date().toISOString(),
    message,
  };
}

export function readLiveStatusTest(): LiveStatusTestPayload {
  if (typeof window === "undefined") return { state: "off" };

  try {
    const parsed = JSON.parse(window.localStorage.getItem(LIVE_STATUS_TEST_KEY) || "{}") as Partial<LiveStatusTestPayload>;
    return normalizeLiveStatusTest(parsed);
  } catch {
    return { state: "off" };
  }
}

export function writeLiveStatusTest(payload: LiveStatusTestPayload) {
  if (typeof window === "undefined") return;
  const normalized = normalizeLiveStatusTest(payload);
  window.localStorage.setItem(LIVE_STATUS_TEST_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("cnjm-live-status-test", { detail: normalized }));
}

export function nextLiveStatusTest(current: LiveStatusTestPayload, dj?: StationDj): LiveStatusTestPayload {
  const normalizedCurrent = normalizeLiveStatusTest(current);
  const sampleDj = dj && dj.djName && dj.programName
    ? dj
    : { djName: "DJ Leo", programName: "Roots Strike" };

  return {
    ...normalizedCurrent,
    enabled: !normalizedCurrent.enabled,
    state: normalizedCurrent.enabled ? "off" : "online",
    djName: sampleDj.djName,
    programName: sampleDj.programName,
    appliedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function resolveLiveStatusTestMetrics(
  payload: LiveStatusTestPayload,
  nowMs = Date.now(),
  context: AudienceContext = {},
): LiveStatusResolvedMetrics {
  const test = normalizeLiveStatusTest(payload);
  const profile = resolveLiveStatusAudienceProfile(test, nowMs, context);
  const isLive = Boolean(context.liveDj?.isLive);
  const liveBoost = isLive ? profile.liveBoostPercent / 100 : 0;
  const minListeners = Math.max(0, Math.round(profile.listenersMin * (1 + liveBoost)));
  const maxListeners = Math.max(minListeners, Math.round(profile.listenersMax * (1 + liveBoost)));
  const movement = profile.movementPercent / 100;
  const exitPressure = profile.exitPercent / 100;
  const startedAt = normalizeDateMs(test.appliedAt || test.updatedAt);
  const elapsedMinutes = startedAt ? Math.max(0, (nowMs - startedAt) / 60_000) : 0;
  const seed = (test.seed ?? 731) / 97;
  const seconds = nowMs / 1000;
  const wave = Math.sin(seconds / 11 + seed) * 0.52 + Math.sin(seconds / 31 + seed * 1.7) * 0.34 + Math.cos(seconds / 53 + seed * 0.8) * 0.14;
  const softWave = Math.max(0, Math.min(1, (wave + 1) / 2));
  const exitBias = wave < 0 ? Math.abs(wave) * 0.18 * exitPressure : 0;
  const position = Math.max(0, Math.min(1, 0.5 + wave * 0.5 * Math.max(0.08, movement) - exitBias));
  const targetListeners = minListeners + (maxListeners - minListeners) * position;
  const transitionProgress = easedProgress(elapsedMinutes, transitionMinutes(profile.transitionPercent));
  const rampFromListeners = normalizeWholeNumber(test.rampFromListeners, targetListeners, 0, LIVE_TEST_MAX_LISTENERS);
  const listeners = normalizeWholeNumber(
    rampFromListeners + (targetListeners - rampFromListeners) * transitionProgress,
    targetListeners,
    0,
    LIVE_TEST_MAX_LISTENERS,
  );

  const visitorBase = test.visitorBase ?? test.visitors ?? LIVE_TEST_DEFAULT_VISITORS;
  const visitorTarget = typeof test.visitorTarget === "number" && test.visitorTarget > visitorBase
    ? test.visitorTarget
    : Math.round(visitorBase * (1 + Math.min(0.9, profile.visitorGrowthPercent / 140)));
  const visitorGrowthMinutes = 4 + (1 - profile.visitorGrowthPercent / 100) * 24;
  const visitorProgress = easedProgress(elapsedMinutes, visitorGrowthMinutes);
  const rampFromVisitors = normalizeWholeNumber(test.rampFromVisitors, visitorBase, 0, LIVE_TEST_MAX_VISITORS);
  const visitorPulse = 1 + softWave * 0.018 * Math.max(0.2, movement) * visitorProgress;
  const visitors = normalizeWholeNumber(
    (rampFromVisitors + (visitorTarget - rampFromVisitors) * visitorProgress) * visitorPulse,
    visitorBase,
    0,
    LIVE_TEST_MAX_VISITORS,
  );

  return { listeners, visitors };
}

export function resolveLiveStatusAudienceProfile(
  payload: LiveStatusTestPayload,
  nowMs = Date.now(),
  context: AudienceContext = {},
): ActiveAudienceProfile {
  const test = normalizeLiveStatusTest(payload);
  const globalProfile = globalAudienceProfile(test);
  const djProfile = matchingDjAudienceProfile(test.djProfiles || [], context.liveDj);
  if (djProfile) return { ...globalProfile, ...profileFromDj(djProfile), source: "dj" };

  const scheduleProfile = matchingScheduleAudienceProfile(test.scheduleProfiles || [], nowMs);
  if (scheduleProfile) return { ...globalProfile, ...profileFromSchedule(scheduleProfile), source: "schedule" };

  return globalProfile;
}

export function applyLiveStatusTest(data: NowPlayingResponse, payload = readLiveStatusTest()): NowPlayingResponse {
  const test = normalizeLiveStatusTest(payload);
  const manualLiveDj = resolveManualLiveDjStatus(test);
  const liveDj = manualLiveDj || data.liveDj;
  const track = manualLiveDj ? trackFromLiveDj(data.track, manualLiveDj) : data.track;
  if (!test.enabled && !manualLiveDj) return { ...data, track, liveDj, liveStatusTest: test };

  const { listeners, visitors } = resolveLiveStatusTestMetrics(test, Date.now(), { liveDj });

  return {
    ...data,
    track,
    stats: {
      ...data.stats,
      listeners,
      peakListeners: Math.max(Number(data.stats.peakListeners || 0), listeners),
      uniqueListeners: Math.max(Number(data.stats.uniqueListeners || 0), listeners),
      streamHits: visitors,
      isOnline: data.stats.isOnline,
    },
    liveDj,
    liveStatusTest: test,
  };
}

function hydrateDjsPayload(payload: ApiDjsPayload, fallbackSource: DjsSource): DjsPayload {
  return {
    djs: (payload.djs || []).map(normalizeDj).sort(sortDjs),
    source: payload.source === "blobs" ? "blobs" : fallbackSource,
    fetchedAt: payload.fetchedAt || new Date().toISOString(),
    message: payload.message,
  };
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(url, { ...init, headers });
  const payload = (await response.json().catch(() => ({}))) as ApiDjsPayload;
  if (!response.ok || payload.ok === false) throw new Error(payload.message || "Serviço indisponível.");

  return payload as T;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function normalizeSignatures(value: string) {
  return String(value || "")
    .split(/[\n,;]+/)
    .map((signature) => signature.trim())
    .filter(Boolean)
    .filter((signature, index, list) => list.indexOf(signature) === index)
    .slice(0, 12)
    .join("\n");
}

export function normalizeLiveStatusTest(payload: Partial<LiveStatusTestPayload>): LiveStatusTestPayload {
  const legacyState = ["online", "connecting", "offline", "live", "off"].includes(String(payload.state))
    ? payload.state as NonNullable<LiveStatusTestPayload["state"]>
    : "off";
  const enabled = typeof payload.enabled === "boolean" ? payload.enabled : legacyState !== "off";
  const legacyListeners = normalizeWholeNumber(payload.listeners, LIVE_TEST_DEFAULT_LISTENERS, 0, LIVE_TEST_MAX_LISTENERS);
  const listenersMin = normalizeWholeNumber(
    payload.listenersMin,
    Math.max(0, Math.round(legacyListeners * 0.82)) || LIVE_TEST_DEFAULT_LISTENERS_MIN,
    0,
    LIVE_TEST_MAX_LISTENERS,
  );
  const listenersMax = normalizeWholeNumber(
    payload.listenersMax,
    Math.max(listenersMin, Math.round(legacyListeners * 1.18), LIVE_TEST_DEFAULT_LISTENERS_MAX),
    listenersMin,
    LIVE_TEST_MAX_LISTENERS,
  );
  const visitorBase = normalizeWholeNumber(
    payload.visitorBase ?? payload.visitors,
    LIVE_TEST_DEFAULT_VISITORS,
    0,
    LIVE_TEST_MAX_VISITORS,
  );
  const visitorTarget = normalizeNullableWholeNumber(payload.visitorTarget, visitorBase, LIVE_TEST_MAX_VISITORS);
  const movementPercent = normalizeWholeNumber(payload.movementPercent, LIVE_TEST_DEFAULT_MOVEMENT, 0, LIVE_TEST_MAX_PERCENT);
  const exitPercent = normalizeWholeNumber(payload.exitPercent, LIVE_TEST_DEFAULT_EXIT, 0, LIVE_TEST_MAX_PERCENT);
  const transitionPercent = normalizeWholeNumber(payload.transitionPercent, LIVE_TEST_DEFAULT_TRANSITION, 0, 100);
  const liveBoostPercent = normalizeWholeNumber(payload.liveBoostPercent, LIVE_TEST_DEFAULT_LIVE_BOOST, 0, LIVE_TEST_MAX_PERCENT);
  const visitorGrowthPercent = normalizeWholeNumber(
    payload.visitorGrowthPercent ?? payload.growthPercent,
    LIVE_TEST_DEFAULT_GROWTH,
    0,
    LIVE_TEST_MAX_GROWTH_PERCENT,
  );
  const updatedAt = normalizeIsoString(payload.updatedAt) || new Date().toISOString();

  return {
    mode: "audience",
    enabled,
    state: enabled ? "online" : "off",
    djName: String(payload.djName || "DJ Leo").trim(),
    programName: String(payload.programName || "Roots Strike").trim(),
    listeners: legacyListeners,
    visitors: visitorBase,
    listenersMin,
    listenersMax,
    visitorBase,
    visitorTarget,
    movementPercent,
    exitPercent,
    transitionPercent,
    liveBoostPercent,
    growthPercent: visitorGrowthPercent,
    visitorGrowthPercent,
    rampFromListeners: normalizeWholeNumber(payload.rampFromListeners, legacyListeners, 0, LIVE_TEST_MAX_LISTENERS),
    rampFromVisitors: normalizeWholeNumber(payload.rampFromVisitors, visitorBase, 0, LIVE_TEST_MAX_VISITORS),
    seed: normalizeWholeNumber(payload.seed, 731, 1, 999_999),
    appliedAt: normalizeIsoString(payload.appliedAt) || updatedAt,
    updatedAt,
    scheduleProfiles: normalizeAudienceScheduleProfiles(payload.scheduleProfiles),
    djProfiles: normalizeAudienceDjProfiles(payload.djProfiles),
    liveDjControl: normalizeLiveDjControl(payload.liveDjControl),
  };
}

export function emptyAudienceScheduleProfile(): AudienceScheduleProfile {
  return {
    id: crypto.randomUUID(),
    label: "Horário especial",
    enabled: true,
    dayIds: ["Sat", "Sun"],
    startTime: "18:00",
    endTime: "23:59",
    listenersMin: 80,
    listenersMax: 180,
    movementPercent: 42,
    exitPercent: 28,
    transitionPercent: 62,
    visitorGrowthPercent: 14,
  };
}

export function emptyAudienceDjProfile(dj?: StationDj): AudienceDjProfile {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    djName: dj?.djName || "",
    programName: dj?.programName || "",
    signatures: dj?.signatures || "",
    listenersMin: 90,
    listenersMax: 220,
    movementPercent: 48,
    exitPercent: 24,
    transitionPercent: 66,
    liveBoostPercent: 35,
  };
}

export function defaultLiveDjControl(): ManualLiveDjControl {
  return {
    enabled: true,
    active: false,
    djName: "",
    programName: "",
    startedAt: null,
    updatedAt: null,
    schedules: [],
  };
}

export function emptyManualLiveDjSchedule(dj?: StationDj): ManualLiveDjSchedule {
  return {
    id: crypto.randomUUID(),
    stationDjId: dj?.id || null,
    enabled: true,
    djName: dj?.djName || "",
    programName: dj?.programName || "",
    dayIds: ["Sat", "Sun"],
    startTime: "18:00",
    endTime: "23:59",
  };
}

export function resolveManualLiveDjStatus(payload: LiveStatusTestPayload, nowMs = Date.now()): LiveDjStatus | null {
  const control = normalizeLiveStatusTest(payload).liveDjControl || defaultLiveDjControl();
  if (!control.enabled) return null;

  if (control.active) {
    return manualLiveDjStatus(control.djName, control.programName, "manual", "controle manual");
  }

  const activeSchedule = matchingManualLiveDjSchedule(control.schedules, nowMs);
  if (!activeSchedule) return null;

  return manualLiveDjStatus(
    activeSchedule.djName,
    activeSchedule.programName,
    "agenda-manual",
    `${activeSchedule.startTime}-${activeSchedule.endTime}`,
  );
}

function normalizeAudienceScheduleProfiles(value: unknown): AudienceScheduleProfile[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 28).map((profile) => {
    const item = profile as Partial<AudienceScheduleProfile>;
    const listenersMin = normalizeWholeNumber(item.listenersMin, 40, 0, LIVE_TEST_MAX_LISTENERS);
    return {
      id: String(item.id || crypto.randomUUID()),
      label: String(item.label || "Horário especial").trim(),
      enabled: item.enabled !== false,
      dayIds: normalizeDayIds(item.dayIds),
      startTime: normalizeTime(item.startTime, "18:00"),
      endTime: normalizeTime(item.endTime, "23:59"),
      listenersMin,
      listenersMax: normalizeWholeNumber(item.listenersMax, Math.max(listenersMin, 120), listenersMin, LIVE_TEST_MAX_LISTENERS),
      movementPercent: normalizeWholeNumber(item.movementPercent, LIVE_TEST_DEFAULT_MOVEMENT, 0, LIVE_TEST_MAX_PERCENT),
      exitPercent: normalizeWholeNumber(item.exitPercent, LIVE_TEST_DEFAULT_EXIT, 0, LIVE_TEST_MAX_PERCENT),
      transitionPercent: normalizeWholeNumber(item.transitionPercent, LIVE_TEST_DEFAULT_TRANSITION, 0, 100),
      visitorGrowthPercent: normalizeWholeNumber(item.visitorGrowthPercent, LIVE_TEST_DEFAULT_GROWTH, 0, LIVE_TEST_MAX_GROWTH_PERCENT),
    };
  });
}

function normalizeAudienceDjProfiles(value: unknown): AudienceDjProfile[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 100).map((profile) => {
    const item = profile as Partial<AudienceDjProfile>;
    const listenersMin = normalizeWholeNumber(item.listenersMin, 60, 0, LIVE_TEST_MAX_LISTENERS);
    return {
      id: String(item.id || crypto.randomUUID()),
      enabled: item.enabled !== false,
      djName: String(item.djName || "").trim(),
      programName: String(item.programName || "").trim(),
      signatures: normalizeSignatures(item.signatures || ""),
      listenersMin,
      listenersMax: normalizeWholeNumber(item.listenersMax, Math.max(listenersMin, 160), listenersMin, LIVE_TEST_MAX_LISTENERS),
      movementPercent: normalizeWholeNumber(item.movementPercent, LIVE_TEST_DEFAULT_MOVEMENT, 0, LIVE_TEST_MAX_PERCENT),
      exitPercent: normalizeWholeNumber(item.exitPercent, LIVE_TEST_DEFAULT_EXIT, 0, LIVE_TEST_MAX_PERCENT),
      transitionPercent: normalizeWholeNumber(item.transitionPercent, LIVE_TEST_DEFAULT_TRANSITION, 0, 100),
      liveBoostPercent: normalizeWholeNumber(item.liveBoostPercent, 35, 0, LIVE_TEST_MAX_PERCENT),
    };
  });
}

function normalizeLiveDjControl(value: unknown): ManualLiveDjControl {
  const item = value && typeof value === "object" ? value as Partial<ManualLiveDjControl> : {};
  return {
    enabled: item.enabled !== false,
    active: item.active === true,
    djName: String(item.djName || "").trim(),
    programName: String(item.programName || "").trim(),
    startedAt: normalizeIsoString(item.startedAt) || null,
    updatedAt: normalizeIsoString(item.updatedAt) || null,
    schedules: normalizeManualLiveDjSchedules(item.schedules),
  };
}

function normalizeManualLiveDjSchedules(value: unknown): ManualLiveDjSchedule[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 56).map((schedule) => {
    const item = schedule as Partial<ManualLiveDjSchedule>;
    return {
      id: String(item.id || crypto.randomUUID()),
      stationDjId: item.stationDjId ? String(item.stationDjId).trim() : null,
      enabled: item.enabled !== false,
      djName: String(item.djName || "").trim(),
      programName: String(item.programName || "").trim(),
      dayIds: normalizeDayIds(item.dayIds),
      startTime: normalizeTime(item.startTime, "18:00"),
      endTime: normalizeTime(item.endTime, "23:59"),
    };
  });
}

function matchingManualLiveDjSchedule(schedules: ManualLiveDjSchedule[], nowMs: number) {
  const parts = saoPauloTimeParts(nowMs);
  return schedules.find((schedule) => {
    if (!schedule.enabled || !isAudienceScheduleActive(schedule.dayIds, schedule.startTime, schedule.endTime, parts)) return false;
    if (!schedule.djName.trim() && !schedule.programName.trim()) return false;
    return true;
  }) || null;
}

function manualLiveDjStatus(djName: string, programName: string, matchedSignature: string, detectedValue: string): LiveDjStatus {
  const cleanDjName = djName.trim() || "DJ ao vivo";
  const cleanProgramName = programName.trim() || "Programa Ao Vivo";
  return {
    state: "live",
    isLive: true,
    djName: cleanDjName,
    programName: cleanProgramName,
    matchedSignature,
    detectedValue,
    source: "test",
  };
}

function trackFromLiveDj(track: NowPlayingResponse["track"], liveDj: LiveDjStatus): NowPlayingResponse["track"] {
  return {
    ...track,
    artist: liveDj.djName || "DJ ao vivo",
    title: liveDj.programName || "Programa Ao Vivo",
    raw: `${liveDj.djName || "DJ ao vivo"} - ${liveDj.programName || "Programa Ao Vivo"}`,
  };
}

function globalAudienceProfile(test: LiveStatusTestPayload): ActiveAudienceProfile {
  return {
    source: "global",
    label: "Base global",
    listenersMin: test.listenersMin ?? LIVE_TEST_DEFAULT_LISTENERS_MIN,
    listenersMax: test.listenersMax ?? LIVE_TEST_DEFAULT_LISTENERS_MAX,
    movementPercent: test.movementPercent ?? LIVE_TEST_DEFAULT_MOVEMENT,
    exitPercent: test.exitPercent ?? LIVE_TEST_DEFAULT_EXIT,
    transitionPercent: test.transitionPercent ?? LIVE_TEST_DEFAULT_TRANSITION,
    liveBoostPercent: test.liveBoostPercent ?? LIVE_TEST_DEFAULT_LIVE_BOOST,
    visitorGrowthPercent: test.visitorGrowthPercent ?? test.growthPercent ?? LIVE_TEST_DEFAULT_GROWTH,
  };
}

function profileFromSchedule(profile: AudienceScheduleProfile): Partial<ActiveAudienceProfile> {
  return {
    label: profile.label,
    listenersMin: profile.listenersMin,
    listenersMax: profile.listenersMax,
    movementPercent: profile.movementPercent,
    exitPercent: profile.exitPercent,
    transitionPercent: profile.transitionPercent,
    visitorGrowthPercent: profile.visitorGrowthPercent,
  };
}

function profileFromDj(profile: AudienceDjProfile): Partial<ActiveAudienceProfile> {
  return {
    label: profile.djName || profile.programName || "DJ ao vivo",
    listenersMin: profile.listenersMin,
    listenersMax: profile.listenersMax,
    movementPercent: profile.movementPercent,
    exitPercent: profile.exitPercent,
    transitionPercent: profile.transitionPercent,
    liveBoostPercent: profile.liveBoostPercent,
  };
}

function matchingDjAudienceProfile(profiles: AudienceDjProfile[], liveDj?: LiveDjStatus | null) {
  if (!liveDj?.isLive) return null;
  const candidates = [liveDj.djName, liveDj.programName, liveDj.matchedSignature, liveDj.detectedValue].filter(Boolean);
  if (!candidates.length) return null;

  return profiles.find((profile) => {
    if (!profile.enabled) return false;
    const signatures = normalizeSignatures([
      profile.signatures,
      profile.djName,
      profile.programName,
    ].filter(Boolean).join("\n")).split("\n");

    return signatures.some((signature) => {
      const cleanSignature = comparableAudienceText(signature);
      if (cleanSignature.length < 3) return false;
      return candidates.some((candidate) => {
        const cleanCandidate = comparableAudienceText(candidate);
        return cleanCandidate === cleanSignature ||
          cleanCandidate.includes(cleanSignature) ||
          cleanSignature.includes(cleanCandidate);
      });
    });
  }) || null;
}

function matchingScheduleAudienceProfile(profiles: AudienceScheduleProfile[], nowMs: number) {
  const parts = saoPauloTimeParts(nowMs);
  return profiles.find((profile) => {
    return profile.enabled && isAudienceScheduleActive(profile.dayIds, profile.startTime, profile.endTime, parts);
  }) || null;
}

function isAudienceScheduleActive(
  dayIds: string[],
  startTime: string,
  endTime: string,
  parts: { dayId: string; minuteOfDay: number },
) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (start < end) {
    return dayIds.includes(parts.dayId) && isMinuteWithinWindow(parts.minuteOfDay, start, end);
  }

  if (parts.minuteOfDay >= start) return dayIds.includes(parts.dayId);
  if (parts.minuteOfDay <= end) return dayIds.includes(previousAudienceDay(parts.dayId));
  return false;
}

function previousAudienceDay(dayId: string) {
  const index = AUDIENCE_DAY_IDS.indexOf(dayId as (typeof AUDIENCE_DAY_IDS)[number]);
  return AUDIENCE_DAY_IDS[(index + AUDIENCE_DAY_IDS.length - 1) % AUDIENCE_DAY_IDS.length] || "Sun";
}

function easedProgress(elapsedMinutes: number, durationMinutes: number) {
  if (durationMinutes <= 0) return 1;
  const progress = Math.max(0, Math.min(1, elapsedMinutes / durationMinutes));
  return 1 - Math.pow(1 - progress, 3);
}

function transitionMinutes(percent: number) {
  const speed = Math.max(0, Math.min(100, percent)) / 100;
  return 2 + (1 - speed) * 18;
}

function normalizeNullableWholeNumber(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeDayIds(value: unknown) {
  if (!Array.isArray(value)) return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayIds = value.map(String).filter((dayId) => (AUDIENCE_DAY_IDS as readonly string[]).includes(dayId));
  return dayIds.length ? dayIds : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
}

function normalizeTime(value: unknown, fallback: string) {
  const clean = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(clean) ? clean : fallback;
}

function comparableAudienceText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function saoPauloTimeParts(nowMs: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return {
    dayId: value("weekday"),
    minuteOfDay: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function timeToMinutes(value: string) {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function isMinuteWithinWindow(current: number, start: number, end: number) {
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

function normalizeWholeNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeIsoString(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeDateMs(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

function canUseLocalFallback() {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function sortDjs(left: StationDj, right: StationDj) {
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}
