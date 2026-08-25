/** Shared formatting helpers, so numbers read the same on every screen. */

export function compactNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value < 1000) return String(value);
  if (value < 1_000_000) return (value / 1000).toFixed(value < 10_000 ? 1 : 0) + "k";
  if (value < 1_000_000_000) return (value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0) + "M";
  return (value / 1_000_000_000).toFixed(1) + "B";
}

export function fullNumber(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString("en-US");
}

/** Package names contain characters that must survive a URL segment. */
export function packageHref(name: string): string {
  return "/packages/" + name.split("/").map(encodeURIComponent).join("/");
}

export function maintainerHref(username: string): string {
  return "/maintainers/" + encodeURIComponent(username);
}

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MODERATE", "LOW", "UNKNOWN"] as const;

export function severityRank(severity: string): number {
  const index = SEVERITY_ORDER.indexOf(severity as (typeof SEVERITY_ORDER)[number]);
  return index === -1 ? SEVERITY_ORDER.length : index;
}
