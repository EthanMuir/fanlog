import { sportsData } from './teams.js';
import confetti from 'canvas-confetti';
import html2canvas from 'html2canvas';
import { HubSDK } from '@hodgepodge73/hub-sdk';

HubSDK.init({
  appSlug: 'fanlog',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

// --- STATE MANAGEMENT ---
let selectedTeams = [];
let currentQuizTeamIndex = 0;
let userQuizAnswers = {}; // key: "teamId_questionKey", value: score
let activeMorphIndex = 0;
let morphIntervalId = null;

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
  
  const name = sampleHandles[Math.floor(Math.random() * sampleHandles.length)];
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

// --- QUIZ QUESTIONS DATABASE ---
const quizQuestions = [
  {
    key: 'frequency',
    text: 'How frequently do you watch or listen to their games?',
    options: [
      { text: 'Highlights only / major games', score: 10 },
      { text: 'About half the games', score: 18 },
      { text: 'Almost every single game', score: 25 },
      { text: '100% of matches live or recorded', score: 30 }
    ]
  },
  {
    key: 'losses',
    text: 'How long does a tough loss affect your mood?',
    options: [
      { text: 'Minutes (It’s just a game)', score: 5 },
      { text: 'A few hours (Annoyed but fine)', score: 12 },
      { text: 'Until the next day (Ruins my evening)', score: 20 },
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
      { text: 'Die-hard defender energy', score: 20 }
    ]
  },
  {
    key: 'gear',
    text: 'What is your team gear collection like?',
    options: [
      { text: 'None / digital fan only', score: 5 },
      { text: 'A cap or a t-shirt', score: 12 },
      { text: 'Multiple jerseys & memorabilia', score: 20 },
      { text: 'Full home shrine / game-worn items', score: 25 }
    ]
  }
];

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
const bAddTeamBtn = document.getElementById('b-add-team-btn');
const bAddedTeamsList = document.getElementById('b-added-teams-list');

// Step 3 Quiz
const quizProgressText = document.getElementById('quiz-progress-text');
const quizTeamName = document.getElementById('quiz-team-name');
const quizProgressBarFill = document.getElementById('quiz-progress-bar-fill');
const quizQuestionsList = document.getElementById('quiz-questions-list');

// Step 4 Reveal
const revealProgressFill = document.getElementById('reveal-progress-fill');
const revealTicker = document.getElementById('reveal-ticker');

// Step 5 Main Profile / Waitlist Inputs
const waitlistForm = document.getElementById('fan-card-form');
const fanNameInput = document.getElementById('fan-name');
const fanEmailInput = document.getElementById('fan-email');
const fanSinceInput = document.getElementById('fan-since');
const predictionInput = document.getElementById('prediction-year');

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
});

