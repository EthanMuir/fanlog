import { describe, expect, it } from 'vitest';
import { MAX_HANDLE_LENGTH, MAX_TEAMS, sanitizeCircle, sanitizeHandle } from '../circlePayload.js';

describe('sanitizeHandle', () => {
  it('keeps letters (any script), digits, _ and -', () => {
    expect(sanitizeHandle('Brady_Fan-12')).toBe('Brady_Fan-12');
    expect(sanitizeHandle('Zoë')).toBe('Zoë');
    expect(sanitizeHandle('李小龙')).toBe('李小龙');
  });

  it('strips markup, spaces, @ and emoji', () => {
    expect(sanitizeHandle('<img src=x onerror=alert(1)>')).toBe('imgsrcxonerroralert1');
    expect(sanitizeHandle('@ my name 🏒')).toBe('myname');
    expect(sanitizeHandle('"quoted"&amp;')).toBe('quotedamp');
  });

  it('caps the length and copes with non-strings', () => {
    expect(sanitizeHandle('a'.repeat(100))).toHaveLength(MAX_HANDLE_LENGTH);
    expect(sanitizeHandle(null)).toBe('');
    expect(sanitizeHandle(undefined)).toBe('');
    expect(sanitizeHandle(12345)).toBe('12345');
  });
});

describe('sanitizeCircle', () => {
  it('passes a well-formed payload through', () => {
    const p = { h: 'BradyFan', a: 'Bills Mafia Die-hard', t: [{ i: 'bills', s: 91, top: 1 }, { i: 'leafs', s: 40, top: 0 }] };
    expect(sanitizeCircle(p)).toEqual(p);
  });

  it('rejects things that are not objects', () => {
    for (const bad of [null, undefined, 'x', 42, true]) expect(sanitizeCircle(bad)).toBeNull();
  });

  it('drops archetypes the engine cannot produce', () => {
    expect(sanitizeCircle({ a: 'Visit evil.example for free tickets' }).a).toBe('');
    expect(sanitizeCircle({ a: 'Bills Mafia' }).a).toBe('');
    expect(sanitizeCircle({ a: ['Noble Sufferer'] }).a).toBe('');
    expect(sanitizeCircle({ a: 'Noble Sufferer' }).a).toBe('Noble Sufferer');
  });

  it('clamps and rounds scores, normalises top flags', () => {
    const t = sanitizeCircle({ t: [{ i: 'a', s: 250, top: 'yes' }, { i: 'b', s: -5 }, { i: 'c', s: '71.6' }, { i: 'd', s: 'nope', top: 0 }] }).t;
    expect(t).toEqual([
      { i: 'a', s: 100, top: 1 },
      { i: 'b', s: 0, top: 0 },
      { i: 'c', s: 72, top: 0 },
      { i: 'd', s: 0, top: 0 },
    ]);
  });

  it('keeps at most four well-formed teams', () => {
    const t = sanitizeCircle({
      t: [null, { i: 5 }, { i: 'x'.repeat(41) }, { s: 50 }, ...'abcdef'.split('').map((i) => ({ i, s: 50 }))],
    }).t;
    expect(t.map((x) => x.i)).toEqual(['a', 'b', 'c', 'd']);
    expect(t).toHaveLength(MAX_TEAMS);
  });

  it('ignores a non-array team list and never carries a score field', () => {
    const out = sanitizeCircle({ h: 'x', t: { i: 'bills' }, sc: 100, extra: 'junk' });
    expect(out).toEqual({ h: 'x', a: '', t: [] });
  });
});
