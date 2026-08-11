// Per-card Open Graph image. Vercel Edge function that renders a 1200x630 PNG
// mirroring the actual in-app Loyalty Card (rainbow score gauge, team legend,
// meta row, footer) straight from the ?c= token, so link unfurls in iMessage /
// WhatsApp / Discord / X show the real card design instead of a generic image.
// Reached via api/share's <meta property="og:image">.
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

// Mirror of the client getLuminance()/getContrastAdaptedColor() — picks
// whichever of a team's two colors reads against the card's dark background.
function getLuminance(hex) {
  if (!hex) return 0;
  let c = hex.replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function getContrastAdaptedColor(primaryHex, secondaryHex) {
  const brightness = getLuminance(primaryHex);
  if (brightness < 45 && secondaryHex && getLuminance(secondaryHex) > brightness) return secondaryHex;
  return primaryHex;
}

function predictionLabel(league, short) {
  const prefix = short ? `${short} ` : '';
  switch ((league || '').toLowerCase()) {
    case 'nhl': return `${prefix}CUP`;
    case 'nfl': return `${prefix}BOWL`;
    case 'nba': return `${prefix}TITLE`;
    case 'mlb': return `${prefix}SERIES`;
    case 'mls': return `${prefix}CUP`;
    default: return `${prefix}TITLE`;
  }
}

// Same geometry as the in-app rainbow gauge (initializeRainbowSVG/updateRainbowSVG
// in main.js): four concentric half-circle tracks, each filled proportional to
// that team's score, with a logo badge at the fill's leading edge.
function rainbowGauge(teams, origin) {
  const radii = [130, 108, 86, 64];
  const cx = 150;
  const cy = 160;
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

  return h('div', { style: { position: 'relative', display: 'flex', justifyContent: 'center', width: '320px', marginTop: 6, marginBottom: 6 } },
    h('svg', { width: 320, height: 192, viewBox: '0 0 300 180' }, ...arcs),
    h('div', {
      style: {
        position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center'
      }
    },
      h('div', { style: { display: 'flex', fontSize: 64, fontWeight: 800, letterSpacing: -2, lineHeight: 1 } }, String(teams.length ? Math.round(scoreOf(teams)) : '--')),
      h('div', { style: { display: 'flex', fontSize: 13, fontWeight: 700, letterSpacing: 2, color: '#8e95a5', marginTop: 4 } }, 'FANLOG SCORE')
    )
  );
}

function scoreOf(teams) {
  const top = teams.find(t => t.top) || teams[0];
  const others = teams.filter(t => t !== top);
  if (!others.length) return top.score;
  return top.score * 0.6 + (others.reduce((s, t) => s + t.score, 0) / others.length) * 0.4;
}

function legendChip(team, origin) {
  const color = getContrastAdaptedColor(team.primary, team.secondary);
  return h('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
      borderLeft: `3px solid ${color}`, borderRadius: 999, padding: '6px 14px 6px 10px'
    }
  },
    h('img', { src: absLogo(team.logo, origin), width: 20, height: 20, style: { borderRadius: 999, background: '#fff' } }),
    h('div', { style: { display: 'flex', fontSize: 15, fontWeight: 700, color: '#8e95a5' } }, team.short),
    h('div', { style: { display: 'flex', fontSize: 15, fontWeight: 800, color: '#f3f4f6' } }, String(team.score))
  );
}

function metaBox(label, value) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } },
    h('div', { style: { display: 'flex', fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#8e95a5' } }, label.toUpperCase()),
    h('div', { style: { display: 'flex', fontSize: 15, fontWeight: 700, color: '#f3f4f6', marginTop: 4 } }, String(value || '----').toUpperCase())
  );
}

export default function handler(req) {
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

  const tree = h(
    'div',
    {
      style: {
        position: 'relative', width: '1200px', height: '630px', display: 'flex',
        alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0B0F',
        backgroundImage: `radial-gradient(circle at 50% 15%, ${cardAccent}33 0%, #0A0B0F 62%)`,
        fontFamily: 'sans-serif'
      }
    },
    h('div', {
      style: {
        position: 'relative', width: '420px', height: '608px', display: 'flex', flexDirection: 'column',
        backgroundColor: '#0e1016', border: '1.5px solid rgba(255,255,255,0.14)', borderRadius: 24, padding: '24px 28px'
      }
    },
      h('div', { style: { display: 'flex', width: '100%', justifyContent: 'center', marginBottom: 14 } },
        h('div', {
          style: {
            display: 'flex', maxWidth: 360, fontSize: 17, fontWeight: 800, letterSpacing: 0.5, textAlign: 'center',
            color: '#f3f4f6', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 999, padding: '7px 18px'
          }
        }, archetype)
      ),
      h('div', { style: { display: 'flex', justifyContent: 'center' } }, rainbowGauge(teams, origin)),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 8, marginBottom: 14 } },
        ...teams.slice(0, 4).map(t => legendChip(t, origin))
      ),
      h('div', {
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14, marginBottom: 14
        }
      },
        metaBox('Fan ID', handle),
        h('div', { style: { display: 'flex', width: '100%', marginTop: 14 } },
          h('div', { style: { display: 'flex', flex: 1, justifyContent: 'center' } },
            metaBox(topTeam ? `${topTeam.short} SINCE` : 'FAN SINCE', topTeam ? topTeam.year : null)),
          h('div', { style: { display: 'flex', flex: 1, justifyContent: 'center' } },
            metaBox(topTeam ? predictionLabel(topTeam.league, topTeam.short) + ' PREDICTION' : 'PREDICTION', topTeam ? topTeam.prediction : null))
        )
      ),
      h('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginTop: 'auto'
        }
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
          h('div', { style: { display: 'flex', width: 8, height: 8, borderRadius: 999, backgroundColor: cardAccent } }),
          h('div', { style: { display: 'flex', fontSize: 13, fontWeight: 700, color: '#8e95a5', letterSpacing: 0.5 } }, 'Fanlog')
        ),
        h('div', { style: { display: 'flex', fontSize: 12, fontWeight: 700, color: '#8e95a5' } }, 'FL-2026-INDEX')
      )
    )
  );

  return new ImageResponse(tree, { width: 1200, height: 630 });
}
