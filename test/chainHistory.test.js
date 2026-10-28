'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let create;
before(async () => { ({ createChainHistory: create } = await import('../js/chainHistory.js')); });
function memory() { const values = new Map(); return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) }; }
const event = (block, index = 0) => ({ transactionHash: `0x${'a'.repeat(64)}`, index, blockNumber: block, args: { amount: 5 } });
const base = { scope: '8453:contract:wallet:event', project: log => ({ amount: log.args.amount }) };

test('bounded scans persist cursor with events, dedupe stable tx/log identity and resume after restart', async () => {
  const storage = memory(), history = create(storage), ranges = [];
  let result = await history.scan({ ...base, latestBlock: 25, chunkSize: 10, maxChunks: 2, query: async (from, to) => { ranges.push([from, to]); return from === 0 ? [event(3), event(3)] : []; } });
  assert.equal(result.state, 'pending'); assert.equal(result.cursor, 19); assert.equal(result.events.length, 1);
  assert.deepEqual(ranges, [[0, 9], [10, 19]]);
  result = await create(storage).scan({ ...base, latestBlock: 25, chunkSize: 10, maxChunks: 3, query: async (from, to) => from <= 20 && to >= 20 ? [event(20, 1)] : [] });
  assert.equal(result.state, 'success'); assert.equal(result.events.length, 2);
  result = await history.scan({ ...base, latestBlock: 25, query: async () => [event(20, 1), event(20, 1)] });
  assert.equal(result.events.length, 2);
});

test('failed queries and writes preserve checkpoint and cached records; status distinguishes pending/failure/success', async () => {
  const storage = memory(), history = create(storage);
  await history.scan({ ...base, latestBlock: 10, query: async () => [event(3)] });
  const before = JSON.stringify([...storage.values]);
  await assert.rejects(history.scan({ ...base, latestBlock: 20, query: async () => { assert.equal(history.status(base.scope).state, 'pending'); throw new Error('offline'); } }), error => error.history.length === 1 && error.historyStatus.state === 'failure');
  assert.equal(JSON.stringify([...storage.values]), before);
  storage.setItem = () => { throw new Error('quota'); };
  await assert.rejects(history.scan({ ...base, latestBlock: 20, query: async () => [] }), /quota/);
  assert.equal(JSON.stringify([...storage.values]), before);
});

test('bad RPC data, malformed saved state and unavailable head fail without fabricating empty history', async () => {
  const storage = memory(), history = create(storage);
  for (const options of [ { latestBlock: null, query: async () => [] }, { latestBlock: 10, query: async () => null }, { latestBlock: 10, query: async () => [{ blockNumber: 1 }] } ]) {
    await assert.rejects(history.scan({ ...base, ...options })); assert.equal(storage.values.size, 0);
  }
  storage.setItem(`bignutenChainHistory.v1:${base.scope}`, 'broken');
  await assert.rejects(history.scan({ ...base, latestBlock: 10, query: async () => [] }));
  assert.equal(storage.getItem(`bignutenChainHistory.v1:${base.scope}`), 'broken');
});
