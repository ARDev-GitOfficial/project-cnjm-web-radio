export type SiteAd = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  buttonLabel: string;
  section: string;
  active: boolean;
  impressions: number;
  clicks: number;
  createdAt: string;
  updatedAt: string;
};

export type AdSettings = {
  enabled: boolean;
  scheduleEnabled: boolean;
  startTime: string;
  endTime: string;
};

export const AD_STORAGE_KEY = "cnjm-public-ads-v2";
export const AD_LEGACY_STORAGE_KEY = "cnjm-public-ads-v1";
export const AD_SETTINGS_KEY = "cnjm-public-ads-settings-v1";
export const AD_SESSION_KEY = "cnjm-ads-admin-session";
export const MAX_ADS = 100;
export const ADMIN_LOGIN = "AdminRoots";
export const ADMIN_PASSWORD = "1379254680";

export const defaultAdSettings = (): AdSettings => ({
  enabled: true,
  scheduleEnabled: false,
  startTime: "08:00",
  endTime: "22:00",
});

export const emptyAd = (): SiteAd => {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    imageUrl: "",
    linkUrl: "",
    buttonLabel: "Abrir anúncio",
    section: "Principal",
    active: true,
    impressions: 0,
    clicks: 0,
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
    linkUrl: normalizeOptionalUrl(ad.linkUrl || ""),
    buttonLabel: String(ad.buttonLabel || "Abrir anúncio").trim(),
    section: String(ad.section || "Principal").trim(),
    active: ad.active !== false,
    impressions: Math.max(0, Number(ad.impressions ?? 0) || 0),
    clicks: Math.max(0, Number(ad.clicks ?? 0) || 0),
    createdAt: String(ad.createdAt || fallback.createdAt),
    updatedAt: String(ad.updatedAt || fallback.updatedAt),
  };
}

export function normalizeAdSettings(settings: Partial<AdSettings>): AdSettings {
  const fallback = defaultAdSettings();
  const startTime = normalizeTime(settings.startTime || fallback.startTime);
  const endTime = normalizeTime(settings.endTime || fallback.endTime);

  return {
    enabled: settings.enabled !== false,
    scheduleEnabled: Boolean(settings.scheduleEnabled),
    startTime,
    endTime,
  };
}

export function loadAds(): SiteAd[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(AD_STORAGE_KEY) || window.localStorage.getItem(AD_LEGACY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Partial<SiteAd>[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizeAd)
      .filter((ad) => ad.title || ad.description || ad.imageUrl)
      .slice(0, MAX_ADS);
  } catch {
    return [];
  }
}

export function saveAds(ads: SiteAd[]) {
  if (typeof window === "undefined") return;
  const normalized = ads.map(normalizeAd).slice(0, MAX_ADS);
  window.localStorage.setItem(AD_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new Event("cnjm-ads-updated"));
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
  window.dispatchEvent(new Event("cnjm-ads-updated"));
}

export function getVisibleAds(ads: SiteAd[], settings: AdSettings, now = new Date()) {
  if (!settings.enabled) return [];
  if (settings.scheduleEnabled && !isTimeWithinWindow(now, settings.startTime, settings.endTime)) return [];
  return ads.filter((ad) => ad.active && (ad.title || ad.description || ad.imageUrl));
}

export function updateAdStats(id: string, field: "impressions" | "clicks") {
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

export function isAdminSessionActive() {
  return typeof window !== "undefined" && window.localStorage.getItem(AD_SESSION_KEY) === "active";
}

export function setAdminSession(active: boolean) {
  if (typeof window === "undefined") return;

  if (active) {
    window.localStorage.setItem(AD_SESSION_KEY, "active");
    return;
  }

  window.localStorage.removeItem(AD_SESSION_KEY);
}

export function normalizeOptionalUrl(value: string) {
  const clean = String(value || "").trim();
  if (!clean) return "";

  try {
    const url = new URL(clean);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
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
