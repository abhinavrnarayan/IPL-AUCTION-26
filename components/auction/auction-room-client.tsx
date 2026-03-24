"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { BidPanel } from "@/components/auction/bid-panel";
import { EmojiReactions } from "@/components/auction/emoji-reactions";
import { SquadBoard } from "@/components/auction/squad-board";
import { TimerBar } from "@/components/auction/timer-bar";
import { TradePanel } from "@/components/trades/trade-panel";
import { hasBrowserSupabaseEnv } from "@/lib/config";
import { getAllowedIncrements } from "@/lib/domain/auction";
import { ROOM_EVENTS, getRoomChannelName } from "@/lib/domain/realtime";
import type { AuctionSnapshot, EmojiReaction } from "@/lib/domain/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatCurrencyShort, formatIncrement, toErrorMessage } from "@/lib/utils";

function getRemainingSeconds(expiresAt: string | null) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AuctionRoomClient({ snapshot }: { snapshot: AuctionSnapshot }) {
  const router = useRouter();
  const channelRef = useRef<any>(null);
  const autoAdvanceKey = useRef<string | null>(null);
  const prevPlayerIdRef = useRef<string | null>(snapshot.auctionState.currentPlayerId);

  const [recentReactions, setRecentReactions] = useState<EmojiReaction[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState(
    getRemainingSeconds(snapshot.auctionState.expiresAt),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [pausePending, setPausePending] = useState(false);
  const [resumePending, setResumePending] = useState(false);
  const [advancePending, setAdvancePending] = useState(false);
  const [optimisticPhase, setOptimisticPhase] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resultOverlay, setResultOverlay] = useState<{
    kind: "SOLD" | "UNSOLD";
    playerName: string;
  } | null>(null);

  // Player-side bid state (used in bottom bar)
  const [bidTeamId, setBidTeamId] = useState(() => snapshot.teams[0]?.id ?? "");
  const [bidPending, setBidPending] = useState(false);
  const [skipPending, setSkipPending] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);

  // ROUND_END — player picker for next round
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [nextRoundPending, setNextRoundPending] = useState(false);

  const currentPlayer =
    snapshot.players.find((p) => p.id === snapshot.auctionState.currentPlayerId) ?? null;
  const currentTeam =
    snapshot.teams.find((t) => t.id === snapshot.auctionState.currentTeamId) ?? null;

  const effectivePhase = optimisticPhase ?? snapshot.auctionState.phase;
  const isAdmin = Boolean(snapshot.currentMember?.isAdmin);
  const isLive = effectivePhase === "LIVE";
  const isPaused = effectivePhase === "PAUSED";
  const currentBid = snapshot.auctionState.currentBid;
  const allowedIncrements = getAllowedIncrements(currentBid);
  const isFirstBid = currentBid === null;

  const selectedTeam = snapshot.teams.find((t) => t.id === bidTeamId) ?? null;
  const isLeading = selectedTeam?.id === snapshot.auctionState.currentTeamId;
  const hasSkipVoted = selectedTeam
    ? snapshot.auctionState.skipVoteTeamIds.includes(selectedTeam.id)
    : false;
  const myOwnedTeam = snapshot.teams.find((team) => team.ownerUserId === snapshot.user?.id) ?? null;
  const showPlayerBidBar = !isAdmin || Boolean(myOwnedTeam);
  const bidBarTeams = myOwnedTeam ? [myOwnedTeam] : snapshot.teams;

  const soldCount = snapshot.players.filter((p) => p.status === "SOLD").length;
  const unsoldCount = snapshot.players.filter((p) => p.status === "UNSOLD").length;
  const hasAvailablePlayers = snapshot.players.some((p) => p.status === "AVAILABLE");
  const skipVoteCount = snapshot.auctionState.skipVoteTeamIds.length;

  const franchise =
    (currentPlayer?.stats?.["franchise"] as string | undefined) ??
    (currentPlayer?.stats?.["team"] as string | undefined) ??
    (currentPlayer?.stats?.["ipl_team"] as string | undefined) ??
    null;

  const roleClass = currentPlayer
    ? `role-${currentPlayer.role.toUpperCase().replace(/[\s/]+/g, "-")}`
    : "";

  useEffect(() => {
    if (myOwnedTeam && bidTeamId !== myOwnedTeam.id) {
      setBidTeamId(myOwnedTeam.id);
      return;
    }

    if (!myOwnedTeam && !snapshot.teams.some((team) => team.id === bidTeamId)) {
      setBidTeamId(snapshot.teams[0]?.id ?? "");
    }
  }, [bidTeamId, myOwnedTeam, snapshot.teams]);

  // Reset optimistic phase when server confirms update
  useEffect(() => {
    setOptimisticPhase(null);
  }, [snapshot.auctionState.version]);

  // SOLD/UNSOLD overlay — fires when current player changes
  useEffect(() => {
    const prevId = prevPlayerIdRef.current;
    const newId = snapshot.auctionState.currentPlayerId;
    prevPlayerIdRef.current = newId;

    if (!prevId || prevId === newId) return;

    const oldPlayer = snapshot.players.find((p) => p.id === prevId);
    if (oldPlayer?.status !== "SOLD" && oldPlayer?.status !== "UNSOLD") return;

    setResultOverlay({ kind: oldPlayer.status, playerName: oldPlayer.name });
    const t = setTimeout(() => setResultOverlay(null), 2500);
    return () => clearTimeout(t);
  }, [snapshot.auctionState.currentPlayerId, snapshot.players]);

  const routerRef = useRef(router);
  routerRef.current = router;
  const refreshRoom = useCallback(() => {
    routerRef.current.refresh();
  }, []);

  // Timer — stops immediately when optimistic phase is PAUSED
  useEffect(() => {
    setRemainingSeconds(getRemainingSeconds(snapshot.auctionState.expiresAt));

    const phase = optimisticPhase ?? snapshot.auctionState.phase;
    if (phase !== "LIVE" || !snapshot.auctionState.expiresAt) return;

    const interval = window.setInterval(() => {
      setRemainingSeconds(getRemainingSeconds(snapshot.auctionState.expiresAt));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [snapshot.auctionState.expiresAt, snapshot.auctionState.phase, optimisticPhase]);

  // Realtime subscription
  useEffect(() => {
    if (!hasBrowserSupabaseEnv) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(getRoomChannelName(snapshot.room.code))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auction_state", filter: `room_id=eq.${snapshot.room.id}` },
        () => refreshRoom(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bids", filter: `room_id=eq.${snapshot.room.id}` },
        () => refreshRoom(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${snapshot.room.id}` },
        () => refreshRoom(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teams", filter: `room_id=eq.${snapshot.room.id}` },
        () => refreshRoom(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squad", filter: `room_id=eq.${snapshot.room.id}` },
        () => refreshRoom(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trades", filter: `room_id=eq.${snapshot.room.id}` },
        () => refreshRoom(),
      )
      .on("broadcast", { event: ROOM_EVENTS.emoji }, ({ payload }) => {
        const reaction = payload as EmojiReaction;
        setRecentReactions((curr) => [reaction, ...curr].slice(0, 12));
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [refreshRoom, snapshot.room.code, snapshot.room.id]);

  // Auto-advance (admin only, fires when timer reaches 0)
  useEffect(() => {
    const shouldAutoAdvance =
      remainingSeconds === 0 &&
      snapshot.auctionState.phase === "LIVE" &&
      Boolean(snapshot.currentMember?.isAdmin);

    if (!shouldAutoAdvance) return;

    const key = `${snapshot.auctionState.version}:${snapshot.auctionState.currentPlayerId}`;
    if (autoAdvanceKey.current === key) return;
    autoAdvanceKey.current = key;
    void runAdvance();
  }, [
    remainingSeconds,
    snapshot.auctionState.currentPlayerId,
    snapshot.auctionState.phase,
    snapshot.auctionState.version,
    snapshot.currentMember?.isAdmin,
  ]);

  async function runControlAction(
    url: string,
    optimistic: string | null,
    setPending: (v: boolean) => void,
  ) {
    if (optimistic) setOptimisticPhase(optimistic);
    setPending(true);
    setActionError(null);
    try {
      const response = await fetch(url, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setOptimisticPhase(null);
        throw new Error(payload.error ?? "Auction action failed.");
      }
      router.refresh();
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function runAdvance() {
    setAdvancePending(true);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/rooms/${snapshot.room.code}/auction/advance`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Auction action failed.");
      router.refresh();
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setAdvancePending(false);
    }
  }

  async function handleEndRound() {
    const msg = hasAvailablePlayers
      ? "End the round? All remaining players will be marked unsold and the auction will complete."
      : "Close the auction window? No further changes will be possible.";
    if (!window.confirm(msg)) return;
    try {
      const res = await fetch(
        `/api/rooms/${snapshot.room.code}/auction/end-round`,
        { method: "POST" },
      );
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to end round.");
      router.refresh();
    } catch (err) {
      setActionError(toErrorMessage(err));
    }
  }

  async function handleStartNextRound() {
    if (selectedPlayerIds.length === 0) {
      setActionError("Select at least one player for the next round.");
      return;
    }
    setNextRoundPending(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/rooms/${snapshot.room.code}/auction/start-next-round`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerIds: selectedPlayerIds }),
        },
      );
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to start next round.");
      setSelectedPlayerIds([]);
      router.refresh();
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setNextRoundPending(false);
    }
  }

  async function handleBid(increment?: number) {
    if (!bidTeamId) return;
    setBidPending(true);
    setBidError(null);
    try {
      const res = await fetch(`/api/rooms/${snapshot.room.code}/auction/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: bidTeamId, increment }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) setBidError(payload.error ?? "Bid failed.");
      else router.refresh();
    } catch (err) {
      setBidError(toErrorMessage(err));
    } finally {
      setBidPending(false);
    }
  }

  async function handleSkipVote() {
    if (!bidTeamId) return;
    setSkipPending(true);
    setBidError(null);
    try {
      const res = await fetch(`/api/rooms/${snapshot.room.code}/auction/skip-vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: bidTeamId }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) setBidError(payload.error ?? "Skip vote failed.");
      else router.refresh();
    } catch (err) {
      setBidError(toErrorMessage(err));
    } finally {
      setSkipPending(false);
    }
  }

  async function sendReaction(emoji: string) {
    let context: string | undefined;
    if (currentPlayer) {
      if (snapshot.auctionState.currentBid && currentTeam) {
        context = `${currentPlayer.name} · ${formatCurrencyShort(snapshot.auctionState.currentBid)} → ${currentTeam.shortCode}`;
      } else {
        context = currentPlayer.name;
      }
    }
    const reaction: EmojiReaction = {
      emoji,
      sentAt: new Date().toISOString(),
      userName: snapshot.user?.displayName ?? snapshot.user?.email ?? "Member",
      context,
    };
    setRecentReactions((curr) => [reaction, ...curr].slice(0, 12));
    if (!channelRef.current) return;
    await channelRef.current.send({
      type: "broadcast",
      event: ROOM_EVENTS.emoji,
      payload: reaction,
    });
  }

  return (
    <>
      {/* SOLD / UNSOLD overlay */}
      {resultOverlay && (
        <div
          className={`result-overlay ${resultOverlay.kind === "SOLD" ? "sold" : "unsold"}`}
        >
          <div className="result-overlay-label">{resultOverlay.kind}</div>
          <div className="result-overlay-sub">{resultOverlay.playerName}</div>
        </div>
      )}

      {/* Squad drawer backdrop */}
      <div
        className={`drawer-backdrop${drawerOpen ? " open" : ""}`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Squad drawer */}
      <div className={`drawer-panel${drawerOpen ? " open" : ""}`}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.04em",
            }}
          >
            Squads
          </h2>
          <button
            className="button ghost"
            style={{ minHeight: "32px", padding: "0.3rem 0.75rem", fontSize: "0.85rem" }}
            onClick={() => setDrawerOpen(false)}
            type="button"
          >
            ✕ Close
          </button>
        </div>
        <SquadBoard
          currentUserId={snapshot.user?.id ?? null}
          isAdmin={isAdmin}
          phase={snapshot.auctionState.phase}
          players={snapshot.players}
          roomCode={snapshot.room.code}
          squads={snapshot.squads}
          teams={snapshot.teams}
        />
      </div>

      {/* Drawer toggle tab */}
      {!drawerOpen && (
        <button
          className="drawer-tab"
          onClick={() => setDrawerOpen(true)}
          type="button"
        >
          SQUADS
        </button>
      )}

      <div className="auction-full">
        {/* TOP NAV BAR */}
        <header className="auction-topbar">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.65rem",
              flexWrap: "wrap",
              minWidth: 0,
            }}
          >
            <span
              className="brand"
              style={{ fontSize: "1rem", letterSpacing: "-0.03em" }}
            >
              {snapshot.room.name}
            </span>
            <span className="pill">Round {snapshot.auctionState.currentRound}</span>
            <span className="pill">
              {soldCount}/{snapshot.players.length} sold
            </span>
            <span className="pill highlight">{effectivePhase}</span>
            {skipVoteCount > 0 && isLive && (
              <span
                className="pill"
                style={{ background: "rgba(183,121,31,0.12)", color: "var(--warning)" }}
              >
                Skip {skipVoteCount}/{snapshot.teams.length}
              </span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              flexShrink: 0,
            }}
          >
            {actionError && (
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--danger)",
                  maxWidth: "180px",
                  lineHeight: 1.3,
                }}
              >
                {actionError}
              </span>
            )}

            {isAdmin && (
              <>
                <button
                  className="button ghost"
                  style={{ minHeight: "34px", padding: "0.35rem 0.8rem", fontSize: "0.82rem" }}
                  disabled={pausePending || effectivePhase !== "LIVE"}
                  onClick={() =>
                    void runControlAction(
                      `/api/rooms/${snapshot.room.code}/auction/pause`,
                      "PAUSED",
                      setPausePending,
                    )
                  }
                  type="button"
                >
                  {pausePending ? "Pausing…" : "Pause"}
                </button>
                <button
                  className="button secondary"
                  style={{ minHeight: "34px", padding: "0.35rem 0.8rem", fontSize: "0.82rem" }}
                  disabled={resumePending || effectivePhase !== "PAUSED"}
                  onClick={() =>
                    void runControlAction(
                      `/api/rooms/${snapshot.room.code}/auction/resume`,
                      "LIVE",
                      setResumePending,
                    )
                  }
                  type="button"
                >
                  {resumePending ? "Resuming…" : "Resume"}
                </button>
                <button
                  className="button warning"
                  style={{ minHeight: "34px", padding: "0.35rem 0.8rem", fontSize: "0.82rem" }}
                  disabled={advancePending}
                  onClick={() => void runAdvance()}
                  type="button"
                >
                  {advancePending ? "Selling…" : "Sell / next"}
                </button>
                {effectivePhase !== "ROUND_END" && (
                  <button
                    className="button danger"
                    style={{ minHeight: "34px", padding: "0.35rem 0.8rem", fontSize: "0.82rem" }}
                    onClick={() => void handleEndRound()}
                    type="button"
                  >
                    {hasAvailablePlayers ? "End round" : "Close window"}
                  </button>
                )}
              </>
            )}

            <span className="pill" style={{ fontSize: "0.78rem" }}>
              {snapshot.user?.displayName ?? snapshot.user?.email ?? "Guest"}
            </span>
          </div>
        </header>

        {/* MAIN BODY */}
        <div className={`auction-body${showPlayerBidBar ? " has-bottom-bar" : ""}`}>
          <div className="auction-content">
            {/* Player spotlight */}
            <div className="panel">
              <div
                style={{
                  display: "flex",
                  gap: "1.25rem",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <div className="player-avatar">
                  {currentPlayer ? getInitials(currentPlayer.name) : "?"}
                </div>

                <div style={{ flex: 1, minWidth: "160px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.4rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <span className="eyebrow">On the block</span>
                    {currentPlayer && (
                      <span className={`role-badge ${roleClass}`}>
                        {currentPlayer.role}
                      </span>
                    )}
                  </div>
                  <h2
                    style={{
                      margin: "0 0 0.2rem",
                      fontFamily: "var(--font-display)",
                      letterSpacing: "-0.04em",
                      fontSize: "clamp(1.4rem, 3.5vw, 2.2rem)",
                    }}
                  >
                    {currentPlayer?.name ?? "No active player"}
                  </h2>
                  {franchise && (
                    <div className="subtle" style={{ fontSize: "0.85rem" }}>
                      {franchise}
                    </div>
                  )}
                  {currentPlayer?.nationality && (
                    <div className="pill-row" style={{ marginTop: "0.4rem" }}>
                      <span className="pill">{currentPlayer.nationality}</span>
                      <span className="pill highlight">
                        Base {formatCurrencyShort(currentPlayer.basePrice)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Bid status */}
                <div className="bid-display">
                  <div className="bid-display-label">
                    {currentBid !== null ? "Current bid" : "Base price"}
                  </div>
                  <div className="bid-display-amount">
                    {currentBid !== null
                      ? formatCurrencyShort(currentBid)
                      : currentPlayer
                      ? formatCurrencyShort(currentPlayer.basePrice)
                      : "—"}
                  </div>
                      {currentTeam ? (
                    <div style={{ marginTop: "0.4rem" }}>
                      <span className="pill highlight" style={{ fontSize: "0.73rem" }}>
                        {isLeading
                          ? "You're leading!"
                          : `${currentTeam.shortCode} leading`}
                      </span>
                    </div>
                  ) : currentPlayer ? (
                    <div
                      className="subtle"
                      style={{ marginTop: "0.4rem", fontSize: "0.78rem" }}
                    >
                      No bids yet
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Timer */}
            <div className="panel">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.6rem",
                }}
              >
                <h3 style={{ margin: 0 }}>
                  {isPaused ? "Paused" : isLive ? "Live timer" : effectivePhase}
                </h3>
                <strong
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.6rem",
                    letterSpacing: "-0.03em",
                    color:
                      remainingSeconds <= 10 && isLive
                        ? "var(--danger)"
                        : "var(--primary-strong)",
                  }}
                >
                  {remainingSeconds}s
                </strong>
              </div>
              <TimerBar
                isPaused={isPaused}
                remainingSeconds={remainingSeconds}
                totalSeconds={snapshot.room.timerSeconds}
              />
            </div>

            {/* Stats strip */}
            <div className="stats-strip">
              <div className="stat-tile">
                <strong>{soldCount}</strong>Sold
              </div>
              <div className="stat-tile">
                <strong>{unsoldCount}</strong>Unsold
              </div>
              <div className="stat-tile">
                <strong>{snapshot.teams.length}</strong>Teams
              </div>
              <div className="stat-tile">
                <strong>
                  {snapshot.auctionState.currentBid !== null
                    ? formatCurrencyShort(snapshot.auctionState.currentBid)
                    : "—"}
                </strong>
                Current bid
              </div>
            </div>

            {/* ROUND_END — admin picks players for next round */}
            {effectivePhase === "ROUND_END" && isAdmin && (
              <div className="panel" style={{ borderColor: "rgba(183,121,31,0.3)", background: "rgba(183,121,31,0.04)" }}>
                <h3 style={{ margin: "0 0 0.25rem" }}>Round {snapshot.auctionState.currentRound} complete</h3>
                <p className="subtle" style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
                  Select the unsold players to carry forward to Round {snapshot.auctionState.currentRound + 1}.
                  Unselected players stay unsold.
                </p>
                <div className="checkbox-grid" style={{ marginBottom: "0.75rem" }}>
                  {snapshot.players.filter((p) => p.status === "UNSOLD").length === 0 ? (
                    <div className="subtle">No unsold players available.</div>
                  ) : (
                    snapshot.players
                      .filter((p) => p.status === "UNSOLD")
                      .sort((a, b) => a.orderIndex - b.orderIndex)
                      .map((player) => (
                        <label className="checkbox-row" key={player.id} style={{ fontSize: "0.9rem" }}>
                          <input
                            checked={selectedPlayerIds.includes(player.id)}
                            onChange={() =>
                              setSelectedPlayerIds((ids) =>
                                ids.includes(player.id)
                                  ? ids.filter((x) => x !== player.id)
                                  : [...ids, player.id],
                              )
                            }
                            type="checkbox"
                          />
                          <span>
                            {player.name}
                            <span className="subtle" style={{ marginLeft: "0.4rem", fontSize: "0.8rem" }}>
                              {player.role} · Base {formatCurrencyShort(player.basePrice)}
                            </span>
                          </span>
                        </label>
                      ))
                  )}
                </div>
                <div className="button-row">
                  <button
                    className="button secondary"
                    disabled={nextRoundPending || selectedPlayerIds.length === 0}
                    onClick={() => void handleStartNextRound()}
                    type="button"
                  >
                    {nextRoundPending
                      ? "Starting…"
                      : `Start Round ${snapshot.auctionState.currentRound + 1} (${selectedPlayerIds.length} players)`}
                  </button>
                  <button
                    className="button ghost"
                    disabled={nextRoundPending}
                    onClick={() =>
                      setSelectedPlayerIds(
                        snapshot.players.filter((p) => p.status === "UNSOLD").map((p) => p.id),
                      )
                    }
                    type="button"
                  >
                    Select all
                  </button>
                  <button
                    className="button danger"
                    disabled={nextRoundPending}
                    onClick={() =>
                      void runControlAction(
                        `/api/rooms/${snapshot.room.code}/auction/end-round`,
                        "COMPLETED",
                        setNextRoundPending,
                      )
                    }
                    type="button"
                  >
                    Complete auction
                  </button>
                </div>
              </div>
            )}

            {effectivePhase === "ROUND_END" && !isAdmin && (
              <div className="notice warning">
                Round {snapshot.auctionState.currentRound} ended — waiting for admin to select players for the next round.
              </div>
            )}

            {/* Admin: full multi-team bid panel */}
            {isAdmin && effectivePhase !== "ROUND_END" && (
              <BidPanel
                auctionState={snapshot.auctionState}
                currentMember={snapshot.currentMember}
                currentPlayer={currentPlayer}
                roomCode={snapshot.room.code}
                teams={snapshot.teams}
              />
            )}

            {/* Recent bids */}
            <div className="panel">
              <h3>Recent bids</h3>
              <div className="bid-log">
                {snapshot.bids.length === 0 ? (
                  <div className="empty-state">No bids recorded yet.</div>
                ) : (
                  snapshot.bids.slice(0, 10).map((bid) => {
                    const team = snapshot.teams.find((t) => t.id === bid.teamId);
                    const player = snapshot.players.find((p) => p.id === bid.playerId);
                    return (
                      <div className="bid-row" key={bid.id}>
                        <strong>{team?.shortCode ?? "?"}</strong>
                        {" bid "}
                        <strong>{formatCurrencyShort(bid.amount)}</strong>
                        {" for "}
                        {player?.name ?? "Unknown player"}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Emoji reactions */}
            <EmojiReactions onSend={sendReaction} recent={recentReactions} />

            {/* Trades */}
            <TradePanel
              currentUserId={snapshot.user?.id ?? null}
              isAdmin={isAdmin}
              players={snapshot.players}
              roomCode={snapshot.room.code}
              squads={snapshot.squads}
              teams={snapshot.teams}
              trades={snapshot.trades}
            />
          </div>
        </div>

        {/* BOTTOM BID BAR — non-admin players */}
        {showPlayerBidBar && (
          <footer className="auction-bottom-bar">
            {bidBarTeams.length > 1 && (
              <select
                className="select"
                style={{ width: "auto", minWidth: "100px", minHeight: "52px" }}
                value={bidTeamId}
                onChange={(e) => setBidTeamId(e.target.value)}
              >
                {bidBarTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.shortCode} ({formatCurrencyShort(t.purseRemaining)})
                  </option>
                ))}
              </select>
            )}

            {bidError && (
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--danger)",
                  flexShrink: 0,
                  maxWidth: "140px",
                }}
              >
                {bidError}
              </span>
            )}

            {isFirstBid ? (
              <button
                className="bid-button-lg"
                disabled={
                  !isLive ||
                  !currentPlayer ||
                  !selectedTeam ||
                  selectedTeam.purseRemaining < (currentPlayer?.basePrice ?? 0) ||
                  bidPending
                }
                onClick={() => void handleBid(undefined)}
                type="button"
              >
                {bidPending
                  ? "…"
                  : `Open ${currentPlayer ? formatCurrencyShort(currentPlayer.basePrice) : ""}`}
              </button>
            ) : (
              allowedIncrements.map((inc) => {
                const nextAmount = (currentBid ?? 0) + inc;
                const canAfford = selectedTeam
                  ? selectedTeam.purseRemaining >= nextAmount
                  : false;
                return (
                  <button
                    key={inc}
                    className={`bid-button-lg${isLeading ? " leading" : ""}`}
                    disabled={
                      !isLive || !currentPlayer || isLeading || !canAfford || bidPending
                    }
                    onClick={() => void handleBid(inc)}
                    title={`Bid ${formatCurrencyShort(nextAmount)}`}
                    type="button"
                  >
                    {bidPending ? "…" : `+${formatIncrement(inc)}`}
                  </button>
                );
              })
            )}

            {isLive && currentPlayer && (
              <button
                className="button ghost"
                style={{
                  minHeight: "52px",
                  borderRadius: "16px",
                  padding: "0.75rem 1.1rem",
                  flexShrink: 0,
                }}
                disabled={hasSkipVoted || skipPending || bidPending}
                onClick={() => void handleSkipVote()}
                type="button"
              >
                {hasSkipVoted ? "✓ Skip" : skipPending ? "…" : "Skip"}
              </button>
            )}
          </footer>
        )}
      </div>
    </>
  );
}
