// fitnessData.js

import { fetchSnapshotData } from './ipfsStorage.js';
import { getTodayInUserTz } from './timezone.js';

const STORAGE_KEY = 'fitnessTrackerData';
import { normalizeFitnessData, validateFitnessSnapshot, cloneDefaultData, defaultData, isPlainObject } from './fitnessSchema.js';
import { fitnessRecovery } from './snapshotRecovery.js';
export { normalizeFitnessData, validateFitnessSnapshot } from './fitnessSchema.js';

export async function getFitnessData() {
  fitnessRecovery.recover();
  const current = localStorage.getItem(STORAGE_KEY);

  // First-time users start with a clean local profile. Restoring an old CID is
  // an explicit action from the storage panel, never an initialization prompt.
  if (!current) {
    const fresh = cloneDefaultData();
    saveFitnessData(fresh);
    return fresh;
  }

  const currentData = normalizeFitnessData(JSON.parse(current));
  saveFitnessData(currentData);
  return currentData;
}

export function saveFitnessData(data) {
  return fitnessRecovery.save(data);
}

export function syncWaterIntakeAfterRestore(data) {
  const history = isPlainObject(data?.waterDailyHistory) ? data.waterDailyHistory : {};
  localStorage.setItem('waterDailyHistory', JSON.stringify(history));

  const today = getTodayInUserTz();
  let current = {};
  try { current = JSON.parse(localStorage.getItem('waterTrackerData') || '{}'); } catch {}
  const count = Object.prototype.hasOwnProperty.call(history, today)
    ? Number(history[today]) || 0
    : current.date === today ? Number(current.count) || 0 : 0;
  localStorage.setItem('waterTrackerData', JSON.stringify({ date: today, count }));

  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bignuten:fitness-data-restored'));
  }
}

// Rebuilds the full snapshotHistory from all fitnessTrackerSnapshot-* entries on every load
export function retrofitOldSnapshots() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('fitnessTrackerSnapshot-'));
  if (!keys.length) return;

  const sorted = keys.sort();
  const history = [];

  sorted.forEach(key => {
    const raw = localStorage.getItem(key);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed.cid || !parsed.data) return;

      const timestamp = key.split('fitnessTrackerSnapshot-')[1];
      history.push({ timestamp, cid: parsed.cid });
    } catch (err) {
      console.warn("Skipping malformed snapshot:", key);
    }
  });

  localStorage.setItem('snapshotHistory', JSON.stringify(history.reverse()));
}

// Rebuild and deduplicate snapshotHistory from all fitnessTrackerSnapshot-* entries
export function patchAllSnapshotHistory() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('fitnessTrackerSnapshot-'));
  if (!keys.length) return;

  const seen = new Set();
  const allEntries = [];
  function makeKey(cid, timestamp) {
    return `${cid}::${timestamp}`;
  }

  keys.forEach(k => {
    const raw = localStorage.getItem(k);
    try {
      const parsed = JSON.parse(raw);
      const baseTimestamp = k.split('fitnessTrackerSnapshot-')[1];
      if (parsed.cid) {
        const key = makeKey(parsed.cid, baseTimestamp);
        if (!seen.has(key)) {
          seen.add(key);
          allEntries.push({ cid: parsed.cid, timestamp: baseTimestamp });
        } else {
          // If CID already seen, ensure all timestamps are recorded
          allEntries.push({ cid: parsed.cid, timestamp: baseTimestamp });
        }
      }
      if (Array.isArray(parsed.snapshotHistory)) {
        parsed.snapshotHistory.forEach(entry => {
          const key = makeKey(entry.cid, entry.timestamp || '');
          if (entry.cid && !seen.has(key)) {
            seen.add(key);
            allEntries.push({
              cid: entry.cid,
              timestamp: entry.timestamp || ''
            });
          }
        });
      }
    } catch (e) {
      console.warn("Skipping malformed snapshot:", k);
    }
  });

  // Sort descending by timestamp
  const sorted = allEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  localStorage.setItem('snapshotHistory', JSON.stringify(sorted));
  console.log("📦 Full snapshot history rebuilt. Total entries:", sorted.length);
}

// Optionally auto-run on file load
if (typeof localStorage !== 'undefined') {
  retrofitOldSnapshots();
}
export async function logWeight(weight) {
  const data = await getFitnessData();
  data.weightLogs.push({
    weight,
    timestamp: new Date().toISOString()
  });
  saveFitnessData(data);
}
// Run once at idle — deferred off the critical path to avoid blocking first paint.
if (typeof localStorage !== 'undefined' && typeof requestIdleCallback === 'function') {
  requestIdleCallback(() => patchAllSnapshotHistory(), { timeout: 5000 });
} else if (typeof localStorage !== 'undefined') {
  setTimeout(() => patchAllSnapshotHistory(), 3000);
}

