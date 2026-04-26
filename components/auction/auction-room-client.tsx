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
import { getAllowedIncrements, MAX_AUCTION_ROUNDS } from "@/lib/domain/auction";
import { ROOM_EVENTS, getRoomChannelName } from "@/lib/domain/realtime";
import { auctionPhaseLabel, type AuctionSnapshot } from "@/lib/domain/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatCurrencyShort, formatIncrement, toErrorMessage } from "@/lib/utils";

type BidPlacedPayload = {
  playerId: string;
  teamId: string;
  amount: number;
  expiresAt: string;
  timerSeconds: number;
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

type AuctionLivePayload = Pick<
  AuctionSnapshot,
  "auctionState" | "bids" | "players" | "roundInterests" | "squads" | "teams"
> & {
  roomTimerSeconds?: number;
  serverTime?: number;
};

declare global {
  interface Window {
    __SFL_SERVER_DRIFT__?: number;
  }
}

function ensureServerDrift() {
  if (typeof window === "undefined") return 0;
  if (window.__SFL_SERVER_DRIFT__ === undefined) {
    const meta = document.querySelector('meta[name="sfl-server-time"]');
    if (meta) {
       const serverTime = Number(meta.getAttribute('content'));
       window.__SFL_SERVER_DRIFT__ = Date.now() - serverTime; 
    } else {
       window.__SFL_SERVER_DRIFT__ = 0;
    }
  }

  return window.__SFL_SERVER_DRIFT__;
}

function getCorrectedNowMs() {
  if (typeof window === "undefined") return Date.now();
  return Date.now() - ensureServerDrift();
}

function getRemainingSeconds(expiresAt: string | null) {
  if (!expiresAt) return 0;
  const correctedNow = getCorrectedNowMs();
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
  const [localAuctionState, setLocalAuctionState] = useState(snapshot.auctionState);
  const localAuctionStateRef = useRef(snapshot.auctionState);
  const [localPlayers, setLocalPlayers] = useState(snapshot.players);
  const localPlayersRef = useRef(snapshot.players);
  const [localTeams, setLocalTeams] = useState(snapshot.teams);
  const localTeamsRef = useRef(snapshot.teams);
  const [localSquads, setLocalSquads] = useState(snapshot.squads);
  const [localBids, setLocalBids] = useState(snapshot.bids);
  const [localTimerSeconds, setLocalTimerSeconds] = useState(snapshot.room.timerSeconds);

  const [chatMessages, setChatMessages] = useState<AuctionChatMessage[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    // Seed from initial snapshot using the same rule the timer effect applies.
    if (snapshot.auctionState.phase === "PAUSED") {
      return snapshot.auctionState.pausedRemainingMs != null
        ? Math.max(0, Math.ceil(snapshot.auctionState.pausedRemainingMs / 1000))
        : 0;
    }
    if (snapshot.auctionState.phase === "LIVE" && snapshot.auctionState.expiresAt) {
      return getRemainingSeconds(snapshot.auctionState.expiresAt);
    }
    return 0;
  });
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
  const [skipVotePending, setSkipVotePending] = useState(false);
  const [aiHighlightedIncrement, setAiHighlightedIncrement] = useState<number | null>(null);
  const [aiHighlightOpenBid, setAiHighlightOpenBid] = useState(false);

  // ROUND_END â€” player picker for next round
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [nextRoundPending, setNextRoundPending] = useState(false);
  const [localRoundInterests, setLocalRoundInterests] = useState(snapshot.roundInterests);
  const [interestDraft, setInterestDraft] = useState<string[]>([]);
  const [interestPending, setInterestPending] = useState(false);
  const [interestSubmitted, setInterestSubmitted] = useState(false);

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
  const teamsWithOwners = localTeams.filter((team) => team.ownerUserId);
  const hasAssignedTeams = teamsWithOwners.length > 0;
  const ballotTeamIds = new Set(teamsWithOwners.map((team) => team.id));
  const showPlayerBidBar = !isAdmin || Boolean(myOwnedTeam);
  const bidBarTeams = myOwnedTeam ? [myOwnedTeam] : localTeams;

  const soldCount = localPlayers.filter((p) => p.status === "SOLD").length;
  const unsoldCount = localPlayers.filter((p) => p.status === "UNSOLD").length;
  const hasAvailablePlayers = localPlayers.some((p) => p.status === "AVAILABLE");
  const nextRound = localAuctionState.currentRound + 1;
  const unsoldPlayers = localPlayers
    .filter((player) => player.status === "UNSOLD")
    .sort((left, right) => left.orderIndex - right.orderIndex);
  const interestForNextRound = localRoundInterests.filter(
    (entry) =>
      entry.round === nextRound &&
      (!hasAssignedTeams || ballotTeamIds.has(entry.teamId)),
  );
  const interestCountByPlayer = new Map<string, number>();
  const submittingTeamIds = new Set<string>();
  for (const entry of interestForNextRound) {
    interestCountByPlayer.set(
      entry.playerId,
      (interestCountByPlayer.get(entry.playerId) ?? 0) + 1,
    );
    if (!hasAssignedTeams || ballotTeamIds.has(entry.teamId)) {
      submittingTeamIds.add(entry.teamId);
    }
  }
  const totalBallotTeams = hasAssignedTeams ? teamsWithOwners.length : 0;
  const submittedBallotCount = submittingTeamIds.size;
  const shouldAdminManuallySelectNextRound = isAdmin && !hasAssignedTeams;
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
    setLocalTimerSeconds(snapshot.room.timerSeconds);
    setLocalBids(snapshot.bids);
    setLocalRoundInterests(snapshot.roundInterests);

    if (snapshot.auctionState.version < localAuctionStateRef.current.version) {
      return;
    }

    setLocalAuctionState(snapshot.auctionState);
    localAuctionStateRef.current = snapshot.auctionState;
    setLocalPlayers(snapshot.players);
    localPlayersRef.current = snapshot.players;
    setLocalTeams(snapshot.teams);
    localTeamsRef.current = snapshot.teams;
    setLocalSquads(snapshot.squads);
  }, [snapshot]);

  useEffect(() => {
    localAuctionStateRef.current = localAuctionState;
  }, [localAuctionState]);

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

  useEffect(() => {
    if (optimisticPhase && localAuctionState.phase === optimisticPhase) {
      setOptimisticPhase(null);
    }
  }, [optimisticPhase, localAuctionState.phase, localAuctionState.version]);


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
    }, 250);
  }, []);

  const applyAuctionLivePayload = useCallback((payload: AuctionLivePayload) => {
    if (payload.serverTime && typeof window !== "undefined") {
      window.__SFL_SERVER_DRIFT__ = Date.now() - payload.serverTime;
    }

    if (typeof payload.roomTimerSeconds === "number") {
      setLocalTimerSeconds(payload.roomTimerSeconds);
    }

    if (payload.auctionState) {
      setLocalAuctionState((curr) => {
        if (payload.auctionState.version < curr.version) return curr;
        localAuctionStateRef.current = payload.auctionState;
        return payload.auctionState;
      });
    }

    if (payload.players) {
      setLocalPlayers(payload.players);
      localPlayersRef.current = payload.players;
    }
    if (payload.teams) {
      setLocalTeams(payload.teams);
      localTeamsRef.current = payload.teams;
    }
    if (payload.squads) setLocalSquads(payload.squads);
    if (payload.bids) setLocalBids(payload.bids);
    if (payload.roundInterests) setLocalRoundInterests(payload.roundInterests);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const pollAuctionState = async () => {
      try {
        const response = await fetch(`/api/rooms/${snapshot.room.code}/auction/state`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as Partial<AuctionLivePayload>;
        if (!cancelled && payload.auctionState) {
          applyAuctionLivePayload(payload as AuctionLivePayload);
        } else if (!cancelled && payload.serverTime && typeof window !== "undefined") {
          window.__SFL_SERVER_DRIFT__ = Date.now() - payload.serverTime;
        }
      } catch {
        // Realtime remains primary; polling is just a Redis-backed safety net.
      }
    };

    void pollAuctionState();
    const interval = window.setInterval(() => void pollAuctionState(), 500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [applyAuctionLivePayload, snapshot.room.code]);

  // Timer — single source of truth.
  // remainingSeconds is a PURE DERIVATION of (phase, expiresAt, pausedRemainingMs):
  //   LIVE  → ceil((expiresAt - now) / 1000), ticks while interval runs
  //   PAUSED → ceil(pausedRemainingMs / 1000), frozen
  //   anything else → 0
  // Every state change recomputes from scratch. No scattered setRemainingSeconds
  // calls elsewhere — they would just fight this effect.
  useEffect(() => {
    const phase = optimisticPhase ?? localAuctionState.phase;

    const compute = () => {
      if (phase === "PAUSED") {
        return localAuctionState.pausedRemainingMs != null
          ? Math.max(0, Math.ceil(localAuctionState.pausedRemainingMs / 1000))
          : 0;
      }
      if (phase === "LIVE" && localAuctionState.expiresAt) {
        return getRemainingSeconds(localAuctionState.expiresAt);
      }
      return 0;
    };

    setRemainingSeconds(compute());

    if (phase !== "LIVE" || !localAuctionState.expiresAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setRemainingSeconds(compute());
    }, 500);

    return () => window.clearInterval(interval);
  }, [
    optimisticPhase,
    localAuctionState.phase,
    localAuctionState.expiresAt,
    localAuctionState.pausedRemainingMs,
  ]);

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

          // Single source of truth: update localAuctionState and let the timer
          // useEffect derive remainingSeconds from (phase, expiresAt, pausedRemainingMs).
          setLocalAuctionState((curr) => {
            if (newDoc.version < curr.version) return curr; // protect optimistic local state
            return {
              ...curr,
              phase: newDoc.phase ?? curr.phase,
              expiresAt: newDoc.expires_at !== undefined ? newDoc.expires_at : curr.expiresAt,
              currentBid: newDoc.current_bid !== undefined ? newDoc.current_bid : curr.currentBid,
              currentRound: newDoc.current_round ?? curr.currentRound,
              version: newDoc.version,
              lastEvent: lastEvent ?? curr.lastEvent,
              currentPlayerId: newDoc.current_player_id !== undefined ? newDoc.current_player_id : curr.currentPlayerId,
              currentTeamId: newDoc.current_team_id !== undefined ? newDoc.current_team_id : curr.currentTeamId,
              pausedRemainingMs: newDoc.paused_remaining_ms !== undefined ? newDoc.paused_remaining_ms : curr.pausedRemainingMs,
            };
          });
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
        setLocalTimerSeconds(next.timerSeconds);
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

  // Auto-advance when timer hits zero. Any browser (admin or member) can fire;
  // the advance route is idempotent (returns noop if state already moved past
  // the player/version we sent). Keyed by (player, version) so a single
  // browser only fires once per player. 100ms grace absorbs minor clock skew.
  useEffect(() => {
    if (effectivePhase !== "LIVE") return;
    if (!localAuctionState.currentPlayerId || !localAuctionState.expiresAt) return;
    if (remainingSeconds > 0) return;

    const key = `${localAuctionState.currentPlayerId}:${localAuctionState.version}`;
    if (autoAdvanceKey.current === key) return;

    const expiresMs = new Date(localAuctionState.expiresAt).getTime();
    const graceMs = Math.max(0, expiresMs + 100 - getCorrectedNowMs());
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
      console.info("[auction] timer hit 0 — auto-advance scheduled in", graceMs, "ms", { key });
    }
    const timer = window.setTimeout(() => {
      if (autoAdvanceKey.current === key) return;
      autoAdvanceKey.current = key;
      if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
        console.info("[auction] firing auto-advance", { key });
      }
      void runAdvance({ guardVersion: true });
    }, graceMs);

    return () => window.clearTimeout(timer);
  }, [
    effectivePhase,
    localAuctionState.currentPlayerId,
    localAuctionState.expiresAt,
    localAuctionState.version,
    remainingSeconds,
  ]);

  useEffect(() => {
    if (effectivePhase !== "ROUND_END" || !hasAssignedTeams) return;
    setSelectedPlayerIds(
      Array.from(
        new Set(
          localRoundInterests
            .filter(
              (entry) =>
                entry.round === localAuctionState.currentRound + 1 &&
                ballotTeamIds.has(entry.teamId),
            )
            .map((entry) => entry.playerId),
        ),
      ),
    );
  }, [effectivePhase, hasAssignedTeams, localAuctionState.currentRound, localRoundInterests, localTeams]);

  useEffect(() => {
    if (effectivePhase !== "ROUND_END" || hasAssignedTeams) return;
    setSelectedPlayerIds([]);
  }, [effectivePhase, hasAssignedTeams, localAuctionState.currentRound]);

  // When a member re-enters ROUND_END, pre-fill their draft from any existing ballot
  useEffect(() => {
    if (effectivePhase !== "ROUND_END" || !myOwnedTeam) return;
    const existing = localRoundInterests
      .filter((entry) => entry.round === nextRound && entry.teamId === myOwnedTeam.id)
      .map((entry) => entry.playerId);
    setInterestDraft(existing);
    setInterestSubmitted(existing.length > 0);
  }, [effectivePhase, localAuctionState.currentRound, localRoundInterests, myOwnedTeam]);

  async function runControlAction(
    url: string,
    optimistic: string | null,
    setPending: (v: boolean) => void,
  ) {
    if (optimistic) setOptimisticPhase(optimistic);
    setPending(true);
    setActionError(null);

    const attempt = async () => {
      const response = await fetch(url, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        expiresAt?: string | null;
        lastEvent?: string | null;
        pausedRemainingMs?: number | null;
        phase?: string;
        version?: number;
      };
      return { response, payload };
    };

    try {
      let { response, payload } = await attempt();
      // Retry once on version conflict — realtime may not have delivered latest state yet
      if (response.status === 409) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        ({ response, payload } = await attempt());
      }
      if (!response.ok) {
        setOptimisticPhase(null);
        throw new Error(payload.error ?? "Auction action failed.");
      }
      if (payload.phase) {
        setLocalAuctionState((curr) => ({
          ...curr,
          phase: payload.phase as typeof curr.phase,
          expiresAt: payload.expiresAt ?? null,
          pausedRemainingMs: payload.pausedRemainingMs ?? null,
          version: payload.version ?? curr.version + 1,
          lastEvent: payload.lastEvent ?? curr.lastEvent,
        }));
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

  async function runAdvance({ guardVersion = false }: { guardVersion?: boolean } = {}) {
    setAdvancePending(true);
    setActionError(null);
    try {
      const requestBody: {
        expectedPlayerId: string | null;
        expectedVersion?: number;
      } = {
        expectedPlayerId: localAuctionState.currentPlayerId,
      };
      if (guardVersion) {
        requestBody.expectedVersion = localAuctionState.version;
      }

      const response = await fetch(
        `/api/rooms/${snapshot.room.code}/auction/advance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        expiresAt?: string | null;
        phase?: string;
        previousPlayerId?: string | null;
        previousPlayerStatus?: "SOLD" | "UNSOLD" | null;
        round?: number;
        playerId?: string | null;
        noop?: boolean;
        version?: number;
        winningBid?: number | null;
        winningTeamId?: string | null;
      };
      if (response.status === 409) {
        // Another tab / auto-advance claimed this resolution first. Refresh.
        refreshRoom();
        channelRef.current?.send({ type: "broadcast", event: "REFRESH_ROOM" });
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "Auction action failed.");
      if (payload.noop) {
        // Server already advanced (race with auto-advance or another tab).
        // Just refresh — no optimistic update needed.
        refreshRoom();
        channelRef.current?.send({ type: "broadcast", event: "REFRESH_ROOM" });
        return;
      }
      const resolvedAt = new Date().toISOString();
      const optimisticExpiresAt = payload.expiresAt ?? null;
      const previousPlayerId = payload.previousPlayerId ?? currentPlayer?.id ?? null;
      const previousPlayer =
        localPlayersRef.current.find((player) => player.id === previousPlayerId) ??
        currentPlayer;
      const previousPlayerStatus =
        payload.previousPlayerStatus ??
        (currentBid !== null && currentTeam ? "SOLD" : "UNSOLD");
      const winningTeamId =
        payload.winningTeamId ?? (previousPlayerStatus === "SOLD" ? currentTeam?.id ?? null : null);
      const winningBid =
        payload.winningBid ?? (previousPlayerStatus === "SOLD" ? currentBid : null);
      const winningTeam = winningTeamId
        ? localTeamsRef.current.find((team) => team.id === winningTeamId) ?? currentTeam
        : null;

      if (previousPlayer) {
        if (previousPlayerStatus === "SOLD" && winningTeamId && winningBid !== null) {
          setLocalPlayers((curr) =>
            curr.map((player) =>
              player.id === previousPlayer.id
                ? {
                    ...player,
                    status: "SOLD",
                    currentTeamId: winningTeamId,
                    soldPrice: winningBid,
                  }
                : player,
            ),
          );
          setLocalTeams((curr) =>
            curr.map((team) =>
              team.id === winningTeamId
                ? { ...team, purseRemaining: team.purseRemaining - winningBid }
                : team,
            ),
          );
          setLocalSquads((curr) => [
            {
              id: `optimistic-${previousPlayer.id}-${Date.now()}`,
              roomId: snapshot.room.id,
              teamId: winningTeamId,
              playerId: previousPlayer.id,
              purchasePrice: winningBid,
              acquiredInRound: localAuctionState.currentRound,
              createdAt: resolvedAt,
            },
            ...curr,
          ]);
        } else {
          setLocalPlayers((curr) =>
            curr.map((player) =>
              player.id === previousPlayer.id
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
        version: payload.version ?? curr.version + 1,
      }));

      // Fire the overlay directly for the admin (other users get it from the AUCTION_ADVANCED broadcast handler)
      if (previousPlayer) {
        const isSold = previousPlayerStatus === "SOLD" && winningTeam && winningBid !== null;
        setResultOverlay({
          kind: isSold ? "SOLD" : "UNSOLD",
          playerName: previousPlayer.name,
          teamName: isSold ? winningTeam.name : undefined,
          price: isSold ? winningBid : undefined,
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
          previousPlayerId,
          previousPlayerStatus,
          winningTeamId,
          winningBid,
          expiresAt: optimisticExpiresAt,
          version: payload.version ?? localAuctionState.version + 2,
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
      const payload = (await res.json()) as {
        error?: string;
        expiresAt?: string | null;
        playerId?: string | null;
        round?: number;
        selectedPlayerIds?: string[];
      };
      if (!res.ok) throw new Error(payload.error ?? "Failed to start next round.");
      const nextPlayerIds = payload.selectedPlayerIds ?? selectedPlayerIds;
      setLocalPlayers((curr) =>
        curr.map((player) =>
          nextPlayerIds.includes(player.id) && player.status === "UNSOLD"
            ? { ...player, status: "AVAILABLE" }
            : player,
        ),
      );
      setLocalAuctionState((curr) => ({
        ...curr,
        phase: "LIVE",
        currentRound: payload.round ?? curr.currentRound + 1,
        currentPlayerId: payload.playerId ?? nextPlayerIds[0] ?? null,
        currentBid: null,
        currentTeamId: null,
        expiresAt: payload.expiresAt ?? null,
        pausedRemainingMs: null,
        skipVoteTeamIds: [],
        version: curr.version + 1,
      }));
      setSelectedPlayerIds([]);
      channelRef.current?.send({ type: "broadcast", event: "REFRESH_ROOM" });
      refreshRoom();
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setNextRoundPending(false);
    }
  }

  async function handleSubmitInterest() {
    if (!myOwnedTeam) return;
    setInterestPending(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/rooms/${snapshot.room.code}/auction/round-interest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: myOwnedTeam.id, playerIds: interestDraft }),
        },
      );
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to submit interest.");
      const nextRound = localAuctionState.currentRound + 1;
      setLocalRoundInterests((curr) => [
        ...curr.filter(
          (entry) => !(entry.round === nextRound && entry.teamId === myOwnedTeam.id),
        ),
        ...interestDraft.map((playerId) => ({
          round: nextRound,
          teamId: myOwnedTeam.id,
          playerId,
        })),
      ]);
      setInterestSubmitted(true);
      refreshRoom();
      channelRef.current?.send({ type: "broadcast", event: "REFRESH_ROOM" });
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setInterestPending(false);
    }
  }

  async function handleSkipVote() {
    if (!myOwnedTeam) return;
    if (!isLive || !currentPlayer) return;
    setSkipVotePending(true);
    setBidError(null);
    try {
      const res = await fetch(`/api/rooms/${snapshot.room.code}/auction/skip-vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: myOwnedTeam.id }),
      });
      const payload = (await res.json()) as {
        allVoted?: boolean;
        error?: string;
        expiresAt?: string | null;
        version?: number;
      };
      if (!res.ok) {
        setBidError(payload.error ?? "Failed to vote.");
        return;
      }
      setLocalAuctionState((curr) => ({
        ...curr,
        expiresAt: payload.expiresAt ?? curr.expiresAt,
        lastEvent: payload.allVoted ? "ALL_SKIPPED" : "SKIP_VOTED",
        skipVoteTeamIds: curr.skipVoteTeamIds.includes(myOwnedTeam.id)
          ? curr.skipVoteTeamIds
          : [...curr.skipVoteTeamIds, myOwnedTeam.id],
        version: payload.version ?? curr.version + 1,
      }));
    } catch (err) {
      setBidError(toErrorMessage(err));
    } finally {
      setSkipVotePending(false);
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
        expiresAt?: string | null;
        timerSeconds?: number;
        timing?: {
          totalMs: number;
          steps: Array<{ step: string; ms: number }>;
        };
        version?: number;
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
        const nextTimerSeconds = payload.timerSeconds ?? localTimerSeconds;
        const nextExpiresAt =
          payload.expiresAt ??
          new Date(getCorrectedNowMs() + nextTimerSeconds * 1000).toISOString();
        setLocalTimerSeconds(nextTimerSeconds);
        setLocalAuctionState((curr) => ({
          ...curr,
          currentBid: nextAmount,
          currentTeamId: teamId,
          expiresAt: nextExpiresAt,
          version: payload.version ?? curr.version + 1,
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
        channelRef.current?.send({
          type: "broadcast",
          event: ROOM_EVENTS.newBid,
          payload: {
            playerId: currentPlayer?.id ?? "",
            teamId,
            amount: nextAmount,
            expiresAt: nextExpiresAt,
            timerSeconds: nextTimerSeconds,
            version: payload.version ?? localAuctionState.version + 1,
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
                ? "All remaining available players will be marked unsold and the round will end. You can start another round later."
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
            <span className="pill highlight">{auctionPhaseLabel(effectivePhase)}</span>
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
              <div className="auction-admin-controls">
                <button
                  className="button ghost"
                  style={{ minHeight: "34px", padding: "0.35rem 0.8rem", fontSize: "0.82rem" }}
                  disabled={pausePending || effectivePhase !== "LIVE"}
                  onClick={() =>
                    void runControlAction(
                      `/api/rooms/${snapshot.room.code}/auction/pause`,
                      null,
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
                      null,
                      setResumePending,
                    )
                  }
                  type="button"
                >
                  {resumePending ? "Resuming..." : "Resume"}
                </button>
                <button
                  className="button"
                  style={{ minHeight: "34px", padding: "0.35rem 0.8rem", fontSize: "0.82rem" }}
                  disabled={advancePending || effectivePhase !== "LIVE"}
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
              </div>
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
                totalSeconds={localTimerSeconds}
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

            {/* ROUND_END — member interest ballot */}
            {effectivePhase === "ROUND_END" && myOwnedTeam && hasAssignedTeams && (() => {
              const atCap = localAuctionState.currentRound >= MAX_AUCTION_ROUNDS;
              if (atCap) {
                return (
                  <div className="notice warning">
                    Final round reached (max {MAX_AUCTION_ROUNDS}). Any remaining moves must happen via trades.
                  </div>
                );
              }
              return (
                <div className="panel" style={{ borderColor: "rgba(183,121,31,0.3)", background: "rgba(183,121,31,0.04)" }}>
                  <h3 style={{ margin: "0 0 0.25rem" }}>Round {localAuctionState.currentRound} complete</h3>
                  <p className="subtle" style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
                    Pick the unsold players you want in Round {localAuctionState.currentRound + 1}.
                    Only the players selected by team owners will go into the next round.
                    {interestSubmitted ? " You can revise and resubmit until the next round starts." : ""}
                  </p>
                  <div className="checkbox-grid" style={{ marginBottom: "0.75rem" }}>
                    {unsoldPlayers.length === 0 ? (
                      <div className="subtle">No unsold players to carry forward.</div>
                    ) : (
                      unsoldPlayers.map((player) => (
                        <label className="checkbox-row" key={player.id} style={{ fontSize: "0.9rem" }}>
                          <input
                            checked={interestDraft.includes(player.id)}
                            disabled={interestPending}
                            onChange={() =>
                              setInterestDraft((ids) =>
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
                      className="button"
                      disabled={interestPending || unsoldPlayers.length === 0}
                      onClick={() => void handleSubmitInterest()}
                      type="button"
                    >
                      {interestPending
                        ? "Submitting..."
                        : interestSubmitted
                          ? `Update interest (${interestDraft.length})`
                          : `Submit interest (${interestDraft.length})`}
                    </button>
                    <button
                      className="button ghost"
                      disabled={interestPending}
                      onClick={() => setInterestDraft(unsoldPlayers.map((p) => p.id))}
                      type="button"
                    >
                      Select all
                    </button>
                    <button
                      className="button ghost"
                      disabled={interestPending}
                      onClick={() => setInterestDraft([])}
                      type="button"
                    >
                      Clear
                    </button>
                    {interestSubmitted && (
                      <span className="pill highlight" style={{ alignSelf: "center" }}>
                        Submitted
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ROUND_END — admin reviews interest and starts next round */}
            {effectivePhase === "ROUND_END" && isAdmin && (() => {
              const atCap = localAuctionState.currentRound >= MAX_AUCTION_ROUNDS;

              return (
                <div className="panel" style={{ borderColor: "rgba(183,121,31,0.3)", background: "rgba(183,121,31,0.04)" }}>
                  <h3 style={{ margin: "0 0 0.25rem" }}>Round {localAuctionState.currentRound} complete</h3>
                  {atCap ? (
                    <p className="subtle" style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
                      Maximum of {MAX_AUCTION_ROUNDS} rounds reached. Complete the auction — any further moves must go through trades.
                    </p>
                  ) : shouldAdminManuallySelectNextRound ? (
                    <p className="subtle" style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
                      No teams are assigned to users, so choose exactly which unsold players should go into Round {nextRound}.
                    </p>
                  ) : (
                    <p className="subtle" style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
                      Team owner ballots received: <strong>{submittedBallotCount}/{totalBallotTeams}</strong>.
                      Only the players selected by owners will go into Round {nextRound}.
                    </p>
                  )}
                  <div className="checkbox-grid" style={{ marginBottom: "0.75rem" }}>
                    {unsoldPlayers.length === 0 ? (
                      <div className="subtle">No unsold players available.</div>
                    ) : (
                      unsoldPlayers.map((player) => {
                        const count = interestCountByPlayer.get(player.id) ?? 0;
                        return (
                          <label className="checkbox-row" key={player.id} style={{ fontSize: "0.9rem" }}>
                            <input
                              checked={selectedPlayerIds.includes(player.id)}
                              disabled={atCap || !shouldAdminManuallySelectNextRound}
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
                              {hasAssignedTeams && (
                                <span
                                  className={`pill${count > 0 ? " highlight" : ""}`}
                                  style={{ marginLeft: "0.4rem", fontSize: "0.7rem" }}
                                >
                                  {count} interested
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  {!atCap && hasAssignedTeams && selectedPlayerIds.length === 0 && (
                    <div className="notice warning" style={{ marginBottom: "0.75rem" }}>
                      No team owner has selected a player for Round {nextRound} yet.
                    </div>
                  )}
                  <div className="button-row">
                    {!atCap && (
                      <button
                        className="button secondary"
                        disabled={nextRoundPending || selectedPlayerIds.length === 0}
                        onClick={() => void handleStartNextRound()}
                        type="button"
                      >
                        {nextRoundPending
                          ? "Starting..."
                          : `Start Round ${nextRound} (${selectedPlayerIds.length} players)`}
                      </button>
                    )}
                    {!atCap && shouldAdminManuallySelectNextRound && (
                      <button
                        className="button ghost"
                        disabled={nextRoundPending}
                        onClick={() => setSelectedPlayerIds(unsoldPlayers.map((p) => p.id))}
                        type="button"
                      >
                        Select all
                      </button>
                    )}
                    {!atCap && shouldAdminManuallySelectNextRound && (
                      <button
                        className="button ghost"
                        disabled={nextRoundPending}
                        onClick={() => setSelectedPlayerIds([])}
                        type="button"
                      >
                        Clear
                      </button>
                    )}
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
              );
            })()}

            {effectivePhase === "ROUND_END" && !isAdmin && !myOwnedTeam && (
              <div className="notice warning">
                Round {localAuctionState.currentRound} ended —{" "}
                {hasAssignedTeams
                  ? "waiting for team owners to submit selections and for the admin to start the next round."
                  : "waiting for the admin to choose players for the next round."}
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

            {myOwnedTeam && isLive && currentPlayer && (
              <button
                className="button ghost"
                style={{ minHeight: "52px", padding: "0.35rem 0.75rem", fontSize: "0.78rem", flexShrink: 0 }}
                disabled={
                  skipVotePending ||
                  localAuctionState.skipVoteTeamIds.includes(myOwnedTeam.id)
                }
                onClick={() => void handleSkipVote()}
                title="Vote to skip this player"
                type="button"
              >
                {localAuctionState.skipVoteTeamIds.includes(myOwnedTeam.id)
                  ? `Skip voted (${localAuctionState.skipVoteTeamIds.length}/${localTeams.length})`
                  : skipVotePending
                  ? "Voting..."
                  : `Skip (${localAuctionState.skipVoteTeamIds.length}/${localTeams.length})`}
              </button>
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
