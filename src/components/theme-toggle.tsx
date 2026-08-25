"use client";

import { useSyncExternalStore } from "react";

import {
  getServerSnapshot,
  getSnapshot,
  setTheme,
  subscribe,
  type Theme,
} from "@/lib/theme";

const ORDER: Theme[] = ["system", "light", "dark"];

const LABEL: Record<Theme, string> = {
  system: "Match system",
  light: "Light",
  dark: "Dark",
};

function Icon({ theme }: { theme: Theme }) {
  if (theme === "light") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="10" cy="10" r="3.6" />
        <path strokeLinecap="round" d="M10 2v1.6M10 16.4V18M18 10h-1.6M3.6 10H2M15.7 4.3l-1.1 1.1M5.4 14.6l-1.1 1.1M15.7 15.7l-1.1-1.1M5.4 5.4L4.3 4.3" />
      </svg>
    );
  }
  if (theme === "dark") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinejoin="round" d="M16.5 12.4A7 7 0 1 1 7.6 3.5a5.6 5.6 0 0 0 8.9 8.9Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.4" y="3.6" width="15.2" height="10.4" rx="1.8" />
      <path strokeLinecap="round" d="M7 17h6" />
    </svg>
  );
}

/**
 * Cycles system → light → dark.
 *
 * "System" is a real option rather than an implicit default, because a viewer
 * who has set a preference here should be able to hand control back to their
 * OS without clearing site data.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={LABEL[theme] + " — click for " + LABEL[next].toLowerCase()}
      aria-label={"Theme: " + LABEL[theme] + ". Switch to " + LABEL[next].toLowerCase() + "."}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle text-text-muted transition-colors hover:border-accent/50 hover:text-text focus:outline-none focus:ring-2 focus:ring-accent/30"
    >
      <Icon theme={theme} />
    </button>
  );
}
