# IPL Auction Platform

Implementation-ready Next.js + Supabase foundation for a real-time IPL auction simulator.

## Stack

- Next.js App Router with TypeScript
- Supabase Auth, Postgres, and Realtime
- PapaParse and SheetJS for CSV/XLSX imports
- Server-side auction and trade validation

## Included

- Google sign-in flow and auth callback
- Room creation and join-by-code
- Admin/player room memberships
- Player and team uploads from CSV/XLSX
- Auction engine states: `WAITING`, `LIVE`, `PAUSED`, `ROUND_END`, `COMPLETED`
- Versioned server-side bid handling
- Round 1 all players, round 2 unsold players
- Purse and squad validation
- Player + cash trade execution
- Supabase channel subscriptions and emoji broadcasts
- Results page with static-score leaderboard

## Project Structure

- `app/` pages and API routes
- `components/` UI for lobby, room setup, auction, results, and trades
- `lib/domain/` auction, trade, scoring, schema, and realtime logic
- `lib/server/` auth and Supabase-backed queries
- `supabase/migrations/` schema and RLS

## Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in your Supabase URL, anon key, and service role key.
3. Create a Supabase project with Google auth enabled.
4. Run `supabase/migrations/001_initial_schema.sql` in the Supabase SQL editor.
5. Optionally create a room with code `DEMO01` and run `supabase/seed.sql`.
6. Install dependencies.
7. Start the app.

```bash
cmd /c npm install
cmd /c npm run dev
```

## Realtime Notes

- Add the public tables in the migration to the `supabase_realtime` publication if your project does not do that automatically.
- The auction client subscribes to Postgres changes for `auction_state`, `bids`, `players`, `teams`, and `trades`.
- Emoji reactions are room-channel broadcasts and do not touch the database.

## Product Notes

- The server owns bid acceptance, timer resets, trade validation, and auction advancement.
- The database remains the source of truth for rooms, bids, squads, and trades.
- This starter uses static stats inside `players.stats` for scoring. You can replace that with a cricket API fetcher later without rewriting the results page.

## Next Steps

- Add team ownership management UI so players can be bound to specific teams.
- Move auction advancement into a Supabase function or scheduled worker for stronger transactional guarantees.
- Add audit/event storage for richer match logs and replay.
