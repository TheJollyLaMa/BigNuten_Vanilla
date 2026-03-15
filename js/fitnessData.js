// fitnessData.js

const STORAGE_KEY = 'fitnessTrackerData';
const DATA_VERSION = 1;
const DEFAULT_EXERCISE_TYPES = ['Sit-ups', 'Push-ups', 'Pull-ups'];

const defaultData = {
  dataVersion: DATA_VERSION,
  weightLogs: [],
  supplements: [],
  foods: [],
  measurements: [],
  exercises: {
    types: DEFAULT_EXERCISE_TYPES,
    entries: []
  },
  sessionLog: []
};

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
  if (!data || typeof data !== 'object') {
    return JSON.parse(JSON.stringify(defaultData));
  }

  // Migrate exercises from old array shape to object shape
  if (Array.isArray(data.exercises)) {
    data.exercises = {
      types: DEFAULT_EXERCISE_TYPES,
      entries: data.exercises
    };
  } else if (!data.exercises || typeof data.exercises !== 'object') {
    data.exercises = {
      types: DEFAULT_EXERCISE_TYPES,
      entries: []
    };
  } else {
    if (!Array.isArray(data.exercises.types)) {
      data.exercises.types = DEFAULT_EXERCISE_TYPES;
    }
    if (!Array.isArray(data.exercises.entries)) {
      data.exercises.entries = [];
    }
  }

  if (!Array.isArray(data.weightLogs)) data.weightLogs = [];
  if (!Array.isArray(data.supplements)) data.supplements = [];
  if (!Array.isArray(data.foods)) data.foods = [];
  if (!Array.isArray(data.measurements)) data.measurements = [];
  if (!Array.isArray(data.sessionLog)) data.sessionLog = [];

  data.dataVersion = DATA_VERSION;

  return data;
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
        const response = await fetch(`https://${cid}.ipfs.w3s.link/`);
        if (!response.ok) throw new Error("Failed to fetch from IPFS.");

        const data = await response.json();
        if (data.weightLogs || data.supplements || data.exercises) {
          const normalized = normalizeFitnessData(data);
          saveFitnessData(normalized);
          alert("Snapshot restored from IPFS.");
          return normalized;
        } else {
          alert("Invalid snapshot structure.");
        }
      } catch (err) {
        console.error("CID restore failed:", err);
        alert("Restore from IPFS CID failed.");
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
    const latestCurrent = currentData.weightLogs?.at(-1)?.timestamp || '';
    const latestSnapshot = snapshot.data.weightLogs?.at(-1)?.timestamp || '';

    if (latestSnapshot > latestCurrent) {
      const normalized = normalizeFitnessData(snapshot.data);
      saveFitnessData(normalized);
      return normalized;
    } else {
      saveFitnessData(currentData);
      return currentData;
    }
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
retrofitOldSnapshots();
export function logWeight(weight) {
  const data = getFitnessData();
  data.weightLogs.push({
    weight,
    timestamp: new Date().toISOString()
  });
  saveFitnessData(data);
}
// Run once manually after launch
patchAllSnapshotHistory(); // Uncomment this line to execute the patch

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
  const simpleArrayFields = ['weightLogs', 'supplements', 'foods', 'measurements', 'sessionLog'];
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
 * Fetches a fitness snapshot from IPFS by CID and merges it into the current local data.
 * Deduplicates entries so re-importing the same CID is safe.
 * @param {string} cid - The IPFS CID to fetch
 * @returns {Promise<{merged: Object, added: {weightLogs: number, exercises: number, sessionLog: number}}>}
 */
export async function importAndMergeFromCID(cid) {
  const trimmedCid = cid.trim();
  if (!trimmedCid) throw new Error('No CID provided.');

  const url = `https://${trimmedCid}.ipfs.w3s.link/`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch from IPFS (HTTP ${response.status}).`);

  const imported = await response.json();

  if (!imported.weightLogs && !imported.supplements && !imported.exercises) {
    throw new Error('Invalid snapshot structure: missing expected data fields.');
  }

  ['weightLogs', 'supplements', 'foods', 'measurements', 'sessionLog'].forEach(f => {
    if (!Array.isArray(imported[f])) imported[f] = [];
  });

  const currentRaw = localStorage.getItem(STORAGE_KEY);
  const current = currentRaw ? JSON.parse(currentRaw) : { ...defaultData };
  ['weightLogs', 'supplements', 'foods', 'measurements', 'sessionLog'].forEach(f => {
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