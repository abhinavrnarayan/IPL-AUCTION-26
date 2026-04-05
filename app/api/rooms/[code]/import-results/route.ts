import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { requireRoomAdmin } from "@/lib/server/room";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

// ── Price parsing ────────────────────────────────────────────────────────────

/** Parse a string like "₹25 L", "₹10.5 Cr", "₹150 Cr" → rupees */
function parsePriceString(raw: unknown): number {
  if (typeof raw === "number") return Math.round(raw * 100_000); // treat numbers as lakhs
  if (typeof raw !== "string" || !raw) return 0;
  const cleaned = raw.replace(/₹|,|\s/g, "").toUpperCase();
  if (cleaned.endsWith("CR")) return Math.round(parseFloat(cleaned) * 10_000_000);
  if (cleaned.endsWith("L")) return Math.round(parseFloat(cleaned) * 100_000);
  return parseInt(cleaned, 10) || 0;
}

/** Numeric lakhs column → rupees */
function lakhsToRupees(lakhs: unknown): number {
  return typeof lakhs === "number" ? Math.round(lakhs * 100_000) : 0;
}

/** Derive a ≤4-char short code from a team name */
function getShortCode(name: string): string {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 4);
  return initials || name.slice(0, 3).toUpperCase();
}

// ── Sheet parsers ────────────────────────────────────────────────────────────

interface ParsedTeam {
  name: string;
  shortCode: string;
  purseRemaining: number;
  players: Array<{ name: string; role: string; iplTeam: string; soldPrice: number }>;
}

/**
 * Team sheet format:
 *   Row 0 (header): #, Player, Role, IPL Team, Price, Price (₹L), Points
 *   Data rows: number, name, role, iplTeam, priceStr, priceLakhs, points
 *   Summary rows: "", "REMAINING PURSE", ..., "", priceLakhs, ...
 */
function parseTeamSheet(ws: XLSX.WorkSheet, sheetName: string): ParsedTeam {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const players: ParsedTeam["players"] = [];
  let purseRemaining = 0;

  for (const row of rows.slice(1)) {
    const [num, player, role, iplTeam, , priceLakhs] = row as unknown[];
    if (typeof player === "string" && player === "REMAINING PURSE") {
      purseRemaining = lakhsToRupees(priceLakhs);
      continue;
    }
    if (typeof num !== "number" || !player) continue;
    players.push({
      name: String(player).trim(),
      role: String(role ?? "").trim(),
      iplTeam: String(iplTeam ?? "").trim(),
      soldPrice: lakhsToRupees(priceLakhs),
    });
  }

  return { name: sheetName, shortCode: getShortCode(sheetName), purseRemaining, players };
}

/**
 * Unsold sheet format:
 *   Row 0 (header): #, Player, Role, IPL Team, Base Price
 *   Data rows: number, name, role, iplTeam, basePriceStr
 */
function parseUnsoldSheet(ws: XLSX.WorkSheet): Array<{ name: string; role: string; iplTeam: string; basePrice: number }> {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const players = [];
  for (const row of rows.slice(1)) {
    const [num, player, role, iplTeam, baseStr] = row as unknown[];
    if (typeof num !== "number" || !player) continue;
    players.push({
      name: String(player).trim(),
      role: String(role ?? "").trim(),
      iplTeam: String(iplTeam ?? "").trim(),
      basePrice: parsePriceString(baseStr),
    });
  }
  return players;
}

// ── Route handler ────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

const UNSOLD_SHEET_NAMES = ["Unsold Players", "Excel", "Excel", "Unsold"] as const;

