import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  HardDrive,
  ImageUp,
  Lock,
  LogOut,
  Megaphone,
  Mic2,
  Plus,
  Power,
  Radio,
  RefreshCw,
  Save,
  Settings2,
  SlidersHorizontal,
  TrendingUp,
  Trash2,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Navigate, NavLink, useLocation } from "react-router-dom";
import { AdImageCropper, type CroppedAdImage } from "../components/AdImageCropper";
import { AudienceReportPanel } from "../components/AudienceReportPanel";
import {
  AD_BANNER_HEIGHT,
  AD_BANNER_WIDTH,
  MAX_ADS,
  canUseLocalFallback,
  clearAdminSession,
  deleteRemoteAd,
  emptyAd,
  fetchAdminAds,
  getAdminSession,
  importRemoteSiteImage,
  loadAdSettings,
  loadAds,
  loginAdsAdmin,
  migrateStoredSiteImages,
  normalizeAd,
  normalizeAdSettings,
  saveAdSettings,
  saveAds,
  saveRemoteAd,
  saveRemoteSettings,
  unavailableAdsPayload,
  uploadAdImage,
  type AdSettings,
  type AdsPayload,
  type AdminSession,
  type SiteAd,
} from "../lib/ads";
import {
  deleteRemoteProgram,
  emptyProgram,
  fetchAdminPrograms,
  loadPrograms,
  localProgramsPayload,
  normalizeProgram,
  PROGRAM_LOGO_MAX_DIMENSION,
  PROGRAM_LOGO_MAX_SIZE,
  savePrograms,
  saveRemoteProgram,
  uploadProgramLogo,
  type ProgramsPayload,
  type StationProgram,
} from "../lib/programs";
import {
  deleteRemoteDj,
  emptyDj,
  emptyAudienceDjProfile,
  emptyAudienceScheduleProfile,
  defaultLiveDjControl,
  controlRemoteDjSession,
  emptyManualLiveDjSchedule,
  fetchAdminDjs,
  fetchDjDetectionStatus,
  fetchVoxIntegrationStatus,
  fetchLiveStatusTest,
  AUDIENCE_DAY_IDS,
  loadDjs,
  LIVE_TEST_DEFAULT_LISTENERS,
  LIVE_TEST_DEFAULT_LIVE_BOOST,
  LIVE_TEST_DEFAULT_GROWTH,
  LIVE_TEST_DEFAULT_MOVEMENT,
  LIVE_TEST_DEFAULT_EXIT,
  LIVE_TEST_DEFAULT_TRANSITION,
  LIVE_TEST_DEFAULT_VISITORS,
  LIVE_TEST_MAX_GROWTH_PERCENT,
  LIVE_TEST_MAX_LISTENERS,
  LIVE_TEST_MAX_PERCENT,
  LIVE_TEST_MAX_VISITORS,
  localDjsPayload,
  localLiveStatusPayload,
  normalizeDj,
  normalizeDjDetectionConfig,
  normalizeLiveStatusTest,
  readLiveStatusTest,
  resolveConfiguredLiveDjStatus,
  resolveManualLiveDjStatus,
  resolveLiveStatusAudienceProfile,
  resolveLiveStatusTestMetrics,
  saveDjs,
  setRemoteDjSkippedToday,
  saveRemoteDj,
  saveRemoteLiveStatusTest,
  saveVoxIntegration,
  uploadDjLogo,
  writeLiveStatusTest,
  type DjsPayload,
  type LiveStatusTestPayload,
  type LiveStatusTestResponse,
  type StationDj,
  type VoxIntegrationPayload,
} from "../lib/liveDjs";
import type { AudienceDjProfile, AudienceScheduleProfile, ManualLiveDjControl, ManualLiveDjSchedule } from "../types";

type LoginForm = {
  login: string;
  password: string;
};

type UploadState = {
  status: "idle" | "checking" | "ready" | "error";
  message: string;
};

type ConversionState = UploadState & {
  done: number;
  total: number;
};

type VisitorCounterDraft = {
  visitorBase: number;
  visitorTarget: number | null;
  visitorGrowthPercent: number;
};

type VoxIntegrationDraft = {
  enabled: boolean;
  port: string;
};

// Legacy schedule payloads remain readable until the authenticated migration rewrites them into DJ records.
type DjScheduleDraft = {
  enabled: boolean;
  dayIds: string[];
  startTime: string;
  endTime: string;
};

type AdminPanel = "dashboard" | "ads" | "programs" | "djs" | "visits" | "reports" | "api";
type AdminResource = "ads" | "programs" | "djs" | "audience" | "detection" | "vox";
type AdminActivityStatus = "saving" | "confirming" | "complete" | "error";

type AdminActivityItem = {
  id: number;
  label: string;
  detail: string;
  status: AdminActivityStatus;
  createdAt: number;
};

const adminPanelRoutes: Record<AdminPanel, string> = {
  dashboard: "/ads/dashboard",
  ads: "/ads/anuncios",
  programs: "/ads/programacao",
  djs: "/ads/djs",
  visits: "/ads/visitas",
  reports: "/ads/relatorios",
  api: "/ads/api",
};

const ADMIN_QUERY_STALE_TIME_MS = 120_000;
const ACTIVITY_LOG_LIMIT = 6;

const localAdminPayload = (message?: string): AdsPayload => ({
  ads: loadAds(),
  settings: loadAdSettings(),
  source: "local",
  fetchedAt: new Date().toISOString(),
  message,
});

const localProgramPayload = (message?: string): ProgramsPayload => localProgramsPayload(message);

function visitorCounterDraftFrom(payload: Partial<LiveStatusTestPayload>): VisitorCounterDraft {
  const normalized = normalizeLiveStatusTest(payload);
  return {
    visitorBase: normalized.visitorBase ?? normalized.visitors ?? LIVE_TEST_DEFAULT_VISITORS,
    visitorTarget: normalized.visitorTarget ?? null,
    visitorGrowthPercent: Math.max(1, normalized.visitorGrowthPercent ?? normalized.growthPercent ?? LIVE_TEST_DEFAULT_GROWTH),
  };
}

function visitorCounterFields(payload: Partial<LiveStatusTestPayload>): Partial<LiveStatusTestPayload> {
  const normalized = normalizeLiveStatusTest(payload);
  return {
    visitors: normalized.visitors,
    visitorBase: normalized.visitorBase,
    visitorTarget: normalized.visitorTarget,
    growthPercent: normalized.visitorGrowthPercent,
    visitorGrowthPercent: normalized.visitorGrowthPercent,
    rampFromVisitors: normalized.rampFromVisitors,
    visitorAppliedAt: normalized.visitorAppliedAt,
  };
}

function onlineAudienceFields(payload: Partial<LiveStatusTestPayload>) {
  const normalized = normalizeLiveStatusTest(payload);
  const {
    visitors: _visitors,
    visitorBase: _visitorBase,
    visitorTarget: _visitorTarget,
    growthPercent: _growthPercent,
    visitorGrowthPercent: _visitorGrowthPercent,
    rampFromVisitors: _rampFromVisitors,
    visitorAppliedAt: _visitorAppliedAt,
    ...online
  } = normalized;
  return online;
}

const localDjPayload = (message?: string): DjsPayload => localDjsPayload(message);

function panelFromPath(pathname: string): AdminPanel | null {
  const cleanPath = pathname.replace(/\/+$/, "");
  if (cleanPath === "/ads" || cleanPath === "/ads/dashboard") return "dashboard";
  if (cleanPath === "/ads/anuncios") return "ads";
  if (cleanPath === "/ads/programacao") return "programs";
  if (cleanPath === "/ads/djs") return "djs";
  if (cleanPath === "/ads/visitas") return "visits";
  if (cleanPath === "/ads/relatorios") return "reports";
  if (cleanPath === "/ads/api") return "api";
  return null;
}

