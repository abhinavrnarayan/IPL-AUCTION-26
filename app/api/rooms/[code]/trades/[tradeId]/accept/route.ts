import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { getRoomEntities, requireRoomMember } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateTrade } from "@/lib/domain/trade";
import type { TradeRequest } from "@/lib/domain/types";

export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string; tradeId: string }> },
) {
  try {
    const { code, tradeId } = await context.params;
    const authUser = await requireApiUser();
    const { room, member } = await requireRoomMember(code, authUser.id);
    const admin = getSupabaseAdminClient();

    // Fetch the trade
    const { data: tradeRow, error: fetchError } = await admin
      .from("trades")
      .select("*")
      .eq("id", tradeId)
      .eq("room_id", room.id)
      .maybeSingle();

    if (fetchError) throw new AppError(fetchError.message, 500, "TRADE_FETCH_FAILED");
    if (!tradeRow) throw new AppError("Trade not found.", 404, "NOT_FOUND");
    if (tradeRow.status !== "PENDING") {
      throw new AppError("Trade is no longer pending.", 400, "INVALID_STATUS");
    }

    const teamBId = tradeRow.team_b_id as string;
    const teamAId = tradeRow.team_a_id as string;

    // Only team B owner or admin can accept
    if (!member.isAdmin) {
      const { data: teamBRow } = await admin
        .from("teams")
        .select("owner_user_id")
        .eq("id", teamBId)
        .maybeSingle();

      if (!teamBRow || (teamBRow.owner_user_id as string | null) !== authUser.id) {
        throw new AppError("Only team B's owner or an admin can accept this trade.", 403, "FORBIDDEN");
      }
    }

    const { teams, squads } = await getRoomEntities(room.id);

    const input: TradeRequest = {
      teamAId,
      teamBId,
      playersFromA: (tradeRow.players_from_a as string[] | null) ?? [],
      playersFromB: (tradeRow.players_from_b as string[] | null) ?? [],
      cashFromA: Number(tradeRow.cash_from_a),
      cashFromB: Number(tradeRow.cash_from_b),
    };

    const validation = validateTrade({ trade: input, teams, squad: squads });

    // Execute player moves
    if (input.playersFromA.length > 0) {
      await admin.from("squad").update({ team_id: teamBId }).in("player_id", input.playersFromA).eq("room_id", room.id).eq("team_id", teamAId);
      await admin.from("players").update({ current_team_id: teamBId }).in("id", input.playersFromA).eq("room_id", room.id);
    }

    if (input.playersFromB.length > 0) {
      await admin.from("squad").update({ team_id: teamAId }).in("player_id", input.playersFromB).eq("room_id", room.id).eq("team_id", teamBId);
      await admin.from("players").update({ current_team_id: teamAId }).in("id", input.playersFromB).eq("room_id", room.id);
    }

    await admin.from("teams").update({ purse_remaining: validation.nextTeamAPurse }).eq("id", teamAId);
    await admin.from("teams").update({ purse_remaining: validation.nextTeamBPurse }).eq("id", teamBId);

    // Mark trade as executed
    await admin
      .from("trades")
      .update({ status: "EXECUTED", approved_by: authUser.id, executed_at: new Date().toISOString() })
      .eq("id", tradeId);

    revalidatePath(`/auction/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json({ executed: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
