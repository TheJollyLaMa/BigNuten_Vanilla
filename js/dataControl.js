// js/dataControl.js
// BigNuten Data Control — IPFS education, connection state, snapshot panel, JSON backup/restore.
//
// Storage modes (saved to localStorage key 'storageMode'):
//   'own-w3s'   — User has connected their own Storacha/web3.storage space (IPFS enabled)
//   'json-only' — No IPFS connected; local browser only (DEFAULT for new users)

import { normalizeFitnessData, mergeSnapshotData, importAndMergeFromCID } from './fitnessData.js';

const STORAGE_KEY        = 'fitnessTrackerData';
const STORAGE_MODE_KEY   = 'storageMode';
const EDUC_SEEN_KEY      = 'ipfsEducationSeen';

/** Human-readable labels for each storage mode. */
export const STORAGE_MODE_LABELS = {
  'own-w3s':   '🔗 Your Own Storacha Space',
  'json-only': '📁 JSON File (local)',
};

// ── Public mode helpers ───────────────────────────────────────────────────────

export function getStorageMode() {
  return localStorage.getItem(STORAGE_MODE_KEY) || 'json-only';
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
        // Use mergeSnapshotData — the single deduplication function
        const merged = mergeSnapshotData(existing, normalized);
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

// ── Main init ─────────────────────────────────────────────────────────────────

/**
 * initDataControl({ connectW3upClient, tryAutoRestoreW3upClient, uploadDataToIPFS })
 *
 * Call once after DOMContentLoaded.
 */
export function initDataControl({
  connectW3upClient: connectFn,
  tryAutoRestoreW3upClient: restoreFn,
  uploadDataToIPFS: uploadFn,
} = {}) {

  // Expose upload reference for icon click handler
  window._ipfsUploadFn = uploadFn;
  window._ipfsConnectFn = connectFn;

  // Wire About-modal JSON download button
  document.getElementById('about-json-download-btn')?.addEventListener('click', () => {
    try {
      exportDataAsJSON();
      _showStatus('about-json-status', '✅ Download started.', 'success');
    } catch (err) {
      _showStatus('about-json-status', `❌ ${err.message}`, 'error');
    }
  });

  // Apply initial visual state
  _applyIpfsIndicator(getStorageMode());

  // ── IPFS icon click ────────────────────────────────────────────────────────
  const ipfsIconEl = document.getElementById('ipfsIcon');
  if (ipfsIconEl && !ipfsIconEl._dataControlListenerAdded) {
    ipfsIconEl.addEventListener('click', _handleIpfsIconClick);
    ipfsIconEl._dataControlListenerAdded = true;
  }

  // ── Educational overlay buttons ────────────────────────────────────────────
  document.getElementById('ipfs-edu-connect-btn')?.addEventListener('click', async () => {
    await _doConnect(connectFn);
  });

  document.getElementById('ipfs-edu-skip-btn')?.addEventListener('click', () => {
    setStorageMode('json-only');
    localStorage.setItem(EDUC_SEEN_KEY, '1');
    _closeOverlay();
  });

  // ── Condensed connect dialog buttons ──────────────────────────────────────
  document.getElementById('ipfs-dialog-connect-btn')?.addEventListener('click', async () => {
    await _doConnect(connectFn);
    _closeConnectDialog();
  });

  document.getElementById('ipfs-dialog-close-btn')?.addEventListener('click', () => {
    _closeConnectDialog();
  });

  // ── Snapshot panel ────────────────────────────────────────────────────────
  _initSnapshotPanel();

  // ── First-visit: show educational overlay ─────────────────────────────────
  const educSeen = localStorage.getItem(EDUC_SEEN_KEY);
  if (!educSeen) {
    // Check if already restored (returning user with session)
    if (typeof restoreFn === 'function') {
      restoreFn().then(result => {
        if (!result) {
          // No saved session — show overlay
          requestAnimationFrame(() => requestAnimationFrame(() => {
            _openOverlay();
          }));
        } else {
          // Session restored — mark as seen and apply mode
          localStorage.setItem(EDUC_SEEN_KEY, '1');
          setStorageMode('own-w3s');
        }
      }).catch(() => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          _openOverlay();
        }));
      });
    } else {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        _openOverlay();
      }));
    }
  }
}

// ── IPFS icon click handler ───────────────────────────────────────────────────

