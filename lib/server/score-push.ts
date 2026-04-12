/**
 * lib/server/score-push.ts
 *
 * Core logic: when the global admin accepts a match in global_match_results,
 * this module propagates it to every room's match_results and re-aggregates
 * each room's players.stats.
 */

import fs from "fs";
import path from "path";

import { revalidatePath } from "next/cache";

import type { PlayerStats } from "@/lib/domain/scoring";
import { invalidateRoomCache } from "@/lib/server/room";
import type { PlayerMatchStats } from "@/lib/server/webscrape/parser";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// ── Name-mapping helpers (mirrors cricsheet-sync route) ───────────────────────

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
    console.error("[score-push] failed to load final_mapping.json", error);
  }
  return map;
}

// Module-level cache — loaded once per server process
const CRICSHEET_UUID_MAP = buildUuidMap();

function isShortNameFormat(normKey: string): boolean {
  const parts = normKey.split(" ");
  return parts.length >= 2 && (parts[0]?.length ?? 0) <= 2;
}

function matchesShortName(statsNormKey: string, dbNormKey: string): boolean {
  const statParts = statsNormKey.split(" ");
  const dbParts = dbNormKey.split(" ");
  if (statParts.length < 2 || dbParts.length < 2) return false;
  if (statParts[statParts.length - 1] !== dbParts[dbParts.length - 1]) return false;
  const statInitials = statParts.slice(0, -1).join("");
  const dbFirstParts = dbParts.slice(0, -1);
  const checkLength = Math.min(statInitials.length, dbFirstParts.length);
  for (let i = 0; i < checkLength; i += 1) {
    if (statInitials[i] !== dbFirstParts[i]?.[0]) return false;
  }
  return true;
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function dotBallPts(dots: number): number {
  let pts = 0;
  if (dots >= 3) pts += 1;
  if (dots >= 6) pts += 1;
  return pts;
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
          runs: 0, balls_faced: 0, fours: 0, sixes: 0, ducks: 0,
          wickets: 0, balls_bowled: 0, runs_conceded: 0,
          dot_balls: 0, dot_ball_pts: 0, maiden_overs: 0, lbw_bowled_wickets: 0,
          catches: 0, stumpings: 0, run_outs_direct: 0, run_outs_indirect: 0,
          milestone_runs_pts: 0, milestone_wkts_pts: 0,
          sr_pts: 0, economy_pts: 0, catch_bonus_pts: 0,
          lineup_appearances: 0, substitute_appearances: 0, matches_played: 0,
        };
      }

      const t = season[playerName]!;
      t.runs = (t.runs ?? 0) + (stats.runs ?? 0);
      t.balls_faced = (t.balls_faced ?? 0) + (stats.balls_faced ?? 0);
      t.fours = (t.fours ?? 0) + (stats.fours ?? 0);
      t.sixes = (t.sixes ?? 0) + (stats.sixes ?? 0);
      if (stats.dismissed && (stats.runs ?? 0) === 0) t.ducks = (t.ducks ?? 0) + 1;
      t.wickets = (t.wickets ?? 0) + (stats.wickets ?? 0);
      t.balls_bowled = (t.balls_bowled ?? 0) + (stats.balls_bowled ?? 0);
      t.runs_conceded = (t.runs_conceded ?? 0) + (stats.runs_conceded ?? 0);
      t.dot_balls = (t.dot_balls ?? 0) + (stats.dot_balls ?? 0);
      t.dot_ball_pts = (t.dot_ball_pts ?? 0) + (stats.dot_ball_pts ?? dotBallPts(stats.dot_balls ?? 0));
      t.maiden_overs = (t.maiden_overs ?? 0) + (stats.maiden_overs ?? 0);
      t.lbw_bowled_wickets = (t.lbw_bowled_wickets ?? 0) + (stats.lbw_bowled_wickets ?? 0);
      t.catches = (t.catches ?? 0) + (stats.catches ?? 0);
      t.stumpings = (t.stumpings ?? 0) + (stats.stumpings ?? 0);
      // cricsheet identifies direct run-outs; webscrape uses run_outs generically → indirect
      t.run_outs_direct = (t.run_outs_direct ?? 0) + (stats.run_outs ?? 0);
      t.milestone_runs_pts = (t.milestone_runs_pts ?? 0) + (stats.milestone_runs_pts ?? 0);
      t.milestone_wkts_pts = (t.milestone_wkts_pts ?? 0) + (stats.milestone_wkts_pts ?? 0);
      t.sr_pts = (t.sr_pts ?? 0) + (stats.sr_pts ?? 0);
      t.economy_pts = (t.economy_pts ?? 0) + (stats.economy_pts ?? 0);
      t.catch_bonus_pts = (t.catch_bonus_pts ?? 0) + (stats.catch_bonus_pts ?? 0);
      if (stats.appeared) {
        t.lineup_appearances = (t.lineup_appearances ?? 0) + 1;
        t.matches_played = (t.matches_played ?? 0) + 1;
      }
    }
  }

  return season;
}

