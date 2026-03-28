import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { tradeSchema } from "@/lib/domain/schemas";
import { readJson, handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { getRoomEntities, requireRoomMember } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateTrade } from "@/lib/domain/trade";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room, member } = await requireRoomMember(code, authUser.id);
    const input = await readJson(request, tradeSchema);
    const admin = getSupabaseAdminClient();
    const { teams, squads } = await getRoomEntities(room.id);

    // Validate trade structure (purse + squad limits)
    // Zod .default() guarantees arrays/numbers are present; cast to satisfy TradeRequest
    validateTrade({ trade: input as import("@/lib/domain/types").TradeRequest, teams, squad: squads });

    // Non-admin can only propose on behalf of their own team
    if (!member.isAdmin) {
      const { data: teamRow } = await admin
        .from("teams")
        .select("owner_user_id")
        .eq("id", input.teamAId)
        .eq("room_id", room.id)
        .maybeSingle();

      if (!teamRow || (teamRow.owner_user_id as string | null) !== authUser.id) {
        throw new AppError(
          "You can only propose trades on behalf of your own team.",
          403,
          "FORBIDDEN",
        );
      }
    }

    const { error: tradeError } = await admin.from("trades").insert({
      room_id: room.id,
      team_a_id: input.teamAId,
      team_b_id: input.teamBId,
      players_from_a: input.playersFromA,
      players_from_b: input.playersFromB,
      cash_from_a: input.cashFromA,
      cash_from_b: input.cashFromB,
      status: "PENDING",
      initiated_by: authUser.id,
      approved_by: null,
      executed_at: null,
    });

    if (tradeError) {
      throw new AppError(tradeError.message, 500, "TRADE_CREATE_FAILED");
    }

    revalidatePath(`/auction/${room.code}`);

    return NextResponse.json({ proposed: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
