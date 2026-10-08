import { sportsData } from './teams.js';
import confetti from 'canvas-confetti';
import html2canvas from 'html2canvas';
import { HubSDK } from '@ethanhodge7373/hub-sdk';
import { saveWaitlistEntry } from './waitlist.js';
import { saveCircle, fetchCircle } from './circles.js';
import { getArchetype, KNOWN_ARCHETYPES } from './archetypes.js';
import { sanitizeCircle, sanitizeHandle } from './circlePayload.js';
import { RAINBOW_RADII, RAINBOW_CX, RAINBOW_CY, getLuminance, getContrastAdaptedColor, getPredictionLabel, computeFanScore } from './cardVisuals.js';
import { getFanId, getLastHandle, claimHandle, HANDLE_PATTERN } from './fans.js';

// Every event (page views, errors, custom) carries this browser's anonymous
// fan id as user_id, so one person's activity can be followed across visits.
HubSDK.init({
  appSlug: 'fanlog',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  userId: getFanId(),
});

// --- REFERRAL ATTRIBUTION ---
// Visitors arriving from a shared Loyalty Card carry ?ref=<sharer handle>
// (see getShareUrl). Capture it once on load so we can measure referral →
// conversion: fire a landing event now, then stamp `referredBy` onto the
// downstream conversion events (circle_created, waitlist_signup).
const referredBy = new URLSearchParams(window.location.search).get('ref') || null;
if (referredBy) HubSDK.track('referral_landing', { ref: referredBy });

// --- STATE MANAGEMENT ---
let selectedTeams = [];
let currentQuizTeamIndex = 0;
let userQuizAnswers = {}; // key: "teamId_questionKey", value: score
let activeMorphIndex = 0;
let morphIntervalId = null;
let savedHandle = ""; // Track user handle from the start

// Helper to determine devotion tier based on overall score
function getDevotionTier(score) {
  if (score >= 90) return "MYTHIC";
  if (score >= 75) return "ALL-STAR";
  if (score >= 55) return "PRO";
  return "ROOKIE";
}

// Automatically recalculate the top team based on highest devotion score
function recalculateTopTeam() {
  if (selectedTeams.length === 0) return;
  let maxScore = -1;
  selectedTeams.forEach(t => {
    t.isTop = false; // Reset
    if (t.score > maxScore) {
      maxScore = t.score;
    }
  });
  const topTeam = selectedTeams.find(t => t.score === maxScore);
  if (topTeam) {
    topTeam.isTop = true;
  }
}

// Mock handles for random profile generator
const sampleHandles = [
  "@BradyFan", "@LADevotee", "@ChaosMaker", "@LeafsSufferer", "@GloryCollector",
  "@TitleSeeker", "@SportySpur", "@NetRattler", "@PuckMogul", "@HomeRunHero",
  "@PitchPerfect", "@GoalGetter", "@DoubleDribble", "@RedZoneKing", "@IceGlider"
];

// Helper to generate a dynamic random profile containing exactly 3 teams
function generateRandomMorphProfile() {
  const allTeams = [];
  for (const league in sportsData) {
    sportsData[league].teams.forEach(t => {
      allTeams.push({
        id: t.id,
        name: t.name,
        short: t.short,
        logo: t.logo,
        city: t.city,
        status: t.status,
        primaryColor: t.primary,
        secondaryColor: t.secondary,
        league: league
      });
    });
  }
  
  // Pick exactly 3 unique random teams
  const chosen = [];
  const tempTeams = [...allTeams];
  while (chosen.length < 3 && tempTeams.length > 0) {
    const idx = Math.floor(Math.random() * tempTeams.length);
    chosen.push(tempTeams.splice(idx, 1)[0]);
  }
  
  // Set scores and flags
  chosen.forEach((t, i) => {
    t.isTop = (i === 0);
    if (i === 0) {
      t.score = Math.floor(80 + Math.random() * 21); // Top team: 80 to 100
    } else if (i === 1) {
      t.score = Math.floor(60 + Math.random() * 19); // Second team: 60 to 78
    } else {
      t.score = Math.floor(40 + Math.random() * 19); // Third team: 40 to 58
    }
  });
  
  const topTeam = chosen[0];
  const overallScore = computeFanScore(chosen);
  
  const welcomeInput = document.getElementById('welcome-fan-name');
  let name = "";
  if (welcomeInput && welcomeInput.value.trim()) {
    const val = welcomeInput.value.trim();
    name = val.startsWith('@') ? val : `@${val}`;
  } else {
    name = sampleHandles[Math.floor(Math.random() * sampleHandles.length)];
  }
  const tagline = generateSportsIdentityTagline(chosen);
  
  const since = String(Math.floor(1975 + Math.random() * 50)); // 1975 to 2025
  const prediction = String(Math.floor(2026 + Math.random() * 15)); // 2026 to 2040
  
  return {
    name,
    tagline,
    overallScore,
    since,
    prediction,
    status: "SAMPLE",
    primaryColor: topTeam.primaryColor,
    secondaryColor: topTeam.secondaryColor,
    teams: chosen
  };
}

// --- QUIZ QUESTIONS DATABASE BANK (10 Devotion Questions) ---
const quizQuestionsDatabase = [
  {
    key: 'frequency',
    text: 'How frequently do you watch or listen to their games?',
    options: [
      { text: 'Highlights only / major games', score: 5 },
      { text: 'About half the games', score: 12 },
      { text: 'Almost every single game', score: 18 },
      { text: '100% of matches live or recorded', score: 25 }
    ]
  },
  {
    key: 'losses',
    text: 'How long does a tough loss affect your mood?',
    options: [
      { text: 'Minutes (It’s just a game)', score: 5 },
      { text: 'A few hours (Annoyed but fine)', score: 12 },
      { text: 'Until the next day (Ruins my evening)', score: 18 },
      { text: 'Days (Hard to shake off)', score: 25 }
    ]
  },
  {
    key: 'debate',
    text: 'How willing are you to argue or defend your team?',
    options: [
      { text: 'Avoid debates entirely', score: 5 },
      { text: 'Polite banter only', score: 12 },
      { text: 'Will engage if provoked', score: 18 },
      { text: 'Die-hard defender energy', score: 25 }
    ]
  },
  {
    key: 'gear',
    text: 'What is your team gear collection like?',
    options: [
      { text: 'None / digital fan only', score: 5 },
      { text: 'A cap or a t-shirt', score: 12 },
      { text: 'Multiple jerseys & memorabilia', score: 18 },
      { text: 'Full home shrine / game-worn items', score: 25 }
    ]
  },
  {
    key: 'attendance',
    text: 'How often do you try to attend games in person?',
    options: [
      { text: 'Never / TV & digital fan only', score: 5 },
      { text: 'Once every few years', score: 12 },
      { text: 'At least once a season', score: 18 },
      { text: 'Season ticket holder / multiple games a year', score: 25 }
    ]
  },
  {
    key: 'news',
    text: 'How closely do you follow team news and rumors?',
    options: [
      { text: 'Only when major stories break', score: 5 },
      { text: 'Weekly check-ins / summaries', score: 12 },
      { text: 'Daily feed scrolling', score: 18 },
      { text: 'Notifications on / refresh hourly', score: 25 }
    ]
  },
  {
    key: 'superstitions',
    text: 'Do you have any game-day superstitions or lucky rituals?',
    options: [
      { text: 'None, it has no effect', score: 5 },
      { text: 'A favorite shirt or seat', score: 12 },
      { text: 'Lucky charms / specific routine', score: 18 },
      { text: 'Complete game-day lockdown / strict rituals', score: 25 }
    ]
  },
  {
    key: 'finance',
    text: 'How much money do you spend on your team annually?',
    options: [
      { text: 'Almost nothing', score: 5 },
      { text: 'Under $100 (basic gear)', score: 12 },
      { text: 'Up to $500 (tickets/streaming/gear)', score: 18 },
      { text: '$500+ (major trips/tickets/exclusive merch)', score: 25 }
    ]
  },
  {
    key: 'history',
    text: 'How well do you know the team\'s history and roster?',
    options: [
      { text: 'Know the star players only', score: 5 },
      { text: 'Know the current roster and coach', score: 12 },
      { text: 'Know deep history and prospects', score: 18 },
      { text: 'Walking encyclopedia of stats and lore', score: 25 }
    ]
  },
  {
    key: 'priority',
    text: 'Would you cancel personal plans to watch a critical game?',
    options: [
      { text: 'No, personal plans always come first', score: 5 },
      { text: 'Only for a championship game', score: 12 },
      { text: 'Yes, for any playoff/rivalry matchup', score: 18 },
      { text: 'Yes, my schedule revolves around game day', score: 25 }
    ]
  },
  {
    key: 'social',
    text: 'How plugged in are you to the team online?',
    options: [
      { text: 'I don\'t follow them on socials', score: 5 },
      { text: 'Follow the official team account', score: 12 },
      { text: 'Follow beat reporters & fan pages too', score: 18 },
      { text: 'In the group chats, forums, and reply sections daily', score: 25 }
    ]
  },
  {
    key: 'travel',
    text: 'How far have you traveled to see them play?',
    options: [
      { text: 'Never traveled for a game', score: 5 },
      { text: 'Crossed town for a home game', score: 12 },
      { text: 'Road-tripped to an away game', score: 18 },
      { text: 'Flown / crossed borders to follow them', score: 25 }
    ]
  },
  {
    key: 'watchStyle',
    text: 'What does watching a game actually look like for you?',
    options: [
      { text: 'On in the background while I do other things', score: 5 },
      { text: 'Watching, but casually', score: 12 },
      { text: 'Locked in, phone down, every play matters', score: 18 },
      { text: 'Pacing, yelling at refs, living every possession', score: 25 }
    ]
  },
  {
    key: 'trades',
    text: 'How do you react when the team trades a fan favorite?',
    options: [
      { text: 'Barely notice', score: 5 },
      { text: 'A little sad, then move on', score: 12 },
      { text: 'Rant to friends and question the front office', score: 18 },
      { text: 'Personal betrayal. I remember it for years', score: 25 }
    ]
  },
  {
    key: 'memory',
    text: 'How vivid is your earliest memory of this team?',
    options: [
      { text: 'Honestly can\'t remember one', score: 5 },
      { text: 'A vague highlight or two', score: 12 },
      { text: 'I remember the game and who I watched it with', score: 18 },
      { text: 'I can replay the exact moment play-by-play', score: 25 }
    ]
  },
  {
    key: 'evangelism',
    text: 'How hard do you recruit new fans to the team?',
    options: [
      { text: 'Never bring it up', score: 5 },
      { text: 'Mention them if sports come up', score: 12 },
      { text: 'Actively pitch them to friends & partners', score: 18 },
      { text: 'I\'ve converted people. There are photos in jerseys', score: 25 }
    ]
  },
  {
    key: 'fantasy',
    text: 'How deep are you into the stats side of fandom?',
    options: [
      { text: 'I just watch the games', score: 5 },
      { text: 'Check standings and box scores', score: 12 },
      { text: 'Play fantasy / follow advanced stats', score: 18 },
      { text: 'Spreadsheets, projections, salary cap knowledge', score: 25 }
    ]
  },
  {
    key: 'offseason',
    text: 'What happens to your fandom in the offseason?',
    options: [
      { text: 'I forget about them until opening day', score: 5 },
      { text: 'Check in around the draft / free agency', score: 12 },
      { text: 'Follow every signing and rumor', score: 18 },
      { text: 'There is no offseason. Mock drafts in my sleep', score: 25 }
    ]
  },
  {
    key: 'identity',
    text: 'How much is this team part of who you are?',
    options: [
      { text: 'It\'s just entertainment', score: 5 },
      { text: 'A fun part of my life', score: 12 },
      { text: 'It\'s in my bio / people associate me with them', score: 18 },
      { text: 'It\'s family heritage. Non-negotiable', score: 25 }
    ]
  },
  {
    key: 'weather',
    text: 'Would you sit through brutal weather or a blowout loss live?',
    options: [
      { text: 'I\'d leave early / stay home', score: 5 },
      { text: 'Stay if it\'s not too bad', score: 12 },
      { text: 'Stay to the final whistle, always', score: 18 },
      { text: 'Rain, snow, 40-point deficit — I\'m not moving', score: 25 }
    ]
  },
  {
    key: 'rivalry',
    text: 'How do you feel about their biggest rival?',
    options: [
      { text: 'No strong feelings either way', score: 5 },
      { text: 'Prefer my team, but respect them', score: 12 },
      { text: 'Actively root against them every week', score: 18 },
      { text: 'Pure hatred. I celebrate their losses', score: 25 }
    ]
  },
  {
    key: 'scoreCheck',
    text: 'When they play, when do you check the score?',
    options: [
      { text: 'Whenever I happen to see it', score: 5 },
      { text: 'Sometime after the game ends', score: 12 },
      { text: 'Refreshing throughout the game', score: 18 },
      { text: 'First thing I look at, every single day', score: 25 }
    ]
  },
  {
    key: 'anthem',
    text: 'How do intros, anthems, or big moments hit you?',
    options: [
      { text: 'I tune them out', score: 5 },
      { text: 'Nice, but no big deal', score: 12 },
      { text: 'Chills in the big moments', score: 18 },
      { text: 'Full goosebumps, sometimes teary', score: 25 }
    ]
  },
  {
    key: 'nicknames',
    text: 'How well do you know the players and their nicknames?',
    options: [
      { text: 'The superstars only', score: 5 },
      { text: 'Most of the starters', score: 12 },
      { text: 'Starters, bench, and nicknames', score: 18 },
      { text: 'Down to the practice squad and prospects', score: 25 }
    ]
  },
  {
    key: 'venue',
    text: 'What is your relationship with their home venue?',
    options: [
      { text: 'Never been / not fussed', score: 5 },
      { text: 'Been once, it was fun', score: 12 },
      { text: 'Go when I can, know the spot', score: 18 },
      { text: 'It\'s hallowed ground to me', score: 25 }
    ]
  },
  {
    key: 'media',
    text: 'How much team-specific media do you consume?',
    options: [
      { text: 'None, just the games', score: 5 },
      { text: 'The odd article or clip', score: 12 },
      { text: 'Regular podcasts / beat writers', score: 18 },
      { text: 'Every podcast, pod, and postgame show', score: 25 }
    ]
  },
  {
    key: 'partner',
    text: 'How much does your fandom show up in your relationships?',
    options: [
      { text: 'It doesn\'t really come up', score: 5 },
      { text: 'People know I casually like them', score: 12 },
      { text: 'Loved ones plan around game day', score: 18 },
      { text: 'It\'s basically a dealbreaker to mock them', score: 25 }
    ]
  },
  {
    key: 'draftNight',
    text: 'How do you treat the draft or signing period?',
    options: [
      { text: 'Don\'t follow it', score: 5 },
      { text: 'Catch the headlines after', score: 12 },
      { text: 'Watch the big picks live', score: 18 },
      { text: 'Appointment viewing with my own big board', score: 25 }
    ]
  },
  {
    key: 'collectibles',
    text: 'Do you collect anything tied to the team?',
    options: [
      { text: 'Nothing at all', score: 5 },
      { text: 'A ticket stub or two', score: 12 },
      { text: 'Cards, pennants, or signed items', score: 18 },
      { text: 'A curated collection I\'d insure', score: 25 }
    ]
  },
  {
    key: 'badSeasons',
    text: 'What do you do during a rebuild or losing season?',
    options: [
      { text: 'Check out until they\'re good again', score: 5 },
      { text: 'Watch a bit less', score: 12 },
      { text: 'Same as always, win or lose', score: 18 },
      { text: 'Losing seasons are when I show up hardest', score: 25 }
    ]
  },
  {
    key: 'hometown',
    text: 'How tied is this team to your sense of home or identity?',
    options: [
      { text: 'Not connected to it', score: 5 },
      { text: 'A little local pride', score: 12 },
      { text: 'A real part of where I\'m from', score: 18 },
      { text: 'They ARE my city to me', score: 25 }
    ]
  },
  {
    key: 'trashTalk',
    text: 'How active are you talking them up (or down others) online?',
    options: [
      { text: 'I stay out of it', score: 5 },
      { text: 'A like or repost here and there', score: 12 },
      { text: 'I\'ll jump into the replies', score: 18 },
      { text: 'I run the group chat and the timeline', score: 25 }
    ]
  },
  {
    key: 'championship',
    text: 'How would you react if they won it all?',
    options: [
      { text: 'Say "nice" and move on', score: 5 },
      { text: 'Celebrate for the night', score: 12 },
      { text: 'Cry, call people, book the parade', score: 18 },
      { text: 'Best day of my life, no question', score: 25 }
    ]
  },
  {
    key: 'gameDayPlans',
    text: 'How does game day shape your schedule?',
    options: [
      { text: 'It doesn\'t', score: 5 },
      { text: 'I\'ll catch it if I\'m free', score: 12 },
      { text: 'I block off the time', score: 18 },
      { text: 'Everything else moves around it', score: 25 }
    ]
  },
  {
    key: 'legacyFan',
    text: 'How did you become a fan of this team?',
    options: [
      { text: 'Recently picked them up', score: 5 },
      { text: 'Jumped on during a good run', score: 12 },
      { text: 'Been with them for years', score: 18 },
      { text: 'Born into it — lifelong, passed down', score: 25 }
    ]
  },
  {
    key: 'sacrifice',
    text: 'What would you give up for them to win a title?',
    options: [
      { text: 'Nothing, it\'s just sports', score: 5 },
      { text: 'A weekend or some cash', score: 12 },
      { text: 'A pricey trip and some dignity', score: 18 },
      { text: 'Almost anything — name the price', score: 25 }
    ]
  }
];

// Helper to select N random questions from the database bank
function getRandomQuizQuestions(num) {
  const shuffled = [...quizQuestionsDatabase].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, num);
}

// --- GAMES-WATCHED SLIDER BUCKET CONFIG ---
// Each entry is an array of display-range labels. The slider index maps to a label.
// Score = Math.round((index / (buckets.length - 1)) * 25)
const leagueSlideBuckets = {
  NFL:        ['0', '1–4', '5–8', '9–12', '13–15', '16–17'],
  NBA:        ['0', '1–10', '11–20', '21–30', '31–41', '42–50', '51–60', '61–70', '71–82'],
  NHL:        ['0', '1–10', '11–20', '21–30', '31–41', '42–50', '51–60', '61–70', '71–82'],
  MLB:        ['0', '1–20', '21–40', '41–60', '61–80', '81–100', '101–120', '121–140', '141–162'],
  MLS:        ['0', '1–5', '6–10', '11–15', '16–20', '21–25', '26–30', '31–34'],
  CFL:        ['0', '1–3', '4–6', '7–9', '10–12', '13–15', '16–18'],
  EPL:        ['0', '1–5', '6–10', '11–15', '16–20', '21–25', '26–30', '31–38'],
  LALIGA:     ['0', '1–5', '6–10', '11–15', '16–20', '21–25', '26–30', '31–38'],
  BUNDESLIGA: ['0', '1–4', '5–8', '9–12', '13–17', '18–22', '23–27', '28–34'],
  SERIEA:     ['0', '1–5', '6–10', '11–15', '16–20', '21–25', '26–30', '31–38'],
  LIGUE1:     ['0', '1–4', '5–8', '9–12', '13–16', '17–20', '21–24', '25–28', '29–34'],
};

function getSliderBuckets(leagueKey) {
  return leagueSlideBuckets[leagueKey] || leagueSlideBuckets['NFL'];
}

