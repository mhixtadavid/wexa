"use client";

import { useCallback, useState } from "react";

import { Chain } from "@/components/ui";
import type { DependencyPath } from "@/lib/queries/types";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; paths: DependencyPath[] }
  | { status: "error"; message: string };

/**
 * "Why is this here?" — Q5, loaded on demand.
 *
 * Fetching every path for every row up front would be a lot of traversal for
 * results nobody asked to see; a person opens one package at a time. The paths
 * are the whole point of the feature, so they are rendered in full rather than
 * summarised as a count.
 */
export function WhyPanel({
  appSlug,
  packageName,
}: {
  appSlug: string;
  packageName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "idle" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch(
        "/api/paths?app=" +
          encodeURIComponent(appSlug) +
          "&package=" +
          encodeURIComponent(packageName),
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Could not load dependency paths.");
      }
      const body = (await response.json()) as { paths: DependencyPath[] };
      setState({ status: "ready", paths: body.paths });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not load dependency paths.",
      });
    }
  }, [appSlug, packageName]);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          // Loading from the handler rather than an effect: the fetch is a
          // response to the click, not a consequence of rendering.
          if (next && state.status === "idle") void load();
        }}
        aria-expanded={open}
        className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft"
      >
        {open ? "Hide paths" : "Why is this here?"}
      </button>

      {open ? (
        <div className="mt-2 rounded-lg border border-border-subtle bg-surface-sunken p-3">
          {state.status === "loading" ? (
            <p className="text-[13px] text-text-muted">Tracing dependency paths…</p>
          ) : null}

          {state.status === "error" ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] text-critical">{state.message}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="shrink-0 rounded-md border border-border-strong px-2 py-1 text-[12px] text-text-muted transition-colors hover:text-text"
              >
                Retry
              </button>
            </div>
          ) : null}

          {state.status === "ready" && state.paths.length === 0 ? (
            <p className="text-[13px] text-text-muted">
              No path within 5 hops. This package sits deeper in the tree than the traversal
              bound.
            </p>
          ) : null}

          {state.status === "ready" && state.paths.length > 0 ? (
            <>
              <p className="mb-2.5 text-[12px] text-text-muted">
                {state.paths.length === 1
                  ? "One route pulls this package in:"
                  : state.paths.length + " distinct routes pull this package in:"}
              </p>
              <ul className="space-y-2">
                {state.paths.map((path, index) => (
                  <li key={index}>
                    <Chain chain={path.chain} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
