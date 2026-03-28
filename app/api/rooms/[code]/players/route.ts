import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { playerUploadSchema, removePlayersSchema } from "@/lib/domain/schemas";
import { readJson, handleRouteError } from "@/lib/server/api";
import { requireApiUser, syncUserProfileFromAuthUser } from "@/lib/server/auth";
import { insertPlayersIntoRoom } from "@/lib/server/player-import";
import { getAuctionStateOnly, requireRoomAdmin } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    await syncUserProfileFromAuthUser(authUser);
    const { room } = await requireRoomAdmin(code, authUser.id);
    const input = await readJson(request, playerUploadSchema);
    const result = await insertPlayersIntoRoom(room, input.players);

    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    await syncUserProfileFromAuthUser(authUser);
    const { room } = await requireRoomAdmin(code, authUser.id);
    const input = await readJson(request, removePlayersSchema);
    const admin = getSupabaseAdminClient();
    const auctionState = await getAuctionStateOnly(room.id);
    const targetIds = input.removeAll
      ? null
      : [...new Set((input.playerIds ?? []).filter(Boolean))];

    const playerQuery = admin
      .from("players")
      .select("id, current_team_id, sold_price")
      .eq("room_id", room.id);
    const { data: targetPlayers, error: targetError } = input.removeAll
      ? await playerQuery
      : await playerQuery.in("id", targetIds ?? []);

    if (targetError) {
      throw new AppError(targetError.message, 500, "PLAYER_FETCH_FAILED");
    }

    if (auctionState?.currentPlayerId && (targetPlayers ?? []).some((player) => player.id === auctionState.currentPlayerId)) {
      throw new AppError(
        "The player currently on the block cannot be removed right now.",
        400,
        "ACTIVE_PLAYER_LOCKED",
      );
    }

    const refundMap = new Map<string, number>();
    for (const player of targetPlayers ?? []) {
      const teamId = player.current_team_id ? String(player.current_team_id) : null;
      const soldPrice = Number(player.sold_price ?? 0);
      if (teamId && soldPrice > 0) {
        refundMap.set(teamId, (refundMap.get(teamId) ?? 0) + soldPrice);
      }
    }

    if ((targetPlayers ?? []).length > 0) {
      const deleteBidsQuery = admin.from("bids").delete().eq("room_id", room.id);
      const deleteSquadQuery = admin.from("squad").delete().eq("room_id", room.id);

      if (input.removeAll) {
        await deleteBidsQuery;
        await deleteSquadQuery;
      } else {
        await deleteBidsQuery.in("player_id", targetIds ?? []);
        await deleteSquadQuery.in("player_id", targetIds ?? []);
      }
    }

    for (const [teamId, refundAmount] of refundMap.entries()) {
      const { data: teamRow, error: teamFetchError } = await admin
        .from("teams")
        .select("purse_remaining")
        .eq("room_id", room.id)
        .eq("id", teamId)
        .maybeSingle();

      if (teamFetchError) {
        throw new AppError(teamFetchError.message, 500, "TEAM_FETCH_FAILED");
      }

      if (!teamRow) continue;

      const { error: teamUpdateError } = await admin
        .from("teams")
        .update({ purse_remaining: Number(teamRow.purse_remaining) + refundAmount })
        .eq("room_id", room.id)
        .eq("id", teamId);

      if (teamUpdateError) {
        throw new AppError(teamUpdateError.message, 500, "TEAM_UPDATE_FAILED");
      }
    }

    let deletedCount = 0;

    if (input.removeAll) {
      const { data, error } = await admin
        .from("players")
        .delete()
        .eq("room_id", room.id)
        .select("id");

      if (error) {
        throw new AppError(error.message, 500, "PLAYER_DELETE_FAILED");
      }

      deletedCount = data?.length ?? 0;
    } else {
      const { data, error } = await admin
        .from("players")
        .delete()
        .eq("room_id", room.id)
        .in("id", input.playerIds ?? [])
        .select("id");

      if (error) {
        throw new AppError(error.message, 500, "PLAYER_DELETE_FAILED");
      }

      deletedCount = data?.length ?? 0;
    }

    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json({ deleted: deletedCount });
  } catch (error) {
    return handleRouteError(error);
  }
}
