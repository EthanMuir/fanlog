import { createClient } from '@supabase/supabase-js';

// Anonymous fan identity + unique usernames (see
// supabase/migrations/20261007_fans_and_handles.sql).
//
// getFanId(): a random UUID per browser, kept in localStorage. It's the
// analytics user_id and links waitlist signups and usernames to the same
// person. It's also what proves ownership of a username, so it must never
// go into share links or the public circles payload.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
  : null;

const FAN_ID_KEY = 'fanlog_fan_id';
const HANDLE_KEY = 'fanlog_handle';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Usernames: 3–20 letters, digits or underscores. Must match claim_handle().
export const HANDLE_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

function newUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let cachedFanId = null;

export function getFanId() {
  if (cachedFanId) return cachedFanId;
  try {
    const stored = localStorage.getItem(FAN_ID_KEY);
    if (stored && UUID_PATTERN.test(stored)) return (cachedFanId = stored);
  } catch { /* storage blocked: fall through to a per-visit id */ }
  cachedFanId = newUuid();
  try { localStorage.setItem(FAN_ID_KEY, cachedFanId); } catch { /* ignore */ }
  return cachedFanId;
}

// The username this browser last claimed, used to pre-fill the quiz.
export function getLastHandle() {
  try {
    const h = localStorage.getItem(HANDLE_KEY) || '';
    return HANDLE_PATTERN.test(h) ? h : '';
  } catch {
    return '';
  }
}

/**
 * Claim a username for this browser's fan id.
 * @param {string} handle
 * @returns {Promise<'ok'|'taken'|'invalid'|'unavailable'>} 'unavailable' means
 *   the check couldn't run (offline, Supabase not configured); callers let the
 *   fan continue rather than block the flow.
 */
export async function claimHandle(handle) {
  if (!HANDLE_PATTERN.test(handle)) return 'invalid';
  if (!supabase) return 'unavailable';
  try {
    const { data, error } = await supabase.rpc('claim_handle', { p_fan_id: getFanId(), p_handle: handle });
    if (error || !['ok', 'taken', 'invalid'].includes(data)) return 'unavailable';
    if (data === 'ok') {
      try { localStorage.setItem(HANDLE_KEY, handle); } catch { /* ignore */ }
    }
    return data;
  } catch {
    return 'unavailable';
  }
}
