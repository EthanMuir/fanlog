// Waitlist signup edge function.
//
// This is the ONLY write path into public.waitlist. Direct anon inserts are
// disabled by RLS (see supabase/migrations/20260802_lockdown_waitlist.sql), so
// spammers can't hit the REST endpoint with the public anon key. Signups used
// to require a Cloudflare Turnstile token verified here; that check is
// currently disabled (see step 1 below). Inserts use the service_role key
// (which bypasses RLS).
//
//   browser ──(form)──► this function
//                          │ validate + size-cap (captcha check disabled)
//                          ▼
//                  public.waitlist (service_role insert)
//
// Env (secrets):
//   TURNSTILE_SECRET_KEY        - Cloudflare Turnstile secret (set via `supabase secrets set`)
//   SUPABASE_URL                - auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY   - auto-injected by Supabase

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  // 1) Turnstile verification is DISABLED: the widget stopped producing tokens
  // in production, which blocked every signup. Every request now passes.
  // To re-enable, uncomment this block and restore the client-side widget.
  //
  // const token = typeof body.token === 'string' ? body.token : '';
  // if (!token) return json({ error: 'missing_captcha' }, 400);
  // const secret = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';
  // const ip =
  //   req.headers.get('CF-Connecting-IP') ??
  //   req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
  //   '';
  // let outcome: { success?: boolean; 'error-codes'?: string[] } = {};
  // try {
  //   const verifyRes = await fetch(
  //     'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  //     {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  //       body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  //     },
  //   );
  //   outcome = await verifyRes.json();
  // } catch {
  //   return json({ error: 'captcha_unreachable' }, 502);
  // }
  // if (!outcome.success) {
  //   return json({ error: 'captcha_failed', detail: outcome['error-codes'] ?? [] }, 403);
  // }

  // 2) Validate email shape.
  const email = String(body.email ?? '').trim().toLowerCase();
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'bad_email' }, 400);
  }

  // 3) Insert with service_role (bypasses RLS). Upsert-ignore on email.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // With no captcha this endpoint is open to anyone, so cap what a single
  // request can write.
  const str = (v: unknown, max: number) =>
    typeof v === 'string' ? v.slice(0, max) : null;
  const overall = Number(body.overall_score);
  const teams = body.teams;
  const row = {
    name: str(body.name, 60),
    handle: str(body.handle, 60),
    email,
    top_team: str(body.top_team, 80),
    teams: Array.isArray(teams) && JSON.stringify(teams).length <= 4000
      ? teams.slice(0, 8)
      : null,
    prediction: str(body.prediction, 120),
    overall_score: Number.isFinite(overall) ? Math.round(overall) : null,
    archetype: str(body.archetype, 80),
  };

  const { error } = await supabase.from('waitlist').insert(row);

  if (error) {
    // 23505 = unique_violation on lower(email): this email already signed up.
    // Idempotent by design — treat a repeat as success, not an error.
    if (error.code === '23505') return json({ ok: true, duplicate: true }, 200);
    return json({ error: 'db_error', detail: error.message }, 500);
  }
  return json({ ok: true }, 200);
});
