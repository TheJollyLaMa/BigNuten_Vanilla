'use strict';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const originals = Object.fromEntries(['window', 'localStorage', 'fetch', 'ethers'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const values = new Map();
const address = `0x${'a'.repeat(40)}`, hash = `0x${'b'.repeat(64)}`;
let dataSharing, logs, offline;
before(async () => {
  global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  global.window = { CONTRACTS: { chainId: 8453 } };
  global.fetch = async () => ({ ok: true, json: async () => ({ routerAddress: address, fundSlug: 'health-rewards', asset: { address, decimals: 18 } }) });
  global.ethers = {
    JsonRpcProvider: class { async getNetwork() { return { chainId: 8453n }; } async getBlockNumber() { if (offline) throw new Error('RPC offline'); return 100; } },
    Contract: class {
      constructor(target) { this.target = target; this.filters = { PayrollPaid: () => 'reward-filter' }; }
      async queryFilter(filter, from, to) { assert.equal(typeof from, 'number'); assert.equal(typeof to, 'number'); return logs; }
    },
    formatUnits: amount => Number(amount) / 1e18, keccak256: value => value, toUtf8Bytes: value => value,
  };
  dataSharing = await import('../js/dataSharing.js');
});
after(() => { for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
beforeEach(() => { values.clear(); offline = false; logs = [{ transactionHash: hash, index: 0, blockNumber: 99, args: { amount: 5e18, metadataUri: 'data-sharing:synthetic' } }]; });

test('payment integration dedupes actual reward identities and only counts a successful complete scan', async () => {
  logs.push(logs[0]);
  const first = await dataSharing.getDataSharingStatus(address);
  assert.equal(first.historyStatus.state, 'success'); assert.equal(first.confirmedBnut, 5); assert.equal(first.onChainHistory.length, 1);
  const second = await dataSharing.getDataSharingStatus(address);
  assert.equal(second.confirmedBnut, 5); assert.equal(second.onChainHistory.length, 1);
});

test('payment RPC failures preserve history storage and expose failure, never zero confirmed or pending rewards', async () => {
  await dataSharing.getOnChainDataSharingHistory(address);
  const before = [...values]; offline = true;
  await assert.rejects(dataSharing.getOnChainDataSharingHistory(address), /RPC offline/);
  const status = await dataSharing.getDataSharingStatus(address);
  assert.equal(status.historyStatus.state, 'failure'); assert.equal(status.confirmedBnut, null); assert.equal(status.pendingBnut, null);
  assert.deepEqual([...values], before);
});
