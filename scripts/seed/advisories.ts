const OSV_BATCH = "https://api.osv.dev/v1/querybatch";
const OSV_VULN = "https://api.osv.dev/v1/vulns";

export interface Advisory {
  ghsaId: string;
  summary: string;
  severity: "CRITICAL" | "HIGH" | "MODERATE" | "LOW" | "UNKNOWN";
  cvss: number | null;
  publishedAt: string | null;
  url: string;
}

export interface AffectsEdge {
  ghsaId: string;
  versionId: string;
}

interface BatchResult {
  results?: Array<{ vulns?: Array<{ id: string }> }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postJson(url: string, body: unknown, attempt = 0): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } catch (error) {
    if (attempt >= 3) throw error;
    await sleep(750 * 2 ** attempt);
    return postJson(url, body, attempt + 1);
  }
}

/** OSV reports GHSA severity in a vendor-specific field; CVSS lives separately. */
function normaliseSeverity(vuln: Record<string, unknown>): Advisory["severity"] {
  const specific = vuln.database_specific as { severity?: string } | undefined;
  const value = specific?.severity?.toUpperCase();
  if (value === "CRITICAL" || value === "HIGH" || value === "MODERATE" || value === "LOW") {
    return value;
  }
  return "UNKNOWN";
}

function extractCvss(vuln: Record<string, unknown>): number | null {
  const severity = vuln.severity as Array<{ type?: string; score?: string }> | undefined;
  const entry = severity?.find((s) => s.type?.startsWith("CVSS"));
  if (!entry?.score) return null;
  // OSV gives a CVSS vector string, not a number; the numeric score, when
  // present, appears as a bare decimal instead.
  const numeric = Number.parseFloat(entry.score);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Queries OSV for every resolved version in the graph and keeps only the
 * advisories that actually match one — an advisory attached to no version in
 * the tree would be noise in the vulnerability query.
 */
export async function fetchAdvisories(
  versionIds: string[],
  onProgress?: (message: string) => void,
): Promise<{ advisories: Advisory[]; affects: AffectsEdge[] }> {
  const queries = versionIds.map((id) => {
    const at = id.lastIndexOf("@");
    return {
      versionId: id,
      package: { name: id.slice(0, at), ecosystem: "npm" },
      version: id.slice(at + 1),
    };
  });

  const affects: AffectsEdge[] = [];
  const vulnIds = new Set<string>();

  const BATCH = 500;
  for (let i = 0; i < queries.length; i += BATCH) {
    const slice = queries.slice(i, i + BATCH);
    const payload = (await postJson(OSV_BATCH, {
      queries: slice.map((q) => ({ package: q.package, version: q.version })),
    })) as BatchResult | null;

    payload?.results?.forEach((result, index) => {
      for (const vuln of result.vulns ?? []) {
        vulnIds.add(vuln.id);
        affects.push({ ghsaId: vuln.id, versionId: slice[index].versionId });
      }
    });

    onProgress?.(
      `  advisories: ${Math.min(i + BATCH, queries.length)}/${queries.length} versions checked, ${vulnIds.size} distinct advisories`,
    );
  }

  const advisories: Advisory[] = [];
  let done = 0;
  for (const id of vulnIds) {
    try {
      const response = await fetch(`${OSV_VULN}/${id}`, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) continue;
      const vuln = (await response.json()) as Record<string, unknown>;
      const aliases = (vuln.aliases as string[] | undefined) ?? [];
      advisories.push({
        ghsaId: id,
        summary: (vuln.summary as string) ?? (aliases[0] ?? id),
        severity: normaliseSeverity(vuln),
        cvss: extractCvss(vuln),
        publishedAt: (vuln.published as string) ?? null,
        url: `https://osv.dev/vulnerability/${id}`,
      });
    } catch {
      // A single unreachable advisory should not fail the whole seed.
    }
    if (++done % 25 === 0) onProgress?.(`  advisory detail: ${done}/${vulnIds.size}`);
  }

  return { advisories, affects };
}
