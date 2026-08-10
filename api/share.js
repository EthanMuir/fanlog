// Share landing route (mapped from /share via vercel.json). Link-unfurling
// crawlers (iMessage, WhatsApp, Discord, Slack, X, Facebook) fetch this URL and
// read its per-card Open Graph / Twitter tags — they never run the app's JS — so
// we render those tags server-side here, pointing og:image at /api/og. Real
// users are immediately redirected into the app at /?c=… to see the live card.
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
  try {
    if (c) {
      const p = decodeCircle(c);
      handle = p.h ? '@' + String(p.h).replace(/^@/, '') : '';
      archetype = p.a || '';
      score = p.sc != null ? String(p.sc) : '';
    }
  } catch {
    // ignore — fall back to generic copy
  }

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
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(appUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<meta http-equiv="refresh" content="0; url=${esc(appUrl)}">
<script>location.replace(${JSON.stringify(appUrl)});</script>
</head>
<body style="font-family:sans-serif;background:#0A0B0F;color:#fff;padding:40px">
Opening your FanLog Loyalty Card… <a style="color:#5B8DEF" href="${esc(appUrl)}">Continue</a>
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
