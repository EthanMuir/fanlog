// Sports-identity archetype engine ("Coast-to-Coast Analyst", "Bills Mafia
// Die-hard", ...), shared by the live card (main.js) and the share-link
// renderers (api/og.js, api/share.js via circlePayload.js). DOM-free on purpose.
//
// The share renderers can't recompute an archetype themselves (it depends on
// fan-since years that aren't in the share payload), so they only display an
// archetype this engine can actually produce — see KNOWN_ARCHETYPES. When you
// add a new archetype string below, add it to GENERIC_ARCHETYPES too (main.js
// warns in dev if one is missing).

const teamSpecificPhrases = {
  chiefs: { base: "Chiefs Kingdom", high: "Chiefs Kingdom Dynasty Guard", standard: "Red & Gold Faithful" },
  eagles: { base: "Eagles Nation", high: "Midnight Green Zealot", standard: "Eagles Faithful" },
  cowboys: { base: "America's Team", high: "Lone Star Martyr", standard: "Cowboys Traditionalist" },
  niners: { base: "Faithful Union", high: "Red & Gold Niners Devotee", standard: "49ers Loyalist" },
  packers: { base: "Cheeseheads", high: "Frozen Tundra Guardian", standard: "Cheesehead Loyalist" },
  bills: { base: "Bills Mafia", high: "Bills Mafia Die-hard", standard: "Bills Devotee" },
  seahawks: { base: "12th Man", high: "Loudest 12th Man Disciple", standard: "Seahawks Faithful" },
  patriots: { base: "Foxborough", high: "Foxborough Dynastist", standard: "Patriots Loyalist" },
  raiders: { base: "Raider Nation", high: "Silver & Black Raider", standard: "Raiders Faithful" },
  giants_nfl: { base: "Big Blue", high: "Big Blue Giants Zealot", standard: "Giants Loyalist" },
  lakers: { base: "Showtime Lakers", high: "Showtime Lakers Purist", standard: "Lakers Nation Loyalist" },
  celtics: { base: "Green Team", high: "Celtics Dynasty Guardian", standard: "Celtics Traditionalist" },
  warriors: { base: "Dub Nation", high: "Dub Nation Elite Devotee", standard: "Warriors Loyalist" },
  bulls: { base: "Chicago Bulls", high: "Windy City Bulls Zealot", standard: "Bulls Faithful" },
  raptors: { base: "We The North", high: "We The North Die-hard", standard: "Raptors Traditionalist" },
  heat: { base: "Heat Nation", high: "Heat Nation Flame Guard", standard: "Heat Loyalist" },
  knicks: { base: "Knicks Faithful", high: "Orange & Blue Knicks Martyr", standard: "Knicks Supporter" },
  bucks: { base: "Fear The Deer", high: "Deer District Guardian", standard: "Bucks Loyalist" },
  suns: { base: "Planet Orange", high: "Valley of the Suns Zealot", standard: "Suns Fanatic" },
  nets: { base: "Brooklyn Nets", high: "Brooklyn Grit Traditionalist", standard: "Nets Loyalist" },
  leafs: { base: "Leafs Nation", high: "Leafs Nation Martyr", standard: "Leafs Traditionalist" },
  bruins: { base: "Spoked-B", high: "Boston Bruins Bruiser", standard: "Bruins Loyalist" },
  blackhawks: { base: "Blackhawks", high: "Madhouse on Madison Purist", standard: "Blackhawks Traditionalist" },
  canadiens: { base: "Bleu-Blanc-Rouge", high: "Bleu-Blanc-Rouge Purist", standard: "Canadiens Loyalist" },
  canucks: { base: "Canucks Nation", high: "Pacific Canucks Sufferer", standard: "Canucks Faithful" },
  knights: { base: "Golden Knights", high: "Golden Misfits Devotee", standard: "Knights Guardian" },
  rangers: { base: "Broadway Blues", high: "Broadway Blue Rangers Zealot", standard: "Rangers Faithful" },
  avalanche: { base: "Avalanche", high: "Mile High Avalanche Guard", standard: "Avalanche Loyalist" },
  oilers: { base: "Oilers Country", high: "Copper & Blue Oilers Elite", standard: "Oilers Loyalist" },
  penguins: { base: "Pens Nation", high: "Black & Gold Penguins Purist", standard: "Penguins Loyalist" },
  yankees: { base: "Pinstripes", high: "Bronx Bomber Aristocrat", standard: "Pinstripe Loyalist" },
  redsox: { base: "Red Sox Nation", high: "Fenway Faithful Guardian", standard: "Red Sox Loyalist" },
  dodgers: { base: "Think Blue", high: "Chavez Ravine Traditionalist", standard: "Dodgers Loyalist" },
  cubs: { base: "Wrigleyville", high: "Bleacher Bum Traditionalist", standard: "Cubs Faithful" },
  giants_mlb: { base: "Orange & Black", high: "Bay Area Giants Purist", standard: "Giants Faithful" },
  bluejays: { base: "Blue Jays", high: "Blue Jays Nation Devotee", standard: "Jays Traditionalist" },
  braves: { base: "Tomahawk", high: "Tomahawk chop Faithful", standard: "Braves Loyalist" },
  astros: { base: "Space City", high: "Orbit District Guardian", standard: "Astros Loyalist" },
  mets: { base: "Amazin' Mets", high: "Amazin' Mets Martyr", standard: "Mets Traditionalist" },
  cardinals: { base: "Redbirds", high: "St. Louis Redbirds Purist", standard: "Cardinals Loyalist" },
  miami: { base: "Inter Miami", high: "Vice City Herons Zealot", standard: "Inter Miami Loyalist" },
  galaxy: { base: "LA Galaxy", high: "Angel City Galaxy Guard", standard: "Galaxy Loyalist" },
  sounders: { base: "Emerald City", high: "Rave Green Sounders Fanatic", standard: "Sounders Loyalist" },
  lafc: { base: "LAFC", high: "Black & Gold LAFC Guard", standard: "LAFC Loyalist" },
  timbers: { base: "Rose City", high: "Rose City Timbers Devotee", standard: "Timbers Traditionalist" },
  atlanta_utd: { base: "Five Stripes", high: "Five Stripes Mercedes Guard", standard: "Atlanta United Loyalist" },
  toronto_fc: { base: "Reds", high: "BMO Field Reds Guardian", standard: "Toronto FC Loyalist" },
  nycfc: { base: "Pigeons", high: "Pigeon Nation Elite", standard: "NYCFC Loyalist" },
  crew: { base: "Crew", high: "Yellow & Black Crew Guardian", standard: "Crew Loyalist" },
  cincinnati: { base: "FC Cincinnati", high: "Bailey Wall Guardian", standard: "Cincinnati Loyalist" }
};

