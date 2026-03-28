/**
 * Cricsheet data parser
 *
 * Reads a Cricsheet IPL JSON zip, processes ball-by-ball data, and produces
 * per-player fantasy stats that match the scoring rules in RULES.MD.
 *
 * Non-linear bonuses (run milestones, wicket milestones, strike rate, economy
 * rate, 3-catch bonus) are computed per-match so thresholds are applied
 * correctly rather than against season-aggregate totals.
 */

import AdmZip from "adm-zip";

import type { PlayerStats } from "@/lib/domain/scoring";
import type { PlayerMatchStats } from "@/lib/server/webscrape/parser";

// ── Cricsheet JSON shape ──────────────────────────────────────────────────────

interface CricsheetExtras {
  wides?: number;
  noballs?: number;
  legbyes?: number;
  byes?: number;
  penalty?: number;
}

interface CricsheetWicket {
  player_out: string;
  kind: string; // 'caught' | 'bowled' | 'lbw' | 'run out' | 'stumped' | ...
  fielders?: Array<{ name: string; substitute?: boolean }>;
}

interface CricsheetDelivery {
  batter: string;
  bowler: string;
  non_striker: string;
  runs: { batter: number; extras: number; total: number };
  extras?: CricsheetExtras;
  wickets?: CricsheetWicket[];
}

interface CricsheetOver {
  over: number;
  deliveries: CricsheetDelivery[];
}

interface CricsheetInning {
  team: string;
  overs?: CricsheetOver[];
  super_over?: boolean;
}

interface CricsheetMatch {
  info: {
    competition?: string;
    event?: { name?: string };
    season?: string | number;
    teams?: string[];
    players?: Record<string, string[]>; // team name → player names (announced XI)
    dates?: string[];
    /** Cricsheet built-in registry: maps each player's in-game name → their UUID. */
    registry?: { people?: Record<string, string> };
  };
  innings?: CricsheetInning[];
}

// ── Stats accumulator ─────────────────────────────────────────────────────────
// Extends PlayerStats – all fields are guaranteed numbers (no undefined).

export type CricsheetAccumulator = Required<
  Omit<PlayerStats, "ipl_team" | "cricsheet_name">
> & {
  ipl_team?: string;
  cricsheet_name?: string;
};

function empty(): CricsheetAccumulator {
  return {
    runs: 0, balls_faced: 0, fours: 0, sixes: 0, ducks: 0,
    wickets: 0, balls_bowled: 0, runs_conceded: 0,
    dot_balls: 0, maiden_overs: 0, lbw_bowled_wickets: 0,
    catches: 0, stumpings: 0, run_outs_direct: 0, run_outs_indirect: 0,
    milestone_runs_pts: 0, milestone_wkts_pts: 0,
    sr_pts: 0, economy_pts: 0, catch_bonus_pts: 0,
    lineup_appearances: 0, substitute_appearances: 0, matches_played: 0,
  };
}

function getOrCreate(
  map: Map<string, CricsheetAccumulator>,
  name: string,
): CricsheetAccumulator {
  let acc = map.get(name);
  if (!acc) { acc = empty(); map.set(name, acc); }
  return acc;
}

// ── Single-match processor ────────────────────────────────────────────────────

