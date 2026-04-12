/**
 * POST /api/rooms/[code]/webscrape-accept
 *
 * Super-room admin only. Accepts a single match-source pair in this room's
 * match_results, unaccepts all other sources for the same matchId, then
 * triggers a full recalculation of player stats from all accepted matches.
 *
 * Body: { season: string, accepts: [{ matchId: string, source: string }] }
 */

import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { requireRoomAdmin } from "@/lib/server/room";
import { recalculateRoomStats } from "@/lib/server/score-push";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);

    if (!room.isSuperRoom) {
      throw new AppError("Live score accept is only available in the super room.", 403, "SUPER_ROOM_ONLY");
    }

    const admin = getSupabaseAdminClient();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const accepts = Array.isArray(body.accepts) ? body.accepts as Array<{ matchId: string; source: string }> : [];
    if (accepts.length === 0) throw new AppError("accepts array is required.", 400, "NO_DATA");

    for (const { matchId, source } of accepts) {
      if (!matchId || !source) continue;

      // Accept the chosen source
      const { error: acceptError } = await admin
        .from("match_results")
        .update({ accepted: true, accepted_at: new Date().toISOString() })
        .eq("room_id", room.id)
        .eq("match_id", matchId)
        .eq("source", source);

      if (acceptError) throw new AppError(acceptError.message, 500, "DB_QUERY_FAILED");

      // Unaccept all other sources for the same matchId in this room
      await admin
        .from("match_results")
        .update({ accepted: false, accepted_at: null })
        .eq("room_id", room.id)
        .eq("match_id", matchId)
        .neq("source", source);
    }

    const { playersUpdated } = await recalculateRoomStats(room.id, room.code);

    return NextResponse.json({ ok: true, playersUpdated });
  } catch (error) {
    return handleRouteError(error);
  }
}
