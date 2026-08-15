// Shared by api/og.js and api/share.js (both Vercel Edge Functions): resolves
// a request's query params into the small card summary those two render —
// { h, a, sc, t } — regardless of which link form is carrying it.
//
// Current links carry a short ?id=, looked up in public.circles (same xdesk
// Supabase project as waitlist.js/circles.js, read with the public anon key
// — see supabase/migrations/20260815_circles.sql for why that's safe: this
// data was already public, sitting in plaintext in the link, before this
// table existed). Links shared before the id-based form shipped still carry
// the payload directly as ?c=<base64>, which is honored too so old links
// don't break.
//
// Lives at the project root next to cardVisuals.js (not inside api/)
// specifically so it's unambiguous this isn't itself a route.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

function decodeCircle(enc) {
  const b64 = enc.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

async function fetchCircleById(id) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/circles?id=eq.${encodeURIComponent(id)}&select=payload`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return (rows && rows[0] && rows[0].payload) || null;
  } catch {
    return null;
  }
}

/**
 * @param {URLSearchParams} searchParams
 * @returns {Promise<{h?: string, a?: string, sc?: number, t?: object[]}|null>}
 */
export async function resolveCircle(searchParams) {
  const id = searchParams.get('id');
  if (id) {
    const payload = await fetchCircleById(id);
    if (payload) return payload;
    // id present but unresolvable (expired/bad/Supabase down) — fall
    // through to ?c= only if it's *also* present; otherwise this is just a
    // dead/malformed link and the caller's branded-default fallback applies.
  }
  const c = searchParams.get('c');
  if (c) {
    try {
      return decodeCircle(c);
    } catch {
      return null;
    }
  }
  return null;
}
