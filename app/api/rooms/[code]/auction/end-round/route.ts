import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { MAX_AUCTION_ROUNDS } from "@/lib/domain/auction";
import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { isMissingColumnError, omitOptionalColumns } from "@/lib/server/auction-state";
import { clearAuctionLiveSnapshot } from "@/lib/server/auction-live";
import { requireApiUser } from "@/lib/server/auth";
import { getAuctionStateOnly, invalidateRoomCache, requireRoomAdmin } from "@/lib/server/room";
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

    const auctionState = await getAuctionStateOnly(room.id);

    if (!auctionState) {
      throw new AppError("Auction has not started yet.", 400, "NO_AUCTION_STATE");
    }

    if (auctionState.phase === "ROUND_END" || auctionState.phase === "COMPLETED") {
      return NextResponse.json({ ok: true, phase: auctionState.phase });
    }

    // Mark all remaining AVAILABLE players (and the current one if it was still live) as UNSOLD
    const { error: markUnsoldError } = await admin
      .from("players")
      .update({ status: "UNSOLD", current_team_id: null, sold_price: null })
      .eq("room_id", room.id)
      .eq("status", "AVAILABLE");

    if (markUnsoldError) {
      throw new AppError(markUnsoldError.message, 500, "PLAYER_UPDATE_FAILED");
    }

    // Decide: go to ROUND_END (so members can submit interest for the next round)
    // or COMPLETED (final round, or no UNSOLD players left to carry forward).
    const { data: unsoldRows, error: unsoldError } = await admin
      .from("players")
      .select("id")
      .eq("room_id", room.id)
      .eq("status", "UNSOLD");

    if (unsoldError) {
      throw new AppError(unsoldError.message, 500, "PLAYER_COUNT_FAILED");
    }

    const hasUnsold = (unsoldRows ?? []).length > 0;
    const atMaxRound = auctionState.currentRound >= MAX_AUCTION_ROUNDS;
    const goToRoundEnd = hasUnsold && !atMaxRound;

    const updateValues = {
      phase: goToRoundEnd ? "ROUND_END" : "COMPLETED",
      current_player_id: null,
      current_bid: null,
      current_team_id: null,
      expires_at: null,
      paused_remaining_ms: null,
      skip_vote_team_ids: [],
      version: auctionState.version + 1,
      last_event: goToRoundEnd ? "ROUND_END" : "AUCTION_COMPLETED",
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
      throw new AppError(stateError.message, 500, "AUCTION_COMPLETE_FAILED");
    }

    if (!updatedState) {
      throw new AppError("Auction state changed. Refresh and retry.", 409, "VERSION_CONFLICT");
    }

    await invalidateRoomCache(room.id, room.code);
    await clearAuctionLiveSnapshot(room.id);
    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json({ ok: true, phase: updateValues.phase });
  } catch (error) {
    return handleRouteError(error);
  }
}
