/**
 * correlationGraph.js
 * 🧠 Third Eye — Multi-Series Correlation Graph
 *
 * Features:
 * - Time range toggles (7d / 14d / 30d / 90d / All)
 * - Chart types: Line, Bar, Scatter, Radar (emotion distribution)
 * - Chiclet/tag series selectors grouped by category
 * - Plutchik emotion color mapping with artistic visualization
 * - Axis normalization (0–100%)
 * - Mini insight badges
 * - PNG export
 */

const STORAGE_KEY       = 'fitnessTrackerData';
const WATER_HISTORY_KEY = 'waterDailyHistory';

// ─── Plutchik emotion palette (mirrors feelingsWheel.js BASE_EMOTIONS) ────────
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

// Parent lookup for Level 2 & 3 emotions
const L2_PARENTS = {
  Content:'Joy', Proud:'Joy', Optimistic:'Joy', Joyful:'Joy',
  Respectful:'Trust', Loyal:'Trust', Intimate:'Trust', Admiring:'Trust',
  Anxious:'Fear', Insecure:'Fear', Scared:'Fear', Terrified:'Fear',
  Startled:'Surprise', Amazed:'Surprise', Confused:'Surprise', Disillusioned:'Surprise',
  Disappointed:'Sadness', Lonely:'Sadness', Guilty:'Sadness', Depressed:'Sadness',
  Disapproving:'Disgust', Judgmental:'Disgust', Repelled:'Disgust', Contemptuous:'Disgust',
  Hurt:'Anger', 'Let down':'Anger', Bitter:'Anger', Mad:'Anger',
  Hopeful:'Anticipation', Eager:'Anticipation', Enthusiastic:'Anticipation', Vigilant:'Anticipation',
};

// Level 3 emotions and their L2 parents (for double lookup)
const L3_PARENTS = {
  Free:'Content', Fulfilled:'Content',
  Successful:'Proud', Confident:'Proud',
  Inspired:'Optimistic', Open:'Optimistic',
  Energetic:'Joyful', Cheerful:'Joyful',
  Grateful:'Respectful', Appreciative:'Respectful',
  Faithful:'Loyal', Devoted:'Loyal',
  Affectionate:'Intimate', Loving:'Intimate',
  'Awe-inspired':'Admiring', Compassionate:'Admiring',
  Worried:'Anxious', Overwhelmed:'Anxious',
  Inferior:'Insecure', Worthless:'Insecure',
  Frightened:'Scared', Helpless:'Scared',
  Devastated:'Terrified', Submissive:'Terrified',
  Shocked:'Startled', Dismayed:'Startled',
  Astonished:'Amazed', Awe:'Amazed',
  Perplexed:'Confused', Disillusioned_:'Confused',
  Unsettled:'Disillusioned',
  Dismay:'Disappointed', Regretful:'Disappointed',
  Isolated:'Lonely', Abandoned:'Lonely',
  Remorseful:'Guilty', Ashamed:'Guilty',
  Inferior_:'Depressed', Hopeless:'Depressed',
  Terrible:'Disapproving', Critical:'Disapproving',
  Loathing:'Judgmental', Resentful:'Judgmental',
  Nauseated:'Repelled', Revolted:'Repelled',
  Despised:'Contemptuous', Superior:'Contemptuous',
  Aggrieved:'Hurt', Victimized:'Hurt',
  Betrayed:'Let down', Resentful_:'Let down',
  Violated:'Bitter', Indignant:'Bitter',
  Hostile:'Mad', Furious:'Mad',
  Trusting:'Hopeful', Sensitive:'Hopeful',
  Excited:'Eager', Impatient:'Eager',
  Aroused:'Enthusiastic', Zeal:'Enthusiastic',
  Watchful:'Vigilant', Tense:'Vigilant',
};

function getBaseForEmotion(label) {
  if (BASE_EMOTIONS.find(b => b.label === label)) return label;
  if (L2_PARENTS[label]) return L2_PARENTS[label];
  if (L3_PARENTS[label]) return L2_PARENTS[L3_PARENTS[label]] ?? L3_PARENTS[label];
  return label;
}

