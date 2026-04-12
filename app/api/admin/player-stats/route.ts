/**
 * GET  /api/admin/player-stats?roomCode=X  — list all players in a room with their stats + computed points
 * PATCH /api/admin/player-stats            — overwrite a player's stats (score correction)
 *   Body: { roomCode: string, playerId: string, stats: Record<string, unknown> }
 *   Replaces players.stats JSONB entirely. Call GET first to build the full stats object.
 */
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { scorePlayer } from "@/lib/domain/scoring";
import type { Player } from "@/lib/domain/types";
import { handleRouteError } from "@/lib/server/api";
import { requireSuperAdmin } from "@/lib/server/auth";
import { invalidateRoomCache } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireSuperAdmin();
    const admin = getSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const roomCode = searchParams.get("roomCode")?.trim().toUpperCase();
    if (!roomCode) throw new AppError("roomCode is required.", 400, "NO_DATA");

    const { data: room, error: roomError } = await admin
      .from("rooms")
      .select("id")
      .eq("code", roomCode)
      .maybeSingle();
    if (roomError) throw new AppError(roomError.message, 500, "DB_QUERY_FAILED");
    if (!room) throw new AppError(`Room not found: ${roomCode}`, 404, "NOT_FOUND");

    const roomId = room.id as string;

    const [
      { data: players, error: playerError },
      { data: teams, error: teamError },
    ] = await Promise.all([
      admin
        .from("players")
        .select("id, name, role, status, stats, base_price, current_team_id, sold_price")
        .eq("room_id", roomId)
        .order("name"),
      admin.from("teams").select("id, name").eq("room_id", roomId),
    ]);
    if (playerError) throw new AppError(playerError.message, 500, "DB_QUERY_FAILED");
    if (teamError) throw new AppError(teamError.message, 500, "DB_QUERY_FAILED");

    const teamNameById = new Map((teams ?? []).map((t) => [String(t.id), String(t.name)]));

    const enriched = (players ?? []).map((row) => {
      const stats = (row.stats ?? {}) as Record<string, unknown>;
      const playerLike: Player = {
        id: String(row.id),
        roomId,
        name: String(row.name),
        role: String(row.role),
        nationality: null,
        basePrice: Number(row.base_price),
        status: row.status as Player["status"],
        stats,
        orderIndex: 0,
        currentTeamId: (row.current_team_id as string | null | undefined) ?? null,
        soldPrice: (row.sold_price as number | null | undefined) ?? null,
      };
      const totalPoints = scorePlayer(playerLike);
      const currentTeamId = (row.current_team_id as string | null | undefined) ?? null;

      return {
        id: String(row.id),
        name: String(row.name),
        role: String(row.role),
        status: String(row.status),
        stats,
        iplTeam: typeof stats.ipl_team === "string" ? stats.ipl_team : null,
        totalPoints,
        basePrice: Number(row.base_price),
        soldPrice: (row.sold_price as number | null | undefined) ?? null,
        currentTeamId,
        currentTeamName: currentTeamId ? (teamNameById.get(currentTeamId) ?? null) : null,
      };
    });

    return NextResponse.json({ ok: true, players: enriched });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireSuperAdmin();
    const admin = getSupabaseAdminClient();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const roomCode = typeof body.roomCode === "string" ? body.roomCode.trim().toUpperCase() : null;
    const playerId = typeof body.playerId === "string" ? body.playerId.trim() : null;
    const stats =
      body.stats &&
      typeof body.stats === "object" &&
      !Array.isArray(body.stats)
        ? (body.stats as Record<string, unknown>)
        : null;

    if (!roomCode) throw new AppError("roomCode is required.", 400, "NO_DATA");
    if (!playerId) throw new AppError("playerId is required.", 400, "NO_DATA");
    if (!stats) throw new AppError("stats object is required.", 400, "NO_DATA");

    const { data: room, error: roomError } = await admin
      .from("rooms")
      .select("id, code")
      .eq("code", roomCode)
      .maybeSingle();
    if (roomError) throw new AppError(roomError.message, 500, "DB_QUERY_FAILED");
    if (!room) throw new AppError(`Room not found: ${roomCode}`, 404, "NOT_FOUND");

    const { error: updateError } = await admin
      .from("players")
      .update({ stats })
      .eq("id", playerId)
      .eq("room_id", room.id);
    if (updateError) throw new AppError(updateError.message, 500, "DB_QUERY_FAILED");

    await invalidateRoomCache(String(room.id), String(room.code));
    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
