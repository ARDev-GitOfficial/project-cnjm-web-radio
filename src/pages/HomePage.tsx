import {
  Activity,
  CalendarDays,
  Camera,
  Clock3,
  ExternalLink,
  Megaphone,
  Menu,
  MessageCircle,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AdSlot } from "../components/AdSlot";
import { BarAudioBackdrop } from "../components/BarAudioBackdrop";
import { BrandMantra } from "../components/BrandMantra";
import { MarqueeText } from "../components/MarqueeText";
import { RadioInlineAdCarousel } from "../components/RadioInlineAdCarousel";
import { TapeRig } from "../components/TapeRig";
import { appPrivacyPolicy } from "../data/appPolicy";
import { useAsyncData } from "../hooks/useAsyncData";
import { fetchCamera, fetchChatMessages, fetchSchedule } from "../lib/api";
import { optimizedStaticImageUrl } from "../lib/imageOptimization";
import { usePlayer } from "../player/PlayerProvider";
import type { BroadcastState, ScheduleDay } from "../types";

const STATION_NAME = "Web Rádio Conexão Jamaica";
const DEFAULT_COVER = "/assets/cnjmradio-launcher.webp";
const WHATSAPP_NUMBER = "5592984227531";

const navItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/radio", label: "Rádio", icon: Radio },
  { to: "/programacao", label: "Programação", icon: CalendarDays },
  { to: "/pedidos", label: "Pedidos", icon: Send },
  { to: "/bate-papo", label: "Bate-papo", icon: MessageCircle },
  { to: "/camera", label: "Câmera", icon: Camera },
  { to: "/equalizador", label: "Equalizador", icon: SlidersHorizontal },
  { to: "/politicas", label: "Privacidade", icon: ShieldCheck },
  { to: "/ads", label: "Gerenciar", icon: Megaphone },
];

function cleanText(value: string) {
  const legacyMojibake = [
    [new RegExp("R\\u00c3\\u00a1dio", "g"), "Rádio"],
    [new RegExp("Conex\\u00c3\\u00a3o", "g"), "Conexão"],
    [new RegExp("Programa\\u00c3\\u00a7\\u00c3\\u00a3o", "g"), "Programação"],
    [new RegExp("M\\u00c3\\u00basica", "g"), "Música"],
    [new RegExp("Sele\\u00c3\\u00a7\\u00c3\\u00a3o", "g"), "Seleção"],
  ] as const;

  return value
    .replace(legacyMojibake[0][0], legacyMojibake[0][1])
    .replace(legacyMojibake[1][0], legacyMojibake[1][1])
    .replace(legacyMojibake[2][0], legacyMojibake[2][1])
    .replace(legacyMojibake[3][0], legacyMojibake[3][1])
    .replace(legacyMojibake[4][0], legacyMojibake[4][1])
    .trim();
}

function resolveHeaderState(
  isBuffering: boolean,
  isOnline: boolean,
  error: string | null,
  liveState: BroadcastState | undefined,
  hasFreshData: boolean,
): BroadcastState {
  if (liveState === "live") return "live";
  if (error || liveState === "offline" || !isOnline) return "offline";
  if (isBuffering || liveState === "connecting" || !hasFreshData) return "connecting";
  return "online";
}

function headerStatusLabel(state: BroadcastState) {
  if (state === "live") return "AO VIVO";
  if (state === "online") return "ONLINE";
  if (state === "offline") return "Fora do ar";
  return "Conectando";
}

function headerStatusClassName(state: BroadcastState) {
  return `header-status is-${state}`;
}

function normalizeDayText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function todayDayId() {
  const dayIndex = new Date().getDay();
  const names = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const ids = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return { id: ids[dayIndex], name: names[dayIndex] };
}

function isTodayScheduleDay(day: Pick<ScheduleDay, "id" | "label">) {
  const today = todayDayId();
  const id = normalizeDayText(day.id);
  const label = normalizeDayText(day.label);
  return id.includes(today.id) || label.includes(today.name);
}

