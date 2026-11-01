const { test } = require('node:test');
const assert = require('node:assert/strict');
const card = { name: 'Synthetic oats', kind: 'whole', preparation: 'raw', brand: '', market: '', barcode: '',
  amount: 100, unit: 'g', serving: '', nutr: { calories: 389, protein: 16.9, potassium: null },
  ingredients: '', note: 'Synthetic fixture, not real nutrition evidence.', quality: 'source-backed',
  sources: [{ url: 'https://example.com/oats', title: 'Synthetic reference' }] };
const response = () => ({ status: 'completed', usage: { input_tokens: 1, output_tokens: 2 },
  output: [{ type: 'web_search_call', status: 'completed', action: { sources: card.sources } },
    { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ found: true, reason: '', card }) }] }] });
test('cited search precedes a tool-free structured card with exact source constraints', async () => {
  const { lookupNutrition } = await import('../services/nutritionModel.mjs');
  const payloads = [], usages = [];
  let reservations = 0;
  const result = await lookupNutrition({ apiKey: 'synthetic-key', model: 'fixture', input: { name: card.name, kind: 'whole', preparation: 'raw' },
    reserveAdditionalCall: () => { reservations++; }, recordUsage: usage => usages.push(usage),
    fetchImpl: async (_url, options) => { payloads.push(JSON.parse(options.body)); return { ok: true, json: async () => response() }; } });
  assert.equal(payloads.length, 2); assert.equal(reservations, 1);
  const [search, extraction] = payloads;
  assert.equal(search.store, false); assert.equal(search.tool_choice, 'required');
  assert.equal(search.tools[0].type, 'web_search'); assert.equal(search.max_tool_calls, 1);
  assert.equal(search.text, undefined);
  assert.equal(extraction.store, false); assert.equal(extraction.tools, undefined);
  assert.equal(extraction.text.format.type, 'json_schema');
  assert.deepEqual(JSON.parse(extraction.input).verifiedSourceUrls, ['https://example.com/oats']);
  assert.ok(!search.input.includes('health'));
  assert.equal(usages.length, 2);
  assert.deepEqual(result.usage, { input_tokens: 2, output_tokens: 4 });
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

test('readable cited search facts can produce a card without structured-search annotations', async () => {
  const { lookupNutrition } = await import('../services/nutritionModel.mjs');
  let calls = 0;
  const result = await lookupNutrition({ apiKey: 'fixture', model: 'fixture',
    input: { name: card.name, kind: 'whole', preparation: 'raw' },
    fetchImpl: async () => {
      const value = response();
      if (++calls === 1) {
        value.output[0].action.sources = [];
        value.output[1].content[0] = { type: 'output_text', text: 'Synthetic oats: 389 kcal and 16.9 g protein per 100 g.',
          annotations: [{ type: 'url_citation', url: card.sources[0].url }] };
      } else value.output = value.output.slice(1);
      return { ok: true, json: async () => value };
    } });
  assert.equal(calls, 2); assert.equal(result.card.amount, 100); assert.equal(result.card.nutr.calories, 389);
});

test('missing evidence, canceled work and exhausted allowance never start extraction', async () => {
  const { lookupNutrition } = await import('../services/nutritionModel.mjs');
  for (const scenario of ['missing', 'canceled', 'budget']) {
    const controller = new AbortController();
    let calls = 0, reserved = 0, reported = 0;
    await assert.rejects(lookupNutrition({ apiKey: 'fixture', model: 'fixture', signal: controller.signal,
      input: { name: card.name, kind: 'whole', preparation: 'raw' },
      reserveAdditionalCall: () => { reserved++; throw Object.assign(new Error('Budget exhausted'), { status: 429 }); },
      recordUsage: () => { reported++; if (scenario === 'canceled') controller.abort(new Error('Canceled')); },
      fetchImpl: async () => {
        calls++; const value = response();
        if (scenario === 'missing') value.output[0].action.sources = [];
        return { ok: true, json: async () => value };
      } }), scenario === 'missing' ? /no verifiable/ : scenario === 'canceled' ? /Canceled/ : /Budget exhausted/);
    assert.equal(calls, 1); assert.equal(reported, 1);
    assert.equal(reserved, scenario === 'budget' ? 1 : 0);
  }
});

test('usage is reported before incomplete, rejected and invalid-card failures without retries', async () => {
  const { lookupNutrition } = await import('../services/nutritionModel.mjs');
  for (const scenario of ['incomplete', 'rejected', 'invalid-card']) {
    let calls = 0; const usages = [];
    await assert.rejects(lookupNutrition({ apiKey: 'fixture', model: 'fixture',
      input: { name: card.name, kind: 'whole', preparation: 'raw' },
      recordUsage: usage => usages.push(usage),
      fetchImpl: async () => {
        calls++; const value = response();
        if (scenario === 'incomplete') value.status = 'incomplete';
        if (scenario === 'invalid-card' && calls === 2) value.output[1].content[0].text = 'not JSON';
        return { ok: scenario !== 'rejected', status: 429, json: async () => value };
      } }));
    assert.equal(calls, scenario === 'invalid-card' ? 2 : 1);
    assert.equal(usages.length, calls);
    assert.ok(usages.every(usage => usage.input_tokens === 1 && usage.output_tokens === 2));
  }
});
