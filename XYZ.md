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
