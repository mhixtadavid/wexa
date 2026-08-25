import { read, readOne } from "@/lib/db/session";

import type { BlastRadius, BlastRadiusEntry, DependencyPath, PackageSummary } from "./types";

/**
 * Q1 — Blast radius.
 *
 * Given a package, which applications does it reach, and by the shortest route?
 * `shortestPath` collapses what would otherwise be hundreds of redundant paths
 * into one answer per application: n8n reaches `debug` by 476 distinct routes,
 * but only the shortest is worth showing.
 */
export async function getBlastRadius(packageName: string): Promise<BlastRadius | null> {
  const summary = await readOne(
    `
    MATCH (p:Package {name: $packageName})
    OPTIONAL MATCH (m:Maintainer)-[:MAINTAINS]->(p)
    OPTIONAL MATCH (p)-[:HAS_VERSION]->(v:Version)
    WITH p, collect(DISTINCT m.username) AS maintainers, collect(DISTINCT v.id) AS versions
    RETURN {
      packageName: p.name,
      description: p.description,
      weeklyDownloads: p.weeklyDownloads,
      repoUrl: p.repoUrl,
      maintainers: maintainers,
      versions: versions
    } AS row
    `,
    { packageName },
    (record) => record.get("row") as Omit<BlastRadius, "affected">,
  );

  if (!summary?.packageName) return null;

  const affected = await read(
    `
    MATCH (p:Package {name: $packageName})-[:HAS_VERSION]->(target:Version)
    MATCH path = shortestPath((app:Application)-[:DEPENDS_ON|REQUIRES*1..6]->(target))
    WITH app, path
    ORDER BY length(path) ASC
    WITH app, collect(path)[0] AS shortest
    WITH app, shortest, length(shortest) AS hops
    ORDER BY hops ASC, app.name ASC
    RETURN {
      slug: app.slug,
      name: app.name,
      hops: hops,
      chain: [n IN nodes(shortest) | coalesce(n.id, n.slug)]
    } AS row
    `,
    { packageName },
    (record) => record.get("row") as BlastRadiusEntry,
  );

  return { ...summary, affected };
}

/**
 * Q5 — "Why is this here?"
 *
 * Returns every distinct route from an application down to a package, not just
 * one. This is `npm why`, and it is the query that most clearly earns the graph
 * database: the answer is a set of paths of differing lengths, which is not a
 * shape a relational result set expresses naturally. Recursive SQL can tell you
 * the package is reachable; reconstructing each distinct chain from it means
 * carrying an accumulating path array through the recursion and parsing it back
 * out afterwards.
 */
export function getDependencyPaths(
  slug: string,
  packageName: string,
  limit = 12,
): Promise<DependencyPath[]> {
  return read(
    `
    MATCH (app:Application {slug: $slug})
    MATCH (p:Package {name: $packageName})-[:HAS_VERSION]->(target:Version)
    MATCH path = (app)-[:DEPENDS_ON|REQUIRES*1..5]->(target)
    WITH DISTINCT [n IN nodes(path) | coalesce(n.id, n.slug)] AS chain, length(path) AS hops
    ORDER BY hops ASC
    LIMIT $limit
    RETURN { hops: hops, chain: chain } AS row
    `,
    { slug, packageName, limit },
    (record) => record.get("row") as DependencyPath,
  );
}

export function getPackage(packageName: string): Promise<PackageSummary | null> {
  return readOne(
    `
    MATCH (p:Package {name: $packageName})
    OPTIONAL MATCH (m:Maintainer)-[:MAINTAINS]->(p)
    WITH p, count(DISTINCT m) AS maintainerCount
    OPTIONAL MATCH (p)-[:HAS_VERSION]->(v:Version)
    WITH p, maintainerCount, count(DISTINCT v) AS versionCount
    OPTIONAL MATCH (:Version)-[r:REQUIRES]->(:Version)<-[:HAS_VERSION]-(p)
    WITH p, maintainerCount, versionCount, count(r) AS dependentCount
    RETURN {
      name: p.name,
      description: p.description,
      weeklyDownloads: p.weeklyDownloads,
      repoUrl: p.repoUrl,
      maintainerCount: maintainerCount,
      versionCount: versionCount,
      dependentCount: dependentCount
    } AS row
    `,
    { packageName },
    (record) => record.get("row") as PackageSummary,
  );
}

/**
 * The neighbourhood rendered by the graph visualiser. Bounded to two hops and
 * a hard row cap, because an unbounded neighbourhood of a package like `debug`
 * would return most of the graph and lock the browser.
 */
export function getPackageNeighbourhood(
  packageName: string,
  limit = 60,
): Promise<Array<{ from: string; to: string; kind: string }>> {
  return read(
    `
    MATCH (p:Package {name: $packageName})-[:HAS_VERSION]->(v:Version)
    OPTIONAL MATCH (v)-[:REQUIRES]->(child:Version)
    WITH v, collect(DISTINCT { from: v.id, to: child.id, kind: 'REQUIRES' })[0..$limit] AS down
    OPTIONAL MATCH (parent:Version)-[:REQUIRES]->(v)
    WITH down, collect(DISTINCT { from: parent.id, to: v.id, kind: 'REQUIRES' })[0..$limit] AS up
    UNWIND (down + up) AS edge
    WITH edge WHERE edge.from IS NOT NULL AND edge.to IS NOT NULL
    RETURN DISTINCT edge AS row
    LIMIT $limit
    `,
    { packageName, limit },
    (record) => record.get("row") as { from: string; to: string; kind: string },
  );
}
