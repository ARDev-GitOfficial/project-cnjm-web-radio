export type AdPlacement = "commercial" | "program";
export type AdsSource = "blobs" | "local" | "fallback";

export type SiteAd = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  imageKey: string;
  imageWidth: number | null;
  imageHeight: number | null;
  imageContentType: string | null;
  imageSize: number | null;
  linkUrl: string;
  buttonLabel: string;
  placement: AdPlacement;
  section: string;
  active: boolean;
  impressions: number;
  clicks: number;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdSettings = {
  enabled: boolean;
  scheduleEnabled: boolean;
  startTime: string;
  endTime: string;
  commercialRuns: number;
  programRuns: number;
};

export type AdsPayload = {
  ads: SiteAd[];
  settings: AdSettings;
  source: AdsSource;
  fetchedAt: string;
  message?: string;
};

export type AdminSession = {
  token: string;
  login: string;
  source: AdsSource;
};

export type UploadedAdImage = {
  imageKey: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  imageContentType: string;
  imageSize: number;
};

type ApiPayload = {
  ok?: boolean;
  source?: string;
  message?: string;
  ads?: Partial<SiteAd>[];
  ad?: Partial<SiteAd> | null;
  settings?: Partial<AdSettings>;
  session?: {
    token?: string;
    login?: string;
  };
  image?: UploadedAdImage;
  fetchedAt?: string;
};

export const AD_STORAGE_KEY = "cnjm-public-ads-v3";
export const AD_LEGACY_STORAGE_KEY = "cnjm-public-ads-v2";
export const AD_OLDER_STORAGE_KEY = "cnjm-public-ads-v1";
export const AD_SETTINGS_KEY = "cnjm-public-ads-settings-v1";
export const AD_SESSION_KEY = "cnjm-ads-admin-session";
export const MAX_ADS = 100;
export const ADMIN_LOGIN = "AdminRoots";
export const ADMIN_PASSWORD_HASH = "3365305e71f599bc6859e66c1c02d2f1e546010adc10f02e3b3364ebf1241b33";
export const AD_BANNER_WIDTH = 1700;
export const AD_BANNER_HEIGHT = 450;

const API_BASE = "/api/ads";
const LOCAL_SESSION_TOKEN = "local-dev-session";

export const defaultAdSettings = (): AdSettings => ({
  enabled: true,
  scheduleEnabled: false,
  startTime: "08:00",
  endTime: "22:00",
  commercialRuns: 3,
  programRuns: 1,
});

export const emptyAd = (): SiteAd => {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    imageUrl: "",
    imageKey: "",
    imageWidth: null,
    imageHeight: null,
    imageContentType: null,
    imageSize: null,
    linkUrl: "",
    buttonLabel: "Abrir anúncio",
    placement: "commercial",
    section: "Principal",
    active: true,
    impressions: 0,
    clicks: 0,
    sortOrder: 0,
    startsAt: null,
    endsAt: null,
    createdAt: now,
    updatedAt: now,
  };
};

export function normalizeAd(ad: Partial<SiteAd>): SiteAd {
  const fallback = emptyAd();

  return {
    ...fallback,
    ...ad,
    id: String(ad.id || fallback.id),
    title: String(ad.title || "").trim(),
    description: String(ad.description || "").trim(),
    imageUrl: normalizeOptionalUrl(ad.imageUrl || ""),
    imageKey: String(ad.imageKey || "").trim(),
    imageWidth: normalizeNumberOrNull(ad.imageWidth),
    imageHeight: normalizeNumberOrNull(ad.imageHeight),
    imageContentType: ad.imageContentType ? String(ad.imageContentType) : null,
    imageSize: normalizeNumberOrNull(ad.imageSize),
    linkUrl: normalizeOptionalUrl(ad.linkUrl || ""),
    buttonLabel: String(ad.buttonLabel || "Abrir anúncio").trim(),
    placement: normalizePlacement(ad.placement),
    section: String(ad.section || "Principal").trim(),
    active: ad.active !== false,
    impressions: Math.max(0, Number(ad.impressions ?? 0) || 0),
    clicks: Math.max(0, Number(ad.clicks ?? 0) || 0),
    sortOrder: Number.isFinite(Number(ad.sortOrder)) ? Number(ad.sortOrder) : 0,
    startsAt: normalizeIsoString(ad.startsAt),
    endsAt: normalizeIsoString(ad.endsAt),
    createdAt: normalizeIsoString(ad.createdAt) || fallback.createdAt,
    updatedAt: normalizeIsoString(ad.updatedAt) || fallback.updatedAt,
  };
}