function findUnsoldSheetName(sheetNames: string[]) {
  return (
    sheetNames.find((name) =>
      UNSOLD_SHEET_NAMES.some((candidate) => candidate.toLowerCase() === name.toLowerCase()),
    ) ?? null
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);
    const admin = getSupabaseAdminClient();

    // Parse file from multipart form
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) throw new AppError("No file uploaded.", 400, "NO_FILE");

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });

    const unsoldSheetName = findUnsoldSheetName(wb.SheetNames);
    const teamSheetNames = wb.SheetNames.filter((n) => n !== unsoldSheetName);

    if (teamSheetNames.length === 0) {
      throw new AppError(
        "No team sheets found. Expected one sheet per team plus an 'Unsold Players' sheet.",
        400,
        "NO_TEAMS",
      );
    }

    const teams = teamSheetNames.map((name) =>
      parseTeamSheet(wb.Sheets[name]!, name),
    );

    const unsoldPlayers = unsoldSheetName && wb.Sheets[unsoldSheetName]
      ? parseUnsoldSheet(wb.Sheets[unsoldSheetName]!)
      : [];

    // ── Clear existing room data ─────────────────────────────────────────────
    await admin.from("squad").delete().eq("room_id", room.id);
    await admin.from("bids").delete().eq("room_id", room.id);
    await admin.from("players").delete().eq("room_id", room.id);
    await admin.from("teams").delete().eq("room_id", room.id);

    // ── Insert teams ─────────────────────────────────────────────────────────
    const { data: insertedTeams, error: teamErr } = await admin
      .from("teams")
      .insert(
        teams.map((t) => ({
          room_id: room.id,
          name: t.name,
          short_code: t.shortCode,
          purse_remaining: t.purseRemaining,
          squad_limit: 25,
          owner_user_id: null,
        })),
      )
      .select("id, name");

    if (teamErr || !insertedTeams) {
      throw new AppError(teamErr?.message ?? "Team insert failed.", 500, "TEAM_INSERT_FAILED");
    }

    const teamIdByName = new Map(insertedTeams.map((t) => [t.name, t.id]));

    // ── Insert players ───────────────────────────────────────────────────────
    const DEFAULT_BASE = 2_500_000; // ₹25L fallback base price
    let orderIndex = 0;

    const soldRows = teams.flatMap((team) =>
      team.players.map((p) => ({
        room_id: room.id,
        name: p.name,
        role: p.role,
        nationality: null as null,
        base_price: DEFAULT_BASE,
        status: "SOLD",
        stats: p.iplTeam ? { ipl_team: p.iplTeam } : null,
        order_index: ++orderIndex,
        current_team_id: teamIdByName.get(team.name) ?? null,
        sold_price: p.soldPrice,
      })),
    );

    const unsoldRows = unsoldPlayers.map((p) => ({
      room_id: room.id,
      name: p.name,
      role: p.role,
      nationality: null as null,
      base_price: p.basePrice || DEFAULT_BASE,
      status: "AVAILABLE",
      stats: p.iplTeam ? { ipl_team: p.iplTeam } : null,
      order_index: ++orderIndex,
      current_team_id: null as null,
      sold_price: null as null,
    }));

    const { data: insertedPlayers, error: playerErr } = await admin
      .from("players")
      .insert([...soldRows, ...unsoldRows])
      .select("id, status, current_team_id, sold_price");

    if (playerErr || !insertedPlayers) {
      throw new AppError(playerErr?.message ?? "Player insert failed.", 500, "PLAYER_INSERT_FAILED");
    }

    // ── Insert squad entries for sold players ────────────────────────────────
    const squadRows = insertedPlayers
      .filter((p) => p.status === "SOLD" && p.current_team_id)
      .map((p) => ({
        room_id: room.id,
        team_id: p.current_team_id!,
        player_id: p.id,
        purchase_price: p.sold_price ?? DEFAULT_BASE,
        acquired_in_round: 1,
      }));

    if (squadRows.length > 0) {
      const { error: squadErr } = await admin.from("squad").insert(squadRows);
      if (squadErr) {
        throw new AppError(squadErr.message, 500, "SQUAD_INSERT_FAILED");
      }
    }

    // ── Set auction state → COMPLETED ────────────────────────────────────────
    const hasRemainingAuctionPool = unsoldRows.length > 0;
    const nextPhase = hasRemainingAuctionPool ? "WAITING" : "COMPLETED";
    const nextEvent = hasRemainingAuctionPool
      ? "RESULTS_IMPORTED_WAITING"
      : "RESULTS_IMPORTED";

    const { data: existing } = await admin
      .from("auction_state")
      .select("version")
      .eq("room_id", room.id)
      .maybeSingle();

    if (existing) {
      await admin
        .from("auction_state")
        .update({
          phase: nextPhase,
          current_round: 1,
          current_player_id: null,
          current_bid: null,
          current_team_id: null,
          expires_at: null,
          paused_remaining_ms: null,
          skip_vote_team_ids: [],
          last_event: nextEvent,
          version: existing.version + 1,
        })
        .eq("room_id", room.id);
    } else {
      await admin.from("auction_state").insert({
        room_id: room.id,
        phase: nextPhase,
        current_round: 1,
        current_player_id: null,
        current_bid: null,
        current_team_id: null,
        expires_at: null,
        paused_remaining_ms: null,
        skip_vote_team_ids: [],
        last_event: nextEvent,
        version: 1,
      });
    }

    revalidatePath(`/room/${room.code}`);
    revalidatePath(`/auction/${room.code}`);
    revalidatePath(`/results/${room.code}`);

    return NextResponse.json({
      ok: true,
      teams: insertedTeams.length,
      soldPlayers: squadRows.length,
      unsoldPlayers: unsoldRows.length,
      readyToContinue: hasRemainingAuctionPool,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
