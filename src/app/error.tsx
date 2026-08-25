"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // A 503 from the query layer reaches here as a generic Error, so the copy
  // covers both cases rather than guessing which one happened.
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-lg font-semibold tracking-tight text-text">
        This page could not be loaded
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-text-muted">
        The graph database may be unreachable or still starting up. The banner at the top of the
        page shows the current connection status.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-fg transition-colors hover:bg-accent-hover"
      >
        Try again
      </button>
      {error.digest ? (
        <p className="mt-4 font-mono text-[11px] text-text-subtle">ref {error.digest}</p>
      ) : null}
    </div>
  );
}
