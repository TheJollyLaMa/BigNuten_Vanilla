'use strict';

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

const values = new Map();
const original = {
  window: global.window, localStorage: global.localStorage, fetch: global.fetch,
  requestIdleCallback: global.requestIdleCallback,
};
global.window = { BIGNUTEN_STORAGE_RELAY_URL: '', dispatchEvent() {} };
global.requestIdleCallback = () => 0;
global.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
};
let transport, lifecycle, PinataProvider;
const sample = { dataVersion: 1, weightLogs: [], exercises: { entries: [] }, waterDailyHistory: { '2026-10-20': 3 } };
const reply = (data, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => data, text: async () => JSON.stringify(data),
});

before(async () => {
  transport = await import('../js/pinataStorage.js');
  lifecycle = await import('../js/snapshotLifecycle.js');
  ({ PinataProvider } = await import('../js/providers/pinataProvider.js'));
});
beforeEach(() => {
  values.clear();
  window._ipfsSessionRef = null;
  transport.clearManualPinataToken();
  window.prompt = () => { throw new Error('Unexpected personal JWT prompt'); };
  global.fetch = async () => { throw new Error('Unexpected network request'); };
});
after(() => {
  global.window = original.window;
  global.localStorage = original.localStorage;
  global.fetch = original.fetch;
  global.requestIdleCallback = original.requestIdleCallback;
});

test('hosted mode never falls back to requesting a personal credential; invalid modes fail', async () => {
  await assert.rejects(() => transport.connectPinataSession({ mode: 'hosted' }), /relay.*configured/i);
  await assert.rejects(() => transport.connectPinataSession({ mode: 'typo' }), /unsupported.*mode/i);
});

test('configured hosted mode without a wallet fails explicitly rather than requesting a personal JWT', async () => {
  window.BIGNUTEN_STORAGE_RELAY_URL = 'https://relay.example';
  try {
    const configured = await import('../js/pinataStorage.js?configured-relay');
    await assert.rejects(() => configured.connectPinataSession(), /Connect a wallet/);
  } finally {
    window.BIGNUTEN_STORAGE_RELAY_URL = '';
  }
});

test('Kubo connection and retrieval use POST against the selected local node, not a public gateway', async () => {
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, method: options?.method });
    return reply(url.includes('/version') ? { Version: 'test' } : sample);
  };
  const session = await transport.connectPinataSession({ mode: 'desktop' });
  assert.equal(session.desktop, true);
  assert.deepEqual(await transport.fetchSnapshotData('ipfs://bafytest', { session }), sample);
  assert.deepEqual(requests, [
    { url: 'http://127.0.0.1:5001/api/v0/version', method: 'POST' },
    { url: 'http://127.0.0.1:5001/api/v0/cat?arg=bafytest', method: 'POST' },
  ]);
});

test('personal Pinata credentials remain in memory across uploads without repeat prompts', async () => {
  let prompts = 0;
  window.prompt = () => { prompts++; return 'synthetic-token'; };
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.pinata.cloud/pinning/pinJSONToIPFS');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    return reply({ IpfsHash: 'bafytest' });
  };
  await transport.connectPinataSession({ mode: 'own' });
  await transport.uploadPinnedSnapshot(sample);
  await transport.uploadPinnedSnapshot(sample);
  assert.equal(prompts, 1);
  assert.equal((await transport.restorePinataSession()).manualToken, true);
  assert.ok(!JSON.stringify([...values]).includes('synthetic-token'));
  transport.clearManualPinataToken();
  assert.equal(await transport.restorePinataSession(), null);
});

test('Desktop upload, verification and restore survive a new provider instance without public gateway reads', async () => {
  let payload;
  global.fetch = async (url, options) => {
    if (url.includes('/version')) return reply({ Version: 'test' });
    if (url.includes('/add?')) {
      payload = JSON.parse(await options.body.get('file').text());
      return reply({ Hash: 'bafysynthetic' });
    }
    assert.equal(url, 'http://127.0.0.1:5001/api/v0/cat?arg=bafysynthetic');
    assert.equal(options.method, 'POST');
    return reply(payload);
  };
  const provider = new PinataProvider();
  assert.equal((await provider.connect('desktop')).connected, true);
  assert.equal((await provider.put(sample)).cid, 'bafysynthetic');
  const pointer = lifecycle.getCurrentSnapshotPointer();
  assert.equal(pointer.cid, 'bafysynthetic');
  assert.equal(pointer.verified, true);
  assert.equal(pointer.fileName, 'bignuten-snapshot.json');
  const restarted = new PinataProvider();
  assert.equal((await restarted.restore()).connected, true);
  assert.deepEqual(await restarted.get(pointer.cid), sample);
});

