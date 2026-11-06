const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Wallet } = require('ethers');
const origin = 'https://nutrition.example';
async function setup(options = {}) {
  const { createNutritionServer } = await import('../services/nutritionService.mjs');
  const wallet = Wallet.createRandom();
  const settings = { origins: new Set([origin]), wallets: new Set([wallet.address.toLowerCase()]),
    enabled: true, apiKey: 'synthetic-server-only', model: 'synthetic', maxCalls: 2, stateFile: ':memory:', ...options.settings };
  const seen = [];
  let clock = Date.now();
  const service = createNutritionServer(settings, { logger: { warn() {} }, now: () => clock,
    modelCall: async value => { seen.push(value); return { found: false, reason: 'Synthetic missing match',
      usage: { input_tokens: 20, output_tokens: 10 } }; }, ...options.dependencies });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const request = async (route, body, token, source = origin) => {
    const response = await fetch(base + route, { method: body === null ? 'DELETE' : 'POST',
      headers: { Origin: source, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === null ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  async function signin() {
    const challenge = (await request('/challenge', { address: wallet.address, chainId: 8453 })).body;
    const signature = await wallet.signMessage(challenge.message);
    const result = await request('/session', { ...challenge, signature });
    assert.equal(result.status, 200);
    return { ...result.body, challenge, signature };
  }
  return { wallet, settings, seen, request, signin, advance: ms => { clock += ms; },
    close: async () => { await new Promise(resolve => service.server.close(resolve)); service.close(); } };
}
const input = { name: 'Synthetic banana', kind: 'whole' };
test('health, Yoga and Community requests share nutrition invitation checks and one durable call cap', async () => {
  const seen = [];
  const fixture = await setup({ settings: { maxCalls: 4 }, dependencies: {
    genieCall: async value => { seen.push(value.input); return { answer: 'Synthetic scoped reply', usage: { input_tokens: 2, output_tokens: 3 } }; },
  } });
  try {
    const session = await fixture.signin();
    const body = { assistant: 'health', messages: [{ role: 'user', content: 'Synthetic question' }], consent: true };
    assert.equal((await fixture.request('/assistant', body)).status, 401);
    assert.equal((await fixture.request('/assistant', { ...body, consent: false }, session.token)).status, 400);
    assert.equal((await fixture.request('/assistant', { ...body, secret: 'unexpected' }, session.token)).status, 400);
    for (const assistant of ['health', 'yoga', 'community']) {
      const result = await fixture.request('/assistant', { ...body, assistant }, session.token);
      assert.equal(result.status, 200); assert.equal(result.body.answer, 'Synthetic scoped reply');
    }
    assert.deepEqual(seen.map(value => value.assistant), ['health', 'yoga', 'community']);
    assert.equal((await fixture.request('/lookup', { input, consent: true }, session.token)).status, 200);
    assert.equal((await fixture.request('/assistant', body, session.token)).status, 429);
  } finally { await fixture.close(); }
});
test('wallet-bound one-use auth, food-only payloads and separate durable accounting', async () => {
  const fixture = await setup();
  try {
    const session = await fixture.signin();
    assert.equal((await fixture.request('/session', { ...session.challenge, signature: session.signature })).status, 401);
    assert.equal((await fixture.request('/lookup', { input, consent: true }, session.token, 'https://wrong.example')).status, 403);
    assert.equal((await fixture.request('/lookup', { input: { ...input, healthLogs: [] }, consent: true }, session.token)).status, 400);
    assert.equal((await fixture.request('/lookup', { input, consent: false }, session.token)).status, 400);
    const result = await fixture.request('/lookup', { input, consent: true }, session.token);
    assert.equal(result.status, 200); assert.equal(result.body.found, false);
    assert.deepEqual(result.body.usage, { calls: 1, inputTokens: 20, outputTokens: 10 });
    assert.equal(fixture.seen.length, 1);
    assert.deepEqual(Object.keys(fixture.seen[0].input).sort(), ['barcode','brand','kind','label','market','name','preparation','url'].sort());
    assert.ok(!JSON.stringify(result.body).includes('synthetic-server-only'));
    assert.equal((await fixture.request('/lookup', { input, consent: true }, session.token)).status, 200);
    assert.equal((await fixture.request('/lookup', { input, consent: true }, session.token)).status, 429);
    assert.equal((await fixture.request('/session', null, session.token)).status, 200);
    assert.equal((await fixture.request('/lookup', { input, consent: true }, session.token)).status, 401);
  } finally { await fixture.close(); }
});
test('uninvited wallets, invalid signatures, changed message and expired challenges reject', async () => {
  const f = await setup();
  try {
    const stranger = Wallet.createRandom();
    assert.equal((await f.request('/challenge', { address: stranger.address, chainId: 8453 })).status, 403);
    const challenge = (await f.request('/challenge', { address: f.wallet.address, chainId: 8453 })).body;
    assert.equal((await f.request('/session', { ...challenge, signature: await stranger.signMessage(challenge.message) })).status, 401);
    const other = (await f.request('/challenge', { address: f.wallet.address, chainId: 8453 })).body;
    f.advance(300001);
    assert.equal((await f.request('/session', { ...other, signature: await f.wallet.signMessage(other.message) })).status, 401);
    const session = await f.signin(); f.advance(900001);
    assert.equal((await f.request('/lookup', { input, consent: true }, session.token)).status, 401);
  } finally { await f.close(); }
});
test('provider failure consumes a call but never returns a successful card', async () => {
  const f = await setup({ dependencies: { modelCall: async () => { throw new Error('synthetic provider failure'); } } });
  try {
    const session = await f.signin();
    const result = await f.request('/lookup', { input, consent: true }, session.token);
    assert.equal(result.status, 503); assert.match(result.body.error, /No card/);
    assert.ok(!result.body.card);
    assert.deepEqual(result.body.usage, { calls: 1, inputTokens: 0, outputTokens: 0 });
  } finally { await f.close(); }
});
test('each lookup reserves exactly one durable call and records tokens once', async () => {
  const f = await setup({ dependencies: { modelCall: async ({ recordUsage, ...rest }) => {
    assert.ok(!('reserveAdditionalCall' in rest));
    recordUsage({ input_tokens: 20, output_tokens: 10 });
    return { found: false, reason: 'Not a food', usage: { input_tokens: 20, output_tokens: 10 } };
  } } });
  try {
    const session = await f.signin();
    const result = await f.request('/lookup', { input, consent: true }, session.token);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.usage, { calls: 1, inputTokens: 20, outputTokens: 10 });
  } finally { await f.close(); }
});
test('failed provider work returns usage and persists it across restart', async () => {
  const { mkdtemp, rm } = require('node:fs/promises');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'bignuten-stages-test-'));
  const stateFile = join(directory, 'usage.sqlite');
  let f;
  try {
    f = await setup({ settings: { stateFile }, dependencies: { modelCall: async ({ recordUsage }) => {
      recordUsage({ input_tokens: 25, output_tokens: 13 });
      throw Object.assign(new Error('Synthetic invalid card'), { status: 502 });
    } } });
    const session = await f.signin();
    const result = await f.request('/lookup', { input, consent: true }, session.token);
    assert.equal(result.status, 502); assert.ok(!result.body.card);
    assert.deepEqual(result.body.usage, { calls: 1, inputTokens: 25, outputTokens: 13 });
    const wallet = f.wallet;
    await f.close(); f = null;
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(stateFile);
    try {
      assert.deepEqual({ ...db.prepare('SELECT * FROM budget').get() }, { id: 1, calls: 1 });
      assert.deepEqual({ ...db.prepare('SELECT * FROM usage WHERE wallet=?').get(wallet.address.toLowerCase()) },
        { wallet: wallet.address.toLowerCase(), calls: 1, input_tokens: 25, output_tokens: 13 });
    } finally { db.close(); }
  } finally { if (f) await f.close(); await rm(directory, { recursive: true }); }
});
test('nutrition settings reject invalid allowlists and service stays disabled without credentials', async () => {
  const { nutritionSettings } = await import('../services/nutritionService.mjs');
  assert.throws(() => nutritionSettings({}), /Configure/);
  const f = await setup({ settings: { apiKey: '' } });
  try { assert.equal((await f.request('/challenge', { address: f.wallet.address, chainId: 8453 })).status, 503); }
  finally { await f.close(); }
});
test('durable budget survives service restart and separate sessions share the same cap', async () => {
  const { mkdtemp, rm } = require('node:fs/promises');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'bignuten-nutrition-test-'));
  const stateFile = join(directory, 'usage.sqlite');
  let f;
  try {
    f = await setup({ settings: { stateFile, maxCalls: 1 } });
    const session = await f.signin();
    assert.equal((await f.request('/lookup', { input, consent: true }, session.token)).status, 200);
    await f.close(); f = null;
    f = await setup({ settings: { stateFile, maxCalls: 1 } });
    const next = await f.signin();
    assert.equal((await f.request('/lookup', { input, consent: true }, next.token)).status, 429);
  } finally { if (f) await f.close(); await rm(directory, { recursive: true }); }
});
test('concurrent same-session requests cannot reserve a second provider call', async () => {
  let release, started;
  const waiting = new Promise(resolve => { started = resolve; });
  const f = await setup({ dependencies: { modelCall: async () => {
    started();
    return new Promise(resolve => { release = () => resolve({ found: false, reason: 'Synthetic', usage: null }); });
  } } });
  try {
    const session = await f.signin();
    const first = f.request('/lookup', { input, consent: true }, session.token);
    await waiting;
    assert.equal((await f.request('/lookup', { input, consent: true }, session.token)).status, 429);
    release(); assert.equal((await first).status, 200);
  } finally { release?.(); await f.close(); }
});

