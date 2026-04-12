/**
 * POST /api/admin/recalculate-points
 *
 * Superadmin only. Re-aggregates all accepted match_results and rebuilds
 * players.stats for the target scope.
 * Body: { roomCode?: string }
 *   roomCode provided → recalculate that room only
 *   roomCode omitted  → recalculate ALL rooms
 */
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireSuperAdmin } from "@/lib/server/auth";
import { recalculateRoomStats } from "@/lib/server/score-push";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireSuperAdmin();
    const admin = getSupabaseAdminClient();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const roomCode = typeof body.roomCode === "string" ? body.roomCode.trim().toUpperCase() : null;

    let rooms: Array<{ id: unknown; code: unknown }>;

    if (roomCode) {
      const { data: room, error } = await admin
        .from("rooms")
        .select("id, code")
        .eq("code", roomCode)
        .maybeSingle();
      if (error) throw new AppError(error.message, 500, "DB_QUERY_FAILED");
      if (!room) throw new AppError(`Room not found: ${roomCode}`, 404, "NOT_FOUND");
      rooms = [room];
    } else {
      const { data, error } = await admin.from("rooms").select("id, code").eq("is_super_room", false);
      if (error) throw new AppError(error.message, 500, "DB_QUERY_FAILED");
      rooms = data ?? [];
    }

    let totalPlayersUpdated = 0;
    for (const room of rooms) {
      const { playersUpdated } = await recalculateRoomStats(String(room.id), String(room.code));
      totalPlayersUpdated += playersUpdated;
    }

    return NextResponse.json({
      ok: true,
      roomsRecalculated: rooms.length,
      playersUpdated: totalPlayersUpdated,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
