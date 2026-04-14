/**
 * POST /api/rooms/[code]/webscrape-accept
 *
 * Super-room admin only. Accepts a single match-source pair in this room's
 * match_results, clears any previously accepted sources that belong to the
 * same comparison group, then triggers a full recalculation of player stats
 * from all accepted matches.
 *
 * Body:
 * {
 *   season: string,
 *   accepts?: [{ matchId: string, source: string, groupMatchIds?: string[] }],
 *   unaccepts?: [{ matchId: string, source?: string }]
 * }
 */

import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { requireRoomAdmin } from "@/lib/server/room";
import { recalculateRoomStats } from "@/lib/server/score-push";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);
    const admin = getSupabaseAdminClient();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const accepts = Array.isArray(body.accepts)
      ? body.accepts as Array<{ matchId: string; source: string; groupMatchIds?: string[] }>
      : [];
    const unaccepts = Array.isArray(body.unaccepts)
      ? body.unaccepts as Array<{ matchId: string; source?: string }>
      : [];
    if (accepts.length === 0 && unaccepts.length === 0) throw new AppError("accepts or unaccepts array is required.", 400, "NO_DATA");

    for (const { matchId, source, groupMatchIds } of accepts) {
      if (!matchId || !source) continue;

      const comparisonMatchIds = Array.from(
        new Set(
          (groupMatchIds ?? [])
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      );
      if (!comparisonMatchIds.includes(matchId)) comparisonMatchIds.push(matchId);

      const { data: targetRow, error: targetError } = await admin
        .from("match_results")
        .select("id, match_date")
        .eq("room_id", room.id)
        .eq("match_id", matchId)
        .eq("source", source)
        .maybeSingle();

      if (targetError) throw new AppError(targetError.message, 500, "DB_QUERY_FAILED");
      if (!targetRow) {
        throw new AppError("Selected source could not be found for this room.", 404, "MATCH_NOT_FOUND");
      }

      // 1. Clear all rows in the explicit comparison group (same physical match, different provider IDs)
      const { error: clearError } = await admin
        .from("match_results")
        .update({ accepted: false, accepted_at: null })
        .eq("room_id", room.id)
        .in("match_id", comparisonMatchIds);

      if (clearError) throw new AppError(clearError.message, 500, "DB_QUERY_FAILED");

      // 2. Accept the chosen source after clearing the rest of the explicit comparison group.
      const { error: acceptError } = await admin
        .from("match_results")
        .update({ accepted: true, accepted_at: new Date().toISOString() })
        .eq("room_id", room.id)
        .eq("match_id", matchId)
        .eq("source", source);

      if (acceptError) throw new AppError(acceptError.message, 500, "DB_QUERY_FAILED");
    }

    // Unaccept either a specific source row or, for backwards compatibility, all
    // rows that share the supplied matchId.
    for (const { matchId, source } of unaccepts) {
      if (!matchId) continue;

      const query = admin
        .from("match_results")
        .update({ accepted: false, accepted_at: null })
        .eq("room_id", room.id)
        .eq("match_id", matchId);

      const { error: unacceptError } = source
        ? await query.eq("source", source)
        : await query;
      if (unacceptError) throw new AppError(unacceptError.message, 500, "DB_QUERY_FAILED");
    }

    const { playersUpdated } = await recalculateRoomStats(room.id, room.code);

    return NextResponse.json({ ok: true, playersUpdated });
  } catch (error) {
    return handleRouteError(error);
  }
}