function buildSeasonStatsPayload(
  existing: Record<string, unknown>,
  stats?: PlayerStats,
): Record<string, unknown> {
  const src = stats ?? {
    runs: 0, balls_faced: 0, fours: 0, sixes: 0, ducks: 0,
    wickets: 0, balls_bowled: 0, runs_conceded: 0,
    dot_balls: 0, dot_ball_pts: 0, maiden_overs: 0, lbw_bowled_wickets: 0,
    catches: 0, stumpings: 0, run_outs_direct: 0, run_outs_indirect: 0,
    milestone_runs_pts: 0, milestone_wkts_pts: 0,
    sr_pts: 0, economy_pts: 0, catch_bonus_pts: 0,
    lineup_appearances: 0, substitute_appearances: 0, matches_played: 0,
  };

  return {
    ...existing,
    runs: src.runs ?? 0,
    balls_faced: src.balls_faced ?? 0,
    fours: src.fours ?? 0,
    sixes: src.sixes ?? 0,
    ducks: src.ducks ?? 0,
    wickets: src.wickets ?? 0,
    balls_bowled: src.balls_bowled ?? 0,
    runs_conceded: src.runs_conceded ?? 0,
    dot_ball_pts: src.dot_ball_pts ?? 0,
    maiden_overs: src.maiden_overs ?? 0,
    lbw_bowled_wickets: src.lbw_bowled_wickets ?? 0,
    catches: src.catches ?? 0,
    stumpings: src.stumpings ?? 0,
    run_outs_direct: src.run_outs_direct ?? 0,
    run_outs_indirect: src.run_outs_indirect ?? 0,
    milestone_runs_pts: src.milestone_runs_pts ?? 0,
    milestone_wkts_pts: src.milestone_wkts_pts ?? 0,
    sr_pts: src.sr_pts ?? 0,
    economy_pts: src.economy_pts ?? 0,
    catch_bonus_pts: src.catch_bonus_pts ?? 0,
    lineup_appearances: src.lineup_appearances ?? 0,
    substitute_appearances: src.substitute_appearances ?? 0,
    matches_played: src.matches_played ?? 0,
  };
}

// ── Per-room helpers (reset + recalculate) ────────────────────────────────────

/**
 * Zero out all scoring stats for every player in a room.
 * Meta fields (ipl_team, cricsheet_name, etc.) are preserved.
 * Does NOT touch match_results — those remain as the source of truth.
 */
export async function resetRoomStats(
  roomId: string,
  roomCode: string,
): Promise<{ playersReset: number }> {
  const admin = getSupabaseAdminClient();

  const { data: players, error } = await admin
    .from("players")
    .select("id, stats")
    .eq("room_id", roomId);
  if (error) throw new Error(error.message);

  let count = 0;
  for (const player of players ?? []) {
    const existing = (player.stats ?? {}) as Record<string, unknown>;
    const zeroed = buildSeasonStatsPayload(existing, undefined); // zeroes all scoring fields
    await admin.from("players").update({ stats: zeroed }).eq("id", player.id as string);
    count += 1;
  }

  await invalidateRoomCache(roomId, roomCode);
  revalidatePath(`/room/${roomCode}`);
  revalidatePath(`/results/${roomCode}`);

  return { playersReset: count };
}

/**
 * Re-aggregate all accepted match_results for the room's latest season
 * and write the result back to players.stats.
 * This is a full recalculation from the stored match data — no new data is fetched.
 */
export async function recalculateRoomStats(
  roomId: string,
  roomCode: string,
): Promise<{ playersUpdated: number }> {
  const admin = getSupabaseAdminClient();

  // Determine the latest season with accepted data in this room
  const { data: latestRow } = await admin
    .from("match_results")
    .select("season")
    .eq("room_id", roomId)
    .eq("accepted", true)
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRow) return { playersUpdated: 0 }; // no accepted matches yet

  const season = String(latestRow.season);

  // Re-aggregate all accepted matches for this room + season
  const { data: allAccepted } = await admin
    .from("match_results")
    .select("player_stats")
    .eq("room_id", roomId)
    .eq("season", season)
    .eq("accepted", true);

  const allMatchStats = (allAccepted ?? []).map(
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

  const { data: players } = await admin
    .from("players")
    .select("id, name, stats, cricsheet_uuid")
    .eq("room_id", roomId);

  let matched = 0;

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
      const candidates = Array.from(normToOriginal.entries()).filter(
        ([key]) => isShortNameFormat(key) && matchesShortName(key, normKey),
      );
      if (candidates.length === 1) statsKey = candidates[0]?.[1];
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

    await admin.from("players").update(updatePayload).eq("id", player.id as string);
    if (statsKey) matched += 1;
  }

  await invalidateRoomCache(roomId, roomCode);
  revalidatePath(`/room/${roomCode}`);
  revalidatePath(`/results/${roomCode}`);

  return { playersUpdated: matched };
}

