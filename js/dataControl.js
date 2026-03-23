// js/dataControl.js
// Unified "Choose Your Data Option" flow for BigNuten.
//
// Storage modes (saved to localStorage key 'storageMode'):
//   'decent-agency' — Project-managed IPFS space via DecentAgency (DEFAULT for new users)
//   'own-w3s'       — User's own web3.storage / Storacha space
//   'json-only'     — Download / Import JSON files only (no IPFS)

import { normalizeFitnessData } from './fitnessData.js';

const STORAGE_KEY         = 'fitnessTrackerData';
const STORAGE_MODE_KEY    = 'storageMode';
const FIRST_VISIT_KEY     = 'dcFirstVisitDone';

/** Human-readable labels for each storage mode. */
export const STORAGE_MODE_LABELS = {
  'decent-agency': '☁️ DecentAgency Storage',
  'own-w3s':       '🔗 Your Own web3.storage',
  'json-only':     '📁 JSON File (local)',
};

// ── Public mode helpers ───────────────────────────────────────────────────────

export function getStorageMode() {
  // Default is now decent-agency for new users
  return localStorage.getItem(STORAGE_MODE_KEY) || 'decent-agency';
}

export function setStorageMode(mode) {
  localStorage.setItem(STORAGE_MODE_KEY, mode);
  _applyIpfsIndicator(mode);
}

// ── JSON Export ───────────────────────────────────────────────────────────────