function getEmotionColor(label) {
  const base = getBaseForEmotion(label);
  return BASE_EMOTIONS.find(b => b.label === base)?.color ?? '#888888';
}

function getEmotionEmoji(label) {
  const base = getBaseForEmotion(label);
  return BASE_EMOTIONS.find(b => b.label === base)?.emoji ?? '😐';
}

// ─── Neon color palette for non-emotion series ────────────────────────────────
const NEON_PALETTE = [
  '#00e5ff', '#ff00cc', '#39ff14', '#ffaa00',
  '#ff4444', '#aa44ff', '#00ffaa', '#ff8844',
  '#4488ff', '#ffff44',
];
let _paletteIdx = 0;
function nextNeon() { return NEON_PALETTE[_paletteIdx++ % NEON_PALETTE.length]; }

// ─── Data helpers ─────────────────────────────────────────────────────────────
function loadFitnessData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return _emptyData();
    return JSON.parse(raw);
  } catch { return _emptyData(); }
}

function _emptyData() {
  return { weightLogs: [], supplements: [], foods: [], measurements: [],
    exercises: { types: [], entries: [] }, sessionLog: [], painLogs: [], emotions: [] };
}

function getWaterHistory() {
  try {
    return JSON.parse(localStorage.getItem(WATER_HISTORY_KEY) || '{}');
  } catch { return {}; }
}

function cutoffDate(days) {
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Series extractors ────────────────────────────────────────────────────────
function extractWeight(data, cutoff) {
  return (data.weightLogs || [])
    .map(e => ({ x: new Date(e.timestamp), y: parseFloat(e.weight) }))
    .filter(p => !isNaN(p.y) && (!cutoff || p.x >= cutoff))
    .sort((a, b) => a.x - b.x);
}

function extractWater(cutoff) {
  const hist = getWaterHistory();
  return Object.entries(hist)
    .map(([date, count]) => ({ x: new Date(date + 'T12:00:00'), y: Number(count) }))
    .filter(p => !isNaN(p.y) && (!cutoff || p.x >= cutoff))
    .sort((a, b) => a.x - b.x);
}

function extractExercise(data, exType, field, cutoff) {
  return (data.exercises?.entries || [])
    .filter(e => e.type === exType && (!cutoff || new Date(e.timestamp) >= cutoff))
    .map(e => ({ x: new Date(e.timestamp), y: parseFloat(e[field]) }))
    .filter(p => !isNaN(p.y))
    .sort((a, b) => a.x - b.x);
}

function extractMeasurement(data, mType, cutoff) {
  return (data.measurements || [])
    .filter(m => m.type === mType)
    .map(m => ({ x: new Date(`${m.date}T${m.time || '12:00'}`), y: parseFloat(m.measurement) }))
    .filter(p => !isNaN(p.y) && (!cutoff || p.x >= cutoff))
    .sort((a, b) => a.x - b.x);
}

function extractEmotions(data, cutoff) {
  return (data.emotions || [])
    .filter(e => !cutoff || new Date(e.timestamp) >= cutoff)
    .map(e => ({ x: new Date(e.timestamp), label: e.emotion, color: getEmotionColor(e.emotion) }))
    .sort((a, b) => a.x - b.x);
}

// ─── Normalization ────────────────────────────────────────────────────────────
function normalizePoints(points) {
  const vals = points.map(p => p.y).filter(v => isFinite(v));
  if (!vals.length) return points;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) return points.map(p => ({ ...p, y: 50 }));
  return points.map(p => ({ ...p, y: ((p.y - lo) / (hi - lo)) * 100 }));
}

