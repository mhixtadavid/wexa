import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { respondWithError } from "@/lib/api/respond";
import { getDependencyPaths } from "@/lib/queries/packages";

export const runtime = "nodejs";

const querySchema = z.object({
  app: z.string().trim().min(1).max(64),
  package: z.string().trim().min(1).max(214),
});

/**
 * "Why is this here?" (Q5), fetched on demand rather than with the page.
 * Computing every path for every row up front would be wasted work — a user
 * opens one at a time.
 */
export async function GET(request: NextRequest) {
  try {
    const params = querySchema.parse({
      app: request.nextUrl.searchParams.get("app") ?? "",
      package: request.nextUrl.searchParams.get("package") ?? "",
    });
    const paths = await getDependencyPaths(params.app, params.package);
    return NextResponse.json({ paths });
  } catch (error) {
    return respondWithError(error);
  }
}
