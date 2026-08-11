import { sportsData } from './teams.js';
import confetti from 'canvas-confetti';
import html2canvas from 'html2canvas';
import { HubSDK } from '@ethanhodge7373/hub-sdk';
import { saveWaitlistEntry } from './waitlist.js';

HubSDK.init({
  appSlug: 'fanlog',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
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
  const overallScore = Math.round(
    chosen.reduce((sum, t) => sum + t.score, 0) / chosen.length
  );
  
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
  // A shared-card link (?c=...) already jumped to step 6 with the sharer's
  // card via loadSharedCircle() below, at module-evaluation time (module
  // scripts run before DOMContentLoaded fires). Don't stomp that by resetting
  // to the welcome step and restarting its random morphing loop.
  if (!sharedCircleLoaded) goToStep(1);
  setupWaitlistBindings();
  setupNotifyMeBinding();
  initYearPickers();
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
    document.getElementById('step-main')     // 6
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
    ensureTurnstile(); // build the captcha widget now that the form is visible
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
document.getElementById('admin-trigger')?.addEventListener('click', (e) => {
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
    quizQuestions: getRandomQuizQuestions(4)
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

// --- HELPER: ADAPT COLOR FOR CONTRAST ON DARK BACKGROUNDS ---
function getLuminance(hex) {
  if (!hex) return 0;
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  }
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function getContrastAdaptedColor(primaryHex, secondaryHex) {
  const brightness = getLuminance(primaryHex);
  // If brightness is below 45 (out of 255) and secondary is brighter, use secondary color
  if (brightness < 45 && secondaryHex) {
    const secBrightness = getLuminance(secondaryHex);
    if (secBrightness > brightness) {
      return secondaryHex;
    }
  }
  return primaryHex;
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
  
  const radii = [130, 108, 86, 64];
  const cx = 150;
  const cy = 160;
  
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
  
  const radii = [130, 108, 86, 64];
  const cx = 150;
  const cy = 160;
  
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

// --- HELPER: GET LEAGUE SPECIFIC CHAMPIONSHIP LABEL ---
function getPredictionLabel(league, teamShort) {
  const prefix = teamShort ? `${teamShort} ` : "";
  if (!league) return `${prefix}PREDICTION`;
  const l = league.toLowerCase();
  switch (l) {
    case "nhl":
      return `${prefix}CUP PREDICTION`;
    case "nfl":
      return `${prefix}BOWL PREDICTION`;
    case "nba":
      return `${prefix}TITLE PREDICTION`;
    case "mlb":
      return `${prefix}SERIES PREDICTION`;
    case "mls":
      return `${prefix}CUP PREDICTION`;
    default:
      return `${prefix}PREDICTION`;
  }
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
    } else {
      if (sinceLabelEl) sinceLabelEl.textContent = "FAN SINCE";
      if (predictionLabelEl) predictionLabelEl.textContent = "PREDICTION";
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
    quizQuestions: getRandomQuizQuestions(4) // Choose 4 random questions for this team
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
        // Toggle selected state
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
  const allAnswered = team.quizQuestions.every(q => {
    const answerKey = `${team.id}_${q.key}`;
    return typeof userQuizAnswers[answerKey] === 'number';
  });

  const predInput = document.getElementById('quiz-prediction-input');
  const predVal = predInput ? parseInt(predInput.value) : NaN;
  const predValid = !isNaN(predVal) && predVal >= 2026 && predVal <= 2050;

  if (allAnswered && predValid) {
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
  team.quizQuestions.forEach(q => {
    const answerKey = `${team.id}_${q.key}`;
    totalScore += userQuizAnswers[answerKey] || 0;
  });
  
  team.score = totalScore;
  
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
    goToStep(5); // Transition to Step 5: Reveal
  });
}

// --- STEP 4: REVEAL SEQUENCE ---
function runRevealSequence() {
  const topTeam = selectedTeams.find(t => t.isTop) || selectedTeams[0];
  applyTeamTheme(topTeam.primaryColor, topTeam.secondaryColor);

  revealProgressFill.style.width = '0%';
  revealTicker.textContent = '00';
  
  // Calculate finished average overall score as a simple average of all team scores
  const finalScore = Math.min(100, Math.round(
    selectedTeams.reduce((sum, t) => sum + t.score, 0) / selectedTeams.length
  ));
  
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
// Hidden while the handle is still the @GUEST default.
function updateRevealFanId() {
  const el = document.getElementById('main-reveal-fanid');
  if (!el) return;
  const h = savedHandle ? (savedHandle.startsWith('@') ? savedHandle : `@${savedHandle}`) : '';
  el.textContent = h;
  el.style.display = h ? '' : 'none';
}

function setupStep5MainPage(finalScore, isSharedView = false) {
  const topTeam = selectedTeams.find(t => t.isTop) || selectedTeams[0];
  const tagline = generateSportsIdentityTagline();

  // Fan ID defaults to @GUEST, will be updated from email prefix once user enters email
  const displayHandle = savedHandle ? (savedHandle.startsWith('@') ? savedHandle : `@${savedHandle}`) : "@GUEST";

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

  // Someone landing here via a shared link is looking at another fan's card,
  // not one they just built — swap the "Your Loyalty Card Is Ready" copy for
  // messaging that makes that clear and points them toward building their own.
  // Re-applied (or reset back to the default) on every render so it doesn't
  // linger once a visitor restarts the flow to build their own card.
  const titleEl = document.querySelector('.main-reveal-title');
  const descEl = document.querySelector('.main-reveal-desc');
  const noteEl = document.querySelector('.share-email-note');
  if (isSharedView) {
    if (titleEl) titleEl.textContent = `${displayHandle}'s Loyalty Card`;
    if (descEl) descEl.textContent = `This is ${displayHandle}'s FanLog Score, revealing who they are as a fan. Join the waitlist to build your own Loyalty Card and see how your fandom compares.`;
    if (noteEl) noteEl.textContent = "Join the Fanlog waitlist to build your own Loyalty Card — we'll email you when we launch.";
  } else {
    if (titleEl) titleEl.textContent = 'Your Loyalty Card Is Ready.';
    if (descEl) descEl.textContent = 'Your Fanlog Score reveals who you are as a fan, from your loyalty level to the teams that define you. Join the waitlist to save your Loyalty Card, then share it and see how your fandom compares.';
    if (noteEl) noteEl.textContent = "Join the Fanlog waitlist — we'll email you when we launch. You can share your Loyalty Card right after.";
  }

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

  // Pre-render the share image so iOS can open the native share sheet
  // synchronously on tap (see prepareShareFile). Deferred to idle time so the
  // heavy html2canvas pass doesn't jank the step transition / scroll-to-demo.
  const scheduleShare = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
  scheduleShare(() => prepareShareFile());
}

// --- SETUP EDITABLE FAN ID ON CARD ---
function setupEditableFanId() {
  const fanIdEl = document.getElementById('f-card-name');
  if (!fanIdEl) return;
  
  // Make it visually clickable
  fanIdEl.style.cursor = 'pointer';
  
  fanIdEl.addEventListener('click', () => {
    if (fanIdEl.getAttribute('contenteditable') === 'true') return; // already editing
    fanIdEl.setAttribute('contenteditable', 'true');
    fanIdEl.classList.add('fan-id-editing');
    // Select all text
    const range = document.createRange();
    range.selectNodeContents(fanIdEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    fanIdEl.focus();
  });
  
  fanIdEl.addEventListener('blur', () => {
    fanIdEl.setAttribute('contenteditable', 'false');
    fanIdEl.classList.remove('fan-id-editing');
    // Sanitize: ensure @ prefix
    let val = fanIdEl.textContent.trim();
    if (!val.startsWith('@')) val = '@' + val;
    fanIdEl.textContent = val;
    savedHandle = val.slice(1); // strip @ for savedHandle
    updateRevealFanId();
  });
  
  fanIdEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fanIdEl.blur();
    }
  });
}

// --- DYNAMIC SPORTS IDENTITY TAGLINE ENGINE ---
// --- DYNAMIC SPORTS IDENTITY TAGLINE ENGINE ---
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

function generateSportsIdentityTagline(teams = selectedTeams) {
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
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.removeAttribute('disabled');
  const el = document.getElementById('turnstile-container');
  if (el) el.style.display = '';
  turnstileWidgetId = null; // force a fresh render
  ensureTurnstile();
}

// --- WAITLIST DATA AND FORM SUBMISSION ENGINE ---
// Safe read of the localStorage mirror. A corrupted value must never throw
// mid-submit (that would break the success animation even though the signup
// already reached xdesk + Supabase).
function readWaitlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem('fanlog_waitlist') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setupWaitlistBindings() {
  const shareEmailForm = document.getElementById('share-email-form');
  const fanEmailInput = document.getElementById('fan-email');
  const shareEmailSuccess = document.getElementById('share-email-success');
  const submitBtn = document.getElementById('submit-btn');
  
  if (!shareEmailForm) return;

  // One signup per page load (module-scoped waitlistSubmitted): once submitted,
  // the form/widget closes and further submits are ignored until refresh or an
  // explicit flow restart (which re-arms via rearmWaitlistForm).
  shareEmailForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const email = fanEmailInput ? fanEmailInput.value.trim() : '';
    if (!email) return;
    if (waitlistSubmitted) return; // already signed up this session
    waitlistSubmitted = true;
    if (submitBtn) submitBtn.setAttribute('disabled', 'true');

    // Derive fan ID from email prefix (before @)
    const emailPrefix = email.split('@')[0];
    const fanIdEl = document.getElementById('f-card-name');
    if (fanIdEl) {
      const newId = '@' + emailPrefix;
      fanIdEl.textContent = newId;
      savedHandle = emailPrefix;
      updateRevealFanId();
      // Card handle just changed — refresh the pre-rendered share image.
      prepareShareFile();
    }
    
    const topTeam = selectedTeams.find(t => t.isTop) || selectedTeams[0];
    const prediction = topTeam ? topTeam.prediction : '';
    const teamsFormat = selectedTeams.map(t => `${t.name} (${t.league}) [Score: ${t.score}/100]${t.isTop ? ' *TOP*' : ''}`).join(', ');
    
    const waitlistEntry = {
      timestamp: new Date().toISOString(),
      name: '@' + emailPrefix,
      email,
      teams: teamsFormat,
      prediction: topTeam ? `${topTeam.short} champion in ${prediction}` : ''
    };
    
    // Source of truth for aggregate signups is the xdesk backend (events table);
    // localStorage is only a local mirror for the built-in admin panel.
    const overallScore = parseInt(document.getElementById('f-card-score')?.textContent) || 0;

    HubSDK.setUser(email);
    HubSDK.track('waitlist_signup', {
      name: '@' + emailPrefix,
      email,
      teams: teamsFormat,
      prediction: waitlistEntry.prediction,
      overallScore,
      referredBy
    });

    // Durable, structured store via the captcha-gated edge function.
    // Fire-and-forget: non-throwing and must not block the success UX below.
    // The Turnstile token is single-use, so reset the widget afterward.
    const captchaToken = getTurnstileToken();
    saveWaitlistEntry({
      name: '@' + emailPrefix,
      handle: `@${emailPrefix}`,
      email,
      topTeam: topTeam ? topTeam.name : null,
      teams: selectedTeams.map(t => ({
        id: t.id, name: t.name, league: t.league, score: t.score, isTop: !!t.isTop
      })),
      prediction: waitlistEntry.prediction,
      overallScore,
      archetype: generateSportsIdentityTagline()
    }, captchaToken).finally(resetTurnstile);

    let currentWaitlist = readWaitlist();
    const emailExists = currentWaitlist.some(entry => entry.email.toLowerCase() === email.toLowerCase());

    if (!emailExists) {
      currentWaitlist.push(waitlistEntry);
      localStorage.setItem('fanlog_waitlist', JSON.stringify(currentWaitlist));
    }
    
    // Show verified checkmark and hide form, show share button
    const verifiedBadge = document.getElementById('f-card-verified-badge');
    if (verifiedBadge) verifiedBadge.style.display = 'inline-block';
    
    if (shareEmailForm) shareEmailForm.style.display = 'none';
    if (shareEmailSuccess) {
      shareEmailSuccess.style.display = 'block';
      // Make sure the share file is prepared eagerly as soon as success area is shown
      prepareShareFile();
    }

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
  
  // Share My Loyalty Card button (shown after email submitted). Shares the actual
  // card image via the native sheet so the picture attaches to Messages etc.;
  // falls back to text + link / download where files can't be shared.
  const shareSportsCircleBtn = document.getElementById('b-share-sports-circle');
  if (shareSportsCircleBtn) {
    shareSportsCircleBtn.addEventListener('click', () => shareCardImage(shareSportsCircleBtn));
  }
}

// Restart button
btnRestartFlow.addEventListener('click', () => {
  selectedTeams = [];
  userQuizAnswers = {};
  currentQuizTeamIndex = 0;
  savedHandle = '';
  
  // Reset share email form (re-arm for a fresh signup + rebuild the captcha)
  const shareEmailForm = document.getElementById('share-email-form');
  const shareEmailSuccess = document.getElementById('share-email-success');
  if (shareEmailForm) shareEmailForm.style.display = '';
  if (shareEmailSuccess) shareEmailSuccess.style.display = 'none';
  rearmWaitlistForm();
  
  // Reset since picker
  if (sincePickerWidget) {
    sincePickerWidget.selectedYear = null;
    sincePickerWidget.hiddenInput.value = '';
    const displayEl = document.getElementById('b-since-display');
    if (displayEl) displayEl.textContent = 'Select Year';
    const trigger = document.getElementById('b-since-trigger');
    if (trigger) trigger.classList.remove('has-value');
  }
  
  goToStep(2);
});

// --- NOTIFY ME BUTTON ---
function setupNotifyMeBinding() {
  const notifyBtn = document.getElementById('btn-notify-me');
  if (!notifyBtn) return;
  notifyBtn.addEventListener('click', () => {
    const email = prompt('Enter your email to be notified when new features are added:');
    if (!email || !email.includes('@')) return;
    let notifyList = JSON.parse(localStorage.getItem('fanlog_notify') || '[]');
    if (!notifyList.includes(email.toLowerCase())) {
      notifyList.push(email.toLowerCase());
      localStorage.setItem('fanlog_notify', JSON.stringify(notifyList));
    }
    notifyBtn.textContent = 'You\'re on the list!';
    notifyBtn.disabled = true;
  });
}

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
    return await html2canvas(frontFace, {
      scale: 3,
      backgroundColor: null,
      useCORS: true,
      logging: false
    });
  } finally {
    cardElement.style.transform = originalTransform;
    frontFace.style.cssText = originalFaceCss;
    restoreImages();
  }
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

// iOS Safari requires navigator.share() to be called synchronously inside the
// user gesture — awaiting html2canvas first drops the transient activation and
// the share sheet never opens (it silently fell back to a download). So we
// pre-render the card PNG whenever the card is (re)drawn and cache the File,
// letting the click handler call share() immediately with no awaits before it.
let preparedShareFile = null;
async function prepareShareFile() {
  try {
    const canvas = await captureCardCanvas();
    const blob = await canvasToBlob(canvas);
    preparedShareFile = new File([blob], `fanlog_card_${getCardFileName()}.png`, { type: 'image/png' });
  } catch {
    preparedShareFile = null; // fall back to on-demand capture at share time
  }
}

// Encode the current circle into a compact URL-safe base64 token so a shared
// link can (a) reopen the sharer's exact Loyalty Card in the app and (b) let the
// /api/og function render a per-card share thumbnail without recomputing — hence
// the archetype (a) and final score (sc) are baked in alongside the teams.
function encodeCircle() {
  try {
    const scoreEl = document.getElementById('f-card-score');
    const payload = {
      h: savedHandle || '',
      a: generateSportsIdentityTagline(),
      sc: scoreEl ? (parseInt(scoreEl.textContent, 10) || 0) : 0,
      t: selectedTeams.map(t => ({ i: t.id, s: t.score, y: t.fanSince, p: t.prediction, top: t.isTop ? 1 : 0 }))
    };
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

// Shared Loyalty Card links point at the /share route (not the app root) so that
// link-unfurling crawlers get per-card Open Graph tags + a rendered thumbnail
// (see api/share + api/og); /share then redirects real users into the app at
// /?c=… . The link carries: the encoded circle (?c=) so it opens the sharer's
// actual card; the sharer's handle (?ref=) for referral → conversion tracking;
// and utm_source so xdesk can segment share traffic from organic visits.
function getShareUrl() {
  const params = new URLSearchParams();
  params.set('ref', savedHandle || 'anon');
  params.set('utm_source', 'fanlog_share');
  const circle = encodeCircle();
  if (circle) params.set('c', circle);
  return `${window.location.origin}/share?${params.toString()}`;
}

function getShareText() {
  const topTeam = selectedTeams.find(t => t.isTop) || selectedTeams[0];
  const tagline = generateSportsIdentityTagline();
  return `Just calculated my FanLog Score! Archetype: "${tagline}". Top Team: ${topTeam ? topTeam.name : 'sports'}. Calculate yours on FanLog: ${getShareUrl()}`;
}

function getCardFileName() {
  const nameVal = fanNameInput ? fanNameInput.value : savedHandle;
  return nameVal ? nameVal.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'guest';
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

// --- SHARE: native share sheet with the card image where supported ---
// On phones this opens the OS share panel (Messages, Instagram, WhatsApp,
// AirDrop...) with the PNG attached. Falls back to text-only share, then to
// downloading the image + copying the caption on desktop.
const canShareFiles = () => {
  try {
    return !!(navigator.canShare && navigator.canShare({ files: [new File([], 'card.png', { type: 'image/png' })] }));
  } catch {
    return false;
  }
};

// Text + link share (older mobile browsers), then desktop download + caption
// copy. Used whenever we can't attach the actual image file.
async function shareTextOrDownload(shareText, feedbackBtn = btnCopyLink) {
  if (navigator.share) {
    try {
      const shareUrl = getShareUrl();
      // Pass the link as its own `url` field instead of only embedded inside
      // `text` — targets like Messages only generate a rich link-preview
      // thumbnail for a URL that arrives isolated like this, not one buried
      // mid-sentence, so keep the caption's copy of it out to avoid a
      // duplicate plain-text link.
      await navigator.share({ title: 'FanLog Loyalty Card', text: shareText.replace(shareUrl, '').trim(), url: shareUrl });
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

// Share the actual card IMAGE through the OS share sheet (Messages, Instagram,
// WhatsApp, AirDrop…). On iOS this is the ONLY way to attach the image to a text
// message — the sms: scheme is text-only. MUST run synchronously in the click
// (no awaits before navigator.share) or iOS drops the user activation and won't
// open the sheet, silently falling back to text/download. Relies on the PNG
// pre-rendered in prepareShareFile().
function shareCardImage(feedbackBtn = btnCopyLink) {
  const shareText = getShareText();
  if (canShareFiles() && preparedShareFile) {
    // Files + `url` together is unreliable on iOS Safari — some versions
    // silently reject the whole share() call when both are present, which
    // fell back to the text-only path below and dropped the image entirely.
    // The attached PNG is already the "thumbnail" here, so skip `url` and
    // keep the link as plain text in the caption instead.
    navigator.share({ files: [preparedShareFile], title: 'My FanLog Loyalty Card', text: shareText })
      .then(() => HubSDK.track('card_shared', { platform: 'native_share_image' }))
      .catch((err) => {
        if (err && err.name === 'AbortError') return; // user closed the sheet
        console.warn('Image share failed, falling back:', err);
        shareTextOrDownload(shareText, feedbackBtn);
      });
    return;
  }
  // No prepared image yet (or files unsupported): text share / download.
  shareTextOrDownload(shareText, feedbackBtn);
}

// Optional dedicated share-card button (not always in the DOM).
const btnShareCard = document.getElementById('b-share-card');
if (btnShareCard) btnShareCard.addEventListener('click', () => shareCardImage(btnShareCard));

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
      shareCardImage(btn);
    } else {
      alert(`Archetype: "${tagline}". Link copied: ${getShareUrl()}`);
    }
  });
});

// --- EASTER EGG ADMIN PANEL MODAL ---
const adminTrigger = document.getElementById('admin-trigger');
const adminModal = document.getElementById('admin-modal');
const adminCloseBtn = document.getElementById('admin-close-btn');
const adminPasswordInput = document.getElementById('admin-password');
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminLoginError = document.getElementById('admin-login-error');
const adminLoginArea = document.getElementById('admin-login-area');
const adminDashboardArea = document.getElementById('admin-dashboard-area');
const adminSignupCount = document.getElementById('admin-signup-count');
const adminExportBtn = document.getElementById('admin-export-btn');
const adminClearBtn = document.getElementById('admin-clear-btn');
const adminTableBody = document.getElementById('admin-table-body');

adminTrigger.addEventListener('dblclick', () => {
  adminModal.classList.add('active');
  adminPasswordInput.focus();
});

adminCloseBtn.addEventListener('click', () => {
  adminModal.classList.remove('active');
  adminPasswordInput.value = '';
  adminLoginError.style.display = 'none';
});

adminLoginBtn.addEventListener('click', () => {
  const pass = adminPasswordInput.value;
  if (pass === 'fanlog2026') {
    adminLoginArea.style.display = 'none';
    adminDashboardArea.style.display = 'block';
    renderAdminDashboard();
  } else {
    adminLoginError.textContent = 'Invalid administrator password.';
    adminLoginError.style.display = 'block';
  }
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
      <td><a href="mailto:${entry.email}" style="text-decoration: underline; color: var(--team-primary);">${escapeHTML(entry.email)}</a></td>
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
  return str.replace(/[&<>'"]/g,
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
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
    quizQuestions: getRandomQuizQuestions(4)
  }));

  if (!savedHandle) savedHandle = sampleHandles[Math.floor(Math.random() * sampleHandles.length)];
  userQuizAnswers = {};
  recalculateTopTeam();

  const topTeam = selectedTeams.find(t => t.isTop);
  const others = selectedTeams.filter(t => !t.isTop);
  const avgOthers = others.reduce((sum, t) => sum + t.score, 0) / others.length;
  const finalScore = Math.round(topTeam.score * 0.6 + avgOthers * 0.4);

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

// --- SHARED CIRCLE DEEP LINK ---
// Reconstruct a full team object from its id by looking it up across leagues.
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

// Rebuild the sharer's circle from a ?c= token and jump straight to their card,
// so a shared link opens *their* Loyalty Card instead of a blank landing page.
function loadSharedCircle(enc) {
  try {
    const b64 = enc.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(decodeURIComponent(escape(atob(b64))));
    const teams = (payload.t || []).map(tt => {
      const base = buildTeamFromId(tt.i);
      if (!base) return null;
      return {
        ...base,
        score: Number(tt.s) || 0,
        fanSince: String(tt.y || ''),
        prediction: String(tt.p || ''),
        isTop: !!tt.top,
        quizQuestions: getRandomQuizQuestions(4)
      };
    }).filter(Boolean);
    if (!teams.length) return false;
    if (!teams.some(t => t.isTop)) teams[0].isTop = true;

    selectedTeams = teams;
    savedHandle = payload.h || savedHandle;
    userQuizAnswers = {};

    const top = selectedTeams.find(t => t.isTop);
    const others = selectedTeams.filter(t => !t.isTop);
    const finalScore = others.length
      ? Math.round(top.score * 0.6 + (others.reduce((s, t) => s + t.score, 0) / others.length) * 0.4)
      : top.score;

    setupStep5MainPage(finalScore, true);
    return true;
  } catch {
    return false;
  }
}

const sharedCircleParam = new URLSearchParams(window.location.search).get('c');
const sharedCircleLoaded = sharedCircleParam ? loadSharedCircle(sharedCircleParam) : false;
