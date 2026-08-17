// fitnessData.js

import { fetchSnapshotData } from './lighthouseStorage.js';

const STORAGE_KEY = 'fitnessTrackerData';
const DATA_VERSION = 1;
const DEFAULT_EXERCISE_TYPES = ['Sit-ups', 'Push-ups', 'Pull-ups'];

const LEGACY_DATA_KEYS = [
  'data',
  'fitnessData',
  'fitnessTrackerData',
  'bignutenData',
  'BigNutenData',
  'payload',
  'backup',
  'snapshot',
];

const defaultData = {
  dataVersion: DATA_VERSION,
  timeZone: '',
  weightLogs: [],
  supplements: [],
  foods: [],
  measurements: [],
  exercises: {
    types: DEFAULT_EXERCISE_TYPES,
    entries: []
  },
  sessionLog: [],
  painLogs: [],
  emotions: [],
  genieSessions: [],
  genieInsights: []
};

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(defaultData));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function unwrapFitnessDataPayload(raw) {
  let current = raw;
  const seen = new Set();

  while (isPlainObject(current) && !seen.has(current)) {
    seen.add(current);
    if (current.__bignutenSnapshot && isPlainObject(current.data)) {
      current = current.data;
      continue;
    }

    const wrapped = LEGACY_DATA_KEYS.map(key => current[key]).find(isPlainObject);
    if (wrapped) {
      current = wrapped;
      continue;
    }

    break;
  }

  return current;
}

function coerceArray(source, keys) {
  for (const key of keys) {
    if (Array.isArray(source?.[key])) return source[key];
  }
  return [];
}

function normalizeExerciseBlock(source) {
  const block = unwrapFitnessDataPayload(source);

  if (Array.isArray(block)) {
    return {
      types: [...DEFAULT_EXERCISE_TYPES],
      entries: block
    };
  }

  if (!isPlainObject(block)) {
    return {
      types: [...DEFAULT_EXERCISE_TYPES],
      entries: []
    };
  }

  const rawTypes = coerceArray(block, ['types', 'exerciseTypes']);
  const rawEntries = coerceArray(block, ['entries', 'logs', 'items', 'history']);

  return {
    types: rawTypes.length
      ? [...new Set(rawTypes.map(type => String(type).trim()).filter(Boolean))]
      : [...DEFAULT_EXERCISE_TYPES],
    entries: rawEntries
  };
}

/**
 * Normalizes a fitness data object to the current schema.
 * Guarantees all required arrays/objects exist with sensible defaults,
 * and stamps the dataVersion for forward-migration compatibility.
 * Safe to call on data loaded from older localStorage or IPFS snapshots.
 *
 * @param {object} data - Raw fitness data (may be from old schema)
 * @returns {object} Normalized data with dataVersion set
 */
export function normalizeFitnessData(data) {
  const source = unwrapFitnessDataPayload(data);
  if (!isPlainObject(source)) {
    return cloneDefaultData();
  }

  const normalized = cloneDefaultData();

  normalized.timeZone = typeof source.timeZone === 'string' ? source.timeZone : '';
  normalized.weightLogs = coerceArray(source, ['weightLogs', 'weightHistory', 'weights']);
  normalized.supplements = coerceArray(source, ['supplements', 'supplementLogs', 'supplementHistory']);
  normalized.foods = coerceArray(source, ['foods', 'foodLogs', 'dietLogs', 'mealLogs', 'rawFoods']);
  normalized.measurements = coerceArray(source, ['measurements', 'measurementLogs', 'bodyMeasurements']);
  normalized.sessionLog = coerceArray(source, ['sessionLog', 'workoutSessions', 'exerciseSessions', 'workoutLog']);
  normalized.painLogs = coerceArray(source, ['painLogs', 'painLog']);
  normalized.emotions = coerceArray(source, ['emotions', 'emotionLogs', 'feelings']);
  normalized.genieSessions = coerceArray(source, ['genieSessions']);
  normalized.genieInsights = coerceArray(source, ['genieInsights']);
  normalized.exercises = normalizeExerciseBlock(source.exercises ?? source.exerciseLogs ?? source.workoutExercises);

  normalized.dataVersion = DATA_VERSION;

  return normalized;
}


function loadLatestSnapshotFromStorage() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('fitnessTrackerSnapshot-'));
  if (!keys.length) return null;

  const latestKey = keys.sort().reverse()[0];
  const snapshot = localStorage.getItem(latestKey);
  return snapshot ? JSON.parse(snapshot) : null;
}

