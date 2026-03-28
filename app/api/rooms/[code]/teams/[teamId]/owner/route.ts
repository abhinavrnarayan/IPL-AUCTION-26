import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { teamOwnerSchema } from "@/lib/domain/schemas";
import { readJson, handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { getAuctionStateOnly, requireRoomAdmin } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ code: string; teamId: string }> },
) {
  try {
    const { code, teamId } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);
    const input = await readJson(request, teamOwnerSchema);
    const admin = getSupabaseAdminClient();

    const auctionState = await getAuctionStateOnly(room.id);
    if (auctionState && auctionState.phase === "LIVE") {
      throw new AppError(
        "Team ownership cannot be changed while the auction is live. Pause first.",
        400,
        "AUCTION_LIVE",
      );
    }

    const { data: teamRow, error: teamError } = await admin
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("room_id", room.id)
      .maybeSingle();

    if (teamError) {
      throw new AppError(teamError.message, 500, "TEAM_FETCH_FAILED");
    }

    if (!teamRow) {
      throw new AppError("Team not found.", 404, "TEAM_NOT_FOUND");
    }

    if (input.ownerUserId) {
      const { data: memberRow, error: memberError } = await admin
        .from("room_members")
        .select("user_id")
        .eq("room_id", room.id)
        .eq("user_id", input.ownerUserId)
        .maybeSingle();

      if (memberError) {
        throw new AppError(memberError.message, 500, "MEMBER_FETCH_FAILED");
      }

      if (!memberRow) {
        throw new AppError(
          "Selected user must join the room before being assigned to a team.",
          400,
          "MEMBER_REQUIRED",
        );
      }
    }

    if (input.ownerUserId) {
      const { error: clearError } = await admin
        .from("teams")
        .update({ owner_user_id: null })
        .eq("room_id", room.id)
        .eq("owner_user_id", input.ownerUserId);

      if (clearError) {
        throw new AppError(clearError.message, 500, "TEAM_OWNER_CLEAR_FAILED");
      }
    }

    const { error: updateError } = await admin
      .from("teams")
      .update({ owner_user_id: input.ownerUserId })
      .eq("id", teamId)
      .eq("room_id", room.id);

    if (updateError) {
      throw new AppError(updateError.message, 500, "TEAM_OWNER_UPDATE_FAILED");
    }

    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json({ ownerUserId: input.ownerUserId });
  } catch (error) {
    return handleRouteError(error);
  }
}
