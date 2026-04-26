import { NextResponse } from "next/server";

import {
  getNextBidAmount,
  validateBidPlacement,
} from "@/lib/domain/auction";
import { AppError } from "@/lib/domain/errors";
import { bidSchema } from "@/lib/domain/schemas";
import { readJson, handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { clearAuctionLiveSnapshot } from "@/lib/server/auction-live";
import { recordBidTiming } from "@/lib/server/bid-timing-stats";
import {
  mapAuctionState,
  mapPlayer,
  mapTeam,
  requireRoomMember,
} from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// Map RPC raise-exception messages back to AppError codes that
// `lib/server/api.ts → toClientMessage` will surface verbatim instead of
// masking as "Something went wrong." Each match must correspond to an
// entry in the safePassthrough set in api.ts.
function mapRpcErrorToCode(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("highest bidder cannot bid again")) return "DUPLICATE_BID";
  if (m.includes("squad is already full")) return "SQUAD_FULL";
  if (m.includes("bidding time has ended")) return "TIMER_EXPIRED";
  if (m.includes("auction is not live")) return "INVALID_PHASE";
  if (m.includes("auction has not started")) return "INVALID_PHASE";
  if (m.includes("invalid bid increment")) return "INVALID_INCREMENT";
  if (m.includes("does not have enough purse")) return "LOW_PURSE";
  if (m.includes("you can only bid for your own team")) return "TEAM_ACCESS_DENIED";
  if (m.includes("team was not found")) return "TEAM_NOT_FOUND";
  if (m.includes("room was not found")) return "ROOM_NOT_FOUND";
  if (m.includes("join this room")) return "ROOM_ACCESS_DENIED";
  if (m.includes("no player is currently on the block")) return "NO_ACTIVE_PLAYER";
  if (m.includes("no active player is available")) return "NO_PLAYER";
  if (m.includes("auction state changed")) return "VERSION_CONFLICT";
  return "BID_RPC_FAILED";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const startedAt = Date.now();
  const marks: Array<{ step: string; ms: number }> = [];
  const mark = (step: string) => {
    marks.push({ step, ms: Date.now() - startedAt });
  };
  try {
    const { code } = await context.params;
    mark("params");
    const authUser = await requireApiUser();
    mark("requireApiUser");
    const input = await readJson(request, bidSchema);
    mark("readJson");
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc("place_auction_bid", {
      p_room_code: code,
      p_user_id: authUser.id,
      p_team_id: input.teamId,
      p_increment: input.increment ?? null,
    });
    mark("placeAuctionBidRpc");

    if (error) {
      const isMissingRpc =
        error.message?.includes("Could not find the function public.place_auction_bid") ||
        error.message?.includes("schema cache");

      if (!isMissingRpc) {
        // Map RPC raise-exception messages to safe-passthrough codes so the
        // UI shows the actual reason (e.g. "Highest bidder cannot bid again
        // immediately") instead of the generic "Something went wrong."
        const msg = error.message || "Bid failed.";
        const code = mapRpcErrorToCode(msg);
        throw new AppError(msg, 400, code);
      }

      const result = await placeBidWithoutRpc({
        admin,
        authUserId: authUser.id,
        code,
        increment: input.increment,
        mark,
        teamId: input.teamId,
      });

      const timing = {
        totalMs: Date.now() - startedAt,
        steps: marks,
      };
      console.info("[auction-bid-timing]", JSON.stringify({ roomCode: code.toUpperCase(), timing }));
      recordBidTiming({ totalMs: timing.totalMs, steps: timing.steps, roomCode: code.toUpperCase(), outcome: "ok" });
      return NextResponse.json(
        {
          amount: result.amount,
          expiresAt: result.expiresAt,
          timerSeconds: result.timerSeconds,
          timing,
          version: result.version,
        },
        {
          headers: {
            "x-auction-bid-ms": String(timing.totalMs),
          },
        },
      );
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result) {
      throw new AppError("Bid failed.", 500, "BID_RPC_EMPTY");
    }
    const { data: roomRow } = await admin
      .from("rooms")
      .select("id, timer_seconds")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    mark("roomForCache");
    const roomId = String(roomRow?.id ?? "");
    const timerSeconds = Number(roomRow?.timer_seconds ?? 0) || undefined;
    if (roomId) {
      await clearAuctionLiveSnapshot(roomId);
      mark("auctionLiveCacheClear");
    }

    const timing = {
      totalMs: Date.now() - startedAt,
      steps: marks,
    };
    console.info("[auction-bid-timing]", JSON.stringify({ roomCode: code.toUpperCase(), timing }));
    recordBidTiming({ totalMs: timing.totalMs, steps: timing.steps, roomCode: code.toUpperCase(), outcome: "ok" });
    return NextResponse.json(
      {
        amount: Number(result.amount),
        expiresAt: result.expires_at ? String(result.expires_at) : null,
        timerSeconds,
        timing,
        version: Number(result.version),
      },
      {
        headers: {
          "x-auction-bid-ms": String(timing.totalMs),
        },
      },
    );
  } catch (error) {
    console.error("[auction-bid-error-timing]", JSON.stringify({
      totalMs: Date.now() - startedAt,
      steps: marks,
      message: error instanceof Error ? error.message : String(error),
    }));
    recordBidTiming({ totalMs: Date.now() - startedAt, steps: marks, roomCode: "(unknown)", outcome: "error" });
    return handleRouteError(error);
  }
}

