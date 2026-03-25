"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import type { Player, RoomMember, Team } from "@/lib/domain/types";
import {
  deriveRoleLabel,
  formatAmountInput,
  formatCurrencyShort,
  parseAmountInput,
  toErrorMessage,
} from "@/lib/utils";

const summaryButtonStyle = {
  outline: "none",
  listStyle: "none",
  display: "block",
  cursor: "pointer",
} as const;

function ScrollList({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: "1rem",
        maxHeight: "250px",
        overflowY: "auto",
        fontSize: "0.85rem",
        display: "grid",
        gap: "0.4rem",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(99,102,241,0.3) transparent",
      }}
    >
      {children}
    </div>
  );
}

export function ReadinessPanel({
  isAdmin,
  members,
  phase,
  players,
  roomCode,
  teams,
}: {
  isAdmin: boolean;
  members: RoomMember[];
  phase: string;
  players: Player[];
  roomCode: string;
  teams: Team[];
}) {
  const router = useRouter();
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purseDrafts, setPurseDrafts] = useState<Record<string, string>>(
    Object.fromEntries(teams.map((team) => [team.id, formatAmountInput(team.purseRemaining)])),
  );

  const availablePlayerList = useMemo(
    () => players.filter((player) => player.status === "AVAILABLE"),
    [players],
  );
  const soldPlayerList = useMemo(
    () => players.filter((player) => player.status === "SOLD"),
    [players],
  );
  const unsoldPlayerList = useMemo(
    () => players.filter((player) => player.status === "UNSOLD"),
    [players],
  );

  async function removePlayer(player: Player) {
    setPendingPlayerId(player.id);
    setError(null);

    try {
      const response = await fetch(`/api/rooms/${roomCode}/players`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playerIds: [player.id],
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to remove player.");
      }

      router.refresh();
    } catch (removeError) {
      setError(toErrorMessage(removeError));
    } finally {
      setPendingPlayerId(null);
    }
  }

  async function updatePurse(teamId: string) {
    setPendingTeamId(teamId);
    setError(null);

    try {
      const purseRemaining = parseAmountInput(purseDrafts[teamId] ?? "");
      const response = await fetch(`/api/rooms/${roomCode}/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purseRemaining,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update purse.");
      }

      router.refresh();
    } catch (updateError) {
      setError(toErrorMessage(updateError));
    } finally {
      setPendingTeamId(null);
    }
  }

  function renderPlayerRow(player: Player, showSaleDetails = false) {
    const soldTeam = teams.find((team) => team.id === player.currentTeamId);

    return (
      <div
        key={player.id}
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
          alignItems: "flex-start",
          fontSize: "0.85rem",
          padding: "0.3rem 0",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, whiteSpace: "normal", wordBreak: "break-word" }}>
            {player.name} <span className="subtle">({player.role})</span>
          </div>
          {showSaleDetails && soldTeam ? (
            <div className="subtle" style={{ fontSize: "0.75rem", marginTop: "0.15rem" }}>
              {soldTeam.shortCode} {player.soldPrice ? `| ${formatCurrencyShort(player.soldPrice)}` : ""}
            </div>
          ) : null}
        </div>
        {isAdmin ? (
          <button
            aria-label={`Remove ${player.name}`}
            className="button ghost"
            disabled={pendingPlayerId !== null || phase === "LIVE" || phase === "PAUSED"}
            onClick={() => {
              if (!window.confirm(`Remove ${player.name} from this room?`)) return;
              void removePlayer(player);
            }}
            style={{
              minHeight: "30px",
              minWidth: "30px",
              padding: "0.2rem 0.45rem",
              borderRadius: "999px",
              fontSize: "0.85rem",
              flexShrink: 0,
            }}
            type="button"
          >
            {pendingPlayerId === player.id ? "..." : "x"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="stats-strip">
        <details className="stat-tile" style={{ cursor: "pointer" }}>
          <summary style={summaryButtonStyle}>
            <strong>{players.length}</strong>
            Total players
            <div className="subtle" style={{ marginTop: "0.35rem", fontSize: "0.78rem" }}>
              Click to view player list
            </div>
          </summary>
          <ScrollList>{players.map((player) => renderPlayerRow(player, player.status === "SOLD"))}</ScrollList>
        </details>

        <details className="stat-tile" style={{ cursor: "pointer" }}>
          <summary style={summaryButtonStyle}>
            <strong>{teams.length}</strong>
            Teams
            <div className="subtle" style={{ marginTop: "0.35rem", fontSize: "0.78rem" }}>
              Click to view teams
            </div>
          </summary>
          <ScrollList>
            {teams.map((team) => (
              <div
                key={team.id}
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  paddingBottom: "0.5rem",
                  display: "grid",
                  gap: "0.45rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 600, color: "var(--text)", whiteSpace: "normal", wordBreak: "break-word" }}>
                    {team.name}
                  </span>
                  <span style={{ color: "var(--secondary)", fontSize: "0.78rem", fontWeight: 700 }}>
                    {formatCurrencyShort(team.purseRemaining)} left
                  </span>
                </div>
                {isAdmin ? (
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.45rem" }}>
                    <input
                      className="input"
                      disabled={pendingTeamId !== null || phase === "LIVE"}
                      inputMode="text"
                      placeholder="50L or 2Cr"
                      onChange={(event) =>
                        setPurseDrafts((current) => ({
                          ...current,
                          [team.id]: event.target.value,
                        }))
                      }
                      type="text"
                      value={purseDrafts[team.id] ?? formatAmountInput(team.purseRemaining)}
                    />
                    <button
                      className="button ghost"
                      disabled={pendingTeamId !== null || phase === "LIVE"}
                      onClick={() => void updatePurse(team.id)}
                      type="button"
                    >
                      {pendingTeamId === team.id ? "Saving..." : "Save"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </ScrollList>
        </details>

        <details className="stat-tile" style={{ cursor: "pointer" }}>
          <summary style={summaryButtonStyle}>
            <strong>{members.length}</strong>
            Members
            <div className="subtle" style={{ marginTop: "0.35rem", fontSize: "0.78rem" }}>
              Click to view room members
            </div>
          </summary>
          <ScrollList>
            {members.map((member) => (
              <div
                key={member.userId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  paddingBottom: "0.2rem",
                  gap: "0.5rem",
                }}
              >
                <span>{member.displayName ?? member.email ?? "Unnamed"}</span>
                <span className="subtle">{deriveRoleLabel(member)}</span>
              </div>
            ))}
          </ScrollList>
        </details>
      </div>

      <div className="grid" style={{ marginTop: "0.9rem" }}>
        <div className="pill-row">
          <details style={{ cursor: "pointer", display: "inline-block", position: "relative", zIndex: 30 }}>
            <summary className="pill" style={summaryButtonStyle}>
              Available: {availablePlayerList.length}
            </summary>
            <div
              className="panel"
              style={{
                position: "absolute",
                zIndex: 120,
                marginTop: "0.5rem",
                width: "min(320px, 85vw)",
                maxHeight: "300px",
                overflowY: "auto",
                padding: "1rem",
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(99,102,241,0.3) transparent",
              }}
            >
              {availablePlayerList.map((player) => renderPlayerRow(player))}
            </div>
          </details>

          <details style={{ cursor: "pointer", display: "inline-block", position: "relative", zIndex: 30 }}>
            <summary className="pill" style={summaryButtonStyle}>
              Sold: {soldPlayerList.length}
            </summary>
            <div
              className="panel"
              style={{
                position: "absolute",
                zIndex: 120,
                marginTop: "0.5rem",
                width: "min(340px, 85vw)",
                maxHeight: "300px",
                overflowY: "auto",
                padding: "1rem",
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(99,102,241,0.3) transparent",
              }}
            >
              {soldPlayerList.map((player) => renderPlayerRow(player, true))}
            </div>
          </details>

          <details style={{ cursor: "pointer", display: "inline-block", position: "relative", zIndex: 30 }}>
            <summary className="pill" style={summaryButtonStyle}>
              Unsold: {unsoldPlayerList.length}
            </summary>
            <div
              className="panel"
              style={{
                position: "absolute",
                zIndex: 120,
                marginTop: "0.5rem",
                width: "min(320px, 85vw)",
                maxHeight: "300px",
                overflowY: "auto",
                padding: "1rem",
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(99,102,241,0.3) transparent",
              }}
            >
              {unsoldPlayerList.map((player) => renderPlayerRow(player))}
            </div>
          </details>
        </div>
        <div className="subtle" style={{ fontSize: "0.8rem" }}>
          Click any count above to open the matching list.
          {isAdmin ? " Admin can edit purse values and remove players here." : ""}
        </div>
      </div>

      {error ? <div className="notice warning" style={{ marginTop: "1rem" }}>{error}</div> : null}
    </>
  );
}
