const { test } = require('node:test');
const assert = require('node:assert/strict');
const card = { name: 'Synthetic oats', kind: 'whole', preparation: 'raw', brand: '', market: '', barcode: '',
  amount: 100, unit: 'g', serving: '', nutr: { calories: 389, protein: 16.9, potassium: null },
  ingredients: '', note: 'Synthetic fixture, not real nutrition evidence.', quality: 'estimate', measures: [],
  sources: [] };
const response = (value = card, extra = {}) => ({ status: 'completed', usage: { input_tokens: 1, output_tokens: 2 },
  output: [...(extra.sources ? [{ type: 'web_search_call', status: 'completed', action: { sources: extra.sources } }] : []),
    { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ found: true, assumption: extra.assumption ?? 'Raw rolled oats.', card: value }),
      annotations: extra.annotations || [] }] }] });
const run = async (options, value) => {
  const { lookupNutrition } = await import('../services/nutritionModel.mjs');
  const payloads = [], usages = [];
  const result = await lookupNutrition({ apiKey: 'synthetic-key', model: 'fixture', recordUsage: usage => usages.push(usage),
    input: { name: card.name, kind: 'whole', preparation: 'raw' }, ...options,
    fetchImpl: async (_url, request) => { payloads.push(JSON.parse(request.body)); return { ok: true, json: async () => value }; } });
  return { result, payloads, usages };
};

test('food names can search even when entered without packaged metadata and retain estimate labeling', async () => {
  const { result, payloads, usages } = await run({}, response({ ...card, name: 'Renamed by model', sources: [{ url: 'https://invented.example/', title: 'x' }] }));
  assert.equal(payloads.length, 1); assert.equal(usages.length, 1);
  const [payload] = payloads;
  assert.equal(payload.store, false); assert.deepEqual(payload.tools, [{ type: 'web_search' }]);
  assert.equal(payload.text.format.type, 'json_schema');
  assert.ok(payload.text.format.schema.properties.card.required.includes('measures'));
  assert.match(payload.instructions, /3-4 most\s+plausible interpretations/);
  assert.match(payload.instructions, /Do not ask\s+for clarification/);
  assert.ok(!payload.input.includes('health'));
  assert.match(payload.instructions, /brand\/product appears in the food name/);
  assert.match(payload.instructions, /label\s+facts take precedence/);
  assert.equal(result.found, true); assert.equal(result.card.name, card.name, 'supplied identity is kept');
  assert.equal(result.card.quality, 'estimate');
  assert.deepEqual(result.card.sources, [], 'unsearched URLs are never shown as sources');
  assert.match(result.card.note, /^Genie estimate\. Raw rolled oats\./);
  assert.equal(result.reason, 'Raw rolled oats.');
  assert.ok(!Object.hasOwn(result.card.nutr, 'potassium'));
});

test('provider schema requests all supported micronutrients and preserves unknown iodine and small amounts', async () => {
  const { NUTRIENTS } = await import('../js/nutritionDefaults.mjs');
  const { result, payloads } = await run({}, response({ ...card,
    nutr: { calories: 100, copper: 0.009, magnesium: 40, vitaminB12: 0.006, iodine: null, selenium: 0 } }));
  const schema = payloads[0].text.format.schema.properties.card.properties.nutr;
  assert.deepEqual(schema.required, Object.keys(NUTRIENTS));
  assert.deepEqual(Object.keys(schema.properties), Object.keys(NUTRIENTS));
  assert.equal(result.card.nutr.copper, 0.009);
  assert.equal(result.card.nutr.vitaminB12, 0.006);
  assert.equal(result.card.nutr.selenium, 0);
  assert.ok(!Object.hasOwn(result.card.nutr, 'iodine'));
  assert.match(payloads[0].instructions, /UNKNOWN, not zero/);
  assert.match(payloads[0].instructions, /Vitamin D stays in IU/);
});

test('homemade foods get estimated household portions that scale', async () => {
  const { scaleNutrition } = await import('../js/nutritionDefaults.mjs');
  const yogurt = { ...card, name: 'Homemade yogurt (whole milk, inulin, L. reuteri)', preparation: '', serving: '',
    nutr: { calories: 66, protein: 3.6, fat: 3.4, carbs: 6.2, fiber: 1 },
    measures: [{ unit: 'tbsp', amount: 1, baseAmount: 15, sourceUrl: '' }, { unit: 'oz', amount: 1, baseAmount: 28, sourceUrl: '' },
      { unit: 'cup', amount: 0, baseAmount: 240, sourceUrl: '' }, { unit: 'bowl', amount: 1, baseAmount: 200, sourceUrl: '' }] };
  const { result, payloads } = await run({ input: { name: yogurt.name, kind: 'whole' }, portionUnit: 'tbsp' },
    response(yogurt, { assumption: 'Whole-milk yogurt with a little inulin; cultures add negligible nutrition.' }));
  assert.equal(JSON.parse(payloads[0].input).requestedPortionUnit, 'tbsp');
  assert.deepEqual(result.card.measures.map(measure => measure.unit), ['tbsp'], 'same-dimension and invalid measures are dropped');
  assert.equal(result.card.serving, '100 g');
  assert.ok(Math.abs(scaleNutrition(result.card, 2, 'tbsp').calories - 19.8) < 1e-10);
});