export function processMatch(
  match: CricsheetMatch,
  allStats: Map<string, CricsheetAccumulator>,
  /** Optional: Cricsheet registry UUID → canonical full name (from final_mapping.json).
   *  Each Cricsheet match JSON includes info.registry.people which maps the player's
   *  in-game name to their UUID.  This map then resolves UUID → full name — exact and
   *  unambiguous, with no string normalisation required.
   *  Falls back to shortNameMap when the registry is absent or incomplete. */
  uuidMap?: Map<string, string>,
  /** Fallback: normalised short name → full name.  Used when UUID lookup fails (e.g.
   *  registry.people absent, or player not in final_mapping.json). */
  shortNameMap?: Map<string, string>,
): void {
  // Per-match registry: player's Cricsheet name → their UUID
  const registry = match.info.registry?.people ?? {};
  const hasRegistry = Object.keys(registry).length > 0;

  /** Normalise a name for short-name map lookup. */
  const normShort = (n: string) =>
    n.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();

  /** Resolve a Cricsheet player name → canonical full name.
   *  Priority: UUID registry → short-name map → raw name. */
  const resolve = (name: string): string => {
    // 1. UUID via match registry (most reliable)
    if (uuidMap && hasRegistry) {
      const fullUuid = registry[name];
      if (fullUuid) {
        const full = uuidMap.get(fullUuid.slice(0, 8));
        if (full) return full;
      }
    }
    // 2. Short-name normalisation fallback (handles older JSONs without registry)
    if (shortNameMap) {
      const full = shortNameMap.get(normShort(name));
      if (full) return full;
    }
    return name;
  };

  const innings = match.innings ?? [];

  // Players listed in the announced XI — translate names immediately
  const announcedPlayers = new Set<string>();
  for (const teamPlayers of Object.values(match.info.players ?? {})) {
    for (const p of teamPlayers) announcedPlayers.add(resolve(p));
  }

  // Track who actually appeared on the field this match
  const appearedInMatch = new Set<string>();

  // Per-match batting accumulators (for non-linear bonus computation)
  const matchBat = new Map<string, { runs: number; balls: number; dismissed: boolean }>();
  // Per-match bowling accumulators
  const matchBowl = new Map<string, { balls: number; runs: number; wickets: number }>();
  // Per-match catch counts (for 3-catch bonus)
  const matchCatches = new Map<string, number>();

  for (const inning of innings) {
    // Super overs don't count per RULES.MD
    if (inning.super_over) continue;

    for (const over of (inning.overs ?? [])) {
      const firstDelivery = over.deliveries[0];
      const overBowlerName = firstDelivery?.bowler ?? "";
      let overTotalRuns = 0;
      let overLegalBalls = 0;

      for (const d of over.deliveries) {
        const isWide = (d.extras?.wides ?? 0) > 0;

        // ── Batter ────────────────────────────────────────────────────────────
        const batter = resolve(d.batter);
        appearedInMatch.add(batter);

        const bAcc = getOrCreate(allStats, batter);
        bAcc.runs += d.runs.batter;
        if (!isWide) {
          bAcc.balls_faced += 1;
        }
        if (d.runs.batter === 4) bAcc.fours += 1;
        if (d.runs.batter === 6) bAcc.sixes += 1;

        const bm = matchBat.get(batter) ?? { runs: 0, balls: 0, dismissed: false };
        bm.runs += d.runs.batter;
        if (!isWide) bm.balls += 1;
        matchBat.set(batter, bm);

        // ── Bowler ────────────────────────────────────────────────────────────
        const bowler = resolve(d.bowler);
        appearedInMatch.add(bowler);

        const bowlAcc = getOrCreate(allStats, bowler);
        bowlAcc.runs_conceded += d.runs.total;

        if (!isWide) {
          bowlAcc.balls_bowled += 1;
          overLegalBalls += 1;
          if (d.runs.total === 0) bowlAcc.dot_balls += 1;
        }
        overTotalRuns += d.runs.total;

        const bwm = matchBowl.get(bowler) ?? { balls: 0, runs: 0, wickets: 0 };
        bwm.runs += d.runs.total;
        if (!isWide) bwm.balls += 1;
        matchBowl.set(bowler, bwm);

        // ── Wickets ───────────────────────────────────────────────────────────
        for (const wicket of (d.wickets ?? [])) {
          const playerOut = resolve(wicket.player_out);
          appearedInMatch.add(playerOut);

          // Mark batter dismissed
          const outBm = matchBat.get(playerOut) ?? { runs: 0, balls: 0, dismissed: false };
          outBm.dismissed = true;
          matchBat.set(playerOut, outBm);

          const isRunOut = wicket.kind === "run out";
          const isRetired = wicket.kind.startsWith("retired");

          // Bowler credit (not for run outs or retired)
          if (!isRunOut && !isRetired) {
            bowlAcc.wickets += 1;
            bwm.wickets += 1;
            if (wicket.kind === "lbw" || wicket.kind === "bowled") {
              bowlAcc.lbw_bowled_wickets += 1;
            }
          }

          // Fielder credit
          for (const fielder of (wicket.fielders ?? [])) {
            if (fielder.substitute) continue; // substitutes don't earn fielding points
            const fielderName = resolve(fielder.name);
            appearedInMatch.add(fielderName);
            const fAcc = getOrCreate(allStats, fielderName);

            if (wicket.kind === "caught") {
              fAcc.catches += 1;
              matchCatches.set(fielderName, (matchCatches.get(fielderName) ?? 0) + 1);
            } else if (wicket.kind === "stumped") {
              fAcc.stumpings += 1;
            } else if (wicket.kind === "run out") {
              // Cricsheet doesn't reliably mark direct vs indirect –
              // award indirect (+6) conservatively for all run-out fielders
              fAcc.run_outs_indirect += 1;
            }
          }
        }
      } // end deliveries

      // Maiden over: 6 legal balls AND 0 total runs in the over
      if (overLegalBalls === 6 && overTotalRuns === 0) {
        const resolvedBowler = resolve(overBowlerName);
        const bowlAcc = allStats.get(resolvedBowler);
        if (bowlAcc) bowlAcc.maiden_overs += 1;
      }
    } // end overs
  } // end innings

  // ── Post-match: compute non-linear bonuses ────────────────────────────────

  // Batting milestones + strike rate + ducks
  for (const [playerName, bm] of matchBat) {
    const acc = getOrCreate(allStats, playerName);

    // Duck
    if (bm.dismissed && bm.runs === 0) acc.ducks += 1;

    // Run milestones (cumulative per RULES.MD)
    if (bm.runs >= 25) acc.milestone_runs_pts += 4;
    if (bm.runs >= 50) acc.milestone_runs_pts += 8;
    if (bm.runs >= 75) acc.milestone_runs_pts += 12;
    if (bm.runs >= 100) acc.milestone_runs_pts += 16;

    // Strike rate (min 10 balls faced in this match)
    if (bm.balls >= 10) {
      const sr = (bm.runs / bm.balls) * 100;
      if (sr > 170) acc.sr_pts += 6;
      else if (sr > 150) acc.sr_pts += 4;
      else if (sr >= 130) acc.sr_pts += 2;
      else if (sr >= 60 && sr <= 70) acc.sr_pts -= 2;
      else if (sr >= 50 && sr < 60) acc.sr_pts -= 4;
      else if (sr < 50) acc.sr_pts -= 6;
    }
  }

  // Bowling milestones + economy rate
  for (const [playerName, bwm] of matchBowl) {
    const acc = getOrCreate(allStats, playerName);

    // Wicket milestones (cumulative: 5W earns all three tiers)
    if (bwm.wickets >= 3) acc.milestone_wkts_pts += 4;
    if (bwm.wickets >= 4) acc.milestone_wkts_pts += 8;
    if (bwm.wickets >= 5) acc.milestone_wkts_pts += 12;

    // Economy rate (min 2 overs = 12 legal balls in this match)
    if (bwm.balls >= 12) {
      const economy = bwm.runs / (bwm.balls / 6);
      if (economy < 5) acc.economy_pts += 6;
      else if (economy <= 5.99) acc.economy_pts += 4;
      else if (economy <= 7) acc.economy_pts += 2;
      else if (economy >= 10 && economy <= 11) acc.economy_pts -= 2;
      else if (economy > 11 && economy <= 12) acc.economy_pts -= 4;
      else if (economy > 12) acc.economy_pts -= 6;
    }
  }

  // 3-catch bonus (+4 for 3+ catches in a single match)
  for (const [playerName, catchCount] of matchCatches) {
    if (catchCount >= 3) {
      getOrCreate(allStats, playerName).catch_bonus_pts += 4;
    }
  }

  // Appearance tracking
  for (const playerName of appearedInMatch) {
    const acc = getOrCreate(allStats, playerName);
    acc.matches_played += 1;
    if (announcedPlayers.has(playerName)) {
      acc.lineup_appearances += 1;
    } else {
      // Appeared in play but not in announced XI → substitute / impact player
      acc.substitute_appearances += 1;
    }
  }
}

