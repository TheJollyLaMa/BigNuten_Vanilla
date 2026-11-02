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
  assert.equal(scaleNutrition(card, 1, 'serving').calories, 389);
  assert.equal(scaleNutrition(card, 0.5, 'serving').calories, 194.5);
  assert.throws(() => scaleNutrition(card, 0, 'g'), /positive/);
  assert.ok(!Object.hasOwn(card.nutr, 'potassium'));
});
test('source-defined household portions scale cups, fractions, spoons and labeled servings from the unchanged base', async () => {
  const { validateNutrition, scaleNutrition } = await import('../js/nutritionDefaults.mjs');
  const sourceUrl = 'https://example.com/pasta';
  const card = validateNutrition({ ...fixture, name: 'Synthetic cooked pasta', quality: 'source-backed',
    sources: [{ url: sourceUrl }], nutr: { calories: 158, protein: 5.8 },
    measures: [{ amount: 1, unit: 'cup', baseAmount: 140, sourceUrl },
      { amount: 1, unit: 'serving', baseAmount: 80, sourceUrl }] });
  assert.equal(scaleNutrition(card, 1, 'cup').calories, 221.2);
  assert.equal(scaleNutrition(card, 0.5, 'cup').calories, 110.6);
  assert.equal(scaleNutrition(card, 2, 'cup').calories, 442.4);
  assert.equal(scaleNutrition(card, 8, 'tbsp').calories, 110.6);
  assert.equal(scaleNutrition(card, 120, 'ml').calories, 110.6);
  assert.equal(scaleNutrition(card, 2, 'serving').calories, 252.8);
  assert.equal(scaleNutrition(card, 100, 'g').calories, 158);
  assert.equal(card.amount, 100);
  assert.ok(!Object.hasOwn(scaleNutrition(card, 1, 'cup'), 'sugar'));
  const volume = validateNutrition({ ...fixture, amount: 240, unit: 'ml' });
  assert.equal(scaleNutrition(volume, 1, 'cup').calories, 389);
  assert.equal(scaleNutrition(volume, 8, 'fl oz').calories, 389);
});
test('legacy cards need explicit cup weight but not a guessed density; local measures survive snapshot validation', async () => {
  const { validateNutrition, scaleNutrition } = await import('../js/nutritionDefaults.mjs');
  const { normalizeFitnessData, validateFitnessSnapshot } = await import('../js/fitnessSchema.js');
  const legacy = validateNutrition(fixture);
  assert.deepEqual(legacy.measures, []);
  assert.throws(() => scaleNutrition(legacy, 1, 'cup'), /portion size/);
  const local = validateNutrition({ ...legacy, measures: [{ amount: 1, unit: 'cup', baseAmount: 140, sourceUrl: '' }] });
  const restored = validateFitnessSnapshot(JSON.parse(JSON.stringify(normalizeFitnessData({ nutritionDefaults: [local] }))));
  assert.ok(Math.abs(scaleNutrition(restored.nutritionDefaults[0], 0.5, 'cup').calories - 272.3) < 1e-10);
  for (const baseAmount of [0, -1, NaN, Infinity, '140']) {
    assert.throws(() => validateNutrition({ ...fixture, measures: [{ amount: 1, unit: 'cup', baseAmount }] }), /measures/);
  }
  assert.throws(() => validateNutrition({ ...fixture, measures: [{ amount: 1, unit: 'g', baseAmount: 5 }] }), /measures/);
  assert.throws(() => validateNutrition({ ...fixture, quality: 'source-backed', sources: [{ url: 'https://example.com/oats' }],
    measures: [{ amount: 1, unit: 'cup', baseAmount: 140, sourceUrl: '' }] }), /matching source/);
  assert.throws(() => validateNutrition({ ...fixture, measures: [{ amount: 1, unit: 'cup', baseAmount: 140, sourceUrl: 'https://example.com/other' }] }), /match a nutrition source/);
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