export function normalizeAdSettings(settings: Partial<AdSettings> = {}): AdSettings {
  const fallback = defaultAdSettings();
  const startTime = normalizeTime(settings.startTime || fallback.startTime);
  const endTime = normalizeTime(settings.endTime || fallback.endTime);

  return {
    enabled: settings.enabled !== false,
    scheduleEnabled: Boolean(settings.scheduleEnabled),
    startTime,
    endTime,
    commercialRuns: normalizeRunCount(settings.commercialRuns, fallback.commercialRuns),
    programRuns: normalizeRunCount(settings.programRuns, fallback.programRuns),
  };
}

export function loadAds(): SiteAd[] {
  if (typeof window === "undefined") return [];

  try {
    const raw =
      window.localStorage.getItem(AD_STORAGE_KEY) ||
      window.localStorage.getItem(AD_LEGACY_STORAGE_KEY) ||
      window.localStorage.getItem(AD_OLDER_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Partial<SiteAd>[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeAd)
      .filter((ad) => ad.title || ad.description || ad.imageUrl)
      .sort(sortAds)
      .slice(0, MAX_ADS);
  } catch {
    return [];
  }
}

export function saveAds(ads: SiteAd[]) {
  if (typeof window === "undefined") return;
  const normalized = ads.map(normalizeAd).sort(sortAds).slice(0, MAX_ADS);
  window.localStorage.setItem(AD_STORAGE_KEY, JSON.stringify(normalized));
  notifyAdsUpdated();
}

export function loadAdSettings(): AdSettings {
  if (typeof window === "undefined") return defaultAdSettings();

  try {
    const raw = window.localStorage.getItem(AD_SETTINGS_KEY);
    return normalizeAdSettings(raw ? (JSON.parse(raw) as Partial<AdSettings>) : defaultAdSettings());
  } catch {
    return defaultAdSettings();
  }
}

export function saveAdSettings(settings: AdSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AD_SETTINGS_KEY, JSON.stringify(normalizeAdSettings(settings)));
  notifyAdsUpdated();
}

export function getVisibleAds(ads: SiteAd[], settings: AdSettings, now = new Date()) {
  if (!settings.enabled) return [];
  if (settings.scheduleEnabled && !isTimeWithinWindow(now, settings.startTime, settings.endTime)) return [];

  return ads.filter(
    (ad) =>
      ad.active &&
      (ad.title || ad.description || ad.imageUrl) &&
      isAdWithinDateWindow(ad, now),
  );
}

export function buildAdRotation(ads: SiteAd[], settings: AdSettings) {
  const commercialAds = ads.filter((ad) => ad.placement !== "program");
  const programAds = ads.filter((ad) => ad.placement === "program");
  const commercialRuns = Math.max(1, Math.min(12, Number(settings.commercialRuns) || 3));
  const programRuns = Math.max(0, Math.min(6, Number(settings.programRuns) || 1));

  if (!commercialAds.length) return programAds;
  if (!programAds.length || programRuns === 0) return commercialAds;

  const result: SiteAd[] = [];
  let commercialIndex = 0;
  let programIndex = 0;
  const targetLength = commercialAds.length + programAds.length;

  while (result.length < targetLength) {
    for (let index = 0; index < commercialRuns && commercialIndex < commercialAds.length; index += 1) {
      result.push(commercialAds[commercialIndex]);
      commercialIndex += 1;
    }

    for (let index = 0; index < programRuns && programIndex < programAds.length; index += 1) {
      result.push(programAds[programIndex]);
      programIndex += 1;
    }

    if (commercialIndex >= commercialAds.length && programIndex >= programAds.length) break;
    if (commercialIndex >= commercialAds.length) {
      result.push(...programAds.slice(programIndex));
      break;
    }
    if (programIndex >= programAds.length) {
      result.push(...commercialAds.slice(commercialIndex));
      break;
    }
  }

  return result;
}

export function updateAdStats(id: string, field: "clicks") {
  const ads = loadAds();
  const next = ads.map((ad) =>
    ad.id === id
      ? {
          ...ad,
          [field]: ad[field] + 1,
          updatedAt: new Date().toISOString(),
        }
      : ad,
  );
  saveAds(next);
}

