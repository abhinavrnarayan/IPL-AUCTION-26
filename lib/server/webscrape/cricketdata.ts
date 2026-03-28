/**
 * CricketData.org API client — PRIMARY source
 * Free tier: 100 requests/day
 * Sign up at https://cricketdata.org
 */

import {
  mergeInningStats,
  processInning,
  type NormalizedMatch,
  type ScorecardBattingRow,
  type ScorecardBowlingRow,
} from "./parser";

// CricAPI.com — the correct endpoint for accounts registered at cricketdata.org
const BASE = "https://api.cricapi.com/v1";

async function get<T>(path: string): Promise<T> {
  const key = process.env.CRICKETDATA_API_KEY;
  if (!key) throw new Error("CRICKETDATA_API_KEY not set");

  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}apikey=${key}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "IPL-Auction-Platform/1.0" },
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`CricketData HTTP ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as { status?: string; data?: T; message?: string };
  if (json.status === "failure") throw new Error(json.message ?? "CricketData API error");
  return json.data as T;
}

// ── Find IPL series id ────────────────────────────────────────────────────────

interface CricketDataSeries {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

function isIPLSeries(name: string, season: string): boolean {
  const n = name.toLowerCase();
  const hasIpl = n.includes("indian premier league") || n.includes(" ipl ") ||
    n.startsWith("ipl ") || n.endsWith(" ipl") || n === "ipl";
  const hasSeason = name.includes(season);
  return hasIpl && hasSeason;
}

export async function findIPLSeriesId(season: string): Promise<string> {
  // Paginate through results — IPL may not be on the first page
  for (const offset of [0, 25, 50, 75]) {
    const data = await get<CricketDataSeries[]>(`/series?offset=${offset}`);
    const list = Array.isArray(data) ? data : [];
    if (list.length === 0) break; // no more pages
    const series = list.find((s) => isIPLSeries(s.name ?? "", season));
    if (series) return series.id;
  }
  throw new Error(`IPL ${season} series not found on CricketData.org`);
}

// ── List matches in series ────────────────────────────────────────────────────

interface CricketDataMatchItem {
  id: string;
  name: string;
  date: string;
  dateTimeGMT: string;
  teams: string[];
  matchType: string;
  status: string;
  matchEnded: boolean;
}

export async function listSeriesMatches(seriesId: string): Promise<CricketDataMatchItem[]> {
  const data = await get<{ matchList?: CricketDataMatchItem[] }>(`/series_info?id=${seriesId}`);
  return data?.matchList ?? [];
}

// ── Fetch and parse a scorecard ───────────────────────────────────────────────

interface CricketDataBatter {
  batsman: string;
  r: string | number;
  b: string | number;
  "4s": string | number;
  "6s": string | number;
  sr?: string;
  outDesc?: string;
}

interface CricketDataBowler {
  bowler: string;
  o: string | number;
  m: string | number;
  r: string | number;
  w: string | number;
  eco?: string;
}

interface CricketDataInning {
  inning?: string;
  batting?: CricketDataBatter[];
  bowling?: CricketDataBowler[];
}

interface CricketDataScorecard {
  scorecard?: CricketDataInning[];
  matchHeader?: {
    matchId?: string;
    matchDate?: string;
    team1?: { teamName?: string };
    team2?: { teamName?: string };
  };
}

function n(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

export async function fetchMatchScorecard(
  matchItem: CricketDataMatchItem,
  season: string,
): Promise<NormalizedMatch> {
  const raw = await get<CricketDataScorecard>(`/match_scorecard?id=${matchItem.id}`);
  const innings = raw?.scorecard ?? [];

  const inningStats = innings.map((inning) => {
    const batting: ScorecardBattingRow[] = (inning.batting ?? []).map((b) => ({
      name: String(b.batsman ?? "").trim(),
      runs: n(b.r),
      balls: n(b.b),
      fours: n(b["4s"]),
      sixes: n(b["6s"]),
      outDesc: String(b.outDesc ?? "").trim(),
    }));

    const bowling: ScorecardBowlingRow[] = (inning.bowling ?? []).map((bw) => ({
      name: String(bw.bowler ?? "").trim(),
      overs: bw.o,
      maidens: n(bw.m),
      runs: n(bw.r),
      wickets: n(bw.w),
    }));

    return processInning(batting, bowling);
  });

  const merged = mergeInningStats(...inningStats);

  return {
    matchId: matchItem.id,
    matchDate: matchItem.date?.split("T")[0] ?? matchItem.dateTimeGMT?.split("T")[0] ?? "",
    season,
    homeTeam: matchItem.teams?.[0] ?? "",
    awayTeam: matchItem.teams?.[1] ?? "",
    source: "cricketdata",
    sourceLabel: "CricketData.org",
    playerStats: merged,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function fetchIPLMatchesFromCricketData(
  season: string,
  onProgress?: (done: number, total: number) => void,
): Promise<NormalizedMatch[]> {
  const seriesId = await findIPLSeriesId(season);
  const allMatches = await listSeriesMatches(seriesId);
  const completed = allMatches.filter((m) => m.matchEnded || m.status?.toLowerCase().includes("won"));

  const results: NormalizedMatch[] = [];
  for (let i = 0; i < completed.length; i++) {
    const match = completed[i]!;
    try {
      const nm = await fetchMatchScorecard(match, season);
      results.push(nm);
    } catch {
      // Skip failed matches silently; they'll be retried next sync
    }
    onProgress?.(i + 1, completed.length);
  }
  return results;
}
