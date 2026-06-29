import { sportsData } from './teams.js';
import confetti from 'canvas-confetti';
import html2canvas from 'html2canvas';

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
  const otherTeams = chosen.slice(1);
  const avgOthers = otherTeams.reduce((sum, t) => sum + t.score, 0) / otherTeams.length;
  const overallScore = Math.round(topTeam.score * 0.6 + avgOthers * 0.4);
  
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

// Step 5 Main Profile / Waitlist Inputs
const waitlistForm = document.getElementById('fan-card-form');
const fanNameInput = document.getElementById('fan-name');
const fanEmailInput = document.getElementById('fan-email');

// Admin Panel Modal Elements
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

// Card Back elements
const fCardSerialBack = document.getElementById('f-card-serial-back');
const backValName = document.getElementById('back-val-name');
const backValScore = document.getElementById('back-val-score');

// --- WAKE UP ROUTINES ---
document.addEventListener('DOMContentLoaded', () => {
  goToStep(1);
  setupWaitlistBindings();
  setupWelcomeInputBindings();
});

function setupWelcomeInputBindings() {
  const welcomeInput = document.getElementById('welcome-fan-name');
  const btnStartFlow = document.getElementById('btn-start-flow');
  if (welcomeInput) {
    welcomeInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      savedHandle = val;
      
      const nameVal = val ? (val.startsWith('@') ? val : `@${val}`) : '@GUEST';
      
      // Update welcome card name instantly
      const wCardName = document.getElementById('w-card-name');
      if (wCardName) {
        wCardName.textContent = nameVal;
      }
      
      // Enable/disable start button based on validation
      if (btnStartFlow) {
        if (val.length > 0) {
          btnStartFlow.removeAttribute('disabled');
        } else {
          btnStartFlow.setAttribute('disabled', 'true');
        }
      }
    });
  }
}

// --- STEP VISIBILITY CONTROLLER ---
function goToStep(stepIndex) {
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
    // Scroll to top of step
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
  } else {
    headerCta.style.display = 'none';
  }
}

// Bind CTAs
btnStartFlow.addEventListener('click', () => goToStep(2));
btnHeaderWaitlist.addEventListener('click', () => {
  const target = document.getElementById('waitlist-section');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth' });
  }
});

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
function getContrastAdaptedColor(primaryHex, secondaryHex) {
  const getLuminance = (hex) => {
    if (!hex) return 0;
    let c = hex.replace('#', '');
    if (c.length === 3) {
      c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    }
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
  };
  
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
  const tierEl = cardEl.querySelector('#' + cardEl.id.charAt(0) + '-card-tier');
  
  const sinceLabelEl = cardEl.querySelector('#' + cardEl.id.charAt(0) + '-card-since-label');
  const predictionLabelEl = cardEl.querySelector('#' + cardEl.id.charAt(0) + '-card-prediction-label');
  
  const svgEl = cardEl.querySelector('.rainbow-svg');
  const legendContainer = cardEl.querySelector('.fcard-legend-container');
  
  // Sort teams: Highest score first (outermost/top bar)
  const sortedTeams = [...profile.teams].sort((a, b) => {
    return b.score - a.score;
  });
  
  // Set card border glow instantly to prevent layout jump
  cardEl.style.borderColor = profile.primaryColor;

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
    
    if (tierEl) {
      const tierVal = getDevotionTier(profile.overallScore);
      tierEl.textContent = tierVal;
      if (tierVal === 'MYTHIC') {
        tierEl.style.color = '#a855f7';
      } else if (tierVal === 'ALL-STAR') {
        tierEl.style.color = '#3b82f6';
      } else if (tierVal === 'PRO') {
        tierEl.style.color = '#10b981';
      } else {
        tierEl.style.color = 'var(--text-muted)';
      }
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
    
    // Update theme colors
    document.documentElement.style.setProperty('--team-primary', profile.primaryColor);
    document.documentElement.style.setProperty('--team-secondary', profile.secondaryColor);
    
    // Set glow container helper
    const glowBlob = document.querySelector('.glow-accent-blob');
    if (glowBlob) {
      glowBlob.style.backgroundColor = profile.primaryColor;
    }
  };

  if (transition) {
    const fadeEls = [archetypeEl, nameEl, sinceEl, predictionEl, tierEl, scoreEl, legendContainer, sinceLabelEl, predictionLabelEl].filter(Boolean);
    
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
  const sinceValid = !isNaN(sinceVal) && sinceVal >= 1900 && sinceVal <= 2026;

  if (league && teamId && sinceValid) {
    btnToQuiz.removeAttribute('disabled');
  } else {
    btnToQuiz.setAttribute('disabled', 'true');
  }
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
  checkBuilderInputsStatus();
});

