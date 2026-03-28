import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { skipVoteSchema } from "@/lib/domain/schemas";
import { readJson, handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { getAuctionStateOnly, getRoomEntities, requireRoomMember } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room, member } = await requireRoomMember(code, authUser.id);
    const input = await readJson(request, skipVoteSchema);
    const admin = getSupabaseAdminClient();

    // Players may only vote for their own team; admins can vote for any team
    if (!member.isAdmin) {
      const { teams } = await getRoomEntities(room.id);
      const team = teams.find((t) => t.id === input.teamId);
      if (!team) {
        throw new AppError("Team not found.", 404, "TEAM_NOT_FOUND");
      }
      if (team.ownerUserId !== authUser.id) {
        throw new AppError("You can only vote to skip for your own team.", 403, "TEAM_ACCESS_DENIED");
      }
    }

    const auctionState = await getAuctionStateOnly(room.id);

    if (!auctionState) {
      throw new AppError("Auction has not started yet.", 400, "NO_AUCTION_STATE");
    }

    if (auctionState.phase !== "LIVE") {
      throw new AppError("Auction is not live.", 400, "INVALID_PHASE");
    }

    if (!auctionState.currentPlayerId) {
      throw new AppError("No active player to skip.", 400, "NO_ACTIVE_PLAYER");
    }

    // Already voted
    if (auctionState.skipVoteTeamIds.includes(input.teamId)) {
      return NextResponse.json({ voted: true, alreadyVoted: true });
    }

    const nextSkipVotes = [...auctionState.skipVoteTeamIds, input.teamId];

    // Fetch total teams to check if all have voted
    const { teams } = await getRoomEntities(room.id);
    const allVoted = member.isAdmin || nextSkipVotes.length >= teams.length;

    // If all teams voted, expire the timer immediately to trigger auto-advance
    const nextExpiresAt = allVoted ? new Date().toISOString() : auctionState.expiresAt;

    const { data, error } = await admin
      .from("auction_state")
      .update({
        skip_vote_team_ids: nextSkipVotes,
        expires_at: nextExpiresAt,
        version: auctionState.version + 1,
        last_event: allVoted ? "ALL_SKIPPED" : "SKIP_VOTED",
      })
      .eq("room_id", room.id)
      .eq("version", auctionState.version)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new AppError(error.message, 500, "SKIP_VOTE_FAILED");
    }

    if (!data) {
      throw new AppError("Auction state changed. Try again.", 409, "VERSION_CONFLICT");
    }

    return NextResponse.json({
      voted: true,
      voteCount: nextSkipVotes.length,
      total: teams.length,
      allVoted,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
