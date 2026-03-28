"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { Player, SquadEntry, Team, Trade } from "@/lib/domain/types";
import { formatCurrencyShort, toErrorMessage } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getRoomChannelName } from "@/lib/domain/realtime";

type TabId = "incoming" | "propose";

function toggleId(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

// ── Incoming offer card ───────────────────────────────────────────────────────

function TradeOfferCard({
  trade,
  teams,
  players,
  roomCode,
  canAccept,
  canReject,
}: {
  trade: Trade;
  teams: Team[];
  players: Player[];
  roomCode: string;
  canAccept: boolean;
  canReject: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const teamA = teams.find((t) => t.id === trade.teamAId);
  const teamB = teams.find((t) => t.id === trade.teamBId);
  const playerById = new Map(players.map((p) => [p.id, p]));

  async function act(action: "accept" | "reject") {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(
        `/api/rooms/${roomCode}/trades/${trade.id}/${action}`,
        { method: "POST" },
      );
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `Failed to ${action} trade.`);
      try {
        const supabase = getSupabaseBrowserClient();
        await supabase.channel(getRoomChannelName(roomCode)).send({ type: "broadcast", event: "REFRESH_ROOM" });
      } catch (e) { /* ignore */ }
      router.refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setPending(null);
    }
  }

  const isExecuted = trade.status === "EXECUTED";

  return (
    <div
      className="room-card"
      style={{
        opacity: isExecuted ? 0.7 : 1,
        borderColor: isExecuted ? "rgba(31,122,77,0.3)" : undefined,
      }}
    >
      <div className="header-row" style={{ marginBottom: "0.5rem" }}>
        <div>
          <strong>
            {teamA?.shortCode ?? "?"} → {teamB?.shortCode ?? "?"}
          </strong>
          <span
            className="pill"
            style={{
              marginLeft: "0.5rem",
              fontSize: "0.7rem",
              background:
                trade.status === "EXECUTED"
                  ? "rgba(31,122,77,0.12)"
                  : trade.status === "REJECTED"
                  ? "rgba(184,50,50,0.1)"
                  : "rgba(183,121,31,0.12)",
              color:
                trade.status === "EXECUTED"
                  ? "var(--success)"
                  : trade.status === "REJECTED"
                  ? "var(--danger)"
                  : "var(--warning)",
            }}
          >
            {trade.status}
          </span>
        </div>
        {trade.status === "PENDING" && (
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {canAccept && (
              <button
                className="button secondary"
                disabled={pending !== null}
                onClick={() => void act("accept")}
                style={{ minHeight: "30px", padding: "0.3rem 0.7rem", fontSize: "0.82rem" }}
                type="button"
              >
                {pending === "accept" ? "…" : "Accept"}
              </button>
            )}
            {canReject && (
              <button
                className="button ghost"
                disabled={pending !== null}
                onClick={() => void act("reject")}
                style={{ minHeight: "30px", padding: "0.3rem 0.7rem", fontSize: "0.82rem" }}
                type="button"
              >
                {pending === "reject" ? "…" : "Reject"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid two" style={{ gap: "0.5rem", fontSize: "0.82rem" }}>
        <div>
          <div className="subtle" style={{ fontSize: "0.7rem", marginBottom: "0.2rem" }}>
            {teamA?.shortCode} offers
          </div>
          {trade.playersFromA.length === 0 && trade.cashFromA === 0 ? (
            <span className="subtle">nothing</span>
          ) : (
            <>
              {trade.playersFromA.map((pid) => (
                <div key={pid}>{playerById.get(pid)?.name ?? pid}</div>
              ))}
              {trade.cashFromA > 0 && (
                <div style={{ color: "var(--success)" }}>
                  + {formatCurrencyShort(trade.cashFromA)} cash
                </div>
              )}
            </>
          )}
        </div>
        <div>
          <div className="subtle" style={{ fontSize: "0.7rem", marginBottom: "0.2rem" }}>
            {teamB?.shortCode} offers
          </div>
          {trade.playersFromB.length === 0 && trade.cashFromB === 0 ? (
            <span className="subtle">nothing</span>
          ) : (
            <>
              {trade.playersFromB.map((pid) => (
                <div key={pid}>{playerById.get(pid)?.name ?? pid}</div>
              ))}
              {trade.cashFromB > 0 && (
                <div style={{ color: "var(--success)" }}>
                  + {formatCurrencyShort(trade.cashFromB)} cash
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="notice warning" style={{ marginTop: "0.5rem", fontSize: "0.82rem" }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ── Propose form ──────────────────────────────────────────────────────────────

function ProposeForm({
  roomCode,
  teams,
  players,
  squads,
  myTeamId,
}: {
  roomCode: string;
  teams: Team[];
  players: Player[];
  squads: SquadEntry[];
  myTeamId: string;
}) {
  const router = useRouter();
  const [targetTeamId, setTargetTeamId] = useState(() => {
    const other = teams.find((t) => t.id !== myTeamId);
    return other?.id ?? "";
  });
  const [playersFromA, setPlayersFromA] = useState<string[]>([]);
  const [playersFromB, setPlayersFromB] = useState<string[]>([]);
  const [cashFromA, setCashFromA] = useState(0);
  const [cashFromB, setCashFromB] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const playerById = new Map(players.map((p) => [p.id, p]));
  const mySquad = squads.filter((e) => e.teamId === myTeamId);
  const theirSquad = squads.filter((e) => e.teamId === targetTeamId);
  const myTeam = teams.find((t) => t.id === myTeamId);
  const theirTeam = teams.find((t) => t.id === targetTeamId);

  const otherTeams = teams.filter((t) => t.id !== myTeamId);

  async function handlePropose() {
    if (!targetTeamId || targetTeamId === myTeamId) {
      setError("Select a different team to trade with.");
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamAId: myTeamId,
          teamBId: targetTeamId,
          playersFromA,
          playersFromB,
          cashFromA,
          cashFromB,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Trade proposal failed.");
      setSuccess(true);
      setPlayersFromA([]);
      setPlayersFromB([]);
      setCashFromA(0);
      setCashFromB(0);
      try {
        const supabase = getSupabaseBrowserClient();
        await supabase.channel(getRoomChannelName(roomCode)).send({ type: "broadcast", event: "REFRESH_ROOM" });
      } catch (e) { /* ignore */ }
      router.refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="form-grid">
      <div className="field">
        <label>Trade with</label>
        <select
          className="select"
          value={targetTeamId}
          onChange={(e) => {
            setTargetTeamId(e.target.value);
            setPlayersFromB([]);
          }}
        >
          {otherTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({formatCurrencyShort(t.purseRemaining)})
            </option>
          ))}
        </select>
      </div>

      <div className="grid two" style={{ gap: "1rem", marginTop: "1rem", marginBottom: "1rem" }}>
        <div className="panel" style={{ background: "linear-gradient(145deg, rgba(59, 130, 246, 0.08), rgba(0, 0, 0, 0.2))", borderColor: "rgba(59, 130, 246, 0.3)" }}>
          <strong style={{ fontSize: "1rem", display: "block", marginBottom: "0.2rem", color: "var(--primary-strong)" }}>
            {myTeam?.shortCode ?? "Select Team"} offers
          </strong>
          <div className="subtle" style={{ fontSize: "0.75rem", marginBottom: "0.75rem" }}>
            Select players from your squad to include in the trade.
          </div>
          
          <div className="checkbox-grid" style={{ marginBottom: "1rem" }}>
            {mySquad.length === 0 ? (
              <div className="empty-state" style={{ padding: "0.75rem", fontSize: "0.85rem" }}>
                No active players in this squad.
              </div>
            ) : (
              mySquad.map((entry) => {
                const player = playerById.get(entry.playerId);
                return (
                  <label className="checkbox-row" key={entry.id} style={{ fontSize: "0.9rem", padding: "0.4rem 0.6rem", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <input
                      checked={playersFromA.includes(entry.playerId)}
                      onChange={() => setPlayersFromA((p) => toggleId(p, entry.playerId))}
                      type="checkbox"
                    />
                    <span>
                      {player?.name ?? "Unknown"}{" "}
                      <span className="subtle" style={{ fontSize: "0.8rem" }}>
                        ({formatCurrencyShort(entry.purchasePrice)})
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
          
          <div className="field">
            <label style={{ fontSize: "0.85rem", color: "var(--success)" }}>Extra Cash (+)</label>
            <input
              className="input"
              min={0}
              step={100000}
              type="number"
              value={cashFromA}
              onChange={(e) => setCashFromA(Number(e.target.value))}
              style={{ background: "rgba(16, 185, 129, 0.05)", borderColor: "rgba(16, 185, 129, 0.2)" }}
            />
          </div>
        </div>

        <div className="panel" style={{ background: "linear-gradient(145deg, rgba(139, 92, 246, 0.08), rgba(0, 0, 0, 0.2))", borderColor: "rgba(139, 92, 246, 0.3)" }}>
          <strong style={{ fontSize: "1rem", display: "block", marginBottom: "0.2rem", color: "var(--secondary)" }}>
            {theirTeam?.shortCode ?? "Select Target"} offers
          </strong>
          <div className="subtle" style={{ fontSize: "0.75rem", marginBottom: "0.75rem" }}>
            Select players from their squad to request in return.
          </div>
          
          <div className="checkbox-grid" style={{ marginBottom: "1rem" }}>
            {theirSquad.length === 0 ? (
              <div className="empty-state" style={{ padding: "0.75rem", fontSize: "0.85rem" }}>
                No active players in this squad.
              </div>
            ) : (
              theirSquad.map((entry) => {
                const player = playerById.get(entry.playerId);
                return (
                  <label className="checkbox-row" key={entry.id} style={{ fontSize: "0.9rem", padding: "0.4rem 0.6rem", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <input
                      checked={playersFromB.includes(entry.playerId)}
                      onChange={() => setPlayersFromB((p) => toggleId(p, entry.playerId))}
                      type="checkbox"
                    />
                    <span>
                      {player?.name ?? "Unknown"}{" "}
                      <span className="subtle" style={{ fontSize: "0.8rem" }}>
                        ({formatCurrencyShort(entry.purchasePrice)})
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
          
          <div className="field">
            <label style={{ fontSize: "0.85rem", color: "var(--success)" }}>Extra Cash (+)</label>
            <input
              className="input"
              min={0}
              step={100000}
              type="number"
              value={cashFromB}
              onChange={(e) => setCashFromB(Number(e.target.value))}
              style={{ background: "rgba(16, 185, 129, 0.05)", borderColor: "rgba(16, 185, 129, 0.2)" }}
            />
          </div>
        </div>
      </div>

      {success && (
        <div className="notice success">Trade proposed — waiting for {theirTeam?.name} to accept.</div>
      )}
      {error && <div className="notice warning">{error}</div>}

      <button
        className="button secondary"
        disabled={pending || !targetTeamId}
        onClick={() => void handlePropose()}
        type="button"
      >
        {pending ? "Proposing…" : "Propose trade"}
      </button>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function TradePanel({
  roomCode,
  teams,
  players,
  squads,
  trades,
  currentUserId,
  isAdmin = false,
}: {
  roomCode: string;
  teams: Team[];
  players: Player[];
  squads: SquadEntry[];
  trades: Trade[];
  currentUserId: string | null;
  isAdmin?: boolean;
}) {
  const [tab, setTab] = useState<TabId>("incoming");

  const myTeam = teams.find((t) => t.ownerUserId === currentUserId) ?? null;
  const myTeamId = myTeam?.id ?? null;

  const pendingTrades = trades.filter((t) => t.status === "PENDING");
  const incomingToMe = pendingTrades.filter((t) => t.teamBId === myTeamId);
  const myOutgoing = pendingTrades.filter((t) => t.teamAId === myTeamId);
  const allPending = isAdmin ? pendingTrades : [...incomingToMe, ...myOutgoing];
  const recentExecuted = trades.filter((t) => t.status === "EXECUTED").slice(0, 5);

  const incomingCount = incomingToMe.length;

  return (
    <div className="panel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.75rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <h2 style={{ margin: 0 }}>Trade desk</h2>
        <div className="button-row">
          <button
            className={`button ${tab === "incoming" ? "secondary" : "ghost"}`}
            onClick={() => setTab("incoming")}
            style={{ minHeight: "32px", padding: "0.3rem 0.75rem", fontSize: "0.82rem" }}
            type="button"
          >
            Offers{incomingCount > 0 ? ` (${incomingCount})` : ""}
          </button>
          {(myTeamId || isAdmin) && (
            <button
              className={`button ${tab === "propose" ? "secondary" : "ghost"}`}
              onClick={() => setTab("propose")}
              style={{ minHeight: "32px", padding: "0.3rem 0.75rem", fontSize: "0.82rem" }}
              type="button"
            >
              Propose
            </button>
          )}
        </div>
      </div>

      {tab === "incoming" && (
        <div className="card-list">
          {allPending.length === 0 && recentExecuted.length === 0 ? (
            <div className="empty-state">No trades yet.</div>
          ) : (
            <>
              {allPending.map((trade) => {
                const isIncoming = trade.teamBId === myTeamId;
                return (
                  <TradeOfferCard
                    canAccept={isAdmin || isIncoming}
                    canReject={isAdmin || isIncoming || trade.teamAId === myTeamId}
                    key={trade.id}
                    players={players}
                    roomCode={roomCode}
                    teams={teams}
                    trade={trade}
                  />
                );
              })}
              {recentExecuted.map((trade) => (
                <TradeOfferCard
                  canAccept={false}
                  canReject={false}
                  key={trade.id}
                  players={players}
                  roomCode={roomCode}
                  teams={teams}
                  trade={trade}
                />
              ))}
            </>
          )}
        </div>
      )}

      {tab === "propose" && (
        <>
          {!myTeamId && !isAdmin ? (
            <div className="empty-state">You don't own a team in this room.</div>
          ) : teams.length < 2 ? (
            <div className="empty-state">Need at least 2 teams to propose a trade.</div>
          ) : (
            <ProposeForm
              myTeamId={myTeamId ?? teams[0]!.id}
              players={players}
              roomCode={roomCode}
              squads={squads}
              teams={teams}
            />
          )}
        </>
      )}
    </div>
  );
}
