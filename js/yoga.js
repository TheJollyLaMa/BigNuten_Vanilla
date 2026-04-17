// yoga.js — Yoga Flow Mode for BigNuten Workout Panel
// Provides a mindful yoga session with pose visuals, Sanskrit/Devanagari names,
// breathing animations, and automatic session logging.

import { getFitnessData, saveFitnessData } from './fitnessData.js';

const YOGA_POSES_KEY = 'yogaCustomPoses';

// ─── Starter Pose Sequence ────────────────────────────────────────────────────
const STARTER_POSES = [
  {
    id: 'tadasana',
    english: 'Mountain Pose',
    sanskrit: 'Tadasana',
    devanagari: 'ताडासन',
    duration: 60,
    breathCue: 'Stand tall • root down • rise like a mountain',
    svgKey: 'mountain',
    chakra: '#ffd700'
  },
  {
    id: 'adho-mukha-svanasana',
    english: 'Downward Dog',
    sanskrit: 'Adho Mukha Svanasana',
    devanagari: 'अधोमुखश्वानासन',
    duration: 60,
    breathCue: 'Exhale into the earth • lengthen your spine',
    svgKey: 'downdog',
    chakra: '#00e5ff'
  },
  {
    id: 'phalakasana',
    english: 'Plank Pose',
    sanskrit: 'Phalakasana',
    devanagari: 'फलकासन',
    duration: 30,
    breathCue: 'Strong and steady • breathe with purpose',
    svgKey: 'plank',
    chakra: '#ff6600'
  },
  {
    id: 'bhujangasana',
    english: 'Cobra',
    sanskrit: 'Bhujangasana',
    devanagari: 'भुजङ्गासन',
    duration: 45,
    breathCue: 'Rise with each inhale • open your heart',
    svgKey: 'cobra',
    chakra: '#00ff88'
  },
  {
    id: 'balasana',
    english: "Child's Pose",
    sanskrit: 'Balasana',
    devanagari: 'बालासन',
    duration: 60,
    breathCue: 'Surrender and rest • breathe into your back',
    svgKey: 'child',
    chakra: '#aa66ff'
  },
  {
    id: 'virabhadrasana-i',
    english: 'Warrior I',
    sanskrit: 'Virabhadrasana I',
    devanagari: 'वीरभद्रासन I',
    duration: 45,
    breathCue: 'Rise like a warrior • grounded and lifted',
    svgKey: 'warrior1',
    chakra: '#ff3d3d'
  },
  {
    id: 'virabhadrasana-ii',
    english: 'Warrior II',
    sanskrit: 'Virabhadrasana II',
    devanagari: 'वीरभद्रासन II',
    duration: 45,
    breathCue: 'Expand your wings • breathe into your power',
    svgKey: 'warrior2',
    chakra: '#ff9900'
  },
  {
    id: 'trikonasana',
    english: 'Triangle',
    sanskrit: 'Trikonasana',
    devanagari: 'त्रिकोणासन',
    duration: 45,
    breathCue: 'Side-body opens • breathe into space',
    svgKey: 'triangle',
    chakra: '#00ccff'
  },
  {
    id: 'paschimottanasana',
    english: 'Seated Forward Fold',
    sanskrit: 'Paschimottanasana',
    devanagari: 'पश्चिमोत्तानासन',
    duration: 60,
    breathCue: 'Fold inward • each exhale brings you deeper',
    svgKey: 'forwardfold',
    chakra: '#66ff99'
  },
  {
    id: 'setu-bandhasana',
    english: 'Bridge Pose',
    sanskrit: 'Setu Bandhasana',
    devanagari: 'सेतुबन्धासन',
    duration: 45,
    breathCue: 'Lift your heart to the sky • breathe into your chest',
    svgKey: 'bridge',
    chakra: '#ffcc00'
  },
  {
    id: 'supta-matsyendrasana',
    english: 'Supine Twist',
    sanskrit: 'Supta Matsyendrasana',
    devanagari: 'सुप्त मत्स्येन्द्रासन',
    duration: 60,
    breathCue: 'Wring out tension • release on each exhale',
    svgKey: 'supinetwist',
    chakra: '#cc44ff'
  },
  {
    id: 'savasana',
    english: 'Corpse Pose',
    sanskrit: 'Savasana',
    devanagari: 'शवासन',
    duration: 120,
    breathCue: 'Let go completely • breathe like the tide',
    svgKey: 'savasana',
    chakra: '#ffffff'
  }
];

