/**
 * RapidAPI - Cricbuzz Cricket Score provider - SECONDARY source
 * Host: cricbuzz-cricket.p.rapidapi.com
 * Sign up at https://rapidapi.com/cricketapilive/api/cricbuzz-cricket
 */

import {
  extractDisplayName,
  mergeInningStats,
  processInning,
  type NormalizedMatch,
  type ScorecardBattingRow,
  type ScorecardBowlingRow,
} from "./parser";
import { TTL, withCache } from "@/lib/server/redis";

const HOST = process.env.RAPIDAPI_CRICBUZZ_HOST ?? "cricbuzz-cricket.p.rapidapi.com";
const BASE = `https://${HOST}`;

/** All configured RapidAPI keys in priority order (RAPIDAPI_KEY, RAPIDAPI_KEY_2, …). */
function getKeys(): string[] {
  return [
    process.env.RAPIDAPI_KEY,
    process.env.RAPIDAPI_KEY_2,
  ].filter((k): k is string => Boolean(k));
}

/** HTTP status codes that mean "this key is exhausted — try the next one". */
function isQuotaError(status: number): boolean {
  return status === 429 || status === 402;
}

async function fetchRaw<T>(path: string): Promise<T> {
  const keys = getKeys();
  if (keys.length === 0) throw new Error("RAPIDAPI_KEY not set");

  let lastStatus = 0;
  for (let i = 0; i < keys.length; i++) {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        "X-RapidAPI-Key": keys[i]!,
        "X-RapidAPI-Host": HOST,
        "User-Agent": "IPL-Auction-Platform/1.0",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (isQuotaError(res.status)) {
      lastStatus = res.status;
      continue; // try next key
    }
    if (!res.ok) throw new Error(`RapidAPI HTTP ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  throw new Error(
    `RATE_LIMITED — all ${keys.length} RapidAPI key${keys.length > 1 ? "s" : ""} exhausted (last HTTP ${lastStatus})`,
  );
}

function get<T>(path: string, ttl = TTL.MATCH_LIST): Promise<T> {
  // Scorecard paths get a long TTL — completed match data never changes
  const effectiveTtl = path.includes("/scard") ? TTL.SCORECARD : ttl;
  return withCache<T>(`ipl:ra:${path}`, effectiveTtl, () => fetchRaw<T>(path));
}

interface CricbuzzSeriesItem {
  id: string;
  name: string;
}

interface CricbuzzSeriesCategory {
  seriesMapProto?: Array<{ series?: CricbuzzSeriesItem[] }>;
}

function isIPLSeries(name: string, season: string): boolean {
  const normalized = name.toLowerCase();
  const hasIpl = normalized.includes("indian premier league") ||
    normalized.includes(" ipl ") ||
    normalized.startsWith("ipl ") ||
    normalized.endsWith(" ipl") ||
    normalized === "ipl";

  return hasIpl && name.includes(season);
}

function extractSeries(data: CricbuzzSeriesCategory): CricbuzzSeriesItem[] {
  const list: CricbuzzSeriesItem[] = [];
  for (const block of data?.seriesMapProto ?? []) {
    for (const series of block.series ?? []) {
      list.push(series);
    }
  }
  return list;
}

export async function findIPLSeriesId(season: string): Promise<string> {
  const categories = ["league", "domestic", "international"];
  const errors: string[] = [];

  for (const category of categories) {
    try {
      const data = await get<CricbuzzSeriesCategory>(`/series/v1/${category}`, TTL.SERIES_ID);
      const found = extractSeries(data).find((series) => isIPLSeries(series.name ?? "", season));
      if (found) return String(found.id);
    } catch (error) {
      errors.push(`${category}: ${String(error)}`);
    }
  }

  throw new Error(
    `IPL ${season} series not found on RapidAPI/Cricbuzz (tried: ${categories.join(", ")}). ${errors.join(" | ")}`,
  );
}

interface CricbuzzMatch {
  matchInfo?: {
    matchId?: number;
    startDate?: string;
    team1?: { teamName?: string };
    team2?: { teamName?: string };
    state?: string;
    stateTitle?: string;
    status?: string;
  };
}

function isCompletedMatch(match: CricbuzzMatch): boolean {
  const state = match.matchInfo?.state?.trim().toLowerCase();
  const stateTitle = match.matchInfo?.stateTitle?.trim().toLowerCase();
  const status = match.matchInfo?.status?.trim().toLowerCase() ?? "";

  if (state === "complete" || state === "completed") return true;
  if (stateTitle === "complete" || stateTitle === "completed") return true;

  return status.includes("won by") ||
    status.includes("match tied") ||
    status.includes("match drawn") ||
    status.includes("no result") ||
    status.startsWith("result");
}

export async function listSeriesMatches(seriesId: string): Promise<CricbuzzMatch[]> {
  const data = await get<{
    matchDetails?: Array<{
      matchDetailsMap?: Record<string, { match?: CricbuzzMatch[] }> | { match?: CricbuzzMatch[] };
    }>;
  }>(`/series/v1/${seriesId}`);

  const matches: CricbuzzMatch[] = [];
  for (const block of data?.matchDetails ?? []) {
    const map = block?.matchDetailsMap;
    if (!map) continue;

    if (Array.isArray((map as { match?: CricbuzzMatch[] }).match)) {
      matches.push(...((map as { match: CricbuzzMatch[] }).match));
      continue;
    }

    for (const value of Object.values(map)) {
      if (value && Array.isArray((value as { match?: CricbuzzMatch[] }).match)) {
        matches.push(...((value as { match: CricbuzzMatch[] }).match));
      }
    }
  }

  return matches;
}

interface CricbuzzBatter {
  batName?: unknown;
  name?: string;
  runs?: number;
  balls?: number | string;
  fours?: number;
  sixes?: number;
  strikeRate?: number;
  outDesc?: string;
  outdec?: string;
}

interface CricbuzzBowler {
  bowlName?: unknown;
  name?: string;
  overs?: number | string;
  maidens?: number;
  runs?: number;
  wickets?: number;
  economy?: number;
  dots?: number;
}

interface CricbuzzInning {
  inningsId?: number;
  inningsid?: number;
  batTeamDetails?: {
    batsmenData?: Record<string, CricbuzzBatter>;
  };
  bowlTeamDetails?: {
    bowlersData?: Record<string, CricbuzzBowler>;
  };
  batsman?: CricbuzzBatter[];
  bowler?: CricbuzzBowler[];
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function fetchMatchScorecard(
  match: CricbuzzMatch,
  season: string,
): Promise<NormalizedMatch> {
  const matchId = String(match.matchInfo?.matchId ?? "");
  const data = await get<{ scoreCard?: CricbuzzInning[]; scorecard?: CricbuzzInning[] }>(
    `/mcenter/v1/${matchId}/scard`,
  );
  const innings = data?.scoreCard ?? data?.scorecard ?? [];

  const inningStats = innings.map((inning) => {
    const battingSource = inning.batsman ?? Object.values(inning.batTeamDetails?.batsmenData ?? {});
    const batting: ScorecardBattingRow[] = battingSource
      .map((batter) => ({
        name: extractDisplayName(batter.batName ?? batter.name),
        runs: toNumber(batter.runs),
        balls: toNumber(batter.balls),
        fours: toNumber(batter.fours),
        sixes: toNumber(batter.sixes),
        outDesc: String(batter.outDesc ?? batter.outdec ?? "").trim(),
      }))
      .filter((batter) => batter.name)
      .map((batter) => ({
        name: batter.name,
        runs: batter.runs,
        balls: batter.balls,
        fours: batter.fours,
        sixes: batter.sixes,
        outDesc: batter.outDesc,
      }));

    const bowlingSource = inning.bowler ?? Object.values(inning.bowlTeamDetails?.bowlersData ?? {});
    const bowling: ScorecardBowlingRow[] = bowlingSource
      .map((bowler) => ({
        name: extractDisplayName(bowler.bowlName ?? bowler.name),
        overs: bowler.overs ?? 0,
        maidens: toNumber(bowler.maidens),
        runs: toNumber(bowler.runs),
        wickets: toNumber(bowler.wickets),
        dot_balls: toNumber(bowler.dots),
      }))
      .filter((bowler) => bowler.name)
      .map((bowler) => ({
        name: bowler.name,
        overs: bowler.overs,
        maidens: bowler.maidens,
        runs: bowler.runs,
        wickets: bowler.wickets,
        dot_balls: bowler.dot_balls,
      }));

    return processInning(batting, bowling);
  });

  const merged = mergeInningStats(...inningStats);

  const dateMs = parseInt(match.matchInfo?.startDate ?? "0", 10);
  const matchDate = dateMs ? new Date(dateMs).toISOString().split("T")[0]! : "";

  return {
    matchId,
    matchDate,
    season,
    homeTeam: match.matchInfo?.team1?.teamName ?? "",
    awayTeam: match.matchInfo?.team2?.teamName ?? "",
    source: "rapidapi",
    sourceLabel: "RapidAPI / Cricbuzz",
    playerStats: merged,
  };
}

interface CricbuzzRecentMatchWrapper {
  seriesId?: number;
  seriesName?: string;
  matches?: CricbuzzMatch[];
}

interface CricbuzzTypeMatch {
  matchType?: string;
  seriesMatches?: Array<{ seriesAdWrapper?: CricbuzzRecentMatchWrapper }>;
}

async function findIPLSeriesIdViaRecent(season: string): Promise<string | null> {
  const data = await get<{ typeMatches?: CricbuzzTypeMatch[] }>("/matches/v1/recent", TTL.SERIES_ID);
  for (const typeMatch of data?.typeMatches ?? []) {
    for (const seriesMatch of typeMatch?.seriesMatches ?? []) {
      const wrapper = seriesMatch?.seriesAdWrapper;
      if (wrapper?.seriesName && isIPLSeries(wrapper.seriesName, season) && wrapper.seriesId != null) {
        return String(wrapper.seriesId);
      }
    }
  }
  return null;
}

export async function fetchIPLMatchesFromRapidAPI(
  season: string,
  onProgress?: (done: number, total: number) => void,
): Promise<NormalizedMatch[]> {
  let completed: CricbuzzMatch[] = [];
  let lookupError: unknown = null;

  try {
    const seriesId = await findIPLSeriesId(season);
    const allMatches = await listSeriesMatches(seriesId);
    completed = allMatches.filter(isCompletedMatch);
  } catch (error) {
    lookupError = error;

    const recentSeriesId = await findIPLSeriesIdViaRecent(season);
    if (recentSeriesId) {
      const allMatches = await listSeriesMatches(recentSeriesId);
      completed = allMatches.filter(isCompletedMatch);
    }
  }

  if (completed.length === 0) {
    if (lookupError) {
      throw lookupError;
    }
    throw new Error(`RapidAPI / Cricbuzz found IPL ${season}, but no completed matches are available yet.`);
  }

  const results: NormalizedMatch[] = [];
  let lastError: unknown = null;
  for (let index = 0; index < completed.length; index++) {
    const match = completed[index]!;
    try {
      const normalizedMatch = await fetchMatchScorecard(match, season);
      results.push(normalizedMatch);
    } catch (error) {
      lastError = error;
    }
    onProgress?.(index + 1, completed.length);
  }

  if (results.length === 0) {
    throw new Error(
      `RapidAPI / Cricbuzz scorecards could not be parsed.${lastError instanceof Error ? ` ${lastError.message}` : ""}`,
    );
  }

  return results;
}
