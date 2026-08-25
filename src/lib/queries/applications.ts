import { read, readOne } from "@/lib/db/session";

import type {
  ApplicationSummary,
  LicenseExposure,
  MaintainerExposure,
  ReachableAdvisory,
  SoloMaintainedPackage,
} from "./types";

/**
 * Two CognoDB behaviours shape how every query below is written, both found by
 * running them rather than reading docs:
 *
 * 1. A traversal bound cannot be a parameter (`*1..$depth` is a syntax error),
 *    so depths are literals. Values are always parameters; only the bound is
 *    fixed. Nothing is ever concatenated into a query string.
 *
 * 2. Aggregating inside a map literal nulls the non-aggregated fields, and
 *    ORDER BY on a map field does not sort. So every query aggregates and
 *    orders on plain variables in a WITH clause, and constructs its result map
 *    only in the final RETURN.
 *
 * Depth is fixed at 5 for a measured reason:
 *
 *   depth 3 -> 801ms    depth 5 -> 3,933ms
 *   depth 4 -> 1,545ms  depth 6 -> 12,236ms
 *
 * Cost grows ~2.5x per hop because a variable-length pattern enumerates every
 * path, while the answer converges by depth 4 — depths 4, 5 and 6 return the
 * same top maintainer with the same count. Exact unbounded totals are
 * precomputed at seed time and read from Application properties instead.
 */
export const INTERACTIVE_DEPTH = 5;

const APPLICATION_FIELDS = `
  slug: a.slug,
  name: a.name,
  description: a.description,
  category: a.category,
  repoUrl: a.repoUrl,
  npmPackage: a.npmPackage,
  directDepCount: a.directDepCount,
  transitivePackageCount: a.transitivePackageCount,
  transitiveVersionCount: a.transitiveVersionCount,
  maintainerCount: a.maintainerCount,
  soloMaintainedCount: a.soloMaintainedCount,
  advisoryCount: a.advisoryCount,
  criticalAdvisoryCount: a.criticalAdvisoryCount,
  nonPermissiveCount: a.nonPermissiveCount,
  deprecatedCount: a.deprecatedCount,
  maxDepth: a.maxDepth
`;

/**
 * Dashboard listing. Reads only precomputed properties, so it is a scan over
 * six nodes rather than a traversal.
 */
export function listApplications(): Promise<ApplicationSummary[]> {
  return read(
    `
    MATCH (a:Application)
    WITH a ORDER BY a.transitivePackageCount DESC
    RETURN { ${APPLICATION_FIELDS} } AS app
    `,
    {},
    (record) => record.get("app") as ApplicationSummary,
  );
}

export function getApplication(slug: string): Promise<ApplicationSummary | null> {
  return readOne(
    `
    MATCH (a:Application {slug: $slug})
    RETURN { ${APPLICATION_FIELDS} } AS app
    `,
    { slug },
    (record) => record.get("app") as ApplicationSummary,
  );
}

/**
 * Q2 — Shared-maintainer exposure. The headline query.
 *
 * Walks REQUIRES to unknown depth, steps sideways onto MAINTAINS (a different
 * relationship type, traversed in the opposite direction), and aggregates by
 * person. It answers "who can publish code into this application", which is a
 * different question from "who wrote it".
 *
 * Relationally this is a recursive CTE to materialise the transitive closure,
 * joined back to a package-maintainer table, grouped and ranked — and the
 * closure must be fully built before the join can begin. Here it is one
 * pattern, and the sideways hop costs nothing extra.
 */
export function getMaintainerExposure(slug: string, limit = 25): Promise<MaintainerExposure[]> {
  return read(
    `
    MATCH (a:Application {slug: $slug})-[:DEPENDS_ON|REQUIRES*1..5]->(v:Version)
    MATCH (p:Package)-[:HAS_VERSION]->(v)
    MATCH (m:Maintainer)-[:MAINTAINS]->(p)
    WITH m, collect(DISTINCT p.name) AS packages
    WITH m, packages, size(packages) AS packagesInTree
    ORDER BY packagesInTree DESC, m.username ASC
    LIMIT $limit
    RETURN {
      username: m.username,
      email: m.email,
      packagesInTree: packagesInTree,
      packagesTotal: m.packageCount,
      samplePackages: packages[0..5]
    } AS row
    `,
    { slug, limit },
    (record) => record.get("row") as MaintainerExposure,
  );
}