// ─── SVG Pose Illustrations ───────────────────────────────────────────────────
// Simple evocative stick-figure art for each pose.
// Viewbox: 160×200, colors use chakra/gold tones on a transparent background.
function getPoseSVG(key, color = '#ffd700') {
  const c = color;
  const dim = 'width="160" height="200" viewBox="0 0 160 200"';
  const head = (cx, cy, r = 12) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="2.5"/>`;
  const line = (x1, y1, x2, y2) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>`;

  const glowFilter = `<defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

  const wrap = (content) =>
    `<svg ${dim} xmlns="http://www.w3.org/2000/svg" filter="url(#glow)">${glowFilter}<g opacity="0.95">${content}</g></svg>`;

  const svgs = {
    // Mountain Pose — standing tall, arms slightly at sides, palms forward
    mountain: wrap(
      head(80, 30) +
      line(80, 42, 80, 120) +          // spine
      line(80, 60, 50, 90) +           // L arm
      line(80, 60, 110, 90) +          // R arm
      line(80, 120, 55, 170) +         // L leg
      line(80, 120, 105, 170) +        // R leg
      line(55, 170, 50, 180) +         // L foot
      line(105, 170, 110, 180) +       // R foot
      // ground line
      `<line x1="30" y1="180" x2="130" y2="180" stroke="${c}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.4"/>`
    ),

    // Downward Dog — inverted V, hips up
    downdog: wrap(
      // hips up at 80,60; hands at 20,140; feet at 140,140
      `<circle cx="80" cy="50" r="12" fill="none" stroke="${c}" stroke-width="2.5"/>` +
      line(80, 62, 80, 100) +          // torso (diagonal spine)
      line(80, 100, 25, 145) +         // L arm to ground
      line(80, 100, 135, 145) +        // R arm to ground
      line(80, 100, 55, 150) +         // L leg
      line(80, 100, 105, 150) +        // R leg
      `<line x1="15" y1="155" x2="145" y2="155" stroke="${c}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.4"/>`
    ),

    // Plank — horizontal body, arms straight down
    plank: wrap(
      // body horizontal at y=100
      `<circle cx="25" cy="88" r="11" fill="none" stroke="${c}" stroke-width="2.5"/>` +
      line(36, 88, 135, 100) +         // spine horizontal
      line(55, 90, 50, 120) +          // L arm
      line(90, 94, 85, 124) +          // R arm
      line(120, 98, 115, 128) +        // L leg
      line(135, 100, 130, 130) +       // R leg
      `<line x1="35" y1="128" x2="145" y2="128" stroke="${c}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.4"/>`
    ),

    // Cobra — prone, upper body raised
    cobra: wrap(
      `<circle cx="80" cy="55" r="12" fill="none" stroke="${c}" stroke-width="2.5"/>` +
      line(80, 67, 80, 105) +          // spine curved up
      line(80, 80, 40, 105) +          // L arm
      line(80, 80, 120, 105) +         // R arm
      line(80, 105, 60, 155) +         // L leg (flat)
      line(80, 105, 100, 155) +        // R leg (flat)
      // curved ground hint
      `<path d="M 30 155 Q 80 160 130 155" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.4"/>`
    ),

    // Child's Pose — curled forward, arms extended, knees on floor
    child: wrap(
      // curled body: head at front low, hips at back
      `<circle cx="55" cy="140" r="11" fill="none" stroke="${c}" stroke-width="2.5"/>` +
      line(66, 140, 100, 115) +        // spine arching
      line(100, 115, 120, 105) +       // hips/back
      line(55, 148, 50, 162) +         // L arm forward (under head)
      line(55, 138, 25, 148) +         // R arm forward
      line(100, 115, 110, 145) +       // L knee down
      line(120, 105, 130, 135) +       // R knee down
      `<line x1="20" y1="162" x2="140" y2="162" stroke="${c}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.4"/>`
    ),

    // Warrior I — lunge, front knee bent, arms raised overhead
    warrior1: wrap(
      `<circle cx="80" cy="30" r="12" fill="none" stroke="${c}" stroke-width="2.5"/>` +
      line(80, 42, 80, 100) +          // torso
      line(80, 55, 65, 25) +           // L arm up
      line(80, 55, 95, 25) +           // R arm up
      line(80, 100, 55, 155) +         // L leg (front, bent)
      line(55, 155, 50, 178) +         // L shin
      line(80, 100, 115, 165) +        // R leg (back, straight)
      `<line x1="30" y1="178" x2="140" y2="178" stroke="${c}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.4"/>`
    ),

    // Warrior II — wide stance, arms out at shoulders
    warrior2: wrap(
      `<circle cx="80" cy="42" r="12" fill="none" stroke="${c}" stroke-width="2.5"/>` +
      line(80, 54, 80, 115) +          // torso
      line(80, 72, 18, 72) +           // L arm straight out
      line(80, 72, 142, 72) +          // R arm straight out
      line(80, 115, 45, 168) +         // L leg (front, bent at knee)
      line(45, 168, 38, 178) +         // L foot
      line(80, 115, 125, 168) +        // R leg (back, straighter)
      line(125, 168, 132, 178) +       // R foot
      `<line x1="18" y1="178" x2="142" y2="178" stroke="${c}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.4"/>`
    ),

    // Triangle — wide stance, side bend, one arm down/one up
    triangle: wrap(
      `<circle cx="65" cy="50" r="12" fill="none" stroke="${c}" stroke-width="2.5"/>` +
      line(65, 62, 60, 120) +          // torso side-bent
      line(60, 90, 15, 75) +           // L arm up overhead
      line(60, 90, 95, 138) +          // R arm down to ground
      line(60, 120, 30, 172) +         // L leg
      line(60, 120, 115, 168) +        // R leg (wide)
      line(30, 172, 22, 178) +         // L foot
      line(115, 168, 125, 178) +       // R foot
      `<line x1="15" y1="178" x2="140" y2="178" stroke="${c}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.4"/>`
    ),

    // Seated Forward Fold — seated, folding over legs
    forwardfold: wrap(
      `<circle cx="65" cy="100" r="12" fill="none" stroke="${c}" stroke-width="2.5"/>` +
      line(65, 112, 90, 130) +         // torso folding
      line(90, 120, 55, 108) +         // L arm along leg
      line(90, 120, 125, 135) +        // R arm along leg
      line(90, 130, 50, 145) +         // L leg extended
      line(90, 130, 128, 145) +        // R leg extended
      line(50, 145, 45, 158) +         // L foot
      line(128, 145, 132, 158) +       // R foot
      `<line x1="25" y1="158" x2="145" y2="158" stroke="${c}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.4"/>`
    ),

    // Bridge Pose — supine, hips lifted
    bridge: wrap(
      // head at left-low, hips elevated center
      `<circle cx="25" cy="145" r="11" fill="none" stroke="${c}" stroke-width="2.5"/>` +
      line(36, 145, 80, 120) +         // spine arching up
      line(80, 120, 130, 135) +        // hips to knees
      line(80, 120, 60, 155) +         // L arm flat on ground
      line(80, 120, 100, 155) +        // R arm flat on ground
      line(130, 135, 125, 160) +       // L shin down
      line(130, 135, 140, 160) +       // R shin down
      `<line x1="15" y1="163" x2="145" y2="163" stroke="${c}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.4"/>`
    ),

    // Supine Twist — lying, knees to one side
    supinetwist: wrap(
      `<circle cx="80" cy="70" r="12" fill="none" stroke="${c}" stroke-width="2.5"/>` +
      line(80, 82, 80, 128) +          // spine horizontal
      line(80, 100, 35, 100) +         // L arm out (T)
      line(80, 100, 125, 100) +        // R arm out (T) — rotated
      line(80, 128, 60, 155) +         // knees dropped left
      line(80, 128, 75, 160) +
      `<line x1="20" y1="165" x2="140" y2="165" stroke="${c}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.4"/>`
    ),

    // Corpse Pose — lying flat, arms away from body
    savasana: wrap(
      `<circle cx="28" cy="108" r="12" fill="none" stroke="${c}" stroke-width="2.5"/>` +
      line(40, 108, 138, 115) +        // spine horizontal
      line(75, 110, 70, 138) +         // L arm angled
      line(100, 112, 105, 140) +       // R arm angled
      line(125, 114, 118, 160) +       // L leg
      line(138, 115, 132, 160) +       // R leg
      line(118, 160, 112, 170) +       // L foot
      line(132, 160, 138, 170) +       // R foot
      // Stars/sparkles for savasana
      `<text x="60" y="60" font-size="10" fill="${c}" opacity="0.6">✦</text>` +
      `<text x="90" y="50" font-size="8" fill="${c}" opacity="0.5">✦</text>` +
      `<text x="110" y="65" font-size="6" fill="${c}" opacity="0.4">✦</text>` +
      `<line x1="15" y1="172" x2="145" y2="172" stroke="${c}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.4"/>`
    )
  };

  return svgs[key] || svgs.mountain;
}

