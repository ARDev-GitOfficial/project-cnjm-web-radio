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
const EQ_FREQUENCIES = [60, 170, 350, 1000, 3500, 10000];
const DEFAULT_EQ = EQ_FREQUENCIES.map(() => 0);

type BrowserAudioContext = typeof AudioContext;

function getAudioContextConstructor(): BrowserAudioContext | null {
  const win = window as typeof window & {
    webkitAudioContext?: BrowserAudioContext;
  };

  return window.AudioContext ?? win.webkitAudioContext ?? null;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[] | null>(null);
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

  const refreshNowPlaying = useCallback(async () => {
    const data = await fetchNowPlaying();
    setNowPlaying(data);
  }, []);

  useEffect(() => {
    void refreshNowPlaying();

    const refreshWhenVisible = () => {
      if (!document.hidden) void refreshNowPlaying();
    };

    const timer = window.setInterval(refreshWhenVisible, 30000);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshNowPlaying]);

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
    };
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => setIsBuffering(false);
    const handleError = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      setError("Não foi possível tocar a transmissão agora.");
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
