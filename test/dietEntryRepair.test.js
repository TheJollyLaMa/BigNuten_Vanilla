const { test } = require('node:test');
const assert = require('node:assert/strict');

test('meal repair replaces one entry, preserves its date and refuses stale records', async () => {
  const { changeDietEntry, foodsInNutritionPeriod } = await import('../js/dietIntake.js');
  const { summarizeNutrients, scaleNutrition, validateNutrition } = await import('../js/nutritionDefaults.mjs');
  const foods = [{ name: 'Other meal', date: '2026-11-04', nutr: { calories: 5 } },
    { name: 'oysters smoked wegmans', date: '2026-11-05T23:45:00Z', time: '19:45', amount: 65, unit: 'serving' }];
  const original = JSON.stringify(foods[1]);
  const card = validateNutrition({ name: foods[1].name, kind: 'whole', amount: 65, unit: 'g',
    quality: 'user-entered', retrievedAt: '2026-11-06T00:00:00Z', sources: [],
    nutr: { calories: 160, protein: 10, zinc: 0 }, measures: [{ unit: 'serving', amount: 1, baseAmount: 65 }] });
  assert.equal(scaleNutrition(card, 1, 'serving').calories, 160);
  assert.equal(scaleNutrition(card, 65, 'g').protein, 10);
  assert.equal(scaleNutrition(card, 65, 'serving').calories, 10400, '65 servings must never silently become 65 g.');
  const repaired = changeDietEntry(foods, 1, original,
    { amount: 1, unit: 'serving', nutr: scaleNutrition(card, 1, 'serving'), date: '2099-01-01' });
  assert.equal(repaired.length, 2);
  assert.equal(repaired[1].date, foods[1].date);
  assert.equal(repaired[1].time, '19:45');
  assert.equal(repaired[1].nutr.calories, 160);
  assert.equal(JSON.stringify(foods[1]), original);
  const daily = foodsInNutritionPeriod(repaired, '2026-11-05', 1, date => date.slice(0, 10));
  assert.equal(summarizeNutrients(daily).protein.total, 10);
  assert.equal(summarizeNutrients(daily).iodine.total, null);
  assert.equal(summarizeNutrients(daily).zinc.total, 0);
  assert.throws(() => changeDietEntry(repaired, 1, original), /changed since/);
  assert.throws(() => changeDietEntry(repaired, -1, original), /changed since/);
  const removed = changeDietEntry(repaired, 1, JSON.stringify(repaired[1]));
  assert.deepEqual(removed, [foods[0]]);
  assert.equal(summarizeNutrients(foodsInNutritionPeriod(removed, '2026-11-05', 1)).calories.total, null);
});
