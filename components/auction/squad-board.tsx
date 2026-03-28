"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AuctionPhase, Player, SquadEntry, Team } from "@/lib/domain/types";
import { formatCurrencyShort } from "@/lib/utils";

async function renameTeam(
  roomCode: string,
  teamId: string,
  name: string,
): Promise<string | null> {
  const res = await fetch(`/api/rooms/${roomCode}/teams/${teamId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const payload = (await res.json()) as { error?: string };
  if (!res.ok) return payload.error ?? "Rename failed.";
  return null;
}

async function releasePlayer(roomCode: string, entryId: string): Promise<string | null> {
  const res = await fetch(`/api/rooms/${roomCode}/squad/${entryId}`, { method: "DELETE" });
  const payload = (await res.json()) as { error?: string };
  if (!res.ok) return payload.error ?? "Release failed.";
  return null;
}

function PlayerRow({
  entry,
  player,
  canRelease,
  roomCode,
}: {
  entry: SquadEntry;
  player: Player | null;
  canRelease: boolean;
  roomCode: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleRelease() {
    setPending(true);
    const err = await releasePlayer(roomCode, entry.id);
    if (err) {
      setError(err);
    } else {
      setConfirmOpen(false);
      router.refresh();
    }
    setPending(false);
  }

  return (
    <>
      <div className="squad-player-row" style={{ gap: "0.4rem" }}>
        <span className="squad-player-name">{player?.name ?? "Unknown"}</span>
        <span className="squad-player-role">{player?.role ?? ""}</span>
        <span className="squad-player-price">{formatCurrencyShort(entry.purchasePrice)}</span>
        {canRelease ? (
          <button
            className="squad-edit-btn"
            disabled={pending}
            onClick={() => setConfirmOpen(true)}
            style={{ color: "var(--danger)", opacity: 0.8 }}
            title="Drop player"
            type="button"
          >
            Drop
          </button>
        ) : null}
        {error ? (
          <span style={{ fontSize: "0.7rem", color: "var(--danger)" }}>{error}</span>
        ) : null}
      </div>

      {confirmOpen ? (
        <div className="app-modal-backdrop" onClick={() => setConfirmOpen(false)}>
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
              Remove <strong style={{ color: "var(--text)" }}>{player?.name ?? "this player"}</strong> and
              return <strong style={{ color: "var(--text)" }}>{formatCurrencyShort(entry.purchasePrice)}</strong> back
              to the team purse?
            </p>
            <div className="app-modal-actions">
              <button
                className="button ghost"
                disabled={pending}
                onClick={() => setConfirmOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button danger"
                disabled={pending}
                onClick={() => void handleRelease()}
                type="button"
              >
                {pending ? "Dropping..." : "Confirm drop"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function TeamSection({
  team,
  entries,
  players,
  canRename,
  canRelease,
  roomCode,
  phase,
}: {
  team: Team;
  entries: SquadEntry[];
  players: Map<string, Player>;
  canRename: boolean;
  canRelease: boolean;
  roomCode: string;
  phase: AuctionPhase;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [nameInput, setNameInput] = useState(team.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLive = phase === "LIVE";

  async function handleRename() {
    if (nameInput.trim() === team.name || !nameInput.trim()) {
      setEditing(false);
      return;
    }
    setPending(true);
    const err = await renameTeam(roomCode, team.id, nameInput.trim());
    setPending(false);
    if (err) {
      setError(err);
    } else {
      setError(null);
      setEditing(false);
      router.refresh();
    }
  }

  return (
    <div
      className="squad-team"
      style={{
        marginBottom: "0.5rem",
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <button
        className="squad-team-header"
        onClick={() => !editing && setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.75rem 1rem",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          transition: "background 0.2s",
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
        onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
          <span
            className="squad-shortcode"
            style={{
              padding: "0.2rem 0.5rem",
              background: "var(--primary)",
              color: "#fff",
              borderRadius: "4px",
              fontSize: "0.75rem",
              fontWeight: "bold",
            }}
          >
            {team.shortCode}
          </span>
          {editing ? (
            <input
              autoFocus
              className="input squad-rename-input"
              disabled={pending}
              value={nameInput}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => void handleRename()}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRename();
                if (e.key === "Escape") {
                  setEditing(false);
                  setNameInput(team.name);
                }
              }}
            />
          ) : (
            <span
              className="squad-team-name"
              title={team.name}
              style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)" }}
            >
              {team.name}
            </span>
          )}
          {canRename && !isLive && !editing ? (
            <div
              className="squad-edit-btn"
              title="Rename team"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
                setNameInput(team.name);
              }}
              style={{ padding: "0.2rem 0.5rem", cursor: "pointer", fontSize: "0.8rem", opacity: 0.6 }}
            >
              Edit
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
          <span className="subtle" style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            {entries.length}/{team.squadLimit} Players
          </span>
          <span className="squad-purse" style={{ fontWeight: "bold", color: "var(--success)" }}>
            {formatCurrencyShort(team.purseRemaining)}
          </span>
          <span
            style={{
              fontSize: "0.8rem",
              opacity: 0.5,
              marginLeft: "0.2rem",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          >
            ?
          </span>
        </div>
      </button>

      {error ? (
        <div style={{ padding: "0.25rem 1rem", fontSize: "0.78rem", color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}

      {expanded ? (
        <div
          style={{
            padding: "0 1rem 0.75rem 1rem",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            marginTop: "0.25rem",
            paddingTop: "0.75rem",
          }}
        >
          {entries.length === 0 ? (
            <div className="squad-empty" style={{ fontSize: "0.85rem", opacity: 0.6, fontStyle: "italic" }}>
              No players purchased yet.
            </div>
          ) : (
            <div className="squad-players" style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {entries.map((entry) => {
                const player = players.get(entry.playerId);
                return (
                  <PlayerRow
                    canRelease={canRelease}
                    entry={entry}
                    key={entry.id}
                    player={player ?? null}
                    roomCode={roomCode}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function SquadBoard({
  teams,
  squads,
  players,
  roomCode,
  phase,
  currentUserId,
  isAdmin = false,
  scrollable = true,
}: {
  teams: Team[];
  squads: SquadEntry[];
  players: Player[];
  roomCode: string;
  phase: AuctionPhase;
  currentUserId: string | null;
  isAdmin?: boolean;
  scrollable?: boolean;
}) {
  const playerById = new Map(players.map((p) => [p.id, p]));

  return (
    <div className="panel squad-board-panel">
      <h2>Squads</h2>
      <div
        className="squad-board"
        style={scrollable ? undefined : { maxHeight: "none", overflowY: "visible" }}
      >
        {teams.map((team) => {
          const entries = squads.filter((s) => s.teamId === team.id);
          const isOwner = currentUserId !== null && team.ownerUserId === currentUserId;
          const canRename = isOwner;
          const canRelease = isAdmin;

          return (
            <TeamSection
              canRelease={canRelease}
              canRename={canRename}
              entries={entries}
              key={team.id}
              phase={phase}
              players={playerById}
              roomCode={roomCode}
              team={team}
            />
          );
        })}
      </div>
    </div>
  );
}
