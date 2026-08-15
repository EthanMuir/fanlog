import { createClient } from '@supabase/supabase-js';

// Share-link short-id storage (same xdesk Supabase project as waitlist.js,
// separate table — see supabase/migrations/20260815_circles.sql).
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
 * @param {{ h: string, a: string, sc: number, t: object[] }} payload
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
