-- Fan identities (lives in the shared xdesk Supabase project, like waitlist
-- and circles).
--
-- Every browser gets an anonymous fan id (a random UUID kept in localStorage,
-- see fans.js) that is also the analytics user_id. When a fan picks their
-- Fan ID / username in the quiz, claim_handle() records it here. Usernames
-- are unique case-insensitively.
--
-- The fan id works like a bearer token for its username, so it must never be
-- put anywhere public (share links, circles payloads).

create table if not exists public.fans (
  id          uuid primary key,
  handle      text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists fans_handle_lower_idx on public.fans (lower(handle));

alter table public.fans enable row level security;
-- No anon policies: anon can't read or write the table directly, only
-- through claim_handle() below (so the list of usernames can't be scraped).

-- Returns 'ok' (claimed, or already this fan's), 'taken', or 'invalid'.
-- Re-claiming with a new handle releases the fan's previous one.
create or replace function public.claim_handle(p_fan_id uuid, p_handle text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_fan_id is null or p_handle is null or p_handle !~ '^[A-Za-z0-9_]{3,20}$' then
    return 'invalid';
  end if;
  if lower(p_handle) in ('guest', 'admin', 'fanlog', 'support', 'official', 'anon', 'null', 'undefined') then
    return 'taken';
  end if;
  insert into public.fans (id, handle) values (p_fan_id, p_handle)
  on conflict (id) do update set handle = excluded.handle, updated_at = now();
  return 'ok';
exception when unique_violation then
  return 'taken';
end;
$$;

revoke all on function public.claim_handle(uuid, text) from public;
grant execute on function public.claim_handle(uuid, text) to anon, authenticated;

-- Link waitlist signups to the fan id (and so to their analytics events).
alter table public.waitlist add column if not exists fan_id uuid;
