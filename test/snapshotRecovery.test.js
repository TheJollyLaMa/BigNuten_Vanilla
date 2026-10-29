'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let createRecovery, clearLocalHealthData, validate, normalize;
before(async () => {
  ({ createSnapshotRecovery: createRecovery, clearLocalHealthData } = await import('../js/snapshotRecovery.js'));
  ({ validateFitnessSnapshot: validate, normalizeFitnessData: normalize } = await import('../js/fitnessSchema.js'));
});
function memory() {
  const values = new Map();
  return { values, keys: () => [...values.keys()], getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
const sample = number => ({ dataVersion: 1, weightLogs: [{ timestamp: `2026-10-${20 + number}T10:00:00Z`, weight: 70 + number }], waterDailyHistory: { '2026-10-28': number } });
function store(storage) { return createRecovery(storage, () => '2026-10-28T12:00:00Z', () => '2026-10-28'); }

test('validates legacy aliases and v1 through the same schema; rejects future versions without rewriting', () => {
  assert.equal(validate({ weights: [{ weight: 70 }] }).weightLogs.length, 1);
  for (const raw of [ { dataVersion: 2, weightLogs: [] }, { __bignutenSnapshot: true, version: 2, data: sample(1) } ]) {
    const before = JSON.stringify(raw);
    assert.throws(() => validate(raw), /Update the app/);
    assert.throws(() => normalize(raw), /Update the app/);
    assert.equal(JSON.stringify(raw), before);
  }
  for (const bad of [null, [], {}, { weightLogs: {} }, { foods: [null] }, { exercises: { entries: {} } }, { waterDailyHistory: { '2026-10-28': '3' } }]) assert.throws(() => validate(bad));
});

test('keeps three local points, restores the newest valid one and undo preserves exact original bytes and caches', () => {
  const storage = memory(), recovery = store(storage);
  for (let i = 1; i <= 4; i++) recovery.save(sample(i));
  assert.equal(recovery.points().length, 3);
  storage.setItem('fitnessTrackerData', '{ corrupt original bytes');
  storage.setItem('waterDailyHistory', 'old-cache');
  const before = Object.fromEntries(['fitnessTrackerData', 'waterDailyHistory', 'waterTrackerData'].map(key => [key, storage.getItem(key)]));
  const result = recovery.recover();
  assert.equal(result.date, '2026-10-28T12:00:00Z');
  assert.deepEqual(JSON.parse(storage.getItem('fitnessTrackerData')), validate(sample(4)));
  assert.equal(JSON.parse(storage.getItem('waterTrackerData')).count, 4);
  assert.equal(store(storage).recover(), null);
  recovery.undo();
  for (const [key, value] of Object.entries(before)) assert.equal(storage.getItem(key), value);
  assert.equal(recovery.pending().before.fitnessTrackerData, '{ corrupt original bytes');
});

test('missing primary restores, undo removes only the originally missing keys, and invalid newest point is skipped', () => {
  const storage = memory(), recovery = store(storage);
  recovery.save(sample(1)); recovery.save(sample(2));
  const points = recovery.points(); points[0].raw = '{broken';
  storage.setItem('bignutenRecoveryPoints.v1', JSON.stringify(points));
  storage.removeItem('fitnessTrackerData');
  recovery.recover();
  assert.deepEqual(JSON.parse(storage.getItem('fitnessTrackerData')), validate(sample(1)));
  recovery.undo();
  assert.equal(storage.getItem('fitnessTrackerData'), null);
});

test('never auto-restores over valid or future-version data and never invents data without a valid recovery point', () => {
  const storage = memory(), recovery = store(storage);
  recovery.save(sample(1));
  const raw = JSON.stringify(sample(3)); storage.setItem('fitnessTrackerData', raw);
  assert.equal(recovery.recover(), null); assert.equal(storage.getItem('fitnessTrackerData'), raw);
  const future = '{"dataVersion":99,"weightLogs":[]}'; storage.setItem('fitnessTrackerData', future);
  assert.throws(() => recovery.recover(), /Update the app/); assert.equal(storage.getItem('fitnessTrackerData'), future);
  const empty = memory(); assert.equal(store(empty).recover(), null); assert.equal(empty.values.size, 0);
  empty.setItem('fitnessTrackerData', 'bad'); assert.throws(() => store(empty).recover(), /no valid recovery point/); assert.equal(empty.getItem('fitnessTrackerData'), 'bad');
});

test('undo refuses to overwrite edits; failed recovery writes retain original data and never report success', () => {
  const storage = memory(), recovery = store(storage);
  recovery.save(sample(1)); storage.setItem('fitnessTrackerData', 'bad');
  const setItem = storage.setItem;
  storage.setItem = (key, value) => { if (key === 'waterDailyHistory') throw new Error('quota'); return setItem(key, value); };
  assert.throws(() => recovery.recover(), /quota/); assert.equal(storage.getItem('fitnessTrackerData'), 'bad');
  storage.setItem = setItem;
  recovery.recover(); storage.setItem('fitnessTrackerData', JSON.stringify(sample(2)));
  assert.throws(() => recovery.undo(), /Data changed/);
});

test('failed recovery-point and primary writes do not replace the previous primary or lose the last good point', () => {
  for (const failedKey of ['bignutenRecoveryPoints.v1', 'fitnessTrackerData']) {
    const storage = memory(), recovery = store(storage);
    recovery.save(sample(1)); const before = storage.getItem('fitnessTrackerData');
    const set = storage.setItem;
    storage.setItem = (key, value) => { if (key === failedKey) throw new Error('quota'); set(key, value); };
    assert.throws(() => recovery.save(sample(2)), /quota/);
    assert.equal(storage.getItem('fitnessTrackerData'), before);
    assert.ok(recovery.points().some(point => point.raw === before));
  }
});

test('automatic recovery exposes a visible dated notice and undo control without uploading', async () => {
  const { initializeSnapshotRecovery } = await import('../js/snapshotRecovery.js');
  const storage = memory(), recovery = store(storage);
  recovery.save(sample(1)); storage.setItem('fitnessTrackerData', '{broken');
  const descriptors = Object.fromEntries(['localStorage', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const elements = [];
  try {
    global.localStorage = storage;
    global.document = {
      readyState: 'complete', getElementById: () => null,
      createElement: tag => ({ tag, children: [], style: {}, setAttribute() {}, appendChild(child) { this.children.push(child); } }),
      body: { appendChild(element) { elements.push(element); } },
    };
    initializeSnapshotRecovery();
    assert.equal(elements.length, 1);
    const notice = elements[0];
    assert.match(notice.children[0].textContent, /Restored local recovery point from 2026-10-28T12:00:00Z/);
    const undo = notice.children.find(child => child.textContent === 'Undo recovery');
    assert.ok(undo); undo.onclick();
    assert.equal(storage.getItem('fitnessTrackerData'), '{broken');
    assert.equal(undo.disabled, true);
  } finally {
    for (const [key, descriptor] of Object.entries(descriptors)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});


test('legacy local snapshots recover through the same validated, dated, undoable path', () => {
  const storage = memory(), recovery = store(storage);
  storage.keys = () => [...storage.values.keys()];
  storage.setItem('fitnessTrackerSnapshot-2026-10-25T10:00:00Z', JSON.stringify({ data: sample(1), cid: 'legacy' }));
  storage.setItem('fitnessTrackerSnapshot-2026-10-26T10:00:00Z', '{broken');
  assert.equal(recovery.recover().date, '2026-10-25T10:00:00Z');
  assert.deepEqual(JSON.parse(storage.getItem('fitnessTrackerData')), validate(sample(1)));
  recovery.undo(); assert.equal(storage.getItem('fitnessTrackerData'), null);
});


test('delete then fresh recovery initialization cannot resurrect primary, caches or legacy snapshots', () => {
  const storage = memory(), recovery = store(storage);
  recovery.save(sample(1));
  storage.setItem('fitnessTrackerData', '{broken');
  const entry = recovery.recover();
  recovery.dismiss(entry.eventId);
  recovery.undo();
  storage.setItem('fitnessTrackerSnapshot-2026-10-25T10:00:00Z', JSON.stringify({ data: sample(2) }));
  storage.setItem('unrelated-setting', 'retained');
  clearLocalHealthData(storage);
  assert.equal(store(storage).recover(), null);
  assert.equal(store(storage).pending(), null);
  assert.deepEqual([...storage.values], [['unrelated-setting', 'retained']]);
});

test('dismissal persists for its recovery event, not a new event', () => {
  const storage = memory(), recovery = store(storage);
  recovery.save(sample(1)); storage.setItem('fitnessTrackerData', '{broken');
  const entry = recovery.recover(); recovery.dismiss(entry.eventId);
  const reloaded = store(storage);
  assert.equal(reloaded.recover(), null);
  assert.equal(reloaded.isDismissed(reloaded.pending().eventId), true);
  storage.setItem('fitnessTrackerData', '{new corruption');
  const next = reloaded.recover();
  assert.notEqual(next.eventId, entry.eventId);
  assert.equal(reloaded.isDismissed(next.eventId), false);
});

test('undo sticks across reloads for missing and corrupt states; new corruption can recover', () => {
  for (const raw of [null, '{broken']) {
    const storage = memory(), recovery = store(storage);
    recovery.save(sample(1));
    if (raw === null) storage.removeItem('fitnessTrackerData'); else storage.setItem('fitnessTrackerData', raw);
    recovery.recover(); recovery.undo();
    for (let reload = 0; reload < 2; reload++) {
      assert.equal(store(storage).recover(), null);
      assert.equal(storage.getItem('fitnessTrackerData'), raw);
    }
    storage.setItem('fitnessTrackerData', '{different corruption');
    assert.ok(store(storage).recover());
    recovery.undo();
    recovery.save(sample(2));
    storage.setItem('fitnessTrackerData', '{different corruption');
    assert.ok(store(storage).recover(), 'a successful save starts a new corruption event even with identical corrupt bytes');
  }
});


test('notice dismiss button persists its event and fresh initialization does not show it again', async () => {
  const { initializeSnapshotRecovery } = await import('../js/snapshotRecovery.js');
  const storage = memory(), recovery = store(storage);
  recovery.save(sample(1)); storage.setItem('fitnessTrackerData', '{broken');
  const descriptors = Object.fromEntries(['localStorage', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const elements = [];
  try {
    global.localStorage = storage;
    global.document = {
      readyState: 'complete', getElementById: () => null,
      createElement: tag => ({ tag, children: [], style: {}, setAttribute() {}, appendChild(child) { this.children.push(child); }, remove() { this.removed = true; } }),
      body: { appendChild(element) { elements.push(element); } },
    };
    initializeSnapshotRecovery();
    const notice = elements[0];
    const dismiss = notice.children.find(child => child.textContent === 'Dismiss recovery notice');
    assert.equal(dismiss.tag, 'button'); assert.equal(dismiss.type, 'button');
    dismiss.onclick(); assert.equal(notice.removed, true);
    initializeSnapshotRecovery();
    assert.equal(elements.length, 1);
    storage.setItem('fitnessTrackerData', '{new corruption');
    initializeSnapshotRecovery();
    assert.equal(elements.length, 2, 'new recovery gets a new notice');
  } finally {
    for (const [key, descriptor] of Object.entries(descriptors)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
});

test('failed undo choice persistence keeps recovered bytes and permits retry', () => {
  const storage = memory(), recovery = store(storage);
  recovery.save(sample(1)); storage.setItem('fitnessTrackerData', '{broken');
  recovery.recover();
  const recovered = storage.getItem('fitnessTrackerData');
  const set = storage.setItem;
  storage.setItem = (key, value) => { if (key === 'bignutenRecoveryUndone.v1') throw new Error('quota'); return set(key, value); };
  assert.throws(() => recovery.undo(), /quota/);
  assert.equal(storage.getItem('fitnessTrackerData'), recovered);
  storage.setItem = set;
  recovery.undo(); assert.equal(store(storage).recover(), null);
});
