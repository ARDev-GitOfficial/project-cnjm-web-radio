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
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Navigate, NavLink, useLocation } from "react-router-dom";
import { AdImageCropper, type CroppedAdImage } from "../components/AdImageCropper";
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
  loadAdSettings,
  loadAds,
  loginAdsAdmin,
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
  fetchAdminDjs,
  loadDjs,
  LIVE_TEST_DEFAULT_LISTENERS,
  LIVE_TEST_DEFAULT_LIVE_BOOST,
  LIVE_TEST_DEFAULT_GROWTH,
  LIVE_TEST_DEFAULT_MOVEMENT,
  LIVE_TEST_DEFAULT_VISITORS,
  LIVE_TEST_MAX_GROWTH_PERCENT,
  LIVE_TEST_MAX_LISTENERS,
  LIVE_TEST_MAX_PERCENT,
  LIVE_TEST_MAX_VISITORS,
  localDjsPayload,
  nextLiveStatusTest,
  normalizeDj,
  readLiveStatusTest,
  resolveLiveStatusTestMetrics,
  saveDjs,
  saveRemoteDj,
  writeLiveStatusTest,
  type DjsPayload,
  type LiveStatusTestPayload,
  type StationDj,
} from "../lib/liveDjs";

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

type AdminPanel = "dashboard" | "ads" | "programs" | "djs" | "visits";

type LiveMetricDraft = {
  listeners: string;
  visitors: string;
  movementPercent: string;
  liveBoostPercent: string;
  growthPercent: string;
};

const adminPanelRoutes: Record<AdminPanel, string> = {
  dashboard: "/ads/dashboard",
  ads: "/ads/anuncios",
  programs: "/ads/programacao",
  djs: "/ads/djs",
  visits: "/ads/visitas",
};

const liveStatusOptions: Array<{
  state: LiveStatusTestPayload["state"];
  label: string;
  icon: typeof Radio;
}> = [
  { state: "online", label: "Online", icon: Radio },
  { state: "live", label: "Ao vivo", icon: Activity },
  { state: "connecting", label: "Conectando", icon: RefreshCw },
  { state: "offline", label: "Fora do ar", icon: Power },
  { state: "off", label: "Dados reais", icon: Database },
];

const localAdminPayload = (message?: string): AdsPayload => ({
  ads: loadAds(),
  settings: loadAdSettings(),
  source: "local",
  fetchedAt: new Date().toISOString(),
  message,
});

const localProgramPayload = (message?: string): ProgramsPayload => localProgramsPayload(message);

const localDjPayload = (message?: string): DjsPayload => localDjsPayload(message);

function panelFromPath(pathname: string): AdminPanel | null {
  const cleanPath = pathname.replace(/\/+$/, "");
  if (cleanPath === "/ads" || cleanPath === "/ads/dashboard") return "dashboard";
  if (cleanPath === "/ads/anuncios") return "ads";
  if (cleanPath === "/ads/programacao") return "programs";
  if (cleanPath === "/ads/djs") return "djs";
  if (cleanPath === "/ads/visitas") return "visits";
  return null;
}

