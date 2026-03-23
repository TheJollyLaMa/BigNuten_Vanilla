/**
 * competition-admin.js — Competition & StreakBet Admin Panel
 *
 * Admin Panel features:
 *  - Define, edit, and schedule new competitions/challenges
 *  - Choose stake token: BNUT, USDC, or ETH
 *  - Set frequency, duration, self-report cycle, yield eligibility, etc.
 *  - Publish/view all open/archived streaks/competitions
 *  - See summary of results/stats
 */

// ─── Raw-fetch helpers ─────────────────────────────────────────────────────────

const RAW_BASE =
  'https://raw.githubusercontent.com/TheJollyLaMa/BigNuten_Vanilla/main/';

async function fetchCompetitions() {
  try {
    const r = await fetch(`${RAW_BASE}competitions.json`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch {
    // fall back to same-origin (works when running from GitHub Pages / local server)
    const r = await fetch('competitions.json');
    if (!r.ok) throw new Error('competitions.json not found');
    return r.json();
  }
}

// ─── Shared utility: trigger a JSON file download ─────────────────────────────

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── State ────────────────────────────────────────────────────────────────────

let _competitionsData = null;

async function ensureData() {
  if (!_competitionsData) {
    _competitionsData = await fetchCompetitions();
  }
}

// ─── Admin Competition Panel ──────────────────────────────────────────────────

export function initAdminCompetitions() {
  // Expose the loader globally
  window.__loadCompetitionsTable = loadCompetitionsTable;

  // "Add competition" button
  const addBtn = document.getElementById('admin-comp-add-btn');
  if (addBtn) addBtn.addEventListener('click', showAddCompetitionModal);

  // "Save / download JSON" button
  const saveBtn = document.getElementById('admin-comp-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveCompetitions);

  // Tab switching
  const compTabBtn = document.getElementById('admin-comp-tab-btn');
  const streakTabBtn = document.getElementById('admin-streak-tab-btn');
  const compPanel = document.getElementById('admin-comp-panel');
  const streakPanel = document.getElementById('admin-streak-panel');

  if (compTabBtn) compTabBtn.addEventListener('click', () => {
    compTabBtn.classList.add('admin-tab-active');
    streakTabBtn?.classList.remove('admin-tab-active');
    compPanel?.classList.remove('hidden');
    streakPanel?.classList.add('hidden');
  });

  if (streakTabBtn) streakTabBtn.addEventListener('click', () => {
    streakTabBtn.classList.add('admin-tab-active');
    compTabBtn?.classList.remove('admin-tab-active');
    streakPanel?.classList.remove('hidden');
    compPanel?.classList.add('hidden');
  });
}

// ─── Render the competitions table ────────────────────────────────────────────

async function loadCompetitionsTable() {
  const body = document.getElementById('admin-comp-table-body');
  const status = document.getElementById('admin-comp-status');
  if (!body) return;

  body.innerHTML = '<tr><td colspan="7" class="gov-loading">⏳ Loading…</td></tr>';
  if (status) status.textContent = '';

  try {
    await ensureData();
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7" class="gov-loading">❌ ${err.message}</td></tr>`;
    return;
  }

  const comps = _competitionsData.competitions || [];
  if (comps.length === 0) {
    body.innerHTML = '<tr><td colspan="7" class="gov-loading">No competitions created yet.</td></tr>';
    return;
  }

  body.innerHTML = comps.map((c, i) => {
    const statusBadge = c.status === 'active'
      ? '<span class="contrib-badge contrib-badge-registered">active</span>'
      : c.status === 'scheduled'
      ? '<span class="contrib-badge" style="background:#f0c040;color:#000;">scheduled</span>'
      : '<span class="contrib-badge" style="background:#666;color:#fff;">archived</span>';
    
    return `
      <tr data-index="${i}">
        <td class="contrib-td-github">${escapeHtml(c.name)}</td>
        <td>${c.stakeToken || 'BNUT'}</td>
        <td>${c.stakeAmount || 0}</td>
        <td>${c.frequency || 'once'}</td>
        <td>${c.duration || '7 days'}</td>
        <td>${statusBadge}</td>
        <td class="contrib-td-actions">
          <button class="gov-admin-action-btn comp-edit-btn" data-index="${i}" title="Edit competition">✏️</button>
          <button class="gov-admin-action-btn gov-admin-danger-btn comp-delete-btn" data-index="${i}" title="Delete competition">🗑️</button>
        </td>
      </tr>`;
  }).join('');

  // Edit buttons
  body.querySelectorAll('.comp-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = Number(e.currentTarget.dataset.index);
      showEditCompetitionModal(idx);
    });
  });

  // Delete buttons
  body.querySelectorAll('.comp-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = Number(e.currentTarget.dataset.index);
      const c = _competitionsData.competitions[idx];
      if (confirm(`Delete competition "${c.name}"? This cannot be undone without recommitting the JSON.`)) {
        _competitionsData.competitions.splice(idx, 1);
        loadCompetitionsTable();
      }
    });
  });
}