// --- TEAM-SPECIFIC TRIVIA DATABASE ---
// Each entry: { q: "question text", opts: [ {t: "option text", c: true/false}, ... ] }
// Exactly one option should have c: true. Correct = 25 pts, wrong = 5 pts.
const triviaDatabase = {
  // ── NFL ──
  chiefs: { q: "Patrick Mahomes and the Chiefs defeated which team in Super Bowl LVII (2023)?", opts: [{t:"Philadelphia Eagles",c:true},{t:"Buffalo Bills"},{t:"Baltimore Ravens"},{t:"San Francisco 49ers"}] },
  eagles: { q: "The Eagles won their first-ever Super Bowl in Super Bowl LII. Who did they beat?", opts: [{t:"New England Patriots",c:true},{t:"Kansas City Chiefs"},{t:"Pittsburgh Steelers"},{t:"Dallas Cowboys"}] },
  cowboys: { q: "Which Cowboys legend holds the NFL all-time regular-season rushing yards record?", opts: [{t:"Emmitt Smith",c:true},{t:"Tony Dorsett"},{t:"DeMarco Murray"},{t:"Ezekiel Elliott"}] },
  niners: { q: "The 49ers lost Super Bowl LVIII (2024) to which team in overtime?", opts: [{t:"Kansas City Chiefs",c:true},{t:"Baltimore Ravens"},{t:"Green Bay Packers"},{t:"Detroit Lions"}] },
  packers: { q: "Aaron Rodgers won his only Super Bowl with Green Bay. Which season was it?", opts: [{t:"2010 season",c:true},{t:"2014 season"},{t:"2007 season"},{t:"2016 season"}] },
  bills: { q: "Josh Allen was drafted by Buffalo 7th overall. Which year was the 2018 NFL Draft held?", opts: [{t:"2018",c:true},{t:"2017"},{t:"2019"},{t:"2020"}] },
  seahawks: { q: "The Seahawks crushed Denver 43–8 in Super Bowl XLVIII. Who was their QB?", opts: [{t:"Russell Wilson",c:true},{t:"Matt Hasselbeck"},{t:"Geno Smith"},{t:"Tarvaris Jackson"}] },
  patriots: { q: "How many Super Bowls did Tom Brady win while playing for New England?", opts: [{t:"6",c:true},{t:"5"},{t:"7"},{t:"4"}] },
  raiders: { q: "The Raiders relocated from Oakland to Las Vegas and played their first season there in which year?", opts: [{t:"2020",c:true},{t:"2019"},{t:"2021"},{t:"2022"}] },
  giants_nfl: { q: "The Giants defeated the undefeated Patriots in Super Bowl XLII (2008). Who was New York's QB?", opts: [{t:"Eli Manning",c:true},{t:"Kerry Collins"},{t:"David Carr"},{t:"Phil Simms"}] },
  dolphins: { q: "The 1972 Miami Dolphins finished with a perfect record — the only undefeated Super Bowl champion. What was their final record?", opts: [{t:"17–0",c:true},{t:"16–0"},{t:"14–0"},{t:"15–0"}] },
  jets: { q: "The Jets selected QB Zach Wilson 2nd overall in the 2021 NFL Draft. Which college did he attend?", opts: [{t:"BYU",c:true},{t:"Utah"},{t:"Alabama"},{t:"Clemson"}] },
  ravens: { q: "Lamar Jackson won his second NFL MVP award after which 2023 regular season?", opts: [{t:"2023 season",c:true},{t:"2022 season"},{t:"2021 season"},{t:"2019 season"}] },
  bengals: { q: "Joe Burrow led Cincinnati to Super Bowl LVI (2022) where they lost to which team?", opts: [{t:"Los Angeles Rams",c:true},{t:"Kansas City Chiefs"},{t:"San Francisco 49ers"},{t:"Buffalo Bills"}] },
  browns: { q: "Which veteran QB had an unlikely playoff run with Cleveland in the 2023 season, going 4–1 as starter?", opts: [{t:"Joe Flacco",c:true},{t:"Deshaun Watson"},{t:"Baker Mayfield"},{t:"Jacoby Brissett"}] },
  steelers: { q: "Pittsburgh's iconic 'Steel Curtain' defense — defined by four Super Bowl wins — dominated which decade?", opts: [{t:"1970s",c:true},{t:"1980s"},{t:"1960s"},{t:"1990s"}] },
  texans: { q: "C.J. Stroud was Houston's first pick in the 2023 draft. What overall pick was he?", opts: [{t:"2nd overall",c:true},{t:"1st overall"},{t:"3rd overall"},{t:"5th overall"}] },
  colts: { q: "Peyton Manning's #18 is retired by the Colts. How many Super Bowls did he win with Indianapolis?", opts: [{t:"1",c:true},{t:"2"},{t:"0"},{t:"3"}] },
  jaguars: { q: "The Jaguars took Trevor Lawrence 1st overall in the 2021 NFL Draft. Which college did he come from?", opts: [{t:"Clemson",c:true},{t:"LSU"},{t:"Ohio State"},{t:"Alabama"}] },
  titans: { q: "The Tennessee Titans were formerly known by which name when they played in Houston?", opts: [{t:"Houston Oilers",c:true},{t:"Houston Texans"},{t:"Memphis Oilers"},{t:"Nashville Predators"}] },
  broncos: { q: "Denver defeated which team 24–10 in Super Bowl 50 (2016), powered by their 'No-Fly Zone' defense?", opts: [{t:"Carolina Panthers",c:true},{t:"New England Patriots"},{t:"Seattle Seahawks"},{t:"Arizona Cardinals"}] },
  chargers: { q: "Justin Herbert was selected 6th overall by the Chargers in 2020. What jersey number does he wear?", opts: [{t:"10",c:true},{t:"17"},{t:"12"},{t:"7"}] },
  commanders: { q: "Washington officially rebranded from Washington Football Team to what new name in 2022?", opts: [{t:"Commanders",c:true},{t:"Sentinels"},{t:"Red Wolves"},{t:"Presidents"}] },
  lions: { q: "The Lions ended a 30-year playoff win drought in the 2023 season. Who did they beat in the Wild Card round?", opts: [{t:"Los Angeles Rams",c:true},{t:"Tampa Bay Buccaneers"},{t:"Green Bay Packers"},{t:"Dallas Cowboys"}] },
  vikings: { q: "The 'Minneapolis Miracle' (2018 playoffs) was a walk-off touchdown catch by which Vikings receiver?", opts: [{t:"Stefon Diggs",c:true},{t:"Adam Thielen"},{t:"Justin Jefferson"},{t:"Randy Moss"}] },
  bears: { q: "Chicago selected Caleb Williams with the 1st overall pick in the 2024 NFL Draft. What position does he play?", opts: [{t:"Quarterback",c:true},{t:"Wide Receiver"},{t:"Running Back"},{t:"Tight End"}] },
  buccaneers: { q: "Tom Brady won his 7th Super Bowl with Tampa Bay, defeating which team in Super Bowl LV (2021)?", opts: [{t:"Kansas City Chiefs",c:true},{t:"Green Bay Packers"},{t:"New Orleans Saints"},{t:"Buffalo Bills"}] },
  saints: { q: "Drew Brees won his only Super Bowl (XLIV) with New Orleans. Who did they defeat?", opts: [{t:"Indianapolis Colts",c:true},{t:"Miami Dolphins"},{t:"Dallas Cowboys"},{t:"San Diego Chargers"}] },
  falcons: { q: "Atlanta blew a 28–3 lead in Super Bowl LI (2017) and lost in overtime to which team?", opts: [{t:"New England Patriots",c:true},{t:"New York Giants"},{t:"Philadelphia Eagles"},{t:"Pittsburgh Steelers"}] },
  panthers: { q: "The Panthers went 15–1 in the regular season before losing the Super Bowl in which year?", opts: [{t:"2015 season",c:true},{t:"2013 season"},{t:"2017 season"},{t:"2011 season"}] },
  rams: { q: "The Rams won Super Bowl LVI (2022) in their own building. What is the name of their stadium?", opts: [{t:"SoFi Stadium",c:true},{t:"MetLife Stadium"},{t:"AT&T Stadium"},{t:"Raymond James Stadium"}] },
  cardinals_nfl: { q: "Kyler Murray was the Cardinals' 1st overall pick. From which college was he selected?", opts: [{t:"University of Oklahoma",c:true},{t:"University of Arizona"},{t:"Auburn University"},{t:"Texas A&M"}] },

  // ── NBA ──
  lakers: { q: "LeBron James passed Kareem Abdul-Jabbar as the NBA's all-time leading scorer in which city?", opts: [{t:"Oklahoma City",c:true},{t:"Los Angeles"},{t:"Cleveland"},{t:"Miami"}] },
  celtics: { q: "Jaylen Brown won the 2024 NBA Finals MVP after the Celtics defeated which team in the Finals?", opts: [{t:"Dallas Mavericks",c:true},{t:"Miami Heat"},{t:"Indiana Pacers"},{t:"Minnesota Timberwolves"}] },
  warriors: { q: "The Warriors set the all-time NBA regular season wins record in 2015–16 with how many victories?", opts: [{t:"73",c:true},{t:"72"},{t:"67"},{t:"69"}] },
  bulls: { q: "Michael Jordan won 6 championships with Chicago across two separate three-peats. When were those runs?", opts: [{t:"1991–93 & 1996–98",c:true},{t:"1989–91 & 1995–97"},{t:"1991–93 & 1995–97"},{t:"1990–92 & 1997–99"}] },
  raptors: { q: "Toronto won the 2019 NBA Championship in 6 games. Where was the deciding Game 6 played?", opts: [{t:"Oracle Arena, Oakland",c:true},{t:"Scotiabank Arena, Toronto"},{t:"Madison Square Garden"},{t:"Staples Center"}] },
  heat: { q: "Before signing with Miami in 2019, Jimmy Butler came from which team?", opts: [{t:"Philadelphia 76ers",c:true},{t:"Houston Rockets"},{t:"Oklahoma City Thunder"},{t:"Minnesota Timberwolves"}] },
  knicks: { q: "Which Knicks guard broke out as a star in 2023–24, helping end the team's postseason irrelevance?", opts: [{t:"Jalen Brunson",c:true},{t:"Kristaps Porzingis"},{t:"Julius Randle"},{t:"RJ Barrett"}] },
  bucks: { q: "Giannis Antetokounmpo scored how many points in Game 6 of the 2021 NBA Finals?", opts: [{t:"50",c:true},{t:"38"},{t:"45"},{t:"32"}] },
  suns: { q: "Steve Nash won back-to-back MVP awards with Phoenix in which consecutive seasons?", opts: [{t:"2004–05 & 2005–06",c:true},{t:"2006–07 & 2007–08"},{t:"2002–03 & 2003–04"},{t:"2003–04 & 2004–05"}] },
  nets: { q: "Kevin Durant joined the Brooklyn Nets in 2019 via sign-and-trade from which team?", opts: [{t:"Golden State Warriors",c:true},{t:"Oklahoma City Thunder"},{t:"Cleveland Cavaliers"},{t:"Miami Heat"}] },
  sixers: { q: "Joel Embiid ultimately chose to represent which country's national team at the Olympics?", opts: [{t:"France",c:true},{t:"Cameroon"},{t:"Senegal"},{t:"USA"}] },
  cavaliers: { q: "LeBron James delivered Cleveland's first major sports championship in 52 years by coming back from 3–1 in which year?", opts: [{t:"2016",c:true},{t:"2015"},{t:"2017"},{t:"2014"}] },
  pistons: { q: "Detroit's 'Bad Boys' Pistons swept the Lakers to win back-to-back championships. Who was their head coach?", opts: [{t:"Chuck Daly",c:true},{t:"Larry Brown"},{t:"Rick Carlisle"},{t:"Flip Saunders"}] },
  pacers: { q: "Reggie Miller spent his entire NBA career with Indiana. How many total seasons did he play for the Pacers?", opts: [{t:"18",c:true},{t:"15"},{t:"12"},{t:"20"}] },
  hawks: { q: "Trae Young led Atlanta to the Eastern Conference Finals in 2021 by eliminating which #1 seed?", opts: [{t:"Philadelphia 76ers",c:true},{t:"Milwaukee Bucks"},{t:"Brooklyn Nets"},{t:"Miami Heat"}] },
  hornets: { q: "LaMelo Ball won the 2020–21 NBA Rookie of the Year. He is the younger brother of which NBA player?", opts: [{t:"Lonzo Ball",c:true},{t:"Gelo Ball"},{t:"D.J. Wilson"},{t:"Jordan Bell"}] },
  magic: { q: "Orlando selected Paolo Banchero 1st overall in 2022. He played college basketball at which school?", opts: [{t:"Duke",c:true},{t:"Kentucky"},{t:"UConn"},{t:"Gonzaga"}] },
  wizards: { q: "Bradley Beal was selected by Washington with the 3rd overall pick in which NBA Draft?", opts: [{t:"2012",c:true},{t:"2013"},{t:"2011"},{t:"2014"}] },
  nuggets: { q: "Nikola Jokic won three MVP awards and the 2023 NBA title. He is originally from which country?", opts: [{t:"Serbia",c:true},{t:"Croatia"},{t:"Slovenia"},{t:"Bosnia"}] },
  timberwolves: { q: "Anthony Edwards was selected 1st overall by Minnesota in 2020. Which university did he attend?", opts: [{t:"University of Georgia",c:true},{t:"University of Texas"},{t:"University of Kentucky"},{t:"UNC"}] },
  thunder: { q: "Shai Gilgeous-Alexander was traded to Oklahoma City from which team in 2019?", opts: [{t:"LA Clippers",c:true},{t:"Toronto Raptors"},{t:"Sacramento Kings"},{t:"Memphis Grizzlies"}] },
  blazers: { q: "Damian Lillard was drafted by Portland in 2012. What overall pick was he?", opts: [{t:"6th",c:true},{t:"11th"},{t:"3rd"},{t:"15th"}] },
  jazz: { q: "Karl Malone and John Stockton reached the NBA Finals twice. Which team denied them the title both times?", opts: [{t:"Chicago Bulls",c:true},{t:"Houston Rockets"},{t:"Seattle SuperSonics"},{t:"LA Lakers"}] },
  clippers: { q: "Kawhi Leonard suffered a playoff injury in the 2021 second round against the Suns. What type of injury was it?", opts: [{t:"Torn ACL",c:true},{t:"Torn Achilles"},{t:"Torn MCL"},{t:"Fractured knee"}] },
  kings_nba: { q: "The Kings ended a 16-year playoff drought in which year?", opts: [{t:"2023",c:true},{t:"2022"},{t:"2021"},{t:"2024"}] },
  mavericks: { q: "Luka Dončić was drafted 3rd overall by Atlanta in 2018 and immediately traded to Dallas for which player?", opts: [{t:"Trae Young",c:true},{t:"Deandre Hunter"},{t:"De'Andre Hunter"},{t:"Kevin Huerter"}] },
  rockets: { q: "Houston selected big man Alperen Şengün with the 16th pick in 2021. Which country is he from?", opts: [{t:"Turkey",c:true},{t:"Serbia"},{t:"Greece"},{t:"Latvia"}] },
  grizzlies: { q: "Ja Morant was the 2nd overall pick in 2019. He played college ball at which small school?", opts: [{t:"Murray State",c:true},{t:"University of Memphis"},{t:"University of Kentucky"},{t:"LSU"}] },
  pelicans: { q: "New Orleans selected Zion Williamson 1st overall in 2019. Which college did he attend?", opts: [{t:"Duke",c:true},{t:"Kentucky"},{t:"North Carolina"},{t:"Kansas"}] },
  spurs: { q: "Tim Duncan, Tony Parker, and Manu Ginobili formed San Antonio's 'Big Three'. How many NBA titles did they win together?", opts: [{t:"4",c:true},{t:"3"},{t:"5"},{t:"2"}] },

  // ── NHL ──
  leafs: { q: "Auston Matthews set a Toronto Maple Leafs single-season goals record with 69 goals. Which season was it?", opts: [{t:"2022–23",c:true},{t:"2021–22"},{t:"2023–24"},{t:"2024–25"}] },
  bruins: { q: "David Pastrnak was a late bloomer drafted by Boston in 2012. In what round was he selected?", opts: [{t:"1st round",c:true},{t:"3rd round"},{t:"2nd round"},{t:"4th round"}] },
  blackhawks: { q: "Connor Bedard was selected 1st overall by Chicago in the 2023 NHL Draft. Where is he from?", opts: [{t:"North Vancouver, BC",c:true},{t:"Burnaby, BC"},{t:"Regina, SK"},{t:"Calgary, AB"}] },
  canadiens: { q: "The Montreal Canadiens have won more Stanley Cups than any other NHL franchise. How many?", opts: [{t:"24",c:true},{t:"21"},{t:"13"},{t:"18"}] },
  canucks: { q: "Which Canucks goalie wore an iconic mask design and won the Vezina Trophy twice in his career?", opts: [{t:"Roberto Luongo",c:true},{t:"Ryan Miller"},{t:"Cory Schneider"},{t:"Thatcher Demko"}] },
  knights: { q: "Vegas reached the Stanley Cup Final in their inaugural 2017–18 season. Which team beat them?", opts: [{t:"Washington Capitals",c:true},{t:"Pittsburgh Penguins"},{t:"Tampa Bay Lightning"},{t:"St. Louis Blues"}] },
  rangers: { q: "Mika Zibanejad was acquired by the Rangers in a 2016 trade from which team?", opts: [{t:"Ottawa Senators",c:true},{t:"Colorado Avalanche"},{t:"Edmonton Oilers"},{t:"Minnesota Wild"}] },
  avalanche: { q: "Colorado's Cale Makar won the Conn Smythe Trophy when the Avs won the 2022 Cup. What position does he play?", opts: [{t:"Defense",c:true},{t:"Center"},{t:"Right Wing"},{t:"Left Wing"}] },
  oilers: { q: "Connor McDavid was selected 1st overall by Edmonton. In which year?", opts: [{t:"2015",c:true},{t:"2014"},{t:"2016"},{t:"2013"}] },
  penguins: { q: "Sidney Crosby captained Pittsburgh to how many Stanley Cup championships?", opts: [{t:"3",c:true},{t:"2"},{t:"4"},{t:"1"}] },
  ducks: { q: "The Anaheim Ducks won their only Stanley Cup Championship in which year?", opts: [{t:"2007",c:true},{t:"2006"},{t:"2009"},{t:"2003"}] },
  sabres: { q: "Buffalo's 1999 Stanley Cup run ended in controversial fashion in Game 6 of the Finals. The opponent was?", opts: [{t:"Dallas Stars",c:true},{t:"Colorado Avalanche"},{t:"New Jersey Devils"},{t:"New York Rangers"}] },
  flames: { q: "The Calgary Flames won their only Stanley Cup in which year?", opts: [{t:"1989",c:true},{t:"1986"},{t:"1991"},{t:"1984"}] },
  hurricanes: { q: "Jordan Staal has been a core piece of Carolina for years. He was traded from which team?", opts: [{t:"Pittsburgh Penguins",c:true},{t:"Columbus Blue Jackets"},{t:"Nashville Predators"},{t:"Buffalo Sabres"}] },
  bluejackets: { q: "The Blue Jackets stunned the hockey world in the 2019 playoffs by sweeping which defending Stanley Cup champion?", opts: [{t:"Tampa Bay Lightning",c:true},{t:"Pittsburgh Penguins"},{t:"Washington Capitals"},{t:"Nashville Predators"}] },
  stars: { q: "Dallas's Jason Robertson was a 2017 draft steal. In what round was he selected?", opts: [{t:"2nd round",c:true},{t:"1st round"},{t:"3rd round"},{t:"4th round"}] },
  redwings: { q: "Gordie Howe played nearly his entire career in Detroit. Who eventually broke his NHL goals record?", opts: [{t:"Wayne Gretzky",c:true},{t:"Jaromír Jágr"},{t:"Brett Hull"},{t:"Mike Gartner"}] },
  panthers_nhl: { q: "The Florida Panthers won their first Stanley Cup championship in which year?", opts: [{t:"2024",c:true},{t:"2023"},{t:"2022"},{t:"2025"}] },
  kings_nhl: { q: "Drew Doughty has won Olympic gold medals representing which country?", opts: [{t:"Canada",c:true},{t:"USA"},{t:"Sweden"},{t:"Finland"}] },
  wild: { q: "Kirill Kaprizov won the Calder Trophy (Rookie of the Year) in 2021. He is from which country?", opts: [{t:"Russia",c:true},{t:"Finland"},{t:"Sweden"},{t:"Czech Republic"}] },
  predators: { q: "Nashville's Roman Josi won the Norris Trophy as the NHL's best defenseman. He is from which country?", opts: [{t:"Switzerland",c:true},{t:"Sweden"},{t:"Austria"},{t:"Finland"}] },
  devils: { q: "Jack Hughes was selected 1st overall by New Jersey in 2019. His brother Quinn Hughes plays for which NHL team?", opts: [{t:"Vancouver Canucks",c:true},{t:"Seattle Kraken"},{t:"Colorado Avalanche"},{t:"Edmonton Oilers"}] },
  islanders: { q: "The Islanders won four consecutive Stanley Cup championships (1980–83) under which legendary coach?", opts: [{t:"Al Arbour",c:true},{t:"Mike Milbury"},{t:"Terry Simpson"},{t:"Lorne Henning"}] },
  senators: { q: "Brady Tkachuk was Ottawa's 4th overall pick in 2018. What position does he play?", opts: [{t:"Left Wing",c:true},{t:"Center"},{t:"Right Wing"},{t:"Defense"}] },
  flyers: { q: "Philadelphia's 'Broad Street Bullies' dynasty in the 1970s produced how many Stanley Cup titles?", opts: [{t:"2",c:true},{t:"1"},{t:"3"},{t:"0"}] },
  sharks: { q: "Logan Couture has been San Jose's captain and franchise player. What position does he play?", opts: [{t:"Center",c:true},{t:"Left Wing"},{t:"Defense"},{t:"Right Wing"}] },
  kraken: { q: "The Seattle Kraken played their first regular season game in which year?", opts: [{t:"2021",c:true},{t:"2020"},{t:"2022"},{t:"2019"}] },
  blues: { q: "Ryan O'Reilly won the Conn Smythe Trophy when St. Louis won the 2019 Stanley Cup. What was his position?", opts: [{t:"Center",c:true},{t:"Left Wing"},{t:"Defense"},{t:"Right Wing"}] },
  lightning: { q: "Tampa Bay won back-to-back Stanley Cups. In which two consecutive years?", opts: [{t:"2020 & 2021",c:true},{t:"2019 & 2020"},{t:"2021 & 2022"},{t:"2019 & 2021"}] },
  utah_hc: { q: "The Utah Hockey Club relocated from Arizona, where it was previously known as?", opts: [{t:"Arizona Coyotes",c:true},{t:"Phoenix Roadrunners"},{t:"Arizona Cardinals"},{t:"Tucson Roadrunners"}] },
  capitals: { q: "Alex Ovechkin holds what NHL record and wears which jersey number?", opts: [{t:"All-time goals leader, #8",c:true},{t:"All-time points leader, #77"},{t:"All-time assists leader, #8"},{t:"All-time wins, #19"}] },
  jets_nhl: { q: "Mark Scheifele has been the Jets' franchise center since 2011. What is his jersey number?", opts: [{t:"55",c:true},{t:"26"},{t:"7"},{t:"81"}] },

  // ── MLB ──
  yankees: { q: "Aaron Judge broke which legendary Yankee's American League home run record in 2022 by hitting 62?", opts: [{t:"Roger Maris",c:true},{t:"Babe Ruth"},{t:"Mickey Mantle"},{t:"Alex Rodriguez"}] },
  redsox: { q: "Boston ended an 86-year championship drought with their first World Series title since 1918. What year?", opts: [{t:"2004",c:true},{t:"2007"},{t:"2003"},{t:"2001"}] },
  dodgers: { q: "Shohei Ohtani signed with the Dodgers on a record 10-year deal. How much was it worth?", opts: [{t:"$700 million",c:true},{t:"$500 million"},{t:"$600 million"},{t:"$450 million"}] },
  cubs: { q: "The Cubs ended a 108-year World Series championship drought in which year?", opts: [{t:"2016",c:true},{t:"2015"},{t:"2017"},{t:"2014"}] },
  giants_mlb: { q: "The San Francisco Giants won how many World Series championships between 2010 and 2014?", opts: [{t:"3",c:true},{t:"2"},{t:"4"},{t:"1"}] },
  bluejays: { q: "Vladimir Guerrero Jr. launched moonshots in the 2021 All-Star Home Run Derby. Who is his famous baseball father?", opts: [{t:"Vladimir Guerrero Sr.",c:true},{t:"Bobby Bonilla"},{t:"Roberto Alomar"},{t:"Carlos Delgado"}] },
  braves: { q: "Jorge Soler was named World Series MVP after Atlanta's 2021 title. How many home runs did he hit in the Series?", opts: [{t:"3",c:true},{t:"2"},{t:"4"},{t:"1"}] },
  astros: { q: "The Astros' 2017 World Series win was later marred by a scandal involving what?", opts: [{t:"Illegal sign-stealing using cameras",c:true},{t:"Performance-enhancing drugs"},{t:"Financial fraud"},{t:"Roster manipulation"}] },
  mets: { q: "Which Mets legend finished his career with a then-record 3,509 strikeouts as a New York Met?", opts: [{t:"Tom Seaver",c:true},{t:"Dwight Gooden"},{t:"Pedro Martinez"},{t:"Nolan Ryan"}] },
  cardinals: { q: "Albert Pujols won how many World Series championships as a St. Louis Cardinal?", opts: [{t:"2",c:true},{t:"1"},{t:"3"},{t:"0"}] },
  orioles: { q: "Cal Ripken Jr. broke Lou Gehrig's consecutive games record. What was Gehrig's old record?", opts: [{t:"2,130",c:true},{t:"2,000"},{t:"2,250"},{t:"1,987"}] },
  rays: { q: "Tampa Bay pioneered the 'Opener' strategy — using a reliever to start. What does an Opener typically do?", opts: [{t:"Faces the lineup once before handing off",c:true},{t:"Pitches only to left-handed batters"},{t:"Bats leadoff before pitching"},{t:"Only enters in high-leverage spots"}] },
  guardians: { q: "Cleveland changed its team name from the Indians to the Guardians ahead of which season?", opts: [{t:"2022",c:true},{t:"2021"},{t:"2023"},{t:"2020"}] },
  tigers: { q: "Miguel Cabrera won the Triple Crown in 2012 — the first in 45 years. Which award did he also win that year?", opts: [{t:"AL MVP",c:true},{t:"Cy Young"},{t:"Rookie of the Year"},{t:"Gold Glove"}] },
  royals: { q: "The Royals won the 2015 World Series. Who was their manager?", opts: [{t:"Ned Yost",c:true},{t:"Bob Boone"},{t:"Tony Perez"},{t:"Mike Matheny"}] },
  twins: { q: "Joe Mauer is a Minnesota legend. What was his primary position before moving to first base?", opts: [{t:"Catcher",c:true},{t:"Shortstop"},{t:"Third Base"},{t:"Center Field"}] },
  whitesox: { q: "Frank Thomas, 'The Big Hurt,' spent nearly his entire career with Chicago. What was his primary position?", opts: [{t:"First Base",c:true},{t:"Designated Hitter"},{t:"Left Field"},{t:"Third Base"}] },
  angels: { q: "Shohei Ohtani won the AL MVP in 2021 as an Angel, becoming the first player since Babe Ruth to dominate as both a hitter and pitcher. How many home runs did he hit?", opts: [{t:"46",c:true},{t:"40"},{t:"52"},{t:"38"}] },
  athletics: { q: "The Oakland Athletics announced plans to relocate to which city?", opts: [{t:"Las Vegas",c:true},{t:"Portland"},{t:"Nashville"},{t:"Charlotte"}] },
  mariners: { q: "Ichiro Suzuki set the single-season MLB hits record with 262 in which year?", opts: [{t:"2004",c:true},{t:"2001"},{t:"2007"},{t:"2003"}] },
  rangers_mlb: { q: "Texas won their first-ever World Series title in which year?", opts: [{t:"2023",c:true},{t:"2022"},{t:"2024"},{t:"2021"}] },
  phillies: { q: "Bryce Harper won the NL MVP with Philadelphia in which year?", opts: [{t:"2021",c:true},{t:"2022"},{t:"2020"},{t:"2023"}] },
  marlins: { q: "The Marlins have won two surprise World Series titles (1997 & 2003) and then famously did what each time?", opts: [{t:"Held a massive fire sale, dismantling the roster",c:true},{t:"Built a dynasty from within"},{t:"Signed multiple superstars"},{t:"Traded for veteran talent"}] },
  nationals: { q: "Juan Soto made his MLB debut at a remarkably young age. How old was he when he debuted for Washington?", opts: [{t:"19",c:true},{t:"18"},{t:"20"},{t:"21"}] },
  brewers: { q: "Christian Yelich won the NL MVP in 2018. He came to Milwaukee in a trade from which team?", opts: [{t:"Miami Marlins",c:true},{t:"San Diego Padres"},{t:"Cincinnati Reds"},{t:"Pittsburgh Pirates"}] },
  reds: { q: "Joey Votto won the NL MVP as a Cincinnati Red in which year?", opts: [{t:"2010",c:true},{t:"2011"},{t:"2009"},{t:"2012"}] },
  pirates: { q: "Roberto Clemente's #21 is retired across all of MLB in his honor. He played his entire career with which franchise?", opts: [{t:"Pittsburgh Pirates",c:true},{t:"San Francisco Giants"},{t:"New York Yankees"},{t:"St. Louis Cardinals"}] },
  padres: { q: "Manny Machado signed a contract extension with San Diego in 2022. How many years was the deal?", opts: [{t:"11 years",c:true},{t:"10 years"},{t:"8 years"},{t:"12 years"}] },
  diamondbacks: { q: "The D-backs made a surprise World Series run in 2023. Which team beat them in the Fall Classic?", opts: [{t:"Texas Rangers",c:true},{t:"Houston Astros"},{t:"Philadelphia Phillies"},{t:"Atlanta Braves"}] },
  rockies: { q: "Colorado's Nolan Arenado was traded to which team in 2021?", opts: [{t:"St. Louis Cardinals",c:true},{t:"New York Yankees"},{t:"Philadelphia Phillies"},{t:"Chicago Cubs"}] },

  // ── MLS ──
  miami: { q: "In his Inter Miami debut (Leagues Cup 2023), Lionel Messi scored a stunning free kick in which minute?", opts: [{t:"94th",c:true},{t:"87th"},{t:"90+2"},{t:"89th"}] },
  galaxy: { q: "David Beckham won two MLS Cups with LA Galaxy. In which years?", opts: [{t:"2011 & 2012",c:true},{t:"2010 & 2011"},{t:"2012 & 2014"},{t:"2009 & 2011"}] },
  sounders: { q: "Seattle Sounders won consecutive MLS Cups in 2019 and 2020. Where was the 2020 final held?", opts: [{t:"BBVA Stadium, Columbus (COVID bubble)",c:true},{t:"Seattle"},{t:"Portland"},{t:"Los Angeles"}] },
  lafc: { q: "Carlos Vela was the face of LAFC's early years. Which country does he represent internationally?", opts: [{t:"Mexico",c:true},{t:"USA"},{t:"Colombia"},{t:"Spain"}] },
  timbers: { q: "Portland won their first MLS Cup in which year?", opts: [{t:"2015",c:true},{t:"2017"},{t:"2013"},{t:"2019"}] },
  atlanta_utd: { q: "Atlanta United plays in which iconic multi-use stadium?", opts: [{t:"Mercedes-Benz Stadium",c:true},{t:"Bank of America Stadium"},{t:"State Farm Stadium"},{t:"Geodis Park"}] },
  toronto_fc: { q: "Toronto FC won the 2017 MLS Cup. Who scored the first penalty in the decisive shootout?", opts: [{t:"Jozy Altidore",c:true},{t:"Sebastian Giovinco"},{t:"Michael Bradley"},{t:"Victor Vázquez"}] },
  nycfc: { q: "NYCFC won their first MLS Cup in 2021. Which team did they beat in the final?", opts: [{t:"Portland Timbers",c:true},{t:"Seattle Sounders"},{t:"New England Revolution"},{t:"Colorado Rapids"}] },
  crew: { q: "Columbus Crew won the 2020 MLS Cup. What made that championship unusual?", opts: [{t:"Played without fans during a COVID bubble",c:true},{t:"First Canadian host venue"},{t:"Largest margin of victory ever"},{t:"First finals decided by Golden Goal"}] },
  cincinnati: { q: "FC Cincinnati's stadium is named after which local logistics company?", opts: [{t:"TQL (Total Quality Logistics)",c:true},{t:"Kroger"},{t:"Procter & Gamble"},{t:"Cincinnati Financial"}] },
  austin: { q: "Austin FC's stadium is named after which fintech company?", opts: [{t:"Q2 Stadium",c:true},{t:"Dell Technologies Park"},{t:"AMD Arena"},{t:"Apple Stadium"}] },
  cf_montreal: { q: "CF Montréal rebranded from their previous name 'Montreal Impact' in which year?", opts: [{t:"2021",c:true},{t:"2020"},{t:"2022"},{t:"2019"}] },
  charlotte_fc: { q: "Charlotte FC joined MLS in which year?", opts: [{t:"2022",c:true},{t:"2021"},{t:"2023"},{t:"2020"}] },
  fire: { q: "Chicago Fire won the MLS Cup in their inaugural 1998 season. Who was their legendary Czech striker?", opts: [{t:"Hristo Stoichkov",c:true},{t:"Frank Klopas"},{t:"Carlos Llamosa"},{t:"Diego Gutierrez"}] },
  rapids: { q: "Colorado Rapids won their only MLS Cup in which year?", opts: [{t:"2010",c:true},{t:"2007"},{t:"2013"},{t:"2005"}] },
  dc_united: { q: "D.C. United dominated early MLS history from 1996 to 2004. How many MLS Cups did they win?", opts: [{t:"4",c:true},{t:"3"},{t:"2"},{t:"5"}] },
  fc_dallas: { q: "FC Dallas won the Supporters' Shield in 2016 under which coach?", opts: [{t:"Oscar Pareja",c:true},{t:"Luchi Gonzalez"},{t:"Peter Nowak"},{t:"Colin Clarke"}] },
  dynamo: { q: "The Houston Dynamo won back-to-back MLS Cups in which years?", opts: [{t:"2006 & 2007",c:true},{t:"2007 & 2008"},{t:"2005 & 2006"},{t:"2008 & 2009"}] },
  minnesota_utd: { q: "Minnesota United plays at which purpose-built stadium?", opts: [{t:"Allianz Field",c:true},{t:"Target Field"},{t:"U.S. Bank Stadium"},{t:"TCF Bank Stadium"}] },
  nashville_sc: { q: "Nashville SC entered MLS in which year?", opts: [{t:"2020",c:true},{t:"2019"},{t:"2021"},{t:"2022"}] },
  revolution: { q: "New England won the 2021 Supporters' Shield. Who was their standout Spanish midfielder?", opts: [{t:"Carles Gil",c:true},{t:"Adam Buksa"},{t:"Tommy McNamara"},{t:"Sebastian Lletget"}] },
  orlando_city: { q: "Nani joined Orlando City in 2019. How many UEFA Champions League titles did he win at Manchester United?", opts: [{t:"4",c:true},{t:"3"},{t:"2"},{t:"5"}] },
  philadelphia_union: { q: "The Union won the MLS Supporters' Shield in 2020 and 2022. Who is their long-time head coach?", opts: [{t:"Jim Curtin",c:true},{t:"Gregg Berhalter"},{t:"Sigi Schmid"},{t:"Peter Nowak"}] },
  rsl: { q: "Real Salt Lake pulled off a massive upset in the 2009 MLS Cup, beating which team on penalties?", opts: [{t:"LA Galaxy",c:true},{t:"Columbus Crew"},{t:"New York Red Bulls"},{t:"Chicago Fire"}] },
  red_bulls: { q: "Red Bull Arena, home to NYRB, is located in which U.S. state?", opts: [{t:"New Jersey",c:true},{t:"New York"},{t:"Connecticut"},{t:"Pennsylvania"}] },
  san_diego_fc: { q: "San Diego FC became an MLS expansion club and began play in which year?", opts: [{t:"2025",c:true},{t:"2024"},{t:"2026"},{t:"2023"}] },
  earthquakes: { q: "Landon Donovan began his MLS career with San Jose before eventually becoming a legend at which other club?", opts: [{t:"LA Galaxy",c:true},{t:"Seattle Sounders"},{t:"Houston Dynamo"},{t:"Sporting KC"}] },
  sporting_kc: { q: "Sporting Kansas City won the 2013 MLS Cup in a penalty shootout. Who did they defeat?", opts: [{t:"Real Salt Lake",c:true},{t:"Portland Timbers"},{t:"Seattle Sounders"},{t:"LA Galaxy"}] },
  stlouis_city: { q: "St. Louis City SC entered MLS in which year?", opts: [{t:"2023",c:true},{t:"2022"},{t:"2024"},{t:"2021"}] },
  vancouver_wc: { q: "Ryan Gauld has been one of the Whitecaps' most creative players. He is from which country?", opts: [{t:"Scotland",c:true},{t:"England"},{t:"Ireland"},{t:"Wales"}] },

  // ── CFL ──
  bclions: { q: "The BC Lions have won 5 Grey Cup championships in their history. Their most recent came in which year?", opts: [{t:"2006",c:true},{t:"2011"},{t:"2000"},{t:"2004"}] },
  stampeders: { q: "Bo Levi Mitchell led Calgary to a Grey Cup title in which year?", opts: [{t:"2018",c:true},{t:"2017"},{t:"2019"},{t:"2016"}] },
  elks: { q: "Edmonton rebranded from the 'Eskimos' to the 'Elks' ahead of which CFL season?", opts: [{t:"2021",c:true},{t:"2020"},{t:"2022"},{t:"2019"}] },
  roughriders: { q: "Saskatchewan Roughriders are known for their passionate fanbase. Their home stadium is in which city?", opts: [{t:"Regina",c:true},{t:"Saskatoon"},{t:"Moose Jaw"},{t:"Swift Current"}] },
  bluebombers: { q: "Zach Collaros led Winnipeg to back-to-back Grey Cups (2021–22). Where did he play college football?", opts: [{t:"University of Cincinnati",c:true},{t:"Ohio State"},{t:"Michigan"},{t:"Penn State"}] },
  ticats: { q: "Hamilton lost the Grey Cup three straight times from 2012 to 2014. Who beat them in the 2014 final?", opts: [{t:"Calgary Stampeders",c:true},{t:"Edmonton Eskimos"},{t:"BC Lions"},{t:"Ottawa Redblacks"}] },
  argonauts: { q: "The Toronto Argonauts won the 2022 Grey Cup. Who was their starting quarterback?", opts: [{t:"McLeod Bethel-Thompson",c:true},{t:"Chad Kelly"},{t:"Ricky Ray"},{t:"Nick Arbuckle"}] },
  redblacks: { q: "The Ottawa Redblacks joined the CFL as an expansion franchise in which year?", opts: [{t:"2014",c:true},{t:"2013"},{t:"2015"},{t:"2012"}] },
  alouettes: { q: "The Montreal Alouettes won the 2023 Grey Cup. Where was the game held?", opts: [{t:"Hamilton",c:true},{t:"Montreal"},{t:"Calgary"},{t:"Vancouver"}] },

  // ── PREMIER LEAGUE ──
  arsenal: { q: "Arsenal's 2003–04 league season earned them the nickname 'The Invincibles'. What was their record?", opts: [{t:"38 games unbeaten (W26 D12)",c:true},{t:"36 games unbeaten"},{t:"38 games, 30 wins"},{t:"34 games unbeaten"}] },
  aston_villa: { q: "Aston Villa won the European Cup in 1982 against which club in the final?", opts: [{t:"Bayern Munich",c:true},{t:"Barcelona"},{t:"Real Madrid"},{t:"Liverpool"}] },
  bournemouth: { q: "Eddie Howe managed Bournemouth during their rise through the divisions. He later left to manage which Premier League club?", opts: [{t:"Newcastle United",c:true},{t:"West Ham"},{t:"Aston Villa"},{t:"Everton"}] },
  brentford: { q: "Brentford reached the Premier League for the first time in their history after winning promotion in which year?", opts: [{t:"2021",c:true},{t:"2020"},{t:"2022"},{t:"2019"}] },
  brighton: { q: "Alexis Mac Allister won the World Cup with Argentina in 2022 while at Brighton, then moved to which club?", opts: [{t:"Liverpool",c:true},{t:"Arsenal"},{t:"Chelsea"},{t:"Manchester City"}] },
  chelsea: { q: "Chelsea won the 2021 UEFA Champions League, defeating which club in the final?", opts: [{t:"Manchester City",c:true},{t:"Bayern Munich"},{t:"Real Madrid"},{t:"PSG"}] },
  crystal_palace: { q: "Crystal Palace's talisman Wilfried Zaha made how many senior England appearances before switching to Ivory Coast?", opts: [{t:"2",c:true},{t:"0"},{t:"5"},{t:"3"}] },
  everton: { q: "Everton legend Dixie Dean set an English top-flight record for goals in a single season in 1927–28. How many did he score?", opts: [{t:"60",c:true},{t:"55"},{t:"63"},{t:"45"}] },
  fulham: { q: "Fulham were promoted to the Premier League in 2022 under which manager?", opts: [{t:"Marco Silva",c:true},{t:"Scott Parker"},{t:"Slavia Jokanovic"},{t:"Jean-Marc Boissier"}] },
  ipswich: { q: "Ipswich Town, managed by Bobby Robson, won the UEFA Cup (now Europa League) in which year?", opts: [{t:"1981",c:true},{t:"1978"},{t:"1983"},{t:"1980"}] },
  leicester: { q: "Leicester City's miraculous Premier League title win in 2015–16 was achieved at odds of?", opts: [{t:"5000 to 1",c:true},{t:"2000 to 1"},{t:"10,000 to 1"},{t:"1000 to 1"}] },
  liverpool: { q: "Mohamed Salah joined Liverpool in 2017. How many league goals did he score in his debut Premier League season?", opts: [{t:"32",c:true},{t:"28"},{t:"35"},{t:"24"}] },
  man_city: { q: "Manchester City became the first English club to win the Treble in which season?", opts: [{t:"2022–23",c:true},{t:"2021–22"},{t:"2023–24"},{t:"2020–21"}] },
  man_utd: { q: "Sir Alex Ferguson managed Manchester United before retiring in 2013. For how many years?", opts: [{t:"26 years",c:true},{t:"22 years"},{t:"30 years"},{t:"18 years"}] },
  newcastle: { q: "Newcastle United's Saudi-led consortium takeover completed in which year?", opts: [{t:"2021",c:true},{t:"2020"},{t:"2022"},{t:"2019"}] },
  nottm_forest: { q: "Nottingham Forest won back-to-back European Cups under Brian Clough in which years?", opts: [{t:"1979 & 1980",c:true},{t:"1977 & 1978"},{t:"1981 & 1982"},{t:"1978 & 1979"}] },
  southampton: { q: "Gareth Bale started his career at Southampton before joining which London club in 2007?", opts: [{t:"Tottenham Hotspur",c:true},{t:"Arsenal"},{t:"Chelsea"},{t:"Fulham"}] },
  tottenham: { q: "Harry Kane became England's all-time top scorer and then moved to Bayern Munich in which year?", opts: [{t:"2023",c:true},{t:"2022"},{t:"2024"},{t:"2021"}] },
  west_ham: { q: "West Ham left their iconic Upton Park (Boleyn Ground) to move to which stadium?", opts: [{t:"London Stadium",c:true},{t:"West Ham Arena"},{t:"Stratford Park"},{t:"Olympic Oval"}] },
  wolves: { q: "Wolves' recruitment transformation has been driven by a partnership with which Portuguese super-agent?", opts: [{t:"Jorge Mendes",c:true},{t:"Pini Zahavi"},{t:"Mino Raiola"},{t:"Jonathan Barnett"}] },

  // ── LA LIGA ──
  real_madrid: { q: "Real Madrid won their 15th UEFA Champions League title in which year?", opts: [{t:"2024",c:true},{t:"2022"},{t:"2023"},{t:"2021"}] },
  barcelona: { q: "Lionel Messi won how many Ballon d'Or awards while playing for FC Barcelona?", opts: [{t:"6",c:true},{t:"5"},{t:"7"},{t:"4"}] },
  atletico: { q: "Diego Simeone has managed Atlético Madrid to La Liga titles. He won them in which two seasons?", opts: [{t:"2013–14 & 2020–21",c:true},{t:"2012–13 & 2019–20"},{t:"2014–15 & 2021–22"},{t:"2011–12 & 2020–21"}] },
  sevilla: { q: "Sevilla has won a record 7 UEFA Europa League titles. Their first came in which year?", opts: [{t:"2006",c:true},{t:"2007"},{t:"2005"},{t:"2009"}] },
  real_betis: { q: "Real Betis won the Copa del Rey in 2022. Who did they beat in the final?", opts: [{t:"Valencia CF",c:true},{t:"Real Madrid"},{t:"Barcelona"},{t:"Athletic Bilbao"}] },
  valencia: { q: "Valencia last won La Liga in which year?", opts: [{t:"2004",c:true},{t:"2007"},{t:"2002"},{t:"2009"}] },
  villarreal: { q: "Villarreal sensationally eliminated which giants in the 2021–22 Champions League semi-finals?", opts: [{t:"Bayern Munich",c:true},{t:"Real Madrid"},{t:"PSG"},{t:"Liverpool"}] },
  real_sociedad: { q: "Real Sociedad won their first Copa del Rey title in 2020 under which coach?", opts: [{t:"Imanol Alguacil",c:true},{t:"Julen Lopetegui"},{t:"Unai Emery"},{t:"Marcelo Bielsa"}] },
  athletic: { q: "Athletic Club Bilbao has a unique transfer policy. They only sign players from which region?", opts: [{t:"The Basque Country",c:true},{t:"Catalonia"},{t:"Andalusia"},{t:"Madrid"}] },
  celta: { q: "Celta de Vigo's beloved club legend Iago Aspas is known for his trickery. What position does he play?", opts: [{t:"Striker / Forward",c:true},{t:"Attacking Midfielder"},{t:"Left Wing"},{t:"Centre-Back"}] },
  getafe: { q: "Getafe CF is located in the greater metropolitan area of which Spanish city?", opts: [{t:"Madrid",c:true},{t:"Barcelona"},{t:"Seville"},{t:"Valencia"}] },
  alaves: { q: "Deportivo Alavés famously reached the UEFA Cup final in 2001. They lost to which English club?", opts: [{t:"Liverpool",c:true},{t:"Arsenal"},{t:"Chelsea"},{t:"Leeds United"}] },
  girona: { q: "Girona's stunning 3rd-place La Liga finish in 2023–24 was linked to their co-ownership by which group?", opts: [{t:"City Football Group",c:true},{t:"Red Bull Group"},{t:"Liberty Media"},{t:"Fenway Sports Group"}] },
  osasuna: { q: "CA Osasuna is proudly based in which Spanish city in the Navarre region?", opts: [{t:"Pamplona",c:true},{t:"Bilbao"},{t:"San Sebastián"},{t:"Zaragoza"}] },
  rayo: { q: "Rayo Vallecano is famous for being the working-class club of which Madrid neighbourhood?", opts: [{t:"Vallecas",c:true},{t:"Salamanca"},{t:"Moncloa"},{t:"Retiro"}] },
  espanyol: { q: "Following a relegation in 2020, Espanyol bounced back to La Liga under which manager?", opts: [{t:"Vicente Moreno",c:true},{t:"Óscar García"},{t:"Quique Sánchez Flores"},{t:"Pablo Machín"}] },
  mallorca: { q: "RCD Mallorca play their home games at which stadium?", opts: [{t:"Estadi de Son Moix",c:true},{t:"Son Dotze"},{t:"Camp Mallorca"},{t:"Estadio Balear"}] },
  las_palmas: { q: "UD Las Palmas is based on which Spanish island?", opts: [{t:"Gran Canaria",c:true},{t:"Tenerife"},{t:"Mallorca"},{t:"Lanzarote"}] },
  valladolid: { q: "Real Valladolid was purchased by which Brazilian football legend in 2018?", opts: [{t:"Ronaldo (R9)",c:true},{t:"Ronaldinho"},{t:"Kaká"},{t:"Roberto Carlos"}] },
  leganes: { q: "CD Leganés is a club situated close to which major Spanish city?", opts: [{t:"Madrid",c:true},{t:"Barcelona"},{t:"Valencia"},{t:"Seville"}] },

  // ── BUNDESLIGA ──
  bayern: { q: "Bayern Munich went on an extraordinary run of consecutive Bundesliga titles. How many straight championships did they win from 2013 to 2023?", opts: [{t:"11",c:true},{t:"10"},{t:"9"},{t:"12"}] },
  dortmund: { q: "Erling Haaland played for Dortmund before joining Manchester City. How many Bundesliga goals did he score for BVB?", opts: [{t:"62",c:true},{t:"49"},{t:"57"},{t:"70"}] },
  leverkusen: { q: "Bayer Leverkusen won their first-ever Bundesliga title under Xabi Alonso. In which season?", opts: [{t:"2023–24",c:true},{t:"2022–23"},{t:"2024–25"},{t:"2021–22"}] },
  leipzig: { q: "RB Leipzig were founded in which year as part of the Red Bull football network?", opts: [{t:"2009",c:true},{t:"2006"},{t:"2012"},{t:"2003"}] },
  stuttgart: { q: "VfB Stuttgart won their last Bundesliga title in which year?", opts: [{t:"2007",c:true},{t:"2009"},{t:"2003"},{t:"1992"}] },
  frankfurt: { q: "Eintracht Frankfurt won the 2022 Europa League final against which Scottish club?", opts: [{t:"Rangers",c:true},{t:"Villarreal"},{t:"Arsenal"},{t:"West Ham"}] },
  wolfsburg: { q: "VfL Wolfsburg won their only Bundesliga title in which year?", opts: [{t:"2009",c:true},{t:"2011"},{t:"2007"},{t:"2013"}] },
  mgladbach: { q: "Borussia Mönchengladbach's most famous fan is which former German Chancellor?", opts: [{t:"Helmut Kohl",c:true},{t:"Angela Merkel"},{t:"Olaf Scholz"},{t:"Gerhard Schröder"}] },
  augsburg: { q: "FC Augsburg were promoted to the Bundesliga for the first time in their history in which year?", opts: [{t:"2011",c:true},{t:"2010"},{t:"2013"},{t:"2009"}] },
  freiburg: { q: "Christian Streich managed Freiburg until his retirement in 2024. How many full seasons did he manage the club?", opts: [{t:"12",c:true},{t:"8"},{t:"15"},{t:"10"}] },
  mainz: { q: "Mainz is famous for developing which coach who went on to legendary success with Liverpool FC?", opts: [{t:"Jürgen Klopp",c:true},{t:"Thomas Tuchel"},{t:"Ralf Rangnick"},{t:"Julian Nagelsmann"}] },
  hoffenheim: { q: "TSG Hoffenheim was bankrolled into professional football by which German software billionaire?", opts: [{t:"Dietmar Hopp",c:true},{t:"Dietrich Mateschitz"},{t:"Hans-Joachim Watzke"},{t:"Klaus-Michael Kühne"}] },
  union_berlin: { q: "Union Berlin made their Bundesliga debut in which season?", opts: [{t:"2019–20",c:true},{t:"2018–19"},{t:"2020–21"},{t:"2017–18"}] },
  bochum: { q: "VfL Bochum are a blue-collar Ruhr Area club. Their ground is also known as the?", opts: [{t:"Vonovia Ruhrstadion",c:true},{t:"Bochum Arena"},{t:"Ruhrpott Arena"},{t:"Opel Arena"}] },
  heidenheim: { q: "FC Heidenheim made their Bundesliga debut as a promoted side in which season?", opts: [{t:"2023–24",c:true},{t:"2022–23"},{t:"2024–25"},{t:"2021–22"}] },
  kiel: { q: "Holstein Kiel secured promotion to the Bundesliga for the first time in their history in which year?", opts: [{t:"2024",c:true},{t:"2023"},{t:"2025"},{t:"2022"}] },
  stpauli: { q: "FC St. Pauli is internationally known for their left-wing, counter-cultural identity from which Hamburg neighbourhood?", opts: [{t:"St. Pauli district",c:true},{t:"Altona"},{t:"Wandsbek"},{t:"Eimsbüttel"}] },
  werder: { q: "Werder Bremen last won the Bundesliga in which year?", opts: [{t:"2004",c:true},{t:"2007"},{t:"2001"},{t:"2009"}] },

  // ── SERIE A ──
  inter: { q: "Inter Milan won their 20th Serie A title (Scudetto) in which year?", opts: [{t:"2024",c:true},{t:"2023"},{t:"2022"},{t:"2021"}] },
  ac_milan: { q: "The city derby between AC Milan and Inter Milan is known as which derby?", opts: [{t:"Derby della Madonnina",c:true},{t:"Derby d'Italia"},{t:"Derby del Nord"},{t:"Il Grande Derby"}] },
  juventus: { q: "Juventus won nine consecutive Serie A titles. In which season did that remarkable streak end?", opts: [{t:"2020–21",c:true},{t:"2019–20"},{t:"2021–22"},{t:"2018–19"}] },
  napoli: { q: "Napoli won their third Scudetto in 2022–23 under which coach?", opts: [{t:"Luciano Spalletti",c:true},{t:"Walter Mazzarri"},{t:"Maurizio Sarri"},{t:"Rudi Garcia"}] },
  roma: { q: "AS Roma reached the 2022 Europa League final under José Mourinho, losing to which Spanish club?", opts: [{t:"Sevilla",c:true},{t:"Villarreal"},{t:"Feyenoord"},{t:"Liverpool"}] },
  lazio: { q: "Gabriel Batistuta was a legendary striker in Serie A. Which club did he most famously represent?", opts: [{t:"ACF Fiorentina",c:true},{t:"SS Lazio"},{t:"AS Roma"},{t:"Parma"}] },
  atalanta: { q: "Atalanta won their first major European trophy (Europa League) in which year?", opts: [{t:"2024",c:true},{t:"2023"},{t:"2022"},{t:"2025"}] },
  fiorentina: { q: "Gabriel Batistuta is Fiorentina's all-time top scorer. He is from which country?", opts: [{t:"Argentina",c:true},{t:"Brazil"},{t:"Uruguay"},{t:"Colombia"}] },
  torino: { q: "The 'Grande Torino' — the legendary 1940s Torino squad that was arguably the best in the world — perished in which tragedy?", opts: [{t:"Superga air disaster (1949)",c:true},{t:"Linate air disaster"},{t:"Mont Blanc crash"},{t:"Valle d'Aosta avalanche"}] },
  bologna: { q: "Bologna's beloved coach Sinisa Mihajlovic fought which illness publicly before passing in 2022?", opts: [{t:"Leukemia",c:true},{t:"Lymphoma"},{t:"Prostate cancer"},{t:"Brain cancer"}] },
  genoa: { q: "Genoa CFC is the oldest football club in Italy. In which year were they founded?", opts: [{t:"1893",c:true},{t:"1899"},{t:"1906"},{t:"1889"}] },
  cagliari: { q: "Cagliari Calcio is based on which Italian island?", opts: [{t:"Sardinia",c:true},{t:"Sicily"},{t:"Elba"},{t:"Capri"}] },
  udinese: { q: "Udinese is famously linked to Watford FC through which family's ownership network?", opts: [{t:"The Pozzo family",c:true},{t:"Red Bull Group"},{t:"City Football Group"},{t:"Glazer family"}] },
  como: { q: "Como 1907 returned to Serie A in 2024 with major investment. Who are their famous Indonesian co-owners?", opts: [{t:"Robert & Michael Hartono",c:true},{t:"Bambang Hartono"},{t:"Prayogo Pangestu"},{t:"Sri Prakash Lohia"}] },
  empoli: { q: "Empoli FC is known as a development club. Which iconic manager started his coaching career there?", opts: [{t:"Maurizio Sarri",c:true},{t:"Roberto Mancini"},{t:"Antonio Conte"},{t:"Carlo Ancelotti"}] },
  lecce: { q: "US Lecce's nickname is 'I Giallorossi'. What do these Italian words translate to in English?", opts: [{t:"The Yellow and Reds",c:true},{t:"The Blue and Whites"},{t:"The Black and Whites"},{t:"The Red and Blacks"}] },
  monza: { q: "AC Monza was famously purchased by which former Italian PM and AC Milan president?", opts: [{t:"Silvio Berlusconi",c:true},{t:"Romano Prodi"},{t:"Giorgio Napolitano"},{t:"Massimo D'Alema"}] },
  parma: { q: "Parma were European powerhouses in the 1990s. Which Swedish striker helped lead them to the 1995 UEFA Cup?", opts: [{t:"Tomas Brolin",c:true},{t:"Henrik Larsson"},{t:"Martin Dahlin"},{t:"Kennet Andersson"}] },
  hellas_verona: { q: "Hellas Verona won the Serie A title in which year — considered one of the greatest upsets in Italian football history?", opts: [{t:"1985",c:true},{t:"1981"},{t:"1989"},{t:"1983"}] },
  venezia: { q: "Venezia FC is globally admired for their fashion-forward kits. Their home city has a unique geography — what is it?", opts: [{t:"Built on a lagoon, with canals instead of roads",c:true},{t:"Built into a hillside"},{t:"Located on a volcanic island"},{t:"The world's highest-altitude city"}] },

  // ── LIGUE 1 ──
  psg: { q: "Paris Saint-Germain signed Neymar from Barcelona in 2017 for a world-record fee. How much was it?", opts: [{t:"€222 million",c:true},{t:"€198 million"},{t:"€250 million"},{t:"€180 million"}] },
  marseille: { q: "Olympique de Marseille are the only French club to win the UEFA Champions League. In which year?", opts: [{t:"1993",c:true},{t:"1991"},{t:"1995"},{t:"1989"}] },
  lyon: { q: "Olympique Lyonnais won how many consecutive French league titles between 2002 and 2008?", opts: [{t:"7",c:true},{t:"6"},{t:"8"},{t:"5"}] },
  monaco: { q: "AS Monaco finished runners-up in the Champions League in 2004, losing the final to which club?", opts: [{t:"Porto",c:true},{t:"Real Madrid"},{t:"Juventus"},{t:"Chelsea"}] },
  lille: { q: "LOSC Lille pulled off a stunning Ligue 1 title win in 2020–21, defeating PSG. Who was their coach?", opts: [{t:"Christophe Galtier",c:true},{t:"Paulo Fonseca"},{t:"Jocelyn Gourvennec"},{t:"Lucien Favre"}] },
  nice: { q: "OGC Nice are located on the French Riviera. What is their home city?", opts: [{t:"Nice",c:true},{t:"Monaco"},{t:"Cannes"},{t:"Antibes"}] },
  lens: { q: "RC Lens's famous ground, the Stade Bollaert-Delelis, is known for its incredible atmosphere. Approximately how many fans does it hold?", opts: [{t:"~38,000",c:true},{t:"~25,000"},{t:"~45,000"},{t:"~30,000"}] },
  rennes: { q: "Stade Rennais is proudly located in the historically Celtic cultural region of France known as?", opts: [{t:"Brittany",c:true},{t:"Alsace"},{t:"Normandy"},{t:"Occitania"}] },
  nantes: { q: "FC Nantes are famous for their striking yellow and green home kit. What is their nickname?", opts: [{t:"Les Canaris (The Canaries)",c:true},{t:"Les Lions"},{t:"Les Aigles"},{t:"Les Verts"}] },
  strasbourg: { q: "RC Strasbourg is located in the Alsace region of France, near the border with which country?", opts: [{t:"Germany",c:true},{t:"Switzerland"},{t:"Belgium"},{t:"Luxembourg"}] },
  brest: { q: "Stade Brestois 29 qualified for the UEFA Champions League for the first time in which season?", opts: [{t:"2024–25",c:true},{t:"2023–24"},{t:"2025–26"},{t:"2022–23"}] },
  reims: { q: "Stade de Reims were a founding force in European football and reached the European Cup final twice. In which decade were they at their peak?", opts: [{t:"1950s",c:true},{t:"1960s"},{t:"1940s"},{t:"1970s"}] },
  toulouse: { q: "Toulouse FC returned to Ligue 1 after winning the second division in which year?", opts: [{t:"2022",c:true},{t:"2021"},{t:"2023"},{t:"2020"}] },
  le_havre: { q: "Le Havre Athletic Club is the oldest football club in France. In which year were they founded?", opts: [{t:"1872",c:true},{t:"1889"},{t:"1900"},{t:"1880"}] },
  montpellier: { q: "Montpellier HSC won their only Ligue 1 title in which year, beating PSG on the final day?", opts: [{t:"2012",c:true},{t:"2008"},{t:"2015"},{t:"2009"}] },
  auxerre: { q: "AJ Auxerre were a French football powerhouse in the 1990s. Which legendary manager guided them for over 40 years?", opts: [{t:"Guy Roux",c:true},{t:"Jean Fernandez"},{t:"Henri Zambelli"},{t:"Laurent Blanc"}] },
  angers: { q: "SCO Angers is based in the Pays de la Loire region. Their full name stands for what?", opts: [{t:"Sporting Club de l'Ouest",c:true},{t:"Sporting Club d'Orléans"},{t:"Sporting Club de l'Anjou"},{t:"Sporting Club de l'Observatoire"}] },
  saint_etienne: { q: "AS Saint-Étienne has won the most French league championships of any club. How many?", opts: [{t:"10",c:true},{t:"8"},{t:"12"},{t:"7"}] },
};

