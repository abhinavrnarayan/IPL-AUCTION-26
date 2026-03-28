import { AppError } from "@/lib/domain/errors";
import type { PlayerUploadRowInput } from "@/lib/domain/schemas";
import type { Room } from "@/lib/domain/types";
import { normalizePlayerRows } from "@/lib/domain/upload";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

interface InsertPlayersIntoRoomOptions {
  requireEmpty?: boolean;
}

export async function insertPlayersIntoRoom(
  room: Room,
  players: PlayerUploadRowInput[],
  options: InsertPlayersIntoRoomOptions = {},
) {
  const admin = getSupabaseAdminClient();
  const normalizedPlayers = normalizePlayerRows(players);

  if (normalizedPlayers.length === 0) {
    throw new AppError("No valid players were provided for import.", 400, "NO_PLAYERS");
  }

  const { data: auctionState, error: auctionError } = await admin
    .from("auction_state")
    .select("phase, current_round")
    .eq("room_id", room.id)
    .maybeSingle();

  if (auctionError) {
    throw new AppError(auctionError.message, 500, "AUCTION_FETCH_FAILED");
  }

  if (options.requireEmpty) {
    const { count, error: countError } = await admin
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id);

    if (countError) {
      throw new AppError(countError.message, 500, "PLAYER_COUNT_FAILED");
    }

    if ((count ?? 0) > 0) {
      throw new AppError(
        "This room already has players. Clear the current list before loading the default player pool.",
        400,
        "PLAYERS_ALREADY_PRESENT",
      );
    }
  }

  const { data: existingPlayers, error: existingPlayersError } = await admin
    .from("players")
    .select("order_index")
    .eq("room_id", room.id)
    .order("order_index", { ascending: false })
    .limit(1);

  if (existingPlayersError) {
    throw new AppError(existingPlayersError.message, 500, "PLAYER_FETCH_FAILED");
  }

  const startIndex = Number(existingPlayers?.[0]?.order_index ?? 0);
  const currentRound = Number(auctionState?.current_round ?? 1);
  const soldPlayers = normalizedPlayers.filter((player) => player.currentTeamId);

  if (soldPlayers.length > 0) {
    const teamIds = [...new Set(soldPlayers.map((player) => player.currentTeamId!))];
    const { data: teamRows, error: teamError } = await admin
      .from("teams")
      .select("id, purse_remaining, squad_limit")
      .eq("room_id", room.id)
      .in("id", teamIds);

    if (teamError) {
      throw new AppError(teamError.message, 500, "TEAM_FETCH_FAILED");
    }

    const { data: squadRows, error: squadError } = await admin
      .from("squad")
      .select("team_id")
      .eq("room_id", room.id);

    if (squadError) {
      throw new AppError(squadError.message, 500, "SQUAD_FETCH_FAILED");
    }

    const teamMap = new Map(
      (teamRows ?? []).map((team) => [
        String(team.id),
        {
          purseRemaining: Number(team.purse_remaining),
          squadLimit: Number(team.squad_limit),
          squadCount: (squadRows ?? []).filter((row) => String(row.team_id) === String(team.id)).length,
        },
      ]),
    );

    for (const player of soldPlayers) {
      const teamState = teamMap.get(player.currentTeamId!);
      const price = player.basePrice > 0 ? player.basePrice : room.bidIncrement;

      if (!teamState) {
        throw new AppError("Selected team was not found for one of the players.", 400, "TEAM_NOT_FOUND");
      }

      if (teamState.squadCount >= teamState.squadLimit) {
        throw new AppError("One of the selected teams already has a full squad.", 400, "SQUAD_FULL");
      }

      if (teamState.purseRemaining < price) {
        throw new AppError("One of the selected teams does not have enough purse left.", 400, "INSUFFICIENT_PURSE");
      }

      teamState.squadCount += 1;
      teamState.purseRemaining -= price;
    }

    for (const [teamId, state] of teamMap.entries()) {
      const { error: updateTeamError } = await admin
        .from("teams")
        .update({ purse_remaining: state.purseRemaining })
        .eq("room_id", room.id)
        .eq("id", teamId);

      if (updateTeamError) {
        throw new AppError(updateTeamError.message, 500, "TEAM_UPDATE_FAILED");
      }
    }
  }

  const rows = normalizedPlayers.map((player, index) => {
    const price = player.basePrice > 0 ? player.basePrice : room.bidIncrement;
    return {
      room_id: room.id,
      name: player.name,
      role: player.role,
      nationality: player.nationality,
      base_price: price,
      status: player.currentTeamId ? "SOLD" : "AVAILABLE",
      stats: player.stats,
      order_index: startIndex + index + 1,
      current_team_id: player.currentTeamId ?? null,
      sold_price: player.currentTeamId ? price : null,
    };
  });

  const { data: insertedPlayers, error } = await admin.from("players").insert(rows).select("id, current_team_id, sold_price");

  if (error) {
    throw new AppError(error.message, 500, "PLAYER_IMPORT_FAILED");
  }

  const soldRows = (insertedPlayers ?? []).filter((player) => player.current_team_id);
  if (soldRows.length > 0) {
    const squadInsertRows = soldRows.map((player) => ({
      room_id: room.id,
      team_id: String(player.current_team_id),
      player_id: String(player.id),
      purchase_price: Number(player.sold_price ?? room.bidIncrement),
      acquired_in_round: currentRound,
    }));

    const { error: insertSquadError } = await admin.from("squad").insert(squadInsertRows);

    if (insertSquadError) {
      throw new AppError(insertSquadError.message, 500, "SQUAD_INSERT_FAILED");
    }
  }

  return {
    imported: rows.length,
  };
}
