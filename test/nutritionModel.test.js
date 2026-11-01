const { test } = require('node:test');
const assert = require('node:assert/strict');
const card = { name: 'Synthetic oats', kind: 'whole', preparation: 'raw', brand: '', market: '', barcode: '',
  amount: 100, unit: 'g', serving: '', nutr: { calories: 389, protein: 16.9, potassium: null },
  ingredients: '', note: 'Synthetic fixture, not real nutrition evidence.', quality: 'source-backed',
  sources: [{ url: 'https://example.com/oats', title: 'Synthetic reference' }] };
const response = () => ({ status: 'completed', usage: { input_tokens: 1, output_tokens: 2 },
  output: [{ type: 'web_search_call', status: 'completed', action: { sources: card.sources } },
    { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ found: true, reason: '', card }) }] }] });
test('search-backed model request is structured, minimal and validates traceable sources', async () => {
  const { lookupNutrition } = await import('../services/nutritionModel.mjs');
  let payload;
  const result = await lookupNutrition({ apiKey: 'synthetic-key', model: 'fixture', input: { name: card.name, kind: 'whole', preparation: 'raw' },
    fetchImpl: async (_url, options) => { payload = JSON.parse(options.body); return { ok: true, json: async () => response() }; } });
  assert.equal(payload.store, false); assert.equal(payload.tool_choice, 'required');
  assert.equal(payload.tools[0].type, 'web_search');
  assert.ok(!payload.input.includes('health'));
  assert.equal(result.card.nutr.calories, 389);
  assert.ok(!Object.hasOwn(result.card.nutr, 'potassium'));
});
test('unsupported sources, no search, incomplete JSON and changed identity withhold cards', async () => {
  const { lookupNutrition } = await import('../services/nutritionModel.mjs');
  for (const mutate of [
    value => { value.output = value.output.slice(1); },
    value => { value.status = 'incomplete'; },
    value => { value.output[0].action.sources = []; },
    value => { const answer = JSON.parse(value.output[1].content[0].text); answer.card.name = 'Other food'; value.output[1].content[0].text = JSON.stringify(answer); },
  ]) {
    const value = response(); mutate(value);
    await assert.rejects(() => lookupNutrition({ apiKey: 'fixture', model: 'fixture',
      input: { name: card.name, kind: 'whole', preparation: 'raw' },
      fetchImpl: async () => ({ ok: true, json: async () => value }) }));
  }
});

for (const citationsOnly of [false, true]) {
  test(`source URL normalization matches card validation (${citationsOnly ? 'citations' : 'search sources'})`, async () => {
    const { lookupNutrition } = await import('../services/nutritionModel.mjs');
    const value = response();
    const source = { url: 'HTTPS://EXAMPLE.COM:443', title: 'Synthetic reference' };
    const answer = JSON.parse(value.output[1].content[0].text);
    answer.card.sources = [source];
    value.output[1].content[0].text = JSON.stringify(answer);
    value.output[0].action.sources = citationsOnly ? [] : [source];
    if (citationsOnly) value.output[1].content[0].annotations = [{ type: 'url_citation', ...source }];
    const result = await lookupNutrition({ apiKey: 'fixture', model: 'fixture',
      input: { name: card.name, kind: 'whole', preparation: 'raw' },
      fetchImpl: async () => ({ ok: true, json: async () => value }) });
    assert.equal(result.card.sources[0].url, 'https://example.com/');
  });
}

test('normalization never discards document paths, product queries or fragment-based food identities', async () => {
  const { lookupNutrition } = await import('../services/nutritionModel.mjs');
  for (const url of ['https://other.example/oats?product=1#food-1', 'https://example.com/rice?product=1#food-1',
    'https://example.com/oats?product=2#food-1', 'https://example.com/oats?product=1#food-2',
    'https://example.com/oats/?product=1#food-1', 'https://example.com/oats?product=1&utm_source=chatgpt.com#food-1']) {
    const value = response();
    value.output[0].action.sources = [{ url: 'https://example.com/oats?product=1#food-1' }];
    const answer = JSON.parse(value.output[1].content[0].text);
    answer.card.sources = [{ url, title: 'Unsupported synthetic reference' }];
    value.output[1].content[0].text = JSON.stringify(answer);
    await assert.rejects(lookupNutrition({ apiKey: 'fixture', model: 'fixture',
      input: { name: card.name, kind: 'whole', preparation: 'raw' },
      fetchImpl: async () => ({ ok: true, json: async () => value }) }), /source URLs were not supported/);
  }
});

test('missing and malformed search evidence fail explicitly without an unchecked card', async () => {
  const { lookupNutrition } = await import('../services/nutritionModel.mjs');
  for (const [sources, message] of [[[], /no verifiable source URLs/], [[{ url: 'not-a-url' }], /invalid source URL/]]) {
    const value = response();
    value.output[0].action.sources = sources;
    await assert.rejects(lookupNutrition({ apiKey: 'fixture', model: 'fixture',
      input: { name: card.name, kind: 'whole', preparation: 'raw' },
      fetchImpl: async () => ({ ok: true, json: async () => value }) }), message);
  }
});
