import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AppError } from "@/lib/domain/errors";
import { readJson, handleRouteError } from "@/lib/server/api";
import { requireApiUser, syncUserProfileFromAuthUser } from "@/lib/server/auth";
import { getRoomEntities, requireRoomMember } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const createSelfTeamSchema = z.object({
  name: z.string().trim().min(2).max(60),
  shortCode: z.string().trim().min(2).max(6).transform(v => v.toUpperCase()),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    await syncUserProfileFromAuthUser(authUser);
    
    // Require member access, but not admin
    const { room } = await requireRoomMember(code, authUser.id);
    const input = await readJson(request, createSelfTeamSchema);
    const admin = getSupabaseAdminClient();
    
    const { auctionState, teams: existingTeams } = await getRoomEntities(room.id);

    if (auctionState && auctionState.phase !== "WAITING") {
      throw new AppError(
        "Team creation is locked once the auction config is completed.",
        400,
        "AUCTION_ALREADY_STARTED",
      );
    }

    const currentOwnedTeam = existingTeams.find(t => t.ownerUserId === authUser.id);
    if (currentOwnedTeam) {
      throw new AppError(
        "You already control a team in this room.",
        400,
        "ALREADY_HAS_TEAM",
      );
    }
    
    // Ensure uniqueness of short code and name
    if (existingTeams.some(t => t.shortCode === input.shortCode)) {
       throw new AppError("That short code is already taken. Choose another.", 400, "SHORT_CODE_TAKEN");
    }
    
    if (existingTeams.some(t => t.name.toLowerCase() === input.name.toLowerCase())) {
       throw new AppError("That team name is already taken.", 400, "NAME_TAKEN");
    }

    const { error } = await admin.from("teams").insert({
      room_id: room.id,
      name: input.name,
      short_code: input.shortCode,
      purse_remaining: room.purse,
      squad_limit: room.squadSize,
      owner_user_id: authUser.id,
    });

    if (error) {
      throw new AppError(error.message, 500, "TEAM_CREATION_FAILED");
    }

    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