function pickDefaultScheduleDay(days: ScheduleDay[]) {
  return (
    days.find((day) => isTodayScheduleDay(day)) ??
    days.find((day) => day.active) ??
    days[0]
  );
}

function timeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function currentSlotProgress(timeRange: string) {
  const matches = timeRange.match(/\d{1,2}:\d{2}/g);
  if (!matches || matches.length < 2) return 50;

  let start = timeToMinutes(matches[0]);
  let end = timeToMinutes(matches[1]);
  let now = new Date().getHours() * 60 + new Date().getMinutes();

  if (end <= start) end += 24 * 60;
  if (now < start && end > 24 * 60) now += 24 * 60;
  if (now <= start) return 4;
  if (now >= end) return 100;

  return Math.min(100, Math.max(4, ((now - start) / (end - start)) * 100));
}

function formatCount(value: number | null | undefined) {
  const safeValue = Math.max(0, Number(value || 0));
  return new Intl.NumberFormat("pt-BR").format(safeValue);
}

function scheduleWindowMinutes(timeRange: string) {
  const matches = timeRange.match(/\d{1,2}:\d{2}/g);
  if (!matches || matches.length < 2) return null;

  const start = timeToMinutes(matches[0]);
  let end = timeToMinutes(matches[1]);
  if (end <= start) end += 24 * 60;

  return {
    start,
    end,
    duration: Math.max(1, end - start),
  };
}

function scheduleDurationLabel(timeRange: string) {
  const window = scheduleWindowMinutes(timeRange);
  if (!window) return "";
  const hours = Math.floor(window.duration / 60);
  const minutes = window.duration % 60;
  if (!hours) return `${minutes}min`;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

function findNextScheduleSlot(slots: ScheduleDay["slots"]) {
  if (!slots.length) return null;
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const future = slots
    .filter((slot) => !slot.isNow)
    .map((slot) => ({ slot, window: scheduleWindowMinutes(slot.time) }))
    .filter((item): item is { slot: ScheduleDay["slots"][number]; window: NonNullable<ReturnType<typeof scheduleWindowMinutes>> } =>
      Boolean(item.window && item.window.start > now),
    )
    .sort((a, b) => a.window.start - b.window.start);

  return future[0]?.slot ?? slots.find((slot) => !slot.isNow) ?? null;
}

function findCurrentScheduleSlot(days: ScheduleDay[]) {
  return days.flatMap((day) => day.slots).find((slot) => slot.isNow) ?? null;
}

export const SiteLayout = memo(function SiteLayout() {
  const { isBuffering, error, nowPlaying } = usePlayer();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isOnline = nowPlaying.stats.isOnline !== false;
  const statusState = resolveHeaderState(isBuffering, isOnline, error, nowPlaying.liveDj?.state, nowPlaying.ok);
  const status = headerStatusLabel(statusState);
  const statusClassName = headerStatusClassName(statusState);
  const onlineCount = formatCount(nowPlaying.stats.listeners);
  const visitorCount = formatCount(nowPlaying.stats.streamHits || nowPlaying.stats.peakListeners);
  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);
  const toggleMobileMenu = useCallback(() => setIsMobileMenuOpen((current) => !current), []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen]);

  const navLinks = useMemo(() => navItems.map((item) => {
    const Icon = item.icon;
    return (
      <NavLink key={item.to} to={item.to} title={item.label} onClick={closeMobileMenu}>
        <Icon size={16} aria-hidden="true" />
        <span>{item.label}</span>
      </NavLink>
    );
  }), [closeMobileMenu]);

  return (
    <div className="station-site">
      <header className="site-header site-header-clean">
        <div className="header-actions">
          <div className="header-live-cluster">
            <button
              className="mobile-menu-button"
              type="button"
              aria-controls="mobile-nav-drawer"
              aria-expanded={isMobileMenuOpen}
              aria-label={isMobileMenuOpen ? "Fechar menu" : "Abrir menu"}
              onClick={toggleMobileMenu}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <span className={statusClassName}>
              {statusState === "live" ? (
                <>
                  <span className="on-air-badge">
                    <Radio size={13} aria-hidden="true" />
                    NO AR
                  </span>
                  <strong>AO VIVO</strong>
                </>
              ) : (
                <strong>{status}</strong>
              )}
            </span>
            <span className="header-metric header-metric-online" title="Ouvintes online">
              <UsersRound size={14} />
              <small>Online</small>
              <strong>{onlineCount}</strong>
            </span>
            <span className="header-metric header-metric-visitors" title="Visitantes do stream">
              <Activity size={14} />
              <small>Visitantes</small>
              <strong>{visitorCount}</strong>
            </span>
          </div>
          <nav className="desktop-nav" aria-label="Navegação principal">
            {navLinks}
          </nav>
        </div>
      </header>
      <button
        className={isMobileMenuOpen ? "mobile-nav-scrim is-open" : "mobile-nav-scrim"}
        type="button"
        aria-label="Fechar menu"
        tabIndex={isMobileMenuOpen ? 0 : -1}
        onClick={closeMobileMenu}
      />
      <aside
        id="mobile-nav-drawer"
        className={isMobileMenuOpen ? "mobile-nav-drawer is-open" : "mobile-nav-drawer"}
        aria-hidden={!isMobileMenuOpen}
      >
        <div className="mobile-drawer-head">
          <div>
            <strong>Menu da Rádio</strong>
          </div>
          <button type="button" aria-label="Fechar menu" onClick={closeMobileMenu}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <nav className="mobile-drawer-nav" aria-label="Navegação mobile">
          {navLinks}
        </nav>
      </aside>
      <Outlet />
    </div>
  );
});

