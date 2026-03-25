"use client";

import { useMemo, useState } from "react";

import type { Player, Team } from "@/lib/domain/types";
import { formatCurrency, toErrorMessage } from "@/lib/utils";

export function PlayerPoolManager({
  canManage,
  players,
  roomCode,
  teams,
}: {
  canManage: boolean;
  players: Player[];
  roomCode: string;
  teams: Team[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<"selected" | "all" | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.orderIndex - b.orderIndex),
    [players],
  );
  const selectedCount = selectedIds.length;
  const allSelected = sortedPlayers.length > 0 && selectedCount === sortedPlayers.length;

  function togglePlayer(playerId: string) {
    setSelectedIds((curr) =>
      curr.includes(playerId) ? curr.filter((id) => id !== playerId) : [...curr, playerId],
    );
  }

  async function removePlayers(playerIds: string[], removeAll = false) {
    setPendingAction(removeAll ? "all" : playerIds.length === 1 ? playerIds[0] : "selected");
    setError(null);

    try {
      const response = await fetch(`/api/rooms/${roomCode}/players`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playerIds,
          removeAll,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to remove players.");
      }

      setSelectedIds([]);
      window.location.reload();
    } catch (removeError) {
      setError(toErrorMessage(removeError));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      {canManage ? (
        <div className="player-manager-toolbar">
          <div className="player-manager-summary">
            <span className="pill highlight">{players.length} players</span>
            <span className="pill">{selectedCount} selected</span>
          </div>
          <div className="player-manager-actions">
            <button
              className="button ghost"
              disabled={players.length === 0 || pendingAction !== null}
              onClick={() => setSelectedIds(allSelected ? [] : sortedPlayers.map((player) => player.id))}
              type="button"
            >
              {allSelected ? "Clear selection" : "Select all"}
            </button>
            <button
              className="button ghost"
              disabled={selectedIds.length === 0 || pendingAction !== null}
              onClick={() => void removePlayers(selectedIds)}
              type="button"
            >
              {pendingAction === "selected"
                ? "Removing..."
                : `Remove selected (${selectedCount})`}
            </button>
            <button
              className="button danger"
              disabled={players.length === 0 || pendingAction !== null}
              onClick={() => {
                if (!window.confirm("Remove all players from this room?")) return;
                void removePlayers([], true);
              }}
              type="button"
            >
              {pendingAction === "all" ? "Removing..." : "Remove all players"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div className="notice warning" style={{ marginBottom: "0.9rem" }}>{error}</div> : null}

      {sortedPlayers.length === 0 ? (
        <div className="empty-state">
          Upload a player sheet to populate round one and round two queues.
        </div>
      ) : (
        <div className="table-like">
          {sortedPlayers.slice(0, 200).map((player, index) => (
            <div
              className={`room-card${selectedIds.includes(player.id) ? " player-manager-card-selected" : ""}`}
              key={player.id}
              style={{ padding: "1rem 1.1rem" }}
            >
              <div className="header-row" style={{ alignItems: "center" }}>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", flex: 1, minWidth: 0 }}>
                  {canManage ? (
                    <input
                      checked={selectedIds.includes(player.id)}
                      disabled={pendingAction !== null}
                      onChange={() => togglePlayer(player.id)}
                      style={{ marginTop: "0.1rem" }}
                      type="checkbox"
                    />
                  ) : null}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{player.name}</strong>
                      <span className="subtle mono" style={{ fontSize: "0.76rem" }}>#{index + 1}</span>
                    </div>
                    <div className="subtle" style={{ fontSize: "0.86rem", marginTop: "0.2rem" }}>
                      {player.role}
                      {player.nationality ? ` | ${player.nationality}` : ""}
                      {" | "}
                      {formatCurrency(player.basePrice)}
                    </div>
                    {player.status === "SOLD" ? (
                      <div className="subtle" style={{ marginTop: "0.35rem", fontSize: "0.8rem" }}>
                        Sold to {teams.find((team) => team.id === player.currentTeamId)?.name ?? "Team"} for{" "}
                        {player.soldPrice ? formatCurrency(player.soldPrice) : "-"}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span className="pill">{player.status}</span>
                  {canManage ? (
                    <button
                      aria-label={`Remove ${player.name}`}
                      className="button ghost"
                      disabled={pendingAction !== null}
                      onClick={() => {
                        if (!window.confirm(`Remove ${player.name} from this room?`)) return;
                        void removePlayers([player.id]);
                      }}
                      style={{
                        minHeight: "30px",
                        minWidth: "30px",
                        padding: "0.2rem 0.45rem",
                        borderRadius: "999px",
                        fontSize: "0.85rem",
                      }}
                      type="button"
                    >
                      {pendingAction === player.id ? "..." : "x"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
