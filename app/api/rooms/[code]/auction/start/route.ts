import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { buildStartingAuctionState, shuffleItems } from "@/lib/domain/auction";
import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { clearAuctionLiveSnapshot } from "@/lib/server/auction-live";
import { requireApiUser, syncUserProfileFromAuthUser } from "@/lib/server/auth";
import { reorderPlayersSafely } from "@/lib/server/player-order";
import { getRoomEntities, requireRoomAdmin, invalidateRoomCache } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    await syncUserProfileFromAuthUser(authUser);
    const { room } = await requireRoomAdmin(code, authUser.id);
    const admin = getSupabaseAdminClient();
    const { players, teams, auctionState } = await getRoomEntities(room.id, true);

    if (players.length === 0) {
      throw new AppError("Upload players before starting the auction.", 400, "NO_PLAYERS");
    }

    if (teams.length < 1) {
      throw new AppError("Create at least one team before starting.", 400, "NO_TEAMS");
    }

    if (auctionState && !["WAITING", "ROUND_END", "COMPLETED"].includes(auctionState.phase)) {
      throw new AppError("Auction has already started.", 400, "AUCTION_ALREADY_STARTED");
    }

    if (auctionState && ["ROUND_END", "COMPLETED"].includes(auctionState.phase)) {
      const { error: recycleError } = await admin
        .from("players")
        .update({ status: "AVAILABLE" })
        .eq("room_id", room.id)
        .eq("status", "UNSOLD");

      if (recycleError) {
        throw new AppError(recycleError.message, 500, "PLAYER_RESET_FAILED");
      }
    }

    const refreshedPlayers =
      auctionState && ["ROUND_END", "COMPLETED"].includes(auctionState.phase)
        ? players.map((player) =>
            player.status === "UNSOLD" ? { ...player, status: "AVAILABLE" as const } : player,
          )
        : players;

    const availablePlayers = refreshedPlayers.filter(
      (player) => player.status === "AVAILABLE",
    );
    const shuffledAvailablePlayers = shuffleItems(availablePlayers);

    if (shuffledAvailablePlayers.length > 0) {
      await reorderPlayersSafely(
        room.id,
        shuffledAvailablePlayers.map((player) => ({
          id: player.id,
          orderIndex: player.orderIndex,
        })),
      );
    }

    const nextState = buildStartingAuctionState({
      room,
      players: [
        ...shuffledAvailablePlayers.map((player, index) => ({
          ...player,
          orderIndex: [...availablePlayers]
            .map((availablePlayer) => availablePlayer.orderIndex)
            .sort((left, right) => left - right)[index] ?? player.orderIndex,
        })),
        ...refreshedPlayers.filter((player) => player.status !== "AVAILABLE"),
      ],
      now: new Date(),
    });

    const version = (auctionState?.version ?? 0) + 1;
    const { error } = await admin.from("auction_state").upsert({
      room_id: room.id,
      phase: nextState.phase,
      current_round: nextState.currentRound,
      current_player_id: nextState.currentPlayerId,
      current_bid: nextState.currentBid,
      current_team_id: nextState.currentTeamId,
      expires_at: nextState.expiresAt,
      version,
      last_event: nextState.lastEvent,
    });

    if (error) {
      throw new AppError(error.message, 500, "AUCTION_START_FAILED");
    }

    await invalidateRoomCache(room.id, room.code);
    await clearAuctionLiveSnapshot(room.id);
    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json({ started: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
