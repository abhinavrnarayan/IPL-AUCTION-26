import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { requireRoomMember } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string; tradeId: string }> },
) {
  try {
    const { code, tradeId } = await context.params;
    const authUser = await requireApiUser();
    const { room, member } = await requireRoomMember(code, authUser.id);
    const admin = getSupabaseAdminClient();

    const { data: tradeRow, error: fetchError } = await admin
      .from("trades")
      .select("status, team_b_id, team_a_id")
      .eq("id", tradeId)
      .eq("room_id", room.id)
      .maybeSingle();

    if (fetchError) throw new AppError(fetchError.message, 500, "TRADE_FETCH_FAILED");
    if (!tradeRow) throw new AppError("Trade not found.", 404, "NOT_FOUND");
    if (tradeRow.status !== "PENDING") {
      throw new AppError("Trade is no longer pending.", 400, "INVALID_STATUS");
    }

    // Team B or proposer (team A) or admin can reject
    if (!member.isAdmin) {
      const teamIds = [tradeRow.team_b_id as string, tradeRow.team_a_id as string];
      const { data: teamRows } = await admin
        .from("teams")
        .select("owner_user_id")
        .in("id", teamIds);

      const ownerUserIds = (teamRows ?? []).map((r) => r.owner_user_id as string | null);
      if (!ownerUserIds.includes(authUser.id)) {
        throw new AppError("Only a party to this trade or an admin can reject it.", 403, "FORBIDDEN");
      }
    }

    await admin
      .from("trades")
      .update({ status: "REJECTED" })
      .eq("id", tradeId);

    revalidatePath(`/auction/${room.code}`);

    return NextResponse.json({ rejected: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
