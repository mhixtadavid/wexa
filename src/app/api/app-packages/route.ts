import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { respondWithError } from "@/lib/api/respond";
import { getApplicationPackages } from "@/lib/queries/applications";

export const runtime = "nodejs";

const querySchema = z.object({
  app: z.string().trim().min(1).max(64),
  q: z.string().trim().max(214).default(""),
});

/** Backs the dependency browser's filter, which searches the whole tree
 *  rather than only the rows already on the page. */
export async function GET(request: NextRequest) {
  try {
    const params = querySchema.parse({
      app: request.nextUrl.searchParams.get("app") ?? "",
      q: request.nextUrl.searchParams.get("q") ?? "",
    });
    const packages = await getApplicationPackages(params.app, params.q);
    return NextResponse.json({ packages });
  } catch (error) {
    return respondWithError(error);
  }
}
