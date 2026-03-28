/**
 * POST /api/rooms/[code]/cricsheet-sync
 *
 * Parses a Cricsheet IPL ZIP (uploaded or auto-fetched from cricsheet.org),
 * upserts ONE row per match into `match_results` (source="cricsheet", accepted=true),
 * then immediately aggregates ALL accepted rows for the season and writes
 * season totals into `players.stats` — so results appear without any extra step.
 *
 * Re-running is safe: existing rows get fresh player_stats; accepted=true is
 * preserved, and the final aggregation reflects all accepted data (including
 * rows from other sources like webscrape).
 *
 * Body (JSON):  { season?: string }
 * Body (form):  multipart/form-data with fields `file` (ZIP) and `season`
 */

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { processZipPerMatch, processSingleMatchJson } from "@/lib/server/cricsheet";
import { requireRoomAdmin } from "@/lib/server/room";
import type { PlayerMatchStats } from "@/lib/server/webscrape/parser";
import type { PlayerStats } from "@/lib/domain/scoring";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// ── Cricsheet short-name → full-name translation map ─────────────────────────
// Built once at module load from final_mapping.json in the project root.
// Maps normalised short name (e.g. "hh pandya") → full name ("Hardik Pandya").

interface MappingEntry { short_name: string; full_name: string; }

function buildNameMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "final_mapping.json"),
      "utf8",
    );
    const entries = JSON.parse(raw) as Record<string, MappingEntry>;
    for (const { short_name, full_name } of Object.values(entries)) {
      if (short_name && full_name) {
        // Normalise: lowercase, strip dots, collapse spaces
        const key = short_name.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
        map.set(key, full_name);
      }
    }
  } catch {
    // File missing or malformed — matching falls back to normalised string logic
  }
  return map;
}

const CRICSHEET_NAME_MAP = buildNameMap();

export const dynamic = "force-dynamic";

