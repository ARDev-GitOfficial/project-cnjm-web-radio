import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

type AsyncState<T> = {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => void;
};

export function useAsyncData<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList = [],
  intervalMs?: number,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }

    loader(controller.signal)
      .then((result) => {
        if (!mounted) return;
        setData(result);
        setError(null);
        hasLoadedRef.current = true;
      })
      .catch((reason: unknown) => {
        if (!mounted || controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Falha ao carregar dados.");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [loader, version, ...deps]);

  useEffect(() => {
    if (!intervalMs) return undefined;

    const refreshWhenVisible = () => {
      if (!document.hidden) refresh();
    };

    const timer = window.setInterval(refreshWhenVisible, intervalMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [intervalMs, refresh]);

  return { data, error, isLoading, refresh };
}
