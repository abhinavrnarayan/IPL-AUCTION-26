import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { createRoomSchema } from "@/lib/domain/schemas";
import { AppError } from "@/lib/domain/errors";
import { readJson, handleRouteError } from "@/lib/server/api";
import { requireApiUser, syncUserProfileFromAuthUser } from "@/lib/server/auth";
import { mapRoom } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateRoomCode } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    const authUser = await requireApiUser();
    await syncUserProfileFromAuthUser(authUser);
    const input = await readJson(request, createRoomSchema);
    const admin = getSupabaseAdminClient();

    let roomRow: Record<string, unknown> | null = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = generateRoomCode();
      const { data, error } = await admin
        .from("rooms")
        .insert({
          code,
          name: input.name,
          purse: input.purse,
          squad_size: input.squadSize,
          timer_seconds: input.timerSeconds,
          bid_increment: input.bidIncrement,
          owner_id: authUser.id,
        })
        .select("*")
        .maybeSingle();

      if (error) {
        if (error.code === "23505") {
          continue;
        }

        throw new AppError(error.message, 500, "ROOM_CREATE_FAILED");
      }

      if (data) {
        roomRow = data as Record<string, unknown>;
        break;
      }
    }

    if (!roomRow) {
      throw new AppError("Unable to allocate a unique room code.", 500, "ROOM_CODE_FAILED");
    }

    const room = mapRoom(roomRow);

    const { error: memberError } = await admin.from("room_members").insert({
      room_id: room.id,
      user_id: authUser.id,
      is_admin: true,
      is_player: true,
    });

    if (memberError) {
      throw new AppError(memberError.message, 500, "ROOM_MEMBER_FAILED");
    }

    const { error: auctionError } = await admin.from("auction_state").upsert({
      room_id: room.id,
      phase: "WAITING",
      current_round: 1,
      current_bid: null,
      current_team_id: null,
      current_player_id: null,
      expires_at: null,
      version: 1,
      last_event: "ROOM_CREATED",
    });

    if (auctionError) {
      throw new AppError(auctionError.message, 500, "AUCTION_INIT_FAILED");
    }

    revalidatePath("/lobby");
    revalidatePath(`/room/${room.code}`);

    return NextResponse.json({ room });
  } catch (error) {
    return handleRouteError(error);
  }
}