export function getArchetype(teams = []) {
  const count = teams.length;
  if (count === 0) return "Add a Top Team";
  
  const topTeam = teams.find(t => t.isTop) || teams[0];
  const otherTeams = teams.filter(t => !t.isTop);
  
  const avgScore = teams.reduce((sum, t) => sum + t.score, 0) / count;
  const avgIntensity = avgScore / 20; // Maps 0-100 to 0-5
  
  const ids = teams.map(t => t.id);
  const cities = teams.map(t => t.city);
  const uniqueCities = [...new Set(cities)];
  
  const leagues = teams.map(t => t.league ? t.league.toLowerCase() : "");
  const uniqueLeagues = [...new Set(leagues)].filter(Boolean);

  const scores = teams.map(t => t.score);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  
  const sinceYears = teams.map(t => parseInt(t.fanSince)).filter(y => !isNaN(y));
  const earliestSince = sinceYears.length > 0 ? Math.min(...sinceYears) : 2026;
  const latestSince = sinceYears.length > 0 ? Math.max(...sinceYears) : 1900;

  const eastCities = ['new york', 'boston', 'philadelphia', 'montreal', 'toronto', 'miami', 'buffalo', 'chicago', 'pittsburgh', 'atlanta', 'columbus', 'cincinnati', 'milwaukee'];
  const westCities = ['los angeles', 'san francisco', 'seattle', 'las vegas', 'vancouver', 'portland', 'phoenix', 'denver', 'edmonton'];
  const centralCities = ['dallas', 'kansas city', 'houston', 'st. louis', 'green bay'];

  const citiesLower = cities.map(c => c ? c.toLowerCase() : "");
  const hasEast = citiesLower.some(c => eastCities.includes(c));
  const hasWest = citiesLower.some(c => westCities.includes(c));
  const hasCentral = citiesLower.some(c => centralCities.includes(c));

  // 1. Rivals Check (Same-league rivalries) - Highly specific and fun
  const hasRivalry = (
    (ids.includes('lakers') && ids.includes('celtics')) ||
    (ids.includes('yankees') && ids.includes('redsox')) ||
    (ids.includes('dodgers') && ids.includes('giants_mlb')) ||
    (ids.includes('leafs') && ids.includes('bruins')) ||
    (ids.includes('leafs') && ids.includes('canadiens')) ||
    (ids.includes('chiefs') && ids.includes('raiders')) ||
    (ids.includes('packers') && ids.includes('bears')) ||
    (ids.includes('cowboys') && ids.includes('eagles')) ||
    (ids.includes('cowboys') && ids.includes('giants_nfl')) ||
    (ids.includes('rangers') && ids.includes('islanders')) ||
    (ids.includes('oilers') && ids.includes('flames')) ||
    (ids.includes('bulls') && ids.includes('pistons')) ||
    (ids.includes('cubs') && ids.includes('cardinals')) ||
    (ids.includes('argonauts') && ids.includes('ticats'))
  );
  if (hasRivalry) {
    return "The Chaos Agent";
  }

  // 2. Specific City Pride Checks (Toronto, Boston, NY, LA, Chicago, SF)
  const isCity = (cityName) => teams.every(t => t.city && t.city.toLowerCase() === cityName.toLowerCase());
  
  if (count >= 2) {
    if (isCity("toronto")) {
      if (teams.some(t => t.id === 'leafs' && t.score >= 80)) {
        return "Toronto Sports Martyr";
      }
      return "The Six Traditionalist";
    }
    if (isCity("boston")) {
      return "Title Town Aristocrat";
    }
    if (isCity("new york")) {
      return "Five-Borough Die-hard";
    }
    if (isCity("los angeles")) {
      return "Hollywood Heavyweight";
    }
    if (isCity("chicago")) {
      return "Windy City Faithful";
    }
    if (isCity("san francisco")) {
      return "Bay Area Purist";
    }
  }

  // 3. Devotion / Heartbreak Syndicates (Based on Database status)
  if (count >= 2) {
    const heartbreakTeams = teams.filter(t => t.status === 'heartbreak');
    const champsTeams = teams.filter(t => t.status === 'champs' || t.status === 'powerhouse');
    
    // Multiple heartbreak teams with high devotion
    if (heartbreakTeams.length >= 2 && heartbreakTeams.every(t => t.score >= 70)) {
      return "Noble Sufferer";
    }
    
    // Glutton for punishment: Top team is heartbreak with extremely high score
    if (topTeam.status === 'heartbreak' && topTeam.score >= 90) {
      return "Glutton for Punishment";
    }
    
    // Multiple champs/powerhouse teams with high score, especially if fanSince is recent
    if (champsTeams.length >= 2 && champsTeams.every(t => t.score >= 80)) {
      if (latestSince >= 2020) {
        return "Modern Era Bandwagoner";
      }
      return "Dynasty Collector";
    }

    // Follows winners but with low devotion — the classic frontrunner.
    if (champsTeams.length >= 1 && avgScore < 55) {
      return "Fair-Weather Frontrunner";
    }

    // A mix of winners and heartbreak teams — riding the emotional rollercoaster.
    if (heartbreakTeams.length >= 1 && champsTeams.length >= 1) {
      return "Rollercoaster Rider";
    }
  }

  // 4. Generational / Legacy Loyalty
  if (earliestSince < 1998 && avgScore >= 75) {
    return "Legacy Traditionalist";
  }

  // 5. Large Score Gaps & Devotion Profiles
  if (count >= 2) {
    // Large gap: Top team is extremely high, others are very low (Monogamous fan at heart)
    if (topTeam.score >= 90 && otherTeams.every(t => t.score < 55)) {
      return "Monogamous Devotee";
    }
    // High-roller: all teams are 88+
    if (teams.every(t => t.score >= 88)) {
      return "Uncompromising Zealot";
    }
    // Casuals: all teams are 60 or below
    if (teams.every(t => t.score <= 60)) {
      return "Passive Enthusiast";
    }
    // Equal devotion: all scores are very close
    if (maxScore - minScore <= 6) {
      return "Equal-Opportunity Fan";
    }
  }

  // 6. Highly Specific Team-Specific Tagline Matcher — solo circles only.
  // For multi-team circles we fall through to the circle-level archetypes below,
  // so a fan's other teams aren't erased by their single top team's phrase
  // (e.g. a Leafs + Canucks fan shouldn't just read "Leafs Nation Martyr").
  if (count === 1 && topTeam && teamSpecificPhrases[topTeam.id]) {
    const phrase = teamSpecificPhrases[topTeam.id];
    if (topTeam.score >= 85) {
      return phrase.high;
    } else {
      return phrase.standard;
    }
  }

  // 7. Geographic / Cities Spread Checks
  if (count >= 2) {
    if (uniqueCities.length === 1) {
      return "Metro-Area Zealot";
    }
    
    // Specific regional clusters
    if (hasEast && hasWest) {
      return "Coast-to-Coast Analyst";
    }
    if (hasEast && !hasWest && !hasCentral) {
      return "Eastern Seaboard Purist";
    }
    if (hasWest && !hasEast && !hasCentral) {
      return "Pacific Coast Loyalist";
    }
    if (hasCentral && !hasEast && !hasWest) {
      return "Heartland Traditionalist";
    }
  }

  // 8. Solo Teams (1 team)
  if (count === 1) {
    if (topTeam.id === 'leafs' && topTeam.score >= 85) {
      return "Toronto Sports Martyr";
    }
    if (topTeam.score >= 95) {
      return "Ride-or-Die Diehard";
    }
    if (topTeam.status === 'heartbreak' && topTeam.score >= 80) {
      return "The Heartbreak Specialist";
    }
    if (topTeam.status === 'champs' && topTeam.score >= 80) {
      return "The Glory Collector";
    }
    if (topTeam.status === 'champs' && topTeam.score < 55) {
      return "Frontrunner Fan";
    }
    if (earliestSince < 2000 && topTeam.score >= 80) {
      return "Generational Guardian";
    }
    if (latestSince >= 2022 && topTeam.score < 70) {
      return "Fresh Convert";
    }
    if (topTeam.score <= 40) {
      return "Casual Admirer";
    }
    return "The Pure Loyalist";
  }

  // 9. Multisport & League Profiles (Fallbacks for multi-team profiles).
  //    Each league has a high-devotion and a standard variant for more variety.
  if (uniqueLeagues.length === 1) {
    const zealous = avgScore >= 80;
    const leaguePersonas = {
      mls: zealous ? "Supporters' Section Capo" : "Global Game Disciple",
      nfl: zealous ? "Gridiron Zealot" : "Gridiron Analyst",
      nba: zealous ? "Hardwood Fanatic" : "Hardwood Obsessive",
      nhl: zealous ? "Rink Warrior" : "Ice Hockey Purist",
      mlb: zealous ? "Bleacher Creature" : "Diamond Tactician",
      cfl: zealous ? "Grey Cup Diehard" : "Three-Down Loyalist"
    };
    if (leaguePersonas[uniqueLeagues[0]]) return leaguePersonas[uniqueLeagues[0]];
  }

  if (uniqueLeagues.length === 2) {
    return avgScore >= 80 ? "Two-Sport Fanatic" : "Dual-Front Analyst";
  }
  if (uniqueLeagues.length === 3) {
    return avgScore >= 80 ? "Tri-Arena Sage" : "Three-League Juggler";
  }
  if (uniqueLeagues.length >= 4) {
    return avgScore >= 75 ? "Omni-Sport Polymath" : "Sports Buffet Grazer";
  }

  // 10. Tiered devotion fallback — a persona for every intensity level so the
  //     badge never repeats a single catch-all.
  if (avgScore >= 90) return "Obsessed Superfan";
  if (avgScore >= 78) return "Devoted Believer";
  if (avgScore >= 62) return "Fandom Connoisseur";
  if (avgScore >= 45) return "Weekend Warrior";
  if (avgScore >= 30) return "Casual Onlooker";
  return "Curious Newcomer";
}

