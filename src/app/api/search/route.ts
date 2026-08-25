import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { respondWithError } from "@/lib/api/respond";
import { search } from "@/lib/queries/overview";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().min(2, "Search needs at least two characters").max(80),
});

/** Backs the header's search-as-you-type, which needs a client-side fetch. */
export async function GET(request: NextRequest) {
  try {
    const { q } = querySchema.parse({
      q: request.nextUrl.searchParams.get("q") ?? "",
    });
    return NextResponse.json({ results: await search(q) });
  } catch (error) {
    return respondWithError(error);
  }
}
