// Shared by api/og.js and api/share.js (both Vercel Edge Functions): resolves
// a request's query params into the small card summary those two render —
// { h, a, sc, t } — regardless of which link form is carrying it.
//
// Current links carry a short ?id=, looked up in public.circles (same xdesk
// Supabase project as waitlist.js/circles.js) through the get_circle()
// function — anon can fetch one card by its exact id but can't list the
// table (see supabase/migrations/20261001_circles_get_rpc.sql). Links shared
// before the id-based form shipped still carry the payload directly as
// ?c=<base64>, which is honored too so old links don't break.
//
// Either way the payload is attacker-controlled, so it's returned already
// run through sanitizeCircle() (circlePayload.js).
//
// Lives at the project root next to cardVisuals.js (not inside api/)
// specifically so it's unambiguous this isn't itself a route.
import { sanitizeCircle } from './circlePayload.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Matches the client's id generator (circles.js) and the table's insert check.
const CIRCLE_ID_PATTERN = /^[A-Za-z0-9]{6,12}$/;

function decodeCircle(enc) {
  const b64 = enc.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

async function fetchCircleById(id) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !CIRCLE_ID_PATTERN.test(id)) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_circle`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_id: id }),
    });
    if (!res.ok) return null;
    return (await res.json()) || null;
  } catch {
    return null;
  }
}

/**
 * @param {URLSearchParams} searchParams
 * @returns {Promise<{h: string, a: string, t: {i: string, s: number, top: number}[]}|null>}
 */
export async function resolveCircle(searchParams) {
  const id = searchParams.get('id');
  if (id) {
    const payload = await fetchCircleById(id);
    if (payload) return sanitizeCircle(payload);
    // id present but unresolvable (expired/bad/Supabase down) — fall
    // through to ?c= only if it's *also* present; otherwise this is just a
    // dead/malformed link and the caller's branded-default fallback applies.
  }
  const c = searchParams.get('c');
  if (c) {
    try {
      return sanitizeCircle(decodeCircle(c));
    } catch {
      return null;
    }
  }
  return null;
}
