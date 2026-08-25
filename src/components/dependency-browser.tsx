"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { WhyPanel } from "@/components/why-panel";
import { compactNumber, packageHref } from "@/lib/format";
import type { ApplicationPackage } from "@/lib/queries/types";

type Status = "idle" | "loading" | "error";

/**
 * Lists what an application actually installs, with a filter that searches the
 * whole dependency tree rather than only the rows already rendered.
 *
 * The initial page is server-rendered, so the section is useful with
 * JavaScript disabled and costs nothing until someone types.
 */
export function DependencyBrowser({
  appSlug,
  initialPackages,
  totalPackages,
}: {
  appSlug: string;
  initialPackages: ApplicationPackage[];
  totalPackages: number;
}) {
  const [term, setTerm] = useState("");
  const [packages, setPackages] = useState(initialPackages);
  const [status, setStatus] = useState<Status>("idle");
  // The first page is already server-rendered; refetching it on mount would
  // duplicate that work for no visible change.
  const skipInitialFetch = useRef(true);

  useEffect(() => {
    const trimmed = term.trim();

    if (skipInitialFetch.current && trimmed === "") {
      return;
    }
    skipInitialFetch.current = false;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await fetch(
          "/api/app-packages?app=" +
            encodeURIComponent(appSlug) +
            "&q=" +
            encodeURIComponent(trimmed),
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("lookup failed");
        const body = (await response.json()) as { packages: ApplicationPackage[] };
        setPackages(body.packages);
        setStatus("idle");
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setStatus("error");
      }
    }, 260);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, appSlug]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Filter this application's dependencies…"
          aria-label="Filter dependencies"
          className="w-full max-w-sm rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[13px] text-text placeholder:text-text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <span className="tnum text-[12px] text-text-muted" role="status" aria-live="polite">
          {status === "loading"
            ? "Searching…"
            : term.trim()
              ? packages.length + " matching"
              : "Top " + packages.length + " of " + totalPackages.toLocaleString("en-US") + " by downloads"}
        </span>
      </div>

      {status === "error" ? (
        <p className="rounded-lg border border-border-subtle bg-critical-soft px-4 py-3 text-[13px] text-critical">
          Could not search dependencies. The database may be unreachable.
        </p>
      ) : packages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-subtle px-6 py-10 text-center">
          <p className="text-[14px] font-medium text-text">No match</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-text-muted">
            No package within 5 hops of this application has a name containing
            &ldquo;{term.trim()}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wider text-text-subtle">
                <th className="px-4 py-2.5 font-medium">Package</th>
                <th className="px-4 py-2.5 font-medium">Depth</th>
                <th className="px-4 py-2.5 font-medium">Maintainers</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Weekly</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((entry) => (
                <tr key={entry.name} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-2.5 align-top">
                    <Link
                      href={packageHref(entry.name)}
                      className="font-mono text-[13px] text-accent hover:underline"
                    >
                      {entry.name}
                    </Link>
                    <div className="mt-0.5">
                      <WhyPanel appSlug={appSlug} packageName={entry.name} />
                    </div>
                  </td>
                  <td className="tnum px-4 py-2.5 align-top text-[13px] text-text-muted">
                    {entry.hops} {entry.hops === 1 ? "hop" : "hops"}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    {entry.maintainerCount === 1 ? (
                      <span className="rounded-md bg-high-soft px-1.5 py-0.5 text-[11px] font-medium text-high">
                        1 person
                      </span>
                    ) : (
                      <span className="tnum text-[13px] text-text-muted">
                        {entry.maintainerCount}
                      </span>
                    )}
                  </td>
                  <td className="tnum hidden px-4 py-2.5 align-top text-[13px] text-text-muted sm:table-cell">
                    {compactNumber(entry.weeklyDownloads)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
