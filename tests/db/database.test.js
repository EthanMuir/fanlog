// The Supabase migrations against a real Postgres: a fresh database gets
// bootstrap.sql and then every file in supabase/migrations in filename order
// (the order `supabase db reset` uses), and the tests act as the anon and
// service_role API roles to check what RLS and the functions allow.
//
// Needs a Postgres superuser; set E2E_DATABASE_URL (default
// postgres://postgres:postgres@127.0.0.1:5432/postgres). Run with `npm run test:db`.
import { readFileSync, readdirSync } from 'fs';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ADMIN_URL = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres';
const DB = 'fanlog_test';
const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);
const migrationFiles = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

let db;

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${DB}`;
  db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  await db.query(readFileSync(new URL('./bootstrap.sql', import.meta.url), 'utf8'));
  for (const f of migrationFiles) await db.query(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
});

afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await db.query('RESET ROLE');
  await db.query('TRUNCATE public.waitlist, public.circles, public.fans');
});

// Run `fn` as an API role inside a transaction that is rolled back, so a
// failed statement doesn't poison the connection.
async function as(role, sql, params) {
  await db.query('BEGIN');
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    return await db.query(sql, params);
  } finally {
    await db.query('ROLLBACK');
  }
}
// Same, but keep the change
async function asCommit(role, sql, params) {
  await db.query('BEGIN');
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    const r = await db.query(sql, params);
    await db.query('COMMIT');
    return r;
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  }
}
const RLS = /row-level security|permission denied/;

describe('migrations', () => {
  it('have one file per version, so the Supabase CLI can track them', () => {
    const versions = migrationFiles.map((f) => f.split('_')[0]);
    expect(new Set(versions).size).toBe(versions.length);
    for (const v of versions) expect(v).toMatch(/^\d{8,14}$/);
  });

  it('leave RLS on for every table', async () => {
    const { rows } = await db.query(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relname`
    );
    expect(rows).toEqual([
      { relname: 'circles', relrowsecurity: true },
      { relname: 'fans', relrowsecurity: true },
      { relname: 'waitlist', relrowsecurity: true },
    ]);
  });
});

describe('waitlist', () => {
  const row = ['a@b.co', 'BradyFan'];

  it('anon can neither write nor read it directly (only the edge function can)', async () => {
    await expect(as('anon', `INSERT INTO public.waitlist (email, handle) VALUES ($1, $2)`, row)).rejects.toThrow(RLS);
    await asCommit('service_role', `INSERT INTO public.waitlist (email, handle) VALUES ($1, $2)`, row);
    expect((await as('anon', 'SELECT * FROM public.waitlist')).rows).toEqual([]);
    expect((await as('authenticated', 'SELECT * FROM public.waitlist')).rows).toEqual([]);
    expect((await as('anon', 'UPDATE public.waitlist SET email = $1', ['x@y.z'])).rowCount).toBe(0);
    expect((await as('anon', 'DELETE FROM public.waitlist')).rowCount).toBe(0);
  });

  it('the service role can write and read, one row per email ignoring case', async () => {
    await asCommit('service_role', `INSERT INTO public.waitlist (email, fan_id) VALUES ('Tom@Example.com', gen_random_uuid())`);
    await expect(as('service_role', `INSERT INTO public.waitlist (email) VALUES ('tom@example.COM')`)).rejects.toMatchObject({ code: '23505' });
    expect((await as('service_role', 'SELECT email FROM public.waitlist')).rows).toEqual([{ email: 'Tom@Example.com' }]);
  });
});

