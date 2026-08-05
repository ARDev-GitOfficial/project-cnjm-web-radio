import {
  ArrowLeft,
  BarChart3,
  Clock3,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Plus,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  ADMIN_LOGIN,
  ADMIN_PASSWORD,
  MAX_ADS,
  emptyAd,
  isAdminSessionActive,
  loadAdSettings,
  loadAds,
  normalizeAd,
  normalizeAdSettings,
  saveAdSettings,
  saveAds,
  setAdminSession,
  type AdSettings,
  type SiteAd,
} from "../lib/ads";

type LoginForm = {
  login: string;
  password: string;
};

export function AdsAdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => isAdminSessionActive());
  const [loginForm, setLoginForm] = useState<LoginForm>({ login: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [settings, setSettings] = useState<AdSettings>(() => loadAdSettings());
  const [ads, setAds] = useState<SiteAd[]>(() => loadAds());
  const [draft, setDraft] = useState<SiteAd>(() => emptyAd());
  const [selectedId, setSelectedId] = useState("");
  const activeCount = useMemo(() => ads.filter((ad) => ad.active).length, [ads]);
  const totalImpressions = useMemo(() => ads.reduce((total, ad) => total + ad.impressions, 0), [ads]);
  const totalClicks = useMemo(() => ads.reduce((total, ad) => total + ad.clicks, 0), [ads]);

  const login = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loginForm.login === ADMIN_LOGIN && loginForm.password === ADMIN_PASSWORD) {
      setAdminSession(true);
      setIsAuthenticated(true);
      setLoginError("");
      return;
    }

    setLoginError("Login ou senha inválidos.");
  };

  const logout = () => {
    setAdminSession(false);
    setIsAuthenticated(false);
    setLoginForm({ login: "", password: "" });
  };

  const persistAds = (nextAds: SiteAd[]) => {
    const limited = nextAds.slice(0, MAX_ADS);
    setAds(limited);
    saveAds(limited);
  };

  const persistSettings = (nextSettings: Partial<AdSettings>) => {
    const normalized = normalizeAdSettings({ ...settings, ...nextSettings });
    setSettings(normalized);
    saveAdSettings(normalized);
  };

  const editAd = (ad: SiteAd) => {
    setDraft(ad);
    setSelectedId(ad.id);
  };

  const newAd = () => {
    const fresh = emptyAd();
    setDraft(fresh);
    setSelectedId("");
  };

  const saveDraft = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeAd({ ...draft, updatedAt: new Date().toISOString() });
    if (!normalized.title && !normalized.description && !normalized.imageUrl) return;

    if (selectedId) {
      persistAds(ads.map((ad) => (ad.id === selectedId ? normalized : ad)));
      return;
    }

    if (ads.length >= MAX_ADS) return;
    persistAds([normalized, ...ads]);
    setSelectedId(normalized.id);
  };

  const removeAd = (id: string) => {
    persistAds(ads.filter((ad) => ad.id !== id));
    if (selectedId === id) newAd();
  };

  const toggleAd = (id: string) => {
    persistAds(ads.map((ad) => (ad.id === id ? { ...ad, active: !ad.active, updatedAt: new Date().toISOString() } : ad)));
  };

  if (!isAuthenticated) {
    return (
      <main className="ads-admin-page login-screen">
        <form className="login-card" onSubmit={login}>
          <a href="/" className="back-link"><ArrowLeft size={16} /> Voltar ao site</a>
          <span className="admin-icon"><Lock size={24} /></span>
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
          <button className="play-main slim" type="submit">Entrar</button>
          {loginError ? <small className="form-warning">{loginError}</small> : null}
        </form>
      </main>
    );
  }

  return (
    <main className="ads-admin-page">
      <header className="admin-top">
        <a href="/" className="back-link"><ArrowLeft size={16} /> Voltar ao site</a>
        <div>
          <span>Painel publicitário</span>
          <h1>Gerenciador de anúncios</h1>
        </div>
        <button className="ghost-button" type="button" onClick={logout}>
          <LogOut size={16} /> Sair
        </button>
      </header>

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
          <span>exibições locais</span>
        </article>
        <article>
          <strong>{totalClicks}</strong>
          <span>cliques locais</span>
        </article>
      </section>

      <section className="admin-specs">
        <article>
          <span>Imagem</span>
          <strong>1600 x 900</strong>
          <p>Formato recomendado: JPG, PNG ou WEBP em proporção 16:9.</p>
        </article>
        <article>
          <span>Exibição</span>
          <strong>Carrossel</strong>
          <p>Os anúncios passam automaticamente e podem ser arrastados no site.</p>
        </article>
        <article>
          <span>Espaço</span>
          <strong>Oculto</strong>
          <p>Sem campanha ativa, a área publicitária não aparece.</p>
        </article>
        <article>
          <span>Limite</span>
          <strong>{MAX_ADS}</strong>
          <p>Quantidade máxima de campanhas cadastradas.</p>
        </article>
      </section>

      <section className="ad-settings-panel">
        <div className="editor-head">
          <div>
            <span><Settings2 size={15} /> Configuração global</span>
            <h2>Exibição dos anúncios</h2>
          </div>
        </div>
        <div className="ad-settings-grid">
          <label className="check-line">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => persistSettings({ enabled: event.currentTarget.checked })}
            />
            Anúncios ativados no site
          </label>
          <label className="check-line">
            <input
              type="checkbox"
              checked={settings.scheduleEnabled}
              onChange={(event) => persistSettings({ scheduleEnabled: event.currentTarget.checked })}
            />
            Usar horário programado
          </label>
          <label>
            Início
            <input
              type="time"
              value={settings.startTime}
              onChange={(event) => persistSettings({ startTime: event.currentTarget.value })}
              disabled={!settings.scheduleEnabled}
            />
          </label>
          <label>
            Fim
            <input
              type="time"
              value={settings.endTime}
              onChange={(event) => persistSettings({ endTime: event.currentTarget.value })}
              disabled={!settings.scheduleEnabled}
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
            <button type="button" className="ghost-button" onClick={newAd}>
              <Plus size={16} /> Novo
            </button>
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
              rows={4}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })}
              placeholder="Mensagem que aparece no site"
            />
          </label>
          <label>
            URL da imagem
            <input
              value={draft.imageUrl}
              onChange={(event) => setDraft({ ...draft, imageUrl: event.currentTarget.value })}
              placeholder="https://dominio.com/imagem-1600x900.webp"
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
              Posição
              <input
                value={draft.section}
                onChange={(event) => setDraft({ ...draft, section: event.currentTarget.value })}
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
          <button className="play-main slim" type="submit">
            <Save size={16} /> Salvar anúncio
          </button>
          <small>Quando não houver anúncio ativo, os espaços publicitários ficam ocultos no site.</small>
        </form>

        <aside className="ad-list">
          <div className="editor-head">
            <div>
              <span><Clock3 size={15} /> Grade cadastrada</span>
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
                    <span>{ad.active ? "Ativo no carrossel" : "Desativado"}</span>
                    <small>{ad.impressions} exibições · {ad.clicks} cliques</small>
                  </div>
                  <div className="ad-list-actions">
                    <button type="button" onClick={() => editAd(ad)} aria-label="Editar anúncio">Editar</button>
                    <button type="button" onClick={() => toggleAd(ad.id)} aria-label={ad.active ? "Desativar anúncio" : "Ativar anúncio"}>
                      {ad.active ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                    {ad.linkUrl ? (
                      <a href={ad.linkUrl} target="_blank" rel="noreferrer" aria-label="Abrir link do anúncio">
                        <ExternalLink size={15} />
                      </a>
                    ) : null}
                    <button type="button" onClick={() => removeAd(ad.id)} aria-label="Excluir anúncio">
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
