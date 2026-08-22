// js/dataControl.js
// BigNuten Data Control — provider-agnostic backup, snapshot panel, JSON backup/restore.
//
// Storage modes (saved to localStorage key 'storageMode'):
//   'w3up'      — User has connected Pinata IPFS storage (encrypted snapshots)
//   'own-w3s'   — Legacy alias for 'w3up' (kept for backwards compatibility)
//   'json-only' — No remote storage; local browser only (DEFAULT for new users)

import { normalizeFitnessData, mergeSnapshotData, importAndMergeFromCID } from './fitnessData.js';
import { providerRegistry, loadSnapshotMeta } from './storageProvider.js';
import { getCurrentSnapshotPointer, getSnapshotLifecycleSummary, loadSnapshotManifest } from './snapshotLifecycle.js';
import { lighthouseGatewayUrl } from './lighthouseStorage.js';

const STORAGE_KEY        = 'fitnessTrackerData';
const STORAGE_MODE_KEY   = 'storageMode';
const EDUC_SEEN_KEY      = 'ipfsEducationSeen';

/** Human-readable labels for each storage mode. */
export const STORAGE_MODE_LABELS = {
  'w3up':      '🔐 Pinata',
  'own-w3s':   '🔐 Pinata',
  'json-only': '📁 JSON File (local)',
};

// ── Public mode helpers ───────────────────────────────────────────────────────

export function getStorageMode() {
  return localStorage.getItem(STORAGE_MODE_KEY) || 'json-only';
}

/** Map legacy 'own-w3s' to 'w3up' for the provider registry. */
function _modeToProviderId(mode) {
  return mode === 'own-w3s' ? 'w3up' : mode;
}

