/**
 * feelingsWheel.js
 * Interactive 3-ring Plutchik-inspired Feelings/Emotion Wheel
 * Handles: SVG rendering, one-click logging, post-workout prompts,
 * analytics (pie chart + stats), emoji cloud, streaks.
 */

const STORAGE_KEY = 'fitnessTrackerData';

// ─── Emotion Data ────────────────────────────────────────────────────────────
// 8 base Plutchik emotions + 2 rings of secondary / tertiary emotions
const BASE_EMOTIONS = [
  { label: 'Joy',          color: '#f4d03f', emoji: '😄' },
  { label: 'Trust',        color: '#27ae60', emoji: '🤝' },
  { label: 'Fear',         color: '#16a085', emoji: '😨' },
  { label: 'Surprise',     color: '#5dade2', emoji: '😲' },
  { label: 'Sadness',      color: '#34495e', emoji: '😢' },
  { label: 'Disgust',      color: '#229954', emoji: '🤢' },
  { label: 'Anger',        color: '#e74c3c', emoji: '😠' },
  { label: 'Anticipation', color: '#e67e22', emoji: '🤩' },
];

const LEVEL2_EMOTIONS = [
  // Joy
  { label: 'Content',      parent: 'Joy' },
  { label: 'Proud',        parent: 'Joy' },
  { label: 'Optimistic',   parent: 'Joy' },
  { label: 'Joyful',       parent: 'Joy' },
  // Trust
  { label: 'Respectful',   parent: 'Trust' },
  { label: 'Loyal',        parent: 'Trust' },
  { label: 'Intimate',     parent: 'Trust' },
  { label: 'Admiring',     parent: 'Trust' },
  // Fear
  { label: 'Anxious',      parent: 'Fear' },
  { label: 'Insecure',     parent: 'Fear' },
  { label: 'Scared',       parent: 'Fear' },
  { label: 'Terrified',    parent: 'Fear' },
  // Surprise
  { label: 'Startled',     parent: 'Surprise' },
  { label: 'Amazed',       parent: 'Surprise' },
  { label: 'Confused',     parent: 'Surprise' },
  { label: 'Disillusioned',parent: 'Surprise' },
  // Sadness
  { label: 'Disappointed', parent: 'Sadness' },
  { label: 'Lonely',       parent: 'Sadness' },
  { label: 'Guilty',       parent: 'Sadness' },
  { label: 'Depressed',    parent: 'Sadness' },
  // Disgust
  { label: 'Disapproving', parent: 'Disgust' },
  { label: 'Judgmental',   parent: 'Disgust' },
  { label: 'Repelled',     parent: 'Disgust' },
  { label: 'Contemptuous', parent: 'Disgust' },
  // Anger
  { label: 'Hurt',         parent: 'Anger' },
  { label: 'Let down',     parent: 'Anger' },
  { label: 'Bitter',       parent: 'Anger' },
  { label: 'Mad',          parent: 'Anger' },
  // Anticipation
  { label: 'Hopeful',      parent: 'Anticipation' },
  { label: 'Eager',        parent: 'Anticipation' },
  { label: 'Enthusiastic', parent: 'Anticipation' },
  { label: 'Vigilant',     parent: 'Anticipation' },
];