test('collecting a snapshot without older local snapshot files preserves every supported current record', async () => {
  const fitness = await import('../js/fitnessData.js');
  const current = fitness.normalizeFitnessData({
    timeZone: 'UTC',
    weightLogs: [{ timestamp: '2026-10-20T10:00:00Z', weight: 70 }],
    waterDailyHistory: { '2026-10-20': 3 },
    supplements: [{ timestamp: '2026-10-20T10:01:00Z', name: 'synthetic supplement' }],
    foods: [{ timestamp: '2026-10-20T10:02:00Z', name: 'synthetic food' }],
    measurements: [{ timestamp: '2026-10-20T10:03:00Z', value: 1 }],
    exercises: { types: ['Sit-ups', 'Push-ups', 'Pull-ups', 'Synthetic exercise'], entries: [{ timestamp: '2026-10-20T10:04:00Z', reps: 1 }] },
    sessionLog: [{ timestamp: '2026-10-20T10:05:00Z', name: 'synthetic workout' }],
    painLogs: [{ timestamp: '2026-10-20T10:06:00Z', value: 0 }],
    emotions: [{ timestamp: '2026-10-20T10:07:00Z', name: 'synthetic emotion' }],
    genieSessions: [{ timestamp: '2026-10-20T10:08:00Z', text: 'synthetic session' }],
    genieInsights: [{ timestamp: '2026-10-20T10:09:00Z', text: 'synthetic insight' }],
  });
  values.set('fitnessTrackerData', JSON.stringify(current));
  assert.deepEqual(await fitness.getFitnessData(), current);
  assert.deepEqual(JSON.parse(values.get('fitnessTrackerData')), current);
  let payload;
  global.fetch = async (url, options) => {
    if (url.includes('/version')) return reply({ Version: 'test' });
    if (url.includes('/add?')) {
      payload = JSON.parse(await options.body.get('file').text());
      return reply({ Hash: 'bafyallrecords' });
    }
    return reply(payload);
  };
  const provider = new PinataProvider();
  await provider.connect('desktop');
  await provider.put(await fitness.getFitnessData());
  values.delete('fitnessTrackerData');
  await fitness.importAndMergeFromCID('bafyallrecords');
  const restored = JSON.parse(values.get('fitnessTrackerData'));
  for (const key of Object.keys(current)) {
    assert.deepEqual(restored[key], current[key], key);
  }
  await fitness.importAndMergeFromCID('bafyallrecords');
  assert.deepEqual(JSON.parse(values.get('fitnessTrackerData')), restored);
});

test('mismatched verification rejects and preserves the last known-good pointer', async () => {
  lifecycle.recordSnapshotUpload({ cid: 'bafyknown', hash: 'known', verified: true });
  global.fetch = async url => {
    if (url.includes('/version')) return reply({ Version: 'test' });
    if (url.includes('/add?')) return reply({ Hash: 'bafybadsnapshot' });
    return reply({ wrong: 'synthetic data' });
  };
  const provider = new PinataProvider();
  await provider.connect('desktop');
  await assert.rejects(() => provider.put(sample), /verification.*mismatch/i);
  assert.equal(lifecycle.getCurrentSnapshotPointer().cid, 'bafyknown');
  assert.equal(JSON.parse(values.get('snapshotMeta'))[0].status, 'error');
});

test('unavailable verification rejects, retains local data, and does not create a current pointer', async () => {
  values.set('fitnessTrackerData', JSON.stringify(sample));
  global.fetch = async url => {
    if (url.includes('/version')) return reply({ Version: 'test' });
    if (url.includes('/add?')) return reply({ Hash: 'bafyoffline' });
    throw new Error('synthetic node offline');
  };
  const provider = new PinataProvider();
  await provider.connect('desktop');
  await assert.rejects(() => provider.put(sample), /offline/);
  assert.equal(lifecycle.getCurrentSnapshotPointer(), null);
  assert.equal(values.get('fitnessTrackerData'), JSON.stringify(sample));
});

