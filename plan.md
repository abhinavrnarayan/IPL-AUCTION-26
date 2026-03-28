# Web-Scrape Score Sync — Implementation Plan

> **Context:** The platform already has Cricsheet (ball-by-ball ZIP) as sync option 1.
> This document plans a second sync mode that pulls data from live cricket APIs /
> scraping, with a three-tier fallback chain so scoring continues even when a
> provider is down or rate-limited.

---

## 1. Architecture Overview

```
Admin triggers sync
        │
        ▼
┌───────────────────────────────────────────────────────┐
│  POST /api/rooms/[code]/webscrape-sync                │
│                                                       │
│  1. Try PRIMARY source  (CricketData.org)             │
│         │ fail / rate-limited                        │
│  2. Try SECONDARY source (RapidAPI Cricket)           │
│         │ fail / quota exceeded                      │
│  3. Try TERTIARY source  (CricAPI)                    │
│         │ fail                                       │
│  4. Return error with last-known-good cache           │
└───────────────────────────────────────────────────────┘
        │
        ▼
  Match player names (same normalised-name logic as Cricsheet sync)
        │
        ▼
  Calculate fantasy points per-match, accumulate across season
        │
        ▼
  Update players.stats in DB  →  revalidate results page
```

---

## 2. Data Source Profiles

### 2A. CricketData.org — PRIMARY ✅ Recommended

| Property       | Value |
|----------------|-------|
| Base URL       | `https://api.cricketdata.org/` |
| Auth           | `?apikey=YOUR_KEY` (query param) |
| Free tier      | 100 req / day |
| Paid tier      | From $10/mo for 10 000 req/day |
| Data type      | Per-match scorecards (JSON) |
| IPL coverage   | Yes — series + match IDs available |
| Env var        | `CRICKETDATA_API_KEY` |

**Key endpoints used:**

```
# 1. Find the IPL series for a given season
GET /series?apikey={key}&offset=0
→ Filter by name containing "Indian Premier League" and season year

# 2. List matches in that series
GET /series_info?apikey={key}&id={series_id}
→ Returns matchList[] with match IDs

# 3. Fetch each match scorecard
GET /match_scorecard?apikey={key}&id={match_id}
→ Returns batting rows + bowling rows per inning

# 4. (Optional) Fetch player batting / bowling career stats
GET /players_info?apikey={key}&id={player_id}
```

**Sample scorecard response shape:**
```json
{
  "data": {
    "scorecard": [
      {
        "inning": "Royal Challengers Bengaluru Inning 1",
        "batting": [
          {
            "batsman": "Virat Kohli",
            "r": 82,
            "b": 54,
            "4s": 8,
            "6s": 3,
            "sr": "151.85",
            "outDesc": "c Marsh b Bumrah",
            "dismissal-wicket": "Caught"
          }
        ],
        "bowling": [
          {
            "bowler": "Jasprit Bumrah",
            "o": "4",
            "m": "1",
            "r": "22",
            "w": "2",
            "eco": "5.50",
            "wd": "0",
            "nb": "0"
          }
        ]
      }
    ]
  }
}
```

**What we get vs what's missing:**

| Stat | Available? | Notes |
|------|-----------|-------|
| Runs, balls, 4s, 6s | ✅ | Direct fields |
| Dismissed? (duck detect) | ✅ | Check outDesc ≠ "not out" && r === 0 |
| Wickets, overs, maidens, economy | ✅ | Direct bowling fields |
| LBW / Bowled distinction | ✅ | outDesc contains "Lbw" / "Bowled" |
| Catches by fielder | ⚠️ Partial | Parse `outDesc` "c {fielder} b {bowler}" |
| Stumpings | ⚠️ Partial | Parse "st {keeper} b {bowler}" |
| Run outs | ⚠️ Partial | Parse "run out ({fielder})" |
| Dot balls per bowler | ❌ | Not in scorecard summary |
| Maiden overs | ✅ | `m` field |

**Limitation:** No dot-ball count. Dot ball points (+1 each) will be 0 for
this sync mode. All other scoring categories are computable.

---

### 2B. RapidAPI Cricket — SECONDARY

Multiple providers available on RapidAPI. Recommended:
**"Cricket Live Score API"** or **"Cricbuzz Cricket Score"** on RapidAPI.

