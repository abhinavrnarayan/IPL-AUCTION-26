import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { teamUploadSchema } from "@/lib/domain/schemas";

import { readJson, handleRouteError } from "@/lib/server/api";
import { requireApiUser, syncUserProfileFromAuthUser } from "@/lib/server/auth";
import { getRoomEntities, requireRoomAdmin } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    await syncUserProfileFromAuthUser(authUser);
    const { room } = await requireRoomAdmin(code, authUser.id);
    const input = await readJson(request, teamUploadSchema);
    const admin = getSupabaseAdminClient();
    const { auctionState, teams: existingTeams } = await getRoomEntities(room.id);

    if (auctionState && auctionState.phase !== "WAITING") {
      throw new AppError(
        "Team uploads are locked once the auction has started.",
        400,
        "AUCTION_ALREADY_STARTED",
      );
    }
    
    // Track short_codes locally to ensure uniqueness within the upload payload
    const seenShortCodes = new Set<string>();
    existingTeams.forEach(t => seenShortCodes.add(t.shortCode));

    const rows = input.teams.map((inputTeam) => {
      const name = inputTeam.name.trim();
      const existing = existingTeams.find(t => t.name.toLowerCase() === name.toLowerCase());

      let baseShortCode: string;
      if (inputTeam.shortCode) {
        baseShortCode = inputTeam.shortCode.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
      } else if (existing) {
        baseShortCode = existing.shortCode;
      } else {
        baseShortCode = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();
      }

      let finalShortCode = baseShortCode;
      let counter = 1;

      // If existing team keeps its short code, it's already in the set, but allowed
      const isKeepingExisting = existing && finalShortCode === existing.shortCode;

      if (!isKeepingExisting) {
        while (seenShortCodes.has(finalShortCode)) {
          const suffix = String(counter);
          finalShortCode = baseShortCode.slice(0, 6 - suffix.length) + suffix;
          counter++;
        }
        seenShortCodes.add(finalShortCode);
      }

      return {
        room_id: room.id,
        name: name,
        short_code: finalShortCode,
        purse_remaining: room.purse,
        squad_limit: room.squadSize,
        owner_user_id: inputTeam.ownerUserId ?? existing?.ownerUserId ?? null,
      };
    });

    const { error } = await admin.from("teams").upsert(rows, {
      onConflict: "room_id,name",
    });

    if (error) {
      throw new AppError(error.message, 500, "TEAM_IMPORT_FAILED");
    }

    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json({ imported: rows.length });
  } catch (error) {
    return handleRouteError(error);
  }
}
