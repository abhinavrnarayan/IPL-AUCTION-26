import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser, syncUserProfileFromAuthUser } from "@/lib/server/auth";
import { getRoomEntities, requireRoomAdmin } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const DEFAULT_IPL_TEAMS = [
  { name: "Mumbai Indians", shortCode: "MI" },
  { name: "Chennai Super Kings", shortCode: "CSK" },
  { name: "Royal Challengers Bengaluru", shortCode: "RCB" },
  { name: "Kolkata Knight Riders", shortCode: "KKR" },
  { name: "Delhi Capitals", shortCode: "DC" },
  { name: "Punjab Kings", shortCode: "PBKS" },
  { name: "Rajasthan Royals", shortCode: "RR" },
  { name: "Sunrisers Hyderabad", shortCode: "SRH" },
  { name: "Lucknow Super Giants", shortCode: "LSG" },
  { name: "Gujarat Titans", shortCode: "GT" },
];

export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    await syncUserProfileFromAuthUser(authUser);
    const { room } = await requireRoomAdmin(code, authUser.id);
    const admin = getSupabaseAdminClient();
    const { auctionState, teams: existingTeams } = await getRoomEntities(room.id);

    if (auctionState && auctionState.phase !== "WAITING") {
      throw new AppError(
        "Team uploads are locked once the auction has started.",
        400,
        "AUCTION_ALREADY_STARTED",
      );
    }

    if (existingTeams.length > 0) {
      throw new AppError(
        "Teams already exist in this room. Clear them before loading defaults.",
        400,
        "TEAMS_ALREADY_EXIST",
      );
    }

    const rows = DEFAULT_IPL_TEAMS.map((team) => ({
      room_id: room.id,
      name: team.name,
      short_code: team.shortCode,
      purse_remaining: room.purse,
      squad_limit: room.squadSize,
      owner_user_id: null,
    }));

    const { error } = await admin.from("teams").insert(rows);

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
