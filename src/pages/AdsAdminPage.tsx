import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
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
  savePrograms,
  saveRemoteProgram,
  uploadProgramLogo,
  type ProgramsPayload,
  type StationProgram,
} from "../lib/programs";

type LoginForm = {
  login: string;
  password: string;
};

type UploadState = {
  status: "idle" | "checking" | "ready" | "error";
  message: string;
};

type AdminPanel = "dashboard" | "ads" | "programs";

const adminPanelRoutes: Record<AdminPanel, string> = {
  dashboard: "/ads/dashboard",
  ads: "/ads/anuncios",
  programs: "/ads/programacao",
};

const localAdminPayload = (message?: string): AdsPayload => ({
  ads: loadAds(),
  settings: loadAdSettings(),
  source: "local",
  fetchedAt: new Date().toISOString(),
  message,
});

const localProgramPayload = (message?: string): ProgramsPayload => localProgramsPayload(message);

function panelFromPath(pathname: string): AdminPanel | null {
  const cleanPath = pathname.replace(/\/+$/, "");
  if (cleanPath === "/ads" || cleanPath === "/ads/dashboard") return "dashboard";
  if (cleanPath === "/ads/anuncios") return "ads";
  if (cleanPath === "/ads/programacao") return "programs";
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
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [programUploadState, setProgramUploadState] = useState<UploadState>({ status: "idle", message: "" });
  const [actionMessage, setActionMessage] = useState("");
  const [programDraft, setProgramDraft] = useState<StationProgram>(() => emptyProgram());
  const [selectedProgramId, setSelectedProgramId] = useState("");
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

  const ads = data?.ads ?? [];
  const settings = data?.settings ?? loadAdSettings();
  const programs = programData?.programs ?? loadPrograms();
  const currentProgram = programData?.currentProgram;
  const isRemote = Boolean(session && data?.source === "database");
  const isLocalMode = Boolean(session && data?.source === "local");
  const isDisconnected = Boolean(session && data?.source === "fallback");
  const canEditAds = isRemote || isLocalMode;
  const environmentNotice = isLocalMode
    ? "Ambiente local ativo para testes. Os anúncios salvos aqui ficam apenas neste navegador."
    : isDisconnected
      ? data?.message || "Banco global de anúncios não conectado. Ative a API, o banco e o storage no Netlify."
      : "";
  const activeCount = useMemo(() => ads.filter((ad) => ad.active).length, [ads]);
  const activeProgramCount = useMemo(() => programs.filter((program) => program.active).length, [programs]);
  const totalImpressions = useMemo(() => ads.reduce((total, ad) => total + ad.impressions, 0), [ads]);
  const totalClicks = useMemo(() => ads.reduce((total, ad) => total + ad.clicks, 0), [ads]);
  const activePanel = panelFromPath(location.pathname);

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
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["ads-admin"] });
    void queryClient.invalidateQueries({ queryKey: ["public-ads"] });
    void queryClient.invalidateQueries({ queryKey: ["programs-admin"] });
  };

  const persistLocalAds = (nextAds: SiteAd[]) => {
    saveAds(nextAds.slice(0, MAX_ADS));
    refresh();
  };

  const persistLocalPrograms = (nextPrograms: StationProgram[]) => {
    savePrograms(nextPrograms);
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
      if (file.type !== "image/png" && file.type !== "image/webp") throw new Error("Envie uma logo PNG ou WebP.");
      const size = await readImageSize(file);
      if (file.size > 2_500_000) throw new Error("A logo precisa ter até 2,5 MB.");
      if (size.width > 1800 || size.height > 1800) throw new Error("A logo precisa ter até 1800px de largura e altura.");

      const dataUrl = await readFileAsDataUrl(file);
      if (isRemote && session) {
        const image = await uploadProgramLogo(session.token, {
          fileName: file.name,
          contentType: file.type,
          width: size.width,
          height: size.height,
          dataBase64: dataUrl.split(",")[1] || "",
        });
        setProgramDraft((current) => ({ ...current, logoUrl: image.imageUrl, logoKey: image.imageKey }));
      } else {
        setProgramDraft((current) => ({ ...current, logoUrl: dataUrl, logoKey: file.name }));
      }
      setProgramUploadState({ status: "ready", message: "Logo anexada ao programa." });
    } catch (error) {
      setProgramUploadState({
        status: "error",
        message: error instanceof Error ? error.message : "Não foi possível validar a logo.",
      });
    } finally {
      event.currentTarget.value = "";
    }
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
          <button className="ghost-button" type="button" onClick={refresh} disabled={isFetching || isFetchingPrograms}>
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
              <strong>{totalImpressions}</strong>
              <span>exibições</span>
            </article>
            <article>
              <strong>{totalClicks}</strong>
              <span>cliques</span>
            </article>
            <article>
              <strong>{programs.length}</strong>
              <span>programas cadastrados</span>
            </article>
            <article>
              <strong>{activeProgramCount}</strong>
              <span>programas ativos</span>
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
          </section>
        </>
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
                    <small>{ad.impressions} exibições · {ad.clicks} cliques</small>
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
              <span>Até 1800px e 2,5 MB. Ela aparece quando não houver capa de álbum.</span>
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