export const RadioHomePage = memo(function RadioHomePage() {
  const {
    analyser,
    isPlaying,
    isBuffering,
    error,
    nowPlaying,
    toggle,
    volume,
    setVolume,
    reconnect,
  } = usePlayer();
  const scheduleLoader = useCallback((signal: AbortSignal) => fetchSchedule(signal), []);
  const { data: scheduleData } = useAsyncData(scheduleLoader, [], 600000);
  const currentProgram = useMemo(() => findCurrentScheduleSlot(scheduleData?.days ?? []), [scheduleData]);
  const liveDj = nowPlaying.liveDj;
  const isLiveDj = liveDj?.isLive === true;
  const trackTitle = cleanText((isLiveDj ? liveDj.programName : nowPlaying.track.title) || "Programação ao vivo");
  const trackArtist = cleanText((isLiveDj ? liveDj.djName : nowPlaying.track.artist) || STATION_NAME);
  const currentProgramName = cleanText(isLiveDj ? "Programa Ao Vivo" : currentProgram?.program || "Programação musical");
  const defaultCover = optimizedStaticImageUrl(DEFAULT_COVER, { width: 360, height: 360, quality: 84 });
  const cover = nowPlaying.track.coverUrl?.trim() || currentProgram?.logoUrl?.trim() || defaultCover;

  return (
    <main className="radio-page">
      <section className="radio-hero">
        <BarAudioBackdrop analyser={analyser} isPlaying={isPlaying} />
        <div className="radio-hero-grid">
          <div className="radio-copy-stack">
            <div className="radio-copy-card">
              <div className={isPlaying ? "brand-identity-flow is-playing" : "brand-identity-flow"}>
                <h1 className="station-title">
                  <span className="station-kicker">Web Rádio</span>
                  <span className="station-word">Conexão</span>
                  <span className="station-word">Jamaica</span>
                </h1>
                <BrandMantra className={isPlaying ? "hero-mantra is-playing" : "hero-mantra"} />
              </div>

              <div className="track-line">
                <img
                  src={cover}
                  alt=""
                  loading="eager"
                  decoding="async"
                  draggable={false}
                  onError={(event) => {
                    event.currentTarget.src = DEFAULT_COVER;
                  }}
                />
                <div>
                  <small className="current-program-chip">No ar: {currentProgramName}</small>
                  <MarqueeText as="strong" text={trackTitle} />
                  <span>{trackArtist}</span>
                </div>
              </div>

              <div className="hero-actions">
                <button
                  className="play-main"
                  type="button"
                  aria-label={isPlaying ? "Pausar rádio" : "Tocar rádio"}
                  onClick={() => void toggle()}
                >
                  {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
                  <span>{isPlaying ? "Pausar rádio" : "Tocar rádio"}</span>
                </button>
                <button
                  className="icon-glass radio-tool-button"
                  type="button"
                  onClick={() => void reconnect()}
                  aria-label="Reconectar rádio"
                  title="Reconectar rádio"
                >
                  <RefreshCw size={18} />
                </button>
                <label className="volume-line">
                  <Volume2 size={18} />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.001"
                    value={volume}
                    onChange={(event) => setVolume(Number(event.currentTarget.value))}
                  />
                </label>
              </div>

              {error ? <p className="friendly-error">{error}</p> : null}
            </div>

            <RadioInlineAdCarousel />
          </div>

          <div className="radio-visual-card">
            <TapeRig isPlaying={isPlaying || isBuffering} />
          </div>
        </div>
      </section>
    </main>
  );
});

function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="route-page">
      <section className="page-hero">
        <div className="page-brand-flow">
          <h1>{title}</h1>
          <BrandMantra className="page-mantra" />
        </div>
      </section>
      <AdSlot />
      {children}
    </main>
  );
}

