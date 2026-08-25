import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";

const CACHE_DIR = resolve(process.cwd(), "data/cache");
const REGISTRY = "https://registry.npmjs.org";
const DOWNLOADS = "https://api.npmjs.org/downloads/point/last-week";

/**
 * The npm registry is the only network dependency of the seed pipeline, and it
 * is rate limited. Every response is cached to disk keyed by URL, so the fetch
 * runs once and every re-run is instant and offline.
 */
async function cachedFetch(url: string, accept?: string): Promise<unknown | null> {
  const key = createHash("sha256").update(url).digest("hex").slice(0, 40);
  const path = resolve(CACHE_DIR, key.slice(0, 2), `${key}.json`);

  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    // Cache miss — fall through to the network.
  }

  const response = await fetchWithRetry(url, accept);
  if (response === null) return null;

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(response));
  return response;
}

/**
 * 404s are expected and meaningful (unpublished packages, versions that never
 * existed) and are cached as null. Transient failures are retried with backoff.
 */
async function fetchWithRetry(url: string, accept?: string, attempt = 0): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: accept ? { Accept: accept } : undefined,
      signal: AbortSignal.timeout(20_000),
    });

    if (response.status === 404) return null;

    if (!response.ok) {
      if (attempt >= 3) throw new Error(`${response.status} ${response.statusText} for ${url}`);
      await sleep(500 * 2 ** attempt);
      return fetchWithRetry(url, accept, attempt + 1);
    }

    return await response.json();
  } catch (error) {
    if (attempt >= 3) throw error;
    await sleep(500 * 2 ** attempt);
    return fetchWithRetry(url, accept, attempt + 1);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Scoped names contain a slash that must survive into the path unencoded. */
const encodeName = (name: string) => name.replace(/\//g, "%2F");

export interface AbbreviatedPackument {
  name: string;
  "dist-tags": Record<string, string>;
  versions: Record<string, { version: string; dependencies?: Record<string, string>; deprecated?: string }>;
}

/**
 * The abbreviated packument is roughly a third the size of the full document
 * and carries everything the dependency walk needs: the version list and each
 * version's dependency ranges.
 */
export async function getPackument(name: string): Promise<AbbreviatedPackument | null> {
  const doc = await cachedFetch(
    `${REGISTRY}/${encodeName(name)}`,
    "application/vnd.npm.install-v1+json",
  );
  return (doc as AbbreviatedPackument | null) ?? null;
}

export interface VersionManifest {
  name: string;
  version: string;
  description?: string;
  license?: string | { type?: string };
  deprecated?: string;
  maintainers?: Array<{ name: string; email?: string }>;
  repository?: string | { url?: string };
}

/**
 * Fetched per resolved version rather than per package, so maintainers and
 * licence reflect the release that is actually in the tree — not whatever the
 * latest release happens to say today. Around 2 KB each.
 */
export async function getVersionManifest(name: string, version: string): Promise<VersionManifest | null> {
  const doc = await cachedFetch(`${REGISTRY}/${encodeName(name)}/${version}`);
  return (doc as VersionManifest | null) ?? null;
}

/**
 * The bulk downloads endpoint accepts up to 128 comma-separated names but only
 * for unscoped packages; scoped names must be requested one at a time and come
 * back unkeyed. Both shapes are normalised here.
 */
export async function getWeeklyDownloads(names: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const scoped = names.filter((n) => n.startsWith("@"));
  const plain = names.filter((n) => !n.startsWith("@"));

  for (let i = 0; i < plain.length; i += 100) {
    const batch = plain.slice(i, i + 100);
    const doc = (await cachedFetch(`${DOWNLOADS}/${batch.join(",")}`)) as Record<
      string,
      { downloads?: number } | null
    > | null;
    if (!doc) continue;
    for (const [name, entry] of Object.entries(doc)) {
      if (entry?.downloads != null) out.set(name, entry.downloads);
    }
  }

  for (const name of scoped) {
    const doc = (await cachedFetch(`${DOWNLOADS}/${encodeName(name)}`)) as
      | { downloads?: number }
      | null;
    if (doc?.downloads != null) out.set(name, doc.downloads);
  }

  return out;
}
