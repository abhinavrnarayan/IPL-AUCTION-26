import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { buildResumedAuctionState } from "@/lib/domain/auction";
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
    const auctionState = await getAuctionStateOnly(room.id);

    if (!auctionState) {
      throw new AppError("Auction has not started yet.", 400, "NO_AUCTION_STATE");
    }

    const now = new Date();
    const admin = getSupabaseAdminClient();
    const nextState = buildResumedAuctionState(room, auctionState, now);
    const updateValues = {
      phase: nextState.phase,
      expires_at: nextState.expiresAt,
      paused_remaining_ms: null,
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
      throw new AppError(error.message, 500, "AUCTION_RESUME_FAILED");
    }

    if (!data) {
      throw new AppError("Auction state changed. Refresh and retry.", 409, "VERSION_CONFLICT");
    }

    await Promise.all([
      invalidateRoomCache(room.id, room.code),
      clearAuctionLiveSnapshot(room.id),
    ]);
    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);

    return NextResponse.json({
      resumed: true,
      expiresAt: (data.expires_at as string | null | undefined) ?? null,
      lastEvent: (data.last_event as string | null | undefined) ?? null,
      pausedRemainingMs: (data.paused_remaining_ms as number | null | undefined) ?? null,
      phase: String(data.phase),
      version: Number(data.version),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
