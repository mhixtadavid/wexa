import { read, readOne } from "@/lib/db/session";

import type { GraphStats, MaintainerDetail, SearchResult, SharedExposureEntry } from "./types";

/** Dashboard counters. Label scans over a small graph, no traversal. */
export function getGraphStats(): Promise<GraphStats | null> {
  return readOne(
    `
    MATCH (app:Application) WITH count(app) AS applications
    MATCH (p:Package) WITH applications, count(p) AS packages
    MATCH (v:Version) WITH applications, packages, count(v) AS versions
    MATCH (m:Maintainer) WITH applications, packages, versions, count(m) AS maintainers
    MATCH (adv:Advisory)
    WITH applications, packages, versions, maintainers, count(adv) AS advisories
    MATCH ()-[r]->()
    WITH applications, packages, versions, maintainers, advisories, count(r) AS relationships
    MATCH (solo:Package)<-[:MAINTAINS]-(owner:Maintainer)
    WITH applications, packages, versions, maintainers, advisories, relationships,
         solo, count(owner) AS owners
    WITH applications, packages, versions, maintainers, advisories, relationships,
         sum(CASE WHEN owners = 1 THEN 1 ELSE 0 END) AS soloMaintainedPackages
    RETURN {
      applications: applications,
      packages: packages,
      versions: versions,
      maintainers: maintainers,
      advisories: advisories,
      relationships: relationships,
      soloMaintainedPackages: soloMaintainedPackages
    } AS row
    `,
    {},
    (record) => record.get("row") as GraphStats,
  );
}

/**
 * Search across the three node types a person would look for by name.
 * `toLower` with CONTAINS is a scan, which is acceptable on 3,206 packages and
 * keeps the query honest about being a simple lookup rather than a traversal.
 */
export function search(term: string, limit = 20): Promise<SearchResult[]> {
  return read(
    `
    CALL {
      MATCH (a:Application)
      WHERE toLower(a.name) CONTAINS toLower($term)
      RETURN { kind: 'application', id: a.slug, label: a.name, detail: a.category } AS row
      LIMIT 5
      UNION
      MATCH (p:Package)
      WHERE toLower(p.name) CONTAINS toLower($term)
      RETURN { kind: 'package', id: p.name, label: p.name, detail: p.description } AS row
      LIMIT 12
      UNION
      MATCH (m:Maintainer)
      WHERE toLower(m.username) CONTAINS toLower($term)
      RETURN {
        kind: 'maintainer', id: m.username, label: m.username,
        detail: toString(m.packageCount) + ' packages'
      } AS row
      LIMIT 8
    }
    RETURN row
    LIMIT $limit
    `,
    { term, limit },
    (record) => record.get("row") as SearchResult,
  );
}

/**
 * The maintainer detail page: everything one person can reach.
 *
 * This is the inverse of the blast-radius view and the screen that makes the
 * argument without a caption — a single npm account, and every application in
 * the portfolio whose build it lands in.
 */
export async function getMaintainerDetail(username: string): Promise<MaintainerDetail | null> {
  const summary = await readOne(
    `
    MATCH (m:Maintainer {username: $username})
    OPTIONAL MATCH (m)-[:MAINTAINS]->(p:Package)
    OPTIONAL MATCH (p)<-[:MAINTAINS]-(other:Maintainer)
    WITH m, p, count(DISTINCT other) AS owners
    ORDER BY p.weeklyDownloads DESC
    WITH m, collect({
      name: p.name,
      weeklyDownloads: p.weeklyDownloads,
      soloMaintained: owners = 1
    })[0..60] AS packages
    RETURN {
      username: m.username,
      email: m.email,
      packageCount: m.packageCount,
      packages: packages
    } AS row
    `,
    { username },
    (record) => record.get("row") as Omit<MaintainerDetail, "applications">,
  );

  if (!summary?.username) return null;

  const applications = await read(
    `
    MATCH (m:Maintainer {username: $username})-[:MAINTAINS]->(p:Package)
    MATCH (p)-[:HAS_VERSION]->(v:Version)
    MATCH (app:Application)-[:DEPENDS_ON|REQUIRES*1..5]->(v)
    WITH app, count(DISTINCT p) AS packagesReached
    ORDER BY packagesReached DESC
    RETURN { slug: app.slug, name: app.name, packagesReached: packagesReached } AS row
    `,
    { username },
    (record) => record.get("row") as MaintainerDetail["applications"][number],
  );

  return { ...summary, applications };
}

interface ReachedPackage {
  packageName: string;
  weeklyDownloads: number | null;
  maintainerCount: number;
  hops: number;
}

/**
 * Every package one application reaches, with its shortest hop distance.
 * `min(length(path))` gives the distance from *this* application specifically,
 * rather than the Version.depth property, which records the shortest distance
 * from any of the six.
 */
function getReachedPackages(slug: string): Promise<ReachedPackage[]> {
  return read(
    `
    MATCH path = (a:Application {slug: $slug})-[:DEPENDS_ON|REQUIRES*1..4]->(v:Version)
    MATCH (p:Package)-[:HAS_VERSION]->(v)
    WITH p, min(length(path)) AS hops
    OPTIONAL MATCH (m:Maintainer)-[:MAINTAINS]->(p)
    WITH p, hops, count(m) AS maintainerCount
    RETURN {
      packageName: p.name,
      weeklyDownloads: p.weeklyDownloads,
      maintainerCount: maintainerCount,
      hops: hops
    } AS row
    `,
    { slug },
    (record) => record.get("row") as ReachedPackage,
  );
}

/**
 * Q7 — Shared exposure between two applications.
 *
 * Deliberately two queries rather than one.
 *
 * Expressing the intersection as a single statement — matching the second
 * application's traversal against an already-bound package from the first —
 * made the planner re-walk the second tree once per candidate package and
 * exceeded the server's deadline even for the two smallest applications. Two
 * independent bounded traversals each return in about a second, and the
 * intersection is a hash join over a few thousand strings, which is work the
 * application layer does better than the database.
 *
 * The traversals are still the graph's job; only the set intersection moved.
 */
export async function getSharedExposure(
  slugA: string,
  slugB: string,
  limit = 40,
): Promise<SharedExposureEntry[]> {
  const [reachedByA, reachedByB] = await Promise.all([
    getReachedPackages(slugA),
    getReachedPackages(slugB),
  ]);

  const inB = new Map(reachedByB.map((row) => [row.packageName, row]));

  return reachedByA
    .flatMap((rowA) => {
      const rowB = inB.get(rowA.packageName);
      if (!rowB) return [];
      return [
        {
          packageName: rowA.packageName,
          weeklyDownloads: rowA.weeklyDownloads,
          maintainerCount: rowA.maintainerCount,
          hopsA: rowA.hops,
          hopsB: rowB.hops,
        },
      ];
    })
    .sort((x, y) => (y.weeklyDownloads ?? 0) - (x.weeklyDownloads ?? 0))
    .slice(0, limit);
}
