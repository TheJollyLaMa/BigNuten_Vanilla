const { test } = require('node:test');
const assert = require('node:assert/strict');

const fixture = {
  name: 'Synthetic mineral food', kind: 'whole', preparation: 'raw', brand: '', market: '', barcode: '',
  amount: 100, unit: 'g', serving: '', quality: 'source-backed', retrievedAt: '2026-11-05T12:00:00Z',
  sources: [{ url: 'https://example.com/synthetic-label', title: 'Synthetic test label' }],
  nutr: { calories: 100, calcium: 130, magnesium: 42, potassium: 10, iodine: 15,
    copper: 0.09, vitaminB12: 0.024, vitaminD: 80, selenium: 0, zinc: null },
};

test('one-time enrichment preserves existing figures and scales only missing values into the original base', async () => {
  const { validateNutrition, enrichNutritionCard, needsNutritionEnrichment } = await import('../js/nutritionDefaults.mjs');
  const old = validateNutrition({ ...fixture, amount: 50, nutr: { calories: 71, selenium: 0 } });
  assert.equal(needsNutritionEnrichment(old), true);
  const enriched = enrichNutritionCard(old, { ...fixture, nutritionCoverageVersion: 1 });
  assert.equal(enriched.amount, 50);
  assert.equal(enriched.nutr.calories, 71);
  assert.equal(enriched.nutr.selenium, 0);
  assert.equal(enriched.nutr.iodine, 7.5);
  assert.equal(enriched.nutr.copper, 0.045);
  assert.ok(!Object.hasOwn(enriched.nutr, 'zinc'));
  assert.equal(enriched.quality, 'estimate', 'Combined facts are not falsely presented as one verified reference.');
  const restored = validateNutrition(JSON.parse(JSON.stringify(enriched)));
  assert.equal(needsNutritionEnrichment(restored), false);
  assert.equal(enrichNutritionCard({ ...old, quality: 'user-entered' }, enriched).quality, 'user-entered');
  assert.throws(() => enrichNutritionCard(old, { ...fixture, unit: 'ml' }), /Cannot scale/);
  assert.throws(() => enrichNutritionCard(old, { ...fixture, name: 'Different food' }), /different food/);
});

test('registry covers all FDA vitamins/minerals with unambiguous legacy-compatible units', async () => {
  const { NUTRIENTS, NUTRIENT_DEFINITIONS: definitions, nutrientInputId } = await import('../js/nutritionDefaults.mjs');
  assert.equal(Object.keys(NUTRIENTS).length, 37);
  for (const key of ['calcium', 'magnesium', 'iodine', 'copper', 'potassium', 'iron', 'zinc', 'selenium',
    'phosphorus', 'manganese', 'chromium', 'molybdenum', 'chloride', 'vitaminA', 'vitaminC', 'vitaminD',
    'vitaminE', 'vitaminK', 'thiamin', 'riboflavin', 'niacin', 'vitaminB6', 'folate', 'vitaminB12',
    'biotin', 'pantothenicAcid', 'choline']) assert.ok(definitions[key], key);
  assert.equal(definitions.potassium.factor, 47);
  assert.equal(definitions.potassium.goal, 4700);
  assert.equal(definitions.calcium.goal, 1300);
  assert.equal(definitions.magnesium.goal, 420);
  assert.equal(definitions.copper.goal, 0.9);
  assert.equal(definitions.iodine.unit, 'mcg');
  assert.equal(definitions.vitaminD.unit, 'IU');
  assert.equal(definitions.vitaminD.goal, 800);
  assert.equal(definitions.folate.unit, 'mcg DFE');
  assert.equal(definitions.vitaminA.unit, 'mcg RAE');
  assert.equal(definitions.niacin.unit, 'mg NE');
  assert.equal(definitions.sugar.goal, null);
  assert.equal(nutrientInputId('vitaminB12'), 'dietNutrVitaminB12');
});

test('micronutrients preserve small values, known zero, absent values and exact portion scaling', async () => {
  const { validateNutrition, scaleNutrition } = await import('../js/nutritionDefaults.mjs');
  const card = validateNutrition(fixture);
  const scaled = scaleNutrition(card, 25, 'g');
  assert.equal(scaled.calcium, 32.5);
  assert.equal(scaled.iodine, 3.75);
  assert.equal(scaled.copper, 0.0225);
  assert.equal(scaled.vitaminB12, 0.006);
  assert.equal(scaled.potassium, 2.5);
  assert.equal(scaled.selenium, 0);
  assert.ok(!Object.hasOwn(scaled, 'zinc'));
  assert.ok(!Object.hasOwn(scaled, 'chromium'));
  assert.equal(card.nutr.copper, 0.09, 'The base is not overwritten during scaling.');
  assert.throws(() => validateNutrition({ ...fixture, nutr: { iodine: -1 } }), /Invalid iodine/);
});

