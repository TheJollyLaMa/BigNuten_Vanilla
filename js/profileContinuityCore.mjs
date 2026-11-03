export const PROFILE_PREFIX = 'bignuten.profile.v1:';
export const PROFILE_MIGRATION_KEY = `${PROFILE_PREFIX}legacy-copied`;
export const PROFILE_SELECTION_KEY = `${PROFILE_PREFIX}selected`;

export function selectedHealthProfile(saved, address) {
  const wallet = walletProfileId(address);
  return saved === wallet ? wallet : 'guest';
}

export function walletProfileId(address) {
  const value = String(address || '').trim();
  return /^0x[a-f0-9]{40}$/i.test(value) ? `wallet-${value.toLowerCase()}` : 'guest';
}

export function profileStorageKey(profileId, key) {
  return `${PROFILE_PREFIX}${encodeURIComponent(profileId)}:${String(key)}`;
}

export function migrateLegacyStorage(storage) {
  if (storage.getItem(PROFILE_MIGRATION_KEY) === '1') return { copied: 0, complete: true };
  let copied = 0;
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean);
    for (const key of keys) {
      if (key.startsWith(PROFILE_PREFIX)) continue;
      const target = profileStorageKey('guest', key);
      if (storage.getItem(target) === null) {
        const value = storage.getItem(key);
        if (value !== null) {
          storage.setItem(target, value);
          copied++;
        }
      }
    }
    storage.setItem(PROFILE_MIGRATION_KEY, '1');
    return { copied, complete: true };
  } catch (error) {
    return { copied, complete: false, error };
  }
}

