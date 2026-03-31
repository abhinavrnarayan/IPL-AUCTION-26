import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import * as fs from "fs";
import * as path from "path";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { requireRoomAdmin } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);
    const admin = getSupabaseAdminClient();

    // 1. Create standard 10 teams
    const defaultTeams = [
      { name: "Chennai Super Kings", shortCode: "CSK" },
      { name: "Mumbai Indians", shortCode: "MI" },
      { name: "Royal Challengers Bengaluru", shortCode: "RCB" },
      { name: "Kolkata Knight Riders", shortCode: "KKR" },
      { name: "Sunrisers Hyderabad", shortCode: "SRH" },
      { name: "Rajasthan Royals", shortCode: "RR" },
      { name: "Gujarat Titans", shortCode: "GT" },
      { name: "Lucknow Super Giants", shortCode: "LSG" },
      { name: "Delhi Capitals", shortCode: "DC" },
      { name: "Punjab Kings", shortCode: "PBKS" },
    ];

    const teamRows = defaultTeams.map((t) => ({
      room_id: room.id,
      name: t.name,
      short_code: t.shortCode,
      purse_remaining: room.purse,
      squad_limit: room.squadSize,
    }));

    const { error: teamError } = await admin.from("teams").upsert(teamRows, {
      onConflict: "room_id,name",
    });
    if (teamError) throw new AppError(teamError.message, 500);

    // 2. Read players from file
    const filePath = path.join(process.cwd(), "data", "default-player-pool.json");
    if (!fs.existsSync(filePath)) {
       throw new AppError("Default player pool JSON file is missing from data directory.", 404);
    }

    const rawData = fs.readFileSync(filePath, "utf-8");
    const parsedPlayers = JSON.parse(rawData) as any[];

    // 3. Insert players
    const playerRows = parsedPlayers.map((p, i) => ({
      room_id: room.id,
      name: p.name,
      role: p.role ?? "UNKNOWN",
      base_price: p.basePrice ?? 50,
      status: "AVAILABLE",
      source_index: p.sourceIndex ?? i + 1,
      nationality: p.nationality ?? "Indian",
      stats: { iplTeam: p.iplTeam },
    }));

    // Chunk the upsert to avoid huge network payload boundaries
    const CHUNK_SIZE = 100;
    for (let i = 0; i < playerRows.length; i += CHUNK_SIZE) {
      const chunk = playerRows.slice(i, i + CHUNK_SIZE);
      const { error: playerError } = await admin.from("players").upsert(chunk, {
        onConflict: "room_id,name",
      });
      if (playerError) throw new AppError(playerError.message, 500);
    }

    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);

    return NextResponse.json({ ok: true, teamsImported: teamRows.length, playersImported: playerRows.length });
  } catch (error) {
    return handleRouteError(error);
  }
}