// ── ZIP processor ─────────────────────────────────────────────────────────────

export interface ProcessZipResult {
  stats: Map<string, CricsheetAccumulator>;
  matchesProcessed: number;
  matchesSkipped: number;
  seasons: string[];
}

// ── Per-match player stats (for match_results table) ─────────────────────────

export interface CricsheetMatchEntry {
  /** Unique match id derived from the ZIP entry name (no extension). */
  matchId: string;
  /** ISO date string of the first match date, e.g. "2026-03-15" */
  matchDate: string;
  /** Season string, e.g. "2026" */
  season: string;
  /** Player stats in the PlayerMatchStats wire format used by match_results. */
  playerStats: Record<string, PlayerMatchStats>;
}

/**
 * Convert a CricsheetAccumulator (season aggregate) into the PlayerMatchStats
 * format used by the match_results table / webscrape-accept route.
 *
 * Note: CricsheetAccumulator stores per-match non-linear bonuses inline
 * because processMatch() already computes them from per-match data.
 * We map them directly.
 */
function accumulatorToMatchStats(
  acc: CricsheetAccumulator,
): PlayerMatchStats {
  return {
    runs: acc.runs,
    balls_faced: acc.balls_faced,
    fours: acc.fours,
    sixes: acc.sixes,
    dismissed: acc.ducks > 0,      // true if they got a duck this match (0 & dismissed)
    balls_bowled: acc.balls_bowled,
    runs_conceded: acc.runs_conceded,
    wickets: acc.wickets,
    maiden_overs: acc.maiden_overs,
    lbw_bowled_wickets: acc.lbw_bowled_wickets,
    catches: acc.catches,
    stumpings: acc.stumpings,
    run_outs: acc.run_outs_indirect + acc.run_outs_direct,
    appeared: acc.lineup_appearances > 0 || acc.substitute_appearances > 0,
    milestone_runs_pts: acc.milestone_runs_pts,
    sr_pts: acc.sr_pts,
    duck_penalty: acc.ducks > 0 ? -2 : 0,
    milestone_wkts_pts: acc.milestone_wkts_pts,
    economy_pts: acc.economy_pts,
    catch_bonus_pts: acc.catch_bonus_pts,
  };
}

