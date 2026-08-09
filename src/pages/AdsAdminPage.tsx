import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
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
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
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

type LoginForm = {
  login: string;
  password: string;
};

type UploadState = {
  status: "idle" | "checking" | "ready" | "error";
  message: string;
};

const localAdminPayload = (message?: string): AdsPayload => ({
  ads: loadAds(),
  settings: loadAdSettings(),
  source: "local",
  fetchedAt: new Date().toISOString(),
  message,
});

export function AdsAdminPage() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AdminSession | null>(() => getAdminSession());
  const [loginForm, setLoginForm] = useState<LoginForm>({ login: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [draft, setDraft] = useState<SiteAd>(() => emptyAd());
  const [selectedId, setSelectedId] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle", message: "" });
  const [actionMessage, setActionMessage] = useState("");
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

  const ads = data?.ads ?? [];
  const settings = data?.settings ?? loadAdSettings();
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
  const totalImpressions = useMemo(() => ads.reduce((total, ad) => total + ad.impressions, 0), [ads]);
  const totalClicks = useMemo(() => ads.reduce((total, ad) => total + ad.clicks, 0), [ads]);

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
  };

  const persistLocalAds = (nextAds: SiteAd[]) => {
    saveAds(nextAds.slice(0, MAX_ADS));
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
    if (!file) return;

    if (!canEditAds) {
      setUploadState({ status: "error", message: "Conecte o banco global antes de enviar imagens." });
      event.currentTarget.value = "";
      return;
    }

    setUploadState({ status: "checking", message: "Validando PNG..." });

    try {
      if (file.type !== "image/png") throw new Error("Envie um arquivo PNG.");
      const size = await readImageSize(file);
      if (size.width !== AD_BANNER_WIDTH || size.height !== AD_BANNER_HEIGHT) {
        throw new Error(`O PNG precisa ter exatamente ${AD_BANNER_WIDTH} x ${AD_BANNER_HEIGHT}px.`);
      }

      const dataUrl = await readFileAsDataUrl(file);
      if (isRemote && session) {
        const image = await uploadAdImage(session.token, {
          fileName: file.name,
          contentType: file.type,
          width: size.width,
          height: size.height,
          dataBase64: dataUrl.split(",")[1] || "",
        });
        setDraft((current) => ({ ...current, ...image }));
      } else {
        setDraft((current) => ({
          ...current,
          imageUrl: dataUrl,
          imageKey: file.name,
          imageWidth: size.width,
          imageHeight: size.height,
          imageContentType: file.type,
          imageSize: file.size,
        }));
      }
      setUploadState({ status: "ready", message: "Imagem validada e anexada ao anúncio." });
    } catch (error) {
      setUploadState({
        status: "error",
        message: error instanceof Error ? error.message : "Não foi possível validar o PNG.",
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
          <h1>Console de anúncios</h1>
          <p>Acesso administrativo para cadastrar campanhas publicitárias do site.</p>
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

  return (
    <main className="ads-admin-page">
      <header className="admin-top">
        <a href="/" className="back-link">
          <ArrowLeft size={16} /> Voltar ao site
        </a>
        <div>
          <span>Painel publicitário</span>
          <h1>Gerenciador de anúncios</h1>
        </div>
        <div className="admin-top-actions">
          <span className={isRemote ? "source-pill is-remote" : isLocalMode ? "source-pill is-local" : "source-pill is-offline"}>
            {isRemote ? <Database size={15} /> : isLocalMode ? <HardDrive size={15} /> : <AlertTriangle size={15} />}
            {isRemote ? "Banco global" : isLocalMode ? "Modo local" : "Banco pendente"}
          </span>
          <button className="ghost-button" type="button" onClick={refresh} disabled={isFetching}>
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
      </section>

      <section className="admin-specs">
        <article>
          <span>Imagem principal</span>
          <strong>{AD_BANNER_WIDTH} x {AD_BANNER_HEIGHT}</strong>
          <p>PNG horizontal obrigatório para o espaço “Anuncie aqui”.</p>
        </article>
        <article>
          <span>Arquivos</span>
          <strong>Blobs</strong>
          <p>Em produção, o PNG vai para storage e o banco guarda só os metadados.</p>
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
            <strong>Enviar PNG {AD_BANNER_WIDTH} x {AD_BANNER_HEIGHT}</strong>
            <span>Use o banner horizontal final do anunciante.</span>
            <input type="file" accept="image/png" onChange={handleImageFile} disabled={!canEditAds} />
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
                <option value="banner">Janela Anuncie</option>
                <option value="sponsor">Patrocinador</option>
                <option value="general">Geral</option>
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
  if (value === "sponsor") return "Patrocinador";
  if (value === "general") return "Geral";
  return "Janela Anuncie";
}
