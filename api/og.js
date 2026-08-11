// Per-card Open Graph image. Vercel Edge function that renders a 1200x630 PNG of
// a shared FanLog Loyalty Card straight from the ?c= token, so link unfurls in
// iMessage / WhatsApp / Discord / X show the actual card instead of a generic
// image. Reached via api/share's <meta property="og:image">.
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
    if (t) return t;
  }
  return null;
}

// CFL logos are vendored locally (/logos/cfl/*.png); make them absolute so
// satori can fetch them. ESPN logos are already absolute https URLs.
const absLogo = (logo, origin) => (logo.startsWith('/') ? origin + logo : logo);

export default function handler(req) {
  const { searchParams, origin } = new URL(req.url);

  let handle = '';
  let archetype = 'Sports Fan';
  let score = 0;
  let teams = [];

  try {
    const c = searchParams.get('c');
    if (c) {
      const p = decodeCircle(c);
      handle = p.h ? '@' + String(p.h).replace(/^@/, '') : '@GUEST';
      archetype = (p.a || 'Sports Fan').toUpperCase();
      score = Number(p.sc) || 0;
      teams = (p.t || [])
        .map(tt => {
          const base = teamById(tt.i);
          return base ? { ...base, score: Number(tt.s) || 0, top: !!tt.top } : null;
        })
        .filter(Boolean)
        .sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0));
    }
  } catch {
    // fall through to the branded default below
  }

  const topTeam = teams.find(t => t.top) || teams[0];
  const primary = topTeam ? topTeam.primary : '#5B8DEF';
  const secondary = topTeam ? topTeam.secondary : '#111318';

  const tree = h(
    'div',
    {
      style: {
        position: 'relative',
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px',
        color: '#FFFFFF',
        backgroundColor: '#0A0B0F',
        backgroundImage: `linear-gradient(135deg, ${primary} 0%, #0A0B0F 60%)`,
        fontFamily: 'sans-serif'
      }
    },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      h('div', { style: { display: 'flex', fontSize: 34, fontWeight: 800, letterSpacing: 2 } }, 'FANLOG'),
      h('div', { style: { display: 'flex', fontSize: 26, opacity: 0.85 } }, 'Loyalty Card')
    ),
    h('div', { style: { display: 'flex', flexDirection: 'column' } },
      h('div', { style: { display: 'flex', fontSize: 30, opacity: 0.85, letterSpacing: 1 } }, 'FANLOG SCORE'),
      h('div', { style: { display: 'flex', alignItems: 'flex-end' } },
        h('div', { style: { display: 'flex', fontSize: 200, fontWeight: 900, lineHeight: 1 } }, String(score || '--'))
      ),
      h('div', { style: { display: 'flex', fontSize: 48, fontWeight: 800, marginTop: 12 } }, archetype)
    ),
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      h('div', { style: { display: 'flex', fontSize: 40, fontWeight: 700 } }, handle || '@GUEST'),
      h('div', { style: { display: 'flex', alignItems: 'center' } },
        ...teams.slice(0, 5).map((t, i) =>
          h('img', {
            src: absLogo(t.logo, origin),
            width: 84,
            height: 84,
            style: { marginLeft: i === 0 ? 0 : 16, objectFit: 'contain' }
          })
        )
      )
    ),
    h('div', {
      style: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '1200px',
        height: '10px',
        backgroundColor: secondary
      }
    })
  );

  return new ImageResponse(tree, { width: 1200, height: 630 });
}