test('snapshot retrieval rejects HTML, null, and HTTP errors explicitly', async () => {
  for (const payload of [null, 'gateway html error']) {
    global.fetch = async () => reply(payload);
    await assert.rejects(() => transport.fetchSnapshotData('bafytest'), /snapshot.*object/i);
  }
  global.fetch = async () => reply({}, 503);
  await assert.rejects(() => transport.fetchSnapshotData('bafytest'), /503/);
});

test('timeouts and unsupported snapshot wrappers are explicit failures', async () => {
  global.fetch = async (url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    throw new DOMException('synthetic timeout', 'TimeoutError');
  };
  await assert.rejects(() => transport.fetchSnapshotData('bafytest'), /timed out after 75 seconds/);
  for (const wrapper of [
    { __bignutenSnapshot: true, version: 99, data: sample },
    { __bignutenSnapshot: true, version: 1 },
  ]) {
    global.fetch = async () => reply(wrapper);
    await assert.rejects(() => transport.fetchSnapshotData('bafytest'), /Unsupported or incomplete snapshot wrapper/);
  }
});

test('hosted relay authorizes synthetic bytes, then uploads directly without forwarding content to the relay', async () => {
  const calls = [];
  let message;
  global.fetch = async (url, options) => {
    calls.push(url);
    if (url.endsWith('/nonce')) return reply({ nonce: 'synthetic-nonce', expiresAt: 1792530000000 });
    if (url.endsWith('/api/pinata-upload-url')) {
      const authorization = JSON.parse(options.body);
      assert.equal(authorization.signature, 'synthetic-signature');
      assert.equal(authorization.type, 'application/json');
      assert.equal(authorization.name, 'bignuten-snapshot.json');
      assert.equal(authorization.size, new TextEncoder().encode(JSON.stringify(sample)).length);
      assert.ok(!options.body.includes('waterDailyHistory'));
      return reply({ url: 'https://uploads.example/signed' });
    }
    assert.equal(url, 'https://uploads.example/signed');
    assert.deepEqual(JSON.parse(await options.body.get('file').text()), sample);
    return reply({ data: { cid: 'bafyhosted' } });
  };
  const result = await transport.uploadViaStorageRelay(sample, {
    relayUrl: 'https://relay.example', wallet: '0x1111111111111111111111111111111111111111',
    signer: { signMessage: async value => { message = value; return 'synthetic-signature'; } },
  });
  assert.equal(result.cid, 'bafyhosted');
  assert.match(message, /Nonce: synthetic-nonce/);
  assert.equal(calls.length, 3);
});

test('false verification flags survive manifest normalization without becoming verified', () => {
  lifecycle.recordSnapshotUpload({ cid: 'bafytest', hash: 'synthetic', verified: false });
  assert.equal(lifecycle.loadSnapshotManifest().current.verified, false);
});

test('CID merge keeps an existing timezone preference instead of replacing it with the donor timezone', async () => {
  const { mergeSnapshotData } = await import('../js/fitnessData.js');
  const merged = mergeSnapshotData({ timeZone: 'America/New_York' }, { timeZone: 'UTC' });
  assert.equal(merged.timeZone, 'America/New_York');
});

test('failed local manifest persistence is not reported as a successful backup', async () => {
  global.fetch = async url => {
    if (url.includes('/version')) return reply({ Version: 'test' });
    if (url.includes('/add?')) return reply({ Hash: 'bafytest' });
    return reply(sample);
  };
  const provider = new PinataProvider();
  await provider.connect('desktop');
  const setItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === 'bignutenSnapshotManifest') throw new Error('synthetic quota exceeded');
    setItem(key, value);
  };
  try {
    await assert.rejects(() => provider.put(sample), /quota exceeded/);
    assert.equal(lifecycle.getCurrentSnapshotPointer(), null);
  } finally {
    localStorage.setItem = setItem;
  }
});