test('packaged products search the web and stay source-backed only with verified sources and portions', async () => {
  const sources = [{ url: 'https://example.com/oats?product=1#food-1', title: 'Label' }];
  const input = { name: 'Synthetic oats', kind: 'packaged', brand: 'Acme', market: 'US' };
  const backed = { ...card, ...input, quality: 'source-backed', sources,
    measures: [{ unit: 'cup', amount: 1, baseAmount: 80, sourceUrl: sources[0].url }] };
  const ok = await run({ input }, response(backed, { sources }));
  assert.equal(ok.payloads[0].tools[0].type, 'web_search'); assert.equal(ok.payloads[0].tool_choice, 'auto');
  assert.equal(ok.result.card.quality, 'source-backed'); assert.equal(ok.result.card.measures[0].sourceUrl, sources[0].url);
  for (const [value, extra] of [
    [{ ...backed, sources: [{ url: 'https://example.com/oats?product=2#food-1', title: 'Unsearched' }] }, { sources }],
    [{ ...backed, measures: [{ ...backed.measures[0], sourceUrl: '' }] }, { sources }],
    [backed, { sources: [] }],
  ]) {
    const { result } = await run({ input }, response(value, extra));
    assert.equal(result.card.quality, 'estimate'); assert.match(result.card.note, /^Genie estimate/);
    assert.ok(result.card.sources.every(source => source.url === sources[0].url));
    assert.equal(result.card.measures[0].baseAmount, 80, 'the estimate still fills the portion');
  }
});

test('citation URLs are normalized like card validation', async () => {
  const input = { name: 'Synthetic oats', kind: 'packaged', brand: 'Acme', market: 'US' };
  const source = { url: 'HTTPS://EXAMPLE.COM:443', title: 'Synthetic reference' };
  const { result } = await run({ input }, response({ ...card, ...input, quality: 'source-backed', sources: [source] },
    { sources: [], annotations: [{ type: 'url_citation', ...source }] }));
  assert.equal(result.card.sources[0].url, 'https://example.com/'); assert.equal(result.card.quality, 'source-backed');
});

test('non-food input returns found=false with the reason', async () => {
  const value = response(card); value.output[0].content[0].text = JSON.stringify({ found: false, assumption: 'A stapler is not food.', card });
  const { result } = await run({ input: { name: 'stapler', kind: 'whole' } }, value);
  assert.deepEqual([result.found, result.reason], [false, 'A stapler is not food.']);
});

test('nutrition keys normalize spacing and case', async () => {
  const { nutritionKey, validateLookup } = await import('../services/nutritionModel.mjs');
  const pasta = validateLookup({ name: 'Pasta', kind: 'whole' });
  assert.notEqual(nutritionKey({ ...pasta, preparation: 'dry' }), nutritionKey({ ...pasta, preparation: 'cooked' }));
  assert.equal(nutritionKey({ ...pasta, name: ' PASTA ' }), nutritionKey(pasta));
});

test('usage is reported once before incomplete, rejected, refused and unreadable failures without retries', async () => {
  const { lookupNutrition } = await import('../services/nutritionModel.mjs');
  for (const scenario of ['incomplete', 'rejected', 'refusal', 'not-json', 'canceled']) {
    let calls = 0; const usages = []; const controller = new AbortController();
    await assert.rejects(lookupNutrition({ apiKey: 'fixture', model: 'fixture', signal: controller.signal,
      input: { name: card.name, kind: 'whole', preparation: 'raw' },
      recordUsage: usage => { usages.push(usage); if (scenario === 'canceled') controller.abort(new Error('Canceled')); },
      fetchImpl: async () => {
        calls++; const value = response();
        if (scenario === 'incomplete') value.status = 'incomplete';
        if (scenario === 'refusal') value.output[0].content = [{ type: 'refusal', refusal: 'no' }];
        if (scenario === 'not-json') value.output[0].content[0].text = 'not JSON';
        return { ok: scenario !== 'rejected', status: 429, json: async () => value };
      } }), scenario === 'canceled' ? /Canceled/ : undefined);
    assert.equal(calls, 1); assert.equal(usages.length, 1);
  }
});
