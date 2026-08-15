// Per-card Open Graph image. Vercel Edge function that renders a 1200x630 PNG
// straight from the ?c= token, so link unfurls in iMessage / WhatsApp /
// Discord / X show the real card's colors, fonts, and data instead of a
// generic image. Reached via api/share's <meta property="og:image">.
//
// Deliberately sparse: this renders as a small link-preview thumbnail in a
// phone chat bubble, not a full-size image, so a Since/Prediction detail row
// (an earlier version of this had one) is just illegible noise at that size.
// Header, big score + per-team bar chart, archetype, handle — that's it.
//
// Plain object elements (no JSX) on purpose: Vercel's Edge Function bundler
// transforms JSX assuming a `react/jsx-runtime` import by default, and this
// project has no react dependency — that combination silently failed to
// build, so /api/og served nothing (a broken-image icon in link previews).
// satori (which @vercel/og renders through) only needs {type, props} objects
// shaped like this, so building the tree directly sidesteps the JSX
// transform/react dependency question entirely.
import { ImageResponse } from '@vercel/og';
import { sportsData } from '../teams.js';
import { getContrastAdaptedColor, estimateOgImageHeight } from '../cardVisuals.js';

export const config = { runtime: 'edge' };

function h(type, props, ...children) {
  const flat = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: { ...props, children: flat.length <= 1 ? flat[0] : flat } };
}

