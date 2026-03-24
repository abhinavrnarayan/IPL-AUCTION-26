import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { canAuctionComplete, resolveExpiredAuction } from "@/lib/domain/auction";
import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { isMissingColumnError, omitOptionalColumns } from "@/lib/server/auction-state";
import { requireApiUser } from "@/lib/server/auth";
import { getRoomEntities, requireRoomAdmin } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);
    const admin = getSupabaseAdminClient();
    const { players, teams, auctionState, squads } = await getRoomEntities(room.id);

    if (!auctionState) {
      throw new AppError("Auction has not started yet.", 400, "NO_AUCTION_STATE");
    }

    const resolution = resolveExpiredAuction({
      room,
      auctionState,
      players,
      now: new Date(),
      forceResolution: true,
    });

    const { data: claimState, error: claimError } = await admin
      .from("auction_state")
      .update({
        phase: "ROUND_END",
        expires_at: null,
        version: auctionState.version + 1,
        last_event: "RESOLVING_AUCTION",
      })
      .eq("room_id", room.id)
      .eq("version", auctionState.version)
      .select("*")
      .maybeSingle();

    if (claimError) {
      throw new AppError(claimError.message, 500, "AUCTION_CLAIM_FAILED");
    }

    if (!claimState) {
      throw new AppError("Auction state changed. Refresh and retry.", 409, "VERSION_CONFLICT");
    }

    if (resolution.sold) {
      const winningTeam = teams.find((team) => team.id === auctionState.currentTeamId);

      if (!winningTeam || !auctionState.currentBid) {
        throw new AppError("Winning bid data is missing.", 500, "INVALID_SALE");
      }

      const { error: playerError } = await admin
        .from("players")
        .update({
          status: "SOLD",
          current_team_id: winningTeam.id,
          sold_price: auctionState.currentBid,
        })
        .eq("id", resolution.currentPlayer.id);

      if (playerError) {
        throw new AppError(playerError.message, 500, "PLAYER_SALE_FAILED");
      }

      const { error: teamError } = await admin
        .from("teams")
        .update({
          purse_remaining: winningTeam.purseRemaining - auctionState.currentBid,
        })
        .eq("id", winningTeam.id);

      if (teamError) {
        throw new AppError(teamError.message, 500, "PURSE_UPDATE_FAILED");
      }

      const { error: squadError } = await admin.from("squad").insert({
        room_id: room.id,
        team_id: winningTeam.id,
        player_id: resolution.currentPlayer.id,
        purchase_price: auctionState.currentBid,
        acquired_in_round: auctionState.currentRound,
      });

      if (squadError) {
        throw new AppError(squadError.message, 500, "SQUAD_INSERT_FAILED");
      }
    } else {
      const { error: playerError } = await admin
        .from("players")
        .update({
          status: "UNSOLD",
          current_team_id: null,
          sold_price: null,
        })
        .eq("id", resolution.currentPlayer.id);

      if (playerError) {
        throw new AppError(playerError.message, 500, "PLAYER_UNSOLD_FAILED");
      }
    }

    // Compute updated squads and purses to check auto-termination
    const updatedSquads = resolution.sold
      ? [
          ...squads,
          {
            id: "",
            roomId: room.id,
            teamId: auctionState.currentTeamId!,
            playerId: resolution.currentPlayer.id,
            purchasePrice: auctionState.currentBid!,
            acquiredInRound: auctionState.currentRound,
            createdAt: "",
          },
        ]
      : squads;

    const updatedTeams = resolution.sold
      ? teams.map((t) =>
          t.id === auctionState.currentTeamId
            ? { ...t, purseRemaining: t.purseRemaining - auctionState.currentBid! }
            : t,
        )
      : teams;

    // Don't force-complete if we're intentionally going to ROUND_END for admin picker
    const forceComplete =
      resolution.nextPhase !== "COMPLETED" &&
      resolution.nextPhase !== "ROUND_END" &&
      canAuctionComplete(updatedTeams, updatedSquads);

    const finalPhase = forceComplete ? "COMPLETED" : resolution.nextPhase;
    const finalPlayerId = forceComplete ? null : resolution.nextPlayerId;
    const finalExpiresAt = forceComplete ? null : resolution.expiresAt;
    const finalLastEvent = forceComplete ? "AUCTION_COMPLETED" : resolution.lastEvent;

    const finalUpdate = {
      phase: finalPhase,
      current_round: resolution.nextRound,
      current_player_id: finalPlayerId,
      current_bid: null,
      current_team_id: null,
      expires_at: finalExpiresAt,
      paused_remaining_ms: null,
      skip_vote_team_ids: [],
      version: Number(claimState.version) + 1,
      last_event: finalLastEvent,
    };

    let { data: finalState, error: finalError } = await admin
      .from("auction_state")
      .update(finalUpdate)
      .eq("room_id", room.id)
      .eq("version", claimState.version)
      .select("*")
      .maybeSingle();

    if (finalError && isMissingColumnError(finalError.message)) {
      const retry = await admin
        .from("auction_state")
        .update(omitOptionalColumns(finalUpdate))
        .eq("room_id", room.id)
        .eq("version", claimState.version)
        .select("*")
        .maybeSingle();
      finalState = retry.data;
      finalError = retry.error;
    }

    if (finalError) {
      throw new AppError(finalError.message, 500, "AUCTION_FINALIZE_FAILED");
    }

    if (!finalState) {
      throw new AppError("Final auction update conflicted. Refresh the room.", 409, "VERSION_CONFLICT");
    }

    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json({
      phase: finalPhase,
      round: resolution.nextRound,
      playerId: finalPlayerId,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
