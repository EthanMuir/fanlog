// The browser-side Supabase clients: circles.js (short share ids), fans.js
// (anonymous fan id + usernames) and waitlist.js (signup edge function).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from './helpers.js';

let client;
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => client) }));

function fakeClient() {
  const insert = vi.fn(async () => ({ error: null }));
  return {
    insert,
    from: vi.fn(() => ({ insert })),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    functions: { invoke: vi.fn(async () => ({ data: { ok: true }, error: null })) },
  };
}

async function load(mod, { configured = true } = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', configured ? 'https://proj.supabase.test' : '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', configured ? 'anon-key' : '');
  return import(`../${mod}.js`);
}

beforeEach(() => {
  client = fakeClient();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('circles.js', () => {
  it('stores a card and returns its 8-character id', async () => {
    const { saveCircle } = await load('circles');
    const payload = { h: 'x', a: '', t: [] };
    const id = await saveCircle(payload);
    expect(id).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(client.from).toHaveBeenCalledWith('circles');
    expect(client.insert).toHaveBeenCalledWith({ id, payload });
  });

  it('generates ids the database policy accepts, and different ones each time', async () => {
    const { saveCircle } = await load('circles');
    const ids = new Set();
    for (let i = 0; i < 200; i++) ids.add(await saveCircle({}));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{6,12}$/);
  });

  it('retries on an id collision, up to three tries', async () => {
    const { saveCircle } = await load('circles');
    client.insert.mockResolvedValueOnce({ error: { code: '23505', message: 'dupe' } });
    expect(await saveCircle({})).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(client.insert).toHaveBeenCalledTimes(2);
    client.insert.mockReset().mockResolvedValue({ error: { code: '23505', message: 'dupe' } });
    expect(await saveCircle({})).toBeNull();
    expect(client.insert).toHaveBeenCalledTimes(3);
  });

  it('gives up straight away on any other error so the link can fall back to ?c=', async () => {
    const { saveCircle } = await load('circles');
    client.insert.mockResolvedValue({ error: { code: '42501', message: 'new row violates row-level security policy' } });
    expect(await saveCircle({})).toBeNull();
    expect(client.insert).toHaveBeenCalledTimes(1);
  });

  it('does nothing without Supabase configured', async () => {
    const { saveCircle, fetchCircle } = await load('circles', { configured: false });
    expect(await saveCircle({})).toBeNull();
    expect(await fetchCircle('abc12345')).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('fetches by exact id through get_circle', async () => {
    const { fetchCircle } = await load('circles');
    client.rpc.mockResolvedValue({ data: { h: 'x' }, error: null });
    expect(await fetchCircle('abc12345')).toEqual({ h: 'x' });
    expect(client.rpc).toHaveBeenCalledWith('get_circle', { p_id: 'abc12345' });
  });

  it('returns null for bad ids, errors and outages', async () => {
    const { fetchCircle } = await load('circles');
    for (const id of ['', null, 'abc', 'a'.repeat(13), 'abc 1234']) expect(await fetchCircle(id)).toBeNull();
    expect(client.rpc).not.toHaveBeenCalled();
    client.rpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await fetchCircle('abc12345')).toBeNull();
    client.rpc.mockRejectedValue(new Error('offline'));
    expect(await fetchCircle('abc12345')).toBeNull();
  });
});

describe('fans.js', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  let storage;
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  it('creates a fan id once and keeps it', async () => {
    const { getFanId } = await load('fans');
    const id = getFanId();
    expect(id).toMatch(UUID);
    expect(storage.getItem('fanlog_fan_id')).toBe(id);
    expect(getFanId()).toBe(id);
    const again = await load('fans');
    expect(again.getFanId()).toBe(id);
  });

  it('replaces a stored id that is not a UUID', async () => {
    storage.setItem('fanlog_fan_id', 'hacked');
    const { getFanId } = await load('fans');
    expect(getFanId()).toMatch(UUID);
  });

  it('still works when storage is blocked', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    });
    const { getFanId, getLastHandle, claimHandle } = await load('fans');
    expect(getFanId()).toMatch(UUID);
    expect(getLastHandle()).toBe('');
    client.rpc.mockResolvedValue({ data: 'ok', error: null });
    expect(await claimHandle('brady')).toBe('ok');
  });

  it('falls back to getRandomValues when randomUUID is missing', async () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (a) => real.getRandomValues(a) });
    const { getFanId } = await load('fans');
    expect(getFanId()).toMatch(UUID);
  });

  it('only pre-fills a valid remembered username', async () => {
    storage.setItem('fanlog_handle', 'Brady_12');
    expect((await load('fans')).getLastHandle()).toBe('Brady_12');
    storage.setItem('fanlog_handle', '<b>x</b>');
    expect((await load('fans')).getLastHandle()).toBe('');
  });

  it('validates usernames the same way claim_handle() does', async () => {
    const { HANDLE_PATTERN } = await load('fans');
    for (const ok of ['abc', 'Brady_12', 'a'.repeat(20), '___']) expect(HANDLE_PATTERN.test(ok), ok).toBe(true);
    for (const bad of ['ab', 'a'.repeat(21), 'with space', 'dash-ed', 'Zoë', '']) expect(HANDLE_PATTERN.test(bad), bad).toBe(false);
  });

  it('claims a username for this fan id and remembers it', async () => {
    const { claimHandle, getFanId } = await load('fans');
    client.rpc.mockResolvedValue({ data: 'ok', error: null });
    expect(await claimHandle('Brady_12')).toBe('ok');
    expect(client.rpc).toHaveBeenCalledWith('claim_handle', { p_fan_id: getFanId(), p_handle: 'Brady_12' });
    expect(storage.getItem('fanlog_handle')).toBe('Brady_12');
  });

  it('reports taken and invalid without remembering', async () => {
    const { claimHandle } = await load('fans');
    client.rpc.mockResolvedValue({ data: 'taken', error: null });
    expect(await claimHandle('admin')).toBe('taken');
    expect(await claimHandle('no')).toBe('invalid');
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(storage.getItem('fanlog_handle')).toBeNull();
  });

  it("says 'unavailable' (so the quiz carries on) when the check can't run", async () => {
    let { claimHandle } = await load('fans');
    client.rpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    expect(await claimHandle('brady')).toBe('unavailable');
    client.rpc.mockResolvedValue({ data: 'surprise', error: null });
    expect(await claimHandle('brady')).toBe('unavailable');
    client.rpc.mockRejectedValue(new Error('offline'));
    expect(await claimHandle('brady')).toBe('unavailable');
    ({ claimHandle } = await load('fans', { configured: false }));
    expect(await claimHandle('brady')).toBe('unavailable');
  });
});