export async function getFitnessData() {
  const snapshot = loadLatestSnapshotFromStorage();
  const current = localStorage.getItem(STORAGE_KEY);

  // Inserted logic for no local snapshot or current
  if (!snapshot && !current) {
    const cid = prompt("No local history found. Enter CID to restore from an IPFS snapshot, or cancel to start fresh:");
    if (cid) {
      try {
        const data = await fetchSnapshotData(cid);
        if (data.weightLogs || data.supplements || data.exercises) {
          const normalized = normalizeFitnessData(data);
          saveFitnessData(normalized);
          alert("Snapshot restored from Lighthouse.");
          return normalized;
        } else {
          alert("Invalid snapshot structure.");
        }
      } catch (err) {
        console.error("CID restore failed:", err);
        alert("Restore from Lighthouse CID failed.");
      }
    } else {
      alert("No historical data restored. Starting fresh from this session.");
    }
  }

  if (snapshot && !current) {
    const normalized = normalizeFitnessData(snapshot.data);
    saveFitnessData(normalized);
    return normalized;
  }

  if (snapshot && current) {
    const currentData = normalizeFitnessData(JSON.parse(current));
    const snapshotData = normalizeFitnessData(snapshot.data);
    // Merge both sources so no entries are lost regardless of which has the
    // newer weight log.  mergeSnapshotData deduplicates by timestamp, so
    // re-merging on every load is safe.
    const merged = mergeSnapshotData(currentData, snapshotData);
    saveFitnessData(merged);
    return merged;
  }

  // fallback: no data found — return default
  saveFitnessData(defaultData);
  return JSON.parse(JSON.stringify(defaultData));
}

export function saveFitnessData(data) {
  const normalized = normalizeFitnessData(data);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
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
 * Merges two fitness data objects, deduplicating array entries by timestamp.
 * Handles the exercises object structure ({types, entries}) as well as simple arrays.
 * @param {Object} current - Current local fitness data
 * @param {Object} imported - Fitness data fetched from an IPFS snapshot
 * @returns {Object} Merged fitness data with duplicates removed, sorted chronologically
 */
export function mergeSnapshotData(current, imported) {
  const merged = { ...current };

  // Simple array fields — deduplicate by timestamp (or full JSON if no timestamp)
  const simpleArrayFields = ['weightLogs', 'supplements', 'foods', 'measurements', 'sessionLog', 'painLogs', 'emotions', 'genieSessions', 'genieInsights'];
  simpleArrayFields.forEach(field => {
    const a = Array.isArray(current[field]) ? current[field] : [];
    const b = Array.isArray(imported[field]) ? imported[field] : [];
    const seen = new Set(a.map(e => e.timestamp || JSON.stringify(e)));
    const combined = [...a];
    b.forEach(entry => {
      const key = entry.timestamp || JSON.stringify(entry);
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

  // Exercises can be an {types, entries} object (app.js format) or a legacy array
  const ce = current.exercises;
  const ie = imported.exercises;
  const currentEntries = Array.isArray(ce) ? ce : (ce?.entries || []);
  const importedEntries = Array.isArray(ie) ? ie : (ie?.entries || []);
  const currentTypes = Array.isArray(ce?.types) ? ce.types : [];
  const importedTypes = Array.isArray(ie?.types) ? ie.types : [];

  const seenEntries = new Set(currentEntries.map(e => e.timestamp || JSON.stringify(e)));
  const mergedEntries = [...currentEntries];
  importedEntries.forEach(entry => {
    const key = entry.timestamp || JSON.stringify(entry);
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
 * Fetches a fitness snapshot from Lighthouse/IPFS by CID and merges it into the current local data.
 * Deduplicates entries so re-importing the same CID is safe.
 * @param {string} cid - The IPFS CID to fetch
 * @returns {Promise<{merged: Object, added: {weightLogs: number, exercises: number, sessionLog: number}}>}
 */
export async function importAndMergeFromCID(cid) {
  const trimmedCid = cid.trim();
  if (!trimmedCid) throw new Error('No CID provided.');

  const imported = await fetchSnapshotData(trimmedCid);

  if (!imported.weightLogs && !imported.supplements && !imported.exercises) {
    throw new Error('Invalid snapshot structure: missing expected data fields.');
  }

  ['weightLogs', 'supplements', 'foods', 'measurements', 'sessionLog', 'painLogs', 'emotions'].forEach(f => {
    if (!Array.isArray(imported[f])) imported[f] = [];
  });

  const currentRaw = localStorage.getItem(STORAGE_KEY);
  const current = currentRaw ? JSON.parse(currentRaw) : { ...defaultData };
  ['weightLogs', 'supplements', 'foods', 'measurements', 'sessionLog', 'painLogs', 'emotions'].forEach(f => {
    if (!Array.isArray(current[f])) current[f] = [];
  });

  const beforeWeightLogs = (current.weightLogs || []).length;
  const beforeExercises = Array.isArray(current.exercises)
    ? current.exercises.length
    : (current.exercises?.entries || []).length;
  const beforeSessionLog = (current.sessionLog || []).length;

  const merged = mergeSnapshotData(current, imported);
  saveFitnessData(merged);

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
      sessionLog: merged.sessionLog.length - beforeSessionLog
    }
  };
}