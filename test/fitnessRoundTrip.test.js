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
    const fixture = {
      dataVersion: 1, timeZone: 'Pacific/Honolulu',
      weightLogs: [{ timestamp: '2026-10-28T12:00:00Z', weight: 72 }],
      waterDailyHistory: { '2026-10-27': 3, '2026-10-28': 5 },
      supplements: [{ id: 'synthetic-supplement', name: 'Vitamin C', dose: 50 }],
      foods: [{ id: 'synthetic-food', name: 'Apple', grams: 120 }],
      measurements: [{ id: 'synthetic-measurement', waist: 80 }],
      metricLogs: [{ id: 'synthetic-rhr', metric: 'rhr', value: 62, unit: 'bpm', date: '2026-10-28', time: '10:00', note: 'Resting', source: 'self-reported' }],
      exercises: { types: ['Push-ups', 'Synthetic exercise'], entries: [{ id: 'synthetic-exercise', reps: 6, weight: 10 }] },
      sessionLog: [{ id: 'synthetic-session', duration: 60 }],
      painLogs: [{ id: 'synthetic-pain', level: 2 }],
      emotions: [{ id: 'synthetic-emotion', emotion: 'Calm' }],
      genieSessions: [{ id: 'synthetic-chat', messages: [{ role: 'user', content: 'Synthetic only' }] }],
      genieInsights: [{ id: 'synthetic-insight', text: 'Synthetic only' }],
    };
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
