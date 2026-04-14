/**
 * Shared types and parsing utilities for all cricket API providers.
 *
 * Supported providers: Cricsheet (ball-by-ball) and RapidAPI Cricbuzz.
 * This module normalises innings scorecards into a single shape and
 * computes the per-match fantasy bonus points that must be calculated from
 * individual-match data (milestones, SR, economy, 3-catch bonus).
 */

// ── Per-match stats for a single player ──────────────────────────────────────

export interface PlayerMatchStats {
  // Batting
  runs: number;
  balls_faced: number;
  fours: number;
  sixes: number;
  dismissed: boolean;

  // Bowling
  balls_bowled: number;
  runs_conceded: number;
  dot_balls: number;
  wickets: number;
  maiden_overs: number;
  lbw_bowled_wickets: number; // derived from batting outDesc

  // Fielding
  catches: number;
  stumpings: number;
  run_outs: number;

  appeared: boolean;

  // Pre-computed per-match non-linear bonuses
  milestone_runs_pts: number;
  sr_pts: number;
  duck_penalty: number;       // -2 if duck (applied only for non-pure bowlers)
  milestone_wkts_pts: number;
  economy_pts: number;
  catch_bonus_pts: number;
  dot_ball_pts: number;   // +1 at 3 dots, +2 at 6 (pre-computed per match)
}

