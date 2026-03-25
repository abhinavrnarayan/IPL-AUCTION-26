import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError } from "@/lib/domain/errors";
import { teamPurseSchema, teamRenameSchema } from "@/lib/domain/schemas";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { getAuctionStateOnly, getRoomEntities, requireRoomMember } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const teamUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    purseRemaining: z.coerce.number().int().nonnegative().max(5_000_000_000).optional(),
  })
  .refine((value) => value.name !== undefined || value.purseRemaining !== undefined, {
    message: "Provide a team name or purse value to update.",
  });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ code: string; teamId: string }> },
) {
  try {
    const { code, teamId } = await context.params;
    const authUser = await requireApiUser();
    const { room, member } = await requireRoomMember(code, authUser.id);
    const rawBody = await request.json();
    const input = teamUpdateSchema.parse(rawBody);
    const admin = getSupabaseAdminClient();

    const auctionState = await getAuctionStateOnly(room.id);

    // Block rename during live auction
    if (auctionState && auctionState.phase === "LIVE") {
      throw new AppError(
        "Team names cannot be changed while the auction is live. Pause first.",
        400,
        "AUCTION_LIVE",
      );
    }

    const { teams } = await getRoomEntities(room.id);
    const team = teams.find((t) => t.id === teamId);

    if (!team) {
      throw new AppError("Team not found.", 404, "TEAM_NOT_FOUND");
    }

    // Only the team owner or admin can rename
    if (!member.isAdmin && team.ownerUserId !== authUser.id) {
      throw new AppError("You can only rename your own team.", 403, "TEAM_ACCESS_DENIED");
    }

    if (input.purseRemaining !== undefined && !member.isAdmin) {
      throw new AppError("Only admins can manually change team purse values.", 403, "TEAM_ACCESS_DENIED");
    }

    const updates: Record<string, unknown> = {};

    if (input.name !== undefined) {
      const parsedName = teamRenameSchema.parse({ name: input.name });
      updates.name = parsedName.name;
    }

    if (input.purseRemaining !== undefined) {
      const parsedPurse = teamPurseSchema.parse({ purseRemaining: input.purseRemaining });
      updates.purse_remaining = parsedPurse.purseRemaining;
    }

    const { error } = await admin
      .from("teams")
      .update(updates)
      .eq("id", teamId)
      .eq("room_id", room.id);

    if (error) {
      throw new AppError(error.message, 500, "TEAM_UPDATE_FAILED");
    }

    revalidatePath(`/auction/${room.code}`);
    revalidatePath(`/room/${room.code}`);

    return NextResponse.json({
      name: updates.name ?? team.name,
      purseRemaining: updates.purse_remaining ?? team.purseRemaining,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
