import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { processZip, type CricsheetAccumulator } from "@/lib/server/cricsheet";
import { requireRoomAdmin } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ── Name normalisation for matching ──────────────────────────────────────────

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, "") // remove dots (M.S. → MS)
    .replace(/\s+/g, " ")
    .trim();
}

/** Return the Cricsheet accumulator that best matches a DB player name. */
function findMatch(
  dbName: string,
  normalised: Map<string, string>, // normalised → original cricsheet name
  stats: Map<string, CricsheetAccumulator>,
): CricsheetAccumulator | null {
  const key = normaliseName(dbName);

  // 1 – exact normalised match
  const exact = normalised.get(key);
  if (exact) return stats.get(exact) ?? null;

  // 2 – last-word (surname) match, but only if unambiguous
  const surname = key.split(" ").pop() ?? "";
  if (surname.length >= 3) {
    const hits = Array.from(normalised.entries()).filter(([k]) =>
      k.split(" ").pop() === surname,
    );
    if (hits.length === 1) return stats.get(hits[0]![1]) ?? null;
  }

  return null;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);
    const admin = getSupabaseAdminClient();

    // ── Get ZIP buffer ────────────────────────────────────────────────────────
    let zipBuffer: Buffer;
    let season: string;

    const ct = request.headers.get("content-type") ?? "";

    if (ct.includes("multipart/form-data")) {
      // Admin uploaded the ZIP manually
      const form = await request.formData();
      const file = form.get("file") as File | null;
      season = String(form.get("season") || "2026");
      if (!file) throw new AppError("No file uploaded.", 400, "NO_FILE");
      zipBuffer = Buffer.from(await file.arrayBuffer());
    } else {
      // Fetch directly from Cricsheet
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      season = String(body.season ?? "2026");

      // Try season-specific download first (smaller), fall back to full archive
      const urls = [
        `https://cricsheet.org/downloads/ipl_${season}_json.zip`,
        "https://cricsheet.org/downloads/ipl_json.zip",
      ];

      let fetchRes: Response | null = null;
      for (const url of urls) {
        const res = await fetch(url, {
          headers: { "User-Agent": "IPL-Auction-Platform/1.0 (fantasy-scoring)" },
          signal: AbortSignal.timeout(90_000), // 90 s max
        });
        if (res.ok) { fetchRes = res; break; }
      }

      if (!fetchRes) {
        throw new AppError(
          "Could not fetch IPL data from Cricsheet. Try uploading the ZIP manually.",
          502,
          "CRICSHEET_FETCH_FAILED",
        );
      }

      zipBuffer = Buffer.from(await fetchRes.arrayBuffer());
    }

    // ── Parse ZIP ─────────────────────────────────────────────────────────────
    const { stats: cricsheetStats, matchesProcessed, matchesSkipped, seasons } =
      processZip(zipBuffer, season);

    if (matchesProcessed === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `No IPL matches found for season ${season}. Available seasons in file: ${seasons.join(", ") || "none"}.`,
          matchesProcessed,
          matchesSkipped,
          seasons,
        },
        { status: 404 },
      );
    }

    // ── Build normalised lookup ───────────────────────────────────────────────
    const normalisedToOriginal = new Map<string, string>();
    for (const name of cricsheetStats.keys()) {
      normalisedToOriginal.set(normaliseName(name), name);
    }

    // ── Fetch room players ────────────────────────────────────────────────────
    const { data: players, error: playersErr } = await admin
      .from("players")
      .select("id, name, stats")
      .eq("room_id", room.id);

    if (playersErr) throw new AppError(playersErr.message, 500, "DB_QUERY_FAILED");

    // ── Match & update ────────────────────────────────────────────────────────
    let matched = 0;
    const unmatchedNames: string[] = [];

    for (const player of players ?? []) {
      const playerName = String(player.name);
      const cs = findMatch(playerName, normalisedToOriginal, cricsheetStats);

      if (!cs) {
        unmatchedNames.push(playerName);
        continue;
      }

      // Preserve existing metadata (ipl_team, etc.) and overlay Cricsheet stats
      const existingStats = (player.stats ?? {}) as Record<string, unknown>;
      const newStats: Record<string, unknown> = {
        ...existingStats,
        // Spread all Cricsheet fields
        runs: cs.runs,
        balls_faced: cs.balls_faced,
        fours: cs.fours,
        sixes: cs.sixes,
        ducks: cs.ducks,
        wickets: cs.wickets,
        balls_bowled: cs.balls_bowled,
        runs_conceded: cs.runs_conceded,
        dot_balls: cs.dot_balls,
        maiden_overs: cs.maiden_overs,
        lbw_bowled_wickets: cs.lbw_bowled_wickets,
        catches: cs.catches,
        stumpings: cs.stumpings,
        run_outs_direct: cs.run_outs_direct,
        run_outs_indirect: cs.run_outs_indirect,
        milestone_runs_pts: cs.milestone_runs_pts,
        milestone_wkts_pts: cs.milestone_wkts_pts,
        sr_pts: cs.sr_pts,
        economy_pts: cs.economy_pts,
        catch_bonus_pts: cs.catch_bonus_pts,
        lineup_appearances: cs.lineup_appearances,
        substitute_appearances: cs.substitute_appearances,
        matches_played: cs.matches_played,
        cricsheet_name: cs.cricsheet_name ?? normalisedToOriginal.get(normaliseName(playerName)),
      };

      await admin
        .from("players")
        .update({ stats: newStats })
        .eq("id", player.id as string);

      matched += 1;
    }

    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json({
      ok: true,
      season,
      seasons,
      matchesProcessed,
      matchesSkipped,
      playersMatched: matched,
      playersUnmatched: unmatchedNames.length,
      unmatchedNames: unmatchedNames.slice(0, 30),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