describe('waitlist.js', () => {
  const entry = {
    name: 'Tom',
    handle: 'BradyFan',
    email: '  Tom@Example.COM ',
    topTeam: 'Patriots',
    teams: [{ id: 'patriots', score: 90 }],
    prediction: '2028',
    overallScore: 94,
    archetype: 'Patriots Loyalist',
    fanId: '7d3f5b1e-9a0c-4c2e-8f6a-1b2c3d4e5f60',
  };

  it('sends a normalised signup to the edge function', async () => {
    const { saveWaitlistEntry } = await load('waitlist');
    expect(await saveWaitlistEntry(entry, 'tok')).toEqual({ ok: true });
    expect(client.functions.invoke).toHaveBeenCalledWith('waitlist-signup', {
      body: {
        token: 'tok',
        name: 'Tom',
        handle: 'BradyFan',
        email: 'tom@example.com',
        top_team: 'Patriots',
        teams: [{ id: 'patriots', score: 90 }],
        prediction: '2028',
        overall_score: 94,
        archetype: 'Patriots Loyalist',
        fan_id: entry.fanId,
      },
    });
  });

  it('sends nulls for missing fields and a non-numeric score', async () => {
    const { saveWaitlistEntry } = await load('waitlist');
    await saveWaitlistEntry({ email: 'a@b.co', overallScore: NaN });
    const { body } = client.functions.invoke.mock.calls[0][1];
    expect(body).toEqual({
      token: '',
      name: null,
      handle: null,
      email: 'a@b.co',
      top_team: null,
      teams: null,
      prediction: null,
      overall_score: null,
      archetype: null,
      fan_id: null,
    });
  });

  it('reports failures instead of throwing', async () => {
    const { saveWaitlistEntry } = await load('waitlist');
    client.functions.invoke.mockResolvedValueOnce({ data: null, error: { message: 'FunctionsHttpError' } });
    expect(await saveWaitlistEntry(entry)).toEqual({ ok: false, error: 'FunctionsHttpError' });
    client.functions.invoke.mockResolvedValueOnce({ data: { error: 'bad_email' }, error: null });
    expect(await saveWaitlistEntry(entry)).toEqual({ ok: false, error: 'bad_email' });
    client.functions.invoke.mockResolvedValueOnce({ data: {}, error: null });
    expect(await saveWaitlistEntry(entry)).toEqual({ ok: false, error: 'unknown' });
    client.functions.invoke.mockRejectedValueOnce(new Error('offline'));
    expect(await saveWaitlistEntry(entry)).toEqual({ ok: false, error: 'Error: offline' });
  });

  it('says so when Supabase is not configured', async () => {
    const { saveWaitlistEntry } = await load('waitlist', { configured: false });
    expect(await saveWaitlistEntry(entry)).toEqual({ ok: false, error: 'supabase-not-configured' });
  });
});
