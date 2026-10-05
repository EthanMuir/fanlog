import { createClient } from '@supabase/supabase-js';

// Waitlist persistence.
//
//   form submit
//        │
//        ▼
//   saveWaitlistEntry(entry) ─► waitlist-signup edge function
//        │                        │ (Turnstile check currently disabled)
//        │                        ▼ public.waitlist (service_role)
//        ├─ ok     ─► success UI, HubSDK.track('waitlist_signup'),
//        │            localStorage mirror (dev only, for the dev admin panel)
//        └─ failed ─► inline error + retry, HubSDK.track('waitlist_signup_failed')
//
// The insert no longer goes anon → table directly (that path is closed by RLS).
// It goes through the edge function, which validates and size-caps each row.
// This function never throws; the caller decides what
// a failure means (main.js shows an error and lets the visitor retry, rather
// than showing a success screen for a signup that was never saved).

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
  : null;

/**
 * Send a waitlist signup through the waitlist-signup edge function.
 * Idempotent on email (upsert-ignore server-side), non-throwing.
 * @param {object} entry
 * @param {string} [token]  Cloudflare Turnstile token (ignored while the check is disabled)
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function saveWaitlistEntry(entry, token = '') {
  if (!supabase) {
    return { ok: false, error: 'supabase-not-configured' };
  }
  try {
    const { data, error } = await supabase.functions.invoke('waitlist-signup', {
      body: {
        token,
        name: entry.name ?? null,
        handle: entry.handle ?? null,
        email: String(entry.email || '').trim().toLowerCase(),
        top_team: entry.topTeam ?? null,
        teams: entry.teams ?? null,
        prediction: entry.prediction ?? null,
        overall_score: Number.isFinite(entry.overallScore) ? entry.overallScore : null,
        archetype: entry.archetype ?? null,
      },
    });
    if (error) {
      console.warn('Waitlist signup failed:', error.message);
      return { ok: false, error: error.message };
    }
    if (data && data.ok) return { ok: true };
    return { ok: false, error: (data && data.error) || 'unknown' };
  } catch (err) {
    console.warn('Waitlist signup threw:', err);
    return { ok: false, error: String(err) };
  }
}
