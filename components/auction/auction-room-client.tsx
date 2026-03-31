"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import {
  AuctionChatPanel,
  type AuctionChatMessage,
} from "@/components/auction/auction-chat-panel";
import type {
  AiAuctionCommand,
  AiAuctionResponse,
  AuctionAssistantContext,
} from "@/components/ai/auction-ai-widget";
import { BidPanel } from "@/components/auction/bid-panel";
import { SquadBoard } from "@/components/auction/squad-board";
import { TimerBar } from "@/components/auction/timer-bar";
import { SoldPlayerShowcase } from "@/components/sold-player-showcase";
import { TradePanel } from "@/components/trades/trade-panel";
import { hasBrowserSupabaseEnv } from "@/lib/config";
import { getAllowedIncrements } from "@/lib/domain/auction";
import { ROOM_EVENTS, getRoomChannelName } from "@/lib/domain/realtime";
import type { AuctionSnapshot } from "@/lib/domain/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatCurrencyShort, formatIncrement, toErrorMessage } from "@/lib/utils";

type BidPlacedPayload = {
  playerId: string;
  teamId: string;
  amount: number;
  expiresAt: string;
  version: number;
};

type SkipVotePayload = {
  teamId: string;
  version: number;
};

type AdvancePayload = {
  phase: string;
  round: number;
  playerId: string | null;
  previousPlayerId: string | null;
  previousPlayerStatus: "SOLD" | "UNSOLD" | null;
  winningTeamId: string | null;
  winningBid: number | null;
  expiresAt: string | null;
  version: number;
};

type ChatMessagePayload = {
  id: string;
  kind: "text" | "emoji";
  userId: string | null;
  userName: string;
  userTag?: string | null;
  text: string;
  sentAt: string;
};

declare global {
  interface Window {
    __SFL_SERVER_DRIFT__?: number;
  }
}

