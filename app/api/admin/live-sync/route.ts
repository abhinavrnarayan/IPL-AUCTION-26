/**
 * POST /api/admin/live-sync
 *
 * Global admin only. Fetches live IPL scorecards from RapidAPI Cricbuzz
 * and upserts results into global_match_results.
 * Does NOT push to rooms — admin reviews and accepts via /api/admin/accept-match.
 *
 * GET /api/admin/live-sync  — returns stored global comparison without fetching.
 */

import { NextResponse } from "next/server";

import { handleRouteError } from "@/lib/server/api";
import { requireSuperAdmin } from "@/lib/server/auth";
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
  return value === "rapidapi";
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

  // Fall back to re-computing from player_stats
  if (rawStats && typeof rawStats === "object" && !Array.isArray(rawStats)) {
    for (const [name, stats] of Object.entries(rawStats as Record<string, PlayerMatchStats>)) {
      if (!name.trim() || name === "[object Object]") continue;
      out[name] = computeMatchPoints(stats);
    }
  }
  return out;
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin();
    const admin = getSupabaseAdminClient();

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const season = String(body.season ?? "2026");
    const requestedProvider = isProviderId(body.provider) ? body.provider : null;

    const providers = availableProviders();
    if (!providers.some((p) => p.configured)) {
      return NextResponse.json({
        ok: false,
        error: "No cricket API keys configured.",
        detail: "Add RAPIDAPI_KEY to your environment.",
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
    } catch (error) {
      return NextResponse.json({
        ok: false,
        error: requestedProvider
          ? `Could not fetch from ${getProviderLabel(requestedProvider)}.`
          : "Could not fetch from any configured provider.",
        errors: requestedProvider
          ? { [requestedProvider]: error instanceof Error ? error.message : String(error) }
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

    // Treat an accepted match as fully resolved, regardless of source.
    const { data: existingRows } = await admin
      .from("global_match_results")
      .select("match_id, accepted")
      .eq("season", season);

    const acceptedMatchIds = new Set(
      (existingRows ?? []).filter((r) => r.accepted).map((r) => String(r.match_id)),
    );

    if (acceptedMatchIds.size > 0) {
      await admin
        .from("global_match_results")
        .delete()
        .eq("season", season)
        .eq("accepted", false)
        .in("match_id", Array.from(acceptedMatchIds));
    }

    const newMatches = matches.filter((m) => !acceptedMatchIds.has(m.matchId));
    const skippedAccepted = matches.length - newMatches.length;

    for (const m of newMatches) {
      const calculatedPoints: Record<string, number> = {};
      for (const [playerName, stats] of Object.entries(m.playerStats)) {
        calculatedPoints[playerName] = computeMatchPoints(stats);
      }

      await admin.from("global_match_results").upsert(
        {
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
        { onConflict: "match_id,source" },
      );
    }

    // Return the full global comparison for the season so admin can review
    const { data: allRows } = await admin
      .from("global_match_results")
      .select("match_id, match_date, teams, source, source_label, calculated_points, player_stats, accepted, pushed_at")
      .eq("season", season)
      .order("match_date", { ascending: true });

    const comparisonByMatch = new Map<string, {
      matchId: string; matchDate: string; teams: string[];
      sources: Record<string, { sourceLabel: string; calculatedPoints: Record<string, number>; accepted: boolean; pushedAt: string | null }>;
    }>();

    for (const row of allRows ?? []) {
      const matchId = String(row.match_id);
      if (!comparisonByMatch.has(matchId)) {
        comparisonByMatch.set(matchId, { matchId, matchDate: String(row.match_date ?? ""), teams: (row.teams as string[]) ?? [], sources: {} });
      }
      const entry = comparisonByMatch.get(matchId)!;
      entry.sources[String(row.source)] = {
        sourceLabel: String(row.source_label ?? row.source),
        calculatedPoints: normalizeCalculatedPoints(row.calculated_points, row.player_stats),
        accepted: Boolean(row.accepted),
        pushedAt: row.pushed_at ? String(row.pushed_at) : null,
      };
    }

    return NextResponse.json({
      ok: true,
      season,
      source,
      selectedProvider: requestedProvider ?? source,
      errors,
      providers,
      matchesFetched: newMatches.length,
      matchesAlreadyAccepted: skippedAccepted,
      comparison: Array.from(comparisonByMatch.values()),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: Request) {
  try {
    await requireSuperAdmin();
    const admin = getSupabaseAdminClient();

    const url = new URL(request.url);
    const season = url.searchParams.get("season") ?? "2026";

    const { data: rows } = await admin
      .from("global_match_results")
      .select("match_id, match_date, teams, source, source_label, calculated_points, player_stats, accepted, pushed_at")
      .eq("season", season)
      .order("match_date", { ascending: true });

    const comparisonByMatch = new Map<string, {
      matchId: string; matchDate: string; teams: string[];
      sources: Record<string, { sourceLabel: string; calculatedPoints: Record<string, number>; accepted: boolean; pushedAt: string | null }>;
    }>();

    for (const row of rows ?? []) {
      const matchId = String(row.match_id);
      if (!comparisonByMatch.has(matchId)) {
        comparisonByMatch.set(matchId, { matchId, matchDate: String(row.match_date ?? ""), teams: (row.teams as string[]) ?? [], sources: {} });
      }
      const entry = comparisonByMatch.get(matchId)!;
      entry.sources[String(row.source)] = {
        sourceLabel: String(row.source_label ?? row.source),
        calculatedPoints: normalizeCalculatedPoints(row.calculated_points, row.player_stats),
        accepted: Boolean(row.accepted),
        pushedAt: row.pushed_at ? String(row.pushed_at) : null,
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
