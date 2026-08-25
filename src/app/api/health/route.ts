import { NextResponse } from "next/server";

import { verifyConnection } from "@/lib/db/driver";
import { DatabaseUnavailableError } from "@/lib/db/errors";

// Bolt is a raw TCP protocol and cannot run on the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polled by the connection banner in the UI, and used as the smoke test after
 * deploying. Deliberately does no query work beyond the driver's own
 * connectivity check, so it stays fast and cannot itself be the slow thing.
 */
export async function GET() {
  try {
    await verifyConnection();
    return NextResponse.json({ status: "ok" as const });
  } catch (error) {
    const reachable = !(error instanceof DatabaseUnavailableError);
    return NextResponse.json(
      {
        status: "unavailable" as const,
        message: reachable
          ? "The database responded with an error."
          : "The graph database is unreachable. It may be paused or starting up.",
      },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }
}
