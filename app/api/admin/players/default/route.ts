/**
 * POST /api/admin/players/default
 *
 * Load the built-in IPL player pool into ALL rooms.
 * Each room gets players priced at its own bidIncrement.
 * Skips rooms that already have players (requireEmpty check).
 */
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { buildDefaultPlayerPoolRows } from "@/lib/default-player-pool";
import { handleRouteError } from "@/lib/server/api";
import { requireSuperAdmin } from "@/lib/server/auth";
import { insertPlayersIntoRoom } from "@/lib/server/player-import";
import { invalidateRoomCache } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Room } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireSuperAdmin();
    const admin = getSupabaseAdminClient();

    const { data: roomRows, error: roomsError } = await admin
      .from("rooms")
      .select("id, code, name, purse, squad_size, timer_seconds, bid_increment, owner_id, created_at")
      .eq("is_super_room", false)
      .order("created_at");
    if (roomsError) throw new AppError(roomsError.message, 500, "DB_QUERY_FAILED");

    const rooms: Room[] = (roomRows ?? []).map((r) => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      purse: Number(r.purse),
      squadSize: Number(r.squad_size),
      timerSeconds: Number(r.timer_seconds),
      bidIncrement: Number(r.bid_increment),
      ownerId: String(r.owner_id ?? ""),
      createdAt: String(r.created_at ?? ""),
      isSuperRoom: false,
    }));

    let totalImported = 0;
    const errors: string[] = [];

    for (const room of rooms) {
      try {
        const players = buildDefaultPlayerPoolRows(room.bidIncrement);
        const { imported } = await insertPlayersIntoRoom(room, players, { requireEmpty: true });
        totalImported += imported;
        await invalidateRoomCache(room.id, room.code);
        revalidatePath(`/room/${room.code}`);
        revalidatePath(`/auction/${room.code}`);
        revalidatePath(`/results/${room.code}`);
      } catch (err) {
        // Room with existing players raises PLAYERS_ALREADY_PRESENT — skip and note it
        errors.push(`${room.code}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({
      ok: true,
      roomsUpdated: rooms.length - errors.length,
      totalImported,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
