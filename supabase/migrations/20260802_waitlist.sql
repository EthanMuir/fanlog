-- FanLog waitlist table (lives in the shared xdesk Supabase project).
-- The app writes rows with the PUBLIC anon key, which ships in the browser
-- bundle. RLS is therefore mandatory: anon may INSERT a signup, but must NOT
-- be able to SELECT — otherwise anyone could pull the anon key from DevTools
-- and scrape every email. Reads happen only with the service_role key
-- (server-side / dashboard), which bypasses RLS.

create table if not exists public.waitlist (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text,
  handle        text,
  email         text not null,
  top_team      text,
  teams         jsonb,          -- [{ id, name, league, score, isTop }]
  prediction    text,
  overall_score integer,
  archetype     text
);

-- One row per email (case-insensitive). Lets the client upsert-ignore repeats.
create unique index if not exists waitlist_email_lower_idx
  on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

-- Anon can insert a signup, nothing else. No SELECT/UPDATE/DELETE policy for
-- anon => those are denied by default once RLS is on.
drop policy if exists "anon can insert waitlist" on public.waitlist;
create policy "anon can insert waitlist"
  on public.waitlist
  for insert
  to anon
  with check (true);
