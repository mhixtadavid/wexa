"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { maintainerHref, packageHref } from "@/lib/format";
import type { SearchResult } from "@/lib/queries/types";

type Status = "idle" | "loading" | "ready" | "error";

function hrefFor(result: SearchResult): string {
  if (result.kind === "application") return "/apps/" + result.id;
  if (result.kind === "maintainer") return maintainerHref(result.id);
  return packageHref(result.id);
}

const KIND_LABEL: Record<SearchResult["kind"], string> = {
  application: "App",
  package: "Package",
  maintainer: "Person",
};

/**
 * Search across applications, packages and maintainers.
 *
 * Debounced at 220ms, and every in-flight request is aborted when the term
 * changes, so a fast typist cannot have an older response overwrite a newer
 * one — the classic race that makes search feel broken.
 */
export function SearchBox() {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<{ term: string; results: SearchResult[] }>({
    term: "",
    results: [],
  });
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await fetch("/api/search?q=" + encodeURIComponent(trimmed), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("search failed");
        const body = (await response.json()) as { results: SearchResult[] };
        setHits({ term: trimmed, results: body.results });
        setStatus("ready");
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setStatus("error");
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const trimmed = term.trim();
  const showPanel = open && trimmed.length >= 2;
  // Only render results that belong to what is currently typed.
  const results = hits.term === trimmed ? hits.results : [];

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <input
        type="search"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search packages, people, applications…"
        aria-label="Search the graph"
        className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[13px] text-text placeholder:text-text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />

      {showPanel ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-border-subtle bg-surface shadow-lg">
          {status === "loading" && results.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-text-muted">Searching…</p>
          ) : null}

          {status === "error" ? (
            <p className="px-3 py-3 text-[13px] text-critical">
              Search is unavailable right now.
            </p>
          ) : null}

          {status === "ready" && results.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-text-muted">
              Nothing matches “{term.trim()}”.
            </p>
          ) : null}

          {results.length > 0 ? (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((result) => (
                <li key={result.kind + result.id}>
                  <Link
                    href={hrefFor(result)}
                    onClick={() => setOpen(false)}
                    className="flex items-baseline gap-2 px-3 py-2 transition-colors hover:bg-surface-sunken"
                  >
                    <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
                      {KIND_LABEL[result.kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[13px] text-text">
                        {result.label}
                      </span>
                      {result.detail ? (
                        <span className="block truncate text-[12px] text-text-muted">
                          {result.detail}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