export interface NormalizedMatch {
  matchId: string;
  matchDate: string;     // "YYYY-MM-DD"
  season: string;
  homeTeam: string;
  awayTeam: string;
  source: "cricsheet" | "rapidapi";
  sourceLabel: string;
  playerStats: Record<string, PlayerMatchStats>; // cricketapi player name → stats
}
export function extractDisplayName(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  const candidates = [
    record.name,
    record.fullName,
    record.playerName,
    record.batsmanName,
    record.bowlerName,
    record.nickName,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "4.2" → 26 balls  (the decimal digit is extra balls, NOT a fraction) */
export function oversToBalls(overs: string | number): number {
  const o = typeof overs === "number" ? overs : parseFloat(String(overs));
  if (!isFinite(o)) return 0;
  return Math.floor(o) * 6 + Math.round((o % 1) * 10);
}

function dotBallPts(dots: number): number {
  let pts = 0;
  if (dots >= 3) pts += 1;
  if (dots >= 6) pts += 1;
  return pts;
}

function battingBonuses(runs: number, balls: number, dismissed: boolean) {
  let milestonePts = 0;
  if (runs >= 25) milestonePts += 4;
  if (runs >= 50) milestonePts += 8;
  if (runs >= 75) milestonePts += 12;
  if (runs >= 100) milestonePts += 16;

  let srPts = 0;
  if (balls >= 10) {
    const sr = (runs / balls) * 100;
    if (sr > 170) srPts = 6;
    else if (sr > 150) srPts = 4;
    else if (sr >= 130) srPts = 2;
    else if (sr >= 60 && sr <= 70) srPts = -2;
    else if (sr >= 50 && sr < 60) srPts = -4;
    else if (sr < 50) srPts = -6;
  }

  const duckPenalty = dismissed && runs === 0 ? -2 : 0;
  return { milestonePts, srPts, duckPenalty };
}

function bowlingBonuses(wickets: number, balls: number, runs: number) {
  let milestonePts = 0;
  if (wickets >= 3) milestonePts += 4;
  if (wickets >= 4) milestonePts += 8;
  if (wickets >= 5) milestonePts += 12;

  let econPts = 0;
  if (balls >= 12) {
    const eco = runs / (balls / 6);
    if (eco < 5) econPts = 6;
    else if (eco <= 5.99) econPts = 4;
    else if (eco <= 7) econPts = 2;
    else if (eco >= 10 && eco <= 11) econPts = -2;
    else if (eco > 11 && eco <= 12) econPts = -4;
    else if (eco > 12) econPts = -6;
  }
  return { milestonePts, econPts };
}

// ── outDesc parser ────────────────────────────────────────────────────────────

type DismissalKind = "caught" | "stumped" | "run_out" | "bowled" | "lbw" | "hit_wicket" | "not_out" | "other";

interface OutDescResult {
  kind: DismissalKind;
  fielder: string | null;   // catcher / stumper / run-out fielder
  bowler: string | null;    // bowler credited (for lbw/bowled bonus)
}

export function parseOutDesc(outDesc: string): OutDescResult {
  const s = (outDesc ?? "").trim();
  if (!s || /not out/i.test(s)) return { kind: "not_out", fielder: null, bowler: null };

  // Caught & bowled
  const cab = s.match(/^c\s*&\s*b\s+([\w\s'.'-]+)$/i);
  if (cab) return { kind: "caught", fielder: cab[1].trim(), bowler: cab[1].trim() };

  // Caught: "c Fielder b Bowler"
  const caught = s.match(/^c\s+(?:†\s*)?([\w\s'.'-]+?)\s+b\s+([\w\s'.'-]+)$/i);
  if (caught) return { kind: "caught", fielder: caught[1].trim(), bowler: caught[2].trim() };

  // Stumped: "st Keeper b Bowler"
  const stumped = s.match(/^st\s+(?:†\s*)?([\w\s'.'-]+?)\s+b\s+([\w\s'.'-]+)$/i);
  if (stumped) return { kind: "stumped", fielder: stumped[1].trim(), bowler: stumped[2].trim() };

  // Run out
  const runOut = s.match(/^run out\s*\(([^)]+)\)/i);
  if (runOut) return { kind: "run_out", fielder: runOut[1].split("/")[0]!.trim(), bowler: null };
  if (/^run out$/i.test(s)) return { kind: "run_out", fielder: null, bowler: null };

  // LBW
  if (/^lbw/i.test(s)) {
    const bm = s.match(/\bb\s+([\w\s'.'-]+)$/i);
    return { kind: "lbw", fielder: null, bowler: bm?.[1].trim() ?? null };
  }

  // Bowled
  if (/^(?:b\s|bowled)/i.test(s)) {
    const bm = s.match(/^(?:b|bowled)\s+([\w\s'.'-]+)$/i);
    return { kind: "bowled", fielder: null, bowler: bm?.[1].trim() ?? null };
  }

  // Hit wicket
  if (/^hit wicket/i.test(s)) {
    const bm = s.match(/\bb\s+([\w\s'.'-]+)$/i);
    return { kind: "hit_wicket", fielder: null, bowler: bm?.[1].trim() ?? null };
  }

  return { kind: "other", fielder: null, bowler: null };
}

// ── Core inning processor ─────────────────────────────────────────────────────
// Used by both Cricsheet and RapidAPI parsers.

export interface ScorecardBattingRow {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  outDesc: string;
}

export interface ScorecardBowlingRow {
  name: string;
  overs: string | number;  // "4.2" or 4.2
  maidens: number;
  runs: number;
  wickets: number;
  dot_balls?: number;
}

export interface ProcessedInning {
  playerStats: Record<string, PlayerMatchStats>;
}

function emptyPlayerStats(): PlayerMatchStats {
  return {
    runs: 0, balls_faced: 0, fours: 0, sixes: 0, dismissed: false,
    balls_bowled: 0, runs_conceded: 0, dot_balls: 0, wickets: 0, maiden_overs: 0, lbw_bowled_wickets: 0,
    catches: 0, stumpings: 0, run_outs: 0,
    appeared: true,
    milestone_runs_pts: 0, sr_pts: 0, duck_penalty: 0,
    milestone_wkts_pts: 0, economy_pts: 0, catch_bonus_pts: 0, dot_ball_pts: 0,
  };
}

function getOrCreate(
  map: Record<string, PlayerMatchStats>,
  name: string,
): PlayerMatchStats {
  if (!map[name]) map[name] = emptyPlayerStats();
  return map[name]!;
}

export function processInning(
  batting: ScorecardBattingRow[],
  bowling: ScorecardBowlingRow[],
): Record<string, PlayerMatchStats> {
  const stats: Record<string, PlayerMatchStats> = {};

  // Track lbw/bowled wickets per bowler from batting outDescs
  const lbwBowledByBowler: Record<string, number> = {};
  // Track catches per fielder for the 3-catch bonus
  const catchesByFielder: Record<string, number> = {};

  // ── Batting rows ──────────────────────────────────────────────────────────
  for (const row of batting) {
    if (!row.name) continue;
    const s = getOrCreate(stats, row.name);

    s.runs = row.runs;
    s.balls_faced = row.balls;
    s.fours = row.fours;
    s.sixes = row.sixes;

    const out = parseOutDesc(row.outDesc);
    s.dismissed = out.kind !== "not_out";

    // Fielding credits from outDesc
    if (out.fielder) {
      const f = getOrCreate(stats, out.fielder);
      if (out.kind === "caught") {
        f.catches += 1;
        catchesByFielder[out.fielder] = (catchesByFielder[out.fielder] ?? 0) + 1;
      } else if (out.kind === "stumped") {
        f.stumpings += 1;
      } else if (out.kind === "run_out") {
        f.run_outs += 1;
      }
    }

    // LBW/bowled bonus tracking
    if ((out.kind === "lbw" || out.kind === "bowled") && out.bowler) {
      lbwBowledByBowler[out.bowler] = (lbwBowledByBowler[out.bowler] ?? 0) + 1;
    }

    // Batting bonuses
    const { milestonePts, srPts, duckPenalty } = battingBonuses(
      s.runs, s.balls_faced, s.dismissed,
    );
    s.milestone_runs_pts = milestonePts;
    s.sr_pts = srPts;
    s.duck_penalty = duckPenalty;
  }

  // ── 3-catch bonus ─────────────────────────────────────────────────────────
  for (const [fielder, cnt] of Object.entries(catchesByFielder)) {
    if (cnt >= 3) {
      const f = getOrCreate(stats, fielder);
      f.catch_bonus_pts += 4;
    }
  }

  // ── Bowling rows ──────────────────────────────────────────────────────────
  for (const row of bowling) {
    if (!row.name) continue;
    const s = getOrCreate(stats, row.name);

    const balls = oversToBalls(row.overs);
    s.balls_bowled = balls;
    s.runs_conceded = row.runs;
    s.wickets = row.wickets;
    s.maiden_overs = row.maidens;
    s.dot_balls = row.dot_balls ?? 0;
    s.lbw_bowled_wickets = lbwBowledByBowler[row.name] ?? 0;

    const { milestonePts, econPts } = bowlingBonuses(row.wickets, balls, row.runs);
    s.milestone_wkts_pts = milestonePts;
    s.economy_pts = econPts;
  }

  return stats;
}

/** Merge stats from multiple innings into a single per-player record. */
export function mergeInningStats(
  ...innings: Array<Record<string, PlayerMatchStats>>
): Record<string, PlayerMatchStats> {
  const merged: Record<string, PlayerMatchStats> = {};

  for (const inning of innings) {
    for (const [name, s] of Object.entries(inning)) {
      const t = getOrCreate(merged, name);
      t.runs += s.runs;
      t.balls_faced += s.balls_faced;
      t.fours += s.fours;
      t.sixes += s.sixes;
      if (s.dismissed) t.dismissed = true;
      t.balls_bowled += s.balls_bowled;
      t.runs_conceded += s.runs_conceded;
      t.dot_balls += s.dot_balls;
      t.wickets += s.wickets;
      t.maiden_overs += s.maiden_overs;
      t.lbw_bowled_wickets += s.lbw_bowled_wickets;
      t.catches += s.catches;
      t.stumpings += s.stumpings;
      t.run_outs += s.run_outs;
      t.milestone_runs_pts += s.milestone_runs_pts;
      t.sr_pts += s.sr_pts;
      t.duck_penalty += s.duck_penalty;
      t.milestone_wkts_pts += s.milestone_wkts_pts;
      t.economy_pts += s.economy_pts;
      t.catch_bonus_pts += s.catch_bonus_pts;
    }
  }

  // Recompute dot_ball_pts from per-match total (milestone must be per-match, not per-inning)
  for (const t of Object.values(merged)) {
    t.dot_ball_pts = dotBallPts(t.dot_balls);
  }

  // Merge abbreviated fielder names into full names.
  // e.g. "Phil Salt" (catch-only entry from outDesc) → "Philip Salt" (batting entry).
  // Only merges when: same surname, same first initial, first word is a prefix of the other,
  // AND one entry has no batting or bowling (it is purely a fielding credit from outDesc).
  consolidateNameVariants(merged);

  return merged;
}

/**
 * After cross-inning merge, some players appear twice: once under their full
 * batting name (e.g. "Philip Salt") and once under an abbreviated name used in
 * dismissal descriptions (e.g. "Phil Salt"). Collapse the abbreviated entry into
 * the full-name entry so catch/fielding credits are not lost.
 *
 * Conditions to merge nameA into nameB (nameB is longer / more canonical):
 *  1. Same surname (last word, case-insensitive)
 *  2. Same first initial
 *  3. One first-word is a prefix of the other ("Phil" ⊂ "Philip")
 *  4. The shorter-name entry has NO batting and NO bowling stats — it is
 *     purely a fielding credit from outDesc, so it is safe to absorb.
 */
function consolidateNameVariants(merged: Record<string, PlayerMatchStats>): void {
  const keys = Object.keys(merged);

  // Build surname → names index
  const bySurname: Record<string, string[]> = {};
  for (const key of keys) {
    const surname = key.trim().split(" ").pop()?.toLowerCase() ?? "";
    (bySurname[surname] ??= []).push(key);
  }

  for (const group of Object.values(bySurname)) {
    if (group.length < 2) continue;

    // Check every pair within the same-surname group
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        if (!merged[a] || !merged[b]) continue; // already merged away

        const firstA = a.trim().split(" ")[0]!.toLowerCase();
        const firstB = b.trim().split(" ")[0]!.toLowerCase();

        // First initial must match
        if (firstA[0] !== firstB[0]) continue;

        // One first-word must be a prefix of the other (handles Phil / Philip)
        if (!firstA.startsWith(firstB) && !firstB.startsWith(firstA)) continue;

        // One entry must be purely a fielding credit (no bat, no bowl)
        const statsA = merged[a]!;
        const statsB = merged[b]!;
        const aIsFieldOnly = statsA.balls_faced === 0 && statsA.balls_bowled === 0;
        const bIsFieldOnly = statsB.balls_faced === 0 && statsB.balls_bowled === 0;
        if (!aIsFieldOnly && !bIsFieldOnly) continue;

        // Merge field-only entry into the richer entry
        const [src, dst] = aIsFieldOnly ? [a, b] : [b, a];
        const srcStats = merged[src]!;
        const dstStats = merged[dst]!;

        dstStats.catches += srcStats.catches;
        dstStats.stumpings += srcStats.stumpings;
        dstStats.run_outs += srcStats.run_outs;
        // Recompute catch bonus from merged total
        dstStats.catch_bonus_pts = dstStats.catches >= 3 ? 4 : 0;

        delete merged[src];
      }
    }
  }
}

/** Compute fantasy points for a player from their match stats. */
export function computeMatchPoints(
  stats: PlayerMatchStats,
  isPureBowler = false,
): number {
  let pts = 0;

  // Batting
  pts += stats.runs;
  pts += stats.fours * 4;
  pts += stats.sixes * 6;
  pts += stats.milestone_runs_pts;
  pts += stats.sr_pts;
  if (!isPureBowler) pts += stats.duck_penalty; // duck_penalty is already negative

  // Bowling
  pts += stats.wickets * 30;
  pts += stats.lbw_bowled_wickets * 8;
  pts += stats.dot_ball_pts; // milestone: +1 at 3 dots, +2 at 6
  pts += stats.maiden_overs * 12;
  pts += stats.milestone_wkts_pts;
  pts += stats.economy_pts;

  // Fielding
  pts += stats.catches * 8;
  pts += stats.catch_bonus_pts;
  pts += stats.stumpings * 12;
  pts += stats.run_outs * 6; // indirect run out

  // Appearance (+4 per match)
  pts += stats.appeared ? 4 : 0;

  return pts;
}
