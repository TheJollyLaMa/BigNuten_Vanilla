import { validateFitnessSnapshot } from '../fitnessSchema.js';
import { StorageProvider, computeSnapshotHash, saveSnapshotMeta, loadSnapshotMeta } from '../storageProvider.js';
import { connectPinataSession, restorePinataSession, uploadPinnedSnapshot, uploadViaStorageRelay, uploadIpfsDesktopSnapshot, fetchSnapshotData } from '../pinataStorage.js';
import { loadSnapshotManifest, recordSnapshotUpload } from '../snapshotLifecycle.js';

export class PinataProvider extends StorageProvider {
  constructor() {
    super();
    this._session = null;
    this.backupStatus = { state: 'idle' };
  }

  get id() { return 'ipfs'; }
  get label() { return '🌐 IPFS Backup'; }

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

  async connect(mode = 'hosted') {
    try {
      const session = await connectPinataSession({ mode });
      if (session) {
        this._session = session;
        this._syncSessionSnapshotContext();
        window._ipfsSessionRef = session;
        return { connected: true, identity: session.identity || 'IPFS' };
      }
      return { connected: false, error: 'Connection cancelled or failed.' };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }

  async status() {
    if (this._session) {
      const manifest = loadSnapshotManifest();
      const pointer = manifest.current?.provider !== 'json-only' && manifest.current
        ? manifest.current
        : manifest.snapshots.find(m => m.provider && m.provider !== 'json-only') || null;
      const metas = loadSnapshotMeta().filter(m => m.provider && m.provider !== 'json-only' && m.status === 'ok');
      const lastBackup = pointer?.timestamp ?? metas[0]?.timestamp ?? null;
      return { connected: true, identity: this._session.identity || 'IPFS', lastBackup, backup: this.backupStatus };
    }
    return { connected: false };
  }

  async put(data) {
    if (!this._session) throw new Error('IPFS provider not connected. Call connect() first.');
    validateFitnessSnapshot(data);
    this.backupStatus = { state: 'pending' };
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
    let uploadedCid = null;
    try {
      const upload = this._session.desktop
        ? uploadIpfsDesktopSnapshot
        : this._session.relay
          ? uploadViaStorageRelay
          : uploadPinnedSnapshot;
      const { cid } = await upload(data, {
        fileName: 'bignuten-snapshot.json',
        ...(this._session.relay ? { wallet: this._session.wallet, signer: this._session.signer } : {}),
        snapshotMeta: {
          createdAt: now,
          sessionAddress: this._session.identity || 'IPFS',
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
      uploadedCid = cid;
      const remoteData = await fetchSnapshotData(cid, { session: this._session });
      const remoteHash = await computeSnapshotHash(remoteData);
      if (remoteHash !== hash) {
        throw new Error('Snapshot verification hash mismatch. Previous recovery pointer was not replaced.');
      }
      saveSnapshotMeta({ hash, cid, timestamp: now, provider: this.id, status: 'ok' });
      const lifecycle = recordSnapshotUpload({
        cid,
        hash,
        timestamp: now,
        provider: this.id,
        source: 'ipfs-upload',
        sessionAddress: this._session.identity || 'IPFS',
        fileName: 'bignuten-snapshot.json',
        verified: true,
      });
      if (lifecycle.cleanupCandidates.length) {
        console.info('[IPFS] Cleanup queue updated:', lifecycle.cleanupCandidates.length);
      }
      this._syncSessionSnapshotContext();
      this._session.linkedSnapshotCid = cid;
      this._session.linkedSnapshotHash = hash;
      this.backupStatus = { state: 'success', timestamp: now };
      return { cid, hash };
    } catch (err) {
      const meta = { hash, cid: uploadedCid, timestamp: now, provider: this.id, status: 'error', error: err.message };
      this.backupStatus = { state: 'failure', error: err.message };
      try { saveSnapshotMeta(meta); } catch {}
      throw err;
    }
  }

  async get(ref) {
    return fetchSnapshotData(ref, { session: this._session });
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
        window._ipfsSessionRef = session;
        return { connected: true, identity: session.identity || 'IPFS' };
      }
      return null;
    } catch (err) {
      console.warn('[IPFS] Session restore failed:', err);
      throw err;
    }
  }

  get client() { return this._session; }
  get session() { return this._session; }
}
