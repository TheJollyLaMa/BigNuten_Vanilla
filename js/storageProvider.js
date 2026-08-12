// js/storageProvider.js
// Provider-agnostic storage abstraction for BigNuten data backups.
//
// All backup/restore operations go through a StorageProvider.
// Business logic never calls vendor SDKs directly — it calls provider methods.

// ── Snapshot content-addressing ───────────────────────────────────────────────

/**
 * Canonicalize `data` and compute a deterministic SHA-256 hex digest.
 * Keys are sorted recursively so the hash is stable regardless of insertion order.
 * @param {object} data
 * @returns {Promise<string>} hex digest, e.g. "a3f2…"
 */
export async function computeSnapshotHash(data) {
  const canonical = JSON.stringify(sortKeys(data));
  const encoded = new TextEncoder().encode(canonical);
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(k => [k, sortKeys(value[k])])
    );
  }
  return value;
}

// ── Snapshot metadata ─────────────────────────────────────────────────────────

const SNAPSHOT_META_KEY = 'snapshotMeta';

/** @returns {Array<{hash, cid, timestamp, provider, status, error?}>} */
export function loadSnapshotMeta() {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_META_KEY) || '[]');
  } catch {
    return [];
  }
}

/** Prepend a new metadata entry and persist (cap at 50). */
export function saveSnapshotMeta(entry) {
  const list = loadSnapshotMeta();
  list.unshift(entry);
  localStorage.setItem(SNAPSHOT_META_KEY, JSON.stringify(list.slice(0, 50)));
}

// ── StorageProvider base class ────────────────────────────────────────────────

/**
 * Abstract storage provider.
 *
 * Subclasses must override: id, label, connect(), status(), put(), get(), list(), restore().
 */
export class StorageProvider {
  /** Unique machine-readable identifier, e.g. 'w3up', 'json-only'. */
  get id() { return 'base'; }

  /** Human-readable label shown in UI. */
  get label() { return 'Storage Provider'; }

  /**
   * Initiate user auth / connection flow.
   * @returns {Promise<{connected: boolean, identity?: string, error?: string}>}
   */
  async connect() { throw new Error(`${this.id}: connect() not implemented`); }

  /**
   * Return current connection status without prompting user.
   * @returns {Promise<{connected: boolean, identity?: string, lastBackup?: string, error?: string}>}
   */
  async status() { return { connected: false }; }

  /**
   * Content-address `data`, persist it via the provider, and record snapshot metadata.
   * @param {object} data  — fitness tracker data payload
   * @returns {Promise<{cid: string, hash: string}>}
   */
  async put(data) { throw new Error(`${this.id}: put() not implemented`); }

  /**
   * Fetch a previously stored snapshot by its CID or hash.
   * @param {string} ref
   * @returns {Promise<object>} parsed snapshot data
   */
  async get(ref) { throw new Error(`${this.id}: get() not implemented`); }

  /**
   * List stored snapshots (most recent first).
   * @returns {Promise<Array<{cid: string, hash?: string, timestamp: string}>>}
   */
  async list() { return []; }

  /**
   * Attempt silent session restore (e.g. reuse existing auth token).
   * @returns {Promise<{connected: boolean, identity?: string} | null>} null if nothing to restore
   */
  async restore() { return null; }
}

// ── JsonOnlyProvider ──────────────────────────────────────────────────────────

/**
 * Built-in fallback provider: no remote storage.
 * put() content-addresses the snapshot and stores it in localStorage only.
 * get() fetches from localStorage.
 * Always reports as "connected" (local-first is always available).
 */
export class JsonOnlyProvider extends StorageProvider {
  get id() { return 'json-only'; }
  get label() { return '📁 JSON File (local)'; }

  async connect() { return { connected: true }; }

  async status() { return { connected: true, identity: 'local' }; }

  async put(data) {
    const hash = await computeSnapshotHash(data);
    const now = new Date().toISOString();
    const entry = { hash, data };
    localStorage.setItem(`fitnessTrackerSnapshot-${now}`, JSON.stringify({ cid: hash, hash, data }));
    const meta = { hash, cid: hash, timestamp: now, provider: this.id, status: 'ok' };
    saveSnapshotMeta(meta);
    // Also maintain legacy snapshotHistory list for backwards compatibility
    _updateLegacySnapshotHistory(hash, now);
    return { cid: hash, hash };
  }

  async get(ref) {
    // Try to find a matching snapshot in localStorage
    const keys = Object.keys(localStorage).filter(k => k.startsWith('fitnessTrackerSnapshot-'));
    for (const k of keys.sort().reverse()) {
      try {
        const s = JSON.parse(localStorage.getItem(k));
        if (s?.cid === ref || s?.hash === ref) return s.data;
      } catch { /* skip */ }
    }
    throw new Error(`Snapshot not found locally: ${ref}`);
  }

  async list() {
    return loadSnapshotMeta().filter(m => m.provider === this.id);
  }

  async restore() { return { connected: true }; }
}

// ── ProviderRegistry ──────────────────────────────────────────────────────────

/**
 * Registry that holds the active provider and all registered providers.
 * Business logic imports the registry and calls registry.active.put(data) etc.
 */
class ProviderRegistry {
  constructor() {
    this._providers = new Map();
    this._active = null;
    // Always register the built-in fallback
    this.register(new JsonOnlyProvider());
    this._active = this._providers.get('json-only');
  }

  /** @param {StorageProvider} provider */
  register(provider) {
    this._providers.set(provider.id, provider);
  }

  /** @returns {StorageProvider} */
  get active() { return this._active; }

  /**
   * Switch the active provider by id.
   * @param {string} id
   */
  setActive(id) {
    const p = this._providers.get(id);
    if (!p) throw new Error(`Unknown provider: ${id}`);
    this._active = p;
  }

  /** @returns {StorageProvider[]} */
  all() { return [...this._providers.values()]; }

  /** @param {string} id @returns {StorageProvider|undefined} */
  get(id) { return this._providers.get(id); }
}

export const providerRegistry = new ProviderRegistry();

// ── Legacy helpers ────────────────────────────────────────────────────────────

function _updateLegacySnapshotHistory(cid, timestamp) {
  const historyKey = 'snapshotHistory';
  try {
    const list = JSON.parse(localStorage.getItem(historyKey) || '[]');
    list.unshift({ cid, timestamp });
    localStorage.setItem(historyKey, JSON.stringify(list));
  } catch { /* non-fatal */ }
}
