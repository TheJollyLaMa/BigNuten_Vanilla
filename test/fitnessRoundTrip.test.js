'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('every defaultData key survives real JSON export → clear → import and snapshot → restore', async () => {
  const names = ['window', 'document', 'localStorage', 'FileReader', 'requestIdleCallback', 'fetch'];
  const originals = Object.fromEntries(names.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map();
  let exportedBlob, download;
  const createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL;
  try {
    global.localStorage = {
      keys: () => [...values.keys()],
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key),
    };
    global.window = { BIGNUTEN_STORAGE_RELAY_URL: '', dispatchEvent() {} };
    global.requestIdleCallback = () => 0;
    global.fetch = async () => { throw new Error('Round trip must remain offline'); };
    global.document = {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      body: { appendChild() {}, removeChild() {} },
      createElement: () => ({ click() { download = this.download; } }),
    };
    global.FileReader = class {
      readAsText(file) { file.text().then(result => this.onload({ target: { result } }), error => this.onerror(error)); }
    };
    URL.createObjectURL = blob => { exportedBlob = blob; return 'blob:synthetic-export'; };
    URL.revokeObjectURL = () => {};
    const { defaultData, cloneDefaultData, validateFitnessSnapshot } = await import('../js/fitnessSchema.js');
    const { createSnapshotRecovery } = await import('../js/snapshotRecovery.js');
    const { exportDataAsJSON, importDataFromJSONFile } = await import('../js/dataControl.js');
    const { getMetric, convertMetricValue } = await import('../js/metrics.js');
    const vitalLogs = [
      ['temperature', 98.6], ['bp', { systolic: 120, diastolic: 80 }],
      ['spo2', 98], ['rr', 16], ['hrv', 42.5], ['vo2max', 45.5],
    ].map(([metric, value]) => ({
      id: `synthetic-${metric}`, metric,
      value: convertMetricValue(value, getMetric(metric), 'imperial'), unit: getMetric(metric).canonicalUnit,
      date: '2026-10-28', time: '10:00', note: 'Synthetic manual/device result',
      source: metric === 'vo2max' ? 'estimated' : 'self-reported',
    }));
    const fixture = {
      dataVersion: 1, timeZone: 'Pacific/Honolulu',
      weightLogs: [{ timestamp: '2026-10-28T12:00:00Z', weight: 72 }],
      waterDailyHistory: { '2026-10-27': 3, '2026-10-28': 5 },
      supplements: [{ id: 'synthetic-supplement', name: 'Vitamin C', dose: 50 }],
      foods: [{ id: 'synthetic-food', name: 'Apple', grams: 120, time: '08:15', nutr: { calories: 95 } }],
      measurements: [{ id: 'synthetic-measurement', type: 'Waist', measurement: 80, unit: 'cm', date: '2026-10-28', time: '10:00', progressPhotoTaken: true, progressPhotoNote: 'Private photo elsewhere', bodyFatMetricId: 'synthetic-fat' }],
      measurementReminderDismissedOn: '2026-10-27',
      metricLogs: [{ id: 'synthetic-rhr', metric: 'rhr', value: 62, unit: 'bpm', date: '2026-10-28', time: '10:00', note: 'Resting', source: 'self-reported' }, { id: 'synthetic-sleep', metric: 'sleep', value: 27000, unit: 's', date: '2026-10-28', time: '07:30', sleepQuality: 8, note: 'Synthetic dream', source: 'self-reported' }, { id: 'synthetic-energy', metric: 'energy', value: 7, unit: 'rating', date: '2026-10-28', time: '10:00', note: '', source: 'self-reported' }, { id: 'synthetic-fat', metric: 'bodyFat', value: 22.5, unit: '%', date: '2026-10-28', time: '10:00', note: '', source: 'imported' }, ...vitalLogs],
      breathworkSessions: [{ id: 'synthetic-breath', method: 'Box Breathing', pattern: { inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 }, rounds: 2, durationSeconds: 32, notes: 'Synthetic practice', feeling: 'calm', timestamp: '2026-10-28T10:00:00Z' }, { id: 'synthetic-paced-recovery', method: 'Wim Hof-style (paced, no retention) — caution', pattern: { inhale: 2, holdIn: 0, exhale: 2, holdOut: 0 }, protocol: 'paced-recovery', rounds: 1, durationSeconds: 130, notes: 'Synthetic optional practice', feeling: '', timestamp: '2026-10-28T11:00:00Z' }],
      exercises: { types: ['Push-ups', 'Synthetic exercise'], entries: [{ id: 'synthetic-exercise', reps: 6, weight: 10 }] },
      sessionLog: [{ id: 'synthetic-session', start: '2026-10-28T10:00:00Z', end: '2026-10-28T10:01:00Z', durationSeconds: 60, rpe: 7, workoutTypes: ['Push-ups'], recovery: { soreness: true, tightness: false, note: 'Legs sore' } }],
      painLogs: [{ id: 'synthetic-pain', level: 2 }],
      chantingSessions: [{ id: 'synthetic-chant', mantra: 'Aum', durationSeconds: 12, targetSeconds: 900, completedGoal: false, notes: 'Synthetic only', sensations: ['calm'], timestamp: '2026-10-28T12:00:00Z' }],
      emotions: [{ id: 'synthetic-emotion', emotion: 'Calm' }],
      genieSessions: [{ id: 'synthetic-chat', messages: [{ role: 'user', content: 'Synthetic only' }] }],
      genieInsights: [{ id: 'synthetic-insight', text: 'Synthetic only' }],
    };
    fixture.metricLogs.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    const keys = Object.keys(defaultData).sort();
    assert.deepEqual(Object.keys(fixture).sort(), keys, 'New schema keys require a populated fixture');
    assert.deepEqual(validateFitnessSnapshot(fixture), fixture);
    for (const key of keys.filter(key => key !== 'dataVersion')) {
      assert.notDeepEqual(fixture[key], cloneDefaultData()[key], `${key} must exercise non-default data`);
    }
    const recovery = createSnapshotRecovery(localStorage, () => '2026-10-28T12:00:00Z', () => '2026-10-28');
    recovery.save(fixture);
    exportDataAsJSON();
    assert.match(download, /^bignuten-backup-\d{4}-\d{2}-\d{2}\.json$/);
    assert.deepEqual(JSON.parse(await exportedBlob.text()), fixture);
    values.clear();
    assert.equal(localStorage.getItem('fitnessTrackerData'), null);
    const imported = await importDataFromJSONFile(exportedBlob);
    for (const key of keys) {
      assert.deepEqual(imported[key], fixture[key], `JSON import: ${key}`);
      assert.deepEqual(JSON.parse(localStorage.getItem('fitnessTrackerData'))[key], fixture[key], `Persisted import: ${key}`);
    }
    assert.deepEqual(await importDataFromJSONFile(exportedBlob), fixture, 'Re-import is idempotent');
    const snapshot = recovery.points()[0];
    assert.deepEqual(JSON.parse(snapshot.raw), fixture);
    for (const key of ['fitnessTrackerData', 'waterDailyHistory', 'waterTrackerData']) localStorage.removeItem(key);
    assert.equal(recovery.recover().date, snapshot.date);
    const restored = JSON.parse(localStorage.getItem('fitnessTrackerData'));
    assert.deepEqual(Object.keys(restored).sort(), keys);
    for (const key of keys) assert.deepEqual(restored[key], fixture[key], `Snapshot restore: ${key}`);
    assert.deepEqual(JSON.parse(localStorage.getItem('waterDailyHistory')), fixture.waterDailyHistory);
    assert.deepEqual(JSON.parse(localStorage.getItem('waterTrackerData')), { date: '2026-10-28', count: 5 });
  } finally {
    URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL;
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
