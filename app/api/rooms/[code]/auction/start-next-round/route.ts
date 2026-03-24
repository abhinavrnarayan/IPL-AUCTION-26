import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { startNextRoundSchema } from "@/lib/domain/schemas";
import { readJson, handleRouteError } from "@/lib/server/api";
import { isMissingPausedRemainingMsColumnError, omitPausedRemainingMs } from "@/lib/server/auction-state";
import { requireApiUser } from "@/lib/server/auth";
import { getAuctionStateOnly, requireRoomAdmin } from "@/lib/server/room";
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

    // Reset selected players back to AVAILABLE
    const { error: playerError } = await admin
      .from("players")
      .update({ status: "AVAILABLE" })
      .in("id", playerIds)
      .eq("room_id", room.id);

    if (playerError) {
      throw new AppError(playerError.message, 500, "PLAYER_RESET_FAILED");
    }

    // Fetch first player in the new round order
    const { data: firstPlayerRows } = await admin
      .from("players")
      .select("id, order_index")
      .eq("room_id", room.id)
      .in("id", playerIds)
      .order("order_index")
      .limit(1);

    const firstPlayer = firstPlayerRows?.[0] ?? null;

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
    let { error: stateError } = await admin
      .from("auction_state")
      .update(updateValues)
      .eq("room_id", room.id);

    if (stateError && isMissingPausedRemainingMsColumnError(stateError.message)) {
      const retry = await admin
        .from("auction_state")
        .update(omitPausedRemainingMs(updateValues))
        .eq("room_id", room.id);
      stateError = retry.error;
    }

    if (stateError) {
      throw new AppError(stateError.message, 500, "STATE_UPDATE_FAILED");
    }

    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);

    return NextResponse.json({ round: nextRound });
  } catch (error) {
    return handleRouteError(error);
  }
}
