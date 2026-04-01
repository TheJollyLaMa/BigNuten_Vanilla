/**
 * js/chakra.js
 * Data-Driven Chakra Glow & Aura Animations
 *
 * Reads health data from localStorage and animates each chakra on the
 * BigNuten body figure with proportional glow intensity, breathing pulse,
 * rotating halo ring, spark particles, and a body-aura canvas overlay.
 *
 * Public API:
 *   initChakraAura()    — call once from DOMContentLoaded
 *   refreshChakraAura() — call after any data save to detect activations
 */

// ── Chakra configuration ──────────────────────────────────────────────────
const CHAKRA_CONFIG = [
  {
    id: 'moon-icon',
    name: 'Crown',
    emoji: '👑',
    color: '#87fdb6',
    topPct: 9,
    activeDesc: 'Moon tracking — visited today ✅',
    partialDesc: 'Moon tracking — active streak 🌀',
    dormantDesc: 'Moon tracking — not visited today',
  },
  {
    id: 'graph-icon',
    name: 'Third Eye',
    emoji: '👁️',
    color: '#00e5ff',
    topPct: 14,
    activeDesc: 'Data richness — 3+ categories logged ✅',
    partialDesc: 'Data richness — some categories logged 🌀',
    dormantDesc: 'Data richness — log more categories',
  },
  {
    id: 'chakra-throat',
    name: 'Throat',
    emoji: '🔵',
    color: '#00bfff',
    topPct: 22,
    activeDesc: 'Hydration — 8/8 glasses ✅',
    partialDesc: 'Hydration — keep drinking 🌀',
    dormantDesc: 'Hydration — not yet',
  },
  {
    id: 'chakra-heart',
    name: 'Heart',
    emoji: '💚',
    color: '#00ff88',
    topPct: 30,
    activeDesc: 'Emotion — logged today ✅',
    partialDesc: 'Emotion — logged recently 🌀',
    dormantDesc: 'Emotion — not logged today',
  },
  {
    id: 'emotion-icon',
    name: 'Solar Plexus',
    emoji: '🌞',
    color: '#f4d03f',
    topPct: 36,
    activeDesc: 'Exercise — logged in last 24h ✅',
    partialDesc: 'Exercise — logged recently 🌀',
    dormantDesc: 'Exercise — not yet today',
  },
  {
    id: 'chakra-sacral',
    name: 'Sacral',
    emoji: '🟠',
    color: '#ff8c00',
    topPct: 44,
    activeDesc: 'Nutrition — food logged today ✅',
    partialDesc: 'Nutrition — logged yesterday 🌀',
    dormantDesc: 'Nutrition — not logged today',
  },
  {
    id: 'chakra-root',
    name: 'Root',
    emoji: '🔴',
    color: '#ff4444',
    topPct: 50,
    activeDesc: 'Weight — logged in last 7 days ✅',
    partialDesc: 'Weight — logged recently 🌀',
    dormantDesc: 'Weight — not logged recently',
  },
];

// ── LocalStorage keys (mirrored from app.js constants) ───────────────────
const STORAGE_KEY = 'fitnessTrackerData';
const WATER_KEY = 'waterTrackerData';
const WATER_HISTORY_KEY = 'waterDailyHistory';
const WATER_MAX = 8;
const CROWN_MODAL_KEY = 'chakraCrownLastOpened';
const CROWN_STREAK_KEY = 'chakraCrownStreak';
const CHAKRA_AURA_ENABLED_KEY = 'chakraAuraEnabled';

// ── Internal state ────────────────────────────────────────────────────────
let _prevScores = null;        // scores from the previous evaluation
let _auraRafHandle = null;     // requestAnimationFrame handle
let _auraIntervalId = null;    // setInterval handle for 60s re-evaluation
let _auraPhase = 0;            // breathing phase (0–2π)
let _canvasLastWidth = 0;
let _canvasLastHeight = 0;
let _latestScores = {};
let _refreshDebounceTimer = null; // debounce handle for refreshChakraAura

// ── Enable / disable helpers ──────────────────────────────────────────────

/** Returns true when the chakra aura feature is enabled (default: true). */
export function isChakraAuraEnabled() {
  const stored = localStorage.getItem(CHAKRA_AURA_ENABLED_KEY);
  return stored === null ? true : stored === 'true';
}

/** Persist the enabled/disabled preference and immediately update the UI. */
export function setChakraAuraEnabled(enabled) {
  localStorage.setItem(CHAKRA_AURA_ENABLED_KEY, String(enabled));
  if (enabled) {
    _enableAura();
  } else {
    _disableAura();
  }
}

