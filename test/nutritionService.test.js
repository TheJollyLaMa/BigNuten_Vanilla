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
test('both nutrition stages reserve durable calls and record tokens exactly once', async () => {
  const f = await setup({ dependencies: { modelCall: async ({ reserveAdditionalCall, recordUsage }) => {
    recordUsage({ input_tokens: 20, output_tokens: 10 });
    reserveAdditionalCall();
    recordUsage({ input_tokens: 5, output_tokens: 3 });
    return { found: false, reason: 'Synthetic unavailable', usage: { input_tokens: 25, output_tokens: 13 } };
  } } });
  try {
    const session = await f.signin();
    const result = await f.request('/lookup', { input, consent: true }, session.token);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.usage, { calls: 2, inputTokens: 25, outputTokens: 13 });
    assert.equal((await f.request('/lookup', { input, consent: true }, session.token)).status, 429);
  } finally { await f.close(); }
});
test('second-stage budget exhaustion retains first-stage tokens without reserving beyond cap', async () => {
  let secondStageStarted = false;
  const f = await setup({ settings: { maxCalls: 1 }, dependencies: { modelCall: async ({ reserveAdditionalCall, recordUsage }) => {
    recordUsage({ input_tokens: 20, output_tokens: 10 });
    reserveAdditionalCall(); secondStageStarted = true;
    return { found: false, reason: 'Unexpected' };
  } } });
  try {
    const session = await f.signin();
    const result = await f.request('/lookup', { input, consent: true }, session.token);
    assert.equal(result.status, 429); assert.match(result.body.error, /budget exhausted/);
    assert.deepEqual(result.body.usage, { calls: 1, inputTokens: 20, outputTokens: 10 });
    assert.equal(secondStageStarted, false);
  } finally { await f.close(); }
});
test('failed extraction returns both-stage usage and persists it across restart', async () => {
  const { mkdtemp, rm } = require('node:fs/promises');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'bignuten-stages-test-'));
  const stateFile = join(directory, 'usage.sqlite');
  let f;
  try {
    f = await setup({ settings: { stateFile }, dependencies: { modelCall: async ({ reserveAdditionalCall, recordUsage }) => {
      recordUsage({ input_tokens: 20, output_tokens: 10 }); reserveAdditionalCall();
      recordUsage({ input_tokens: 5, output_tokens: 3 });
      throw Object.assign(new Error('Synthetic invalid extraction'), { status: 502 });
    } } });
    const session = await f.signin();
    const result = await f.request('/lookup', { input, consent: true }, session.token);
    assert.equal(result.status, 502); assert.ok(!result.body.card);
    assert.deepEqual(result.body.usage, { calls: 2, inputTokens: 25, outputTokens: 13 });
    const wallet = f.wallet;
    await f.close(); f = null;
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(stateFile);
    try {
      assert.deepEqual({ ...db.prepare('SELECT * FROM budget').get() }, { id: 1, calls: 2 });
      assert.deepEqual({ ...db.prepare('SELECT * FROM usage WHERE wallet=?').get(wallet.address.toLowerCase()) },
        { wallet: wallet.address.toLowerCase(), calls: 2, input_tokens: 25, output_tokens: 13 });
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
