import type { BroadcastState, NowPlayingResponse } from "../types";

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

export type DjsSource = "database" | "local" | "fallback";

export type DjsPayload = {
  djs: StationDj[];
  source: DjsSource;
  fetchedAt: string;
  message?: string;
};

export type LiveStatusTestPayload = {
  state: BroadcastState | "off";
  djName?: string;
  programName?: string;
  listeners?: number;
  visitors?: number;
  movementPercent?: number;
  liveBoostPercent?: number;
  growthPercent?: number;
  seed?: number;
  updatedAt?: string;
};

export type LiveStatusResolvedMetrics = {
  listeners: number;
  visitors: number;
};

type ApiDjsPayload = {
  ok?: boolean;
  source?: string;
  message?: string;
  djs?: Partial<StationDj>[];
  dj?: Partial<StationDj> | null;
  fetchedAt?: string;
};

export const DJ_STORAGE_KEY = "cnjm-station-djs-v1";
export const LIVE_STATUS_TEST_KEY = "cnjm-live-status-test-v1";
export const LIVE_TEST_DEFAULT_LISTENERS = 2;
export const LIVE_TEST_DEFAULT_VISITORS = 49_823;
export const LIVE_TEST_DEFAULT_MOVEMENT = 32;
export const LIVE_TEST_DEFAULT_LIVE_BOOST = 65;
export const LIVE_TEST_DEFAULT_GROWTH = 12;
export const LIVE_TEST_MAX_LISTENERS = 999_999;
export const LIVE_TEST_MAX_VISITORS = 9_999_999;
export const LIVE_TEST_MAX_PERCENT = 200;
export const LIVE_TEST_MAX_GROWTH_PERCENT = 100;

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
    return parsed.map(normalizeDj).filter((dj) => dj.djName && dj.programName && dj.signatures).sort(sortDjs);
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
  return hydrateDjsPayload(payload, "database");
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
  const order: LiveStatusTestPayload["state"][] = ["online", "connecting", "offline", "live", "off"];
  const currentIndex = Math.max(0, order.indexOf(current.state));
  const nextState = order[(currentIndex + 1) % order.length] || "online";
  const sampleDj = dj && dj.djName && dj.programName
    ? dj
    : { djName: "DJ Leo", programName: "Roots Strike" };

  return {
    state: nextState,
    djName: sampleDj.djName,
    programName: sampleDj.programName,
    listeners: normalizedCurrent.listeners,
    visitors: normalizedCurrent.visitors,
    movementPercent: normalizedCurrent.movementPercent,
    liveBoostPercent: normalizedCurrent.liveBoostPercent,
    growthPercent: normalizedCurrent.growthPercent,
    seed: normalizedCurrent.seed,
    updatedAt: normalizedCurrent.updatedAt,
  };
}

export function resolveLiveStatusTestMetrics(
  payload: LiveStatusTestPayload,
  nowMs = Date.now(),
): LiveStatusResolvedMetrics {
  const test = normalizeLiveStatusTest(payload);
  const baseListeners = test.listeners ?? LIVE_TEST_DEFAULT_LISTENERS;
  const baseVisitors = test.visitors ?? LIVE_TEST_DEFAULT_VISITORS;
  const movement = (test.movementPercent ?? LIVE_TEST_DEFAULT_MOVEMENT) / 100;
  const liveBoost = test.state === "live" ? (test.liveBoostPercent ?? LIVE_TEST_DEFAULT_LIVE_BOOST) / 100 : 0;
  const growth = (test.growthPercent ?? LIVE_TEST_DEFAULT_GROWTH) / 100;
  const startedAt = normalizeDateMs(test.updatedAt);
  const elapsedMinutes = startedAt ? Math.max(0, (nowMs - startedAt) / 60_000) : 0;
  const seed = (test.seed ?? 731) / 97;
  const seconds = nowMs / 1000;
  const wave = Math.sin(seconds / 9 + seed) * 0.56 + Math.sin(seconds / 23 + seed * 1.8) * 0.32;
  const softWave = (wave + 1) / 2;
  const stateFactor = test.state === "connecting" ? 0.62 : 1;
  const listenerMovement = 1 + wave * 0.3 * movement;
  const visitorGrowth = 1 + Math.min(0.72, (elapsedMinutes / 240) * growth);
  const visitorPulse = 1 + softWave * 0.045 * movement + liveBoost * 0.34;
  const listeners = test.state === "offline" || test.state === "off"
    ? 0
    : normalizeWholeNumber(baseListeners * stateFactor * listenerMovement * (1 + liveBoost), 0, 0, LIVE_TEST_MAX_LISTENERS);
  const visitors = test.state === "off"
    ? baseVisitors
    : normalizeWholeNumber(baseVisitors * visitorGrowth * visitorPulse, baseVisitors, 0, LIVE_TEST_MAX_VISITORS);

  return { listeners, visitors };
}

