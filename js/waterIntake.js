import { cloneDefaultData, validateFitnessSnapshot, isPlainObject } from './fitnessSchema.js';

const DATA_KEY = 'fitnessTrackerData';
const HISTORY_KEY = 'waterDailyHistory';
const CURRENT_KEY = 'waterTrackerData';

export function syncWaterCaches(storage, data, today) {
  const history = data.waterDailyHistory || {};
  storage.setItem(HISTORY_KEY, JSON.stringify(history));
  storage.setItem(CURRENT_KEY, JSON.stringify({ date: today, count: history[today] || 0 }));
}

// Like DecentBusking's personal-play recovery store, storage is injected and
// records are validated before writes. The existing v1 daily totals stay canonical.
export function createWaterIntakeStore(storage, recovery, todayInUserTz) {
  function data() {
    const raw = storage.getItem(DATA_KEY);
    return raw === null ? cloneDefaultData() : validateFitnessSnapshot(JSON.parse(raw));
  }
  function persist(next) {
    const normalized = validateFitnessSnapshot(next);
    const before = [HISTORY_KEY, CURRENT_KEY].map(key => [key, storage.getItem(key)]);
    try {
      syncWaterCaches(storage, normalized, todayInUserTz());
      recovery.save(normalized);
    } catch (error) {
      for (const [key, raw] of before) {
        try { if (raw === null) storage.removeItem(key); else storage.setItem(key, raw); } catch {}
      }
      throw error;
    }
  }
  function read() {
    const date = todayInUserTz();
    return { date, count: data().waterDailyHistory[date] || 0 };
  }
  function migrate() {
    const next = data();
    const history = { ...next.waterDailyHistory };
    const add = (day, count) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(count) && count >= 0 && !Object.hasOwn(history, day)) history[day] = count;
    };
    try {
      const legacy = JSON.parse(storage.getItem(HISTORY_KEY) || '{}');
      if (isPlainObject(legacy)) for (const [day, count] of Object.entries(legacy)) add(day, count);
    } catch { /* Malformed derived caches must not hide valid canonical data. */ }
    try {
      const legacy = JSON.parse(storage.getItem(CURRENT_KEY) || '{}');
      if (/^\d{4}-\d{2}-\d{2}$/.test(legacy?.date) && Number.isFinite(legacy?.count) && legacy.count > 0 && !Object.hasOwn(next.waterDailyHistory, legacy.date)) {
        delete history[legacy.date];
        add(legacy.date, legacy.count);
      }
    } catch { /* The canonical record does not depend on this cache. */ }
    if (JSON.stringify(history) !== JSON.stringify(next.waterDailyHistory)) persist({ ...next, waterDailyHistory: history });
    return read();
  }
  function setCount({ date, count }) {
    validateFitnessSnapshot({ waterDailyHistory: { [date]: count } });
    const next = data();
    next.waterDailyHistory[date] = count;
    persist(next);
    return read();
  }
  return { read, migrate, setCount };
}
