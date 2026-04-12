/**
 * GET  /api/rooms/[code]/webscrape-preview?season=X
 *   Returns stored match_results for this room (any source) plus the
 *   list of configured API providers — no live fetch.
 *
 * POST /api/rooms/[code]/webscrape-preview
 *   Body: { season: string, provider?: string }
 *   Fetches live IPL scorecards from the requested provider and upserts
 *   them into this room's match_results (accepted=false). Returns the
 *   updated comparison plus provider list so the UI can show source cards.
 */

import { NextResponse } from "next/server";

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { requireRoomAdmin } from "@/lib/server/room";
import {
  availableProviders,
  fetchIPLMatchesFromProvider,
  fetchIPLMatchesWithFallback,
  getProviderLabel,
  type WebscrapeProviderId,
} from "@/lib/server/webscrape/index";
import {
  computeMatchPoints,
  type PlayerMatchStats,
} from "@/lib/server/webscrape/parser";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function isProviderId(value: unknown): value is WebscrapeProviderId {
  return value === "cricketdata" || value === "rapidapi" || value === "atd";
}

function normalizeCalculatedPoints(
  rawCalc: unknown,
  rawStats?: unknown,
): Record<string, number> {
  const out: Record<string, number> = {};

  if (rawCalc && typeof rawCalc === "object" && !Array.isArray(rawCalc)) {
    for (const [name, value] of Object.entries(rawCalc as Record<string, unknown>)) {
      if (!name || name === "[object Object]") continue;
      if (typeof value === "number" && Number.isFinite(value)) { out[name] = value; continue; }
      if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) out[name] = parsed;
      }
    }
  }

  if (Object.keys(out).length > 0) return out;

  if (rawStats && typeof rawStats === "object" && !Array.isArray(rawStats)) {
    for (const [name, stats] of Object.entries(rawStats as Record<string, PlayerMatchStats>)) {
      if (!name.trim() || name === "[object Object]") continue;
      out[name] = computeMatchPoints(stats);
    }
  }
  return out;
}

type ComparisonMap = Map<string, {
  matchId: string; matchDate: string; teams: string[];
  sources: Record<string, { sourceLabel: string; calculatedPoints: Record<string, number>; accepted: boolean; pushedAt: string | null }>;
}>;

