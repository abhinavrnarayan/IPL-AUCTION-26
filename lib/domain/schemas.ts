import { z } from "zod";

export const createRoomSchema = z.object({
  name: z.string().trim().min(3).max(60),
  purse: z.coerce.number().int().positive().max(5_000_000_000),
  squadSize: z.coerce.number().int().min(1).max(40),
  timerSeconds: z.coerce.number().int().min(5).max(180),
  bidIncrement: z.coerce.number().int().positive().max(10000000),
});

export const joinRoomSchema = z.object({
  code: z.string().trim().min(4).max(8).transform((value) => value.toUpperCase()),
});

export const playerUploadRowSchema = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  nationality: z.string().trim().optional().nullable(),
  basePrice: z.coerce.number().int().nonnegative(),
  stats: z.record(z.unknown()).optional().nullable(),
  currentTeamId: z.string().uuid().optional().nullable(),
});

export const playerUploadSchema = z.object({
  players: z.array(playerUploadRowSchema).min(1),
});

export const teamUploadRowSchema = z.object({
  name: z.string().trim().min(1),
  shortCode: z.string().trim().max(6).optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable(),
});

export const teamUploadSchema = z.object({
  teams: z.array(teamUploadRowSchema).min(1),
});

export const bidSchema = z.object({
  teamId: z.string().uuid(),
  increment: z.number().int().positive().optional(),
});

export const removePlayersSchema = z
  .object({
    playerIds: z.array(z.string().uuid()).default([]),
    removeAll: z.boolean().optional().default(false),
  })
  .refine((value) => value.removeAll || value.playerIds.length > 0, {
    message: "Select at least one player to remove.",
    path: ["playerIds"],
  });

export const teamRenameSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const teamPurseSchema = z.object({
  purseRemaining: z.coerce.number().int().nonnegative().max(5_000_000_000),
});

export const roomSettingsSchema = z
  .object({
    squadSize: z.coerce.number().int().min(1).max(40).optional(),
    timerSeconds: z.coerce.number().int().min(5).max(180).optional(),
  })
  .refine((value) => value.squadSize !== undefined || value.timerSeconds !== undefined, {
    message: "Provide a squad size or bid timer to update.",
  });

export const teamOwnerSchema = z.object({
  ownerUserId: z.string().uuid().nullable(),
});

export const startNextRoundSchema = z.object({
  playerIds: z.array(z.string().uuid()).min(1, "Select at least one player for the next round."),
});

export const skipVoteSchema = z.object({
  teamId: z.string().uuid(),
});

export const tradeSchema = z
  .object({
    teamAId: z.string().uuid(),
    teamBId: z.string().uuid(),
    playersFromA: z.array(z.string().uuid()).default([]),
    playersFromB: z.array(z.string().uuid()).default([]),
    cashFromA: z.coerce.number().int().nonnegative().default(0),
    cashFromB: z.coerce.number().int().nonnegative().default(0),
  })
  .refine((value) => value.teamAId !== value.teamBId, {
    message: "Teams must be different.",
    path: ["teamBId"],
  });

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type PlayerUploadInput = z.infer<typeof playerUploadSchema>;
export type PlayerUploadRowInput = z.infer<typeof playerUploadRowSchema>;
export type TeamUploadInput = z.infer<typeof teamUploadSchema>;
export type TeamUploadRowInput = z.infer<typeof teamUploadRowSchema>;
export type BidInput = z.infer<typeof bidSchema>;
export type RemovePlayersInput = z.infer<typeof removePlayersSchema>;
export type TradeInput = z.infer<typeof tradeSchema>;
export type TeamOwnerInput = z.infer<typeof teamOwnerSchema>;
export type TeamPurseInput = z.infer<typeof teamPurseSchema>;
export type RoomSettingsInput = z.infer<typeof roomSettingsSchema>;