// ─── State ────────────────────────────────────────────────────────────────────
let yogaSession = {
  active: false,
  paused: false,
  poses: [],
  currentIndex: 0,
  timerInterval: null,
  secondsLeft: 0,
  sessionStart: null,
  sessionId: null,
  completedPoses: []
};

// ─── Custom Pose Storage ──────────────────────────────────────────────────────
function loadCustomPoses() {
  try {
    return JSON.parse(localStorage.getItem(YOGA_POSES_KEY) || '[]');
  } catch { return []; }
}

function saveCustomPoses(poses) {
  localStorage.setItem(YOGA_POSES_KEY, JSON.stringify(poses));
}

function getActivePoses() {
  return [...STARTER_POSES, ...loadCustomPoses()];
}

// ─── Audio: gentle singing bowl tone ─────────────────────────────────────────
function playBowl(freq = 432, duration = 0.8) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn('AudioContext:', e);
  }
}

// ─── Breathing Animation ──────────────────────────────────────────────────────
let breathInterval = null;

function startBreathAnimation(color = '#ffd700') {
  const aura = document.getElementById('yoga-breath-aura');
  const label = document.getElementById('yoga-breath-label');
  if (!aura) return;
  aura.style.setProperty('--aura-color', color);
  stopBreathAnimation();

  const phases = [
    { text: 'Inhale…', class: 'inhale', duration: 4000 },
    { text: 'Hold…',   class: 'hold',   duration: 2000 },
    { text: 'Exhale…', class: 'exhale', duration: 6000 },
    { text: 'Hold…',   class: 'hold',   duration: 2000 }
  ];
  let phaseIndex = 0;
  function runPhase() {
    const phase = phases[phaseIndex % phases.length];
    if (label) label.textContent = phase.text;
    aura.className = 'yoga-aura ' + phase.class;
    phaseIndex++;
    breathInterval = setTimeout(runPhase, phase.duration);
  }
  runPhase();
}

