"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getAllowedIncrements } from "@/lib/domain/auction";
import type { AuctionState, Player, RoomMember, Team } from "@/lib/domain/types";
import { formatCurrencyShort, formatIncrement, toErrorMessage } from "@/lib/utils";

async function placeBid(
  roomCode: string,
  teamId: string,
  increment?: number,
): Promise<string | null> {
  const response = await fetch(`/api/rooms/${roomCode}/auction/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId, increment }),
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) return payload.error ?? "Bid failed.";
  return null;
}

async function castSkipVote(roomCode: string, teamId: string): Promise<string | null> {
  const response = await fetch(`/api/rooms/${roomCode}/auction/skip-vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId }),
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) return payload.error ?? "Skip vote failed.";
  return null;
}

function IncrementButtons({
  auctionState,
  currentPlayer,
  team,
  roomCode,
  anyPending,
  isLive,
  onPendingChange,
  onError,
}: {
  auctionState: AuctionState;
  currentPlayer: Player | null;
  team: Team;
  roomCode: string;
  anyPending: boolean;
  isLive: boolean;
  onPendingChange: (teamId: string | null) => void;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const isLeading = team.id === auctionState.currentTeamId;
  const currentBid = auctionState.currentBid;
  const allowedIncrements = getAllowedIncrements(currentBid);
  const isFirstBid = currentBid === null;

  if (isFirstBid) {
    const openPrice = currentPlayer?.basePrice ?? null;
    const canAfford = openPrice !== null && team.purseRemaining >= openPrice;
    const disabled = !isLive || !currentPlayer || !canAfford || anyPending;

    return (
      <button
        className="button"
        disabled={disabled}
        onClick={async () => {
          onPendingChange(team.id);
          onError(null);
          const err = await placeBid(roomCode, team.id);
          if (err) onError(err);
          else router.refresh();
          onPendingChange(null);
        }}
        style={{ width: "100%", marginTop: "0.5rem" }}
        type="button"
      >
        {openPrice !== null ? `Open ${formatCurrencyShort(openPrice)}` : "Open bid"}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
      {allowedIncrements.map((inc) => {
        const nextAmount = currentBid + inc;
        const canAfford = team.purseRemaining >= nextAmount;
        const disabled = !isLive || !currentPlayer || isLeading || !canAfford || anyPending;

        return (
          <button
            className="button"
            disabled={disabled}
            key={inc}
            onClick={async () => {
              onPendingChange(team.id);
              onError(null);
              const err = await placeBid(roomCode, team.id, inc);
              if (err) onError(err);
              else router.refresh();
              onPendingChange(null);
            }}
            style={{ flex: "1", minWidth: "3.5rem", fontSize: "0.8rem" }}
            title={`Bid ${formatCurrencyShort(nextAmount)}`}
            type="button"
          >
            +{formatIncrement(inc)}
          </button>
        );
      })}
    </div>
  );
}

function AdminBidPanel({
  roomCode,
  auctionState,
  currentPlayer,
  teams,
}: {
  roomCode: string;
  auctionState: AuctionState;
  currentPlayer: Player | null;
  teams: Team[];
}) {
  const router = useRouter();
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  const [skipPendingId, setSkipPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isLive = auctionState.phase === "LIVE";
  const currentBid = auctionState.currentBid;
  const skipVotes = auctionState.skipVoteTeamIds;

  return (
    <div className="panel">
      <h2>Bid panel</h2>
      <div className="subtle" style={{ marginBottom: "0.75rem" }}>
        {currentBid !== null ? (
          <>Leading: <strong>{formatCurrencyShort(currentBid)}</strong></>
        ) : (
          "No bids yet — open at base price"
        )}
        {" · "}
        <span className="pill" style={{ fontSize: "0.75rem" }}>Admin control</span>
        {skipVotes.length > 0 && (
          <span className="pill" style={{ fontSize: "0.75rem", marginLeft: "0.4rem" }}>
            Skip {skipVotes.length}/{teams.length}
          </span>
        )}
      </div>

      {error ? (
        <div className="notice warning" style={{ marginBottom: "0.75rem" }}>
          {error}
        </div>
      ) : null}

      <div className="team-grid">
        {teams.map((team) => {
          const isLeading = team.id === auctionState.currentTeamId;
          const hasSkipVoted = skipVotes.includes(team.id);

          return (
            <div
              className="room-card"
              key={team.id}
              style={{
                outline: isLeading ? "2px solid var(--accent, #4ade80)" : undefined,
              }}
            >
              <div className="header-row" style={{ alignItems: "center" }}>
                <div>
                  <strong>{team.name}</strong>
                  <div className="subtle mono" style={{ fontSize: "0.8rem" }}>
                    {team.shortCode}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  {isLeading ? (
                    <span className="pill highlight" style={{ fontSize: "0.75rem" }}>
                      Leading
                    </span>
                  ) : null}
                  {hasSkipVoted ? (
                    <span className="pill skip-voted-pill" style={{ fontSize: "0.72rem" }}>
                      Skip ✓
                    </span>
                  ) : (
                    <button
                      className="button ghost skip-btn"
                      disabled={!isLive || skipPendingId === team.id || Boolean(pendingTeamId)}
                      onClick={async () => {
                        setSkipPendingId(team.id);
                        const err = await castSkipVote(roomCode, team.id);
                        if (err) setError(err);
                        else router.refresh();
                        setSkipPendingId(null);
                      }}
                      type="button"
                    >
                      Skip
                    </button>
                  )}
                </div>
              </div>
              <div className="subtle" style={{ marginTop: "0.25rem", fontSize: "0.85rem" }}>
                Purse: {formatCurrencyShort(team.purseRemaining)}
              </div>
              <IncrementButtons
                anyPending={Boolean(pendingTeamId) || Boolean(skipPendingId)}
                auctionState={auctionState}
                currentPlayer={currentPlayer}
                isLive={isLive}
                onError={setError}
                onPendingChange={setPendingTeamId}
                roomCode={roomCode}
                team={team}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BidPanel({
  roomCode,
  auctionState,
  currentPlayer,
  teams,
  currentMember,
}: {
  roomCode: string;
  auctionState: AuctionState;
  currentPlayer: Player | null;
  teams: Team[];
  currentMember: RoomMember | null;
}) {
  const router = useRouter();
  const [teamId, setTeamId] = useState("");
  const [pending, setPending] = useState(false);
  const [skipPending, setSkipPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId && teams[0]) {
      setTeamId(teams[0].id);
    }
  }, [teamId, teams]);

  if (currentMember?.isAdmin) {
    return (
      <AdminBidPanel
        auctionState={auctionState}
        currentPlayer={currentPlayer}
        roomCode={roomCode}
        teams={teams}
      />
    );
  }

  const isLive = auctionState.phase === "LIVE";
  const currentBid = auctionState.currentBid;
  const allowedIncrements = getAllowedIncrements(currentBid);
  const isFirstBid = currentBid === null;

  const selectedTeam = teams.find((t) => t.id === teamId) ?? null;
  const isLeading = selectedTeam?.id === auctionState.currentTeamId;
  const hasSkipVoted = selectedTeam ? auctionState.skipVoteTeamIds.includes(selectedTeam.id) : false;

  async function handleIncrementBid(increment?: number) {
    if (!teamId) {
      setError("Choose a team to place the next bid.");
      return;
    }
    setPending(true);
    setError(null);
    const err = await placeBid(roomCode, teamId, increment);
    if (err) setError(err);
    else router.refresh();
    setPending(false);
  }

  async function handleSkipVote() {
    if (!teamId) return;
    setSkipPending(true);
    setError(null);
    try {
      const err = await castSkipVote(roomCode, teamId);
      if (err) setError(err);
      else router.refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    }
    setSkipPending(false);
  }

  const canBid =
    Boolean(currentPlayer) &&
    isLive &&
    Boolean(currentMember?.isPlayer) &&
    !isLeading;

  return (
    <div className="panel">
      <h2>Bid panel</h2>
      <div className="field" style={{ marginBottom: "0.75rem" }}>
        <label htmlFor="team-select">Bid as team</label>
        <select
          className="select"
          id="team-select"
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
        >
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name} ({formatCurrencyShort(team.purseRemaining)})
            </option>
          ))}
        </select>
      </div>

      <div className="notice" style={{ marginBottom: "0.5rem" }}>
        {currentBid !== null ? (
          <>Leading: <strong>{formatCurrencyShort(currentBid)}</strong></>
        ) : (
          <>Base: <strong>{currentPlayer ? formatCurrencyShort(currentPlayer.basePrice) : "N/A"}</strong></>
        )}
      </div>

      {error ? <div className="notice warning" style={{ marginBottom: "0.5rem" }}>{error}</div> : null}

      {isFirstBid ? (
        <button
          className="button"
          disabled={!canBid || pending || !selectedTeam || (selectedTeam.purseRemaining < (currentPlayer?.basePrice ?? 0))}
          onClick={() => void handleIncrementBid(undefined)}
          style={{ width: "100%" }}
          type="button"
        >
          {pending ? "Submitting..." : `Open ${currentPlayer ? formatCurrencyShort(currentPlayer.basePrice) : "N/A"}`}
        </button>
      ) : (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {allowedIncrements.map((inc) => {
            const nextAmount = (currentBid ?? 0) + inc;
            const canAfford = selectedTeam ? selectedTeam.purseRemaining >= nextAmount : false;

            return (
              <button
                className="button"
                disabled={!canBid || pending || !canAfford}
                key={inc}
                onClick={() => void handleIncrementBid(inc)}
                style={{ flex: "1", minWidth: "3.5rem", fontSize: "0.85rem" }}
                title={`Bid ${formatCurrencyShort(nextAmount)}`}
                type="button"
              >
                {pending ? "…" : `+${formatIncrement(inc)}`}
              </button>
            );
          })}
        </div>
      )}

      {isLive && currentPlayer && currentMember?.isPlayer && (
        <button
          className={`button ghost skip-btn`}
          disabled={hasSkipVoted || skipPending || pending}
          onClick={() => void handleSkipVote()}
          style={{ width: "100%", marginTop: "0.75rem" }}
          type="button"
        >
          {hasSkipVoted ? "✓ Voted to skip" : skipPending ? "Voting…" : "Skip player"}
        </button>
      )}
    </div>
  );
}
