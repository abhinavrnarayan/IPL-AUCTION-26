/**
 * POST /api/rooms/[code]/cricsheet-sync
 *
 * Parses a Cricsheet IPL ZIP or single JSON file, upserts one row per match
 * into match_results, and then re-aggregates accepted rows into players.stats.
 */

import fs from "fs";
import path from "path";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import type { PlayerStats } from "@/lib/domain/scoring";
import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { processSingleMatchJson, processZipPerMatch } from "@/lib/server/cricsheet";
import { requireRoomAdmin } from "@/lib/server/room";
import type { PlayerMatchStats } from "@/lib/server/webscrape/parser";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

interface MappingEntry {
  short_name: string;
  full_name: string;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

function buildUuidMap(): Map<string, string> {
  const map = new Map<string, string>();

  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "final_mapping.json"), "utf8");
    const entries = JSON.parse(raw) as Record<string, MappingEntry>;

    for (const [uuid, value] of Object.entries(entries)) {
      if (!uuid || !value?.full_name) continue;
      map.set(uuid, value.full_name);
      map.set(uuid.slice(0, 8), value.full_name);
    }
  } catch (error) {
    console.error("[cricsheet-sync] failed to load final_mapping.json", error);
  }

  return map;
}

function buildShortNameMap(): Map<string, string> {
  const map = new Map<string, string>();

  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "final_mapping.json"), "utf8");
    const entries = JSON.parse(raw) as Record<string, MappingEntry>;

    for (const value of Object.values(entries)) {
      if (!value?.short_name || !value?.full_name) continue;
      map.set(normalizeName(value.short_name), value.full_name);
    }
  } catch {
    // Silent fallback: UUID load already logs the root error.
  }

  return map;
}

const CRICSHEET_UUID_MAP = buildUuidMap();
const CRICSHEET_SHORT_MAP = buildShortNameMap();

export const dynamic = "force-dynamic";

function isShortNameFormat(normKey: string): boolean {
  const parts = normKey.split(" ");
  return parts.length >= 2 && (parts[0]?.length ?? 0) <= 2;
}

function matchesShortName(statsNormKey: string, dbNormKey: string): boolean {
  const statParts = statsNormKey.split(" ");
  const dbParts = dbNormKey.split(" ");

  if (statParts.length < 2 || dbParts.length < 2) return false;

  const statSurname = statParts[statParts.length - 1];
  const dbSurname = dbParts[dbParts.length - 1];
  if (statSurname !== dbSurname) return false;

  const statInitials = statParts.slice(0, -1).join("");
  const dbFirstParts = dbParts.slice(0, -1);
  const checkLength = Math.min(statInitials.length, dbFirstParts.length);

  for (let index = 0; index < checkLength; index += 1) {
    if (statInitials[index] !== dbFirstParts[index]?.[0]) return false;
  }

  return true;
}