// ─── Add competition modal ─────────────────────────────────────────────────────

function showAddCompetitionModal() {
  const modal = document.getElementById('admin-add-comp-modal');
  const overlay = document.getElementById('admin-add-comp-overlay');
  if (modal) modal.classList.remove('hidden');
  if (overlay) overlay.classList.remove('hidden');
}

function hideAddCompetitionModal() {
  const modal = document.getElementById('admin-add-comp-modal');
  const overlay = document.getElementById('admin-add-comp-overlay');
  if (modal) modal.classList.add('hidden');
  if (overlay) overlay.classList.add('hidden');
}

export function initAddCompetitionModal() {
  const closeBtn = document.getElementById('admin-add-comp-close');
  const overlay = document.getElementById('admin-add-comp-overlay');
  const submitBtn = document.getElementById('admin-add-comp-submit');

  if (closeBtn) closeBtn.addEventListener('click', hideAddCompetitionModal);
  if (overlay) overlay.addEventListener('click', hideAddCompetitionModal);
  if (submitBtn) submitBtn.addEventListener('click', handleAddCompetition);
}

async function handleAddCompetition() {
  const nameInput = document.getElementById('admin-add-comp-name');
  const tokenInput = document.getElementById('admin-add-comp-token');
  const stakeInput = document.getElementById('admin-add-comp-stake');
  const freqInput = document.getElementById('admin-add-comp-freq');
  const durationInput = document.getElementById('admin-add-comp-duration');
  const cycleInput = document.getElementById('admin-add-comp-cycle');
  const yieldInput = document.getElementById('admin-add-comp-yield');
  const statusInput = document.getElementById('admin-add-comp-status-input');
  const statusEl = document.getElementById('admin-add-comp-status');

  const name = (nameInput?.value || '').trim();
  const stakeToken = (tokenInput?.value || 'BNUT').toUpperCase();
  const stakeAmount = Number(stakeInput?.value || 0);
  const frequency = (freqInput?.value || 'once');
  const duration = (durationInput?.value || '7 days');
  const selfReportCycle = (cycleInput?.value || 'daily');
  const yieldEligible = yieldInput?.checked || false;
  const status = (statusInput?.value || 'scheduled');

  if (!name) {
    if (statusEl) statusEl.textContent = '⚠️ Enter a competition name.';
    return;
  }

  try {
    await ensureData();
  } catch (err) {
    if (statusEl) statusEl.textContent = `❌ ${err.message}`;
    return;
  }

  _competitionsData.competitions.push({
    id: Date.now().toString(),
    name,
    stakeToken,
    stakeAmount,
    frequency,
    duration,
    selfReportCycle,
    yieldEligible,
    status,
    createdAt: new Date().toISOString(),
    participants: [],
    results: []
  });

  hideAddCompetitionModal();
  // Clear inputs
  [nameInput, stakeInput].forEach(el => { if (el) el.value = ''; });
  if (statusEl) statusEl.textContent = '';

  await loadCompetitionsTable();

  const adminStatus = document.getElementById('admin-comp-status');
  if (adminStatus) {
    adminStatus.textContent = `✅ "${name}" added. Click "💾 Save / Download JSON" to persist.`;
  }
}

// ─── Edit competition modal ─────────────────────────────────────────────────────

