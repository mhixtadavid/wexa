import Link from "next/link";
import type { ReactNode } from "react";

/** Small shared primitives. Kept in one file because each is a few lines and
 *  scattering them across a dozen modules would cost more than it explains. */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-xl border border-border-subtle bg-surface " + className
      }
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-text">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "bg-critical-soft text-critical",
  HIGH: "bg-high-soft text-high",
  MODERATE: "bg-moderate-soft text-moderate",
  LOW: "bg-low-soft text-low",
  UNKNOWN: "bg-low-soft text-low",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide " +
        (SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.UNKNOWN)
      }
    >
      {severity.toLowerCase()}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "critical" | "warn";
}) {
  const valueTone =
    tone === "critical" ? "text-critical" : tone === "warn" ? "text-high" : "text-text";
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">
        {label}
      </dt>
      <dd className={"tnum mt-1 text-2xl font-semibold tracking-tight " + valueTone}>{value}</dd>
      {hint ? <p className="mt-0.5 text-[12px] text-text-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * A dependency chain, rendered as the sequence it is. Wraps rather than
 * scrolls, because a chain that runs off the edge of the screen loses the
 * point it exists to make.
 */
export function Chain({ chain }: { chain: string[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
      {chain.map((node, index) => (
        <li key={node + index} className="flex items-center gap-1">
          {index > 0 ? (
            <span aria-hidden className="text-text-subtle">
              →
            </span>
          ) : null}
          <span
            className={
              "rounded-md px-1.5 py-0.5 font-mono text-[12px] " +
              (index === 0
                ? "bg-accent-soft text-accent"
                : index === chain.length - 1
                  ? "bg-surface-sunken font-medium text-text"
                  : "bg-surface-sunken text-text-muted")
            }
          >
            {node}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border-subtle px-6 py-10 text-center">
      <p className="text-[14px] font-medium text-text">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-text-muted">{body}</p>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={"skeleton rounded-md " + className} />;
}

export function Crumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px]">
      {items.map((item, index) => (
        <span key={item.label + index} className="flex items-center gap-1.5">
          {index > 0 ? (
            <span aria-hidden className="text-text-subtle">
              /
            </span>
          ) : null}
          {item.href ? (
            <Link href={item.href} className="text-text-muted transition-colors hover:text-accent">
              {item.label}
            </Link>
          ) : (
            <span className="text-text">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
