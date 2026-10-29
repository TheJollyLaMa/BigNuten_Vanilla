'use strict';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { Wallet } = require('ethers');
const day = '2026-10-28';
const keys = ['window', 'localStorage', 'document', 'requestIdleCallback', 'FileReader', 'fetch'];
const original = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
after(() => { for (const [key, descriptor] of Object.entries(original)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
function memory() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
let createWater, createRecovery, control, fitness, transport, storage, recovery, water, events;
const signerWallet = new Wallet('0x' + '44'.repeat(32));
const signer = { getAddress: () => signerWallet.getAddress(), signMessage: message => signerWallet.signMessage(message) };
before(async () => {
  global.localStorage = memory();
  global.window = { BIGNUTEN_STORAGE_RELAY_URL: '', ethereum: {}, ethers: { BrowserProvider: class { async getSigner() { return signer; } } }, dispatchEvent: event => events.push(event.type) };
  global.requestIdleCallback = () => 0;
  ({ createWaterIntakeStore: createWater } = await import('../js/waterIntake.js'));
  ({ createSnapshotRecovery: createRecovery } = await import('../js/snapshotRecovery.js'));
  fitness = await import('../js/fitnessData.js');
  control = await import('../js/dataControl.js');
  transport = await import('../js/pinataStorage.js');
  global.FileReader = class {
    readAsText(file) { file.text().then(result => this.onload({ target: { result } }), () => this.onerror()); }
  };
});
beforeEach(() => {
  storage = global.localStorage = memory();
  storage.setItem('userTimezone', 'UTC');
  events = [];
  recovery = createRecovery(storage, () => `${day}T12:00:00Z`, () => day);
  water = createWater(storage, recovery, () => day);
});
const primary = () => JSON.parse(storage.getItem('fitnessTrackerData'));
const file = data => new Blob([JSON.stringify(data)], { type: 'application/json' });

test('multiple daily water logs persist v1 totals and caches without capping intake at the meter goal', () => {
  for (let count = 1; count <= 10; count++) water.setCount({ date: day, count });
  assert.equal(primary().dataVersion, 1);
  assert.deepEqual(primary().waterDailyHistory, { [day]: 10 });
  assert.deepEqual(JSON.parse(storage.getItem('waterDailyHistory')), { [day]: 10 });
  assert.deepEqual(createWater(storage, recovery, () => day).read(), { date: day, count: 10 });
  assert.equal(recovery.points().length, 3);
  water.setCount({ date: day, count: 9 });
  assert.equal(water.read().count, 9);
});

test('legacy cache migration adds missing days but never overwrites canonical snapshot totals', () => {
  recovery.save({ waterDailyHistory: { [day]: 5 } });
  storage.setItem('waterDailyHistory', JSON.stringify({ [day]: 2, '2026-10-27': 3, invalid: 9, '2026-10-26': -2 }));
  storage.setItem('waterTrackerData', JSON.stringify({ date: day, count: 7 }));
  assert.equal(water.migrate().count, 5);
  assert.deepEqual(primary().waterDailyHistory, { [day]: 5, '2026-10-27': 3 });
  water.migrate();
  assert.equal(water.read().count, 5);
});

test('cache-only profiles migrate their latest current count, retain yesterday, and roll over safely', () => {
  storage.setItem('waterDailyHistory', JSON.stringify({ [day]: 2, '2026-10-27': 4 }));
  storage.setItem('waterTrackerData', JSON.stringify({ date: day, count: 3 }));
  assert.equal(water.migrate().count, 3);
  const tomorrow = createWater(storage, recovery, () => '2026-10-29');
  assert.equal(tomorrow.read().count, 0);
  tomorrow.setCount({ date: '2026-10-29', count: 1 });
  assert.deepEqual(primary().waterDailyHistory, { [day]: 3, '2026-10-27': 4, '2026-10-29': 1 });
});

test('missing and malformed water caches are graceful, while invalid canonical data is not overwritten', () => {
  assert.deepEqual(water.read(), { date: day, count: 0 });
  storage.setItem('waterDailyHistory', '{bad');
  storage.setItem('waterTrackerData', 'null');
  assert.equal(water.migrate().count, 0);
  water.setCount({ date: day, count: 1 });
  assert.equal(water.read().count, 1);
  storage.setItem('fitnessTrackerData', '{broken');
  assert.throws(() => water.setCount({ date: day, count: 2 }));
  assert.equal(storage.getItem('fitnessTrackerData'), '{broken');
});

test('failed canonical or cache writes report failure and retain the prior saved water', () => {
  for (const failedKey of ['fitnessTrackerData', 'waterDailyHistory', 'waterTrackerData', 'bignutenRecoveryPoints.v1']) {
    water.setCount({ date: day, count: 1 });
    const before = new Map(storage.values);
    const set = storage.setItem;
    storage.setItem = (key, value) => { if (key === failedKey) throw new Error('quota'); set(key, value); };
    assert.throws(() => water.setCount({ date: day, count: 2 }), /quota/);
    storage.setItem = set;
    for (const key of ['fitnessTrackerData', 'waterDailyHistory', 'waterTrackerData']) assert.equal(storage.getItem(key), before.get(key));
    assert.equal(water.read().count, 1);
  }
});

test('future v1-incompatible primary data is rejected untouched by water logging, migration and JSON import', async () => {
  const raw = '{"dataVersion":2,"waterDailyHistory":{"2026-10-28":12},"future":"retain"}';
  storage.setItem('fitnessTrackerData', raw);
  const before = new Map(storage.values);
  assert.throws(() => water.migrate(), /Update the app/);
  assert.throws(() => water.setCount({ date: day, count: 1 }), /Update the app/);
  await assert.rejects(control.importDataFromJSONFile(file({ waterDailyHistory: { [day]: 2 } })), /Update the app/);
  assert.deepEqual(storage.values, before);
});

test('actual JSON export and legacy/v1 import round-trip water and dispatch restored UI notification', async () => {
  water.setCount({ date: day, count: 4 });
  let downloaded;
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  URL.createObjectURL = blob => { downloaded = blob; return 'blob:synthetic'; };
  URL.revokeObjectURL = () => {};
  global.document = { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } };
  try { control.exportDataAsJSON(); } finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
  const exported = JSON.parse(await downloaded.text());
  assert.deepEqual(exported.waterDailyHistory, { [day]: 4 });
  for (const payload of [exported, { waterHistory: { [day]: 4 } }, { __bignutenSnapshot: true, version: 1, data: exported }]) {
    storage.values.clear();
    storage.setItem('userTimezone', 'UTC');
    const restored = await control.importDataFromJSONFile(file(payload));
    assert.deepEqual(restored.waterDailyHistory, { [day]: 4 });
    assert.equal(JSON.parse(storage.getItem('waterTrackerData')).count, restored.waterDailyHistory[JSON.parse(storage.getItem('waterTrackerData')).date] || 0);
    await control.importDataFromJSONFile(file(payload));
    assert.deepEqual(primary().waterDailyHistory, { [day]: 4 });
  }
  assert.ok(events.includes('bignuten:fitness-data-restored'));
});

test('restoring missing water clears stale cached intake rather than showing previous profile data', async () => {
  const { getTodayInUserTz } = await import('../js/timezone.js');
  storage.setItem('waterTrackerData', JSON.stringify({ date: getTodayInUserTz(), count: 7 }));
  fitness.syncWaterIntakeAfterRestore({ waterDailyHistory: {} });
  assert.equal(JSON.parse(storage.getItem('waterTrackerData')).count, 0);
  assert.deepEqual(JSON.parse(storage.getItem('waterDailyHistory')), {});
});

test('actual IPFS upload and CID import retain water totals and support repeat imports', async () => {
  water.setCount({ date: day, count: 6 });
  let uploaded;
  global.fetch = async (url, options) => {
    if (url.includes('/api/v0/add')) {
      uploaded = JSON.parse(await options.body.get('file').text());
      return new Response(JSON.stringify({ Hash: 'bafysyntheticwater' }), { status: 200 });
    }
    return new Response(JSON.stringify(uploaded), { status: 200 });
  };
  const { cid } = await transport.uploadIpfsDesktopSnapshot(primary());
  assert.equal(uploaded.format, 'bignuten-encrypted-snapshot');
  const restoredEnvelope = await transport.fetchSnapshotData(cid, { signer });
  assert.deepEqual(restoredEnvelope.waterDailyHistory, { [day]: 6 });
  storage.values.clear();
  storage.setItem('userTimezone', 'UTC');
  assert.deepEqual((await fitness.importAndMergeFromCID(cid)).merged.waterDailyHistory, { [day]: 6 });
  assert.equal((await fitness.importAndMergeFromCID(cid)).added.waterDays, 0);
  assert.deepEqual(primary().waterDailyHistory, { [day]: 6 });
});
