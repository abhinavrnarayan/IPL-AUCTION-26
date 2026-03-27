/**
 * POST /api/rooms/[code]/webscrape-accept
 *
 * Accepts one or more match-source pairs, updates the accepted flag in
 * match_results, then re-aggregates ALL accepted rows for the season and
 * writes the result into players.stats.
 *
 * Body: {
 *   season: string,
 *   accepts: Array<{ matchId: string, source: string }>
 * }
 *
 * Optional manual overrides (PATCH-style): send `overrides` to patch a
 * specific match row's player_stats before the aggregation:
 * {
 *   season: string,
 *   overrides: Array<{ matchId: string, source: string, playerStats: Record<string, PlayerMatchStats> }>
 * }
 */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { requireRoomAdmin } from "@/lib/server/room";
import type { PlayerMatchStats } from "@/lib/server/webscrape/parser";
import type { PlayerStats } from "@/lib/domain/scoring";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ── Name normalisation (same logic as cricsheet-sync) ─────────────────────────

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Aggregate PlayerMatchStats from all accepted rows into PlayerStats ─────────
//
// PlayerMatchStats (per-match from webscrape parser) → PlayerStats (season totals)
//
// Mapping notes:
//  dismissed + runs===0  →  ducks++
//  run_outs              →  run_outs_indirect (API scorecards don't distinguish)
//  appeared              →  lineup_appearances++
//  All *_pts fields are summed directly (they are already per-match correct)

