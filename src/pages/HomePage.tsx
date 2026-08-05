import {
  CalendarDays,
  Camera,
  ExternalLink,
  MessageCircle,
  Pause,
  Play,
  Radio,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { AdSlot } from "../components/AdSlot";
import { BarAudioBackdrop } from "../components/BarAudioBackdrop";
import { BrandMantra } from "../components/BrandMantra";
import { MarqueeText } from "../components/MarqueeText";
import { TapeRig } from "../components/TapeRig";
import { useAsyncData } from "../hooks/useAsyncData";
import { fetchCamera, fetchChatMessages, fetchSchedule } from "../lib/api";
import { usePlayer } from "../player/PlayerProvider";
import type { ScheduleDay } from "../types";

const STATION_NAME = "Web Rádio Conexão Jamaica";
const DEFAULT_COVER = "/assets/cnjmradio-launcher.png";
const WHATSAPP_NUMBER = "5592984227531";

const navItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/radio", label: "Rádio", icon: Radio },
  { to: "/programacao", label: "Programação", icon: CalendarDays },
  { to: "/pedidos", label: "Pedidos", icon: Send },
  { to: "/bate-papo", label: "Bate-papo", icon: MessageCircle },
  { to: "/camera", label: "Câmera", icon: Camera },
  { to: "/equalizador", label: "Equalizador", icon: SlidersHorizontal },
  { to: "/politicas", label: "Políticas", icon: ShieldCheck },
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

function headerStatusLabel(isPlaying: boolean, isBuffering: boolean, isOnline: boolean, error: string | null) {
  if (!isPlaying && !isBuffering) return "Aguardando conexão";
  if (error || !isOnline) return "Sem conexão";
  if (isBuffering) return "Aguardando conexão";
  return "AO VIVO";
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

export const SiteLayout = memo(function SiteLayout() {
  const { isPlaying, isBuffering, error, nowPlaying } = usePlayer();
  const isOnline = nowPlaying.stats.isOnline !== false;
  const status = headerStatusLabel(isPlaying, isBuffering, isOnline, error);

  const navLinks = useMemo(() => navItems.map((item) => {
    const Icon = item.icon;
    return (
      <NavLink key={item.to} to={item.to} title={item.label}>
        <Icon size={16} aria-hidden="true" />
        <span>{item.label}</span>
      </NavLink>
    );
  }), []);

  return (
    <div className="station-site">
      <header className="site-header site-header-clean">
        <div className="header-actions">
          <span className={status === "AO VIVO" ? "header-status is-on" : status === "Sem conexão" ? "header-status is-off" : "header-status"}>
            <strong>{status}</strong>
          </span>
          <nav aria-label="Navegação principal">
            {navLinks}
          </nav>
        </div>
      </header>
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
    refreshNowPlaying,
  } = usePlayer();
  const trackTitle = cleanText(nowPlaying.track.title || "Programação ao vivo");
  const trackArtist = cleanText(nowPlaying.track.artist || STATION_NAME);
  const cover = nowPlaying.track.coverUrl?.trim() || DEFAULT_COVER;

  return (
    <main className="radio-page">
      <section className="radio-hero">
        <BarAudioBackdrop analyser={analyser} isPlaying={isPlaying} />
        <div className="radio-hero-grid">
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
                fetchPriority="high"
                draggable={false}
                onError={(event) => {
                  event.currentTarget.src = DEFAULT_COVER;
                }}
              />
              <div>
                <MarqueeText as="strong" text={trackTitle} />
                <span>{trackArtist}</span>
              </div>
            </div>

            <div className="hero-actions">
              <button className="play-main" type="button" onClick={() => void toggle()}>
                {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
                {isPlaying ? "Pausar rádio" : "Tocar rádio"}
              </button>
              <button className="ghost-button" type="button" onClick={() => void refreshNowPlaying()}>
                Atualizar faixa
              </button>
            </div>

            <label className="volume-line">
              <Volume2 size={18} />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(event) => setVolume(Number(event.currentTarget.value))}
              />
            </label>
            {error ? <p className="friendly-error">{error}</p> : null}
          </div>

          <div className="radio-visual-card">
            <TapeRig isPlaying={isPlaying || isBuffering} />
          </div>
        </div>
        <div className="hero-ad">
          <AdSlot compact />
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
  const { data } = useAsyncData(loader, [], 120000);
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
  const scheduleProgress = selectedCurrentSlot ? currentSlotProgress(selectedCurrentSlot.time) : 0;

  return (
    <PageShell title="Programação">
      <section className="program-board">
        {days.length && selectedDay ? (
          <>
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
                    {isToday ? <span>Hoje</span> : null}
                    {day.label}
                  </button>
                );
              })}
            </div>

            <article className="program-day-panel">
              <div className="program-card-head">
                <h2>{selectedDay.label}</h2>
              </div>

              <div className="program-slots full-list">
                {selectedDay.slots.map((slot) => (
                  <p className={slot.isNow ? "is-now" : ""} key={slot.id}>
                    <strong>{slot.time}</strong>
                    <span>{cleanText(slot.program)}</span>
                    {slot.host ? <em>{cleanText(slot.host)}</em> : null}
                    {slot.isNow ? <small>No ar agora</small> : null}
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
  const { data } = useAsyncData(loader, [], 45000);
  const [name, setName] = useState("Ouvinte");
  const [text, setText] = useState("");
  const [localMessages, setLocalMessages] = useState<{ id: string; author: string; text: string }[]>([]);
  const messages = [...localMessages, ...(data?.messages.slice(0, 10) ?? [])];

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim()) return;
    setLocalMessages((current) => [
      { id: crypto.randomUUID(), author: name.trim() || "Ouvinte", text: text.trim() },
      ...current,
    ].slice(0, 10));
    setText("");
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
          <input value={text} onChange={(event) => setText(event.currentTarget.value)} placeholder="Mensagem" />
          <button type="submit" aria-label="Adicionar mensagem local"><Send size={16} /></button>
        </form>
      </section>
    </PageShell>
  );
}

export function CameraStationPage() {
  const loader = useCallback((signal: AbortSignal) => fetchCamera(signal), []);
  const { data: camera } = useAsyncData(loader, [], 120000);

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
    <PageShell title="Uso e privacidade">
      <section className="policy-panel policy-panel-strong">
        <article>
          <ShieldCheck size={22} />
          <h2>Rádio ao vivo</h2>
          <p>O player usa o stream público da Web Rádio Conexão Jamaica para entregar a transmissão da rádio.</p>
        </article>
        <article>
          <MessageCircle size={22} />
          <h2>Bate-papo e pedidos</h2>
          <p>Mensagens locais não são publicadas automaticamente. Pedidos abrem confirmação externa antes do envio.</p>
        </article>
        <article>
          <CalendarDays size={22} />
          <h2>Anúncios</h2>
          <p>Campanhas aparecem no espaço reservado do site, uma de cada vez, sem cobrir o conteúdo principal.</p>
        </article>
        <article>
          <Radio size={22} />
          <h2>Privacidade</h2>
          <p>As preferências locais do player e do equalizador ficam neste navegador para melhorar a experiência.</p>
        </article>
        <article>
          <Send size={22} />
          <h2>Contato</h2>
          <p>Para pedidos, apoio cultural ou informações da rádio, use os canais oficiais da Web Rádio Conexão Jamaica.</p>
        </article>
        <article>
          <Camera size={22} />
          <h2>Conteúdo ao vivo</h2>
          <p>Recursos como câmera, agenda e faixa atual podem variar conforme a disponibilidade da transmissão.</p>
        </article>
      </section>
    </PageShell>
  );
}
