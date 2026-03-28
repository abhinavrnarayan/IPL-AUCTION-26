# IPL Auction 26 — Session Changelog (2026-03-27)

## What Was Built

### 1. Cricsheet Integration (Ball-by-ball score engine)

| File | What it does |
|------|-------------|
| `lib/domain/scoring.ts` | **Full rewrite.** Implements every rule in `RULES.MD` — runs, boundary bonus, six bonus, 25/50/75/100-run milestones, SR brackets, duck penalty, wickets, LBW/bowled bonus, 3W/4W/5W tiers, dot balls, maidens, economy brackets, catches, stumpings, run-outs, lineup/sub appearances |
| `lib/server/cricsheet.ts` | Downloads the IPL Cricsheet ZIP, parses ball-by-ball JSON, computes **per-match** bonus points (milestones, SR, economy, 3-catch) — then stores them as pre-computed fields so season totals are never double-counted |
| `app/api/rooms/[code]/cricsheet-sync/route.ts` | `POST` endpoint. Accepts a `.zip` file upload **or** auto-fetches from cricsheet.org. Matches player names (normalised + surname fallback). Preserves `ipl_team` from Excel import. Returns matched/unmatched counts |
| `components/room/cricsheet-sync-button.tsx` | Admin UI: season input, toggle between **Auto-fetch** and **Upload ZIP**, shows results |

---

### 2. Live Web Sync — Multi-source Score Comparison

| File | What it does |
|------|-------------|
| `lib/server/webscrape/parser.ts` | Shared types + dismissal parser (detects bowled, lbw, catch, stumping, run-out) |
| `lib/server/webscrape/cricketdata.ts` | CricketData.org client — fetches IPL series → match list → scorecards |
| `lib/server/webscrape/rapidapi.ts` | RapidAPI Cricbuzz client — same interface |
| `lib/server/webscrape/index.ts` | Orchestrator: tries CricketData first, falls back to RapidAPI |
| `app/api/rooms/[code]/webscrape-preview/route.ts` | `POST` — fetches scores from all live sources, stores raw rows in `match_results` table, returns comparison data for admin review |
| `app/api/rooms/[code]/webscrape-accept/route.ts` | `POST` — admin marks one source as accepted per match; re-aggregates all accepted rows → updates `players.stats` |
| `components/room/webscrape-sync-panel.tsx` | Side-by-side comparison UI. Admin can: pick a source per match, override individual player points manually, accept and save |

---

### 3. Export / Import Everywhere

| File | What it does |
|------|-------------|
| `lib/utils/export.ts` | `exportToCSV`, `exportToExcel`, `exportToExcelMultiSheet` helpers (uses existing `xlsx` package) |
| `components/ui/export-button.tsx` | Compact icon-button with dropdown: **Export to CSV** / **Export to Excel** |
| `components/ui/import-button.tsx` | Compact icon-button that opens a hidden file input, calls your handler with the parsed file |
| `components/results/results-export-bar.tsx` | Adds Export dropdown above the leaderboard (leaderboard + player stats sheets) |

---

### 4. Database Migration

| File | What it does |
|------|-------------|
| `supabase/match-results.sql` | Creates the `match_results` table used by the web sync feature |

---

## One-Time Setup Steps

### Step 1 — Run the SQL migration in Supabase

