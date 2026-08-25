import { loadEnv } from "./bootstrap";

loadEnv();

/**
 * Runs every query in the layer against the live instance and records its
 * latency. Both a correctness check and the source of the timing table in the
 * README — the numbers there should never be guesses.
 */
async function main() {
  const q = await import("../src/lib/queries/applications");
  const p = await import("../src/lib/queries/packages");
  const o = await import("../src/lib/queries/overview");

  const cases: Array<{ label: string; run: () => Promise<unknown> }> = [
    { label: "listApplications", run: () => q.listApplications() },
    { label: "getApplication(n8n)", run: () => q.getApplication("n8n") },
    { label: "Q2 getMaintainerExposure(n8n)", run: () => q.getMaintainerExposure("n8n") },
    { label: "Q3 getSoloMaintainedPackages(ghost)", run: () => q.getSoloMaintainedPackages("ghost") },
    { label: "Q4 getReachableAdvisories(n8n)", run: () => q.getReachableAdvisories("n8n") },
    { label: "Q6 getLicenseExposure(n8n)", run: () => q.getLicenseExposure("n8n") },
    { label: "Q1 getBlastRadius(debug)", run: () => p.getBlastRadius("debug") },
    { label: "Q5 getDependencyPaths(verdaccio, ms)", run: () => p.getDependencyPaths("verdaccio", "ms") },
    { label: "getPackage(lodash)", run: () => p.getPackage("lodash") },
    { label: "getPackageNeighbourhood(debug)", run: () => p.getPackageNeighbourhood("debug") },
    { label: "getGraphStats", run: () => o.getGraphStats() },
    { label: "search('babel')", run: () => o.search("babel") },
    { label: "getMaintainerDetail(sindresorhus)", run: () => o.getMaintainerDetail("sindresorhus") },
    { label: "Q7 getSharedExposure(n8n, ghost)", run: () => o.getSharedExposure("n8n", "ghost") },
  ];

  let failures = 0;

  for (const testCase of cases) {
    const started = Date.now();
    try {
      const result = await testCase.run();
      const elapsed = Date.now() - started;
      const size = Array.isArray(result) ? result.length + " rows" : result ? "object" : "null";
      console.log(
        "  OK   " +
          testCase.label.padEnd(40) +
          String(elapsed + "ms").padStart(9) +
          "   " +
          size,
      );
      const sample = Array.isArray(result) ? result[0] : result;
      if (sample) console.log("       " + JSON.stringify(sample).slice(0, 165));
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log("  FAIL " + testCase.label + "\n       " + message.split("\n")[0].slice(0, 190));
    }
  }

  console.log("\n  " + (cases.length - failures) + "/" + cases.length + " passing\n");
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    const { closeDriver } = await import("../src/lib/db/driver");
    await closeDriver();
  });
