-- Short-link storage for shared Loyalty Cards (lives in the shared xdesk
-- Supabase project, same as public.waitlist).
--
-- Share links used to base64-encode the whole card summary directly into
-- the URL (?c=...), which made them very long. This table lets the link
-- carry a short random id instead — /api/og and /api/share (both read with
-- the public anon key) look the payload up by id at render time.
--
-- Unlike public.waitlist, this data is NOT sensitive: it's the same
-- non-PII card summary (handle, archetype, overall score, per-team
-- id/score/top-flag) that used to sit in plaintext in the URL already, so
-- anon SELECT is fine here — the thing waitlist's RLS specifically guards
-- against (scraping emails) doesn't apply.

create table if not exists public.circles (
  id         text primary key,
  created_at timestamptz not null default now(),
  payload    jsonb not null
);

alter table public.circles enable row level security;

-- Anon can insert a new circle. `with check` does light shape validation
-- in place of the captcha waitlist uses — this is a low-stakes share
-- action (no PII collected), so a lightweight check is proportionate: a
-- short alphanumeric id (matches the client's id generator) and a payload
-- size cap so this can't become an arbitrary-blob store.
drop policy if exists "anon can insert circles" on public.circles;
create policy "anon can insert circles"
  on public.circles
  for insert
  to anon
  with check (
    id ~ '^[A-Za-z0-9]{6,12}$'
    and pg_column_size(payload) < 4096
  );

-- Anon can read a circle by id. Ids are random enough (8 chars from a
-- 62-character alphabet) that enumeration isn't practical, and the data
-- itself was already public (embedded in the link) before this table
-- existed — this doesn't create new exposure, just a shorter link.
drop policy if exists "anon can read circles" on public.circles;
create policy "anon can read circles"
  on public.circles
  for select
  to anon
  using (true);
