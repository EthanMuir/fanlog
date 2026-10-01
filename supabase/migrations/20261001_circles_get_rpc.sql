-- By-id-only read path for public.circles.
--
-- The original "anon can read circles" policy (20260815_circles.sql) is
-- `using (true)`, which doesn't restrict reads to one id at a time: anyone
-- with the public anon key can GET /rest/v1/circles?select=* and download
-- every stored card. Random ids only stop guessing, not listing.
--
-- This function returns the payload for exactly one id. It runs as its owner
-- (security definer), so it keeps working after 20261002_circles_lockdown.sql
-- removes anon's direct SELECT on the table.
--
-- Apply this FIRST (harmless on its own), then deploy the client/server code
-- that calls it, then apply 20261002_circles_lockdown.sql.

create or replace function public.get_circle(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select c.payload
  from public.circles c
  where c.id = p_id
    and p_id ~ '^[A-Za-z0-9]{6,12}$';
$$;

revoke all on function public.get_circle(text) from public;
grant execute on function public.get_circle(text) to anon, authenticated;
