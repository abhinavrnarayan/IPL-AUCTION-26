import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { isMissingColumnError, omitOptionalColumns } from "@/lib/server/auction-state";
import { requireApiUser } from "@/lib/server/auth";
import { getAuctionStateOnly, requireRoomAdmin } from "@/lib/server/room";
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

    // Mark all remaining AVAILABLE players as UNSOLD
    await admin
      .from("players")
      .update({ status: "UNSOLD", current_team_id: null, sold_price: null })
      .eq("room_id", room.id)
      .eq("status", "AVAILABLE");

    // Complete the auction when the admin chooses to close it
    const updateValues = {
      phase: "COMPLETED",
      current_player_id: null,
      current_bid: null,
      current_team_id: null,
      expires_at: null,
      paused_remaining_ms: null,
      skip_vote_team_ids: [],
      version: auctionState.version + 1,
      last_event: "AUCTION_COMPLETED",
    };
    let { error: stateError } = await admin
      .from("auction_state")
      .update(updateValues)
      .eq("room_id", room.id);

    if (stateError && isMissingColumnError(stateError.message)) {
      const retry = await admin
        .from("auction_state")
        .update(omitOptionalColumns(updateValues))
        .eq("room_id", room.id);
      stateError = retry.error;
    }

    if (stateError) {
      throw new AppError(stateError.message, 500, "AUCTION_COMPLETE_FAILED");
    }

    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json({ ok: true, phase: "COMPLETED" });
  } catch (error) {
    return handleRouteError(error);
  }
}
