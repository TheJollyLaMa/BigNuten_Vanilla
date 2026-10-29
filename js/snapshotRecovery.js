import { getTodayInUserTz } from './timezone.js';
import { validateFitnessSnapshot } from './fitnessSchema.js';

const DATA_KEY = 'fitnessTrackerData';
const POINTS_KEY = 'bignutenRecoveryPoints.v1';
const UNDO_KEY = 'bignutenRecoveryUndo.v1';
const DISMISSED_KEY = 'bignutenRecoveryDismissed.v1';
const UNDONE_KEY = 'bignutenRecoveryUndone.v1';
const DATA_KEYS = [DATA_KEY, 'waterDailyHistory', 'waterTrackerData'];

function storageKeys(storage) {
  return storage.keys ? Array.from(storage.keys()) : typeof storage.key === 'function'
    ? Array.from({ length: storage.length }, (_, index) => storage.key(index)) : Object.keys(storage);
}

// Low-level health/recovery cleanup. User-facing deletion must use clearAllLocalData().
export function clearLocalHealthData(storage = globalThis.localStorage) {
  const keys = [...DATA_KEYS, POINTS_KEY, UNDO_KEY, DISMISSED_KEY, UNDONE_KEY,
    ...storageKeys(storage).filter(key => key.startsWith('fitnessTrackerSnapshot-'))];
  // Remove recovery sources first so a partial failure cannot resurrect data.
  for (const key of [...keys.slice(DATA_KEYS.length), ...DATA_KEYS]) storage.removeItem(key);
}

function eventId(entry) {
  return entry.eventId || JSON.stringify([entry.date, entry.recoveredRaw, entry.raw]);
}

// Adapted from DecentBusking's injected browser recovery store (023c278).
export function createSnapshotRecovery(storage = globalThis.localStorage, now = () => new Date().toISOString(), todayInUserTz = getTodayInUserTz) {
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
    const previousPoints = storage.getItem(POINTS_KEY);
    try {
      storage.setItem(DATA_KEY, raw);
      remember(raw);
      storage.removeItem(UNDONE_KEY);
    } catch (error) {
      try { if (previous === null) storage.removeItem(DATA_KEY); else storage.setItem(DATA_KEY, previous); } catch {}
      try { if (previousPoints === null) storage.removeItem(POINTS_KEY); else storage.setItem(POINTS_KEY, previousPoints); } catch {}
      throw error;
    }
    return normalized;
  }
  function recover() {
    const raw = storage.getItem(DATA_KEY);
    if (raw !== null) {
      let valid = false;
      try { validateFitnessSnapshot(JSON.parse(raw)); valid = true; }
      catch (error) { if (error.code === 'UNSUPPORTED_SNAPSHOT_VERSION') throw error; }
      if (valid) { storage.removeItem(UNDONE_KEY); return null; }
    }
    const undone = JSON.parse(storage.getItem(UNDONE_KEY) || 'null');
    if (undone && undone.raw === raw) return null;
    let candidates = points();
    if (!candidates.length) {
      candidates = storageKeys(storage).filter(key => key.startsWith('fitnessTrackerSnapshot-')).sort().reverse().flatMap(key => {
        try {
          const snapshot = JSON.parse(storage.getItem(key));
          const date = key.slice('fitnessTrackerSnapshot-'.length);
          if (!Number.isFinite(Date.parse(date))) return [];
          return [{ date, raw: JSON.stringify(validateFitnessSnapshot(snapshot.data)) }];
        } catch { return []; }
      }).slice(0, 3);
    }
    for (const point of candidates) {
      try {
        if (!point || typeof point.raw !== 'string' || !Number.isFinite(Date.parse(point.date))) continue;
        validateFitnessSnapshot(JSON.parse(point.raw));
      }
      catch { continue; }
      const before = Object.fromEntries(DATA_KEYS.map(key => [key, storage.getItem(key)]));
      const history = validateFitnessSnapshot(JSON.parse(point.raw)).waterDailyHistory;
      const today = todayInUserTz();
      const after = { [DATA_KEY]: point.raw, waterDailyHistory: JSON.stringify(history), waterTrackerData: JSON.stringify({ date: today, count: history[today] || 0 }) };
      const undo = { raw, date: point.date, eventId: JSON.stringify([now(), point.date, point.raw, raw]), recoveredRaw: point.raw, before, after };
      storage.setItem(UNDO_KEY, JSON.stringify(undo));
      try { for (const [key, value] of Object.entries(after)) storage.setItem(key, value); }
      catch (error) {
        for (const [key, value] of Object.entries(before)) {
          try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch {}
        }
        throw error;
      }
      return undo;
    }
    if (raw !== null) throw new Error('Saved fitness data is invalid and no valid recovery point is available. Export before importing a backup.');
    return null;
  }
  function undo() {
    const entry = JSON.parse(storage.getItem(UNDO_KEY) || 'null');
    if (!entry) throw new Error('No recovery to undo.');
    if (Object.entries(entry.after).some(([key, value]) => storage.getItem(key) !== value)) throw new Error('Data changed after recovery. Export it before undoing.');
    const previousUndone = storage.getItem(UNDONE_KEY);
    try {
      storage.setItem(UNDONE_KEY, JSON.stringify({ raw: entry.raw }));
      for (const [key, value] of Object.entries(entry.before)) {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      }
    } catch (error) {
      try { if (previousUndone === null) storage.removeItem(UNDONE_KEY); else storage.setItem(UNDONE_KEY, previousUndone); } catch {}
      for (const [key, value] of Object.entries(entry.after)) {
        try { storage.setItem(key, value); } catch {}
      }
      throw error;
    }
    // Keep the exact original bytes available even after undo.
    return entry;
  }
  return { points, remember, save, recover, undo,
    dismiss: id => storage.setItem(DISMISSED_KEY, id),
    isDismissed: id => storage.getItem(DISMISSED_KEY) === id,
    pending: () => JSON.parse(storage.getItem(UNDO_KEY) || 'null') };
}

export const fitnessRecovery = createSnapshotRecovery({
  keys: () => Object.keys(globalThis.localStorage),
  getItem: key => globalThis.localStorage.getItem(key),
  setItem: (key, value) => globalThis.localStorage.setItem(key, value),
  removeItem: key => globalThis.localStorage.removeItem(key),
});

export function initializeSnapshotRecovery() {
  let recovered;
  let error;
  try { recovered = fitnessRecovery.recover();
    if (!recovered) { const pending = fitnessRecovery.pending(); if (pending?.recoveredRaw === localStorage.getItem(DATA_KEY)) recovered = pending; }
  } catch (failure) { error = failure; }
  if (!recovered && !error) return;
  const id = recovered ? eventId(recovered) : JSON.stringify([error.message, localStorage.getItem(DATA_KEY)]);
  if (fitnessRecovery.isDismissed(id)) return;
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
    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.textContent = 'Dismiss recovery notice';
    dismissButton.onclick = () => {
      try { fitnessRecovery.dismiss(id); notice.remove(); }
      catch (failure) { message.textContent = failure.message; }
    };
    notice.appendChild(dismissButton);
    document.body.appendChild(notice);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, { once: true });
  else show();
}
