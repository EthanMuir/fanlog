import { createClient } from '@supabase/supabase-js';

// Share-link short-id storage (same xdesk Supabase project as waitlist.js,
// separate table — see supabase/migrations/20260815_circles.sql, and
// 20261001/20261002 for the by-id-only read path).
//
//   share tap ──► saveCircle(payload) ─► public.circles (anon insert, RLS-checked)
//                     │
//                     ▼ short id (or null on any failure)
//              getShareUrl() in main.js builds .../share?id=<id>&ref=...
//              falling back to the old .../share?c=<base64> form if this
//              returns null — sharing must never hard-fail because Supabase
//              hiccuped.
//
// Unlike waitlist, this doesn't go through a captcha-gated edge function:
// there's no PII here (same non-sensitive card summary that used to be
// base64'd directly into the link), so a plain anon insert plus the RLS
// shape check in the migration is proportionate.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
  : null;

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 8;

function randomId() {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  // Slight modulo bias across the 62-letter alphabet is irrelevant here —
  // this only needs to be unpredictable-ish and collision-resistant, not
  // cryptographically uniform.
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

/**
 * Store a card summary and return a short id for it, or null if it
 * couldn't be saved (Supabase not configured, offline, RLS rejected the
 * shape, etc). Retries a couple of times on an actual id collision only.
 * @param {{ h: string, a: string, t: object[] }} payload
 * @returns {Promise<string|null>}
 */
export async function saveCircle(payload) {
  if (!supabase) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = randomId();
    const { error } = await supabase.from('circles').insert({ id, payload });
    if (!error) return id;
    if (error.code !== '23505') { // not a collision — a real failure, don't loop on it
      console.warn('saveCircle failed:', error.message);
      return null;
    }
  }
  return null;
}

/**
 * Look up a stored card summary by its exact short id via the get_circle()
 * function — anon can't SELECT the table directly, so the circles can't be
 * listed (see supabase/migrations/20261001_circles_get_rpc.sql). Used when a
 * recipient opens a shared ?id= link so the app can rebuild and show the
 * sharer's card. Returns null on any failure so the caller can fall back to
 * the normal landing page. The result is unvalidated — run it through
 * sanitizeCircle (circlePayload.js) before use.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function fetchCircle(id) {
  if (!supabase || !id || !/^[A-Za-z0-9]{6,12}$/.test(id)) return null;
  try {
    const { data, error } = await supabase.rpc('get_circle', { p_id: id });
    if (error || !data) return null;
    return data;
  } catch (err) {
    console.warn('fetchCircle failed:', err);
    return null;
  }
}