function stopBreathAnimation() {
  if (breathInterval) { clearTimeout(breathInterval); breathInterval = null; }
  const aura = document.getElementById('yoga-breath-aura');
  if (aura) aura.className = 'yoga-aura';
}

// ─── Timer Formatting ─────────────────────────────────────────────────────────
function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ─── UI Renderers ─────────────────────────────────────────────────────────────
function renderPoseSequenceList() {
  const ul = document.getElementById('yoga-pose-sequence');
  if (!ul) return;
  ul.innerHTML = '';
  yogaSession.poses.forEach((pose, i) => {
    const li = document.createElement('li');
    li.className = 'yoga-seq-item';
    li.dataset.index = i;

    const durInput = document.createElement('input');
    durInput.type = 'number';
    durInput.min = 5;
    durInput.max = 600;
    durInput.value = pose.duration;
    durInput.className = 'yoga-dur-input';
    durInput.title = 'Seconds for this pose';
    durInput.addEventListener('change', () => {
      yogaSession.poses[i].duration = parseInt(durInput.value) || 60;
      updateEstimatedTime();
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'yoga-remove-btn';
    removeBtn.title = 'Remove pose';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      yogaSession.poses.splice(i, 1);
      renderPoseSequenceList();
      updateEstimatedTime();
    });

    li.innerHTML = `
      <span class="yoga-seq-num">${i + 1}</span>
      <span class="yoga-seq-names">
        <span class="yoga-seq-english">${pose.english}</span>
        <span class="yoga-seq-sanskrit">${pose.sanskrit}</span>
        <span class="yoga-seq-devanagari">${pose.devanagari}</span>
      </span>
    `;
    li.appendChild(durInput);
    li.appendChild(removeBtn);
    ul.appendChild(li);
  });
  updateEstimatedTime();
}

