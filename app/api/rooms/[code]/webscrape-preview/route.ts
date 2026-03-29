/**
 * POST /api/rooms/[code]/webscrape-preview
 *
 * Fetches IPL match scorecards from all configured API providers, stores the
 * raw per-match data in match_results (one row per match × source), and returns
 * a side-by-side comparison so the admin can choose which source to accept.
 *
 * No player.stats are modified here — this is a read + store preview only.
 */

import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { requireRoomAdmin } from "@/lib/server/room";
import {
  computeMatchPoints,
  type PlayerMatchStats,
} from "@/lib/server/webscrape/parser";
import {
  availableProviders,
  fetchIPLMatchesFromProvider,
  fetchIPLMatchesWithFallback,
  type WebscrapeProviderId,
} from "@/lib/server/webscrape/index";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function isProviderId(value: unknown): value is WebscrapeProviderId {
  return value === "cricketdata" || value === "rapidapi" || value === "atd";
}

function normalizePlayerStatsMap(
  raw: unknown,
): Record<string, PlayerMatchStats> {
  if (!raw || typeof raw !== "object") return {};

  if (Array.isArray(raw)) {
    const mapped: Record<string, PlayerMatchStats> = {};
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const maybeName = "name" in item ? item.name : undefined;
      if (typeof maybeName !== "string" || !maybeName.trim()) continue;
      mapped[maybeName.trim()] = item as PlayerMatchStats;
    }
    return mapped;
  }

  return raw as Record<string, PlayerMatchStats>;
}

