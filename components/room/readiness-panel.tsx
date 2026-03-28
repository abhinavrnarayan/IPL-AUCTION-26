"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

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

type PlayerListKey = "available" | "sold" | "unsold" | null;

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
  squadSize,
  timerSeconds,
  teams,
}: {
  isAdmin: boolean;
  members: RoomMember[];
  phase: string;
  players: Player[];
  roomCode: string;
  squadSize: number;
  timerSeconds: number;
  teams: Team[];
}) {
  const router = useRouter();
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openList, setOpenList] = useState<PlayerListKey>(null);
  const [pendingSquadSize, setPendingSquadSize] = useState(false);
  const [pendingTimerSeconds, setPendingTimerSeconds] = useState(false);
  const [squadSizeDraft, setSquadSizeDraft] = useState(String(squadSize));
  const [timerSecondsDraft, setTimerSecondsDraft] = useState(String(timerSeconds));
  const [purseDrafts, setPurseDrafts] = useState<Record<string, string>>(
    Object.fromEntries(teams.map((team) => [team.id, formatAmountInput(team.purseRemaining)])),
  );

  useEffect(() => {
    setSquadSizeDraft(String(squadSize));
  }, [squadSize]);

  useEffect(() => {
    setTimerSecondsDraft(String(timerSeconds));
  }, [timerSeconds]);

  useEffect(() => {
    setPurseDrafts(
      Object.fromEntries(teams.map((team) => [team.id, formatAmountInput(team.purseRemaining)])),
    );
  }, [teams]);

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

  async function updateSquadSize() {
    setPendingSquadSize(true);
    setError(null);

    try {
      const response = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          squadSize: Number(squadSizeDraft),
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update squad size.");
      }

      router.refresh();
    } catch (updateError) {
      setError(toErrorMessage(updateError));
    } finally {
      setPendingSquadSize(false);
    }
  }

  async function updateTimerSeconds() {
    setPendingTimerSeconds(true);
    setError(null);

    try {
      const response = await fetch(`/api/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timerSeconds: Number(timerSecondsDraft),
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update bid timer.");
      }

      router.refresh();
    } catch (updateError) {
      setError(toErrorMessage(updateError));
    } finally {
      setPendingTimerSeconds(false);
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
              {soldTeam.shortCode}
              {player.soldPrice ? ` | ${formatCurrencyShort(player.soldPrice)}` : ""}
            </div>
          ) : null}
        </div>
        {isAdmin ? (
          <button
            aria-label={`Remove ${player.name}`}
            className="button ghost"
            disabled={pendingPlayerId !== null}
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

  function toggleList(key: PlayerListKey) {
    setOpenList((current) => (current === key ? null : key));
  }

  const openPlayers =
    openList === "available"
      ? availablePlayerList
      : openList === "sold"
        ? soldPlayerList
        : openList === "unsold"
          ? unsoldPlayerList
          : [];

  return (
    <>
      {isAdmin ? (
        <div
          className="panel"
          style={{
            marginBottom: "1rem",
            padding: "0.9rem",
            background: "rgba(255,255,255,0.03)",
            borderColor: "rgba(99,102,241,0.16)",
          }}
        >
          <div style={{ display: "grid", gap: "0.9rem" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.9rem",
              }}
            >
              <div style={{ display: "grid", gap: "0.45rem" }}>
                <div style={{ fontWeight: 700 }}>Room squad size</div>
                <div className="subtle" style={{ fontSize: "0.8rem" }}>
                  Update the squad limit for the room and sync all teams together.
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: "0.55rem",
                  }}
                >
                  <input
                    className="input"
                    disabled={pendingSquadSize || phase === "LIVE" || phase === "PAUSED"}
                    min={1}
                    max={40}
                    onChange={(event) => setSquadSizeDraft(event.target.value)}
                    type="number"
                    value={squadSizeDraft}
                  />
                  <button
                    className="button ghost"
                    disabled={pendingSquadSize || phase === "LIVE" || phase === "PAUSED"}
                    onClick={() => void updateSquadSize()}
                    type="button"
                  >
                    {pendingSquadSize ? "Saving..." : "Save limit"}
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gap: "0.45rem" }}>
                <div style={{ fontWeight: 700 }}>Bid timer</div>
                <div className="subtle" style={{ fontSize: "0.8rem" }}>
                  Change the bid countdown for the room in seconds.
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: "0.55rem",
                  }}
                >
                  <input
                    className="input"
                    disabled={pendingTimerSeconds || phase === "LIVE" || phase === "PAUSED"}
                    min={5}
                    max={180}
                    onChange={(event) => setTimerSecondsDraft(event.target.value)}
                    type="number"
                    value={timerSecondsDraft}
                  />
                  <button
                    className="button ghost"
                    disabled={pendingTimerSeconds || phase === "LIVE" || phase === "PAUSED"}
                    onClick={() => void updateTimerSeconds()}
                    type="button"
                  >
                    {pendingTimerSeconds ? "Saving..." : "Save timer"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
        <div className="pill-row" style={{ position: "relative", zIndex: 30 }}>
          <button className="pill" onClick={() => toggleList("available")} type="button">
            Available: {availablePlayerList.length}
          </button>
          <button className="pill" onClick={() => toggleList("sold")} type="button">
            Sold: {soldPlayerList.length}
          </button>
          <button className="pill" onClick={() => toggleList("unsold")} type="button">
            Unsold: {unsoldPlayerList.length}
          </button>

          {openList ? (
            <div
              className="panel"
              style={{
                position: "absolute",
                top: "calc(100% + 0.5rem)",
                left: 0,
                zIndex: 120,
                width: "min(340px, 85vw)",
                maxHeight: "300px",
                overflowY: "auto",
                padding: "1rem",
                background: "#141726",
                border: "1px solid rgba(99,102,241,0.22)",
                boxShadow: "0 24px 48px rgba(0,0,0,0.45)",
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(99,102,241,0.3) transparent",
              }}
            >
              {openPlayers.map((player) => renderPlayerRow(player, openList === "sold"))}
            </div>
          ) : null}
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