| Property       | Value |
|----------------|-------|
| Base URL       | Varies per provider (see below) |
| Auth           | `X-RapidAPI-Key` header + `X-RapidAPI-Host` |
| Free tier      | Typically 100–500 req/month |
| Paid tier      | $0–$25/mo depending on provider |
| Env var        | `RAPIDAPI_KEY` |

**Recommended provider: `cricbuzz-cricket.p.rapidapi.com`**
```
# Series list
GET https://cricbuzz-cricket.p.rapidapi.com/series/v1/domestic

# Matches in a series
GET https://cricbuzz-cricket.p.rapidapi.com/series/v1/{series_id}

# Match scorecard
GET https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/{match_id}/scard

# Player stats
GET https://cricbuzz-cricket.p.rapidapi.com/stats/v1/player/{player_id}/batting
```

**Fallback trigger:** Use this source when CricketData.org returns HTTP 429
(rate-limited) or 5xx errors.

---

### 2C. CricAPI — TERTIARY

| Property       | Value |
|----------------|-------|
| Base URL       | `https://api.cricapi.com/v1/` |
| Auth           | `?apikey=YOUR_KEY` |
| Free tier      | 100 req / day |
| Env var        | `CRICAPI_KEY` |

**Key endpoints:**
```
# Current / recent matches
GET /currentMatches?apikey={key}&offset=0

# Match scorecard
GET /match_scorecard?apikey={key}&id={match_id}

# Series list
GET /series?apikey={key}&offset=0

# Series matches
GET /series_info?apikey={key}&id={series_id}
```

The CricAPI response shape is nearly identical to CricketData.org (same
underlying data). Use this as a last resort before returning an error.

---

### 2D. Google / Cricbuzz Direct Scrape — NOT RECOMMENDED ❌

- Google Knowledge Panel changes layout frequently → brittle
- Cricbuzz uses Cloudflare bot protection + JavaScript rendering
- Would require a headless browser (Playwright/Puppeteer) adding ~200 MB to
  the deployment
- Terms of service risk for commercial use

**Decision:** Skip this option. The three API sources above are sufficient.

---

## 3. Per-Match vs Season-Aggregate

A critical difference from the Cricsheet sync:

| | Cricsheet | Web API Sync |
|---|---|---|
| Data granularity | Ball-by-ball | Per-match scorecard |
| Run milestones (25/50/75/100) | ✅ Per-innings | ✅ Per-match (r field per batting row) |
| Wicket milestones (3W/4W/5W) | ✅ Per-match | ✅ Per-match (w field per bowling row) |
| Strike rate bonus | ✅ Per-match | ✅ Per-match (sr field) |
| Economy rate bonus | ✅ Per-match | ✅ Per-match (eco field) |
| 3-catch bonus | ✅ Per-match | ⚠️ Needs parsing outDesc across an inning |
| Dot ball points | ✅ Ball-by-ball | ❌ Not available |

**Conclusion:** Web API sync gives ~95% accuracy. Only dot balls (+1 each) are
missing — typically 10–40 points per bowler for a season, so totals will be
slightly lower than Cricsheet-synced scores.

Document this in the UI: _"Web sync excludes dot ball points. Use Cricsheet sync
for full accuracy."_

---

## 4. New Files to Create

```
lib/server/webscrape/
  ├── cricketdata.ts    # CricketData.org client
  ├── rapidapi.ts       # RapidAPI Cricket client
  ├── cricapi.ts        # CricAPI client
  ├── parser.ts         # Shared scorecard → PlayerStats converter
  └── index.ts          # Fallback orchestrator

app/api/rooms/[code]/webscrape-sync/
  └── route.ts          # POST endpoint

components/room/
  └── webscrape-sync-button.tsx  # UI component (similar to cricsheet-sync-button)
```

---

## 5. `lib/server/webscrape/parser.ts` — Shared Parsing Logic

All three providers return scorecards in similar shapes. A single parser will:

