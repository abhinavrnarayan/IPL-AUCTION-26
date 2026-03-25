import { AppError } from "@/lib/domain/errors";
import type {
  SquadEntry,
  Team,
  TradeRequest,
} from "@/lib/domain/types";

interface TradeValidationContext {
  trade: TradeRequest;
  teams: Team[];
  squad: SquadEntry[];
}

export function validateTrade({
  trade,
  teams,
  squad,
}: TradeValidationContext) {
  const teamA = teams.find((team) => team.id === trade.teamAId);
  const teamB = teams.find((team) => team.id === trade.teamBId);

  if (!teamA || !teamB) {
    throw new AppError("Trade teams were not found.", 404, "TEAM_NOT_FOUND");
  }

  const ownedByA = new Set(
    squad.filter((entry) => entry.teamId === teamA.id).map((entry) => entry.playerId),
  );
  const ownedByB = new Set(
    squad.filter((entry) => entry.teamId === teamB.id).map((entry) => entry.playerId),
  );

  for (const playerId of trade.playersFromA) {
    if (!ownedByA.has(playerId)) {
      throw new AppError(
        "One or more players offered by team A are not in its squad.",
        400,
        "INVALID_TRADE_PLAYERS",
      );
    }
  }

  for (const playerId of trade.playersFromB) {
    if (!ownedByB.has(playerId)) {
      throw new AppError(
        "One or more players offered by team B are not in its squad.",
        400,
        "INVALID_TRADE_PLAYERS",
      );
    }
  }

  const outgoingValueFromA = squad
    .filter((entry) => entry.teamId === teamA.id && trade.playersFromA.includes(entry.playerId))
    .reduce((sum, entry) => sum + entry.purchasePrice, 0);
  const outgoingValueFromB = squad
    .filter((entry) => entry.teamId === teamB.id && trade.playersFromB.includes(entry.playerId))
    .reduce((sum, entry) => sum + entry.purchasePrice, 0);

  const nextTeamAPurse =
    teamA.purseRemaining + outgoingValueFromA - outgoingValueFromB - trade.cashFromA + trade.cashFromB;
  const nextTeamBPurse =
    teamB.purseRemaining + outgoingValueFromB - outgoingValueFromA - trade.cashFromB + trade.cashFromA;

  if (nextTeamAPurse < 0 || nextTeamBPurse < 0) {
    throw new AppError(
      "Trade would make a purse negative.",
      400,
      "NEGATIVE_PURSE",
    );
  }

  const teamASquadCount = squad.filter((entry) => entry.teamId === teamA.id).length;
  const teamBSquadCount = squad.filter((entry) => entry.teamId === teamB.id).length;
  const nextTeamASquadCount =
    teamASquadCount - trade.playersFromA.length + trade.playersFromB.length;
  const nextTeamBSquadCount =
    teamBSquadCount - trade.playersFromB.length + trade.playersFromA.length;

  if (nextTeamASquadCount > teamA.squadLimit || nextTeamBSquadCount > teamB.squadLimit) {
    throw new AppError(
      "Trade would exceed squad size limits.",
      400,
      "SQUAD_LIMIT_EXCEEDED",
    );
  }

  return {
    teamA,
    teamB,
    nextTeamAPurse,
    nextTeamBPurse,
    outgoingValueFromA,
    outgoingValueFromB,
    nextTeamASquadCount,
    nextTeamBSquadCount,
  };
}
