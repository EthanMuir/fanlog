// Validation for the shared-card summary ({ h, a, t }) that travels in share
// links (?c=) and the public.circles table (?id=). Both of those are
// attacker-controlled: anyone can hand-craft a ?c= link or insert a circles
// row with the public anon key. So every reader — the recipient view in
// main.js and the link-preview renderers (api/og.js, api/share.js via
// circleLookup.js) — runs the payload through sanitizeCircle() first:
//
//   h  handle    → stripped to letters/digits/_/-, capped at MAX_HANDLE_LENGTH
//   a  archetype → kept only if the archetype engine can actually produce it
//                  (so a link can't put arbitrary text in a FanLog preview)
//   t  teams     → at most MAX_TEAMS, scores clamped to 0–100
//
// The overall FanLog Score is never read from the payload: readers compute it
// from the team scores with computeFanScore (cardVisuals.js).
import { KNOWN_ARCHETYPES } from './archetypes.js';

export const MAX_HANDLE_LENGTH = 24;
export const MAX_TEAMS = 4;

export function sanitizeHandle(raw) {
  return String(raw ?? '')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, MAX_HANDLE_LENGTH);
}

function clampScore(s) {
  return Math.max(0, Math.min(100, Math.round(Number(s) || 0)));
}

export function sanitizeCircle(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const teams = (Array.isArray(payload.t) ? payload.t : [])
    .filter((tt) => tt && typeof tt.i === 'string' && tt.i.length <= 40)
    .slice(0, MAX_TEAMS)
    .map((tt) => ({ i: tt.i, s: clampScore(tt.s), top: tt.top ? 1 : 0 }));
  return {
    h: sanitizeHandle(payload.h),
    a: typeof payload.a === 'string' && KNOWN_ARCHETYPES.has(payload.a) ? payload.a : '',
    t: teams,
  };
}
