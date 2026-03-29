/**
 * Fallback orchestrator — tries each tier in order until one succeeds.
 *
 * Tier 1: CricketData.org         (CRICKETDATA_API_KEY)
 * Tier 2: RapidAPI Cricbuzz       (RAPIDAPI_KEY)
 * Tier 3: AllThingsDev Cricbuzz   (ATD_API_KEY)
 */

import { fetchIPLMatchesFromCricketData } from "./cricketdata";
import { fetchIPLMatchesFromRapidAPI } from "./rapidapi";
import { fetchIPLMatchesFromATD } from "./atd";
import type { NormalizedMatch } from "./parser";

export type { NormalizedMatch, PlayerMatchStats } from "./parser";
export type WebscrapeProviderId = "cricketdata" | "rapidapi" | "atd";

export interface FetchResult {
  matches: NormalizedMatch[];
  source: WebscrapeProviderId;
  errors: Record<string, string>;
}

const PROVIDER_LABELS: Record<WebscrapeProviderId, string> = {
  cricketdata: "CricketData.org",
  rapidapi: "RapidAPI / Cricbuzz",
  atd: "AllThingsDev / Cricbuzz",
};

function isProviderConfigured(provider: WebscrapeProviderId): boolean {
  switch (provider) {
    case "cricketdata":
      return Boolean(process.env.CRICKETDATA_API_KEY);
    case "rapidapi":
      return Boolean(process.env.RAPIDAPI_KEY);
    case "atd":
      return Boolean(process.env.ATD_API_KEY);
  }
}

export function getProviderLabel(provider: WebscrapeProviderId): string {
  return PROVIDER_LABELS[provider];
}

export async function fetchIPLMatchesFromProvider(
  provider: WebscrapeProviderId,
  season: string,
  onProgress?: (done: number, total: number, source: string) => void,
): Promise<FetchResult> {
  if (!isProviderConfigured(provider)) {
    throw new Error(`${getProviderLabel(provider)} is not configured`);
  }

  switch (provider) {
    case "cricketdata": {
      const matches = await fetchIPLMatchesFromCricketData(season, (d, t) =>
        onProgress?.(d, t, getProviderLabel(provider)),
      );
      return { matches, source: provider, errors: {} };
    }
    case "rapidapi": {
      const matches = await fetchIPLMatchesFromRapidAPI(season, (d, t) =>
        onProgress?.(d, t, getProviderLabel(provider)),
      );
      return { matches, source: provider, errors: {} };
    }
    case "atd": {
      const matches = await fetchIPLMatchesFromATD(season, (d, t) =>
        onProgress?.(d, t, getProviderLabel(provider)),
      );
      return { matches, source: provider, errors: {} };
    }
  }
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

  // ── Tier 3: AllThingsDev Cricbuzz ─────────────────────────────────────────
  if (process.env.ATD_API_KEY) {
    try {
      const matches = await fetchIPLMatchesFromATD(season, (d, t) =>
        onProgress?.(d, t, "AllThingsDev"),
      );
      return { matches, source: "atd", errors };
    } catch (e) {
      errors["atd"] = String(e);
    }
  } else {
    errors["atd"] = "ATD_API_KEY not set";
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
      label: PROVIDER_LABELS.cricketdata,
      configured: isProviderConfigured("cricketdata"),
    },
    {
      id: "rapidapi",
      label: PROVIDER_LABELS.rapidapi,
      configured: isProviderConfigured("rapidapi"),
    },
    {
      id: "atd",
      label: PROVIDER_LABELS.atd,
      configured: isProviderConfigured("atd"),
    },
  ];
}
