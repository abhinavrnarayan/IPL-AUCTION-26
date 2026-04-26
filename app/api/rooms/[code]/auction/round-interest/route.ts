import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { roundInterestSchema } from "@/lib/domain/schemas";
import { readJson, handleRouteError } from "@/lib/server/api";
import { clearAuctionLiveSnapshot } from "@/lib/server/auction-live";
import { requireApiUser } from "@/lib/server/auth";
import {
  getAuctionStateOnly,
  getRoomEntities,
  requireRoomMember,
} from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room, member } = await requireRoomMember(code, authUser.id);
    const input = await readJson(request, roundInterestSchema);
    const admin = getSupabaseAdminClient();

    const auctionState = await getAuctionStateOnly(room.id);
    if (!auctionState) {
      throw new AppError("Auction has not started yet.", 400, "NO_AUCTION_STATE");
    }
    if (auctionState.phase !== "ROUND_END") {
      throw new AppError("Interest can only be submitted between rounds.", 400, "INVALID_PHASE");
    }

    const { teams, players } = await getRoomEntities(room.id, true);
    const team = teams.find((t) => t.id === input.teamId);
    if (!team) {
      throw new AppError("Team not found.", 404, "TEAM_NOT_FOUND");
    }
    if (!member.isAdmin && team.ownerUserId !== authUser.id) {
      throw new AppError("You can only submit interest for your own team.", 403, "TEAM_ACCESS_DENIED");
    }

    const validPlayerIds = new Set(
      players.filter((p) => p.status === "UNSOLD").map((p) => p.id),
    );
    const filteredIds = (input.playerIds ?? []).filter((id) => validPlayerIds.has(id));

    const nextRound = auctionState.currentRound + 1;

    // Replace this team's ballot for this round
    const { error: deleteError } = await admin
      .from("round_interests")
      .delete()
      .eq("room_id", room.id)
      .eq("round", nextRound)
      .eq("team_id", team.id);

    if (deleteError) {
      throw new AppError(deleteError.message, 500, "ROUND_INTEREST_CLEAR_FAILED");
    }

    if (filteredIds.length > 0) {
      const rows = filteredIds.map((playerId) => ({
        room_id: room.id,
        round: nextRound,
        team_id: team.id,
        player_id: playerId,
        submitted_by: authUser.id,
      }));
      const { error: insertError } = await admin.from("round_interests").insert(rows);
      if (insertError) {
        throw new AppError(insertError.message, 500, "ROUND_INTEREST_INSERT_FAILED");
      }
    }

    await clearAuctionLiveSnapshot(room.id);

    return NextResponse.json({ ok: true, count: filteredIds.length });
  } catch (error) {
    return handleRouteError(error);
  }
}
