import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fallbackNowPlaying } from "../data/fallbacks";
import { fetchNowPlaying } from "../lib/api";
import {
  applyDjLiveState,
  applyLiveStatusTest,
  fetchPublicDjLiveState,
  readLiveStatusTest,
  type DjLiveState,
  type LiveStatusTestPayload,
} from "../lib/liveDjs";
import type { NowPlayingResponse } from "../types";

type PlayerContextValue = {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  isBuffering: boolean;
  error: string | null;
  volume: number;
  eqBands: number[];
  streamUrl: string;
  nowPlaying: NowPlayingResponse;
  setVolume: (volume: number) => void;
  setEqBand: (index: number, gain: number) => void;
  applyEqPreset: (gains: number[]) => void;
  resetEq: () => void;
  toggle: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  reconnect: () => Promise<void>;
  refreshNowPlaying: () => Promise<void>;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

const STREAM_URL = "https://s03.svrdedicado.org:7586/stream";
const STATION_NAME = "Web Rádio Conexão Jamaica";
const DEFAULT_PAGE_TITLE = `${STATION_NAME} | Reggae ao vivo`;
const EQ_FREQUENCIES = [60, 170, 350, 1000, 3500, 10000];
const DEFAULT_EQ = EQ_FREQUENCIES.map(() => 0);
// A short public refresh catches scheduled DJ handoffs while the active-DJ response avoids metadata calls.
const NOW_PLAYING_REFRESH_MS = 60_000;
const LOCAL_SIMULATION_REFRESH_MS = 5_000;

type BrowserAudioContext = typeof AudioContext;

function getAudioContextConstructor(): BrowserAudioContext | null {
  const win = window as typeof window & {
    webkitAudioContext?: BrowserAudioContext;
  };

  return window.AudioContext ?? win.webkitAudioContext ?? null;
}

function cleanMediaText(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function mediaSessionDetails(nowPlaying: NowPlayingResponse) {
  const liveDj = nowPlaying.liveDj?.isLive ? nowPlaying.liveDj : null;
  const title = cleanMediaText(liveDj?.programName || nowPlaying.track.title) || "Reggae ao vivo";
  const artist = cleanMediaText(liveDj?.djName || nowPlaying.track.artist) || STATION_NAME;
  const coverUrl = cleanMediaText(liveDj?.logoUrl || nowPlaying.track.coverUrl);
  return { title, artist, coverUrl };
}

function absoluteMediaUrl(value: string) {
  try {
    return new URL(value, window.location.origin).href;
  } catch {
    return "";
  }
}

function updateMediaSession(nowPlaying: NowPlayingResponse) {
  if (typeof window === "undefined") return;

  const { title, artist, coverUrl } = mediaSessionDetails(nowPlaying);
  document.title = `${title} — ${artist} | ${STATION_NAME}`;

  if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;

  const stationArtwork = [
    {
      src: absoluteMediaUrl("/assets/cnjmradio-icon-192.webp"),
      sizes: "192x192",
      type: "image/webp",
    },
    {
      src: absoluteMediaUrl("/assets/cnjmradio-icon-512.webp"),
      sizes: "512x512",
      type: "image/webp",
    },
  ];
  const artwork = coverUrl
    ? [{ src: absoluteMediaUrl(coverUrl), sizes: "512x512" }, ...stationArtwork]
    : stationArtwork;

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: STATION_NAME,
      artwork,
    });
  } catch {
    // A identidade visual de reserva mantém a notificação útil quando uma capa externa é recusada.
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: STATION_NAME,
      artwork: stationArtwork,
    });
  }
}

