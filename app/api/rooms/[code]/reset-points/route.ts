/**
 * POST /api/rooms/[code]/reset-points
 *
 * Room admin only. Zeroes all scoring stats for every player in the room
 * while preserving meta fields. Does NOT delete match_results.
 * After this call the client should follow up with fetch-points to rebuild from stored data.
 */
import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { requireRoomAdmin } from "@/lib/server/room";
import { resetRoomStats } from "@/lib/server/score-push";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);
    const result = await resetRoomStats(room.id, room.code);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleRouteError(error);
  }
}
