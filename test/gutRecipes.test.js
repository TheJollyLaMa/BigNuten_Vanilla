const { test } = require('node:test');
const assert = require('node:assert/strict');
const recipe = () => ({ id: 'soup', name: 'Root Soup', yield: 4, mode: 'ingredients', culture: '', batch: '', note: '',
  estimatedNutr: {}, ingredients: [
    { name: 'Carrot', amount: 200, unit: 'g', detail: 'Synthetic label', nutr: { calories: 80, protein: 2, copper: 0.02, zinc: 0, potassium: 4 } },
    { name: 'Cream', amount: 50, unit: 'ml', detail: '', nutr: { calories: 120, protein: 2, zinc: 0, potassium: 2 } },
  ] });
const period = () => ({ id: 'p', name: 'Observation', recipeId: 'soup', start: '2026-11-01', end: '2026-11-14', note: '',
  fastStart: '2026-11-01T04:00:00.000Z', fastEnd: '2026-11-01T07:00:00.000Z' });

test('ingredient facts preserve portions, trace nutrients and partial coverage without invented unknowns', async () => {
  const { recipeCard } = await import('../js/mealRecipes.mjs');
  const { scaleNutrition, summarizeNutrients } = await import('../js/nutritionDefaults.mjs');
  const card = recipeCard(recipe());
  assert.equal(card.nutr.calories, 50);
  assert.equal(card.nutr.copper, 0.005);
  assert.equal(card.nutr.zinc, 0);
  assert.equal(card.nutr.iodine, undefined);
  assert.ok(card.incompleteNutrients.includes('copper'));
  assert.ok(!card.incompleteNutrients.includes('zinc'));
  assert.equal(scaleNutrition(card, 0.5, 'serving').calories, 25);
  assert.equal(scaleNutrition(card, 2, 'serving').potassium, 3);
  assert.throws(() => scaleNutrition(card, 65, 'g'), /Cannot scale/);
  const totals = summarizeNutrients([{ nutr: card.nutr, nutritionSource: card }]);
  assert.equal(totals.copper.total, 0.005);
  assert.equal(totals.copper.knownEntries, 0);
  assert.equal(totals.zinc.total, 0);
  assert.equal(totals.zinc.knownEntries, 1);
  assert.equal(totals.potassium.total, 70.5);
  assert.equal(totals.iodine.total, null);
});

test('smoothie starter does not select ranges or invent nutrition/CFU; approximate cards require explicit values', async () => {
  const { smoothieStarter, recipeCard, validateMealRecipe, suppliedSmoothieEstimates } = await import('../js/mealRecipes.mjs');
  const starter = smoothieStarter();
  assert.equal(starter.ingredients.find(item => item.name === 'Hemp protein powder').amount, null);
  assert.equal(starter.ingredients.find(item => item.name === 'Inulin').amount, null);
  assert.deepEqual(recipeCard(starter).nutr, {});
  assert.match(starter.note, /380–420/);
  const supplied = suppliedSmoothieEstimates(2);
  assert.equal(supplied.protein, 60);
  assert.equal(supplied.vitaminB12, 5.76);
  assert.equal(supplied.calcium, 780);
  assert.equal(supplied.calories, undefined);
  assert.equal(supplied.thiamin, undefined);
  assert.equal(supplied.potassium, undefined);
  const estimated = { ...starter, mode: 'estimate', estimatedNutr: { calories: 400, protein: 30 } };
  assert.equal(recipeCard(estimated).quality, 'estimate');
  assert.equal(recipeCard(estimated).nutr.calories, 400);
  for (const invalid of [{ ...starter, yield: 0 }, { ...starter, mode: 'magic' },
    { ...starter, estimatedNutr: { fake: 1 } }, { ...starter, estimatedNutr: { protein: -2 } },
    { ...starter, ingredients: [{ ...starter.ingredients[1], nutr: { calories: 4 } }] }]) {
    assert.throws(() => validateMealRecipe(invalid));
  }
});