export function setStorageMode(mode) {
  localStorage.setItem(STORAGE_MODE_KEY, mode);
  const providerId = _modeToProviderId(mode);
  try { providerRegistry.setActive(providerId); } catch { /* provider not registered yet — no-op */ }
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
 * initDataControl(options)
 *
 * Call once after DOMContentLoaded.
 *
 * Preferred usage (provider-agnostic):
 *   initDataControl({ provider: providerRegistry.get('w3up') })
 *
 * Legacy usage still accepted for backwards compatibility:
 *   initDataControl({ connectW3upClient, tryAutoRestoreW3upClient, uploadDataToIPFS })
 */
export function initDataControl({
  provider: providerArg,
  connectW3upClient: connectFn,
  tryAutoRestoreW3upClient: restoreFn,
  uploadDataToIPFS: uploadFn,
} = {}) {

  // If a provider is passed, expose its methods as legacy callbacks so the
  // rest of this function works unchanged.
  const activeProvider = providerArg ?? null;

  if (activeProvider && !connectFn) {
    connectFn = () => activeProvider.connect().then(r => {
      if (r.connected) return { spaceDid: r.identity, client: activeProvider.client ?? null };
      return null;
    });
  }
  if (activeProvider && !restoreFn) {
    restoreFn = () => activeProvider.restore().then(r => {
      if (r?.connected) return { spaceDid: r.identity };
      return null;
    });
  }
  if (activeProvider && !uploadFn) {
    uploadFn = (data) => activeProvider.put(data).then(r => r.cid);
  }

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
    _closeOverlay();
    document.getElementById('ipfs-dialog-connect-btn')?.click();
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

  // ── Mobile data sheet buttons ─────────────────────────────────────────────
  document.getElementById('mobile-sheet-close-btn')?.addEventListener('click', _closeMobileDataSheet);

  document.getElementById('mobile-sheet-export-btn')?.addEventListener('click', () => {
    try {
      exportDataAsJSON();
      _showStatus('mobile-sheet-status', '✅ Download started.', 'success');
    } catch (err) {
      _showStatus('mobile-sheet-status', `❌ ${err.message}`, 'error');
    }
  });

  const mobileSheetImportFile = document.getElementById('mobile-sheet-import-file');
  document.getElementById('mobile-sheet-import-btn')?.addEventListener('click', () => {
    mobileSheetImportFile?.click();
  });

  mobileSheetImportFile?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    _showStatus('mobile-sheet-status', '⏳ Importing…', 'info');
    try {
      const merged = await importDataFromJSONFile(file);
      const count  = _countEntries(merged);
      _showStatus('mobile-sheet-status', `✅ Imported — ${count} total entries.`, 'success');
    } catch (err) {
      _showStatus('mobile-sheet-status', `❌ ${err.message}`, 'error');
    }
    if (mobileSheetImportFile) mobileSheetImportFile.value = '';
  });

  // ── First-visit: show educational overlay ─────────────────────────────────
  // On mobile, never show the overlay — silently default to json-only
  if (_isMobile()) {
    if (!localStorage.getItem(STORAGE_MODE_KEY)) {
      setStorageMode('json-only');
    }
    localStorage.setItem(EDUC_SEEN_KEY, '1');
    return;
  }

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
          setStorageMode('w3up');
          if (activeProvider?.client && typeof window._bignutenScheduleHourlySnapshot === 'function') {
            try {
              window._bignutenScheduleHourlySnapshot(activeProvider.client, activeProvider.put.bind(activeProvider));
            } catch (err) {
              console.warn('[DataControl] Failed to start hourly Pinata snapshots after restore:', err);
            }
          }
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
  const isConnected = mode === 'w3up' || mode === 'own-w3s';

  if (isConnected) {
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
          const short = `${cid.slice(0,8)}…${cid.slice(-4)}`;
          const isHash = !cid.startsWith('bafy');
          const link = isHash
            ? `<code>${short}</code>`
            : `<a href="${lighthouseGatewayUrl(cid)}" target="_blank" rel="noopener noreferrer">${short}</a>`;
          _setSnapshotPanelStatus(`✅ Pushed — ${link}`, 'success');
          localStorage.setItem('lastAutoSnapshotTimestamp', String(Date.now()));
          _renderSnapshotHistory();
          // Refresh About section last-backup timestamp
          _applyIpfsIndicator(getStorageMode());
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
    _openMobileDataSheet(); // Show clean mobile bottom-sheet with JSON backup options
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
  // On mobile, never show the IPFS educational overlay
  if (_isMobile()) return;

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

export function _openConnectDialog() {
  const dialog = document.getElementById('ipfs-connect-dialog');
  if (!dialog) return;
  dialog.classList.remove('modal-hidden');
  document.body.classList.add('modal-active');
  dialog.style.zIndex = '200010';
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
  _showEl(statusEl, '⏳ Signing in — approve the wallet prompt to unlock Pinata…', 'info');

  if (typeof connectFn !== 'function') {
    _showEl(statusEl, '⚠️ Storage provider not available. Please reload and try again.', 'error');
    return;
  }

  try {
    const result = await connectFn();
    const identity = result?.spaceDid || result?.identity || null;
    if (identity || result?.connected) {
      setStorageMode('w3up');
      localStorage.setItem(EDUC_SEEN_KEY, '1');
      // Store client ref for legacy upload path
      if (result.client) window._w3upClientRef = result.client;
      if (result.client && typeof window._bignutenScheduleHourlySnapshot === 'function' && activeProvider?.put) {
        try {
          window._bignutenScheduleHourlySnapshot(result.client, activeProvider.put.bind(activeProvider));
        } catch (err) {
          console.warn('[DataControl] Failed to start hourly Pinata snapshots after connect:', err);
        }
      }
      _showEl(statusEl, identity ? `✅ Signed in! Space: ${identity.slice(0, 20)}…` : '✅ Signed in to Pinata!', 'success');
      document.getElementById('about-modal')?.classList.add('modal-hidden');
      setTimeout(() => {
        _closeOverlay();
        _closeConnectDialog();
      }, 1500);
    } else {
      _showEl(statusEl, `❌ ${result?.error || 'Connection cancelled or failed. Try again.'}`, 'error');
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

  const manifest = loadSnapshotManifest();
  const lifecycle = getSnapshotLifecycleSummary();
  let history = manifest.snapshots.slice(0, 7).map(m => ({
    cid: m.cid || m.hash || '',
    hash: m.hash,
    timestamp: m.timestamp,
    provider: m.provider,
    tier: m.archiveTier || m.tier || 'hourly',
    verified: m.verified,
    status: m.status,
  }));

  if (!history.length) {
    const metas = loadSnapshotMeta();
    history = metas.slice(0, 7).map(m => ({
      cid: m.cid || m.hash || '',
      hash: m.hash,
      timestamp: m.timestamp,
      provider: m.provider,
      tier: m.archiveTier || m.tier || 'hourly',
      verified: true,
      status: m.status,
    }));
  }

  const today = new Date().toISOString().slice(0, 10);
  const items = history.slice(0, 7);

  if (items.length === 0) {
    container.innerHTML = `<div class="sp-history-empty">No snapshots yet. Retention: ${lifecycle.retention.hourlyKeep} hourly / ${lifecycle.retention.monthlyKeepMonths} monthly / ${lifecycle.retention.annualKeepYears} annual.</div>`;
    return;
  }

  container.innerHTML = items.map(h => {
    const isToday = h.timestamp && h.timestamp.startsWith(today);
    const dateStr = h.timestamp
      ? new Date(h.timestamp).toLocaleString()
      : '(No timestamp)';
    const ref = h.cid || h.hash || '';
    const short = ref.length > 12 ? `${ref.slice(0, 8)}…${ref.slice(-4)}` : ref;
    const isIpfsCid = ref.startsWith('bafy') || ref.startsWith('Qm');
    const refLink = isIpfsCid
      ? `<a class="sp-history-cid" href="${lighthouseGatewayUrl(ref)}" target="_blank" rel="noopener noreferrer">${short}</a>`
      : `<code class="sp-history-cid">${short}</code>`;
    const providerBadge = h.provider ? `<span class="sp-provider-badge">${h.provider}</span>` : '';
    const tierBadge = h.tier ? `<span class="sp-provider-badge">${h.tier}</span>` : '';
    const pointerBadge = manifest.current?.cid === h.cid ? '<span class="sp-today-badge">📌 pointer</span>' : '';
    const verifiedBadge = h.verified === false ? '<span class="sp-today-badge">⚠️ unverified</span>' : '';
    return `<div class="sp-history-row${isToday ? ' sp-today' : ''}">
      <span class="sp-history-date">${dateStr}</span>
      ${refLink}
      ${providerBadge}
      ${tierBadge}
      ${pointerBadge}
      ${verifiedBadge}
      ${isToday ? '<span class="sp-today-badge">✅ today</span>' : ''}
    </div>`;
  }).join('');
}

// ── Mobile Data Sheet (bottom-sheet for mobile users) ────────────────────────

function _openMobileDataSheet() {
  const sheet = document.getElementById('mobile-data-sheet');
  if (!sheet) return;
  sheet.hidden = false;
  document.body.classList.add('modal-active');
}

function _closeMobileDataSheet() {
  const sheet = document.getElementById('mobile-data-sheet');
  if (!sheet) return;
  sheet.hidden = true;
  if (!document.querySelector('.modal-overlay:not(.modal-hidden), #ipfs-edu-overlay:not(.edu-hidden)')) {
    document.body.classList.remove('modal-active');
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _isMobile() {
  return (
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    window.innerWidth < 768
  );
}

function _shortRef(ref) {
  const value = String(ref || '').trim();
  if (!value) return '';
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function _syncIpfsTicker(mode) {
  const ticker = document.getElementById('ticker-circle');
  if (!ticker) return;

  const isConnected = mode === 'w3up' || mode === 'own-w3s';
  if (!isConnected) {
    ticker.innerHTML = '';
    ticker.style.transform = '';
    if (ticker._rotationFrame) {
      cancelAnimationFrame(ticker._rotationFrame);
      ticker._rotationFrame = null;
    }
    return;
  }

  const manifest = loadSnapshotManifest();
  const lastMeta = manifest.current
    || manifest.snapshots.find(m => m.provider === 'w3up' || m.provider === 'own-w3s')
    || loadSnapshotMeta()[0]
    || null;
  const ref = lastMeta?.cid
    || lastMeta?.hash
    || window._w3upClientRef?.linkedSnapshotCid
    || window._w3upClientRef?.snapshotContext?.currentCid
    || window._w3upClientRef?.publicKey
    || window._w3upClientRef?.identity
    || '';
  const shortRef = _shortRef(ref);
  if (!shortRef) {
    ticker.innerHTML = '';
    ticker.style.transform = '';
    return;
  }

  ticker.innerHTML = '';
  const prefix = shortRef.slice(0, 6);
  const suffix = shortRef.slice(-4);
  const ipfsIcons = Array.from({ length: 4 }, () => {
    const img = document.createElement('img');
    img.classList.add('ticker-letter');
    img.src = 'img/IPFS_Logo.png';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.style.width = '12px';
    img.style.height = '12px';
    return img;
  });

  [...prefix].forEach(char => {
    const span = document.createElement('span');
    span.classList.add('ticker-letter');
    span.textContent = char;
    span.dataset.storageMode = mode;
    ticker.appendChild(span);
  });
  ipfsIcons.forEach(img => {
    img.dataset.storageMode = mode;
    ticker.appendChild(img);
  });
  [...suffix].forEach(char => {
    const span = document.createElement('span');
    span.classList.add('ticker-letter');
    span.textContent = char;
    span.dataset.storageMode = mode;
    ticker.appendChild(span);
  });

  const letters = ticker.querySelectorAll('.ticker-letter');
  const centerX = 65;
  const centerY = 65;
  const radius = 54;
  const angleStep = (2 * Math.PI) / letters.length;
  letters.forEach((letter, index) => {
    const angle = index * angleStep;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    letter.style.left = `${x}px`;
    letter.style.top = `${y}px`;
  });

  if (ticker._rotationFrame) {
    cancelAnimationFrame(ticker._rotationFrame);
  }
  let angle = 0;
  const rotate = () => {
    ticker.style.transform = `rotate(${angle}deg)`;
    angle += 0.2;
    ticker._rotationFrame = requestAnimationFrame(rotate);
  };
  rotate();
}

function _applyIpfsIndicator(mode) {
  const icon       = document.getElementById('ipfsIcon');
  const statusRing = document.getElementById('ipfs-status');
  const manifest = loadSnapshotManifest();
  const activeMeta = manifest.current
    || manifest.snapshots.find(m => m.provider === 'w3up' || m.provider === 'own-w3s')
    || loadSnapshotMeta()[0]
    || null;
  const shortRef = _shortRef(
    activeMeta?.cid
    || activeMeta?.hash
    || window._w3upClientRef?.linkedSnapshotCid
    || window._w3upClientRef?.snapshotContext?.currentCid
    || window._w3upClientRef?.publicKey
    || window._w3upClientRef?.identity
  );

  if (icon) {
    icon.dataset.storageMode = mode;
    icon.setAttribute(
      'aria-label',
      mode === 'w3up' || mode === 'own-w3s'
        ? `Pinata storage — ready${shortRef ? ` (${shortRef})` : ''}`
        : 'Pinata storage — local only'
    );
    icon.title = mode === 'w3up' || mode === 'own-w3s'
      ? `🔆 Pinata — ready to push snapshots${shortRef ? ` (${shortRef})` : ''}.`
      : '🔆 Local only — click to connect Pinata.';
  }
  if (statusRing) statusRing.dataset.storageMode = mode;

  document.querySelectorAll('.ticker-letter').forEach(el => {
    el.dataset.storageMode = mode;
  });

  const isConnected = mode === 'w3up' || mode === 'own-w3s';
  const activeLabel = STORAGE_MODE_LABELS[mode] || providerRegistry.active?.label || 'Storage';
  const tipMap = {
    'w3up':      `🔆 ${activeLabel} — ready. Click to push snapshot.`,
    'own-w3s':   `🔆 ${activeLabel} — ready. Click to push snapshot.`,
    'json-only': '🔆 Local only — no remote backup. Click to connect Pinata.',
  };
  if (icon) {
    icon.title = tipMap[mode] || '🔆 Pinata storage';
  }

  // Refresh about-modal badge if visible (supports both old and new element IDs)
  const badge = document.getElementById('dc-about-mode-badge')
             || document.getElementById('dc-about-provider-name');
  if (badge) {
    badge.textContent  = activeLabel;
    badge.dataset.mode = mode;
  }

  // Refresh last-backup timestamp in About section
  const lastBackupEl = document.getElementById('dc-about-last-backup');
  if (lastBackupEl) {
    if (isConnected) {
      const last = getSnapshotLifecycleSummary().current || loadSnapshotManifest().snapshots[0] || loadSnapshotMeta()[0];
      if (last) {
        try {
          lastBackupEl.textContent = new Date(last.timestamp).toLocaleString();
        } catch {
          lastBackupEl.textContent = last.timestamp;
        }
      } else {
        // Fall back to legacy snapshot keys
        const latestKey = Object.keys(localStorage)
          .filter(k => k.startsWith('fitnessTrackerSnapshot-'))
          .sort()
          .reverse()[0];
        if (latestKey) {
          const ts = latestKey.split('fitnessTrackerSnapshot-')[1];
          try {
            lastBackupEl.textContent = new Date(ts).toLocaleString();
          } catch {
            lastBackupEl.textContent = ts;
          }
        } else {
          lastBackupEl.textContent = 'No snapshots yet';
        }
      }
    } else {
      lastBackupEl.textContent = '—';
    }
  }

  const currentPointerEl = document.getElementById('dc-about-current-pointer');
  if (currentPointerEl) {
    const pointer = getCurrentSnapshotPointer();
    if (pointer?.cid) {
      const short = pointer.cid.length > 12 ? `${pointer.cid.slice(0, 8)}…${pointer.cid.slice(-4)}` : pointer.cid;
      currentPointerEl.textContent = short;
      currentPointerEl.title = `${pointer.cid}${pointer.archiveTier ? ` • ${pointer.archiveTier}` : ''}`;
    } else {
      currentPointerEl.textContent = '—';
    }
  }

  const retentionEl = document.getElementById('dc-about-retention');
  if (retentionEl) {
    const lifecycle = getSnapshotLifecycleSummary();
    const { hourlyKeep, monthlyKeepMonths, annualKeepYears } = lifecycle.retention || {};
    retentionEl.textContent = `${hourlyKeep || 0} hourly / ${monthlyKeepMonths || 0} monthly / ${annualKeepYears || 0} annual`;
  }

  const cleanupEl = document.getElementById('dc-about-cleanup');
  if (cleanupEl) {
    cleanupEl.textContent = String(getSnapshotLifecycleSummary().counts?.cleanup || 0);
  }

  // Show active provider name in about section
  const providerNameEl = document.getElementById('dc-about-provider-name');
  if (providerNameEl) {
    providerNameEl.textContent = activeLabel;
  }

  _syncIpfsTicker(mode);
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
