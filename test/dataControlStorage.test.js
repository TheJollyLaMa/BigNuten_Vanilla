'use strict';

const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: flush } = require('node:timers/promises');

const values = new Map();
const nodes = new Map();
global.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
};
global.window = { BIGNUTEN_STORAGE_RELAY_URL: '', innerWidth: 1024 };
global.requestIdleCallback = () => 0;
global.document = {
  getElementById: id => nodes.get(id) || null,
  querySelector: () => null, querySelectorAll: () => [],
  body: { classList: { add() {}, remove() {} } },
};
global.fetch = async () => { throw new Error('UI test must not make provider requests'); };

function element(...classes) {
  const names = new Set(classes);
  return {
    handlers: new Map(), dataset: {}, style: {}, attributes: {}, innerHTML: '',
    classList: { add: c => names.add(c), remove: c => names.delete(c), contains: c => names.has(c) },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { this.handlers.set(name, callback); },
    async click() { await this.handlers.get('click')?.(); },
  };
}

let control, registry;
before(async () => {
  control = await import('../js/dataControl.js');
  ({ providerRegistry: registry } = await import('../js/storageProvider.js'));
});
beforeEach(() => {
  window.innerWidth = 1024;
  values.clear();
  values.set('ipfsEducationSeen', '1');
  nodes.clear();
  for (const id of [
    'ipfsIcon', 'ipfs-dialog-connect-btn', 'ipfs-dialog-own-btn', 'ipfs-dialog-desktop-btn',
    'ipfs-edu-connect-btn', 'ipfs-edu-own-btn', 'ipfs-edu-desktop-btn',
    'ipfs-dialog-status', 'ipfs-edu-connect-status',
  ]) nodes.set(id, element());
  nodes.set('ipfs-connect-dialog', element('modal-hidden'));
  nodes.set('ipfs-edu-overlay', element('edu-hidden'));
  registry.setActive('json-only');
});

function init() {
  const provider = {
    id: 'ipfs', client: null,
    connect: async () => ({ connected: false, error: 'Synthetic Desktop offline: check Kubo CORS.' }),
    restore: async () => null,
    put: async () => { throw new Error('No uploads in UI failure tests'); },
  };
  registry.register(provider);
  control.initDataControl({ provider });
}

test('failed returning-user connection remains visible in its own dialog with the provider error', async () => {
  init();
  await flush();
  control._openConnectDialog();
  await nodes.get('ipfs-dialog-desktop-btn').click();
  assert.match(nodes.get('ipfs-dialog-status').innerHTML, /Synthetic Desktop offline: check Kubo CORS/);
  assert.equal(nodes.get('ipfs-dialog-status').style.display, 'block');
  assert.equal(nodes.get('ipfs-connect-dialog').classList.contains('modal-hidden'), false);
  assert.equal(nodes.get('ipfs-edu-connect-status').innerHTML, '');
  assert.equal(control.getStorageMode(), 'json-only');
});

test('failed first-visit connection keeps education open rather than hiding its status', async () => {
  init();
  await flush();
  control._openOverlay();
  await nodes.get('ipfs-edu-desktop-btn').click();
  assert.match(nodes.get('ipfs-edu-connect-status').innerHTML, /Synthetic Desktop offline/);
  assert.equal(nodes.get('ipfs-edu-overlay').classList.contains('edu-hidden'), false);
  assert.equal(nodes.get('ipfs-dialog-status').innerHTML, '');
});

test('saved IPFS preference without a restored session is reset instead of displaying ready', async () => {
  values.set('storageMode', 'ipfs');
  init();
  await flush();
  assert.equal(control.getStorageMode(), 'json-only');
  assert.equal(registry.active.id, 'json-only');
  assert.equal(nodes.get('ipfsIcon').dataset.storageMode, 'json-only');
  assert.match(nodes.get('ipfsIcon').attributes['aria-label'], /local only/);
});

test('mobile local-only startup also clears a stale connected preference', () => {
  window.innerWidth = 390;
  values.set('storageMode', 'ipfs');
  init();
  assert.equal(control.getStorageMode(), 'json-only');
  assert.equal(nodes.get('ipfsIcon').dataset.storageMode, 'json-only');
});
