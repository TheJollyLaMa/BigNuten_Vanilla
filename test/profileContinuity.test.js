const { before, test } = require('node:test');
const assert = require('node:assert/strict');
test('connecting a wallet never implicitly selects its health profile', async () => {
  const { selectedHealthProfile, walletProfileId } = await import('../js/profileContinuityCore.mjs');
  const address = '0x' + 'ab'.repeat(20);
  const wallet = walletProfileId(address);
  assert.equal(selectedHealthProfile(null, address), 'guest');
  assert.equal(selectedHealthProfile('guest', address), 'guest');
  assert.equal(selectedHealthProfile(wallet, address), wallet);
  assert.equal(selectedHealthProfile(wallet, '0x' + 'cd'.repeat(20)), 'guest');
  assert.equal(selectedHealthProfile(wallet, ''), 'guest');
});
let createProfileStorage, LocalProfileCoordinator, migrateLegacyStorage, profileStorageKey, walletProfileId;
before(async () => {
  ({ createProfileStorage, LocalProfileCoordinator, migrateLegacyStorage, profileStorageKey, walletProfileId } = await import('../js/profileContinuityCore.mjs'));
});

class MemoryStorage {
  constructor(entries = []) { this.values = new Map(entries); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

class FakeLocks {
  constructor() { this.owners = new Map(); }
  request(name, options, callback) {
    return new Promise((resolve, reject) => queueMicrotask(async () => {
      if (options.ifAvailable && this.owners.has(name)) {
        try { resolve(await callback(null)); } catch (error) { reject(error); }
        return;
      }
      if (this.owners.has(name)) { reject(new Error('Unexpected queued lock request in fake')); return; }
      this.owners.set(name, true);
      try { resolve(await callback({ name })); } catch (error) { reject(error); }
      finally { this.owners.delete(name); }
    }));
  }
}

class FakeChannel {
  static buses = new Map();
  constructor(name) {
    this.name = name;
    this.listeners = FakeChannel.buses.get(name) || new Set();
    this.listeners.add(this);
    FakeChannel.buses.set(name, this.listeners);
  }
  postMessage(data) { for (const listener of this.listeners) if (listener !== this) queueMicrotask(() => listener.onmessage?.({ data: structuredClone(data) })); }
  close() { this.listeners.delete(this); }
}

const channelFactory = name => new FakeChannel(name);

test('wallet profiles are distinct and legacy unnamespaced storage is copied, never removed', () => {
  const storage = new MemoryStorage([['fitnessTrackerData', '{"weightLogs":[1]}'], ['waterTrackerData', 'legacy-water']]);
  const result = migrateLegacyStorage(storage);
  assert.deepEqual(result, { copied: 2, complete: true });
  assert.equal(storage.getItem('fitnessTrackerData'), '{"weightLogs":[1]}');
  assert.equal(storage.getItem(profileStorageKey('guest', 'fitnessTrackerData')), '{"weightLogs":[1]}');
  assert.equal(storage.getItem(profileStorageKey('guest', 'waterTrackerData')), 'legacy-water');
  assert.deepEqual(migrateLegacyStorage(storage), { copied: 0, complete: true });
  assert.equal(walletProfileId('0x' + 'AB'.repeat(20)), 'wallet-0x' + 'ab'.repeat(20));
  assert.equal(walletProfileId('invalid'), 'guest');

  const { api, storage: facade } = createProfileStorage(storage);
  api.setWriterGuard(true);
  facade.setItem('fitnessTrackerData', 'guest-edited');
  api.setProfile(walletProfileId('0x' + 'ab'.repeat(20)));
  assert.equal(facade.getItem('fitnessTrackerData'), null, 'wallet does not inherit guest records');
  facade.setItem('fitnessTrackerData', 'wallet-a');
  api.setProfile(walletProfileId('0x' + 'cd'.repeat(20)));
  assert.equal(facade.getItem('fitnessTrackerData'), null, 'second wallet is isolated');
  assert.equal(storage.getItem(profileStorageKey('wallet-0x' + 'ab'.repeat(20), 'fitnessTrackerData')), 'wallet-a');
  api.setWriterGuard(false);
  assert.throws(() => facade.setItem('fitnessTrackerData', 'stale'), { code: 'PROFILE_READ_ONLY' });
});

test('incomplete legacy migration still reads the untouched source and blocks destructive removal', () => {
  class FailingStorage extends MemoryStorage {
    setItem(key, value) {
      if (key.startsWith('bignuten.profile.v1:')) throw new Error('synthetic quota');
      super.setItem(key, value);
    }
  }
  const storage = new FailingStorage([['fitnessTrackerData', 'legacy-health']]);
  const migration = migrateLegacyStorage(storage);
  assert.equal(migration.complete, false);
  const profile = createProfileStorage(storage);
  profile.api.setLegacyGuestFallback(true);
  profile.api.setWriterGuard(true);
  assert.equal(profile.storage.getItem('fitnessTrackerData'), 'legacy-health');
  assert.ok(Object.keys(profile.storage).includes('fitnessTrackerData'));
  assert.throws(() => profile.storage.removeItem('fitnessTrackerData'), { code: 'PROFILE_MIGRATION_INCOMPLETE' });
  assert.equal(storage.getItem('fitnessTrackerData'), 'legacy-health');
});

test('single writer takeover fences stale writes and preserves profile data', async () => {
  FakeChannel.buses.clear();
  const storage = new MemoryStorage();
  const locks = new FakeLocks();
  const firstProfile = createProfileStorage(storage);
  const secondProfile = createProfileStorage(storage);
  const first = new LocalProfileCoordinator({ storage, profileStorage: firstProfile.api, locks, makeChannel: channelFactory, confirmTakeover: async () => true, randomId: () => 'first' });
  const second = new LocalProfileCoordinator({ storage, profileStorage: secondProfile.api, locks, makeChannel: channelFactory, confirmTakeover: async () => false, randomId: (() => { let n = 0; return () => `second-${++n}`; })() });

  assert.equal(await first.activate('wallet-test'), 'writer');
  firstProfile.storage.setItem('fitnessTrackerData', 'before');
  assert.equal(await second.activate('wallet-test'), 'readonly');
  assert.equal(secondProfile.storage.getItem('fitnessTrackerData'), 'before');
  assert.equal(await second.takeOver({ timeoutMs: 1000, pollMs: 5 }), true);
  assert.equal(second.status, 'writer');
  assert.throws(() => firstProfile.storage.setItem('fitnessTrackerData', 'stale overwrite'), { code: 'PROFILE_READ_ONLY' });
  secondProfile.storage.setItem('fitnessTrackerData', 'after takeover');
  assert.equal(secondProfile.storage.getItem('fitnessTrackerData'), 'after takeover');
  assert.equal(storage.getItem(profileStorageKey('wallet-test', 'fitnessTrackerData')), 'after takeover');
  await Promise.all([first.close(), second.close()]);
});

test('missing coordination APIs fail closed', async () => {
  const storage = new MemoryStorage();
  const profile = createProfileStorage(storage);
  const coordinator = new LocalProfileCoordinator({ storage, profileStorage: profile.api });
  assert.equal(await coordinator.activate('guest'), 'unavailable');
  assert.throws(() => profile.storage.setItem('fitnessTrackerData', '{}'), { code: 'PROFILE_READ_ONLY' });
});