1. Open your [Supabase Dashboard](https://app.supabase.com)
2. Go to **SQL Editor**
3. Paste and run the contents of `supabase/match-results.sql`

### Step 2 — Add API keys to your `.env.local`

Copy from `.env.example` and fill in:

```env
CRICKETDATA_API_KEY=your_key_from_cricketdata_org
RAPIDAPI_KEY=your_key_from_rapidapi_com
RAPIDAPI_CRICBUZZ_HOST=cricbuzz-cricket.p.rapidapi.com
```

- **CricketData.org** — sign up free at https://cricketdata.org (500 req/day free)
- **RapidAPI Cricbuzz** — subscribe at https://rapidapi.com/cricketapilive/api/cricbuzz-cricket (free tier available)

### Step 3 — Install the new dependency

```bash
cd IPL-AUCTION-26
npm install adm-zip @types/adm-zip
```

*(Already done if you ran this session — just a reminder for fresh clones)*

---

## How to Run

```bash
npm run dev
```

App starts at `http://localhost:10000`

---

## Where to See Each Feature

### Cricsheet Sync
**Room Page → Admin section → "Sync Cricsheet Data"**

1. Enter season (e.g. `2026`)
2. Click **Auto-fetch from Cricsheet** — or upload the `ipl_json.zip` you downloaded from [cricsheet.org/downloads](https://cricsheet.org/downloads/)
3. Results show matched/unmatched player counts
4. Scores immediately appear in the Results board

### Live Web Sync (Multi-source Comparison)
**Room Page → Admin section → "Live Web Sync"**

1. Enter season, click **Fetch from Live Sources**
2. A comparison table appears — one row per match, columns for each API source
3. Click **Accept** next to the score set you trust
4. Optionally override individual player points manually
5. Click **Save Selected** to write to the database

### Results Leaderboard + Export
**Results Page** (`/results/[code]`)

- Export dropdown appears top-right of the leaderboard
- Options: **Export to CSV** or **Export to Excel** (two sheets: Leaderboard + Player Scores)

### Manual Score Correction via Import
Use `ImportButton` on any page that supports it — upload a corrected CSV/Excel and the handler updates that entity.

---

## Scoring Rules Summary (RULES.MD → scoring.ts)

| Category | Key Points |
|----------|-----------|
| Batting | Runs ×1 + Boundary bonus +4 + Six bonus +6; milestones +4/+8/+12/+16 at 25/50/75/100; SR bonus ±6 (min 10 balls); Duck −2 (non-bowlers) |
| Bowling | Wicket +30; LBW/Bowled +8 each; 3W/4W/5W tier bonuses; Dot +1; Maiden +12; Economy ±6 (min 2 overs) |
| Fielding | Catch +8, 3-catch bonus +4; Stumping +12; Run-out direct +12 / indirect +6 |
| Appearance | Announced XI or Sub: +4 per match |

---

## Files Changed Summary

```
NEW   supabase/match-results.sql
NEW   lib/domain/scoring.ts              (full rewrite)
NEW   lib/server/cricsheet.ts
NEW   lib/server/webscrape/parser.ts
NEW   lib/server/webscrape/cricketdata.ts
NEW   lib/server/webscrape/rapidapi.ts
NEW   lib/server/webscrape/index.ts
NEW   lib/utils/export.ts
NEW   app/api/rooms/[code]/cricsheet-sync/route.ts
NEW   app/api/rooms/[code]/webscrape-preview/route.ts
NEW   app/api/rooms/[code]/webscrape-accept/route.ts
NEW   components/room/cricsheet-sync-button.tsx
NEW   components/room/webscrape-sync-panel.tsx
NEW   components/results/results-export-bar.tsx
NEW   components/ui/export-button.tsx
NEW   components/ui/import-button.tsx
MOD   app/room/[code]/page.tsx           (added Cricsheet + WebSync panels)
MOD   app/results/[code]/page.tsx        (added ResultsExportBar)
MOD   .env.example                       (added 3 new API key vars)
MOD   package.json                       (added adm-zip)
```

---

# Session Changelog (2026-03-28)

## What Was Changed

### 5. Cricsheet Sync — Per-Match `match_results` Pipeline

**Problem:** `cricsheet-sync` previously aggregated all matches and wrote totals directly to `players.stats`, overwriting webscrape data and preventing per-match review.

**Fix:** Cricsheet data now flows through the same admin-review pipeline as webscrape data.

| File | Change |
|------|--------|
| `lib/server/cricsheet.ts` | Added `processZipPerMatch()` — processes each match JSON file in isolation and returns one `CricsheetMatchEntry` per match in `PlayerMatchStats` wire format. Added `accumulatorToMatchStats()` helper to convert a single-match `CricsheetAccumulator` → `PlayerMatchStats`. |
| `app/api/rooms/[code]/cricsheet-sync/route.ts` | **Rewritten.** No longer writes to `players.stats`. Instead upserts one `match_results` row per match with `source="cricsheet"`, `accepted=false`. Re-running is safe — updates stats on existing rows but preserves `accepted=true` decisions. |

#### Flow after this change

```
cricsheet-sync POST
  → processZipPerMatch()
  → match_results rows (source="cricsheet", accepted=false)
  → Admin reviews in match comparison UI (same as webscrape)
  → webscrape-accept POST (accept decision)
  → aggregates ALL accepted rows (any source) → players.stats
```

#### Files Changed

```
MOD   lib/server/cricsheet.ts              (added processZipPerMatch, CricsheetMatchEntry, accumulatorToMatchStats)
MOD   app/api/rooms/[code]/cricsheet-sync/route.ts  (full rewrite — uses match_results pipeline)
```

> **Note:** No DB migration needed. The existing `match_results` table already has `source`, `match_date`, `season`, and `accepted` columns. No changes to `webscrape-accept` or `webscrape-preview` — they already handle any source.

---

### Bug Fix — Cricsheet ZIP Data Not Appearing in Results

**Root cause:** The refactor above stored all Cricsheet rows as `accepted=false`. The `webscrape-accept` route (which runs aggregation → `players.stats`) was never called, so the Results board stayed empty after a ZIP sync.

**Fix:** `cricsheet-sync/route.ts` rewritten again to:

1. **Upsert with `accepted=true`** — both new inserts and updates on existing rows immediately mark the match as accepted.
2. **Run aggregation inline** — after upserting all matches, reads every `accepted=true` row for the room+season (any source), runs `aggregateToPlayerStats()`, and writes totals to `players.stats` — identical logic to `webscrape-accept`.
3. **`revalidatePath`** fires for `/room/` and `/results/` so the UI updates instantly.

No manual "accept" step needed for Cricsheet data — results are visible immediately after ZIP sync.

#### Files Changed

```
MOD   app/api/rooms/[code]/cricsheet-sync/route.ts  (upsert accepted=true + inline aggregation)
```

---

# Session Changelog (2026-03-28 — Part 2)

## What Was Changed

### 6. Cricsheet Player Name Fix — Short Name → Full Name Translation

**Problem:** Cricsheet ball-by-ball data uses short names (`"HH Pandya"`, `"V Kohli"`, `"RG Sharma"`) but the room's player pool uses full names (`"Hardik Pandya"`, `"Virat Kohli"`, `"Rohit Sharma"`). The existing normalised-name + surname-fallback matching was failing for most players, so stats were not being assigned.

**Fix:** Introduced a name translation map built from `final_mapping.json` (project root). Every player name encountered during Cricsheet processing is now translated from its Cricsheet short form to the canonical full name before being stored in the stats map.

| File | Change |
|------|--------|
| `lib/server/cricsheet.ts` | Added `normShort()` helper. `processMatch()` now accepts optional `nameMap?: Map<string, string>`. All player name references (batter, bowler, fielder, player_out, announced XI) pass through `resolve()` before being stored. `processZipPerMatch()` and `processZip()` both accept and forward `nameMap`. |
| `app/api/rooms/[code]/cricsheet-sync/route.ts` | Added `buildNameMap()` — reads `final_mapping.json` at module load, builds `normalised-short-name → full-name` map (`CRICSHEET_NAME_MAP`). Passes the map into `processZipPerMatch()`. |

#### How the mapping works

```
final_mapping.json entry:
  "dbe50b21": { "short_name": "HH Pandya", "full_name": "Hardik Pandya" }

buildNameMap() produces:
  "hh pandya" → "Hardik Pandya"

processMatch() resolve():
  "HH Pandya" → normalise → "hh pandya" → lookup → "Hardik Pandya"

match_results.player_stats key:
  "Hardik Pandya"   ← now matches DB player name exactly
```

#### Files Changed

```
MOD   lib/server/cricsheet.ts
MOD   app/api/rooms/[code]/cricsheet-sync/route.ts
```

> **Note:** `final_mapping.json` must exist in the project root (it was already present). No DB changes needed.

---

### 7. Cricsheet — Upload Single Match JSON File

**Problem:** Previously you could only sync via the full season ZIP. If you want to add one match's data quickly (e.g. from `cricsheet.org/matches/ipl/`) you had to re-upload the entire ZIP.

**Fix:** Added a third upload mode — **Upload JSON** — that accepts a single Cricsheet match `.json` file and processes it as one match entry.

| File | Change |
|------|--------|
| `lib/server/cricsheet.ts` | New `processSingleMatchJson(buffer, filename, season?, nameMap?)` — parses one JSON file, runs `processMatch()`, returns a `ProcessZipPerMatchResult` with exactly one entry. matchId is derived from the uploaded filename. |
| `app/api/rooms/[code]/cricsheet-sync/route.ts` | Detects `.json` vs `.zip` by the uploaded filename. Routes to `processSingleMatchJson()` or `processZipPerMatch()` accordingly. Auto-fetch always uses `processZipPerMatch()`. |
| `components/room/cricsheet-sync-button.tsx` | Added **Upload JSON** mode button alongside existing Auto-fetch and Upload ZIP. File input for JSON mode accepts only `.json`. |

#### Three sync modes now available

| Mode | What it does |
|------|-------------|
| **Auto-fetch** | Downloads `ipl_json.zip` from cricsheet.org automatically. All season matches. |
| **Upload ZIP** | Upload `ipl_json.zip` downloaded manually from `cricsheet.org/downloads/`. All season matches. |
| **Upload JSON** | Upload a single match `.json` file from `cricsheet.org/matches/ipl/`. One match only. |

All three modes apply the `final_mapping.json` name translation and follow the same pipeline:
upsert → `match_results` → aggregate accepted rows → `players.stats`.

#### Files Changed

```
NEW   lib/server/cricsheet.ts  (added processSingleMatchJson)
MOD   app/api/rooms/[code]/cricsheet-sync/route.ts  (json/zip routing)
MOD   components/room/cricsheet-sync-button.tsx     (Upload JSON button)
```

---

## DB Changes Required

**Only one migration is needed** — and only if you have not run it yet:

```
supabase/match-results.sql
```

Run it once in Supabase Dashboard → SQL Editor. All other changes write to existing columns (`players.stats` jsonb, `match_results` table). No new tables, columns, or indexes are required for any of the changes above.

---

# Session Changelog (2026-03-28 — Part 3)

## What Was Changed

### 8. Cricsheet Player Matching — UUID-Based Name Resolution

**Problem:** The short-name normalisation approach (`"kh pandya"` → lookup → `"Krunal Pandya"`) was still wrong in critical cases:

- `"KH Pandya"` was being attributed to Hardik Pandya instead of Krunal Pandya via the surname fallback
- `"B Kumar"` was ambiguous between Bhuvneshwar, Mukesh, and Ashwani Kumar
- Players like `"Sumit Kumar"` (Shivang Kumar) and `"Shivam Singh"` (Shashank Singh) — where the short name and full name share no common words — were impossible to match by string normalisation alone

**Root cause:** String normalisation can never be fully reliable. The Cricsheet short name is just a convention and is not guaranteed to share initials or structure with the canonical full name.

**Fix:** Use the UUID registry built into every Cricsheet match JSON.

Every Cricsheet match file contains `info.registry.people` — a map of the player's in-game name → their unique Cricsheet UUID. Since `final_mapping.json` is also keyed by these same UUIDs, the resolution becomes exact and unambiguous:

```
Cricsheet ball data:  "KH Pandya" (batter field)
       ↓
info.registry.people: "KH Pandya" → "5b8c830e"
       ↓
final_mapping.json:   "5b8c830e" → full_name: "Krunal Pandya"
       ↓
match_results key:    "Krunal Pandya"  ← exact DB match
```

This handles cases that were previously impossible:

| Cricsheet name | Full name | Why normalisation failed |
|---|---|---|
| `KH Pandya` | Krunal Pandya | Surname fallback misattributed to Hardik |
| `B Kumar` | Bhuvneshwar Kumar | Ambiguous with 3 other Kumars |
| `Sumit Kumar` | Shivang Kumar | Completely different first name |
| `Shivam Singh` | Shashank Singh | Completely different first name |
| `S Sandeep Warrier` | Sandeep Sharma | Nothing in common except first initial |

**Verified:** 16/16 simulation test cases pass, including all tricky cases above.

| File | Change |
|------|--------|
| `lib/server/cricsheet.ts` | Added `registry?: { people?: Record<string, string> }` to `CricsheetMatch.info`. Changed `processMatch()` parameter from `nameMap` to `uuidMap`. `resolve()` now does: `registry[name]` → UUID → `uuidMap.get(uuid)` → full name. Updated `processZipPerMatch`, `processSingleMatchJson`, `processZip` signatures to `uuidMap`. |
| `app/api/rooms/[code]/cricsheet-sync/route.ts` | Replaced `buildNameMap()` with `buildUuidMap()` — top-level keys of `final_mapping.json` are the UUIDs, so map is `uuid → full_name`. Renamed `CRICSHEET_NAME_MAP` → `CRICSHEET_UUID_MAP`. Added error logging if `final_mapping.json` fails to load. |

**Also added (same session):** Initial-based matching helpers `isShortNameFormat` + `matchesShortName` in the route as a secondary fallback for the DB-player-to-stats matching step. These guard against misattribution even if any name slips through the UUID translation (e.g. a player not in `final_mapping.json`).

#### Files Changed

```
MOD   lib/server/cricsheet.ts              (UUID registry lookup in processMatch)
MOD   app/api/rooms/[code]/cricsheet-sync/route.ts  (buildUuidMap, CRICSHEET_UUID_MAP, initial-based fallback)
```

> **No DB changes required.** The UUID translation happens entirely at parse time — stats are stored under full names as before.