/**
 * Merges two fitness data objects, deduplicating array entries by stable record ID or canonical content.
 * Handles the exercises object structure ({types, entries}) as well as simple arrays.
 * @param {Object} current - Current local fitness data
 * @param {Object} imported - Fitness data fetched from an IPFS snapshot
 * @returns {Object} Merged fitness data with duplicates removed, sorted chronologically
 */
function recordIdentity(entry) {
  if (entry.id !== undefined) return `id:${entry.id}`;
  const canonical = value => Array.isArray(value) ? value.map(canonical) : isPlainObject(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(entry));
}

export function mergeSnapshotData(current, imported) {
  const merged = { ...current, dataVersion: 1, timeZone: current.timeZone || imported.timeZone || '' };

  // Preserve distinct records even if they share a timestamp.
  const simpleArrayFields = ['weightLogs', 'supplements', 'foods', 'measurements', 'sessionLog', 'painLogs', 'emotions', 'genieSessions', 'genieInsights'];
  simpleArrayFields.forEach(field => {
    const a = Array.isArray(current[field]) ? current[field] : [];
    const b = Array.isArray(imported[field]) ? imported[field] : [];
    const seen = new Set(a.map(e => recordIdentity(e)));
    const combined = [...a];
    b.forEach(entry => {
      const key = recordIdentity(entry);
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(entry);
      }
    });
    combined.sort((x, y) =>
      (x.timestamp || x.date || '').localeCompare(y.timestamp || y.date || '')
    );
    merged[field] = combined;
  });

  merged.waterDailyHistory = {
    ...(isPlainObject(imported.waterDailyHistory) ? imported.waterDailyHistory : {}),
    ...(isPlainObject(current.waterDailyHistory) ? current.waterDailyHistory : {}),
  };

  // Exercises can be an {types, entries} object (app.js format) or a legacy array
  const ce = current.exercises;
  const ie = imported.exercises;
  const currentEntries = Array.isArray(ce) ? ce : (ce?.entries || []);
  const importedEntries = Array.isArray(ie) ? ie : (ie?.entries || []);
  const currentTypes = Array.isArray(ce?.types) ? ce.types : [];
  const importedTypes = Array.isArray(ie?.types) ? ie.types : [];

  const seenEntries = new Set(currentEntries.map(e => recordIdentity(e)));
  const mergedEntries = [...currentEntries];
  importedEntries.forEach(entry => {
    const key = recordIdentity(entry);
    if (!seenEntries.has(key)) {
      seenEntries.add(key);
      mergedEntries.push(entry);
    }
  });
  mergedEntries.sort((x, y) => (x.timestamp || '').localeCompare(y.timestamp || ''));

  merged.exercises = {
    types: [...new Set([...currentTypes, ...importedTypes])],
    entries: mergedEntries
  };

  return merged;
}

/**
 * Fetches a fitness snapshot from IPFS by CID and merges it into the current local data.
 * Deduplicates entries so re-importing the same CID is safe.
 * @param {string} cid - The IPFS CID to fetch
 * @returns {Promise<{merged: Object, added: {weightLogs: number, exercises: number, sessionLog: number}}>}
 */
export async function importAndMergeFromCID(cid) {
  const trimmedCid = cid.trim();
  if (!trimmedCid) throw new Error('No CID provided.');

  const imported = validateFitnessSnapshot(await fetchSnapshotData(trimmedCid));
  fitnessRecovery.recover();
  const currentRaw = localStorage.getItem(STORAGE_KEY);
  const current = currentRaw ? validateFitnessSnapshot(JSON.parse(currentRaw)) : cloneDefaultData();

  const beforeWeightLogs = (current.weightLogs || []).length;
  const beforeExercises = Array.isArray(current.exercises)
    ? current.exercises.length
    : (current.exercises?.entries || []).length;
  const beforeSessionLog = (current.sessionLog || []).length;

  const merged = mergeSnapshotData(current, imported);
  saveFitnessData(merged);
  syncWaterIntakeAfterRestore(merged);

  // Track imported CIDs so users can see their import history
  const importedList = JSON.parse(localStorage.getItem('importedSnapshotCIDs') || '[]');
  if (!importedList.find(e => e.cid === trimmedCid)) {
    importedList.unshift({ cid: trimmedCid, importedAt: new Date().toISOString() });
    localStorage.setItem('importedSnapshotCIDs', JSON.stringify(importedList));
  }

  return {
    merged,
    added: {
      weightLogs: merged.weightLogs.length - beforeWeightLogs,
      exercises: (merged.exercises?.entries || []).length - beforeExercises,
      sessionLog: merged.sessionLog.length - beforeSessionLog,
      waterDays: Object.keys(merged.waterDailyHistory || {}).length - Object.keys(current.waterDailyHistory || {}).length,
    }
  };
}