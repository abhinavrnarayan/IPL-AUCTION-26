-- Migration 008: fallback team ownership assignment for seeded users
-- Fixes trade permissions when invites were only seeded for one room code.

create or replace function public.auto_claim_team_ownership()
returns trigger
language plpgsql
security definer
as $$
declare
  v_email         text;
  v_display_name  text;
  v_team_id       uuid;
begin
  select email, display_name
    into v_email, v_display_name
  from public.users
  where id = new.user_id;

  if v_email is null and v_display_name is null then
    return new;
  end if;

  -- Prefer explicit invite mapping when present.
  if v_email is not null then
    select t.id
      into v_team_id
    from public.team_invites ti
    join public.teams t
      on t.room_id = ti.room_id
     and lower(t.name) = lower(ti.team_name)
    where ti.room_id = new.room_id
      and lower(ti.email) = lower(v_email)
      and ti.claimed_at is null
      and t.owner_user_id is null
    limit 1;
  end if;

  -- Fallback for seeded users: match their display name to an unowned team in the room.
  if v_team_id is null and v_display_name is not null then
    select t.id
      into v_team_id
    from public.teams t
    where t.room_id = new.room_id
      and lower(t.name) = lower(v_display_name)
      and t.owner_user_id is null
    limit 1;
  end if;

  if v_team_id is not null then
    update public.teams
    set owner_user_id = new.user_id
    where id = v_team_id;

    if v_email is not null then
      update public.team_invites
      set claimed_at = now()
      where room_id = new.room_id
        and lower(email) = lower(v_email)
        and claimed_at is null;
    end if;
  end if;

  return new;
end;
$$;

-- Backfill existing room members who already joined before this fix.
update public.teams t
set owner_user_id = u.id
from public.room_members rm
join public.users u
  on u.id = rm.user_id
where t.room_id = rm.room_id
  and t.owner_user_id is null
  and lower(t.name) = lower(u.display_name);

-- Keep invite rows in sync when a team was backfilled from the fallback path.
update public.team_invites ti
set claimed_at = now()
from public.users u,
     public.teams t
where t.owner_user_id = u.id
  and t.room_id = ti.room_id
  and lower(u.email) = lower(ti.email)
  and lower(t.name) = lower(ti.team_name)
  and ti.claimed_at is null;
