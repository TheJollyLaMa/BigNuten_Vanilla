'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('raw-food quick log and full Diet logger persist into the same foods list without losing other health data', async () => {
  const { persistDietIntake } = await import('../js/dietIntake.js');
  let stored = JSON.stringify({ foods: [{ name: 'Existing food' }], waterIntake: [{ amount: 250 }], weightLogs: [{ weight: 70 }] });
  const load = () => JSON.parse(stored);
  const save = data => { stored = JSON.stringify(data); };
  const raw = persistDietIntake({ name: ' Carrot ', amount: '0.5', unit: ' cup ', nutr: { protein: 1.2 } }, load, save);
  const full = persistDietIntake({ name: 'Rice', amount: 1, unit: 'cup', nutr: { protein: 4, calories: 200 } }, load, save);
  assert.equal(raw.type, 'diet'); assert.equal(raw.name, 'Carrot'); assert.equal(raw.amount, 0.5); assert.equal(raw.unit, 'cup');
  assert.deepEqual(raw.nutr, { protein: 1.2 }); assert.ok(Number.isFinite(Date.parse(raw.date)));
  assert.deepEqual(load().foods, [{ name: 'Existing food' }, raw, full]);
  assert.deepEqual(load().waterIntake, [{ amount: 250 }]); assert.deepEqual(load().weightLogs, [{ weight: 70 }]);
});

test('invalid quick-log amounts or nutrition do not persist', async () => {
  const { persistDietIntake } = await import('../js/dietIntake.js');
  for (const fields of [{ amount: 0 }, { amount: -1 }, { amount: NaN }, { amount: '' }, { name: '' }, { unit: '' }, { nutr: { protein: -1 } }, { nutr: { protein: NaN } }]) {
    assert.equal(persistDietIntake({ name: 'Carrot', amount: 1, unit: 'cup', ...fields }, () => { throw new Error('Must not load'); }, () => { throw new Error('Must not save'); }), null);
  }
});