function setMediaSessionPlaybackState(state: MediaSessionPlaybackState) {
  if (!("mediaSession" in navigator)) return;

  try {
    navigator.mediaSession.playbackState = state;
  } catch {
    // Some browsers expose metadata but do not expose playback state.
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[] | null>(null);
  const lastNowPlayingRefreshRef = useRef(0);
  const liveStatusTestRef = useRef<LiveStatusTestPayload>(readLiveStatusTest());
  const liveStateRef = useRef<DjLiveState | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(() => {
    const saved = window.localStorage.getItem("cnjm-volume");
    return saved ? Number(saved) : 0.78;
  });
  const [eqBands, setEqBands] = useState<number[]>(() => {
    const saved = window.localStorage.getItem("cnjm-eq");
    if (!saved) return DEFAULT_EQ;

    try {
      const parsed = JSON.parse(saved) as number[];
      return EQ_FREQUENCIES.map((_, index) => Number(parsed[index] ?? 0));
    } catch {
      return DEFAULT_EQ;
    }
  });
  const [nowPlaying, setNowPlaying] = useState<NowPlayingResponse>(() => fallbackNowPlaying());
  const [liveStatusTest, setLiveStatusTest] = useState<LiveStatusTestPayload>(() => readLiveStatusTest());

  const refreshNowPlaying = useCallback(async () => {
    const data = await fetchNowPlaying();
    const nextTest = data.liveStatusTest || readLiveStatusTest();
    liveStatusTestRef.current = nextTest;
    setLiveStatusTest(nextTest);
    const simulated = applyLiveStatusTest(data, nextTest);
    setNowPlaying(liveStateRef.current?.liveDj?.isLive ? applyDjLiveState(simulated, liveStateRef.current) : simulated);
    lastNowPlayingRefreshRef.current = Date.now();
  }, []);

  const refreshDjLiveState = useCallback(async () => {
    const previous = liveStateRef.current;
    const next = await fetchPublicDjLiveState();
    liveStateRef.current = next;

    if (next.liveDj?.isLive) {
      setNowPlaying((current) => applyDjLiveState(current, next));
      return next;
    }

    if (previous?.liveDj?.isLive) void refreshNowPlaying();
    return next;
  }, [refreshNowPlaying]);

  useEffect(() => {
    updateMediaSession(nowPlaying);
  }, [
    nowPlaying.liveDj?.djName,
    nowPlaying.liveDj?.isLive,
    nowPlaying.liveDj?.logoUrl,
    nowPlaying.liveDj?.programName,
    nowPlaying.track.artist,
    nowPlaying.track.coverUrl,
    nowPlaying.track.title,
  ]);

  useEffect(() => {
    return () => {
      document.title = DEFAULT_PAGE_TITLE;
    };
  }, []);

  useEffect(() => {
    liveStatusTestRef.current = liveStatusTest;
  }, [liveStatusTest]);

  useEffect(() => {
    const updateTest = () => {
      const nextTest = readLiveStatusTest();
      setLiveStatusTest(nextTest);
      if (nextTest.state === "off") {
        void refreshNowPlaying();
        return;
      }
      setNowPlaying((current) => applyLiveStatusTest(current, nextTest));
    };

    window.addEventListener("storage", updateTest);
    window.addEventListener("cnjm-live-status-test", updateTest);
    return () => {
      window.removeEventListener("storage", updateTest);
      window.removeEventListener("cnjm-live-status-test", updateTest);
    };
  }, [refreshNowPlaying]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextTest = liveStatusTestRef.current;
      if (nextTest.state === "off") return;

      setLiveStatusTest(nextTest);
      setNowPlaying((current) => applyLiveStatusTest(current, nextTest));
    }, LOCAL_SIMULATION_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    void refreshNowPlaying();

    const refreshWhenVisible = () => {
      if (!document.hidden && Date.now() - lastNowPlayingRefreshRef.current >= NOW_PLAYING_REFRESH_MS) {
        void refreshNowPlaying();
      }
    };

    const timer = window.setInterval(refreshWhenVisible, NOW_PLAYING_REFRESH_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshNowPlaying]);

  useEffect(() => {
    let timer: number | null = null;
    let stopped = false;

    const schedule = (liveState: DjLiveState) => {
      if (stopped || document.hidden) return;
      const configuredDelay = liveState.config.enabled && liveState.eligibleDj
        ? liveState.config.pollSeconds * 1_000
        : 60_000;
      const nextBoundary = liveState.sessionEndsAt || liveState.nextEligibleAt;
      const boundaryMs = nextBoundary ? Date.parse(nextBoundary) : NaN;
      const untilBoundary = Number.isFinite(boundaryMs) ? boundaryMs - Date.now() + 600 : Infinity;
      const delay = Math.max(1_000, Math.min(configuredDelay, untilBoundary));
      timer = window.setTimeout(run, delay);
    };

    const run = () => {
      void refreshDjLiveState().then(schedule);
    };

    const visibilityChange = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      if (!document.hidden) run();
    };

    run();
    document.addEventListener("visibilitychange", visibilityChange);
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilityChange);
    };
  }, [refreshDjLiveState]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = volume;
    window.localStorage.setItem("cnjm-volume", String(volume));
  }, [volume]);

  useEffect(() => {
    filtersRef.current?.forEach((filter, index) => {
      filter.gain.value = eqBands[index] ?? 0;
    });
    window.localStorage.setItem("cnjm-eq", JSON.stringify(eqBands));
  }, [eqBands]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const handlePlaying = () => {
      setIsPlaying(true);
      setIsBuffering(false);
      setError(null);
      setMediaSessionPlaybackState("playing");
    };
    const handlePause = () => {
      setIsPlaying(false);
      setMediaSessionPlaybackState("paused");
    };
    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => setIsBuffering(false);
    const handleError = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      setError("Não foi possível tocar a transmissão agora.");
      setMediaSessionPlaybackState("none");
    };

    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  const setupAnalyser = useCallback(async () => {
    if (analyserRef.current) {
      await audioContextRef.current?.resume();
      setAnalyser(analyserRef.current);
      return;
    }

    const audio = audioRef.current;
    const AudioContextCtor = getAudioContextConstructor();
    if (!audio || !AudioContextCtor) return;

    try {
      const context = audioContextRef.current ?? new AudioContextCtor();
      audioContextRef.current = context;

      const source = sourceRef.current ?? context.createMediaElementSource(audio);
      sourceRef.current = source;

      const filters = EQ_FREQUENCIES.map((frequency, index) => {
        const filter = context.createBiquadFilter();
        filter.type = "peaking";
        filter.frequency.value = frequency;
        filter.Q.value = 1;
        filter.gain.value = eqBands[index] ?? 0;
        return filter;
      });
      filtersRef.current = filters;

      const node = context.createAnalyser();
      node.fftSize = 128;
      node.smoothingTimeConstant = 0.78;

      source.connect(filters[0]);
      filters.forEach((filter, index) => {
        const nextFilter = filters[index + 1];
        if (nextFilter) filter.connect(nextFilter);
      });
      filters[filters.length - 1].connect(node);
      node.connect(context.destination);
      analyserRef.current = node;
      setAnalyser(node);
      await context.resume();
    } catch {
      setAnalyser(null);
    }
  }, [eqBands]);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    setError(null);
    setIsBuffering(true);

    try {
      const playRequest = audio.play();
      void setupAnalyser();
      await playRequest;
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      setIsBuffering(false);
      setError("Toque bloqueado pelo navegador. Clique novamente para iniciar.");
    }
  }, [setupAnalyser]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setIsBuffering(false);
  }, []);

  const reconnect = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    setError(null);
    setIsBuffering(true);

    try {
      audio.pause();
      audio.src = STREAM_URL;
      audio.load();
      await setupAnalyser();
      await audio.play();
      setIsPlaying(true);
      void refreshNowPlaying();
    } catch {
      setIsPlaying(false);
      setIsBuffering(false);
      setError("Não foi possível reconectar a transmissão agora.");
    }
  }, [refreshNowPlaying, setupAnalyser]);

  const toggle = useCallback(async () => {
    if (isPlaying) {
      pause();
      return;
    }

    await play();
  }, [isPlaying, pause, play]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler("play", () => { void play(); });
      navigator.mediaSession.setActionHandler("pause", pause);
      navigator.mediaSession.setActionHandler("stop", pause);
    } catch {
      // Action buttons are optional; metadata still works in browsers without them.
    }

    return () => {
      try {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("stop", null);
      } catch {
        // Nothing to clean up on partial Media Session implementations.
      }
    };
  }, [pause, play]);

  const setVolume = useCallback((nextVolume: number) => {
    setVolumeState(Math.min(1, Math.max(0, nextVolume)));
  }, []);

  const setEqBand = useCallback((index: number, gain: number) => {
    setEqBands((current) =>
      current.map((value, currentIndex) =>
        currentIndex === index ? Math.min(12, Math.max(-12, gain)) : value,
      ),
    );
  }, []);

  const applyEqPreset = useCallback((gains: number[]) => {
    setEqBands(EQ_FREQUENCIES.map((_, index) => Math.min(12, Math.max(-12, gains[index] ?? 0))));
  }, []);

  const resetEq = useCallback(() => {
    setEqBands(DEFAULT_EQ);
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      audioRef,
      analyser,
      isPlaying,
      isBuffering,
      error,
      volume,
      eqBands,
      streamUrl: STREAM_URL,
      nowPlaying,
      setVolume,
      setEqBand,
      applyEqPreset,
      resetEq,
      toggle,
      play,
      pause,
      reconnect,
      refreshNowPlaying,
    }),
    [
      analyser,
      error,
      isBuffering,
      isPlaying,
      nowPlaying,
      liveStatusTest,
      pause,
      play,
      reconnect,
      applyEqPreset,
      eqBands,
      refreshNowPlaying,
      resetEq,
      setEqBand,
      setVolume,
      toggle,
      volume,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio ref={audioRef} src={STREAM_URL} crossOrigin="anonymous" preload="none" />
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer precisa ser usado dentro de PlayerProvider.");
  }
  return context;
}