function aggregateToPlayerStats(
  allMatchStats: Array<Record<string, PlayerMatchStats>>,
): Record<string, PlayerStats> {
  const season: Record<string, PlayerStats> = {};

  for (const matchStats of allMatchStats) {
    for (const [playerName, stats] of Object.entries(matchStats)) {
      if (!playerName) continue;

      if (!season[playerName]) {
        season[playerName] = {
          runs: 0,
          balls_faced: 0,
          fours: 0,
          sixes: 0,
          ducks: 0,
          wickets: 0,
          balls_bowled: 0,
          runs_conceded: 0,
          dot_balls: 0,
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

      const target = season[playerName]!;
      target.runs = (target.runs ?? 0) + (stats.runs ?? 0);
      target.balls_faced = (target.balls_faced ?? 0) + (stats.balls_faced ?? 0);
      target.fours = (target.fours ?? 0) + (stats.fours ?? 0);
      target.sixes = (target.sixes ?? 0) + (stats.sixes ?? 0);

      if (stats.dismissed && (stats.runs ?? 0) === 0) {
        target.ducks = (target.ducks ?? 0) + 1;
      }

      target.wickets = (target.wickets ?? 0) + (stats.wickets ?? 0);
      target.balls_bowled = (target.balls_bowled ?? 0) + (stats.balls_bowled ?? 0);
      target.runs_conceded = (target.runs_conceded ?? 0) + (stats.runs_conceded ?? 0);
      target.maiden_overs = (target.maiden_overs ?? 0) + (stats.maiden_overs ?? 0);
      target.lbw_bowled_wickets =
        (target.lbw_bowled_wickets ?? 0) + (stats.lbw_bowled_wickets ?? 0);
      target.catches = (target.catches ?? 0) + (stats.catches ?? 0);
      target.stumpings = (target.stumpings ?? 0) + (stats.stumpings ?? 0);
      target.run_outs_direct = (target.run_outs_direct ?? 0) + (stats.run_outs ?? 0);
      target.milestone_runs_pts =
        (target.milestone_runs_pts ?? 0) + (stats.milestone_runs_pts ?? 0);
      target.milestone_wkts_pts =
        (target.milestone_wkts_pts ?? 0) + (stats.milestone_wkts_pts ?? 0);
      target.sr_pts = (target.sr_pts ?? 0) + (stats.sr_pts ?? 0);
      target.economy_pts = (target.economy_pts ?? 0) + (stats.economy_pts ?? 0);
      target.catch_bonus_pts = (target.catch_bonus_pts ?? 0) + (stats.catch_bonus_pts ?? 0);

      if (stats.appeared) {
        target.lineup_appearances = (target.lineup_appearances ?? 0) + 1;
        target.matches_played = (target.matches_played ?? 0) + 1;
      }
    }
  }

  return season;
}

function buildSeasonStatsPayload(
  existing: Record<string, unknown>,
  stats?: PlayerStats,
): Record<string, unknown> {
  const source = stats ?? {
    runs: 0,
    balls_faced: 0,
    fours: 0,
    sixes: 0,
    ducks: 0,
    wickets: 0,
    balls_bowled: 0,
    runs_conceded: 0,
    dot_balls: 0,
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

  return {
    ...existing,
    runs: source.runs ?? 0,
    balls_faced: source.balls_faced ?? 0,
    fours: source.fours ?? 0,
    sixes: source.sixes ?? 0,
    ducks: source.ducks ?? 0,
    wickets: source.wickets ?? 0,
    balls_bowled: source.balls_bowled ?? 0,
    runs_conceded: source.runs_conceded ?? 0,
    maiden_overs: source.maiden_overs ?? 0,
    lbw_bowled_wickets: source.lbw_bowled_wickets ?? 0,
    catches: source.catches ?? 0,
    stumpings: source.stumpings ?? 0,
    run_outs_direct: source.run_outs_direct ?? 0,
    run_outs_indirect: source.run_outs_indirect ?? 0,
    milestone_runs_pts: source.milestone_runs_pts ?? 0,
    milestone_wkts_pts: source.milestone_wkts_pts ?? 0,
    sr_pts: source.sr_pts ?? 0,
    economy_pts: source.economy_pts ?? 0,
    catch_bonus_pts: source.catch_bonus_pts ?? 0,
    lineup_appearances: source.lineup_appearances ?? 0,
    substitute_appearances: source.substitute_appearances ?? 0,
    matches_played: source.matches_played ?? 0,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);
    const admin = getSupabaseAdminClient();

    let fileBuffer: Buffer;
    let season: string;
    let uploadedFilename = "";

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
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

      let fetchResponse: Response | null = null;
      for (const url of urls) {
        const response = await fetch(url, {
          headers: { "User-Agent": "IPL-Auction-Platform/1.0 (fantasy-scoring)" },
          signal: AbortSignal.timeout(90_000),
        });

        if (response.ok) {
          fetchResponse = response;
          break;
        }
      }

      if (!fetchResponse) {
        throw new AppError(
          "Could not fetch IPL data from Cricsheet. Try uploading the file manually.",
          502,
          "CRICSHEET_FETCH_FAILED",
        );
      }

      fileBuffer = Buffer.from(await fetchResponse.arrayBuffer());
    }

    const isJsonUpload = uploadedFilename.toLowerCase().endsWith(".json");
    const { matches, matchesProcessed, matchesSkipped, seasons } = isJsonUpload
      ? processSingleMatchJson(
          fileBuffer,
          uploadedFilename,
          season,
          CRICSHEET_UUID_MAP,
          CRICSHEET_SHORT_MAP,
        )
      : processZipPerMatch(fileBuffer, season, CRICSHEET_UUID_MAP, CRICSHEET_SHORT_MAP);

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

    let upserted = 0;
    let upsertErrors = 0;

    for (const match of matches) {
      const { data: existing } = await admin
        .from("match_results")
        .select("id")
        .eq("room_id", room.id)
        .eq("match_id", match.matchId)
        .eq("source", "cricsheet")
        .eq("season", match.season || season)
        .maybeSingle();

      const { error } = existing
        ? await admin
            .from("match_results")
            .update({
              match_date: match.matchDate,
              player_stats: match.playerStats as unknown as Record<string, unknown>,
              accepted: true,
              accepted_at: new Date().toISOString(),
            })
            .eq("id", existing.id as string)
        : await admin.from("match_results").insert({
            room_id: room.id,
            match_id: match.matchId,
            source: "cricsheet" as const,
            season: match.season || season,
            match_date: match.matchDate,
            player_stats: match.playerStats as unknown as Record<string, unknown>,
            accepted: true,
            accepted_at: new Date().toISOString(),
          });

      if (error) {
        console.error(`[cricsheet-sync] failed to upsert match ${match.matchId}:`, error.message);
        upsertErrors += 1;
      } else {
        upserted += 1;
      }
    }

    const { data: acceptedRows, error: fetchError } = await admin
      .from("match_results")
      .select("match_id, player_stats")
      .eq("room_id", room.id)
      .eq("season", season)
      .eq("accepted", true);

    if (fetchError) throw new AppError(fetchError.message, 500, "DB_QUERY_FAILED");

    const allMatchStats = (acceptedRows ?? []).map(
      (row) => (row.player_stats ?? {}) as Record<string, PlayerMatchStats>,
    );
    const aggregated = aggregateToPlayerStats(allMatchStats);

    const normToOriginal = new Map<string, string>();
    for (const name of Object.keys(aggregated)) {
      normToOriginal.set(normalizeName(name), name);
    }

    const fullNameToUuid = new Map<string, string>();
    for (const [uuid, fullName] of CRICSHEET_UUID_MAP.entries()) {
      if (uuid.length === 8) fullNameToUuid.set(fullName, uuid);
    }

    const { data: players, error: playersError } = await admin
      .from("players")
      .select("id, name, stats, cricsheet_uuid")
      .eq("room_id", room.id);

    if (playersError) throw new AppError(playersError.message, 500, "DB_QUERY_FAILED");

    let matched = 0;
    const unmatched: string[] = [];

    for (const player of players ?? []) {
      const playerName = String(player.name);
      const normKey = normalizeName(playerName);
      const storedUuid = (player as { cricsheet_uuid?: string | null }).cricsheet_uuid;
      const existing = (player.stats ?? {}) as Record<string, unknown>;

      let statsKey: string | undefined;
      let clearStoredUuid = false;

      if (storedUuid) {
        const fullName = CRICSHEET_UUID_MAP.get(storedUuid);
        if (fullName && normalizeName(fullName) === normKey && aggregated[fullName]) {
          statsKey = fullName;
        } else if (fullName && normalizeName(fullName) !== normKey) {
          clearStoredUuid = true;
        }
      }

      if (!statsKey) statsKey = normToOriginal.get(normKey);

      if (!statsKey) {
        const initCandidates = Array.from(normToOriginal.entries()).filter(
          ([key]) => isShortNameFormat(key) && matchesShortName(key, normKey),
        );
        if (initCandidates.length === 1) statsKey = initCandidates[0]?.[1];
      }

      if (!statsKey) {
        unmatched.push(playerName);
      }

      const agg = statsKey ? aggregated[statsKey] : undefined;
      const updatePayload: Record<string, unknown> = {
        stats: buildSeasonStatsPayload(existing, agg),
      };

      if (statsKey) {
        const resolvedUuid = fullNameToUuid.get(statsKey);
        if (resolvedUuid && !storedUuid) updatePayload.cricsheet_uuid = resolvedUuid;
      } else if (clearStoredUuid) {
        updatePayload.cricsheet_uuid = null;
      }

      const { error: updateError } = await admin
        .from("players")
        .update(updatePayload)
        .eq("id", player.id as string);

      if (updateError) {
        console.error(`[cricsheet-sync] failed to update player ${playerName}:`, updateError.message);
        if (!unmatched.includes(playerName)) unmatched.push(playerName);
        continue;
      }

      if (statsKey) matched += 1;
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
      playersMatched: matched,
      playersUpdated: matched,
      playersUnmatched: unmatched.length,
      unmatchedNames: unmatched.slice(0, 30),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
