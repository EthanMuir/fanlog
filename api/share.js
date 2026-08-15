// Share landing route (mapped from /share via vercel.json). Link-unfurling
// crawlers (iMessage, WhatsApp, Discord, Slack, X, Facebook) fetch this URL and
// read its per-card Open Graph / Twitter tags — they never run the app's JS —
// so we render those tags server-side here, pointing og:image at /api/og.
//
// This page deliberately does NOT auto-redirect. iMessage's link-preview
// fetcher (and some other unfurlers) follows an instant meta-refresh/JS
// redirect before reading the page's own tags, landing on /?c=… instead —
// which only has the generic site-wide OG tags, not this card's — so the
// preview silently lost its per-card thumbnail. Real users get a lightweight
// branded landing page with the card thumbnail and a tap-through button into
// the app instead of an invisible instant hop.
import { estimateOgImageHeight, OG_IMAGE_WIDTH } from '../cardVisuals.js';

export const config = { runtime: 'edge' };

function decodeCircle(enc) {
  const b64 = enc.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export default function handler(req) {
  const url = new URL(req.url);
  const { origin } = url;
  const c = url.searchParams.get('c') || '';
  const ref = url.searchParams.get('ref') || '';
  const utm = url.searchParams.get('utm_source') || '';

  // Human destination: the real app deep link, which rebuilds the card client-side.
  const appParams = new URLSearchParams();
  if (ref) appParams.set('ref', ref);
  if (utm) appParams.set('utm_source', utm);
  if (c) appParams.set('c', c);
  const appUrl = `${origin}/?${appParams.toString()}`;

  const ogImage = `${origin}/api/og${c ? `?c=${encodeURIComponent(c)}` : ''}`;

  // Pull display fields from the token for a nicer unfurl title/description.
  let handle = '';
  let archetype = '';
  let score = '';
  let teamCount = 0;
  try {
    if (c) {
      const p = decodeCircle(c);
      handle = p.h ? '@' + String(p.h).replace(/^@/, '') : '';
      archetype = p.a || '';
      score = p.sc != null ? String(p.sc) : '';
      teamCount = Array.isArray(p.t) ? p.t.length : 0;
    }
  } catch {
    // ignore — fall back to generic copy
  }

  // Must match api/og.js's own height computation — that's the image this
  // tag is describing, and a wrong hint can make strict unfurlers letterbox
  // or crop it.
  const ogImageHeight = estimateOgImageHeight(archetype.toUpperCase(), teamCount);

  const title = handle ? `${handle}'s FanLog Loyalty Card` : 'FanLog — Your Sports Identity';
  const description = archetype
    ? `${archetype}${score ? ` · FanLog Score ${score}` : ''} — build your own Loyalty Card.`
    : 'Build your Loyalty Card and reveal your FanLog Score.';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="FanLog">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="${OG_IMAGE_WIDTH}">
<meta property="og:image:height" content="${ogImageHeight}">
<meta property="og:url" content="${esc(appUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<style>
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0A0B0F; color: #fff; padding: 40px 24px; box-sizing: border-box; text-align: center; }
  img { max-width: min(480px, 100%); border-radius: 16px; box-shadow: 0 20px 45px rgba(0,0,0,0.5); }
  a.btn { display: inline-block; padding: 14px 28px; border-radius: 10px; background: #5B8DEF; color: #fff;
    font-weight: 700; text-decoration: none; font-size: 1rem; }
</style>
</head>
<body>
<img src="${esc(ogImage)}" alt="${esc(title)}" width="${OG_IMAGE_WIDTH}" height="${ogImageHeight}">
<a class="btn" href="${esc(appUrl)}">Open ${handle ? `${esc(handle)}'s` : 'this'} Loyalty Card →</a>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Cache the unfurl HTML briefly so repeated crawler hits are cheap.
      'cache-control': 'public, max-age=300, s-maxage=300'
    }
  });
}
