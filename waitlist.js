import { createClient } from '@supabase/supabase-js';

// Waitlist persistence.
//
//   form submit
//        │
//        ├─► HubSDK.track('waitlist_signup')   (xdesk analytics funnel — unchanged)
//        ├─► saveWaitlistEntry()  ──► public.waitlist  (durable, structured store)
//        └─► localStorage mirror   (dev-only admin panel)
//
// The Supabase client uses the PUBLIC anon key, so the `waitlist` table's RLS
// allows INSERT only (see supabase/migrations/20260802_waitlist.sql). Reads are
// service-role only. All failures here are non-fatal: the signup already
// reached xdesk, so a DB hiccup must not break the success UX.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
  : null;

/**
 * Insert a waitlist signup. Idempotent on email (upsert-ignore), non-throwing.
 * @param {object} entry
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function saveWaitlistEntry(entry) {
  if (!supabase) {
    return { ok: false, error: 'supabase-not-configured' };
  }
  try {
    const row = {
      name: entry.name ?? null,
      handle: entry.handle ?? null,
      email: String(entry.email || '').trim().toLowerCase(),
      top_team: entry.topTeam ?? null,
      teams: entry.teams ?? null,
      prediction: entry.prediction ?? null,
      overall_score: Number.isFinite(entry.overallScore) ? entry.overallScore : null,
      archetype: entry.archetype ?? null,
    };
    // ignoreDuplicates: a repeat email is a no-op, not an error.
    const { error } = await supabase
      .from('waitlist')
      .upsert(row, { onConflict: 'email', ignoreDuplicates: true });
    if (error) {
      console.warn('Waitlist DB insert failed:', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.warn('Waitlist DB insert threw:', err);
    return { ok: false, error: String(err) };
  }
}
