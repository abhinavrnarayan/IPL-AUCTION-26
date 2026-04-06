import { NextResponse } from "next/server";

import { resolveExpiredAuction, shuffleItems } from "@/lib/domain/auction";
import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { isMissingColumnError, omitOptionalColumns } from "@/lib/server/auction-state";
import { requireApiUser } from "@/lib/server/auth";
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
    const { room } = await requireRoomAdmin(code, authUser.id);
    const admin = getSupabaseAdminClient();
    const { players, teams, auctionState, squads } = await getRoomEntities(room.id, true);

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

    const resolvedPlayers = players.map((player) =>
      player.id === resolution.currentPlayer.id
        ? {
            ...player,
            status: resolution.sold ? "SOLD" : "UNSOLD",
            currentTeamId: resolution.sold ? auctionState.currentTeamId : null,
            soldPrice: resolution.sold ? auctionState.currentBid : null,
          }
        : player,
    );

    const unsoldPlayers = resolvedPlayers
      .filter((player) => player.status === "UNSOLD")
      .sort((left, right) => left.orderIndex - right.orderIndex);

    let finalPhase = resolution.nextPhase;
    let finalPlayerId = resolution.nextPlayerId;
    let finalExpiresAt = resolution.expiresAt;
    let finalLastEvent = resolution.lastEvent;
    let finalRound = resolution.nextRound;

    if (!resolution.nextPlayerId && unsoldPlayers.length > 0) {
      const shuffledUnsoldPlayers = shuffleItems(unsoldPlayers);
      await reorderPlayersSafely(
        room.id,
        shuffledUnsoldPlayers.map((player) => ({
          id: player.id,
          orderIndex: player.orderIndex,
        })),
      );

      const { error: recycleError } = await admin
        .from("players")
        .update({ status: "AVAILABLE" })
        .eq("room_id", room.id)
        .eq("status", "UNSOLD");

      if (recycleError) {
        throw new AppError(recycleError.message, 500, "ROUND_RECYCLE_FAILED");
      }

      finalRound = resolution.nextRound + 1;
      finalPhase = "LIVE";
      finalPlayerId = shuffledUnsoldPlayers[0]?.id ?? null;
      finalExpiresAt = new Date(Date.now() + room.timerSeconds * 1000).toISOString();
      finalLastEvent = "ROUND_STARTED";
    } else if (!resolution.nextPlayerId) {
      finalPhase = "ROUND_END";
      finalPlayerId = null;
      finalExpiresAt = null;
      finalLastEvent = "ROUND_END";
    }

    const finalUpdate = {
      phase: finalPhase,
      current_round: finalRound,
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

    // Invalidate room entities cache — player status, team purse, squads changed
    await invalidateRoomCache(room.id);

    return NextResponse.json({
      phase: finalPhase,
      round: resolution.nextRound,
      playerId: finalPlayerId,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