// --- STEP VISIBILITY CONTROLLER ---
function goToStep(stepIndex) {
  const steps = [
    document.getElementById('step-welcome'),
    document.getElementById('step-builder'),
    document.getElementById('step-quiz'),
    document.getElementById('step-reveal'),
    document.getElementById('step-main')
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

  // Handle calculation reveal sequence
  if (stepIndex === 4) {
    runRevealSequence();
  }

  // Header button visibility control
  const headerCta = document.getElementById('header-cta-container');
  if (stepIndex === 5) {
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
  const statusEl = cardEl.querySelector('#' + cardEl.id.charAt(0) + '-card-status');
  
  const sinceLabelEl = cardEl.querySelector('#' + cardEl.id.charAt(0) + '-card-since-label');
  const predictionLabelEl = cardEl.querySelector('#' + cardEl.id.charAt(0) + '-card-prediction-label');
  
  const svgEl = cardEl.querySelector('.rainbow-svg');
  const legendContainer = cardEl.querySelector('.fcard-legend-container');
  
  // Sort teams: Top team outermost (index 0)
  const sortedTeams = [...profile.teams].sort((a, b) => {
    if (a.isTop && !b.isTop) return -1;
    if (!a.isTop && b.isTop) return 1;
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
    
    if (statusEl) {
      statusEl.textContent = profile.status || 'UNVERIFIED';
      if (profile.status === 'VERIFIED') {
        statusEl.style.color = '#10b981';
      } else if (profile.status === 'SAMPLE') {
        statusEl.style.color = 'var(--team-secondary)';
      } else {
        statusEl.style.color = 'var(--text-muted)';
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
    const fadeEls = [archetypeEl, nameEl, sinceEl, predictionEl, statusEl, scoreEl, legendContainer, sinceLabelEl, predictionLabelEl].filter(Boolean);
    
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
});

// Selector adapts preview spotlight instantly
bTeamSelect.addEventListener('change', (e) => {
  const league = bSportSelect.value;
  const teamId = e.target.value;
  updateSpotlight(teamId, league);
});

function updateSpotlight(teamId, league) {
  const spotlightLogo = document.getElementById('preview-spotlight-logo');
  const spotlightFallback = document.getElementById('preview-spotlight-logo-fallback');
  const spotlightName = document.getElementById('preview-spotlight-name');
  const spotlightContainer = document.getElementById('builder-spotlight');
  
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

bAddTeamBtn.addEventListener('click', () => {
  const league = bSportSelect.value;
  const teamId = bTeamSelect.value;
  
  if (!league || !teamId) {
    alert("Please select both a League and a Team.");
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
    score: 0
  };
  
  selectedTeams.push(newTeam);
  
  // Reset fields
  bSportSelect.value = "";
  bTeamSelect.innerHTML = '<option value="" disabled selected>Select Team</option>';
  bTeamSelect.setAttribute('disabled', 'true');
  
  updateSpotlight(null, null);
  updateBuilderUI();
});

function updateBuilderUI() {
  bAddedTeamsList.innerHTML = '';
  
  if (selectedTeams.length === 0) {
    bAddedTeamsList.innerHTML = '<div class="no-teams-placeholder">No teams added yet. Select a team above to start.</div>';
    btnToQuiz.setAttribute('disabled', 'true');
    return;
  }
  
  btnToQuiz.removeAttribute('disabled');
  
  selectedTeams.forEach(team => {
    const row = document.createElement('div');
    row.className = `builder-team-row ${team.isTop ? 'top-team-active' : ''}`;
    row.innerHTML = `
      <div class="builder-team-left">
        <img class="builder-team-logo" src="${team.logo}" alt="${team.name}" crossorigin="anonymous">
        <div class="builder-team-info">
          <span class="builder-team-name">${team.name}</span>
          <span class="builder-team-league">${team.league}</span>
        </div>
      </div>
      <div class="builder-team-actions">
        <label class="builder-top-radio">
          <input type="radio" name="builder-top-team" ${team.isTop ? 'checked' : ''} onchange="window.setBuilderTopTeam('${team.id}')">
          <span class="builder-radio-circle"></span>
          <span>Top</span>
        </label>
        <span class="builder-remove-btn" onclick="window.removeBuilderTeam('${team.id}')" title="Remove Team">&times;</span>
      </div>
    `;
    bAddedTeamsList.appendChild(row);
  });
  
  // Set theme to matching top team
  const topTeam = selectedTeams.find(t => t.isTop);
  if (topTeam) {
    document.documentElement.style.setProperty('--team-primary', topTeam.primaryColor);
    document.documentElement.style.setProperty('--team-secondary', topTeam.secondaryColor);
  }
}

// Bind to window for inline calls
window.setBuilderTopTeam = (teamId) => {
  selectedTeams.forEach(t => {
    t.isTop = (t.id === teamId);
  });
  updateBuilderUI();
};

window.removeBuilderTeam = (teamId) => {
  const teamToRemove = selectedTeams.find(t => t.id === teamId);
  const wasTop = teamToRemove ? teamToRemove.isTop : false;
  selectedTeams = selectedTeams.filter(t => t.id !== teamId);
  if (wasTop && selectedTeams.length > 0) {
    selectedTeams[0].isTop = true;
  }
  updateBuilderUI();
};

btnToQuiz.addEventListener('click', () => {
  if (selectedTeams.length === 0) return;
  currentQuizTeamIndex = 0;
  userQuizAnswers = {};
  goToStep(3);
  renderQuizForCurrentTeam();
});

// --- STEP 3: QUIZ RENDER & METRICS ---
function renderQuizForCurrentTeam() {
  const team = selectedTeams[currentQuizTeamIndex];
  if (!team) return;
  
  // Dynamic header styles
  quizProgressText.textContent = `TEAM ${currentQuizTeamIndex + 1} OF ${selectedTeams.length}`;
  quizTeamName.textContent = team.name;
  
  // Set primary team theme color for quiz elements
  document.documentElement.style.setProperty('--team-primary', team.primaryColor);
  document.documentElement.style.setProperty('--team-secondary', team.secondaryColor);
  
  // Update progress bar
  const progressPercent = (currentQuizTeamIndex / selectedTeams.length) * 100;
  quizProgressBarFill.style.width = `${progressPercent}%`;
  
  // Render questions
  quizQuestionsList.innerHTML = '';
  btnQuizNext.setAttribute('disabled', 'true');
  
  if (currentQuizTeamIndex === selectedTeams.length - 1) {
    btnQuizNext.textContent = 'Finish & Reveal Fandom Index';
  } else {
    btnQuizNext.textContent = 'Next Team';
  }
  
  quizQuestions.forEach(q => {
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
}

function checkQuizAnswersStatus() {
  const team = selectedTeams[currentQuizTeamIndex];
  const allAnswered = quizQuestions.every(q => {
    const answerKey = `${team.id}_${q.key}`;
    return typeof userQuizAnswers[answerKey] === 'number';
  });
  
  if (allAnswered) {
    btnQuizNext.removeAttribute('disabled');
  } else {
    btnQuizNext.setAttribute('disabled', 'true');
  }
}

btnQuizNext.addEventListener('click', () => {
  const team = selectedTeams[currentQuizTeamIndex];
  
  // Calculate total score out of 100 for current team
  let totalScore = 0;
  quizQuestions.forEach(q => {
    const answerKey = `${team.id}_${q.key}`;
    totalScore += userQuizAnswers[answerKey] || 0;
  });
  
  team.score = totalScore;
  
  currentQuizTeamIndex++;
  if (currentQuizTeamIndex < selectedTeams.length) {
    renderQuizForCurrentTeam();
    quizQuestionsList.scrollTop = 0;
  } else {
    // Go to Step 4 Reveal Screen
    goToStep(4);
  }
});

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
  
  // Form profile object
  const userProfile = {
    name: "@GUEST",
    tagline: tagline,
    overallScore: finalScore,
    since: "----",
    prediction: "----",
    status: "UNVERIFIED",
    primaryColor: topTeam.primaryColor,
    secondaryColor: topTeam.secondaryColor,
    teams: selectedTeams
  };
  
  // Reset Form
  waitlistForm.reset();
  
  // Render card
  updateCardDOM(document.getElementById('final-card'), userProfile, true);
  
  // Sync form modifications to live card front
  fanNameInput.addEventListener('input', (e) => {
    const nameVal = e.target.value ? (e.target.value.startsWith('@') ? e.target.value : `@${e.target.value}`) : '@GUEST';
    document.getElementById('f-card-name').textContent = nameVal;
  });
  
  fanSinceInput.addEventListener('input', (e) => {
    document.getElementById('f-card-since').textContent = e.target.value || '----';
  });
  
  predictionInput.addEventListener('input', (e) => {
    document.getElementById('f-card-prediction').textContent = e.target.value || '----';
  });
  
  // Transition step
  goToStep(5);
}

// --- DYNAMIC SPORTS IDENTITY TAGLINE ENGINE ---
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

  // 1. Specific City Pride Checks (Toronto, Boston, NY, LA)
  const isCity = (cityName) => teams.every(t => t.city && t.city.toLowerCase() === cityName.toLowerCase());
  
  if (count >= 2) {
    if (isCity("toronto")) {
      return "The Six Supporter";
    }
    if (isCity("boston")) {
      return "Title Town Patriot";
    }
    if (isCity("new york")) {
      return "Empire State Fanatic";
    }
    if (isCity("los angeles")) {
      return "Angelenos Devotee";
    }
  }

  // 2. Score Gaps & Devotion Profiles
  const scores = teams.map(t => t.score);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  
  if (count >= 2) {
    // Large gap: Top team is extremely high, others are very low
    if (topTeam.score >= 92 && otherTeams.every(t => t.score < 55)) {
      return "Monogamous Devotee";
    }
    // High-roller: all teams are 90+
    if (teams.every(t => t.score >= 90)) {
      return "Uncompromising Zealot";
    }
    // Casuals: all teams are 60 or below
    if (teams.every(t => t.score <= 60)) {
      return "Passive Enthusiast";
    }
    // Equal devotion: all scores are very close
    if (maxScore - minScore <= 8) {
      return "Equal-Opportunity Fan";
    }
  }

  // 3. Rivals Check (Same-league rivalries)
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

  // 4. Multisport & League Profiles
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
  }
  
  if (uniqueLeagues.length === 2) {
    return "Dual-Sport Specialist";
  }
  if (uniqueLeagues.length === 3) {
    return "Tri-Sport Authority";
  }
  if (uniqueLeagues.length >= 4) {
    return "Omni-Sport Polymath";
  }

  // 5. Solo Teams
  if (count === 1) {
    if (topTeam.id === 'leafs' && topTeam.score >= 90) {
      return "Toronto Sports Martyr";
    }
    if (topTeam.status === 'heartbreak' && topTeam.score >= 80) {
      return "The Heartbreak Specialist";
    }
    if (topTeam.status === 'champs' && topTeam.score >= 80) {
      return "The Glory Collector";
    }
    return "The Pure Loyalist";
  }

  // 6. Generic fallbacks
  if (uniqueCities.length === 1) {
    return "Hometown Hero";
  }
  if (avgIntensity >= 4.5) {
    return "The Obsessive Fanatic";
  }
  if (avgIntensity <= 1.8) {
    return "Fairweather Observer";
  }
  if (count >= 3 && uniqueCities.length === count) {
    return "Coast-to-Coast Analyst";
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
    const since = fanSinceInput.value || 'N/A';
    const prediction = predictionInput.value;
    
    if (!name || !email || !prediction || !since) {
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
    
    // Update card front status text
    const statusValFront = document.getElementById('f-card-status');
    if (statusValFront) {
      statusValFront.textContent = 'VERIFIED';
      statusValFront.style.color = '#10b981';
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
  
  // Reset back to Step 2 Team Builder
  updateBuilderUI();
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
