import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { DatabaseUnavailableError, QueryFailedError } from "@/lib/db/errors";

export interface ApiError {
  error: string;
  kind: "unavailable" | "query-failed" | "invalid-request" | "not-found";
  retryable: boolean;
}

/**
 * Single place where an internal error becomes an HTTP response.
 *
 * The distinction that matters to the UI is `retryable`: an unreachable
 * database is worth a retry button and a banner, while a malformed request or
 * a genuine query bug is not. Keeping that decision here means no route
 * handler has to think about it, and the client can branch on one field.
 */
export function respondWithError(error: unknown): NextResponse<ApiError> {
  if (error instanceof DatabaseUnavailableError) {
    // 503 rather than 500: the request was fine, the dependency was not.
    return NextResponse.json(
      {
        error: "The graph database is unreachable. It may be starting up or paused.",
        kind: "unavailable" as const,
        retryable: true,
      },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: error.issues.map((issue) => issue.message).join("; "),
        kind: "invalid-request" as const,
        retryable: false,
      },
      { status: 400 },
    );
  }

  if (error instanceof QueryFailedError) {
    console.error("Query failed:", error.cause ?? error);
    return NextResponse.json(
      {
        error: "That query could not be completed.",
        kind: "query-failed" as const,
        retryable: false,
      },
      { status: 500 },
    );
  }

  console.error("Unhandled error:", error);
  return NextResponse.json(
    {
      error: "Something went wrong.",
      kind: "query-failed" as const,
      retryable: false,
    },
    { status: 500 },
  );
}

export function notFound(message: string): NextResponse<ApiError> {
  return NextResponse.json(
    { error: message, kind: "not-found" as const, retryable: false },
    { status: 404 },
  );
}