function _enableAura() {
  const scores = computeChakraScores();
  _latestScores = scores;
  _prevScores = null;
  applyChakraStates(scores);
  startAuraLoop();
  // Re-evaluate every 60 seconds (guard against double-call)
  if (_auraIntervalId === null) {
    _auraIntervalId = setInterval(() => {
      const updated = computeChakraScores();
      _latestScores = updated;
      applyChakraStates(updated);
    }, 60_000);
  }
}

function _disableAura() {
  // Stop RAF loop
  if (_auraRafHandle !== null) {
    cancelAnimationFrame(_auraRafHandle);
    _auraRafHandle = null;
  }
  // Stop 60s interval
  if (_auraIntervalId !== null) {
    clearInterval(_auraIntervalId);
    _auraIntervalId = null;
  }
  // Clear canvas
  const canvas = document.getElementById('chakra-aura-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  // Remove all state classes and reset styles
  CHAKRA_CONFIG.forEach(cfg => {
    const el = document.getElementById(cfg.id);
    if (!el) return;
    el.classList.remove('chakra-active', 'chakra-partial', 'chakra-dormant', 'chakra-activating');
    el.style.removeProperty('--chakra-intensity');
  });
  // Remove bloom class
  const bgEl = document.getElementById('landing-bg');
  if (bgEl) bgEl.classList.remove('all-chakras-lit');
}

// ── Utility helpers ───────────────────────────────────────────────────────

function getTodayISO() {
  return new Date().toISOString().split('T')[0];
}

function safeParseJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

// ── Score computation ─────────────────────────────────────────────────────

/**
 * Compute a 0.0–1.0 intensity score for each chakra based on localStorage data.
 * @returns {{ [chakraId]: number }}
 */
export function computeChakraScores() {
  const today = getTodayISO();
  const now = Date.now();
  const data = safeParseJSON(STORAGE_KEY, {});

  // ── Crown: Moon modal opened today OR streak ≥ 3 ────────────────────────
  const crownScore = (() => {
    const lastOpened = localStorage.getItem(CROWN_MODAL_KEY);
    if (lastOpened === today) return 1.0;
    const streak = parseInt(localStorage.getItem(CROWN_STREAK_KEY) || '0', 10);
    if (streak >= 7) return 0.9;
    if (streak >= 3) return 0.75;
    if (streak >= 1) return 0.5;
    return 0.2;
  })();

  // ── Third Eye: categories active in past 14 days ─────────────────────────
  const thirdEyeScore = (() => {
    const cutoff = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
    const cutoffDate = cutoff.split('T')[0];
    let cats = 0;
    if ((data.weightLogs || []).some(e => (e.timestamp || '') >= cutoff)) cats++;
    if ((data.foods || []).some(e => (e.date || e.timestamp || '') >= cutoffDate)) cats++;
    if ((data.emotions || []).some(e => (e.timestamp || '') >= cutoff)) cats++;
    if ((data.exercises?.entries || []).some(e => (e.timestamp || '') >= cutoff)) cats++;
    if ((data.sessionLog || []).some(e => (e.start || e.end || '') >= cutoff)) cats++;
    if ((data.supplements || []).some(e => (e.timestamp || e.date || '') >= cutoffDate)) cats++;
    const waterHist = safeParseJSON(WATER_HISTORY_KEY, {});
    if (Object.keys(waterHist).some(d => d >= cutoffDate && waterHist[d] > 0)) cats++;

    if (cats >= 5) return 1.0;
    if (cats >= 3) return 0.75;
    if (cats >= 2) return 0.5;
    if (cats >= 1) return 0.2;
    return 0.0;
  })();

  // ── Throat: hydration today ──────────────────────────────────────────────
  const throatScore = (() => {
    const wd = safeParseJSON(WATER_KEY, { date: '', count: 0 });
    const count = (wd.date === today) ? (wd.count || 0) : 0;
    if (count >= WATER_MAX) return 1.0;
    if (count > 0) return Math.max(0.15, count / WATER_MAX);
    return 0.0;
  })();

  // ── Heart: emotion logged today ──────────────────────────────────────────
  const heartScore = (() => {
    const emotions = data.emotions || [];
    if (emotions.some(e => (e.timestamp || '').startsWith(today))) return 1.0;
    const cutoff3d = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    if (emotions.some(e => (e.timestamp || '') >= cutoff3d)) return 0.5;
    return 0.0;
  })();

  // ── Solar Plexus: exercise in last 24h ───────────────────────────────────
  const solarScore = (() => {
    const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const entries = data.exercises?.entries || [];
    const sessions = data.sessionLog || [];
    if (
      entries.some(e => (e.timestamp || '') >= cutoff24h) ||
      sessions.some(s => (s.end || s.start || '') >= cutoff24h)
    ) return 1.0;
    const cutoff3d = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    if (
      entries.some(e => (e.timestamp || '') >= cutoff3d) ||
      sessions.some(s => (s.start || '') >= cutoff3d)
    ) return 0.5;
    return 0.0;
  })();

  // ── Sacral: food logged today ────────────────────────────────────────────
  const sacralScore = (() => {
    const foods = data.foods || [];
    if (foods.some(e => (e.date || e.timestamp || '').startsWith(today))) return 1.0;
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    if (foods.some(e => (e.date || '').startsWith(yesterday))) return 0.5;
    return 0.0;
  })();

  // ── Root: weight logged in last 7 days ───────────────────────────────────
  const rootScore = (() => {
    const cutoff7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const logs = data.weightLogs || [];
    if (logs.some(e => (e.timestamp || '') >= cutoff7d)) return 1.0;
    const cutoff30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    if (logs.some(e => (e.timestamp || '') >= cutoff30d)) return 0.5;
    return 0.0;
  })();

  return {
    'moon-icon':     crownScore,
    'graph-icon':    thirdEyeScore,
    'chakra-throat': throatScore,
    'chakra-heart':  heartScore,
    'emotion-icon':  solarScore,
    'chakra-sacral': sacralScore,
    'chakra-root':   rootScore,
  };
}

// ── Tooltip ───────────────────────────────────────────────────────────────

function buildTooltip(cfg, score) {
  const waterCount = (() => {
    const wd = safeParseJSON(WATER_KEY, { date: '', count: 0 });
    return wd.date === getTodayISO() ? (wd.count || 0) : 0;
  })();

  let desc;
  if (cfg.id === 'chakra-throat') {
    desc = score >= 1.0
      ? `Hydration — ${waterCount}/${WATER_MAX} glasses ✅`
      : `Hydration — ${waterCount}/${WATER_MAX} glasses 🌀`;
  } else if (score >= 1.0) {
    desc = cfg.activeDesc;
  } else if (score >= 0.5) {
    desc = cfg.partialDesc;
  } else {
    desc = cfg.dormantDesc;
  }
  return `${cfg.emoji} ${cfg.name}: ${desc}`;
}

// ── Spark particles ───────────────────────────────────────────────────────

function spawnSparks(el, color) {
  const count = 4 + Math.floor(Math.random() * 3); // 4–6 sparks
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('span');
    spark.classList.add('chakra-spark');
    spark.style.color = color;
    spark.style.background = color;
    spark.style.boxShadow = `0 0 6px ${color}`;
    const dx = (Math.random() - 0.5) * 30; // –15 to +15 px
    spark.style.setProperty('--dx', `${dx}px`);
    spark.style.left = `${40 + Math.random() * 20}%`;
    spark.style.top = `${40 + Math.random() * 20}%`;
    el.appendChild(spark);
    spark.addEventListener('animationend', () => spark.remove(), { once: true });
  }
}

