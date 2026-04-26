import type { AuctionSnapshot } from "@/lib/domain/types";
import { cacheDel, cacheGet, cacheSet, TTL } from "@/lib/server/redis";
import { getRoomEntities } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type AuctionLiveSnapshot = Pick<
  AuctionSnapshot,
  "auctionState" | "bids" | "players" | "roundInterests" | "squads" | "teams"
> & {
  roomTimerSeconds: number;
  serverTime: number;
};

export function auctionLiveKey(roomId: string) {
  return `room:auction-live:${roomId}`;
}

export async function clearAuctionLiveSnapshot(roomId: string) {
  await cacheDel(auctionLiveKey(roomId));
}

export async function getAuctionLiveSnapshot(
  roomId: string,
  roomTimerSeconds: number,
  options: { bypassCache?: boolean } = {},
): Promise<AuctionLiveSnapshot | null> {
  const key = auctionLiveKey(roomId);
  if (!options.bypassCache) {
    const cached = await cacheGet<AuctionLiveSnapshot>(key);
    if (cached) {
      return {
        ...cached,
        roomTimerSeconds,
        serverTime: Date.now(),
      };
    }
  }

  const admin = getSupabaseAdminClient();
  const [entities, bidResult, interestResult] = await Promise.all([
    getRoomEntities(roomId, true),
    admin
      .from("bids")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(12),
    admin
      .from("round_interests")
      .select("round, team_id, player_id")
      .eq("room_id", roomId),
  ]);

  if (!entities.auctionState) return null;

  const snapshot: AuctionLiveSnapshot = {
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
    players: entities.players,
    roundInterests: (interestResult.data ?? []).map((row) => ({
      round: Number((row as Record<string, unknown>).round),
      teamId: String((row as Record<string, unknown>).team_id),
      playerId: String((row as Record<string, unknown>).player_id),
    })),
    roomTimerSeconds,
    serverTime: Date.now(),
    squads: entities.squads,
    teams: entities.teams,
  };

  await cacheSet(key, snapshot, TTL.AUCTION_LIVE);
  return snapshot;
}

export async function refreshAuctionLiveSnapshot(roomId: string, roomTimerSeconds: number) {
  return getAuctionLiveSnapshot(roomId, roomTimerSeconds, { bypassCache: true });
}