const publicCard = {
  name: 'Pasta', kind: 'whole', preparation: 'Cooked, plain, without added salt', brand: '', market: '', barcode: '',
  amount: 100, unit: 'g', serving: '100 g cooked pasta', ingredients: '', note: 'Synthetic public food facts',
  nutr: { calories: 158, protein: 5.8 }, quality: 'source-backed',
  retrievedAt: '2026-11-02T00:00:00Z', sources: [{ url: 'https://example.com/pasta', title: 'Synthetic source' }],
};
test('legacy shared cards get one durable micronutrient attempt on use, preserving values across restart', async () => {
  const { mkdtemp, rm } = require('node:fs/promises');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const { DatabaseSync } = await import('node:sqlite');
  const { nutritionKey } = await import('../services/nutritionModel.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'bignuten-micros-'));
  const food = { name: publicCard.name, kind: publicCard.kind, preparation: publicCard.preparation };
  for (const outcome of ['success', 'unknown', 'failure', 'incompatible', 'not-found']) {
    let f;
    try {
      const settings = { stateFile: join(directory, `${outcome}.sqlite`), maxCalls: 1 };
      let calls = 0;
      const dependencies = { modelCall: async () => {
        calls++;
        if (outcome === 'failure') throw new Error('Synthetic failure');
        if (outcome === 'not-found') return { found: false, reason: 'No matching composition data' };
        return { found: true, card: { ...publicCard, amount: 200, unit: outcome === 'incompatible' ? 'ml' : 'g',
          nutr: { calories: 900, protein: 99, iodine: outcome === 'unknown' ? null : 30, copper: 0.18 } } };
      } };
      f = await setup({ settings, dependencies });
      const db = new DatabaseSync(settings.stateFile);
      db.prepare('INSERT INTO foods VALUES(?,?)').run(nutritionKey(food), JSON.stringify(publicCard)); db.close();
      assert.equal((await f.request('/foods', { input: food })).body.enrichmentNeeded, true);
      const session = await f.signin();
      const result = await f.request('/lookup', { input: food, consent: true }, session.token);
      assert.equal(result.status, ['failure', 'incompatible'].includes(outcome) ? 503 : 200);
      assert.equal(calls, 1);
      await f.close(); f = null;
      f = await setup({ settings, dependencies });
      const shared = (await f.request('/foods', { input: food })).body;
      assert.equal(shared.enrichmentNeeded, false);
      assert.equal(shared.card.nutr.calories, 158);
      assert.equal(shared.card.nutr.protein, 5.8);
      if (['success', 'unknown'].includes(outcome)) {
        assert.equal(shared.card.nutr.copper, 0.09);
        assert.equal(shared.card.nutr.iodine, outcome === 'unknown' ? undefined : 15);
        assert.equal(shared.card.nutritionCoverageVersion, 1);
      } else {
        assert.equal(shared.enrichmentUnavailable, true);
        assert.ok(!Object.hasOwn(shared.card.nutr, 'copper'));
      }
      const next = await f.signin();
      const repeat = await f.request('/lookup', { input: food, consent: true }, next.token);
      assert.equal(repeat.status, 200);
      assert.equal(repeat.body.cached, true);
      assert.equal(calls, 1, 'Unknowns and failures never trigger another paid micronutrient check, even after restart.');
    } finally { if (f) await f.close(); }
  }
  await rm(directory, { recursive: true, force: true });
});
test('address-only pilot is explicit, nonce/origin bound, rechecks invitations and needs no signature', async () => {
  const f = await setup({ settings: { accessMode: 'address-only' } });
  try {
    const challenge = (await f.request('/challenge', { address: f.wallet.address, chainId: 8453 })).body;
    assert.equal(challenge.accessMode, 'address-only');
    assert.equal((await f.request('/session', challenge, undefined, 'https://wrong.example')).status, 403);
    const session = await f.request('/session', challenge);
    assert.equal(session.status, 200);
    assert.equal((await f.request('/session', challenge)).status, 401);
    f.settings.wallets.clear();
    assert.equal((await f.request('/lookup', { input, consent: true }, session.body.token)).status, 403);
  } finally { await f.close(); }
});
test('default signed mode rejects unsigned session attempts and invalid configuration fails explicitly', async () => {
  const f = await setup();
  try {
    const challenge = (await f.request('/challenge', { address: f.wallet.address, chainId: 8453 })).body;
    assert.equal(challenge.accessMode, 'signed');
    assert.equal((await f.request('/session', challenge)).status, 401);
  } finally { await f.close(); }
});
test('food facts are shared without provider calls after cap exhaustion, without storing edits or wallet attribution', async () => {
  const f = await setup({ settings: { maxCalls: 1 }, dependencies: { modelCall: async () => ({
    found: true, card: structuredClone(publicCard), reason: 'Synthetic', usage: { input_tokens: 10, output_tokens: 5 },
  }) } });
  try {
    const session = await f.signin();
    const food = { name: publicCard.name, kind: publicCard.kind, preparation: publicCard.preparation };
    const first = await f.request('/lookup', { input: food, consent: true }, session.token);
    assert.equal(first.status, 200); assert.equal(first.body.cached, false);
    const next = await f.request('/lookup', { input: food, consent: true }, session.token);
    assert.equal(next.status, 200); assert.equal(next.body.cached, true);
    assert.deepEqual(next.body.usage, first.body.usage);
    const shared = await f.request('/foods', { input: food });
    assert.equal(shared.status, 200); assert.equal(shared.body.cached, true);
    assert.equal(shared.body.card.nutr.calories, 158);
    assert.ok(!JSON.stringify(shared.body).includes(f.wallet.address.toLowerCase()));
    assert.ok(!shared.body.usage);
    const dry = await f.request('/foods', { input: { ...food, preparation: 'Dry, uncooked' } });
    assert.equal(dry.body.found, false);
    assert.equal((await f.request('/foods', { input: food, card: publicCard })).status, 400);
    assert.equal((await f.request('/foods', { input: { ...food, healthLogs: [] } })).status, 400);
    assert.equal((await f.request('/foods', { input: food }, undefined, 'https://wrong.example')).status, 403);
  } finally { await f.close(); }
});
test('plain staple names go straight to Genie without a clarification step and shared facts survive restart', async () => {
  const { mkdtemp, rm } = require('node:fs/promises');
  const { tmpdir } = require('node:os'); const { join } = require('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'bignuten-foods-test-'));
  let f;
  try {
    const settings = { stateFile: join(directory, 'foods.sqlite') };
    const food = { name: 'Pasta', kind: 'whole' };
    f = await setup({ settings, dependencies: { modelCall: async () => ({ found: true,
      card: { ...structuredClone(publicCard), preparation: '', quality: 'estimate', sources: [] } }) } });
    const session = await f.signin();
    const filled = await f.request('/lookup', { input: food, consent: true }, session.token);
    assert.equal(filled.status, 200); assert.equal(filled.body.usage.calls, 1);
    assert.ok(!filled.body.clarification); assert.equal(filled.body.card.quality, 'estimate');
    await f.close(); f = null;
    f = await setup({ settings });
    const result = await f.request('/foods', { input: food });
    assert.equal(result.body.card.nutr.calories, 158); assert.equal(result.body.card.quality, 'estimate');
    assert.ok(!result.body.clarification);
    assert.equal(f.seen.length, 0);
  } finally { if (f) await f.close(); await rm(directory, { recursive: true }); }
});
test('missing household portions can enrich legacy shared cards once, then reuse after the cap without provider work', async () => {
  let calls = 0;
  const f = await setup({ dependencies: { modelCall: async ({ portionUnit }) => {
    calls++;
    return { found: true, card: { ...publicCard, measures: portionUnit
      ? [{ amount: 1, unit: 'cup', baseAmount: 140, sourceUrl: publicCard.sources[0].url }] : [] } };
  } } });
  try {
    const session = await f.signin();
    const payload = { input: { name: publicCard.name, kind: publicCard.kind, preparation: publicCard.preparation }, consent: true };
    assert.equal((await f.request('/lookup', payload, session.token)).body.card.measures.length, 0);
    const enriched = await f.request('/lookup', { ...payload, portionUnit: 'cup' }, session.token);
    assert.equal(enriched.status, 200); assert.equal(enriched.body.cached, false);
    assert.equal(enriched.body.card.measures[0].baseAmount, 140);
    assert.equal((await f.request('/lookup', { ...payload, portionUnit: 'tbsp' }, session.token)).body.cached, true);
    assert.equal((await f.request('/foods', { input: payload.input })).body.card.measures[0].baseAmount, 140);
    assert.equal(calls, 2);
    assert.equal((await f.request('/lookup', { ...payload, portionUnit: 'made-up' }, session.token)).status, 400);
    assert.equal((await f.request('/lookup', { ...payload, amountEaten: 2 }, session.token)).status, 400);
  } finally { await f.close(); }
});
test('a failed or unverified portion enrichment cannot erase a shared source-backed reference', async () => {
  for (const result of [{ found: false, reason: 'No source portion' },
    { found: true, card: { ...publicCard, quality: 'user-entered', measures: [{ amount: 1, unit: 'cup', baseAmount: 140 }] } },
    { found: true, card: { ...publicCard, quality: 'estimate', measures: [{ amount: 1, unit: 'cup', baseAmount: 140 }] } }]) {
    let calls = 0;
    const f = await setup({ dependencies: { modelCall: async () => ++calls === 1
      ? { found: true, card: structuredClone(publicCard) } : result } });
    try {
      const session = await f.signin();
      const payload = { input: { name: publicCard.name, kind: publicCard.kind, preparation: publicCard.preparation }, consent: true };
      await f.request('/lookup', payload, session.token);
      assert.equal((await f.request('/lookup', { ...payload, portionUnit: 'cup' }, session.token)).status, 200);
      const shared = (await f.request('/foods', { input: payload.input })).body.card;
      assert.equal(shared.quality, 'source-backed'); assert.deepEqual(shared.measures, []);
      assert.equal(shared.nutr.calories, 158);
    } finally { await f.close(); }
  }
});
test('labeled Genie estimates are shared but user-entered cards are never published', async () => {
  for (const quality of ['estimate', 'user-entered']) {
    const f = await setup({ dependencies: { modelCall: async () => ({ found: true, card: { ...publicCard, quality } }) } });
    try {
      const session = await f.signin();
      const food = { name: 'Pasta', kind: 'whole', preparation: publicCard.preparation };
      assert.equal((await f.request('/lookup', { input: food, consent: true }, session.token)).status, 200);
      const shared = (await f.request('/foods', { input: food })).body;
      assert.equal(shared.found, quality === 'estimate');
      if (shared.found) assert.equal(shared.card.quality, 'estimate');
    } finally { await f.close(); }
  }
});
test('identical concurrent library misses never duplicate paid provider work', async () => {
  let release, started;
  const waiting = new Promise(resolve => { started = resolve; });
  let calls = 0;
  const f = await setup({ dependencies: { modelCall: async () => {
    calls++; started();
    return new Promise(resolve => { release = () => resolve({ found: true, card: structuredClone(publicCard) }); });
  } } });
  try {
    const first = await f.signin(), second = await f.signin();
    const payload = { input: { name: 'Pasta', kind: 'whole', preparation: publicCard.preparation }, consent: true };
    const pending = f.request('/lookup', payload, first.token);
    await waiting;
    const busy = await f.request('/lookup', payload, second.token);
    assert.equal(busy.status, 429); assert.match(busy.body.error, /already being fetched/);
    release(); assert.equal((await pending).status, 200);
    const cached = await f.request('/lookup', payload, second.token);
    assert.equal(cached.body.cached, true); assert.equal(calls, 1);
    assert.equal(cached.body.usage.calls, 1);
    f.settings.apiKey = '';
    assert.equal((await f.request('/foods', { input: payload.input })).body.card.nutr.calories, 158);
  } finally { release?.(); await f.close(); }
});

test('captions and protocol drafts use the same invitation, wallet rate limit and shared lifetime call cap', async () => {
  const captionInputs = [], protocolInputs = [];
  const f = await setup({ settings: { maxCalls: 3 }, dependencies: {
    oembedCall: async input => { captionInputs.push({ ...input, type: 'oembed' }); return { title: 'Synthetic video title', thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg' }; },
    captionCall: async input => { captionInputs.push(input); return { transcript: 'Synthetic caption text', source: 'youtube-captions' }; },
    researchCall: async input => {
      protocolInputs.push(input.input);
      input.recordUsage({ input_tokens: 8, output_tokens: 6 });
      return { protocol: { title: 'Synthetic protocol' }, usage: { input_tokens: 8, output_tokens: 6 } };
    },
  } });
  try {
    const session = await f.signin();
    const caption = { videoId: 'abcdefghijk', consent: true };
    assert.equal((await f.request('/research/oembed', caption)).status, 401);
    assert.equal((await f.request('/research/oembed', { ...caption, title: 'unexpected' }, session.token)).status, 400);
    const metadata = await f.request('/research/oembed', caption, session.token);
    assert.equal(metadata.status, 200);
    assert.equal(metadata.body.title, 'Synthetic video title');
    assert.equal('apiKey' in captionInputs[0], false, 'oEmbed lookup does not receive a model key');
    assert.equal((await f.request('/research/captions', { ...caption, transcript: 'unexpected' }, session.token)).status, 400);
    const captions = await f.request('/research/captions', caption, session.token);
    assert.equal(captions.status, 200);
    assert.equal(captions.body.transcript, 'Synthetic caption text');
    assert.deepEqual(captionInputs.map(({ videoId }) => videoId), ['abcdefghijk', 'abcdefghijk']);
    assert.equal('apiKey' in captionInputs[0], false, 'Caption fetch never receives a model key');
    const protocolInput = { title: 'Synthetic source', transcript: 'Synthetic private transcript', metrics: [{ id: 'sleep', label: 'Sleep duration' }], consent: true };
    assert.equal((await f.request('/research/protocol', { ...protocolInput, consent: false }, session.token)).status, 400);
    const draft = await f.request('/research/protocol', protocolInput, session.token);
    assert.equal(draft.status, 200);
    assert.deepEqual(protocolInputs, [{ title: 'Synthetic source', transcript: 'Synthetic private transcript', metrics: protocolInput.metrics }]);
    assert.deepEqual(draft.body.usage, { calls: 3, inputTokens: 8, outputTokens: 6 });
    assert.equal((await f.request('/research/captions', caption, session.token)).status, 429, 'Metadata, captions and model actions share the lifetime call cap');
  } finally { await f.close(); }
});