const LEVEL3_EMOTIONS = [
  // Joy > Content
  { label: 'Free',               parent: 'Content' },
  { label: 'Fulfilled',          parent: 'Content' },
  // Joy > Proud
  { label: 'Successful',         parent: 'Proud' },
  { label: 'Confident',          parent: 'Proud' },
  // Joy > Optimistic
  { label: 'Inspired',           parent: 'Optimistic' },
  { label: 'Open',               parent: 'Optimistic' },
  // Joy > Joyful
  { label: 'Energetic',          parent: 'Joyful' },
  { label: 'Cheerful',           parent: 'Joyful' },
  // Trust > Respectful
  { label: 'Grateful',           parent: 'Respectful' },
  { label: 'Appreciative',       parent: 'Respectful' },
  // Trust > Loyal
  { label: 'Faithful',           parent: 'Loyal' },
  { label: 'Devoted',            parent: 'Loyal' },
  // Trust > Intimate
  { label: 'Affectionate',       parent: 'Intimate' },
  { label: 'Loving',             parent: 'Intimate' },
  // Trust > Admiring
  { label: 'Awe-inspired',       parent: 'Admiring' },
  { label: 'Compassionate',      parent: 'Admiring' },
  // Fear > Anxious
  { label: 'Worried',            parent: 'Anxious' },
  { label: 'Overwhelmed',        parent: 'Anxious' },
  // Fear > Insecure
  { label: 'Inferior',           parent: 'Insecure' },
  { label: 'Worthless',          parent: 'Insecure' },
  // Fear > Scared
  { label: 'Frightened',         parent: 'Scared' },
  { label: 'Helpless',           parent: 'Scared' },
  // Fear > Terrified
  { label: 'Panicked',           parent: 'Terrified' },
  { label: 'Horrified',          parent: 'Terrified' },
  // Surprise > Startled
  { label: 'Shocked',            parent: 'Startled' },
  { label: 'Dismayed',           parent: 'Startled' },
  // Surprise > Amazed
  { label: 'Astonished',         parent: 'Amazed' },
  { label: 'Awe',                parent: 'Amazed' },
  // Surprise > Confused
  { label: 'Perplexed',          parent: 'Confused' },
  { label: 'Bewildered',         parent: 'Confused' },
  // Surprise > Disillusioned
  { label: 'Betrayed',           parent: 'Disillusioned' },
  { label: 'Let down (exp.)',    parent: 'Disillusioned' },
  // Sadness > Disappointed
  { label: 'Regretful',          parent: 'Disappointed' },
  { label: 'Dismayed (sad)',     parent: 'Disappointed' },
  // Sadness > Lonely
  { label: 'Abandoned',          parent: 'Lonely' },
  { label: 'Isolated',           parent: 'Lonely' },
  // Sadness > Guilty
  { label: 'Ashamed',            parent: 'Guilty' },
  { label: 'Remorseful',         parent: 'Guilty' },
  // Sadness > Depressed
  { label: 'Despair',            parent: 'Depressed' },
  { label: 'Hopeless',           parent: 'Depressed' },
  // Disgust > Disapproving
  { label: 'Disdainful',         parent: 'Disapproving' },
  { label: 'Scornful',           parent: 'Disapproving' },
  // Disgust > Judgmental
  { label: 'Critical',           parent: 'Judgmental' },
  { label: 'Skeptical',          parent: 'Judgmental' },
  // Disgust > Repelled
  { label: 'Aversion',           parent: 'Repelled' },
  { label: 'Disturbed',          parent: 'Repelled' },
  // Disgust > Contemptuous
  { label: 'Disdain',            parent: 'Contemptuous' },
  { label: 'Disrespectful',      parent: 'Contemptuous' },
  // Anger > Hurt
  { label: 'Offended',           parent: 'Hurt' },
  { label: 'Aggrieved',          parent: 'Hurt' },
  // Anger > Let down
  { label: 'Betrayed (anger)',   parent: 'Let down' },
  { label: 'Resentful',          parent: 'Let down' },
  // Anger > Bitter
  { label: 'Indignant',          parent: 'Bitter' },
  { label: 'Jealous',            parent: 'Bitter' },
  // Anger > Mad
  { label: 'Furious',            parent: 'Mad' },
  { label: 'Enraged',            parent: 'Mad' },
  // Anticipation > Hopeful
  { label: 'Expectant',          parent: 'Hopeful' },
  { label: 'Optimistic (future)',parent: 'Hopeful' },
  // Anticipation > Eager
  { label: 'Excited',            parent: 'Eager' },
  { label: 'Impatient',          parent: 'Eager' },
  // Anticipation > Enthusiastic
  { label: 'Motivated',          parent: 'Enthusiastic' },
  { label: 'Passionate',         parent: 'Enthusiastic' },
  // Anticipation > Vigilant
  { label: 'Alert',              parent: 'Vigilant' },
  { label: 'Watchful',           parent: 'Vigilant' },
];

