import { createClient } from '@supabase/supabase-js';

// Waitlist persistence.
//
//   form submit (+ Cloudflare Turnstile token)
//        │
//        ├─► HubSDK.track('waitlist_signup')   (xdesk analytics funnel — unchanged)
//        ├─► saveWaitlistEntry(entry, token) ─► waitlist-signup edge function
//        │                                        │ verifies captcha server-side
//        │                                        ▼ public.waitlist (service_role)
//        └─► localStorage mirror   (dev-only admin panel)
//
// The insert no longer goes anon → table directly (that path is closed by RLS).
// It goes through the captcha-gated edge function, so the public anon key can't
// be used to spam signups. All failures here are non-fatal: the signup already
// reached xdesk, so a DB/captcha hiccup must not break the success UX.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
  : null;

/**
 * Send a waitlist signup through the captcha-gated edge function.
 * Idempotent on email (upsert-ignore server-side), non-throwing.
 * @param {object} entry
 * @param {string} token  Cloudflare Turnstile response token
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function saveWaitlistEntry(entry, token) {
  if (!supabase) {
    return { ok: false, error: 'supabase-not-configured' };
  }
  if (!token) {
    return { ok: false, error: 'missing-captcha' };
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
