/**
 * communityDashboard.js
 *
 * Community Data Dashboard — prototype implementation.
 *
 * Reads the current user's local fitness data, builds anonymized aggregate
 * stats, and renders them across four tabs:
 *   1. Exercise & Fitness
 *   2. Nutrition
 *   3. $BNUT & Ledger
 *   4. Data Pool (opt-in controls)
 *
 * Privacy model (prototype):
 *   - No wallet addresses or user IDs are displayed anywhere.
 *   - Only aggregate counts and trends are shown.
 *   - The "Data Pool" tab shows a sanitized preview of what *would* be shared.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY   = 'fitnessTrackerData';
const OPTIN_KEY     = 'communityDataOptIn';
const CHART_COLORS  = [
  '#00e5ff', '#ff6b9d', '#c9f566', '#ffba08', '#ff6700',
  '#7b2d8b', '#3ec8b8', '#f7a8d8', '#b5e853', '#ffd166'
];

// Seed community data overlaid on top of the user's real data so the
// dashboard looks populated even on a fresh install.
const SEED_EXERCISE_ENTRIES = [
  { type: 'Push-ups',  count: 42 },
  { type: 'Sit-ups',   count: 37 },
  { type: 'Pull-ups',  count: 28 },
  { type: 'Squats',    count: 24 },
  { type: 'Deadlift',  count: 18 },
  { type: 'Running',   count: 16 },
  { type: 'Plank',     count: 14 },
  { type: 'Yoga',      count: 11 },
];

const SEED_FOOD_ENTRIES = [
  { name: 'Chicken Breast', count: 31 },
  { name: 'Brown Rice',     count: 28 },
  { name: 'Broccoli',       count: 22 },
  { name: 'Eggs',           count: 20 },
  { name: 'Oats',           count: 18 },
  { name: 'Sweet Potato',   count: 15 },
  { name: 'Spinach',        count: 14 },
  { name: 'Salmon',         count: 12 },
];

const SEED_SUPP_ENTRIES = [
  { name: 'Whey Protein',   count: 52 },
  { name: 'Creatine',       count: 45 },
  { name: 'Vitamin D',      count: 40 },
  { name: 'Omega-3',        count: 35 },
  { name: 'Magnesium',      count: 28 },
  { name: 'Zinc',           count: 22 },
];

// Chart instances — keyed by canvas id, destroyed on re-render.
const _charts = {};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadLocalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadOptIn() {
  try {
    return JSON.parse(localStorage.getItem(OPTIN_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveOptIn(opts) {
  localStorage.setItem(OPTIN_KEY, JSON.stringify(opts));
}

/** Safely destroy and recreate a Chart.js chart on a canvas. */
function renderChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  if (_charts[canvasId]) {
    _charts[canvasId].destroy();
    delete _charts[canvasId];
  }
  try {
    // eslint-disable-next-line no-undef
    _charts[canvasId] = new Chart(canvas, config);
  } catch (err) {
    console.warn('[CommunityDashboard] Chart error:', err);
  }
  return _charts[canvasId];
}

/** Build a frequency map from an array of values. */
function freq(arr) {
  return arr.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
}

/** Return top N entries from a frequency map, sorted descending. */
function topN(map, n = 8) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

/** Merge seed data into a frequency map (seed as community baseline). */
function mergeWithSeed(freqMap, seedEntries) {
  const out = { ...freqMap };
  seedEntries.forEach(({ name, count }) => {
    out[name] = (out[name] || 0) + count;
  });
  return out;
}

// ─── Exercise Tab ─────────────────────────────────────────────────────────────

function buildExerciseStats(data) {
  const entries  = data?.exercises?.entries || [];
  const sessions = data?.sessionLog || [];

  // Exercise type frequency
  const rawFreq = freq(entries.map(e => e.type || 'Unknown'));
  const merged  = mergeWithSeed(rawFreq, SEED_EXERCISE_ENTRIES);
  const top     = topN(merged, 8);

  // Workouts by day-of-week (0=Sun … 6=Sat)
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayCounts = Array(7).fill(0);
  entries.forEach(e => {
    const d = new Date(e.timestamp || Date.now());
    if (!isNaN(d)) dayCounts[d.getDay()]++;
  });
  // Add seed distribution (realistic-ish pattern)
  const seedDay = [8, 22, 18, 25, 20, 30, 14];
  seedDay.forEach((v, i) => { dayCounts[i] += v; });

  // Weekly average (past 12 weeks)
  const weekCounts = {};
  entries.forEach(e => {
    const d = new Date(e.timestamp || Date.now());
    if (isNaN(d)) return;
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    weekCounts[key] = (weekCounts[key] || 0) + 1;
  });
  const weeks = Object.values(weekCounts);
  const avgWeekly = weeks.length
    ? (weeks.reduce((a, b) => a + b, 0) / weeks.length).toFixed(1)
    : '—';

  return {
    totalExercises: entries.length + SEED_EXERCISE_ENTRIES.reduce((s, e) => s + e.count, 0),
    totalSessions:  sessions.length + 137, // seed community sessions
    uniqueTypes:    Object.keys(merged).length,
    avgWeekly,
    top,
    dayCounts,
    dayLabels,
  };
}