// Emotions classified as positive for analytics
const POSITIVE_BASES = new Set(['Joy', 'Trust', 'Anticipation']);
// Emotions classified as negative
const NEGATIVE_BASES = new Set(['Fear', 'Sadness', 'Disgust', 'Anger']);
// Neutral
const NEUTRAL_BASES = new Set(['Surprise']);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function shadeColor(hex, factor) {
  const r = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 + factor))));
  const g = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 + factor))));
  const b = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 + factor))));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function describeDonutArc(cx, cy, r1, r2, startDeg, endDeg) {
  const toRad = d => (d - 90) * Math.PI / 180;
  const s = toRad(startDeg), e = toRad(endDeg);
  const large = (endDeg - startDeg) > 180 ? 1 : 0;
  const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x1, y1] = p(r2, s), [x2, y2] = p(r2, e),
        [x3, y3] = p(r1, e), [x4, y4] = p(r1, s);
  if (r1 === 0) {
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r2} ${r2} 0 ${large} 1 ${x2} ${y2} Z`;
  }
  return `M ${x1} ${y1} A ${r2} ${r2} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r1} ${r1} 0 ${large} 0 ${x4} ${y4} Z`;
}

function getBaseForEmotion(label) {
  const base = BASE_EMOTIONS.find(b => b.label === label);
  if (base) return base.label;
  const l2 = LEVEL2_EMOTIONS.find(e => e.label === label);
  if (l2) return l2.parent;
  const l3 = LEVEL3_EMOTIONS.find(e => e.label === label);
  if (l3) {
    const parent2 = LEVEL2_EMOTIONS.find(e => e.label === l3.parent);
    return parent2 ? parent2.parent : l3.parent;
  }
  return label;
}

function getBaseColor(label) {
  const base = getBaseForEmotion(label);
  return BASE_EMOTIONS.find(b => b.label === base)?.color ?? '#888';
}

function getBaseEmoji(label) {
  const base = getBaseForEmotion(label);
  return BASE_EMOTIONS.find(b => b.label === base)?.emoji ?? '😐';
}

// ─── Data access ─────────────────────────────────────────────────────────────
function getRawData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveRawData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function logEmotion(emotion, context = 'manual') {
  const data = getRawData();
  if (!Array.isArray(data.emotions)) data.emotions = [];
  data.emotions.push({ emotion, context, timestamp: new Date().toISOString() });
  saveRawData(data);
}

export function getEmotionLogs() {
  const data = getRawData();
  return Array.isArray(data.emotions) ? data.emotions : [];
}

// ─── SVG Wheel Rendering ──────────────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';
const SIZE   = 580;
const CX = SIZE / 2, CY = SIZE / 2;
const R0 = 0,  R1 = 82, R2 = 155, R3 = 232, R4 = 290;

function makePath(d, fill, title, onClick) {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', fill);
  path.setAttribute('stroke', '#111');
  path.setAttribute('stroke-width', '1');
  path.classList.add('ew-slice');
  path.style.cursor = 'pointer';
  path.style.transition = 'filter 0.15s ease';
  if (title) path.setAttribute('data-label', title);
  path.addEventListener('mouseenter', () => path.style.filter = 'brightness(1.35) drop-shadow(0 0 6px rgba(255,255,255,0.5))');
  path.addEventListener('mouseleave', () => path.style.filter = '');
  path.addEventListener('click', onClick);
  return path;
}

function makeLabel(x, y, text, rotateDeg, fontSize = 9) {
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', x);
  t.setAttribute('y', y);
  t.setAttribute('text-anchor', 'middle');
  t.setAttribute('dominant-baseline', 'middle');
  t.setAttribute('font-size', fontSize);
  t.setAttribute('fill', '#fff');
  t.setAttribute('font-family', 'Bungee, sans-serif');
  t.setAttribute('paint-order', 'stroke fill');
  t.setAttribute('stroke', '#000');
  t.setAttribute('stroke-width', '0.5');
  t.style.userSelect = 'none';
  t.style.pointerEvents = 'none';
  if (rotateDeg !== 0) t.setAttribute('transform', `rotate(${rotateDeg},${x},${y})`);
  t.textContent = text;
  return t;
}

function labelPos(r, angleDeg) {
  const a = (angleDeg - 90) * Math.PI / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

/**
 * Build the SVG emotion wheel into the given <g> element.
 * @param {SVGGElement} group
 * @param {function(string):void} onSelect   called with emotion label when a slice is clicked
 */
function buildWheel(group, onSelect) {
  group.innerHTML = '';
  const N = BASE_EMOTIONS.length;
  const sliceDeg = 360 / N;

  BASE_EMOTIONS.forEach((base, i) => {
    const startDeg = i * sliceDeg;
    const endDeg   = startDeg + sliceDeg;
    const midDeg   = startDeg + sliceDeg / 2;

    // ── Ring 1: core sector (R0 → R1) ──
    const r1Path = makePath(
      describeDonutArc(CX, CY, R0, R1, startDeg, endDeg),
      base.color,
      base.label,
      () => onSelect(base.label)
    );
    group.appendChild(r1Path);
    const [lx1, ly1] = labelPos((R0 + R1) / 2, midDeg);
    group.appendChild(makeLabel(lx1, ly1, base.emoji + ' ' + base.label, midDeg + 90, 8.5));

    // ── Ring 2: secondary emotions (R1 → R2) ──
    const secondaries = LEVEL2_EMOTIONS.filter(e => e.parent === base.label);
    const secSlice = sliceDeg / Math.max(secondaries.length, 1);
    secondaries.forEach((sec, j) => {
      const sStart = startDeg + j * secSlice;
      const sEnd   = sStart + secSlice;
      const sMid   = (sStart + sEnd) / 2;
      const r2Path = makePath(
        describeDonutArc(CX, CY, R1, R2, sStart, sEnd),
        shadeColor(base.color, j % 2 === 0 ? -0.12 : 0.12),
        sec.label,
        () => onSelect(sec.label)
      );
      group.appendChild(r2Path);
      const [lx2, ly2] = labelPos((R1 + R2) / 2, sMid);
      group.appendChild(makeLabel(lx2, ly2, sec.label, sMid + 90, 7));

      // ── Ring 3: tertiary emotions (R2 → R3) ──
      const tertiaries = LEVEL3_EMOTIONS.filter(e => e.parent === sec.label);
      const terSlice = secSlice / Math.max(tertiaries.length, 1);
      tertiaries.forEach((ter, k) => {
        const tStart = sStart + k * terSlice;
        const tEnd   = tStart + terSlice;
        const tMid   = (tStart + tEnd) / 2;
        const r3Path = makePath(
          describeDonutArc(CX, CY, R2, R3, tStart, tEnd),
          shadeColor(base.color, k % 2 === 0 ? -0.22 : 0.22),
          ter.label,
          () => onSelect(ter.label)
        );
        group.appendChild(r3Path);
        const [lx3, ly3] = labelPos((R2 + R3) / 2, tMid);
        group.appendChild(makeLabel(lx3, ly3, ter.label, tMid + 90, 5.5));
      });
    });
  });

  // ── Ring 4: outer glow ring (decorative) ──
  const glow = document.createElementNS(SVG_NS, 'circle');
  glow.setAttribute('cx', CX);
  glow.setAttribute('cy', CY);
  glow.setAttribute('r', R3 + 6);
  glow.setAttribute('fill', 'none');
  glow.setAttribute('stroke', '#00e5ff');
  glow.setAttribute('stroke-width', '2');
  glow.setAttribute('opacity', '0.3');
  group.appendChild(glow);
}

// ─── Analytics ────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function computeAnalytics() {
  const logs = getEmotionLogs();
  const total = logs.length;
  if (total === 0) return null;

  // Count by base emotion
  const baseCounts = {};
  BASE_EMOTIONS.forEach(b => { baseCounts[b.label] = 0; });
  logs.forEach(l => {
    const base = getBaseForEmotion(l.emotion);
    if (baseCounts[base] !== undefined) baseCounts[base]++;
    else baseCounts[base] = 1;
  });

  // Positivity / negativity
  let pos = 0, neg = 0, neu = 0;
  logs.forEach(l => {
    const base = getBaseForEmotion(l.emotion);
    if (POSITIVE_BASES.has(base)) pos++;
    else if (NEGATIVE_BASES.has(base)) neg++;
    else neu++;
  });

  // Streak: consecutive calendar days (today backwards) with ≥1 log
  const days = [...new Set(logs.map(l => l.timestamp.slice(0, 10)))].sort().reverse();
  let streak = 0;
  let check = todayStr();
  for (const d of days) {
    if (d === check) { streak++; const dt = new Date(check); dt.setDate(dt.getDate() - 1); check = dt.toISOString().slice(0, 10); }
    else if (d < check) break;
  }

  // Today count
  const todayCount = logs.filter(l => l.timestamp.startsWith(todayStr())).length;

  // Most common emotion
  const emotionCounts = {};
  logs.forEach(l => { emotionCounts[l.emotion] = (emotionCounts[l.emotion] || 0) + 1; });
  const topEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  // Recent emoji cloud (last 20 logs, most recent first)
  const recentEmojis = logs.slice(-20).reverse().map(l => getBaseEmoji(l.emotion));

  return { total, baseCounts, pos, neg, neu, streak, todayCount, topEmotion, recentEmojis };
}

/** Draw a simple SVG pie chart for base emotion distribution */
function drawPieChart(container, baseCounts) {
  const total = Object.values(baseCounts).reduce((s, v) => s + v, 0);
  if (total === 0) { container.textContent = 'No logs yet.'; return; }

  const svgSize = 180;
  const cx = svgSize / 2, cy = svgSize / 2, r = 78;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', svgSize);
  svg.setAttribute('height', svgSize);
  svg.setAttribute('viewBox', `0 0 ${svgSize} ${svgSize}`);

  let startAngle = -Math.PI / 2;
  BASE_EMOTIONS.forEach(base => {
    const count = baseCounts[base.label] || 0;
    if (count === 0) return;
    const angle = (count / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const large = angle > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`);
    path.setAttribute('fill', base.color);
    path.setAttribute('stroke', '#111');
    path.setAttribute('stroke-width', '1');
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = `${base.emoji} ${base.label}: ${count} (${Math.round(count / total * 100)}%)`;
    path.appendChild(title);
    svg.appendChild(path);
    startAngle = endAngle;
  });

  // Center hole for donut effect
  const hole = document.createElementNS(SVG_NS, 'circle');
  hole.setAttribute('cx', cx); hole.setAttribute('cy', cy); hole.setAttribute('r', 34);
  hole.setAttribute('fill', '#111'); svg.appendChild(hole);

  container.innerHTML = '';
  container.appendChild(svg);
}