```typescript
// Batting row → stats
function parseBattingRow(row: BattingRow): MatchBattingStats {
  const isDismissed = !row.outDesc?.toLowerCase().includes("not out");
  const isDuck = isDismissed && Number(row.r) === 0;

  // Compute SR-based bonus
  const sr = parseFloat(row.sr ?? "0");
  let srPts = 0;
  const balls = Number(row.b);
  if (balls >= 10) {
    if (sr > 170) srPts = 6;
    else if (sr > 150) srPts = 4;
    else if (sr >= 130) srPts = 2;
    else if (sr >= 60 && sr <= 70) srPts = -2;
    else if (sr >= 50 && sr < 60) srPts = -4;
    else if (sr < 50) srPts = -6;
  }

  // Run milestone bonuses
  const runs = Number(row.r);
  let milestonePts = 0;
  if (runs >= 25) milestonePts += 4;
  if (runs >= 50) milestonePts += 8;
  if (runs >= 75) milestonePts += 12;
  if (runs >= 100) milestonePts += 16;

  return { runs, balls, fours: Number(row["4s"]), sixes: Number(row["6s"]),
           duck: isDuck ? 1 : 0, srPts, milestonePts, outDesc: row.outDesc ?? "" };
}

// Bowling row → stats
function parseBowlingRow(row: BowlingRow): MatchBowlingStats {
  const balls = Math.round(parseFloat(row.o ?? "0") * 6); // "4.2" → 26 balls
  const wickets = Number(row.w);
  const runs = Number(row.r);
  const maidens = Number(row.m ?? "0");

  // Wicket milestones
  let milestonePts = 0;
  if (wickets >= 3) milestonePts += 4;
  if (wickets >= 4) milestonePts += 8;
  if (wickets >= 5) milestonePts += 12;

  // Economy bonus (min 2 overs = 12 balls)
  let econPts = 0;
  if (balls >= 12) {
    const eco = runs / (balls / 6);
    if (eco < 5) econPts = 6;
    else if (eco <= 5.99) econPts = 4;
    else if (eco <= 7) econPts = 2;
    else if (eco >= 10 && eco <= 11) econPts = -2;
    else if (eco > 11 && eco <= 12) econPts = -4;
    else if (eco > 12) econPts = -6;
  }

  return { balls, wickets, runs, maidens, milestonePts, econPts };
}

// Parse outDesc strings to award fielding credits
// "c Rohit Sharma b Bumrah"  → catch for Rohit Sharma
// "st †MS Dhoni b Chahal"    → stumping for MS Dhoni
// "run out (Kohli)"          → run out (indirect) for Kohli
function parseOutDescForFielding(outDesc: string): FieldingCredit | null {
  const caught = outDesc.match(/^c\s+(†?)([\w\s]+?)\s+b\s+/i);
  if (caught) return { fielder: caught[2].trim(), kind: "catch" };

  const stumped = outDesc.match(/^st\s+(†?)([\w\s]+?)\s+b\s+/i);
  if (stumped) return { fielder: stumped[2].trim(), kind: "stumping" };

  const runOut = outDesc.match(/^run out\s*\(([^)]+)\)/i);
  if (runOut) return { fielder: runOut[1].trim(), kind: "run_out_indirect" };

  return null;
}
```

---

## 6. Fallback Orchestrator `lib/server/webscrape/index.ts`

```typescript
export async function fetchIPLMatchScorecardsWithFallback(
  season: string,
  matchIds?: string[],  // if known; otherwise discover from series
): Promise<MatchScorecard[]> {
  const errors: string[] = [];

  // Tier 1: CricketData.org
  if (process.env.CRICKETDATA_API_KEY) {
    try {
      return await fetchFromCricketData(season, matchIds);
    } catch (e) {
      errors.push(`CricketData: ${e}`);
    }
  }

  // Tier 2: RapidAPI
  if (process.env.RAPIDAPI_KEY) {
    try {
      return await fetchFromRapidAPI(season, matchIds);
    } catch (e) {
      errors.push(`RapidAPI: ${e}`);
    }
  }

  // Tier 3: CricAPI
  if (process.env.CRICAPI_KEY) {
    try {
      return await fetchFromCricAPI(season, matchIds);
    } catch (e) {
      errors.push(`CricAPI: ${e}`);
    }
  }

  throw new Error(`All providers failed:\n${errors.join("\n")}`);
}
```

---

## 7. Environment Variables Required

Add to `.env.local` and `.env.example`:

```bash
# Web scrape sync — at least one required for webscrape-sync to work
CRICKETDATA_API_KEY=       # cricketdata.org — free 100 req/day
RAPIDAPI_KEY=              # rapidapi.com — used for Cricbuzz Cricket provider
CRICAPI_KEY=               # cricapi.com — free 100 req/day
```

The API route will check which keys are set and only attempt those tiers.

---

## 8. API Endpoint `POST /api/rooms/[code]/webscrape-sync`

