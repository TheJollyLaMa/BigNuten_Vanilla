const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Wallet } = require('ethers');
const origin = 'https://genie.example';
async function setup(genieCall = async () => ({ answer: 'Synthetic answer', usage: { input_tokens: 2, output_tokens: 3 } }), now = Date.now) {
  const { createNutritionServer } = await import('../services/nutritionService.mjs');
  const { createGenieClient } = await import('../js/genieService.mjs');
  const wallet = Wallet.createRandom();
  let current = wallet.address, signatures = 0;
  const settings = { origins: new Set([origin]), wallets: new Set([wallet.address.toLowerCase()]),
    enabled: true, apiKey: 'synthetic-server-only', model: 'synthetic', maxCalls: 10, stateFile: ':memory:' };
  const service = createNutritionServer(settings, { genieCall, logger: { warn() {} } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const client = createGenieClient({
    getWallet: () => current, getUrl: () => base, getOrigin: () => origin, getChainId: async () => 8453, now,
    signMessage: async message => { signatures++; return wallet.signMessage(message); },
    fetchImpl: (url, options) => fetch(url, { ...options, headers: { ...options.headers, Origin: origin } }),
  });
  return { client, settings, signatures: () => signatures,
    switchWallet: address => { current = address; client.clear('Wallet changed.'); },
    close: async () => { client.clear(); await new Promise(resolve => service.server.close(resolve)); service.close(); } };
}
const input = { assistant: 'health', messages: [{ role: 'user', content: 'Synthetic question' }], consent: true };

test('provider failure usage reaches the client without becoming a successful answer', async () => {
  const f = await setup(async () => {
    throw Object.assign(new Error('Synthetic provider refusal'), { status: 502, usage: { input_tokens: 7, output_tokens: 4 } });
  });
  try {
    await f.client.refresh(); await f.client.ensureSignedIn();
    await assert.rejects(f.client.request('/assistant', input), error => {
      assert.equal(error.status, 502);
      assert.deepEqual(error.usage, { calls: 1, inputTokens: 7, outputTokens: 4 });
      assert.match(error.message, /Synthetic provider refusal/);
      return true;
    });
  } finally { await f.close(); }
});

test('eligibility sends no context; three consumers share one real signed session with no serialized credential', async () => {
  const f = await setup();
  try {
    await f.client.refresh();
    assert.equal(f.client.state().eligible, true);
    assert.equal(f.client.state().authenticated, false);
    await Promise.all([f.client.ensureSignedIn(), f.client.ensureSignedIn(), f.client.ensureSignedIn()]);
    assert.equal(f.signatures(), 1);
    assert.equal(f.client.state().authenticated, true);
    assert.deepEqual(Object.keys(f.client.state()).sort(), ['authenticated', 'eligible', 'revision', 'wallet']);
    const result = await f.client.request('/assistant', input);
    assert.equal(result.answer, 'Synthetic answer');
    assert.equal(result.usage.calls, 1);
    await f.client.signOut();
    assert.equal(f.client.state().eligible, false);
    assert.equal(f.client.state().authenticated, false);
  } finally { await f.close(); }
});

test('uninvited wallets and server revocation fail closed on access refresh', async () => {
  const f = await setup();
  try {
    await f.client.refresh(); await f.client.ensureSignedIn();
    f.settings.wallets.clear();
    await assert.rejects(f.client.refresh(), /not invited/);
    assert.equal(f.client.state().eligible, false);
    assert.equal(f.client.state().authenticated, false);
    f.switchWallet(Wallet.createRandom().address);
    await assert.rejects(f.client.refresh(), /not enabled/);
    assert.equal(f.signatures(), 1);
  } finally { await f.close(); }
});

test('first sign-in after an idle challenge renews the nonce without invalidating the chosen panel request', async () => {
  let clock = Date.now();
  const f = await setup(undefined, () => clock);
  try {
    await f.client.refresh();
    const attempt = f.client.state().revision;
    clock += 240001;
    const result = await f.client.request('/assistant', input);
    f.client.assertCurrent(attempt);
    assert.equal(result.answer, 'Synthetic answer');
    assert.equal(f.signatures(), 1);
    assert.equal(f.client.state().authenticated, true);
  } finally { await f.close(); }
});

test('request rechecks caller permission after signing and before sending model context', async () => {
  let calls = 0;
  const f = await setup(async () => { calls++; return { answer: 'Must not run' }; });
  try {
    await f.client.refresh();
    await assert.rejects(f.client.request('/assistant', input, undefined, () => {
      assert.equal(f.client.state().authenticated, true);
      throw new Error('Permission was reset while signing.');
    }), /Permission was reset/);
    assert.equal(calls, 0);
    assert.equal(f.signatures(), 1);
  } finally { await f.close(); }
});

test('wallet change aborts an in-flight model request and discards its result', async () => {
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = await setup(async () => { started(); return new Promise(resolve => { release = () => resolve({ answer: 'Must be discarded' }); }); });
  try {
    await f.client.refresh(); await f.client.ensureSignedIn();
    const pending = f.client.request('/assistant', input);
    const rejection = assert.rejects(pending, /changed|canceled/);
    await ready;
    f.switchWallet(Wallet.createRandom().address);
    release(); await rejection;
    assert.equal(f.client.state().eligible, false);
  } finally { release?.(); await f.close(); }
});

test('changing service URLs never forwards an existing credential to another host', async () => {
  const { createGenieClient } = await import('../js/genieService.mjs');
  const address = Wallet.createRandom().address.toLowerCase();
  let url = 'https://first.example';
  const sent = [];
  const client = createGenieClient({
    getWallet: () => address, getUrl: () => url, getOrigin: () => origin, getChainId: async () => 8453,
    signMessage: async () => 'synthetic-signature',
    fetchImpl: async (target, options) => {
      sent.push({ target, authorization: Boolean(options.headers.Authorization) });
      if (target.startsWith('https://second.example')) throw new Error('Second service is unavailable.');
      return { ok: true, json: async () => target.endsWith('/challenge')
        ? { nonce: 'synthetic', message: `${address}\nSign in to BigNuten Genie access only. No transaction, payment or token approval.\nURI: ${origin}/\n` }
        : { token: 'a'.repeat(64), wallet: address, expiresAt: Date.now() + 900000 } };
    },
  });
  try {
    await client.refresh(); await client.ensureSignedIn();
    url = 'https://second.example';
    await assert.rejects(client.request('/assistant', input), /unavailable/);
    assert.equal(sent.filter(item => item.target.startsWith(url)).some(item => item.authorization), false);
  } finally { client.clear(); }
});
