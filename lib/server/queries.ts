import { buildTeamLeaderboard } from "@/lib/domain/scoring";
import type {
  AuctionSnapshot,
  LobbySnapshot,
  ResultsSnapshot,
  RoomSnapshot,
  UserProfile,
} from "@/lib/domain/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  findRoomByCode,
  getRoomEntities,
  getRoomMember,
  listRoomMembers,
  mapRoom,
  mapTrade,
} from "@/lib/server/room";

export async function getLobbySnapshot(
  user: UserProfile | null,
): Promise<LobbySnapshot> {
  if (!user) {
    return {
      user: null,
      rooms: [],
      hasSupabase: true,
    };
  }

  const admin = getSupabaseAdminClient();
  const { data: membershipRows } = await admin
    .from("room_members")
    .select("room_id, is_admin, is_player")
    .eq("user_id", user.id);

  const roomIds = (membershipRows ?? []).map((row) => row.room_id);

  if (roomIds.length === 0) {
    return {
      user,
      rooms: [],
      hasSupabase: true,
    };
  }

  const [{ data: roomRows }, { data: teamRows }, { data: memberRows }, { data: auctionRows }] =
    await Promise.all([
      admin.from("rooms").select("*").in("id", roomIds).order("created_at", {
        ascending: false,
      }),
      admin.from("teams").select("room_id, id").in("room_id", roomIds),
      admin.from("room_members").select("room_id").in("room_id", roomIds),
      admin.from("auction_state").select("room_id, phase").in("room_id", roomIds),
    ]);

  const membershipByRoomId = new Map(
    (membershipRows ?? []).map((row) => [
      row.room_id as string,
      {
        isAdmin: Boolean(row.is_admin),
        isPlayer: Boolean(row.is_player),
      },
    ]),
  );

  const memberCountByRoomId = new Map<string, number>();
  for (const row of memberRows ?? []) {
    const roomId = row.room_id as string;
    memberCountByRoomId.set(roomId, (memberCountByRoomId.get(roomId) ?? 0) + 1);
  }

  const teamCountByRoomId = new Map<string, number>();
  for (const row of teamRows ?? []) {
    const roomId = row.room_id as string;
    teamCountByRoomId.set(roomId, (teamCountByRoomId.get(roomId) ?? 0) + 1);
  }

  const auctionPhaseByRoomId = new Map<string, string>();
  for (const row of auctionRows ?? []) {
    auctionPhaseByRoomId.set(String(row.room_id), String(row.phase ?? "WAITING"));
  }

  return {
    user,
    rooms: (roomRows ?? []).map((row) => {
      const room = mapRoom(row as Record<string, unknown>);
      const membership = membershipByRoomId.get(room.id) ?? {
        isAdmin: false,
        isPlayer: false,
      };

      return {
        room,
        memberCount: memberCountByRoomId.get(room.id) ?? 0,
        teamCount: teamCountByRoomId.get(room.id) ?? 0,
        isAdmin: membership.isAdmin,
        isPlayer: membership.isPlayer,
        auctionPhase:
          (auctionPhaseByRoomId.get(room.id) as "WAITING" | "LIVE" | "PAUSED" | "ROUND_END" | "COMPLETED" | undefined) ??
          "WAITING",
      };
    }),
    hasSupabase: true,
  };
}

export async function getRoomSnapshot(
  code: string,
  user: UserProfile,
): Promise<RoomSnapshot> {
  const room = await findRoomByCode(code);
  const currentMember = await getRoomMember(room.id, user.id);
  const { teams, players, auctionState, squads } = await getRoomEntities(room.id);
  const members = await listRoomMembers(room.id);
  
  const admin = getSupabaseAdminClient();
  const { data: tradeRows } = await admin
    .from("trades")
    .select("*")
    .eq("room_id", room.id)
    .in("status", ["PENDING", "EXECUTED"])
    .order("created_at", { ascending: false })
    .limit(40);

  return {
    room,
    members,
    teams,
    players,
    auctionState,
    squads,
    trades: (tradeRows ?? []).map((row) => mapTrade(row as Record<string, unknown>)),
    user,
    currentMember,
  };
}

export async function getAuctionSnapshot(
  code: string,
  user: UserProfile,
): Promise<AuctionSnapshot | null> {
  const room = await findRoomByCode(code);
  const admin = getSupabaseAdminClient();

  // Parallelize all per-room queries after we have room.id
  const [currentMember, entities, bidResult, tradeResult] = await Promise.all([
    getRoomMember(room.id, user.id),
    getRoomEntities(room.id),
    admin
      .from("bids")
      .select("*")
      .eq("room_id", room.id)
      .order("created_at", { ascending: false })
      .limit(12),
    admin
      .from("trades")
      .select("*")
      .eq("room_id", room.id)
      .in("status", ["PENDING", "EXECUTED"])
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  if (!currentMember || !entities.auctionState) {
    return null;
  }

  return {
    room,
    teams: entities.teams,
    players: entities.players,
    auctionState: entities.auctionState,
    bids: (bidResult.data ?? []).map((row) => ({
      id: String(row.id),
      roomId: String(row.room_id),
      playerId: String(row.player_id),
      teamId: String(row.team_id),
      amount: Number(row.amount),
      createdAt: String(row.created_at),
      createdBy: String(row.created_by),
    })),
    squads: entities.squads,
    trades: (tradeResult.data ?? []).map((row) => mapTrade(row as Record<string, unknown>)),
    user,
    currentMember,
  };
}

export async function getResultsSnapshot(
  code: string,
  user: UserProfile,
): Promise<ResultsSnapshot | null> {
  const room = await findRoomByCode(code);
  const currentMember = await getRoomMember(room.id, user.id);

  if (!currentMember) {
    return null;
  }

  const admin = getSupabaseAdminClient();
  const { teams, players, squads } = await getRoomEntities(room.id);
  const { data: tradeRows } = await admin
    .from("trades")
    .select("*")
    .eq("room_id", room.id)
    .order("created_at", { ascending: false });

  const playerById = new Map(players.map((player) => [player.id, player]));
  const leaderboard = buildTeamLeaderboard(teams, squads, players);

  return {
    room,
    teams,
    squads: squads.map((entry) => ({
      ...entry,
      player: playerById.get(entry.playerId) ?? null,
    })),
    trades: (tradeRows ?? []).map((row) => mapTrade(row as Record<string, unknown>)),
    leaderboard,
  };
}
