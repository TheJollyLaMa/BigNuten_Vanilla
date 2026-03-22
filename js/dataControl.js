// js/dataControl.js
// Unified "Choose Your Data Option" flow for BigNuten.
//
// Storage modes (saved to localStorage key 'storageMode'):
//   'json-only'     — Download / Import JSON files only (default, no account needed)
//   'own-w3s'       — User's own web3.storage / Storacha space
//   'decent-agency' — Project-managed space (opt-in, with clear privacy caveats)

import { normalizeFitnessData } from './fitnessData.js';

const STORAGE_KEY      = 'fitnessTrackerData';
const STORAGE_MODE_KEY = 'storageMode';

/** Human-readable labels for each storage mode. */
export const STORAGE_MODE_LABELS = {
  'json-only':     '📁 JSON File (local)',
  'own-w3s':       '🔗 Your Own web3.storage',
  'decent-agency': '☁️ DecentAgency Storage',
};

// ── Public mode helpers ───────────────────────────────────────────────────────

export function getStorageMode() {
  return localStorage.getItem(STORAGE_MODE_KEY) || 'json-only';
}

export function setStorageMode(mode) {
  localStorage.setItem(STORAGE_MODE_KEY, mode);
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

  // Tab switching
  modal.querySelectorAll('.dc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.dc-tab').forEach(t => t.classList.remove('dc-tab-active'));
      modal.querySelectorAll('.dc-panel').forEach(p => { p.hidden = true; });
      tab.classList.add('dc-tab-active');
      const target = document.getElementById(tab.dataset.panel);
      if (target) target.hidden = false;
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
      // Activating JSON mode after a successful manual import
      setStorageMode('json-only');
      _refreshCurrentBadge();
    } catch (err) {
      _showStatus('dc-json-status', `❌ ${err.message}`, 'error');
    }
    importInput.value = ''; // allow re-selecting the same file
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
        const short = result.spaceDid.slice(0, 22) + '…';
        _showStatus('dc-w3s-status', `✅ Connected — space: ${short}`, 'success');
      } else {
        _showStatus('dc-w3s-status', '❌ Connection cancelled or failed. Try again.', 'error');
      }
    } catch (err) {
      _showStatus('dc-w3s-status', `❌ ${err.message}`, 'error');
    }
  });

  // ── Option 3: DecentAgency opt-in ───────────────────────────────────────
  document.getElementById('dc-decent-optin-btn')?.addEventListener('click', () => {
    const spaceDid = (window.CONTRACTS || {}).decentAgencySpaceDid || '';
    if (!spaceDid) {
      _showStatus(
        'dc-decent-status',
        '🔜 Managed storage is not yet configured. Check back soon or use JSON export in the meantime.',
        'info',
      );
      return;
    }
    setStorageMode('decent-agency');
    _refreshCurrentBadge();
    _showStatus(
      'dc-decent-status',
      '✅ Opted in to DecentAgency managed storage. Your data will be uploaded to the project\'s IPFS space on the next snapshot.',
      'success',
    );
  });

  // ── Switch-away / reset to JSON-only ────────────────────────────────────
  document.getElementById('dc-reset-mode-btn')?.addEventListener('click', () => {
    setStorageMode('json-only');
    _refreshCurrentBadge();
    _showStatus('dc-reset-status', '✅ Switched back to JSON-only mode.', 'success');
  });

  _refreshCurrentBadge();
}

// ── Open / close (also exported for external callers) ────────────────────────

export function openDataControlModal() {
  const modal = document.getElementById('data-control-modal');
  if (!modal) return;
  modal.classList.remove('modal-hidden');
  document.body.classList.add('modal-active');
  _refreshCurrentBadge();
  // Activate the first tab by default each open
  const firstTab   = modal.querySelector('.dc-tab');
  const firstPanel = firstTab && document.getElementById(firstTab.dataset.panel);
  if (firstTab && firstPanel) {
    modal.querySelectorAll('.dc-tab').forEach(t => t.classList.remove('dc-tab-active'));
    modal.querySelectorAll('.dc-panel').forEach(p => { p.hidden = true; });
    firstTab.classList.add('dc-tab-active');
    firstPanel.hidden = false;
  }
}

export function closeDataControlModal() {
  const modal = document.getElementById('data-control-modal');
  if (!modal) return;
  modal.classList.add('modal-hidden');
  if (!document.querySelector('.modal-overlay:not(.modal-hidden)')) {
    document.body.classList.remove('modal-active');
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

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
