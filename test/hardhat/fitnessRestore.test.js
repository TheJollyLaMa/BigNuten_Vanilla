'use strict';

const assert = require('node:assert/strict');
const { beforeEach, afterEach, describe, it } = require('mocha');

const values = new Map();
const events = [];

let syncWaterIntakeAfterRestore;
let getTodayInUserTz;

describe('fitness snapshot restore', () => {
  let originalGlobals;

  beforeEach(async () => {
    originalGlobals = Object.fromEntries(
      ['localStorage', 'CustomEvent', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
    );
    globalThis.localStorage = {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); },
    };
    globalThis.CustomEvent = class CustomEvent {
      constructor(type) { this.type = type; }
    };
    globalThis.window = {
      BIGNUTEN_STORAGE_RELAY_URL: '',
      dispatchEvent(event) { events.push(event.type); },
    };

    ({ syncWaterIntakeAfterRestore } = await import('../../js/fitnessData.js'));
    ({ getTodayInUserTz } = await import('../../js/timezone.js'));
  });

  afterEach(() => {
    for (const [key, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  it('synchronizes water history and today widget, then notifies the UI', () => {
    values.clear();
    events.length = 0;
    const today = getTodayInUserTz();
    const restoredHistory = { '2026-09-30': 4, [today]: 7 };
    values.set('waterTrackerData', JSON.stringify({ date: today, count: 2 }));

    syncWaterIntakeAfterRestore({ waterDailyHistory: restoredHistory });

    assert.deepEqual(JSON.parse(values.get('waterDailyHistory')), restoredHistory);
    assert.deepEqual(JSON.parse(values.get('waterTrackerData')), { date: today, count: 7 });
    assert.deepEqual(events, ['bignuten:fitness-data-restored']);
  });

  it('resets an out-of-date water widget when restored data has no today entry', () => {
    values.clear();
    events.length = 0;
    const today = getTodayInUserTz();
    values.set('waterTrackerData', JSON.stringify({ date: '2020-01-01', count: 8 }));

    syncWaterIntakeAfterRestore({ waterDailyHistory: { '2020-01-01': 8 } });

    assert.deepEqual(JSON.parse(values.get('waterTrackerData')), { date: today, count: 0 });
  });
});
