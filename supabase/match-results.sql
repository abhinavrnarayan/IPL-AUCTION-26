-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Creates the match_results table for per-match score storage and comparison

CREATE TABLE IF NOT EXISTS public.match_results (
  id            uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id       uuid          NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  match_id      text          NOT NULL,
  match_date    date,
  season        text          NOT NULL,
  teams         text[]        DEFAULT '{}',
  source        text          NOT NULL,  -- 'cricketdata' | 'rapidapi' | 'cricapi' | 'cricsheet' | 'manual'
  source_label  text,                    -- Human-readable label shown in UI
  player_stats  jsonb         NOT NULL DEFAULT '{}',
  -- player_stats shape: { "Player Name": { runs, balls_faced, fours, sixes, dismissed,
  --   wickets, balls_bowled, runs_conceded, maiden_overs, lbw_bowled_wickets,
  --   catches, stumpings, run_outs, milestone_runs_pts, sr_pts, duck_penalty,
  --   milestone_wkts_pts, economy_pts, catch_bonus_pts, appeared } }
  calculated_points jsonb     DEFAULT '{}',
  -- calculated_points shape: { "Player Name": 142 }
  accepted      boolean       DEFAULT false,
  accepted_at   timestamptz,
  created_at    timestamptz   DEFAULT now()
);

-- Unique: one row per room × match × source
CREATE UNIQUE INDEX IF NOT EXISTS match_results_room_match_source_idx
  ON public.match_results (room_id, match_id, source);

-- Fast lookups
CREATE INDEX IF NOT EXISTS match_results_room_season_idx
  ON public.match_results (room_id, season);

CREATE INDEX IF NOT EXISTS match_results_room_accepted_idx
  ON public.match_results (room_id, accepted);

-- RLS: service role bypasses; authenticated users can read rows for rooms they belong to
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.match_results
  USING (true) WITH CHECK (true);
