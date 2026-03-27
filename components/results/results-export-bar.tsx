"use client";

import { ExportButton } from "@/components/ui/export-button";
import type { ResultsSnapshot } from "@/lib/domain/types";
import { scorePlayer } from "@/lib/domain/scoring";

const LEADERBOARD_COLS = [
  { key: "rank", header: "Rank" },
  { key: "teamName", header: "Team" },
  { key: "totalPoints", header: "Total Points" },
  { key: "remainingPurse", header: "Purse Remaining" },
  { key: "squadCount", header: "Players" },
];

const PLAYERS_COLS = [
  { key: "rank", header: "Rank" },
  { key: "playerName", header: "Player" },
  { key: "role", header: "Role" },
  { key: "team", header: "Team" },
  { key: "points", header: "Points" },
  { key: "purchasePrice", header: "Purchase Price" },
];

export function ResultsExportBar({ snapshot }: { snapshot: ResultsSnapshot }) {
  function getLeaderboardRows() {
    return snapshot.leaderboard.map((ts, i) => ({
      rank: i + 1,
      teamName: ts.teamName,
      totalPoints: ts.totalPoints,
      remainingPurse: ts.remainingPurse,
      squadCount: ts.squadCount,
    }));
  }

  function getPlayerRows() {
    const teamById = new Map(snapshot.teams.map((t) => [t.id, t]));
    return snapshot.squads
      .map((entry, i) => ({
        rank: i + 1,
        playerName: entry.player?.name ?? "Unknown",
        role: entry.player?.role ?? "",
        team: teamById.get(entry.teamId)?.name ?? "",
        points: entry.player ? scorePlayer(entry.player) : 0,
        purchasePrice: entry.purchasePrice,
      }))
      .sort((a, b) => b.points - a.points)
      .map((row, i) => ({ ...row, rank: i + 1 }));
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <ExportButton
        getData={getLeaderboardRows}
        columns={LEADERBOARD_COLS}
        filename={`${snapshot.room.name}-leaderboard`}
        label="Leaderboard"
      />
      <ExportButton
        getData={getPlayerRows}
        columns={PLAYERS_COLS}
        filename={`${snapshot.room.name}-players`}
        label="Player scores"
      />
    </div>
  );
}
