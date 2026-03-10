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