// ─── Dataset builder ──────────────────────────────────────────────────────────
function buildDatasets(activeKeys, data, cutoff, normalize, chartType) {
  _paletteIdx = 0;
  const datasets = [];

  for (const key of activeKeys) {
    if (key === 'emotions') continue; // rendered separately below
    let points = [];
    let label = key;
    const color = nextNeon();

    if (key === 'weight') {
      points = extractWeight(data, cutoff);
      label = '⚖️ Weight';
    } else if (key === 'water') {
      points = extractWater(cutoff);
      label = '💧 Water (cups)';
    } else if (key.startsWith('exercise:')) {
      const parts = key.split(':');
      const [, exType, field] = parts;
      points = extractExercise(data, exType, field, cutoff);
      label = `💪 ${exType} (${field})`;
    } else if (key.startsWith('measure:')) {
      const mType = key.slice('measure:'.length);
      points = extractMeasurement(data, mType, cutoff);
      label = `📏 ${mType}`;
    }

    if (normalize) points = normalizePoints(points);
    if (!points.length) continue;

    const alpha = '44';
    datasets.push({
      label,
      data: points,
      borderColor: color,
      backgroundColor: color + alpha,
      fill: chartType === 'line',
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 7,
      borderWidth: 2,
      _seriesKey: key,
    });
  }

  // Emotion scatter overlay — always placed at y=0 (baseline)
  if (activeKeys.includes('emotions')) {
    const emotionPts = extractEmotions(data, cutoff);
    if (emotionPts.length) {
      datasets.push({
        label: '🧠 Emotions',
        data: emotionPts.map(p => ({ x: p.x, y: 0, _label: p.label })),
        backgroundColor: emotionPts.map(p => p.color),
        borderColor: emotionPts.map(p => p.color),
        pointRadius: 7,
        pointHoverRadius: 12,
        pointStyle: 'circle',
        type: 'scatter',
        order: 1,
        _isEmotion: true,
      });
    }
  }

  return datasets;
}

// ─── Radar chart (emotion distribution) ──────────────────────────────────────
function renderRadar(canvas, data, cutoff) {
  const emotionLogs = (data.emotions || [])
    .filter(e => !cutoff || new Date(e.timestamp) >= cutoff);

  const labels = BASE_EMOTIONS.map(b => `${b.emoji} ${b.label}`);
  const counts = BASE_EMOTIONS.map(b => {
    const children = Object.entries(L2_PARENTS).filter(([, p]) => p === b.label).map(([l]) => l);
    return emotionLogs.filter(e => e.emotion === b.label || children.includes(e.emotion)).length;
  });

  // eslint-disable-next-line no-undef
  return new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: '🧠 Emotion Spread',
        data: counts,
        borderColor: '#aa44ff',
        backgroundColor: 'rgba(170,68,255,0.2)',
        pointBackgroundColor: BASE_EMOTIONS.map(b => b.color),
        pointBorderColor: BASE_EMOTIONS.map(b => b.color),
        pointRadius: 5,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: { labels: { color: '#aad4f0', font: { size: 11 } } },
        tooltip: {
          backgroundColor: 'rgba(0,10,30,0.92)',
          borderColor: 'rgba(170,68,255,0.5)',
          borderWidth: 1,
          titleColor: '#aa44ff',
          bodyColor: '#e0f4ff',
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          ticks: { color: '#7ecfef', backdropColor: 'transparent', font: { size: 9 } },
          grid: { color: 'rgba(170,68,255,0.2)' },
          pointLabels: { color: '#aad4f0', font: { size: 11 } },
          angleLines: { color: 'rgba(170,68,255,0.25)' },
        },
      },
    },
  });
}

// ─── Main chart renderer ──────────────────────────────────────────────────────
let _chart = null;

