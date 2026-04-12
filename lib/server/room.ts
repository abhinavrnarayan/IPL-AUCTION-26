import { AppError } from "@/lib/domain/errors";
import type {
  AuctionState,
  Player,
  Room,
  RoomMember,
  SquadEntry,
  Team,
  Trade,
} from "@/lib/domain/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { TTL, withCache, cacheDel } from "@/lib/server/redis";

// ── Cache key helpers (exported for mutation-side invalidation) ───────────────
export const roomCodeKey = (code: string) =>
  `room:code:${code.toUpperCase()}`;
export const roomEntitiesKey = (roomId: string) =>
  `room:entities:${roomId}`;
export const roomMembersKey = (roomId: string) =>
  `room:members:${roomId}`;

/** Invalidate all room-level caches after a write (advance, start, player changes). */
export async function invalidateRoomCache(roomId: string, code?: string) {
  const keys = [roomEntitiesKey(roomId), roomMembersKey(roomId)];
  if (code) keys.push(roomCodeKey(code));
  await cacheDel(...keys);
}

function unwrapJoinedUser(row: Record<string, unknown>) {
  const joined = row.users;

  if (Array.isArray(joined)) {
    return (joined[0] ?? null) as Record<string, unknown> | null;
  }

  return (joined ?? null) as Record<string, unknown> | null;
}

function unwrapJoinedRoom(row: Record<string, unknown>) {
  const joined = row.rooms;

  if (Array.isArray(joined)) {
    return (joined[0] ?? null) as Record<string, unknown> | null;
  }

  return (joined ?? null) as Record<string, unknown> | null;
}

export function mapRoom(row: Record<string, unknown>): Room {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    purse: Number(row.purse),
    squadSize: Number(row.squad_size),
    timerSeconds: Number(row.timer_seconds),
    bidIncrement: Number(row.bid_increment),
    ownerId: String(row.owner_id),
    createdAt: String(row.created_at),
    isSuperRoom: Boolean(row.is_super_room),
  };
}

export function mapMember(row: Record<string, unknown>): RoomMember {
  const joinedUser = unwrapJoinedUser(row);

  return {
    roomId: String(row.room_id),
    userId: String(row.user_id),
    email: (joinedUser?.email as string | null | undefined) ?? null,
    displayName: (joinedUser?.display_name as string | null | undefined) ?? null,
    avatarUrl: (joinedUser?.avatar_url as string | null | undefined) ?? null,
    isAdmin: Boolean(row.is_admin),
    isPlayer: Boolean(row.is_player),
  };
}

export function mapTeam(row: Record<string, unknown>): Team {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    name: String(row.name),
    shortCode: String(row.short_code),
    purseRemaining: Number(row.purse_remaining),
    squadLimit: Number(row.squad_limit),
    ownerUserId: (row.owner_user_id as string | null | undefined) ?? null,
    createdAt: String(row.created_at),
  };
}

export function mapPlayer(row: Record<string, unknown>): Player {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    name: String(row.name),
    role: String(row.role),
    nationality: (row.nationality as string | null | undefined) ?? null,
    basePrice: Number(row.base_price),
    status: row.status as Player["status"],
    stats: (row.stats as Record<string, unknown> | null | undefined) ?? null,
    orderIndex: Number(row.order_index),
    currentTeamId: (row.current_team_id as string | null | undefined) ?? null,
    soldPrice: (row.sold_price as number | null | undefined) ?? null,
  };
}

export function mapAuctionState(row: Record<string, unknown>): AuctionState {
  return {
    roomId: String(row.room_id),
    phase: row.phase as AuctionState["phase"],
    currentRound: Number(row.current_round),
    currentPlayerId: (row.current_player_id as string | null | undefined) ?? null,
    currentBid: (row.current_bid as number | null | undefined) ?? null,
    currentTeamId: (row.current_team_id as string | null | undefined) ?? null,
    expiresAt: (row.expires_at as string | null | undefined) ?? null,
    pausedRemainingMs: (row.paused_remaining_ms as number | null | undefined) ?? null,
    skipVoteTeamIds: (row.skip_vote_team_ids as string[] | null | undefined) ?? [],
    version: Number(row.version),
    lastEvent: (row.last_event as string | null | undefined) ?? null,
  };
}

export function mapSquadEntry(row: Record<string, unknown>): SquadEntry {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    teamId: String(row.team_id),
    playerId: String(row.player_id),
    purchasePrice: Number(row.purchase_price),
    acquiredInRound: Number(row.acquired_in_round),
    createdAt: String(row.created_at),
  };
}