function showEditCompetitionModal(idx) {
  const comp = _competitionsData.competitions[idx];
  if (!comp) return;

  // Populate edit modal fields
  const nameInput = document.getElementById('admin-edit-comp-name');
  const tokenInput = document.getElementById('admin-edit-comp-token');
  const stakeInput = document.getElementById('admin-edit-comp-stake');
  const freqInput = document.getElementById('admin-edit-comp-freq');
  const durationInput = document.getElementById('admin-edit-comp-duration');
  const cycleInput = document.getElementById('admin-edit-comp-cycle');
  const yieldInput = document.getElementById('admin-edit-comp-yield');
  const statusInput = document.getElementById('admin-edit-comp-status-input');

  if (nameInput) nameInput.value = comp.name;
  if (tokenInput) tokenInput.value = comp.stakeToken || 'BNUT';
  if (stakeInput) stakeInput.value = comp.stakeAmount || 0;
  if (freqInput) freqInput.value = comp.frequency || 'once';
  if (durationInput) durationInput.value = comp.duration || '7 days';
  if (cycleInput) cycleInput.value = comp.selfReportCycle || 'daily';
  if (yieldInput) yieldInput.checked = comp.yieldEligible || false;
  if (statusInput) statusInput.value = comp.status || 'scheduled';

  const modal = document.getElementById('admin-edit-comp-modal');
  const overlay = document.getElementById('admin-edit-comp-overlay');
  if (modal) modal.classList.remove('hidden');
  if (overlay) overlay.classList.remove('hidden');

  // Wire up save button
  const saveBtn = document.getElementById('admin-edit-comp-save');
  if (saveBtn) {
    saveBtn.onclick = () => handleEditCompetition(idx);
  }
}

function hideEditCompetitionModal() {
  const modal = document.getElementById('admin-edit-comp-modal');
  const overlay = document.getElementById('admin-edit-comp-overlay');
  if (modal) modal.classList.add('hidden');
  if (overlay) overlay.classList.add('hidden');
}

export function initEditCompetitionModal() {
  const closeBtn = document.getElementById('admin-edit-comp-close');
  const overlay = document.getElementById('admin-edit-comp-overlay');

  if (closeBtn) closeBtn.addEventListener('click', hideEditCompetitionModal);
  if (overlay) overlay.addEventListener('click', hideEditCompetitionModal);
}

async function handleEditCompetition(idx) {
  const nameInput = document.getElementById('admin-edit-comp-name');
  const tokenInput = document.getElementById('admin-edit-comp-token');
  const stakeInput = document.getElementById('admin-edit-comp-stake');
  const freqInput = document.getElementById('admin-edit-comp-freq');
  const durationInput = document.getElementById('admin-edit-comp-duration');
  const cycleInput = document.getElementById('admin-edit-comp-cycle');
  const yieldInput = document.getElementById('admin-edit-comp-yield');
  const statusInput = document.getElementById('admin-edit-comp-status-input');
  const statusEl = document.getElementById('admin-edit-comp-status');

  const comp = _competitionsData.competitions[idx];
  if (!comp) return;

  comp.name = (nameInput?.value || '').trim();
  comp.stakeToken = (tokenInput?.value || 'BNUT').toUpperCase();
  comp.stakeAmount = Number(stakeInput?.value || 0);
  comp.frequency = (freqInput?.value || 'once');
  comp.duration = (durationInput?.value || '7 days');
  comp.selfReportCycle = (cycleInput?.value || 'daily');
  comp.yieldEligible = yieldInput?.checked || false;
  comp.status = (statusInput?.value || 'scheduled');

  hideEditCompetitionModal();
  if (statusEl) statusEl.textContent = '';

  await loadCompetitionsTable();

  const adminStatus = document.getElementById('admin-comp-status');
  if (adminStatus) {
    adminStatus.textContent = `✅ "${comp.name}" updated. Click "💾 Save / Download JSON" to persist.`;
  }
}

// ─── Save / download updated JSON ─────────────────────────────────────────────

async function saveCompetitions() {
  const status = document.getElementById('admin-comp-status');
  try {
    await ensureData();
  } catch (err) {
    if (status) status.textContent = `❌ ${err.message}`;
    return;
  }

  downloadJSON(_competitionsData, 'competitions.json');
  if (status) {
    status.innerHTML = '✅ competitions.json downloaded. Commit it to the repo to persist changes. ' +
      '<a href="https://github.com/TheJollyLaMa/BigNuten_Vanilla/blob/main/competitions.json" ' +
      'target="_blank" rel="noopener" style="color:#00e5ff;">View current file ↗</a>';
  }
}

// ─── Helper: escape HTML ───────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

// ─── Load streak bets table (placeholder for future implementation) ───────────

export async function loadStreakBetsTable() {
  const body = document.getElementById('admin-streak-table-body');
  if (!body) return;

  body.innerHTML = '<tr><td colspan="6" class="gov-loading">StreakBets coming soon…</td></tr>';
}