// ── Main push function ────────────────────────────────────────────────────────

export async function pushMatchToAllRooms(
  matchId: string,
  source: string,
): Promise<{ roomsUpdated: number; playersUpdated: number }> {
  const admin = getSupabaseAdminClient();

  // 1. Fetch the accepted global match
  const { data: globalMatch, error: gmError } = await admin
    .from("global_match_results")
    .select("*")
    .eq("match_id", matchId)
    .eq("source", source)
    .eq("accepted", true)
    .single();

  if (gmError || !globalMatch) {
    throw new Error(`Global match not found or not accepted: ${matchId}/${source}`);
  }

  // 2. Get all rooms — skip the super room (sandbox, not part of live scoring)
  const { data: rooms, error: roomsError } = await admin
    .from("rooms")
    .select("id, code")
    .eq("is_super_room", false);

  if (roomsError) throw new Error(roomsError.message);

  // fullName → 8-char uuid (for storing cricsheet_uuid on players)
  const fullNameToUuid = new Map<string, string>();
  for (const [uuid, fullName] of CRICSHEET_UUID_MAP.entries()) {
    if (uuid.length === 8) fullNameToUuid.set(fullName, uuid);
  }

  let roomsUpdated = 0;
  let totalPlayersUpdated = 0;

  for (const room of rooms ?? []) {
    // 3. Upsert this match into the room-scoped match_results
    await admin.from("match_results").upsert(
      {
        room_id: room.id,
        match_id: matchId,
        source,
        season: String(globalMatch.season),
        match_date: globalMatch.match_date,
        teams: (globalMatch.teams as string[]) ?? [],
        source_label: globalMatch.source_label,
        player_stats: globalMatch.player_stats as Record<string, unknown>,
        calculated_points: (globalMatch.calculated_points ?? {}) as Record<string, unknown>,
        accepted: true,
        accepted_at: new Date().toISOString(),
      },
      { onConflict: "room_id,match_id,source" },
    );

    // 4. Re-aggregate ALL accepted matches for this room+season
    const { data: allAccepted } = await admin
      .from("match_results")
      .select("player_stats")
      .eq("room_id", room.id)
      .eq("season", String(globalMatch.season))
      .eq("accepted", true);

    const allMatchStats = (allAccepted ?? []).map(
      (row) => (row.player_stats ?? {}) as Record<string, PlayerMatchStats>,
    );
    const aggregated = aggregateToPlayerStats(allMatchStats);

    const normToOriginal = new Map<string, string>();
    for (const name of Object.keys(aggregated)) {
      normToOriginal.set(normalizeName(name), name);
    }

    // 5. Fetch all players in this room and update their season stats
    const { data: players } = await admin
      .from("players")
      .select("id, name, stats, cricsheet_uuid")
      .eq("room_id", room.id);

    let matched = 0;

    for (const player of players ?? []) {
      const playerName = String(player.name);
      const normKey = normalizeName(playerName);
      const storedUuid = (player as { cricsheet_uuid?: string | null }).cricsheet_uuid;
      const existing = (player.stats ?? {}) as Record<string, unknown>;

      let statsKey: string | undefined;
      let clearStoredUuid = false;

      // UUID-based match (most precise)
      if (storedUuid) {
        const fullName = CRICSHEET_UUID_MAP.get(storedUuid);
        if (fullName && normalizeName(fullName) === normKey && aggregated[fullName]) {
          statsKey = fullName;
        } else if (fullName && normalizeName(fullName) !== normKey) {
          clearStoredUuid = true; // UUID points to a different player — clear it
        }
      }

      // Exact normalised name match
      if (!statsKey) statsKey = normToOriginal.get(normKey);

      // Initials-based short-name match (e.g. "V Kohli" → "Virat Kohli")
      if (!statsKey) {
        const candidates = Array.from(normToOriginal.entries()).filter(
          ([key]) => isShortNameFormat(key) && matchesShortName(key, normKey),
        );
        if (candidates.length === 1) statsKey = candidates[0]?.[1];
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

      if (!updateError && statsKey) matched += 1;
    }

    totalPlayersUpdated += matched;

    // 6. Invalidate Redis + Next.js path cache for this room
    await invalidateRoomCache(room.id, room.code);
    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    roomsUpdated += 1;
  }

  // 7. Stamp pushed_at on the global match
  await admin
    .from("global_match_results")
    .update({ pushed_at: new Date().toISOString() })
    .eq("match_id", matchId)
    .eq("source", source);

  return { roomsUpdated, playersUpdated: totalPlayersUpdated };
}
