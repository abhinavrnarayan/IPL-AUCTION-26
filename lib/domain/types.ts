export type AuctionPhase =
  | "WAITING"
  | "LIVE"
  | "PAUSED"
  | "ROUND_END"
  | "COMPLETED";

export type PlayerStatus = "AVAILABLE" | "SOLD" | "UNSOLD";
export type TradeStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED";

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  purse: number;
  squadSize: number;
  timerSeconds: number;
  bidIncrement: number;
  ownerId: string;
  createdAt: string;
  isSuperRoom: boolean;
}

export interface RoomMember {
  roomId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isPlayer: boolean;
}

export interface Team {
  id: string;
  roomId: string;
  name: string;
  shortCode: string;
  purseRemaining: number;
  squadLimit: number;
  ownerUserId: string | null;
  createdAt: string;
}

export interface Player {
  id: string;
  roomId: string;
  name: string;
  role: string;
  nationality: string | null;
  basePrice: number;
  status: PlayerStatus;
  stats: Record<string, unknown> | null;
  orderIndex: number;
  currentTeamId: string | null;
  soldPrice: number | null;
}

export interface AuctionState {
  roomId: string;
  phase: AuctionPhase;
  currentRound: number;
  currentPlayerId: string | null;
  currentBid: number | null;
  currentTeamId: string | null;
  expiresAt: string | null;
  pausedRemainingMs: number | null;
  skipVoteTeamIds: string[];
  version: number;
  lastEvent: string | null;
}

export interface Bid {
  id: string;
  roomId: string;
  playerId: string;
  teamId: string;
  amount: number;
  createdAt: string;
  createdBy: string;
}

export interface SquadEntry {
  id: string;
  roomId: string;
  teamId: string;
  playerId: string;
  purchasePrice: number;
  acquiredInRound: number;
  createdAt: string;
}

export interface Trade {
  id: string;
  roomId: string;
  teamAId: string;
  teamBId: string;
  playersFromA: string[];
  playersFromB: string[];
  cashFromA: number;
  cashFromB: number;
  status: TradeStatus;
  initiatedBy: string;
  approvedBy: string | null;
  executedAt: string | null;
  createdAt: string;
}

export interface TeamScore {
  teamId: string;
  teamName: string;
  totalPoints: number;
  remainingPurse: number;
  squadCount: number;
}

export interface RoomSummary {
  room: Room;
  memberCount: number;
  teamCount: number;
  isAdmin: boolean;
  isPlayer: boolean;
  auctionPhase: AuctionPhase | "WAITING";
}

export interface LobbySnapshot {
  user: UserProfile | null;
  rooms: RoomSummary[];
  hasSupabase: boolean;
}

export interface RoomSnapshot {
  room: Room;
  members: RoomMember[];
  teams: Team[];
  players: Player[];
  auctionState: AuctionState | null;
  user: UserProfile | null;
  currentMember: RoomMember | null;
  squads: SquadEntry[];
  trades: Trade[];
}

export interface AuctionSnapshot {
  room: Room;
  teams: Team[];
  players: Player[];
  auctionState: AuctionState;
  bids: Bid[];
  squads: SquadEntry[];
  trades: Trade[];
  user: UserProfile | null;
  currentMember: RoomMember | null;
}

export interface ResultsSnapshot {
  room: Room;
  teams: Team[];
  squads: Array<SquadEntry & { player: Player | null }>;
  trades: Trade[];
  leaderboard: TeamScore[];
  currentMember: RoomMember | null;
}

export interface TradeRequest {
  teamAId: string;
  teamBId: string;
  playersFromA: string[];
  playersFromB: string[];
  cashFromA: number;
  cashFromB: number;
}

export interface EmojiReaction {
  emoji: string;
  sentAt: string;
  userName: string;
  context?: string;
}
