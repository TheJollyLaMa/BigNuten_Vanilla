import { validateFitnessSnapshot } from '../fitnessSchema.js';
import { StorageProvider, computeSnapshotHash, saveSnapshotMeta, loadSnapshotMeta } from '../storageProvider.js';
import { connectPinataSession, restorePinataSession, uploadPinnedSnapshot, uploadViaStorageRelay, uploadIpfsDesktopSnapshot, fetchSnapshotData, resolveSnapshotSigner } from '../pinataStorage.js';
import { loadSnapshotManifest, recordSnapshotUpload, withSnapshotTransaction } from '../snapshotLifecycle.js';

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
    const now = new Date().toISOString();
    let hash = null;
    let uploadedCid = null;
    this._reportBackupStatus({ state: 'pending' });
    try {
      if (!this._session) throw new Error('IPFS provider not connected. Call connect() first.');
      data = validateFitnessSnapshot(data);
      hash = await computeSnapshotHash(data);
      const manifest = loadSnapshotManifest();
      const previousSnapshot = manifest.current ? { ...manifest.current } : null;
      const signer = await resolveSnapshotSigner(this._session.signer);
      this._session.signer = signer;
      const upload = this._session.desktop
        ? uploadIpfsDesktopSnapshot
        : this._session.relay
          ? uploadViaStorageRelay
          : uploadPinnedSnapshot;
      const { cid } = await upload(data, {
        fileName: 'bignuten-snapshot.json',
        signer,
        ...(this._session.relay ? { wallet: this._session.wallet } : {}),
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
      const remoteData = await fetchSnapshotData(cid, { session: this._session, signer });
      const remoteHash = await computeSnapshotHash(validateFitnessSnapshot(remoteData));
      if (remoteHash !== hash) {
        throw new Error('Snapshot verification hash mismatch. Previous recovery pointer was not replaced.');
      }
      const lifecycle = withSnapshotTransaction(() => {
      const recorded = recordSnapshotUpload({
        cid,
        hash,
        timestamp: now,
        provider: this.id,
        source: 'ipfs-upload',
        sessionAddress: this._session.identity || 'IPFS',
        fileName: 'bignuten-snapshot.json',
        verified: true,
      });
      saveSnapshotMeta({ hash, cid, timestamp: now, provider: this.id, status: 'ok' });
      return recorded;
      });
      if (lifecycle.cleanupCandidates.length) {
        console.info('[IPFS] Cleanup queue updated:', lifecycle.cleanupCandidates.length);
      }
      this._syncSessionSnapshotContext(lifecycle.manifest);
      this._session.linkedSnapshotCid = cid;
      this._session.linkedSnapshotHash = hash;
      this._reportBackupStatus({ state: 'success', timestamp: now });
      return { cid, hash };
    } catch (err) {
      const meta = { hash, cid: uploadedCid, timestamp: now, provider: this.id, status: 'error', error: err.message };
      this._reportBackupStatus({ state: 'failure', error: err.message });
      try { saveSnapshotMeta(meta); } catch {}
      throw err;
    }
  }

  _reportBackupStatus(status) {
    this.backupStatus = status;
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bignuten:backup-status', { detail: status }));
    }
  }

  async get(ref) {
    return fetchSnapshotData(ref, { session: this._session, signer: this._session?.signer });
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
