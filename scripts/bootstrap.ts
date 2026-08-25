import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";

/**
 * Scripts run outside Next.js, so they load the env file themselves.
 *
 * Both filenames are checked in the same precedence order Next.js uses, so a
 * developer who keeps a personal `.env.local` alongside a shared `.env` gets
 * the behaviour they expect from the scripts too. Real deployments inject the
 * variables directly and have no file at all.
 */
const CANDIDATES = [".env.local", ".env"];

export function loadEnv(): void {
  let loaded = false;

  for (const filename of CANDIDATES) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    // `override: false` keeps the earlier file winning, matching Next.js.
    config({ path, quiet: true, override: false });
    loaded = true;
  }

  if (!loaded && !process.env.COGNODB_URI) {
    console.error(
      "\n  No .env file found and COGNODB_URI is not set.\n" +
        "  Copy .env.example to .env and add your CognoDB instance details.\n",
    );
    process.exit(1);
  }
}