/**
 * Q3 — Bus factor. Packages in the tree that exactly one person can publish,
 * ranked by how much of the graph depends on them.
 */
export function getSoloMaintainedPackages(
  slug: string,
  limit = 25,
): Promise<SoloMaintainedPackage[]> {
  return read(
    `
    MATCH (a:Application {slug: $slug})-[:DEPENDS_ON|REQUIRES*1..5]->(v:Version)
    MATCH (p:Package)-[:HAS_VERSION]->(v)
    WITH p, min(v.depth) AS minDepth
    MATCH (m:Maintainer)-[:MAINTAINS]->(p)
    WITH p, minDepth, collect(m.username) AS owners
    WHERE size(owners) = 1
    OPTIONAL MATCH (:Version)-[r:REQUIRES]->(:Version)<-[:HAS_VERSION]-(p)
    WITH p, minDepth, owners, count(r) AS dependentCount
    ORDER BY dependentCount DESC, p.weeklyDownloads DESC
    LIMIT $limit
    RETURN {
      name: p.name,
      maintainer: owners[0],
      weeklyDownloads: p.weeklyDownloads,
      dependentCount: dependentCount,
      minDepth: minDepth
    } AS row
    `,
    { slug, limit },
    (record) => record.get("row") as SoloMaintainedPackage,
  );
}

/**
 * Q4 — Reachable vulnerabilities.
 *
 * Reads the materialised EXPOSED_TO edge rather than traversing. Computing
 * this live meant one shortestPath per advisory — 127 of them — and measured
 * 11.7s, too slow to render. The seed-time breadth-first sweep already knows
 * every reachable advisory and its hop distance, so the edge is written once
 * and read back with an index lookup.
 *
 * The explanatory path is deliberately not fetched here: it is loaded on
 * demand by `getDependencyPaths` for the single advisory a user opens, which
 * is both faster and better interaction design than computing 127 paths
 * nobody asked to see.
 */
export function getReachableAdvisories(slug: string, limit = 50): Promise<ReachableAdvisory[]> {
  return read(
    `
    MATCH (a:Application {slug: $slug})-[e:EXPOSED_TO]->(adv:Advisory)
    MATCH (target:Version {id: e.versionId})
    WITH adv, target, e.hops AS hops,
      CASE adv.severity
        WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1
        WHEN 'MODERATE' THEN 2 WHEN 'LOW' THEN 3 ELSE 4
      END AS rank
    ORDER BY rank ASC, hops ASC
    LIMIT $limit
    RETURN {
      ghsaId: adv.ghsaId,
      summary: adv.summary,
      severity: adv.severity,
      cvss: adv.cvss,
      url: adv.url,
      packageName: target.packageName,
      versionId: target.id,
      hops: hops,
      chain: []
    } AS row
    `,
    { slug, limit },
    (record) => record.get("row") as ReachableAdvisory,
  );
}

/**
 * Q6 — Licence exposure. The relationship-type filter is re-applied at every
 * hop of the traversal, which is the part a recursive CTE makes verbose: the
 * condition has to be repeated inside the recursive term.
 */
export function getLicenseExposure(slug: string): Promise<LicenseExposure[]> {
  return read(
    `
    MATCH (a:Application {slug: $slug})-[:DEPENDS_ON|REQUIRES*1..5]->(v:Version)
    MATCH (v)-[:LICENSED_UNDER]->(l:License)
    WHERE l.category <> 'permissive'
    WITH l, collect(DISTINCT v.packageName) AS packages
    WITH l, packages, size(packages) AS versionCount
    ORDER BY versionCount DESC
    RETURN {
      spdxId: l.spdxId,
      category: l.category,
      versionCount: versionCount,
      samplePackages: packages[0..6]
    } AS row
    `,
    { slug },
    (record) => record.get("row") as LicenseExposure,
  );
}
