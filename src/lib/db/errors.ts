/**
 * The application distinguishes "the database could not be reached" from
 * "the query was wrong", because only the first is worth showing a retry
 * button for. Everything the UI renders flows through these two types.
 */
export class DatabaseUnavailableError extends Error {
  readonly kind = "unavailable" as const;

  constructor(message = "Unable to reach the graph database.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DatabaseUnavailableError";
  }
}

export class QueryFailedError extends Error {
  readonly kind = "query-failed" as const;

  constructor(message = "The graph query could not be completed.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "QueryFailedError";
  }
}

/** Neo4j driver error codes that mean "the instance is not answering right now". */
const UNAVAILABLE_CODES = new Set([
  "ServiceUnavailable",
  "SessionExpired",
  "Neo.TransientError.General.DatabaseUnavailable",
  "Neo.ClientError.Security.AuthenticationRateLimit",
  "Neo.ClientError.Security.Unauthorized",
]);

function codeOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error as { code?: unknown };
    if (typeof code === "string") return code;
  }
  return undefined;
}

/**
 * Normalises anything thrown by the driver into one of our two error types.
 * Connection refusals, DNS failures and TLS errors all surface as network
 * errors rather than Neo4j codes, so those are matched separately.
 */
export function toAppError(error: unknown): DatabaseUnavailableError | QueryFailedError {
  if (error instanceof DatabaseUnavailableError || error instanceof QueryFailedError) {
    return error;
  }

  const code = codeOf(error);
  const name = error instanceof Error ? error.name : "";

  if (
    (code && UNAVAILABLE_CODES.has(code)) ||
    (code && /^(ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|CERT_)/.test(code)) ||
    name === "Neo4jError" && /routing|connection|unavailable/i.test(String((error as Error).message))
  ) {
    return new DatabaseUnavailableError(undefined, { cause: error });
  }

  return new QueryFailedError(undefined, { cause: error });
}
