/**
 * GET  /api/admin/players  — list all rooms with their player counts
 * POST /api/admin/players  — push a player list to ALL rooms
 * DELETE /api/admin/players — remove player(s) from ALL rooms
 *   { name: string }       — remove one player by name (ilike match)
 *   { removeAll: true }    — wipe all players from every room
 */
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { playerUploadSchema } from "@/lib/domain/schemas";
import { readJson, handleRouteError } from "@/lib/server/api";
import { requireSuperAdmin } from "@/lib/server/auth";
import { insertPlayersIntoRoom } from "@/lib/server/player-import";
import { invalidateRoomCache } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Room } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

async function fetchAllRooms(): Promise<Room[]> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("rooms")
    .select("id, code, name, purse, squad_size, timer_seconds, bid_increment, owner_id, created_at, is_super_room")
    .eq("is_super_room", false) // super room is excluded from all global ops
    .order("created_at");
  if (error) throw new AppError(error.message, 500, "DB_QUERY_FAILED");
  return (data ?? []).map((r) => ({
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
}

export async function GET() {
  try {
    await requireSuperAdmin();
    const admin = getSupabaseAdminClient();
    const [rooms, { data: players, error: playersError }] = await Promise.all([
      fetchAllRooms(),
      admin.from("players").select("room_id"),
    ]);
    if (playersError) throw new AppError(playersError.message, 500, "DB_QUERY_FAILED");

    const countByRoom = new Map<string, number>();
    for (const p of players ?? []) {
      const id = String(p.room_id);
      countByRoom.set(id, (countByRoom.get(id) ?? 0) + 1);
    }

    return NextResponse.json({
      ok: true,
      rooms: rooms.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        playerCount: countByRoom.get(r.id) ?? 0,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin();
    const input = await readJson(request, playerUploadSchema);
    const rooms = await fetchAllRooms();

    if (rooms.length === 0) {
      return NextResponse.json({ ok: true, roomsUpdated: 0, totalImported: 0 });
    }

    let totalImported = 0;
    const errors: string[] = [];

    for (const room of rooms) {
      try {
        const { imported } = await insertPlayersIntoRoom(room, input.players);
        totalImported += imported;
        await invalidateRoomCache(room.id, room.code);
        revalidatePath(`/room/${room.code}`);
        revalidatePath(`/auction/${room.code}`);
        revalidatePath(`/results/${room.code}`);
      } catch (err) {
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

export async function DELETE(request: Request) {
  try {
    await requireSuperAdmin();
    const admin = getSupabaseAdminClient();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const playerName = typeof body.name === "string" ? body.name.trim() : null;
    const removeAll = body.removeAll === true;

    if (!removeAll && !playerName) {
      throw new AppError("Provide player name or removeAll=true.", 400, "NO_DATA");
    }

    const { data: rooms, error: roomsError } = await admin.from("rooms").select("id, code");
    if (roomsError) throw new AppError(roomsError.message, 500, "DB_QUERY_FAILED");

    let totalDeleted = 0;
    for (const room of rooms ?? []) {
      const { data } = await (removeAll || !playerName
        ? admin.from("players").delete().eq("room_id", room.id).select("id")
        : admin.from("players").delete().eq("room_id", room.id).ilike("name", playerName).select("id"));
      totalDeleted += data?.length ?? 0;
      await invalidateRoomCache(String(room.id), String(room.code));
      revalidatePath(`/room/${room.code}`);
      revalidatePath(`/results/${room.code}`);
    }

    return NextResponse.json({ ok: true, totalDeleted });
  } catch (error) {
    return handleRouteError(error);
  }
}
