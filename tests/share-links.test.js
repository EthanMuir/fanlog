// circleLookup.js and the two Vercel Edge functions that render share links
// (api/share.js and api/og.js), with Supabase and Google Fonts faked through fetch.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { estimateOgImageHeight } from '../cardVisuals.js';
import { decodeCircle, encodeCircle, jsonResponse } from './helpers.js';

const SUPABASE = 'https://proj.supabase.test';

// What @vercel/og would render: the element tree and options, kept for asserting.
vi.mock('@vercel/og', () => ({
  ImageResponse: class {
    constructor(tree, opts) {
      this.tree = tree;
      this.opts = opts;
    }
  },
}));

// Payloads stored in public.circles, served through POST /rest/v1/rpc/get_circle
let circles;
let fetchLog;
let fontsUp;

function fakeFetch(url, init = {}) {
  url = String(url);
  fetchLog.push({ url, init });
  if (url === `${SUPABASE}/rest/v1/rpc/get_circle`) {
    const { p_id } = JSON.parse(init.body);
    return Promise.resolve(jsonResponse(circles[p_id] ?? null));
  }
  if (url.startsWith('https://fonts.googleapis.com/')) {
    if (!fontsUp) return Promise.reject(new Error('offline'));
    return Promise.resolve(new Response("@font-face { src: url(https://fonts.gstatic.test/sg.ttf) format('truetype'); }"));
  }
  if (url === 'https://fonts.gstatic.test/sg.ttf') return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
  return Promise.reject(new Error(`unexpected fetch ${url}`));
}

async function load({ configured = true } = {}) {
  vi.resetModules();
  vi.stubEnv('SUPABASE_URL', configured ? SUPABASE : '');
  vi.stubEnv('SUPABASE_ANON_KEY', configured ? 'anon-key' : '');
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  return {
    lookup: await import('../circleLookup.js'),
    share: (await import('../api/share.js')).default,
    og: (await import('../api/og.js')).default,
  };
}

const CARD = { h: 'BradyFan', a: 'Noble Sufferer', t: [{ i: 'bills', s: 91, top: 1 }, { i: 'knicks', s: 74, top: 0 }] };
const HUMAN = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const BOTS = [
  'facebookexternalhit/1.1',
  'WhatsApp/2.23.20.0',
  'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  'Twitterbot/1.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
  'TelegramBot (like TwitterBot)',
  'Mozilla/5.0 (compatible; Applebot/0.1)',
];

const req = (path, ua = HUMAN) => new Request(`https://fanlog.test${path}`, { headers: { 'user-agent': ua } });

