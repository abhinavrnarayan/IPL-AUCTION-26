"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { Player, SquadEntry, Team } from "@/lib/domain/types";
import { formatCurrencyShort, toErrorMessage } from "@/lib/utils";

async function releasePlayer(roomCode: string, entryId: string) {
  const response = await fetch(`/api/rooms/${roomCode}/squad/${entryId}`, {
    method: "DELETE",
  });
  const payload = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not drop the player.");
  }
}

export function MyTeamPanel({
  isAdmin,
  players,
  roomCode,
  squads,
  team,
}: {
  isAdmin: boolean;
  players: Player[];
  roomCode: string;
  squads: SquadEntry[];
  team: Team | null;
}) {
  const router = useRouter();
  const [confirmEntryId, setConfirmEntryId] = useState<string | null>(null);
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const teamEntries = useMemo(
    () => (team ? squads.filter((entry) => entry.teamId === team.id) : []),
    [squads, team],
  );

  const selectedEntry = teamEntries.find((entry) => entry.id === confirmEntryId) ?? null;
  const selectedPlayer =
    players.find((player) => player.id === selectedEntry?.playerId) ?? null;

  async function handleConfirmDrop() {
    if (!selectedEntry) return;

    setPendingEntryId(selectedEntry.id);
    setError(null);

    try {
      await releasePlayer(roomCode, selectedEntry.id);
      setConfirmEntryId(null);
      router.refresh();
    } catch (releaseError) {
      setError(toErrorMessage(releaseError));
    } finally {
      setPendingEntryId(null);
    }
  }

  if (!team) {
    return null;
  }

  return (
    <>
      <details
        className="room-card"
        style={
          isAdmin
            ? {
                marginTop: "0.5rem",
                cursor: "pointer",
                borderColor: "rgba(251,191,36,0.15)",
              }
            : { marginTop: "0.5rem", cursor: "pointer" }
        }
      >
        <summary
          style={{
            outline: "none",
            listStyle: "none",
            display: "block",
            cursor: "pointer",
          }}
        >
          <strong>{team.name}</strong>
          <div className="subtle mono">{team.shortCode}</div>
          <div className="pill-row" style={{ marginTop: "0.5rem" }}>
            <span className="pill highlight">{formatCurrencyShort(team.purseRemaining)}</span>
            <span className="pill">Squad limit: {team.squadLimit}</span>
          </div>
        </summary>
        <div
          style={{
            marginTop: "1rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border)",
            display: "grid",
            gap: "0.65rem",
          }}
        >
          {teamEntries.length === 0 ? (
            <div className="subtle" style={{ fontSize: "0.9rem" }}>
              No players bought yet.
            </div>
          ) : (
            teamEntries.map((entry) => {
              const player = players.find((item) => item.id === entry.playerId);

              return (
                <div
                  key={entry.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: "0.75rem",
                    alignItems: "center",
                    padding: "0.7rem 0.85rem",
                    borderRadius: "16px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                      {player?.name ?? "Unknown player"}
                    </div>
                    <div className="subtle" style={{ fontSize: "0.82rem" }}>
                      {player?.role ?? "Player"}
                    </div>
                  </div>
                  <strong
                    style={{
                      color: isAdmin ? "var(--primary-strong)" : "var(--text)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatCurrencyShort(entry.purchasePrice)}
                  </strong>
                  <button
                    className="button ghost"
                    disabled={pendingEntryId === entry.id}
                    onClick={() => {
                      setError(null);
                      setConfirmEntryId(entry.id);
                    }}
                    style={{
                      minHeight: "36px",
                      padding: "0.4rem 0.8rem",
                      color: "var(--danger)",
                      borderColor: "rgba(244,63,94,0.22)",
                    }}
                    type="button"
                  >
                    {pendingEntryId === entry.id ? "Dropping..." : "Drop player"}
                  </button>
                </div>
              );
            })
          )}
          {error ? <div className="notice warning">{error}</div> : null}
        </div>
      </details>

      {selectedEntry && selectedPlayer ? (
        <div className="app-modal-backdrop" onClick={() => setConfirmEntryId(null)}>
          <div
            className="app-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="app-modal-head">
              <h3 style={{ margin: 0 }}>Drop player</h3>
            </div>
            <p className="subtle" style={{ margin: 0, lineHeight: 1.6 }}>
              Remove <strong style={{ color: "var(--text)" }}>{selectedPlayer.name}</strong> from{" "}
              <strong style={{ color: "var(--text)" }}>{team.name}</strong> and return{" "}
              <strong style={{ color: "var(--text)" }}>
                {formatCurrencyShort(selectedEntry.purchasePrice)}
              </strong>{" "}
              back to the purse?
            </p>
            <div className="app-modal-actions">
              <button
                className="button ghost"
                disabled={pendingEntryId === selectedEntry.id}
                onClick={() => setConfirmEntryId(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button danger"
                disabled={pendingEntryId === selectedEntry.id}
                onClick={() => void handleConfirmDrop()}
                type="button"
              >
                {pendingEntryId === selectedEntry.id ? "Dropping..." : "Confirm drop"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
