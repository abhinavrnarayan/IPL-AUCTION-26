import { AppError } from "@/lib/domain/errors";
import type {
  AuctionPhase,
  AuctionState,
  Player,
  Room,
  SquadEntry,
  Team,
} from "@/lib/domain/types";

export const BID_INCREMENTS = [1_000_000, 2_500_000, 5_000_000, 10_000_000] as const;

export function getAllowedIncrements(currentBid: number | null): number[] {
  if (currentBid === null) return [];
  if (currentBid >= 50_000_000) return [5_000_000, 10_000_000];
  if (currentBid >= 10_000_000) return [2_500_000, 5_000_000, 10_000_000];
  return [1_000_000, 2_500_000, 5_000_000, 10_000_000];
}

interface BuildAuctionStateInput {
  room: Room;
  players: Player[];
  now: Date;
}

interface BidValidationInput {
  room: Room;
  auctionState: AuctionState;
  team: Team;
  squads: SquadEntry[];
  now: Date;
  increment?: number;
}

interface ResolveAuctionInput {
  room: Room;
  auctionState: AuctionState;
  players: Player[];
  now: Date;
  forceResolution?: boolean;
}

export function getRoundQueue(players: Player[], round: number) {
  const sorted = [...players].sort((left, right) => left.orderIndex - right.orderIndex);
  // Round 1 goes through all players in order; subsequent rounds only include AVAILABLE players
  // (start-next-round resets selected UNSOLD players to AVAILABLE before starting)
  if (round === 1) {
    return sorted;
  }
  return sorted.filter((player) => player.status === "AVAILABLE");
}

export function getNextPlayerInRound(
  players: Player[],
  round: number,
  currentPlayerId?: string | null,
) {
  const queue = getRoundQueue(players, round);

  if (!currentPlayerId) {
    return queue[0] ?? null;
  }

  const currentIndex = queue.findIndex((player) => player.id === currentPlayerId);
  if (currentIndex === -1) {
    return queue[0] ?? null;
  }

  return queue[currentIndex + 1] ?? null;
}

export function canAuctionComplete(teams: Team[], squads: SquadEntry[]) {
  const minimumBid = BID_INCREMENTS[0];
  return teams.every((team) => {
    const squadCount = squads.filter((entry) => entry.teamId === team.id).length;
    return squadCount >= team.squadLimit || team.purseRemaining < minimumBid;
  });
}

export function buildStartingAuctionState({
  room,
  players,
  now,
}: BuildAuctionStateInput) {
  const firstPlayer = getNextPlayerInRound(players, 1);

  if (!firstPlayer) {
    throw new AppError("Upload players before starting the auction.", 400, "NO_PLAYERS");
  }

  return {
    phase: "LIVE" as AuctionPhase,
    currentRound: 1,
    currentPlayerId: firstPlayer.id,
    currentBid: null,
    currentTeamId: null,
    expiresAt: new Date(now.getTime() + room.timerSeconds * 1000).toISOString(),
    lastEvent: "AUCTION_STARTED",
  };
}

export function buildPausedAuctionState(auctionState: AuctionState, now: Date) {
  if (!["LIVE", "WAITING"].includes(auctionState.phase)) {
    throw new AppError("Auction cannot be paused right now.", 400, "INVALID_PHASE");
  }

  const pausedRemainingMs = auctionState.expiresAt
    ? Math.max(0, new Date(auctionState.expiresAt).getTime() - now.getTime())
    : null;

  return {
    ...auctionState,
    phase: "PAUSED" as AuctionPhase,
    expiresAt: null,
    pausedRemainingMs,
    lastEvent: "AUCTION_PAUSED",
  };
}

export function buildResumedAuctionState(
  room: Room,
  auctionState: AuctionState,
  now: Date,
) {
  if (auctionState.phase !== "PAUSED") {
    throw new AppError("Auction is not paused.", 400, "INVALID_PHASE");
  }

  if (!auctionState.currentPlayerId) {
    throw new AppError("No player is active to resume.", 400, "NO_ACTIVE_PLAYER");
  }

  const remainingMs =
    auctionState.pausedRemainingMs != null && auctionState.pausedRemainingMs > 0
      ? auctionState.pausedRemainingMs
      : room.timerSeconds * 1000;

  return {
    ...auctionState,
    phase: "LIVE" as AuctionPhase,
    expiresAt: new Date(now.getTime() + remainingMs).toISOString(),
    pausedRemainingMs: null,
    lastEvent: "AUCTION_RESUMED",
  };
}

