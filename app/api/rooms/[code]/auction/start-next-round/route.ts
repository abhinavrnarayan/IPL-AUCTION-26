import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { MAX_AUCTION_ROUNDS, shuffleItems } from "@/lib/domain/auction";
import { AppError } from "@/lib/domain/errors";
import { startNextRoundSchema } from "@/lib/domain/schemas";
import { readJson, handleRouteError } from "@/lib/server/api";
import { isMissingColumnError, omitOptionalColumns } from "@/lib/server/auction-state";
import { clearAuctionLiveSnapshot } from "@/lib/server/auction-live";
import { requireApiUser } from "@/lib/server/auth";
import { reorderPlayersSafely } from "@/lib/server/player-order";
import { getAuctionStateOnly, invalidateRoomCache, requireRoomAdmin } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);
    const { playerIds } = await readJson(request, startNextRoundSchema);
    const admin = getSupabaseAdminClient();

    const auctionState = await getAuctionStateOnly(room.id);

    if (!auctionState) {
      throw new AppError("Auction has not started yet.", 400, "NO_AUCTION_STATE");
    }

    if (auctionState.phase !== "ROUND_END") {
      throw new AppError("Auction is not at round end.", 400, "INVALID_PHASE");
    }

    const nextRound = auctionState.currentRound + 1;

    if (nextRound > MAX_AUCTION_ROUNDS) {
      throw new AppError(
        `Auction already ran the maximum of ${MAX_AUCTION_ROUNDS} rounds. Complete the auction and finish remaining moves via trades.`,
        400,
        "MAX_ROUNDS_REACHED",
      );
    }

    const requestedPlayerIds = Array.from(new Set(playerIds));
    const { data: teamRows, error: teamError } = await admin
      .from("teams")
      .select("id, owner_user_id")
      .eq("room_id", room.id);

    if (teamError) {
      throw new AppError(teamError.message, 500, "TEAM_FETCH_FAILED");
    }

    const ownedTeamIds = (teamRows ?? [])
      .filter((team) => team.owner_user_id)
      .map((team) => String(team.id));

    let eligiblePlayerIds = requestedPlayerIds;
    if (ownedTeamIds.length > 0) {
      const { data: interestRows, error: interestError } = await admin
        .from("round_interests")
        .select("player_id")
        .eq("room_id", room.id)
        .eq("round", nextRound)
        .in("team_id", ownedTeamIds);

      if (interestError) {
        throw new AppError(interestError.message, 500, "ROUND_INTEREST_FETCH_FAILED");
      }

      eligiblePlayerIds = Array.from(
        new Set((interestRows ?? []).map((row) => String(row.player_id))),
      );
    }

    if (eligiblePlayerIds.length === 0) {
      throw new AppError(
        ownedTeamIds.length > 0
          ? "No team owner selections have been submitted for the next round yet."
          : "Select at least one player for the next round.",
        400,
        "NO_PLAYERS",
      );
    }

    const { data: selectedPlayers, error: selectedPlayersError } = await admin
      .from("players")
      .select("id, order_index")
      .eq("room_id", room.id)
      .eq("status", "UNSOLD")
      .in("id", eligiblePlayerIds);

    if (selectedPlayersError) {
      throw new AppError(selectedPlayersError.message, 500, "PLAYER_FETCH_FAILED");
    }

    if ((selectedPlayers ?? []).length === 0) {
      throw new AppError("No unsold players found for next round.", 400, "NO_PLAYERS");
    }

    const shuffledSelectedPlayers = shuffleItems(selectedPlayers ?? []);
    const selectedPlayerIds = shuffledSelectedPlayers.map((player) => String(player.id));
    await reorderPlayersSafely(
      room.id,
      shuffledSelectedPlayers.map((player) => ({
        id: String(player.id),
        orderIndex: Number(player.order_index),
      })),
    );

    // Reset selected players back to AVAILABLE
    const { error: playerError } = await admin
      .from("players")
      .update({ status: "AVAILABLE" })
      .in("id", selectedPlayerIds)
      .eq("room_id", room.id);

    if (playerError) {
      throw new AppError(playerError.message, 500, "PLAYER_RESET_FAILED");
    }

    const firstPlayer = shuffledSelectedPlayers[0] ?? null;

    if (!firstPlayer) {
      throw new AppError("No players found for next round.", 400, "NO_PLAYERS");
    }

    const expiresAt = new Date(Date.now() + room.timerSeconds * 1000).toISOString();

    const updateValues = {
      phase: "LIVE",
      current_round: nextRound,
      current_player_id: firstPlayer.id,
      current_bid: null,
      current_team_id: null,
      expires_at: expiresAt,
      paused_remaining_ms: null,
      skip_vote_team_ids: [],
      version: auctionState.version + 1,
      last_event: "ROUND_STARTED",
    };
    let { data: updatedState, error: stateError } = await admin
      .from("auction_state")
      .update(updateValues)
      .eq("room_id", room.id)
      .eq("version", auctionState.version)
      .select("*")
      .maybeSingle();

    if (stateError && isMissingColumnError(stateError.message)) {
      const retry = await admin
        .from("auction_state")
        .update(omitOptionalColumns(updateValues))
        .eq("room_id", room.id)
        .eq("version", auctionState.version)
        .select("*")
        .maybeSingle();
      updatedState = retry.data;
      stateError = retry.error;
    }

    if (stateError) {
      throw new AppError(stateError.message, 500, "STATE_UPDATE_FAILED");
    }

    if (!updatedState) {
      throw new AppError("Auction state changed. Refresh and retry.", 409, "VERSION_CONFLICT");
    }

    await invalidateRoomCache(room.id, room.code);
    await clearAuctionLiveSnapshot(room.id);
    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);

    return NextResponse.json({
      round: nextRound,
      expiresAt,
      playerId: String(firstPlayer.id),
      selectedPlayerIds,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