async function _handleIpfsIconClick() {
  const isMobile = _isMobile();
  const mode = getStorageMode();

  if (mode === 'own-w3s') {
    // Connected — push a snapshot then show the panel
    _openSnapshotPanel();
    const uploadFn = window._ipfsUploadFn;
    if (typeof uploadFn === 'function') {
      _setSnapshotPanelStatus('⏳ Pushing snapshot…', 'info');
      try {
        const raw  = localStorage.getItem('fitnessTrackerData');
        const data = raw ? JSON.parse(raw) : {};
        const client = window._w3upClientRef;
        const cid = await uploadFn(data, client);
        if (cid) {
          _setSnapshotPanelStatus(`✅ Pushed — CID: <a href="https://${cid}.ipfs.w3s.link/" target="_blank" rel="noopener noreferrer">${cid.slice(0,8)}…${cid.slice(-4)}</a>`, 'success');
          _renderSnapshotHistory();
        } else {
          _setSnapshotPanelStatus('⚠️ Upload returned no CID.', 'warning');
        }
      } catch (err) {
        _setSnapshotPanelStatus(`❌ Upload failed: ${err.message}`, 'error');
      }
    }
    return;
  }

  // Not connected
  if (isMobile) {
    _openSnapshotPanel(); // Show panel with CID import + mobile message
    return;
  }

  const educSeen = localStorage.getItem(EDUC_SEEN_KEY);
  if (educSeen) {
    // Returning user who dismissed — show condensed connect dialog
    _openConnectDialog();
  } else {
    _openOverlay();
  }
}

// ── Educational overlay ───────────────────────────────────────────────────────

export function _openOverlay() {
  const overlay = document.getElementById('ipfs-edu-overlay');
  if (!overlay) return;

  // Show/hide mobile notice
  const mobileNotice = document.getElementById('ipfs-edu-mobile-notice');
  if (mobileNotice) {
    mobileNotice.hidden = !_isMobile();
  }

  overlay.classList.remove('edu-hidden');
  document.body.classList.add('modal-active');
}

function _closeOverlay() {
  const overlay = document.getElementById('ipfs-edu-overlay');
  if (!overlay) return;
  overlay.classList.add('edu-hidden');
  if (!document.querySelector('.modal-overlay:not(.modal-hidden), #ipfs-edu-overlay:not(.edu-hidden)')) {
    document.body.classList.remove('modal-active');
  }
}

// ── Condensed connect dialog ──────────────────────────────────────────────────

function _openConnectDialog() {
  const dialog = document.getElementById('ipfs-connect-dialog');
  if (!dialog) return;
  dialog.classList.remove('modal-hidden');
  document.body.classList.add('modal-active');
}

function _closeConnectDialog() {
  const dialog = document.getElementById('ipfs-connect-dialog');
  if (!dialog) return;
  dialog.classList.add('modal-hidden');
  if (!document.querySelector('.modal-overlay:not(.modal-hidden)')) {
    document.body.classList.remove('modal-active');
  }
}

// ── Connect helper ────────────────────────────────────────────────────────────

async function _doConnect(connectFn) {
  const statusEl = document.getElementById('ipfs-edu-connect-status')
                || document.getElementById('ipfs-dialog-status');
  _showEl(statusEl, '⏳ Connecting — check your email for a login link…', 'info');

  if (typeof connectFn !== 'function') {
    _showEl(statusEl, '⚠️ Storacha client not available. Please reload and try again.', 'error');
    return;
  }

  try {
    const result = await connectFn();
    if (result?.spaceDid) {
      setStorageMode('own-w3s');
      localStorage.setItem(EDUC_SEEN_KEY, '1');
      // Store client ref for uploads
      if (result.client) window._w3upClientRef = result.client;
      _showEl(statusEl, `✅ Connected! Your space: ${result.spaceDid.slice(0, 20)}…`, 'success');
      setTimeout(() => {
        _closeOverlay();
        _closeConnectDialog();
      }, 1500);
    } else {
      _showEl(statusEl, '❌ Connection cancelled or failed. Try again.', 'error');
    }
  } catch (err) {
    _showEl(statusEl, `❌ ${err.message}`, 'error');
  }
}

// ── Snapshot panel ────────────────────────────────────────────────────────────

function _initSnapshotPanel() {
  const panel = document.getElementById('ipfs-snapshot-panel');
  if (!panel) return;

  // Close button
  document.getElementById('snapshot-panel-close')?.addEventListener('click', _closeSnapshotPanel);

  // CID import
  document.getElementById('snapshot-cid-import-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('snapshot-cid-input');
    const cid = input?.value?.trim();
    if (!cid) {
      _setSnapshotPanelStatus('⚠️ Please enter a CID.', 'warning');
      return;
    }
    _setSnapshotPanelStatus('⏳ Fetching from IPFS…', 'info');
    try {
      const result = await importAndMergeFromCID(cid);
      const { added } = result;
      _setSnapshotPanelStatus(
        `✅ Merged: ${added.weightLogs} weight log(s), ${added.exercises} exercise(s), ${added.sessionLog} session(s).`,
        'success'
      );
      if (input) input.value = '';
    } catch (err) {
      _setSnapshotPanelStatus(`❌ ${err.message}`, 'error');
    }
  });

  // JSON file import
  const jsonFileInput = document.getElementById('snapshot-json-import-file');
  document.getElementById('snapshot-json-import-btn')?.addEventListener('click', () => {
    jsonFileInput?.click();
  });

  jsonFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    _setSnapshotPanelStatus('⏳ Importing JSON…', 'info');
    try {
      const merged = await importDataFromJSONFile(file);
      const count  = _countEntries(merged);
      _setSnapshotPanelStatus(`✅ Import complete — ${count} total entries.`, 'success');
    } catch (err) {
      _setSnapshotPanelStatus(`❌ ${err.message}`, 'error');
    }
    if (jsonFileInput) jsonFileInput.value = '';
  });

  // JSON export
  document.getElementById('snapshot-json-export-btn')?.addEventListener('click', () => {
    try {
      exportDataAsJSON();
      _setSnapshotPanelStatus('✅ JSON backup downloaded.', 'success');
    } catch (err) {
      _setSnapshotPanelStatus(`❌ ${err.message}`, 'error');
    }
  });
}

