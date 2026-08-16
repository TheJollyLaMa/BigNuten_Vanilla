// js/providers/w3upProvider.js
// Lighthouse provider adapter.
// Wraps the Lighthouse client-side auth + encrypted upload flow behind StorageProvider.

import { StorageProvider, computeSnapshotHash, saveSnapshotMeta, loadSnapshotMeta } from '../storageProvider.js';
import { connectLighthouseSession, restoreLighthouseSession, uploadEncryptedSnapshot, fetchSnapshotData } from '../lighthouseStorage.js';

export class W3upProvider extends StorageProvider {
  constructor() {
    super();
    this._session = null;
  }

  get id() { return 'w3up'; }
  get label() { return '🔐 Lighthouse'; }

  async connect() {
    try {
      const session = await connectLighthouseSession();
      if (session?.publicKey) {
        this._session = session;
        window._w3upClientRef = session;
        window._w3upClient = session;
        window._lighthouseSessionRef = session;
        return { connected: true, identity: session.publicKey };
      }
      return { connected: false, error: 'Connection cancelled or failed.' };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }

  async status() {
    if (this._session?.publicKey) {
      const metas = loadSnapshotMeta().filter(m => m.provider === this.id);
      const lastBackup = metas[0]?.timestamp ?? null;
      return { connected: true, identity: this._session.publicKey, lastBackup };
    }
    return { connected: false };
  }

  async put(data) {
    if (!this._session) throw new Error('Lighthouse provider not connected. Call connect() first.');
    const hash = await computeSnapshotHash(data);
    const now = new Date().toISOString();
    try {
      const { cid } = await uploadEncryptedSnapshot(data);
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
    return fetchSnapshotData(ref);
  }

  async list() {
    return loadSnapshotMeta().filter(m => m.provider === this.id);
  }

  async restore() {
    try {
      const session = await restoreLighthouseSession();
      if (session?.publicKey) {
        this._session = session;
        window._w3upClientRef = session;
        window._w3upClient = session;
        window._lighthouseSessionRef = session;
        return { connected: true, identity: session.publicKey };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Expose the underlying session for callers that need it. */
  get client() { return this._session; }
  get session() { return this._session; }
}
