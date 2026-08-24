import { StorageProvider, computeSnapshotHash, saveSnapshotMeta, loadSnapshotMeta } from '../storageProvider.js';
import { connectPinataSession, restorePinataSession, uploadPinnedSnapshot, fetchSnapshotData } from '../pinataStorage.js';
import { loadSnapshotManifest, recordSnapshotUpload } from '../snapshotLifecycle.js';

export class PinataProvider extends StorageProvider {
  constructor() {
    super();
    this._session = null;
  }

  get id() { return 'pinata'; }
  get label() { return '🔐 Pinata'; }

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
      const session = await connectPinataSession();
      if (session) {
        this._session = session;
        this._syncSessionSnapshotContext();
        window._pinataClientRef = session;
        window._pinataClient = session;
        window._pinataSessionRef = session;
        return { connected: true, identity: session.identity || 'Pinata' };
      }
      return { connected: false, error: 'Connection cancelled or failed.' };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }

  async status() {
    if (this._session) {
      const manifest = loadSnapshotManifest();
      const pointer = manifest.current?.provider === this.id
        ? manifest.current
        : manifest.snapshots.find(m => m.provider === this.id) || null;
      const metas = loadSnapshotMeta().filter(m => m.provider === this.id);
      const lastBackup = pointer?.timestamp ?? metas[0]?.timestamp ?? null;
      return { connected: true, identity: this._session.identity || 'Pinata', lastBackup };
    }
    return { connected: false };
  }

  async put(data) {
    if (!this._session) throw new Error('Pinata provider not connected. Call connect() first.');
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
      const { cid } = await uploadPinnedSnapshot(data, {
        fileName: 'bignuten-snapshot.json',
        snapshotMeta: {
          createdAt: now,
          sessionAddress: this._session.identity || 'Pinata',
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
        const remoteData = await fetchSnapshotData(cid, { session: this._session });
        const remoteHash = await computeSnapshotHash(remoteData);
        verified = remoteHash === hash;
      } catch (verifyErr) {
        console.warn('[Pinata] Snapshot verification failed:', verifyErr);
      }
      try {
        const lifecycle = recordSnapshotUpload({
          cid,
          hash,
          timestamp: now,
          provider: this.id,
          source: 'pinata-upload',
          sessionAddress: this._session.identity || 'Pinata',
          verified,
        });
        if (lifecycle.cleanupCandidates.length) {
          console.info('[Pinata] Cleanup queue updated:', lifecycle.cleanupCandidates.length);
        }
      } catch (lifecycleErr) {
        console.warn('[Pinata] Snapshot manifest update failed:', lifecycleErr);
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
      const session = await restorePinataSession();
      if (session) {
        this._session = session;
        this._syncSessionSnapshotContext();
        window._pinataClientRef = session;
        window._pinataClient = session;
        window._pinataSessionRef = session;
        return { connected: true, identity: session.identity || 'Pinata' };
      }
      return null;
    } catch {
      return null;
    }
  }

  get client() { return this._session; }
  get session() { return this._session; }
}