describe('circles', () => {
  const payload = { h: 'BradyFan', a: 'Noble Sufferer', t: [{ i: 'bills', s: 91, top: 1 }] };

  it('anon can save a card under a short alphanumeric id', async () => {
    await asCommit('anon', 'INSERT INTO public.circles (id, payload) VALUES ($1, $2)', ['abc12345', payload]);
    expect((await db.query('SELECT payload FROM public.circles')).rows[0].payload).toEqual(payload);
  });

  it.each(['abc12', 'abc1234567890', 'abc-1234', "abc'1234", 'ABC 1234', ''])('rejects the id %j', async (id) => {
    await expect(as('anon', 'INSERT INTO public.circles (id, payload) VALUES ($1, $2)', [id, payload])).rejects.toThrow(RLS);
  });

  it('rejects a payload of 4 KB or more', async () => {
    const big = { blob: Array.from({ length: 800 }, (_, i) => `k${i}`).join('') + 'x'.repeat(4000) };
    await expect(as('anon', 'INSERT INTO public.circles (id, payload) VALUES ($1, $2)', ['abc12345', big])).rejects.toThrow(RLS);
  });

  it('cannot be listed, changed or deleted by anon', async () => {
    await asCommit('service_role', 'INSERT INTO public.circles (id, payload) VALUES ($1, $2)', ['abc12345', payload]);
    expect((await as('anon', 'SELECT * FROM public.circles')).rows).toEqual([]);
    expect((await as('anon', `UPDATE public.circles SET payload = '{}'`)).rowCount).toBe(0);
    expect((await as('anon', 'DELETE FROM public.circles')).rowCount).toBe(0);
  });

  it('get_circle returns one card by its exact id', async () => {
    await asCommit('service_role', 'INSERT INTO public.circles (id, payload) VALUES ($1, $2), ($3, $4)', [
      'abc12345',
      payload,
      'zzz99999',
      { h: 'other' },
    ]);
    expect((await as('anon', 'SELECT public.get_circle($1) AS p', ['abc12345'])).rows[0].p).toEqual(payload);
    for (const probe of ['ABC12345', 'abc1234', '%', 'abc12345 ', "abc12345' OR '1'='1"]) {
      expect((await as('anon', 'SELECT public.get_circle($1) AS p', [probe])).rows[0].p, probe).toBeNull();
    }
  });

  it('get_circle is callable by the API roles only', async () => {
    const { rows } = await db.query(
      `SELECT grantee FROM information_schema.routine_privileges WHERE routine_name = 'get_circle' AND privilege_type = 'EXECUTE' ORDER BY grantee`
    );
    expect(rows.map((r) => r.grantee)).toEqual(expect.arrayContaining(['anon', 'authenticated']));
    expect(rows.map((r) => r.grantee)).not.toContain('PUBLIC');
  });
});

describe('fans and claim_handle', () => {
  const fanA = '7d3f5b1e-9a0c-4c2e-8f6a-1b2c3d4e5f60';
  const fanB = '0b8c9d1e-2f3a-4b5c-8d7e-9f0a1b2c3d4e';
  const claim = (fan, handle) => asCommit('anon', 'SELECT public.claim_handle($1, $2) AS r', [fan, handle]).then((r) => r.rows[0].r);

  it('claims a free username', async () => {
    expect(await claim(fanA, 'BradyFan')).toBe('ok');
    expect((await db.query('SELECT id, handle FROM public.fans')).rows).toEqual([{ id: fanA, handle: 'BradyFan' }]);
  });

  it('is unique ignoring case, and re-claiming your own is fine', async () => {
    expect(await claim(fanA, 'BradyFan')).toBe('ok');
    expect(await claim(fanB, 'bradyfan')).toBe('taken');
    expect(await claim(fanA, 'BRADYFAN')).toBe('ok');
  });

  it('switching usernames frees the old one', async () => {
    expect(await claim(fanA, 'first_name')).toBe('ok');
    expect(await claim(fanA, 'second_name')).toBe('ok');
    expect(await claim(fanB, 'first_name')).toBe('ok');
    expect((await db.query('SELECT count(*)::int AS n FROM public.fans')).rows[0].n).toBe(2);
  });

  it.each(['ab', 'a'.repeat(21), 'has space', 'dash-ed', 'Zoë', '', null])('rejects the username %j', async (h) => {
    expect(await claim(fanA, h)).toBe('invalid');
  });

  it('rejects a missing fan id', async () => {
    expect(await claim(null, 'BradyFan')).toBe('invalid');
  });

  it.each(['guest', 'Admin', 'FANLOG', 'support', 'official', 'anon', 'null', 'undefined'])('reserves %j', async (h) => {
    expect(await claim(fanA, h)).toBe('taken');
  });

  it('anon cannot read or write the table directly', async () => {
    await claim(fanA, 'BradyFan');
    expect((await as('anon', 'SELECT * FROM public.fans')).rows).toEqual([]);
    await expect(as('anon', `INSERT INTO public.fans (id, handle) VALUES ($1, 'sneaky')`, [fanB])).rejects.toThrow(RLS);
    expect((await as('anon', `UPDATE public.fans SET handle = 'stolen'`)).rowCount).toBe(0);
  });
});