// Helper: look up a team's trivia entry, falling back to a generic question
function getTeamTrivia(teamId) {
  return triviaDatabase[teamId] || {
    q: `How well do you know ${teamId}'s history and current roster?`,
    opts: [
      { t: 'I know the full squad and club history', c: true },
      { t: 'I know the star players and highlights' },
      { t: 'I just know the name and city' },
      { t: 'I\'m still learning about them' }
    ]
  };
}


// --- DOM ELEMENTS QUERY ---
// Navigation and Buttons
const btnStartFlow = document.getElementById('btn-start-flow');
const btnToQuiz = document.getElementById('btn-to-quiz');
const btnQuizNext = document.getElementById('btn-quiz-next');
const btnRestartFlow = document.getElementById('b-restart-flow');
const btnDownloadPng = document.getElementById('b-download-png');
const btnCopyLink = document.getElementById('b-copy-link');
const btnHeaderWaitlist = document.getElementById('btn-header-waitlist');

// Step 2 Team Builder Inputs
const bSportSelect = document.getElementById('b-sport-select');
const bTeamSelect = document.getElementById('b-team-select');
const bSinceInput = document.getElementById('b-since-input');

// Step 3 Quiz
const quizProgressText = document.getElementById('quiz-progress-text');
const quizTeamName = document.getElementById('quiz-team-name');
const quizProgressBarFill = document.getElementById('quiz-progress-bar-fill');
const quizQuestionsList = document.getElementById('quiz-questions-list');

