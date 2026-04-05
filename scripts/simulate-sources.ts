/**
 * simulate-sources.ts
 * Run: npx tsx scripts/simulate-sources.ts
 *
 * Fetches the first 6 completed IPL 2026 matches from all 3 data sources,
 * scores them, and prints a side-by-side comparison so we can see WHY
 * totals differ between Cricsheet, CricketData, and RapidAPI.
 */

import fs from "fs";
import path from "path";

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    process.env[key] ??= val;
  }
}

import {
  computeMatchPoints,
  type NormalizedMatch,
  type PlayerMatchStats,
} from "../lib/server/webscrape/parser";
import { fetchIPLMatchesFromCricketData } from "../lib/server/webscrape/cricketdata";
import { fetchIPLMatchesFromRapidAPI }    from "../lib/server/webscrape/rapidapi";
import AdmZip from "adm-zip";
import { processZipPerMatch } from "../lib/server/cricsheet";

const SEASON = "2026";
const MAX_MATCHES = 6;

// ── Cricsheet helpers ─────────────────────────────────────────────────────────

function buildUuidMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "final_mapping.json"), "utf8");
    const entries = JSON.parse(raw) as Record<string, { full_name: string }>;
    for (const [uuid, v] of Object.entries(entries)) {
      if (!uuid || !v?.full_name) continue;
      map.set(uuid, v.full_name);
      map.set(uuid.slice(0, 8), v.full_name);
    }
  } catch {}
  return map;
}

function buildShortNameMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "final_mapping.json"), "utf8");
    const entries = JSON.parse(raw) as Record<string, { short_name?: string; full_name: string }>;
    for (const v of Object.values(entries)) {
      if (v.short_name && v.full_name) {
        const normalized = v.short_name.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
        map.set(normalized, v.full_name);
      }
    }
  } catch {}
  return map;
}

async function fetchCricsheetMatches(): Promise<NormalizedMatch[]> {
  console.log("  [Cricsheet] Downloading ZIP from cricsheet.org ...");
  const url = "https://cricsheet.org/downloads/ipl_json.zip";
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Cricsheet HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`  [Cricsheet] Downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MB, parsing...`);

  const uuidMap = buildUuidMap();
  const shortMap = buildShortNameMap();
  const { matches } = processZipPerMatch(buf, SEASON, uuidMap, shortMap);

  // Sort by date asc
  matches.sort((a, b) => a.matchDate.localeCompare(b.matchDate));

  return matches.slice(0, MAX_MATCHES).map((m) => ({
    matchId: m.matchId,
    matchDate: m.matchDate,
    season: m.season,
    homeTeam: "",
    awayTeam: "",
    source: "cricapi" as const,
    sourceLabel: "Cricsheet (ball-by-ball)",
    playerStats: m.playerStats,
  }));
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function totalPts(stats: Record<string, PlayerMatchStats>): number {
  return Object.values(stats).reduce((sum, s) => sum + computeMatchPoints(s), 0);
}

function topPlayers(stats: Record<string, PlayerMatchStats>, n = 5): string {
  return Object.entries(stats)
    .map(([name, s]) => ({ name, pts: computeMatchPoints(s) }))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, n)
    .map((p) => `${p.name}(${p.pts})`)
    .join(", ");
}

// ── Detailed stat diff ────────────────────────────────────────────────────────

interface StatSummary {
  totalDots: number;
  totalWickets: number;
  totalMaidens: number;
  totalLbwBowled: number;
  totalCatches: number;
  totalRunOuts: number;
  totalDotPts: number;
  playersWithDots: number;   // bowlers whose dot_balls > 0
  playersWithZeroDots: number; // bowlers who bowled but have 0 dots
}

