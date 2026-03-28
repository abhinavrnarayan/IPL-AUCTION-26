import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { requireRoomMember } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ code: string; entryId: string }> },
) {
  try {
    const { code, entryId } = await context.params;
    const authUser = await requireApiUser();
    const { room, member } = await requireRoomMember(code, authUser.id);
    const admin = getSupabaseAdminClient();

    // Fetch the squad entry
    const { data: entry, error: fetchError } = await admin
      .from("squad")
      .select("id, team_id, player_id, purchase_price")
      .eq("id", entryId)
      .eq("room_id", room.id)
      .maybeSingle();

    if (fetchError) throw new AppError(fetchError.message, 500, "SQUAD_FETCH_FAILED");
    if (!entry) throw new AppError("Squad entry not found.", 404, "NOT_FOUND");

    // Only admin or the team owner can release
    if (!member.isAdmin) {
      const { data: teamRow } = await admin
        .from("teams")
        .select("owner_user_id")
        .eq("id", entry.team_id)
        .maybeSingle();

      if (!teamRow || (teamRow.owner_user_id as string | null) !== authUser.id) {
        throw new AppError("Only the team owner or admin can release a player.", 403, "FORBIDDEN");
      }
    }

    const purchasePrice = Number(entry.purchase_price);

    // Remove from squad
    const { error: deleteError } = await admin
      .from("squad")
      .delete()
      .eq("id", entryId)
      .eq("room_id", room.id);

    if (deleteError) throw new AppError(deleteError.message, 500, "SQUAD_DELETE_FAILED");

    // Restore purse
    const { data: teamRow } = await admin
      .from("teams")
      .select("purse_remaining")
      .eq("id", entry.team_id)
      .maybeSingle();

    if (teamRow) {
      await admin
        .from("teams")
        .update({ purse_remaining: Number(teamRow.purse_remaining) + purchasePrice })
        .eq("id", entry.team_id);
    }

    // Reset player to AVAILABLE
    await admin
      .from("players")
      .update({ status: "AVAILABLE", current_team_id: null, sold_price: null })
      .eq("id", entry.player_id)
      .eq("room_id", room.id);

    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
