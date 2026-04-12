/**
 * POST /api/admin/reset-points
 *
 * Superadmin only. Zeroes all scoring stats across the target scope.
 * Body: { roomCode?: string }
 *   roomCode provided → reset that room only
 *   roomCode omitted  → reset ALL rooms
 *
 * Does NOT delete match_results. Follow up with /api/admin/recalculate-points.
 */
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireSuperAdmin } from "@/lib/server/auth";
import { resetRoomStats } from "@/lib/server/score-push";
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

    let totalPlayersReset = 0;
    for (const room of rooms) {
      const { playersReset } = await resetRoomStats(String(room.id), String(room.code));
      totalPlayersReset += playersReset;
    }

    return NextResponse.json({
      ok: true,
      roomsReset: rooms.length,
      playersReset: totalPlayersReset,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
