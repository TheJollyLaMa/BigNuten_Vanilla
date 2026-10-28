import { validateFitnessSnapshot } from './fitnessSchema.js';

const DATA_KEY = 'fitnessTrackerData';
const POINTS_KEY = 'bignutenRecoveryPoints.v1';
const UNDO_KEY = 'bignutenRecoveryUndo.v1';

// Adapted from DecentBusking's injected browser recovery store (023c278).
export function createSnapshotRecovery(storage = globalThis.localStorage, now = () => new Date().toISOString()) {
  function points() {
    const raw = storage.getItem(POINTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Invalid local recovery history. Export before retrying.');
    return parsed;
  }
  function remember(raw) {
    validateFitnessSnapshot(JSON.parse(raw));
    const previous = points();
    if (previous[0]?.raw === raw) return;
    storage.setItem(POINTS_KEY, JSON.stringify([{ date: now(), raw }, ...previous.filter(point => point.raw !== raw)].slice(0, 3)));
  }
  function save(data) {
    const normalized = validateFitnessSnapshot(data);
    const raw = JSON.stringify(normalized);
    // Persist recovery first: a failed primary write must not erase the old bytes.
    const previous = storage.getItem(DATA_KEY);
    if (previous) {
      let valid = false;
      try { validateFitnessSnapshot(JSON.parse(previous)); valid = true; }
      catch (error) { if (error.code === 'UNSUPPORTED_SNAPSHOT_VERSION') throw error; }
      if (valid) remember(previous);
    }
    storage.setItem(DATA_KEY, raw);
    remember(raw);
    return normalized;
  }
  function recover() {
    const raw = storage.getItem(DATA_KEY);
    if (raw !== null) {
      try { validateFitnessSnapshot(JSON.parse(raw)); return null; }
      catch (error) { if (error.code === 'UNSUPPORTED_SNAPSHOT_VERSION') throw error; }
    }
    for (const point of points()) {
      try { validateFitnessSnapshot(JSON.parse(point.raw)); }
      catch { continue; }
      const undo = { raw, date: point.date, recoveredRaw: point.raw };
      storage.setItem(UNDO_KEY, JSON.stringify(undo));
      storage.setItem(DATA_KEY, point.raw);
      return undo;
    }
    if (raw !== null) throw new Error('Saved fitness data is invalid and no valid recovery point is available. Export before importing a backup.');
    return null;
  }
  function undo() {
    const entry = JSON.parse(storage.getItem(UNDO_KEY) || 'null');
    if (!entry) throw new Error('No recovery to undo.');
    if (storage.getItem(DATA_KEY) !== entry.recoveredRaw) throw new Error('Data changed after recovery. Export it before undoing.');
    if (entry.raw === null) storage.removeItem(DATA_KEY);
    else storage.setItem(DATA_KEY, entry.raw);
    // Keep the exact original bytes available even after undo.
    return entry;
  }
  return { points, remember, save, recover, undo, pending: () => JSON.parse(storage.getItem(UNDO_KEY) || 'null') };
}

export const fitnessRecovery = createSnapshotRecovery();

export function initializeSnapshotRecovery() {
  let recovered;
  let error;
  try { recovered = fitnessRecovery.recover() || fitnessRecovery.pending(); } catch (failure) { error = failure; }
  if (!recovered && !error) return;
  const show = () => {
    if (document.getElementById('snapshot-recovery-notice')) return;
    const notice = document.createElement('div');
    notice.id = 'snapshot-recovery-notice';
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;z-index:300000;padding:16px;background:#222;color:white;border:2px solid #ffc107';
    const message = document.createElement('span');
    message.textContent = error ? error.message : `Restored local recovery point from ${recovered.date}. `;
    notice.appendChild(message);
    if (recovered && !error) {
      const button = document.createElement('button');
      button.textContent = 'Undo recovery';
      button.onclick = () => {
        try { fitnessRecovery.undo(); message.textContent = 'Recovery undone. Original saved state retained; export before continuing.'; button.disabled = true; }
        catch (failure) { message.textContent = failure.message; }
      };
      notice.appendChild(button);
    }
    const exportButton = document.createElement('button');
    exportButton.textContent = 'Export saved data';
    exportButton.onclick = () => {
      const raw = localStorage.getItem(DATA_KEY);
      const url = URL.createObjectURL(new Blob([raw ?? 'null'], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'bignuten-saved-data.json'; link.click(); URL.revokeObjectURL(url);
    };
    notice.appendChild(exportButton);
    document.body.appendChild(notice);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, { once: true });
  else show();
}
