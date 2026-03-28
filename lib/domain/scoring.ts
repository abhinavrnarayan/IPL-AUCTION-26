import type { Player, SquadEntry, Team, TeamScore } from "@/lib/domain/types";

// ── Stats shape stored in players.stats JSONB column ─────────────────────────
//
// Raw stats are used for linear scoring and display.
// Non-linear bonus points (milestones, SR, economy, catch bonus) are
// pre-computed per-match during Cricsheet processing and accumulated here so
// that the correct per-innings/per-match thresholds are respected when
// aggregating across an entire season.

export interface PlayerStats {
  // Batting – raw
  runs?: number;
  balls_faced?: number;
  fours?: number;
  sixes?: number;
  ducks?: number; // times dismissed for 0

  // Bowling – raw
  wickets?: number; // non-run-out wickets
  balls_bowled?: number;
  runs_conceded?: number;
  dot_balls?: number;
  maiden_overs?: number;
  lbw_bowled_wickets?: number;

  // Fielding – raw
  catches?: number;
  stumpings?: number;
  run_outs_direct?: number;
  run_outs_indirect?: number;

  // Pre-computed per-match bonus points (non-linear)
  milestone_runs_pts?: number;  // +4/+8/+12/+16 for 25/50/75/100 runs per innings
  milestone_wkts_pts?: number;  // +4/+8/+12 for 3W/4W/5W per match (cumulative)
  sr_pts?: number;              // strike rate bonus per match (min 10 balls)
  economy_pts?: number;         // economy rate bonus per match (min 2 overs)
  catch_bonus_pts?: number;     // +4 for 3+ catches in a single match

  // Appearances
  lineup_appearances?: number;
  substitute_appearances?: number;
  matches_played?: number;

  // Meta (preserved from Excel import / Cricsheet)
  ipl_team?: string;
  cricsheet_name?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function n(value: unknown): number {
  if (typeof value === "number" && isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const p = Number(value);
    return isFinite(p) ? p : 0;
  }
  return 0;
}

// ── Public scoring functions ──────────────────────────────────────────────────

export function scorePlayer(player: Player): number {
  const s = (player.stats ?? {}) as PlayerStats;
  const role = (player.role ?? "").toLowerCase();
  // Pure bowlers don't get duck penalty
  const isPureBowler = role === "bowler" || role === "bowl" || role === "bowling";

  let pts = 0;

  // ── Batting ────────────────────────────────────────────────────────────────
  pts += n(s.runs);                   // +1 per run
  pts += n(s.fours) * 4;              // boundary bonus +4 each
  pts += n(s.sixes) * 6;              // six bonus +6 each
  pts += n(s.milestone_runs_pts);     // 25/50/75/100 run milestones (per-match)
  pts += n(s.sr_pts);                 // strike rate bonus (per-match)
  if (!isPureBowler) pts -= n(s.ducks) * 2; // duck penalty -2 each

  // ── Bowling ────────────────────────────────────────────────────────────────
  pts += n(s.wickets) * 30;           // +30 per wicket (excl. run outs)
  pts += n(s.lbw_bowled_wickets) * 8; // LBW / bowled bonus +8 each
  pts += n(s.dot_balls);              // +1 per dot ball
  pts += n(s.maiden_overs) * 12;      // +12 per maiden
  pts += n(s.milestone_wkts_pts);     // 3W/4W/5W milestones (per-match, cumulative)
  pts += n(s.economy_pts);            // economy rate bonus (per-match)

  // ── Fielding ───────────────────────────────────────────────────────────────
  pts += n(s.catches) * 8;            // +8 per catch
  pts += n(s.catch_bonus_pts);        // +4 for 3+ catches in a match (per-match)
  pts += n(s.stumpings) * 12;         // +12 per stumping
  pts += n(s.run_outs_direct) * 12;   // +12 direct hit
  pts += n(s.run_outs_indirect) * 6;  // +6 indirect

  // ── Appearances ───────────────────────────────────────────────────────────
  // +4 for each announced-lineup or substitute appearance
  pts += (n(s.lineup_appearances) + n(s.substitute_appearances)) * 4;

  return pts;
}

export function buildTeamLeaderboard(
  teams: Team[],
  squads: SquadEntry[],
  players: Player[],
): TeamScore[] {
  const playerById = new Map(players.map((p) => [p.id, p]));

  const leaderboard: TeamScore[] = teams.map((team) => {
    const teamSquad = squads.filter((e) => e.teamId === team.id);
    const totalPoints = teamSquad.reduce((sum, entry) => {
      const player = playerById.get(entry.playerId);
      return sum + (player ? scorePlayer(player) : 0);
    }, 0);

    return {
      teamId: team.id,
      teamName: team.name,
      totalPoints,
      remainingPurse: team.purseRemaining,
      squadCount: teamSquad.length,
    };
  });

  return leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
}
