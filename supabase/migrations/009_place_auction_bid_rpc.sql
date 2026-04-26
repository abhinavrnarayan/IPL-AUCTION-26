create or replace function public.place_auction_bid(
  p_room_code text,
  p_user_id uuid,
  p_team_id uuid,
  p_increment integer default null
)
returns table (
  amount integer,
  expires_at timestamptz,
  version integer
)
language plpgsql
security definer
set search_path = public
as $$
-- Without this, plpgsql can't decide whether `version` (and other unqualified
-- names) refers to the auction_state column or the function's OUT parameter
-- (RETURNS TABLE column). use_column forces SET targets and column refs in
-- DML to bind to the table column, which is what we want here.
#variable_conflict use_column
declare
  v_room            public.rooms%rowtype;
  v_member          public.room_members%rowtype;
  v_team            public.teams%rowtype;
  v_player          public.players%rowtype;
  v_auction         public.auction_state%rowtype;
  v_team_squad_cnt  integer;
  v_next_amount     integer;
  v_next_expires_at timestamptz;
  v_row_count       integer;
begin
  select *
    into v_room
  from public.rooms
  where code = upper(trim(p_room_code));

  if not found then
    raise exception 'Room was not found.';
  end if;

  select *
    into v_member
  from public.room_members
  where room_id = v_room.id
    and user_id = p_user_id;

  if not found then
    raise exception 'Join this room before accessing it.';
  end if;

  select *
    into v_auction
  from public.auction_state
  where room_id = v_room.id;

  if not found then
    raise exception 'Auction has not started yet.';
  end if;

  if v_auction.phase <> 'LIVE' then
    raise exception 'Auction is not live.';
  end if;

  if v_auction.current_player_id is null then
    raise exception 'No player is currently on the block.';
  end if;

  -- Compare against now() (timestamptz) directly. timezone('utc', now())
  -- returns a `timestamp without time zone`; when compared to a timestamptz
  -- column Postgres reinterprets it via the session timezone, which silently
  -- shifts the comparison if the session isn't UTC (causing every bid to
  -- think the timer already expired).
  if v_auction.expires_at is null or v_auction.expires_at <= now() then
    raise exception 'Bidding time has ended for this player.';
  end if;

  select *
    into v_team
  from public.teams
  where id = p_team_id
    and room_id = v_room.id;

  if not found then
    raise exception 'Team was not found.';
  end if;

  if v_team.owner_user_id is not null and not v_member.is_admin and v_team.owner_user_id <> p_user_id then
    raise exception 'You can only bid for your own team unless you are an admin.';
  end if;

  if v_auction.current_team_id = v_team.id then
    raise exception 'Highest bidder cannot bid again immediately.';
  end if;

  select count(*)
    into v_team_squad_cnt
  from public.squad
  where room_id = v_room.id
    and team_id = v_team.id;

  if v_team_squad_cnt >= v_team.squad_limit then
    raise exception 'Team squad is already full.';
  end if;

  select *
    into v_player
  from public.players
  where id = v_auction.current_player_id;

  if not found then
    raise exception 'No active player is available for bidding.';
  end if;

  if v_auction.current_bid is null then
    v_next_amount := v_player.base_price;
  else
    if p_increment is not null then
      if v_auction.current_bid >= 10000000 then
        if p_increment not in (2500000, 5000000, 10000000) then
          raise exception 'Invalid bid increment.';
        end if;
      else
        if p_increment not in (1000000, 2500000, 5000000, 10000000) then
          raise exception 'Invalid bid increment.';
        end if;
      end if;
    end if;

    v_next_amount := v_auction.current_bid +
      coalesce(
        p_increment,
        case
          when v_auction.current_bid >= 10000000 then 2500000
          else 1000000
        end
      );
  end if;

  if v_team.purse_remaining < v_next_amount then
    raise exception 'Team does not have enough purse for this bid.';
  end if;

  -- Same reasoning: now() is timestamptz; the wrapper would strip the tz.
  v_next_expires_at := now() + make_interval(secs => v_room.timer_seconds);

  -- Qualify column refs with the table name. Without this, Postgres can't
  -- disambiguate `version` between the auction_state column and the
  -- function's OUT parameter (RETURNS TABLE column also named `version`),
  -- and raises 42702 "column reference 'version' is ambiguous".
  update public.auction_state as a
  set current_bid = v_next_amount,
      current_team_id = v_team.id,
      expires_at = v_next_expires_at,
      version = v_auction.version + 1,
      last_event = 'NEW_BID'
  where a.room_id = v_room.id
    and a.version = v_auction.version;

  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then
    raise exception 'Auction state changed. Refresh and try again.';
  end if;

  insert into public.bids (
    room_id,
    player_id,
    team_id,
    amount,
    created_by
  ) values (
    v_room.id,
    v_player.id,
    v_team.id,
    v_next_amount,
    p_user_id
  );

  return query
  select
    v_next_amount,
    v_next_expires_at,
    v_auction.version + 1;
end;
$$;