// Step 3.5 Fandom Hub Elements
const hubAddedTeamsList = document.getElementById('hub-added-teams-list');
const btnHubAddTeam = document.getElementById('btn-hub-add-team');
const btnHubFinish = document.getElementById('btn-hub-finish');

// Step 4 Reveal
const revealProgressFill = document.getElementById('reveal-progress-fill');
const revealTicker = document.getElementById('reveal-ticker');

// (Card-back elements removed - flow no longer flips card)

// --- WAKE UP ROUTINES ---
document.addEventListener('DOMContentLoaded', () => {
  goToStep(1);
  setupWaitlistBindings();
  initYearPickers();
  // A shared ?id=/?c= link replaces the landing page with the sharer's card
  // once it resolves (async for ?id=); no-op for a normal visit.
  loadSharedCardFromUrl();
});


// --- STEP VISIBILITY CONTROLLER ---
function goToStep(stepIndex) {
  // Changing steps hides the builder section, but the year-picker sheet lives on
  // <body> — close it so it can't linger fixed at the bottom of the screen.
  if (sincePickerWidget) sincePickerWidget.close(false);

  const steps = [
    document.getElementById('step-welcome'), // 1
    document.getElementById('step-builder'), // 2
    document.getElementById('step-quiz'),    // 3
    document.getElementById('step-hub'),     // 4
    document.getElementById('step-reveal'),  // 5
    document.getElementById('step-main'),    // 6
    document.getElementById('step-fanid')    // 7: between hub (4) and reveal (5)
  ];

  steps.forEach(stepEl => {
    if (stepEl) {
      stepEl.classList.remove('active');
    }
  });

  const targetStep = steps[stepIndex - 1];
  if (targetStep) {
    targetStep.classList.add('active');
    // Only pull the page up when the user has actually scrolled down past the
    // header, so advancing a step doesn't "snap" to the top when we're already
    // there. Lets the step's fade/slide-in transition carry the motion instead.
    if (window.scrollY > 80) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Manage morph loop based on step
  if (stepIndex === 1) {
    startMorphingLoop();
  } else {
    stopMorphingLoop();
  }

  // Render Hub UI
  if (stepIndex === 4) {
    renderHubUI();
  }

  // Handle calculation reveal sequence
  if (stepIndex === 5) {
    runRevealSequence();
  }

  // Header button visibility control
  const headerCta = document.getElementById('header-cta-container');
  if (stepIndex === 6) {
    headerCta.style.display = 'block';
    // ensureTurnstile(); // captcha disabled — see supabase/functions/waitlist-signup
  } else {
    headerCta.style.display = 'none';
  }
}

// Bind CTAs
btnStartFlow.addEventListener('click', () => {
  HubSDK.track('flow_started');
  goToStep(2);
});

// Logo click: go back to step 1 (home)
document.getElementById('site-logo')?.addEventListener('click', (e) => {
  // Only handle single clicks (double click is handled separately for admin)
  // If already on step 1, do nothing
  const welcomeStep = document.getElementById('step-welcome');
  if (welcomeStep && welcomeStep.classList.contains('active')) return;
  HubSDK.track('logo_home_clicked');
  goToStep(1);
});

// Helper: launch the demo (used by both header and hero buttons)
function launchTryDemo() {
  HubSDK.track('try_demo_clicked');
  const randomProfile = generateRandomMorphProfile();

  // Build selectedTeams from the random profile teams
  selectedTeams = randomProfile.teams.map((t, i) => ({
    ...t,
    isTop: i === 0,
    fanSince: String(Math.floor(1980 + Math.random() * 40)),
    prediction: String(Math.floor(2026 + Math.random() * 15)),
    quizQuestions: getRandomQuizQuestions(2)
  }));
  recalculateTopTeam();
  savedHandle = '';

  setupStep5MainPage(randomProfile.overallScore);

  // Glide to the demo once the step transition has settled.
  setTimeout(scrollToDemo, 250);
}

// Gentle eased scroll to an element (native 'smooth' is too abrupt for the
// short hop to the phone demo). easeInOutQuad — brisk but not a hard snap.
function smoothScrollTo(target, duration = 600) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return;
  const startY = window.scrollY;
  const dist = el.getBoundingClientRect().top;
  const startT = performance.now();
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  function step(now) {
    const p = Math.min((now - startT) / duration, 1);
    window.scrollTo(0, startY + dist * ease(p));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function scrollToDemo() {
  smoothScrollTo('demo-anchor');
}

// Try the App Demo button (hero, on welcome step) — randomizes a demo profile.
document.getElementById('btn-try-demo')?.addEventListener('click', launchTryDemo);

// Try the App Demo button (header) — by now the user is on their own card, so
// DON'T wipe it with a random profile: if a circle already exists, just glide to
// the live demo of *their* card; only randomize as a fallback when none exists.
document.getElementById('btn-header-try-demo')?.addEventListener('click', () => {
  if (selectedTeams.length > 0) {
    scrollToDemo();
  } else {
    launchTryDemo();
  }
});

// Take the user to the waitlist signup. The form lives on the final card screen,
// so if there's no circle yet (e.g. from the landing page) we spin up a quick
// Surprise Circle first, then scroll to + focus the email field. Shared by the
// header CTA and the landing-page "Join the Waitlist" button.
function goToWaitlist() {
  const jumpToWaitlist = () => {
    smoothScrollTo('share-email-area', 700);
    const email = document.getElementById('fan-email');
    if (email) setTimeout(() => email.focus({ preventScroll: true }), 700);
  };
  const form = document.getElementById('share-email-area');
  if (form && form.offsetParent !== null) {
    jumpToWaitlist();
  } else {
    generateRandomCard();
    setTimeout(jumpToWaitlist, 700);
  }
}

btnHeaderWaitlist.addEventListener('click', goToWaitlist);
document.getElementById('btn-landing-waitlist')?.addEventListener('click', goToWaitlist);

// Mobile header dropdown: the two CTAs collapse behind a hamburger on phones.
const headerMenu = document.getElementById('header-menu');
const headerMenuToggle = document.getElementById('header-menu-toggle');
if (headerMenu && headerMenuToggle) {
  const setMenu = (open) => {
    headerMenu.classList.toggle('open', open);
    headerMenuToggle.setAttribute('aria-expanded', String(open));
  };
  headerMenuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenu(!headerMenu.classList.contains('open'));
  });
  // Close after tapping an action, or when tapping anywhere outside the menu.
  headerMenu.addEventListener('click', () => setMenu(false));
  document.addEventListener('click', (e) => {
    if (!headerMenu.contains(e.target) && e.target !== headerMenuToggle) setMenu(false);
  });
}

