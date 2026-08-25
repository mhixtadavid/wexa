import semver from "semver";
import pLimit from "p-limit";

import { getPackument } from "./registry";
import { SEED_APPLICATIONS, type SeedApplication } from "./applications";

/**
 * Depth and size caps exist because the target is a free CognoDB c0 instance:
 * 0.5 vCPU, 256 MB RAM, 1 GB disk. An uncapped walk of six large applications
 * produces a graph that does not fit and traversals that do not finish.
 */
export const MAX_DEPTH = 8;
export const MAX_VERSIONS = 12_000;
const CONCURRENCY = 8;

export interface ResolvedVersion {
  /** `name@version` — the natural key for a Version node. */
  id: string;
  name: string;
  version: string;
  depth: number;
}

export interface RequiresEdge {
  fromId: string;
  toId: string;
  range: string;
}

export interface DependsOnEdge {
  appSlug: string;
  toId: string;
  range: string;
}

export interface ResolveResult {
  versions: Map<string, ResolvedVersion>;
  requires: RequiresEdge[];
  dependsOn: DependsOnEdge[];
  applications: SeedApplication[];
  stats: {
    unresolvable: number;
    missing: number;
    truncatedAtDepth: number;
    hitCeiling: boolean;
  };
}

/**
 * Resolves a dependency range against a package's published versions the same
 * way a package manager would: the highest stable release that satisfies the
 * range. Non-semver ranges (`workspace:*`, git URLs, aliases) fall back to the
 * `latest` dist-tag, which is what npm effectively does for `*`.
 */
function resolveRange(versions: string[], latest: string | undefined, range: string): string | null {
  const match = semver.maxSatisfying(versions, range, { includePrerelease: false });
  if (match) return match;

  if (range === "*" || range === "" || range.startsWith("workspace:")) {
    return latest ?? null;
  }

  // Alias syntax: "npm:real-package@^1.0.0" — the range after the last '@'.
  if (range.startsWith("npm:")) {
    const aliased = range.slice(4);
    const at = aliased.lastIndexOf("@");
    if (at > 0) {
      const inner = semver.maxSatisfying(versions, aliased.slice(at + 1), { includePrerelease: false });
      if (inner) return inner;
    }
  }

  return latest ?? null;
}

/**
 * Breadth-first walk of the production dependency graph, level by level.
 *
 * Working one level at a time keeps the depth recorded on each version honest
 * (it is the shortest distance from an application, which is what the UI shows)
 * and lets the whole level be fetched concurrently.
 */
export async function resolveDependencyGraph(
  onProgress?: (message: string) => void,
): Promise<ResolveResult> {
  const limit = pLimit(CONCURRENCY);

  const versions = new Map<string, ResolvedVersion>();
  const requires: RequiresEdge[] = [];
  const dependsOn: DependsOnEdge[] = [];
  const stats = { unresolvable: 0, missing: 0, truncatedAtDepth: 0, hitCeiling: false };

  /** Ranges still to resolve, grouped by the parent that asked for them. */
  interface Pending {
    name: string;
    range: string;
    parentId: string | null;
    appSlug: string | null;
  }

  let frontier: Pending[] = [];

  // Level 0: each application's direct dependencies.
  for (const app of SEED_APPLICATIONS) {
    const packument = await getPackument(app.npmPackage);
    if (!packument) {
      onProgress?.(`  ! ${app.npmPackage} not found on the registry`);
      continue;
    }
    const latest = packument["dist-tags"]?.latest;
    const manifest = latest ? packument.versions[latest] : undefined;
    const deps = manifest?.dependencies ?? {};

    for (const [name, range] of Object.entries(deps)) {
      frontier.push({ name, range, parentId: null, appSlug: app.slug });
    }
    onProgress?.(`  ${app.name}: ${Object.keys(deps).length} direct dependencies`);
  }

  for (let depth = 1; depth <= MAX_DEPTH && frontier.length > 0; depth++) {
    const next: Pending[] = [];

    const results = await Promise.all(
      frontier.map((pending) =>
        limit(async () => {
          const packument = await getPackument(pending.name);
          return { pending, packument };
        }),
      ),
    );

    for (const { pending, packument } of results) {
      if (!packument) {
        stats.missing += 1;
        continue;
      }

      const available = Object.keys(packument.versions ?? {});
      const resolved = resolveRange(available, packument["dist-tags"]?.latest, pending.range);

      if (!resolved) {
        stats.unresolvable += 1;
        continue;
      }

      const id = `${pending.name}@${resolved}`;

      // Record the edge regardless of whether the node is new — a package can
      // be required by many parents, and every one of those paths is real.
      if (pending.parentId) {
        requires.push({ fromId: pending.parentId, toId: id, range: pending.range });
      } else if (pending.appSlug) {
        dependsOn.push({ appSlug: pending.appSlug, toId: id, range: pending.range });
      }

      if (versions.has(id)) continue;

      if (versions.size >= MAX_VERSIONS) {
        stats.hitCeiling = true;
        continue;
      }

      versions.set(id, { id, name: pending.name, version: resolved, depth });

      if (depth === MAX_DEPTH) {
        stats.truncatedAtDepth += 1;
        continue;
      }

      const deps = packument.versions[resolved]?.dependencies ?? {};
      for (const [name, range] of Object.entries(deps)) {
        next.push({ name, range, parentId: id, appSlug: null });
      }
    }

    onProgress?.(
      `  depth ${depth}: ${versions.size} versions resolved, ${next.length} edges queued`,
    );
    frontier = next;
  }

  return { versions, requires, dependsOn, applications: SEED_APPLICATIONS, stats };
}
