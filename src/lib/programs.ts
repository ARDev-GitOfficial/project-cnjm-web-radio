import type { ScheduleDay, ScheduleSlot } from "../types";

export type StationProgram = {
  id: string;
  dayId: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  program: string;
  host: string;
  logoUrl: string;
  logoKey: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProgramsSource = "blobs" | "local" | "fallback";

export type ProgramsPayload = {
  programs: StationProgram[];
  days: ScheduleDay[];
  currentProgram: StationProgram | null;
  source: ProgramsSource;
  fetchedAt: string;
  message?: string;
};

type ApiProgramPayload = {
  ok?: boolean;
  source?: string;
  message?: string;
  programs?: Partial<StationProgram>[];
  program?: Partial<StationProgram> | null;
  days?: ScheduleDay[];
  currentProgram?: Partial<StationProgram> | null;
  image?: {
    imageKey: string;
    imageUrl: string;
    imageWidth: number;
    imageHeight: number;
    imageContentType: string;
    imageSize: number;
  };
  fetchedAt?: string;
};

export const PROGRAM_STORAGE_KEY = "cnjm-station-programs-v1";
export const PROGRAM_LOGO_MAX_SIZE = 2_500_000;
export const PROGRAM_LOGO_MAX_DIMENSION = 1800;

const API_BASE = "/api/programs";

const DAY_LABELS: Record<string, string> = {
  Sun: "Domingo",
  Mon: "Segunda",
  Tue: "Terça",
  Wed: "Quarta",
  Thu: "Quinta",
  Fri: "Sexta",
  Sat: "Sábado",
};

const DAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const defaultPrograms = (): StationProgram[] => {
  const now = new Date().toISOString();
  const base = DAY_ORDER.flatMap((dayId) => {
    const dayLabel = DAY_LABELS[dayId];
    return [
      {
        id: `${dayId.toLowerCase()}-madrugada`,
        dayId,
        dayLabel,
        startTime: "00:00",
        endTime: "04:59",
        program: "Madrugada Reggae",
        host: "Web Rádio Conexão Jamaica",
        sortOrder: 1,
      },
      {
        id: `${dayId.toLowerCase()}-manha`,
        dayId,
        dayLabel,
        startTime: "05:00",
        endTime: "11:59",
        program: "Conexão Jamaica Manhã",
        host: "Web Rádio Conexão Jamaica",
        sortOrder: 2,
      },
      {
        id: `${dayId.toLowerCase()}-tarde-noite`,
        dayId,
        dayLabel,
        startTime: "12:00",
        endTime: "23:59",
        program: dayId === "Sat" ? "Sábado Reggae Vibes" : dayId === "Sun" ? "Domingo Roots" : "Reggae em todas as vertentes",
        host: "Web Rádio Conexão Jamaica",
        sortOrder: 3,
      },
    ];
  });

  return base.map((program) => ({
    ...program,
    logoUrl: "",
    logoKey: "",
    active: true,
    createdAt: now,
    updatedAt: now,
  }));
};

export const emptyProgram = (): StationProgram => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    dayId: "Mon",
    dayLabel: "Segunda",
    startTime: "00:00",
    endTime: "23:59",
    program: "",
    host: "Web Rádio Conexão Jamaica",
    logoUrl: "",
    logoKey: "",
    active: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
};

export function normalizeProgram(program: Partial<StationProgram>): StationProgram {
  const fallback = emptyProgram();
  const dayId = normalizeDayId(program.dayId || fallback.dayId);
  const now = new Date().toISOString();

  return {
    ...fallback,
    ...program,
    id: String(program.id || fallback.id),
    dayId,
    dayLabel: DAY_LABELS[dayId],
    startTime: normalizeTime(program.startTime || fallback.startTime),
    endTime: normalizeTime(program.endTime || fallback.endTime),
    program: String(program.program || "").trim(),
    host: String(program.host || "Web Rádio Conexão Jamaica").trim(),
    logoUrl: normalizeOptionalImageUrl(program.logoUrl || ""),
    logoKey: String(program.logoKey || "").trim(),
    active: program.active !== false,
    sortOrder: Number.isFinite(Number(program.sortOrder)) ? Number(program.sortOrder) : 0,
    createdAt: normalizeIsoString(program.createdAt) || now,
    updatedAt: normalizeIsoString(program.updatedAt) || now,
  };
}

export function programsToScheduleDays(programs: StationProgram[], now = new Date()): ScheduleDay[] {
  return DAY_ORDER.map((dayId) => {
    const slots = programs
      .filter((program) => program.active && program.dayId === dayId)
      .sort(sortPrograms)
      .map<ScheduleSlot>((program) => ({
        id: program.id,
        time: `${program.startTime} - ${program.endTime}`,
        program: program.program || "Programação musical",
        host: program.host,
        logoUrl: program.logoUrl || null,
        isNow: isProgramCurrent(program, now),
      }));

    return {
      id: dayId,
      label: DAY_LABELS[dayId],
      active: dayId === currentDayId(now),
      slots,
    };
  }).filter((day) => day.slots.length > 0);
}