// ── State application ─────────────────────────────────────────────────────

function scoreToState(score) {
  if (score >= 0.75) return 'chakra-active';
  if (score >= 0.3)  return 'chakra-partial';
  return 'chakra-dormant';
}

function applyChakraStates(scores) {
  const allActive = CHAKRA_CONFIG.every(cfg => (scores[cfg.id] || 0) >= 0.75);
  const bgEl = document.getElementById('landing-bg');

  CHAKRA_CONFIG.forEach(cfg => {
    const el = document.getElementById(cfg.id);
    if (!el) return;

    const score = scores[cfg.id] ?? 0;
    const prev  = _prevScores ? (_prevScores[cfg.id] ?? 0) : null;
    const state = scoreToState(score);

    // Set CSS intensity variable
    el.style.setProperty('--chakra-intensity', score.toFixed(3));

    // Swap state classes
    el.classList.remove('chakra-active', 'chakra-partial', 'chakra-dormant');
    el.classList.add(state);

    // Detect activation transition (dormant/partial → active)
    if (prev !== null && prev < 0.75 && score >= 0.75) {
      el.classList.add('chakra-activating');
      spawnSparks(el, cfg.color);
      setTimeout(() => el.classList.remove('chakra-activating'), 700);
    }

    // Tooltip
    el.title = buildTooltip(cfg, score);
  });

  // "All Chakras Lit" full-body bloom
  if (bgEl) {
    bgEl.classList.toggle('all-chakras-lit', allActive);
  }

  // Store for next comparison
  _prevScores = { ...scores };
}