// Mirror of the client encodeCircle(): URL-safe base64 of a small JSON payload.
function decodeCircle(enc) {
  const b64 = enc.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

function teamById(id) {
  for (const lg in sportsData) {
    const t = sportsData[lg].teams.find(x => x.id === id);
    if (t) return { ...t, league: lg.toUpperCase() };
  }
  return null;
}

// CFL logos are vendored locally (/logos/cfl/*.png); make them absolute so
// satori can fetch them. ESPN logos are already absolute https URLs.
const absLogo = (logo, origin) => (logo.startsWith('/') ? origin + logo : logo);

// The live card is set entirely in Space Grotesk (--font-mono in style.css),
// not a generic sans — satori has no built-in fonts, so it has to be fetched
// as raw bytes and handed to ImageResponse. Google Fonts serves woff2 by
// default, which satori's font parser (opentype.js) can't read; spoofing a
// legacy-Safari UA on the CSS request gets back plain woff/ttf urls instead,
// both of which it does support. Cached per warm isolate so repeat requests
// (a link shared multiple times) don't re-fetch.
const LEGACY_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36';

async function loadGoogleFont(family, weight) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`;
  const css = await (await fetch(cssUrl, { headers: { 'User-Agent': LEGACY_UA } })).text();
  const match = css.match(/src: url\(([^)]+)\) format\('(?:woff|truetype|opentype)'\)/);
  if (!match) throw new Error(`could not resolve ${family} ${weight}`);
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

// Google's hosted Space Grotesk only goes up to weight 700 (no 800) — the
// card's own CSS asks for font-weight 800 in a few spots too, but a browser
// just resolves that to the nearest weight the family actually has, which is
// this same 700 file. Loading one weight and using 700 everywhere below
// matches what's actually rendering on the live card.
let fontsPromise = null;
function getFonts() {
  if (!fontsPromise) {
    fontsPromise = loadGoogleFont('Space Grotesk', 700).then((bold) => [
      { name: 'Space Grotesk', data: bold, weight: 700, style: 'normal' }
    ]);
  }
  return fontsPromise;
}


function scoreOf(teams) {
  const top = teams.find(t => t.top) || teams[0];
  const others = teams.filter(t => t !== top);
  if (!others.length) return top.score;
  return top.score * 0.6 + (others.reduce((s, t) => s + t.score, 0) / others.length) * 0.4;
}

// One chunky bar per team (logo, fill proportional to score, score value) —
// swapped in for the in-app rainbow-arc gauge, which packs the same info
// into fine detail that doesn't survive being shrunk to a chat-bubble
// thumbnail. Bars read as "who, and roughly how much" at a glance even tiny.
function barChart(teams, origin) {
  const rows = teams.slice(0, 4).map((team, i) => {
    const color = getContrastAdaptedColor(team.primary, team.secondary);
    const pct = Math.max(6, Math.min(100, team.score));
    return h('div', { style: { display: 'flex', alignItems: 'center', width: '100%', marginTop: i === 0 ? 0 : 20 } },
      team.logo
        ? h('img', { src: absLogo(team.logo, origin), width: 42, height: 42, style: { borderRadius: 999, background: '#fff', marginRight: 18, flexShrink: 0 } })
        : h('div', { style: { display: 'flex', width: 42, height: 42, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', marginRight: 18, flexShrink: 0 } }),
      h('div', { style: { display: 'flex', flex: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999 } },
        h('div', { style: { display: 'flex', width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 999 } })
      ),
      h('div', { style: { display: 'flex', width: 56, justifyContent: 'flex-end', marginLeft: 18, fontSize: 22, fontWeight: 700 } }, String(team.score))
    );
  });
  return h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1 } }, ...rows);
}

export default async function handler(req) {
  const { searchParams, origin } = new URL(req.url);

  let handle = '@GUEST';
  let archetype = 'SPORTS FAN';
  let teams = [];

  try {
    const c = searchParams.get('c');
    if (c) {
      const p = decodeCircle(c);
      handle = p.h ? '@' + String(p.h).replace(/^@/, '') : '@GUEST';
      archetype = (p.a || 'Sports Fan').toUpperCase();
      teams = (p.t || [])
        .map(tt => {
          const base = teamById(tt.i);
          return base ? { ...base, score: Number(tt.s) || 0, year: tt.y, prediction: tt.p, top: !!tt.top } : null;
        })
        .filter(Boolean)
        .sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0));
    }
  } catch {
    // fall through to the branded default below
  }

  const topTeam = teams.find(t => t.top) || teams[0] || null;
  const cardAccent = topTeam ? getContrastAdaptedColor(topTeam.primary, topTeam.secondary) : '#5B8DEF';

  // If Google Fonts is unreachable for some reason, fall back to satori's
  // default rather than failing the whole image — a slightly-off font beats
  // a broken-image icon in the link preview.
  let fonts = [];
  try {
    fonts = await getFonts();
  } catch (err) {
    console.warn('[api/og] font load failed, falling back to default sans:', err);
  }

  // Canvas height is fit to content instead of fixed at the 1200x630 "large
  // image" default — with a static height the block of content (which varies
  // 1-4 bars, 1-3 archetype lines) either left a lot of dead space below it
  // (typical case) or the reverse. api/share.js has to predict this same
  // number for its og:image:height tag without rendering anything, so the
  // formula lives in cardVisuals.js where both can use it.
  const height = estimateOgImageHeight(archetype, teams.length);

  // Header: brand left, "Loyalty Card" label right (mirrors the in-app card's
  // own header). Below that, the hero row (big score, bar chart), then the
  // archetype line and handle stacked underneath, full width. Background and
  // type match the live card exactly — same --bg-secondary (#0e1016) and
  // Space Grotesk (--font-mono) as style.css.
  const tree = h(
    'div',
    {
      style: {
        position: 'relative', width: '1200px', height: `${height}px`, display: 'flex', flexDirection: 'column',
        backgroundColor: '#0e1016',
        backgroundImage: `radial-gradient(circle at 10% 0%, ${cardAccent}22 0%, #0e1016 55%)`,
        padding: '48px 72px', color: '#f3f4f6',
        fontFamily: fonts.length ? 'Space Grotesk' : 'sans-serif'
      }
    },
    h('div', { style: { display: 'flex', width: '100%', alignItems: 'center' } },
      h('div', { style: { display: 'flex', flex: 1, alignItems: 'center', gap: 10 } },
        h('div', { style: { display: 'flex', width: 10, height: 10, borderRadius: 999, backgroundColor: cardAccent } }),
        h('div', { style: { display: 'flex', fontSize: 20, fontWeight: 700 } }, 'Fanlog')
      ),
      h('div', { style: { display: 'flex', fontSize: 14, fontWeight: 700, letterSpacing: 2, color: '#8e95a5' } }, 'LOYALTY CARD')
    ),
    h('div', { style: { display: 'flex', width: '100%', alignItems: 'center', marginTop: 24 } },
      h('div', { style: { display: 'flex', flexDirection: 'column', marginRight: 64 } },
        h('div', { style: { display: 'flex', fontSize: 132, fontWeight: 700, letterSpacing: -5, lineHeight: 1 } }, String(teams.length ? Math.round(scoreOf(teams)) : '--')),
        h('div', { style: { display: 'flex', fontSize: 20, fontWeight: 700, letterSpacing: 3, color: '#8e95a5', marginTop: 8 } }, 'FANLOG SCORE')
      ),
      barChart(teams, origin)
    ),
    h('div', { style: { display: 'flex', maxWidth: 1000, fontSize: 36, fontWeight: 700, lineHeight: 1.2, marginTop: 32 } }, archetype),
    h('div', { style: { display: 'flex', fontSize: 22, fontWeight: 700, color: '#8e95a5', marginTop: 14 } }, handle)
  );

  // Passing an empty array here (instead of omitting the key) would disable
  // @vercel/og's own bundled fallback font and hard-fail the whole image
  // ("No fonts are loaded") instead of just looking visually off — worse
  // than the font mismatch we're trying to fix.
  return new ImageResponse(tree, { width: 1200, height, fonts: fonts.length ? fonts : undefined });
}