async function placeBidWithoutRpc({
  admin,
  authUserId,
  code,
  increment,
  mark,
  teamId,
}: {
  admin: ReturnType<typeof getSupabaseAdminClient>;
  authUserId: string;
  code: string;
  increment?: number;
  mark: (step: string) => void;
  teamId: string;
}) {
  const { room, member } = await requireRoomMember(code, authUserId);
  mark("requireRoomMember");

  const [{ data: auctionRow }, { data: teamRow }, { count: teamSquadCount }] = await Promise.all([
    admin.from("auction_state").select("*").eq("room_id", room.id).maybeSingle(),
    admin.from("teams").select("*").eq("id", teamId).maybeSingle(),
    admin
      .from("squad")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("team_id", teamId),
  ]);
  mark("initialQueries");

  if (!auctionRow) {
    throw new AppError("Auction has not started yet.", 400, "NO_AUCTION_STATE");
  }

  const auctionState = mapAuctionState(auctionRow as Record<string, unknown>);

  const { data: playerRow } = await admin
    .from("players")
    .select("*")
    .eq("id", auctionState.currentPlayerId ?? "")
    .maybeSingle();
  mark("playerQuery");

  const currentPlayer = playerRow ? mapPlayer(playerRow as Record<string, unknown>) : null;
  const team = teamRow ? mapTeam(teamRow as Record<string, unknown>) : null;

  if (!currentPlayer) {
    throw new AppError("No active player is available for bidding.", 400, "NO_PLAYER");
  }

  if (!team) {
    throw new AppError("Team was not found.", 404, "TEAM_NOT_FOUND");
  }

  if (team.ownerUserId && !member.isAdmin && team.ownerUserId !== authUserId) {
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
    teamSquadCount: teamSquadCount ?? 0,
    now: new Date(),
    increment,
  });

  const nextBidAmount = getNextBidAmount(currentPlayer, auctionState, increment);

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
  mark("auctionStateUpdate");

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
    created_by: authUserId,
  });
  mark("bidInsert");

  if (bidError) {
    throw new AppError(bidError.message, 500, "BID_LOG_FAILED");
  }

  await clearAuctionLiveSnapshot(room.id);
  mark("auctionLiveCacheClear");

  return {
    amount: nextBidAmount,
    expiresAt: nextExpiresAt,
    timerSeconds: room.timerSeconds,
    version: Number(updatedState.version),
  };
}
