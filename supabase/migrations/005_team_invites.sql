-- ============================================================
-- Migration 005: team_invites — pre-assign emails to teams
-- ============================================================

-- 1. Invite table: maps email → team name within a room
create table if not exists public.team_invites (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  email       text not null,
  team_name   text not null,
  claimed_at  timestamptz,
  unique (room_id, email)
);

-- 2. Seed invites for room 092YLZ
insert into public.team_invites (room_id, email, team_name)
select r.id, invites.email, invites.team_name
from public.rooms r
cross join (values
  ('sherlockholmes221b715@gmail.com', 'WAYANAD TARZANS'),
  ('abhijithbabu855@gmail.com',       'opm'),
  ('sonushajim@gmail.com',            'MALABAR MAGIC'),
  ('lonewolf6996a@gmail.com',         'Kerala Indians'),
  ('abiddileep7@gmail.com',           'Mumbai indians'),
  ('gpy120643@gmail.com',             'GOATED SUPER KINGS'),
  ('swabeehca@gmail.com',             'Kerala Blasters')
) as invites(email, team_name)
where r.code = '092YLZ'
on conflict (room_id, email) do nothing;

-- 3. Trigger function: auto-claim team ownership on room join
create or replace function public.auto_claim_team_ownership()
returns trigger
language plpgsql
security definer
as $$
declare
  v_email    text;
  v_team_id  uuid;
begin
  -- look up the joining user's email
  select email into v_email
  from public.users
  where id = new.user_id;

  if v_email is null then
    return new;
  end if;

  -- find a matching unclaimed invite and a team with no owner yet
  select t.id into v_team_id
  from public.team_invites ti
  join public.teams t
    on t.room_id = ti.room_id
   and lower(t.name) = lower(ti.team_name)
  where ti.room_id    = new.room_id
    and lower(ti.email) = lower(v_email)
    and ti.claimed_at is null
    and t.owner_user_id is null
  limit 1;

  if v_team_id is not null then
    update public.teams
    set owner_user_id = new.user_id
    where id = v_team_id;

    update public.team_invites
    set claimed_at = now()
    where room_id = new.room_id
      and lower(email) = lower(v_email);
  end if;

  return new;
end;
$$;

drop trigger if exists auto_claim_team_on_join on public.room_members;
create trigger auto_claim_team_on_join
after insert on public.room_members
for each row execute function public.auto_claim_team_ownership();

-- 4. Backfill: handle members who already joined before this migration
update public.teams t
set owner_user_id = u.id
from public.team_invites ti
join public.users u  on lower(u.email) = lower(ti.email)
join public.room_members rm on rm.room_id = ti.room_id and rm.user_id = u.id
where t.room_id       = ti.room_id
  and lower(t.name)   = lower(ti.team_name)
  and t.owner_user_id is null
  and ti.claimed_at   is null;

-- mark those as claimed too
update public.team_invites ti
set claimed_at = now()
from public.users u,
     public.teams t
where lower(u.email)  = lower(ti.email)
  and lower(t.name)   = lower(ti.team_name)
  and t.room_id       = ti.room_id
  and t.owner_user_id = u.id
  and ti.claimed_at   is null;
