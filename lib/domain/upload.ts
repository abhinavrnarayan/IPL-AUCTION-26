import type {
  PlayerUploadRowInput,
  TeamUploadRowInput,
} from "@/lib/domain/schemas";

function normalizeShortCode(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();
}



export function normalizePlayerRows(rows: PlayerUploadRowInput[]) {
  return rows.map((player, index) => ({
    name: player.name.trim(),
    role: player.role.trim(),
    nationality: player.nationality?.trim() || null,
    basePrice: player.basePrice,
    stats: player.stats ?? null,
    currentTeamId: player.currentTeamId ?? null,
    orderIndex: index + 1,
  }));
}
