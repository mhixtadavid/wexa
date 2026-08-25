"use client";

import { useEffect, useState } from "react";

type State = { status: "ok" } | { status: "down"; message: string } | { status: "checking" };

/**
 * A pure probe: performs the request and reports what it found, without
 * touching component state. Keeping the fetch and the state update separate
 * means no state is ever set synchronously during an effect.
 */
async function probeHealth(): Promise<State> {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (response.ok) return { status: "ok" };
    const body = (await response.json()) as { message?: string };
    return {
      status: "down",
      message: body.message ?? "The graph database is unreachable.",
    };
  } catch {
    return {
      status: "down",
      message: "Cannot reach the server. Check your network connection.",
    };
  }
}

/**
 * Graceful handling of an unreachable database, made visible.
 *
 * Polls every 20 seconds while healthy and every 5 while down, so recovery is
 * noticed quickly without hammering a 0.5 vCPU instance the rest of the time.
 */
export function ConnectionBanner() {
  const [state, setState] = useState<State>({ status: "ok" });
  const [tick, setTick] = useState(0);

  const pollInterval = state.status === "down" ? 5_000 : 20_000;

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const next = await probeHealth();
      if (!cancelled) setState(next);
    }

    void run();
    const interval = setInterval(() => void run(), pollInterval);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pollInterval, tick]);

  if (state.status === "ok") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-critical/30 bg-critical-soft px-4 py-2.5"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[13px] font-medium text-critical">
          {state.status === "checking" ? "Reconnecting…" : "Database unreachable"}
        </span>
        <span className="min-w-0 flex-1 text-[13px] text-text-muted">
          {state.status === "down" ? state.message : null}
        </span>
        <button
          type="button"
          onClick={() => {
            setState({ status: "checking" });
            // Bumping the tick re-runs the polling effect immediately.
            setTick((value) => value + 1);
          }}
          className="rounded-md border border-critical/40 px-2.5 py-1 text-[12px] font-medium text-critical transition-colors hover:bg-critical/10"
        >
          Retry now
        </button>
      </div>
    </div>
  );
}
