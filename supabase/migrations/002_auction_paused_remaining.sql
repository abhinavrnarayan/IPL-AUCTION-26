alter table public.auction_state
  add column if not exists paused_remaining_ms integer;

alter table public.auction_state
  add column if not exists skip_vote_team_ids uuid[] not null default '{}';
