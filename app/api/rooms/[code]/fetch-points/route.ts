/**
 * POST /api/rooms/[code]/fetch-points
 *
 * Room admin only. Re-aggregates all accepted match_results for the room's
 * latest season and rebuilds players.stats. Intended to be called after reset-points.
 */
import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { requireRoomAdmin } from "@/lib/server/room";
import { recalculateRoomStats } from "@/lib/server/score-push";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);
    const result = await recalculateRoomStats(room.id, room.code);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(error);
  }
}