// Every archetype the engine above can return (besides the per-team phrases).
export const GENERIC_ARCHETYPES = [
  "Bay Area Purist",
  "Bleacher Creature",
  "Casual Admirer",
  "Casual Onlooker",
  "Coast-to-Coast Analyst",
  "Curious Newcomer",
  "Devoted Believer",
  "Diamond Tactician",
  "Dual-Front Analyst",
  "Dynasty Collector",
  "Eastern Seaboard Purist",
  "Equal-Opportunity Fan",
  "Fair-Weather Frontrunner",
  "Fandom Connoisseur",
  "Five-Borough Die-hard",
  "Fresh Convert",
  "Frontrunner Fan",
  "Generational Guardian",
  "Global Game Disciple",
  "Glutton for Punishment",
  "Grey Cup Diehard",
  "Gridiron Analyst",
  "Gridiron Zealot",
  "Hardwood Fanatic",
  "Hardwood Obsessive",
  "Heartland Traditionalist",
  "Hollywood Heavyweight",
  "Ice Hockey Purist",
  "Leafs Nation Martyr",
  "Legacy Traditionalist",
  "Metro-Area Zealot",
  "Modern Era Bandwagoner",
  "Monogamous Devotee",
  "Noble Sufferer",
  "Obsessed Superfan",
  "Omni-Sport Polymath",
  "Pacific Coast Loyalist",
  "Passive Enthusiast",
  "Ride-or-Die Diehard",
  "Rink Warrior",
  "Rollercoaster Rider",
  "Sports Buffet Grazer",
  "Supporters' Section Capo",
  "The Chaos Agent",
  "The Glory Collector",
  "The Heartbreak Specialist",
  "The Pure Loyalist",
  "The Six Traditionalist",
  "Three-Down Loyalist",
  "Three-League Juggler",
  "Title Town Aristocrat",
  "Toronto Sports Martyr",
  "Tri-Arena Sage",
  "Two-Sport Fanatic",
  "Uncompromising Zealot",
  "Weekend Warrior",
  "Windy City Faithful",
];

export const KNOWN_ARCHETYPES = new Set([
  ...GENERIC_ARCHETYPES,
  ...Object.values(teamSpecificPhrases).flatMap(p => [p.high, p.standard]),
]);