export function createProfileStorage(storage, initialProfileId = 'guest') {
  let profileId = initialProfileId;
  let legacyGuestFallback = false;
  let canWrite = () => false;
  const keys = () => {
    const prefix = `${PROFILE_PREFIX}${encodeURIComponent(profileId)}:`;
    const result = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) result.push(key.slice(prefix.length));
      else if (profileId === 'guest' && legacyGuestFallback && key && !key.startsWith(PROFILE_PREFIX) && !result.includes(key)) result.push(key);
    }
    return result;
  };
  const mapped = key => profileStorageKey(profileId, key);
  const read = (id, key) => {
    const namespaced = storage.getItem(profileStorageKey(id, key));
    return namespaced === null && id === 'guest' && legacyGuestFallback ? storage.getItem(key) : namespaced;
  };
  const assertWritable = () => {
    if (!canWrite()) {
      const error = new Error('This profile is read-only in this tab. Take over editing before saving.');
      error.code = 'PROFILE_READ_ONLY';
      throw error;
    }
  };
  const api = {
    getItem: key => read(profileId, key),
    setItem(key, value) {
      const serialized = String(value);
      if (storage.getItem(mapped(key)) === serialized) return;
      assertWritable();
      storage.setItem(mapped(key), serialized);
    },
    removeItem(key) {
      if (storage.getItem(mapped(key)) === null) {
        if (profileId === 'guest' && legacyGuestFallback && storage.getItem(key) !== null) {
          const error = new Error('Legacy profile migration is incomplete; finish migration before deleting this data.');
          error.code = 'PROFILE_MIGRATION_INCOMPLETE';
          throw error;
        }
        return;
      }
      assertWritable();
      storage.removeItem(mapped(key));
    },
    clear() {
      const currentKeys = keys();
      if (!currentKeys.length) return;
      if (profileId === 'guest' && legacyGuestFallback) {
        const error = new Error('Legacy profile migration is incomplete; finish migration before clearing this data.');
        error.code = 'PROFILE_MIGRATION_INCOMPLETE';
        throw error;
      }
      assertWritable();
      for (const key of currentKeys) storage.removeItem(mapped(key));
    },
    key(index) { return keys()[Number(index)] ?? null; },
    get length() { return keys().length; },
    setProfile(id) { profileId = id || 'guest'; },
    setLegacyGuestFallback(enabled) { legacyGuestFallback = Boolean(enabled); },
    getProfile() { return profileId; },
    setWriterGuard(guard) { canWrite = typeof guard === 'function' ? guard : () => Boolean(guard); },
    readProfile(id, key) { return read(id, key); },
    writeCurrent(key, value) { assertWritable(); storage.setItem(mapped(key), String(value)); },
  };
  const facade = new Proxy(Object.create(null), {
    get(_target, property) {
      if (property === 'length') return api.length;
      if (property === 'key') return api.key;
      if (property === 'getItem') return api.getItem;
      if (property === 'setItem') return api.setItem;
      if (property === 'removeItem') return api.removeItem;
      if (property === 'clear') return api.clear;
      if (property === Symbol.toStringTag) return 'Storage';
      if (property === Symbol.iterator) return function* iterator() { for (const key of keys()) yield [key, api.getItem(key)]; };
      if (typeof property === 'string') return api.getItem(property);
      return undefined;
    },
    set(_target, property, value) { api.setItem(property, value); return true; },
    deleteProperty(_target, property) { api.removeItem(property); return true; },
    ownKeys: () => keys(),
    has: (_target, property) => typeof property === 'string' && api.getItem(property) !== null,
    getOwnPropertyDescriptor(_target, property) {
      if (typeof property !== 'string' || api.getItem(property) === null) return undefined;
      return { configurable: true, enumerable: true, writable: true, value: api.getItem(property) };
    },
  });
  return { api, storage: facade };
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export class LocalProfileCoordinator {
  constructor({ storage, profileStorage, locks, makeChannel, confirmTakeover = async () => false,
    onChange = () => {}, randomId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}` } = {}) {
    this.storage = storage;
    this.profileStorage = profileStorage;
    this.locks = locks;
    this.makeChannel = makeChannel;
    this.confirmTakeover = confirmTakeover;
    this.onChange = onChange;
    this.randomId = randomId;
    this.profileId = 'guest';
    this.status = 'connecting';
    this.token = null;
    this.releaseLock = null;
    this.lockRequest = null;
    this.channel = null;
    this.profileStorage.setWriterGuard(() => this.isWriter());
  }

  leaseKey(profileId = this.profileId) { return `${PROFILE_PREFIX}lease:${encodeURIComponent(profileId)}`; }
  isWriter() { return this.status === 'writer' && Boolean(this.token) && this.storage.getItem(this.leaseKey()) === this.token; }
  notify(status, error = '') { this.status = status; this.onChange({ profileId: this.profileId, status, error }); }

  async release() {
    this.notify('releasing');
    const token = this.token;
    if (token && this.storage.getItem(this.leaseKey()) === token) this.storage.removeItem(this.leaseKey());
    this.token = null;
    this.profileStorage.setWriterGuard(false);
    this.releaseLock?.();
    this.releaseLock = null;
    this.channel?.close?.();
    this.channel = null;
    try { await this.lockRequest; } catch { /* The lock is already released. */ }
    this.lockRequest = null;
  }

  async activate(profileId) {
    await this.release();
    this.profileId = profileId || 'guest';
    this.profileStorage.setProfile(this.profileId);
    this.token = this.randomId();
    if (!this.locks?.request || !this.makeChannel) {
      this.token = null;
      this.notify('unavailable', 'This browser cannot safely coordinate profile editing.');
      return this.status;
    }
    try {
      this.channel = this.makeChannel(`${PROFILE_PREFIX}coord:${encodeURIComponent(this.profileId)}`);
      this.channel.onmessage = event => { void this.handleMessage(event.data); };
      this.notify('connecting');
      let resolveReady;
      const ready = new Promise(resolve => { resolveReady = resolve; });
      const profileIdForLock = this.profileId;
      const token = this.token;
      let releaseHold;
      const hold = new Promise(resolve => { releaseHold = resolve; });
      this.releaseLock = releaseHold;
      this.lockRequest = this.locks.request(`${PROFILE_PREFIX}writer:${encodeURIComponent(profileIdForLock)}`, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) { resolveReady(false); return; }
        try {
          this.storage.setItem(this.leaseKey(profileIdForLock), token);
          if (this.storage.getItem(this.leaseKey(profileIdForLock)) !== token) throw new Error('Could not establish the local writer fence.');
          this.token = token;
          this.profileStorage.setWriterGuard(() => this.isWriter());
          this.notify('writer');
          resolveReady(true);
          await hold;
        } catch (error) {
          this.token = null;
          this.profileStorage.setWriterGuard(false);
          this.notify('unavailable', error.message);
          resolveReady(false);
        } finally {
          if (this.storage.getItem(this.leaseKey(profileIdForLock)) === token) this.storage.removeItem(this.leaseKey(profileIdForLock));
          this.token = null;
          this.profileStorage.setWriterGuard(false);
          if (this.status !== 'unavailable') this.notify('readonly');
        }
      });
      this.lockRequest.catch(error => { this.notify('unavailable', error.message); resolveReady(false); });
      if (!await ready) {
        this.releaseLock = null;
        this.token = null;
        this.notify('readonly');
      }
    } catch (error) {
      this.token = null;
      this.profileStorage.setWriterGuard(false);
      this.notify('unavailable', error.message);
    }
    return this.status;
  }

  async handleMessage(message) {
    if (!message || message.profileId !== this.profileId) return;
    if (message.type !== 'takeover-request' || !this.isWriter()) return;
    const accepted = await this.confirmTakeover();
    this.channel?.postMessage({ type: accepted ? 'takeover-yielded' : 'takeover-declined', profileId: this.profileId, requestId: message.requestId });
    if (accepted && this.isWriter()) {
      this.profileStorage.setWriterGuard(false);
      this.notify('yielding');
      await this.release();
      this.notify('readonly');
    }
  }

  async takeOver({ timeoutMs = 30000, pollMs = 75 } = {}) {
    if (this.status === 'writer' && this.isWriter()) return true;
    if (!this.channel || !this.locks?.request) return false;
    const requestId = this.randomId();
    this.channel.postMessage({ type: 'takeover-request', profileId: this.profileId, requestId });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await this.tryAcquireCurrent();
      if (status) return true;
      await wait(pollMs);
    }
    return false;
  }

  async tryAcquireCurrent() {
    let acquired = false;
    let resolveReady;
    const ready = new Promise(resolve => { resolveReady = resolve; });
    const token = this.randomId();
    let releaseHold;
    const hold = new Promise(resolve => { releaseHold = resolve; });
    const lockRequest = this.locks.request(`${PROFILE_PREFIX}writer:${encodeURIComponent(this.profileId)}`, { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (!lock) { resolveReady(false); return; }
      try {
        this.storage.setItem(this.leaseKey(), token);
        if (this.storage.getItem(this.leaseKey()) !== token) throw new Error('Could not establish the local writer fence.');
        this.token = token;
        this.releaseLock = () => { releaseHold(); };
        this.profileStorage.setWriterGuard(() => this.isWriter());
        this.notify('writer');
        acquired = true;
        resolveReady(true);
        await hold;
      } catch (error) {
        this.notify('unavailable', error.message);
        resolveReady(false);
      } finally {
        if (this.storage.getItem(this.leaseKey()) === token) this.storage.removeItem(this.leaseKey());
        this.token = null;
        this.releaseLock = null;
        this.profileStorage.setWriterGuard(false);
        if (this.status !== 'unavailable') this.notify('readonly');
      }
    });
    this.lockRequest = lockRequest;
    lockRequest.catch(error => { this.notify('unavailable', error.message); resolveReady(false); });
    await ready;
    return acquired;
  }

  async close() { await this.release(); this.notify('closed'); }
}
