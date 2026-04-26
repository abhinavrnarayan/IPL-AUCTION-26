/**
 * GET /api/admin/bid-timing
 *
 * Returns a one-shot summary of recent bid latency from the in-memory ring
 * buffer. Use this to decide whether bid placement is fast enough to leave on
 * the DB-write path (totals.p95 < ~200ms) or whether a Redis-write-behind path
 * is justified (p95 ≥ ~400ms).
 *
 * Buffer is per-process; restart wipes it. Redeploys count as a wipe.
 */

import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api";
import { requireSuperAdmin } from "@/lib/server/auth";
import { getBidTimingSummary } from "@/lib/server/bid-timing-stats";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSuperAdmin();
    return NextResponse.json(getBidTimingSummary());
  } catch (error) {
    return handleRouteError(error);
  }
}
