// supabase/functions/waitlist-signup (a Deno edge function), run under Node
// with a fake Deno global and a fake supabase-js (see vitest.config.js).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCreateClient } from './stubs/jsr-supabase.js';

let handler;
let inserted;
let insertResult;
let clientArgs;

// Set directly, not with vi.stubGlobal: the handler reads Deno.env on every
// request and the config unstubs globals after each test.
globalThis.Deno = {
  serve: (fn) => {
    handler = fn;
  },
  env: { get: (k) => ({ SUPABASE_URL: 'https://proj.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key' })[k] },
};
setCreateClient((...args) => {
  clientArgs = args;
  return {
    from: (table) => ({
      insert: async (row) => {
        inserted.push({ table, row });
        return insertResult;
      },
    }),
  };
});
await import('../supabase/functions/waitlist-signup/index.ts');

const post = (body, init = {}) =>
  handler(
    new Request('https://proj.supabase.test/functions/v1/waitlist-signup', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      ...init,
    })
  );

beforeEach(() => {
  inserted = [];
  insertResult = { error: null };
  clientArgs = null;
});

describe('waitlist-signup', () => {
  it('answers the CORS preflight and refuses other methods', async () => {
    const pre = await handler(new Request('https://x/', { method: 'OPTIONS' }));
    expect(pre.status).toBe(200);
    expect(pre.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(pre.headers.get('access-control-allow-headers')).toContain('apikey');
    const get = await handler(new Request('https://x/', { method: 'GET' }));
    expect(get.status).toBe(405);
    expect(await get.json()).toEqual({ error: 'method_not_allowed' });
  });

  it('inserts a signup with the service role and a normalised email', async () => {
    const res = await post({
      email: ' Tom@Example.com ',
      name: 'Tom',
      handle: 'BradyFan',
      top_team: 'Patriots',
      teams: [{ id: 'patriots' }],
      prediction: '2028',
      overall_score: 93.6,
      archetype: 'Patriots Loyalist',
      fan_id: '7d3f5b1e-9a0c-4c2e-8f6a-1b2c3d4e5f60',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(await res.json()).toEqual({ ok: true });
    expect(clientArgs).toEqual(['https://proj.supabase.test', 'service-key']);
    expect(inserted).toEqual([
      {
        table: 'waitlist',
        row: {
          fan_id: '7d3f5b1e-9a0c-4c2e-8f6a-1b2c3d4e5f60',
          name: 'Tom',
          handle: 'BradyFan',
          email: 'tom@example.com',
          top_team: 'Patriots',
          teams: [{ id: 'patriots' }],
          prediction: '2028',
          overall_score: 94,
          archetype: 'Patriots Loyalist',
        },
      },
    ]);
  });

  it.each([
    ['', 'empty'],
    ['not-an-email', 'no @'],
    ['a@b', 'no dot'],
    ['a b@c.de', 'space'],
    [`${'a'.repeat(250)}@b.co`, 'over 254 chars'],
  ])('rejects %j (%s)', async (email) => {
    const res = await post({ email });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_email' });
    expect(inserted).toHaveLength(0);
  });

  it('rejects a body that is not JSON', async () => {
    const res = await post('{nope');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_json' });
  });

  it('caps what one open request can write', async () => {
    await post({
      email: 'a@b.co',
      name: 'n'.repeat(500),
      handle: 'h'.repeat(500),
      top_team: 't'.repeat(500),
      prediction: 'p'.repeat(500),
      archetype: 'x'.repeat(500),
      teams: Array.from({ length: 20 }, (_, i) => ({ id: `t${i}` })),
      overall_score: 'lots',
      fan_id: 'not-a-uuid',
    });
    const { row } = inserted[0];
    expect(row.name).toHaveLength(60);
    expect(row.handle).toHaveLength(60);
    expect(row.top_team).toHaveLength(80);
    expect(row.prediction).toHaveLength(120);
    expect(row.archetype).toHaveLength(80);
    expect(row.teams).toHaveLength(8);
    expect(row.overall_score).toBeNull();
    expect(row.fan_id).toBeNull();
  });

  it('drops an oversized or non-array team list and non-string fields', async () => {
    await post({ email: 'a@b.co', teams: [{ blob: 'x'.repeat(5000) }], name: { evil: true }, handle: 42 });
    expect(inserted[0].row).toMatchObject({ teams: null, name: null, handle: null });
    await post({ email: 'a@b.co', teams: { not: 'an array' } });
    expect(inserted[1].row.teams).toBeNull();
  });

  it('treats a repeat email as success', async () => {
    insertResult = { error: { code: '23505', message: 'duplicate key' } };
    const res = await post({ email: 'a@b.co' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
  });

  it('reports other database errors', async () => {
    insertResult = { error: { code: '42P01', message: 'relation does not exist' } };
    const res = await post({ email: 'a@b.co' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'db_error', detail: 'relation does not exist' });
  });
});
