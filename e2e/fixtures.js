// Test fixtures: a fake Supabase (REST, RPC, edge functions) recorded per
// test, every other outside host blocked or stubbed, and a check that the
// page threw no uncaught errors.
import { test as base, expect } from '@playwright/test';
import { ANON_KEY, SUPABASE_URL } from './env.js';

// 1x1 transparent PNG for team logos (ESPN) so cards render offline
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

class FakeSupabase {
  constructor() {
    this.requests = [];
    // Saved cards, by short id (public.circles)
    this.circles = {};
    // What claim_handle() answers: 'ok' | 'taken' | 'invalid' | 'error' | a function(handle)
    this.claimResult = 'ok';
    // Status for POST /rest/v1/circles (201 saves, anything else fails)
    this.circlesStatus = 201;
    // Body/status for the waitlist-signup edge function
    this.waitlist = { status: 200, body: { ok: true } };
  }

  // Requests to `path`, with parsed JSON bodies
  calls(path) {
    return this.requests.filter((r) => r.path === path);
  }

  events(name) {
    return this.calls('/rest/v1/events')
      .map((r) => r.body)
      .filter((e) => !name || e.name === name);
  }

  async handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const headers = req.headers();
    let body = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
    this.requests.push({ method: req.method(), path: url.pathname, search: url.search, body, headers });

    const json = (status, data) =>
      route.fulfill({ status, contentType: 'application/json', headers: cors, body: data === undefined ? '' : JSON.stringify(data) });

    if (headers.apikey !== ANON_KEY) return json(401, { message: 'bad apikey' });

    switch (url.pathname) {
      case '/rest/v1/apps':
        return json(200, [{ id: 'fanlog-app-id' }]);
      case '/rest/v1/events':
        return json(201);
      case '/rest/v1/circles':
        if (this.circlesStatus === 201) this.circles[body.id] = body.payload;
        return json(this.circlesStatus, this.circlesStatus === 201 ? undefined : { code: '42501', message: 'rls' });
      case '/rest/v1/rpc/get_circle':
        return json(200, this.circles[body.p_id] ?? null);
      case '/rest/v1/rpc/claim_handle': {
        const r = typeof this.claimResult === 'function' ? this.claimResult(body.p_handle) : this.claimResult;
        return r === 'error' ? json(500, { message: 'boom' }) : json(200, r);
      }
      case '/functions/v1/waitlist-signup':
        return json(this.waitlist.status, this.waitlist.body);
      default:
        return json(404, { message: `fake supabase: no route for ${url.pathname}` });
    }
  }
}

export const test = base.extend({
  // Installed for every test (auto), so the app never reaches a real host
  supabase: [
    async ({ page }, use) => {
      const fake = new FakeSupabase();
      await page.route(`${SUPABASE_URL}/**`, (route) => fake.handle(route));
      await use(fake);
    },
    { auto: true },
  ],

  // Everything except the app and the fake Supabase: logos get a blank PNG,
  // the rest (fonts, the demo iframe's CDN, ...) is refused.
  page: async ({ page }, use) => {
    await page.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/]|e2etest\.supabase\.co\/)/, (route) => {
      if (route.request().resourceType() === 'image') return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      return route.abort();
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(page);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  },
});

export { expect };