// --- HELPER: ANIMATE NUMERIC TICKERS ---
function animateNumberTicker(element, start, end) {
  if (start === end) {
    element.textContent = end;
    return;
  }
  
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = end;
    return;
  }

  const duration = 750; // ms
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = progress * (2 - progress); // Ease out quadratic
    const currentValue = Math.floor(start + (end - start) * ease);
    element.textContent = String(currentValue).padStart(2, '0');
    
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = end;
    }
  }
  requestAnimationFrame(update);
}

// --- RENDER DYNAMIC CARD LAYOUT ---
// --- INITIALIZE RAINBOW SVG ---
// --- HELPER: RESOLVE TEAM COLORS FROM DATABASE ---
function getTeamDatabaseColors(teamName) {
  if (!teamName) return null;
  const nameLower = teamName.toLowerCase();
  for (const league in sportsData) {
    const found = sportsData[league].teams.find(t => 
      t.name.toLowerCase().includes(nameLower) || 
      nameLower.includes(t.name.toLowerCase()) ||
      t.id.toLowerCase() === nameLower
    );
    if (found) {
      return { primary: found.primary, secondary: found.secondary };
    }
  }
  return null;
}

// --- HELPER: APPLY TEAM THEME GLOBALLY ---
// Single entry point for setting the page accent colors. Guarantees the accent
// is never black/near-black (teams like the Raiders, Nets, or LAFC would
// otherwise theme the whole dark UI black).
function applyTeamTheme(primaryHex, secondaryHex) {
  let accent = getContrastAdaptedColor(primaryHex, secondaryHex);
  if (getLuminance(accent) < 45) {
    accent = '#64748b'; // both team colors too dark - neutral slate fallback
  }
  document.documentElement.style.setProperty('--team-primary', accent);
  document.documentElement.style.setProperty('--team-secondary', secondaryHex || accent);
  // Determine whether button text should be dark or light for contrast
  const btnTextColor = getLuminance(accent) > 155 ? '#0a0a0a' : '#ffffff';
  document.documentElement.style.setProperty('--btn-text', btnTextColor);
  const glowBlob = document.querySelector('.glow-accent-blob');
  if (glowBlob) {
    glowBlob.style.backgroundColor = accent;
  }
  return accent;
}

// --- INITIALIZE RAINBOW SVG ---
function initializeRainbowSVG(svgEl) {
  if (!svgEl) return;
  if (svgEl.querySelector('.rainbow-track')) return; // already initialized
  
  svgEl.innerHTML = ''; // clear any placeholder

  const radii = RAINBOW_RADII;
  const cx = RAINBOW_CX;
  const cy = RAINBOW_CY;

  // Create tracks group
  const gTracks = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gTracks.setAttribute('class', 'rainbow-tracks-group');
  
  // Create fills group
  const gFills = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gFills.setAttribute('class', 'rainbow-fills-group');
  
  // Create logos group
  const gLogos = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gLogos.setAttribute('class', 'rainbow-logos-group');
  
  radii.forEach((r, idx) => {
    const C = 2 * Math.PI * r;
    const halfC = Math.PI * r;
    
    // Track Circle
    const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('cx', cx);
    track.setAttribute('cy', cy);
    track.setAttribute('r', r);
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke', 'rgba(255, 255, 255, 0.04)');
    track.setAttribute('stroke-width', '10');
    track.setAttribute('stroke-dasharray', `${halfC} ${C}`);
    track.setAttribute('transform', `rotate(180, ${cx}, ${cy})`);
    track.setAttribute('stroke-linecap', 'round');
    track.setAttribute('class', `rainbow-track rainbow-track-${idx}`);
    track.style.transition = 'opacity 0.8s ease, stroke 0.8s ease';
    track.style.opacity = '0'; // start hidden
    gTracks.appendChild(track);
    
    // Fill Circle
    const fill = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    fill.setAttribute('cx', cx);
    fill.setAttribute('cy', cy);
    fill.setAttribute('r', r);
    fill.setAttribute('fill', 'none');
    fill.setAttribute('stroke', 'transparent');
    fill.setAttribute('stroke-width', '10');
    fill.setAttribute('stroke-dasharray', `0 ${C}`);
    fill.setAttribute('transform', `rotate(180, ${cx}, ${cy})`);
    fill.setAttribute('stroke-linecap', 'round');
    fill.setAttribute('class', `rainbow-fill rainbow-fill-${idx}`);
    fill.style.transition = 'stroke-dasharray 1.2s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.8s ease, opacity 0.8s ease';
    fill.style.opacity = '0'; // start hidden
    gFills.appendChild(fill);
    
    // Logo BG circle (White badge background)
    const logoBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    logoBg.setAttribute('cx', cx - r);
    logoBg.setAttribute('cy', cy);
    logoBg.setAttribute('r', '13'); // larger to be highly visible
    logoBg.setAttribute('fill', '#ffffff');
    logoBg.setAttribute('stroke', 'rgba(255, 255, 255, 0.1)');
    logoBg.setAttribute('stroke-width', '2');
    logoBg.setAttribute('class', `rainbow-logo-bg rainbow-logo-bg-${idx}`);
    logoBg.style.transition = 'cx 1.2s cubic-bezier(0.16, 1, 0.3, 1), cy 1.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease, stroke 0.8s ease';
    logoBg.style.opacity = '0';
    logoBg.style.filter = 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))';
    gLogos.appendChild(logoBg);
    
    // Logo image
    const logoImg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    logoImg.setAttribute('x', (cx - r) - 9);
    logoImg.setAttribute('y', cy - 9);
    logoImg.setAttribute('width', '18'); // larger to be highly visible
    logoImg.setAttribute('height', '18');
    logoImg.setAttribute('class', `rainbow-logo-img rainbow-logo-img-${idx}`);
    logoImg.style.transition = 'x 1.2s cubic-bezier(0.16, 1, 0.3, 1), y 1.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease';
    logoImg.style.opacity = '0';
    gLogos.appendChild(logoImg);
  });
  
  svgEl.appendChild(gTracks);
  svgEl.appendChild(gFills);
  svgEl.appendChild(gLogos);
}

// --- UPDATE RAINBOW SVG ---
function updateRainbowSVG(svgEl, sortedTeams) {
  if (!svgEl) return;
  initializeRainbowSVG(svgEl);

  const radii = RAINBOW_RADII;
  const cx = RAINBOW_CX;
  const cy = RAINBOW_CY;

  radii.forEach((r, idx) => {
    const track = svgEl.querySelector(`.rainbow-track-${idx}`);
    const fill = svgEl.querySelector(`.rainbow-fill-${idx}`);
    const logoBg = svgEl.querySelector(`.rainbow-logo-bg-${idx}`);
    const logoImg = svgEl.querySelector(`.rainbow-logo-img-${idx}`);
    
    if (!track || !fill || !logoBg || !logoImg) return;
    
    const team = sortedTeams[idx];
    const C = 2 * Math.PI * r;
    
    if (team) {
      // Resolve proper team primary and secondary color from databases if not set
      let teamColor = team.primaryColor;
      let teamSecondary = team.secondaryColor;
      if (!teamColor) {
        const dbColors = getTeamDatabaseColors(team.name);
        if (dbColors) {
          teamColor = dbColors.primary;
          teamSecondary = dbColors.secondary;
        }
      }
      teamColor = teamColor || 'var(--team-primary)';
      teamSecondary = teamSecondary || 'var(--team-secondary)';
      
      const adaptedColor = getContrastAdaptedColor(teamColor, teamSecondary);
      
      // Set track visible
      track.style.opacity = '1';
      
      // Set fill visible and team-specific color
      fill.style.opacity = '1';
      fill.setAttribute('stroke', adaptedColor);
      
      // Calculate filled length
      const L = (team.score / 100) * (Math.PI * r);
      if (team.score === 0) {
        fill.setAttribute('stroke-dasharray', `0 ${C}`);
        fill.style.opacity = '0';
        logoBg.style.opacity = '0';
        logoImg.style.opacity = '0';
      } else {
        fill.setAttribute('stroke-dasharray', `${L} ${C - L}`);

        // Calculate position at end of rainbow arc
        const angle = Math.PI * (1 - team.score / 100);
        const x = cx + r * Math.cos(angle);
        const y = cy - r * Math.sin(angle);

        logoBg.style.opacity = '1';
        logoImg.style.opacity = '1';
        logoBg.setAttribute('stroke', adaptedColor);
        logoBg.setAttribute('cx', x);
        logoBg.setAttribute('cy', y);
        logoImg.setAttribute('x', x - 9);
        logoImg.setAttribute('y', y - 9);
        logoImg.setAttribute('href', team.logo);
      }
    } else {
      // Hide track, fill, and logo
      track.style.opacity = '0';
      fill.style.opacity = '0';
      fill.setAttribute('stroke-dasharray', `0 ${C}`);
      logoBg.style.opacity = '0';
      logoImg.style.opacity = '0';
      
      // Reset position to default start
      logoBg.setAttribute('cx', cx - r);
      logoBg.setAttribute('cy', cy);
      logoImg.setAttribute('x', (cx - r) - 9);
      logoImg.setAttribute('y', cy - 9);
    }
  });
}

// --- UPDATE DYNAMIC LEGEND CHIPS ---
function updateLegendChips(legendContainer, sortedTeams) {
  if (!legendContainer) return;
  legendContainer.innerHTML = '';
  
  // Switch to 2×2 grid layout when there are 4 teams
  if (sortedTeams.length >= 4) {
    legendContainer.classList.add('legend-grid-4');
  } else {
    legendContainer.classList.remove('legend-grid-4');
  }
  
  sortedTeams.forEach(team => {
    // Resolve colors
    let teamColor = team.primaryColor;
    let teamSecondary = team.secondaryColor;
    if (!teamColor) {
      const dbColors = getTeamDatabaseColors(team.name);
      if (dbColors) {
        teamColor = dbColors.primary;
        teamSecondary = dbColors.secondary;
      }
    }
    teamColor = teamColor || 'var(--team-primary)';
    teamSecondary = teamSecondary || 'var(--team-secondary)';
    
    const adaptedColor = getContrastAdaptedColor(teamColor, teamSecondary);
    
    const chip = document.createElement('div');
    chip.className = 'legend-chip';
    chip.style.borderLeft = `3px solid ${adaptedColor}`;
    
    chip.innerHTML = `
      <img class="legend-chip-logo" src="${team.logo}" alt="${team.name}" crossorigin="anonymous">
      <span class="legend-chip-name">${team.short}</span>
      <span class="legend-chip-score">${team.score}</span>
    `;
    legendContainer.appendChild(chip);
  });
}

// Top-team percentile, shared by the card's top-right line and the share
// caption so they always agree. Percentile is literally 100 minus the top
// team's devotion score (a 95-score fan = "top 5%"). Nickname is the last
// word of the team name (Toronto Raptors → Raptors), stripping a trailing
// club suffix so soccer sides don't read "FC"/"SC" (Toronto FC → Toronto,
// Orlando City SC → City).
function topRankFor(team) {
  if (!team) return null;
  const pct = Math.max(1, Math.round(100 - (team.score || 0)));
  const words = (team.name || '').trim().split(/\s+/).filter(Boolean);
  const suffixes = new Set(['FC', 'SC', 'CF', 'AFC']);
  while (words.length > 1 && suffixes.has(words[words.length - 1].toUpperCase())) words.pop();
  const nickname = words.pop() || team.short || 'Team';
  return { pct, nickname };
}

// --- RENDER DYNAMIC CARD LAYOUT ---
function updateCardDOM(cardEl, profile, transition = false) {
  const archetypeEl = cardEl.querySelector('.fcard-archetype');
  const scoreEl = cardEl.querySelector('.fcard-score-value');
  const nameEl = cardEl.querySelector('#' + cardEl.id.charAt(0) + '-card-name');
  const sinceEl = cardEl.querySelector('#' + cardEl.id.charAt(0) + '-card-since');
  const predictionEl = cardEl.querySelector('#' + cardEl.id.charAt(0) + '-card-prediction');
  
  const sinceLabelEl = cardEl.querySelector('#' + cardEl.id.charAt(0) + '-card-since-label');
  const predictionLabelEl = cardEl.querySelector('#' + cardEl.id.charAt(0) + '-card-prediction-label');
  
  const svgEl = cardEl.querySelector('.rainbow-svg');
  const legendContainer = cardEl.querySelector('.fcard-legend-container');
  const topRankEl = cardEl.querySelector('.fcard-toprank');

  // Sort teams: Highest score first (outermost/top bar)
  const sortedTeams = [...profile.teams].sort((a, b) => {
    return b.score - a.score;
  });
  
  // Set card border glow instantly to prevent layout jump (contrast-safe)
  cardEl.style.borderColor = getContrastAdaptedColor(profile.primaryColor, profile.secondaryColor);

  const applyUpdates = () => {
    if (archetypeEl) archetypeEl.textContent = profile.tagline.toUpperCase();
    if (nameEl) nameEl.textContent = profile.name;
    if (sinceEl) sinceEl.textContent = profile.since || '----';
    if (predictionEl) predictionEl.textContent = profile.prediction || '----';
    
    const topTeam = sortedTeams[0];
    if (topTeam) {
      if (sinceLabelEl) {
        sinceLabelEl.textContent = `${topTeam.short} SINCE`;
      }
      if (predictionLabelEl) {
        predictionLabelEl.textContent = getPredictionLabel(topTeam.league, topTeam.short);
      }
      // Top-team percentile line, top-right of the card (see topRankFor).
      if (topRankEl) {
        const rank = topRankFor(topTeam);
        topRankEl.textContent = rank ? `TOP ${rank.pct}% ${rank.nickname.toUpperCase()} FANS` : '';
      }
    } else {
      if (sinceLabelEl) sinceLabelEl.textContent = "FAN SINCE";
      if (predictionLabelEl) predictionLabelEl.textContent = "PREDICTION";
      if (topRankEl) topRankEl.textContent = '';
    }

    const verifiedBadge = cardEl.querySelector('#' + cardEl.id.charAt(0) + '-card-verified-badge');
    if (verifiedBadge) {
      if (profile.status === 'VERIFIED') {
        verifiedBadge.style.display = 'inline-block';
      } else {
        verifiedBadge.style.display = 'none';
      }
    }
    
    if (scoreEl) {
      const startScore = parseInt(scoreEl.textContent) || 0;
      animateNumberTicker(scoreEl, startScore, profile.overallScore);
    }
    
    // Update SVG concentric arcs
    updateRainbowSVG(svgEl, sortedTeams);
    
    // Update dynamic chips legend
    updateLegendChips(legendContainer, sortedTeams);

    // Update theme colors (contrast-safe)
    applyTeamTheme(profile.primaryColor, profile.secondaryColor);
  };

  if (transition) {
    const fadeEls = [archetypeEl, nameEl, sinceEl, predictionEl, scoreEl, legendContainer, sinceLabelEl, predictionLabelEl].filter(Boolean);
    
    // Trigger fade out
    fadeEls.forEach(el => el.classList.add('fading'));
    
    // Wait for transition, then update and fade in
    setTimeout(() => {
      applyUpdates();
      fadeEls.forEach(el => el.classList.remove('fading'));
    }, 400);
  } else {
    applyUpdates();
  }
}

// --- STEP 1: MORPHING LOOP ---
function startMorphingLoop() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const initialProfile = generateRandomMorphProfile();
    updateCardDOM(document.getElementById('welcome-card'), initialProfile, false);
    return;
  }
  
  // Setup initial view
  const initialProfile = generateRandomMorphProfile();
  updateCardDOM(document.getElementById('welcome-card'), initialProfile, false);
  
  morphIntervalId = setInterval(() => {
    const randomProfile = generateRandomMorphProfile();
    updateCardDOM(document.getElementById('welcome-card'), randomProfile, true);
  }, 4000);
}

function stopMorphingLoop() {
  if (morphIntervalId) {
    clearInterval(morphIntervalId);
    morphIntervalId = null;
  }
}

// --- STEP 2: TEAM BUILDER LOGIC ---
function checkBuilderInputsStatus() {
  const league = bSportSelect.value;
  const teamId = bTeamSelect.value;
  const sinceVal = bSinceInput ? parseInt(bSinceInput.value) : NaN;
  const sinceMin = bSinceInput && bSinceInput.min ? parseInt(bSinceInput.min) : 1900;
  const sinceValid = !isNaN(sinceVal) && sinceVal >= sinceMin && sinceVal <= 2026;

  if (league && teamId && sinceValid) {
    btnToQuiz.removeAttribute('disabled');
  } else {
    btnToQuiz.setAttribute('disabled', 'true');
  }
}

// --- iOS-STYLE YEAR PICKER CLASS ---
class YearPickerWidget {
  constructor({ triggerId, hiddenInputId, displayId, minYear, maxYear, defaultYear, onSelect }) {
    this.trigger = document.getElementById(triggerId);
    this.hiddenInput = document.getElementById(hiddenInputId);
    this.displayEl = document.getElementById(displayId);
    this.minYear = minYear;
    this.maxYear = maxYear;
    this.defaultYear = defaultYear || maxYear;
    this.onSelect = onSelect || (() => {});
    this.selectedYear = null;

    this._buildUI();
    this._bindEvents();
  }

  _buildUI() {
    // Backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'year-picker-backdrop';
    document.body.appendChild(this.backdrop);

    // Sheet
    this.sheet = document.createElement('div');
    this.sheet.className = 'year-picker-sheet';
    this.sheet.innerHTML = `
      <div class="year-picker-sheet-header">
        <span class="year-picker-sheet-title">Select Year</span>
        <button class="year-picker-sheet-done" type="button">Done</button>
      </div>
      <div class="year-picker-scroll-body">
        <div class="year-picker-selection-band"></div>
        <div class="year-picker-scroll-list"></div>
      </div>
    `;
    document.body.appendChild(this.sheet);

    this.scrollList = this.sheet.querySelector('.year-picker-scroll-list');
    this.doneBtn = this.sheet.querySelector('.year-picker-sheet-done');
    this.selectionBand = this.sheet.querySelector('.year-picker-selection-band');

    // Build year items — newest first so scrolling down goes to older years
    for (let y = this.maxYear; y >= this.minYear; y--) {
      const item = document.createElement('div');
      item.className = 'year-picker-item';
      item.textContent = y;
      item.dataset.year = y;
      this.scrollList.appendChild(item);
    }
  }