export function AdsAdminPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const activePanel = panelFromPath(location.pathname) || "dashboard";
  const isDashboard = activePanel === "dashboard";
  const shouldLoadAds = isDashboard || activePanel === "ads";
  const shouldLoadPrograms = isDashboard || activePanel === "programs";
  const shouldLoadDjs = isDashboard || activePanel === "djs" || activePanel === "reports" || activePanel === "api";
  const shouldLoadAudience = isDashboard || activePanel === "visits" || activePanel === "reports" || activePanel === "djs" || activePanel === "api";
  const [session, setSession] = useState<AdminSession | null>(() => getAdminSession());
  const [loginForm, setLoginForm] = useState<LoginForm>({ login: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [draft, setDraft] = useState<SiteAd>(() => emptyAd());
  const [selectedId, setSelectedId] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle", message: "" });
  const [conversionState, setConversionState] = useState<ConversionState>({
    status: "idle",
    message: "",
    done: 0,
    total: 0,
  });
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [programUploadState, setProgramUploadState] = useState<UploadState>({ status: "idle", message: "" });
  const [actionMessage, setActionMessage] = useState("");
  const [programDraft, setProgramDraft] = useState<StationProgram>(() => emptyProgram());
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [djDraft, setDjDraft] = useState<StationDj>(() => emptyDj());
  const [selectedDjId, setSelectedDjId] = useState("");
  const [djLogoUploadState, setDjLogoUploadState] = useState<UploadState>({ status: "idle", message: "" });
  const [liveTest, setLiveTest] = useState<LiveStatusTestPayload>(() => readLiveStatusTest());
  const [audienceDraft, setAudienceDraft] = useState<LiveStatusTestPayload>(() => readLiveStatusTest());
  const [visitorDraft, setVisitorDraft] = useState<VisitorCounterDraft>(() => visitorCounterDraftFrom(readLiveStatusTest()));
  const [djDetectionDraft, setDjDetectionDraft] = useState(() => normalizeDjDetectionConfig(readLiveStatusTest().djDetectionConfig));
  const [voxDraft, setVoxDraft] = useState<VoxIntegrationDraft>({ enabled: false, port: "" });
  const [voxPassword, setVoxPassword] = useState("");
  const [simulationNow, setSimulationNow] = useState(() => Date.now());
  const [activityLog, setActivityLog] = useState<AdminActivityItem[]>([]);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const audienceSaveInFlightRef = useRef(false);
  const mediaMigrationStartedRef = useRef<string | null>(null);
  const activitySequenceRef = useRef(0);
  const [isAudienceSaving, setIsAudienceSaving] = useState(false);
  const [isDjDetectionSaving, setIsDjDetectionSaving] = useState(false);
  const [isVoxSaving, setIsVoxSaving] = useState(false);
  const [djDetectionDiagnostic, setDjDetectionDiagnostic] = useState<Awaited<ReturnType<typeof fetchDjDetectionStatus>> | null>(null);
  const [djVoxProbeById, setDjVoxProbeById] = useState<Record<string, "online" | "offline" | "unknown">>({});
  const [djVoxProbeAtById, setDjVoxProbeAtById] = useState<Record<string, number>>({});
  const panelRefreshSeconds = normalizeDjDetectionConfig(liveTest.djDetectionConfig).panelRefreshSeconds;
  const { data, isFetching } = useQuery({
    queryKey: ["ads-admin", session?.token, session?.source],
    enabled: Boolean(session && shouldLoadAds),
    queryFn: async ({ signal }) => {
      if (!session) return localAdminPayload();
      if (session.source === "local") {
        return canUseLocalFallback()
          ? localAdminPayload()
          : unavailableAdsPayload("Sessão local não é permitida no site publicado.");
      }

      try {
        return await fetchAdminAds(session.token, signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Conteúdo global indisponível.";
        return canUseLocalFallback() ? localAdminPayload(message) : unavailableAdsPayload(message);
      }
    },
    staleTime: ADMIN_QUERY_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const { data: programData, isFetching: isFetchingPrograms } = useQuery({
    queryKey: ["programs-admin", session?.token, session?.source],
    enabled: Boolean(session && shouldLoadPrograms),
    queryFn: async ({ signal }) => {
      if (!session) return localProgramPayload();
      if (session.source === "local") {
        return canUseLocalFallback()
          ? localProgramPayload()
          : localProgramPayload("Sessão local não é permitida no site publicado.");
      }

      try {
        return await fetchAdminPrograms(session.token, signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Conteúdo global indisponível.";
        return canUseLocalFallback() ? localProgramPayload(message) : localProgramPayload(message);
      }
    },
    staleTime: ADMIN_QUERY_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const { data: djData, isFetching: isFetchingDjs } = useQuery({
    queryKey: ["djs-admin", session?.token, session?.source],
    enabled: Boolean(session && shouldLoadDjs),
    queryFn: async ({ signal }) => {
      if (!session) return localDjPayload();
      if (session.source === "local") {
        return canUseLocalFallback()
          ? localDjPayload()
          : localDjPayload("Sessão local não é permitida no site publicado.");
      }

      try {
        return await fetchAdminDjs(session.token, signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Conteúdo global indisponível.";
        return canUseLocalFallback() ? localDjPayload(message) : localDjPayload(message);
      }
    },
    staleTime: ADMIN_QUERY_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const { data: liveStatusData, isFetching: isFetchingLiveStatus } = useQuery({
    queryKey: ["live-status-admin", session?.token, session?.source],
    enabled: Boolean(session && shouldLoadAudience),
    queryFn: async ({ signal }) => {
      if (!session) return localLiveStatusPayload();
      if (session.source === "local") {
        return canUseLocalFallback()
          ? localLiveStatusPayload()
          : localLiveStatusPayload("Sessão local não é permitida no site publicado.");
      }

      return fetchLiveStatusTest(signal);
    },
    staleTime: ADMIN_QUERY_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const { data: djDetectionData, isFetching: isFetchingDjDetection } = useQuery({
    queryKey: ["dj-detection-admin", session?.token, session?.source],
    enabled: Boolean(session?.source === "blobs" && (isDashboard || activePanel === "api" || activePanel === "djs")),
    queryFn: async ({ signal }) => fetchDjDetectionStatus(session?.token || "", false, signal),
    staleTime: ADMIN_QUERY_STALE_TIME_MS,
    refetchInterval: activePanel === "djs" ? panelRefreshSeconds * 1_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const { data: voxIntegrationData, isFetching: isFetchingVoxIntegration } = useQuery({
    queryKey: ["vox-integration-admin", session?.token, session?.source],
    enabled: Boolean(session?.source === "blobs" && (activePanel === "api" || activePanel === "djs")),
    queryFn: async ({ signal }) => fetchVoxIntegrationStatus(session?.token || "", false, signal),
    staleTime: ADMIN_QUERY_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const ads = data?.ads ?? [];
  const settings = data?.settings ?? loadAdSettings();
  const programs = programData?.programs ?? loadPrograms();
  const currentProgram = programData?.currentProgram;
  const djs = djData?.djs ?? loadDjs();
  const djDetectionStatus = djDetectionDiagnostic || djDetectionData || null;
  const voxDjStatusById = useMemo(
    () => new Map([
      ...(voxIntegrationData?.djStatuses || []).map((entry) => [entry.id, entry.status] as const),
      ...Object.entries(djVoxProbeById),
    ]),
    [djVoxProbeById, voxIntegrationData?.djStatuses],
  );
  const isDisconnected = Boolean(session?.source === "blobs" && data?.source === "fallback");
  const isRemote = Boolean(session?.source === "blobs" && !isDisconnected);
  const isLocalMode = Boolean(session?.source === "local");
  const canManageLiveMetrics = Boolean(session && (session.source === "blobs" || canUseLocalFallback()));
  const isLiveMetricsRemote = Boolean(session?.source === "blobs");
  const canEditAds = isRemote || isLocalMode;
  const liveMetricsScopeText = isLiveMetricsRemote
    ? "Ajuste os ouvintes e as visitas exibidas no site publicado. Nada muda para o público antes de aplicar."
    : "Ajuste os ouvintes e as visitas do teste local, sem salvar nada no conteúdo global.";
  const environmentNotice = isLocalMode
    ? "Ambiente local ativo para testes. Os anúncios salvos aqui ficam apenas neste navegador."
    : isDisconnected
      ? data?.message || "Conteúdo global de anúncios não conectado. Ative a API e o Netlify Blobs."
      : "";
  const activeCount = useMemo(() => ads.filter((ad) => ad.active).length, [ads]);
  const webpMigrationAds = useMemo(() => ads.filter(needsWebpMigration), [ads]);
  const activeProgramCount = useMemo(() => programs.filter((program) => program.active).length, [programs]);
  const activeDjCount = useMemo(() => djs.filter((dj) => dj.active).length, [djs]);
  const linkedAdsCount = useMemo(() => ads.filter((ad) => ad.linkUrl).length, [ads]);
  const totalClicks = useMemo(() => ads.reduce((total, ad) => total + ad.clicks, 0), [ads]);
  const savedManualLiveDj = useMemo(
    () => resolveManualLiveDjStatus(liveTest, simulationNow),
    [liveTest, simulationNow],
  );
  const draftManualLiveDj = useMemo(
    () => resolveManualLiveDjStatus(audienceDraft, simulationNow),
    [audienceDraft, simulationNow],
  );
  const savedConfiguredLiveDj = useMemo(
    () => resolveConfiguredLiveDjStatus(liveTest, djs, simulationNow),
    [djs, liveTest, simulationNow],
  );
  const draftConfiguredLiveDj = useMemo(
    () => resolveConfiguredLiveDjStatus(audienceDraft, djs, simulationNow),
    [audienceDraft, djs, simulationNow],
  );
  const liveDjControl = useMemo(
    () => normalizeLiveStatusTest(audienceDraft).liveDjControl || defaultLiveDjControl(),
    [audienceDraft],
  );
  const savedLiveDjControl = useMemo(
    () => normalizeLiveStatusTest(liveTest).liveDjControl || defaultLiveDjControl(),
    [liveTest],
  );
  const resolvedLiveMetrics = useMemo(
    () => resolveLiveStatusTestMetrics(liveTest, simulationNow, { liveDj: savedConfiguredLiveDj }),
    [liveTest, savedConfiguredLiveDj, simulationNow],
  );
  const resolvedDraftMetrics = useMemo(
    () => resolveLiveStatusTestMetrics({ ...audienceDraft, ...visitorDraft }, simulationNow, { liveDj: draftConfiguredLiveDj }),
    [audienceDraft, draftConfiguredLiveDj, simulationNow, visitorDraft],
  );
  const activeAudienceProfile = useMemo(
    () => resolveLiveStatusAudienceProfile(audienceDraft, simulationNow, { liveDj: draftConfiguredLiveDj }),
    [audienceDraft, draftConfiguredLiveDj, simulationNow],
  );
  const visitGrowthBars = useMemo(() => makeVisitGrowthBars(visitorDraft), [visitorDraft]);
  const isAudienceActive = liveTest.enabled !== false;
  const isAudienceDraftDirty = useMemo(
    () => JSON.stringify(onlineAudienceFields(audienceDraft)) !== JSON.stringify(onlineAudienceFields(liveTest)),
    [audienceDraft, liveTest],
  );
  const isVisitorDraftDirty = useMemo(
    () => JSON.stringify(visitorDraft) !== JSON.stringify(visitorCounterDraftFrom(liveTest)),
    [visitorDraft, liveTest],
  );
  const djOperationsLiveDj = djDetectionStatus?.liveDj || savedConfiguredLiveDj || null;
  const djOperationsState = djDetectionStatus?.state;
  const scheduledDjsWithoutVox = useMemo(
    () => djs.filter((dj) => dj.active && dj.scheduleEnabled && !dj.voxLogin.trim()),
    [djs],
  );
  const djAttentionItems = useMemo(() => {
    const items: string[] = [];
    if (session?.source === "blobs" && !voxIntegrationData?.integration.enabled) {
      items.push("Integração Vox desligada: a confirmação por conexão está indisponível.");
    } else if (session?.source === "blobs" && !voxIntegrationData?.integration.encryptionReady) {
      items.push("Chave de proteção do Vox ausente: conclua a conexão segura na aba Funcionamento da API.");
    }
    if (scheduledDjsWithoutVox.length) {
      items.push(`${scheduledDjsWithoutVox.length} DJ(s) com agenda, mas sem login técnico para confirmação automática.`);
    }
    if (djDetectionStatus?.isOverrun) items.push("Há um DJ com horário previsto excedido. Mantenha no ar, estenda ou encerre a sessão.");
    if (djDetectionStatus?.diagnostic?.voxUnavailable) items.push("Vox indisponível na última conferência. A detecção de contingência continua sem trocar o estado por erro de rede.");
    if (djDetectionStatus?.diagnostic?.lastError) items.push("A última leitura da rádio não foi concluída. O painel mantém o último estado seguro.");
    return items;
  }, [djDetectionStatus?.diagnostic?.lastError, djDetectionStatus?.diagnostic?.voxUnavailable, djDetectionStatus?.isOverrun, scheduledDjsWithoutVox.length, session?.source, voxIntegrationData?.integration.enabled, voxIntegrationData?.integration.encryptionReady]);
  const effectiveDjDetectionConfig = djDetectionStatus?.config || normalizeDjDetectionConfig(liveTest.djDetectionConfig);
  const earlyWindowLabel = formatDjEarlyWindow(effectiveDjDetectionConfig.earlyWindowMinutes);
  const currentPanelRefreshSeconds = effectiveDjDetectionConfig.panelRefreshSeconds;
  const voxReadyForProbe = Boolean(
    isRemote &&
    voxIntegrationData?.integration.enabled &&
    voxIntegrationData.integration.passwordConfigured &&
    voxIntegrationData.integration.encryptionReady,
  );

  useEffect(() => {
    if (!liveStatusData?.liveStatusTest) return;
    const normalized = normalizeLiveStatusTest(liveStatusData.liveStatusTest);
    setLiveTest(normalized);
    setAudienceDraft(normalized);
    setVisitorDraft(visitorCounterDraftFrom(normalized));
    setDjDetectionDraft(normalizeDjDetectionConfig(normalized.djDetectionConfig));
    setSimulationNow(Date.now());
  }, [
    liveStatusData?.liveStatusTest?.enabled,
    liveStatusData?.liveStatusTest?.state,
    liveStatusData?.liveStatusTest?.listeners,
    liveStatusData?.liveStatusTest?.visitors,
    liveStatusData?.liveStatusTest?.listenersMin,
    liveStatusData?.liveStatusTest?.listenersMax,
    liveStatusData?.liveStatusTest?.visitorBase,
    liveStatusData?.liveStatusTest?.visitorTarget,
    liveStatusData?.liveStatusTest?.movementPercent,
    liveStatusData?.liveStatusTest?.exitPercent,
    liveStatusData?.liveStatusTest?.transitionPercent,
    liveStatusData?.liveStatusTest?.liveBoostPercent,
    liveStatusData?.liveStatusTest?.visitorGrowthPercent,
    liveStatusData?.liveStatusTest?.visitorAppliedAt,
    liveStatusData?.liveStatusTest?.seed,
    liveStatusData?.liveStatusTest?.appliedAt,
    liveStatusData?.liveStatusTest?.updatedAt,
    liveStatusData?.liveStatusTest?.scheduleProfiles,
    liveStatusData?.liveStatusTest?.djProfiles,
    liveStatusData?.liveStatusTest?.liveDjControl,
    liveStatusData?.liveStatusTest?.djDetectionConfig,
    liveStatusData?.liveStatusTest?.djSkips,
  ]);

  useEffect(() => {
    if (!voxIntegrationData?.integration) return;
    setVoxDraft({
      enabled: voxIntegrationData.integration.enabled,
      port: voxIntegrationData.integration.port,
    });
  }, [voxIntegrationData?.integration.enabled, voxIntegrationData?.integration.port, voxIntegrationData?.integration.updatedAt]);

  useEffect(() => {
    const timer = window.setInterval(() => setSimulationNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (session?.source !== "blobs" || mediaMigrationStartedRef.current === session.token) return;
    mediaMigrationStartedRef.current = session.token;

    void migrateStoredSiteImages(session.token)
      .then((result) => {
        if (Number(result.migrated || 0) > 0) {
          setActionMessage(`${result.migrated} imagem(ns) foram migradas automaticamente para WebP.`);
        }
        void refresh(["ads", "programs", "djs"]);
      })
      .catch((error) => {
        setActionMessage(error instanceof Error ? error.message : "A migração automática de imagens será retomada no próximo acesso.");
      });
  }, [session?.source, session?.token]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");

    try {
      const nextSession = await loginAdsAdmin(loginForm.login, loginForm.password);
      setSession(nextSession);
      setActionMessage(nextSession.source === "blobs" ? "Blobs conectados." : "Modo local ativo para testes.");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login ou senha inválidos.");
    }
  };

  const logout = () => {
    clearAdminSession();
    setSession(null);
    setLoginForm({ login: "", password: "" });
    setDraft(emptyAd());
    setSelectedId("");
    setProgramDraft(emptyProgram());
    setSelectedProgramId("");
    setDjDraft(emptyDj());
    setSelectedDjId("");
    setDjLogoUploadState({ status: "idle", message: "" });
  };

  const refresh = useCallback(async (resources: AdminResource[] = ["ads", "programs", "djs", "audience", "detection", "vox"]) => {
    const keys: Record<AdminResource, readonly unknown[]> = {
      ads: ["ads-admin"],
      programs: ["programs-admin"],
      djs: ["djs-admin"],
      audience: ["live-status-admin"],
      detection: ["dj-detection-admin"],
      vox: ["vox-integration-admin"],
    };

    await Promise.all(resources.map((resource) => queryClient.invalidateQueries({ queryKey: keys[resource] })));
    if (resources.includes("ads")) {
      await queryClient.invalidateQueries({ queryKey: ["public-ads"] });
    }
  }, [queryClient]);

  const beginActivity = useCallback((label: string) => {
    const id = ++activitySequenceRef.current;
    setActivityLog((current) => [{
      id,
      label,
      detail: "Enviando alteração",
      status: "saving" as const,
      createdAt: Date.now(),
    }, ...current].slice(0, ACTIVITY_LOG_LIMIT));
    return id;
  }, []);

  const updateActivity = useCallback((id: number, status: AdminActivityStatus, detail: string) => {
    setActivityLog((current) => current.map((item) => item.id === id ? { ...item, status, detail } : item));
  }, []);

  const confirmActivity = useCallback(async (id: number, resources: AdminResource[], detail = "Alteração confirmada") => {
    updateActivity(id, "confirming", "Confirmando no painel");
    await refresh(resources);
    updateActivity(id, "complete", detail);
  }, [refresh, updateActivity]);

  const failActivity = useCallback((id: number, message: string) => {
    updateActivity(id, "error", message);
  }, [updateActivity]);

  const persistLocalAds = (nextAds: SiteAd[]) => {
    saveAds(nextAds.slice(0, MAX_ADS));
  };

  const persistLocalPrograms = (nextPrograms: StationProgram[]) => {
    savePrograms(nextPrograms);
  };

  const persistLocalDjs = (nextDjs: StationDj[]) => {
    saveDjs(nextDjs);
  };

  const persistSettings = async (nextSettings: Partial<AdSettings>) => {
    const normalized = normalizeAdSettings({ ...settings, ...nextSettings });
    setActionMessage("");

    if (!canEditAds) {
      setActionMessage("Conecte o conteúdo global antes de alterar a configuração de anúncios.");
      return;
    }

    const activityId = beginActivity("Configuração de anúncios");
    try {
      if (isRemote && session) {
        await saveRemoteSettings(session.token, normalized);
      } else {
        saveAdSettings(normalized);
      }
      setActionMessage("Configuração salva.");
      await confirmActivity(activityId, ["ads"], "Configuração atualizada");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar a configuração.";
      setActionMessage(message);
      failActivity(activityId, message);
    }
  };

  const editAd = (ad: SiteAd) => {
    setDraft(ad);
    setSelectedId(ad.id);
    setUploadState({ status: "idle", message: "" });
    setActionMessage("");
  };

  const newAd = () => {
    const fresh = emptyAd();
    setDraft(fresh);
    setSelectedId("");
    setUploadState({ status: "idle", message: "" });
    setActionMessage("");
  };

  const editProgram = (program: StationProgram) => {
    setProgramDraft(program);
    setSelectedProgramId(program.id);
    setProgramUploadState({ status: "idle", message: "" });
    setActionMessage("");
  };

  const newProgram = () => {
    const fresh = emptyProgram();
    setProgramDraft(fresh);
    setSelectedProgramId("");
    setProgramUploadState({ status: "idle", message: "" });
    setActionMessage("");
  };

  const saveDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let normalized = normalizeAd({ ...draft, updatedAt: new Date().toISOString() });
    if (!canEditAds) {
      setActionMessage("Conecte o conteúdo global antes de salvar anúncios.");
      return;
    }
    if (!normalized.title && !normalized.description && !normalized.imageUrl) {
      setActionMessage("Preencha pelo menos título, texto ou imagem.");
      return;
    }

    const activityId = beginActivity(selectedId ? "Atualização de anúncio" : "Novo anúncio");
    try {
      if (isRemote && session) {
        if (isExternalImageUrl(normalized.imageUrl)) {
          const image = await importRemoteSiteImage(session.token, { kind: "ad", url: normalized.imageUrl });
          normalized = normalizeAd({ ...normalized, ...image, updatedAt: new Date().toISOString() });
        }
        const saved = await saveRemoteAd(session.token, normalized);
        setDraft(saved);
        setSelectedId(saved.id);
      } else {
        const exists = ads.some((ad) => ad.id === normalized.id);
        const nextAds = exists ? ads.map((ad) => (ad.id === normalized.id ? normalized : ad)) : [normalized, ...ads];
        persistLocalAds(nextAds);
        setSelectedId(normalized.id);
      }
      setActionMessage("Anúncio salvo.");
      await confirmActivity(activityId, ["ads"], "Anúncio confirmado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar o anúncio.";
      setActionMessage(message);
      failActivity(activityId, message);
    }
  };

  const removeAd = async (id: string) => {
    if (!canEditAds) {
      setActionMessage("Conecte o conteúdo global antes de excluir anúncios.");
      return;
    }

    const activityId = beginActivity("Remoção de anúncio");
    try {
      if (isRemote && session) {
        await deleteRemoteAd(session.token, id);
      } else {
        persistLocalAds(ads.filter((ad) => ad.id !== id));
      }
      if (selectedId === id) newAd();
      setActionMessage("Anúncio removido.");
      await confirmActivity(activityId, ["ads"], "Anúncio removido");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível excluir o anúncio.";
      setActionMessage(message);
      failActivity(activityId, message);
    }
  };

  const toggleAd = async (ad: SiteAd) => {
    if (!canEditAds) {
      setActionMessage("Conecte o conteúdo global antes de ativar ou desativar anúncios.");
      return;
    }

    const next = normalizeAd({ ...ad, active: !ad.active, updatedAt: new Date().toISOString() });
    const activityId = beginActivity(next.active ? "Ativação de anúncio" : "Pausa de anúncio");
    try {
      if (isRemote && session) {
        await saveRemoteAd(session.token, next);
      } else {
        persistLocalAds(ads.map((item) => (item.id === ad.id ? next : item)));
      }
      setActionMessage(next.active ? "Anúncio ativado." : "Anúncio desativado.");
      await confirmActivity(activityId, ["ads"], next.active ? "Anúncio ativo" : "Anúncio pausado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível alterar o anúncio.";
      setActionMessage(message);
      failActivity(activityId, message);
    }
  };

  const handleImageFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    if (!canEditAds) {
      setUploadState({ status: "error", message: "Conecte o conteúdo global antes de enviar imagens." });
      return;
    }

    if (!file.type.startsWith("image/")) {
      setUploadState({ status: "error", message: "Envie uma imagem PNG, JPG ou WebP." });
      return;
    }

    const sourceType = imageContentTypeForFile(file);
    if (sourceType === "image/webp") {
      try {
        const size = await readImageSize(file);
        if (size.width === AD_BANNER_WIDTH && size.height === AD_BANNER_HEIGHT && file.size <= PROGRAM_LOGO_MAX_SIZE) {
          const dataUrl = await readFileAsDataUrl(file);
          await applyCroppedAdImage({
            fileName: toWebpMigrationFileName(file.name),
            contentType: "image/webp",
            width: size.width,
            height: size.height,
            dataUrl,
            dataBase64: dataUrl.split(",")[1] || "",
            size: file.size,
            sourceWidth: size.width,
            sourceHeight: size.height,
            wasUpscaled: false,
          }, true);
          return;
        }
      } catch (error) {
        setUploadState({
          status: "error",
          message: error instanceof Error ? error.message : "Não foi possível validar o WebP.",
        });
        return;
      }
    }

    setCropFile(file);
    setUploadState({ status: "checking", message: "Ajuste o corte antes de anexar o anúncio." });
  };

  const applyCroppedAdImage = async (image: CroppedAdImage, isDirectWebp = false) => {
    if (!canEditAds) {
      setUploadState({ status: "error", message: "Conecte o conteúdo global antes de enviar imagens." });
      return;
    }

    setUploadState({
      status: "checking",
      message: isDirectWebp ? "Validando e enviando WebP sem reconverter..." : "Enviando WebP otimizado...",
    });

    try {
      if (isRemote && session) {
        const uploadedImage = await uploadAdImage(session.token, {
          fileName: image.fileName,
          contentType: image.contentType,
          width: image.width,
          height: image.height,
          dataBase64: image.dataBase64,
        });
        setDraft((current) => ({ ...current, ...uploadedImage }));
      } else {
        setDraft((current) => ({
          ...current,
          imageUrl: image.dataUrl,
          imageKey: image.fileName,
          imageWidth: image.width,
          imageHeight: image.height,
          imageContentType: image.contentType,
          imageSize: image.size,
        }));
      }
      setCropFile(null);
      setUploadState({
        status: "ready",
        message: isDirectWebp
          ? "WebP validado e anexado sem reconversão."
          : image.wasUpscaled
          ? "Imagem anexada em 1700 x 450px. Atenção: houve ampliação e pode perder nitidez."
          : "Imagem cortada, otimizada e anexada ao anúncio.",
      });
    } catch (error) {
      setUploadState({
        status: "error",
        message: error instanceof Error ? error.message : "Não foi possível enviar o WebP.",
      });
    }
  };

  const convertExistingAdsToWebp = async () => {
    const pendingAds = webpMigrationAds.slice(0, MAX_ADS);
    if (!pendingAds.length) {
      setConversionState({
        status: "ready",
        message: "Todos os anúncios com imagem já estão em WebP.",
        done: 0,
        total: 0,
      });
      return;
    }
    if (!canEditAds) {
      setConversionState({
        status: "error",
        message: "Conecte o conteúdo global antes de converter anúncios.",
        done: 0,
        total: pendingAds.length,
      });
      return;
    }

    setActionMessage("");
    setConversionState({
      status: "checking",
      message: `Convertendo 0 de ${pendingAds.length} anúncios...`,
      done: 0,
      total: pendingAds.length,
    });

    let convertedCount = 0;
    let localNextAds = ads;

    try {
      for (const ad of pendingAds) {
        const converted = await convertAdImageToWebpPayload(ad.imageUrl, ad.title || ad.imageKey || "anuncio");
        const migrated = normalizeAd({
          ...ad,
          imageUrl: converted.dataUrl,
          imageKey: converted.fileName,
          imageWidth: converted.width,
          imageHeight: converted.height,
          imageContentType: converted.contentType,
          imageSize: converted.size,
          updatedAt: new Date().toISOString(),
        });

        if (isRemote && session) {
          const uploadedImage = await uploadAdImage(session.token, {
            fileName: converted.fileName,
            contentType: converted.contentType,
            width: converted.width,
            height: converted.height,
            dataBase64: converted.dataBase64,
          });
          await saveRemoteAd(session.token, normalizeAd({ ...ad, ...uploadedImage, updatedAt: new Date().toISOString() }));
        } else {
          localNextAds = localNextAds.map((item) => (item.id === ad.id ? migrated : item));
        }

        convertedCount += 1;
        setConversionState({
          status: "checking",
          message: `Convertendo ${convertedCount} de ${pendingAds.length} anúncios...`,
          done: convertedCount,
          total: pendingAds.length,
        });
      }

      if (!isRemote) persistLocalAds(localNextAds);
      setConversionState({
        status: "ready",
        message: `${convertedCount} anúncio${convertedCount === 1 ? "" : "s"} convertido${convertedCount === 1 ? "" : "s"} para WebP.`,
        done: convertedCount,
        total: pendingAds.length,
      });
      setActionMessage("Migração WebP concluída. Imagens antigas substituídas por versões otimizadas.");
      await refresh(["ads"]);
    } catch (error) {
      setConversionState({
        status: "error",
        message: error instanceof Error ? error.message : "Não foi possível converter todos os anúncios.",
        done: convertedCount,
        total: pendingAds.length,
      });
      await refresh(["ads"]);
    }
  };

  const saveProgramDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let normalized = normalizeProgram({ ...programDraft, updatedAt: new Date().toISOString() });
    if (!canEditAds) {
      setActionMessage("Conecte o conteúdo global antes de salvar a programação.");
      return;
    }
    if (!normalized.program) {
      setActionMessage("Informe o nome do programa.");
      return;
    }

    const activityId = beginActivity(selectedProgramId ? "Atualização de programação" : "Novo programa");
    try {
      if (isRemote && session) {
        if (isExternalImageUrl(normalized.logoUrl)) {
          const image = await importRemoteSiteImage(session.token, { kind: "program", url: normalized.logoUrl });
          normalized = normalizeProgram({ ...normalized, logoUrl: image.imageUrl, logoKey: image.imageKey, updatedAt: new Date().toISOString() });
        }
        const saved = await saveRemoteProgram(session.token, normalized);
        setProgramDraft(saved);
        setSelectedProgramId(saved.id);
      } else {
        const exists = programs.some((program) => program.id === normalized.id);
        const nextPrograms = exists
          ? programs.map((program) => (program.id === normalized.id ? normalized : program))
          : [normalized, ...programs];
        persistLocalPrograms(nextPrograms);
        setSelectedProgramId(normalized.id);
      }
      setActionMessage("Programa salvo.");
      await confirmActivity(activityId, ["programs"], "Programação atualizada");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar o programa.";
      setActionMessage(message);
      failActivity(activityId, message);
    }
  };

  const removeProgram = async (id: string) => {
    if (!canEditAds) {
      setActionMessage("Conecte o conteúdo global antes de excluir programas.");
      return;
    }

    const activityId = beginActivity("Remoção de programa");
    try {
      if (isRemote && session) {
        await deleteRemoteProgram(session.token, id);
      } else {
        persistLocalPrograms(programs.filter((program) => program.id !== id));
      }
      if (selectedProgramId === id) newProgram();
      setActionMessage("Programa removido.");
      await confirmActivity(activityId, ["programs"], "Programa removido");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível excluir o programa.";
      setActionMessage(message);
      failActivity(activityId, message);
    }
  };

  const toggleProgram = async (program: StationProgram) => {
    const next = normalizeProgram({ ...program, active: !program.active, updatedAt: new Date().toISOString() });
    const activityId = beginActivity(next.active ? "Ativação de programa" : "Pausa de programa");
    try {
      if (isRemote && session) {
        await saveRemoteProgram(session.token, next);
      } else {
        persistLocalPrograms(programs.map((item) => (item.id === program.id ? next : item)));
      }
      setActionMessage(next.active ? "Programa ativado." : "Programa desativado.");
      await confirmActivity(activityId, ["programs"], next.active ? "Programa ativo" : "Programa pausado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível alterar o programa.";
      setActionMessage(message);
      failActivity(activityId, message);
    }
  };

  const handleProgramLogoFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    setProgramUploadState({ status: "checking", message: "Validando logo..." });

    try {
      const sourceType = imageContentTypeForFile(file);
      if (!isAcceptedSourceImageType(sourceType)) throw new Error("Envie uma logo PNG, JPG, WebP ou AVIF.");
      const size = await readImageSize(file);
      if (file.size > PROGRAM_LOGO_MAX_SIZE) throw new Error("A logo precisa ter até 2,5 MB.");
      if (size.width > PROGRAM_LOGO_MAX_DIMENSION || size.height > PROGRAM_LOGO_MAX_DIMENSION) {
        throw new Error(`A logo precisa ter até ${PROGRAM_LOGO_MAX_DIMENSION}px de largura e altura.`);
      }

      if (sourceType !== "image/webp") {
        setProgramUploadState({ status: "checking", message: "Convertendo para WebP..." });
      }

      const logo = await prepareProgramLogoUpload(file, size, sourceType);
      if (logo.size > PROGRAM_LOGO_MAX_SIZE) throw new Error("A logo WebP final precisa ter até 2,5 MB.");

      if (isRemote && session) {
        const image = await uploadProgramLogo(session.token, {
          fileName: logo.fileName,
          contentType: logo.contentType,
          width: logo.width,
          height: logo.height,
          dataBase64: logo.dataBase64,
        });
        setProgramDraft((current) => ({ ...current, logoUrl: image.imageUrl, logoKey: image.imageKey }));
      } else {
        setProgramDraft((current) => ({ ...current, logoUrl: logo.dataUrl, logoKey: logo.fileName }));
      }
      setProgramUploadState({
        status: "ready",
        message: logo.converted ? "Logo convertida e anexada ao programa em WebP." : "Logo WebP anexada ao programa.",
      });
    } catch (error) {
      setProgramUploadState({
        status: "error",
        message: error instanceof Error ? error.message : "Não foi possível validar a logo.",
      });
    } finally {
      event.currentTarget.value = "";
    }
  };

  const handleDjLogoFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    setDjLogoUploadState({ status: "checking", message: "Preparando logo WebP..." });
    try {
      const sourceType = imageContentTypeForFile(file);
      if (!isAcceptedSourceImageType(sourceType)) throw new Error("Envie uma imagem PNG, JPG, WebP ou AVIF.");
      if (file.size > 5_000_000) throw new Error("A imagem de origem precisa ter até 5 MB.");
      const size = await readImageSize(file);
      const isDirectWebp = sourceType === "image/webp" && size.width === 512 && size.height === 512;
      if (isDirectWebp && file.size > PROGRAM_LOGO_MAX_SIZE) throw new Error("A logo WebP final precisa ter até 2,5 MB.");

      if (isRemote && session) {
        const dataUrl = await readFileAsDataUrl(file);
        const image = await uploadDjLogo(session.token, {
          fileName: file.name,
          contentType: sourceType,
          width: size.width,
          height: size.height,
          dataBase64: dataUrl.split(",")[1] || "",
        });
        setDjDraft((current) => normalizeDj({
          ...current,
          logoUrl: image.imageUrl,
          logoKey: image.imageKey,
          logoWidth: image.imageWidth,
          logoHeight: image.imageHeight,
          logoContentType: "image/webp",
          logoSize: image.imageSize,
        }));
      } else {
        const image = await prepareDjLogoUpload(file, size);
        setDjDraft((current) => normalizeDj({
          ...current,
          logoUrl: image.dataUrl,
          logoKey: image.fileName,
          logoWidth: image.width,
          logoHeight: image.height,
          logoContentType: image.contentType,
          logoSize: image.size,
        }));
      }
      setDjLogoUploadState({
        status: "ready",
        message: isDirectWebp ? "Logo WebP anexada ao DJ sem reconversão." : "Logo quadrada convertida para WebP e anexada ao DJ.",
      });
    } catch (error) {
      setDjLogoUploadState({
        status: "error",
        message: error instanceof Error ? error.message : "Não foi possível preparar a logo do DJ.",
      });
    } finally {
      event.currentTarget.value = "";
    }
  };

  const editDj = (dj: StationDj) => {
    setDjDraft(dj);
    setSelectedDjId(dj.id);
    setDjLogoUploadState({ status: "idle", message: "" });
    setActionMessage("");
  };

  const newDj = () => {
    const fresh = emptyDj();
    setDjDraft(fresh);
    setSelectedDjId("");
    setDjLogoUploadState({ status: "idle", message: "" });
    setActionMessage("");
  };

  const saveDjDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let normalized = normalizeDj({ ...djDraft, updatedAt: new Date().toISOString() });
    if (!canEditAds) {
      setActionMessage("Conecte o conteúdo global antes de salvar DJs.");
      return;
    }
    if (!normalized.djName || !normalized.programName) {
      setActionMessage("Informe nome público do DJ e nome do programa.");
      return;
    }

    const activityId = beginActivity(selectedDjId ? "Atualização de DJ" : "Novo DJ");
    try {
      let savedDj = normalized;
      if (isRemote && session) {
        if (isExternalImageUrl(normalized.logoUrl)) {
          const image = await importRemoteSiteImage(session.token, { kind: "dj", url: normalized.logoUrl });
          normalized = normalizeDj({
            ...normalized,
            logoUrl: image.imageUrl,
            logoKey: image.imageKey,
            logoWidth: image.imageWidth,
            logoHeight: image.imageHeight,
            logoContentType: "image/webp",
            logoSize: image.imageSize,
            updatedAt: new Date().toISOString(),
          });
        }
        const saved = await saveRemoteDj(session.token, normalized);
        savedDj = saved;
        setDjDraft(saved);
        setSelectedDjId(saved.id);
      } else {
        const exists = djs.some((dj) => dj.id === normalized.id);
        const nextDjs = exists ? djs.map((dj) => (dj.id === normalized.id ? normalized : dj)) : [normalized, ...djs];
        persistLocalDjs(nextDjs);
        setSelectedDjId(normalized.id);
      }

      setActionMessage(savedDj.scheduleEnabled ? "DJ e agenda salvos." : "DJ salvo sem agenda automática.");
      await confirmActivity(activityId, ["djs", "audience"], "DJ e agenda confirmados");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar o DJ.";
      setActionMessage(message);
      failActivity(activityId, message);
    }
  };

  const removeDj = async (id: string) => {
    if (!canEditAds) {
      setActionMessage("Conecte o conteúdo global antes de excluir DJs.");
      return;
    }

    const activityId = beginActivity("Remoção de DJ");
    try {
      if (isRemote && session) {
        await deleteRemoteDj(session.token, id);
      } else {
        persistLocalDjs(djs.filter((dj) => dj.id !== id));
      }
      if (selectedDjId === id) newDj();
      setActionMessage("DJ removido.");
      await confirmActivity(activityId, ["djs", "audience"], "DJ removido");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível excluir o DJ.";
      setActionMessage(message);
      failActivity(activityId, message);
    }
  };

  const toggleDj = async (dj: StationDj) => {
    const next = normalizeDj({ ...dj, active: !dj.active, updatedAt: new Date().toISOString() });
    const activityId = beginActivity(next.active ? "Ativação de DJ" : "Pausa de DJ");
    try {
      if (isRemote && session) {
        await saveRemoteDj(session.token, next);
      } else {
        persistLocalDjs(djs.map((item) => (item.id === dj.id ? next : item)));
      }
      setActionMessage(next.active ? "DJ ativado." : "DJ desativado.");
      await confirmActivity(activityId, ["djs", "audience"], next.active ? "DJ ativo" : "DJ pausado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível alterar o DJ.";
      setActionMessage(message);
      failActivity(activityId, message);
    }
  };

  const persistAudienceConfig = async (next: LiveStatusTestPayload, successMessage: string) => {
    if (!canManageLiveMetrics || !session) {
      setActionMessage("Conecte o conteúdo global antes de alterar a audiência.");
      return;
    }

    if (audienceSaveInFlightRef.current) return;
    audienceSaveInFlightRef.current = true;
    setIsAudienceSaving(true);
    const activityId = beginActivity(successMessage);

    try {
      const saved = session.source === "blobs"
        ? await saveRemoteLiveStatusTest(session.token, next)
        : next;
      writeLiveStatusTest(saved);
      const normalized = normalizeLiveStatusTest(readLiveStatusTest());
      setLiveTest(normalized);
      setAudienceDraft(normalized);
      setVisitorDraft(visitorCounterDraftFrom(normalized));
      setSimulationNow(Date.now());
      queryClient.setQueryData<LiveStatusTestResponse>(
        ["live-status-admin", session.token, session.source],
        (current) => ({
          liveStatusTest: normalized,
          source: session.source === "blobs" ? "blobs" : "local",
          fetchedAt: new Date().toISOString(),
          message: current?.message,
        }),
      );
      setActionMessage(successMessage);
      await confirmActivity(activityId, ["audience", "detection"], "Alteração aplicada e conferida");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar a audiência.";
      setActionMessage(message);
      failActivity(activityId, message);
    } finally {
      audienceSaveInFlightRef.current = false;
      setIsAudienceSaving(false);
    }
  };

  const applyDjDetectionDraft = async () => {
    if (!canManageLiveMetrics) {
      setActionMessage("Conecte o conteúdo global antes de alterar a detecção de DJs.");
      return;
    }

    setIsDjDetectionSaving(true);
    try {
      const next = normalizeLiveStatusTest({
        ...liveTest,
        djDetectionConfig: djDetectionDraft,
        updatedAt: new Date().toISOString(),
      });
      await persistAudienceConfig(next, "Funcionamento da API atualizado.");
      setDjDetectionDiagnostic(null);
    } finally {
      setIsDjDetectionSaving(false);
    }
  };

  const runDjDetectionDiagnostic = async () => {
    if (!session || session.source !== "blobs") {
      setActionMessage("O diagnóstico com a rádio fica disponível quando o conteúdo global estiver conectado.");
      return;
    }

    const activityId = beginActivity("Diagnóstico da rádio");
    try {
      setDjDetectionDiagnostic(await fetchDjDetectionStatus(session.token, true));
      setActionMessage("Diagnóstico atualizado sem gravar histórico de músicas.");
      await confirmActivity(activityId, ["detection"], "Diagnóstico atualizado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível consultar a rádio agora.";
      setActionMessage(message);
      failActivity(activityId, message);
    }
  };

  const saveVoxConnection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || session.source !== "blobs") {
      setActionMessage("A conexão segura com o Vox exige o conteúdo global conectado.");
      return;
    }

    const activityId = beginActivity("Conexão segura com o Vox");
    setIsVoxSaving(true);
    try {
      const saved = await saveVoxIntegration(session.token, {
        enabled: voxDraft.enabled,
        port: voxDraft.port,
        password: voxPassword || undefined,
      });
      setVoxPassword("");
      queryClient.setQueryData<VoxIntegrationPayload>(
        ["vox-integration-admin", session.token, session.source],
        saved,
      );
      setActionMessage(saved.integration.enabled
        ? "Conexão do Vox salva com senha protegida."
        : "Conexão do Vox salva e mantida desligada.");
      await confirmActivity(activityId, ["vox", "detection"], "Conexão Vox confirmada");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar a conexão Vox.";
      setActionMessage(message);
      failActivity(activityId, message);
    } finally {
      setIsVoxSaving(false);
    }
  };

  const testVoxConnection = async () => {
    if (!session || session.source !== "blobs") return;
    if (!voxIntegrationData?.integration.enabled || !voxIntegrationData.integration.passwordConfigured || !voxIntegrationData.integration.encryptionReady) {
      setActionMessage("Conclua a conexão segura do Vox na aba Funcionamento da API antes de testar.");
      return;
    }
    const activityId = beginActivity("Consulta de conexões no Vox");
    try {
      const result = await fetchVoxIntegrationStatus(session.token, true);
      queryClient.setQueryData<VoxIntegrationPayload>(
        ["vox-integration-admin", session.token, session.source],
        result,
      );
      setActionMessage(result.djStatuses.length
        ? "Status dos DJs conferido diretamente no Vox."
        : "Conexão conferida. Cadastre o login Vox em cada DJ para associar o status.");
      await confirmActivity(activityId, ["vox"], "Status Vox atualizado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível consultar o Vox.";
      setActionMessage(message);
      failActivity(activityId, message);
    }
  };

  const testDjVoxConnection = async (dj: StationDj) => {
    if (!session || session.source !== "blobs") {
      setActionMessage("O teste de conexão exige o conteúdo global conectado.");
      return;
    }
    if (!dj.voxLogin.trim()) {
      setActionMessage("Cadastre o login técnico deste DJ antes de testar a conexão.");
      return;
    }

    const activityId = beginActivity(`Teste de conexão: ${dj.djName}`);
    try {
      const result = await fetchVoxIntegrationStatus(session.token, true, undefined, dj.id);
      const status = result.djStatuses.find((entry) => entry.id === dj.id)?.status || "unknown";
      setDjVoxProbeById((current) => ({ ...current, [dj.id]: status }));
      setDjVoxProbeAtById((current) => ({ ...current, [dj.id]: Date.now() }));
      setActionMessage(
        status === "online"
          ? `${dj.djName} está conectado no Vox.`
          : status === "offline"
            ? `${dj.djName} está desconectado no Vox.`
            : `O Vox ainda não retornou um estado confiável para ${dj.djName}.`,
      );
      await confirmActivity(activityId, ["detection"], "Teste de conexão concluído");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível testar a conexão deste DJ.";
      setActionMessage(message);
      failActivity(activityId, message);
    }
  };

  const controlDjSession = async (
    dj: StationDj,
    action: "confirm" | "acknowledge" | "end" | "extend",
    minutes?: 30 | 60 | 120,
  ) => {
    if (!session || session.source !== "blobs") {
      setActionMessage("O controle da sessão exige o conteúdo global conectado.");
      return;
    }

    const labels = {
      confirm: "Confirmação de entrada do DJ",
      acknowledge: "Continuidade do DJ",
      end: "Encerramento da sessão do DJ",
      extend: `Extensão de ${minutes || 30} minutos`,
    };
    const activityId = beginActivity(labels[action]);
    setIsAudienceSaving(true);
    try {
      const liveState = await controlRemoteDjSession(session.token, dj.id, action, minutes);
      setDjDetectionDiagnostic(liveState);
      queryClient.setQueryData(["dj-detection-admin", session.token, session.source], liveState);
      await queryClient.invalidateQueries({ queryKey: ["live-status-admin", session.token, session.source] });
      setActionMessage(action === "confirm"
        ? `${dj.djName} confirmado no ar. A saída seguirá o retorno confirmado do AutoDJ.`
        : action === "end"
          ? `${dj.djName} saiu do ar pelo painel.`
          : action === "extend"
            ? `Horário previsto estendido em ${minutes || 30} minutos.`
            : "DJ mantido no ar até o retorno confirmado do AutoDJ.");
      await confirmActivity(activityId, ["detection", "audience"], "Sessão atualizada");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível atualizar a sessão do DJ.";
      setActionMessage(message);
      failActivity(activityId, message);
    } finally {
      setIsAudienceSaving(false);
    }
  };

  const toggleDjSkipToday = async (dj: StationDj) => {
    if (!session || session.source !== "blobs") {
      setActionMessage("Pular somente hoje exige o conteúdo global conectado.");
      return;
    }

    const isSkipped = Boolean((liveTest.djSkips || []).some((skip) => skip.djId === dj.id));
    const activityId = beginActivity(isSkipped ? "Reativação da sessão de DJ" : "Pausa da sessão de DJ");
    try {
      const saved = await setRemoteDjSkippedToday(session.token, dj.id, !isSkipped);
      writeLiveStatusTest(saved);
      setLiveTest(saved);
      setAudienceDraft(saved);
      setActionMessage(isSkipped ? "DJ liberado novamente para a sessão de hoje." : "Sessão de hoje ignorada. A próxima agenda permanece intacta.");
      await confirmActivity(activityId, ["audience", "detection"], isSkipped ? "Sessão liberada" : "Sessão pausada hoje");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível alterar a sessão de hoje.";
      setActionMessage(message);
      failActivity(activityId, message);
    }
  };

  const saveManualScheduleForDj = async (dj: StationDj, scheduleDraft: DjScheduleDraft) => {
    const savedBase = normalizeLiveStatusTest(liveTest);
    const savedControl = savedBase.liveDjControl || defaultLiveDjControl();
    const existingSchedule = manualScheduleForDj(savedControl, dj);
    const schedulesWithoutDj = savedControl.schedules.filter((schedule) => !manualScheduleMatchesDj(schedule, dj));
    const now = new Date().toISOString();
    const currentMetrics = resolveLiveStatusTestMetrics(liveTest, Date.now(), { liveDj: savedConfiguredLiveDj });
    const nextSchedules = scheduleDraft.enabled
      ? [
          ...schedulesWithoutDj,
          {
            id: existingSchedule?.id || crypto.randomUUID(),
            stationDjId: dj.id,
            enabled: true,
            djName: dj.djName,
            programName: dj.programName,
            dayIds: scheduleDraft.dayIds,
            startTime: scheduleDraft.startTime,
            endTime: scheduleDraft.endTime,
          },
        ]
      : schedulesWithoutDj;

    const next = normalizeLiveStatusTest({
      ...savedBase,
      liveDjControl: {
        ...savedControl,
        enabled: true,
        schedules: nextSchedules,
        updatedAt: now,
      },
      rampFromListeners: currentMetrics.listeners,
      seed: nextSimulationSeed(),
      appliedAt: now,
      updatedAt: now,
    });

    await persistAudienceConfig(next, scheduleDraft.enabled ? "DJ e agenda salvos." : "DJ salvo sem agenda automática.");
  };

  const removeManualScheduleForDj = async (dj: StationDj) => {
    const savedBase = normalizeLiveStatusTest(liveTest);
    const savedControl = savedBase.liveDjControl || defaultLiveDjControl();
    const hasSchedule = savedControl.schedules.some((schedule) => manualScheduleMatchesDj(schedule, dj));
    const isManualLive = manualControlMatchesDj(savedControl, dj);
    if (!hasSchedule && !isManualLive) return;

    const now = new Date().toISOString();
    const currentMetrics = resolveLiveStatusTestMetrics(liveTest, Date.now(), { liveDj: savedConfiguredLiveDj });
    const next = normalizeLiveStatusTest({
      ...savedBase,
      liveDjControl: {
        ...savedControl,
        active: isManualLive ? false : savedControl.active,
        startedAt: isManualLive ? null : savedControl.startedAt,
        schedules: savedControl.schedules.filter((schedule) => !manualScheduleMatchesDj(schedule, dj)),
        updatedAt: now,
      },
      rampFromListeners: currentMetrics.listeners,
      seed: nextSimulationSeed(),
      appliedAt: now,
      updatedAt: now,
    });

    await persistAudienceConfig(next, "Agenda do DJ removida.");
  };

  const updateAudienceDraft = (patch: Partial<LiveStatusTestPayload>) => {
    setAudienceDraft((current) => normalizeLiveStatusTest({ ...current, ...patch }));
  };

  const updateScheduleProfile = (id: string, patch: Partial<AudienceScheduleProfile>) => {
    setAudienceDraft((current) => normalizeLiveStatusTest({
      ...current,
      scheduleProfiles: (current.scheduleProfiles || []).map((profile) =>
        profile.id === id ? { ...profile, ...patch } : profile,
      ),
    }));
  };

  const updateDjAudienceProfile = (id: string, patch: Partial<AudienceDjProfile>) => {
    setAudienceDraft((current) => normalizeLiveStatusTest({
      ...current,
      djProfiles: (current.djProfiles || []).map((profile) =>
        profile.id === id ? { ...profile, ...patch } : profile,
      ),
    }));
  };

  const removeScheduleProfile = (id: string) => {
    setAudienceDraft((current) => normalizeLiveStatusTest({
      ...current,
      scheduleProfiles: (current.scheduleProfiles || []).filter((profile) => profile.id !== id),
    }));
  };

  const removeDjAudienceProfile = (id: string) => {
    setAudienceDraft((current) => normalizeLiveStatusTest({
      ...current,
      djProfiles: (current.djProfiles || []).filter((profile) => profile.id !== id),
    }));
  };

  const addScheduleProfile = () => {
    setAudienceDraft((current) => normalizeLiveStatusTest({
      ...current,
      scheduleProfiles: [...(current.scheduleProfiles || []), emptyAudienceScheduleProfile()],
    }));
  };

  const addDjAudienceProfile = (dj?: StationDj) => {
    setAudienceDraft((current) => normalizeLiveStatusTest({
      ...current,
      djProfiles: [...(current.djProfiles || []), emptyAudienceDjProfile(dj)],
    }));
  };

  const updateLiveDjControl = (patch: Partial<ManualLiveDjControl>) => {
    setAudienceDraft((current) => {
      const normalized = normalizeLiveStatusTest(current);
      const control = normalized.liveDjControl || defaultLiveDjControl();
      return normalizeLiveStatusTest({
        ...normalized,
        liveDjControl: {
          ...control,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      });
    });
  };

  const updateManualLiveSchedule = (id: string, patch: Partial<ManualLiveDjSchedule>) => {
    setAudienceDraft((current) => {
      const normalized = normalizeLiveStatusTest(current);
      const control = normalized.liveDjControl || defaultLiveDjControl();
      return normalizeLiveStatusTest({
        ...normalized,
        liveDjControl: {
          ...control,
          schedules: control.schedules.map((schedule) =>
            schedule.id === id ? { ...schedule, ...patch } : schedule,
          ),
          updatedAt: new Date().toISOString(),
        },
      });
    });
  };

  const removeManualLiveSchedule = (id: string) => {
    setAudienceDraft((current) => {
      const normalized = normalizeLiveStatusTest(current);
      const control = normalized.liveDjControl || defaultLiveDjControl();
      return normalizeLiveStatusTest({
        ...normalized,
        liveDjControl: {
          ...control,
          schedules: control.schedules.filter((schedule) => schedule.id !== id),
          updatedAt: new Date().toISOString(),
        },
      });
    });
  };

  const addManualLiveSchedule = (dj?: StationDj) => {
    setAudienceDraft((current) => {
      const normalized = normalizeLiveStatusTest(current);
      const control = normalized.liveDjControl || defaultLiveDjControl();
      return normalizeLiveStatusTest({
        ...normalized,
        liveDjControl: {
          ...control,
          enabled: true,
          schedules: [...control.schedules, emptyManualLiveDjSchedule(dj)],
          updatedAt: new Date().toISOString(),
        },
      });
    });
  };

  const fillLiveDjControlFromDj = (dj: StationDj) => {
    updateLiveDjControl({
      enabled: true,
      djName: dj.djName,
      programName: dj.programName,
    });
  };

  const toggleManualLiveDjNow = async (dj?: StationDj) => {
    if (!canManageLiveMetrics) {
      setActionMessage("Conecte o conteúdo global antes de alterar a audiência.");
      return;
    }

    const savedBase = normalizeLiveStatusTest(liveTest);
    const savedControl = savedBase.liveDjControl || defaultLiveDjControl();
    const draftControl = normalizeLiveStatusTest(audienceDraft).liveDjControl || defaultLiveDjControl();
    const fallbackDj = djs.find((dj) => dj.active && dj.djName && dj.programName) || djs.find((dj) => dj.djName && dj.programName);
    const turningOffCurrentDj = dj ? manualControlMatchesDj(savedControl, dj) : draftControl.active;
    const goingActive = !turningOffCurrentDj;
    const now = new Date().toISOString();
    const currentMetrics = resolveLiveStatusTestMetrics(liveTest, Date.now(), { liveDj: savedConfiguredLiveDj });
    const nextDjName = dj?.djName || draftControl.djName || fallbackDj?.djName || "DJ ao vivo";
    const nextProgramName = dj?.programName || draftControl.programName || fallbackDj?.programName || "Programa Ao Vivo";
    const nextControl = normalizeLiveStatusTest({
      liveDjControl: {
        ...savedControl,
        enabled: true,
        active: goingActive,
        stationDjId: goingActive ? dj?.id || fallbackDj?.id || savedControl.stationDjId || null : null,
        djName: goingActive ? nextDjName : savedControl.djName || nextDjName,
        programName: goingActive ? nextProgramName : savedControl.programName || nextProgramName,
        startedAt: goingActive ? now : null,
        updatedAt: now,
      },
    }).liveDjControl || defaultLiveDjControl();

    const next = normalizeLiveStatusTest({
      ...savedBase,
      enabled: true,
      liveDjControl: nextControl,
      rampFromListeners: currentMetrics.listeners,
      seed: nextSimulationSeed(),
      appliedAt: now,
      updatedAt: now,
    });

    await persistAudienceConfig(
      next,
      goingActive
        ? `${nextControl.djName || "DJ ao vivo"} ativado manualmente na barra do site.`
        : "DJ ao vivo manual desligado.",
    );
  };

  const applyAudienceDraft = async (successMessage?: string) => {
    if (!canManageLiveMetrics) {
      setActionMessage("Conecte o conteúdo global antes de alterar a audiência.");
      return;
    }

    const currentMetrics = resolveLiveStatusTestMetrics(liveTest, Date.now(), { liveDj: savedConfiguredLiveDj });
    const normalizedDraft = normalizeLiveStatusTest(audienceDraft);
    const now = new Date().toISOString();
    const listenersMin = normalizedDraft.listenersMin ?? LIVE_TEST_DEFAULT_LISTENERS;
    const listenersMax = normalizedDraft.listenersMax ?? listenersMin;
    const next = normalizeLiveStatusTest({
      ...normalizedDraft,
      ...visitorCounterFields(liveTest),
      state: normalizedDraft.enabled ? "online" : "off",
      listeners: Math.round((listenersMin + listenersMax) / 2),
      rampFromListeners: currentMetrics.listeners,
      seed: nextSimulationSeed(),
      appliedAt: now,
      updatedAt: now,
    });

    await persistAudienceConfig(
      next,
      successMessage || (session?.source === "blobs"
        ? "Audiência aplicada no site publicado."
        : "Audiência aplicada no teste local."),
    );
  };

  const restoreAudienceDraft = () => {
    setAudienceDraft(normalizeLiveStatusTest(liveTest));
    setActionMessage("Rascunho de ouvintes restaurado com os valores salvos.");
  };

  const applyVisitorDraft = async () => {
    if (!canManageLiveMetrics) {
      setActionMessage("Conecte o conteúdo global antes de alterar as visitas.");
      return;
    }

    const currentMetrics = resolveLiveStatusTestMetrics(liveTest, Date.now(), { liveDj: savedConfiguredLiveDj });
    const saved = normalizeLiveStatusTest(liveTest);
    const now = new Date().toISOString();
    const anchor = Math.max(
      currentMetrics.visitors,
      saved.visitorBase ?? 0,
      saved.rampFromVisitors ?? 0,
      visitorDraft.visitorBase,
    );
    const target = visitorDraft.visitorTarget && visitorDraft.visitorTarget > anchor
      ? visitorDraft.visitorTarget
      : null;
    const next = normalizeLiveStatusTest({
      ...saved,
      visitors: anchor,
      visitorBase: anchor,
      visitorTarget: target,
      growthPercent: visitorDraft.visitorGrowthPercent,
      visitorGrowthPercent: visitorDraft.visitorGrowthPercent,
      rampFromVisitors: anchor,
      visitorAppliedAt: now,
      updatedAt: now,
    });

    await persistAudienceConfig(
      next,
      session?.source === "blobs"
        ? "Contador de visitas aplicado no site publicado."
        : "Contador de visitas aplicado no teste local.",
    );
  };

  const restoreVisitorDraft = () => {
    setVisitorDraft(visitorCounterDraftFrom(liveTest));
    setActionMessage("Rascunho de visitas restaurado com os valores salvos.");
  };

  const currentPanelResources: AdminResource[] = activePanel === "dashboard"
    ? ["ads", "programs", "djs", "audience", "detection"]
    : activePanel === "ads"
      ? ["ads"]
      : activePanel === "programs"
        ? ["programs"]
        : activePanel === "djs"
          ? ["djs", "audience"]
          : activePanel === "reports"
            ? ["djs", "audience"]
          : activePanel === "api"
            ? ["djs", "audience", "detection", "vox"]
            : ["audience"];
  const pendingActivityCount = activityLog.filter((item) => item.status === "saving" || item.status === "confirming").length;
  const isPanelRefreshing = isFetching || isFetchingPrograms || isFetchingDjs || isFetchingLiveStatus || isFetchingDjDetection || isFetchingVoxIntegration;

  const refreshCurrentPanel = () => {
    const activityId = beginActivity("Atualização do painel");
    void confirmActivity(activityId, currentPanelResources, "Dados conferidos");
  };

  if (!session) {
    return (
      <main className="ads-admin-page login-screen">
        <aside className="admin-restricted-notice" role="note" aria-label="Área restrita">
          <span>
            <Lock size={16} aria-hidden="true" />
            Área restrita
          </span>
          <strong>Uso exclusivo dos administradores da Web Rádio Conexão Jamaica.</strong>
          <p>O acesso a este painel é monitorado e reservado para operação das campanhas oficiais do site.</p>
        </aside>
        <form className="login-card" onSubmit={login}>
          <a href="/" className="back-link">
            <ArrowLeft size={16} /> Voltar ao site
          </a>
          <span className="admin-icon">
            <Lock size={24} />
          </span>
          <h1>Console de gerenciamento</h1>
          <p>Acesso administrativo para anúncios, programação e operação do site.</p>
          <label>
            Login
            <input
              value={loginForm.login}
              onChange={(event) => setLoginForm({ ...loginForm, login: event.currentTarget.value })}
              autoComplete="username"
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm({ ...loginForm, password: event.currentTarget.value })}
              autoComplete="current-password"
            />
          </label>
          <button className="play-main slim" type="submit">
            Entrar
          </button>
          {loginError ? <small className="form-warning">{loginError}</small> : null}
        </form>
      </main>
    );
  }

  if (!activePanel) {
    return <Navigate to={adminPanelRoutes.dashboard} replace />;
  }

  return (
    <main className="ads-admin-page">
      <header className="admin-top">
        <a href="/" className="back-link">
          <ArrowLeft size={16} /> Voltar ao site
        </a>
        <div>
          <span>Painel restrito</span>
          <h1>Gerenciar site</h1>
        </div>
        <div className="admin-top-actions">
          <span className={isRemote ? "source-pill is-remote" : isLocalMode ? "source-pill is-local" : "source-pill is-offline"}>
            {isRemote ? <Database size={15} /> : isLocalMode ? <HardDrive size={15} /> : <AlertTriangle size={15} />}
            {isRemote ? "Blobs globais" : isLocalMode ? "Modo local" : "Blobs indisponíveis"}
          </span>
          <button className="ghost-button" type="button" onClick={refreshCurrentPanel} disabled={isPanelRefreshing || pendingActivityCount > 0}>
            <RefreshCw className={isPanelRefreshing ? "is-spinning" : undefined} size={16} /> {isPanelRefreshing ? "Atualizando" : "Atualizar"}
          </button>
          <button className="ghost-button" type="button" onClick={logout}>
            <LogOut size={16} /> Sair
          </button>
        </div>
      </header>

      {environmentNotice ? (
        <section className={isDisconnected ? "admin-notice is-danger" : "admin-notice"}>
          <AlertTriangle size={18} />
          <span>{environmentNotice}</span>
        </section>
      ) : null}

      {actionMessage ? (
        <section className="admin-notice is-soft">
          <CheckCircle2 size={18} />
          <span>{actionMessage}</span>
        </section>
      ) : null}

      <nav className="admin-tabs" aria-label="Áreas de gerenciamento">
        <NavLink className={activePanel === "dashboard" ? "is-active" : ""} to={adminPanelRoutes.dashboard}>
          <BarChart3 size={16} /> Dashboard
        </NavLink>
        <NavLink className={activePanel === "ads" ? "is-active" : ""} to={adminPanelRoutes.ads}>
          <Megaphone size={16} /> Gerenciar anúncios
        </NavLink>
        <NavLink className={activePanel === "programs" ? "is-active" : ""} to={adminPanelRoutes.programs}>
          <CalendarDays size={16} /> Gerenciar programação
        </NavLink>
        <NavLink className={activePanel === "djs" ? "is-active" : ""} to={adminPanelRoutes.djs}>
          <Mic2 size={16} /> DJs ao vivo
        </NavLink>
        <NavLink className={activePanel === "api" ? "is-active" : ""} to={adminPanelRoutes.api}>
          <Activity size={16} /> Funcionamento da API
        </NavLink>
        <NavLink className={activePanel === "visits" ? "is-active" : ""} to={adminPanelRoutes.visits}>
          <UsersRound size={16} /> Audiência
        </NavLink>
        <NavLink className={activePanel === "reports" ? "is-active" : ""} to={adminPanelRoutes.reports}>
          <FileText size={16} /> Relatórios
        </NavLink>
      </nav>

      <aside className={isActivityLogOpen || pendingActivityCount ? "admin-activity-dock is-open" : "admin-activity-dock"} aria-live="polite">
        <button className="admin-activity-toggle" type="button" onClick={() => setIsActivityLogOpen((current) => !current)} aria-expanded={isActivityLogOpen}>
          <span className={pendingActivityCount ? "admin-activity-icon is-busy" : "admin-activity-icon"}>
            <Activity size={17} />
          </span>
          <span className="admin-activity-copy">
            <strong>{pendingActivityCount ? "Atualizações em andamento" : "Painel sincronizado"}</strong>
            <small>{pendingActivityCount ? `${pendingActivityCount} ${pendingActivityCount === 1 ? "alteração" : "alterações"} em conferência` : "Alterações recentes ficam registradas aqui"}</small>
          </span>
          <span className="admin-activity-count">{pendingActivityCount || activityLog.length}</span>
        </button>

        {isActivityLogOpen || pendingActivityCount ? (
          <ol className="admin-activity-list">
            {activityLog.length ? activityLog.map((item) => (
              <li key={item.id} className={`is-${item.status}`}>
                {item.status === "complete" ? <CheckCircle2 size={16} /> : item.status === "error" ? <AlertTriangle size={16} /> : <RefreshCw className="is-spinning" size={16} />}
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <time dateTime={new Date(item.createdAt).toISOString()}>{formatActivityTime(item.createdAt)}</time>
              </li>
            )) : (
              <li className="is-empty">
                <CheckCircle2 size={16} />
                <span><strong>Nenhuma alteração nesta sessão</strong><small>O painel está pronto para operar.</small></span>
              </li>
            )}
          </ol>
        ) : null}
      </aside>

      {activePanel === "dashboard" ? (
        <>
          <section className="admin-metrics">
            <article>
              <strong>{ads.length}</strong>
              <span>anúncios cadastrados</span>
            </article>
            <article>
              <strong>{activeCount}</strong>
              <span>ativos</span>
            </article>
            <article>
              <strong>{linkedAdsCount}</strong>
              <span>flyers com link</span>
            </article>
            <article>
              <strong>{totalClicks}</strong>
              <span>toques em links</span>
            </article>
            <article>
              <strong>{programs.length}</strong>
              <span>programas cadastrados</span>
            </article>
            <article>
              <strong>{activeProgramCount}</strong>
              <span>programas ativos</span>
            </article>
            <article>
              <strong>{djs.length}</strong>
              <span>DJs cadastrados</span>
            </article>
            <article>
              <strong>{activeDjCount}</strong>
              <span>DJs ativos</span>
            </article>
          </section>

          <section className="admin-dashboard-panel">
            <article>
              <span><CalendarDays size={15} /> No ar agora</span>
              <strong>{currentProgram?.program || "Programação musical"}</strong>
              <p>{currentProgram ? `${currentProgram.startTime} - ${currentProgram.endTime} · ${currentProgram.host}` : "A grade padrão está pronta para assumir quando não houver dados externos."}</p>
            </article>
            <article>
              <span><Megaphone size={15} /> Regra de anúncios</span>
              <strong>{settings.commercialRuns} comerciais / {settings.programRuns} programa</strong>
              <p>O site intercala anúncios comerciais e chamadas de programação sem empilhar vários banners.</p>
            </article>
            <article className="live-test-panel live-metrics-panel">
              <span><UsersRound size={15} /> Audiência</span>
              <strong>
                {isAudienceActive
                  ? `${formatAdminNumber(resolvedLiveMetrics.listeners)} online`
                  : "Motor pausado"}
              </strong>
              <p>{isAudienceActive ? `${formatAdminNumber(resolvedLiveMetrics.visitors)} visitas no topo agora.` : "O site está usando apenas os números reais do provedor."}</p>
              <div className="live-test-actions">
                <NavLink className="ghost-button" to={adminPanelRoutes.visits}>
                  <SlidersHorizontal size={16} /> Central de audiência
                </NavLink>
              </div>
            </article>
          </section>
        </>
      ) : null}

      {activePanel === "api" ? (
        <section className="audience-admin-page">
          <section className="audience-hero-panel">
            <div>
              <span><Activity size={15} /> Funcionamento da API</span>
              <h2>Detecção assistida de DJs</h2>
              <p>A agenda só define quando um DJ pode ser reconhecido. O status ao vivo exige confirmações de metadados ausentes.</p>
            </div>
            <div className={djDetectionDraft.enabled ? "audience-live-badge is-active" : "audience-live-badge"}>
              <span>{djDetectionDraft.enabled ? "Detecção ligada" : "Detecção desligada"}</span>
              <strong>{djDetectionDraft.pollSeconds}s</strong>
              <small>intervalo dentro da agenda</small>
            </div>
          </section>

          <section className="audience-admin-grid">
            <form className="audience-control-panel" onSubmit={(event) => { event.preventDefault(); void applyDjDetectionDraft(); }}>
              <div className="editor-head">
                <div>
                  <span><Settings2 size={15} /> Regras de reconhecimento</span>
                  <h2>Aplicar comportamento</h2>
                </div>
              </div>

              <label className="check-line audience-switch">
                <input
                  type="checkbox"
                  checked={djDetectionDraft.enabled}
                  onChange={(event) => setDjDetectionDraft({ ...djDetectionDraft, enabled: event.currentTarget.checked })}
                  disabled={!canManageLiveMetrics}
                />
                Permitir detecção automática nas agendas de DJ
              </label>

              <div className="audience-field-grid compact">
                <label>
                  Consulta de detecção
                  <select
                    value={djDetectionDraft.pollSeconds}
                    onChange={(event) => setDjDetectionDraft({ ...djDetectionDraft, pollSeconds: Number(event.currentTarget.value) as 15 | 30 | 60 })}
                    disabled={!canManageLiveMetrics}
                  >
                    <option value={15}>15 segundos</option>
                    <option value={30}>30 segundos</option>
                    <option value={60}>60 segundos</option>
                  </select>
                </label>
                <label>
                  Antecipação da agenda
                  <select
                    value={djDetectionDraft.earlyWindowMinutes}
                    onChange={(event) => setDjDetectionDraft({ ...djDetectionDraft, earlyWindowMinutes: Number(event.currentTarget.value) as 0 | 15 | 30 | 45 | 60 })}
                    disabled={!canManageLiveMetrics}
                  >
                    <option value={0}>Na hora da entrada</option>
                    <option value={15}>15 minutos antes</option>
                    <option value={30}>30 minutos antes</option>
                    <option value={45}>45 minutos antes</option>
                    <option value={60}>60 minutos antes</option>
                  </select>
                </label>
                <label>
                  Atualização do painel
                  <select
                    value={djDetectionDraft.panelRefreshSeconds}
                    onChange={(event) => setDjDetectionDraft({ ...djDetectionDraft, panelRefreshSeconds: Number(event.currentTarget.value) as 15 | 30 | 60 })}
                    disabled={!canManageLiveMetrics}
                  >
                    <option value={15}>15 segundos</option>
                    <option value={30}>30 segundos</option>
                    <option value={60}>60 segundos</option>
                  </select>
                </label>
                <label>
                  Confirmações para entrada
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={djDetectionDraft.enterConfirmations}
                    onChange={(event) => setDjDetectionDraft({ ...djDetectionDraft, enterConfirmations: Math.max(1, Math.min(5, Number(event.currentTarget.value) || 1)) })}
                    disabled={!canManageLiveMetrics}
                  />
                </label>
                <label>
                  Confirmações para saída
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={djDetectionDraft.exitConfirmations}
                    onChange={(event) => setDjDetectionDraft({ ...djDetectionDraft, exitConfirmations: Math.max(1, Math.min(5, Number(event.currentTarget.value) || 1)) })}
                    disabled={!canManageLiveMetrics}
                  />
                </label>
              </div>

              <div className="audience-rule-list">
                <p><CheckCircle2 size={15} /> A antecipação abre apenas a janela em que o login do DJ pode ser confirmado pelo Vox.</p>
                <p><RefreshCw size={15} /> A atualização do painel relê somente o estado salvo; ela não consulta o Vox por conta própria.</p>
                <p><Radio size={15} /> A consulta de detecção é usada somente dentro da janela, durante uma transmissão ou em teste manual.</p>
                <p><AlertTriangle size={15} /> Falhas e tempos esgotados nunca ligam ou desligam um DJ sozinhos.</p>
              </div>

              <div className="audience-control-actions">
                <button className="play-main slim" type="submit" disabled={!canManageLiveMetrics || isDjDetectionSaving || isAudienceSaving}>
                  <Save size={16} /> {isDjDetectionSaving ? "Aplicando..." : "Aplicar"}
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setDjDetectionDraft(normalizeDjDetectionConfig(liveTest.djDetectionConfig))}
                  disabled={!canManageLiveMetrics}
                >
                  <RefreshCw size={16} /> Descartar rascunho
                </button>
              </div>
            </form>

            <aside className="audience-preview-panel">
              <div className="editor-head">
                <div>
                  <span><Radio size={15} /> Diagnóstico sob demanda</span>
                  <h2>{djDetectionStatus?.isOverrun ? "Horário excedido" : djDetectionStatus?.liveDj?.isLive ? "DJ ao vivo" : "Monitorando agenda"}</h2>
                </div>
                <button className="ghost-button" type="button" onClick={() => { void runDjDetectionDiagnostic(); }} disabled={session?.source !== "blobs" || isFetchingDjDetection}>
                  <RefreshCw size={16} /> Testar agora
                </button>
              </div>
              <div className="audience-rule-list">
                <p><Mic2 size={15} /> Elegível: {djDetectionStatus?.eligibleDj ? `${djDetectionStatus.eligibleDj.djName} · ${djDetectionStatus.eligibleDj.programName}` : "nenhum DJ neste horário"}</p>
                <p><Activity size={15} /> Estado: {djDetectionStatus?.state.mode || "aguardando"} · confiança {djDetectionStatus?.state.confidence || 0}%</p>
                <p><CheckCircle2 size={15} /> Leitura: {djDetectionStatus?.state.classification || "sem leitura"} · {djDetectionStatus?.state.activation || "automática"}</p>
                <p><Database size={15} /> Origem: {djDetectionStatus?.diagnostic?.source || djDetectionStatus?.state.source || "nenhuma"} · {djDetectionStatus?.diagnostic?.latencyMs ?? djDetectionStatus?.state.latencyMs ?? "-"} ms{djDetectionStatus?.diagnostic?.cacheHit ? " · cache compartilhado" : ""}</p>
                {(djDetectionStatus?.diagnostic?.signals || djDetectionStatus?.state.signals || []).map((signal) => (
                  <p key={signal}><CheckCircle2 size={15} /> {signal}</p>
                ))}
                {djDetectionStatus?.diagnostic?.lastError || djDetectionStatus?.state.lastError ? (
                  <p><AlertTriangle size={15} /> {djDetectionStatus?.diagnostic?.lastError || djDetectionStatus?.state.lastError}</p>
                ) : null}
              </div>
              <small>O teste registra somente o estado necessário para confirmar entrada ou saída. Título, artista, capa e histórico não são armazenados aqui.</small>
            </aside>
          </section>

          <section className="audience-admin-grid">
            <form className="audience-control-panel" onSubmit={saveVoxConnection}>
              <div className="editor-head">
                <div>
                  <span><Lock size={15} /> Conexão privada</span>
                  <h2>Status confirmado pelo Vox</h2>
                </div>
              </div>
              <label className="check-line audience-switch">
                <input
                  type="checkbox"
                  checked={voxDraft.enabled}
                  onChange={(event) => setVoxDraft({ ...voxDraft, enabled: event.currentTarget.checked })}
                  disabled={session?.source !== "blobs" || isVoxSaving}
                />
                Usar a conexão do Vox para confirmar DJs agendados
              </label>
              <div className="audience-field-grid compact">
                <label>
                  Porta principal da rádio
                  <input
                    inputMode="numeric"
                    value={voxDraft.port}
                    onChange={(event) => setVoxDraft({ ...voxDraft, port: event.currentTarget.value.replace(/\D/g, "").slice(0, 5) })}
                    placeholder="7586"
                    disabled={session?.source !== "blobs" || isVoxSaving}
                  />
                </label>
                <label>
                  Senha do painel Vox
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={voxPassword}
                    onChange={(event) => setVoxPassword(event.currentTarget.value)}
                    placeholder={voxIntegrationData?.integration.passwordConfigured ? "Senha protegida já salva" : "Digite para proteger"}
                    disabled={session?.source !== "blobs" || isVoxSaving}
                  />
                </label>
              </div>
              <div className="audience-rule-list">
                <p><Lock size={15} /> A senha é cifrada no servidor e nunca volta para este painel.</p>
                <p><Database size={15} /> A sessão do Vox é reutilizada por até 10 minutos; a leitura de conexões é compartilhada por 15 segundos e não expõe logins ao público.</p>
                {!voxIntegrationData?.integration.encryptionReady ? (
                  <p><AlertTriangle size={15} /> Falta configurar a chave privada de criptografia deste ambiente.</p>
                ) : null}
              </div>
              <div className="audience-control-actions">
                <button className="play-main slim" type="submit" disabled={session?.source !== "blobs" || isVoxSaving}>
                  <Save size={16} /> {isVoxSaving ? "Protegendo..." : "Salvar conexão"}
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => { void testVoxConnection(); }}
                  disabled={session?.source !== "blobs" || isVoxSaving || isFetchingVoxIntegration || !voxIntegrationData?.integration.enabled}
                >
                  <RefreshCw size={16} /> Testar status
                </button>
              </div>
            </form>

            <aside className="audience-preview-panel">
              <div className="editor-head">
                <div>
                  <span><Mic2 size={15} /> Associação por DJ</span>
                  <h2>Leitura segura de conexão</h2>
                </div>
              </div>
              <div className="audience-rule-list">
                <p><CheckCircle2 size={15} /> Cadastre o login técnico no cartão de cada DJ, por exemplo `conexaojamaica`.</p>
                <p><CalendarDays size={15} /> O Vox reconhece o DJ {formatDjEarlyWindow(djDetectionDraft.earlyWindowMinutes)} e mantém quem continua conectado após o horário previsto.</p>
                <p><Activity size={15} /> Um próximo DJ conectado assume na hora; falha no Vox não derruba um DJ sozinho.</p>
                {(voxIntegrationData?.djStatuses || []).map((entry) => {
                  const dj = djs.find((item) => item.id === entry.id);
                  if (!dj) return null;
                  return <p key={entry.id}><Radio size={15} /> {dj.djName}: {entry.status === "online" ? "conectado" : entry.status === "offline" ? "desconectado" : "sem leitura"}</p>;
                })}
              </div>
              <small>O login usado para a conferência é técnico e fica restrito ao conteúdo privado. O site público recebe apenas DJ, programa, logo e status ao vivo.</small>
            </aside>
          </section>
        </section>
      ) : null}

      {activePanel === "reports" ? (
        <AudienceReportPanel
          liveTest={liveTest}
          liveDj={savedConfiguredLiveDj}
          source={liveStatusData?.source || "fallback"}
        />
      ) : null}

      {activePanel === "visits" ? (
        <section className="audience-admin-page">
          <section className="audience-hero-panel">
            <div>
              <span>
                <UsersRound size={15} /> Central de audiência
              </span>
              <h2>{isLiveMetricsRemote ? "Gerenciamento global de público" : "Gerenciamento local de público"}</h2>
              <p>{liveMetricsScopeText}</p>
            </div>
            <div className={audienceDraft.enabled !== false ? "audience-live-badge is-active" : "audience-live-badge"}>
              <span>{audienceDraft.enabled !== false ? "Motor ativo" : "Motor pausado"}</span>
              <strong>{formatAdminNumber(resolvedDraftMetrics.listeners)}</strong>
              <small>prévia agora</small>
            </div>
          </section>

          <section className="audience-kpi-grid">
            <article>
              <span><Activity size={15} /> Online publicado</span>
              <strong>{formatAdminNumber(resolvedLiveMetrics.listeners)}</strong>
              <small>valor que o site está entregando</small>
            </article>
            <article>
              <span><UsersRound size={15} /> Visitas</span>
              <strong>{formatAdminNumber(resolvedLiveMetrics.visitors)}</strong>
              <small>contador publicado, sem retorno</small>
            </article>
            <article>
              <span><SlidersHorizontal size={15} /> Faixa ativa</span>
              <strong>{formatAdminNumber(activeAudienceProfile.listenersMin)}-{formatAdminNumber(activeAudienceProfile.listenersMax)}</strong>
              <small>{activeAudienceProfile.label}</small>
            </article>
            <article>
              <span><TrendingUp size={15} /> Ajuste gradual</span>
              <strong>{audienceDraft.transitionPercent ?? LIVE_TEST_DEFAULT_TRANSITION}%</strong>
              <small>velocidade de aproximação</small>
            </article>
          </section>

          <section className="audience-admin-grid">
            <form className="audience-control-panel" onSubmit={(event) => event.preventDefault()}>
              <div className="editor-head">
                <div>
                  <span>
                    <SlidersHorizontal size={15} /> Motor de audiência
                  </span>
                  <h2>Ouvintes online</h2>
                </div>
              </div>

              <label className="check-line audience-switch">
                <input
                  type="checkbox"
                  checked={audienceDraft.enabled !== false}
                  onChange={(event) => updateAudienceDraft({ enabled: event.currentTarget.checked })}
                  disabled={!canManageLiveMetrics}
                />
                Motor ativo no site
              </label>

              <div className="audience-field-grid">
                <label>
                  Entrada mínima
                  <input
                    type="number"
                    min="0"
                    max={LIVE_TEST_MAX_LISTENERS}
                    value={audienceDraft.listenersMin ?? LIVE_TEST_DEFAULT_LISTENERS}
                    onChange={(event) => updateAudienceDraft({
                      listenersMin: parseLiveMetric(event.currentTarget.value, audienceDraft.listenersMin ?? LIVE_TEST_DEFAULT_LISTENERS, LIVE_TEST_MAX_LISTENERS),
                    })}
                    disabled={!canManageLiveMetrics}
                  />
                </label>
                <label>
                  Limite natural
                  <input
                    type="number"
                    min="0"
                    max={LIVE_TEST_MAX_LISTENERS}
                    value={audienceDraft.listenersMax ?? audienceDraft.listenersMin ?? LIVE_TEST_DEFAULT_LISTENERS}
                    onChange={(event) => updateAudienceDraft({
                      listenersMax: parseLiveMetric(event.currentTarget.value, audienceDraft.listenersMax ?? LIVE_TEST_DEFAULT_LISTENERS, LIVE_TEST_MAX_LISTENERS),
                    })}
                    disabled={!canManageLiveMetrics}
                  />
                </label>
              </div>

              <div className="audience-range-stack">
                <label>
                  <span>Força das entradas <strong>{audienceDraft.movementPercent ?? LIVE_TEST_DEFAULT_MOVEMENT}%</strong></span>
                  <input
                    type="range"
                    min="0"
                    max={LIVE_TEST_MAX_PERCENT}
                    value={audienceDraft.movementPercent ?? LIVE_TEST_DEFAULT_MOVEMENT}
                    onChange={(event) => updateAudienceDraft({ movementPercent: parseLiveMetric(event.currentTarget.value, LIVE_TEST_DEFAULT_MOVEMENT, LIVE_TEST_MAX_PERCENT) })}
                    disabled={!canManageLiveMetrics}
                  />
                </label>
                <label>
                  <span>Força das saídas <strong>{audienceDraft.exitPercent ?? LIVE_TEST_DEFAULT_EXIT}%</strong></span>
                  <input
                    type="range"
                    min="0"
                    max={LIVE_TEST_MAX_PERCENT}
                    value={audienceDraft.exitPercent ?? LIVE_TEST_DEFAULT_EXIT}
                    onChange={(event) => updateAudienceDraft({ exitPercent: parseLiveMetric(event.currentTarget.value, LIVE_TEST_DEFAULT_EXIT, LIVE_TEST_MAX_PERCENT) })}
                    disabled={!canManageLiveMetrics}
                  />
                </label>
                <label>
                  <span>Velocidade de ajuste <strong>{audienceDraft.transitionPercent ?? LIVE_TEST_DEFAULT_TRANSITION}%</strong></span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={audienceDraft.transitionPercent ?? LIVE_TEST_DEFAULT_TRANSITION}
                    onChange={(event) => updateAudienceDraft({ transitionPercent: parseLiveMetric(event.currentTarget.value, LIVE_TEST_DEFAULT_TRANSITION, 100) })}
                    disabled={!canManageLiveMetrics}
                  />
                </label>
                <label>
                  <span>Ganho com DJ ao vivo <strong>{audienceDraft.liveBoostPercent ?? LIVE_TEST_DEFAULT_LIVE_BOOST}%</strong></span>
                  <input
                    type="range"
                    min="0"
                    max={LIVE_TEST_MAX_PERCENT}
                    value={audienceDraft.liveBoostPercent ?? LIVE_TEST_DEFAULT_LIVE_BOOST}
                    onChange={(event) => updateAudienceDraft({ liveBoostPercent: parseLiveMetric(event.currentTarget.value, LIVE_TEST_DEFAULT_LIVE_BOOST, LIVE_TEST_MAX_PERCENT) })}
                    disabled={!canManageLiveMetrics}
                  />
                </label>
              </div>

              <div className="audience-control-actions">
                <button className="play-main slim" type="button" onClick={() => void applyAudienceDraft()} disabled={!canManageLiveMetrics || isAudienceSaving}>
                  <Save size={16} /> {isAudienceSaving ? "Aplicando..." : isLiveMetricsRemote ? "Aplicar ouvintes" : "Aplicar ouvintes local"}
                </button>
                <button className="ghost-button" type="button" onClick={restoreAudienceDraft} disabled={!canManageLiveMetrics || !isAudienceDraftDirty}>
                  <RefreshCw size={16} /> Descartar rascunho
                </button>
              </div>
            </form>

            <aside className="audience-preview-panel">
              <div className="editor-head">
                <div>
                  <span>
                    <BarChart3 size={15} /> Prévia do topo
                  </span>
                  <h2>Resultado no site</h2>
                </div>
              </div>
              <div className="audience-top-preview">
                <span className={audienceDraft.enabled !== false ? "header-status is-online" : "header-status is-offline"}>
                  <strong>{audienceDraft.enabled !== false ? "PÚBLICO" : "REAIS"}</strong>
                </span>
                <div>
                  <small>Online</small>
                  <strong>{formatAdminNumber(resolvedDraftMetrics.listeners)}</strong>
                </div>
                <div>
                  <small>Visitas</small>
                  <strong>{formatAdminNumber(resolvedDraftMetrics.visitors)}</strong>
                </div>
              </div>
              <div className="audience-wave-preview" aria-hidden="true">
                {visitGrowthBars.map((height, index) => (
                  <span key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="audience-rule-list">
                <p><Activity size={15} /> O público se move dentro da faixa definida, sem passar do limite natural.</p>
                <p><TrendingUp size={15} /> Ao aplicar, os números caminham aos poucos até o novo comportamento.</p>
                <p><Mic2 size={15} /> Quando um DJ for detectado, o perfil dele tem prioridade sobre o global.</p>
              </div>
            </aside>
          </section>

          <section className="audience-admin-grid visit-counter-grid">
            <form className="audience-control-panel" onSubmit={(event) => event.preventDefault()}>
              <div className="editor-head">
                <div>
                  <span><TrendingUp size={15} /> Contador independente</span>
                  <h2>Visitas</h2>
                </div>
              </div>

              <div className="audience-field-grid">
                <label>
                  Valor para aumentar
                  <input
                    type="number"
                    min="0"
                    max={LIVE_TEST_MAX_VISITORS}
                    value={visitorDraft.visitorBase}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setVisitorDraft((current) => ({
                        ...current,
                        visitorBase: parseLiveMetric(value, current.visitorBase, LIVE_TEST_MAX_VISITORS),
                      }));
                    }}
                    disabled={!canManageLiveMetrics}
                  />
                </label>
                <label>
                  Meta inicial
                  <input
                    type="number"
                    min={Math.max(resolvedLiveMetrics.visitors, visitorDraft.visitorBase)}
                    max={LIVE_TEST_MAX_VISITORS}
                    value={visitorDraft.visitorTarget ?? ""}
                    placeholder="Opcional"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setVisitorDraft((current) => ({
                        ...current,
                        visitorTarget: parseOptionalMetric(
                          value,
                          Math.max(resolvedLiveMetrics.visitors, current.visitorBase),
                          LIVE_TEST_MAX_VISITORS,
                        ),
                      }));
                    }}
                    disabled={!canManageLiveMetrics}
                  />
                </label>
              </div>

              <div className="audience-range-stack">
                <label>
                  <span>Ritmo de crescimento <strong>{visitorDraft.visitorGrowthPercent}%</strong></span>
                  <input
                    type="range"
                    min="1"
                    max={LIVE_TEST_MAX_GROWTH_PERCENT}
                    value={visitorDraft.visitorGrowthPercent}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setVisitorDraft((current) => ({
                        ...current,
                        visitorGrowthPercent: Math.max(1, parseLiveMetric(value, LIVE_TEST_DEFAULT_GROWTH, LIVE_TEST_MAX_GROWTH_PERCENT)),
                      }));
                    }}
                    disabled={!canManageLiveMetrics}
                  />
                </label>
              </div>

              <div className="audience-rule-list">
                <p><TrendingUp size={15} /> O contador cresce continuamente e nunca desce por oscilação, DJ ou mudança de horário.</p>
                <p><CheckCircle2 size={15} /> Um valor menor que o número publicado é ignorado para preservar a sequência.</p>
                <p><Clock3 size={15} /> A meta acelera a chegada até ela; depois, o crescimento continua no ritmo escolhido.</p>
              </div>

              <div className="audience-control-actions">
                <button className="play-main slim" type="button" onClick={applyVisitorDraft} disabled={!canManageLiveMetrics || isAudienceSaving}>
                  <Save size={16} /> {isAudienceSaving ? "Aplicando..." : isLiveMetricsRemote ? "Aplicar visitas" : "Aplicar visitas local"}
                </button>
                <button className="ghost-button" type="button" onClick={restoreVisitorDraft} disabled={!canManageLiveMetrics || !isVisitorDraftDirty}>
                  <RefreshCw size={16} /> Descartar rascunho
                </button>
              </div>
            </form>

            <aside className="audience-preview-panel visit-counter-preview">
              <div className="editor-head">
                <div>
                  <span><Eye size={15} /> Contador publicado</span>
                  <h2>{formatAdminNumber(resolvedDraftMetrics.visitors)}</h2>
                </div>
              </div>
              <div className="audience-top-preview">
                <span className="header-status is-online"><strong>CRESCENDO</strong></span>
                <div>
                  <small>Publicadas agora</small>
                  <strong>{formatAdminNumber(resolvedLiveMetrics.visitors)}</strong>
                </div>
                <div>
                  <small>Meta</small>
                  <strong>{visitorDraft.visitorTarget ? formatAdminNumber(visitorDraft.visitorTarget) : "Contínua"}</strong>
                </div>
              </div>
              <div className="audience-wave-preview visit-counter-bars" aria-hidden="true">
                {visitGrowthBars.map((height, index) => (
                  <span key={index} style={{ height: `${Math.max(24, height)}%` }} />
                ))}
              </div>
              <small>A alteração só passa a valer quando você aplicar. O contador de visitas não é compartilhado com as regras de online.</small>
            </aside>
          </section>

          {false ? (
          <section className="audience-stack-panel live-dj-control-panel">
            <div className="editor-head">
              <div>
                <span><Radio size={15} /> DJ ao vivo manual</span>
                <h2>Status na barra superior</h2>
              </div>
              <button
                className={liveDjControl.active ? "live-dj-toggle-button is-live" : "live-dj-toggle-button"}
                type="button"
                onClick={() => {
                  void toggleManualLiveDjNow();
                }}
                disabled={!canManageLiveMetrics || isAudienceSaving}
              >
                <Power size={16} /> {liveDjControl.active ? "Desligar ao vivo" : "Ativar agora"}
              </button>
            </div>

            <div className="live-dj-control-grid">
              <article className={draftManualLiveDj ? "live-dj-status-card is-live" : "live-dj-status-card"}>
                <span>Status previsto</span>
                <strong>{draftManualLiveDj ? "AO VIVO" : "Aguardando"}</strong>
                <p>
                  {draftManualLiveDj
                    ? `${draftManualLiveDj?.programName || "Programa Ao Vivo"} · ${draftManualLiveDj?.djName || "DJ ao vivo"}`
                    : "Sem acionamento manual ou agenda ativa neste momento."}
                </p>
              </article>

              <article className="audience-profile-card live-dj-form-card">
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={liveDjControl.enabled}
                    onChange={(event) => updateLiveDjControl({ enabled: event.currentTarget.checked })}
                    disabled={!canManageLiveMetrics}
                  />
                  Controle habilitado
                </label>
                <div className="audience-field-grid compact">
                  <label>
                    Nome do DJ
                    <input
                      value={liveDjControl.djName}
                      onChange={(event) => updateLiveDjControl({ djName: event.currentTarget.value })}
                      placeholder="Ex.: DJ Rogerio"
                      disabled={!canManageLiveMetrics}
                    />
                  </label>
                  <label>
                    Programa no ar
                    <input
                      value={liveDjControl.programName}
                      onChange={(event) => updateLiveDjControl({ programName: event.currentTarget.value })}
                      placeholder="Ex.: Reggae ao vivo"
                      disabled={!canManageLiveMetrics}
                    />
                  </label>
                </div>
                {djs.length ? (
                  <div className="audience-chip-row">
                    {djs.slice(0, 8).map((dj) => (
                      <button key={dj.id} className="ghost-button" type="button" onClick={() => fillLiveDjControlFromDj(dj)} disabled={!canManageLiveMetrics}>
                        <Mic2 size={14} /> {dj.djName || "DJ cadastrado"}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            </div>

            <div className="editor-head live-dj-schedule-head">
              <div>
                <span><CalendarDays size={15} /> Agenda de DJ ao vivo</span>
                <h2>Acionamento por horário</h2>
              </div>
              <button className="ghost-button" type="button" onClick={() => addManualLiveSchedule()} disabled={!canManageLiveMetrics}>
                <Plus size={16} /> Nova agenda
              </button>
            </div>

            {djs.length ? (
              <div className="audience-chip-row">
                {djs.slice(0, 8).map((dj) => (
                  <button key={dj.id} className="ghost-button" type="button" onClick={() => addManualLiveSchedule(dj)} disabled={!canManageLiveMetrics}>
                    <Plus size={14} /> Agenda {dj.djName || "DJ"}
                  </button>
                ))}
              </div>
            ) : null}

            {liveDjControl.schedules.length ? (
              <div className="audience-profile-grid">
                {liveDjControl.schedules.map((schedule) => (
                  <article key={schedule.id} className="audience-profile-card">
                    <div className="profile-card-head">
                      <label className="check-line">
                        <input
                          type="checkbox"
                          checked={schedule.enabled}
                          onChange={(event) => updateManualLiveSchedule(schedule.id, { enabled: event.currentTarget.checked })}
                          disabled={!canManageLiveMetrics}
                        />
                        Ativo
                      </label>
                      <button type="button" onClick={() => removeManualLiveSchedule(schedule.id)} disabled={!canManageLiveMetrics} aria-label="Remover agenda de DJ">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="audience-field-grid compact">
                      <label>
                        Nome do DJ
                        <input value={schedule.djName} onChange={(event) => updateManualLiveSchedule(schedule.id, { djName: event.currentTarget.value })} disabled={!canManageLiveMetrics} />
                      </label>
                      <label>
                        Programa
                        <input value={schedule.programName} onChange={(event) => updateManualLiveSchedule(schedule.id, { programName: event.currentTarget.value })} disabled={!canManageLiveMetrics} />
                      </label>
                      <label>
                        Início
                        <input type="time" value={schedule.startTime} onChange={(event) => updateManualLiveSchedule(schedule.id, { startTime: event.currentTarget.value })} disabled={!canManageLiveMetrics} />
                      </label>
                      <label>
                        Fim
                        <input type="time" value={schedule.endTime} onChange={(event) => updateManualLiveSchedule(schedule.id, { endTime: event.currentTarget.value })} disabled={!canManageLiveMetrics} />
                      </label>
                    </div>
                    <div className="audience-day-row">
                      {AUDIENCE_DAY_IDS.map((dayId) => {
                        const selected = schedule.dayIds.includes(dayId);
                        return (
                          <button
                            key={dayId}
                            type="button"
                            className={selected ? "is-active" : ""}
                            onClick={() => updateManualLiveSchedule(schedule.id, {
                              dayIds: toggleAudienceDay(schedule.dayIds, dayId),
                            })}
                            disabled={!canManageLiveMetrics}
                          >
                            {audienceDayLabel(dayId)}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-admin">
                <strong>Nenhuma agenda de DJ</strong>
                <span>Sem agenda, o status ao vivo só entra quando você ligar manualmente.</span>
              </div>
            )}

            <div className="audience-control-actions">
              <button className="play-main slim" type="button" onClick={() => void applyAudienceDraft()} disabled={!canManageLiveMetrics || isAudienceSaving}>
                <Save size={16} /> Aplicar agenda e regras
              </button>
              <button className="ghost-button" type="button" onClick={restoreAudienceDraft} disabled={!canManageLiveMetrics || !isAudienceDraftDirty}>
                <RefreshCw size={16} /> Descartar rascunho
              </button>
            </div>
          </section>
          ) : null}

          <section className="audience-stack-panel">
            <div className="editor-head">
              <div>
                <span><CalendarDays size={15} /> Regras por horário</span>
                <h2>Horários com comportamento próprio</h2>
              </div>
              <button className="ghost-button" type="button" onClick={addScheduleProfile} disabled={!canManageLiveMetrics}>
                <Plus size={16} /> Novo horário
              </button>
            </div>
            {(audienceDraft.scheduleProfiles || []).length ? (
              <div className="audience-profile-grid">
                {(audienceDraft.scheduleProfiles || []).map((profile) => (
                  <article key={profile.id} className="audience-profile-card">
                    <div className="profile-card-head">
                      <label className="check-line">
                        <input
                          type="checkbox"
                          checked={profile.enabled}
                          onChange={(event) => updateScheduleProfile(profile.id, { enabled: event.currentTarget.checked })}
                          disabled={!canManageLiveMetrics}
                        />
                        Ativo
                      </label>
                      <button type="button" onClick={() => removeScheduleProfile(profile.id)} disabled={!canManageLiveMetrics} aria-label="Remover horário">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <label>
                      Nome do horário
                      <input value={profile.label} onChange={(event) => updateScheduleProfile(profile.id, { label: event.currentTarget.value })} disabled={!canManageLiveMetrics} />
                    </label>
                    <div className="audience-day-row">
                      {AUDIENCE_DAY_IDS.map((dayId) => {
                        const selected = profile.dayIds.includes(dayId);
                        return (
                          <button
                            key={dayId}
                            type="button"
                            className={selected ? "is-active" : ""}
                            onClick={() => updateScheduleProfile(profile.id, {
                              dayIds: toggleAudienceDay(profile.dayIds, dayId),
                            })}
                            disabled={!canManageLiveMetrics}
                          >
                            {audienceDayLabel(dayId)}
                          </button>
                        );
                      })}
                    </div>
                    <div className="audience-field-grid compact">
                      <label>
                        Início
                        <input type="time" value={profile.startTime} onChange={(event) => updateScheduleProfile(profile.id, { startTime: event.currentTarget.value })} disabled={!canManageLiveMetrics} />
                      </label>
                      <label>
                        Fim
                        <input type="time" value={profile.endTime} onChange={(event) => updateScheduleProfile(profile.id, { endTime: event.currentTarget.value })} disabled={!canManageLiveMetrics} />
                      </label>
                      <label>
                        Entrada
                        <input type="number" value={profile.listenersMin} onChange={(event) => updateScheduleProfile(profile.id, { listenersMin: parseLiveMetric(event.currentTarget.value, profile.listenersMin, LIVE_TEST_MAX_LISTENERS) })} disabled={!canManageLiveMetrics} />
                      </label>
                      <label>
                        Limite
                        <input type="number" value={profile.listenersMax} onChange={(event) => updateScheduleProfile(profile.id, { listenersMax: parseLiveMetric(event.currentTarget.value, profile.listenersMax, LIVE_TEST_MAX_LISTENERS) })} disabled={!canManageLiveMetrics} />
                      </label>
                    </div>
                    <div className="audience-range-stack compact">
                      <label>
                        <span>Movimento <strong>{profile.movementPercent}%</strong></span>
                        <input type="range" min="0" max={LIVE_TEST_MAX_PERCENT} value={profile.movementPercent} onChange={(event) => updateScheduleProfile(profile.id, { movementPercent: parseLiveMetric(event.currentTarget.value, profile.movementPercent, LIVE_TEST_MAX_PERCENT) })} disabled={!canManageLiveMetrics} />
                      </label>
                      <label>
                        <span>Velocidade <strong>{profile.transitionPercent}%</strong></span>
                        <input type="range" min="0" max="100" value={profile.transitionPercent} onChange={(event) => updateScheduleProfile(profile.id, { transitionPercent: parseLiveMetric(event.currentTarget.value, profile.transitionPercent, 100) })} disabled={!canManageLiveMetrics} />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-admin">
                <strong>Nenhum horário especial</strong>
                <span>Sem regra cadastrada, o site usa a base global o dia todo.</span>
              </div>
            )}
            <div className="audience-control-actions">
              <button
                className="play-main slim"
                type="button"
                onClick={() => void applyAudienceDraft(
                  isLiveMetricsRemote
                    ? "Regras por horário aplicadas no site publicado."
                    : "Regras por horário aplicadas no teste local.",
                )}
                disabled={!canManageLiveMetrics || isAudienceSaving || !isAudienceDraftDirty}
              >
                <Save size={16} /> {isAudienceSaving ? "Aplicando..." : "Aplicar regras por horário"}
              </button>
              <button className="ghost-button" type="button" onClick={restoreAudienceDraft} disabled={!canManageLiveMetrics || !isAudienceDraftDirty}>
                <RefreshCw size={16} /> Descartar rascunho
              </button>
            </div>
          </section>

          {false ? (
          <section className="audience-stack-panel">
            <div className="editor-head">
              <div>
                <span><Mic2 size={15} /> Regras por DJ</span>
                <h2>DJs com base própria</h2>
              </div>
              <button className="ghost-button" type="button" onClick={() => addDjAudienceProfile()} disabled={!canManageLiveMetrics}>
                <Plus size={16} /> Perfil vazio
              </button>
            </div>
            {djs.length ? (
              <div className="audience-chip-row">
                {djs.slice(0, 8).map((dj) => (
                  <button key={dj.id} className="ghost-button" type="button" onClick={() => addDjAudienceProfile(dj)} disabled={!canManageLiveMetrics}>
                    <Plus size={14} /> {dj.djName || "DJ cadastrado"}
                  </button>
                ))}
              </div>
            ) : null}
            {(audienceDraft.djProfiles || []).length ? (
              <div className="audience-profile-grid">
                {(audienceDraft.djProfiles || []).map((profile) => (
                  <article key={profile.id} className="audience-profile-card">
                    <div className="profile-card-head">
                      <label className="check-line">
                        <input
                          type="checkbox"
                          checked={profile.enabled}
                          onChange={(event) => updateDjAudienceProfile(profile.id, { enabled: event.currentTarget.checked })}
                          disabled={!canManageLiveMetrics}
                        />
                        Ativo
                      </label>
                      <button type="button" onClick={() => removeDjAudienceProfile(profile.id)} disabled={!canManageLiveMetrics} aria-label="Remover DJ">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="audience-field-grid compact">
                      <label>
                        Nome público
                        <input value={profile.djName} onChange={(event) => updateDjAudienceProfile(profile.id, { djName: event.currentTarget.value })} disabled={!canManageLiveMetrics} />
                      </label>
                      <label>
                        Programa
                        <input value={profile.programName} onChange={(event) => updateDjAudienceProfile(profile.id, { programName: event.currentTarget.value })} disabled={!canManageLiveMetrics} />
                      </label>
                    </div>
                    <label>
                      Assinaturas detectáveis
                      <textarea
                        rows={3}
                        value={profile.signatures}
                        onChange={(event) => updateDjAudienceProfile(profile.id, { signatures: event.currentTarget.value })}
                        placeholder="login ou nome que aparece na API, um por linha"
                        disabled={!canManageLiveMetrics}
                      />
                    </label>
                    <div className="audience-field-grid compact">
                      <label>
                        Entrada
                        <input type="number" value={profile.listenersMin} onChange={(event) => updateDjAudienceProfile(profile.id, { listenersMin: parseLiveMetric(event.currentTarget.value, profile.listenersMin, LIVE_TEST_MAX_LISTENERS) })} disabled={!canManageLiveMetrics} />
                      </label>
                      <label>
                        Limite
                        <input type="number" value={profile.listenersMax} onChange={(event) => updateDjAudienceProfile(profile.id, { listenersMax: parseLiveMetric(event.currentTarget.value, profile.listenersMax, LIVE_TEST_MAX_LISTENERS) })} disabled={!canManageLiveMetrics} />
                      </label>
                    </div>
                    <div className="audience-range-stack compact">
                      <label>
                        <span>Movimento <strong>{profile.movementPercent}%</strong></span>
                        <input type="range" min="0" max={LIVE_TEST_MAX_PERCENT} value={profile.movementPercent} onChange={(event) => updateDjAudienceProfile(profile.id, { movementPercent: parseLiveMetric(event.currentTarget.value, profile.movementPercent, LIVE_TEST_MAX_PERCENT) })} disabled={!canManageLiveMetrics} />
                      </label>
                      <label>
                        <span>Ganho ao vivo <strong>{profile.liveBoostPercent}%</strong></span>
                        <input type="range" min="0" max={LIVE_TEST_MAX_PERCENT} value={profile.liveBoostPercent} onChange={(event) => updateDjAudienceProfile(profile.id, { liveBoostPercent: parseLiveMetric(event.currentTarget.value, profile.liveBoostPercent, LIVE_TEST_MAX_PERCENT) })} disabled={!canManageLiveMetrics} />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-admin">
                <strong>Nenhum perfil de DJ</strong>
                <span>Quando houver DJ detectável, o perfil cadastrado passa na frente da base global e dos horários.</span>
              </div>
            )}
          </section>
          ) : null}
        </section>
      ) : null}

      {activePanel === "ads" ? (
        <>
      <section className="admin-specs">
        <article>
          <span>Imagem principal</span>
          <strong>{AD_BANNER_WIDTH} x {AD_BANNER_HEIGHT}</strong>
          <p>WebP horizontal obrigatório para o espaço “Anuncie aqui”.</p>
        </article>
        <article>
          <span>Arquivos</span>
          <strong>Blobs</strong>
          <p>Em produção, imagens WebP e cadastros ficam no armazenamento global.</p>
        </article>
        <article>
          <span>Entrega</span>
          <strong>Image CDN</strong>
          <p>Imagens públicas ficam preparadas para otimização automática no Netlify.</p>
        </article>
        <article>
          <span>Limite</span>
          <strong>{MAX_ADS}</strong>
          <p>Quantidade máxima de campanhas cadastradas no console.</p>
        </article>
      </section>

      <section className={webpMigrationAds.length ? "admin-notice webp-migration-panel" : "admin-notice webp-migration-panel is-soft"}>
        <ImageUp size={18} />
        <div>
          <strong>{webpMigrationAds.length ? "Migração WebP em andamento" : "Acervo em WebP"}</strong>
          <span>
            {webpMigrationAds.length
              ? "A abertura autenticada converte o acervo armazenado antes de remover os originais."
              : "Uploads e URLs externas são importados para o Blob somente em WebP."}
          </span>
          {conversionState.message ? (
            <small className={conversionState.status === "error" ? "form-warning" : "upload-ok"}>
              {conversionState.message}
            </small>
          ) : null}
        </div>
      </section>

      <AdDisplaySettingsPanel canEditAds={canEditAds} persistSettings={persistSettings} settings={settings} />

      <section className="admin-grid">
        <form className="ad-editor" onSubmit={saveDraft}>
          <div className="editor-head">
            <div>
              <span>{selectedId ? "Editando campanha" : "Nova campanha"}</span>
              <h2>Dados do anúncio</h2>
            </div>
            <button type="button" className="ghost-button" onClick={newAd} disabled={!canEditAds}>
              <Plus size={16} /> Novo
            </button>
          </div>

          <label className={canEditAds ? "upload-drop" : "upload-drop is-disabled"}>
            <UploadCloud size={24} />
            <strong>Cortar imagem para {AD_BANNER_WIDTH} x {AD_BANNER_HEIGHT}</strong>
            <span>Envie PNG, JPG ou WebP. O painel gera o WebP final antes de salvar.</span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={handleImageFile} disabled={!canEditAds} />
          </label>
          {uploadState.message ? (
            <small className={uploadState.status === "error" ? "form-warning" : "upload-ok"}>{uploadState.message}</small>
          ) : null}

          <div className={draft.imageUrl ? "ad-preview-wide has-image" : "ad-preview-wide"}>
            {draft.imageUrl ? (
              <img src={draft.imageUrl} alt="Preview do anúncio" />
            ) : (
              <span>
                <ImageUp size={24} /> Preview do banner
              </span>
            )}
          </div>

          <label>
            Título
            <input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.currentTarget.value })}
              placeholder="Nome do anúncio"
            />
          </label>
          <label>
            Texto
            <textarea
              rows={3}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })}
              placeholder="Mensagem curta que acompanha o anúncio"
            />
          </label>
          <div className="editor-columns">
            <label>
              Tipo
              <select
                value={draft.placement}
                onChange={(event) => setDraft({ ...draft, placement: event.currentTarget.value as SiteAd["placement"] })}
              >
                <option value="commercial">Comercial</option>
                <option value="program">Programa</option>
              </select>
            </label>
            <label>
              Ordem
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.currentTarget.value) || 0 })}
              />
            </label>
          </div>
          <label>
            URL da imagem
            <input
              value={draft.imageUrl.startsWith("data:") ? "" : draft.imageUrl}
              onChange={(event) => setDraft({ ...draft, imageUrl: event.currentTarget.value })}
              placeholder="https://dominio.com/anuncio-1700x450.png"
            />
          </label>
          <label>
            Link ao tocar no anúncio
            <input
              value={draft.linkUrl}
              onChange={(event) => setDraft({ ...draft, linkUrl: event.currentTarget.value })}
              placeholder="https://site-do-anunciante.com"
            />
          </label>
          <div className="editor-columns">
            <label>
              Texto do link
              <input
                value={draft.buttonLabel}
                onChange={(event) => setDraft({ ...draft, buttonLabel: event.currentTarget.value })}
              />
            </label>
            <label>
              Seção
              <input
                value={draft.section}
                onChange={(event) => setDraft({ ...draft, section: event.currentTarget.value })}
              />
            </label>
          </div>
          <div className="editor-columns">
            <label>
              Inicia em
              <input
                type="datetime-local"
                value={toDateTimeInput(draft.startsAt)}
                onChange={(event) => setDraft({ ...draft, startsAt: fromDateTimeInput(event.currentTarget.value) })}
              />
            </label>
            <label>
              Termina em
              <input
                type="datetime-local"
                value={toDateTimeInput(draft.endsAt)}
                onChange={(event) => setDraft({ ...draft, endsAt: fromDateTimeInput(event.currentTarget.value) })}
              />
            </label>
          </div>
          <label className="check-line">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => setDraft({ ...draft, active: event.currentTarget.checked })}
            />
            Anúncio ativo
          </label>
          <button className="play-main slim" type="submit" disabled={!canEditAds}>
            <Save size={16} /> Salvar anúncio
          </button>
          <small>A vitrine da Rádio usa anúncios ativos com imagem e respeita o limite de {MAX_ADS} banners cadastrados.</small>
        </form>

        <aside className="ad-list">
          <div className="editor-head">
            <div>
              <span>
                <Clock3 size={15} /> Grade cadastrada
              </span>
              <h2>Anúncios do site</h2>
            </div>
            <BarChart3 size={20} />
          </div>
          {ads.length ? (
            <div className="ad-grid">
              {ads.map((ad) => (
                <article key={ad.id} className={ad.active ? "ad-list-item is-active" : "ad-list-item"}>
                  {ad.imageUrl ? <img src={ad.imageUrl} alt="" /> : <span className="ad-list-placeholder" />}
                  <div>
                    <strong>{ad.title || "Anúncio sem título"}</strong>
                    <span>{ad.active ? "Ativo" : "Desativado"} · {placementLabel(ad.placement)}</span>
                    <small>{ad.linkUrl ? `${ad.clicks} toques no link` : "Sem link configurado"}</small>
                  </div>
                  <div className="ad-list-actions">
                    <button type="button" onClick={() => editAd(ad)} aria-label="Editar anúncio">
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void toggleAd(ad);
                      }}
                      disabled={!canEditAds}
                      aria-label={ad.active ? "Desativar anúncio" : "Ativar anúncio"}
                    >
                      {ad.active ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                    {ad.linkUrl ? (
                      <a href={ad.linkUrl} target="_blank" rel="noreferrer" aria-label="Abrir link do anúncio">
                        <ExternalLink size={15} />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        void removeAd(ad.id);
                      }}
                      disabled={!canEditAds}
                      aria-label="Excluir anúncio"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-admin">
              <strong>Nenhum anúncio cadastrado</strong>
              <span>A área publicitária do site ficará oculta até existir uma campanha ativa.</span>
            </div>
          )}
        </aside>
      </section>
        </>
      ) : null}

      {activePanel === "programs" ? (
        <>
          <AdDisplaySettingsPanel canEditAds={canEditAds} persistSettings={persistSettings} settings={settings} />

          <section className="admin-grid program-admin-grid">
          <form className="ad-editor" onSubmit={saveProgramDraft}>
            <div className="editor-head">
              <div>
                <span>{selectedProgramId ? "Editando programa" : "Novo programa"}</span>
                <h2>Dados da programação</h2>
              </div>
              <button type="button" className="ghost-button" onClick={newProgram} disabled={!canEditAds}>
                <Plus size={16} /> Novo
              </button>
            </div>

            <label className={canEditAds ? "upload-drop program-logo-drop" : "upload-drop program-logo-drop is-disabled"}>
              <UploadCloud size={24} />
              <strong>Enviar logo do programa</strong>
              <span>PNG, JPG, WebP ou AVIF entram e são armazenados como WebP, até 1800px e 2,5 MB.</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={handleProgramLogoFile} disabled={!canEditAds} />
            </label>
            {programUploadState.message ? (
              <small className={programUploadState.status === "error" ? "form-warning" : "upload-ok"}>{programUploadState.message}</small>
            ) : null}

            <div className={programDraft.logoUrl ? "program-logo-preview has-image" : "program-logo-preview"}>
              {programDraft.logoUrl ? (
                <img src={programDraft.logoUrl} alt="Preview da logo do programa" />
              ) : (
                <span>
                  <ImageUp size={22} /> Logo do programa
                </span>
              )}
            </div>

            <label>
              Nome do programa
              <input
                value={programDraft.program}
                onChange={(event) => setProgramDraft({ ...programDraft, program: event.currentTarget.value })}
                placeholder="Reggae Point"
              />
            </label>
            <label>
              Apresentador
              <input
                value={programDraft.host}
                onChange={(event) => setProgramDraft({ ...programDraft, host: event.currentTarget.value })}
                placeholder="Web Rádio Conexão Jamaica"
              />
            </label>
            <div className="editor-columns">
              <label>
                Dia
                <select
                  value={programDraft.dayId}
                  onChange={(event) => setProgramDraft({ ...programDraft, dayId: event.currentTarget.value })}
                >
                  <option value="Sun">Domingo</option>
                  <option value="Mon">Segunda</option>
                  <option value="Tue">Terça</option>
                  <option value="Wed">Quarta</option>
                  <option value="Thu">Quinta</option>
                  <option value="Fri">Sexta</option>
                  <option value="Sat">Sábado</option>
                </select>
              </label>
              <label>
                Ordem
                <input
                  type="number"
                  value={programDraft.sortOrder}
                  onChange={(event) => setProgramDraft({ ...programDraft, sortOrder: Number(event.currentTarget.value) || 0 })}
                />
              </label>
            </div>
            <div className="editor-columns">
              <label>
                Início
                <input
                  type="time"
                  value={programDraft.startTime}
                  onChange={(event) => setProgramDraft({ ...programDraft, startTime: event.currentTarget.value })}
                />
              </label>
              <label>
                Fim
                <input
                  type="time"
                  value={programDraft.endTime}
                  onChange={(event) => setProgramDraft({ ...programDraft, endTime: event.currentTarget.value })}
                />
              </label>
            </div>
            <label>
            URL da logo
              <input
                value={programDraft.logoUrl.startsWith("data:") ? "" : programDraft.logoUrl}
                onChange={(event) => setProgramDraft({ ...programDraft, logoUrl: event.currentTarget.value })}
              placeholder="https://dominio.com/logo-programa.png"
              />
            </label>
            <label className="check-line">
              <input
                type="checkbox"
                checked={programDraft.active}
                onChange={(event) => setProgramDraft({ ...programDraft, active: event.currentTarget.checked })}
              />
              Programa ativo
            </label>
            <button className="play-main slim" type="submit" disabled={!canEditAds}>
              <Save size={16} /> Salvar programa
            </button>
          </form>

          <aside className="ad-list">
            <div className="editor-head">
              <div>
                <span>
                  <CalendarDays size={15} /> Grade cadastrada
                </span>
                <h2>Programação da rádio</h2>
              </div>
              <BarChart3 size={20} />
            </div>
            {programs.length ? (
              <div className="ad-grid program-list-grid">
                {programs.map((program) => (
                  <article key={program.id} className={program.active ? "ad-list-item is-active" : "ad-list-item"}>
                    {program.logoUrl ? <img src={program.logoUrl} alt="" /> : <span className="ad-list-placeholder" />}
                    <div>
                      <strong>{program.program || "Programa sem nome"}</strong>
                      <span>{program.dayLabel} · {program.startTime} - {program.endTime}</span>
                      <small>{program.active ? "Ativo" : "Desativado"} · {program.host}</small>
                    </div>
                    <div className="ad-list-actions">
                      <button type="button" onClick={() => editProgram(program)} aria-label="Editar programa">
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void toggleProgram(program);
                        }}
                        disabled={!canEditAds}
                        aria-label={program.active ? "Desativar programa" : "Ativar programa"}
                      >
                        {program.active ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void removeProgram(program.id);
                        }}
                        disabled={!canEditAds}
                        aria-label="Excluir programa"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-admin">
                <strong>Nenhum programa cadastrado</strong>
                <span>A grade padrão será usada até existir programação salva.</span>
              </div>
            )}
          </aside>
          </section>
        </>
      ) : null}

      {activePanel === "djs" ? (
        <>
        <section className="dj-operations-panel" aria-label="Situação operacional dos DJs">
          <div className="dj-operations-head">
            <div>
              <span><Activity size={15} /> Operação ao vivo</span>
              <h2>Central de DJs</h2>
              <p>Estado salvo atualizado a cada {currentPanelRefreshSeconds} segundos. O Vox só é consultado durante uma janela de detecção, transmissão ou teste manual.</p>
            </div>
            <div className="dj-operations-actions">
              <span className={isFetchingDjDetection ? "dj-sync-state is-busy" : "dj-sync-state"}>
                <RefreshCw size={14} /> {isFetchingDjDetection ? "Atualizando estado" : "Estado sincronizado"}
              </span>
              <button
                className="ghost-button"
                type="button"
                onClick={() => { void testVoxConnection(); }}
                disabled={!voxReadyForProbe || isFetchingVoxIntegration}
                title={voxReadyForProbe ? "Confere os logins dos DJs no Vox usando o cache compartilhado." : "Configure e proteja a conexão Vox na aba Funcionamento da API para testar."}
              >
                <RefreshCw size={15} /> Testar Vox agora
              </button>
              <NavLink className="ghost-button" to={adminPanelRoutes.api}>
                <Settings2 size={15} /> Ajustar operação
              </NavLink>
            </div>
          </div>
          <div className="dj-operations-summary">
            <article>
              <span>Rádio</span>
              <strong>{djOperationsLiveDj?.isLive ? "DJ conectado" : "AutoDJ"}</strong>
              <small>{djOperationsLiveDj?.isLive ? `${djOperationsLiveDj.djName} · ${djOperationsLiveDj.programName}` : "Programação automática em operação"}</small>
            </article>
            <article>
              <span>Próximo elegível</span>
              <strong>{djDetectionStatus?.eligibleDj?.djName || "Sem janela agora"}</strong>
              <small>{djDetectionStatus?.eligibleDj ? `${djDetectionStatus.eligibleDj.startTime} às ${djDetectionStatus.eligibleDj.endTime}` : `A agenda abre a detecção ${earlyWindowLabel}`}</small>
            </article>
            <article>
              <span>Última transição</span>
              <strong>{djOperationsState?.lastTransition || "Sem transição recente"}</strong>
              <small>{djOperationsState?.lastTransitionAt ? `${formatRelativeTime(djOperationsState.lastTransitionAt)} · ${djOperationsState.lastTransitionReason || "Estado confirmado"}` : "Nenhum evento operacional salvo"}</small>
            </article>
            <article>
              <span>Integração Vox</span>
              <strong>{voxIntegrationData?.integration.enabled && voxIntegrationData.integration.encryptionReady ? "Protegida e pronta" : "Requer atenção"}</strong>
              <small>{voxIntegrationData?.integration.enabled ? "Sessão temporária e cache compartilhado" : "Configure na Central da API"}</small>
            </article>
          </div>
          <div className="dj-operation-guidance">
            <span><CalendarDays size={15} /> Antecipação: <strong>{earlyWindowLabel}</strong></span>
            <span><RefreshCw size={15} /> Painel: <strong>estado salvo a cada {currentPanelRefreshSeconds}s</strong></span>
            <span><Database size={15} /> Vox: <strong>somente quando necessário</strong></span>
          </div>
          {djAttentionItems.length ? (
            <div className="dj-attention-list" role="status">
              {djAttentionItems.map((item) => <p key={item}><AlertTriangle size={15} /> {item}</p>)}
            </div>
          ) : (
            <div className="dj-attention-list is-clear"><p><CheckCircle2 size={15} /> Nenhuma pendência operacional. A confirmação por conexão fica pronta quando houver uma janela elegível.</p></div>
          )}
        </section>
        <section className="admin-grid dj-admin-grid">
          <form className="ad-editor" onSubmit={saveDjDraft}>
            <div className="editor-head">
              <div>
                <span>{selectedDjId ? "Editando DJ" : "Novo DJ"}</span>
                <h2>Central de DJs</h2>
              </div>
              <button type="button" className="ghost-button" onClick={newDj} disabled={!canEditAds}>
                <Plus size={16} /> Novo
              </button>
            </div>

            <label>
              Nome do DJ
              <input
                value={djDraft.djName}
                onChange={(event) => setDjDraft({ ...djDraft, djName: event.currentTarget.value })}
                placeholder="DJ Rogerio"
              />
            </label>
            <label>
              Nome do programa
              <input
                value={djDraft.programName}
                onChange={(event) => setDjDraft({ ...djDraft, programName: event.currentTarget.value })}
                placeholder="Reggae ao vivo"
              />
            </label>

            <label className={canEditAds ? "upload-drop" : "upload-drop is-disabled"}>
              <UploadCloud size={24} />
              <strong>Logo opcional do DJ</strong>
              <span>PNG, JPG, WebP ou AVIF entram e o Blob guarda uma versão WebP quadrada.</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={handleDjLogoFile} disabled={!canEditAds} />
            </label>
            {djLogoUploadState.message ? (
              <small className={djLogoUploadState.status === "error" ? "form-warning" : "upload-ok"}>{djLogoUploadState.message}</small>
            ) : null}
            {djDraft.logoUrl ? (
              <div className="program-logo-preview has-image">
                <img src={djDraft.logoUrl} alt="Preview da logo do DJ" />
              </div>
            ) : null}
            <label>
              URL da logo
              <input
                value={djDraft.logoUrl.startsWith("data:") ? "" : djDraft.logoUrl}
                onChange={(event) => setDjDraft({ ...djDraft, logoUrl: event.currentTarget.value, logoKey: "" })}
                placeholder="https://dominio.com/logo-do-dj.png"
              />
            </label>

            <div className="dj-schedule-editor">
              <div className="profile-card-head">
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={djDraft.scheduleEnabled}
                    onChange={(event) => setDjDraft({ ...djDraft, scheduleEnabled: event.currentTarget.checked })}
                  />
                  Agenda automática
                </label>
                <span className="dj-schedule-badge">
                  <Clock3 size={14} /> {djDraft.scheduleEnabled ? "Ativa" : "Manual apenas"}
                </span>
              </div>
              <div className="editor-columns">
                <label>
                  Entrada
                  <input
                    type="time"
                    value={djDraft.startTime}
                    onChange={(event) => setDjDraft({ ...djDraft, startTime: event.currentTarget.value })}
                  />
                </label>
                <label>
                  Saída
                  <input
                    type="time"
                    value={djDraft.endTime}
                    onChange={(event) => setDjDraft({ ...djDraft, endTime: event.currentTarget.value })}
                  />
                </label>
              </div>
              <div className="audience-day-row">
                {AUDIENCE_DAY_IDS.map((dayId) => {
                  const selected = djDraft.dayIds.includes(dayId);
                  return (
                    <button
                      key={dayId}
                      type="button"
                      className={selected ? "is-active" : ""}
                      onClick={() => setDjDraft({
                        ...djDraft,
                        dayIds: toggleAudienceDay(djDraft.dayIds, dayId),
                      })}
                    >
                      {audienceDayLabel(dayId)}
                    </button>
                  );
                })}
              </div>
              <small>
                No horário, este DJ fica elegível. O topo entra por marcador do encoder, confirmação do painel ou pelas leituras configuradas da API.
              </small>
            </div>

            <div className="audience-field-grid compact">
              <label>
                Base mínima do DJ
                <input
                  type="number"
                  min="0"
                  max={LIVE_TEST_MAX_LISTENERS}
                  value={djDraft.listenersMin}
                  onChange={(event) => setDjDraft({ ...djDraft, listenersMin: parseLiveMetric(event.currentTarget.value, djDraft.listenersMin, LIVE_TEST_MAX_LISTENERS) })}
                />
              </label>
              <label>
                Limite do DJ
                <input
                  type="number"
                  min="0"
                  max={LIVE_TEST_MAX_LISTENERS}
                  value={djDraft.listenersMax}
                  onChange={(event) => setDjDraft({ ...djDraft, listenersMax: parseLiveMetric(event.currentTarget.value, djDraft.listenersMax, LIVE_TEST_MAX_LISTENERS) })}
                />
              </label>
            </div>

            <div className="editor-columns">
              <label>
                Ordem
                <input
                  type="number"
                  value={djDraft.sortOrder}
                  onChange={(event) => setDjDraft({ ...djDraft, sortOrder: Number(event.currentTarget.value) || 0 })}
                />
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={djDraft.active}
                  onChange={(event) => setDjDraft({ ...djDraft, active: event.currentTarget.checked })}
                />
                DJ ativo
              </label>
            </div>

            <details className="technical-dj-details">
              <summary>
                <SlidersHorizontal size={14} /> Detecção automática opcional
              </summary>
              <label>
                Login técnico no Vox
                <input
                  value={djDraft.voxLogin}
                  onChange={(event) => setDjDraft({ ...djDraft, voxLogin: event.currentTarget.value.toLowerCase().replace(/\s+/g, "") })}
                  placeholder="conexaojamaica"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
              <small>Quando este login conectar no Vox, o site confirma a entrada {earlyWindowLabel}, sem alterar o SAM Cast do DJ.</small>
              <label>
                Assinaturas técnicas
                <textarea
                  rows={3}
                  value={djDraft.signatures}
                  onChange={(event) => setDjDraft({ ...djDraft, signatures: event.currentTarget.value })}
                  placeholder={"Nome que possa aparecer no servidor\nNome do programa"}
                />
              </label>
              <small>Opcional. Essas assinaturas servem apenas como reserva por metadados; o reconhecimento principal é a conexão já existente no Vox.</small>
            </details>

            <button className="play-main slim" type="submit" disabled={!canEditAds}>
              <Save size={16} /> Salvar DJ e horário
            </button>
          </form>

          <aside className="ad-list">
            <div className="editor-head">
              <div>
                <span>
                  <Mic2 size={15} /> DJs cadastrados
                </span>
                <h2>Ao vivo no site</h2>
              </div>
              <BarChart3 size={20} />
            </div>
            {djs.length ? (
              <div className="ad-grid dj-list-grid">
                {djs.map((dj) => {
                  const isManualLive = manualControlMatchesDj(savedLiveDjControl, dj);
                  const scheduleActive = dj.scheduleEnabled;
                  const isSkippedToday = Boolean((liveTest.djSkips || []).some((skip) => skip.djId === dj.id));
                  const detectedState = djDetectionStatus?.state;
                  const isCurrentDetectedDj = detectedState?.djId === dj.id;
                  const isDetectedLive = Boolean(
                    isCurrentDetectedDj &&
                    (detectedState?.mode === "live" || detectedState?.mode === "leaving" || detectedState?.mode === "overrun"),
                  );
                  const isDetectedOverrun = Boolean(isDetectedLive && djDetectionStatus?.isOverrun);
                  const voxStatus = voxDjStatusById.get(dj.id);
                  const lastProbeAt = djVoxProbeAtById[dj.id];
                  const detectionLabel = isManualLive
                    ? "Ao vivo manual"
                    : isDetectedOverrun
                      ? "Ao vivo · horário excedido"
                      : isDetectedLive
                          ? detectedState?.mode === "leaving"
                            ? "Ao vivo · confirmando saída"
                            : detectedState?.activation === "vox"
                              ? "Ao vivo · conexão confirmada pelo Vox"
                            : detectedState?.activation === "marker"
                            ? "Ao vivo · marcador do encoder"
                            : detectedState?.activation === "confirmation"
                              ? "Ao vivo · entrada confirmada"
                              : "Ao vivo · detecção confirmada"
                        : isCurrentDetectedDj && detectedState?.mode === "entering"
                          ? `Confirmando entrada ${detectedState.enterCount}/${djDetectionStatus?.config.enterConfirmations || 3}`
                          : isSkippedToday
                            ? "Sessão de hoje ignorada"
                            : djDetectionStatus?.diagnostic?.voxUnavailable && (isCurrentDetectedDj || scheduleActive)
                              ? "Vox indisponível · contingência ativa"
                            : scheduleActive
                              ? "Aguardando confirmação da API"
                              : dj.active
                                ? "Ativo sem agenda"
                                : "Desativado";
                  return (
                    <article key={dj.id} className={dj.active ? "ad-list-item dj-list-item is-active" : "ad-list-item dj-list-item"}>
                      <span className={isManualLive ? "dj-avatar is-live" : "dj-avatar"}>
                        {dj.logoUrl
                          ? <img src={dj.logoUrl} alt={`Logo de ${dj.programName || dj.djName}`} />
                          : isManualLive ? <Radio size={20} /> : <Mic2 size={20} />}
                      </span>
                      <div>
                        <strong>{dj.djName || "DJ sem nome"}</strong>
                        <span>{dj.programName || "Programa sem nome"}</span>
                        <small>
                          {detectionLabel}
                        </small>
                        <small className="dj-card-status">
                          {dj.voxLogin
                            ? voxStatus
                              ? `Vox: ${voxStatus === "online" ? "conectado" : voxStatus === "offline" ? "desconectado" : "sem leitura"}${lastProbeAt ? ` · confirmado ${formatRelativeTime(lastProbeAt)}` : ""}`
                              : "Vox preparado · teste sob demanda"
                            : scheduleActive ? "Login Vox pendente" : "Sem confirmação Vox"}
                        </small>
                      </div>
                      <span className={scheduleActive ? "dj-schedule-summary is-active" : "dj-schedule-summary"}>
                        {scheduleActive ? <CalendarDays size={15} /> : <Clock3 size={15} />}
                        {scheduleActive ? formatDjSchedule(dj) : "Sem entrada e saída cadastradas"}
                      </span>
                      <div className="ad-list-actions dj-list-actions">
                        <button type="button" onClick={() => editDj(dj)} aria-label="Editar DJ">
                          Editar
                        </button>
                        <button
                          className={isManualLive ? "dj-manual-button is-live" : "dj-manual-button"}
                          type="button"
                          onClick={() => {
                            void toggleManualLiveDjNow(dj);
                          }}
                          disabled={!canManageLiveMetrics || isAudienceSaving || !dj.djName || !dj.programName}
                        >
                          <Radio size={15} /> {isManualLive ? "Desligar manual" : "Ativar manualmente"}
                        </button>
                        {!isManualLive && !isDetectedLive ? (
                          <button
                            type="button"
                            onClick={() => { void controlDjSession(dj, "confirm"); }}
                            disabled={session?.source !== "blobs" || isAudienceSaving || !dj.active}
                            title="Confirma a entrada agora; o DJ continuará no ar até o AutoDJ voltar a ser confirmado."
                          >
                            <CheckCircle2 size={15} /> Confirmar entrada
                          </button>
                        ) : null}
                        {isDetectedLive && !isManualLive ? (
                          <button
                            type="button"
                            onClick={() => { void controlDjSession(dj, "end"); }}
                            disabled={session?.source !== "blobs" || isAudienceSaving}
                          >
                            <Power size={15} /> Encerrar agora
                          </button>
                        ) : null}
                        {isDetectedOverrun && !isManualLive ? (
                          <>
                            <button
                              type="button"
                              onClick={() => { void controlDjSession(dj, "acknowledge"); }}
                              disabled={session?.source !== "blobs" || isAudienceSaving}
                            >
                              <CheckCircle2 size={15} /> Manter no ar
                            </button>
                            {[30, 60, 120].map((minutes) => (
                              <button
                                key={minutes}
                                type="button"
                                onClick={() => { void controlDjSession(dj, "extend", minutes as 30 | 60 | 120); }}
                                disabled={session?.source !== "blobs" || isAudienceSaving}
                              >
                                <Clock3 size={15} /> +{minutes} min
                              </button>
                            ))}
                          </>
                        ) : null}
                        {scheduleActive ? (
                          <button
                            type="button"
                            onClick={() => { void toggleDjSkipToday(dj); }}
                            disabled={session?.source !== "blobs" || isAudienceSaving}
                            title="Ignora apenas a ocorrência atual; as próximas agendas continuam normais."
                          >
                            <Clock3 size={15} /> {isSkippedToday ? "Liberar hoje" : "Pular hoje"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            void toggleDj(dj);
                          }}
                          disabled={!canEditAds}
                          aria-label={dj.active ? "Desativar DJ" : "Ativar DJ"}
                        >
                          {dj.active ? <Eye size={15} /> : <EyeOff size={15} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => { void testDjVoxConnection(dj); }}
                          disabled={!voxReadyForProbe || !dj.voxLogin.trim() || isFetchingVoxIntegration}
                          title="Confere apenas este DJ; cliques repetidos reaproveitam o cache compartilhado."
                        >
                          <RefreshCw size={15} /> Testar conexão
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void removeDj(dj.id);
                          }}
                          disabled={!canEditAds || isManualLive || isDetectedLive}
                          title={isManualLive || isDetectedLive ? "Encerre a sessão antes de excluir este DJ." : "Excluir DJ"}
                          aria-label="Excluir DJ"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-admin">
                <strong>Nenhum DJ cadastrado</strong>
                <span>Cadastre nome, programa e horário para a API poder confirmar o DJ ao vivo.</span>
              </div>
            )}
          </aside>
        </section>
        </>
      ) : null}

      {cropFile ? (
        <AdImageCropper
          file={cropFile}
          onCancel={() => {
            setCropFile(null);
            setUploadState({ status: "idle", message: "" });
          }}
          onApply={applyCroppedAdImage}
        />
      ) : null}
    </main>
  );
}

type AdDisplaySettingsPanelProps = {
  canEditAds: boolean;
  persistSettings: (nextSettings: Partial<AdSettings>) => Promise<void>;
  settings: AdSettings;
};

function AdDisplaySettingsPanel({ canEditAds, persistSettings, settings }: AdDisplaySettingsPanelProps) {
  return (
    <section className="ad-settings-panel">
      <div className="editor-head">
        <div>
          <span>
            <Settings2 size={15} /> Configuração global
          </span>
          <h2>Exibição dos anúncios</h2>
        </div>
      </div>
      <div className="ad-settings-grid">
        <label className="check-line">
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={!canEditAds}
            onChange={(event) => {
              void persistSettings({ enabled: event.currentTarget.checked });
            }}
          />
          Anúncios ativados no site
        </label>
        <label className="check-line">
          <input
            type="checkbox"
            checked={settings.scheduleEnabled}
            disabled={!canEditAds}
            onChange={(event) => {
              void persistSettings({ scheduleEnabled: event.currentTarget.checked });
            }}
          />
          Usar horário programado
        </label>
        <label>
          Início
          <input
            type="time"
            value={settings.startTime}
            onChange={(event) => {
              void persistSettings({ startTime: event.currentTarget.value });
            }}
            disabled={!canEditAds || !settings.scheduleEnabled}
          />
        </label>
        <label>
          Fim
          <input
            type="time"
            value={settings.endTime}
            onChange={(event) => {
              void persistSettings({ endTime: event.currentTarget.value });
            }}
            disabled={!canEditAds || !settings.scheduleEnabled}
          />
        </label>
        <label>
          Comerciais antes de programa
          <input
            type="number"
            min="1"
            max="12"
            value={settings.commercialRuns}
            onChange={(event) => {
              void persistSettings({ commercialRuns: Number(event.currentTarget.value) || 3 });
            }}
            disabled={!canEditAds}
          />
        </label>
        <label>
          Chamadas de programa
          <input
            type="number"
            min="0"
            max="6"
            value={settings.programRuns}
            onChange={(event) => {
              void persistSettings({ programRuns: Number(event.currentTarget.value) || 1 });
            }}
            disabled={!canEditAds}
          />
        </label>
      </div>
    </section>
  );
}

function readImageSize(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    image.src = url;
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function imageContentTypeForFile(file: File) {
  const contentType = file.type.toLowerCase();
  if (contentType) return contentType;

  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".avif")) return "image/avif";
  return "";
}

function isAcceptedSourceImageType(value: string) {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp" || value === "image/avif";
}

async function prepareProgramLogoUpload(
  file: File,
  size: { width: number; height: number },
  sourceType: string,
) {
  const sourceDataUrl = await readFileAsDataUrl(file);

  if (sourceType === "image/webp") {
    const dataBase64 = sourceDataUrl.split(",")[1] || "";

    return {
      fileName: toWebpProgramLogoFileName(file.name),
      contentType: "image/webp" as const,
      width: size.width,
      height: size.height,
      dataUrl: `data:image/webp;base64,${dataBase64}`,
      dataBase64,
      size: file.size,
      converted: false,
    };
  }

  const image = await loadImageElement(sourceDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Seu navegador não conseguiu preparar o WebP.");

  context.clearRect(0, 0, size.width, size.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, size.width, size.height);

  const webpBlob = await canvasToBlob(canvas, "image/webp", 0.88);
  const dataUrl = await blobToDataUrl(webpBlob);

  return {
    fileName: toWebpProgramLogoFileName(file.name),
    contentType: "image/webp" as const,
    width: size.width,
    height: size.height,
    dataUrl,
    dataBase64: dataUrl.split(",")[1] || "",
    size: webpBlob.size,
    converted: true,
  };
}

function toWebpProgramLogoFileName(fileName: string) {
  const cleanName = fileName.trim().replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "programa";
  return `${cleanName}.webp`;
}

async function prepareDjLogoUpload(file: File, size: { width: number; height: number }) {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(sourceDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Seu navegador não conseguiu preparar o WebP.");

  const cropSize = Math.min(size.width, size.height);
  const sourceX = Math.max(0, Math.round((size.width - cropSize) / 2));
  const sourceY = Math.max(0, Math.round((size.height - cropSize) / 2));
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, 512, 512);
  const webpBlob = await canvasToBlob(canvas, "image/webp", 0.86);
  const dataUrl = await blobToDataUrl(webpBlob);
  return {
    fileName: toWebpDjLogoFileName(file.name),
    contentType: "image/webp" as const,
    width: 512,
    height: 512,
    size: webpBlob.size,
    dataUrl,
  };
}

function toWebpDjLogoFileName(fileName: string) {
  const cleanName = fileName.trim().replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "dj";
  return `${cleanName}.webp`;
}

function isExternalImageUrl(value: string) {
  return /^https:\/\//i.test(String(value || "").trim());
}

function toDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeInput(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function placementLabel(value: SiteAd["placement"]) {
  return value === "program" ? "Programa" : "Comercial";
}

function parseLiveMetric(value: string, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(0, Math.round(parsed)));
}

function parseOptionalMetric(value: string, min: number, max: number) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function formatAdminNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.max(0, Math.round(value)));
}

function formatActivityTime(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatRelativeTime(value: string | number) {
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) return "agora";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  if (seconds < 12) return "agora";
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `há ${hours} h`;
}

function formatDjEarlyWindow(minutes: number) {
  const normalized = Math.max(0, Math.round(Number(minutes) || 0));
  return normalized === 0 ? "na hora da entrada" : `${normalized} min antes da entrada`;
}

function nextSimulationSeed() {
  return Math.max(1, Math.round(Date.now() % 999_999));
}

function makeVisitGrowthBars(payload: VisitorCounterDraft) {
  const growth = Math.max(1, payload.visitorGrowthPercent) / LIVE_TEST_MAX_GROWTH_PERCENT;
  const targetBoost = payload.visitorTarget && payload.visitorTarget > payload.visitorBase ? 7 : 0;

  return Array.from({ length: 22 }, (_, index) => {
    const steadyRise = 26 + index * (2.15 + growth * 1.8);
    const contour = Math.sin(index * 0.88) * 4 + Math.cos(index * 0.31) * 2;
    return Math.min(92, Math.max(18, Math.round(steadyRise + contour + targetBoost)));
  });
}

function audienceDayLabel(dayId: string) {
  const labels: Record<string, string> = {
    Sun: "Dom",
    Mon: "Seg",
    Tue: "Ter",
    Wed: "Qua",
    Thu: "Qui",
    Fri: "Sex",
    Sat: "Sáb",
  };
  return labels[dayId] || dayId;
}

function defaultDjScheduleDraft(): DjScheduleDraft {
  return {
    enabled: false,
    dayIds: ["Sat", "Sun"],
    startTime: "18:00",
    endTime: "23:59",
  };
}

function scheduleDraftFromDj(dj: StationDj, control: ManualLiveDjControl): DjScheduleDraft {
  const schedule = manualScheduleForDj(control, dj);
  if (!schedule) return defaultDjScheduleDraft();

  return {
    enabled: schedule.enabled,
    dayIds: schedule.dayIds.length ? schedule.dayIds : ["Sat", "Sun"],
    startTime: schedule.startTime || "18:00",
    endTime: schedule.endTime || "23:59",
  };
}

function manualScheduleForDj(control: ManualLiveDjControl, dj: StationDj) {
  return control.schedules.find((schedule) => manualScheduleMatchesDj(schedule, dj)) || null;
}

function manualScheduleMatchesDj(schedule: ManualLiveDjSchedule, dj: StationDj) {
  if (schedule.stationDjId && schedule.stationDjId === dj.id) return true;

  const scheduleDj = comparableAdminText(schedule.djName);
  const scheduleProgram = comparableAdminText(schedule.programName);
  const djName = comparableAdminText(dj.djName);
  const programName = comparableAdminText(dj.programName);

  return Boolean(
    scheduleDj &&
      djName &&
      scheduleDj === djName &&
      (!scheduleProgram || !programName || scheduleProgram === programName),
  );
}

function formatManualSchedule(schedule: ManualLiveDjSchedule) {
  return `${formatAudienceDayList(schedule.dayIds)} · ${schedule.startTime} às ${schedule.endTime}`;
}

function formatAudienceDayList(dayIds: string[]) {
  if (dayIds.length >= AUDIENCE_DAY_IDS.length) return "Todos os dias";
  return dayIds.map(audienceDayLabel).join(", ");
}

function toggleAudienceDay(dayIds: string[], dayId: string) {
  if (dayIds.includes(dayId)) {
    return dayIds.length > 1 ? dayIds.filter((item) => item !== dayId) : dayIds;
  }

  return [...dayIds, dayId];
}

function manualControlMatchesDj(control: ManualLiveDjControl, dj: StationDj) {
  if (!control.active) return false;
  if (control.stationDjId) return control.stationDjId === dj.id;
  const controlDj = comparableAdminText(control.djName);
  const controlProgram = comparableAdminText(control.programName);
  const djName = comparableAdminText(dj.djName);
  const programName = comparableAdminText(dj.programName);

  return Boolean(
    controlDj &&
      djName &&
      controlDj === djName &&
      (!controlProgram || !programName || controlProgram === programName),
  );
}

function formatDjSchedule(dj: StationDj) {
  return `${formatAudienceDayList(dj.dayIds)} · ${dj.startTime} às ${dj.endTime}`;
}

function comparableAdminText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function needsWebpMigration(ad: SiteAd) {
  if (!ad.imageUrl) return false;

  const contentType = String(ad.imageContentType || "").toLowerCase();
  const imageKey = String(ad.imageKey || "").toLowerCase();
  const imageUrl = String(ad.imageUrl || "").toLowerCase();

  if (contentType === "image/webp" || imageKey.endsWith(".webp") || imageUrl.includes(".webp")) return false;
  if (contentType === "image/png" || imageKey.endsWith(".png") || imageUrl.startsWith("data:image/png")) return true;

  return ad.imageUrl.startsWith("/api/ads/image/");
}

async function convertAdImageToWebpPayload(src: string, fileName: string) {
  const response = await fetch(src, { cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível baixar uma imagem antiga para converter.");

  const sourceBlob = await response.blob();
  const sourceUrl = URL.createObjectURL(sourceBlob);

  try {
    const image = await loadImageElement(sourceUrl);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Imagem antiga sem tamanho válido para conversão.");

    const canvas = document.createElement("canvas");
    canvas.width = AD_BANNER_WIDTH;
    canvas.height = AD_BANNER_HEIGHT;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Seu navegador não conseguiu preparar o WebP.");

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#030603";
    context.fillRect(0, 0, AD_BANNER_WIDTH, AD_BANNER_HEIGHT);

    const scale = Math.max(AD_BANNER_WIDTH / image.naturalWidth, AD_BANNER_HEIGHT / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const x = (AD_BANNER_WIDTH - width) / 2;
    const y = (AD_BANNER_HEIGHT - height) / 2;
    context.drawImage(image, x, y, width, height);

    const webpBlob = await canvasToBlob(canvas, "image/webp", 0.84);
    const dataUrl = await blobToDataUrl(webpBlob);

    return {
      fileName: toWebpMigrationFileName(fileName),
      contentType: "image/webp" as const,
      width: AD_BANNER_WIDTH,
      height: AD_BANNER_HEIGHT,
      dataUrl,
      dataBase64: dataUrl.split(",")[1] || "",
      size: webpBlob.size,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível ler uma imagem antiga."));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Não foi possível gerar WebP neste navegador."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível preparar o WebP para upload."));
    reader.readAsDataURL(blob);
  });
}

function toWebpMigrationFileName(fileName: string) {
  const cleanName = fileName.trim().replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "anuncio";
  return `${cleanName}-1700x450.webp`;
}
