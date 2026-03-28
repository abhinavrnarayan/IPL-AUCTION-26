import { NextResponse } from "next/server";

import { buildPausedAuctionState } from "@/lib/domain/auction";
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
    const auctionState = await getAuctionStateOnly(room.id);

    if (!auctionState) {
      throw new AppError("Auction has not started yet.", 400, "NO_AUCTION_STATE");
    }

    const now = new Date();
    const admin = getSupabaseAdminClient();
    const nextState = buildPausedAuctionState(auctionState, now);
    const updateValues = {
      phase: nextState.phase,
      expires_at: nextState.expiresAt,
      paused_remaining_ms: nextState.pausedRemainingMs,
      version: auctionState.version + 1,
      last_event: nextState.lastEvent,
    };
    let { data, error } = await admin
      .from("auction_state")
      .update(updateValues)
      .eq("room_id", room.id)
      .eq("version", auctionState.version)
      .select("*")
      .maybeSingle();

    if (error && isMissingColumnError(error.message)) {
      const retry = await admin
        .from("auction_state")
        .update(omitOptionalColumns(updateValues))
        .eq("room_id", room.id)
        .eq("version", auctionState.version)
        .select("*")
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      throw new AppError(error.message, 500, "AUCTION_PAUSE_FAILED");
    }

    if (!data) {
      throw new AppError("Auction state changed. Refresh and retry.", 409, "VERSION_CONFLICT");
    }

    return NextResponse.json({ paused: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