function renderChart(canvasId, activeKeys, days, chartType, normalize) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (_chart) { _chart.destroy(); _chart = null; }

  const data = loadFitnessData();
  const cutoff = cutoffDate(days);

  if (chartType === 'radar') {
    _chart = renderRadar(canvas, data, cutoff);
    renderInsights(data, activeKeys, cutoff, days);
    return;
  }

  const datasets = buildDatasets(activeKeys, data, cutoff, normalize, chartType);
  if (!datasets.length) {
    renderInsights(data, activeKeys, cutoff, days);
    return;
  }

  const hasEmotions = activeKeys.includes('emotions');

  // eslint-disable-next-line no-undef
  _chart = new Chart(canvas, {
    type: chartType === 'scatter' ? 'scatter' : chartType,
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#aad4f0',
            font: { size: 11 },
            usePointStyle: true,
            padding: 10,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(0,10,30,0.92)',
          borderColor: 'rgba(0,229,255,0.35)',
          borderWidth: 1,
          titleColor: '#00e5ff',
          bodyColor: '#e0f4ff',
          callbacks: {
            label(ctx) {
              if (ctx.dataset._isEmotion) {
                return ` ${getEmotionEmoji(ctx.raw._label)} ${ctx.raw._label || ''}`;
              }
              const v = normalize
                ? `${ctx.parsed.y?.toFixed(1)}%`
                : (ctx.parsed.y?.toFixed(2) ?? '—');
              return ` ${ctx.dataset.label}: ${v}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          title: { display: false },
          ticks: { color: '#7ecfef', maxTicksLimit: 8, font: { size: 10 } },
          grid: { color: 'rgba(0,229,255,0.07)' },
        },
        y: {
          beginAtZero: normalize,
          title: {
            display: normalize,
            text: '% (normalised)',
            color: '#7ecfef',
            font: { size: 10 },
          },
          ticks: {
            color: '#7ecfef',
            font: { size: 10 },
            callback: normalize ? v => `${v.toFixed(0)}%` : undefined,
          },
          grid: { color: 'rgba(0,229,255,0.1)' },
        },
        ...(hasEmotions && !normalize ? {
          yEmotion: {
            display: false,
            min: -1,
            max: 1,
            position: 'right',
          },
        } : {}),
      },
    },
  });

  renderInsights(data, activeKeys, cutoff, days);
}

// ─── Insight badges ───────────────────────────────────────────────────────────
function renderInsights(data, activeKeys, cutoff, days) {
  const el = document.getElementById('corr-insights');
  if (!el) return;
  const badges = [];
  const dayLabel = days ? `${days}d` : 'all time';

  if (activeKeys.includes('weight')) {
    const pts = extractWeight(data, cutoff);
    if (pts.length >= 2) {
      const delta = pts[pts.length - 1].y - pts[0].y;
      const sign = delta < 0 ? '📉' : '📈';
      const abs = Math.abs(delta).toFixed(1);
      badges.push(`${sign} ${abs} lbs ${delta < 0 ? 'lost' : 'gained'} in ${dayLabel}`);
    }
  }

  if (activeKeys.includes('water')) {
    const pts = extractWater(cutoff);
    if (pts.length) {
      const avg = (pts.reduce((s, p) => s + p.y, 0) / pts.length).toFixed(1);
      const streak = _waterStreak(pts);
      badges.push(`💧 Avg ${avg} cups/day${streak >= 3 ? ` · 🔥 ${streak}d streak` : ''}`);
    }
  }

  if (activeKeys.includes('emotions')) {
    const logs = (data.emotions || []).filter(e => !cutoff || new Date(e.timestamp) >= cutoff);
    if (logs.length) {
      const counts = {};
      logs.forEach(l => {
        const base = getBaseForEmotion(l.emotion);
        counts[base] = (counts[base] || 0) + 1;
      });
      const [topEmotion, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [];
      if (topEmotion) {
        badges.push(`${getEmotionEmoji(topEmotion)} Dominant: <strong>${topEmotion}</strong> (${topCount}×)`);
      }
    }
  }

  el.innerHTML = badges.map(b => `<span class="corr-insight-badge">${b}</span>`).join('');
}

function _waterStreak(pts) {
  if (!pts.length) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  for (let i = pts.length - 1; i >= 0; i--) {
    const d = new Date(pts[i].x);
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - d) / 86400000);
    if (diffDays === streak && pts[i].y > 0) streak++;
    else break;
  }
  return streak;
}

// ─── Series list builder (dynamic from data) ──────────────────────────────────
function buildAvailableSeries(data) {
  const series = [];

  // Body
  series.push({ key: 'weight', label: 'Weight', group: 'body' });
  [...new Set((data.measurements || []).map(m => m.type))].forEach(t => {
    series.push({ key: `measure:${t}`, label: t, group: 'body' });
  });

  // Hydration
  series.push({ key: 'water', label: 'Water', group: 'hydration' });

  // Exercise (unique types)
  [...new Set((data.exercises?.entries || []).map(e => e.type))].forEach(t => {
    series.push({ key: `exercise:${t}:reps`,   label: `${t} reps`,   group: 'exercise' });
    series.push({ key: `exercise:${t}:weight`, label: `${t} weight`, group: 'exercise' });
  });

  // Emotions
  series.push({ key: 'emotions', label: 'Emotions 🌈', group: 'emotions' });

  return series;
}

// ─── UI builders ──────────────────────────────────────────────────────────────
function buildSeriesUI(modal, activeSeries, onToggle) {
  const container = modal.querySelector('#corr-series-groups');
  if (!container) return;

  const data = loadFitnessData();
  const seriesList = buildAvailableSeries(data);

  const groupDefs = {
    body:      { label: '⚖️ Body',      color: '#00e5ff' },
    hydration: { label: '💧 Hydration', color: '#4af' },
    exercise:  { label: '💪 Exercise',  color: '#39ff14' },
    emotions:  { label: '🧠 Emotions',  color: '#aa44ff' },
  };

  // Group items
  const grouped = {};
  seriesList.forEach(s => {
    if (!grouped[s.group]) grouped[s.group] = [];
    grouped[s.group].push(s);
  });

  container.innerHTML = '';
  for (const [gKey, gDef] of Object.entries(groupDefs)) {
    const items = grouped[gKey];
    if (!items?.length) continue;

    const div = document.createElement('div');
    div.className = 'corr-group';
    div.innerHTML = `<div class="corr-group-label" style="color:${gDef.color}">${gDef.label}</div>
      <div class="corr-chiclets" id="corr-chiclets-${gKey}"></div>`;
    const chicletWrap = div.querySelector(`#corr-chiclets-${gKey}`);

    items.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'corr-chiclet' + (activeSeries.has(s.key) ? ' active' : '');
      btn.dataset.series = s.key;
      btn.textContent = s.label;
      btn.style.setProperty('--chiclet-color', gDef.color);
      btn.addEventListener('click', () => onToggle(s.key, btn));
      chicletWrap.appendChild(btn);
    });

    container.appendChild(div);
  }
}