export interface ProcessZipPerMatchResult {
  matches: CricsheetMatchEntry[];
  matchesProcessed: number;
  matchesSkipped: number;
  seasons: string[];
}

/**
 * Process a single Cricsheet match JSON file (not a ZIP).
 * Returns a ProcessZipPerMatchResult with exactly one match entry on success.
 *
 * @param jsonBuffer  Raw bytes of a single Cricsheet match JSON file
 * @param filename    Original filename (used to derive matchId, e.g. "1234567.json")
 * @param season      If supplied and the match season doesn't match, returns 0 processed
 * @param uuidMap      Optional UUID → full-name map (from final_mapping.json)
 * @param shortNameMap Optional normalised-short-name → full-name fallback map
 */
export function processSingleMatchJson(
  jsonBuffer: Buffer,
  filename: string,
  season?: string,
  uuidMap?: Map<string, string>,
  shortNameMap?: Map<string, string>,
): ProcessZipPerMatchResult {
  let match: CricsheetMatch;
  try {
    match = JSON.parse(jsonBuffer.toString("utf8")) as CricsheetMatch;
  } catch {
    return { matches: [], matchesProcessed: 0, matchesSkipped: 1, seasons: [] };
  }

  const matchSeason = String(match.info.season ?? "");
  if (season && matchSeason !== season) {
    return { matches: [], matchesProcessed: 0, matchesSkipped: 1, seasons: [] };
  }

  const eventName = (match.info.event?.name ?? match.info.competition ?? "").toLowerCase();
  if (!eventName.includes("indian premier league") && !eventName.includes("ipl")) {
    return { matches: [], matchesProcessed: 0, matchesSkipped: 1, seasons: [] };
  }

  const matchStats = new Map<string, CricsheetAccumulator>();
  processMatch(match, matchStats, uuidMap, shortNameMap);

  const playerStats: Record<string, PlayerMatchStats> = {};
  for (const [name, acc] of matchStats) {
    playerStats[name] = accumulatorToMatchStats(acc);
  }

  // matchId from filename (strip extension and any directory prefix)
  const matchId = filename.replace(/^.*[\\/]/, "").replace(/\.json$/i, "");
  const matchDate = (match.info.dates ?? [])[0] ?? matchSeason;

  return {
    matches: [{ matchId, matchDate, season: matchSeason || (season ?? ""), playerStats }],
    matchesProcessed: 1,
    matchesSkipped: 0,
    seasons: matchSeason ? [matchSeason] : [],
  };
}