function renderExerciseTab(stats) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  set('cd-total-workouts',   stats.totalSessions.toLocaleString());
  set('cd-total-exercises',  stats.totalExercises.toLocaleString());
  set('cd-exercise-types',   stats.uniqueTypes);
  set('cd-avg-weekly',       stats.avgWeekly);

  // Popular activities — horizontal bar
  renderChart('cd-exercise-chart', {
    type: 'bar',
    data: {
      labels: stats.top.map(e => e.name),
      datasets: [{
        label: 'Community Logs',
        data: stats.top.map(e => e.count),
        backgroundColor: CHART_COLORS.slice(0, stats.top.length),
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#ddd' }, grid: { display: false } },
      },
      responsive: true,
      maintainAspectRatio: false,
    },
  });

  // Day-of-week frequency
  renderChart('cd-frequency-chart', {
    type: 'bar',
    data: {
      labels: stats.dayLabels,
      datasets: [{
        label: 'Workouts',
        data: stats.dayCounts,
        backgroundColor: 'rgba(0,229,255,0.6)',
        borderColor: '#00e5ff',
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#aaa' }, grid: { display: false } },
        y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      },
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

// ─── Nutrition Tab ────────────────────────────────────────────────────────────

function buildNutritionStats(data) {
  const foods = data?.foods || [];
  const supps = data?.supplements || [];

  const rawFoodFreq = freq(foods.map(f => f.name || 'Unknown'));
  const rawSuppFreq = freq(supps.map(s => s.name || 'Unknown'));

  const mergedFoods = mergeWithSeed(rawFoodFreq, SEED_FOOD_ENTRIES);
  const mergedSupps = mergeWithSeed(rawSuppFreq, SEED_SUPP_ENTRIES);

  return {
    totalFoods:   foods.length + SEED_FOOD_ENTRIES.reduce((s, e) => s + e.count, 0),
    uniqueFoods:  Object.keys(mergedFoods).length,
    totalSupps:   supps.length + SEED_SUPP_ENTRIES.reduce((s, e) => s + e.count, 0),
    uniqueSupps:  Object.keys(mergedSupps).length,
    topFoods:     topN(mergedFoods, 8),
    topSupps:     topN(mergedSupps, 6),
  };
}

function renderNutritionTab(stats) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  set('cd-total-foods',   stats.totalFoods.toLocaleString());
  set('cd-unique-foods',  stats.uniqueFoods);
  set('cd-total-supps',   stats.totalSupps.toLocaleString());
  set('cd-unique-supps',  stats.uniqueSupps);

  // Top foods — horizontal bar
  renderChart('cd-foods-chart', {
    type: 'bar',
    data: {
      labels: stats.topFoods.map(f => f.name),
      datasets: [{
        label: 'Times Logged',
        data: stats.topFoods.map(f => f.count),
        backgroundColor: CHART_COLORS.slice(0, stats.topFoods.length),
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#ddd' }, grid: { display: false } },
      },
      responsive: true,
      maintainAspectRatio: false,
    },
  });

  // Top supplements — doughnut
  if (stats.topSupps.length > 0) {
    renderChart('cd-supps-chart', {
      type: 'doughnut',
      data: {
        labels: stats.topSupps.map(s => s.name),
        datasets: [{
          data: stats.topSupps.map(s => s.count),
          backgroundColor: CHART_COLORS.slice(0, stats.topSupps.length),
          borderWidth: 2,
          borderColor: '#0a0a1e',
        }],
      },
      options: {
        plugins: {
          legend: {
            display: true,
            position: 'right',
            labels: { color: '#ccc', boxWidth: 14, font: { size: 11 } },
          },
        },
        cutout: '55%',
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }
}

// ─── $BNUT & Ledger Tab ───────────────────────────────────────────────────────

const SEED_BNUT_DATA = {
  totalIssued: 0,
  contributors: [
    { displayName: 'TheJollyLaMa',   role: 'owner',       bnutEarned: 0, issuesClosed: 0 },
    { displayName: 'Copilot RoboSoul', role: 'contributor', bnutEarned: 0, issuesClosed: 0 },
  ],
  recentBounties: [],
};

async function buildBnutStats() {
  let data = SEED_BNUT_DATA;

  try {
    const resp = await fetch('contributor-accounts.json');
    if (resp.ok) {
      const json = await resp.json();
      const contributors = (json.contributors || []).map(c => ({
        displayName: c.displayName || c.github,
        role: c.role || 'contributor',
        bnutEarned: c.bnutEarned || 0,
        issuesClosed: (c.issuesClosed || []).length,
      }));
      const totalIssued = contributors.reduce((s, c) => s + c.bnutEarned, 0);
      data = { totalIssued, contributors, recentBounties: [] };
    }
  } catch { /* use seed */ }

  try {
    const resp2 = await fetch('payroll-queue.json');
    if (resp2.ok) {
      const pq = await resp2.json();
      const settled = pq.settled || [];
      data.recentBounties = settled.slice(-5).reverse().map(s => ({
        role: 'contributor',
        amount: s.amount || 0,
        ref: s.issueRef || s.ref || '—',
      }));
    }
  } catch { /* ignore */ }

  return data;
}

function renderBnutTab(stats) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  set('cd-total-bnut',    stats.totalIssued.toLocaleString());
  set('cd-contributors',  stats.contributors.length);
  set('cd-bounties',      stats.recentBounties.length || '—');

  const bountyAmounts = stats.recentBounties.map(b => b.amount).filter(Boolean);
  const avgBounty = bountyAmounts.length
    ? (bountyAmounts.reduce((a, b) => a + b, 0) / bountyAmounts.length).toFixed(0)
    : '—';
  set('cd-avg-bounty', avgBounty === '—' ? '—' : `${avgBounty} BNUT`);

  // Distribution by role — doughnut
  const roleMap = {};
  stats.contributors.forEach(c => {
    roleMap[c.role] = (roleMap[c.role] || 0) + Math.max(c.bnutEarned, 1);
  });

  // Fallback prototype distribution if everyone is at 0
  const totalEarned = Object.values(roleMap).reduce((a, b) => a + b, 0);
  const protoData = totalEarned <= stats.contributors.length
    ? { Owner: 60, Contributor: 40 }
    : roleMap;

  /** Capitalize each word of a role string (e.g. "owner" → "Owner"). */
  const titleCase = r => String(r).split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  renderChart('cd-bnut-dist-chart', {
    type: 'doughnut',
    data: {
      labels: Object.keys(protoData).map(titleCase),
      datasets: [{
        data: Object.values(protoData),
        backgroundColor: [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2]],
        borderWidth: 2,
        borderColor: '#0a0a1e',
      }],
    },
    options: {
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: '#ccc', boxWidth: 14, font: { size: 11 } },
        },
      },
      cutout: '50%',
      responsive: true,
      maintainAspectRatio: false,
    },
  });

  // Ledger table
  const tableEl = document.getElementById('cd-ledger-table');
  if (tableEl) {
    if (stats.contributors.length === 0) {
      tableEl.innerHTML = '<p class="comm-loading">No contributor data available.</p>';
    } else {
      tableEl.innerHTML = `
        <table class="comm-ledger">
          <thead>
            <tr>
              <th>Contributor</th>
              <th>Role</th>
              <th>Issues Closed</th>
              <th>BNUT Earned</th>
            </tr>
          </thead>
          <tbody>
            ${stats.contributors.map(c => `
              <tr>
                <td class="comm-ledger-name">${escHtml(c.displayName)}</td>
                <td><span class="comm-role-badge comm-role-${escHtml(c.role)}">${escHtml(c.role)}</span></td>
                <td>${c.issuesClosed}</td>
                <td><strong>${c.bnutEarned.toLocaleString()}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p class="comm-ledger-note">🔒 Wallet addresses are not shown. Only display names and aggregate BNUT totals.</p>
      `;
    }
  }
}

// ─── Data Pool Tab ────────────────────────────────────────────────────────────

function buildDataPreview(data, optIn) {
  const preview = {};

  if (optIn.exercise !== false) {
    const entries = data?.exercises?.entries || [];
    const typeFreq = freq(entries.map(e => e.type || 'Unknown'));
    const totalReps = entries.reduce((sum, e) => {
      if (Array.isArray(e.sets)) return sum + e.sets.reduce((s, r) => s + (parseInt(r.reps) || 0), 0);
      return sum + (parseInt(e.reps) || 0);
    }, 0);
    preview.exercise = {
      totalEntries: entries.length,
      totalReps,
      topActivities: topN(typeFreq, 3).map(e => e.name),
    };
  }

  if (optIn.nutrition !== false) {
    const foods = data?.foods || [];
    const supps = data?.supplements || [];
    preview.nutrition = {
      totalFoodLogs:  foods.length,
      totalSuppLogs:  supps.length,
      uniqueFoods:    [...new Set(foods.map(f => f.name))].length,
    };
  }

  if (optIn.weight !== false) {
    const wlogs = data?.weightLogs || [];
    const meas  = data?.measurements || [];
    const weights = wlogs.map(w => parseFloat(w.weight)).filter(Boolean);
    const avg = weights.length
      ? (weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(1)
      : null;
    preview.weightAndMeasurements = {
      weightLogCount:      wlogs.length,
      measurementLogCount: meas.length,
      avgWeightAnonymized: avg ? `${avg} (units vary per user)` : null,
    };
  }

  if (optIn.supplements !== false) {
    const supps = data?.supplements || [];
    const suppFreq = freq(supps.map(s => s.name || 'Unknown'));
    preview.supplements = {
      totalLogs:  supps.length,
      topSupplements: topN(suppFreq, 3).map(s => s.name),
    };
  }

  return preview;
}

function renderDataPoolTab(data, optIn) {
  // Restore toggle states
  ['exercise', 'nutrition', 'weight', 'supplements'].forEach(key => {
    const checkbox = document.getElementById(`cd-opt-${key}`);
    if (checkbox) {
      checkbox.checked = optIn[key] !== false;
    }
  });

  // Live preview
  refreshDataPreview(data, optIn);
}

function refreshDataPreview(data, optIn) {
  const previewEl = document.getElementById('cd-data-preview');
  if (!previewEl) return;
  const preview = buildDataPreview(data, optIn);
  if (Object.keys(preview).length === 0) {
    previewEl.textContent = '(No data selected — toggle categories above to see what would be shared)';
  } else {
    previewEl.textContent = JSON.stringify(preview, null, 2);
  }
}

// ─── Tab Switcher ─────────────────────────────────────────────────────────────

function initTabs(modal) {
  const tabs    = modal.querySelectorAll('.comm-tab');
  const panels  = modal.querySelectorAll('.comm-tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      panels.forEach(p => p.classList.add('comm-hidden'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const target = modal.querySelector(`#comm-tab-${tab.dataset.tab}`);
      if (target) target.classList.remove('comm-hidden');
    });
  });
}

// ─── HTML escaping ────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Main init ────────────────────────────────────────────────────────────────

/**
 * initCommunityDashboard()
 *
 * Call once on DOMContentLoaded.  Wires up the open/close logic for the
 * data-sharing modal and populates all four tabs.
 */
export function initCommunityDashboard() {
  const modal     = document.getElementById('data-sharing-modal');
  const openBtn   = document.getElementById('aes-data-btn');
  const closeBtn  = document.getElementById('data-sharing-modal-close');
  if (!modal) return;

  let bnutStatsCache = null;

  async function openDashboard() {
    modal.classList.remove('modal-hidden');
    document.body.classList.add('modal-active');
    await refreshDashboard();
  }

  function closeDashboard() {
    modal.classList.add('modal-hidden');
    if (!document.querySelector('.modal-overlay:not(.modal-hidden)')) {
      document.body.classList.remove('modal-active');
    }
  }

  async function refreshDashboard() {
    const data  = loadLocalData() || {};
    const optIn = loadOptIn();

    // Exercise tab
    const exStats = buildExerciseStats(data);
    renderExerciseTab(exStats);

    // Nutrition tab
    const nuStats = buildNutritionStats(data);
    renderNutritionTab(nuStats);

    // $BNUT tab (async, cached after first load)
    if (!bnutStatsCache) {
      bnutStatsCache = await buildBnutStats();
    }
    renderBnutTab(bnutStatsCache);

    // Data Pool tab
    renderDataPoolTab(data, optIn);
    wireOptInToggles(data);
  }

  function wireOptInToggles(data) {
    ['exercise', 'nutrition', 'weight', 'supplements'].forEach(key => {
      const checkbox = document.getElementById(`cd-opt-${key}`);
      if (!checkbox) return;
      // Skip if already wired to avoid duplicate bindings
      if (checkbox.dataset.wired) return;
      checkbox.dataset.wired = '1';
      const optIn = loadOptIn();
      checkbox.checked = optIn[key] !== false;
      checkbox.addEventListener('change', () => {
        const current = loadOptIn();
        current[key] = checkbox.checked;
        saveOptIn(current);
        refreshDataPreview(data, loadOptIn());
      });
    });
  }

  // Wire open button (overriding the stubModals handler set in app.js)
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      if (typeof window.closeAesDropdown === 'function') window.closeAesDropdown();
      openDashboard();
    });
  }

  // Wire close button
  if (closeBtn) {
    closeBtn.addEventListener('click', closeDashboard);
  }

  // Backdrop click
  modal.addEventListener('click', e => {
    if (e.target === modal) closeDashboard();
  });

  // Tab switching
  initTabs(modal);
}
