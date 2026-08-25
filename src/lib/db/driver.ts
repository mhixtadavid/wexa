import neo4j, { type Driver } from "neo4j-driver";

import { getEnv } from "@/lib/env";
import { DatabaseUnavailableError, toAppError } from "./errors";

/**
 * One driver per process, not one per request.
 *
 * The driver owns a TCP connection pool, so creating it per request would leak
 * sockets. On Vercel each warm lambda holds its own pool, and the free (c0)
 * CognoDB tier allows 200 connections in total — hence the deliberately small
 * pool size below, which leaves room for many concurrent instances.
 *
 * The globalThis cache keeps the pool stable across Next.js hot reloads in dev,
 * which would otherwise open a fresh pool on every file save.
 */
const globalForDriver = globalThis as unknown as { __cognoDriver?: Driver };

export function getDriver(): Driver {
  if (globalForDriver.__cognoDriver) return globalForDriver.__cognoDriver;

  const env = getEnv();

  // Encryption is negotiated by the bolt+s:// scheme, so no `encrypted` option
  // is passed here — supplying both makes the driver throw at construction.
  const driver = neo4j.driver(
    env.COGNODB_URI,
    neo4j.auth.basic(env.COGNODB_USER, env.COGNODB_PASSWORD),
    {
      maxConnectionPoolSize: 10,
      connectionAcquisitionTimeout: 10_000,
      connectionTimeout: 10_000,
      maxTransactionRetryTime: 8_000,
      // Counts come back as JS numbers instead of Integer objects, so results
      // can be serialised straight to the client without a conversion pass.
      disableLosslessIntegers: true,
    },
  );

  globalForDriver.__cognoDriver = driver;
  return driver;
}

/** Used by the health endpoint and by the seed script's preflight check. */
export async function verifyConnection(): Promise<void> {
  try {
    await getDriver().verifyConnectivity();
  } catch (error) {
    throw toAppError(error) instanceof DatabaseUnavailableError
      ? new DatabaseUnavailableError(undefined, { cause: error })
      : toAppError(error);
  }
}

export async function closeDriver(): Promise<void> {
  await globalForDriver.__cognoDriver?.close();
  globalForDriver.__cognoDriver = undefined;
}