/**
 * Parse a Cricsheet ZIP buffer and return ONE entry PER MATCH.
 * Each entry contains per-player stats in the PlayerMatchStats wire format
 * so they can be upserted directly into match_results.
 *
 * @param zipBuffer  Raw bytes of the Cricsheet IPL JSON zip
 * @param season     If supplied, only process matches for this season (e.g. "2026")
 * @param nameMap    Optional: normalised-short-name → full name. Translates Cricsheet
 *                   short names (e.g. "HH Pandya") to full names ("Hardik Pandya")
 *                   so stats keys match the room's player names exactly.
 */
export function processZipPerMatch(
  zipBuffer: Buffer,
  season?: string,
  uuidMap?: Map<string, string>,
  shortNameMap?: Map<string, string>,
): ProcessZipPerMatchResult {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  const matches: CricsheetMatchEntry[] = [];
  const seenSeasons = new Set<string>();
  let matchesProcessed = 0;
  let matchesSkipped = 0;

  for (const entry of entries) {
    if (entry.isDirectory || !entry.entryName.endsWith(".json")) continue;

    let match: CricsheetMatch;
    try {
      match = JSON.parse(entry.getData().toString("utf8")) as CricsheetMatch;
    } catch {
      matchesSkipped += 1;
      continue;
    }

    // Season filter
    const matchSeason = String(match.info.season ?? "");
    if (season && matchSeason !== season) {
      matchesSkipped += 1;
      continue;
    }

    // Must be an IPL match
    const eventName = (match.info.event?.name ?? match.info.competition ?? "").toLowerCase();
    if (!eventName.includes("indian premier league") && !eventName.includes("ipl")) {
      matchesSkipped += 1;
      continue;
    }

    if (matchSeason) seenSeasons.add(matchSeason);

    // Process this match in isolation
    const matchStats = new Map<string, CricsheetAccumulator>();
    processMatch(match, matchStats, uuidMap, shortNameMap);

    // Convert to PlayerMatchStats shape
    const playerStats: Record<string, PlayerMatchStats> = {};
    for (const [name, acc] of matchStats) {
      playerStats[name] = accumulatorToMatchStats(acc);
    }

    // Derive a stable matchId from the entry filename (without extension)
    const matchId = entry.entryName
      .replace(/^.*\//, "")  // strip directory prefix
      .replace(/\.json$/, ""); // strip extension

    const matchDate = (match.info.dates ?? [])[0] ?? matchSeason;

    matches.push({ matchId, matchDate, season: matchSeason, playerStats });
    matchesProcessed += 1;
  }

  return {
    matches,
    matchesProcessed,
    matchesSkipped,
    seasons: Array.from(seenSeasons).sort(),
  };
}

/**
 * Parse a Cricsheet ZIP buffer and return aggregated fantasy stats per player.
 *
 * @param zipBuffer  Raw bytes of the Cricsheet IPL JSON zip
 * @param season     If supplied, only process matches for this season (e.g. "2026")
 */
export function processZip(
  zipBuffer: Buffer,
  season?: string,
  uuidMap?: Map<string, string>,
  shortNameMap?: Map<string, string>,
): ProcessZipResult {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  const stats = new Map<string, CricsheetAccumulator>();
  const seenSeasons = new Set<string>();
  let matchesProcessed = 0;
  let matchesSkipped = 0;

  for (const entry of entries) {
    if (entry.isDirectory || !entry.entryName.endsWith(".json")) continue;

    let match: CricsheetMatch;
    try {
      match = JSON.parse(entry.getData().toString("utf8")) as CricsheetMatch;
    } catch {
      matchesSkipped += 1;
      continue;
    }

    // Season filter
    const matchSeason = String(match.info.season ?? "");
    if (season && matchSeason !== season) {
      matchesSkipped += 1;
      continue;
    }

    // Must be an IPL match
    const eventName = (match.info.event?.name ?? match.info.competition ?? "").toLowerCase();
    if (!eventName.includes("indian premier league") && !eventName.includes("ipl")) {
      matchesSkipped += 1;
      continue;
    }

    if (matchSeason) seenSeasons.add(matchSeason);

    processMatch(match, stats, uuidMap, shortNameMap);
    matchesProcessed += 1;
  }

  return {
    stats,
    matchesProcessed,
    matchesSkipped,
    seasons: Array.from(seenSeasons).sort(),
  };
}