test('observations validate actual fasts, incomplete intervals, bad dates and DST elapsed duration', async () => {
  const { validateObservedFast, observationTimeline } = await import('../js/gutObservations.mjs');
  const timeline = value => observationTimeline(value, {}, timestamp => timestamp.slice(0, 10));
  assert.equal(timeline(period()).fastingHours, 3, 'Fall-back interval is elapsed UTC, not local clock subtraction.');
  assert.equal(timeline({ ...period(), fastEnd: '' }).fastingHours, null);
  assert.equal(timeline(period()).rows.length, 14);
  assert.equal(timeline({ ...period(), end: '2026-11-07' }).rows.length, 7);
  const now = new Date('2026-11-12T12:00:00Z');
  for (const invalid of [{ ...period(), fastEnd: '2026-12-01T00:00:00.000Z' },
    { ...period(), fastStart: '' }, { ...period(), fastEnd: period().fastStart },
    { ...period(), start: '2026-02-30' }, { ...period(), end: '2026-10-01' }]) {
    assert.throws(() => validateObservedFast(invalid, now));
  }
  assert.equal(validateObservedFast(period(), now).name, 'Observation');
});

test('recipe snapshots, observations, backup and merge retain facts after template edits/deletion', async () => {
  const { recipeCard } = await import('../js/mealRecipes.mjs');
  const { normalizeFitnessData, validateFitnessSnapshot } = await import('../js/fitnessSchema.js');
  const originalWindow = global.window;
  global.window = { BIGNUTEN_STORAGE_RELAY_URL: '' };
  let mergeSnapshotData;
  try { ({ mergeSnapshotData } = await import('../js/fitnessData.js')); }
  finally { if (originalWindow === undefined) delete global.window; else global.window = originalWindow; }
  const { persistDietIntake } = await import('../js/dietIntake.js');
  const card = recipeCard(recipe());
  let state = normalizeFitnessData({ mealRecipes: [recipe()], gutHealth: { observations: [period()] } });
  persistDietIntake({ name: card.name, amount: 1, unit: 'serving', nutr: card.nutr,
    nutritionSource: card, recipeSnapshot: card.recipeSnapshot, time: '12:00' }, () => state, value => { state = value; }, new Date('2026-11-02T12:00:00Z'));
  assert.equal(state.foods.length, 1);
  state.mealRecipes[0].yield = 2;
  assert.equal(state.foods[0].recipeSnapshot.yield, 4);
  state.mealRecipes = [];
  const restored = validateFitnessSnapshot(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.foods, state.foods);
  assert.equal(restored.gutHealth.observations.length, 1);
  const merged = mergeSnapshotData(restored, restored);
  assert.equal(merged.foods.length, 1);
  assert.equal(merged.gutHealth.observations.length, 1);
  assert.throws(() => validateFitnessSnapshot({ mealRecipes: [{ invalid: true }] }));
});

test('timeline uses the provided health day, actual recipe snapshots and current canonical records', async () => {
  const { observationTimeline } = await import('../js/gutObservations.mjs');
  const data = { foods: [
    { name: 'Soup', amount: 0.5, unit: 'serving', date: '2026-11-02T02:00:00Z', recipeSnapshot: { id: 'soup' } },
    { name: 'Other', amount: 1, unit: 'g', date: '2026-11-02T02:00:00Z' }],
    gutHealth: { symptoms: [{ timestamp: '2026-11-02T02:00:00Z' }], sessions: [{ challenge: 'Test',
      readings: [{ timestamp: '2026-11-02T02:00:00Z', hydrogen: { value: 2, scale: 'device score' } }] }] } };
  const { rows } = observationTimeline(period(), data, () => '2026-11-01');
  assert.equal(rows[0].servings, 0.5);
  assert.equal(rows[0].foods.length, 2);
  assert.equal(rows[0].symptoms.length, 1);
  assert.equal(rows[0].readings[0].hydrogen.scale, 'device score');
  data.foods = [];
  assert.equal(observationTimeline(period(), data, () => '2026-11-01').rows[0].servings, 0);
});
