import { normalizeMetricLogs } from './metrics.js';
import { normalizeWorkoutSession, normalizeMeasurement, measurementDayNumber } from './workoutBody.js';

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

export const defaultData = {
  dataVersion: DATA_VERSION,
  timeZone: '',
  weightLogs: [],
  waterDailyHistory: {},
  supplements: [],
  foods: [],
  measurements: [],
  measurementReminderDismissedOn: '',
  metricLogs: [],
  exercises: {
    types: DEFAULT_EXERCISE_TYPES,
    entries: []
  },
  sessionLog: [],
  painLogs: [],
  chantingSessions: [],
  emotions: [],
  genieSessions: [],
  genieInsights: []
};

export function cloneDefaultData() {
  return JSON.parse(JSON.stringify(defaultData));
}

export function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function unwrapFitnessDataPayload(raw) {
  let current = raw;
  const seen = new Set();

  while (isPlainObject(current) && !seen.has(current)) {
    seen.add(current);
    assertSupportedVersion(current);
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

function coerceObject(source, keys) {
  for (const key of keys) {
    if (isPlainObject(source?.[key])) return source[key];
  }
  return {};
}

function normalizeFoodEntries(entries) {
  return entries.map(entry => {
    if (!isPlainObject(entry) || entry.time === undefined) return entry;
    if (typeof entry.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time)) return entry;
    const normalized = { ...entry };
    delete normalized.time;
    return normalized;
  });
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
  assertSupportedVersion(source);
  if (!isPlainObject(source)) {
    return cloneDefaultData();
  }

  const normalized = cloneDefaultData();

  normalized.timeZone = typeof source.timeZone === 'string' ? source.timeZone : '';
  normalized.weightLogs = coerceArray(source, ['weightLogs', 'weightHistory', 'weights']);
  normalized.waterDailyHistory = coerceObject(source, ['waterDailyHistory', 'waterHistory']);
  normalized.supplements = coerceArray(source, ['supplements', 'supplementLogs', 'supplementHistory']);
  normalized.foods = normalizeFoodEntries(coerceArray(source, ['foods', 'foodLogs', 'dietLogs', 'mealLogs', 'rawFoods']));
  normalized.metricLogs = normalizeMetricLogs(source.metricLogs);
  normalized.measurements = coerceArray(source, ['measurements', 'measurementLogs', 'bodyMeasurements']).map(normalizeMeasurement);
  normalized.measurementReminderDismissedOn = source.measurementReminderDismissedOn ?? '';
  if (typeof normalized.measurementReminderDismissedOn !== 'string' || (normalized.measurementReminderDismissedOn && !Number.isFinite(measurementDayNumber(normalized.measurementReminderDismissedOn)))) throw new Error('Invalid measurement reminder date.');
  normalized.sessionLog = coerceArray(source, ['sessionLog', 'workoutSessions', 'exerciseSessions', 'workoutLog']).map(normalizeWorkoutSession);
  normalized.painLogs = coerceArray(source, ['painLogs', 'painLog']);
  normalized.chantingSessions = coerceArray(source, ['chantingSessions']);
  normalized.emotions = coerceArray(source, ['emotions', 'emotionLogs', 'feelings']);
  normalized.genieSessions = coerceArray(source, ['genieSessions']);
  normalized.genieInsights = coerceArray(source, ['genieInsights']);
  normalized.exercises = normalizeExerciseBlock(source.exercises ?? source.exerciseLogs ?? source.workoutExercises);

  normalized.dataVersion = DATA_VERSION;

  return normalized;
}

function assertSupportedVersion(value) {
  if (!isPlainObject(value)) return;
  if ((value.dataVersion !== undefined && value.dataVersion !== 1) ||
      (value.__bignutenSnapshot && value.version !== 1)) {
    const error = new Error('Unsupported snapshot version. Update the app; export remains available.');
    error.code = 'UNSUPPORTED_SNAPSHOT_VERSION';
    throw error;
  }
}

export function validateFitnessSnapshot(raw) {
  const source = unwrapFitnessDataPayload(raw);
  if (!isPlainObject(source)) throw new Error('Invalid snapshot: expected a fitness object.');
  const arrays = [
    ['weightLogs', 'weightHistory', 'weights'], ['supplements', 'supplementLogs', 'supplementHistory'],
    ['foods', 'foodLogs', 'dietLogs', 'mealLogs', 'rawFoods'], ['measurements', 'measurementLogs', 'bodyMeasurements'],
    ['sessionLog', 'workoutSessions', 'exerciseSessions', 'workoutLog'], ['painLogs', 'painLog'],
    ['emotions', 'emotionLogs', 'feelings'], ['metricLogs'], ['genieSessions'], ['genieInsights'], ['chantingSessions'],
  ];
  const known = arrays.flat().concat(['waterDailyHistory', 'waterHistory', 'exercises', 'exerciseLogs', 'workoutExercises']);
  if (!known.some(key => Object.hasOwn(source, key))) throw new Error('Invalid snapshot: missing supported records.');
  for (const key of arrays.flat()) {
    if (source[key] !== undefined && (!Array.isArray(source[key]) || source[key].some(row => !isPlainObject(row)))) {
      throw new Error(`Invalid snapshot record list: ${key}.`);
    }
  }
  for (const key of ['waterDailyHistory', 'waterHistory']) {
    if (source[key] !== undefined && (!isPlainObject(source[key]) || Object.entries(source[key]).some(([day, count]) =>
      !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(count) || count < 0))) throw new Error('Invalid water history.');
  }
  for (const key of ['exercises', 'exerciseLogs', 'workoutExercises']) {
    const value = source[key];
    if (value === undefined) continue;
    if (!Array.isArray(value) && !isPlainObject(value)) throw new Error('Invalid exercises.');
    const rows = Array.isArray(value) ? value : value.entries ?? value.logs ?? value.items ?? value.history ?? [];
    if (!Array.isArray(rows) || rows.some(row => !isPlainObject(row))) throw new Error('Invalid exercise entries.');
    if (!Array.isArray(value) && value.types !== undefined && (!Array.isArray(value.types) || value.types.some(type => typeof type !== 'string'))) throw new Error('Invalid exercise types.');
  }
  if (source.timeZone !== undefined && typeof source.timeZone !== 'string') throw new Error('Invalid timezone.');
  return normalizeFitnessData(source);
}
