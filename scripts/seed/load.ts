import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadEnv } from "../bootstrap";

loadEnv();

import type { Driver } from "neo4j-driver";
import type { Snapshot } from "./types";

/** Rows per transaction. The c0 tier has 256 MB - a single large transaction
 *  will not fit, so every stage is chunked. */
const CHUNK = 500;

interface Stage {
  label: string;
  cypher: string;
  /** Passed straight through as a query parameter, so the element shape only
   *  has to match what the statement's UNWIND reads. */
  rows: readonly unknown[];
}

/**
 * Every stage is a single parameterised statement applied to a batch of rows
 * via UNWIND. This is the pattern that makes bulk loading fast: one round trip
 * and one query plan per 500 rows, instead of per row.
 *
 * Nodes are MERGEd on the same property their uniqueness constraint covers, so
 * each MERGE is an index lookup rather than a label scan, and re-running the
 * loader updates in place instead of duplicating.
 */
function buildStages(snapshot: Snapshot): Stage[] {
  const rollupBySlug = new Map((snapshot.rollups ?? []).map((r) => [r.slug, r]));

  return [
    {
      label: "License nodes",
      rows: snapshot.licenses,
      cypher: `
        UNWIND $rows AS row
        MERGE (l:License {spdxId: row.spdxId})
        SET l.category = row.category
      `,
    },
    {
      label: "Maintainer nodes",
      rows: snapshot.maintainers,
      cypher: `
        UNWIND $rows AS row
        MERGE (m:Maintainer {username: row.username})
        SET m.email = row.email
      `,
    },
    {
      label: "Package nodes",
      rows: snapshot.packages,
      cypher: `
        UNWIND $rows AS row
        MERGE (p:Package {name: row.name})
        SET p.ecosystem = row.ecosystem,
            p.description = row.description,
            p.weeklyDownloads = row.weeklyDownloads,
            p.repoUrl = row.repoUrl
      `,
    },
    {
      label: "Version nodes",
      rows: snapshot.versions,
      cypher: `
        UNWIND $rows AS row
        MERGE (v:Version {id: row.id})
        SET v.packageName = row.packageName,
            v.number = row.number,
            v.depth = row.depth,
            v.deprecated = row.deprecated
      `,
    },
    {
      label: "Application nodes",
      // Rollups are computed by breadth-first sweep at snapshot time and
      // stored as properties, so the dashboard never pays for a traversal.
      rows: snapshot.applications.map((app) => ({
        ...app,
        ...(rollupBySlug.get(app.slug) ?? {}),
      })),
      cypher: `
        UNWIND $rows AS row
        MERGE (a:Application {slug: row.slug})
        SET a.name = row.name,
            a.description = row.description,
            a.repoUrl = row.repoUrl,
            a.category = row.category,
            a.npmPackage = row.npmPackage,
            a.transitiveVersionCount = row.transitiveVersionCount,
            a.transitivePackageCount = row.transitivePackageCount,
            a.maxDepth = row.maxDepth,
            a.maintainerCount = row.maintainerCount,
            a.soloMaintainedCount = row.soloMaintainedCount,
            a.advisoryCount = row.advisoryCount,
            a.criticalAdvisoryCount = row.criticalAdvisoryCount,
            a.nonPermissiveCount = row.nonPermissiveCount,
            a.deprecatedCount = row.deprecatedCount
      `,
    },
    {
      label: "Advisory nodes",
      rows: snapshot.advisories,
      cypher: `
        UNWIND $rows AS row
        MERGE (adv:Advisory {ghsaId: row.ghsaId})
        SET adv.summary = row.summary,
            adv.severity = row.severity,
            adv.cvss = row.cvss,
            adv.publishedAt = row.publishedAt,
            adv.url = row.url
      `,
    },
    {
      label: "HAS_VERSION",
      rows: snapshot.edges.hasVersion,
      cypher: `
        UNWIND $rows AS row
        MATCH (p:Package {name: row.packageName})
        MATCH (v:Version {id: row.versionId})
        MERGE (p)-[:HAS_VERSION]->(v)
      `,
    },
    {
      label: "REQUIRES",
      rows: snapshot.edges.requires,
      cypher: `
        UNWIND $rows AS row
        MATCH (from:Version {id: row.fromId})
        MATCH (to:Version {id: row.toId})
        MERGE (from)-[r:REQUIRES]->(to)
        SET r.range = row.range
      `,
    },
    {
      label: "DEPENDS_ON",
      rows: snapshot.edges.dependsOn,
      cypher: `
        UNWIND $rows AS row
        MATCH (app:Application {slug: row.appSlug})
        MATCH (v:Version {id: row.toId})
        MERGE (app)-[r:DEPENDS_ON]->(v)
        SET r.range = row.range
      `,
    },
    {
      label: "MAINTAINS",
      rows: snapshot.edges.maintains,
      cypher: `
        UNWIND $rows AS row
        MATCH (m:Maintainer {username: row.username})
        MATCH (p:Package {name: row.packageName})
        MERGE (m)-[:MAINTAINS]->(p)
      `,
    },
    {
      label: "LICENSED_UNDER",
      rows: snapshot.edges.licensedUnder,
      cypher: `
        UNWIND $rows AS row
        MATCH (v:Version {id: row.versionId})
        MATCH (l:License {spdxId: row.spdxId})
        MERGE (v)-[:LICENSED_UNDER]->(l)
      `,
    },
    {
      label: "EXPOSED_TO",
      rows: snapshot.edges.exposedTo ?? [],
      cypher: `
        UNWIND $rows AS row
        MATCH (app:Application {slug: row.appSlug})
        MATCH (adv:Advisory {ghsaId: row.ghsaId})
        MERGE (app)-[e:EXPOSED_TO]->(adv)
        SET e.hops = row.hops, e.versionId = row.versionId
      `,
    },
    {
      label: "AFFECTS",
      rows: snapshot.edges.affects,
      cypher: `
        UNWIND $rows AS row
        MATCH (adv:Advisory {ghsaId: row.ghsaId})
        MATCH (v:Version {id: row.versionId})
        MERGE (adv)-[:AFFECTS]->(v)
      `,
    },
  ];
}