export function applyLiveStatusTest(data: NowPlayingResponse, payload = readLiveStatusTest()): NowPlayingResponse {
  const test = normalizeLiveStatusTest(payload);
  if (test.state === "off") return data;

  const liveDj = {
    state: test.state,
    isLive: test.state === "live",
    djName: test.state === "live" ? test.djName || "DJ Leo" : null,
    programName: test.state === "live" ? test.programName || "Roots Strike" : null,
    matchedSignature: "modo-teste",
    detectedValue: "simulação local",
    source: "test" as const,
  };
  const { listeners, visitors } = resolveLiveStatusTestMetrics(test);

  return {
    ...data,
    ok: test.state !== "offline",
    stats: {
      ...data.stats,
      listeners,
      peakListeners: Math.max(Number(data.stats.peakListeners || 0), listeners),
      uniqueListeners: Math.max(Number(data.stats.uniqueListeners || 0), listeners),
      streamHits: visitors,
      isOnline: test.state !== "offline",
    },
    liveDj,
    track: test.state === "live"
      ? {
          ...data.track,
          title: liveDj.programName || "Programa Ao Vivo",
          artist: liveDj.djName || "DJ ao vivo",
          raw: `${liveDj.djName || "DJ ao vivo"} - ${liveDj.programName || "Programa Ao Vivo"}`,
        }
      : data.track,
  };
}

function hydrateDjsPayload(payload: ApiDjsPayload, fallbackSource: DjsSource): DjsPayload {
  return {
    djs: (payload.djs || []).map(normalizeDj).sort(sortDjs),
    source: payload.source === "database" ? "database" : fallbackSource,
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

function normalizeLiveStatusTest(payload: Partial<LiveStatusTestPayload>): LiveStatusTestPayload {
  const state = ["online", "connecting", "offline", "live", "off"].includes(String(payload.state))
    ? payload.state as LiveStatusTestPayload["state"]
    : "off";

  return {
    state,
    djName: String(payload.djName || "DJ Leo").trim(),
    programName: String(payload.programName || "Roots Strike").trim(),
    listeners: normalizeWholeNumber(payload.listeners, LIVE_TEST_DEFAULT_LISTENERS, 0, LIVE_TEST_MAX_LISTENERS),
    visitors: normalizeWholeNumber(payload.visitors, LIVE_TEST_DEFAULT_VISITORS, 0, LIVE_TEST_MAX_VISITORS),
    movementPercent: normalizeWholeNumber(payload.movementPercent, LIVE_TEST_DEFAULT_MOVEMENT, 0, LIVE_TEST_MAX_PERCENT),
    liveBoostPercent: normalizeWholeNumber(payload.liveBoostPercent, LIVE_TEST_DEFAULT_LIVE_BOOST, 0, LIVE_TEST_MAX_PERCENT),
    growthPercent: normalizeWholeNumber(payload.growthPercent, LIVE_TEST_DEFAULT_GROWTH, 0, LIVE_TEST_MAX_GROWTH_PERCENT),
    seed: normalizeWholeNumber(payload.seed, 731, 1, 999_999),
    updatedAt: normalizeIsoString(payload.updatedAt) || new Date().toISOString(),
  };
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

function sortDjs(left: StationDj, right: StationDj) {
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}
