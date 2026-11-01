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