**Request:**
```json
{ "season": "2026" }
```

**Response (success):**
```json
{
  "ok": true,
  "season": "2026",
  "source": "cricketdata",          // which provider succeeded
  "matchesProcessed": 14,
  "playersMatched": 186,
  "playersUnmatched": 4,
  "unmatchedNames": ["MS Dhoni", "..."],
  "dotBallsMissing": true           // warn UI that dot balls not included
}
```

**Response (all providers failed):**
```json
{
  "ok": false,
  "error": "All providers failed: ...",
  "providerErrors": { ... }
}
```

---

## 9. UI Component `components/room/webscrape-sync-button.tsx`

Same structure as `cricsheet-sync-button.tsx` but:
- Shows provider status (which API keys are configured)
- Displays a banner: _"Dot ball points not included. Use Cricsheet sync for full accuracy."_
- Shows which fallback tier was used in the result

Room page will render **both** sync options side by side:
```
┌─────────────────────────┐  ┌─────────────────────────────┐
│  Cricsheet Sync          │  │  Live Web Sync               │
│  Full accuracy           │  │  ~95% accuracy, no ZIP needed│
│  [Sync Cricsheet data]   │  │  [Sync live data]            │
└─────────────────────────┘  └─────────────────────────────┘
```

---

## 10. Rate Limit Management

| Provider | Free Quota | Strategy |
|----------|-----------|----------|
| CricketData.org | 100 req/day | 1 req per match + 2 for series lookup = ~16 req per full sync |
| RapidAPI | 100–500/month | Same pattern, secondary only |
| CricAPI | 100 req/day | Same pattern, tertiary only |

**14–16 matches in a phase** = 16–18 API calls per sync → well within free tier.
At full season (74 matches) = ~76 calls → still within daily free quota if synced once per day.

**Caching:** Store fetched match IDs + their parsed data in a `cricsheet_cache`
table (or in `players.stats.cached_matches`) so already-processed matches are
skipped on re-sync. This cuts API calls dramatically mid-season.

---

## 11. DB Change (Optional but Recommended)

Add a `synced_match_ids` field inside `players.stats` JSONB to track which
match IDs have already been counted, preventing double-counting on repeated
syncs:

```json
// players.stats
{
  "runs": 347,
  "wickets": 8,
  ...
  "_synced_match_ids": ["abc123", "def456", "..."]
}
```

On each sync, only process matches whose IDs are NOT already in `_synced_match_ids`.

---

## 12. Implementation Order

| Step | File | Effort |
|------|------|--------|
| 1 | `lib/server/webscrape/parser.ts` | Medium — shared parsing logic |
| 2 | `lib/server/webscrape/cricketdata.ts` | Small — HTTP + data mapping |
| 3 | `lib/server/webscrape/index.ts` | Small — fallback chain |
| 4 | `app/api/rooms/[code]/webscrape-sync/route.ts` | Small — thin wrapper |
| 5 | `components/room/webscrape-sync-button.tsx` | Small — clone of cricsheet button |
| 6 | Update `.env.example` | Trivial |
| 7 | Add RapidAPI client | Small (after testing tier 1) |
| 8 | Add CricAPI client | Small (after testing tier 2) |
| 9 | Add match-ID caching | Medium — prevents double-counting |

Build and test in order. Start with CricketData.org (tier 1) only, verify end-to-end,
then add the fallback tiers.

---

## 13. Comparison: Cricsheet vs Web Sync

| Feature | Cricsheet Sync | Web Sync |
|---------|---------------|----------|
| Dot ball points | ✅ | ❌ |
| All milestone bonuses | ✅ | ✅ |
| Strike rate | ✅ | ✅ |
| Economy rate | ✅ | ✅ |
| Fielding (catches/stumpings) | ✅ | ✅ (via outDesc) |
| Direct hit run out (+12) | ❌ (always indirect) | ❌ (always indirect) |
| Requires manual ZIP download | Required for upload mode | ❌ |
| Auto-fetch | ✅ | ✅ |
| API key needed | ❌ | ✅ (at least one) |
| Works for live/ongoing season | Limited (Cricsheet lags) | ✅ real-time |
| Rate limits | None | 100 req/day free |

**Recommended workflow:**
- During season → use **Web Sync** after each match day (real-time data)
- End of season → use **Cricsheet Sync** once for final accurate scores
