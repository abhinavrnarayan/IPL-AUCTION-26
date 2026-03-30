"use client";

import { scorePlayer } from "@/lib/domain/scoring";
import type { ResultsSnapshot } from "@/lib/domain/types";
import { formatCurrencyShort } from "@/lib/utils";
import { downloadPngFromSvg, downloadSimplePdf, downloadTablePdf } from "@/lib/utils/report-export";
import { ExportButton } from "@/components/ui/export-button";

const LEADERBOARD_COLS = [
  { key: "rank", header: "Rank" },
  { key: "teamName", header: "Team" },
  { key: "totalPoints", header: "Total Points" },
];

const PLAYERS_COLS = [
  { key: "playerName", header: "Player" },
  { key: "team", header: "Team" },
  { key: "role", header: "Role" },
  { key: "points", header: "Points" },
];

export function ResultsExportBar({ snapshot }: { snapshot: ResultsSnapshot }) {
  const teamById = new Map(snapshot.teams.map((team) => [team.id, team]));

  function getLeaderboardRows() {
    return snapshot.leaderboard.map((teamScore, index) => ({
      rank: index + 1,
      teamName: teamScore.teamName,
      totalPoints: teamScore.totalPoints,
    }));
  }

  function getPlayerRows() {
    return snapshot.squads
      .map((entry) => ({
        playerName: entry.player?.name ?? "Unknown",
        team: teamById.get(entry.teamId)?.name ?? "",
        role: entry.player?.role ?? "",
        points: entry.player ? scorePlayer(entry.player) : 0,
      }))
      .sort((left, right) => right.points - left.points || left.playerName.localeCompare(right.playerName));
  }

  function getTeamPlayerSheets() {
    return snapshot.leaderboard.map((teamScore, teamIndex) => {
      const team = snapshot.teams.find((entry) => entry.id === teamScore.teamId);
      if (!team) return null;
      const players = snapshot.squads
        .filter((entry) => entry.teamId === team.id)
        .map((entry) => ({
          name: entry.player?.name ?? "Unknown player",
          role: entry.player?.role ?? "Player",
          points: entry.player ? scorePlayer(entry.player) : 0,
          price: entry.purchasePrice,
        }))
        .sort((left, right) => right.points - left.points || right.price - left.price);

      return {
        team,
        rank: teamIndex + 1,
        players,
      };
    }).filter(Boolean) as Array<{
      team: (typeof snapshot.teams)[number];
      rank: number;
      players: Array<{ name: string; role: string; points: number; price: number }>;
    }>;
  }

  function buildLeaderboardSvg(vertical = false) {
    const rows = snapshot.leaderboard;
    const width = vertical ? 760 : 1200;
    const headerHeight = vertical ? 140 : 120;
    const rowHeight = vertical ? 86 : 74;
    const height = headerHeight + rows.length * rowHeight + 40;

    const rowMarkup = rows
      .map((team, index) => {
        const y = headerHeight + index * rowHeight;
        const badgeX = vertical ? width - 180 : width - 220;
        const badgeWidth = vertical ? 120 : 150;
        const badgeTextX = badgeX + badgeWidth / 2;
        return `
          <rect x="36" y="${y}" width="${width - 72}" height="58" rx="20" fill="rgba(20,22,40,0.96)" stroke="rgba(107,114,255,0.22)" />
          <circle cx="78" cy="${y + 29}" r="19" fill="rgba(93,104,255,0.16)" stroke="rgba(117,127,255,0.34)" />
          <text x="78" y="${y + 36}" text-anchor="middle" font-size="19" font-weight="800" fill="#8b92ff">${index + 1}</text>
          <text x="122" y="${y + 35}" font-size="${vertical ? 22 : 25}" font-weight="700" fill="#f4f5ff">${team.teamName}</text>
          <rect x="${badgeX}" y="${y + 11}" width="${badgeWidth}" height="36" rx="18" fill="rgba(24,214,151,0.12)" stroke="rgba(24,214,151,0.26)" />
          <text x="${badgeTextX}" y="${y + 35}" text-anchor="middle" font-size="${vertical ? 18 : 22}" font-weight="800" fill="#25d69b">${team.totalPoints} pts</text>
        `;
      })
      .join("");

    return {
      width,
      height,
      svg: `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
          <rect width="100%" height="100%" fill="#090b16" />
          <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bgGlow)" />
          <defs>
            <radialGradient id="bgGlow" cx="20%" cy="0%" r="90%">
              <stop offset="0%" stop-color="#2e3cff" stop-opacity="0.22" />
              <stop offset="55%" stop-color="#0f1223" stop-opacity="0.08" />
              <stop offset="100%" stop-color="#090b16" stop-opacity="0" />
            </radialGradient>
          </defs>
          <text x="36" y="56" font-size="20" font-weight="700" fill="#8b92ff">SFL RESULTS</text>
          <text x="36" y="${vertical ? 100 : 92}" font-size="${vertical ? 34 : 40}" font-weight="800" fill="#f4f5ff">Team Rankings</text>
          ${rowMarkup}
        </svg>
      `,
    };
  }

  async function handleLeaderboardImage() {
    const { svg, width, height } = buildLeaderboardSvg();
    await downloadPngFromSvg(svg, `${snapshot.room.name}-team-rankings.png`, width, height);
  }

  async function handleLeaderboardImageVertical() {
    const { svg, width, height } = buildLeaderboardSvg(true);
    await downloadPngFromSvg(svg, `${snapshot.room.name}-team-rankings-mobile.png`, width, height);
  }

  function handleLeaderboardPdf() {
    const lines = snapshot.leaderboard.map(
      (team, index) => `#${index + 1}  ${team.teamName}  |  ${team.totalPoints} pts`,
    );
    downloadSimplePdf(
      `${snapshot.room.name}-team-rankings.pdf`,
      `${snapshot.room.name} - Team Rankings`,
      lines,
    );
  }

  function handleTeamPlayersPdf() {
    const topTenPlayers = snapshot.squads
      .map((entry) => ({
        playerName: entry.player?.name ?? "Unknown player",
        teamName: teamById.get(entry.teamId)?.name ?? "Unknown team",
        points: entry.player ? scorePlayer(entry.player) : 0,
      }))
      .sort((left, right) => right.points - left.points || left.playerName.localeCompare(right.playerName))
      .slice(0, 10);
    const sections = [
      {
        title: "Top 10 Players",
        subtitle: "Highest fantasy scores across the room",
        columns: [
          { key: "rank", label: "#", width: 40, align: "center" as const },
          { key: "playerName", label: "Player", width: 220 },
          { key: "teamName", label: "Team", width: 170 },
          { key: "points", label: "Points", width: 90, align: "right" as const },
        ],
        rows: topTenPlayers.map((player, index) => ({
          rank: index + 1,
          playerName: player.playerName,
          teamName: player.teamName,
          points: `${player.points} pts`,
        })),
      },
      ...getTeamPlayerSheets().map(({ team, rank, players }) => ({
        title: `#${rank} ${team.name}`,
        subtitle: `${players.length} players • ${snapshot.leaderboard[rank - 1]?.totalPoints ?? 0} pts`,
        columns: [
          { key: "rank", label: "#", width: 36, align: "center" as const },
          { key: "name", label: "Player", width: 210 },
          { key: "role", label: "Role", width: 120 },
          { key: "price", label: "Bought", width: 90, align: "right" as const },
          { key: "points", label: "Points", width: 90, align: "right" as const },
        ],
        rows: players.map((player, index) => ({
          rank: index + 1,
          name: player.name,
          role: player.role,
          price: formatCurrencyShort(player.price),
          points: `${player.points} pts`,
        })),
      })),
    ];

    downloadTablePdf(
      `${snapshot.room.name}-team-player-points.pdf`,
      `${snapshot.room.name} - Team Player Points`,
      sections,
    );
  }

  return (
    <div className="results-export-bar">
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
      <button className="btn-sm" onClick={() => void handleLeaderboardImage()} type="button">
        Rankings image
      </button>
      <button className="btn-sm" onClick={() => void handleLeaderboardImageVertical()} type="button">
        Rankings image mobile
      </button>
      <button className="btn-sm" onClick={handleLeaderboardPdf} type="button">
        Rankings PDF
      </button>
      <button className="btn-sm" onClick={handleTeamPlayersPdf} type="button">
        Team player PDF
      </button>
    </div>
  );
}