if (bSinceInput) {
  bSinceInput.addEventListener('input', checkBuilderInputsStatus);
}

function updateSpotlight(teamId, league) {
  const spotlightLogo = document.getElementById('preview-spotlight-logo');
  const spotlightFallback = document.getElementById('preview-spotlight-logo-fallback');
  const spotlightName = document.getElementById('preview-spotlight-name');
  const spotlightContainer = document.getElementById('builder-spotlight');
  
  if (!league || !teamId) {
    spotlightFallback.style.display = 'block';
    spotlightLogo.style.display = 'none';
    spotlightName.textContent = 'Select a Team';
    spotlightContainer.style.borderColor = 'var(--border-color)';
    return;
  }
  
  const team = sportsData[league]?.teams.find(t => t.id === teamId);
  if (team) {
    spotlightFallback.style.display = 'none';
    spotlightLogo.src = team.logo;
    spotlightLogo.style.display = 'block';
    spotlightName.textContent = team.name;
    
    // Shift accents dynamically
    document.documentElement.style.setProperty('--team-primary', team.primary);
    document.documentElement.style.setProperty('--team-secondary', team.secondary);
    spotlightContainer.style.borderColor = team.primary;
  } else {
    spotlightFallback.style.display = 'block';
    spotlightLogo.style.display = 'none';
    spotlightName.textContent = 'Select a Team';
    spotlightContainer.style.borderColor = 'var(--border-color)';
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
  
  // Reset fields
  bSportSelect.value = "";
  bTeamSelect.innerHTML = '<option value="" disabled selected>Select Team</option>';
  bTeamSelect.setAttribute('disabled', 'true');
  if (bSinceInput) bSinceInput.value = "";
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
  
  // Set primary team theme color for quiz elements
  document.documentElement.style.setProperty('--team-primary', team.primaryColor);
  document.documentElement.style.setProperty('--team-secondary', team.secondaryColor);
  
  // Update progress bar
  quizProgressBarFill.style.width = `100%`;
  
  // Render questions
  quizQuestionsList.innerHTML = '';
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
  
  const inputContainer = document.createElement('div');
  inputContainer.className = 'prediction-input-container';
  
  const predInput = document.createElement('input');
  predInput.type = 'number';
  predInput.id = 'quiz-prediction-input';
  predInput.className = 'theme-number-input';
  predInput.min = '2026';
  predInput.max = '2050';
  predInput.placeholder = 'e.g. 2027';
  predInput.required = true;
  
  if (team.prediction) {
    predInput.value = team.prediction;
  }
  
  inputContainer.appendChild(predInput);
  predItem.appendChild(inputContainer);
  quizQuestionsList.appendChild(predItem);
  
  predInput.addEventListener('input', checkQuizAnswersStatus);
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
        ${team.isTop ? `<span class="hub-top-badge" style="background-color: ${adaptedColor}; color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 700; text-transform: uppercase;">Top Team</span>` : ''}
        <span class="builder-remove-btn" onclick="window.removeHubTeam('${team.id}')" title="Remove Team">&times;</span>
      </div>
    `;
    hubAddedTeamsList.appendChild(card);
  });
  
  // Set theme to matching top team
  const topTeam = selectedTeams.find(t => t.isTop);
  if (topTeam) {
    document.documentElement.style.setProperty('--team-primary', topTeam.primaryColor);
    document.documentElement.style.setProperty('--team-secondary', topTeam.secondaryColor);
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
  document.documentElement.style.setProperty('--team-primary', topTeam.primaryColor);
  document.documentElement.style.setProperty('--team-secondary', topTeam.secondaryColor);
  
  revealProgressFill.style.width = '0%';
  revealTicker.textContent = '00';
  
  // Calculate finished average overall score
  const otherTeams = selectedTeams.filter(t => !t.isTop);
  let finalScore = 0;
  if (otherTeams.length === 0) {
    finalScore = topTeam.score;
  } else {
    const avgOthers = otherTeams.reduce((sum, t) => sum + t.score, 0) / otherTeams.length;
    finalScore = Math.round(topTeam.score * 0.6 + avgOthers * 0.4);
  }
  
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
          colors: [topTeam.primaryColor, topTeam.secondaryColor, '#ffffff']
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
function setupStep5MainPage(finalScore) {
  const topTeam = selectedTeams.find(t => t.isTop) || selectedTeams[0];
  const tagline = generateSportsIdentityTagline();
  
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
  
  // Reset Form
  waitlistForm.reset();
  
  // Pre-fill name input
  if (fanNameInput) {
    fanNameInput.value = savedHandle;
  }
  
  // Render card
  updateCardDOM(document.getElementById('final-card'), userProfile, true);
  
  // Sync form modifications to live card front
  fanNameInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    savedHandle = val;
    const nameVal = val ? (val.startsWith('@') ? val : `@${val}`) : '@GUEST';
    document.getElementById('f-card-name').textContent = nameVal;
  });
  
  // Transition step
  goToStep(6);
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
    (ids.includes('chiefs') && ids.includes('raiders'))
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

  // 6. Highly Specific Team-Specific Tagline Matcher
  if (topTeam && teamSpecificPhrases[topTeam.id]) {
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
    if (topTeam.status === 'heartbreak' && topTeam.score >= 80) {
      return "The Heartbreak Specialist";
    }
    if (topTeam.status === 'champs' && topTeam.score >= 80) {
      return "The Glory Collector";
    }
    if (earliestSince < 2000 && topTeam.score >= 80) {
      return "Generational Guardian";
    }
    return "The Pure Loyalist";
  }

  // 9. Multisport & League Profiles (Fallbacks for multi-team profiles)
  if (uniqueLeagues.length === 1) {
    if (uniqueLeagues[0] === "mls") {
      return "Global Game Disciple";
    }
    if (uniqueLeagues[0] === "nfl") {
      return "Gridiron Analyst";
    }
    if (uniqueLeagues[0] === "nba") {
      return "Hardwood Obsessive";
    }
    if (uniqueLeagues[0] === "nhl") {
      return "Ice Hockey Purist";
    }
    if (uniqueLeagues[0] === "mlb") {
      return "Diamond Tactician";
    }
  }
  
  if (uniqueLeagues.length === 2) {
    return "Dual-Front Analyst";
  }
  if (uniqueLeagues.length === 3) {
    return "Tri-Arena Sage";
  }
  if (uniqueLeagues.length >= 4) {
    return "Omni-Sport Polymath";
  }

  return "Fandom Connoisseur";
}

// --- WAITLIST DATA AND FORM SUBMISSION ENGINE ---
function setupWaitlistBindings() {
  waitlistForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    if (selectedTeams.length === 0) {
      alert("Please add at least one team before completing your card.");
      return;
    }
    
    const topTeam = selectedTeams.find(t => t.isTop) || selectedTeams[0];
    const name = fanNameInput.value;
    const email = fanEmailInput.value;
    const since = topTeam.fanSince || 'N/A';
    const prediction = topTeam.prediction || 'N/A';
    
    if (!name || !email) {
      alert("Please fill in all required fields.");
      return;
    }
    
    // Construct database listing
    const teamsFormat = selectedTeams.map(t => `${t.name} (${t.league}) [Score: ${t.score}/100]${t.isTop ? ' *TOP*' : ''}`).join(', ');
    
    const waitlistEntry = {
      timestamp: new Date().toISOString(),
      name,
      email,
      teams: teamsFormat,
      prediction: `${topTeam.short} champion in ${prediction}`
    };
    
    let currentWaitlist = JSON.parse(localStorage.getItem('fanlog_waitlist') || '[]');
    const emailExists = currentWaitlist.some(entry => entry.email.toLowerCase() === email.toLowerCase());
    
    if (!emailExists) {
      currentWaitlist.push(waitlistEntry);
      localStorage.setItem('fanlog_waitlist', JSON.stringify(currentWaitlist));
    }
    
    // Show verified checkmark next to name
    const verifiedBadge = document.getElementById('f-card-verified-badge');
    if (verifiedBadge) {
      verifiedBadge.style.display = 'inline-block';
    }
    
    // Setup Card back fields
    const randomRegCode = Math.floor(1000 + Math.random() * 9000);
    fCardSerialBack.textContent = `FL-2026-WAIT-${randomRegCode}`;
    backValName.textContent = name.startsWith('@') ? name : `@${name}`;
    backValScore.textContent = document.getElementById('f-card-score').textContent;
    
    // Animate beautiful payoff
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
      colors: [topTeam.primaryColor, topTeam.secondaryColor, '#ffffff']
    });
    
    // Flip card around
    const cardScene = document.querySelector('.fcard-scene');
    if (cardScene) {
      cardScene.classList.add('flipped');
    }
  });
}

// Restart button
btnRestartFlow.addEventListener('click', () => {
  selectedTeams = [];
  userQuizAnswers = {};
  currentQuizTeamIndex = 0;
  
  // Unflip card
  const cardScene = document.querySelector('.fcard-scene');
  if (cardScene) {
    cardScene.classList.remove('flipped');
  }
  
  // Clear any inputs in Step 2
  if (bSinceInput) bSinceInput.value = "";
  
  goToStep(2);
});

// --- PNG EXPORT VIA HTML2CANVAS ---
btnDownloadPng.addEventListener('click', () => {
  const frontFace = document.getElementById('f-card-front-face');
  const cardElement = document.getElementById('final-card');
  
  // Temporarily flatten transforms and shadows to prevent glitching in screenshot
  const originalTransform = cardElement.style.transform;
  const originalBoxShadow = frontFace.style.boxShadow;
  
  cardElement.style.transform = 'none';
  frontFace.style.boxShadow = 'none';
  
  html2canvas(frontFace, {
    scale: 3,
    backgroundColor: null,
    useCORS: true,
    logging: false
  }).then(canvas => {
    // Restore styling
    cardElement.style.transform = originalTransform;
    frontFace.style.boxShadow = originalBoxShadow;
    
    // Download
    const nameFormatted = fanNameInput.value ? fanNameInput.value.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'guest';
    const topTeam = selectedTeams.find(t => t.isTop) || selectedTeams[0];
    const topTeamFormatted = topTeam ? topTeam.id : 'fandom';
    
    const link = document.createElement('a');
    link.download = `fanlog_index_${topTeamFormatted}_card_${nameFormatted}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }).catch(err => {
    console.error("PNG render failed:", err);
    alert("Could not generate card image. Please try again.");
    cardElement.style.transform = originalTransform;
    frontFace.style.boxShadow = originalBoxShadow;
  });
});

