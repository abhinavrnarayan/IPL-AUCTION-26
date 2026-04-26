-- Migration 014: Round interest ballot + multi-round support
--
-- Round interest: at ROUND_END, each team owner marks which UNSOLD players
-- they want to bid on in the next round. Only players with ≥1 interest carry
-- forward. Admin sees the aggregate and starts the next round from the union.
--
-- Also drops the legacy `current_round in (1,2)` check so rooms can run up to
-- 3 rounds (app-layer cap) instead of being blocked at DB level.
--
-- Run in Supabase SQL Editor or via: supabase db push

-- 1. Drop legacy two-round cap on auction_state.current_round
alter table public.auction_state
  drop constraint if exists auction_state_current_round_check;

-- 2. Round interest ballot
create table if not exists public.round_interests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round integer not null check (round >= 1),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  submitted_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (room_id, round, team_id, player_id)
);

create index if not exists round_interests_room_round_idx
  on public.round_interests (room_id, round);

-- Realtime replication for UI tallies
alter table public.round_interests replica identity full;
