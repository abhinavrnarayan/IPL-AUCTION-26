/**
 * RapidAPI — Cricbuzz Cricket Score provider — SECONDARY source
 * Host: cricbuzz-cricket.p.rapidapi.com
 * Sign up at https://rapidapi.com/cricketapilive/api/cricbuzz-cricket
 */

import {
  mergeInningStats,
  processInning,
  type NormalizedMatch,
  type ScorecardBattingRow,
  type ScorecardBowlingRow,
} from "./parser";

const HOST = process.env.RAPIDAPI_CRICBUZZ_HOST ?? "cricbuzz-cricket.p.rapidapi.com";
const BASE = `https://${HOST}`;

async function get<T>(path: string): Promise<T> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY not set");

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": HOST,
      "User-Agent": "IPL-Auction-Platform/1.0",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`RapidAPI HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ── Find IPL series ───────────────────────────────────────────────────────────

interface CricbuzzSeriesItem {
  id: string;
  name: string;
}

interface CricbuzzSeriesCategory {
  seriesMapProto?: Array<{ series?: CricbuzzSeriesItem[] }>;
}

export async function findIPLSeriesId(season: string): Promise<string> {
  const data = await get<CricbuzzSeriesCategory>("/series/v1/domestic");

  const allSeries: CricbuzzSeriesItem[] = [];
  for (const block of data?.seriesMapProto ?? []) {
    for (const s of block.series ?? []) {
      allSeries.push(s);
    }
  }

  const found = allSeries.find(
    (s) =>
      s.name?.toLowerCase().includes("indian premier league") &&
      s.name.includes(season),
  );
  if (!found) throw new Error(`IPL ${season} series not found on RapidAPI/Cricbuzz`);
  return String(found.id);
}

// ── List matches ──────────────────────────────────────────────────────────────

interface CricbuzzMatch {
  matchInfo?: {
    matchId?: number;
    startDate?: string;
    team1?: { teamName?: string };
    team2?: { teamName?: string };
    state?: string; // "Complete" when done
  };
}

export async function listSeriesMatches(seriesId: string): Promise<CricbuzzMatch[]> {
  const data = await get<{ matchDetails?: Array<{ matchDetailsMap?: { match?: CricbuzzMatch[] } }> }>(
    `/series/v1/${seriesId}`,
  );

  const matches: CricbuzzMatch[] = [];
  for (const block of data?.matchDetails ?? []) {
    for (const m of block?.matchDetailsMap?.match ?? []) {
      matches.push(m);
    }
  }
  return matches;
}

// ── Fetch and parse scorecard ─────────────────────────────────────────────────

interface CricbuzzBatter {
  batName?: string;
  runs?: number;
  balls?: number;
  fours?: number;
  sixes?: number;
  strikeRate?: number;
  outDesc?: string;
}

interface CricbuzzBowler {
  bowlName?: string;
  overs?: number;
  maidens?: number;
  runs?: number;
  wickets?: number;
  economy?: number;
}

interface CricbuzzInning {
  inningsId?: number;
  batTeamDetails?: {
    batsmenData?: Record<string, CricbuzzBatter>;
  };
  bowlTeamDetails?: {
    bowlersData?: Record<string, CricbuzzBowler>;
  };
}

export async function fetchMatchScorecard(
  match: CricbuzzMatch,
  season: string,
): Promise<NormalizedMatch> {
  const matchId = String(match.matchInfo?.matchId ?? "");
  const data = await get<{ scoreCard?: CricbuzzInning[] }>(`/mcenter/v1/${matchId}/scard`);
  const innings = data?.scoreCard ?? [];

  const inningStats = innings.map((inning) => {
    const batting: ScorecardBattingRow[] = Object.values(
      inning.batTeamDetails?.batsmenData ?? {},
    )
      .filter((b) => b.batName)
      .map((b) => ({
        name: String(b.batName!).trim(),
        runs: b.runs ?? 0,
        balls: b.balls ?? 0,
        fours: b.fours ?? 0,
        sixes: b.sixes ?? 0,
        outDesc: String(b.outDesc ?? "").trim(),
      }));

    const bowling: ScorecardBowlingRow[] = Object.values(
      inning.bowlTeamDetails?.bowlersData ?? {},
    )
      .filter((b) => b.bowlName)
      .map((b) => ({
        name: String(b.bowlName!).trim(),
        overs: b.overs ?? 0,
        maidens: b.maidens ?? 0,
        runs: b.runs ?? 0,
        wickets: b.wickets ?? 0,
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

// ── Main entry point ──────────────────────────────────────────────────────────

export async function fetchIPLMatchesFromRapidAPI(
  season: string,
  onProgress?: (done: number, total: number) => void,
): Promise<NormalizedMatch[]> {
  const seriesId = await findIPLSeriesId(season);
  const allMatches = await listSeriesMatches(seriesId);
  const completed = allMatches.filter(
    (m) => m.matchInfo?.state?.toLowerCase() === "complete",
  );

  const results: NormalizedMatch[] = [];
  for (let i = 0; i < completed.length; i++) {
    const match = completed[i]!;
    try {
      const nm = await fetchMatchScorecard(match, season);
      results.push(nm);
    } catch {
      // Skip failed matches silently
    }
    onProgress?.(i + 1, completed.length);
  }
  return results;
}