function summarizeStats(matches: NormalizedMatch[]): StatSummary {
  let totalDots = 0, totalWickets = 0, totalMaidens = 0, totalLbwBowled = 0;
  let totalCatches = 0, totalRunOuts = 0, totalDotPts = 0;
  let playersWithDots = 0, playersWithZeroDots = 0;

  for (const m of matches) {
    for (const s of Object.values(m.playerStats)) {
      totalDots += s.dot_balls;
      totalWickets += s.wickets;
      totalMaidens += s.maiden_overs;
      totalLbwBowled += s.lbw_bowled_wickets;
      totalCatches += s.catches;
      totalRunOuts += s.run_outs;
      totalDotPts += s.dot_ball_pts;

      if (s.balls_bowled > 0) {
        if (s.dot_balls > 0) playersWithDots++;
        else playersWithZeroDots++;
      }
    }
  }

  return {
    totalDots, totalWickets, totalMaidens, totalLbwBowled,
    totalCatches, totalRunOuts, totalDotPts,
    playersWithDots, playersWithZeroDots,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n====  IPL ${SEASON} Source Simulation (first ${MAX_MATCHES} matches)  ====\n`);

  // ── Fetch all three sources ─────────────────────────────────────────────────

  const results: Record<string, NormalizedMatch[] | Error> = {};

  for (const [label, fn] of [
    ["Cricsheet", fetchCricsheetMatches],
    ["CricketData", () => fetchIPLMatchesFromCricketData(SEASON, (d, t) => process.stdout.write(`\r  [CricketData] ${d}/${t}   `))],
    ["RapidAPI",   () => fetchIPLMatchesFromRapidAPI(SEASON, (d, t) => process.stdout.write(`\r  [RapidAPI] ${d}/${t}   `))],
  ] as const) {
    console.log(`\nFetching ${label}...`);
    try {
      const matches = await (fn as () => Promise<NormalizedMatch[]>)();
      const first6 = matches.slice(0, MAX_MATCHES);
      results[label] = first6;
      console.log(`\n  → ${first6.length} matches loaded`);
    } catch (err) {
      results[label] = err instanceof Error ? err : new Error(String(err));
      console.log(`\n  → ERROR: ${results[label]}`);
    }
  }

  // ── Match-by-match table ────────────────────────────────────────────────────

  console.log("\n\n══════════════════════════════════════════════════════════════════");
  console.log("  MATCH-BY-MATCH TOTAL POINTS (all players summed)");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log(
    `${"Match".padEnd(4)} ${"Date".padEnd(12)} ${"Cricsheet".padStart(12)} ${"CricketData".padStart(12)} ${"RapidAPI".padStart(10)}`
  );
  console.log("─".repeat(52));

  const cs = results["Cricsheet"];
  const cd = results["CricketData"];
  const ra = results["RapidAPI"];

  const numMatches = Math.max(
    cs instanceof Error ? 0 : cs.length,
    cd instanceof Error ? 0 : cd.length,
    ra instanceof Error ? 0 : ra.length,
  );

  for (let i = 0; i < numMatches; i++) {
    const csM = cs instanceof Error ? null : cs[i];
    const cdM = cd instanceof Error ? null : cd[i];
    const raM = ra instanceof Error ? null : ra[i];

    const date = csM?.matchDate ?? cdM?.matchDate ?? raM?.matchDate ?? "?";
    const csP  = csM ? totalPts(csM.playerStats) : (cs instanceof Error ? "ERR" : "-");
    const cdP  = cdM ? totalPts(cdM.playerStats) : (cd instanceof Error ? "ERR" : "-");
    const raP  = raM ? totalPts(raM.playerStats) : (ra instanceof Error ? "ERR" : "-");

    console.log(
      `M${String(i+1).padEnd(3)} ${date.padEnd(12)} ${String(csP).padStart(12)} ${String(cdP).padStart(12)} ${String(raP).padStart(10)}`
    );
  }

  // ── Stat summary ────────────────────────────────────────────────────────────

  console.log("\n\n══════════════════════════════════════════════════════════════════");
  console.log("  AGGREGATE STAT SUMMARY (across all fetched matches)");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log(`${"Stat".padEnd(28)} ${"Cricsheet".padStart(12)} ${"CricketData".padStart(12)} ${"RapidAPI".padStart(10)}`);
  console.log("─".repeat(64));

  const stats = {
    Cricsheet:   cs instanceof Error ? null : summarizeStats(cs),
    CricketData: cd instanceof Error ? null : summarizeStats(cd),
    RapidAPI:    ra instanceof Error ? null : summarizeStats(ra),
  };

  const rows: Array<[string, keyof StatSummary]> = [
    ["Total dot balls",          "totalDots"],
    ["Total wickets",            "totalWickets"],
    ["Total maidens",            "totalMaidens"],
    ["LBW+Bowled wickets",       "totalLbwBowled"],
    ["Total catches",            "totalCatches"],
    ["Total run outs",           "totalRunOuts"],
    ["Dot ball pts awarded",     "totalDotPts"],
    ["Bowlers WITH dot data",    "playersWithDots"],
    ["Bowlers with ZERO dots",   "playersWithZeroDots"],
  ];

  for (const [label, key] of rows) {
    const v = (src: StatSummary | null) => src ? String(src[key]) : "ERR";
    console.log(
      `${label.padEnd(28)} ${v(stats.Cricsheet).padStart(12)} ${v(stats.CricketData).padStart(12)} ${v(stats.RapidAPI).padStart(10)}`
    );
  }

  // ── Top player comparison for match 1 ──────────────────────────────────────

  console.log("\n\n══════════════════════════════════════════════════════════════════");
  console.log("  MATCH 1 — TOP 5 PLAYERS BY POINTS");
  console.log("══════════════════════════════════════════════════════════════════");

  if (!(cs instanceof Error) && cs[0]) {
    console.log(`Cricsheet:   ${topPlayers(cs[0].playerStats)}`);
  }
  if (!(cd instanceof Error) && cd[0]) {
    console.log(`CricketData: ${topPlayers(cd[0].playerStats)}`);
  }
  if (!(ra instanceof Error) && ra[0]) {
    console.log(`RapidAPI:    ${topPlayers(ra[0].playerStats)}`);
  }

  // ── Known divergence breakdown ─────────────────────────────────────────────

  console.log("\n\n══════════════════════════════════════════════════════════════════");
  console.log("  KNOWN DIVERGENCE SOURCES (from code analysis)");
  console.log("══════════════════════════════════════════════════════════════════");

  console.log(`
1. DOT BALLS
   Cricsheet:   Counted ball-by-ball. Exact (total=0, not wide).
   CricketData: Uses bw.dots field from API. Often 0/missing.
   RapidAPI:    Uses bw.dots field from Cricbuzz. Often 0/missing.
   Impact:      dot_ball_pts (+1 at 3 dots, +2 at 6) = 0 for most
                bowlers in API sources → underscores every bowler.

2. LBW + BOWLED BONUS (+8 pts each)
   Cricsheet:   Reads wicket.kind === "lbw" | "bowled" directly.
   CricketData: Parses outDesc text ("lbw b Bowler", "b Bowler").
   RapidAPI:    Parses outDesc OR outdec text.
   Impact:      Text parsing can miss cases with non-standard formats
                (e.g. "Bowled" vs "b", or missing bowler name after "lbw").

3. RUN OUT ATTRIBUTION
   Cricsheet:   Explicit fielder[].name arrays per wicket. Direct vs
                indirect run outs both tracked. run_outs = indirect only.
   CricketData: Parses "run out (Fielder)" text → only first fielder.
   RapidAPI:    Same text parsing.
   Impact:      Multi-fielder run outs (e.g. "run out (A/B)") only
                credits first fielder in API sources.

4. DISMISSED FLAG (duck detection)
   Cricsheet:   Sets dismissed via ball-by-ball wicket records.
   CricketData: Reads outDesc — if outDesc is empty/missing, player
                never flagged dismissed → duck penalty (-2) missed.
   RapidAPI:    Same.
   Impact:      Players out for 0 with missing outDesc avoid -2 duck
                penalty in API sources (slightly OVER-scores them).

5. NAME VARIANTS
   Cricsheet:   UUID registry → final_mapping.json → raw name.
                Fully resolved to canonical DB names.
   CricketData: Raw CricketData name strings (different spelling).
   RapidAPI:    Raw Cricbuzz name strings (different spelling).
   Impact:      Same player may appear as separate entries, halving
                their points (each partial entry scores less).

6. EXTRAS IN BALLS FACED / BOWLED
   Cricsheet:   Explicitly skips wides from balls_faced & balls_bowled.
   CricketData: Scorecard rows already exclude wides (standard format).
   RapidAPI:    Same — scorecard rows exclude extras.
   Impact:      Minimal, both handle this correctly.

7. MAIDEN OVERS
   Cricsheet:   Counted from over-level ball data (6 legal balls, 0 runs).
   CricketData: Read directly from maiden field in scorecard.
   RapidAPI:    Read directly from maidens field.
   Impact:      Generally accurate in all sources. Minor float parsing
                issues possible in API sources.
`);

  console.log("Simulation complete.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
