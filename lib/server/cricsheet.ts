/**
 * Cricsheet data parser.
 *
 * Reads Cricsheet JSON files or ZIPs, processes ball-by-ball data, and
 * produces per-player fantasy stats aligned with the app's scoring rules.
 */

import AdmZip from "adm-zip";

import type { PlayerStats } from "@/lib/domain/scoring";
import type { PlayerMatchStats } from "@/lib/server/webscrape/parser";

interface CricsheetExtras {
  wides?: number;
  noballs?: number;
  legbyes?: number;
  byes?: number;
  penalty?: number;
}

interface CricsheetWicket {
  player_out: string;
  kind: string;
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
    players?: Record<string, string[]>;
    dates?: string[];
    registry?: { people?: Record<string, string> };
  };
  innings?: CricsheetInning[];
}

export type CricsheetAccumulator = Required<
  Omit<PlayerStats, "ipl_team" | "cricsheet_name">
> & {
  ipl_team?: string;
  cricsheet_name?: string;
};

function empty(): CricsheetAccumulator {
  return {
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

function getOrCreate(
  map: Map<string, CricsheetAccumulator>,
  name: string,
): CricsheetAccumulator {
  let acc = map.get(name);
  if (!acc) {
    acc = empty();
    map.set(name, acc);
  }
  return acc;
}

function normalizeShortName(name: string): string {
  return name.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

function resolveUuidToName(
  uuidMap: Map<string, string> | undefined,
  uuid: string | undefined,
): string | undefined {
  if (!uuidMap || !uuid) return undefined;
  return uuidMap.get(uuid) ?? uuidMap.get(uuid.slice(0, 8));
}

export function processMatch(
  match: CricsheetMatch,
  allStats: Map<string, CricsheetAccumulator>,
  uuidMap?: Map<string, string>,
  shortNameMap?: Map<string, string>,
): void {
  const registry = match.info.registry?.people ?? {};

  const resolve = (name: string): string => {
    const fullFromUuid = resolveUuidToName(uuidMap, registry[name]);
    if (fullFromUuid) return fullFromUuid;

    const fullFromShort = shortNameMap?.get(normalizeShortName(name));
    if (fullFromShort) return fullFromShort;

    return name;
  };

  const innings = match.innings ?? [];

  const announcedPlayers = new Set<string>();
  for (const teamPlayers of Object.values(match.info.players ?? {})) {
    for (const player of teamPlayers) {
      announcedPlayers.add(resolve(player));
    }
  }

  const appearedInMatch = new Set<string>();
  const matchBat = new Map<string, { runs: number; balls: number; dismissed: boolean }>();
  const matchBowl = new Map<string, { balls: number; runs: number; wickets: number }>();
  const matchCatches = new Map<string, number>();

  for (const inning of innings) {
    if (inning.super_over) continue;

    for (const over of inning.overs ?? []) {
      const overBowlerName = over.deliveries[0]?.bowler ?? "";
      let overTotalRuns = 0;
      let overLegalBalls = 0;

      for (const delivery of over.deliveries) {
        const isWide = (delivery.extras?.wides ?? 0) > 0;

        const batter = resolve(delivery.batter);
        appearedInMatch.add(batter);
        const batterAcc = getOrCreate(allStats, batter);
        batterAcc.runs += delivery.runs.batter;
        if (!isWide) batterAcc.balls_faced += 1;
        if (delivery.runs.batter === 4) batterAcc.fours += 1;
        if (delivery.runs.batter === 6) batterAcc.sixes += 1;

        const batMatch = matchBat.get(batter) ?? { runs: 0, balls: 0, dismissed: false };
        batMatch.runs += delivery.runs.batter;
        if (!isWide) batMatch.balls += 1;
        matchBat.set(batter, batMatch);

        const bowler = resolve(delivery.bowler);
        appearedInMatch.add(bowler);
        const bowlAcc = getOrCreate(allStats, bowler);
        bowlAcc.runs_conceded += delivery.runs.total;

        if (!isWide) {
          bowlAcc.balls_bowled += 1;
          overLegalBalls += 1;
          if (delivery.runs.total === 0) bowlAcc.dot_balls += 1;
        }
        overTotalRuns += delivery.runs.total;

        const bowlMatch = matchBowl.get(bowler) ?? { balls: 0, runs: 0, wickets: 0 };
        bowlMatch.runs += delivery.runs.total;
        if (!isWide) bowlMatch.balls += 1;
        matchBowl.set(bowler, bowlMatch);

        for (const wicket of delivery.wickets ?? []) {
          const playerOut = resolve(wicket.player_out);
          appearedInMatch.add(playerOut);

          const outBatMatch = matchBat.get(playerOut) ?? {
            runs: 0,
            balls: 0,
            dismissed: false,
          };
          outBatMatch.dismissed = true;
          matchBat.set(playerOut, outBatMatch);

          const isRunOut = wicket.kind === "run out";
          const isRetired = wicket.kind.startsWith("retired");

          if (!isRunOut && !isRetired) {
            bowlAcc.wickets += 1;
            bowlMatch.wickets += 1;
            if (wicket.kind === "lbw" || wicket.kind === "bowled") {
              bowlAcc.lbw_bowled_wickets += 1;
            }
          }

          for (const fielder of wicket.fielders ?? []) {
            if (fielder.substitute) continue;

            const fielderName = resolve(fielder.name);
            appearedInMatch.add(fielderName);
            const fieldAcc = getOrCreate(allStats, fielderName);

            if (wicket.kind === "caught") {
              fieldAcc.catches += 1;
              matchCatches.set(fielderName, (matchCatches.get(fielderName) ?? 0) + 1);
            } else if (wicket.kind === "stumped") {
              fieldAcc.stumpings += 1;
            } else if (wicket.kind === "run out") {
              fieldAcc.run_outs_indirect += 1;
            }
          }
        }
      }

      if (overLegalBalls === 6 && overTotalRuns === 0) {
        const maidenBowler = allStats.get(resolve(overBowlerName));
        if (maidenBowler) maidenBowler.maiden_overs += 1;
      }
    }
  }

  for (const [playerName, batMatch] of matchBat) {
    const acc = getOrCreate(allStats, playerName);

    if (batMatch.dismissed && batMatch.runs === 0) acc.ducks += 1;

    if (batMatch.runs >= 25) acc.milestone_runs_pts += 4;
    if (batMatch.runs >= 50) acc.milestone_runs_pts += 8;
    if (batMatch.runs >= 75) acc.milestone_runs_pts += 12;
    if (batMatch.runs >= 100) acc.milestone_runs_pts += 16;

    if (batMatch.balls >= 10) {
      const sr = (batMatch.runs / batMatch.balls) * 100;
      if (sr > 170) acc.sr_pts += 6;
      else if (sr > 150) acc.sr_pts += 4;
      else if (sr >= 130) acc.sr_pts += 2;
      else if (sr >= 60 && sr <= 70) acc.sr_pts -= 2;
      else if (sr >= 50 && sr < 60) acc.sr_pts -= 4;
      else if (sr < 50) acc.sr_pts -= 6;
    }
  }

  for (const [playerName, bowlMatch] of matchBowl) {
    const acc = getOrCreate(allStats, playerName);

    if (bowlMatch.wickets >= 3) acc.milestone_wkts_pts += 4;
    if (bowlMatch.wickets >= 4) acc.milestone_wkts_pts += 8;
    if (bowlMatch.wickets >= 5) acc.milestone_wkts_pts += 12;

    if (bowlMatch.balls >= 12) {
      const economy = bowlMatch.runs / (bowlMatch.balls / 6);
      if (economy < 5) acc.economy_pts += 6;
      else if (economy <= 5.99) acc.economy_pts += 4;
      else if (economy <= 7) acc.economy_pts += 2;
      else if (economy >= 10 && economy <= 11) acc.economy_pts -= 2;
      else if (economy > 11 && economy <= 12) acc.economy_pts -= 4;
      else if (economy > 12) acc.economy_pts -= 6;
    }
  }

  for (const [playerName, catches] of matchCatches) {
    if (catches >= 3) {
      getOrCreate(allStats, playerName).catch_bonus_pts += 4;
    }
  }

  for (const playerName of appearedInMatch) {
    const acc = getOrCreate(allStats, playerName);
    acc.matches_played += 1;
    if (announcedPlayers.has(playerName)) acc.lineup_appearances += 1;
    else acc.substitute_appearances += 1;
  }
}

export interface ProcessZipResult {
  stats: Map<string, CricsheetAccumulator>;
  matchesProcessed: number;
  matchesSkipped: number;
  seasons: string[];
}

export interface CricsheetMatchEntry {
  matchId: string;
  matchDate: string;
  season: string;
  playerStats: Record<string, PlayerMatchStats>;
}

function accumulatorToMatchStats(acc: CricsheetAccumulator): PlayerMatchStats {
  return {
    runs: acc.runs,
    balls_faced: acc.balls_faced,
    fours: acc.fours,
    sixes: acc.sixes,
    dismissed: acc.ducks > 0,
    balls_bowled: acc.balls_bowled,
    runs_conceded: acc.runs_conceded,
    dot_balls: acc.dot_balls,
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
  if (season && matchSeason && matchSeason !== season) {
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

  const matchId = filename.replace(/^.*[\\/]/, "").replace(/\.json$/i, "");
  const matchDate = (match.info.dates ?? [])[0] ?? matchSeason;

  return {
    matches: [
      {
        matchId,
        matchDate,
        season: matchSeason || (season ?? ""),
        playerStats,
      },
    ],
    matchesProcessed: 1,
    matchesSkipped: 0,
    seasons: matchSeason ? [matchSeason] : [],
  };
}

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

    const matchSeason = String(match.info.season ?? "");
    if (season && matchSeason && matchSeason !== season) {
      matchesSkipped += 1;
      continue;
    }

    const eventName = (match.info.event?.name ?? match.info.competition ?? "").toLowerCase();
    if (!eventName.includes("indian premier league") && !eventName.includes("ipl")) {
      matchesSkipped += 1;
      continue;
    }

    if (matchSeason) seenSeasons.add(matchSeason);

    const matchStats = new Map<string, CricsheetAccumulator>();
    processMatch(match, matchStats, uuidMap, shortNameMap);

    const playerStats: Record<string, PlayerMatchStats> = {};
    for (const [name, acc] of matchStats) {
      playerStats[name] = accumulatorToMatchStats(acc);
    }

    const matchId = entry.entryName.replace(/^.*\//, "").replace(/\.json$/i, "");
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

    const matchSeason = String(match.info.season ?? "");
    if (season && matchSeason && matchSeason !== season) {
      matchesSkipped += 1;
      continue;
    }

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
