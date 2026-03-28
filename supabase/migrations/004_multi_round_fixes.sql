-- Allow acquired_in_round to be any positive integer (not just 1 or 2)
alter table public.squad drop constraint if exists squad_acquired_in_round_check;
alter table public.squad add constraint squad_acquired_in_round_check check (acquired_in_round >= 1);

-- Add replica identity for trades so realtime UPDATE events broadcast
alter table public.trades replica identity full;
