import { AppError } from "@/lib/domain/errors";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function reorderPlayersSafely(
  roomId: string,
  players: Array<{ id: string; orderIndex: number }>,
) {
  if (players.length === 0) {
    return;
  }

  const admin = getSupabaseAdminClient();
  const sortedOrderIndexes = [...players]
    .map((player) => player.orderIndex)
    .sort((left, right) => left - right);
  const tempOffset = Math.max(...sortedOrderIndexes, 0) + 10_000;

  const tempResults = await Promise.all(
    players.map((player, index) =>
      admin
        .from("players")
        .update({ order_index: tempOffset + index + 1 })
        .eq("id", player.id)
        .eq("room_id", roomId),
    ),
  );
  const tempError = tempResults.find((result) => result.error)?.error ?? null;

  if (tempError) {
    throw new AppError(tempError.message, 500, "PLAYER_REORDER_FAILED");
  }

  const finalResults = await Promise.all(
    players.map((player, index) =>
      admin
        .from("players")
        .update({ order_index: sortedOrderIndexes[index] })
        .eq("id", player.id)
        .eq("room_id", roomId),
    ),
  );
  const finalError = finalResults.find((result) => result.error)?.error ?? null;

  if (finalError) {
    throw new AppError(finalError.message, 500, "PLAYER_REORDER_FAILED");
  }
}
