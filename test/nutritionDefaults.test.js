const { test } = require('node:test');
const assert = require('node:assert/strict');
const fixture = {
  name: 'Synthetic oats', kind: 'whole', preparation: 'raw', brand: '', market: '', barcode: '',
  amount: 100, unit: 'g', serving: '', ingredients: '', note: '', quality: 'user-entered',
  retrievedAt: '2026-11-01T00:00:00Z', sources: [], nutr: { calories: 389, protein: 16.9, sodium: 0 },
};
test('nutrition defaults retain missing nutrients and scale from exact unrounded base', async () => {
  const { validateNutrition, scaleNutrition } = await import('../js/nutritionDefaults.mjs');
  const card = validateNutrition(fixture);
  assert.deepEqual(scaleNutrition(card, 50, 'g'), { calories: 194.5, protein: 8.45, sodium: 0 });
  assert.equal(scaleNutrition(card, 1, 'oz').calories, 389 * 28.349523125 / 100);
  assert.equal(scaleNutrition(card, 100, 'g').calories, 389);
  assert.throws(() => scaleNutrition(card, 1, 'ml'), /Cannot scale/);
  assert.throws(() => scaleNutrition(card, 1, 'serving'), /Cannot scale/);
  assert.throws(() => scaleNutrition(card, 0, 'g'), /positive/);
  assert.ok(!Object.hasOwn(card.nutr, 'potassium'));
});
test('exact identity replacement and ambiguous-name matching distinguish products/preparations', async () => {
  const { saveNutritionDefault, matchingDefaults } = await import('../js/nutritionDefaults.mjs');
  let cards = saveNutritionDefault([], fixture);
  cards = saveNutritionDefault(cards, { ...fixture, preparation: 'cooked' });
  assert.equal(matchingDefaults(cards, fixture.name).length, 2);
  cards = saveNutritionDefault(cards, { ...fixture, nutr: { calories: 400 } });
  assert.equal(cards.length, 2);
  assert.equal(cards.find(card => card.preparation === 'raw').nutr.calories, 400);
  const products = ['US', 'GB'].map(market => ({ ...fixture, kind: 'packaged', brand: 'Synthetic brand', market }));
  for (const card of products) cards = saveNutritionDefault(cards, card);
  assert.equal(new Set(cards.map(card => card.id)).size, 4);
});
test('invalid values, unknown units, absent product identity and unsafe sources reject explicitly', async () => {
  const { validateNutrition } = await import('../js/nutritionDefaults.mjs');
  for (const number of [-1, NaN, Infinity, '5']) assert.throws(() => validateNutrition({ ...fixture, nutr: { calories: number } }), /Invalid/);
  assert.throws(() => validateNutrition({ ...fixture, nutr: { mystery: 1 } }), /Unsupported/);
  assert.throws(() => validateNutrition({ ...fixture, kind: 'packaged' }), /brand/);
  assert.throws(() => validateNutrition({ ...fixture, unit: 'serving' }), /Describe/);
  assert.throws(() => validateNutrition({ ...fixture, quality: 'source-backed' }), /source/);
  assert.throws(() => validateNutrition({ ...fixture, sources: [{ url: 'javascript:alert(1)' }] }), /HTTPS/);
});
test('defaults are schema-validated, recoverable and merge without overwriting local approval', async () => {
  const { validateNutrition } = await import('../js/nutritionDefaults.mjs');
  const { normalizeFitnessData, validateFitnessSnapshot } = await import('../js/fitnessSchema.js');
  global.window = {};
  global.localStorage = { getItem: () => null };
  global.requestIdleCallback = () => 0;
  const { mergeSnapshotData } = await import('../js/fitnessData.js');
  delete global.window; delete global.localStorage; delete global.requestIdleCallback;
  const card = validateNutrition(fixture);
  const old = normalizeFitnessData({ foods: [] });
  assert.deepEqual(old.nutritionDefaults, []);
  const current = normalizeFitnessData({ nutritionDefaults: [card] });
  const incoming = normalizeFitnessData({ nutritionDefaults: [{ ...card, nutr: { calories: 999 } }] });
  const merged = mergeSnapshotData(current, incoming);
  assert.equal(merged.nutritionDefaults[0].nutr.calories, 389);
  assert.deepEqual(validateFitnessSnapshot(JSON.parse(JSON.stringify(merged))), merged);
});
