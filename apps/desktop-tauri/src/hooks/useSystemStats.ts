import { useEffect, useRef, useState } from "react";
import { getSystemStats } from "../lib/tauri";
import type { SystemStatsSnapshot } from "../types/bridge";

export const SYSTEM_STATS_POLL_MS = 1000;

export interface UseSystemStatsResult {
  stats: SystemStatsSnapshot | null;
  error: string | null;
  isLoading: boolean;
}

export function useSystemStats(): UseSystemStatsResult {
  const [stats, setStats] = useState<SystemStatsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      getSystemStats()
        .then((snapshot) => {
          if (!cancelled) {
            setStats(snapshot);
            setError(null);
            setIsLoading(false);
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : String(cause));
            setIsLoading(false);
          }
        })
        .finally(() => {
          inFlight.current = false;
        });
    };

    load();
    const id = window.setInterval(load, SYSTEM_STATS_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return { stats, error, isLoading };
}