function getRemainingSeconds(expiresAt: string | null) {
  if (!expiresAt) return 0;
  if (typeof window === "undefined") {
    return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
  }
  
  if (window.__SFL_SERVER_DRIFT__ === undefined) {
    const meta = document.querySelector('meta[name="sfl-server-time"]');
    if (meta) {
       const serverTime = Number(meta.getAttribute('content'));
       window.__SFL_SERVER_DRIFT__ = Date.now() - serverTime; 
    } else {
       window.__SFL_SERVER_DRIFT__ = 0;
    }
  }
  
  const correctedNow = Date.now() - window.__SFL_SERVER_DRIFT__;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - correctedNow) / 1000));
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
  const [localAuctionState, setLocalAuctionState] = useState(snapshot.auctionState);
  const [localPlayers, setLocalPlayers] = useState(snapshot.players);
  const localPlayersRef = useRef(snapshot.players);
  const [localTeams, setLocalTeams] = useState(snapshot.teams);
  const localTeamsRef = useRef(snapshot.teams);
  const [localSquads, setLocalSquads] = useState(snapshot.squads);
  const [localBids, setLocalBids] = useState(snapshot.bids);

  const [chatMessages, setChatMessages] = useState<AuctionChatMessage[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState(
    getRemainingSeconds(snapshot.auctionState.expiresAt),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [pausePending, setPausePending] = useState(false);
  const [resumePending, setResumePending] = useState(false);
  const [advancePending, setAdvancePending] = useState(false);
  const [endRoundPending, setEndRoundPending] = useState(false);
  const [optimisticPhase, setOptimisticPhase] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [squadOpen, setSquadOpen] = useState(false);
  const [endRoundConfirmOpen, setEndRoundConfirmOpen] = useState(false);
  const [resultOverlay, setResultOverlay] = useState<{
    kind: "SOLD" | "UNSOLD";
    playerName: string;
    teamName?: string;
    price?: number;
  } | null>(null);

  // Player-side bid state (used in bottom bar)
  const [bidTeamId, setBidTeamId] = useState(() => snapshot.teams[0]?.id ?? "");
  const [bidPending, setBidPending] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [aiHighlightedIncrement, setAiHighlightedIncrement] = useState<number | null>(null);
  const [aiHighlightOpenBid, setAiHighlightOpenBid] = useState(false);

  // ROUND_END â€” player picker for next round
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [nextRoundPending, setNextRoundPending] = useState(false);

  const currentPlayer =
    localPlayers.find((p) => p.id === localAuctionState.currentPlayerId) ?? null;
  const currentTeam =
    localTeams.find((t) => t.id === localAuctionState.currentTeamId) ?? null;
  const effectivePhase = optimisticPhase ?? localAuctionState.phase;
  const isAdmin = Boolean(snapshot.currentMember?.isAdmin);
  const isLive = effectivePhase === "LIVE";
  const isPaused = effectivePhase === "PAUSED";
  const isBiddingOpen = isLive && remainingSeconds > 0;
  const currentBid = localAuctionState.currentBid;
  const allowedIncrements = getAllowedIncrements(currentBid);
  const isFirstBid = currentBid === null;

  const selectedTeam = localTeams.find((t) => t.id === bidTeamId) ?? null;
  const isLeading = selectedTeam?.id === localAuctionState.currentTeamId;
  const recommendedIncrement =
    currentBid !== null
      ? allowedIncrements.find((increment) =>
          selectedTeam ? selectedTeam.purseRemaining >= currentBid + increment : true,
        ) ?? null
      : null;
  const myOwnedTeam = localTeams.find((team) => team.ownerUserId === snapshot.user?.id) ?? null;
  const showPlayerBidBar = !isAdmin || Boolean(myOwnedTeam);
  const bidBarTeams = myOwnedTeam ? [myOwnedTeam] : localTeams;

  const soldCount = localPlayers.filter((p) => p.status === "SOLD").length;
  const unsoldCount = localPlayers.filter((p) => p.status === "UNSOLD").length;
  const hasAvailablePlayers = localPlayers.some((p) => p.status === "AVAILABLE");
  const auctionPoolPlayers = localPlayers
    .filter(
      (player) =>
        player.status === "AVAILABLE" ||
        player.id === localAuctionState.currentPlayerId,
    )
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));
  const franchise =
    (currentPlayer?.stats?.["franchise"] as string | undefined) ??
    (currentPlayer?.stats?.["team"] as string | undefined) ??
    (currentPlayer?.stats?.["ipl_team"] as string | undefined) ??
    null;

  const roleClass = currentPlayer
    ? `role-${currentPlayer.role.toUpperCase().replace(/[\s/]+/g, "-")}`
    : "";

  useEffect(() => {
    setLocalAuctionState(snapshot.auctionState);
    setLocalPlayers(snapshot.players);
    localPlayersRef.current = snapshot.players;
    setLocalTeams(snapshot.teams);
    localTeamsRef.current = snapshot.teams;
    setLocalSquads(snapshot.squads);
    setLocalBids(snapshot.bids);
  }, [snapshot]);

  useEffect(() => {
    if (myOwnedTeam && bidTeamId !== myOwnedTeam.id) {
      setBidTeamId(myOwnedTeam.id);
      return;
    }

    if (!myOwnedTeam && !localTeams.some((team) => team.id === bidTeamId)) {
      setBidTeamId(localTeams[0]?.id ?? "");
    }
  }, [bidTeamId, localTeams, myOwnedTeam]);

  useEffect(() => {
    setAiHighlightedIncrement(null);
    setAiHighlightOpenBid(false);
  }, [currentBid, localAuctionState.currentPlayerId, localAuctionState.version]);

  // Reset optimistic phase when server confirms update
  useEffect(() => {
    setOptimisticPhase(null);
  }, [snapshot.auctionState.version]);


  const routerRef = useRef(router);
  routerRef.current = router;
  const refreshTimeoutRef = useRef<number | null>(null);

  const refreshRoom = useCallback(() => {
    if (refreshTimeoutRef.current !== null) return;
    refreshTimeoutRef.current = window.setTimeout(() => {
      startTransition(() => {
        routerRef.current.refresh();
      });
      refreshTimeoutRef.current = null;
    }, 1500); // Debounced to 1.5s to prevent massive re-render stutter during rapid bidding
  }, []);

  const prevPhaseRef = useRef<string | null>(null);

  // Timer â€” ticks down safely using a relative local interval
  useEffect(() => {
    const phase = optimisticPhase ?? localAuctionState.phase;
    if (phase !== "LIVE" || !localAuctionState.expiresAt) {
      prevPhaseRef.current = phase;
      if (phase === "PAUSED" && localAuctionState.pausedRemainingMs != null) {
        setRemainingSeconds(Math.ceil(localAuctionState.pausedRemainingMs / 1000));
      }
      return;
    }

    if (prevPhaseRef.current === "PAUSED") {
      setRemainingSeconds((prev) => {
         const actual = getRemainingSeconds(localAuctionState.expiresAt);
         return Math.abs(actual - prev) > 2 ? actual : prev;
      });
    }
    prevPhaseRef.current = phase;

    const interval = window.setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [localAuctionState.expiresAt, localAuctionState.phase, optimisticPhase]);

  // Realtime subscription
  useEffect(() => {
    if (!hasBrowserSupabaseEnv) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(getRoomChannelName(snapshot.room.code), {
        config: {
          broadcast: { ack: true, self: true },
        },
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "auction_state", filter: `room_id=eq.${snapshot.room.id}` },
        (dbPayload) => {
          const newDoc = dbPayload.new as any;
          if (!newDoc || !newDoc.version) return;

          const lastEvent = newDoc.last_event as string | null;

          setLocalAuctionState((curr) => {
            if (newDoc.version < curr.version) return curr; // protect optimistic local state

            // For NEW_BID events: the broadcast already reset the timer to timerSeconds.
            // Do NOT override expiresAt from DB — it causes clock-drift-induced timer collapse to 0s.
            const shouldUpdateExpiresAt = lastEvent !== "NEW_BID";

            return {
              ...curr,
              phase: newDoc.phase ?? curr.phase,
              expiresAt: shouldUpdateExpiresAt && newDoc.expires_at !== undefined ? newDoc.expires_at : curr.expiresAt,
              currentBid: newDoc.current_bid !== undefined ? newDoc.current_bid : curr.currentBid,
              currentRound: newDoc.current_round ?? curr.currentRound,
              version: newDoc.version,
              lastEvent: lastEvent ?? curr.lastEvent,
              currentPlayerId: newDoc.current_player_id !== undefined ? newDoc.current_player_id : curr.currentPlayerId,
              currentTeamId: newDoc.current_team_id !== undefined ? newDoc.current_team_id : curr.currentTeamId,
              pausedRemainingMs: newDoc.paused_remaining_ms !== undefined ? newDoc.paused_remaining_ms : curr.pausedRemainingMs,
            };
          });

          // Sync timer for phase transitions (PAUSE / RESUME / ADVANCE) — but NOT for NEW_BID
          if (lastEvent !== "NEW_BID") {
            if (newDoc.phase === "PAUSED" && newDoc.paused_remaining_ms != null) {
              setRemainingSeconds(Math.ceil(newDoc.paused_remaining_ms / 1000));
            } else if (newDoc.phase === "LIVE" && newDoc.expires_at) {
              setRemainingSeconds(getRemainingSeconds(newDoc.expires_at));
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bids", filter: `room_id=eq.${snapshot.room.id}` },
        () => {}, // Let optimistic UI & broadcast events handle the rapid state changes
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
      .on("broadcast", { event: ROOM_EVENTS.chatMessage }, ({ payload }) => {
        const message = payload as ChatMessagePayload;
        setChatMessages((curr) => {
          if (curr.some((entry) => entry.id === message.id)) {
            return curr;
          }
          return [
            ...curr,
            {
              id: message.id,
              kind: message.kind,
              userName: message.userName,
              userTag: message.userTag,
              text: message.text,
              sentAt: message.sentAt,
              isOwn: message.userId !== null && message.userId === snapshot.user?.id,
            },
          ].slice(-50);
        });
      })
      .on("broadcast", { event: ROOM_EVENTS.newBid }, ({ payload }) => {
        const next = payload as BidPlacedPayload;
        setLocalAuctionState((curr) => ({
          ...curr,
          currentBid: next.amount,
          currentTeamId: next.teamId,
          expiresAt: next.expiresAt,
          version: Math.max(curr.version + 1, next.version),
          lastEvent: "NEW_BID",
        }));
        setLocalBids((curr) => [
          {
            id: `broadcast-bid-${next.version}-${next.teamId}`,
            roomId: snapshot.room.id,
            playerId: next.playerId,
            teamId: next.teamId,
            amount: next.amount,
            createdAt: new Date().toISOString(),
            createdBy: "broadcast",
          },
          ...curr.filter(
            (item) =>
              !(item.playerId === next.playerId && item.teamId === next.teamId && item.amount === next.amount),
          ),
        ]);
        setRemainingSeconds(snapshot.room.timerSeconds);
      })
      .on("broadcast", { event: "SKIP_VOTED" }, ({ payload }) => {
        const next = payload as SkipVotePayload;
        setLocalAuctionState((curr) => {
          if (curr.skipVoteTeamIds.includes(next.teamId)) return curr;
          return {
            ...curr,
            skipVoteTeamIds: [...curr.skipVoteTeamIds, next.teamId],
            version: Math.max(curr.version + 1, next.version),
          };
        });
      })
      .on("broadcast", { event: "AUCTION_ADVANCED" }, ({ payload }) => {
        const next = payload as AdvancePayload;
        if (next.previousPlayerId) {
          setLocalPlayers((curr) =>
            curr.map((player) =>
              player.id === next.previousPlayerId
                ? {
                    ...player,
                    status: next.previousPlayerStatus ?? player.status,
                    currentTeamId:
                      next.previousPlayerStatus === "SOLD" ? next.winningTeamId : null,
                    soldPrice: next.previousPlayerStatus === "SOLD" ? next.winningBid : null,
                  }
                : player,
            ),
          );
        }
        if (
          next.previousPlayerStatus === "SOLD" &&
          next.winningTeamId &&
          next.previousPlayerId &&
          next.winningBid !== null
        ) {
          const winningTeamId = next.winningTeamId;
          const previousPlayerId = next.previousPlayerId;
          const winningBid = next.winningBid;
          setLocalTeams((curr) =>
            curr.map((team) =>
              team.id === winningTeamId
                ? { ...team, purseRemaining: team.purseRemaining - winningBid }
                : team,
            ),
          );
          setLocalSquads((curr) => [
            {
              id: `broadcast-squad-${next.version}-${previousPlayerId}`,
              roomId: snapshot.room.id,
              teamId: winningTeamId,
              playerId: previousPlayerId,
              purchasePrice: winningBid,
              acquiredInRound: localAuctionState.currentRound,
              createdAt: new Date().toISOString(),
            },
            ...curr.filter((item) => item.playerId !== previousPlayerId),
          ]);
        }
        setLocalAuctionState((curr) => ({
          ...curr,
          phase: next.phase as typeof curr.phase,
          currentRound: next.round,
          currentPlayerId: next.playerId,
          currentBid: null,
          currentTeamId: null,
          expiresAt: next.expiresAt,
          pausedRemainingMs: null,
          skipVoteTeamIds: [],
          version: Math.max(curr.version + 1, next.version),
        }));
        if (next.phase === "LIVE" && next.playerId) {
          setRemainingSeconds(snapshot.room.timerSeconds);
        } else {
          setRemainingSeconds(getRemainingSeconds(next.expiresAt));
        }

        // Show SOLD/UNSOLD overlay directly from the broadcast payload â€”
        // this is reliable for ALL clients, including members who didn't place the bid.
        if (next.previousPlayerId && next.previousPlayerStatus) {
          const prevPlayerName =
            localPlayersRef.current.find((p) => p.id === next.previousPlayerId)?.name ??
            "Player";
          const winningTeamName = next.winningTeamId
            ? localTeamsRef.current.find((t) => t.id === next.winningTeamId)?.name
            : undefined;
          setResultOverlay({
            kind: next.previousPlayerStatus,
            playerName: prevPlayerName,
            teamName: next.previousPlayerStatus === "SOLD" ? winningTeamName : undefined,
            price: next.previousPlayerStatus === "SOLD" && next.winningBid !== null ? next.winningBid : undefined,
          });
          const overlayTimer = window.setTimeout(() => setResultOverlay(null), 2500);
          // cleanup is handled by the component unmount; this is fire-and-forget
          void overlayTimer;
        }
      })
      .on("broadcast", { event: "REFRESH_ROOM" }, () => {
         // Throttled to prevent full freeze
         refreshRoom();
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [refreshRoom, snapshot.room.code, snapshot.room.id]);

  // timer advance was removed to prevent clock drift auto-locking. Admin manually clicks Sell/Next.

  // Auto-select players for Round 1 to simplify admin start
  useEffect(() => {
    if (effectivePhase === "ROUND_END" && localAuctionState.currentRound === 0 && selectedPlayerIds.length === 0) {
      const unsold = localPlayers.filter(p => p.status === "UNSOLD").map(p => p.id);
      if (unsold.length > 0) {
        setSelectedPlayerIds(unsold);
      }
    }
  }, [effectivePhase, localAuctionState.currentRound, localPlayers, selectedPlayerIds.length]);

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
      const payload = (await response.json()) as {
        error?: string;
        phase?: string;
        round?: number;
        playerId?: string | null;
      };
      if (!response.ok) {
        setOptimisticPhase(null);
        throw new Error(payload.error ?? "Auction action failed.");
      }
      refreshRoom();
      try {
        channelRef.current?.send({ type: "broadcast", event: "REFRESH_ROOM" });
      } catch (e) {}
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
      const payload = (await response.json()) as {
        error?: string;
        phase?: string;
        round?: number;
        playerId?: string | null;
      };
      if (!response.ok) throw new Error(payload.error ?? "Auction action failed.");
      const resolvedAt = new Date().toISOString();
      const optimisticExpiresAt =
        payload.phase === "LIVE" && payload.playerId
          ? new Date(Date.now() + snapshot.room.timerSeconds * 1000).toISOString()
          : null;

      if (currentPlayer) {
        if (currentBid !== null && currentTeam) {
          setLocalPlayers((curr) =>
            curr.map((player) =>
              player.id === currentPlayer.id
                ? {
                    ...player,
                    status: "SOLD",
                    currentTeamId: currentTeam.id,
                    soldPrice: currentBid,
                  }
                : player,
            ),
          );
          setLocalTeams((curr) =>
            curr.map((team) =>
              team.id === currentTeam.id
                ? { ...team, purseRemaining: team.purseRemaining - currentBid }
                : team,
            ),
          );
          setLocalSquads((curr) => [
            {
              id: `optimistic-${currentPlayer.id}-${Date.now()}`,
              roomId: snapshot.room.id,
              teamId: currentTeam.id,
              playerId: currentPlayer.id,
              purchasePrice: currentBid,
              acquiredInRound: localAuctionState.currentRound,
              createdAt: resolvedAt,
            },
            ...curr,
          ]);
        } else {
          setLocalPlayers((curr) =>
            curr.map((player) =>
              player.id === currentPlayer.id
                ? { ...player, status: "UNSOLD", currentTeamId: null, soldPrice: null }
                : player,
            ),
          );
        }
      }
      setLocalAuctionState((curr) => ({
        ...curr,
        phase: (payload.phase as typeof curr.phase | undefined) ?? curr.phase,
        currentRound: payload.round ?? curr.currentRound,
        currentPlayerId: payload.playerId ?? null,
        currentBid: null,
        currentTeamId: null,
        expiresAt: optimisticExpiresAt,
        pausedRemainingMs: null,
        skipVoteTeamIds: [],
        version: curr.version + 1,
      }));
      if (payload.phase === "LIVE" && payload.playerId) {
        setRemainingSeconds(snapshot.room.timerSeconds);
      } else {
        setRemainingSeconds(getRemainingSeconds(optimisticExpiresAt));
      }

      // Fire the overlay directly for the admin (other users get it from the AUCTION_ADVANCED broadcast handler)
      if (currentPlayer) {
        const isSold = currentBid !== null && currentTeam;
        setResultOverlay({
          kind: isSold ? "SOLD" : "UNSOLD",
          playerName: currentPlayer.name,
          teamName: isSold ? currentTeam.name : undefined,
          price: isSold ? currentBid : undefined,
        });
        const overlayTimer = window.setTimeout(() => setResultOverlay(null), 2500);
        void overlayTimer;
      }
      channelRef.current?.send({
        type: "broadcast",
        event: "AUCTION_ADVANCED",
        payload: {
          phase: payload.phase ?? localAuctionState.phase,
          round: payload.round ?? localAuctionState.currentRound,
          playerId: payload.playerId ?? null,
          previousPlayerId: currentPlayer?.id ?? null,
          previousPlayerStatus: currentBid !== null && currentTeam ? "SOLD" : "UNSOLD",
          winningTeamId: currentTeam?.id ?? null,
          winningBid: currentBid ?? null,
          expiresAt: optimisticExpiresAt,
          version: localAuctionState.version + 2,
        } satisfies AdvancePayload,
      });
      channelRef.current?.send({ type: "broadcast", event: "REFRESH_ROOM" });
      refreshRoom();
    } catch (err) {
      setActionError(toErrorMessage(err));
      // Reset the auto-advance key so it can be retried if this was a clock skew issue
      autoAdvanceKey.current = null;
    } finally {
      setAdvancePending(false);
    }
  }

  async function handleEndRound() {
    setEndRoundPending(true);
    try {
      const res = await fetch(
        `/api/rooms/${snapshot.room.code}/auction/end-round`,
        { method: "POST" },
      );
      const payload = (await res.json()) as { error?: string; phase?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to end round.");
      setEndRoundConfirmOpen(false);
      if (payload.phase === "COMPLETED") {
        router.push(`/room/${snapshot.room.code}`);
        router.refresh();
        return;
      }
      channelRef.current?.send({ type: "broadcast", event: "REFRESH_ROOM" });
      refreshRoom();
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setEndRoundPending(false);
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
      setLocalPlayers((curr) =>
        curr.map((player) =>
          selectedPlayerIds.includes(player.id) && player.status === "UNSOLD"
            ? { ...player, status: "AVAILABLE" }
            : player,
        ),
      );
      setLocalAuctionState((curr) => ({
        ...curr,
        phase: "LIVE",
        currentRound: curr.currentRound + 1,
        currentPlayerId: selectedPlayerIds[0] ?? null,
        currentBid: null,
        currentTeamId: null,
        expiresAt:
          selectedPlayerIds[0] != null
            ? new Date(Date.now() + snapshot.room.timerSeconds * 1000).toISOString()
            : null,
        skipVoteTeamIds: [],
        version: curr.version + 1,
      }));
      setRemainingSeconds(selectedPlayerIds[0] != null ? snapshot.room.timerSeconds : 0);
      setSelectedPlayerIds([]);
      channelRef.current?.send({ type: "broadcast", event: "REFRESH_ROOM" });
      refreshRoom();
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setNextRoundPending(false);
    }
  }

  async function handleBid(increment?: number, teamIdOverride?: string): Promise<string | null> {
    const teamId = teamIdOverride ?? bidTeamId;
    if (!teamId) return "No team selected.";
    if (!isBiddingOpen) return "Bidding time has ended for this player.";
    setBidPending(true);
    setBidError(null);
    try {
      const res = await fetch(`/api/rooms/${snapshot.room.code}/auction/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, increment }),
      });
      const payload = (await res.json()) as {
        error?: string;
        amount?: number;
        timing?: {
          totalMs: number;
          steps: Array<{ step: string; ms: number }>;
        };
      };
      if (!res.ok) {
        const message = payload.error ?? "Bid failed.";
        setBidError(message);
        return message;
      } else {
        if (payload.timing) {
          console.info(
            "[auction-bid-client-timing]",
            `total=${payload.timing.totalMs}ms`,
            payload.timing.steps.map((step) => `${step.step}:${step.ms}ms`).join(" | "),
          );
        }
        const nextAmount = payload.amount ?? currentBid ?? currentPlayer?.basePrice ?? 0;
        const nextExpiresAt = new Date(
          Date.now() + snapshot.room.timerSeconds * 1000,
        ).toISOString();
        setLocalAuctionState((curr) => ({
          ...curr,
          currentBid: nextAmount,
          currentTeamId: teamId,
          expiresAt: nextExpiresAt,
          version: curr.version + 1,
          lastEvent: "NEW_BID",
        }));
        setLocalBids((curr) => [
          {
            id: `optimistic-bid-${Date.now()}`,
            roomId: snapshot.room.id,
            playerId: currentPlayer?.id ?? curr[0]?.playerId ?? "",
            teamId,
            amount: nextAmount,
            createdAt: new Date().toISOString(),
            createdBy: snapshot.user?.id ?? "unknown",
          },
          ...curr,
        ]);
        setRemainingSeconds(snapshot.room.timerSeconds);
        channelRef.current?.send({
          type: "broadcast",
          event: ROOM_EVENTS.newBid,
          payload: {
            playerId: currentPlayer?.id ?? "",
            teamId,
            amount: nextAmount,
            expiresAt: nextExpiresAt,
            version: localAuctionState.version + 1,
          } satisfies BidPlacedPayload,
        });
        return null;
      }
    } catch (err) {
      const message = toErrorMessage(err);
      setBidError(message);
      return message;
    } finally {
      setBidPending(false);
    }
  }

  useEffect(() => {
    const context: AuctionAssistantContext = {
      roomCode: snapshot.room.code,
      phase: effectivePhase,
      currentPlayerName: currentPlayer?.name ?? null,
      currentBid,
      basePrice: currentPlayer?.basePrice ?? null,
      currentLeadingTeamName: currentTeam?.name ?? null,
      allowedIncrements,
      recommendedIncrement,
      canOpenBid: Boolean(
        currentBid === null &&
          currentPlayer &&
          selectedTeam &&
          selectedTeam.purseRemaining >= currentPlayer.basePrice,
      ),
      isBiddingOpen,
    };

    window.__SFL_AUCTION_CONTEXT__ = context;

    const handleAiCommand = async (event: Event) => {
      const detail = (event as CustomEvent<AiAuctionCommand>).detail;
      if (!detail) return;

      const respond = (payload: AiAuctionResponse) => {
        window.dispatchEvent(
          new CustomEvent<AiAuctionResponse>("sfl-ai-auction-response", {
            detail: payload,
          }),
        );
      };

      if (detail.type === "highlight-best-bid") {
        if (currentBid === null) {
          setAiHighlightOpenBid(true);
          setAiHighlightedIncrement(null);
          respond({
            ok: true,
            message:
              currentPlayer && selectedTeam && selectedTeam.purseRemaining >= currentPlayer.basePrice
                ? `Highlighted the open bid for ${currentPlayer.name}.`
                : "Open bid is not available right now.",
            highlightedIncrement: null,
          });
          return;
        }

        if (recommendedIncrement !== null) {
          setAiHighlightedIncrement(recommendedIncrement);
          setAiHighlightOpenBid(false);
          respond({
            ok: true,
            message: `Highlighted +${formatIncrement(recommendedIncrement)}.`,
            highlightedIncrement: recommendedIncrement,
          });
          return;
        }

        respond({ ok: false, message: "No valid next bid option is available right now." });
        return;
      }

      if (detail.type !== "place-bid") {
        return;
      }

      if (!isBiddingOpen && currentBid !== null) {
        respond({ ok: false, message: "Bidding is closed for the current player." });
        return;
      }

      let resolvedIncrement: number | undefined;
      if (currentBid === null) {
        if (currentPlayer && detail.amount === currentPlayer.basePrice) {
          resolvedIncrement = undefined;
        } else {
          respond({
            ok: false,
            message: currentPlayer
              ? `Use ${formatCurrencyShort(currentPlayer.basePrice)} to open the bidding for ${currentPlayer.name}.`
              : "There is no active player to bid on.",
          });
          return;
        }
      } else {
        resolvedIncrement =
          allowedIncrements.find((increment) => increment === detail.amount) ??
          allowedIncrements.find((increment) => currentBid + increment === detail.amount);

        if (!resolvedIncrement) {
          respond({
            ok: false,
            message: `That amount is not a valid next bid. Try ${allowedIncrements
              .map((increment) => `+${formatIncrement(increment)}`)
              .join(", ")}.`,
          });
          return;
        }
      }

      setAiHighlightOpenBid(currentBid === null);
      setAiHighlightedIncrement(resolvedIncrement ?? null);
      const error = await handleBid(resolvedIncrement);
      respond({
        ok: !error,
        message:
          error ??
          (currentBid === null
            ? `Opened the bidding for ${currentPlayer?.name ?? "the player"}.`
            : `Placed +${formatIncrement(resolvedIncrement ?? 0)} on ${currentPlayer?.name ?? "the player"}.`),
        highlightedIncrement: resolvedIncrement ?? null,
      });
    };

    window.addEventListener("sfl-ai-auction-command", handleAiCommand as EventListener);
    return () => {
      window.removeEventListener("sfl-ai-auction-command", handleAiCommand as EventListener);
    };
  }, [
    allowedIncrements,
    currentBid,
    currentPlayer,
    currentTeam,
    effectivePhase,
    isBiddingOpen,
    recommendedIncrement,
    selectedTeam,
    snapshot.room.code,
  ]);

  async function sendChatEntry(kind: "text" | "emoji", text: string) {
    const payload: ChatMessagePayload = {
      id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      userId: snapshot.user?.id ?? null,
      userName: snapshot.user?.displayName ?? snapshot.user?.email ?? "Member",
      userTag: myOwnedTeam?.shortCode ?? (isAdmin ? "ADMIN" : null),
      text,
      sentAt: new Date().toISOString(),
    };

    setChatMessages((curr) =>
      [
        ...curr,
        {
          id: payload.id,
          kind: payload.kind,
          userName: payload.userName,
          userTag: payload.userTag,
          text: payload.text,
          sentAt: payload.sentAt,
          isOwn: true,
        },
      ].slice(-50),
    );

    if (!channelRef.current) return;
    await channelRef.current.send({
      type: "broadcast",
      event: ROOM_EVENTS.chatMessage,
      payload,
    });
  }

  const feedItems = [...localBids.map(b => ({
    type: "BID" as const, id: b.id, createdAt: b.createdAt, teamId: b.teamId, playerId: b.playerId, amount: b.amount
  })), ...localSquads.map(sq => ({
    type: "SOLD" as const, id: `sq-${sq.id}`, createdAt: sq.createdAt, teamId: sq.teamId, playerId: sq.playerId, amount: sq.purchasePrice
  }))].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 12);
  const soldTickerItems = [...localSquads]
    .slice()
    .map((entry) => {
      const player = localPlayers.find((item) => item.id === entry.playerId);
      const team = localTeams.find((item) => item.id === entry.teamId);
      return {
        id: entry.id,
        playerName: player?.name ?? "Unknown player",
        teamCode: team?.shortCode ?? "?",
        teamName: team?.name ?? null,
        amount: entry.purchasePrice,
        role: player?.role ?? null,
      };
    });

  return (
    <>
      {/* SOLD / UNSOLD overlay */}
      {resultOverlay && (
        <div
          className={`result-overlay ${resultOverlay.kind === "SOLD" ? "sold" : "unsold"}`}
        >
          <div className="result-overlay-label">{resultOverlay.kind}</div>
          <div className="result-overlay-sub">
            {resultOverlay.playerName}
            {resultOverlay.kind === "SOLD" && resultOverlay.teamName && resultOverlay.price && (
              <span style={{ display: "block", marginTop: "0.5rem", fontSize: "0.8em", opacity: 0.9 }}>
                to <strong>{resultOverlay.teamName}</strong> for <strong>{formatCurrencyShort(resultOverlay.price)}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {endRoundConfirmOpen && (
        <div className="app-modal-backdrop" onClick={() => setEndRoundConfirmOpen(false)}>
          <div
            className="app-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="app-modal-head">
              <h3 style={{ margin: 0 }}>
                {hasAvailablePlayers ? "End round" : "Complete auction"}
              </h3>
            </div>
            <p className="subtle" style={{ margin: 0, lineHeight: 1.6 }}>
              {hasAvailablePlayers
                ? "All remaining available players will be marked unsold and the auction will be completed."
                : "This will complete the auction now. You can still start the auction again later if you want another round."}
            </p>
            <div className="app-modal-actions">
              <button
                className="button ghost"
                disabled={endRoundPending}
                onClick={() => setEndRoundConfirmOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button danger"
                disabled={endRoundPending}
                onClick={() => void handleEndRound()}
                type="button"
              >
                {endRoundPending
                  ? hasAvailablePlayers
                    ? "Ending..."
                    : "Completing..."
                  : hasAvailablePlayers
                  ? "End round"
                  : "Complete auction"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`drawer-backdrop${chatOpen ? " open" : ""}`}
        onClick={() => setChatOpen(false)}
      />
      <div
        className={`drawer-backdrop${squadOpen ? " open" : ""}`}
        onClick={() => setSquadOpen(false)}
      />

      <div className={`drawer-panel drawer-panel-left drawer-panel-chat${chatOpen ? " open" : ""}`}>
        <div className="drawer-header-row">
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.04em",
            }}
          >
            Chat
          </h2>
          <button
            className="button ghost"
            style={{ minHeight: "32px", padding: "0.3rem 0.75rem", fontSize: "0.85rem" }}
            onClick={() => setChatOpen(false)}
            type="button"
          >
            Close
          </button>
        </div>
        <AuctionChatPanel
          messages={chatMessages}
          onSendEmoji={(emoji) => sendChatEntry("emoji", emoji)}
          onSendMessage={(message) => sendChatEntry("text", message)}
        />
      </div>

      <div className={`drawer-panel drawer-panel-right${squadOpen ? " open" : ""}`}>
        <div className="drawer-header-row">
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
            onClick={() => setSquadOpen(false)}
            type="button"
          >
            Close
          </button>
        </div>
        <SquadBoard
          currentUserId={snapshot.user?.id ?? null}
          isAdmin={isAdmin}
          phase={localAuctionState.phase}
          players={localPlayers}
          roomCode={snapshot.room.code}
          squads={localSquads}
          teams={localTeams}
        />
      </div>

      {!chatOpen && (
        <div className="drawer-tab-stack drawer-tab-stack-left">
          <button
            className="drawer-tab secondary"
            onClick={() => setChatOpen(true)}
            type="button"
          >
            CHAT
          </button>
        </div>
      )}

      {!squadOpen && (
        <div className="drawer-tab-stack drawer-tab-stack-right">
          <button
            className="drawer-tab"
            onClick={() => setSquadOpen(true)}
            type="button"
          >
            SQUADS
          </button>
        </div>
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
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}
            >
              <Image
                alt="SFL"
                height={22}
                src="/images/sfl.png"
                style={{ objectFit: "contain" }}
                width={22}
              />
              <span className="brand" style={{ fontSize: "0.95rem", letterSpacing: "-0.03em" }}>
                SFL
              </span>
              <span style={{ opacity: 0.35, fontSize: "0.85rem" }}>•</span>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9rem" }}>
                {snapshot.room.name}
              </span>
            </span>
            <span className="pill">Round {localAuctionState.currentRound}</span>
            <span className="pill">
              {soldCount}/{localPlayers.length} sold
            </span>
            <span className="pill highlight">{effectivePhase}</span>
            {myOwnedTeam && (
              <span className="my-team-chip">
                <span className="my-team-chip-avatar">
                  {myOwnedTeam.shortCode?.slice(0, 2).toUpperCase() ?? "T"}
                </span>
                {myOwnedTeam.name}
                <span className="my-team-chip-purse">
                  {formatCurrencyShort(myOwnedTeam.purseRemaining)}
                </span>
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
                  {pausePending ? "Pausing..." : "Pause"}
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
                  {resumePending ? "Resuming..." : "Resume"}
                </button>
                <button
                  className="button warning"
                  style={{ minHeight: "34px", padding: "0.35rem 0.8rem", fontSize: "0.82rem" }}
                  disabled={advancePending}
                  onClick={() => void runAdvance()}
                  type="button"
                >
                  {advancePending ? "Selling..." : "Sell / next"}
                </button>
                {effectivePhase !== "ROUND_END" && (
                  <button
                    className="button danger"
                    style={{ minHeight: "34px", padding: "0.35rem 0.8rem", fontSize: "0.82rem" }}
                    disabled={endRoundPending}
                    onClick={() => setEndRoundConfirmOpen(true)}
                    type="button"
                  >
                    {hasAvailablePlayers ? "End round" : "Complete auction"}
                  </button>
                )}
              </>
            )}

            <span className="pill" style={{ fontSize: "0.78rem" }}>
              {snapshot.user?.displayName ?? snapshot.user?.email ?? "Guest"}
            </span>
          </div>
        </header>

        {soldTickerItems.length > 0 && (
          <SoldPlayerShowcase items={soldTickerItems} showDetail={false} variant="ticker" />
        )}

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
                      : "-"}
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
                <strong>{localTeams.length}</strong>Teams
              </div>
              <div className="stat-tile">
                <strong>
                  {localAuctionState.currentBid !== null
                    ? formatCurrencyShort(localAuctionState.currentBid)
                    : "-"}
                </strong>
                Current bid
              </div>
            </div>

            <div className="panel">
              <details>
                <summary
                  style={{
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                    listStyle: "none",
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>Auction pool</h3>
                    <div className="subtle" style={{ fontSize: "0.82rem", marginTop: "0.2rem" }}>
                      See everyone still in the auction without revealing the live order.
                    </div>
                  </div>
                  <span className="pill">{auctionPoolPlayers.length} players</span>
                </summary>
                <div className="pill-row" style={{ marginTop: "1rem" }}>
                  {auctionPoolPlayers.length === 0 ? (
                    <div className="empty-state" style={{ width: "100%" }}>
                      No players left in the auction pool.
                    </div>
                  ) : (
                    auctionPoolPlayers.map((player) => (
                      <span
                        className={`pill${player.id === localAuctionState.currentPlayerId ? " highlight" : ""}`}
                        key={player.id}
                        style={{ fontSize: "0.8rem" }}
                      >
                        {player.name}
                        <span style={{ opacity: 0.7, marginLeft: "0.35rem" }}>
                          {player.role}
                        </span>
                      </span>
                    ))
                  )}
                </div>
              </details>
            </div>

            {/* ROUND_END â€” admin picks players for next round */}
            {effectivePhase === "ROUND_END" && isAdmin && (
              <div className="panel" style={{ borderColor: "rgba(183,121,31,0.3)", background: "rgba(183,121,31,0.04)" }}>
                <h3 style={{ margin: "0 0 0.25rem" }}>Round {localAuctionState.currentRound} complete</h3>
                <p className="subtle" style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
                  Select the unsold players to carry forward to Round {localAuctionState.currentRound + 1}.
                  Unselected players stay unsold.
                </p>
                <div className="checkbox-grid" style={{ marginBottom: "0.75rem" }}>
                  {localPlayers.filter((p) => p.status === "UNSOLD").length === 0 ? (
                    <div className="subtle">No unsold players available.</div>
                  ) : (
                    localPlayers
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
                              {player.role} • Base {formatCurrencyShort(player.basePrice)}
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
                      ? "Starting..."
                      : localAuctionState.currentRound === 0 
                        ? `Start Auction (${selectedPlayerIds.length} players)` 
                        : `Start Round ${localAuctionState.currentRound + 1} (${selectedPlayerIds.length} players)`}
                  </button>
                  <button
                    className="button ghost"
                    disabled={nextRoundPending}
                    onClick={() =>
                      setSelectedPlayerIds(
                        localPlayers.filter((p) => p.status === "UNSOLD").map((p) => p.id),
                      )
                    }
                    type="button"
                  >
                    Select all
                  </button>
                  <button
                    className="button danger"
                    disabled={nextRoundPending || endRoundPending}
                    onClick={() => setEndRoundConfirmOpen(true)}
                    type="button"
                  >
                    Complete auction
                  </button>
                </div>
              </div>
            )}

            {effectivePhase === "ROUND_END" && !isAdmin && (
              <div className="notice warning">
                Round {localAuctionState.currentRound} ended - waiting for admin to select players for the next round.
              </div>
            )}

            {/* Admin: full multi-team bid panel */}
            {isAdmin && effectivePhase !== "ROUND_END" && (
              <BidPanel
                auctionState={localAuctionState}
                currentMember={snapshot.currentMember}
                currentPlayer={currentPlayer}
                highlightIncrement={aiHighlightedIncrement}
                highlightOpenBid={aiHighlightOpenBid}
                isBiddingOpen={isBiddingOpen}
                onBidAction={async (teamId, increment) => {
                  setBidTeamId(teamId);
                  return handleBid(increment, teamId);
                }}
                roomCode={snapshot.room.code}
                teams={localTeams}
              />
            )}

            {/* Recent bids & purchases */}
            <div className="panel">
              <h3>Auction feed</h3>
              <div className="bid-log" style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {feedItems.length === 0 ? (
                  <div className="empty-state">No events recorded yet.</div>
                ) : (
                  feedItems.map((item) => {
                    const team = localTeams.find((t) => t.id === item.teamId);
                    const player = localPlayers.find((p) => p.id === item.playerId);
                    
                    if (item.type === "SOLD") {
                      return (
                        <div className="bid-row" key={item.id} style={{ background: "rgba(16, 185, 129, 0.1)", borderLeft: "3px solid var(--success)", paddingLeft: "0.5rem" }}>
                          Sold: <strong>{player?.name ?? "Unknown player"}</strong>
                          {" bought by "}
                          <strong style={{ color: "var(--success)" }}>{team?.shortCode ?? "?"}</strong>
                          {" for "}
                          <strong>{formatCurrencyShort(item.amount)}</strong>
                        </div>
                      );
                    }
                    
                    return (
                      <div className="bid-row" key={item.id}>
                        <strong>{team?.shortCode ?? "?"}</strong>
                        {" bid "}
                        <strong>{formatCurrencyShort(item.amount)}</strong>
                        {" for "}
                        {player?.name ?? "Unknown player"}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Trades */}
            <TradePanel
              currentUserId={snapshot.user?.id ?? null}
              isAdmin={isAdmin}
              players={localPlayers}
              roomCode={snapshot.room.code}
              squads={localSquads}
              teams={localTeams}
              trades={snapshot.trades}
            />
          </div>
        </div>

        {/* BOTTOM BID BAR â€” non-admin players */}
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
                style={
                  aiHighlightOpenBid
                    ? {
                        boxShadow: "0 0 0 2px rgba(129, 140, 248, 0.95), 0 0 24px rgba(99, 102, 241, 0.35)",
                      }
                    : undefined
                }
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
                  ? "..."
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
                    style={
                      aiHighlightedIncrement === inc
                        ? {
                            boxShadow:
                              "0 0 0 2px rgba(129, 140, 248, 0.95), 0 0 24px rgba(99, 102, 241, 0.35)",
                          }
                        : undefined
                    }
                    disabled={
                      !isBiddingOpen || !currentPlayer || isLeading || !canAfford || bidPending
                    }
                    onClick={() => void handleBid(inc)}
                    title={`Bid ${formatCurrencyShort(nextAmount)}`}
                    type="button"
                  >
                    {bidPending ? "..." : `+${formatIncrement(inc)}`}
                  </button>
                );
              })
            )}
          </footer>
        )}
      </div>
    </>
  );
}


