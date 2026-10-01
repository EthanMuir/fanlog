-- Lock down public.circles: remove anon's direct SELECT so the table can't be
-- listed. Reads now go through public.get_circle(id) (20261001_circles_get_rpc.sql),
-- which returns one card for one exact id.
--
-- Apply this LAST, once the client and api/ code that call get_circle() are
-- live — dropping the policy before then would break shared-link previews
-- and recipient views for the currently deployed build.
--
-- Anon INSERT stays as-is: the app inserts with Prefer: return=minimal, which
-- doesn't need SELECT.

drop policy if exists "anon can read circles" on public.circles;