export function ScheduleStationPage() {
  const loader = useCallback((signal: AbortSignal) => fetchSchedule(signal), []);
  const { data } = useAsyncData(loader, [], 900000);
  const days = data?.days ?? [];
  const [selectedDayId, setSelectedDayId] = useState("");
  const defaultDay = useMemo(() => pickDefaultScheduleDay(days), [days]);

  useEffect(() => {
    if (!days.length) return;
    if (selectedDayId && days.some((day) => day.id === selectedDayId)) return;
    setSelectedDayId(defaultDay?.id ?? days[0].id);
  }, [days, defaultDay, selectedDayId]);

  const selectedDay = useMemo(
    () => days.find((day) => day.id === selectedDayId) ?? defaultDay,
    [days, defaultDay, selectedDayId],
  );
  const selectedCurrentSlot = selectedDay?.slots.find((slot) => slot.isNow);
  const globalCurrentSlot = useMemo(() => days.flatMap((day) => day.slots).find((slot) => slot.isNow), [days]);
  const currentSlot = selectedCurrentSlot ?? globalCurrentSlot;
  const nextSlot = selectedDay ? findNextScheduleSlot(selectedDay.slots) : null;
  const scheduleProgress = currentSlot ? currentSlotProgress(currentSlot.time) : 0;
  const liveCount = selectedDay?.slots.filter((slot) => slot.isNow).length ?? 0;

  return (
    <PageShell title="Programação">
      <section className="program-board">
        {days.length && selectedDay ? (
          <>
            {currentSlot ? (
              <article className="program-live-panel">
                <span className="program-live-icon"><Radio size={22} /></span>
                <div>
                  <small>Agora mesmo</small>
                  <h2>{cleanText(currentSlot.program)}</h2>
                  <p>{currentSlot.time} · {cleanText(currentSlot.host || STATION_NAME)}</p>
                  <div className="program-now-progress is-live">
                    <span style={{ width: `${scheduleProgress}%` }} />
                  </div>
                </div>
              </article>
            ) : null}

            {nextSlot ? (
              <article className="program-next-panel">
                <Clock3 size={18} />
                <div>
                  <small>Próximo horário</small>
                  <strong>{nextSlot.time} · {cleanText(nextSlot.program)}</strong>
                </div>
                <span>{scheduleDurationLabel(nextSlot.time) || "em breve"}</span>
              </article>
            ) : null}

            <div className="program-tabs" role="tablist" aria-label="Dias da semana">
              {days.map((day) => {
                const isToday = isTodayScheduleDay(day);
                return (
                  <button
                    className={day.id === selectedDay.id ? "is-active" : ""}
                    key={day.id}
                    onClick={() => setSelectedDayId(day.id)}
                    role="tab"
                    type="button"
                    aria-selected={day.id === selectedDay.id}
                  >
                    <Sparkles size={14} aria-hidden="true" />
                    {isToday ? <span>Hoje</span> : null}
                    {day.label}
                  </button>
                );
              })}
            </div>

            <article className="program-day-panel">
              <div className="program-card-head">
                <div>
                  <span>Grade do dia</span>
                  <h2>{selectedDay.label}</h2>
                </div>
                <div className="program-metrics">
                  <span>
                    <CalendarDays size={16} />
                    <small>Programas</small>
                    <strong>{selectedDay.slots.length}</strong>
                  </span>
                  <span>
                    <Radio size={16} />
                    <small>No ar</small>
                    <strong>{liveCount || "--"}</strong>
                  </span>
                  <span>
                    <Clock3 size={16} />
                    <small>Próximo</small>
                    <strong>{nextSlot?.time.split("-")[0].trim() || "--"}</strong>
                  </span>
                </div>
              </div>

              <div className="program-slots full-list">
                {selectedDay.slots.map((slot) => (
                  <p className={slot.isNow ? "is-now" : ""} key={slot.id}>
                    <strong><Clock3 size={14} /> {slot.time}</strong>
                    <span>{cleanText(slot.program)}</span>
                    <em>{cleanText(slot.host || STATION_NAME)}</em>
                    <small>{slot.isNow ? "No ar agora" : scheduleDurationLabel(slot.time)}</small>
                    {slot.isNow ? (
                      <b className="program-row-progress" style={{ width: `${currentSlotProgress(slot.time)}%` }} />
                    ) : null}
                  </p>
                ))}
              </div>
            </article>
          </>
        ) : (
          <article className="program-day-panel">
            <div className="program-card-head">
              <h2>Programação musical</h2>
            </div>
            <p>Grade indisponível no momento.</p>
          </article>
        )}
      </section>
    </PageShell>
  );
}

