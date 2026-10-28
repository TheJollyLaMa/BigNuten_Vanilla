'use strict';

const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const values = new Map();
const nodes = new Map();
global.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};
global.window = { innerWidth: 1024 };
global.requestIdleCallback = () => 0;
global.MutationObserver = class {
  observe() {}
  disconnect() {}
};
global.document = {
  getElementById: id => nodes.get(id) || null,
  querySelector: () => null,
  body: { classList: { add() {}, remove() {} } },
};
global.fetch = async () => { throw new Error('Adapter tests must not request provider bytes'); };

let createHost, registry, focused, statusCalls, providerStatus;
before(async () => {
  ({ createBigNutenIPFSHost: createHost } = await import('../js/ipfsHostAdapter.js'));
  ({ providerRegistry: registry } = await import('../js/storageProvider.js'));
});
beforeEach(() => {
  values.clear();
  nodes.clear();
  focused = null;
  statusCalls = 0;
  providerStatus = { connected: true };
  window.innerWidth = 1024;
  registry.register({
    id: 'ipfs',
    async status() { statusCalls++; return providerStatus; },
    async connect() { throw new Error('Header must not connect automatically'); },
    async put() { throw new Error('Header must not upload automatically'); },
  });
  for (const id of [
    'ipfs-connect-dialog', 'ipfs-dialog-close-btn', 'ipfs-snapshot-panel', 'snapshot-panel-close',
    'mobile-data-sheet', 'mobile-sheet-close-btn',
  ]) nodes.set(id, {
    handlers: new Map(),
    hidden: true, style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener(name, handler, options) {
      this.handlers.set(name, handler);
      options?.signal?.addEventListener('abort', () => this.handlers.delete(name));
    },
    focus() { focused = id; },
  });
});

test('construction and local status are inert; only backup is advertised with confidentiality warning', async () => {
  const host = createHost();
  assert.equal(statusCalls, 0);
  assert.deepEqual(Object.keys(host.capabilities), ['backup']);
  const status = await host.getStatus();
  assert.equal(status.backup.state, 'idle');
  assert.match(status.backup.detail, /not encrypted/);
  assert.equal(statusCalls, 0);
  assert.equal(values.size, 0);
});

test('local controls open provider choices on desktop and JSON options on mobile without connecting', async () => {
  const host = createHost();
  await host.capabilities.backup.open();
  assert.equal(focused, 'ipfs-dialog-close-btn');
  window.innerWidth = 390;
  await host.capabilities.backup.open();
  assert.equal(nodes.get('mobile-data-sheet').hidden, false);
  assert.equal(focused, 'mobile-sheet-close-btn');
  assert.equal(statusCalls, 0);
});

test('connected controls open snapshots without uploading, reading profile bytes or promoting pointers', async () => {
  values.set('storageMode', 'ipfs');
  const before = [...values];
  const host = createHost();
  const status = await host.getStatus();
  assert.equal(status.backup.state, 'ready');
  assert.match(status.backup.detail, /not backup verification/);
  await host.capabilities.backup.open();
  assert.equal(nodes.get('ipfs-snapshot-panel').hidden, false);
  assert.equal(focused, 'snapshot-panel-close');
  assert.deepEqual([...values], before);
});

test('saved preference does not imply a connection, and open rechecks current status', async () => {
  values.set('storageMode', 'ipfs');
  const host = createHost();
  assert.equal((await host.getStatus()).backup.state, 'ready');
  providerStatus = { connected: false };
  await host.capabilities.backup.open();
  assert.equal(focused, 'ipfs-dialog-close-btn');
  assert.equal((await host.getStatus()).backup.state, 'idle');
});

test('provider errors and malformed status reject instead of reporting success', async () => {
  values.set('storageMode', 'ipfs');
  const host = createHost();
  for (const invalid of [null, {}, { connected: 'yes' }]) {
    providerStatus = invalid;
    await assert.rejects(host.getStatus(), /invalid connection status/);
  }
  providerStatus = { connected: false, error: 'Synthetic provider unavailable' };
  await assert.rejects(host.getStatus(), /Synthetic provider unavailable/);
  await assert.rejects(host.capabilities.backup.open(), /Synthetic provider unavailable/);
  assert.equal(focused, null);
});

test('missing host panels fail explicitly rather than a success-shaped no-op', async () => {
  nodes.delete('ipfs-connect-dialog');
  await assert.rejects(createHost().capabilities.backup.open(), /not mounted/);
  assert.equal(focused, null);
});

test('invalid focus-return integration fails at construction rather than after a panel closes', () => {
  assert.throws(() => createHost({ returnFocus: true }), /function for returnFocus/);
});

test('Escape dismisses host controls, restores integration focus, and removes temporary keyboard handlers', async () => {
  let returned = 0;
  const host = createHost({ returnFocus: () => { returned++; } });
  await host.capabilities.backup.open();
  let prevented = false;
  nodes.get('ipfs-connect-dialog').handlers.get('keydown')({
    key: 'Escape', preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(returned, 1);
  assert.equal(nodes.get('ipfs-connect-dialog').handlers.size, 0);
  assert.equal(nodes.get('ipfs-dialog-close-btn').handlers.size, 0);
});