// --- SHARE ACTION HANDLERS ---
btnCopyLink.addEventListener('click', () => {
  const topTeam = selectedTeams.find(t => t.isTop) || selectedTeams[0];
  const tagline = generateSportsIdentityTagline();
  const shareText = `Just calculated my Fandom Index! Archetype: "${tagline}". Top Team: ${topTeam ? topTeam.name : 'sports'}. Calculate yours on FanLog: ${window.location.origin}`;
  
  navigator.clipboard.writeText(shareText).then(() => {
    const originalText = btnCopyLink.innerHTML;
    btnCopyLink.innerHTML = '<span>Link Copied!</span>';
    btnCopyLink.style.borderColor = '#10b981';
    btnCopyLink.style.color = '#10b981';
    
    setTimeout(() => {
      btnCopyLink.innerHTML = originalText;
      btnCopyLink.style.borderColor = '';
      btnCopyLink.style.color = '';
    }, 2000);
  }).catch(() => {
    alert("Here is your shareable link:\n\n" + shareText);
  });
});

// Mock Social Shares
const socialButtons = document.querySelectorAll('.social-share-horizontal .social-btn');
socialButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const platform = btn.getAttribute('data-platform');
    const tagline = generateSportsIdentityTagline();
    const shareMessage = `Fandom Index Profile: "${tagline}". Mapped my teams on @fanlog. Join the waitlist: ${window.location.origin}`;
    
    alert(`[MOCK SHARE] Sharing to ${platform}:\n\n"${shareMessage}"`);
  });
});

// --- EASTER EGG ADMIN PANEL MODAL ---
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
  const waitlist = JSON.parse(localStorage.getItem('fanlog_waitlist') || '[]');
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
  const waitlist = JSON.parse(localStorage.getItem('fanlog_waitlist') || '[]');
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
