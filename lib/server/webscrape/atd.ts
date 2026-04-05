/**
 * AllThingsDev — Cricbuzz Official Cricket API client — TERTIARY source
 * Host: Cricbuzz-Official-Cricket-API.allthingsdev.co
 * Sign up at https://allthingsdev.co
 *
 * Auth headers:
 *   x-apihub-key   → your ATD API key (ATD_API_KEY)
 *   x-apihub-host  → Cricbuzz-Official-Cricket-API.allthingsdev.co
 *   x-apihub-endpoint → optional per-endpoint UUID (ATD_API_ENDPOINT)
 *
 * Scorecard path: /match/{matchId}/scorecard
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

const ATD_HOST = "Cricbuzz-Official-Cricket-API.allthingsdev.co";
const BASE = "https://Cricbuzz-Official-Cricket-API.proxy-production.allthingsdev.co";

async function fetchRaw<T>(path: string): Promise<T> {
  const key = process.env.ATD_API_KEY;
  if (!key) throw new Error("ATD_API_KEY not set");

  const headers: Record<string, string> = {
    "x-apihub-key": key,
    "x-apihub-host": ATD_HOST,
    "User-Agent": "IPL-Auction-Platform/1.0",
  };

  // Optional per-endpoint UUID — not required for all endpoints
  const endpointId = process.env.ATD_API_ENDPOINT;
  if (endpointId) headers["x-apihub-endpoint"] = endpointId;

  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`ATD HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function get<T>(path: string, ttl = TTL.MATCH_LIST): Promise<T> {
  // Scorecard paths get a long TTL — completed match data never changes
  const effectiveTtl = path.includes("/scorecard") ? TTL.SCORECARD : ttl;
  return withCache<T>(`ipl:atd:${path}`, effectiveTtl, () => fetchRaw<T>(path));
}

// ── Series discovery (same Cricbuzz data shape as RapidAPI) ──────────────────

interface AtdSeriesItem {
  id?: number | string;
  name?: string;
}

interface AtdSeriesCategory {
  seriesMapProto?: Array<{ series?: AtdSeriesItem[] }>;
}

function isIPLSeries(name: string, season: string): boolean {
  const n = name.toLowerCase();
  const hasIpl =
    n.includes("indian premier league") ||
    n.includes(" ipl ") ||
    n.startsWith("ipl ") ||
    n.endsWith(" ipl") ||
    n === "ipl";
  return hasIpl && name.includes(season);
}

function extractSeries(data: AtdSeriesCategory): AtdSeriesItem[] {
  const list: AtdSeriesItem[] = [];
  for (const block of data?.seriesMapProto ?? []) {
    for (const s of block.series ?? []) {
      list.push(s);
    }
  }
  return list;
}

export async function findIPLSeriesId(season: string): Promise<string> {
  const categories = ["league", "domestic", "international"];
  const errs: string[] = [];

  for (const cat of categories) {
    try {
      const data = await get<AtdSeriesCategory>(`/series/v1/${cat}`, TTL.SERIES_ID);
      const found = extractSeries(data).find((s) => isIPLSeries(String(s.name ?? ""), season));
      if (found) return String(found.id);
    } catch (e) {
      errs.push(`${cat}: ${String(e)}`);
    }
  }

  throw new Error(
    `IPL ${season} series not found on ATD/Cricbuzz (tried: ${categories.join(", ")}). ${errs.join(" | ")}`,
  );
}

// ── Match listing ─────────────────────────────────────────────────────────────

interface AtdMatch {
  matchInfo?: {
    matchId?: number | string;
    startDate?: string;
    team1?: { teamName?: string };
    team2?: { teamName?: string };
    state?: string;
  };
}

export async function listSeriesMatches(seriesId: string): Promise<AtdMatch[]> {
  const data = await get<{
    matchDetails?: Array<{
      matchDetailsMap?: Record<string, { match?: AtdMatch[] }> | { match?: AtdMatch[] };
    }>;
  }>(`/series/v1/${seriesId}`);

  const matches: AtdMatch[] = [];
  for (const block of data?.matchDetails ?? []) {
    const map = block?.matchDetailsMap;
    if (!map) continue;
    if (Array.isArray((map as { match?: AtdMatch[] }).match)) {
      matches.push(...(map as { match: AtdMatch[] }).match);
    } else {
      for (const val of Object.values(map)) {
        if (val && Array.isArray((val as { match?: AtdMatch[] }).match)) {
          matches.push(...(val as { match: AtdMatch[] }).match);
        }
      }
    }
  }
  return matches;
}

// ── Scorecard ─────────────────────────────────────────────────────────────────
// ATD scorecard path: /match/{matchId}/scorecard
// Response shape mirrors Cricbuzz: { scoreCard: [...innings] }

interface AtdBatter {
  batName?: unknown;
  runs?: number;
  balls?: number;
  fours?: number;
  sixes?: number;
  outDesc?: string;
}

interface AtdBowler {
  bowlName?: unknown;
  overs?: number;
  maidens?: number;
  runs?: number;
  wickets?: number;
  dots?: number;
}

interface AtdInning {
  inningsId?: number;
  batTeamDetails?: { batsmenData?: Record<string, AtdBatter> };
  bowlTeamDetails?: { bowlersData?: Record<string, AtdBowler> };
}

export async function fetchMatchScorecard(
  match: AtdMatch,
  season: string,
): Promise<NormalizedMatch> {
  const matchId = String(match.matchInfo?.matchId ?? "");
  const data = await get<{ scoreCard?: AtdInning[] }>(`/match/${matchId}/scorecard`);
  const innings = data?.scoreCard ?? [];

  const inningStats = innings.map((inning) => {
    const batting: ScorecardBattingRow[] = Object.values(
      inning.batTeamDetails?.batsmenData ?? {},
    )
      .map((b) => ({
        name: extractDisplayName(b.batName),
        runs: b.runs ?? 0,
        balls: b.balls ?? 0,
        fours: b.fours ?? 0,
        sixes: b.sixes ?? 0,
        outDesc: String(b.outDesc ?? "").trim(),
      }))
      .filter((b) => b.name)
      .map((b) => ({
        name: b.name,
        runs: b.runs,
        balls: b.balls,
        fours: b.fours,
        sixes: b.sixes,
        outDesc: b.outDesc,
      }));

    const bowling: ScorecardBowlingRow[] = Object.values(
      inning.bowlTeamDetails?.bowlersData ?? {},
    )
      .map((b) => ({
        name: extractDisplayName(b.bowlName),
        overs: b.overs ?? 0,
        maidens: b.maidens ?? 0,
        runs: b.runs ?? 0,
        wickets: b.wickets ?? 0,
        dot_balls: b.dots ?? 0,
      }))
      .filter((b) => b.name)
      .map((b) => ({
        name: b.name,
        overs: b.overs,
        maidens: b.maidens,
        runs: b.runs,
        wickets: b.wickets,
        dot_balls: b.dot_balls,
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
    source: "atd",
    sourceLabel: "AllThingsDev / Cricbuzz",
    playerStats: merged,
  };
}

// ── Fallback: recent matches ──────────────────────────────────────────────────

interface AtdRecentWrapper {
  seriesId?: number;
  seriesName?: string;
  matches?: AtdMatch[];
}

interface AtdTypeMatch {
  matchType?: string;
  seriesMatches?: Array<{ seriesAdWrapper?: AtdRecentWrapper }>;
}

async function findIPLSeriesIdViaRecent(season: string): Promise<string | null> {
  const data = await get<{ typeMatches?: AtdTypeMatch[] }>("/matches/v1/recent", TTL.SERIES_ID);
  for (const tm of data?.typeMatches ?? []) {
    for (const sm of tm?.seriesMatches ?? []) {
      const w = sm?.seriesAdWrapper;
      if (w?.seriesName && isIPLSeries(w.seriesName, season) && w.seriesId != null) {
        return String(w.seriesId);
      }
    }
  }
  return null;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function fetchIPLMatchesFromATD(
  season: string,
  onProgress?: (done: number, total: number) => void,
): Promise<NormalizedMatch[]> {
  let completed: AtdMatch[] = [];

  try {
    const seriesId = await findIPLSeriesId(season);
    const allMatches = await listSeriesMatches(seriesId);
    completed = allMatches.filter(
      (m) => m.matchInfo?.state?.toLowerCase() === "complete",
    );
  } catch {
    // IPL not in category endpoints — extract its seriesId from the recent feed
    const recentSeriesId = await findIPLSeriesIdViaRecent(season);
    if (recentSeriesId) {
      const allMatches = await listSeriesMatches(recentSeriesId);
      completed = allMatches.filter(
        (m) => m.matchInfo?.state?.toLowerCase() === "complete",
      );
    }
  }

  const results: NormalizedMatch[] = [];
  let lastError: unknown = null;
  for (let i = 0; i < completed.length; i++) {
    const match = completed[i]!;
    try {
      const nm = await fetchMatchScorecard(match, season);
      results.push(nm);
    } catch (error) {
      lastError = error;
    }
    onProgress?.(i + 1, completed.length);
  }

  if (results.length === 0 && completed.length > 0) {
    throw new Error(
      `AllThingsDev / Cricbuzz scorecards could not be parsed.${lastError instanceof Error ? ` ${lastError.message}` : ""}`,
    );
  }
  return results;
}