export function _openSnapshotPanel() {
  const panel = document.getElementById('ipfs-snapshot-panel');
  if (!panel) return;
  panel.hidden = false;
  _renderSnapshotHistory();

  // Reflect mobile state
  const mobileMsg = document.getElementById('snapshot-panel-mobile-msg');
  if (mobileMsg) mobileMsg.hidden = !_isMobile();
}

function _closeSnapshotPanel() {
  const panel = document.getElementById('ipfs-snapshot-panel');
  if (panel) panel.hidden = true;
}

function _setSnapshotPanelStatus(html, type) {
  const el = document.getElementById('snapshot-panel-status');
  if (!el) return;
  el.innerHTML = html;
  el.className = `sp-status sp-status-${type}`;
}

function _renderSnapshotHistory() {
  const container = document.getElementById('snapshot-history-list');
  if (!container) return;

  const latestKey = Object.keys(localStorage)
    .filter(k => k.startsWith('fitnessTrackerSnapshot-'))
    .sort()
    .reverse()[0];

  let history = [];
  if (latestKey) {
    const latestSnapshot = (() => {
      try { return JSON.parse(localStorage.getItem(latestKey)); } catch { return null; }
    })();
    if (latestSnapshot?.data?.snapshotHistory) {
      history = latestSnapshot.data.snapshotHistory.map(e =>
        typeof e === 'string' ? { cid: e, timestamp: '' } : e
      );
    }
    if (latestSnapshot?.cid) {
      const ts = latestKey.split('fitnessTrackerSnapshot-')[1] || '';
      history.unshift({ cid: latestSnapshot.cid, timestamp: ts });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const items = history.slice(0, 7);

  if (items.length === 0) {
    container.innerHTML = '<div class="sp-history-empty">No snapshots yet.</div>';
    return;
  }

  container.innerHTML = items.map(h => {
    const isToday = h.timestamp && h.timestamp.startsWith(today);
    const dateStr = h.timestamp
      ? new Date(h.timestamp).toLocaleString()
      : '(No timestamp)';
    const short = `${h.cid.slice(0, 8)}…${h.cid.slice(-4)}`;
    return `<div class="sp-history-row${isToday ? ' sp-today' : ''}">
      <span class="sp-history-date">${dateStr}</span>
      <a class="sp-history-cid" href="https://${h.cid}.ipfs.w3s.link/" target="_blank" rel="noopener noreferrer">${short}</a>
      ${isToday ? '<span class="sp-today-badge">✅ today</span>' : ''}
    </div>`;
  }).join('');
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _isMobile() {
  return (
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    window.innerWidth < 768
  );
}

function _applyIpfsIndicator(mode) {
  const icon       = document.getElementById('ipfsIcon');
  const statusRing = document.getElementById('ipfs-status');

  if (!icon) return;

  icon.dataset.storageMode = mode;
  if (statusRing) statusRing.dataset.storageMode = mode;

  document.querySelectorAll('.ticker-letter').forEach(el => {
    el.dataset.storageMode = mode;
  });

  const tipMap = {
    'own-w3s':   '🔗 Your Storacha space — green glow. Click to push snapshot.',
    'json-only': '📁 JSON-only — dimmed (no IPFS). Click to connect Storacha.',
  };
  icon.title = tipMap[mode] || 'IPFS Storage';

  // Refresh about-modal badge if visible
  const badge = document.getElementById('dc-about-mode-badge');
  if (badge) {
    badge.textContent  = STORAGE_MODE_LABELS[mode] || mode;
    badge.dataset.mode = mode;
  }
}

function _showEl(el, msg, type) {
  if (!el) return;
  el.innerHTML   = msg;
  el.className   = `dc-status dc-status-${type}`;
  el.style.display = 'block';
}

function _showStatus(elId, msg, type) {
  _showEl(document.getElementById(elId), msg, type);
}

function _countEntries(data) {
  let n = 0;
  for (const v of Object.values(data || {})) {
    if (Array.isArray(v)) n += v.length;
    else if (v && typeof v === 'object' && Array.isArray(v.entries)) n += v.entries.length;
  }
  return n;
}

// Keep legacy exports for any external callers that import the old names
export { _openOverlay as openEducationalOverlay };
