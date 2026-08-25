import { loadEnv } from "./bootstrap";

loadEnv();

// Imported inside main() rather than at module scope: the driver reads its
// configuration on first import, so loadEnv() must have run before that.
async function main() {
  const { getDriver } = await import("../src/lib/db/driver");
  const driver = getDriver();

  const info = await driver.getServerInfo();
  console.log(`\n  Connected to ${info.address}`);
  console.log(`  Protocol:   Bolt ${info.protocolVersion}`);

  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    // A parameterised round-trip, to prove the query path works end to end.
    const result = await session.run(
      "RETURN $greeting AS greeting, timestamp() AS serverTime",
      { greeting: "cognodb reachable" },
    );
    const record = result.records[0];
    console.log(`  Query:      ${record.get("greeting")}`);
    console.log(`  Server time: ${new Date(record.get("serverTime")).toISOString()}\n`);
  } finally {
    await session.close();
  }
}

main()
  .catch((error: unknown) => {
    console.error(`\n  Could not reach CognoDB: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { closeDriver } = await import("../src/lib/db/driver");
    await closeDriver();
  });