  _bindEvents() {
    if (this.trigger) {
      this.trigger.addEventListener('click', () => this.open());
    }
    this.backdrop.addEventListener('click', () => this.close(false));
    this.doneBtn.addEventListener('click', () => this.close(true));
    // Escape always dismisses, so the sheet can never get stuck open.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.sheet.classList.contains('visible')) this.close(false);
    });

    // Highlight item nearest center while scrolling
    this.scrollList.addEventListener('scroll', () => this._updateHighlight(), { passive: true });

    // Click on item scrolls it to center
    this.scrollList.addEventListener('click', (e) => {
      const item = e.target.closest('.year-picker-item');
      if (!item) return;
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  _getCenterItem() {
    const listRect = this.scrollList.getBoundingClientRect();
    const centerY = listRect.top + listRect.height / 2;
    let closest = null;
    let closestDist = Infinity;
    this.scrollList.querySelectorAll('.year-picker-item').forEach(item => {
      const rect = item.getBoundingClientRect();
      const itemCenter = rect.top + rect.height / 2;
      const dist = Math.abs(itemCenter - centerY);
      if (dist < closestDist) {
        closestDist = dist;
        closest = item;
      }
    });
    return closest;
  }

  _updateHighlight() {
    const center = this._getCenterItem();
    this.scrollList.querySelectorAll('.year-picker-item').forEach(item => {
      item.classList.toggle('selected', item === center);
    });
  }

  setMinYear(minYear) {
    this.minYear = minYear;
    // Re-populate items
    this.scrollList.innerHTML = '';
    for (let y = this.maxYear; y >= this.minYear; y--) {
      const item = document.createElement('div');
      item.className = 'year-picker-item';
      item.textContent = y;
      item.dataset.year = y;
      this.scrollList.appendChild(item);
    }
    // If selected year is now out of range, clear it
    if (this.selectedYear && this.selectedYear < this.minYear) {
      this.selectedYear = null;
      this.hiddenInput.value = '';
      if (this.displayEl) {
        this.displayEl.textContent = 'Select Year';
        this.trigger && this.trigger.classList.remove('has-value');
      }
    }
  }

  open() {
    this.backdrop.classList.add('visible');
    this.sheet.classList.add('visible');
    this.trigger && this.trigger.classList.add('open');
    // Lock the page behind the sheet. Without this the background can scroll
    // under the fixed sheet on mobile, which is how it ends up "stuck" at the
    // bottom of the screen with no way to line up the Done button.
    document.body.style.overflow = 'hidden';

    // Scroll to currently selected year or default
    const targetYear = this.selectedYear || this.defaultYear;
    requestAnimationFrame(() => {
      const targetItem = this.scrollList.querySelector(`[data-year="${targetYear}"]`);
      if (targetItem) {
        targetItem.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
      this._updateHighlight();
    });
  }

  close(commit) {
    if (commit) {
      const center = this._getCenterItem();
      if (center) {
        const year = parseInt(center.dataset.year);
        this.selectedYear = year;
        this.hiddenInput.value = year;
        if (this.displayEl) {
          this.displayEl.textContent = year;
        }
        if (this.trigger) {
          this.trigger.classList.add('has-value');
        }
        this.onSelect(year);
      }
    }
    this.backdrop.classList.remove('visible');
    this.sheet.classList.remove('visible');
    this.trigger && this.trigger.classList.remove('open');
    document.body.style.overflow = '';
  }
}

let sincePickerWidget = null;

function initYearPickers() {
  sincePickerWidget = new YearPickerWidget({
    triggerId: 'b-since-trigger',
    hiddenInputId: 'b-since-input',
    displayId: 'b-since-display',
    minYear: 1900,
    maxYear: 2026,
    defaultYear: 2010,
    onSelect: () => checkBuilderInputsStatus()
  });
}

bSportSelect.addEventListener('change', (e) => {
  const selectedLeague = e.target.value;
  const leagueData = sportsData[selectedLeague];
  
  bTeamSelect.innerHTML = '<option value="" disabled selected>Select Team</option>';
  
  if (leagueData) {
    leagueData.teams.forEach(team => {
      const option = document.createElement('option');
      option.value = team.id;
      option.textContent = team.name;
      bTeamSelect.appendChild(option);
    });
    bTeamSelect.removeAttribute('disabled');
  } else {
    bTeamSelect.setAttribute('disabled', 'true');
  }
  checkBuilderInputsStatus();
});

// Selector adapts preview spotlight instantly
bTeamSelect.addEventListener('change', (e) => {
  const league = bSportSelect.value;
  const teamId = e.target.value;
  updateSpotlight(teamId, league);
  
  // Update the min year for "fan since" picker based on team founding year
  if (league && teamId) {
    const team = sportsData[league]?.teams.find(t => t.id === teamId);
    if (team && team.founded && sincePickerWidget) {
      sincePickerWidget.setMinYear(team.founded);
    } else if (sincePickerWidget) {
      sincePickerWidget.setMinYear(1900);
    }
  }
  
  checkBuilderInputsStatus();
});

// b-since-input is now hidden (driven by year picker), no direct listener needed

function updateSpotlight(teamId, league) {
  const previewContainer = document.getElementById('builder-logo-preview');
  const previewLogoImg = document.getElementById('builder-preview-logo-img');
  const previewTeamName = document.getElementById('builder-preview-team-name');
  
  if (!league || !teamId) {
    if (previewContainer) previewContainer.style.display = 'none';
    return;
  }
  
  const team = sportsData[league]?.teams.find(t => t.id === teamId);
  if (team) {
    if (previewLogoImg) {
      previewLogoImg.src = team.logo;
    }
    if (previewTeamName) {
      previewTeamName.textContent = team.name;
    }
    // Shift accents dynamically (contrast-safe)
    const accent = applyTeamTheme(team.primary, team.secondary);
    if (previewContainer) {
      previewContainer.style.display = 'flex';
      previewContainer.style.borderColor = accent;
    }
  } else {
    if (previewContainer) previewContainer.style.display = 'none';
  }
}

btnToQuiz.addEventListener('click', () => {
  const league = bSportSelect.value;
  const teamId = bTeamSelect.value;
  const sinceVal = bSinceInput ? bSinceInput.value : '';
  
  if (!league || !teamId || !sinceVal) {
    alert("Please select league, team, and enter the year you became a fan.");
    return;
  }
  
  const alreadyAdded = selectedTeams.some(t => t.id === teamId);
  if (alreadyAdded) {
    alert("This team is already in your profile list!");
    return;
  }
  
  const team = sportsData[league]?.teams.find(t => t.id === teamId);
  if (!team) return;
  
  const newTeam = {
    id: team.id,
    name: team.name,
    short: team.short,
    logo: team.logo,
    city: team.city,
    status: team.status,
    primaryColor: team.primary,
    secondaryColor: team.secondary,
    isTop: selectedTeams.length === 0, // Auto-mark first team as Top
    league: league.toUpperCase(),
    score: 0,
    fanSince: sinceVal,
    prediction: "",
    quizQuestions: getRandomQuizQuestions(2) // Q2 & Q3: two random devotion questions
  };
  
  selectedTeams.push(newTeam);
  currentQuizTeamIndex = selectedTeams.length - 1;
  HubSDK.track('team_added', { teamId: newTeam.id, league: newTeam.league });
  
  // Reset fields
  bSportSelect.value = "";
  bTeamSelect.innerHTML = '<option value="" disabled selected>Select Team</option>';
  bTeamSelect.setAttribute('disabled', 'true');
  // Reset the since picker
  if (sincePickerWidget) {
    sincePickerWidget.selectedYear = null;
    sincePickerWidget.hiddenInput.value = '';
    const displayEl = document.getElementById('b-since-display');
    if (displayEl) displayEl.textContent = 'Select Year';
    const trigger = document.getElementById('b-since-trigger');
    if (trigger) trigger.classList.remove('has-value');
  }
  updateSpotlight(null, null);
  checkBuilderInputsStatus();
  
  goToStep(3);
  renderQuizForCurrentTeam();
});

// --- STEP 3: QUIZ RENDER & METRICS ---
function renderQuizForCurrentTeam() {
  const team = selectedTeams[currentQuizTeamIndex];
  if (!team) return;
  
  // Dynamic header styles
  quizProgressText.textContent = `TEAM QUIZ`;
  quizTeamName.textContent = team.name;
  
  // Set primary team theme color for quiz elements (contrast-safe)
  applyTeamTheme(team.primaryColor, team.secondaryColor);
  
  // Update progress bar
  quizProgressBarFill.style.width = `100%`;
  
  // Render questions
  quizQuestionsList.innerHTML = '';
  quizQuestionsList.scrollTop = 0;
  btnQuizNext.setAttribute('disabled', 'true');
  btnQuizNext.textContent = 'Complete Team Profile';
  
  // ── Q1: Games-Watched Slider ──
  const sliderBuckets = getSliderBuckets(team.league);
  const sliderKey = `${team.id}_slider`;
  const currentSliderIdx = userQuizAnswers[sliderKey + '_idx'] ?? 0;

  const sliderItem = document.createElement('div');
  sliderItem.className = 'quiz-question-item quiz-slider-item';

  const sliderLabel = document.createElement('span');
  sliderLabel.className = 'quiz-question-text';
  sliderLabel.textContent = `How many ${team.league} games did you watch last season?`;
  sliderItem.appendChild(sliderLabel);

  const sliderDisplay = document.createElement('div');
  sliderDisplay.className = 'quiz-slider-display';

  const sliderVal = document.createElement('span');
  sliderVal.className = 'quiz-slider-value';
  sliderVal.textContent = sliderBuckets[currentSliderIdx];
  sliderDisplay.appendChild(sliderVal);
  sliderItem.appendChild(sliderDisplay);

  const sliderEl = document.createElement('input');
  sliderEl.type = 'range';
  sliderEl.className = 'quiz-slider';
  sliderEl.min = '0';
  sliderEl.max = String(sliderBuckets.length - 1);
  sliderEl.step = '1';
  sliderEl.value = String(currentSliderIdx);
  sliderEl.setAttribute('id', `slider-${team.id}`);

  sliderEl.addEventListener('input', () => {
    const idx = parseInt(sliderEl.value);
    sliderVal.textContent = sliderBuckets[idx];
    const pts = Math.round((idx / (sliderBuckets.length - 1)) * 25);
    userQuizAnswers[sliderKey] = pts;
    userQuizAnswers[sliderKey + '_idx'] = idx;
    checkQuizAnswersStatus();
  });

  // If already answered, restore
  if (typeof userQuizAnswers[sliderKey] === 'number') {
    sliderVal.textContent = sliderBuckets[currentSliderIdx];
  }
  // Pre-populate score so it counts as answered even at 0
  if (typeof userQuizAnswers[sliderKey] !== 'number') {
    userQuizAnswers[sliderKey] = 0;
    userQuizAnswers[sliderKey + '_idx'] = 0;
  }

  sliderItem.appendChild(sliderEl);
  quizQuestionsList.appendChild(sliderItem);

  // ── Q2 & Q3: Random devotion questions ──
  team.quizQuestions.forEach(q => {
    const qItem = document.createElement('div');
    qItem.className = 'quiz-question-item';
    
    const qText = document.createElement('span');
    qText.className = 'quiz-question-text';
    qText.textContent = q.text;
    qItem.appendChild(qText);
    
    const optionsGrid = document.createElement('div');
    optionsGrid.className = 'quiz-options-grid';
    
    q.options.forEach(opt => {
      const optBtn = document.createElement('button');
      optBtn.type = 'button';
      optBtn.className = 'quiz-option-btn';
      optBtn.textContent = opt.text;
      
      const answerKey = `${team.id}_${q.key}`;
      if (userQuizAnswers[answerKey] === opt.score) {
        optBtn.classList.add('selected');
      }
      
      optBtn.addEventListener('click', () => {
        optionsGrid.querySelectorAll('.quiz-option-btn').forEach(btn => btn.classList.remove('selected'));
        optBtn.classList.add('selected');
        userQuizAnswers[answerKey] = opt.score;
        checkQuizAnswersStatus();
      });
      
      optionsGrid.appendChild(optBtn);
    });
    
    qItem.appendChild(optionsGrid);
    quizQuestionsList.appendChild(qItem);
  });

  // ── Q4: Team-Specific Trivia ──
  const trivia = getTeamTrivia(team.id);
  const triviaKey = `${team.id}_trivia`;

  const triviaItem = document.createElement('div');
  triviaItem.className = 'quiz-question-item quiz-trivia-item';

  const triviaBadge = document.createElement('span');
  triviaBadge.className = 'quiz-trivia-badge';
  triviaBadge.textContent = '🏆 Fan Trivia';
  triviaItem.appendChild(triviaBadge);

  const triviaText = document.createElement('span');
  triviaText.className = 'quiz-question-text';
  triviaText.textContent = trivia.q;
  triviaItem.appendChild(triviaText);

  const triviaGrid = document.createElement('div');
  triviaGrid.className = 'quiz-options-grid quiz-trivia-grid';

  // Shuffle opts presentation order, but keep track of correct
  const triviaOpts = [...trivia.opts].sort(() => 0.5 - Math.random());
  triviaOpts.forEach(opt => {
    const optBtn = document.createElement('button');
    optBtn.type = 'button';
    optBtn.className = 'quiz-option-btn';
    optBtn.textContent = opt.t;

    const score = opt.c ? 25 : 5;
    if (userQuizAnswers[triviaKey] === score && opt.c === (score === 25)) {
      optBtn.classList.add('selected');
    }

    optBtn.addEventListener('click', () => {
      triviaGrid.querySelectorAll('.quiz-option-btn').forEach(btn => btn.classList.remove('selected'));
      optBtn.classList.add('selected');
      userQuizAnswers[triviaKey] = score;
      checkQuizAnswersStatus();
    });

    triviaGrid.appendChild(optBtn);
  });

  triviaItem.appendChild(triviaGrid);
  quizQuestionsList.appendChild(triviaItem);

  // Render Championship Prediction
  const predItem = document.createElement('div');
  predItem.className = 'quiz-question-item';
  
  const predText = document.createElement('span');
  predText.className = 'quiz-question-text';
  predText.textContent = 'When do you predict they will win their next championship/title?';
  predItem.appendChild(predText);
  
  const predInput = document.createElement('input');
  predInput.type = 'hidden';
  predInput.id = 'quiz-prediction-input';
  predInput.min = '2026';
  predInput.max = '2050';
  predInput.required = true;

  if (team.prediction) {
    predInput.value = team.prediction;
  }

  // Build year picker trigger for prediction
  const predPickerWrapper = document.createElement('div');
  predPickerWrapper.className = 'year-picker-wrapper';
  const predTrigger = document.createElement('button');
  predTrigger.type = 'button';
  predTrigger.className = 'year-picker-trigger' + (team.prediction ? ' has-value' : '');
  predTrigger.id = `pred-trigger-${team.id}`;
  const predDisplay = document.createElement('span');
  predDisplay.className = 'year-picker-value';
  predDisplay.textContent = team.prediction || 'Select Year';
  const predChevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  predChevron.setAttribute('class', 'year-picker-chevron');
  predChevron.setAttribute('viewBox', '0 0 24 24');
  predChevron.setAttribute('fill', 'none');
  predChevron.setAttribute('stroke', 'currentColor');
  predChevron.setAttribute('stroke-width', '2');
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', '6 9 12 15 18 9');
  predChevron.appendChild(polyline);
  predTrigger.appendChild(predDisplay);
  predTrigger.appendChild(predChevron);
  predPickerWrapper.appendChild(predTrigger);
  predPickerWrapper.appendChild(predInput); // hidden input stays
  predItem.appendChild(predPickerWrapper);
  quizQuestionsList.appendChild(predItem);

  // Create picker widget for this prediction input
  new YearPickerWidget({
    triggerId: `pred-trigger-${team.id}`,
    hiddenInputId: 'quiz-prediction-input',
    displayId: null,
    minYear: 2026,
    maxYear: 2050,
    defaultYear: 2028,
    onSelect: (year) => {
      predDisplay.textContent = year;
      predTrigger.classList.add('has-value');
      checkQuizAnswersStatus();
    }
  });

  if (team.prediction) {
    predInput.value = team.prediction;
    checkQuizAnswersStatus();
  }
}

function checkQuizAnswersStatus() {
  const team = selectedTeams[currentQuizTeamIndex];
  if (!team) return;

  // Q1: slider is always pre-populated, so always answered
  const sliderAnswered = typeof userQuizAnswers[`${team.id}_slider`] === 'number';

  // Q2 & Q3: random devotion questions
  const devotionAnswered = team.quizQuestions.every(q => {
    const answerKey = `${team.id}_${q.key}`;
    return typeof userQuizAnswers[answerKey] === 'number';
  });

  // Q4: trivia
  const triviaAnswered = typeof userQuizAnswers[`${team.id}_trivia`] === 'number';

  const predInput = document.getElementById('quiz-prediction-input');
  const predVal = predInput ? parseInt(predInput.value) : NaN;
  const predValid = !isNaN(predVal) && predVal >= 2026 && predVal <= 2050;

  if (sliderAnswered && devotionAnswered && triviaAnswered && predValid) {
    btnQuizNext.removeAttribute('disabled');
  } else {
    btnQuizNext.setAttribute('disabled', 'true');
  }
}

btnQuizNext.addEventListener('click', () => {
  const team = selectedTeams[currentQuizTeamIndex];
  if (!team) return;
  
  // Calculate total score out of 100 for current team
  let totalScore = 0;

  // Q1: slider (0–25)
  totalScore += userQuizAnswers[`${team.id}_slider`] || 0;

  // Q2 & Q3: devotion questions
  team.quizQuestions.forEach(q => {
    const answerKey = `${team.id}_${q.key}`;
    totalScore += userQuizAnswers[answerKey] || 0;
  });

  // Q4: trivia (25 correct, 5 wrong)
  totalScore += userQuizAnswers[`${team.id}_trivia`] || 0;

  team.score = Math.min(totalScore, 100);
  
  const predInput = document.getElementById('quiz-prediction-input');
  if (predInput) {
    team.prediction = predInput.value;
  }

  HubSDK.track('quiz_completed', { teamId: team.id, score: team.score });
  recalculateTopTeam();
  goToStep(4); // Go to Step 4 Fandom Hub
});

// --- STEP 3.5: FANDOM HUB LOGIC ---
function renderHubUI() {
  if (!hubAddedTeamsList) return;
  hubAddedTeamsList.innerHTML = '';
  
  if (selectedTeams.length === 0) {
    hubAddedTeamsList.innerHTML = '<div class="no-teams-placeholder">No teams in your profile yet. Add a team to start.</div>';
    btnHubFinish.setAttribute('disabled', 'true');
    return;
  }
  
  btnHubFinish.removeAttribute('disabled');
  
  selectedTeams.forEach(team => {
    const card = document.createElement('div');
    card.className = `hub-team-card ${team.isTop ? 'top-team-active' : ''}`;
    
    // Resolve colors
    let teamColor = team.primaryColor;
    let teamSecondary = team.secondaryColor;
    const dbColors = getTeamDatabaseColors(team.name);
    if (dbColors) {
      teamColor = dbColors.primary;
      teamSecondary = dbColors.secondary;
    }
    teamColor = teamColor || 'var(--team-primary)';
    teamSecondary = teamSecondary || 'var(--team-secondary)';
    const adaptedColor = getContrastAdaptedColor(teamColor, teamSecondary);
    
    card.style.borderLeft = `4px solid ${adaptedColor}`;
    
    card.innerHTML = `
      <div class="hub-team-left">
        <img class="hub-team-logo" src="${team.logo}" alt="${team.name}" crossorigin="anonymous">
        <div class="hub-team-info">
          <span class="hub-team-name">${team.name}</span>
          <div class="hub-team-meta-row">
            <span>League: <strong>${team.league}</strong></span>
            <span>Fan Since: <strong>${team.fanSince}</strong></span>
            <span>Prediction: <strong>${team.prediction}</strong></span>
          </div>
        </div>
      </div>
      <div class="hub-team-actions">
        <span class="hub-team-score-badge" style="color: ${adaptedColor}">Score: ${team.score}</span>
        ${team.isTop ? `<span class="hub-top-badge" style="background-color: ${adaptedColor}; color: ${getLuminance(adaptedColor) > 155 ? '#0a0a0a' : '#ffffff'}; padding: 3px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 700; text-transform: uppercase;">Top Team</span>` : ''}
        <span class="builder-remove-btn" onclick="window.removeHubTeam('${team.id}')" title="Remove Team">&times;</span>
      </div>
    `;
    hubAddedTeamsList.appendChild(card);
  });
  
  // Set theme to matching top team (contrast-safe)
  const topTeam = selectedTeams.find(t => t.isTop);
  if (topTeam) {
    applyTeamTheme(topTeam.primaryColor, topTeam.secondaryColor);
  }
}

window.removeHubTeam = (teamId) => {
  selectedTeams = selectedTeams.filter(t => t.id !== teamId);
  recalculateTopTeam();
  renderHubUI();
};

if (btnHubAddTeam) {
  btnHubAddTeam.addEventListener('click', () => {
    if (selectedTeams.length >= 4) {
      alert("You've reached the maximum limit of 4 teams. Remove a team to add another.");
      return;
    }
    goToStep(2);
  });
}

if (btnHubFinish) {
  btnHubFinish.addEventListener('click', () => {
    if (selectedTeams.length === 0) return;
    showFanIdStep(); // then the reveal
  });
}

// --- FAN ID (USERNAME) STEP ---
// Asked once per card, after all teams are added. Usernames are unique
// (claim_handle in fans.js); a taken name keeps them here. If the check can't
// run (offline/Supabase down), let them through rather than block the card.
const fanIdForm = document.getElementById('fanid-form');
const fanIdInput = document.getElementById('fanid-input');
const fanIdError = document.getElementById('fanid-error');
const btnFanIdContinue = document.getElementById('btn-fanid-continue');
const fanIdContinueLabel = btnFanIdContinue.textContent;

function setFanIdError(message) {
  fanIdError.textContent = message;
  fanIdError.hidden = !message;
}

function showFanIdStep() {
  fanIdInput.value = savedHandle || getLastHandle();
  setFanIdError('');
  btnFanIdContinue.textContent = fanIdContinueLabel;
  btnFanIdContinue.disabled = !HANDLE_PATTERN.test(fanIdInput.value);
  goToStep(7);
  fanIdInput.focus({ preventScroll: true });
}

fanIdInput.addEventListener('input', () => {
  const cleaned = fanIdInput.value.replace(/[^A-Za-z0-9_]/g, '');
  if (cleaned !== fanIdInput.value) fanIdInput.value = cleaned;
  setFanIdError('');
  btnFanIdContinue.disabled = !HANDLE_PATTERN.test(cleaned);
});

fanIdForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const handle = fanIdInput.value;
  if (!HANDLE_PATTERN.test(handle) || btnFanIdContinue.disabled) return;
  btnFanIdContinue.disabled = true;
  btnFanIdContinue.textContent = 'Checking Fan ID…';
  const result = await claimHandle(handle);
  btnFanIdContinue.textContent = fanIdContinueLabel;
  if (result === 'taken' || result === 'invalid') {
    btnFanIdContinue.disabled = false;
    setFanIdError(result === 'taken'
      ? `@${handle} is already taken. Try another.`
      : 'Use 3–20 letters, numbers or _.');
    fanIdInput.focus({ preventScroll: true });
    return;
  }
  if (result === 'unavailable') HubSDK.track('handle_claim_unavailable');
  savedHandle = handle;
  goToStep(5); // Reveal
});

