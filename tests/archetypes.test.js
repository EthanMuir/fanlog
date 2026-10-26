import { describe, expect, it } from 'vitest';
import { GENERIC_ARCHETYPES, KNOWN_ARCHETYPES, getArchetype } from '../archetypes.js';
import { sportsData } from '../teams.js';

const ALL_TEAMS = Object.entries(sportsData).flatMap(([league, d]) => d.teams.map((t) => ({ ...t, league })));
const byId = Object.fromEntries(ALL_TEAMS.map((t) => [t.id, t]));

// A card entry the way main.js builds it: the team plus the fan's answers.
function team(id, score, extra = {}) {
  const t = byId[id];
  if (!t) throw new Error(`unknown team ${id}`);
  return { ...t, score, fanSince: '2010', isTop: false, ...extra };
}
const card = (...teams) => teams.map((t, i) => (i === 0 ? { ...t, isTop: true } : t));

describe('getArchetype', () => {
  it('asks for a team when the card is empty', () => {
    expect(getArchetype([])).toBe('Add a Top Team');
    expect(getArchetype()).toBe('Add a Top Team');
  });

  it('spots a same-league rivalry before anything else', () => {
    expect(getArchetype(card(team('lakers', 99), team('celtics', 99)))).toBe('The Chaos Agent');
    expect(getArchetype(card(team('yankees', 20), team('redsox', 20)))).toBe('The Chaos Agent');
    expect(getArchetype(card(team('leafs', 80), team('canadiens', 50), team('chiefs', 70)))).toBe('The Chaos Agent');
  });

  it('names one-city circles', () => {
    expect(getArchetype(card(team('leafs', 85), team('raptors', 70)))).toBe('Toronto Sports Martyr');
    expect(getArchetype(card(team('leafs', 60), team('raptors', 70)))).toBe('The Six Traditionalist');
    expect(getArchetype(card(team('celtics', 70), team('patriots', 70)))).toBe('Title Town Aristocrat');
    expect(getArchetype(card(team('knicks', 70), team('mets', 70)))).toBe('Five-Borough Die-hard');
    expect(getArchetype(card(team('lakers', 70), team('dodgers', 70)))).toBe('Hollywood Heavyweight');
    expect(getArchetype(card(team('bulls', 70), team('cubs', 70)))).toBe('Windy City Faithful');
    expect(getArchetype(card(team('warriors', 70), team('niners', 70)))).toBe('Bay Area Purist');
  });

  it('reads heartbreak and dynasty mixes', () => {
    expect(getArchetype(card(team('bills', 75), team('knicks', 72)))).toBe('Noble Sufferer');
    expect(getArchetype(card(team('bills', 95), team('chiefs', 40)))).toBe('Glutton for Punishment');
    expect(getArchetype(card(team('chiefs', 85, { fanSince: '2021' }), team('lakers', 90)))).toBe('Modern Era Bandwagoner');
    expect(getArchetype(card(team('chiefs', 85), team('lakers', 90)))).toBe('Dynasty Collector');
    expect(getArchetype(card(team('chiefs', 40), team('packers', 50)))).toBe('Fair-Weather Frontrunner');
    expect(getArchetype(card(team('chiefs', 60), team('bills', 65)))).toBe('Rollercoaster Rider');
  });

  it('rewards long, devoted fandom', () => {
    expect(getArchetype(card(team('packers', 80, { fanSince: '1990' }), team('seahawks', 80)))).toBe('Legacy Traditionalist');
  });

  it('reads score shapes', () => {
    expect(getArchetype(card(team('packers', 92), team('seahawks', 40)))).toBe('Monogamous Devotee');
    expect(getArchetype(card(team('packers', 89), team('seahawks', 88)))).toBe('Uncompromising Zealot');
    expect(getArchetype(card(team('packers', 60), team('seahawks', 30)))).toBe('Passive Enthusiast');
    expect(getArchetype(card(team('packers', 70), team('seahawks', 74)))).toBe('Equal-Opportunity Fan');
  });

  it('uses the team phrase for a one-team card', () => {
    expect(getArchetype(card(team('bills', 85)))).toBe('Bills Mafia Die-hard');
    expect(getArchetype(card(team('bills', 84)))).toBe('Bills Devotee');
  });

  it('places multi-city circles on the map', () => {
    expect(getArchetype(card(team('jets', 70), team('seahawks', 80)))).toBe('Coast-to-Coast Analyst');
    expect(getArchetype(card(team('jets', 70), team('dolphins', 80)))).toBe('Eastern Seaboard Purist');
    expect(getArchetype(card(team('seahawks', 70), team('raiders', 80)))).toBe('Pacific Coast Loyalist');
    expect(getArchetype(card(team('cowboys', 70), team('texans', 80)))).toBe('Heartland Traditionalist');
  });

  it('covers one-team cards without a team phrase', () => {
    expect(getArchetype(card(team('jets', 96)))).toBe('Ride-or-Die Diehard');
    expect(getArchetype(card(team('browns', 80)))).toBe('The Heartbreak Specialist');
    expect(getArchetype(card(team('ravens', 80)))).toBe('The Glory Collector');
    expect(getArchetype(card(team('ravens', 50)))).toBe('Frontrunner Fan');
    expect(getArchetype(card(team('jets', 80, { fanSince: '1999' })))).toBe('Generational Guardian');
    expect(getArchetype(card(team('jets', 60, { fanSince: '2023' })))).toBe('Fresh Convert');
    expect(getArchetype(card(team('jets', 40)))).toBe('Casual Admirer');
    expect(getArchetype(card(team('jets', 70)))).toBe('The Pure Loyalist');
  });

  it('falls back to league personas and tiered devotion', () => {
    // Teams from cities outside the regional lists, with no score-shape rule
    expect(getArchetype(card(team('colts', 85), team('lions', 75)))).toBe('Gridiron Zealot');
    expect(getArchetype(card(team('colts', 70), team('lions', 63)))).toBe('Gridiron Analyst');
    expect(getArchetype(card(team('colts', 85), team('pistons', 75)))).toBe('Two-Sport Fanatic');
    expect(getArchetype(card(team('colts', 70), team('pistons', 63)))).toBe('Dual-Front Analyst');
  });

  it('never returns anything the share renderers would reject', () => {
    // Deterministic pseudo-random cards across every team; the share-link
    // renderers only display archetypes in KNOWN_ARCHETYPES (circlePayload.js),
    // so an engine output missing from that set would silently vanish from previews.
    let seed = 42;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const seen = new Set();
    for (let i = 0; i < 20000; i++) {
      const n = 1 + Math.floor(rnd() * 4);
      const teams = Array.from({ length: n }, (_, j) => ({
        ...ALL_TEAMS[Math.floor(rnd() * ALL_TEAMS.length)],
        score: Math.round(rnd() * 100),
        fanSince: String(1950 + Math.floor(rnd() * 77)),
        isTop: j === 0,
      }));
      const a = getArchetype(teams);
      seen.add(a);
      expect(KNOWN_ARCHETYPES.has(a), `${a} from ${teams.map((t) => `${t.id}:${t.score}`).join(',')}`).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(80);
  });
});

describe('archetype lists', () => {
  it('GENERIC_ARCHETYPES has no duplicates', () => {
    expect(new Set(GENERIC_ARCHETYPES).size).toBe(GENERIC_ARCHETYPES.length);
  });

  it('reaches the archetypes random cards rarely land on', () => {
    const plain = (id, score) => team(id, score, { status: 'standard', city: `${id} town` });
    expect(getArchetype(card(team('stampeders', 95), team('bluebombers', 70)))).toBe('Grey Cup Diehard');
    expect(getArchetype(card(plain('aston_villa', 61), plain('bournemouth', 0), plain('brentford', 0), plain('arsenal', 0)))).toBe(
      'Curious Newcomer'
    );
    expect(getArchetype(card(plain('aston_villa', 61), plain('bournemouth', 0)))).toBe('Casual Onlooker');
    expect(getArchetype(card(team('leafs', 85)))).toBe('Leafs Nation Martyr');
    expect(getArchetype(card(team('argonauts', 85), team('ticats', 80)))).toBe('The Chaos Agent');
  });

  it('includes both phrases for every team-specific archetype', () => {
    expect(KNOWN_ARCHETYPES.has('Bills Mafia Die-hard')).toBe(true);
    expect(KNOWN_ARCHETYPES.has('Bills Devotee')).toBe(true);
    // The "base" phrase is never shown, so links can't carry it
    expect(KNOWN_ARCHETYPES.has('Bills Mafia')).toBe(false);
  });
});
