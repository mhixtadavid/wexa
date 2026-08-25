import type { Snapshot } from "./types";

export interface ExposedToEdge {
  appSlug: string;
  ghsaId: string;
  /** Shortest hop distance from the application to the vulnerable version. */
  hops: number;
  versionId: string;
}

export interface ApplicationRollup {
  slug: string;
  transitiveVersionCount: number;
  transitivePackageCount: number;
  maxDepth: number;
  maintainerCount: number;
  soloMaintainedCount: number;
  advisoryCount: number;
  criticalAdvisoryCount: number;
  nonPermissiveCount: number;
  deprecatedCount: number;
}

/**
 * Exact, unbounded per-application aggregates, computed here rather than in
 * Cypher.
 *
 * Why: a variable-length Cypher pattern enumerates every *path*, not every
 * reachable node, so its cost grows roughly 2.5x per hop on this graph while
 * the answer converges by about hop four. Measured on the live instance,
 * counting reachable versions took 341ms at depth 3 and 3,839ms at depth 6 to
 * find 4% more nodes.
 *
 * A breadth-first sweep over the snapshot's edge lists gets the same numbers
 * exactly and unbounded, in milliseconds, because it visits each node once
 * instead of walking every path into it. These land as properties on the
 * Application nodes, so the dashboard reads them with an index lookup and the
 * interactive traversals stay bounded.
 */
export function computeRollups(snapshot: Snapshot): {
  rollups: ApplicationRollup[];
  exposedTo: ExposedToEdge[];
} {
  // Adjacency built once and shared across all six applications.
  const requires = new Map<string, string[]>();
  for (const edge of snapshot.edges.requires) {
    const list = requires.get(edge.fromId);
    if (list) list.push(edge.toId);
    else requires.set(edge.fromId, [edge.toId]);
  }

  const directDeps = new Map<string, string[]>();
  for (const edge of snapshot.edges.dependsOn) {
    const list = directDeps.get(edge.appSlug);
    if (list) list.push(edge.toId);
    else directDeps.set(edge.appSlug, [edge.toId]);
  }

  const versionToPackage = new Map<string, string>();
  for (const version of snapshot.versions) versionToPackage.set(version.id, version.packageName);

  const deprecated = new Set(snapshot.versions.filter((v) => v.deprecated).map((v) => v.id));

  const maintainersByPackage = new Map<string, Set<string>>();
  for (const edge of snapshot.edges.maintains) {
    const set = maintainersByPackage.get(edge.packageName);
    if (set) set.add(edge.username);
    else maintainersByPackage.set(edge.packageName, new Set([edge.username]));
  }

  const advisoriesByVersion = new Map<string, string[]>();
  for (const edge of snapshot.edges.affects) {
    const list = advisoriesByVersion.get(edge.versionId);
    if (list) list.push(edge.ghsaId);
    else advisoriesByVersion.set(edge.versionId, [edge.ghsaId]);
  }

  const severityById = new Map(snapshot.advisories.map((a) => [a.ghsaId, a.severity]));

  const licenseByVersion = new Map(
    snapshot.edges.licensedUnder.map((edge) => [edge.versionId, edge.spdxId]),
  );
  const categoryBySpdx = new Map(snapshot.licenses.map((l) => [l.spdxId, l.category]));

  const exposedTo: ExposedToEdge[] = [];

  const rollups = snapshot.applications.map((app) => {
    // Breadth-first so the recorded depth is the shortest distance from the
    // application, which is what "how deep is this buried" should mean.
    const seen = new Map<string, number>();
    let frontier = directDeps.get(app.slug) ?? [];
    for (const id of frontier) if (!seen.has(id)) seen.set(id, 1);

    let depth = 1;
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const child of requires.get(id) ?? []) {
          if (seen.has(child)) continue;
          seen.set(child, depth + 1);
          next.push(child);
        }
      }
      frontier = next;
      if (next.length > 0) depth += 1;
    }

    const packages = new Set<string>();
    for (const versionId of seen.keys()) {
      const name = versionToPackage.get(versionId);
      if (name) packages.add(name);
    }

    const maintainers = new Set<string>();
    let soloMaintained = 0;
    for (const name of packages) {
      const owners = maintainersByPackage.get(name);
      if (!owners) continue;
      for (const owner of owners) maintainers.add(owner);
      if (owners.size === 1) soloMaintained += 1;
    }

    // Reachability is materialised as an edge because computing it live cost
    // 11.7s: one shortestPath per advisory, 127 times. The BFS above already
    // knows the answer, so the edge is written once at seed time and the
    // explanatory path is fetched on demand for the advisory the user opens.
    const advisories = new Set<string>();
    let critical = 0;
    for (const [versionId, hops] of seen) {
      for (const ghsaId of advisoriesByVersion.get(versionId) ?? []) {
        if (advisories.has(ghsaId)) continue;
        advisories.add(ghsaId);
        exposedTo.push({ appSlug: app.slug, ghsaId, hops, versionId });
        if (severityById.get(ghsaId) === "CRITICAL") critical += 1;
      }
    }

    let nonPermissive = 0;
    let deprecatedCount = 0;
    for (const versionId of seen.keys()) {
      const spdxId = licenseByVersion.get(versionId);
      const category = spdxId ? categoryBySpdx.get(spdxId) : undefined;
      if (category && category !== "permissive") nonPermissive += 1;
      if (deprecated.has(versionId)) deprecatedCount += 1;
    }

    return {
      slug: app.slug,
      transitiveVersionCount: seen.size,
      transitivePackageCount: packages.size,
      maxDepth: depth,
      maintainerCount: maintainers.size,
      soloMaintainedCount: soloMaintained,
      advisoryCount: advisories.size,
      criticalAdvisoryCount: critical,
      nonPermissiveCount: nonPermissive,
      deprecatedCount,
    };
  });

  return { rollups, exposedTo };
}
