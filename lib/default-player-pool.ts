import defaultPlayerPoolJson from "@/data/default-player-pool.json";
import type { PlayerUploadRowInput } from "@/lib/domain/schemas";

interface DefaultPlayerPoolEntry {
  sourceIndex: number | null;
  name: string;
  role: string;
  iplTeam: string | null;
}

const defaultPlayerPool = defaultPlayerPoolJson as DefaultPlayerPoolEntry[];

export const defaultPlayerPoolCount = defaultPlayerPool.length;

export function buildDefaultPlayerPoolRows(basePrice: number): PlayerUploadRowInput[] {
  return defaultPlayerPool.map((player) => ({
    name: player.name,
    role: player.role,
    nationality: null,
    basePrice,
    stats: {
      importedFrom: "default-player-pool",
      sourceIndex: player.sourceIndex,
      iplTeam: player.iplTeam,
    },
  }));
}