export function exportDataAsJSON() {
  const raw  = localStorage.getItem(STORAGE_KEY);
  const data = raw ? JSON.parse(raw) : {};
  const date = new Date().toISOString().slice(0, 10);
  const filename = `bignuten-backup-${date}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── JSON Import ───────────────────────────────────────────────────────────────

export function importDataFromJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed     = JSON.parse(e.target.result);
        const normalized = normalizeFitnessData(parsed);
        const existing   = (() => {
          try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
          catch { return {}; }
        })();
        const merged = _mergeData(existing, normalized);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        resolve(merged);
      } catch (err) {
        reject(new Error('Invalid JSON file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

function _mergeData(existing, imported) {
  const merged = { ...imported };

  // Deduplicate array fields by timestamp / date string
  for (const key of ['weightLogs', 'supplements', 'foods', 'measurements', 'sessionLog']) {
    const existArr  = existing[key]  || [];
    const importArr = imported[key]  || [];
    const seen      = new Set(existArr.map(e => e.timestamp || e.date || JSON.stringify(e)));
    const newItems  = importArr.filter(e => !seen.has(e.timestamp || e.date || JSON.stringify(e)));
    merged[key]     = [...existArr, ...newItems];
  }

  // Merge exercises
  const existEx   = existing.exercises  || { types: [], entries: [] };
  const importEx  = imported.exercises  || { types: [], entries: [] };
  const seenEx    = new Set((existEx.entries || []).map(e => e.timestamp || JSON.stringify(e)));
  const newEx     = (importEx.entries || []).filter(e => !seenEx.has(e.timestamp || JSON.stringify(e)));
  merged.exercises = {
    types:   [...new Set([...(existEx.types || []), ...(importEx.types || [])])],
    entries: [...(existEx.entries || []), ...newEx],
  };

  return merged;
}

// ── Modal init ────────────────────────────────────────────────────────────────

/**
 * initDataControlModal({ connectW3upClient })
 *
 * Call once after DOMContentLoaded.  Pass the connectW3upClient function from
 * w3upClient.js so this module can trigger the "connect own storage" flow.
 */
export function initDataControlModal({ connectW3upClient: connectFn } = {}) {
  const modal    = document.getElementById('data-control-modal');
  const closeBtn = document.getElementById('data-control-modal-close');

  if (!modal) return;

  // Open from any element with class .open-data-control-modal
  document.querySelectorAll('.open-data-control-modal').forEach(btn => {
    btn.addEventListener('click', openDataControlModal);
  });

  // Close
  closeBtn?.addEventListener('click', closeDataControlModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeDataControlModal();
  });

  // ── Path card click to highlight ─────────────────────────────────────────
  modal.querySelectorAll('.dc-path-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't steal clicks from buttons/links inside the card
      if (e.target.closest('button, a, input, details')) return;
      modal.querySelectorAll('.dc-path-card').forEach(c => c.classList.remove('dc-path-active'));
      card.classList.add('dc-path-active');
    });
  });

  // ── Option 1: JSON Export ────────────────────────────────────────────────
  document.getElementById('dc-export-btn')?.addEventListener('click', () => {
    try {
      exportDataAsJSON();
      _showStatus('dc-json-status', '✅ Download started — check your Downloads folder.', 'success');
    } catch (err) {
      _showStatus('dc-json-status', `❌ Export failed: ${err.message}`, 'error');
    }
  });

  // ── Option 1: JSON Import ────────────────────────────────────────────────
  const importInput = document.getElementById('dc-import-file');
  document.getElementById('dc-import-btn')?.addEventListener('click', () => {
    importInput?.click();
  });

  importInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    _showStatus('dc-json-status', '⏳ Importing…', 'info');
    try {
      const merged = await importDataFromJSONFile(file);
      const count  = _countEntries(merged);
      _showStatus('dc-json-status', `✅ Import complete — ${count} total entries loaded.`, 'success');
    } catch (err) {
      _showStatus('dc-json-status', `❌ ${err.message}`, 'error');
    }
    importInput.value = ''; // allow re-selecting the same file
  });

  // ── About modal JSON download button ────────────────────────────────────
  document.getElementById('about-json-download-btn')?.addEventListener('click', () => {
    try {
      exportDataAsJSON();
      _showStatus('about-json-status', '✅ Download started — check your Downloads folder.', 'success');
    } catch (err) {
      _showStatus('about-json-status', `❌ Export failed: ${err.message}`, 'error');
    }
  });

  // ── Option 2: Connect own web3.storage ──────────────────────────────────
  document.getElementById('dc-own-w3s-btn')?.addEventListener('click', async () => {
    if (typeof connectFn !== 'function') {
      _showStatus('dc-w3s-status', '⚠️ Web3.Storage client not available on this page.', 'error');
      return;
    }
    _showStatus('dc-w3s-status', '⏳ Connecting to your web3.storage account…', 'info');
    try {
      const result = await connectFn();
      if (result?.spaceDid) {
        setStorageMode('own-w3s');
        _refreshCurrentBadge();
        _highlightActiveCard('own-w3s');
        const short = result.spaceDid.slice(0, 22) + '…';
        _showStatus('dc-w3s-status', `✅ Connected — space: ${short}`, 'success');
      } else {
        _showStatus('dc-w3s-status', '❌ Connection cancelled or failed. Try again.', 'error');
      }
    } catch (err) {
      _showStatus('dc-w3s-status', `❌ ${err.message}`, 'error');
    }
  });

  // ── Option 3: DecentAgency (default) ────────────────────────────────────
  document.getElementById('dc-decent-optin-btn')?.addEventListener('click', () => {
    setStorageMode('decent-agency');
    _refreshCurrentBadge();
    _highlightActiveCard('decent');
    _showStatus(
      'dc-decent-status',
      '✅ Using DecentAgency storage — snapshots will be pinned to our IPFS space.',
      'success',
    );
    // Mark first-visit as done (in case they clicked through)
    localStorage.setItem(FIRST_VISIT_KEY, '1');
  });

  // ── Switch-away / reset to JSON-only ────────────────────────────────────
  document.getElementById('dc-reset-mode-btn')?.addEventListener('click', () => {
    setStorageMode('json-only');
    _refreshCurrentBadge();
    _highlightActiveCard(null);
    _showStatus('dc-reset-status', '✅ Switched to JSON-only — no IPFS uploads will occur.', 'success');
    localStorage.setItem(FIRST_VISIT_KEY, '1');
  });

  // ── Apply initial indicator and badge ───────────────────────────────────
  _applyIpfsIndicator(getStorageMode());
  _refreshCurrentBadge();
  _highlightActiveCard(_modeToCardPath(getStorageMode()));

  // ── First-visit auto-open ────────────────────────────────────────────────
  if (!localStorage.getItem(FIRST_VISIT_KEY)) {
    // Wait for two animation frames so the page is fully painted before
    // displaying the modal, avoiding a jarring flash on load.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      openDataControlModal();
    }));
  }
}

// ── Open / close (also exported for external callers) ────────────────────────

export function openDataControlModal() {
  const modal = document.getElementById('data-control-modal');
  if (!modal) return;
  modal.classList.remove('modal-hidden');
  document.body.classList.add('modal-active');
  _refreshCurrentBadge();
  _highlightActiveCard(_modeToCardPath(getStorageMode()));
}

export function closeDataControlModal() {
  const modal = document.getElementById('data-control-modal');
  if (!modal) return;
  // Mark first visit done when user closes the modal
  localStorage.setItem(FIRST_VISIT_KEY, '1');
  modal.classList.add('modal-hidden');
  if (!document.querySelector('.modal-overlay:not(.modal-hidden)')) {
    document.body.classList.remove('modal-active');
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _modeToCardPath(mode) {
  if (mode === 'decent-agency') return 'decent';
  if (mode === 'own-w3s')       return 'own-w3s';
  return null; // json-only — no IPFS path card highlighted
}

function _highlightActiveCard(pathKey) {
  const modal = document.getElementById('data-control-modal');
  if (!modal) return;
  modal.querySelectorAll('.dc-path-card').forEach(card => {
    card.classList.toggle('dc-path-active', card.dataset.path === pathKey);
  });
}

function _applyIpfsIndicator(mode) {
  const icon       = document.getElementById('ipfsIcon');
  const statusRing = document.getElementById('ipfs-status');

  if (!icon) return;

  icon.dataset.storageMode = mode;
  if (statusRing) statusRing.dataset.storageMode = mode;

  // Update ticker letter colours to match mode
  document.querySelectorAll('.ticker-letter').forEach(el => {
    el.dataset.storageMode = mode;
  });

  // Tooltip update
  const tipMap = {
    'decent-agency': '☁️ DecentAgency IPFS — blue glow',
    'own-w3s':       '🔗 Your own Storacha space — green glow',
    'json-only':     '📁 JSON-only — dimmed (no IPFS uploads)',
  };
  icon.title = tipMap[mode] || 'IPFS Storage';
}

function _showStatus(elId, msg, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className   = `dc-status dc-status-${type}`;
}

function _countEntries(data) {
  let n = 0;
  for (const v of Object.values(data || {})) {
    if (Array.isArray(v)) n += v.length;
    else if (v && typeof v === 'object' && Array.isArray(v.entries)) n += v.entries.length;
  }
  return n;
}

function _refreshCurrentBadge() {
  const mode = getStorageMode();
  const text = STORAGE_MODE_LABELS[mode] || mode;

  // Update all mode badges (modal + about section)
  for (const id of ['dc-current-mode', 'dc-about-mode-badge']) {
    const badge = document.getElementById(id);
    if (!badge) continue;
    badge.textContent  = text;
    badge.dataset.mode = mode;
  }
}
