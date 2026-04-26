import { NextResponse } from "next/server";

import { resolveExpiredAuction } from "@/lib/domain/auction";
import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { isMissingColumnError, omitOptionalColumns } from "@/lib/server/auction-state";
import { clearAuctionLiveSnapshot } from "@/lib/server/auction-live";
import { requireApiUser } from "@/lib/server/auth";
import { getRoomEntities, requireRoomMember, invalidateRoomCache } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room, member } = await requireRoomMember(code, authUser.id);
    const admin = getSupabaseAdminClient();
    const { players, teams, auctionState } = await getRoomEntities(room.id, true);

    if (!auctionState) {
      throw new AppError("Auction has not started yet.", 400, "NO_AUCTION_STATE");
    }

    // Optional guard: client can tell us which player/version it expected to resolve.
    // If the server has already moved past it (auto-advance raced), treat as a no-op
    // so we don't accidentally resolve the NEW player with zero bids.
    const rawBody = await request.text().catch(() => "");
    let expectedPlayerId: string | undefined;
    let expectedVersion: number | undefined;
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody) as {
          expectedPlayerId?: string;
          expectedVersion?: number;
        };
        expectedPlayerId = parsed?.expectedPlayerId;
        expectedVersion = parsed?.expectedVersion;
      } catch {
        // malformed body — proceed without guard
      }
    }

    const alreadyAdvanced =
      (expectedPlayerId && auctionState.currentPlayerId !== expectedPlayerId) ||
      (expectedVersion !== undefined && auctionState.version !== expectedVersion);

    if (alreadyAdvanced || auctionState.phase !== "LIVE") {
      // Any non-LIVE phase (PAUSED / ROUND_END / COMPLETED / WAITING) or a stale
      // player/version means another actor already handled this — return a no-op
      // so the client just refreshes instead of surfacing a generic error.
      return NextResponse.json({
        noop: true,
        phase: auctionState.phase,
        round: auctionState.currentRound,
        playerId: auctionState.currentPlayerId,
      });
    }

    const resolution = resolveExpiredAuction({
      room,
      auctionState,
      players,
      now: new Date(),
      forceResolution: member.isAdmin,
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

    const finalPhase = resolution.nextPhase;
    const finalPlayerId = resolution.nextPlayerId;
    const finalExpiresAt = resolution.expiresAt;
    const finalLastEvent = resolution.lastEvent;
    const finalRound = resolution.nextRound;

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
    await invalidateRoomCache(room.id, room.code);
    await clearAuctionLiveSnapshot(room.id);

    return NextResponse.json({
      expiresAt: finalExpiresAt,
      phase: finalPhase,
      previousPlayerId: resolution.currentPlayer.id,
      previousPlayerStatus: resolution.sold ? "SOLD" : "UNSOLD",
      round: resolution.nextRound,
      playerId: finalPlayerId,
      version: Number(finalState.version),
      winningBid: resolution.sold ? auctionState.currentBid : null,
      winningTeamId: resolution.sold ? auctionState.currentTeamId : null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
