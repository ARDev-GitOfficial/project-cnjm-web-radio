import {
  fallbackCamera,
  fallbackChat,
  fallbackNowPlaying,
  fallbackSchedule,
} from "../data/fallbacks";
import type {
  CameraResponse,
  ChatResponse,
  NowPlayingResponse,
  ScheduleResponse,
} from "../types";

async function readJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar ${path}`);
  }

  return (await response.json()) as T;
}

export async function fetchNowPlaying(signal?: AbortSignal) {
  try {
    return await readJson<NowPlayingResponse>("/api/now-playing", signal);
  } catch {
    return fallbackNowPlaying();
  }
}

export async function fetchSchedule(signal?: AbortSignal) {
  try {
    return await readJson<ScheduleResponse>("/api/schedule", signal);
  } catch {
    return fallbackSchedule();
  }
}

export async function fetchCamera(signal?: AbortSignal) {
  try {
    return await readJson<CameraResponse>("/api/camera", signal);
  } catch {
    return fallbackCamera();
  }
}

export async function fetchChatMessages(signal?: AbortSignal) {
  try {
    return await readJson<ChatResponse>("/api/chat/messages", signal);
  } catch {
    return fallbackChat();
  }
}