// --- STEP 4: REVEAL SEQUENCE ---
function runRevealSequence() {
  const topTeam = selectedTeams.find(t => t.isTop) || selectedTeams[0];
  applyTeamTheme(topTeam.primaryColor, topTeam.secondaryColor);

  revealProgressFill.style.width = '0%';
  revealTicker.textContent = '00';
  
  // Canonical FanLog Score (see computeFanScore in cardVisuals.js) — shared
  // with the share-image renderer so the card and its link preview agree.
  const finalScore = computeFanScore(selectedTeams);
  
  const startRevealTime = performance.now();
  const revealDuration = 1800; // ms
  
  // Smoothly trigger bar fill
  setTimeout(() => {
    revealProgressFill.style.width = '100%';
  }, 50);
  
  function tickerUpdate(currentTime) {
    const elapsed = currentTime - startRevealTime;
    const progress = Math.min(elapsed / revealDuration, 1);
    const ease = progress * (2 - progress);
    const tickerVal = Math.floor(finalScore * ease);
    
    revealTicker.textContent = String(tickerVal).padStart(2, '0');
    
    if (progress < 1) {
      requestAnimationFrame(tickerUpdate);
    } else {
      revealTicker.textContent = finalScore;
      setTimeout(() => {
        // Trigger visual payoff
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.75 },
          colors: [getContrastAdaptedColor(topTeam.primaryColor, topTeam.secondaryColor), topTeam.secondaryColor, '#ffffff']
        });
        
        // Go to main page containing the card
        setupStep5MainPage(finalScore);
      }, 400);
    }
  }
  
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealTicker.textContent = finalScore;
    revealProgressFill.style.width = '100%';
    setTimeout(() => {
      setupStep5MainPage(finalScore);
    }, 400);
  } else {
    requestAnimationFrame(tickerUpdate);
  }
}

// --- STEP 5: MAIN LANDING CARD INITIAL RENDER ---
// Mirror the current Fan ID into the "Your Loyalty Card Is Ready" heading area.
// Hidden while the handle is still the @GUEST default — which is also when the
// post-signup "Set your Fan ID" prompt shows.
function updateRevealFanId() {
  const el = document.getElementById('main-reveal-fanid');
  if (!el) return;
  const h = savedHandle ? (savedHandle.startsWith('@') ? savedHandle : `@${savedHandle}`) : '';
  el.textContent = h;
  el.style.display = h ? '' : 'none';
  const setFanIdBtn = document.getElementById('b-set-fan-id');
  if (setFanIdBtn) setFanIdBtn.style.display = h ? 'none' : '';
}

// Toggle the actions column between "your own card" mode (email capture,
// share, download) and "recipient" mode (landing-style "make your own" CTA).
function applySharedRecipientView(isShared, displayHandle) {
  const titleEl = document.querySelector('.main-reveal-title');
  const descEl = document.querySelector('.main-reveal-desc');
  const sharePrimary = document.getElementById('share-primary');
  const emailArea = document.getElementById('share-email-area');
  const actionsGrid = document.querySelector('.card-actions-grid');
  const socialRow = document.querySelector('.social-share-horizontal');
  const restartBox = document.querySelector('.restart-flow-box');
  const recipientCta = document.getElementById('shared-recipient-cta');
  const ownControls = [sharePrimary, emailArea, actionsGrid, socialRow, restartBox];

  if (isShared) {
    if (titleEl) titleEl.textContent = `${displayHandle}'s Loyalty Card`;
    if (descEl) descEl.textContent = `This is ${displayHandle}'s FanLog Score — the teams, loyalty, and moments that define their fandom. Build your own and see how you compare.`;
    ownControls.forEach(el => { if (el) el.style.display = 'none'; });
    if (recipientCta) recipientCta.style.display = '';
  } else {
    if (titleEl) titleEl.textContent = 'Your Loyalty Card Is Ready.';
    if (descEl) descEl.textContent = 'Your Fanlog Score reveals who you are as a fan, from your loyalty level to the teams that define you. Share your Loyalty Card and see how your fandom compares.';
    // Restore only the always-on controls; the email success/form and the
    // phone-hidden grids keep their own display logic elsewhere.
    if (sharePrimary) sharePrimary.style.display = '';
    if (emailArea) emailArea.style.display = '';
    if (actionsGrid) actionsGrid.style.display = '';
    if (socialRow) socialRow.style.display = '';
    if (restartBox) restartBox.style.display = '';
    if (recipientCta) recipientCta.style.display = 'none';
  }
}

// Reset all card state for building a fresh card (shared by the "create a new
// card" restart link and the recipient view's "make your own" buttons).
function resetForNewCard() {
  selectedTeams = [];
  userQuizAnswers = {};
  currentQuizTeamIndex = 0;
  savedHandle = '';
  cachedShareId = null; // stale — belonged to the card being replaced

  const shareEmailForm = document.getElementById('share-email-form');
  const shareEmailSuccess = document.getElementById('share-email-success');
  if (shareEmailForm) shareEmailForm.style.display = '';
  if (shareEmailSuccess) shareEmailSuccess.style.display = 'none';
  rearmWaitlistForm();

  if (sincePickerWidget) {
    sincePickerWidget.selectedYear = null;
    sincePickerWidget.hiddenInput.value = '';
    const displayEl = document.getElementById('b-since-display');
    if (displayEl) displayEl.textContent = 'Select Year';
    const trigger = document.getElementById('b-since-trigger');
    if (trigger) trigger.classList.remove('has-value');
  }
}

function setupStep5MainPage(finalScore, isSharedView = false) {
  const topTeam = selectedTeams.find(t => t.isTop) || selectedTeams[0];
  const tagline = generateSportsIdentityTagline();

  // Fan ID comes from the quiz's last question; @GUEST only if none was set.
  const displayHandle = savedHandle ? (savedHandle.startsWith('@') ? savedHandle : `@${savedHandle}`) : "@GUEST";

  // Recipient view: someone opened a shared link and is looking at another
  // fan's card, not one they built. Swap the "your card is ready / share it"
  // column for a landing-style "here's their card — make your own" invite,
  // and hide the email-capture + share/download controls that only make sense
  // for your own card. Reset back to the normal state otherwise so it doesn't
  // linger once a recipient starts building their own.
  applySharedRecipientView(isSharedView, displayHandle);
  viewingSharedCard = isSharedView;

  // Form profile object
  const userProfile = {
    name: displayHandle,
    tagline: tagline,
    overallScore: finalScore,
    since: topTeam.fanSince || "----",
    prediction: topTeam.prediction || "----",
    status: "UNVERIFIED",
    primaryColor: topTeam.primaryColor,
    secondaryColor: topTeam.secondaryColor,
    teams: selectedTeams
  };

  // Render card
  updateCardDOM(document.getElementById('final-card'), userProfile, true);

  // Setup editable Fan ID on the card
  setupEditableFanId();

  // Show the Fan ID in the "card is ready" heading area.
  updateRevealFanId();

  // Helper to load or refresh the demo iframe with current user state
  function updateDemoIframe() {
    const rawInput = savedHandle ? savedHandle.trim() : "";
    let finalName = rawInput || "Guest";
    let finalHandle = rawInput ? (rawInput.startsWith('@') ? rawInput : `@${rawInput}`) : "@GUEST";
    
    if (rawInput.startsWith('@')) {
      finalName = rawInput.slice(1);
      finalHandle = rawInput;
    } else if (rawInput) {
      finalName = rawInput;
      finalHandle = `@${rawInput.toLowerCase().replace(/\s+/g, '_')}`;
    }

    // The demo app (public/app, built from ../fanlog_ui) mirrors the full roster,
    // so we pass the real team ids straight through.
    const teamIds = selectedTeams.map(t => t.id).join(',');
    // Pass scores alongside team IDs so the React app can mirror the exact same arc values
    const scores = selectedTeams.map(t => t.score).join(',');
    const userName = encodeURIComponent(finalName);
    const userHandle = encodeURIComponent(finalHandle);
    
    const demoUrl = `./app/?name=${userName}&handle=${userHandle}&favorites=${teamIds}&scores=${scores}`;
    
    const demoIframe = document.getElementById('demo-mockup-iframe');
    if (demoIframe) {
      demoIframe.src = demoUrl;
    }
  }

  // Load the iframe initially
  updateDemoIframe();

  // Transition step
  goToStep(6);

  // Reaching the final card = a completed Loyalty Card. This is the key
  // conversion event: the numerator for visitor→circle and the denominator
  // for share rate. `referredBy` attributes it to a sharer when present.
  const topTeamForTrack = selectedTeams.find(t => t.isTop) || selectedTeams[0];
  HubSDK.track('circle_created', {
    teamCount: selectedTeams.length,
    topLeague: topTeamForTrack ? topTeamForTrack.league : null,
    score: finalScore,
    referredBy
  });

  // Pre-fetch the share link's short id so it's ready by the time the user
  // taps Share (see prepareShareUrl). Deferred to idle time so it doesn't
  // compete with the step transition / scroll-to-demo.
  const scheduleShare = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
  scheduleShare(() => prepareShareUrl());
}

// --- SETUP EDITABLE FAN ID ON CARD ---
// setupEditableFanId runs on every card render, so its listeners are bound once.
let fanIdEditorBound = false;
// True while showing someone else's shared card: their Fan ID isn't editable.
let viewingSharedCard = false;

function startFanIdEdit() {
  const fanIdEl = document.getElementById('f-card-name');
  if (!fanIdEl || viewingSharedCard || fanIdEl.getAttribute('contenteditable') === 'true') return;
  fanIdEl.setAttribute('contenteditable', 'true');
  fanIdEl.classList.add('fan-id-editing');
  const range = document.createRange();
  range.selectNodeContents(fanIdEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  fanIdEl.focus();
}

function setupEditableFanId() {
  const fanIdEl = document.getElementById('f-card-name');
  if (!fanIdEl || fanIdEditorBound) return;
  fanIdEditorBound = true;

  fanIdEl.style.cursor = 'pointer';
  fanIdEl.addEventListener('click', startFanIdEdit);

  fanIdEl.addEventListener('blur', async () => {
    fanIdEl.setAttribute('contenteditable', 'false');
    fanIdEl.classList.remove('fan-id-editing');
    const previous = savedHandle;
    const revert = (message) => {
      fanIdEl.textContent = previous ? `@${previous}` : '@GUEST';
      if (message) alert(message);
    };
    const handle = fanIdEl.textContent.replace(/[^A-Za-z0-9_]/g, '').slice(0, 20);
    if (!handle || handle === previous) return revert();
    if (!HANDLE_PATTERN.test(handle)) return revert('Fan IDs are 3–20 letters, numbers or _.');

    fanIdEl.textContent = `@${handle}`;
    const result = await claimHandle(handle);
    if (result === 'taken') return revert(`@${handle} is already taken. Try another.`);
    if (result === 'invalid') return revert('Fan IDs are 3–20 letters, numbers or _.');
    savedHandle = handle;
    updateRevealFanId();
    // The pre-saved share link carries the handle, so re-save it.
    prepareShareUrl();
  });

  fanIdEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fanIdEl.blur();
    }
  });
}

// Archetype engine lives in archetypes.js (shared with the share-link
// renderers). Defaults to the current card's teams.
function generateSportsIdentityTagline(teams = selectedTeams) {
  const archetype = getArchetype(teams);
  if (import.meta.env.DEV && teams.length && !KNOWN_ARCHETYPES.has(archetype)) {
    console.warn(`[archetypes] "${archetype}" is missing from GENERIC_ARCHETYPES — share previews will fall back to a generic label.`);
  }
  return archetype;
}

// --- CLOUDFLARE TURNSTILE (spam gate) ---
// Explicit-render mode: the widget is built when the waitlist step first
// becomes visible. The token it produces is sent to the waitlist-signup edge
// function, which verifies it server-side before writing to the DB.
let turnstileWidgetId = null;
// One signup per page load (see setupWaitlistBindings). Module-scoped so the
// restart flow can re-arm the form for a fresh Loyalty Card.
let waitlistSubmitted = false;
function renderTurnstile() {
  if (turnstileWidgetId !== null) return; // already rendered
  const el = document.getElementById('turnstile-container');
  if (!el || !window.turnstile) return; // script not ready yet
  const sitekey = import.meta.env.VITE_TURNSTILE_SITEKEY;
  if (!sitekey) {
    // Fail loud, not silent: no sitekey means the env var is missing in this
    // environment. Better a visibly-broken widget than a silent always-pass.
    console.warn('[turnstile] VITE_TURNSTILE_SITEKEY is not set — captcha will not render');
    return;
  }
  turnstileWidgetId = window.turnstile.render(el, {
    sitekey, // real sitekey lives in env only (.env.local locally, Vercel in prod)
    theme: 'dark',
    // Keep the widget out of the way: it only becomes visible if Cloudflare
    // actually needs to challenge the visitor. Verification still happens
    // server-side, so this is purely a visual de-emphasis.
    appearance: 'interaction-only',
    // Surfaces Cloudflare's error code (e.g. 110200 = this domain isn't on the
    // sitekey's allowed hostnames) instead of failing with no trace.
    'error-callback': (code) => {
      console.warn(`[turnstile] widget error ${code}`);
    },
  });
}
// Retry until the async Turnstile script has loaded (up to ~5s).
function ensureTurnstile(retries = 20) {
  if (turnstileWidgetId !== null) return;
  if (window.turnstile) {
    renderTurnstile();
    return;
  }
  if (retries > 0) setTimeout(() => ensureTurnstile(retries - 1), 250);
}
function getTurnstileToken() {
  if (!window.turnstile || turnstileWidgetId === null) return '';
  return window.turnstile.getResponse(turnstileWidgetId) || '';
}
function resetTurnstile() {
  if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
}
// Tear the captcha widget down entirely and hide its container — used after a
// successful signup so the form/widget closes (one signup per page load).
function closeTurnstile() {
  const el = document.getElementById('turnstile-container');
  if (window.turnstile && turnstileWidgetId !== null) {
    try { window.turnstile.remove(turnstileWidgetId); } catch { /* ignore */ }
    turnstileWidgetId = null;
  }
  if (el) el.style.display = 'none';
}
// Re-arm the waitlist form after a flow restart: allow a new signup, re-enable
// the submit button, and rebuild the captcha widget that closeTurnstile removed.
function rearmWaitlistForm() {
  waitlistSubmitted = false;
  setWaitlistError('');
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.removeAttribute('disabled');
  const el = document.getElementById('turnstile-container');
  if (el) el.style.display = '';
  turnstileWidgetId = null; // force a fresh render
  // ensureTurnstile(); // captcha disabled — see supabase/functions/waitlist-signup
}

// --- WAITLIST DATA AND FORM SUBMISSION ENGINE ---
// Dev-only localStorage mirror of signups, read by the dev admin panel. Never
// written in production — real signups live in public.waitlist. A corrupted
// value must never throw mid-submit.
function readWaitlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem('fanlog_waitlist') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Turnstile mints its token in the background after the widget renders
// (usually within a second or two). Wait for it instead of submitting without
// one, which the edge function rejects. Returns '' right away if the widget
// never rendered (script blocked, or no sitekey in this environment).
async function waitForTurnstileToken(timeoutMs = 8000) {
  if (turnstileWidgetId === null) return '';
  const deadline = Date.now() + timeoutMs;
  let token = getTurnstileToken();
  while (!token && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 200));
    token = getTurnstileToken();
  }
  return token;
}

function setWaitlistError(message) {
  const el = document.getElementById('share-email-error');
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

function setupWaitlistBindings() {
  const shareEmailForm = document.getElementById('share-email-form');
  const fanEmailInput = document.getElementById('fan-email');
  const shareEmailSuccess = document.getElementById('share-email-success');
  const submitBtn = document.getElementById('submit-btn');

  if (!shareEmailForm) return;
  const submitLabel = submitBtn ? submitBtn.textContent : '';

  // One signup per page load (module-scoped waitlistSubmitted): once the signup
  // is saved, the form/widget closes and further submits are ignored until
  // refresh or an explicit flow restart (which re-arms via rearmWaitlistForm).
  // A failed save re-opens the form so the visitor can try again.
  shareEmailForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = fanEmailInput ? fanEmailInput.value.trim() : '';
    if (!email || waitlistSubmitted) return;
    waitlistSubmitted = true;
    setWaitlistError('');
    if (submitBtn) {
      submitBtn.setAttribute('disabled', 'true');
      submitBtn.textContent = 'Joining…';
    }

    // The Fan ID is whatever is on the card. It's never derived from the
    // email: share links and previews are public, the email isn't.
    const handle = sanitizeHandle(savedHandle);
    const name = handle ? `@${handle}` : null;
    const topTeam = selectedTeams.find(t => t.isTop) || selectedTeams[0];
    const prediction = topTeam ? `${topTeam.short} champion in ${topTeam.prediction}` : '';
    const teamsFormat = selectedTeams.map(t => `${t.name} (${t.league}) [Score: ${t.score}/100]${t.isTop ? ' *TOP*' : ''}`).join(', ');
    const overallScore = computeFanScore(selectedTeams);

    // Durable, structured store via the waitlist-signup edge function.
    // Captcha disabled: to re-enable, restore the token wait and pass it below.
    // const captchaToken = await waitForTurnstileToken();
    const result = await saveWaitlistEntry({
      name,
      handle: name,
      email,
      topTeam: topTeam ? topTeam.name : null,
      teams: selectedTeams.map(t => ({
        id: t.id, name: t.name, league: t.league, score: t.score, isTop: !!t.isTop
      })),
      prediction,
      overallScore,
      archetype: generateSportsIdentityTagline(),
      fanId: getFanId()
    });

    // Local dev runs without the Supabase/Turnstile env vars, so let the
    // success UI run there. Anywhere else a failed save must not look like
    // a successful signup.
    const saved = result.ok || (import.meta.env.DEV && result.error === 'supabase-not-configured');
    if (!saved) {
      HubSDK.track('waitlist_signup_failed', { error: result.error || 'unknown' });
      resetTurnstile(); // tokens are single-use; mint a fresh one for the retry
      waitlistSubmitted = false;
      if (submitBtn) {
        submitBtn.removeAttribute('disabled');
        submitBtn.textContent = submitLabel;
      }
      setWaitlistError(result.error === 'missing-captcha'
        ? "We couldn't verify you're human, so you weren't added yet. If you use an ad blocker, try pausing it, then submit again."
        : 'Something went wrong adding you to the waitlist. Please try again.');
      return;
    }

    // No email in analytics: events carry the fan id (user_id), and the
    // waitlist row stores the same fan id alongside the email.
    HubSDK.track('waitlist_signup', {
      name,
      teams: teamsFormat,
      prediction,
      overallScore,
      referredBy
    });

    if (import.meta.env.DEV) {
      const currentWaitlist = readWaitlist();
      if (!currentWaitlist.some(entry => entry.email.toLowerCase() === email.toLowerCase())) {
        currentWaitlist.push({ timestamp: new Date().toISOString(), name: name || '', email, teams: teamsFormat, prediction });
        localStorage.setItem('fanlog_waitlist', JSON.stringify(currentWaitlist));
      }
    }

    // Show verified checkmark and hide form, show share button
    if (submitBtn) submitBtn.textContent = submitLabel;
    const verifiedBadge = document.getElementById('f-card-verified-badge');
    if (verifiedBadge) verifiedBadge.style.display = 'inline-block';

    if (shareEmailForm) shareEmailForm.style.display = 'none';
    if (shareEmailSuccess) shareEmailSuccess.style.display = 'block';
    updateRevealFanId(); // reveals the "Set your Fan ID" prompt if still @GUEST

    // Close the captcha widget now that signup is done.
    closeTurnstile();

    // Confetti
    if (topTeam) {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 },
        colors: [topTeam.primaryColor, topTeam.secondaryColor, '#ffffff']
      });
    }
  });
  
  // Prompt for visitors still showing @GUEST: jump to the card's Fan ID and
  // start editing it in place.
  const setFanIdBtn = document.getElementById('b-set-fan-id');
  if (setFanIdBtn) {
    setFanIdBtn.addEventListener('click', () => {
      const fanIdEl = document.getElementById('f-card-name');
      if (fanIdEl) fanIdEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      startFanIdEdit();
    });
  }

  // Primary share CTA, always available — not gated on the waitlist form.
  // Opens the native sheet; /share's Open Graph tags render the card as the
  // link-preview thumbnail wherever it lands.
  const shareSportsCircleBtn = document.getElementById('b-share-sports-circle');
  if (shareSportsCircleBtn) {
    shareSportsCircleBtn.addEventListener('click', () => shareTextOrDownload(getShareText(), shareSportsCircleBtn));
  }
}

