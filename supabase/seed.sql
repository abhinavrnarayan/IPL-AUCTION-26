-- Run after creating a room with code DEMO01 from the app.
-- This seed intentionally avoids inserting auth users directly.

with room as (
  select id, purse, squad_size
  from public.rooms
  where code = 'DEMO01'
)
insert into public.teams (room_id, name, short_code, purse_remaining, squad_limit)
select room.id, team_name, team_code, room.purse, room.squad_size
from room
cross join (
  values
    ('Mumbai Mavericks', 'MUM'),
    ('Chennai Chargers', 'CHE'),
    ('Delhi Dynamos', 'DEL'),
    ('Bengaluru Blazers', 'BLR')
) as seed(team_name, team_code)
on conflict (room_id, name) do nothing;

with room as (
  select id
  from public.rooms
  where code = 'DEMO01'
)
insert into public.players (room_id, name, role, nationality, base_price, status, stats, order_index)
select
  room.id,
  player_name,
  player_role,
  nationality,
  base_price,
  'AVAILABLE'::public.player_status,
  stats::jsonb,
  order_index
from room
cross join (
  values
    (1, 'Virat Kohli', 'BAT', 'India', 2000000, '{"runs": 741, "fours": 62, "sixes": 38}'),
    (2, 'Jasprit Bumrah', 'BOWL', 'India', 1800000, '{"wickets": 24, "playerOfTheMatch": 2}'),
    (3, 'Rashid Khan', 'AR', 'Afghanistan', 1700000, '{"wickets": 19, "catches": 6}'),
    (4, 'Travis Head', 'BAT', 'Australia', 1600000, '{"runs": 567, "sixes": 31}'),
    (5, 'Heinrich Klaasen', 'WK', 'South Africa', 1500000, '{"runs": 479, "sixes": 28, "stumpings": 3}'),
    (6, 'Kuldeep Yadav', 'BOWL', 'India', 1400000, '{"wickets": 21, "catches": 4}')
) as seed(order_index, player_name, player_role, nationality, base_price, stats)
on conflict (room_id, order_index) do nothing;
