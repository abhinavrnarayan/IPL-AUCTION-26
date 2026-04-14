/**
 * POST /api/admin/cricsheet-sync
 *
 * Global admin only. Fetches Cricsheet data (or accepts a file upload),
 * parses all IPL matches for the given season, and upserts rows into
 * global_match_results. Does NOT push to rooms yet — admin reviews and
 * accepts each match individually via /api/admin/accept-match.
 */

import fs from "fs";
import path from "path";

import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireSuperAdmin } from "@/lib/server/auth";
import { processSingleMatchJson, processZipPerMatch } from "@/lib/server/cricsheet";
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
  } catch (error) {
    console.error("[admin/cricsheet-sync] failed to load final_mapping.json", error);
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
    // Silent fallback
  }
  return map;
}

const CRICSHEET_UUID_MAP = buildUuidMap();
const CRICSHEET_SHORT_MAP = buildShortNameMap();

export async function POST(request: Request) {
  try {
    await requireSuperAdmin();
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

    // Treat an accepted match as fully resolved, regardless of source.
    const { data: alreadyAccepted } = await admin
      .from("global_match_results")
      .select("match_id")
      .eq("season", aggregationSeason)
      .eq("accepted", true);

    const acceptedMatchIds = new Set((alreadyAccepted ?? []).map((r) => String(r.match_id)));

    if (acceptedMatchIds.size > 0) {
      await admin
        .from("global_match_results")
        .delete()
        .eq("season", aggregationSeason)
        .eq("accepted", false)
        .in("match_id", Array.from(acceptedMatchIds));
    }

    const newMatches = matches.filter((m) => !acceptedMatchIds.has(m.matchId));
    const skippedAccepted = matches.length - newMatches.length;

    let upserted = 0;
    let upsertErrors = 0;

    for (const match of newMatches) {
      // Pre-compute fantasy points for the preview table
      const calculatedPoints: Record<string, number> = {};
      for (const [playerName, stats] of Object.entries(match.playerStats)) {
        calculatedPoints[playerName] = computeMatchPoints(stats as PlayerMatchStats);
      }

      const { error } = await admin
        .from("global_match_results")
        .upsert(
          {
            match_id: match.matchId,
            match_date: match.matchDate,
            season: match.season || aggregationSeason,
            teams: [], // Cricsheet data doesn't expose teams in the processSingleMatchJson return
            source: "cricsheet",
            source_label: "Cricsheet (ball-by-ball)",
            player_stats: match.playerStats as unknown as Record<string, unknown>,
            calculated_points: calculatedPoints as unknown as Record<string, unknown>,
            accepted: false,
          },
          { onConflict: "match_id,source" },
        );

      if (error) {
        console.error(`[admin/cricsheet-sync] upsert failed for ${match.matchId}:`, error.message);
        upsertErrors += 1;
      } else {
        upserted += 1;
      }
    }

    // Return summary of all pending (unaccepted) matches so admin can review
    const { data: pendingRows } = await admin
      .from("global_match_results")
      .select("match_id, match_date, season, teams, source, source_label, calculated_points, accepted, pushed_at")
      .eq("season", aggregationSeason)
      .eq("source", "cricsheet")
      .order("match_date", { ascending: true });

    return NextResponse.json({
      ok: true,
      season: aggregationSeason,
      seasons,
      matchesProcessed,
      matchesSkipped,
      matchesAlreadyAccepted: skippedAccepted,
      matchesUpserted: upserted,
      matchesErrored: upsertErrors,
      pending: pendingRows ?? [],
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
