-- Migration: add cricsheet_uuid to players table
--
-- After the first successful Cricsheet sync, each matched player gets their
-- Cricsheet registry UUID stored here.  All future syncs match by UUID first
-- (exact, no string matching) — preventing any misattribution of points.
--
-- Run once in Supabase Dashboard → SQL Editor.

ALTER TABLE players ADD COLUMN IF NOT EXISTS cricsheet_uuid text;

CREATE INDEX IF NOT EXISTS idx_players_cricsheet_uuid
  ON players (cricsheet_uuid)
  WHERE cricsheet_uuid IS NOT NULL;