beforeEach(() => {
  circles = { abc12345: CARD };
  fetchLog = [];
  fontsUp = true;
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('resolveCircle', () => {
  it('looks a short id up through get_circle with the anon key', async () => {
    const { lookup } = await load();
    expect(await lookup.resolveCircle(new URLSearchParams('id=abc12345'))).toEqual(CARD);
    const call = fetchLog[0];
    expect(call.init.method).toBe('POST');
    expect(call.init.headers.apikey).toBe('anon-key');
    expect(call.init.headers.Authorization).toBe('Bearer anon-key');
    expect(JSON.parse(call.init.body)).toEqual({ p_id: 'abc12345' });
  });

  it('decodes legacy ?c= links, including non-ASCII handles', async () => {
    const { lookup } = await load();
    const card = { ...CARD, h: 'Zoë' };
    expect(await lookup.resolveCircle(new URLSearchParams({ c: encodeCircle(card) }))).toEqual(card);
    expect(fetchLog).toHaveLength(0);
  });

  it('sanitizes whatever it resolves', async () => {
    const { lookup } = await load();
    circles.evil1234 = { h: '<script>', a: 'Click here', t: [{ i: 'bills', s: 9000 }] };
    expect(await lookup.resolveCircle(new URLSearchParams('id=evil1234'))).toEqual({ h: 'script', a: '', t: [{ i: 'bills', s: 100, top: 0 }] });
  });

  it('falls back to ?c= when the id does not resolve', async () => {
    const { lookup } = await load();
    const p = new URLSearchParams({ id: 'missing99', c: encodeCircle(CARD) });
    expect(await lookup.resolveCircle(p)).toEqual(CARD);
  });

  it('never queries Supabase for an id that cannot exist', async () => {
    const { lookup } = await load();
    for (const id of ['abc', 'abc12345678901', "abc123' or 1=1", 'abc-1234', '../etc']) {
      expect(await lookup.resolveCircle(new URLSearchParams({ id }))).toBeNull();
    }
    expect(fetchLog).toHaveLength(0);
  });

  it('returns null instead of throwing for bad input or a Supabase outage', async () => {
    const { lookup } = await load();
    expect(await lookup.resolveCircle(new URLSearchParams('c=%%%not-base64'))).toBeNull();
    expect(await lookup.resolveCircle(new URLSearchParams({ c: btoa('not json') }))).toBeNull();
    expect(await lookup.resolveCircle(new URLSearchParams())).toBeNull();
    fetch.mockImplementation(() => Promise.resolve(new Response('boom', { status: 500 })));
    expect(await lookup.resolveCircle(new URLSearchParams('id=abc12345'))).toBeNull();
    fetch.mockImplementation(() => Promise.reject(new Error('network down')));
    expect(await lookup.resolveCircle(new URLSearchParams('id=abc12345'))).toBeNull();
  });

  it('skips the lookup when Supabase is not configured', async () => {
    const { lookup } = await load({ configured: false });
    expect(await lookup.resolveCircle(new URLSearchParams('id=abc12345'))).toBeNull();
    expect(fetchLog).toHaveLength(0);
  });
});

describe('GET /share — people', () => {
  it('redirects a person to the app with the card inlined as ?c=', async () => {
    const { share } = await load();
    const res = await share(req('/share?id=abc12345&ref=BradyFan&utm_source=fanlog_share'));
    expect(res.status).toBe(302);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const loc = new URL(res.headers.get('location'));
    expect(loc.origin + loc.pathname).toBe('https://fanlog.test/');
    expect(loc.searchParams.get('ref')).toBe('BradyFan');
    expect(loc.searchParams.get('utm_source')).toBe('fanlog_share');
    expect(loc.searchParams.has('id')).toBe(false);
    expect(decodeCircle(loc.searchParams.get('c'))).toEqual(CARD);
  });

  it('forwards the id when it cannot be resolved server-side', async () => {
    const { share } = await load();
    const res = await share(req('/share?id=missing99'));
    expect(res.headers.get('location')).toBe('https://fanlog.test/?id=missing99');
  });

  it('forwards a legacy ?c= untouched', async () => {
    const { share } = await load();
    const c = encodeCircle(CARD);
    const res = await share(req(`/share?c=${c}&ref=x`));
    expect(res.headers.get('location')).toBe(`https://fanlog.test/?ref=x&c=${c}`);
    expect(fetchLog).toHaveLength(0);
  });

  it('sends a bare /share to the landing page', async () => {
    const { share } = await load();
    expect((await share(req('/share'))).headers.get('location')).toBe('https://fanlog.test/?');
  });

  it('treats a request with no user agent as a person', async () => {
    const { share } = await load();
    const res = await share(new Request('https://fanlog.test/share?id=abc12345'));
    expect(res.status).toBe(302);
  });
});

describe('GET /share — link-preview crawlers', () => {
  for (const ua of BOTS) {
    it(`serves the card's Open Graph tags to ${ua.slice(0, 40)}`, async () => {
      const { share } = await load();
      const res = await share(req('/share?id=abc12345&ref=BradyFan', ua));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(res.headers.get('cache-control')).toBe('no-store');
      const html = await res.text();
      expect(html).toContain(`<meta property="og:title" content="@BradyFan's FanLog Loyalty Card">`);
      expect(html).toContain('<meta property="og:image" content="https://fanlog.test/api/og?id=abc12345">');
      expect(html).toContain('<meta property="og:url" content="https://fanlog.test/?ref=BradyFan&amp;id=abc12345">');
    });
  }

  it('describes the card with a score computed from the teams, never one from the link', async () => {
    const { share } = await load();
    circles.abc12345 = { ...CARD, sc: 12 };
    const html = await (await share(req('/share?id=abc12345', BOTS[0]))).text();
    expect(html).toContain('content="Noble Sufferer · FanLog Score 97 — build your own Loyalty Card."');
  });

  it('ignores unknown team ids when scoring and sizing', async () => {
    const { share } = await load();
    circles.abc12345 = { h: 'x', a: 'Noble Sufferer', t: [{ i: 'bills', s: 100 }, { i: 'not_a_team', s: 0 }] };
    const html = await (await share(req('/share?id=abc12345', BOTS[0]))).text();
    expect(html).toContain('FanLog Score 100');
    expect(html).toContain(`<meta property="og:image:height" content="${estimateOgImageHeight('NOBLE SUFFERER', 1)}">`);
  });

  it('falls back to generic copy for an unknown or broken link', async () => {
    const { share } = await load();
    const html = await (await share(req('/share?id=missing99', BOTS[0]))).text();
    expect(html).toContain('<title>FanLog — Your Sports Identity</title>');
    expect(html).toContain('Build your Loyalty Card and reveal your FanLog Score.');
    expect(html).toContain('Open this Loyalty Card');
  });

  it('cannot be used to inject markup', async () => {
    const { share } = await load();
    const ref = '"><script>alert(1)</script>';
    const c = encodeCircle({ h: '"><img src=x onerror=alert(1)>', a: '<b>x</b>', t: [] });
    const html = await (await share(req(`/share?c=${encodeURIComponent(c)}&ref=${encodeURIComponent(ref)}&utm_source=%22%3E%3Cx`, BOTS[0]))).text();
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toMatch(/content="[^"]*"[^ >\n]/);
    expect(html.match(/<script/g)).toBeNull();
  });
});

// Walk the satori element tree, collecting its text and image sources.
function texts(node, out = []) {
  if (node == null || node === false) return out;
  if (typeof node === 'string' || typeof node === 'number') out.push(String(node));
  else if (Array.isArray(node)) node.forEach((n) => texts(n, out));
  else if (node.props) {
    if (node.type === 'img') out.push(`img:${node.props.src}`);
    texts(node.props.children, out);
  }
  return out;
}

describe('GET /api/og', () => {
  it("renders the card's score, archetype, handle and team logos", async () => {
    const { og } = await load();
    const img = await og(req('/api/og?id=abc12345', BOTS[0]));
    const t = texts(img.tree);
    expect(t).toContain('97');
    expect(t).toContain('NOBLE SUFFERER');
    expect(t).toContain('@BradyFan');
    expect(t).toContain('91');
    expect(t).toContain('img:https://a.espncdn.com/i/teamlogos/nfl/500/buf.png');
    expect(img.opts.width).toBe(900);
    expect(img.opts.fonts).toEqual([expect.objectContaining({ name: 'Space Grotesk', weight: 700 })]);
  });

  it('puts the top team first and makes local logos absolute', async () => {
    const { og } = await load();
    circles.abc12345 = { h: 'x', a: '', t: [{ i: 'knicks', s: 10 }, { i: 'argonauts', s: 80, top: 1 }] };
    const imgs = texts((await og(req('/api/og?id=abc12345'))).tree).filter((s) => s.startsWith('img:'));
    expect(imgs[0]).toMatch(/^img:https:\/\/fanlog\.test\/logos\/cfl\//);
    expect(imgs[1]).toBe('img:https://a.espncdn.com/i/teamlogos/nba/500/nyk.png');
  });

  it('is the height /share tells crawlers it will be', async () => {
    const { og, share } = await load();
    const cases = [
      CARD,
      { h: '', a: '', t: [] },
      { h: 'a', a: 'Supporters\' Section Capo', t: [1, 2, 3, 4].map((n) => ({ i: ['bills', 'leafs', 'lakers', 'cubs'][n - 1], s: 50 })) },
      { h: 'b', a: 'Coast-to-Coast Analyst', t: [{ i: 'bills', s: 5 }, { i: 'nope', s: 5 }] },
    ];
    for (const [n, card] of cases.entries()) {
      circles[`case${n}abc`] = card;
      const img = await og(req(`/api/og?id=case${n}abc`));
      const html = await (await share(req(`/share?id=case${n}abc`, BOTS[0]))).text();
      const meta = Number(html.match(/og:image:height" content="(\d+)"/)[1]);
      expect(img.opts.height, JSON.stringify(card)).toBe(meta);
    }
  });

  it('draws a branded default for a missing card', async () => {
    const { og } = await load();
    const t = texts((await og(req('/api/og?id=missing99'))).tree);
    expect(t).toEqual(expect.arrayContaining(['--', 'SPORTS FAN', '@GUEST', 'LOYALTY CARD']));
  });

  it('still renders, with the bundled font, when Google Fonts is down', async () => {
    fontsUp = false;
    const { og } = await load();
    const img = await og(req('/api/og?id=abc12345'));
    expect(img.opts.fonts).toBeUndefined();
    expect(img.tree.props.style.fontFamily).toBe('sans-serif');
  });

  it('retries the font after a failed load instead of giving up for the life of the instance', async () => {
    fontsUp = false;
    const { og } = await load();
    expect((await og(req('/api/og?id=abc12345'))).opts.fonts).toBeUndefined();
    fontsUp = true;
    expect((await og(req('/api/og?id=abc12345'))).opts.fonts).toHaveLength(1);
  });

  it('only fetches the font once per instance', async () => {
    const { og } = await load();
    await og(req('/api/og?id=abc12345'));
    await og(req('/api/og?id=abc12345'));
    expect(fetchLog.filter((f) => f.url.startsWith('https://fonts.googleapis.com/'))).toHaveLength(1);
  });
});