/**
 * Denormalised counters, computed once after loading rather than on every page
 * render. Cheap to recompute, and it keeps the dashboard queries to a single
 * index lookup instead of an aggregation over the whole graph.
 */
const DERIVED = [
  {
    label: "Maintainer.packageCount",
    cypher: `
      MATCH (m:Maintainer)-[:MAINTAINS]->(p:Package)
      WITH m, count(p) AS total
      SET m.packageCount = total
    `,
  },
  {
    label: "Application.directDepCount",
    cypher: `
      MATCH (a:Application)-[:DEPENDS_ON]->(v:Version)
      WITH a, count(v) AS total
      SET a.directDepCount = total
    `,
  },
];

async function reset(driver: Driver): Promise<void> {
  process.stdout.write("  resetting graph");
  for (;;) {
    const session = driver.session({ defaultAccessMode: "WRITE" });
    try {
      const result = await session.run(
        "MATCH (n) WITH n LIMIT $limit DETACH DELETE n RETURN count(n) AS deleted",
        { limit: 2000 },
      );
      const deleted = result.records[0]?.get("deleted") ?? 0;
      if (deleted === 0) break;
      process.stdout.write(".");
    } finally {
      await session.close();
    }
  }
  process.stdout.write(" done\n");
}

async function runStage(driver: Driver, stage: Stage): Promise<number> {
  if (stage.rows.length === 0) {
    console.log("  skip  " + stage.label + " (no rows)");
    return 0;
  }

  const started = Date.now();
  for (let i = 0; i < stage.rows.length; i += CHUNK) {
    const session = driver.session({ defaultAccessMode: "WRITE" });
    try {
      await session.executeWrite((tx) =>
        tx.run(stage.cypher, { rows: stage.rows.slice(i, i + CHUNK) }),
      );
    } finally {
      await session.close();
    }
  }
  const elapsed = Date.now() - started;
  console.log(
    "  ok    " +
      stage.label.padEnd(26) +
      String(stage.rows.length).padStart(6) +
      " rows  " +
      (elapsed / 1000).toFixed(1) +
      "s",
  );
  return elapsed;
}

async function main() {
  const shouldReset = process.argv.includes("--reset");

  const path = resolve(process.cwd(), "data/snapshot.json");
  let snapshot: Snapshot;
  try {
    snapshot = JSON.parse(await readFile(path, "utf8")) as Snapshot;
  } catch {
    console.error(
      "\n  data/snapshot.json not found.\n  Run `npm run seed:fetch` first to build it.\n",
    );
    process.exit(1);
  }

  const { getDriver } = await import("../../src/lib/db/driver");
  const driver = getDriver();

  // Fail before writing anything if the instance is unreachable, so a bad
  // connection never leaves the graph half-loaded.
  await driver.verifyConnectivity();
  console.log("\n  Connected. Snapshot generated " + snapshot.generatedAt + "\n");

  if (shouldReset) await reset(driver);

  const stages = buildStages(snapshot);
  const started = Date.now();

  for (const stage of stages) {
    await runStage(driver, stage);
  }

  console.log("");
  for (const derived of DERIVED) {
    const session = driver.session({ defaultAccessMode: "WRITE" });
    try {
      await session.run(derived.cypher);
      console.log("  ok    " + derived.label);
    } finally {
      await session.close();
    }
  }

  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const counts = await session.run(
      `
      MATCH (n) WITH count(n) AS nodes
      MATCH ()-[r]->() RETURN nodes, count(r) AS relationships
      `,
    );
    const record = counts.records[0];
    console.log(
      [
        "",
        "  Graph loaded.",
        "",
        "  nodes          " + record.get("nodes"),
        "  relationships  " + record.get("relationships"),
        "  elapsed        " + ((Date.now() - started) / 1000).toFixed(1) + "s",
        "",
      ].join("\n"),
    );
  } finally {
    await session.close();
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("\n  Load failed: " + message + "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    const { closeDriver } = await import("../../src/lib/db/driver");
    await closeDriver();
  });
