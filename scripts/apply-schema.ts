import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadEnv } from "./bootstrap";

loadEnv();

/**
 * Splits the schema file into individual statements. Constraint and index
 * creation cannot be batched in one transaction, so each runs on its own.
 */
function parseStatements(source: string): string[] {
  return source
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("//"))
        .join("\n")
        .trim(),
    )
    .filter((block) => block.length > 0);
}

async function main() {
  const path = resolve(process.cwd(), "scripts/schema.cypher");
  const statements = parseStatements(await readFile(path, "utf8"));

  console.log(`\n  Applying ${statements.length} schema statements...\n`);

  const { getDriver } = await import("../src/lib/db/driver");
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });

  try {
    for (const statement of statements) {
      const label = statement.split("\n")[0].slice(0, 64);
      try {
        await session.run(statement);
        console.log(`  ok    ${label}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  FAIL  ${label}\n        ${message}`);
        throw error;
      }
    }
    console.log("\n  Schema applied.\n");
  } finally {
    await session.close();
  }
}

main()
  .catch((error) => {
    console.error(`\n  Schema failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { closeDriver } = await import("../src/lib/db/driver");
    await closeDriver();
  });