// ─── Module init (called once from app.js) ────────────────────────────────────
export function initCorrelationGraph() {
  const modal = document.getElementById('correlation-graph-modal');
  if (!modal) return;

  // State
  let activeSeries  = new Set(['weight', 'water']);
  let activeDays    = 14;
  let activeType    = 'line';
  let normalizeData = false;

  function refresh() {
    renderChart('correlationChart', [...activeSeries], activeDays, activeType, normalizeData);
  }

  // Series toggle callback
  function onToggleSeries(key, btn) {
    if (activeSeries.has(key)) {
      if (activeSeries.size > 1) {
        activeSeries.delete(key);
        btn.classList.remove('active');
      }
    } else {
      activeSeries.add(key);
      btn.classList.add('active');
    }
    refresh();
  }

  // ── Close handlers ────────────────────────────────────────────────────────
  modal.querySelector('.modal-close')?.addEventListener('click', () => {
    modal.classList.add('modal-hidden');
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('modal-hidden');
  });

  // ── Time range ────────────────────────────────────────────────────────────
  modal.querySelectorAll('.corr-time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.corr-time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeDays = parseInt(btn.dataset.days, 10);
      refresh();
    });
  });

  // ── Chart type ────────────────────────────────────────────────────────────
  modal.querySelectorAll('.corr-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.corr-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeType = btn.dataset.type;
      refresh();
    });
  });

  // ── Normalize ─────────────────────────────────────────────────────────────
  modal.querySelector('#corr-normalize')?.addEventListener('change', e => {
    normalizeData = e.target.checked;
    refresh();
  });

  // ── Export PNG ────────────────────────────────────────────────────────────
  modal.querySelector('#corr-export-btn')?.addEventListener('click', () => {
    const canvas = document.getElementById('correlationChart');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `thirdeye-trends-${new Date().toISOString().split('T')[0]}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // ── Open handler ──────────────────────────────────────────────────────────
  document.getElementById('graph-icon')?.addEventListener('click', () => {
    modal.classList.remove('modal-hidden');
    buildSeriesUI(modal, activeSeries, onToggleSeries);
    refresh();
  });
}