export async function sendAdStat(id: string, field: "clicks") {
  try {
    await requestJson(`${API_BASE}/${encodeURIComponent(id)}/stats`, {
      method: "POST",
      body: JSON.stringify({ field }),
    });
  } catch {
    updateAdStats(id, field);
  }
}

export async function fetchPublicAds(signal?: AbortSignal): Promise<AdsPayload> {
  try {
    const payload = await requestJson<ApiPayload>(API_BASE, { signal });
    if (payload.ok && payload.source === "blobs") return hydratePayload(payload, "blobs");
    if (payload.ads?.length) return hydratePayload(payload, "fallback");
    return canUseLocalFallback() ? localAdsPayload(payload.message) : unavailableAdsPayload(payload.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : undefined;
    return canUseLocalFallback() ? localAdsPayload(message) : unavailableAdsPayload(message);
  }
}

export async function fetchAdminAds(token: string, signal?: AbortSignal): Promise<AdsPayload> {
  const payload = await requestJson<ApiPayload>(`${API_BASE}/admin`, {
    signal,
    headers: authHeaders(token),
  });
  return hydratePayload(payload, "blobs");
}

export async function loginAdsAdmin(login: string, password: string): Promise<AdminSession> {
  const passwordHash = await sha256Hex(password);
  const canUseLocalSession = canUseLocalFallback() && isLocalAdminLogin(login, passwordHash);

  try {
    const payload = await requestJson<ApiPayload>(`${API_BASE}/login`, {
      method: "POST",
      body: JSON.stringify({ login, password }),
    });

    const token = String(payload.session?.token || "");
    if (payload.ok && token) {
      const session: AdminSession = {
        token,
        login: String(payload.session?.login || login),
        source: "blobs",
      };
      setAdminSession(session);
      return session;
    }
  } catch {
    if (!canUseLocalSession) {
      throw new Error("Login ou senha inválidos.");
    }
  }

  if (canUseLocalSession) {
    const session: AdminSession = {
      token: LOCAL_SESSION_TOKEN,
      login,
      source: "local",
    };
    setAdminSession(session);
    return session;
  }

  throw new Error("Login ou senha inválidos.");
}

export async function saveRemoteAd(token: string, ad: SiteAd) {
  const isExisting = Boolean(ad.id);
  const url = isExisting ? `${API_BASE}/${encodeURIComponent(ad.id)}` : API_BASE;
  const payload = await requestJson<ApiPayload>(url, {
    method: isExisting ? "PUT" : "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ad }),
  });
  return normalizeAd(payload.ad || ad);
}

export async function deleteRemoteAd(token: string, id: string) {
  await requestJson(`${API_BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function saveRemoteSettings(token: string, settings: AdSettings) {
  const payload = await requestJson<ApiPayload>(`${API_BASE}/settings`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ settings }),
  });
  return normalizeAdSettings(payload.settings || settings);
}

export async function uploadAdImage(
  token: string,
  payload: {
    fileName: string;
    contentType: string;
    width: number;
    height: number;
    dataBase64: string;
  },
) {
  const response = await requestJson<ApiPayload>(`${API_BASE}/upload`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!response.image) throw new Error("Upload inválido.");
  return response.image;
}

export function localAdsPayload(message?: string): AdsPayload {
  return {
    ads: getVisibleAds(loadAds(), loadAdSettings()),
    settings: loadAdSettings(),
    source: "local",
    fetchedAt: new Date().toISOString(),
    message,
  };
}

export function unavailableAdsPayload(message?: string): AdsPayload {
  return {
    ads: [],
    settings: defaultAdSettings(),
    source: "fallback",
    fetchedAt: new Date().toISOString(),
    message: message || "Conteúdo global de anúncios não conectado neste ambiente.",
  };
}

export function getAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(AD_SESSION_KEY);
  if (!raw) return null;
  if (raw === "active") {
    if (!canUseLocalFallback()) {
      window.localStorage.removeItem(AD_SESSION_KEY);
      return null;
    }

    return {
      token: LOCAL_SESSION_TOKEN,
      login: ADMIN_LOGIN,
      source: "local",
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Omit<AdminSession, "source">> & { source?: string };
    if (!parsed.token) return null;
    const source = parsed.source === "blobs" || parsed.source === "database" ? "blobs" : "local";
    if (source === "local" && !canUseLocalFallback()) {
      window.localStorage.removeItem(AD_SESSION_KEY);
      return null;
    }

    return {
      token: String(parsed.token),
      login: String(parsed.login || ADMIN_LOGIN),
      source,
    };
  } catch {
    return null;
  }
}

export function isAdminSessionActive() {
  return Boolean(getAdminSession());
}

export function setAdminSession(session: AdminSession | boolean) {
  if (typeof window === "undefined") return;

  if (session === false) {
    window.localStorage.removeItem(AD_SESSION_KEY);
    return;
  }

  const nextSession =
    session === true
      ? {
          token: LOCAL_SESSION_TOKEN,
          login: ADMIN_LOGIN,
          source: "local" as const,
        }
      : session;

  window.localStorage.setItem(AD_SESSION_KEY, JSON.stringify(nextSession));
}

export function clearAdminSession() {
  setAdminSession(false);
}

export function normalizeOptionalUrl(value: string) {
  const clean = String(value || "").trim();
  if (!clean) return "";

  try {
    const url = new URL(clean);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return clean.startsWith("/api/ads/image/") || clean.startsWith("data:image/") ? clean : "";
  }
}

export function optimizedAdImageUrl(src: string, width = AD_BANNER_WIDTH, height = AD_BANNER_HEIGHT) {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return src;
  if (typeof window === "undefined") return src;
  if (src.startsWith("/api/ads/image/")) return src;
  if (isDirectWebpUrl(src)) return src;

  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return src;

  const url = src.startsWith("/") ? `${window.location.origin}${src}` : src;
  const params = new URLSearchParams({
    url,
    w: String(width),
    h: String(height),
    fit: "cover",
    fm: "webp",
    q: "82",
  });

  return `/.netlify/images?${params.toString()}`;
}

function isDirectWebpUrl(src: string) {
  try {
    const url = src.startsWith("/") ? new URL(src, window.location.origin) : new URL(src);
    return /\.webp$/i.test(url.pathname);
  } catch {
    return /\.webp(?:$|[?#])/i.test(src);
  }
}

export function notifyAdsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("cnjm-ads-updated"));
}

function hydratePayload(payload: ApiPayload, fallbackSource: AdsSource): AdsPayload {
  const source = payload.source === "blobs" ? "blobs" : fallbackSource;

  return {
    ads: (payload.ads || []).map(normalizeAd).sort(sortAds).slice(0, MAX_ADS),
    settings: normalizeAdSettings(payload.settings || defaultAdSettings()),
    source,
    fetchedAt: payload.fetchedAt || new Date().toISOString(),
    message: payload.message,
  };
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    ...init,
    headers,
  });
  const payload = (await response.json().catch(() => ({}))) as ApiPayload;

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

function isLocalAdminLogin(login: string, passwordHash: string) {
  if (login !== ADMIN_LOGIN) return false;
  return passwordHash === ADMIN_PASSWORD_HASH;
}

export function canUseLocalFallback() {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

async function sha256Hex(value: string) {
  if (typeof crypto === "undefined" || !crypto.subtle) return "";

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizePlacement(value: unknown): AdPlacement {
  return value === "program" ? "program" : "commercial";
}

function normalizeRunCount(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(12, Math.round(number))) : fallback;
}

function normalizeNumberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeIsoString(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value) ? value : "00:00";
}

function minutesFromTime(value: string) {
  const [hours = "0", minutes = "0"] = normalizeTime(value).split(":");
  return Number(hours) * 60 + Number(minutes);
}

function isTimeWithinWindow(now: Date, startTime: string, endTime: string) {
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutesFromTime(startTime);
  const end = minutesFromTime(endTime);

  if (start === end) return true;
  if (start < end) return current >= start && current <= end;
  return current >= start || current <= end;
}

function isAdWithinDateWindow(ad: SiteAd, now: Date) {
  const startsAt = ad.startsAt ? new Date(ad.startsAt) : null;
  const endsAt = ad.endsAt ? new Date(ad.endsAt) : null;

  if (startsAt && startsAt.getTime() > now.getTime()) return false;
  if (endsAt && endsAt.getTime() < now.getTime()) return false;
  return true;
}

function sortAds(a: SiteAd, b: SiteAd) {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}
