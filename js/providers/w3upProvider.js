// js/providers/w3upProvider.js
// Lighthouse provider adapter.
// Wraps the Lighthouse client-side auth + encrypted upload flow behind StorageProvider.

import { StorageProvider, computeSnapshotHash, saveSnapshotMeta, loadSnapshotMeta } from '../storageProvider.js';
import { connectLighthouseSession, restoreLighthouseSession, uploadEncryptedSnapshot, fetchSnapshotData } from '../lighthouseStorage.js';
import { loadSnapshotManifest, recordSnapshotUpload } from '../snapshotLifecycle.js';

export class W3upProvider extends StorageProvider {
  constructor() {
    super();
    this._session = null;
  }

  get id() { return 'w3up'; }
  get label() { return '🔐 Lighthouse'; }

  _syncSessionSnapshotContext(manifest = loadSnapshotManifest()) {
    if (!this._session) return;
    const current = manifest.current || null;
    const linkedSnapshotCid = current?.cid || '';
    this._session.linkedSnapshotCid = linkedSnapshotCid;
    this._session.linkedSnapshotHash = current?.hash || '';
    this._session.snapshotContext = {
      currentCid: linkedSnapshotCid,
      currentHash: current?.hash || '',
      currentTimestamp: current?.timestamp || '',
      currentSessionAddress: current?.sessionAddress || '',
      previousSnapshots: manifest.snapshots.slice(0, 25).map(snapshot => ({
        cid: snapshot.cid,
        hash: snapshot.hash,
        timestamp: snapshot.timestamp,
        provider: snapshot.provider,
        sessionAddress: snapshot.sessionAddress || '',
        fileName: snapshot.fileName || '',
      })),
    };
  }

  async connect() {
    try {
      const session = await connectLighthouseSession();
      if (session?.publicKey) {
        this._session = session;
        this._syncSessionSnapshotContext();
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
      const manifest = loadSnapshotManifest();
      const pointer = manifest.current?.provider === this.id
        ? manifest.current
        : manifest.snapshots.find(m => m.provider === this.id) || null;
      const metas = loadSnapshotMeta().filter(m => m.provider === this.id);
      const lastBackup = pointer?.timestamp ?? metas[0]?.timestamp ?? null;
      return { connected: true, identity: this._session.publicKey, lastBackup };
    }
    return { connected: false };
  }

  async put(data) {
    if (!this._session) throw new Error('Lighthouse provider not connected. Call connect() first.');
    const hash = await computeSnapshotHash(data);
    const now = new Date().toISOString();
    const manifest = loadSnapshotManifest();
    const previousSnapshot = manifest.current ? {
      cid: manifest.current.cid,
      hash: manifest.current.hash,
      timestamp: manifest.current.timestamp,
      provider: manifest.current.provider,
      sessionAddress: manifest.current.sessionAddress || '',
      fileName: manifest.current.fileName || '',
    } : null;
    try {
      const { cid } = await uploadEncryptedSnapshot(data, {
        snapshotMeta: {
          createdAt: now,
          sessionAddress: this._session.publicKey,
          sourceHash: hash,
          previousSnapshot,
          lineage: manifest.snapshots.slice(0, 25).map(snapshot => ({
            cid: snapshot.cid,
            hash: snapshot.hash,
            timestamp: snapshot.timestamp,
            provider: snapshot.provider,
            sessionAddress: snapshot.sessionAddress || '',
            fileName: snapshot.fileName || '',
          })),
        },
      });
      let verified = false;
      try {
        const remoteData = await fetchSnapshotData(cid);
        const remoteHash = await computeSnapshotHash(remoteData);
        verified = remoteHash === hash;
        if (!verified) {
          console.warn('[Lighthouse] CID verification mismatch:', { cid, expected: hash, actual: remoteHash });
        }
      } catch (verifyErr) {
        console.warn('[Lighthouse] Snapshot verification failed:', verifyErr);
      }
      try {
        const lifecycle = recordSnapshotUpload({
          cid,
          hash,
          timestamp: now,
          provider: this.id,
          source: 'lighthouse-upload',
          sessionAddress: this._session.publicKey,
          verified,
        });
        if (lifecycle.cleanupCandidates.length) {
          console.info('[Lighthouse] Cleanup queue updated:', lifecycle.cleanupCandidates.length);
        }
      } catch (lifecycleErr) {
        console.warn('[Lighthouse] Snapshot manifest update failed:', lifecycleErr);
      }
      this._syncSessionSnapshotContext();
      this._session.linkedSnapshotCid = cid;
      this._session.linkedSnapshotHash = hash;
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
    const manifest = loadSnapshotManifest();
    return (manifest.snapshots.length ? manifest.snapshots : loadSnapshotMeta()).filter(m => m.provider === this.id);
  }

  async restore() {
    try {
      const session = await restoreLighthouseSession();
      if (session?.publicKey) {
        this._session = session;
        this._syncSessionSnapshotContext();
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