// Restart button
btnRestartFlow.addEventListener('click', () => {
  resetForNewCard();
  goToStep(2);
});

// Recipient view's landing-style "make your own" buttons: reset the sharer's
// state, then start the normal build flow (or a random card).
document.getElementById('b-shared-create')?.addEventListener('click', () => {
  resetForNewCard();
  goToStep(2);
});
document.getElementById('b-shared-surprise')?.addEventListener('click', () => {
  resetForNewCard();
  generateRandomCard();
});

// --- DEVICE DETECTION UTILITY ---
function getDeviceDetails() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid;
  return { isIOS, isAndroid, isMobile };
}

// Helper to trigger direct local file download as fallback
function triggerFileDownload(canvas, topTeamFormatted, nameFormatted) {
  const nameFormattedClean = nameFormatted ? nameFormatted.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'guest';
  const link = document.createElement('a');
  link.download = `fanlog_${topTeamFormatted}_card_${nameFormattedClean}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// --- LOGO INLINING FOR EXPORT ---
// Cross-origin ESPN logos can taint the export canvas (e.g. when the browser
// serves a cached non-CORS response), which silently breaks toDataURL/toBlob.
// Swapping every logo to a same-origin data URL before capture guarantees a
// clean canvas. Restores the original URLs afterwards.
const logoDataUrlCache = new Map();

async function fetchAsDataURL(url) {
  if (logoDataUrlCache.has(url)) return logoDataUrlCache.get(url);
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Logo fetch failed: ${res.status}`);
  const blob = await res.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  logoDataUrlCache.set(url, dataUrl);
  return dataUrl;
}

async function inlineCardImages(rootEl) {
  const elements = [
    ...rootEl.querySelectorAll('img'),
    ...rootEl.querySelectorAll('image') // SVG <image> logos in the rainbow chart
  ];
  const restores = [];

  await Promise.all(elements.map(async el => {
    const isSvgImage = el.tagName.toLowerCase() === 'image';
    const src = isSvgImage ? el.getAttribute('href') : el.getAttribute('src');
    if (!src || src.startsWith('data:')) return;
    try {
      const dataUrl = await fetchAsDataURL(src);
      restores.push(() => {
        if (isSvgImage) el.setAttribute('href', src);
        else el.setAttribute('src', src);
      });
      if (isSvgImage) el.setAttribute('href', dataUrl);
      else el.setAttribute('src', dataUrl);
    } catch {
      // Leave the original URL; html2canvas useCORS may still handle it
    }
  }));

  return () => restores.forEach(fn => fn());
}

// --- CARD CAPTURE (shared by Download and Share) ---
// Renders the card front face to a canvas via html2canvas, temporarily
// flattening transforms/shadows and the color-mix() border (html2canvas
// can't parse color-mix, and the stylesheet applies it to .fcard-front with
// !important, so the overrides must be inline !important too).
async function captureCardCanvas() {
  const frontFace = document.getElementById('fcard-front-face');
  const cardElement = document.getElementById('final-card');
  if (!frontFace || !cardElement) {
    throw new Error('card elements not found');
  }

  const originalTransform = cardElement.style.transform;
  const originalFaceCss = frontFace.style.cssText;

  cardElement.style.transform = 'none';
  frontFace.style.setProperty('box-shadow', 'none', 'important');
  frontFace.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.12)', 'important');

  // Inline all logos as data URLs so the export canvas can never be tainted
  let restoreImages = () => {};
  try {
    restoreImages = await inlineCardImages(frontFace);
  } catch {
    // Non-fatal: fall through and rely on useCORS
  }

  try {
    const rawCanvas = await html2canvas(frontFace, {
      scale: 3,
      backgroundColor: null,
      useCORS: true,
      logging: false
    });
    return padCardCanvas(rawCanvas);
  } finally {
    cardElement.style.transform = originalTransform;
    frontFace.style.cssText = originalFaceCss;
    restoreImages();
  }
}

// Shrinks the captured card to ~80% of the exported image, padded out to full
// size with the card's own background color. Messaging apps often crop a
// shared/attached image to fit their own thumbnail shape, and without this
// margin that crop could eat into the card itself; the padding gives it room
// to crop into instead. Same color as the card (not a contrasting border) so
// it reads as extra background, not a visible frame.
function padCardCanvas(canvas, cardFraction = 0.8) {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim() || '#0e1016';
  const padded = document.createElement('canvas');
  padded.width = Math.round(canvas.width / cardFraction);
  padded.height = Math.round(canvas.height / cardFraction);
  const ctx = padded.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, padded.width, padded.height);
  ctx.drawImage(canvas, Math.round((padded.width - canvas.width) / 2), Math.round((padded.height - canvas.height) / 2));
  return padded;
}

// The small card summary /share and /api/og (see api/share.js, api/og.js)
// need to render this card's actual design as the link's Open Graph image.
// Deliberately only what those two actually read (handle, archetype, and
// per-team id/score/top-flag) — this ends up either stored server-side or
// baked directly into the link, so anything extra here is pure cost with no
// payoff. No overall score: readers compute it from the team scores
// (computeFanScore), so it can't go stale or be spoofed.
function buildCirclePayload() {
  return {
    h: sanitizeHandle(savedHandle),
    a: generateSportsIdentityTagline(),
    t: selectedTeams.map(t => ({ i: t.id, s: t.score, top: t.isTop ? 1 : 0 }))
  };
}

// Fallback-only now (see getShareUrl): a compact URL-safe base64 encoding
// of the same payload, for when saveCircle() can't reach Supabase.
function encodeCircle(payload = buildCirclePayload()) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

// Shared Loyalty Card links point at /share, a lightweight branded landing
// page (api/share.js) whose Open Graph tags point at /api/og — a
// server-rendered PNG of this exact card (see cardVisuals.js, shared with
// the live DOM render, so the two can't drift apart). Link-preview crawlers
// (iMessage, WhatsApp, Discord, X…) read those tags and show the real card
// as a single rich link preview, instead of us attaching a separate image
// file alongside the text (which showed up as two disjointed messages).
// Real visitors who tap through land on /share's own page, not directly on
// the sharer's card — they get a "view this card" button into the normal
// app, never auto-dropped into someone else's session.
//
// The card summary is stored server-side (public.circles) and referenced by
// a short ?id=, instead of being base64'd directly into the link — that's
// what was making these links so long. That write has to happen BEFORE the
// user taps Share, not during the click: navigator.share() only works
// inside the synchronous window of a user gesture, and iOS Safari throws
// NotAllowedError if anything async (like a network round trip) runs ahead
// of it in the same handler. So prepareShareUrl() below pre-fetches the id
// at points where the card summary is known to have just changed, caches
// it, and getShareUrl() reads the cache synchronously — falling back to
// embedding the payload directly (?c=, always synchronous) if the cache
// isn't ready yet or Supabase is unreachable, so sharing never hard-fails
// on a network hiccup. Both link forms are read by api/share.js/api/og.js.
let cachedShareId = null;
let shareIdRequest = 0;

async function prepareShareUrl() {
  // Drop the old id right away so getShareUrl falls back to the current ?c=
  // payload while the new save is in flight, and ignore a slower earlier save
  // that resolves after a newer one.
  const request = ++shareIdRequest;
  cachedShareId = null;
  const id = await saveCircle(buildCirclePayload());
  if (request === shareIdRequest) cachedShareId = id;
}

function getShareUrl() {
  const params = new URLSearchParams();
  params.set('ref', sanitizeHandle(savedHandle) || 'anon');
  params.set('utm_source', 'fanlog_share');
  if (cachedShareId) {
    params.set('id', cachedShareId);
  } else {
    const circle = encodeCircle();
    if (circle) params.set('c', circle);
  }
  return `${window.location.origin}/share?${params.toString()}`;
}

function getShareText() {
  const rank = topRankFor(selectedTeams.find(t => t.isTop) || selectedTeams[0]);
  const intro = rank ? `I'm a top ${rank.pct}% ${rank.nickname} fan. ` : '';
  return `${intro}Judge my Sports Loyalty Card. 👇\nI'll judge yours. ${getShareUrl()}`;
}

function getCardFileName() {
  return savedHandle ? savedHandle.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'guest';
}

// --- DOWNLOAD: always saves the PNG file ---
btnDownloadPng.addEventListener('click', async () => {
  try {
    const canvas = await captureCardCanvas();
    const topTeam = selectedTeams.find(t => t.isTop) || selectedTeams[0];
    HubSDK.track('card_downloaded', { teamId: topTeam ? topTeam.id : 'fandom' });
    triggerFileDownload(canvas, topTeam ? topTeam.id : 'fandom', getCardFileName());
  } catch (err) {
    console.error("PNG render failed:", err);
    alert("Could not generate card image. Please try again.");
  }
});

// --- SHARE: native share sheet, link only ---
// We attach the link, not a captured image file: sharing a file + text
// together showed up as two separate messages in Messages (a photo bubble
// plus a text bubble) instead of one clean share. The link itself carries
// the encoded card (see getShareUrl/encodeCircle) and /share + /api/og
// render it into a real link-preview thumbnail server-side, so recipients
// still see the actual card — just as one rich link, not an attachment.
async function shareTextOrDownload(shareText, feedbackBtn = btnCopyLink) {
  if (navigator.share) {
    try {
      // shareText already ends with the link (see getShareText). Earlier
      // this stripped the link back out and passed it separately as `url`
      // so Messages would treat it as an isolated link-preview target — but
      // that's what was actually putting the link ABOVE the caption text:
      // Messages was placing the separate `url` field ahead of `text`
      // regardless of a `title` field being present or not. Passing the
      // whole string as `text` and skipping `url` entirely pins the link
      // where it already sits in the string — after the caption — and
      // Messages still auto-generates the rich preview from a URL found
      // anywhere in the text, so the thumbnail isn't lost either.
      await navigator.share({ text: shareText });
      HubSDK.track('card_shared', { platform: 'native_share_text' });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  HubSDK.track('card_shared', { platform: 'desktop_fallback' });
  try {
    const canvas = await captureCardCanvas();
    const topTeam = selectedTeams.find(t => t.isTop) || selectedTeams[0];
    triggerFileDownload(canvas, topTeam ? topTeam.id : 'fandom', getCardFileName());
  } catch {
    // Image failed - still give them the caption
  }
  copyToClipboardText(shareText, feedbackBtn, 'Image Saved + Caption Copied!');
}

// Optional dedicated share-card button (not always in the DOM).
const btnShareCard = document.getElementById('b-share-card');
if (btnShareCard) btnShareCard.addEventListener('click', () => shareTextOrDownload(getShareText(), btnShareCard));

// --- COPY LINK: always copies, no share sheet ---
btnCopyLink.addEventListener('click', () => {
  HubSDK.track('card_shared', { platform: 'copy_link' });
  copyToClipboardText(getShareText());
});

function copyToClipboardText(shareText, feedbackBtn = btnCopyLink, feedbackLabel = 'Link Copied!') {
  navigator.clipboard.writeText(shareText).then(() => {
    if (!feedbackBtn) return;
    const originalText = feedbackBtn.innerHTML;
    feedbackBtn.innerHTML = `<span>${feedbackLabel}</span>`;
    feedbackBtn.style.borderColor = '#10b981';
    feedbackBtn.style.color = '#10b981';

    setTimeout(() => {
      feedbackBtn.innerHTML = originalText;
      feedbackBtn.style.borderColor = '';
      feedbackBtn.style.color = '';
    }, 2000);
  }).catch(() => {
    alert("Here is your shareable link:\n\n" + shareText);
  });
}

// Real Social Share Handlers
const socialButtons = document.querySelectorAll('.social-share-horizontal .social-btn');
socialButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const platform = btn.getAttribute('data-platform');
    HubSDK.track('card_shared', { platform });
    const tagline = generateSportsIdentityTagline();
    const topTeam = selectedTeams.find(t => t.isTop) || selectedTeams[0];
    const teamName = topTeam ? topTeam.name : 'my teams';
    const shareMessage = `My FanLog archetype: "${tagline}" supporting ${teamName}. Mapped my teams on FanLog:`;
    
    if (platform === 'X / Twitter') {
      const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}&url=${encodeURIComponent(getShareUrl())}`;
      window.open(xUrl, '_blank');
    } else if (platform === 'iMessage' || platform === 'Instagram Stories') {
      shareTextOrDownload(getShareText(), btn);
    } else {
      alert(`Archetype: "${tagline}". Link copied: ${getShareUrl()}`);
    }
  });
});

// --- DEV-ONLY ADMIN PANEL ---
// Shows the signups made in *this browser* (the dev-only localStorage mirror
// written by setupWaitlistBindings) — it never had access to real signups,
// which live in public.waitlist. Vite strips this block from production
// builds, so there's no client-side password to ship (the old one sat in the
// public bundle) and no "Double click for Admin Panel" hint on the live logo.
// The panel's markup is created here too, so the production HTML has no
// trace of it (page readers would otherwise see "Waitlist Signups: 0").
if (import.meta.env.DEV) {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="admin-modal-overlay" id="admin-modal">
      <div class="admin-modal-container">
        <div class="admin-modal-header">
          <h3>FanLog Admin Panel (dev)</h3>
          <button class="close-modal-btn" id="admin-close-btn">&times;</button>
        </div>
        <div class="admin-modal-content">
          <p>Signups made in this browser during local development. Real signups live in the Supabase <code>waitlist</code> table.</p>
          <div id="admin-dashboard-area">
            <div class="admin-actions-bar">
              <div><strong>Waitlist Signups: </strong><span id="admin-signup-count">0</span></div>
              <div class="admin-btn-group">
                <button id="admin-export-btn" class="btn btn-secondary btn-sm">Export CSV</button>
                <button id="admin-clear-btn" class="btn btn-danger btn-sm">Clear All</button>
              </div>
            </div>
            <div class="table-responsive">
              <table class="admin-table">
                <thead>
                  <tr><th>Timestamp</th><th>Name</th><th>Email</th><th>Teams & Devotion Scores</th><th>Title Prediction</th></tr>
                </thead>
                <tbody id="admin-table-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>`);

  const adminTrigger = document.getElementById('site-logo');
  const adminModal = document.getElementById('admin-modal');
  const adminCloseBtn = document.getElementById('admin-close-btn');
  const adminSignupCount = document.getElementById('admin-signup-count');
  const adminExportBtn = document.getElementById('admin-export-btn');
  const adminClearBtn = document.getElementById('admin-clear-btn');
  const adminTableBody = document.getElementById('admin-table-body');

  adminTrigger.title = 'Double click for the dev admin panel';
  adminTrigger.addEventListener('dblclick', () => {
    renderAdminDashboard();
    adminModal.classList.add('active');
  });

  adminCloseBtn.addEventListener('click', () => {
    adminModal.classList.remove('active');
  });

  function renderAdminDashboard() {
    const waitlist = readWaitlist();
    adminSignupCount.textContent = waitlist.length;
    
    adminTableBody.innerHTML = '';
    
    if (waitlist.length === 0) {
      adminTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No waitlist submissions yet.</td></tr>';
      return;
    }
    
    const sortedList = [...waitlist].reverse();
    
    sortedList.forEach(entry => {
      const tr = document.createElement('tr');
      const localDate = new Date(entry.timestamp).toLocaleString();
      tr.innerHTML = `
        <td>${localDate}</td>
        <td><strong>${escapeHTML(entry.name)}</strong></td>
        <td><a href="mailto:${escapeHTML(entry.email)}" style="text-decoration: underline; color: var(--team-primary);">${escapeHTML(entry.email)}</a></td>
        <td><span style="font-size: 0.85em; color: var(--text-muted);">${escapeHTML(entry.teams)}</span></td>
        <td><strong>${escapeHTML(entry.prediction)}</strong></td>
      `;
      adminTableBody.appendChild(tr);
    });
  }

  adminExportBtn.addEventListener('click', () => {
    const waitlist = readWaitlist();
    if (waitlist.length === 0) {
      alert("No data available to export.");
      return;
    }
    
    const headers = ['Timestamp', 'Name', 'Email', 'Teams and Fandoms', 'Title Prediction'];
    const rows = waitlist.map(entry => [
      entry.timestamp,
      entry.name,
      entry.email,
      entry.teams,
      entry.prediction
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'fanlog_waitlist_index_export.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  adminClearBtn.addEventListener('click', () => {
    if (confirm("Are you absolutely sure you want to delete all waitlist records? This cannot be undone.")) {
      localStorage.removeItem('fanlog_waitlist');
      renderAdminDashboard();
    }
  });

  function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>'"]/g,
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }
}

// --- DEV-ONLY: INSTANT TEST CARD ---
// Skips the whole onboarding flow and jumps straight to the final card with
// 3 random fully-quizzed teams. Vite statically strips this entire block from
// production builds (import.meta.env.DEV === false in `vite build`), so the
// button only exists on the dev server.
// Build a fully-populated random Loyalty Card (3 quizzed teams) and jump
// straight to the final card. Shared by the user-facing "Surprise Me" button
// and the DEV shortcut below.
function generateRandomCard() {
  const allTeams = [];
  for (const league in sportsData) {
    sportsData[league].teams.forEach(t => allTeams.push({ team: t, league }));
  }

  const picks = [];
  while (picks.length < 3) {
    const candidate = allTeams[Math.floor(Math.random() * allTeams.length)];
    if (!picks.some(p => p.team.id === candidate.team.id)) picks.push(candidate);
  }

  selectedTeams = picks.map(({ team, league }, i) => ({
    id: team.id,
    name: team.name,
    short: team.short,
    logo: team.logo,
    city: team.city,
    status: team.status,
    primaryColor: team.primary,
    secondaryColor: team.secondary,
    isTop: i === 0,
    league: league.toUpperCase(),
    score: [92, 74, 55][i],
    fanSince: String(1995 + Math.floor(Math.random() * 25)),
    prediction: String(2026 + Math.floor(Math.random() * 10)),
    quizQuestions: getRandomQuizQuestions(2)
  }));

  if (!savedHandle) savedHandle = sampleHandles[Math.floor(Math.random() * sampleHandles.length)];
  userQuizAnswers = {};
  recalculateTopTeam();

  const finalScore = computeFanScore(selectedTeams);

  setupStep5MainPage(finalScore);
}

// User-facing "Surprise Me" button on the welcome step — builds a random,
// fully-quizzed Loyalty Card and jumps straight to the final card.
document.getElementById('btn-random-card')?.addEventListener('click', () => {
  HubSDK.track('random_card_generated');
  generateRandomCard();
});

if (import.meta.env.DEV) {
  const devBtn = document.createElement('button');
  devBtn.id = 'dev-test-card-btn';
  devBtn.type = 'button';
  devBtn.textContent = '⚡ DEV: Test Card';
  devBtn.title = 'Dev only - jump to the final card with random test data (stripped from production builds)';
  devBtn.style.cssText = [
    'position: fixed', 'bottom: 16px', 'left: 16px', 'z-index: 9999',
    'padding: 10px 14px', 'background: #f59e0b', 'color: #000',
    'font-weight: 700', 'font-size: 12px', 'border: none',
    'border-radius: 8px', 'cursor: pointer',
    'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4)'
  ].join(';');

  devBtn.addEventListener('click', generateRandomCard);

  document.body.appendChild(devBtn);
}

// --- SHARED CARD (RECIPIENT VIEW) ---
// Opening someone's shared link drops the recipient straight onto the
// sharer's Loyalty Card, then invites them to build their own. The link
// carries the card either as a short ?id= (looked up in Supabase) or, for
// links made before that shipped / when Supabase is unreachable, the whole
// payload base64'd into ?c=. Both resolve to the same { h, a, sc, t } shape.
// ?ref= is still read separately above for referral attribution.
function buildTeamFromId(id) {
  for (const lg in sportsData) {
    const t = sportsData[lg].teams.find(x => x.id === id);
    if (t) {
      return {
        id: t.id, name: t.name, short: t.short, logo: t.logo, city: t.city,
        status: t.status, primaryColor: t.primary, secondaryColor: t.secondary,
        league: lg.toUpperCase()
      };
    }
  }
  return null;
}

function decodeCircleToken(enc) {
  try {
    const b64 = enc.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch {
    return null;
  }
}

// Rebuild selectedTeams from a resolved circle payload and jump to the card in
// recipient mode. Returns true if it rendered a card, false if the payload was
// unusable (so the caller can leave the normal landing page in place).
function renderSharedCard(rawPayload) {
  // Links are attacker-controlled: cap the handle, clamp scores (circlePayload.js).
  const payload = sanitizeCircle(rawPayload);
  if (!payload) return false;
  const teams = payload.t.map(tt => {
    const base = buildTeamFromId(tt.i);
    if (!base) return null;
    return {
      ...base,
      score: tt.s,
      fanSince: '',
      prediction: '',
      isTop: !!tt.top,
      quizQuestions: getRandomQuizQuestions(4)
    };
  }).filter(Boolean);
  if (!teams.length) return false;
  if (!teams.some(t => t.isTop)) teams[0].isTop = true;

  selectedTeams = teams;
  savedHandle = payload.h || savedHandle;
  userQuizAnswers = {};

  setupStep5MainPage(computeFanScore(selectedTeams), true);
  return true;
}

// Called on load: if the URL carries a shared card, resolve and show it. The
// ?c= form decodes synchronously; the ?id= form needs a Supabase round trip,
// so the normal landing page shows first and is replaced once it resolves.
async function loadSharedCardFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const c = params.get('c');
  if (!id && !c) return;
  try {
    const payload = c ? decodeCircleToken(c) : await fetchCircle(id);
    if (payload) renderSharedCard(payload);
  } catch {
    // leave the normal landing page in place
  }
}
