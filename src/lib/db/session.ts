import { type Record as Neo4jRecord } from "neo4j-driver";

import { getDriver } from "./driver";
import { toAppError } from "./errors";

export type QueryParams = Record<string, unknown>;

/**
 * Every query in this application goes through `read` or `write`.
 *
 * Cypher is always a static string and every value travels in `params`, so no
 * user input is ever concatenated into a query. Sessions are opened per call
 * and closed in `finally`, and `executeRead`/`executeWrite` give us the
 * driver's built-in retry on transient failures for free.
 */
export async function read<T>(
  cypher: string,
  params: QueryParams,
  map: (record: Neo4jRecord) => T,
): Promise<T[]> {
  const session = getDriver().session({ defaultAccessMode: "READ" });
  try {
    const result = await session.executeRead((tx) => tx.run(cypher, params));
    return result.records.map(map);
  } catch (error) {
    throw toAppError(error);
  } finally {
    await session.close();
  }
}

/** Convenience wrapper for queries that return at most one row. */
export async function readOne<T>(
  cypher: string,
  params: QueryParams,
  map: (record: Neo4jRecord) => T,
): Promise<T | null> {
  const rows = await read(cypher, params, map);
  return rows[0] ?? null;
}

export async function write<T>(
  cypher: string,
  params: QueryParams,
  map: (record: Neo4jRecord) => T,
): Promise<T[]> {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    const result = await session.executeWrite((tx) => tx.run(cypher, params));
    return result.records.map(map);
  } catch (error) {
    throw toAppError(error);
  } finally {
    await session.close();
  }
}
