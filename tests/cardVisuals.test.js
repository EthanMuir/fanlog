import { describe, expect, it } from 'vitest';
import {
  GENEROSITY,
  OG_IMAGE_WIDTH,
  SCORE_BASE,
  SCORE_SPAN,
  computeFanScore,
  estimateOgImageHeight,
  getContrastAdaptedColor,
  getLuminance,
  getPredictionLabel,
} from '../cardVisuals.js';

const scores = (...s) => s.map((score) => ({ score }));

describe('computeFanScore', () => {
  it('uses the documented tuning', () => {
    expect(SCORE_BASE).toBe(65);
    expect(SCORE_SPAN).toBe(35);
    expect(GENEROSITY).toBe(1.5);
  });

  it('sits at the floor with no teams or all zeros, and tops out at 100', () => {
    expect(computeFanScore([])).toBe(SCORE_BASE);
    expect(computeFanScore(null)).toBe(SCORE_BASE);
    expect(computeFanScore(scores(0, 0))).toBe(SCORE_BASE);
    expect(computeFanScore(scores(100))).toBe(100);
    expect(computeFanScore(scores(100, 100, 100, 100))).toBe(100);
  });

  it('matches the worked examples in the comment', () => {
    expect(computeFanScore(scores(92, 74, 55))).toBe(95);
    expect(computeFanScore(scores(50, 50, 50))).toBe(88);
    expect(computeFanScore(scores(40, 30, 20))).toBe(79);
  });

  it('clamps out-of-range and junk team scores instead of producing NaN or >100', () => {
    expect(computeFanScore(scores(250))).toBe(100);
    expect(computeFanScore(scores(-40))).toBe(SCORE_BASE);
    expect(computeFanScore(scores('abc', undefined))).toBe(SCORE_BASE);
    expect(computeFanScore(scores('100'))).toBe(100);
  });

  it('never goes down when a team score goes up', () => {
    let last = 0;
    for (let s = 0; s <= 100; s++) {
      const v = computeFanScore(scores(s, 50));
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it('does not depend on team order', () => {
    expect(computeFanScore(scores(10, 90, 40))).toBe(computeFanScore(scores(90, 40, 10)));
  });
});

describe('colors', () => {
  it('computes perceived brightness from 3- and 6-digit hex', () => {
    expect(getLuminance('#000000')).toBe(0);
    expect(getLuminance('#FFFFFF')).toBe(255);
    expect(getLuminance('fff')).toBe(255);
    expect(getLuminance('#f00')).toBeCloseTo(76.245);
    expect(getLuminance('')).toBe(0);
    expect(getLuminance(undefined)).toBe(0);
  });

  it('swaps a near-black primary for a brighter secondary', () => {
    expect(getContrastAdaptedColor('#000000', '#A5ACAF')).toBe('#A5ACAF');
    expect(getContrastAdaptedColor('#101820', '#D7A22A')).toBe('#D7A22A');
  });

  it('keeps a readable primary, and a dark primary with nothing better', () => {
    expect(getContrastAdaptedColor('#E31837', '#FFB81C')).toBe('#E31837');
    expect(getContrastAdaptedColor('#000000', undefined)).toBe('#000000');
    expect(getContrastAdaptedColor('#111111', '#000000')).toBe('#111111');
  });
});

describe('getPredictionLabel', () => {
  it.each([
    ['NHL', 'TOR', 'TOR CUP PREDICTION'],
    ['nfl', 'KC', 'KC BOWL PREDICTION'],
    ['NBA', 'BOS', 'BOS TITLE PREDICTION'],
    ['MLB', 'NYY', 'NYY SERIES PREDICTION'],
    ['MLS', 'MIA', 'MIA CUP PREDICTION'],
    ['EPL', 'ARS', 'ARS PREDICTION'],
    [undefined, 'X', 'X PREDICTION'],
    ['NHL', '', 'CUP PREDICTION'],
    [null, null, 'PREDICTION'],
  ])('%s / %s → %s', (league, short, label) => {
    expect(getPredictionLabel(league, short)).toBe(label);
  });
});

describe('estimateOgImageHeight', () => {
  it('stays inside the 420–630 band crawlers expect', () => {
    for (let teams = 0; teams <= 6; teams++) {
      for (const len of [0, 10, 45, 46, 90, 91, 200]) {
        const h = estimateOgImageHeight('x'.repeat(len), teams);
        expect(h).toBeGreaterThanOrEqual(420);
        expect(h).toBeLessThanOrEqual(630);
      }
    }
  });

  it('grows with team rows (capped at 4) and archetype lines (capped at 3)', () => {
    expect(estimateOgImageHeight('SHORT', 4)).toBeGreaterThan(estimateOgImageHeight('SHORT', 3));
    expect(estimateOgImageHeight('SHORT', 6)).toBe(estimateOgImageHeight('SHORT', 4));
    expect(estimateOgImageHeight('x'.repeat(91), 3)).toBeGreaterThan(estimateOgImageHeight('x'.repeat(46), 3));
    expect(estimateOgImageHeight('x'.repeat(500), 3)).toBe(estimateOgImageHeight('x'.repeat(135), 3));
  });

  it('treats a missing archetype as one line', () => {
    expect(estimateOgImageHeight(undefined, 2)).toBe(estimateOgImageHeight('A', 2));
  });

  it('keeps the fixed width', () => {
    expect(OG_IMAGE_WIDTH).toBe(900);
  });
});
