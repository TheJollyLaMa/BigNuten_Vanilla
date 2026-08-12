// js/providers/w3upProvider.js
// W3up / Storacha provider adapter.
// Wraps w3upClient.js and uploadToIPFS.js behind the StorageProvider interface.
// Business logic must never import w3upClient or uploadToIPFS directly.

import { StorageProvider, computeSnapshotHash, saveSnapshotMeta, loadSnapshotMeta } from '../storageProvider.js';
import { connectW3upClient, tryAutoRestoreW3upClient } from '../w3upClient.js';
import { uploadDataToIPFS } from '../uploadToIPFS.js';

export class W3upProvider extends StorageProvider {
  constructor() {
    super();
    this._client = null;
    this._spaceDid = null;
  }

  get id() { return 'w3up'; }
  get label() { return '🔗 Your Own Storacha Space'; }

  async connect() {
    try {
      const result = await connectW3upClient();
      if (result?.spaceDid) {
        this._client = result.client;
        this._spaceDid = result.spaceDid;
        // Expose client globally for legacy code paths that still use window._w3upClientRef
        window._w3upClientRef = this._client;
        return { connected: true, identity: result.spaceDid };
      }
      return { connected: false, error: 'Connection cancelled or failed.' };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }

  async status() {
    if (this._client && this._spaceDid) {
      const metas = loadSnapshotMeta().filter(m => m.provider === this.id);
      const lastBackup = metas[0]?.timestamp ?? null;
      return { connected: true, identity: this._spaceDid, lastBackup };
    }
    return { connected: false };
  }

  async put(data) {
    if (!this._client) throw new Error('W3up provider not connected. Call connect() first.');
    const hash = await computeSnapshotHash(data);
    const now = new Date().toISOString();
    try {
      const cid = await uploadDataToIPFS(data, this._client);
      if (!cid) throw new Error('Upload returned no CID.');
      const meta = { hash, cid, timestamp: now, provider: this.id, status: 'ok' };
      saveSnapshotMeta(meta);
      return { cid, hash };
    } catch (err) {
      const meta = { hash, cid: null, timestamp: now, provider: this.id, status: 'error', error: err.message };
      saveSnapshotMeta(meta);
      throw err;
    }
  }

  async get(ref) {
    // Fetch from IPFS gateway
    const url = `https://${ref}.ipfs.w3s.link/`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch CID ${ref}: HTTP ${res.status}`);
    return res.json();
  }

  async list() {
    return loadSnapshotMeta().filter(m => m.provider === this.id);
  }

  async restore() {
    try {
      const result = await tryAutoRestoreW3upClient({ silent: true });
      if (result?.spaceDid) {
        this._client = result.client;
        this._spaceDid = result.spaceDid;
        window._w3upClientRef = this._client;
        return { connected: true, identity: result.spaceDid };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Expose the underlying client for callers that need it (e.g. ticker animation). */
  get client() { return this._client; }
  get spaceDid() { return this._spaceDid; }
}