function renderActiveSequenceList() {
  const ul = document.getElementById('yoga-active-sequence');
  if (!ul) return;
  ul.innerHTML = '';
  yogaSession.poses.forEach((pose, i) => {
    const li = document.createElement('li');
    li.className = 'yoga-seq-item' + (i === yogaSession.currentIndex ? ' yoga-seq-active' : '');
    li.innerHTML = `
      <span class="yoga-seq-num">${i + 1}</span>
      <span class="yoga-seq-names">
        <span class="yoga-seq-english">${pose.english}</span>
        <span class="yoga-seq-sanskrit">${pose.sanskrit}</span>
        <span class="yoga-seq-devanagari">${pose.devanagari}</span>
      </span>
      <span class="yoga-seq-dur">${pose.duration}s</span>
    `;
    ul.appendChild(li);
  });
  ul.querySelectorAll('.yoga-seq-item')[yogaSession.currentIndex]
    ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function updateEstimatedTime() {
  const el = document.getElementById('yoga-est-time');
  if (!el) return;
  const total = yogaSession.poses.reduce((s, p) => s + (p.duration || 60), 0);
  el.textContent = `⏳ Est. session time: ${(total / 60).toFixed(1)} min`;
}

function showPose(pose) {
  const el = (id) => document.getElementById(id);
  if (!pose) return;

  // Visual
  const svgWrap = el('yoga-pose-svg');
  if (svgWrap) svgWrap.innerHTML = getPoseSVG(pose.svgKey, pose.chakra || '#ffd700');

  // Names
  if (el('yoga-pose-english'))    el('yoga-pose-english').textContent    = pose.english;
  if (el('yoga-pose-sanskrit'))   el('yoga-pose-sanskrit').textContent   = pose.sanskrit;
  if (el('yoga-pose-devanagari')) el('yoga-pose-devanagari').textContent = pose.devanagari;
  if (el('yoga-breath-cue'))      el('yoga-breath-cue').textContent      = pose.breathCue;

  // Aura color
  const aura = el('yoga-breath-aura');
  if (aura) aura.style.setProperty('--aura-color', pose.chakra || '#ffd700');

  // Update active-sequence list highlighting
  renderActiveSequenceList();

  // Restart breath animation with pose color
  startBreathAnimation(pose.chakra || '#ffd700');
}

function showTransition(fromPose, toPose, seconds, onDone) {
  const overlay = document.getElementById('yoga-transition-overlay');
  const txt = document.getElementById('yoga-transition-text');
  const count = document.getElementById('yoga-transition-count');
  if (!overlay) { onDone(); return; }

  if (txt) txt.textContent = toPose
    ? `Coming: ${toPose.english} — ${toPose.sanskrit}`
    : 'Session Complete 🙏';
  overlay.classList.remove('hidden');

  let s = seconds;
  if (count) count.textContent = s;
  playBowl(396, 1.5);

  const iv = setInterval(() => {
    s--;
    if (count) count.textContent = s;
    if (s <= 0) {
      clearInterval(iv);
      overlay.classList.add('hidden');
      onDone();
    }
  }, 1000);
}

// ─── Session Timer ────────────────────────────────────────────────────────────
function startPoseTimer() {
  const pose = yogaSession.poses[yogaSession.currentIndex];
  if (!pose) return;

  yogaSession.secondsLeft = pose.duration;
  showPose(pose);

  const display = document.getElementById('yoga-timer-display');
  const progressBar = document.getElementById('yoga-progress-bar');
  const countEl = document.getElementById('yoga-pose-count');

  if (countEl) countEl.textContent =
    `Pose ${yogaSession.currentIndex + 1} of ${yogaSession.poses.length}`;

  if (yogaSession.timerInterval) clearInterval(yogaSession.timerInterval);
  yogaSession.timerInterval = setInterval(() => {
    if (yogaSession.paused) return;
    yogaSession.secondsLeft--;

    if (display) display.textContent = fmtTime(yogaSession.secondsLeft);
    if (progressBar) {
      const pct = 100 - (yogaSession.secondsLeft / pose.duration) * 100;
      progressBar.style.width = `${pct}%`;
      progressBar.style.background =
        `linear-gradient(90deg, ${pose.chakra || '#ffd700'}, #fff2)`;
    }

    if (yogaSession.secondsLeft <= 5 && yogaSession.secondsLeft > 0) {
      playBowl(528 + yogaSession.secondsLeft * 10, 0.4);
    }

    if (yogaSession.secondsLeft <= 0) {
      clearInterval(yogaSession.timerInterval);
      yogaSession.timerInterval = null;

      // Log this pose
      yogaSession.completedPoses.push({
        pose: pose.id,
        english: pose.english,
        sanskrit: pose.sanskrit,
        devanagari: pose.devanagari,
        duration: pose.duration,
        completedAt: new Date().toISOString()
      });

      // Advance or end
      const isLast = yogaSession.currentIndex >= yogaSession.poses.length - 1;
      if (isLast) {
        endYogaSession(true);
      } else {
        const next = yogaSession.poses[yogaSession.currentIndex + 1];
        showTransition(pose, next, 5, () => {
          yogaSession.currentIndex++;
          startPoseTimer();
        });
      }
    }
  }, 1000);
}

function endYogaSession(completed = false) {
  stopBreathAnimation();
  if (yogaSession.timerInterval) {
    clearInterval(yogaSession.timerInterval);
    yogaSession.timerInterval = null;
  }

  const end = new Date().toISOString();
  const totalSeconds = yogaSession.completedPoses.reduce((s, p) => s + (p.duration || 0), 0);

  const sessionEntry = {
    sessionId: yogaSession.sessionId,
    type: 'yoga',
    start: yogaSession.sessionStart,
    end,
    totalWorkSeconds: totalSeconds,
    totalRestSeconds: 0,
    totalSetsCompleted: yogaSession.completedPoses.length,
    completed,
    yogaPoses: yogaSession.completedPoses
  };

  try {
    const data = getFitnessData();
    if (!Array.isArray(data.sessionLog)) data.sessionLog = [];
    data.sessionLog.push(sessionEntry);
    saveFitnessData(data);
  } catch (e) {
    console.error('Yoga session log error:', e);
  }

  yogaSession.active = false;
  yogaSession.paused = false;

  // Show completion screen
  const activeScreen = document.getElementById('yoga-active-screen');
  const completeScreen = document.getElementById('yoga-complete-screen');
  if (activeScreen) activeScreen.classList.add('hidden');
  if (completeScreen) completeScreen.classList.remove('hidden');

  const statsEl = document.getElementById('yoga-complete-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="yoga-stat">🧘 <strong>${yogaSession.completedPoses.length}</strong> poses</div>
      <div class="yoga-stat">⏱️ <strong>${(totalSeconds / 60).toFixed(1)}</strong> minutes</div>
      <div class="yoga-stat">🙏 ${completed ? 'Full session complete!' : 'Session ended early'}</div>
    `;
  }

  const poseList = document.getElementById('yoga-complete-poses');
  if (poseList) {
    poseList.innerHTML = yogaSession.completedPoses.map(p =>
      `<li><span class="yc-eng">${p.english}</span> <span class="yc-skt">${p.sanskrit}</span> <span class="yc-dev">${p.devanagari}</span> <span class="yc-dur">${p.duration}s</span></li>`
    ).join('');
  }

  playBowl(432, 3);
}

// ─── Start / Pause / Skip / End Controls ─────────────────────────────────────
function startYogaSession() {
  yogaSession.poses = getActivePoses().map(p => ({ ...p }));
  yogaSession.currentIndex = 0;
  yogaSession.completedPoses = [];
  yogaSession.sessionStart = new Date().toISOString();
  yogaSession.sessionId = `YOGA-${Date.now()}`;
  yogaSession.active = true;
  yogaSession.paused = false;

  const setupScreen = document.getElementById('yoga-setup-screen');
  const activeScreen = document.getElementById('yoga-active-screen');
  const completeScreen = document.getElementById('yoga-complete-screen');
  if (setupScreen) setupScreen.classList.add('hidden');
  if (activeScreen) activeScreen.classList.remove('hidden');
  if (completeScreen) completeScreen.classList.add('hidden');

  renderActiveSequenceList();

  // 5 second intro transition
  const first = yogaSession.poses[0];
  showTransition(null, first, 5, () => startPoseTimer());
}

function pauseYogaSession() {
  if (!yogaSession.active) return;
  yogaSession.paused = !yogaSession.paused;
  const btn = document.getElementById('yoga-pause-btn');
  if (btn) btn.textContent = yogaSession.paused ? '▶ Resume' : '⏸ Pause';
  if (yogaSession.paused) stopBreathAnimation();
  else startBreathAnimation(yogaSession.poses[yogaSession.currentIndex]?.chakra || '#ffd700');
}

function skipYogaPose() {
  if (!yogaSession.active) return;
  if (yogaSession.timerInterval) {
    clearInterval(yogaSession.timerInterval);
    yogaSession.timerInterval = null;
  }
  const pose = yogaSession.poses[yogaSession.currentIndex];
  if (pose) {
    yogaSession.completedPoses.push({
      pose: pose.id,
      english: pose.english,
      sanskrit: pose.sanskrit,
      devanagari: pose.devanagari,
      duration: pose.duration - yogaSession.secondsLeft,
      completedAt: new Date().toISOString(),
      skipped: true
    });
  }

  const isLast = yogaSession.currentIndex >= yogaSession.poses.length - 1;
  if (isLast) {
    endYogaSession(false);
  } else {
    const next = yogaSession.poses[yogaSession.currentIndex + 1];
    yogaSession.currentIndex++;
    showTransition(pose, next, 3, () => startPoseTimer());
  }
}

// ─── Add Custom Pose ──────────────────────────────────────────────────────────
function handleAddCustomPose(e) {
  e.preventDefault();
  const name = document.getElementById('yoga-custom-english')?.value?.trim();
  const sanskrit = document.getElementById('yoga-custom-sanskrit')?.value?.trim();
  const devanagari = document.getElementById('yoga-custom-devanagari')?.value?.trim();
  const duration = parseInt(document.getElementById('yoga-custom-duration')?.value || '60');

  if (!name) { alert('Please enter a pose name.'); return; }

  const custom = loadCustomPoses();
  const id = 'custom-' + Date.now();
  custom.push({
    id,
    english: name,
    sanskrit: sanskrit || name,
    devanagari: devanagari || '—',
    duration,
    breathCue: 'Breathe fully • find your own rhythm',
    svgKey: 'mountain',
    chakra: '#00ffcc',
    custom: true
  });
  saveCustomPoses(custom);

  // Reset form
  ['yoga-custom-english', 'yoga-custom-sanskrit', 'yoga-custom-devanagari'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const dur = document.getElementById('yoga-custom-duration');
  if (dur) dur.value = '60';

  // Refresh list
  yogaSession.poses = getActivePoses().map(p => ({ ...p }));
  renderPoseSequenceList();
  alert(`✅ "${name}" added to your flow!`);
}

// ─── Open/Close Modal ─────────────────────────────────────────────────────────
export function openYogaModal() {
  const modal = document.getElementById('yoga-flow-modal');
  if (!modal) return;
  modal.classList.remove('modal-hidden');

  // Reset to setup screen
  document.getElementById('yoga-setup-screen')?.classList.remove('hidden');
  document.getElementById('yoga-active-screen')?.classList.add('hidden');
  document.getElementById('yoga-complete-screen')?.classList.add('hidden');

  // Load poses for this session
  yogaSession.poses = getActivePoses().map(p => ({ ...p }));
  yogaSession.active = false;
  yogaSession.paused = false;
  renderPoseSequenceList();

  // Show preview of first pose (breath animation starts gently)
  if (yogaSession.poses[0]) showPose(yogaSession.poses[0]);
}

export function closeYogaModal() {
  const modal = document.getElementById('yoga-flow-modal');
  if (!modal) return;
  if (yogaSession.active) {
    const sure = confirm('End yoga session?');
    if (!sure) return;
    endYogaSession(false);
  }
  modal.classList.add('modal-hidden');
  stopBreathAnimation();
  if (yogaSession.timerInterval) {
    clearInterval(yogaSession.timerInterval);
    yogaSession.timerInterval = null;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initYogaFlow() {
  // Open modal button (in workout panel)
  document.getElementById('yoga-flow-btn')?.addEventListener('click', openYogaModal);

  // Close button
  document.getElementById('yoga-close-btn')?.addEventListener('click', closeYogaModal);

  // Click backdrop to close (if not active)
  document.getElementById('yoga-flow-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'yoga-flow-modal') closeYogaModal();
  });

  // Start session
  document.getElementById('yoga-start-btn')?.addEventListener('click', startYogaSession);

  // Pause/Resume
  document.getElementById('yoga-pause-btn')?.addEventListener('click', pauseYogaSession);

  // Skip pose
  document.getElementById('yoga-skip-btn')?.addEventListener('click', skipYogaPose);

  // End session early
  document.getElementById('yoga-end-btn')?.addEventListener('click', () => {
    if (confirm('End yoga session now?')) endYogaSession(false);
  });

  // Return to setup from complete screen
  document.getElementById('yoga-reset-btn')?.addEventListener('click', () => {
    document.getElementById('yoga-setup-screen')?.classList.remove('hidden');
    document.getElementById('yoga-complete-screen')?.classList.add('hidden');
    yogaSession.poses = getActivePoses().map(p => ({ ...p }));
    yogaSession.currentIndex = 0;
    yogaSession.completedPoses = [];
    yogaSession.active = false;
    renderPoseSequenceList();
    if (yogaSession.poses[0]) showPose(yogaSession.poses[0]);
  });

  // Add custom pose form
  document.getElementById('yoga-add-pose-form')?.addEventListener('submit', handleAddCustomPose);

  // Remove all custom poses
  document.getElementById('yoga-clear-custom-btn')?.addEventListener('click', () => {
    if (confirm('Remove all custom poses?')) {
      saveCustomPoses([]);
      yogaSession.poses = getActivePoses().map(p => ({ ...p }));
      renderPoseSequenceList();
    }
  });

  // Initialize pose preview
  yogaSession.poses = getActivePoses().map(p => ({ ...p }));
}
