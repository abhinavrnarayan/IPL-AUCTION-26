import type { Player, Team } from "@/lib/domain/types";
import { formatCurrencyShort } from "@/lib/utils";

export function PlayerCard({
  player,
  currentTeam,
  currentBid,
}: {
  player: Player | null;
  currentTeam: Team | null;
  currentBid: number | null;
}) {
  if (!player) {
    return (
      <div className="player-card">
        <strong>No active player</strong>
        <div className="subtle">
          Start the auction or advance to the next player from the room controls.
        </div>
      </div>
    );
  }

  const franchise =
    (player.stats?.["franchise"] as string | undefined) ??
    (player.stats?.["team"] as string | undefined) ??
    (player.stats?.["ipl_team"] as string | undefined) ??
    null;

  return (
    <div className="player-card">
      <div className="header-row">
        <div>
          <span className="eyebrow">On the block</span>
          <h2 style={{ marginTop: "0.6rem" }}>{player.name}</h2>
          {franchise ? (
            <div className="subtle" style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>
              {franchise}
            </div>
          ) : null}
        </div>
        <div className="pill-row">
          <span className="pill">{player.role}</span>
          {player.nationality ? <span className="pill">{player.nationality}</span> : null}
          <span className="pill highlight">Base {formatCurrencyShort(player.basePrice)}</span>
        </div>
      </div>

      <div className="stats-strip">
        <div className="stat-tile">
          <strong>{formatCurrencyShort(currentBid ?? player.basePrice)}</strong>
          Current bid
        </div>
        <div className="stat-tile">
          <strong>{currentTeam?.shortCode ?? "Open"}</strong>
          {currentTeam?.name ?? "No bid yet"}
        </div>
        <div className="stat-tile">
          <strong>{player.status}</strong>
          Status
        </div>
      </div>
    </div>
  );
}