export function RequestsStationPage() {
  const [form, setForm] = useState({ name: "", artist: "", song: "", message: "" });
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim() || !form.artist.trim() || !form.song.trim()) {
      setNotice("Preencha nome, artista e música.");
      return;
    }

    const text = [
      "Pedido musical - Web Rádio Conexão Jamaica",
      `Nome: ${form.name.trim()}`,
      `Artista: ${form.artist.trim()}`,
      `Música: ${form.song.trim()}`,
      form.message.trim() ? `Mensagem: ${form.message.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    setUrl(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`);
    setNotice("Pedido pronto para abrir no WhatsApp.");
  };

  return (
    <PageShell title="Peça sua música">
      <section className="form-panel">
        <form className="compact-form" onSubmit={submit}>
          <input placeholder="Seu nome" value={form.name} onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} />
          <input placeholder="Artista" value={form.artist} onChange={(event) => setForm({ ...form, artist: event.currentTarget.value })} />
          <input placeholder="Música" value={form.song} onChange={(event) => setForm({ ...form, song: event.currentTarget.value })} />
          <textarea placeholder="Mensagem para a rádio" value={form.message} onChange={(event) => setForm({ ...form, message: event.currentTarget.value })} />
          <button className="play-main slim" type="submit">
            <Send size={16} />
            Preparar pedido
          </button>
          {url ? <a className="external-card-link" href={url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Abrir WhatsApp</a> : null}
          {notice ? <small>{notice}</small> : null}
        </form>
      </section>
    </PageShell>
  );
}

