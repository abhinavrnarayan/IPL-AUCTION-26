import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { requireRoomAdmin } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function buildResetStatsPayload(existing: Record<string, unknown>) {
  return {
    ...existing,
    runs: 0,
    balls_faced: 0,
    fours: 0,
    sixes: 0,
    ducks: 0,
    wickets: 0,
    balls_bowled: 0,
    runs_conceded: 0,
    dot_balls: 0,
    dot_ball_pts: 0,
    maiden_overs: 0,
    lbw_bowled_wickets: 0,
    catches: 0,
    stumpings: 0,
    run_outs_direct: 0,
    run_outs_indirect: 0,
    milestone_runs_pts: 0,
    milestone_wkts_pts: 0,
    sr_pts: 0,
    economy_pts: 0,
    catch_bonus_pts: 0,
    lineup_appearances: 0,
    substitute_appearances: 0,
    matches_played: 0,
  };
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);
    const admin = getSupabaseAdminClient();

    const { data: players, error: fetchError } = await admin
      .from("players")
      .select("id, stats")
      .eq("room_id", room.id);

    if (fetchError) {
      throw new AppError(fetchError.message, 500, "PLAYER_FETCH_FAILED");
    }

    for (const player of players ?? []) {
      const existing = ((player.stats ?? {}) as Record<string, unknown>) ?? {};
      const { error: updateError } = await admin
        .from("players")
        .update({ stats: buildResetStatsPayload(existing) })
        .eq("id", String(player.id));

      if (updateError) {
        throw new AppError(updateError.message, 500, "POINT_RESET_FAILED");
      }
    }

    const { error: syncResetError, count: syncRowsCleared } = await admin
      .from("match_results")
      .delete({ count: "exact" })
      .eq("room_id", room.id);

    if (syncResetError) {
      throw new AppError(syncResetError.message, 500, "MATCH_RESULTS_RESET_FAILED");
    }

    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json({
      ok: true,
      playersReset: (players ?? []).length,
      syncRowsCleared: syncRowsCleared ?? 0,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
