/**
 * GET  /api/admin/super-room — check if super room exists; return its details
 * POST /api/admin/super-room — create the super room (idempotent; no-op if already exists)
 *
 * The super room is a private sandbox only accessible to superadmins.
 * It is isolated from all global operations:
 *   - Not visible in any lobby
 *   - Excluded from global score pushes (pushMatchToAllRooms)
 *   - Excluded from global player pool syncs
 *   - Excluded from global reset/recalculate operations
 */
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireSuperAdmin } from "@/lib/server/auth";
import { mapRoom } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SUPER_ROOM_CODE = "SUPERADM";
const SUPER_ROOM_DEFAULTS = {
  name: "Admin Sandbox",
  purse: 1000,
  squad_size: 11,
  timer_seconds: 60,
  bid_increment: 5,
};

export async function GET() {
  try {
    await requireSuperAdmin();
    const admin = getSupabaseAdminClient();

    const { data, error } = await admin
      .from("rooms")
      .select("*")
      .eq("is_super_room", true)
      .maybeSingle();

    if (error) throw new AppError(error.message, 500, "DB_QUERY_FAILED");

    if (!data) {
      return NextResponse.json({ ok: true, superRoom: null });
    }

    const room = mapRoom(data as Record<string, unknown>);
    return NextResponse.json({ ok: true, superRoom: room });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST() {
  try {
    const authUser = await requireSuperAdmin();
    const admin = getSupabaseAdminClient();

    // Idempotency: if super room already exists, return it
    const { data: existing } = await admin
      .from("rooms")
      .select("*")
      .eq("is_super_room", true)
      .maybeSingle();

    if (existing) {
      const room = mapRoom(existing as Record<string, unknown>);
      // Ensure superadmin is a member (in case they weren't added before)
      await admin.from("room_members").upsert(
        { room_id: room.id, user_id: authUser.id, is_admin: true, is_player: false },
        { onConflict: "room_id,user_id" },
      );
      return NextResponse.json({ ok: true, superRoom: room, created: false });
    }

    // Create the super room
    const { data: roomRow, error: roomError } = await admin
      .from("rooms")
      .insert({
        code: SUPER_ROOM_CODE,
        name: SUPER_ROOM_DEFAULTS.name,
        purse: SUPER_ROOM_DEFAULTS.purse,
        squad_size: SUPER_ROOM_DEFAULTS.squad_size,
        timer_seconds: SUPER_ROOM_DEFAULTS.timer_seconds,
        bid_increment: SUPER_ROOM_DEFAULTS.bid_increment,
        owner_id: authUser.id,
        is_super_room: true,
      })
      .select("*")
      .maybeSingle();

    if (roomError) throw new AppError(roomError.message, 500, "ROOM_CREATE_FAILED");
    if (!roomRow) throw new AppError("Room insert returned no data.", 500, "ROOM_CREATE_FAILED");

    const room = mapRoom(roomRow as Record<string, unknown>);

    // Add superadmin as room admin
    const { error: memberError } = await admin.from("room_members").insert({
      room_id: room.id,
      user_id: authUser.id,
      is_admin: true,
      is_player: false,
    });
    if (memberError) throw new AppError(memberError.message, 500, "ROOM_MEMBER_FAILED");

    // Initialise auction state
    const { error: auctionError } = await admin.from("auction_state").upsert({
      room_id: room.id,
      phase: "WAITING",
      current_round: 1,
      current_bid: null,
      current_team_id: null,
      current_player_id: null,
      expires_at: null,
      version: 1,
      last_event: "SUPER_ROOM_CREATED",
    });
    if (auctionError) throw new AppError(auctionError.message, 500, "AUCTION_INIT_FAILED");

    revalidatePath(`/room/${room.code}`);

    return NextResponse.json({ ok: true, superRoom: room, created: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
