-- 011_super_room.sql
-- Adds is_super_room flag to rooms.
-- The super room is a superadmin-only sandbox:
--   • hidden from all users' lobbies
--   • excluded from global score pushes and player pool syncs
--   • only one super room is allowed (unique partial index)

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS is_super_room boolean NOT NULL DEFAULT false;

-- Enforce: at most one super room across the whole DB
CREATE UNIQUE INDEX IF NOT EXISTS rooms_single_super_room
  ON public.rooms (is_super_room)
  WHERE is_super_room = true;