function aggregateToPlayerStats(
  allMatchStats: Array<Record<string, PlayerMatchStats>>,
): Record<string, PlayerStats> {
  const season: Record<string, PlayerStats> = {};

  for (const matchStats of allMatchStats) {
    for (const [playerName, m] of Object.entries(matchStats)) {
      if (!playerName) continue;

      if (!season[playerName]) {
        season[playerName] = {
          runs: 0, balls_faced: 0, fours: 0, sixes: 0, ducks: 0,
          wickets: 0, balls_bowled: 0, runs_conceded: 0,
          dot_balls: 0, maiden_overs: 0, lbw_bowled_wickets: 0,
          catches: 0, stumpings: 0, run_outs_direct: 0, run_outs_indirect: 0,
          milestone_runs_pts: 0, milestone_wkts_pts: 0,
          sr_pts: 0, economy_pts: 0, catch_bonus_pts: 0,
          lineup_appearances: 0, substitute_appearances: 0, matches_played: 0,
        };
      }
      const s = season[playerName]!;

      s.runs = (s.runs ?? 0) + (m.runs ?? 0);
      s.balls_faced = (s.balls_faced ?? 0) + (m.balls_faced ?? 0);
      s.fours = (s.fours ?? 0) + (m.fours ?? 0);
      s.sixes = (s.sixes ?? 0) + (m.sixes ?? 0);

      // Duck: dismissed + runs=0
      if (m.dismissed && (m.runs ?? 0) === 0) {
        s.ducks = (s.ducks ?? 0) + 1;
      }

      s.wickets = (s.wickets ?? 0) + (m.wickets ?? 0);
      s.balls_bowled = (s.balls_bowled ?? 0) + (m.balls_bowled ?? 0);
      s.runs_conceded = (s.runs_conceded ?? 0) + (m.runs_conceded ?? 0);
      s.maiden_overs = (s.maiden_overs ?? 0) + (m.maiden_overs ?? 0);
      s.lbw_bowled_wickets = (s.lbw_bowled_wickets ?? 0) + (m.lbw_bowled_wickets ?? 0);

      s.catches = (s.catches ?? 0) + (m.catches ?? 0);
      s.stumpings = (s.stumpings ?? 0) + (m.stumpings ?? 0);
      // API scorecards don't differentiate direct/indirect → count as indirect
      s.run_outs_indirect = (s.run_outs_indirect ?? 0) + (m.run_outs ?? 0);

      // Pre-computed per-match bonus points — sum directly
      s.milestone_runs_pts = (s.milestone_runs_pts ?? 0) + (m.milestone_runs_pts ?? 0);
      s.milestone_wkts_pts = (s.milestone_wkts_pts ?? 0) + (m.milestone_wkts_pts ?? 0);
      s.sr_pts = (s.sr_pts ?? 0) + (m.sr_pts ?? 0);
      s.economy_pts = (s.economy_pts ?? 0) + (m.economy_pts ?? 0);
      s.catch_bonus_pts = (s.catch_bonus_pts ?? 0) + (m.catch_bonus_pts ?? 0);

      // duck_penalty is negative — don't add it to season stats; ducks count handles it
      // (scorePlayer uses ducks * -2)

      if (m.appeared) {
        s.lineup_appearances = (s.lineup_appearances ?? 0) + 1;
        s.matches_played = (s.matches_played ?? 0) + 1;
      }
    }
  }

  return season;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);
    const admin = getSupabaseAdminClient();

    const body = (await request.json().catch(() => ({}))) as {
      season?: string;
      accepts?: Array<{ matchId: string; source: string }>;
      overrides?: Array<{
        matchId: string;
        source: string;
        playerStats: Record<string, PlayerMatchStats>;
      }>;
    };

    const season = String(body.season ?? "2026");
    const accepts = body.accepts ?? [];
    const overrides = body.overrides ?? [];

    if (accepts.length === 0 && overrides.length === 0) {
      throw new AppError("Provide at least one accept or override entry.", 400, "NO_DATA");
    }

    // ── Step 1: Apply manual stat overrides ───────────────────────────────────
    for (const ov of overrides) {
      await admin
        .from("match_results")
        .update({ player_stats: ov.playerStats as unknown as Record<string, unknown> })
        .eq("room_id", room.id)
        .eq("match_id", ov.matchId)
        .eq("source", ov.source)
        .eq("season", season);
    }

    // ── Step 2: Update accepted flags ─────────────────────────────────────────
    // For each accepted matchId, set the chosen source to accepted=true and
    // all other sources for the same matchId to accepted=false.
    const matchIds = [...new Set(accepts.map((a) => a.matchId))];

    for (const matchId of matchIds) {
      const chosenSource = accepts.find((a) => a.matchId === matchId)?.source;
      if (!chosenSource) continue;

      // Accept the chosen source
      await admin
        .from("match_results")
        .update({ accepted: true, accepted_at: new Date().toISOString() })
        .eq("room_id", room.id)
        .eq("match_id", matchId)
        .eq("source", chosenSource)
        .eq("season", season);

      // Unaccept all other sources for this match
      await admin
        .from("match_results")
        .update({ accepted: false, accepted_at: null })
        .eq("room_id", room.id)
        .eq("match_id", matchId)
        .neq("source", chosenSource)
        .eq("season", season);
    }

    // ── Step 3: Read ALL accepted rows for this room+season ───────────────────
    const { data: acceptedRows, error: fetchErr } = await admin
      .from("match_results")
      .select("match_id, player_stats")
      .eq("room_id", room.id)
      .eq("season", season)
      .eq("accepted", true);

    if (fetchErr) throw new AppError(fetchErr.message, 500, "DB_QUERY_FAILED");

    // ── Step 4: Aggregate stats across all accepted matches ───────────────────
    const allMatchStats = (acceptedRows ?? []).map(
      (row) => (row.player_stats ?? {}) as Record<string, PlayerMatchStats>,
    );
    const aggregated = aggregateToPlayerStats(allMatchStats);

    // Build normalised name lookup
    const normToOriginal = new Map<string, string>();
    for (const name of Object.keys(aggregated)) {
      normToOriginal.set(normaliseName(name), name);
    }

    // ── Step 5: Fetch room players and update stats ───────────────────────────
    const { data: players, error: playersErr } = await admin
      .from("players")
      .select("id, name, stats")
      .eq("room_id", room.id);

    if (playersErr) throw new AppError(playersErr.message, 500, "DB_QUERY_FAILED");

    let matched = 0;
    const unmatched: string[] = [];

    for (const player of players ?? []) {
      const playerName = String(player.name);
      const normKey = normaliseName(playerName);

      // 1 – exact normalised match
      let statsKey = normToOriginal.get(normKey);

      // 2 – surname fallback (unambiguous only)
      if (!statsKey) {
        const surname = normKey.split(" ").pop() ?? "";
        if (surname.length >= 3) {
          const hits = Array.from(normToOriginal.entries()).filter(([k]) =>
            k.split(" ").pop() === surname,
          );
          if (hits.length === 1) statsKey = hits[0]![1];
        }
      }

      if (!statsKey) {
        unmatched.push(playerName);
        continue;
      }

      const webscrapeStats = aggregated[statsKey]!;
      const existing = (player.stats ?? {}) as Record<string, unknown>;

      // Overlay webscrape stats while preserving metadata (ipl_team, cricsheet_name, etc.)
      const newStats: Record<string, unknown> = {
        ...existing,
        runs: webscrapeStats.runs,
        balls_faced: webscrapeStats.balls_faced,
        fours: webscrapeStats.fours,
        sixes: webscrapeStats.sixes,
        ducks: webscrapeStats.ducks,
        wickets: webscrapeStats.wickets,
        balls_bowled: webscrapeStats.balls_bowled,
        runs_conceded: webscrapeStats.runs_conceded,
        maiden_overs: webscrapeStats.maiden_overs,
        lbw_bowled_wickets: webscrapeStats.lbw_bowled_wickets,
        catches: webscrapeStats.catches,
        stumpings: webscrapeStats.stumpings,
        run_outs_indirect: webscrapeStats.run_outs_indirect,
        milestone_runs_pts: webscrapeStats.milestone_runs_pts,
        milestone_wkts_pts: webscrapeStats.milestone_wkts_pts,
        sr_pts: webscrapeStats.sr_pts,
        economy_pts: webscrapeStats.economy_pts,
        catch_bonus_pts: webscrapeStats.catch_bonus_pts,
        lineup_appearances: webscrapeStats.lineup_appearances,
        matches_played: webscrapeStats.matches_played,
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
      matchesAccepted: matchIds.length,
      totalAcceptedMatches: (acceptedRows ?? []).length,
      playersUpdated: matched,
      playersUnmatched: unmatched.length,
      unmatchedNames: unmatched.slice(0, 30),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
