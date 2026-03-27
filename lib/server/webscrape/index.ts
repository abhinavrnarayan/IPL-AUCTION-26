/**
 * Fallback orchestrator — tries each tier in order until one succeeds.
 *
 * Tier 1: CricketData.org  (CRICKETDATA_API_KEY)
 * Tier 2: RapidAPI Cricbuzz (RAPIDAPI_KEY)
 */

import { fetchIPLMatchesFromCricketData } from "./cricketdata";
import { fetchIPLMatchesFromRapidAPI } from "./rapidapi";
import type { NormalizedMatch } from "./parser";

export type { NormalizedMatch, PlayerMatchStats } from "./parser";

export interface FetchResult {
  matches: NormalizedMatch[];
  source: "cricketdata" | "rapidapi";
  errors: Record<string, string>; // source → error message
}

export async function fetchIPLMatchesWithFallback(
  season: string,
  onProgress?: (done: number, total: number, source: string) => void,
): Promise<FetchResult> {
  const errors: Record<string, string> = {};

  // ── Tier 1: CricketData.org ───────────────────────────────────────────────
  if (process.env.CRICKETDATA_API_KEY) {
    try {
      const matches = await fetchIPLMatchesFromCricketData(season, (d, t) =>
        onProgress?.(d, t, "CricketData.org"),
      );
      return { matches, source: "cricketdata", errors };
    } catch (e) {
      errors["cricketdata"] = String(e);
    }
  } else {
    errors["cricketdata"] = "CRICKETDATA_API_KEY not set";
  }

  // ── Tier 2: RapidAPI Cricbuzz ─────────────────────────────────────────────
  if (process.env.RAPIDAPI_KEY) {
    try {
      const matches = await fetchIPLMatchesFromRapidAPI(season, (d, t) =>
        onProgress?.(d, t, "RapidAPI"),
      );
      return { matches, source: "rapidapi", errors };
    } catch (e) {
      errors["rapidapi"] = String(e);
    }
  } else {
    errors["rapidapi"] = "RAPIDAPI_KEY not set";
  }

  throw new Error(
    `All cricket data providers failed:\n${Object.entries(errors)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n")}`,
  );
}

/** Which API keys are currently configured (for UI display). */
export function availableProviders(): Array<{ id: string; label: string; configured: boolean }> {
  return [
    {
      id: "cricketdata",
      label: "CricketData.org",
      configured: Boolean(process.env.CRICKETDATA_API_KEY),
    },
    {
      id: "rapidapi",
      label: "RapidAPI / Cricbuzz",
      configured: Boolean(process.env.RAPIDAPI_KEY),
    },
  ];
}