export function currentProgramFromPrograms(programs: StationProgram[], now = new Date()) {
  return programs.filter((program) => program.active && isProgramCurrent(program, now)).sort(sortPrograms)[0] ?? null;
}

export async function fetchPrograms(signal?: AbortSignal): Promise<ProgramsPayload> {
  try {
    const payload = await requestJson<ApiProgramPayload>(API_BASE, { signal });
    if (payload.ok && payload.source === "blobs") return hydrateProgramsPayload(payload, "blobs");
    return localProgramsPayload(payload.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : undefined;
    return localProgramsPayload(message);
  }
}

export async function fetchAdminPrograms(token: string, signal?: AbortSignal): Promise<ProgramsPayload> {
  const payload = await requestJson<ApiProgramPayload>(`${API_BASE}/admin`, {
    signal,
    headers: authHeaders(token),
  });
  return hydrateProgramsPayload(payload, "blobs");
}

export async function saveRemoteProgram(token: string, program: StationProgram) {
  const isExisting = Boolean(program.id);
  const url = isExisting ? `${API_BASE}/${encodeURIComponent(program.id)}` : API_BASE;
  const payload = await requestJson<ApiProgramPayload>(url, {
    method: isExisting ? "PUT" : "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ program }),
  });
  return normalizeProgram(payload.program || program);
}

export async function deleteRemoteProgram(token: string, id: string) {
  await requestJson(`${API_BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function uploadProgramLogo(
  token: string,
  payload: {
    fileName: string;
    contentType: string;
    width: number;
    height: number;
    dataBase64: string;
  },
) {
  const response = await requestJson<ApiProgramPayload>(`${API_BASE}/upload-logo`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!response.image) throw new Error("Upload inválido.");
  return response.image;
}

export function loadPrograms(): StationProgram[] {
  if (typeof window === "undefined") return defaultPrograms();

  try {
    const raw = window.localStorage.getItem(PROGRAM_STORAGE_KEY);
    if (!raw) return defaultPrograms();
    const parsed = JSON.parse(raw) as Partial<StationProgram>[];
    if (!Array.isArray(parsed)) return defaultPrograms();
    const programs = parsed.map(normalizeProgram).filter((program) => program.program);
    return programs.length ? programs.sort(sortPrograms) : defaultPrograms();
  } catch {
    return defaultPrograms();
  }
}

export function savePrograms(programs: StationProgram[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROGRAM_STORAGE_KEY, JSON.stringify(programs.map(normalizeProgram).sort(sortPrograms)));
}

export function localProgramsPayload(message?: string): ProgramsPayload {
  const programs = loadPrograms();
  const days = programsToScheduleDays(programs);
  return {
    programs,
    days,
    currentProgram: currentProgramFromPrograms(programs),
    source: "local",
    fetchedAt: new Date().toISOString(),
    message,
  };
}

export function canUseLocalProgramFallback() {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function hydrateProgramsPayload(payload: ApiProgramPayload, fallbackSource: ProgramsSource): ProgramsPayload {
  const programs = (payload.programs?.length ? payload.programs : defaultPrograms()).map(normalizeProgram).sort(sortPrograms);
  const days = payload.days?.length ? payload.days : programsToScheduleDays(programs);

  return {
    programs,
    days,
    currentProgram: payload.currentProgram ? normalizeProgram(payload.currentProgram) : currentProgramFromPrograms(programs),
    source: payload.source === "blobs" ? "blobs" : fallbackSource,
    fetchedAt: payload.fetchedAt || new Date().toISOString(),
    message: payload.message,
  };
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(url, { ...init, headers });
  const payload = (await response.json().catch(() => ({}))) as ApiProgramPayload;

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "Serviço indisponível.");
  }

  return payload as T;
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function normalizeDayId(value: string) {
  return DAY_ORDER.includes(value) ? value : "Mon";
}

function normalizeTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value) ? value : "00:00";
}

function normalizeIsoString(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeOptionalImageUrl(value: string) {
  const clean = String(value || "").trim();
  if (!clean) return "";

  try {
    const url = new URL(clean);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return clean.startsWith("/api/ads/image/") || clean.startsWith("data:image/") ? clean : "";
  }
}

function currentDayId(now: Date) {
  return DAY_ORDER[now.getDay()] ?? "Sun";
}

function timeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = normalizeTime(value).split(":");
  return Number(hours) * 60 + Number(minutes);
}

function isProgramCurrent(program: StationProgram, now: Date) {
  if (program.dayId !== currentDayId(now)) return false;

  const start = timeToMinutes(program.startTime);
  let end = timeToMinutes(program.endTime);
  let current = now.getHours() * 60 + now.getMinutes();

  if (end <= start) end += 24 * 60;
  if (current < start && end > 24 * 60) current += 24 * 60;

  return current >= start && current <= end;
}

function sortPrograms(a: StationProgram, b: StationProgram) {
  if (DAY_ORDER.indexOf(a.dayId) !== DAY_ORDER.indexOf(b.dayId)) {
    return DAY_ORDER.indexOf(a.dayId) - DAY_ORDER.indexOf(b.dayId);
  }
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
}
