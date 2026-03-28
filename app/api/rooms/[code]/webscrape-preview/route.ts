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

import { AppError } from "@/lib/domain/errors";
import { handleRouteError } from "@/lib/server/api";
import { requireApiUser } from "@/lib/server/auth";
import { requireRoomAdmin } from "@/lib/server/room";
import { computeMatchPoints } from "@/lib/server/webscrape/parser";
import { fetchIPLMatchesWithFallback, availableProviders } from "@/lib/server/webscrape/index";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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

    // Fetch from available providers
    const { matches, source, errors } = await fetchIPLMatchesWithFallback(season);

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
      .select("match_id, match_date, teams, source, source_label, calculated_points, accepted")
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
        calculatedPoints: (row.calculated_points as Record<string, number>) ?? {},
        accepted: Boolean(row.accepted),
      };
    }

    return NextResponse.json({
      ok: true,
      season,
      source,
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
      .select("match_id, match_date, teams, source, source_label, calculated_points, accepted")
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
        calculatedPoints: (row.calculated_points as Record<string, number>) ?? {},
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
