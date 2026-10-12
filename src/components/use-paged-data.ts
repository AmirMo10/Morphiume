"use client";
import { useEffect, useState } from "react";
import { api, errorMessage } from "./commerce-client";

export function usePagedData<T>(endpoint: string, query: string, enabled = true, onError?: (error: unknown) => void) {
  const key = `${endpoint}?${query}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; attempt: number; data: T | null; error: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();
    api<T>(key,{signal:controller.signal}).then(data => { if (active) setState({ key, attempt, data, error: "" }); }).catch(error => { if (active) { setState({ key, attempt, data: null, error: errorMessage(error) }); onError?.(error); } });
    return () => { active = false; controller.abort(); };
  }, [key, attempt, enabled, onError]);
  const current = state?.key === key && state.attempt === attempt ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? "", loading: !current, reload: () => setAttempt(previous => previous + 1) };
}