function buildComparison(rows: Array<Record<string, unknown>>): ComparisonMap {
  const map: ComparisonMap = new Map();
  for (const row of rows) {
    const matchId = String(row.match_id);
    if (!map.has(matchId)) {
      map.set(matchId, { matchId, matchDate: String(row.match_date ?? ""), teams: (row.teams as string[]) ?? [], sources: {} });
    }
    const entry = map.get(matchId)!;
    entry.sources[String(row.source)] = {
      sourceLabel: String(row.source_label ?? row.source),
      calculatedPoints: normalizeCalculatedPoints(row.calculated_points, row.player_stats),
      accepted: Boolean(row.accepted),
      pushedAt: row.accepted_at ? String(row.accepted_at) : null,
    };
  }

  // Merge entries that represent the same physical match but have different provider matchIds.
  // Cricsheet stores teams=[] while webscrape providers store the real team names.
  // Strategy: for each date, merge teamless entries (cricsheet) into the entry that has team names.
  const byDate = new Map<string, string[]>();
  for (const [matchId, entry] of map) {
    if (!entry.matchDate) continue;
    if (!byDate.has(entry.matchDate)) byDate.set(entry.matchDate, []);
    byDate.get(entry.matchDate)!.push(matchId);
  }

  for (const matchIds of byDate.values()) {
    if (matchIds.length < 2) continue;
    const withTeams    = matchIds.filter((id) => (map.get(id)!.teams ?? []).length > 0);
    const withoutTeams = matchIds.filter((id) => (map.get(id)!.teams ?? []).length === 0);
    if (withTeams.length === 0 || withoutTeams.length === 0) continue;

    // Use the first entry with real team names as the canonical card
    const canonical = map.get(withTeams[0]!)!;
    for (const fromId of withoutTeams) {
      const from = map.get(fromId)!;
      for (const [src, data] of Object.entries(from.sources)) {
        if (!canonical.sources[src]) canonical.sources[src] = data;
      }
      map.delete(fromId);
    }
  }

  return map;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);

    if (!room.isSuperRoom) {
      throw new AppError("Live score sync is only available in the super room.", 403, "SUPER_ROOM_ONLY");
    }

    const admin = getSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const season = searchParams.get("season") ?? "2026";

    const { data: rows } = await admin
      .from("match_results")
      .select("match_id, match_date, teams, source, source_label, calculated_points, player_stats, accepted, accepted_at")
      .eq("room_id", room.id)
      .eq("season", season)
      .order("match_date", { ascending: true });

    const comparison = Array.from(buildComparison((rows ?? []) as Array<Record<string, unknown>>).values());

    return NextResponse.json({
      ok: true,
      season,
      providers: availableProviders(),
      comparison,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);

    if (!room.isSuperRoom) {
      throw new AppError("Live score sync is only available in the super room.", 403, "SUPER_ROOM_ONLY");
    }

    const admin = getSupabaseAdminClient();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const season = String(body.season ?? "2026");
    const requestedProvider = isProviderId(body.provider) ? body.provider : null;

    const providers = availableProviders();
    if (!providers.some((p) => p.configured)) {
      return NextResponse.json({
        ok: false,
        error: "No cricket API keys configured.",
        detail: "Add CRICKETDATA_API_KEY or RAPIDAPI_KEY to your environment.",
        providers,
      }, { status: 400 });
    }

    if (requestedProvider && !providers.some((p) => p.id === requestedProvider && p.configured)) {
      return NextResponse.json({ ok: false, error: "Selected provider is not configured.", providers }, { status: 400 });
    }

    let fetchResult;
    try {
      fetchResult = requestedProvider
        ? await fetchIPLMatchesFromProvider(requestedProvider, season)
        : await fetchIPLMatchesWithFallback(season);
    } catch (err) {
      return NextResponse.json({
        ok: false,
        error: requestedProvider
          ? `Could not fetch from ${getProviderLabel(requestedProvider)}.`
          : "Could not fetch from any configured provider.",
        errors: requestedProvider
          ? { [requestedProvider]: err instanceof Error ? err.message : String(err) }
          : {},
        providers,
      }, { status: 400 });
    }

    const { matches, source, errors } = fetchResult;
    if (matches.length === 0) {
      return NextResponse.json({
        ok: false,
        error: `No completed IPL ${season} matches found.`,
        errors,
        providers,
      }, { status: 404 });
    }

    // Skip matches already accepted in this room
    const { data: existingRows } = await admin
      .from("match_results")
      .select("match_id, source, accepted")
      .eq("room_id", room.id)
      .eq("season", season);

    const acceptedKeys = new Set(
      (existingRows ?? []).filter((r) => r.accepted).map((r) => `${String(r.match_id)}::${String(r.source)}`),
    );

    const newMatches = matches.filter((m) => !acceptedKeys.has(`${m.matchId}::${m.source}`));
    const skippedAccepted = matches.length - newMatches.length;

    for (const m of newMatches) {
      const calculatedPoints: Record<string, number> = {};
      for (const [playerName, stats] of Object.entries(m.playerStats)) {
        calculatedPoints[playerName] = computeMatchPoints(stats);
      }

      await admin.from("match_results").upsert(
        {
          room_id: room.id,
          match_id: m.matchId,
          match_date: m.matchDate || null,
          season,
          teams: [m.homeTeam, m.awayTeam],
          source: m.source,
          source_label: m.sourceLabel,
          player_stats: m.playerStats as unknown as Record<string, unknown>,
          calculated_points: calculatedPoints as unknown as Record<string, unknown>,
          accepted: false,
        },
        { onConflict: "room_id,match_id,source" },
      );
    }

    const { data: allRows } = await admin
      .from("match_results")
      .select("match_id, match_date, teams, source, source_label, calculated_points, player_stats, accepted, accepted_at")
      .eq("room_id", room.id)
      .eq("season", season)
      .order("match_date", { ascending: true });

    const comparison = Array.from(buildComparison((allRows ?? []) as Array<Record<string, unknown>>).values());

    return NextResponse.json({
      ok: true,
      season,
      source,
      selectedProvider: requestedProvider ?? source,
      errors,
      providers,
      matchesFetched: newMatches.length,
      matchesAlreadyAccepted: skippedAccepted,
      comparison,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