function normalizeCalculatedPoints(
  rawCalculatedPoints: unknown,
  rawPlayerStats?: unknown,
): Record<string, number> {
  const normalized: Record<string, number> = {};
  if (rawCalculatedPoints && typeof rawCalculatedPoints === "object" && !Array.isArray(rawCalculatedPoints)) {
    for (const [name, value] of Object.entries(rawCalculatedPoints as Record<string, unknown>)) {
      if (!name || name === "[object Object]") continue;
      if (typeof value === "number" && Number.isFinite(value)) {
        normalized[name] = value;
        continue;
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) normalized[name] = parsed;
      }
    }
  }

  if (Object.keys(normalized).length > 0) {
    return normalized;
  }

  const statsMap = normalizePlayerStatsMap(rawPlayerStats);
  for (const [name, stats] of Object.entries(statsMap)) {
    if (!name.trim() || name === "[object Object]") continue;
    normalized[name] = computeMatchPoints(stats);
  }
  return normalized;
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

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const season = String(body.season ?? "2026");
    const requestedProvider = isProviderId(body.provider) ? body.provider : null;

    // Check at least one provider is configured
    const providers = availableProviders();
    if (!providers.some((p) => p.configured)) {
      return NextResponse.json({
        ok: false,
        error: "No cricket API keys configured.",
        detail: "Add CRICKETDATA_API_KEY or RAPIDAPI_KEY to your .env.local file.",
        providers,
      }, { status: 400 });
    }

    if (requestedProvider && !providers.some((provider) => provider.id === requestedProvider && provider.configured)) {
      return NextResponse.json({
        ok: false,
        error: "Selected provider is not configured.",
        providers,
      }, { status: 400 });
    }

    let fetchResult;
    try {
      fetchResult = requestedProvider
        ? await fetchIPLMatchesFromProvider(requestedProvider, season)
        : await fetchIPLMatchesWithFallback(season);
    } catch (error) {
      const providerErrors = requestedProvider
        ? { [requestedProvider]: error instanceof Error ? error.message : String(error) }
        : {};
      return NextResponse.json({
        ok: false,
        error: requestedProvider
          ? `Could not fetch matches from ${requestedProvider}.`
          : "Could not fetch matches from any configured provider.",
        errors: providerErrors,
        providers,
      }, { status: 400 });
    }

    const { matches, source, errors } = fetchResult;

    if (matches.length === 0) {
      return NextResponse.json({
        ok: false,
        error: `No completed IPL ${season} matches found.`,
        errors,   // shows per-provider error messages
        providers,
      }, { status: 404 });
    }

    // Get already-synced match IDs for this room to detect new vs existing
    const { data: existingRows } = await admin
      .from("match_results")
      .select("match_id, source, accepted")
      .eq("room_id", room.id)
      .eq("season", season);

    const existingByKey = new Map(
      (existingRows ?? []).map((r) => [`${String(r.match_id)}::${String(r.source)}`, r]),
    );

    // Upsert all fetched matches into match_results
    const upsertRows = matches.map((m) => {
      const calculatedPoints: Record<string, number> = {};
      for (const [playerName, stats] of Object.entries(m.playerStats)) {
        calculatedPoints[playerName] = computeMatchPoints(stats);
      }

      return {
        room_id: room.id,
        match_id: m.matchId,
        match_date: m.matchDate || null,
        season,
        teams: [m.homeTeam, m.awayTeam],
        source: m.source,
        source_label: m.sourceLabel,
        player_stats: m.playerStats as unknown as Record<string, unknown>,
        calculated_points: calculatedPoints as unknown as Record<string, unknown>,
        // Preserve acceptance status if already accepted
        accepted: existingByKey.get(`${m.matchId}::${m.source}`)?.accepted ?? false,
      };
    });

    // Batch upsert (match_id + source + room_id is unique)
    for (const row of upsertRows) {
      await admin
        .from("match_results")
        .upsert(row, { onConflict: "room_id,match_id,source" });
    }

    // Build comparison response: group by matchId, show data from each source
    const byMatchId = new Map<string, typeof upsertRows[number][]>();
    for (const row of upsertRows) {
      const existing = byMatchId.get(row.match_id) ?? [];
      existing.push(row);
      byMatchId.set(row.match_id, existing);
    }

    // Also fetch any previously stored rows for this season (other sources)
    const { data: allRows } = await admin
      .from("match_results")
      .select("match_id, match_date, teams, source, source_label, calculated_points, player_stats, accepted")
      .eq("room_id", room.id)
      .eq("season", season)
      .order("match_date", { ascending: true });

    // Group all stored rows by matchId for the comparison table
    const comparisonByMatch = new Map<
      string,
      {
        matchId: string;
        matchDate: string;
        teams: string[];
        sources: Record<
          string,
          { sourceLabel: string; calculatedPoints: Record<string, number>; accepted: boolean }
        >;
      }
    >();

    for (const row of allRows ?? []) {
      const matchId = String(row.match_id);
      if (!comparisonByMatch.has(matchId)) {
        comparisonByMatch.set(matchId, {
          matchId,
          matchDate: String(row.match_date ?? ""),
          teams: (row.teams as string[]) ?? [],
          sources: {},
        });
      }
      const entry = comparisonByMatch.get(matchId)!;
      entry.sources[String(row.source)] = {
        sourceLabel: String(row.source_label ?? row.source),
        calculatedPoints: normalizeCalculatedPoints(row.calculated_points, row.player_stats),
        accepted: Boolean(row.accepted),
      };
    }

    return NextResponse.json({
      ok: true,
      season,
      source,
      selectedProvider: requestedProvider ?? source,
      errors,
      providers,
      matchesFetched: matches.length,
      comparison: Array.from(comparisonByMatch.values()),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET: return stored comparison data without fetching again
export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const authUser = await requireApiUser();
    const { room } = await requireRoomAdmin(code, authUser.id);
    const admin = getSupabaseAdminClient();

    const url = new URL(_request.url);
    const season = url.searchParams.get("season") ?? "2026";

    const { data: rows } = await admin
      .from("match_results")
      .select("match_id, match_date, teams, source, source_label, calculated_points, player_stats, accepted")
      .eq("room_id", room.id)
      .eq("season", season)
      .order("match_date", { ascending: true });

    const comparisonByMatch = new Map<string, {
      matchId: string;
      matchDate: string;
      teams: string[];
      sources: Record<string, { sourceLabel: string; calculatedPoints: Record<string, number>; accepted: boolean }>;
    }>();

    for (const row of rows ?? []) {
      const matchId = String(row.match_id);
      if (!comparisonByMatch.has(matchId)) {
        comparisonByMatch.set(matchId, {
          matchId,
          matchDate: String(row.match_date ?? ""),
          teams: (row.teams as string[]) ?? [],
          sources: {},
        });
      }
      const entry = comparisonByMatch.get(matchId)!;
      entry.sources[String(row.source)] = {
        sourceLabel: String(row.source_label ?? row.source),
        calculatedPoints: normalizeCalculatedPoints(row.calculated_points, row.player_stats),
        accepted: Boolean(row.accepted),
      };
    }

    return NextResponse.json({
      ok: true,
      season,
      providers: availableProviders(),
      comparison: Array.from(comparisonByMatch.values()),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
