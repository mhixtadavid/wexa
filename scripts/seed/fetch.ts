import { mkdir, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";

import pLimit from "p-limit";
import semver from "semver";

import { fetchAdvisories } from "./advisories";
import { categorise, normaliseLicense, normaliseRepoUrl } from "./license";
import { getVersionManifest, getWeeklyDownloads } from "./registry";
import { resolveDependencyGraph } from "./resolve";
import { computeRollups } from "./rollups";
import type {
  LicenseNode,
  MaintainerNode,
  PackageNode,
  Snapshot,
  VersionNode,
} from "./types";

const CONCURRENCY = 8;
const OUTPUT = resolvePath(process.cwd(), "data/snapshot.json");

const log = (message: string) => console.log(message);
const stage = (name: string) => console.log("\n" + name);

/**
 * Builds the committed snapshot the loader reads.
 *
 * This is the only stage that touches the network. Separating it from the load
 * means the graph can be rebuilt against a fresh CognoDB instance offline, and
 * anyone cloning the repository gets identical data without an npm round-trip.
 */
async function main() {
  const started = Date.now();

  stage("1/4  Resolving dependency graph");
  const graph = await resolveDependencyGraph(log);

  stage("2/4  Fetching per-version metadata");
  const limit = pLimit(CONCURRENCY);
  const versionIds = [...graph.versions.keys()];

  const packages = new Map<string, PackageNode>();
  const maintainers = new Map<string, MaintainerNode>();
  const licenses = new Map<string, LicenseNode>();
  const versions: VersionNode[] = [];
  const hasVersion: Snapshot["edges"]["hasVersion"] = [];
  const licensedUnder: Snapshot["edges"]["licensedUnder"] = [];
  const maintains = new Set<string>();

  /** Highest resolved version per package - the one whose metadata represents it. */
  const representative = new Map<string, string>();
  for (const version of graph.versions.values()) {
    const current = representative.get(version.name);
    if (!current || semver.gt(version.version, current)) {
      representative.set(version.name, version.version);
    }
  }

  let done = 0;
  await Promise.all(
    versionIds.map((id) =>
      limit(async () => {
        const entry = graph.versions.get(id)!;
        const manifest = await getVersionManifest(entry.name, entry.version);

        versions.push({
          id,
          packageName: entry.name,
          number: entry.version,
          depth: entry.depth,
          deprecated: Boolean(manifest?.deprecated),
        });
        hasVersion.push({ packageName: entry.name, versionId: id });

        const spdxId = normaliseLicense(manifest?.license);
        if (spdxId) {
          if (!licenses.has(spdxId)) {
            licenses.set(spdxId, { spdxId, category: categorise(spdxId) });
          }
          licensedUnder.push({ versionId: id, spdxId });
        }

        // Package-level metadata comes from the highest version in the graph:
        // maintainers are "who can publish this package today", not per release.
        if (representative.get(entry.name) === entry.version) {
          packages.set(entry.name, {
            name: entry.name,
            ecosystem: "npm",
            description: manifest?.description?.slice(0, 300) ?? null,
            weeklyDownloads: null,
            repoUrl: normaliseRepoUrl(manifest?.repository),
          });

          for (const person of manifest?.maintainers ?? []) {
            if (!person?.name) continue;
            if (!maintainers.has(person.name)) {
              maintainers.set(person.name, {
                username: person.name,
                email: person.email ?? null,
              });
            }
            maintains.add(person.name + " " + entry.name);
          }
        }

        if (++done % 500 === 0) {
          log("  " + done + "/" + versionIds.length + " versions enriched");
        }
      }),
    ),
  );
  log("  " + done + "/" + versionIds.length + " versions enriched");

  stage("3/4  Fetching weekly download counts");
  const downloads = await getWeeklyDownloads([...packages.keys()]);
  for (const [name, node] of packages) {
    node.weeklyDownloads = downloads.get(name) ?? null;
  }
  log("  download counts for " + downloads.size + "/" + packages.size + " packages");

  stage("4/4  Fetching security advisories");
  const { advisories, affects } = await fetchAdvisories(versionIds, log);
  const affectedVersions = new Set(affects.map((a) => a.versionId)).size;
  log("  " + advisories.length + " advisories affecting " + affectedVersions + " versions");

  const snapshot: Snapshot = {
    generatedAt: new Date().toISOString(),
    applications: graph.applications.map((app) => ({
      slug: app.slug,
      name: app.name,
      description: app.description,
      repoUrl: app.repoUrl,
      category: app.category,
      npmPackage: app.npmPackage,
    })),
    rollups: [],
    packages: [...packages.values()],
    versions,
    maintainers: [...maintainers.values()],
    licenses: [...licenses.values()],
    advisories,
    edges: {
      dependsOn: graph.dependsOn,
      hasVersion,
      requires: graph.requires,
      maintains: [...maintains].map((key) => {
        const [username, packageName] = key.split(" ");
        return { username, packageName };
      }),
      licensedUnder,
      affects,
      exposedTo: [],
    },
  };

  // Exact unbounded aggregates, cheap here and expensive in Cypher.
  const { rollups, exposedTo } = computeRollups(snapshot);
  snapshot.rollups = rollups;
  snapshot.edges.exposedTo = exposedTo;

  await mkdir(resolvePath(process.cwd(), "data"), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(snapshot));

  const nodes =
    snapshot.applications.length +
    snapshot.packages.length +
    snapshot.versions.length +
    snapshot.maintainers.length +
    snapshot.licenses.length +
    snapshot.advisories.length;
  const edges = Object.values(snapshot.edges).reduce((sum, list) => sum + list.length, 0);

  console.log(
    [
      "",
      "  Snapshot written to data/snapshot.json",
      "",
      "  applications   " + snapshot.applications.length,
      "  packages       " + snapshot.packages.length,
      "  versions       " + snapshot.versions.length,
      "  maintainers    " + snapshot.maintainers.length,
      "  licenses       " + snapshot.licenses.length,
      "  advisories     " + snapshot.advisories.length,
      "  ------------------------------",
      "  nodes          " + nodes,
      "  relationships  " + edges,
      "",
      "  elapsed        " + ((Date.now() - started) / 1000).toFixed(1) + "s",
      "",
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("\n  Fetch failed: " + message + "\n");
  process.exitCode = 1;
});