// ── Aura canvas ───────────────────────────────────────────────────────────

function syncCanvasSize(canvas, img) {
  const w = img.offsetWidth;
  const h = img.offsetHeight;
  if (w !== _canvasLastWidth || h !== _canvasLastHeight) {
    canvas.width = w;
    canvas.height = h;
    _canvasLastWidth = w;
    _canvasLastHeight = h;
  }
}

function drawAuraCanvas(scores) {
  const canvas = document.getElementById('chakra-aura-canvas');
  const img    = document.getElementById('landing-bg');
  if (!canvas || !img || !img.offsetWidth) return;

  syncCanvasSize(canvas, img);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const breathe = 0.5 + 0.5 * Math.sin(_auraPhase); // 0.0–1.0

  CHAKRA_CONFIG.forEach(cfg => {
    const score = scores[cfg.id] ?? 0;
    if (score <= 0) return;

    const x = canvas.width * 0.5;
    const y = canvas.height * (cfg.topPct / 100);
    const radius = 55 + 25 * score; // larger when active
    const alpha  = score * (0.35 + 0.2 * breathe);

    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0,   hexToRgba(cfg.color, alpha * 0.9));
    grad.addColorStop(0.5, hexToRgba(cfg.color, alpha * 0.4));
    grad.addColorStop(1,   hexToRgba(cfg.color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  });

  // Rainbow sweep when all lit
  const allActive = CHAKRA_CONFIG.every(cfg => (scores[cfg.id] || 0) >= 0.75);
  if (allActive) {
    const sweepOffset = _auraPhase / (Math.PI * 2); // 0.0–1.0
    const sweepY = canvas.height * (1 - sweepOffset); // sweeps upward
    const grad = ctx.createLinearGradient(0, sweepY - 40, 0, sweepY + 40);
    grad.addColorStop(0,   'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.07)');
    grad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// ── RAF breathing loop ────────────────────────────────────────────────────

function startAuraLoop() {
  if (_auraRafHandle !== null) return;

  let lastTime = 0;
  function frame(ts) {
    const dt = lastTime ? (ts - lastTime) / 1000 : 0;
    lastTime = ts;
    _auraPhase = (_auraPhase + dt * 0.6) % (Math.PI * 2); // ~0.6 rad/s → ~10.5s cycle
    drawAuraCanvas(_latestScores);
    _auraRafHandle = requestAnimationFrame(frame);
  }
  _auraRafHandle = requestAnimationFrame(frame);
}

// ── Crown modal tracking ──────────────────────────────────────────────────

function setupCrownTracking() {
  const moonIcon = document.getElementById('moon-icon');
  if (!moonIcon) return;

  // Track when moon modal is opened to credit crown chakra
  moonIcon.addEventListener('click', () => {
    localStorage.setItem(CROWN_MODAL_KEY, getTodayISO());
    updateLoginStreak();
  });
}

function updateLoginStreak() {
  const today = getTodayISO();
  const lastKey = 'chakraCrownLastStreak';
  const last = localStorage.getItem(lastKey);
  const streak = parseInt(localStorage.getItem(CROWN_STREAK_KEY) || '0', 10);

  if (last === today) return; // already counted today
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const newStreak = (last === yesterday) ? streak + 1 : 1;
  localStorage.setItem(CROWN_STREAK_KEY, String(newStreak));
  localStorage.setItem(lastKey, today);
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Initialise the chakra aura system. Call once from DOMContentLoaded.
 */
export function initChakraAura() {
  setupCrownTracking();

  // Re-sync canvas if window resizes (register regardless of enabled state)
  window.addEventListener('resize', () => {
    _canvasLastWidth = 0; // force resize on next draw
  });

  if (!isChakraAuraEnabled()) return; // feature is disabled — stay dormant
  _enableAura();
}

/**
 * Refresh chakra states after any data-save event.
 * Detects newly-activated chakras and plays activation animations.
 * Debounced to 300 ms to avoid thrashing on rapid sequential saves.
 */
export function refreshChakraAura() {
  if (!isChakraAuraEnabled()) return;
  if (_refreshDebounceTimer !== null) clearTimeout(_refreshDebounceTimer);
  _refreshDebounceTimer = setTimeout(() => {
    _refreshDebounceTimer = null;
    const scores = computeChakraScores();
    _latestScores = scores;
    applyChakraStates(scores);
  }, 300);
}
