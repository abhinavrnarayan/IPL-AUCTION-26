create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'auction_phase') then
    create type public.auction_phase as enum ('WAITING', 'LIVE', 'PAUSED', 'ROUND_END', 'COMPLETED');
  end if;

  if not exists (select 1 from pg_type where typname = 'player_status') then
    create type public.player_status as enum ('AVAILABLE', 'SOLD', 'UNSOLD');
  end if;

  if not exists (select 1 from pg_type where typname = 'trade_status') then
    create type public.trade_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  purse integer not null check (purse > 0),
  squad_size integer not null check (squad_size > 0),
  timer_seconds integer not null check (timer_seconds >= 5),
  bid_increment integer not null check (bid_increment > 0),
  owner_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  is_admin boolean not null default false,
  is_player boolean not null default true,
  joined_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, user_id)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  short_code text not null,
  purse_remaining integer not null check (purse_remaining >= 0),
  squad_limit integer not null check (squad_limit > 0),
  owner_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (room_id, name),
  unique (room_id, short_code)
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  role text not null,
  nationality text,
  base_price integer not null check (base_price >= 0),
  status public.player_status not null default 'AVAILABLE',
  stats jsonb,
  order_index integer not null,
  current_team_id uuid references public.teams(id) on delete set null,
  sold_price integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (room_id, order_index)
);

create table if not exists public.auction_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  phase public.auction_phase not null default 'WAITING',
  current_round integer not null default 1 check (current_round in (1, 2)),
  current_player_id uuid references public.players(id) on delete set null,
  current_bid integer,
  current_team_id uuid references public.teams(id) on delete set null,
  expires_at timestamptz,
  version integer not null default 1,
  last_event text,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  amount integer not null check (amount >= 0),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.squad (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  purchase_price integer not null check (purchase_price >= 0),
  acquired_in_round integer not null check (acquired_in_round in (1, 2)),
  created_at timestamptz not null default timezone('utc', now()),
  unique (room_id, player_id)
);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  team_a_id uuid not null references public.teams(id) on delete cascade,
  team_b_id uuid not null references public.teams(id) on delete cascade,
  players_from_a uuid[] not null default '{}',
  players_from_b uuid[] not null default '{}',
  cash_from_a integer not null default 0 check (cash_from_a >= 0),
  cash_from_b integer not null default 0 check (cash_from_b >= 0),
  status public.trade_status not null default 'PENDING',
  initiated_by uuid not null references public.users(id) on delete restrict,
  approved_by uuid references public.users(id) on delete set null,
  executed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_room_members_user on public.room_members(user_id);
create index if not exists idx_teams_room on public.teams(room_id);
create index if not exists idx_players_room on public.players(room_id);
create index if not exists idx_bids_room_created on public.bids(room_id, created_at desc);
create index if not exists idx_squad_room_team on public.squad(room_id, team_id);
create index if not exists idx_trades_room_created on public.trades(room_id, created_at desc);

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

drop trigger if exists teams_set_updated_at on public.teams;
create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

drop trigger if exists players_set_updated_at on public.players;
create trigger players_set_updated_at
before update on public.players
for each row execute function public.set_updated_at();

drop trigger if exists auction_state_set_updated_at on public.auction_state;
create trigger auction_state_set_updated_at
before update on public.auction_state
for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.auction_state enable row level security;
alter table public.bids enable row level security;
alter table public.squad enable row level security;
alter table public.trades enable row level security;

drop policy if exists "Users can read their own profile" on public.users;
create policy "Users can read their own profile"
on public.users for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.users;
create policy "Users can update their own profile"
on public.users for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Members can read rooms" on public.rooms;
create policy "Members can read rooms"
on public.rooms for select
to authenticated
using (
  exists (
    select 1
    from public.room_members rm
    where rm.room_id = rooms.id
      and rm.user_id = auth.uid()
  )
);

drop policy if exists "Members can read room members" on public.room_members;
create policy "Members can read room members"
on public.room_members for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.room_members rm
    where rm.room_id = room_members.room_id
      and rm.user_id = auth.uid()
  )
);

drop policy if exists "Members can read teams" on public.teams;
create policy "Members can read teams"
on public.teams for select
to authenticated
using (
  exists (
    select 1
    from public.room_members rm
    where rm.room_id = teams.room_id
      and rm.user_id = auth.uid()
  )
);

drop policy if exists "Members can read players" on public.players;
create policy "Members can read players"
on public.players for select
to authenticated
using (
  exists (
    select 1
    from public.room_members rm
    where rm.room_id = players.room_id
      and rm.user_id = auth.uid()
  )
);

drop policy if exists "Members can read auction state" on public.auction_state;
create policy "Members can read auction state"
on public.auction_state for select
to authenticated
using (
  exists (
    select 1
    from public.room_members rm
    where rm.room_id = auction_state.room_id
      and rm.user_id = auth.uid()
  )
);

drop policy if exists "Members can read bids" on public.bids;
create policy "Members can read bids"
on public.bids for select
to authenticated
using (
  exists (
    select 1
    from public.room_members rm
    where rm.room_id = bids.room_id
      and rm.user_id = auth.uid()
  )
);

drop policy if exists "Members can read squads" on public.squad;
create policy "Members can read squads"
on public.squad for select
to authenticated
using (
  exists (
    select 1
    from public.room_members rm
    where rm.room_id = squad.room_id
      and rm.user_id = auth.uid()
  )
);

drop policy if exists "Members can read trades" on public.trades;
create policy "Members can read trades"
on public.trades for select
to authenticated
using (
  exists (
    select 1
    from public.room_members rm
    where rm.room_id = trades.room_id
      and rm.user_id = auth.uid()
  )
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.auction_state;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.bids;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.players;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.teams;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.squad;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.trades;
  exception when duplicate_object then null;
  end;
end $$;