/** Render the full analytics panel into an element */
function renderAnalytics(container) {
  const stats = computeAnalytics();
  if (!stats) {
    container.innerHTML = `<p class="ew-analytics-empty">Log your first emotion to see your personal stats! 🌟</p>`;
    return;
  }

  const posRatio  = stats.total ? Math.round((stats.pos / stats.total) * 100) : 0;
  const negRatio  = stats.total ? Math.round((stats.neg / stats.total) * 100) : 0;
  const topEmoji  = stats.topEmotion ? getBaseEmoji(stats.topEmotion) : '❓';
  const emojiCloud = [...new Set(stats.recentEmojis)].join(' ');

  container.innerHTML = `
    <div class="ew-analytics-grid">
      <div class="ew-pie-wrap">
        <h4>😊 Average State</h4>
        <div id="ew-pie-chart"></div>
        <div class="ew-pie-legend">
          ${BASE_EMOTIONS.map(b =>
            (stats.baseCounts[b.label] || 0) > 0
              ? `<span style="color:${b.color}">${b.emoji} ${b.label}: ${stats.baseCounts[b.label]}</span>`
              : ''
          ).join('')}
        </div>
      </div>
      <div class="ew-stats-panel">
        <h4>📊 Personal Stats</h4>
        <ul class="ew-stats-list">
          <li>📝 Total logs: <strong>${stats.total}</strong></li>
          <li>📅 Today: <strong>${stats.todayCount}</strong></li>
          <li>🔥 Streak: <strong>${stats.streak} day${stats.streak !== 1 ? 's' : ''}</strong></li>
          <li>☀️ Positivity: <strong>${posRatio}%</strong></li>
          <li>🌧️ Negativity: <strong>${negRatio}%</strong></li>
          <li>🏆 Top emotion: ${topEmoji} <strong>${stats.topEmotion || '—'}</strong></li>
        </ul>
        <div class="ew-emoji-cloud">
          <h4>✨ Recent Vibes</h4>
          <p class="ew-emojis">${emojiCloud || '—'}</p>
        </div>
      </div>
    </div>
  `;
  drawPieChart(container.querySelector('#ew-pie-chart'), stats.baseCounts);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the feelings wheel inside the modal.
 * Should be called once on DOMContentLoaded.
 */
export function initFeelingsWheel() {
  const svgEl     = document.getElementById('emotionWheelSVG');
  const slicesGrp = document.getElementById('emotionSlices');
  const display   = document.getElementById('emotion-selected-display');
  const analytics = document.getElementById('feelings-analytics');

  if (!svgEl || !slicesGrp) return;

  svgEl.setAttribute('width', SIZE);
  svgEl.setAttribute('height', SIZE);
  svgEl.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svgEl.style.display = 'block';

  function handleSelect(emotion) {
    // Show confirmation
    if (display) {
      display.innerHTML = `
        <span class="ew-selected-emoji">${getBaseEmoji(emotion)}</span>
        <span class="ew-selected-label">${emotion}</span>
        <button id="ew-log-btn" class="ew-log-btn">✅ Log this feeling</button>
        <button id="ew-cancel-btn" class="ew-cancel-btn">✕</button>
      `;
      document.getElementById('ew-log-btn')?.addEventListener('click', () => {
        const ctx = svgEl.dataset.context || 'manual';
        logEmotion(emotion, ctx);
        display.innerHTML = `<span class="ew-logged-confirm">${getBaseEmoji(emotion)} <em>${emotion}</em> logged! 🌟</span>`;
        if (analytics) renderAnalytics(analytics);
        setTimeout(() => {
          display.innerHTML = '';
          // Auto-close modal after post-workout log
          if (ctx === 'post-workout') {
            hideModal('emotion-modal');
          }
        }, 1800);
      });
      document.getElementById('ew-cancel-btn')?.addEventListener('click', () => {
        display.innerHTML = '';
      });
    }
  }

  buildWheel(slicesGrp, handleSelect);
  if (analytics) renderAnalytics(analytics);
}

/** Helper to open the emotion modal (uses global showModal / hideModal from app.js) */
function hideModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('modal-hidden');
}

/**
 * Open the feelings modal with an optional context message.
 * @param {'manual'|'post-workout'} context
 */
export function openFeelingsModal(context = 'manual') {
  const svgEl    = document.getElementById('emotionWheelSVG');
  const ctxEl    = document.getElementById('emotion-modal-context');
  const analytics = document.getElementById('feelings-analytics');
  const display   = document.getElementById('emotion-selected-display');

  if (svgEl) svgEl.dataset.context = context;
  if (display) display.innerHTML = '';

  if (ctxEl) {
    if (context === 'post-workout') {
      ctxEl.textContent = '🏋️ Great workout! How are you feeling right now?';
      ctxEl.style.display = 'block';
    } else {
      ctxEl.textContent = '';
      ctxEl.style.display = 'none';
    }
  }

  if (analytics) renderAnalytics(analytics);

  const modal = document.getElementById('emotion-modal');
  if (modal) modal.classList.remove('modal-hidden');
}
