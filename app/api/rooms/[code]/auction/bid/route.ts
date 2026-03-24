import { NextResponse } from "next/server";

import {
  getNextBidAmount,
  validateBidPlacement,
} from "@/lib/domain/auction";
import { AppError } from "@/lib/domain/errors";
import { bidSchema } from "@/lib/domain/schemas";
import { readJson, handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { requireRoomMember } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room, member } = await requireRoomMember(code, authUser.id);
    const input = await readJson(request, bidSchema);
    const admin = getSupabaseAdminClient();
    
    // Instead of fetching all 600+ players using getRoomEntities, surgically query only what is needed
    const [{ data: auctionRow }, { data: teamRow }, { data: squadRows }] = await Promise.all([
      admin.from("auction_state").select("*").eq("room_id", room.id).maybeSingle(),
      admin.from("teams").select("*").eq("id", input.teamId).maybeSingle(),
      admin.from("squad").select("*").eq("room_id", room.id),
    ]);

    if (!auctionRow) {
      throw new AppError("Auction has not started yet.", 400, "NO_AUCTION_STATE");
    }

    const { mapAuctionState, mapTeam, mapPlayer, mapSquadEntry } = await import("@/lib/server/room");
    const auctionState = mapAuctionState(auctionRow as Record<string, unknown>);
    
    const { data: playerRow } = await admin
      .from("players")
      .select("*")
      .eq("id", auctionState.currentPlayerId ?? "")
      .maybeSingle();

    const currentPlayer = playerRow ? mapPlayer(playerRow as Record<string, unknown>) : null;
    const team = teamRow ? mapTeam(teamRow as Record<string, unknown>) : null;
    const squads = (squadRows ?? []).map((row) => mapSquadEntry(row as Record<string, unknown>));

    if (!currentPlayer) {
      throw new AppError("No active player is available for bidding.", 400, "NO_PLAYER");
    }

    if (!team) {
      throw new AppError("Team was not found.", 404, "TEAM_NOT_FOUND");
    }

    if (team.ownerUserId && !member.isAdmin && team.ownerUserId !== authUser.id) {
      throw new AppError(
        "You can only bid for your own team unless you are an admin.",
        403,
        "TEAM_ACCESS_DENIED",
      );
    }

    const { nextExpiresAt } = validateBidPlacement({
      room,
      auctionState,
      team,
      squads,
      now: new Date(),
      increment: input.increment,
    });

    const nextBidAmount = getNextBidAmount(currentPlayer, auctionState, input.increment);

    if (team.purseRemaining < nextBidAmount) {
      throw new AppError("Team does not have enough purse for this bid.", 400, "LOW_PURSE");
    }

    const { data: updatedState, error: updateError } = await admin
      .from("auction_state")
      .update({
        current_bid: nextBidAmount,
        current_team_id: team.id,
        expires_at: nextExpiresAt,
        version: auctionState.version + 1,
        last_event: "NEW_BID",
      })
      .eq("room_id", room.id)
      .eq("version", auctionState.version)
      .select("*")
      .maybeSingle();

    if (updateError) {
      throw new AppError(updateError.message, 500, "BID_UPDATE_FAILED");
    }

    if (!updatedState) {
      throw new AppError(
        "Auction state changed. Refresh and try again.",
        409,
        "VERSION_CONFLICT",
      );
    }

    const { error: bidError } = await admin.from("bids").insert({
      room_id: room.id,
      player_id: currentPlayer.id,
      team_id: team.id,
      amount: nextBidAmount,
      created_by: authUser.id,
    });

    if (bidError) {
      throw new AppError(bidError.message, 500, "BID_LOG_FAILED");
    }

    return NextResponse.json({ amount: nextBidAmount });
  } catch (error) {
    return handleRouteError(error);
  }
}