export function AdsAdminPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
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
  const [liveTest, setLiveTest] = useState<LiveStatusTestPayload>(() => readLiveStatusTest());
  const [liveMetricDraft, setLiveMetricDraft] = useState<LiveMetricDraft>(() => liveMetricDraftFromPayload(readLiveStatusTest()));
  const [simulationNow, setSimulationNow] = useState(() => Date.now());
  const { data, isFetching } = useQuery({
    queryKey: ["ads-admin", session?.token, session?.source],
    enabled: Boolean(session),
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
        const message = error instanceof Error ? error.message : "Banco global indisponível.";
        return canUseLocalFallback() ? localAdminPayload(message) : unavailableAdsPayload(message);
      }
    },
  });
  const { data: programData, isFetching: isFetchingPrograms } = useQuery({
    queryKey: ["programs-admin", session?.token, session?.source],
    enabled: Boolean(session),
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
        const message = error instanceof Error ? error.message : "Banco global indisponível.";
        return canUseLocalFallback() ? localProgramPayload(message) : localProgramPayload(message);
      }
    },
  });
  const { data: djData, isFetching: isFetchingDjs } = useQuery({
    queryKey: ["djs-admin", session?.token, session?.source],
    enabled: Boolean(session),
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
        const message = error instanceof Error ? error.message : "Banco global indisponível.";
        return canUseLocalFallback() ? localDjPayload(message) : localDjPayload(message);
      }
    },
  });

  const ads = data?.ads ?? [];
  const settings = data?.settings ?? loadAdSettings();
  const programs = programData?.programs ?? loadPrograms();
  const currentProgram = programData?.currentProgram;
  const djs = djData?.djs ?? loadDjs();
  const isRemote = Boolean(session && data?.source === "database");
  const isLocalMode = Boolean(session && data?.source === "local");
  const isDisconnected = Boolean(session && data?.source === "fallback");
  const canManageLocalMetrics = Boolean(session && canUseLocalFallback());
  const canEditAds = isRemote || isLocalMode;
  const environmentNotice = isLocalMode
    ? "Ambiente local ativo para testes. Os anúncios salvos aqui ficam apenas neste navegador."
    : isDisconnected
      ? data?.message || "Banco global de anúncios não conectado. Ative a API, o banco e o storage no Netlify."
      : "";
  const activeCount = useMemo(() => ads.filter((ad) => ad.active).length, [ads]);
  const webpMigrationAds = useMemo(() => ads.filter(needsWebpMigration), [ads]);
  const activeProgramCount = useMemo(() => programs.filter((program) => program.active).length, [programs]);
  const activeDjCount = useMemo(() => djs.filter((dj) => dj.active).length, [djs]);
  const linkedAdsCount = useMemo(() => ads.filter((ad) => ad.linkUrl).length, [ads]);
  const totalClicks = useMemo(() => ads.reduce((total, ad) => total + ad.clicks, 0), [ads]);
  const activePanel = panelFromPath(location.pathname);
  const resolvedLiveMetrics = useMemo(
    () => resolveLiveStatusTestMetrics(liveTest, simulationNow),
    [liveTest, simulationNow],
  );
  const visitWaveBars = useMemo(() => makeVisitWaveBars(liveTest, simulationNow), [liveTest, simulationNow]);
  const isSimulationActive = liveTest.state !== "off";

  useEffect(() => {
    setLiveMetricDraft(liveMetricDraftFromPayload(liveTest));
  }, [
    liveTest.listeners,
    liveTest.visitors,
    liveTest.movementPercent,
    liveTest.liveBoostPercent,
    liveTest.growthPercent,
  ]);

  useEffect(() => {
    if (liveTest.state === "off") return undefined;
    const timer = window.setInterval(() => setSimulationNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, [liveTest.state]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");

    try {
      const nextSession = await loginAdsAdmin(loginForm.login, loginForm.password);
      setSession(nextSession);
      setActionMessage(nextSession.source === "database" ? "Banco conectado." : "Modo local ativo para testes.");
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
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["ads-admin"] });
    void queryClient.invalidateQueries({ queryKey: ["public-ads"] });
    void queryClient.invalidateQueries({ queryKey: ["programs-admin"] });
    void queryClient.invalidateQueries({ queryKey: ["djs-admin"] });
  };

  const persistLocalAds = (nextAds: SiteAd[]) => {
    saveAds(nextAds.slice(0, MAX_ADS));
    refresh();
  };

  const persistLocalPrograms = (nextPrograms: StationProgram[]) => {
    savePrograms(nextPrograms);
    refresh();
  };

  const persistLocalDjs = (nextDjs: StationDj[]) => {
    saveDjs(nextDjs);
    refresh();
  };

  const persistSettings = async (nextSettings: Partial<AdSettings>) => {
    const normalized = normalizeAdSettings({ ...settings, ...nextSettings });
    setActionMessage("");

    if (!canEditAds) {
      setActionMessage("Conecte o banco global antes de alterar a configuração de anúncios.");
      return;
    }

    try {
      if (isRemote && session) {
        await saveRemoteSettings(session.token, normalized);
      } else {
        saveAdSettings(normalized);
      }
      setActionMessage("Configuração salva.");
      refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Não foi possível salvar a configuração.");
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
    const normalized = normalizeAd({ ...draft, updatedAt: new Date().toISOString() });
    if (!canEditAds) {
      setActionMessage("Conecte o banco global antes de salvar anúncios.");
      return;
    }
    if (!normalized.title && !normalized.description && !normalized.imageUrl) {
      setActionMessage("Preencha pelo menos título, texto ou imagem.");
      return;
    }

    try {
      if (isRemote && session) {
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
      refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Não foi possível salvar o anúncio.");
    }
  };

  const removeAd = async (id: string) => {
    if (!canEditAds) {
      setActionMessage("Conecte o banco global antes de excluir anúncios.");
      return;
    }

    try {
      if (isRemote && session) {
        await deleteRemoteAd(session.token, id);
      } else {
        persistLocalAds(ads.filter((ad) => ad.id !== id));
      }
      if (selectedId === id) newAd();
      setActionMessage("Anúncio removido.");
      refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Não foi possível excluir o anúncio.");
    }
  };

  const toggleAd = async (ad: SiteAd) => {
    if (!canEditAds) {
      setActionMessage("Conecte o banco global antes de ativar ou desativar anúncios.");
      return;
    }

    const next = normalizeAd({ ...ad, active: !ad.active, updatedAt: new Date().toISOString() });
    try {
      if (isRemote && session) {
        await saveRemoteAd(session.token, next);
      } else {
        persistLocalAds(ads.map((item) => (item.id === ad.id ? next : item)));
      }
      setActionMessage(next.active ? "Anúncio ativado." : "Anúncio desativado.");
      refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Não foi possível alterar o anúncio.");
    }
  };

  const handleImageFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    if (!canEditAds) {
      setUploadState({ status: "error", message: "Conecte o banco global antes de enviar imagens." });
      return;
    }

    if (!file.type.startsWith("image/")) {
      setUploadState({ status: "error", message: "Envie uma imagem PNG, JPG ou WebP." });
      return;
    }

    setCropFile(file);
    setUploadState({ status: "checking", message: "Ajuste o corte antes de anexar o anúncio." });
  };

  const applyCroppedAdImage = async (image: CroppedAdImage) => {
    if (!canEditAds) {
      setUploadState({ status: "error", message: "Conecte o banco global antes de enviar imagens." });
      return;
    }

    setUploadState({ status: "checking", message: "Enviando WebP otimizado..." });

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
        message: image.wasUpscaled
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
        message: "Conecte o banco global antes de converter anúncios.",
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
      refresh();
    } catch (error) {
      setConversionState({
        status: "error",
        message: error instanceof Error ? error.message : "Não foi possível converter todos os anúncios.",
        done: convertedCount,
        total: pendingAds.length,
      });
      refresh();
    }
  };

  const saveProgramDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeProgram({ ...programDraft, updatedAt: new Date().toISOString() });
    if (!canEditAds) {
      setActionMessage("Conecte o banco global antes de salvar a programação.");
      return;
    }
    if (!normalized.program) {
      setActionMessage("Informe o nome do programa.");
      return;
    }

    try {
      if (isRemote && session) {
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
      refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Não foi possível salvar o programa.");
    }
  };

  const removeProgram = async (id: string) => {
    if (!canEditAds) {
      setActionMessage("Conecte o banco global antes de excluir programas.");
      return;
    }

    try {
      if (isRemote && session) {
        await deleteRemoteProgram(session.token, id);
      } else {
        persistLocalPrograms(programs.filter((program) => program.id !== id));
      }
      if (selectedProgramId === id) newProgram();
      setActionMessage("Programa removido.");
      refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Não foi possível excluir o programa.");
    }
  };

  const toggleProgram = async (program: StationProgram) => {
    const next = normalizeProgram({ ...program, active: !program.active, updatedAt: new Date().toISOString() });
    try {
      if (isRemote && session) {
        await saveRemoteProgram(session.token, next);
      } else {
        persistLocalPrograms(programs.map((item) => (item.id === program.id ? next : item)));
      }
      setActionMessage(next.active ? "Programa ativado." : "Programa desativado.");
      refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Não foi possível alterar o programa.");
    }
  };

  const handleProgramLogoFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    setProgramUploadState({ status: "checking", message: "Validando logo..." });

    try {
      const sourceType = imageContentTypeForFile(file);
      if (sourceType !== "image/png" && sourceType !== "image/webp") throw new Error("Envie uma logo PNG ou WebP.");
      const size = await readImageSize(file);
      if (file.size > PROGRAM_LOGO_MAX_SIZE) throw new Error("A logo precisa ter até 2,5 MB.");
      if (size.width > PROGRAM_LOGO_MAX_DIMENSION || size.height > PROGRAM_LOGO_MAX_DIMENSION) {
        throw new Error(`A logo precisa ter até ${PROGRAM_LOGO_MAX_DIMENSION}px de largura e altura.`);
      }

      if (sourceType === "image/png") {
        setProgramUploadState({ status: "checking", message: "Convertendo PNG para WebP..." });
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
        message: logo.converted ? "PNG convertido e logo WebP anexada ao programa." : "Logo WebP anexada ao programa.",
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

  const editDj = (dj: StationDj) => {
    setDjDraft(dj);
    setSelectedDjId(dj.id);
    setActionMessage("");
  };

  const newDj = () => {
    const fresh = emptyDj();
    setDjDraft(fresh);
    setSelectedDjId("");
    setActionMessage("");
  };

  const saveDjDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeDj({ ...djDraft, updatedAt: new Date().toISOString() });
    if (!canEditAds) {
      setActionMessage("Conecte o banco global antes de salvar DJs.");
      return;
    }
    if (!normalized.signatures || !normalized.djName || !normalized.programName) {
      setActionMessage("Informe assinatura, nome público do DJ e nome do programa.");
      return;
    }

    try {
      if (isRemote && session) {
        const saved = await saveRemoteDj(session.token, normalized);
        setDjDraft(saved);
        setSelectedDjId(saved.id);
      } else {
        const exists = djs.some((dj) => dj.id === normalized.id);
        const nextDjs = exists ? djs.map((dj) => (dj.id === normalized.id ? normalized : dj)) : [normalized, ...djs];
        persistLocalDjs(nextDjs);
        setSelectedDjId(normalized.id);
      }
      setActionMessage("DJ ao vivo salvo.");
      refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Não foi possível salvar o DJ.");
    }
  };

  const removeDj = async (id: string) => {
    if (!canEditAds) {
      setActionMessage("Conecte o banco global antes de excluir DJs.");
      return;
    }

    try {
      if (isRemote && session) {
        await deleteRemoteDj(session.token, id);
      } else {
        persistLocalDjs(djs.filter((dj) => dj.id !== id));
      }
      if (selectedDjId === id) newDj();
      setActionMessage("DJ removido.");
      refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Não foi possível excluir o DJ.");
    }
  };

  const toggleDj = async (dj: StationDj) => {
    const next = normalizeDj({ ...dj, active: !dj.active, updatedAt: new Date().toISOString() });
    try {
      if (isRemote && session) {
        await saveRemoteDj(session.token, next);
      } else {
        persistLocalDjs(djs.map((item) => (item.id === dj.id ? next : item)));
      }
      setActionMessage(next.active ? "DJ ativado." : "DJ desativado.");
      refresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Não foi possível alterar o DJ.");
    }
  };

  const cycleLiveStatusTest = () => {
    const next = nextLiveStatusTest(liveTest, djs.find((dj) => dj.active));
    writeLiveStatusTest(next);
    setLiveTest(next);
    if (next.state === "off") {
      setActionMessage("Modo de teste desligado. A rádio voltou a usar os dados reais.");
      return;
    }
    setActionMessage(
      next.state === "live"
        ? `Teste aplicado: NO AR com ${next.djName} / ${next.programName}.`
        : `Teste aplicado: ${liveTestLabel(next.state)}.`,
    );
  };

  const applyLiveMetricTest = () => {
    if (!canManageLocalMetrics) {
      setActionMessage("Esse controle fica disponível apenas no teste local.");
      return;
    }

    const listeners = parseLiveMetric(
      liveMetricDraft.listeners,
      liveTest.listeners ?? LIVE_TEST_DEFAULT_LISTENERS,
      LIVE_TEST_MAX_LISTENERS,
    );
    const visitors = parseLiveMetric(
      liveMetricDraft.visitors,
      liveTest.visitors ?? LIVE_TEST_DEFAULT_VISITORS,
      LIVE_TEST_MAX_VISITORS,
    );
    const movementPercent = parseLiveMetric(
      liveMetricDraft.movementPercent,
      liveTest.movementPercent ?? LIVE_TEST_DEFAULT_MOVEMENT,
      LIVE_TEST_MAX_PERCENT,
    );
    const liveBoostPercent = parseLiveMetric(
      liveMetricDraft.liveBoostPercent,
      liveTest.liveBoostPercent ?? LIVE_TEST_DEFAULT_LIVE_BOOST,
      LIVE_TEST_MAX_PERCENT,
    );
    const growthPercent = parseLiveMetric(
      liveMetricDraft.growthPercent,
      liveTest.growthPercent ?? LIVE_TEST_DEFAULT_GROWTH,
      LIVE_TEST_MAX_GROWTH_PERCENT,
    );
    const next: LiveStatusTestPayload = {
      ...liveTest,
      state: liveTest.state === "off" ? "online" : liveTest.state,
      listeners,
      visitors,
      movementPercent,
      liveBoostPercent,
      growthPercent,
      seed: liveTest.seed ?? nextSimulationSeed(),
      updatedAt: new Date().toISOString(),
    };

    writeLiveStatusTest(next);
    const normalized = readLiveStatusTest();
    setLiveTest(normalized);
    setLiveMetricDraft(liveMetricDraftFromPayload(normalized));
    setSimulationNow(Date.now());
    setActionMessage("Visualizações e visitas locais aplicadas no site.");
  };

  const changeLiveSimulationState = (state: LiveStatusTestPayload["state"]) => {
    if (!canManageLocalMetrics) {
      setActionMessage("Esse controle fica disponível apenas no teste local.");
      return;
    }

    const next: LiveStatusTestPayload = {
      ...liveTest,
      state,
      seed: liveTest.seed ?? nextSimulationSeed(),
      updatedAt: state === "off" ? liveTest.updatedAt : new Date().toISOString(),
    };

    writeLiveStatusTest(next);
    const normalized = readLiveStatusTest();
    setLiveTest(normalized);
    setLiveMetricDraft(liveMetricDraftFromPayload(normalized));
    setSimulationNow(Date.now());
    setActionMessage(state === "off" ? "Simulação local desligada." : `Simulação local em estado: ${liveTestLabel(state)}.`);
  };

  const shuffleLiveSimulation = () => {
    if (!canManageLocalMetrics) {
      setActionMessage("Esse controle fica disponível apenas no teste local.");
      return;
    }

    const next: LiveStatusTestPayload = {
      ...liveTest,
      state: liveTest.state === "off" ? "online" : liveTest.state,
      seed: nextSimulationSeed(),
      updatedAt: new Date().toISOString(),
    };

    writeLiveStatusTest(next);
    const normalized = readLiveStatusTest();
    setLiveTest(normalized);
    setSimulationNow(Date.now());
    setActionMessage("Nova variação local gerada.");
  };

  const resetLiveMetricTest = () => {
    const next: LiveStatusTestPayload = {
      ...liveTest,
      state: "off",
      listeners: LIVE_TEST_DEFAULT_LISTENERS,
      visitors: LIVE_TEST_DEFAULT_VISITORS,
      movementPercent: LIVE_TEST_DEFAULT_MOVEMENT,
      liveBoostPercent: LIVE_TEST_DEFAULT_LIVE_BOOST,
      growthPercent: LIVE_TEST_DEFAULT_GROWTH,
      seed: nextSimulationSeed(),
      updatedAt: new Date().toISOString(),
    };

    writeLiveStatusTest(next);
    const normalized = readLiveStatusTest();
    setLiveTest(normalized);
    setLiveMetricDraft(liveMetricDraftFromPayload(normalized));
    setSimulationNow(Date.now());
    setActionMessage("Simulação local desligada. O site voltou aos dados reais.");
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
            {isRemote ? "Banco global" : isLocalMode ? "Modo local" : "Banco pendente"}
          </span>
          <button className="ghost-button" type="button" onClick={refresh} disabled={isFetching || isFetchingPrograms || isFetchingDjs}>
            <RefreshCw size={16} /> Atualizar
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
        <NavLink className={activePanel === "visits" ? "is-active" : ""} to={adminPanelRoutes.visits}>
          <UsersRound size={16} /> Visitas
        </NavLink>
      </nav>

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
            <article className="live-test-panel">
              <span><Mic2 size={15} /> Teste do ao vivo</span>
              <strong>{liveTest.state === "off" ? "Dados reais" : liveTestLabel(liveTest.state)}</strong>
              <p>{liveTest.state === "live" ? `${liveTest.djName || "DJ ao vivo"} · ${liveTest.programName || "Programa Ao Vivo"}` : "Alterne o topo e o player para validar cores, nomes e estados antes do deploy."}</p>
              <div className="live-test-actions">
                <button className="ghost-button" type="button" onClick={cycleLiveStatusTest}>
                  <RefreshCw size={16} /> Alternar status
                </button>
                <button className="ghost-button" type="button" onClick={resetLiveMetricTest} disabled={liveTest.state === "off"}>
                  Dados reais
                </button>
              </div>
            </article>
            <article className="live-test-panel live-metrics-panel">
              <span><UsersRound size={15} /> Visualizações e visitas</span>
              <strong>
                {liveTest.state === "off"
                  ? "Simulação desligada"
                  : `${formatAdminNumber(resolvedLiveMetrics.listeners)} online`}
              </strong>
              <p>{liveTest.state === "off" ? "Abra a central para simular público no ambiente local." : `${formatAdminNumber(resolvedLiveMetrics.visitors)} visitantes no topo agora.`}</p>
              <div className="live-test-actions">
                <NavLink className="ghost-button" to={adminPanelRoutes.visits}>
                  <SlidersHorizontal size={16} /> Abrir central
                </NavLink>
              </div>
            </article>
          </section>
        </>
      ) : null}

      {activePanel === "visits" ? (
        <section className="visit-admin-page">
          <section className="visit-hero-panel">
            <div>
              <span>
                <UsersRound size={15} /> Central de visitas
              </span>
              <h2>Gerenciamento local de público</h2>
              <p>Controle como os números aparecem no topo do site durante testes locais, sem salvar nada no banco global.</p>
            </div>
            <div className={isSimulationActive ? "visit-live-badge is-active" : "visit-live-badge"}>
              <span>{isSimulationActive ? liveTestLabel(liveTest.state) : "Dados reais"}</span>
              <strong>{formatAdminNumber(resolvedLiveMetrics.listeners)}</strong>
              <small>ouvintes agora</small>
            </div>
          </section>

          <section className="visit-kpi-grid">
            <article>
              <span><Radio size={15} /> Online</span>
              <strong>{formatAdminNumber(resolvedLiveMetrics.listeners)}</strong>
              <small>número atual simulado</small>
            </article>
            <article>
              <span><UsersRound size={15} /> Visitantes</span>
              <strong>{formatAdminNumber(resolvedLiveMetrics.visitors)}</strong>
              <small>contador exibido no topo</small>
            </article>
            <article>
              <span><Activity size={15} /> Movimento</span>
              <strong>{liveMetricDraft.movementPercent}%</strong>
              <small>entrada e saída de ouvintes</small>
            </article>
            <article>
              <span><TrendingUp size={15} /> Ao vivo</span>
              <strong>{liveMetricDraft.liveBoostPercent}%</strong>
              <small>ganho quando o estado for ao vivo</small>
            </article>
          </section>

          <section className="visit-admin-grid">
            <form className="visit-control-panel" onSubmit={(event) => event.preventDefault()}>
              <div className="editor-head">
                <div>
                  <span>
                    <SlidersHorizontal size={15} /> Motor da simulação
                  </span>
                  <h2>Controle fino</h2>
                </div>
              </div>

              <div className="visit-status-grid" aria-label="Estado do site">
                {liveStatusOptions.map(({ state, label, icon: Icon }) => (
                  <button
                    key={state}
                    className={liveTest.state === state ? "visit-status-button is-active" : "visit-status-button"}
                    type="button"
                    onClick={() => changeLiveSimulationState(state)}
                    disabled={!canManageLocalMetrics}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>

              <div className="visit-field-grid">
                <label>
                  Ouvintes base
                  <input
                    type="number"
                    min="0"
                    max={LIVE_TEST_MAX_LISTENERS}
                    value={liveMetricDraft.listeners}
                    onChange={(event) => {
                      const { value } = event.currentTarget;
                      setLiveMetricDraft((current) => ({ ...current, listeners: value }));
                    }}
                    disabled={!canManageLocalMetrics}
                  />
                </label>
                <label>
                  Visitantes base
                  <input
                    type="number"
                    min="0"
                    max={LIVE_TEST_MAX_VISITORS}
                    value={liveMetricDraft.visitors}
                    onChange={(event) => {
                      const { value } = event.currentTarget;
                      setLiveMetricDraft((current) => ({ ...current, visitors: value }));
                    }}
                    disabled={!canManageLocalMetrics}
                  />
                </label>
              </div>

              <div className="visit-range-stack">
                <label>
                  <span>Força do movimento <strong>{liveMetricDraft.movementPercent}%</strong></span>
                  <input
                    type="range"
                    min="0"
                    max={LIVE_TEST_MAX_PERCENT}
                    value={liveMetricDraft.movementPercent}
                    onChange={(event) => {
                      const { value } = event.currentTarget;
                      setLiveMetricDraft((current) => ({ ...current, movementPercent: value }));
                    }}
                    disabled={!canManageLocalMetrics}
                  />
                </label>
                <label>
                  <span>Impulso quando estiver ao vivo <strong>{liveMetricDraft.liveBoostPercent}%</strong></span>
                  <input
                    type="range"
                    min="0"
                    max={LIVE_TEST_MAX_PERCENT}
                    value={liveMetricDraft.liveBoostPercent}
                    onChange={(event) => {
                      const { value } = event.currentTarget;
                      setLiveMetricDraft((current) => ({ ...current, liveBoostPercent: value }));
                    }}
                    disabled={!canManageLocalMetrics}
                  />
                </label>
                <label>
                  <span>Crescimento das visitas <strong>{liveMetricDraft.growthPercent}%</strong></span>
                  <input
                    type="range"
                    min="0"
                    max={LIVE_TEST_MAX_GROWTH_PERCENT}
                    value={liveMetricDraft.growthPercent}
                    onChange={(event) => {
                      const { value } = event.currentTarget;
                      setLiveMetricDraft((current) => ({ ...current, growthPercent: value }));
                    }}
                    disabled={!canManageLocalMetrics}
                  />
                </label>
              </div>

              <div className="visit-control-actions">
                <button className="play-main slim" type="button" onClick={applyLiveMetricTest} disabled={!canManageLocalMetrics}>
                  <Save size={16} /> Aplicar no local
                </button>
                <button className="ghost-button" type="button" onClick={shuffleLiveSimulation} disabled={!canManageLocalMetrics}>
                  <RefreshCw size={16} /> Nova variação
                </button>
                <button className="ghost-button" type="button" onClick={resetLiveMetricTest} disabled={!canManageLocalMetrics || liveTest.state === "off"}>
                  <Power size={16} /> Dados reais
                </button>
              </div>
            </form>

            <aside className="visit-preview-panel">
              <div className="editor-head">
                <div>
                  <span>
                    <BarChart3 size={15} /> Prévia do topo
                  </span>
                  <h2>Resultado no site</h2>
                </div>
              </div>
              <div className="visit-top-preview">
                <span className={visitPreviewStatusClassName(liveTest.state)}>
                  <strong>{isSimulationActive ? liveTestLabel(liveTest.state) : "REAIS"}</strong>
                </span>
                <div>
                  <small>Online</small>
                  <strong>{formatAdminNumber(resolvedLiveMetrics.listeners)}</strong>
                </div>
                <div>
                  <small>Visitantes</small>
                  <strong>{formatAdminNumber(resolvedLiveMetrics.visitors)}</strong>
                </div>
              </div>
              <div className="visit-wave-preview" aria-hidden="true">
                {visitWaveBars.map((height, index) => (
                  <span key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="visit-rule-list">
                <p><Activity size={15} /> Ouvintes oscilam para cima e para baixo conforme a força do movimento.</p>
                <p><TrendingUp size={15} /> Visitantes crescem aos poucos a partir do número base.</p>
                <p><Radio size={15} /> O estado “Ao vivo” aplica impulso extra automaticamente.</p>
              </div>
            </aside>
          </section>
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
          <p>Em produção, o WebP vai para storage e o banco guarda só os metadados.</p>
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
          <strong>{webpMigrationAds.length ? `${webpMigrationAds.length} imagem(ns) antiga(s) em PNG` : "Anúncios otimizados em WebP"}</strong>
          <span>
            {webpMigrationAds.length
              ? "Converta os anúncios cadastrados no banco para WebP e libere os blobs antigos quando o registro for salvo."
              : "Novos uploads já saem em WebP 1700 x 450px."}
          </span>
          {conversionState.message ? (
            <small className={conversionState.status === "error" ? "form-warning" : "upload-ok"}>
              {conversionState.message}
            </small>
          ) : null}
        </div>
        <button
          className="ghost-button"
          type="button"
          disabled={!webpMigrationAds.length || !canEditAds || conversionState.status === "checking"}
          onClick={() => {
            void convertExistingAdsToWebp();
          }}
        >
          <RefreshCw size={16} />
          {conversionState.status === "checking" ? `${conversionState.done}/${conversionState.total}` : "Converter para WebP"}
        </button>
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
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageFile} disabled={!canEditAds} />
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
            URL manual da imagem
            <input
              value={draft.imageUrl.startsWith("data:") ? "" : draft.imageUrl}
              onChange={(event) => setDraft({ ...draft, imageUrl: event.currentTarget.value })}
              placeholder="https://dominio.com/anuncio-1700x450.webp"
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
              <span>PNG vira WebP. WebP pronto também é aceito, até 1800px e 2,5 MB.</span>
              <input type="file" accept="image/png,image/webp" onChange={handleProgramLogoFile} disabled={!canEditAds} />
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
              URL manual da logo
              <input
                value={programDraft.logoUrl.startsWith("data:") ? "" : programDraft.logoUrl}
                onChange={(event) => setProgramDraft({ ...programDraft, logoUrl: event.currentTarget.value })}
                placeholder="https://dominio.com/logo-programa.webp"
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
        <section className="admin-grid dj-admin-grid">
          <form className="ad-editor" onSubmit={saveDjDraft}>
            <div className="editor-head">
              <div>
                <span>{selectedDjId ? "Editando DJ" : "Novo DJ ao vivo"}</span>
                <h2>Detecção de transmissão</h2>
              </div>
              <button type="button" className="ghost-button" onClick={newDj} disabled={!canEditAds}>
                <Plus size={16} /> Novo
              </button>
            </div>

            <label>
              Assinaturas vindas da API
              <textarea
                rows={5}
                value={djDraft.signatures}
                onChange={(event) => setDjDraft({ ...djDraft, signatures: event.currentTarget.value })}
                placeholder={"djleo:1234\ndjleo"}
              />
            </label>
            <small>Cadastre uma assinatura por linha. O site compara esses valores com os campos do servidor de rádio.</small>

            <label>
              Nome público do DJ
              <input
                value={djDraft.djName}
                onChange={(event) => setDjDraft({ ...djDraft, djName: event.currentTarget.value })}
                placeholder="DJ Leo"
              />
            </label>
            <label>
              Programa ao vivo
              <input
                value={djDraft.programName}
                onChange={(event) => setDjDraft({ ...djDraft, programName: event.currentTarget.value })}
                placeholder="Roots Strike"
              />
            </label>
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
            <button className="play-main slim" type="submit" disabled={!canEditAds}>
              <Save size={16} /> Salvar DJ
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
                {djs.map((dj) => (
                  <article key={dj.id} className={dj.active ? "ad-list-item dj-list-item is-active" : "ad-list-item dj-list-item"}>
                    <span className="dj-avatar">
                      <Mic2 size={20} />
                    </span>
                    <div>
                      <strong>{dj.djName || "DJ sem nome"}</strong>
                      <span>{dj.programName || "Programa sem nome"}</span>
                      <small>{dj.active ? "Ativo" : "Desativado"} · {dj.signatures.split("\n").filter(Boolean).length} assinatura(s)</small>
                    </div>
                    <code>{dj.signatures.split("\n").filter(Boolean).join(" · ")}</code>
                    <div className="ad-list-actions">
                      <button type="button" onClick={() => editDj(dj)} aria-label="Editar DJ">
                        Editar
                      </button>
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
                        onClick={() => {
                          void removeDj(dj.id);
                        }}
                        disabled={!canEditAds}
                        aria-label="Excluir DJ"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-admin">
                <strong>Nenhum DJ cadastrado</strong>
                <span>Quando cadastrar um login do AutoDJ, o site poderá trocar música/artista por programa/DJ ao vivo.</span>
              </div>
            )}
          </aside>
        </section>
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
  if (name.endsWith(".webp")) return "image/webp";
  return "";
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

function liveTestLabel(value: LiveStatusTestPayload["state"]) {
  if (value === "live") return "NO AR / AO VIVO";
  if (value === "online") return "ONLINE";
  if (value === "connecting") return "Conectando";
  if (value === "offline") return "Fora do ar";
  return "Dados reais";
}

function liveMetricDraftFromPayload(payload: LiveStatusTestPayload) {
  return {
    listeners: String(payload.listeners ?? LIVE_TEST_DEFAULT_LISTENERS),
    visitors: String(payload.visitors ?? LIVE_TEST_DEFAULT_VISITORS),
    movementPercent: String(payload.movementPercent ?? LIVE_TEST_DEFAULT_MOVEMENT),
    liveBoostPercent: String(payload.liveBoostPercent ?? LIVE_TEST_DEFAULT_LIVE_BOOST),
    growthPercent: String(payload.growthPercent ?? LIVE_TEST_DEFAULT_GROWTH),
  };
}

function parseLiveMetric(value: string, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(0, Math.round(parsed)));
}

function formatAdminNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.max(0, Math.round(value)));
}

function nextSimulationSeed() {
  return Math.max(1, Math.round(Date.now() % 999_999));
}

function makeVisitWaveBars(payload: LiveStatusTestPayload, nowMs: number) {
  const movement = Number(payload.movementPercent ?? LIVE_TEST_DEFAULT_MOVEMENT) / 100;
  const seed = Number(payload.seed ?? 731) / 97;

  return Array.from({ length: 22 }, (_, index) => {
    const point = nowMs / 760 + index * 0.78 + seed;
    const wave = Math.sin(point) * 0.58 + Math.cos(point * 0.62) * 0.34;
    const level = 38 + wave * 26 * Math.max(0.18, movement) + index * 0.6;
    return Math.min(92, Math.max(18, Math.round(level)));
  });
}

function visitPreviewStatusClassName(state: LiveStatusTestPayload["state"]) {
  if (state === "live") return "header-status is-live";
  if (state === "online") return "header-status is-online";
  if (state === "connecting") return "header-status is-connecting";
  return "header-status is-offline";
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
