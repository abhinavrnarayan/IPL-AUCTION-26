/**
 * POST /api/rooms/[code]/cricsheet-sync
 *
 * Super-room admin only. Fetches or accepts a Cricsheet file, parses all IPL
 * matches, upserts them directly into this room's match_results (accepted=true),
 * and immediately recalculates player stats.
 *
 * Unlike the global admin route, results go straight to this room — no
 * review / accept step.
 */

import fs from "fs";
import path from "path";

import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { processSingleMatchJson, processZipPerMatch } from "@/lib/server/cricsheet";
import { requireRoomAdmin } from "@/lib/server/room";
import { recalculateRoomStats } from "@/lib/server/score-push";
import type { PlayerMatchStats } from "@/lib/server/webscrape/parser";
import { computeMatchPoints } from "@/lib/server/webscrape/parser";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface MappingEntry {
  short_name: string;
  full_name: string;
}

function buildUuidMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "final_mapping.json"), "utf8");
    const entries = JSON.parse(raw) as Record<string, MappingEntry>;
    for (const [uuid, value] of Object.entries(entries)) {
      if (!uuid || !value?.full_name) continue;
      map.set(uuid, value.full_name);
      map.set(uuid.slice(0, 8), value.full_name);
    }
  } catch {
    // no-op — stats matching will fall back to name-based lookup
  }
  return map;
}

function buildShortNameMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "final_mapping.json"), "utf8");
    const entries = JSON.parse(raw) as Record<string, MappingEntry>;
    for (const value of Object.values(entries)) {
      if (!value?.short_name || !value?.full_name) continue;
      map.set(value.short_name.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim(), value.full_name);
    }
  } catch {
    // silent
  }
  return map;
}

const CRICSHEET_UUID_MAP = buildUuidMap();
const CRICSHEET_SHORT_MAP = buildShortNameMap();

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);

    if (!room.isSuperRoom) {
      throw new AppError("Cricsheet sync is only available in the super room.", 403, "SUPER_ROOM_ONLY");
    }

    const admin = getSupabaseAdminClient();
    let fileBuffer: Buffer;
    let season: string;
    let uploadedFilename = "";

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file") as File | null;
      season = String(form.get("season") || "2026");
      if (!file) throw new AppError("No file uploaded.", 400, "NO_FILE");
      fileBuffer = Buffer.from(await file.arrayBuffer());
      uploadedFilename = file.name;
    } else {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      season = String(body.season ?? "2026");

      const urls = [
        `https://cricsheet.org/downloads/ipl_${season}_json.zip`,
        "https://cricsheet.org/downloads/ipl_json.zip",
      ];

      let fetchResponse: Response | null = null;
      for (const url of urls) {
        const res = await fetch(url, {
          headers: { "User-Agent": "IPL-Auction-Platform/1.0 (fantasy-scoring)" },
          signal: AbortSignal.timeout(90_000),
        });
        if (res.ok) { fetchResponse = res; break; }
      }

      if (!fetchResponse) {
        throw new AppError(
          "Could not fetch IPL data from Cricsheet. Try uploading the file manually.",
          502,
          "CRICSHEET_FETCH_FAILED",
        );
      }

      fileBuffer = Buffer.from(await fetchResponse.arrayBuffer());
    }

    const isJsonUpload = uploadedFilename.toLowerCase().endsWith(".json");
    const { matches, matchesProcessed, matchesSkipped, seasons } = isJsonUpload
      ? processSingleMatchJson(fileBuffer, uploadedFilename, undefined, CRICSHEET_UUID_MAP, CRICSHEET_SHORT_MAP)
      : processZipPerMatch(fileBuffer, season, CRICSHEET_UUID_MAP, CRICSHEET_SHORT_MAP);

    const aggregationSeason = isJsonUpload ? (matches[0]?.season || season) : season;

    if (matchesProcessed === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `No IPL matches found for season ${season}. Available: ${seasons.join(", ") || "none"}.`,
          matchesProcessed,
          matchesSkipped,
          seasons,
        },
        { status: 404 },
      );
    }

    // Skip matches already accepted in this room's match_results
    const { data: alreadyAccepted } = await admin
      .from("match_results")
      .select("match_id")
      .eq("room_id", room.id)
      .eq("season", aggregationSeason)
      .eq("source", "cricsheet")
      .eq("accepted", true);

    const acceptedMatchIds = new Set((alreadyAccepted ?? []).map((r) => String(r.match_id)));
    const newMatches = matches.filter((m) => !acceptedMatchIds.has(m.matchId));
    const skippedAccepted = matches.length - newMatches.length;

    let upserted = 0;
    let upsertErrors = 0;

    for (const match of newMatches) {
      const calculatedPoints: Record<string, number> = {};
      for (const [playerName, stats] of Object.entries(match.playerStats)) {
        calculatedPoints[playerName] = computeMatchPoints(stats as PlayerMatchStats);
      }

      const { error } = await admin
        .from("match_results")
        .upsert(
          {
            room_id: room.id,
            match_id: match.matchId,
            match_date: match.matchDate,
            season: match.season || aggregationSeason,
            teams: [],
            source: "cricsheet",
            source_label: "Cricsheet (ball-by-ball)",
            player_stats: match.playerStats as unknown as Record<string, unknown>,
            calculated_points: calculatedPoints as unknown as Record<string, unknown>,
            accepted: true,
            accepted_at: new Date().toISOString(),
          },
          { onConflict: "room_id,match_id,source" },
        );

      if (error) {
        console.error(`[rooms/cricsheet-sync] upsert failed for ${match.matchId}:`, error.message);
        upsertErrors += 1;
      } else {
        upserted += 1;
      }
    }

    // Recalculate all player stats from the newly stored match data
    const { playersUpdated } = await recalculateRoomStats(room.id, room.code);

    // Count total players in this room to derive unmatched
    const { count: totalPlayers } = await admin
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id);

    const total = totalPlayers ?? 0;
    const playersUnmatched = Math.max(0, total - playersUpdated);

    return NextResponse.json({
      ok: true,
      season: aggregationSeason,
      seasons,
      matchesProcessed,
      matchesSkipped,
      matchesAlreadyAccepted: skippedAccepted,
      matchesUpserted: upserted,
      matchesErrored: upsertErrors,
      playersMatched: playersUpdated,
      playersUnmatched,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