export function getNextBidAmount(
  player: Player,
  auctionState: AuctionState,
  increment?: number,
) {
  if (auctionState.currentBid === null) {
    return player.basePrice;
  }

  const allowed = getAllowedIncrements(auctionState.currentBid);
  const chosen =
    increment !== undefined && allowed.includes(increment)
      ? increment
      : (allowed[0] ?? BID_INCREMENTS[0]);
  return auctionState.currentBid + chosen;
}

export function validateBidPlacement({
  room,
  auctionState,
  team,
  squads,
  now,
  increment,
}: BidValidationInput) {
  if (auctionState.phase !== "LIVE") {
    throw new AppError("Auction is not live.", 400, "INVALID_PHASE");
  }

  if (!auctionState.currentPlayerId) {
    throw new AppError("No player is currently on the block.", 400, "NO_ACTIVE_PLAYER");
  }

  if (auctionState.currentTeamId === team.id) {
    throw new AppError("Highest bidder cannot bid again immediately.", 400, "DUPLICATE_BID");
  }

  const squadCount = squads.filter((entry) => entry.teamId === team.id).length;
  if (squadCount >= team.squadLimit) {
    throw new AppError("Team squad is already full.", 400, "SQUAD_FULL");
  }

  if (auctionState.currentBid !== null && increment !== undefined) {
    const allowed = getAllowedIncrements(auctionState.currentBid);
    if (!allowed.includes(increment)) {
      throw new AppError("Invalid bid increment.", 400, "INVALID_INCREMENT");
    }
  }

  return {
    nextExpiresAt: new Date(now.getTime() + room.timerSeconds * 1000).toISOString(),
  };
}

export function resolveExpiredAuction({
  room,
  auctionState,
  players,
  now,
  forceResolution,
}: ResolveAuctionInput) {
  if (auctionState.phase !== "LIVE") {
    throw new AppError("Only a live auction can be advanced.", 400, "INVALID_PHASE");
  }

  if (!auctionState.currentPlayerId) {
    throw new AppError("No player is currently active.", 400, "NO_ACTIVE_PLAYER");
  }

  if (!forceResolution && (!auctionState.expiresAt || new Date(auctionState.expiresAt).getTime() - 2000 > now.getTime())) {
    throw new AppError("Timer has not expired yet.", 400, "TIMER_RUNNING");
  }

  const currentPlayer = players.find((player) => player.id === auctionState.currentPlayerId);

  if (!currentPlayer) {
    throw new AppError("Current player was not found.", 404, "PLAYER_NOT_FOUND");
  }

  const sold = Boolean(auctionState.currentTeamId && auctionState.currentBid);
  const queueAfterCurrent = getNextPlayerInRound(
    players,
    auctionState.currentRound,
    currentPlayer.id,
  );

  // Count unsold players after this auction resolves (excluding current player)
  const alreadyUnsold = players.filter(
    (p) => p.status === "UNSOLD" && p.id !== currentPlayer.id,
  ).length;
  const willBeUnsoldCount = alreadyUnsold + (sold ? 0 : 1);

  // When the current round's queue is exhausted and there are unsold players,
  // pause at ROUND_END so admin can pick which ones advance
  const shouldGoToRoundEnd = !queueAfterCurrent && willBeUnsoldCount > 0;

  const nextPlayer = shouldGoToRoundEnd ? null : (queueAfterCurrent ?? null);
  const nextPhase: AuctionPhase = shouldGoToRoundEnd
    ? "ROUND_END"
    : nextPlayer
    ? "LIVE"
    : "COMPLETED";
  const nextRound = auctionState.currentRound; // incremented by start-next-round

  return {
    sold,
    currentPlayer,
    nextRound,
    nextPlayerId: nextPlayer?.id ?? null,
    nextPhase,
    expiresAt:
      nextPhase === "LIVE" && nextPlayer
        ? new Date(now.getTime() + room.timerSeconds * 1000).toISOString()
        : null,
    lastEvent: shouldGoToRoundEnd ? "ROUND_END" : sold ? "PLAYER_SOLD" : "PLAYER_UNSOLD",
  };
}
