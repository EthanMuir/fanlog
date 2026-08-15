// Per-card Open Graph image. Vercel Edge function that renders a 1200x630 PNG
// straight from the ?c= token, so link unfurls in iMessage / WhatsApp /
// Discord / X show the real card's colors, fonts, and data instead of a
// generic image. Reached via api/share's <meta property="og:image">.
//
// Deliberately sparse: this renders as a small link-preview thumbnail in a
// phone chat bubble, not a full-size image, so per-team scores and a
// Since/Prediction detail row (an earlier version of this had both) are just
// illegible noise at that size. Score + gauge + archetype + handle is the
// whole hook — everything else got cut.
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
import { RAINBOW_RADII, RAINBOW_CX, RAINBOW_CY, getContrastAdaptedColor } from '../cardVisuals.js';

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


// Same geometry as the in-app rainbow gauge (initializeRainbowSVG/updateRainbowSVG
// in main.js): four concentric half-circle tracks, each filled proportional to
// that team's score, with a logo badge at the fill's leading edge. Only the
// container's rendered width/height changes between layouts — the arc math
// runs in the shared 300x180 viewBox coordinate space either way, so this
// stays visually identical to the in-app gauge at any size.
function rainbowGauge(teams, origin) {
  const radii = RAINBOW_RADII;
  const cx = RAINBOW_CX;
  const cy = RAINBOW_CY;
  const arcs = radii.map((r, i) => {
    const team = teams[i];
    const C = 2 * Math.PI * r;
    const halfC = Math.PI * r;
    const track = h('circle', {
      cx, cy, r, fill: 'none', stroke: 'rgba(255,255,255,0.08)', 'stroke-width': 10,
      'stroke-dasharray': `${halfC} ${C}`, transform: `rotate(180, ${cx}, ${cy})`, 'stroke-linecap': 'round'
    });
    if (!team) return track;

    const color = getContrastAdaptedColor(team.primary, team.secondary);
    const L = (team.score / 100) * halfC;
    const angle = Math.PI * (1 - team.score / 100);
    const x = cx + r * Math.cos(angle);
    const y = cy - r * Math.sin(angle);
    return h('g', {},
      track,
      h('circle', {
        cx, cy, r, fill: 'none', stroke: color, 'stroke-width': 10,
        'stroke-dasharray': `${L} ${C - L}`, transform: `rotate(180, ${cx}, ${cy})`, 'stroke-linecap': 'round'
      }),
      h('circle', { cx: x, cy: y, r: 13, fill: '#ffffff', stroke: color, 'stroke-width': 2 }),
      team.logo ? h('image', { href: absLogo(team.logo, origin), x: x - 9, y: y - 9, width: 18, height: 18 }) : null
    );
  });

  return h('div', { style: { position: 'relative', display: 'flex', justifyContent: 'center', width: '560px' } },
    h('svg', { width: 560, height: 336, viewBox: '0 0 300 180' }, ...arcs),
    h('div', {
      style: {
        position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center'
      }
    },
      h('div', { style: { display: 'flex', fontSize: 112, fontWeight: 700, letterSpacing: -4, lineHeight: 1 } }, String(teams.length ? Math.round(scoreOf(teams)) : '--')),
      h('div', { style: { display: 'flex', fontSize: 20, fontWeight: 700, letterSpacing: 3, color: '#8e95a5', marginTop: 8 } }, 'FANLOG SCORE')
    )
  );
}

function scoreOf(teams) {
  const top = teams.find(t => t.top) || teams[0];
  const others = teams.filter(t => t !== top);
  if (!others.length) return top.score;
  return top.score * 0.6 + (others.reduce((s, t) => s + t.score, 0) / others.length) * 0.4;
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

  // Small brand mark top-left, then one centered hero row: the gauge+score
  // on the left, archetype + handle stacked on the right. Background and
  // type match the live card exactly — same --bg-secondary (#0e1016) and
  // Space Grotesk (--font-mono) as style.css.
  const tree = h(
    'div',
    {
      style: {
        position: 'relative', width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
        backgroundColor: '#0e1016',
        backgroundImage: `radial-gradient(circle at 10% 0%, ${cardAccent}22 0%, #0e1016 55%)`,
        padding: '56px 72px', color: '#f3f4f6',
        fontFamily: fonts.length ? 'Space Grotesk' : 'sans-serif'
      }
    },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
      h('div', { style: { display: 'flex', width: 10, height: 10, borderRadius: 999, backgroundColor: cardAccent } }),
      h('div', { style: { display: 'flex', fontSize: 20, fontWeight: 700 } }, 'Fanlog')
    ),
    h('div', { style: { display: 'flex', width: '100%', flex: 1, alignItems: 'center' } },
      h('div', { style: { display: 'flex', justifyContent: 'center' } }, rainbowGauge(teams, origin)),
      h('div', { style: { display: 'flex', flexDirection: 'column', marginLeft: 64 } },
        h('div', { style: { display: 'flex', maxWidth: 500, fontSize: 44, fontWeight: 700, letterSpacing: 0.5, lineHeight: 1.15 } }, archetype),
        h('div', { style: { display: 'flex', width: 220, height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 22, marginBottom: 22 } }),
        h('div', { style: { display: 'flex', fontSize: 24, fontWeight: 700, color: '#8e95a5' } }, handle)
      )
    )
  );

  // Passing an empty array here (instead of omitting the key) would disable
  // @vercel/og's own bundled fallback font and hard-fail the whole image
  // ("No fonts are loaded") instead of just looking visually off — worse
  // than the font mismatch we're trying to fix.
  return new ImageResponse(tree, { width: 1200, height: 630, fonts: fonts.length ? fonts : undefined });
}