export function mapTrade(row: Record<string, unknown>): Trade {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    teamAId: String(row.team_a_id),
    teamBId: String(row.team_b_id),
    playersFromA: (row.players_from_a as string[] | null | undefined) ?? [],
    playersFromB: (row.players_from_b as string[] | null | undefined) ?? [],
    cashFromA: Number(row.cash_from_a),
    cashFromB: Number(row.cash_from_b),
    status: row.status as Trade["status"],
    initiatedBy: String(row.initiated_by),
    approvedBy: (row.approved_by as string | null | undefined) ?? null,
    executedAt: (row.executed_at as string | null | undefined) ?? null,
    createdAt: String(row.created_at),
  };
}

export async function findRoomByCode(code: string) {
  return withCache(roomCodeKey(code), TTL.SERIES_ID /* 1hr */, async () => {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("rooms")
      .select("*")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (error) throw new AppError(error.message, 500, "ROOM_FETCH_FAILED");
    if (!data) throw new AppError("Room was not found.", 404, "ROOM_NOT_FOUND");

    return mapRoom(data as Record<string, unknown>);
  });
}

export async function getRoomMember(roomId: string, userId: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("room_members")
    .select("room_id, user_id, is_admin, is_player, users(email, display_name, avatar_url)")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, 500, "MEMBER_FETCH_FAILED");
  }

  return data ? mapMember(data as Record<string, unknown>) : null;
}

export async function requireRoomMember(code: string, userId: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("room_members")
    .select(
      "room_id, user_id, is_admin, is_player, users(email, display_name, avatar_url), rooms!inner(id, code, name, purse, squad_size, timer_seconds, bid_increment, owner_id, created_at, is_super_room)",
    )
    .eq("user_id", userId)
    .eq("rooms.code", code.toUpperCase())
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, 500, "MEMBER_FETCH_FAILED");
  }

  const room = data ? unwrapJoinedRoom(data as Record<string, unknown>) : null;
  const member = data ? mapMember(data as Record<string, unknown>) : null;

  if (!member || !room) {
    throw new AppError("Join this room before accessing it.", 403, "ROOM_ACCESS_DENIED");
  }

  return {
    room: mapRoom(room),
    member,
  };
}

export async function requireRoomAdmin(code: string, userId: string) {
  const { room, member } = await requireRoomMember(code, userId);

  if (!member.isAdmin) {
    throw new AppError("Only room admins can perform this action.", 403, "ADMIN_REQUIRED");
  }

  return {
    room,
    member,
  };
}

export async function getAuctionStateOnly(roomId: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("auction_state")
    .select("*")
    .eq("room_id", roomId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, 500, "AUCTION_FETCH_FAILED");
  }

  return data ? mapAuctionState(data as Record<string, unknown>) : null;
}

export async function getRoomEntities(roomId: string, bypassCache = false) {
  const fetch = async () => {
    const admin = getSupabaseAdminClient();
    const [
      { data: teamRows, error: teamError },
      { data: playerRows, error: playerError },
      { data: auctionRow, error: auctionError },
      { data: squadRows, error: squadError },
    ] = await Promise.all([
      admin.from("teams").select("*").eq("room_id", roomId).order("created_at"),
      admin.from("players").select("*").eq("room_id", roomId).order("order_index"),
      admin.from("auction_state").select("*").eq("room_id", roomId).maybeSingle(),
      admin.from("squad").select("*").eq("room_id", roomId),
    ]);

    if (teamError) throw new AppError(teamError.message, 500, "TEAM_FETCH_FAILED");
    if (playerError) throw new AppError(playerError.message, 500, "PLAYER_FETCH_FAILED");
    if (auctionError) throw new AppError(auctionError.message, 500, "AUCTION_FETCH_FAILED");
    if (squadError) throw new AppError(squadError.message, 500, "SQUAD_FETCH_FAILED");

    return {
      teams: (teamRows ?? []).map((row) => mapTeam(row as Record<string, unknown>)),
      players: (playerRows ?? []).map((row) => mapPlayer(row as Record<string, unknown>)),
      auctionState: auctionRow
        ? mapAuctionState(auctionRow as Record<string, unknown>)
        : null,
      squads: (squadRows ?? []).map((row) => mapSquadEntry(row as Record<string, unknown>)),
    };
  };

  // Write paths (advance, start) pass bypassCache=true to always get fresh auction state.
  if (bypassCache) return fetch();
  return withCache(roomEntitiesKey(roomId), 15, fetch);
}

export async function listRoomMembers(roomId: string) {
  return withCache(roomMembersKey(roomId), 60 /* 60s */, async () => {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("room_members")
      .select("room_id, user_id, is_admin, is_player, users(email, display_name, avatar_url)")
      .eq("room_id", roomId)
      .order("joined_at");

    if (error) throw new AppError(error.message, 500, "MEMBER_LIST_FAILED");

    return (data ?? []).map((row) => mapMember(row as Record<string, unknown>));
  });
}