test('daily totals show nutrient-specific coverage and do not turn unknown into zero', async () => {
  const { summarizeNutrients } = await import('../js/nutritionDefaults.mjs');
  const summary = summarizeNutrients([
    { nutr: { calcium: 130, potassium: 10, iodine: null, selenium: 0, copper: 0.09 } },
    { nutr: { calcium: '65mg', potassium: '2.5%DV', iodine: '15mcg', vitamin_b12: '0.006mcg' } },
    { nutr: { calcium: '', iodine: undefined, copper: '3mcg', selenium: 'unknown' } },
    {},
  ]);
  assert.deepEqual(summary.calcium, { total: 195, knownEntries: 2, totalEntries: 4 });
  assert.deepEqual(summary.potassium, { total: 587.5, knownEntries: 2, totalEntries: 4 });
  assert.deepEqual(summary.iodine, { total: 15, knownEntries: 1, totalEntries: 4 });
  assert.deepEqual(summary.selenium, { total: 0, knownEntries: 1, totalEntries: 4 });
  assert.deepEqual(summary.copper, { total: 0.09, knownEntries: 1, totalEntries: 4 });
  assert.deepEqual(summary.zinc, { total: null, knownEntries: 0, totalEntries: 4 });
  assert.equal(summary.vitaminB12.total, 0.006);
  assert.equal(summarizeNutrients([]).iodine.total, null);
  assert.equal(summarizeNutrients([{ nutr: { vitamin_c: 900, vitaminC: 90 } }]).vitaminC.total, 90, 'Canonical and legacy keys do not double count.');
});

test('recorded units are never guessed or parsed from arbitrary text', async () => {
  const { parseRecordedNutrient } = await import('../js/nutritionDefaults.mjs');
  for (const raw of [null, undefined, '', ' ', NaN, Infinity, -1, 'unknown', '1mg of salt', '2abc', '1e999']) {
    assert.equal(parseRecordedNutrient(raw, 'iodine'), null, String(raw));
  }
  assert.equal(parseRecordedNutrient('150mg', 'iodine'), null);
  assert.equal(parseRecordedNutrient('150mcg', 'iodine'), 150);
  assert.equal(parseRecordedNutrient('0.0006', 'vitaminB12'), 0.0006);
  assert.equal(parseRecordedNutrient('1e-3 mg', 'copper'), 0.001);
  assert.equal(parseRecordedNutrient('20mcg', 'vitaminD'), null);
  assert.equal(parseRecordedNutrient('800IU', 'vitaminD'), 800);
});

test('nutrition period uses selected timezone day boundaries, includes first day and excludes future days', async () => {
  const { foodsInNutritionPeriod } = await import('../js/dietIntake.js');
  const foods = [{ date: '2026-11-05' }, { date: '2026-11-04T23:00:00Z' }, { date: '2026-10-30' },
    { date: '2026-10-29' }, { date: '2026-11-06' }];
  const dayOf = date => date === '2026-11-04T23:00:00Z' ? '2026-11-05' : date.slice(0, 10);
  assert.deepEqual(foodsInNutritionPeriod(foods, '2026-11-05', 1, dayOf), foods.slice(0, 2));
  assert.deepEqual(foodsInNutritionPeriod(foods, '2026-11-05', 7, dayOf), foods.slice(0, 3));
});

test('micronutrients and source quality survive deliberate save and snapshot round trip', async () => {
  const { persistDietIntake } = await import('../js/dietIntake.js');
  const { validateNutrition, scaleNutrition } = await import('../js/nutritionDefaults.mjs');
  const { normalizeFitnessData, validateFitnessSnapshot } = await import('../js/fitnessSchema.js');
  const card = validateNutrition(fixture);
  const data = normalizeFitnessData({ nutritionDefaults: [card] });
  let saved = 0;
  const entry = persistDietIntake({ name: card.name, amount: 25, unit: 'g', nutr: scaleNutrition(card, 25, 'g'),
    time: '08:00', nutritionSource: card }, () => data, () => { saved++; }, new Date('2026-11-05T12:00:00Z'));
  assert.equal(saved, 1);
  assert.equal(entry.nutritionSource.quality, 'source-backed');
  assert.equal(entry.nutritionSource.sources[0].url, fixture.sources[0].url);
  const roundTrip = validateFitnessSnapshot(JSON.parse(JSON.stringify(data)));
  assert.equal(roundTrip.foods[0].nutr.copper, 0.0225);
  assert.equal(roundTrip.foods[0].nutr.vitaminB12, 0.006);
  assert.deepEqual(roundTrip.foods[0].nutritionSource, entry.nutritionSource);
  assert.ok(!Object.hasOwn(roundTrip.foods[0].nutr, 'zinc'));
  assert.throws(() => validateFitnessSnapshot({ ...data, foods: [{ ...entry,
    nutritionSource: { quality: 'source-backed', sources: [{ url: 'javascript:bad' }] } }] }), /HTTPS/);
});