// ── Name normalisation ────────────────────────────────────────────────────────

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Aggregate PlayerMatchStats → season PlayerStats ───────────────────────────
// Identical logic to webscrape-accept so the same data shape is written.

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

      s.runs            = (s.runs            ?? 0) + (m.runs            ?? 0);
      s.balls_faced     = (s.balls_faced     ?? 0) + (m.balls_faced     ?? 0);
      s.fours           = (s.fours           ?? 0) + (m.fours           ?? 0);
      s.sixes           = (s.sixes           ?? 0) + (m.sixes           ?? 0);

      if (m.dismissed && (m.runs ?? 0) === 0) {
        s.ducks = (s.ducks ?? 0) + 1;
      }

      s.wickets          = (s.wickets          ?? 0) + (m.wickets          ?? 0);
      s.balls_bowled     = (s.balls_bowled     ?? 0) + (m.balls_bowled     ?? 0);
      s.runs_conceded    = (s.runs_conceded    ?? 0) + (m.runs_conceded    ?? 0);
      s.maiden_overs     = (s.maiden_overs     ?? 0) + (m.maiden_overs     ?? 0);
      s.lbw_bowled_wickets = (s.lbw_bowled_wickets ?? 0) + (m.lbw_bowled_wickets ?? 0);

      s.catches          = (s.catches          ?? 0) + (m.catches          ?? 0);
      s.stumpings        = (s.stumpings        ?? 0) + (m.stumpings        ?? 0);
      // Cricsheet does distinguish direct/indirect — store in run_outs_direct
      s.run_outs_direct  = (s.run_outs_direct  ?? 0) + (m.run_outs         ?? 0);

      s.milestone_runs_pts = (s.milestone_runs_pts ?? 0) + (m.milestone_runs_pts ?? 0);
      s.milestone_wkts_pts = (s.milestone_wkts_pts ?? 0) + (m.milestone_wkts_pts ?? 0);
      s.sr_pts           = (s.sr_pts           ?? 0) + (m.sr_pts           ?? 0);
      s.economy_pts      = (s.economy_pts      ?? 0) + (m.economy_pts      ?? 0);
      s.catch_bonus_pts  = (s.catch_bonus_pts  ?? 0) + (m.catch_bonus_pts  ?? 0);

      if (m.appeared) {
        s.lineup_appearances = (s.lineup_appearances ?? 0) + 1;
        s.matches_played     = (s.matches_played     ?? 0) + 1;
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

    // ── Get file buffer ───────────────────────────────────────────────────────
    let fileBuffer: Buffer;
    let season: string;
    let uploadedFilename = ""; // only set for file uploads

    const ct = request.headers.get("content-type") ?? "";

    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file") as File | null;
      season = String(form.get("season") || "2026");
      if (!file) throw new AppError("No file uploaded.", 400, "NO_FILE");
      fileBuffer = Buffer.from(await file.arrayBuffer());
      uploadedFilename = file.name;
    } else {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      season = String(body.season ?? "2026");

      const urls = [
        `https://cricsheet.org/downloads/ipl_${season}_json.zip`,
        "https://cricsheet.org/downloads/ipl_json.zip",
      ];

      let fetchRes: Response | null = null;
      for (const url of urls) {
        const res = await fetch(url, {
          headers: { "User-Agent": "IPL-Auction-Platform/1.0 (fantasy-scoring)" },
          signal: AbortSignal.timeout(90_000),
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

      fileBuffer = Buffer.from(await fetchRes.arrayBuffer());
    }

    // ── Parse file into per-match entries ─────────────────────────────────────
    // Single .json file → one match; .zip file (or auto-fetch) → all matches
    const isJsonUpload = uploadedFilename.toLowerCase().endsWith(".json");
    const { matches, matchesProcessed, matchesSkipped, seasons } = isJsonUpload
      ? processSingleMatchJson(fileBuffer, uploadedFilename, season, CRICSHEET_NAME_MAP)
      : processZipPerMatch(fileBuffer, season, CRICSHEET_NAME_MAP);

    if (matchesProcessed === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `No IPL matches found for season ${season}. Available seasons: ${seasons.join(", ") || "none"}.`,
          matchesProcessed,
          matchesSkipped,
          seasons,
        },
        { status: 404 },
      );
    }

    // ── Upsert each match into match_results (accepted=true) ──────────────────
    // Always accepted=true so results update immediately after sync.
    // Re-running updates player_stats for existing rows without downgrading
    // an admin-chosen accepted=false (there's no reason Cricsheet rows would
    // ever be rejected once processed, but we preserve explicit false values
    // only for webscrape rows — Cricsheet is the authoritative ball-by-ball source).
    let upserted = 0;
    let upsertErrors = 0;

    for (const m of matches) {
      const { data: existing } = await admin
        .from("match_results")
        .select("id")
        .eq("room_id", room.id)
        .eq("match_id", m.matchId)
        .eq("source", "cricsheet")
        .eq("season", m.season || season)
        .maybeSingle();

      const { error } = existing
        ? await admin
            .from("match_results")
            .update({
              match_date: m.matchDate,
              player_stats: m.playerStats as unknown as Record<string, unknown>,
              accepted: true,
              accepted_at: new Date().toISOString(),
            })
            .eq("id", existing.id as string)
        : await admin.from("match_results").insert({
            room_id: room.id,
            match_id: m.matchId,
            source: "cricsheet" as const,
            season: m.season || season,
            match_date: m.matchDate,
            player_stats: m.playerStats as unknown as Record<string, unknown>,
            accepted: true,
            accepted_at: new Date().toISOString(),
          });

      if (error) {
        console.error(`cricsheet-sync: failed to upsert match ${m.matchId}:`, error.message);
        upsertErrors += 1;
      } else {
        upserted += 1;
      }
    }

    // ── Aggregate ALL accepted rows for this room+season → players.stats ──────
    // This mirrors exactly what webscrape-accept does so the Results board
    // reflects the full picture (cricsheet rows + any accepted webscrape rows).
    const { data: acceptedRows, error: fetchErr } = await admin
      .from("match_results")
      .select("match_id, player_stats")
      .eq("room_id", room.id)
      .eq("season", season)
      .eq("accepted", true);

    if (fetchErr) throw new AppError(fetchErr.message, 500, "DB_QUERY_FAILED");

    const allMatchStats = (acceptedRows ?? []).map(
      (row) => (row.player_stats ?? {}) as Record<string, PlayerMatchStats>,
    );
    const aggregated = aggregateToPlayerStats(allMatchStats);

    // Build normalised name lookup
    const normToOriginal = new Map<string, string>();
    for (const name of Object.keys(aggregated)) {
      normToOriginal.set(normaliseName(name), name);
    }

    // Fetch room players and update stats
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

      // 1 — exact normalised match
      let statsKey = normToOriginal.get(normKey);

      // 2 — surname fallback (unambiguous only)
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

      const agg = aggregated[statsKey]!;
      const existing = (player.stats ?? {}) as Record<string, unknown>;

      // Overlay aggregated stats, preserve metadata (ipl_team, crisheet_name, etc.)
      const newStats: Record<string, unknown> = {
        ...existing,
        runs: agg.runs,
        balls_faced: agg.balls_faced,
        fours: agg.fours,
        sixes: agg.sixes,
        ducks: agg.ducks,
        wickets: agg.wickets,
        balls_bowled: agg.balls_bowled,
        runs_conceded: agg.runs_conceded,
        maiden_overs: agg.maiden_overs,
        lbw_bowled_wickets: agg.lbw_bowled_wickets,
        catches: agg.catches,
        stumpings: agg.stumpings,
        run_outs_direct: agg.run_outs_direct,
        run_outs_indirect: agg.run_outs_indirect,
        milestone_runs_pts: agg.milestone_runs_pts,
        milestone_wkts_pts: agg.milestone_wkts_pts,
        sr_pts: agg.sr_pts,
        economy_pts: agg.economy_pts,
        catch_bonus_pts: agg.catch_bonus_pts,
        lineup_appearances: agg.lineup_appearances,
        matches_played: agg.matches_played,
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
      matchesUpserted: upserted,
      matchesErrored: upsertErrors,
      totalAcceptedMatches: (acceptedRows ?? []).length,
      playersUpdated: matched,
      playersUnmatched: unmatched.length,
      unmatchedNames: unmatched.slice(0, 30),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