export function ChatStationPage() {
  const loader = useCallback((signal: AbortSignal) => fetchChatMessages(signal), []);
  const { data } = useAsyncData(loader, [], 120000);
  const [name, setName] = useState("Ouvinte");
  const [text, setText] = useState("");
  const [localMessages, setLocalMessages] = useState<{ id: string; author: string; text: string }[]>([]);
  const messages = [...localMessages, ...(data?.messages.slice(0, 10) ?? [])];

  const submitMessage = useCallback(() => {
    const nextText = text.trim();
    if (!nextText) return;
    setLocalMessages((current) => [
      { id: crypto.randomUUID(), author: name.trim() || "Ouvinte", text: nextText },
      ...current,
    ].slice(0, 10));
    setText("");
  }, [name, text]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitMessage();
  };

  const submitOnEnter = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitMessage();
  };

  return (
    <PageShell title="Bate-papo">
      <section className="chat-panel">
        <div className="chat-list">
          {messages.length ? (
            messages.map((message) => (
              <article key={message.id}>
                <strong>{message.author}</strong>
                <span>{message.text}</span>
              </article>
            ))
          ) : (
            <article className="chat-empty">
              <strong>Bate-papo no ar</strong>
              <span>Envie uma mensagem local para testar a conversa da rádio.</span>
            </article>
          )}
        </div>
        <form className="chat-mini-form" onSubmit={submit}>
          <input value={name} onChange={(event) => setName(event.currentTarget.value)} aria-label="Nome no bate-papo" />
          <input value={text} onChange={(event) => setText(event.currentTarget.value)} onKeyDown={submitOnEnter} placeholder="Mensagem" />
          <button type="submit" aria-label="Adicionar mensagem local"><Send size={16} /></button>
        </form>
      </section>
    </PageShell>
  );
}

export function CameraStationPage() {
  const loader = useCallback((signal: AbortSignal) => fetchCamera(signal), []);
  const { data: camera } = useAsyncData(loader, [], 1800000);

  return (
    <PageShell title="Estúdio ao vivo">
      <section className="media-panel">
        <div className="media-icon-ring">
          <Camera size={34} />
        </div>
        <div>
          <strong>{camera?.ok ? "Sinal disponível" : "Câmera indisponível"}</strong>
          <p>Quando o sinal abrir, acompanhe a transmissão visual da rádio.</p>
        </div>
        {camera?.embedUrl ? (
          <a href={camera.embedUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={16} /> Abrir câmera
          </a>
        ) : null}
      </section>
    </PageShell>
  );
}

export function EqualizerStationPage() {
  const { eqBands, setEqBand, resetEq } = usePlayer();

  return (
    <PageShell title="Ajuste seu som">
      <section className="eq-page-panel">
        <div className="eq-head">
          <span><SlidersHorizontal size={16} /> Som da rádio</span>
          <button type="button" onClick={resetEq}>Zerar</button>
        </div>
        <div className="eq-inline">
          {eqBands.map((gain, index) => (
            <label key={index}>
              <span>{["60", "170", "350", "1k", "3.5k", "10k"][index]}</span>
              <input
                type="range"
                min="-12"
                max="12"
                step="1"
                value={gain}
                onChange={(event) => setEqBand(index, Number(event.currentTarget.value))}
              />
              <small>{gain > 0 ? `+${gain}` : gain} dB</small>
            </label>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

export function PoliciesStationPage() {
  return (
    <PageShell title="Privacidade">
      <AppPolicyContent title="Privacidade" />
    </PageShell>
  );
}

export function AppPrivacyPolicyPage() {
  return (
    <PageShell title="Privacidade do app">
      <AppPolicyContent title="Privacidade do app Android" />
    </PageShell>
  );
}

function AppPolicyContent({ title }: { title: string }) {
  return (
    <section className="policy-panel policy-panel-strong policy-panel-document">
      <article className="policy-document-head">
        <ShieldCheck size={24} />
        <span className="eyebrow">Política oficial</span>
        <h2>{title}</h2>
        <p>{appPrivacyPolicy.subtitle}</p>
        <dl className="policy-meta">
          <div>
            <dt>Versão</dt>
            <dd>{appPrivacyPolicy.version}</dd>
          </div>
          <div>
            <dt>Atualização</dt>
            <dd>{appPrivacyPolicy.updatedAt}</dd>
          </div>
          <div>
            <dt>Contato</dt>
            <dd>{appPrivacyPolicy.contactValue}</dd>
          </div>
        </dl>
      </article>

      <div className="policy-section-list">
        {appPrivacyPolicy.sections.map((section) => (
          <article key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
            <ul className="policy-bullets">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
