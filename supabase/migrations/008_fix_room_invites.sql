-- Migration 008: fix team invites for correct room + remove old rooms

-- 1. Remove invites seeded for wrong room (092YLZ)
delete from public.team_invites
where room_id in (
  select id from public.rooms where code != '4RTNGU'
);

-- 2. Seed invites for the correct room 4RTNGU
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
where r.code = '4RTNGU'
on conflict (room_id, email) do nothing;

-- 3. Backfill: claim teams for members already in 4RTNGU
update public.teams t
set owner_user_id = u.id
from public.team_invites ti
join public.users u on lower(u.email) = lower(ti.email)
join public.room_members rm on rm.room_id = ti.room_id and rm.user_id = u.id
where t.room_id       = ti.room_id
  and lower(t.name)   = lower(ti.team_name)
  and t.owner_user_id is null
  and ti.claimed_at   is null;

update public.team_invites ti
set claimed_at = now()
from public.users u,
     public.teams t
where lower(u.email)  = lower(ti.email)
  and lower(t.name)   = lower(ti.team_name)
  and t.room_id       = ti.room_id
  and t.owner_user_id = u.id
  and ti.claimed_at   is null;

-- 4. Delete all rooms except 4RTNGU (cascades to teams, players, bids, squad, trades, auction_state)
delete from public.rooms where code != '4RTNGU';
