import { getStorageMode, openBackupControls } from './dataControl.js';
import { providerRegistry } from './storageProvider.js';

const PRIVACY_NOTICE = 'Synthetic data only: health backups are not encrypted. Connection is not backup verification.';

export function createBigNutenIPFSHost({ returnFocus } = {}) {
  if (returnFocus !== undefined && typeof returnFocus !== 'function') {
    throw new Error('BigNuten IPFS host requires a function for returnFocus.');
  }
  let backupStatus = null;
  async function readConnection() {
    backupStatus = null;
    if (getStorageMode() !== 'ipfs') return false;
    const provider = providerRegistry.get('ipfs');
    if (!provider || typeof provider.status !== 'function') {
      throw new Error('BigNuten IPFS provider is not available.');
    }
    const status = await provider.status();
    if (!status || typeof status.connected !== 'boolean') {
      throw new Error('BigNuten IPFS provider returned an invalid connection status.');
    }
    if (status.error) throw new Error(status.error);
    backupStatus = status.backup || null;
    return status.connected;
  }

  return {
    version: 1,
    label: 'BigNuten backup controls (synthetic validation)',
    capabilities: {
      backup: {
        async open() {
          openBackupControls({ connected: await readConnection(), returnFocus });
        },
      },
    },
    async getStatus() {
      const connected = await readConnection();
      return {
        backup: {
          state: !connected ? 'idle' : backupStatus?.state === 'pending' ? 'pending' : backupStatus?.state === 'failure' ? 'error' : 'ready',
          detail: `${backupStatus?.state === 'pending' ? 'Snapshot upload/verification pending. ' : backupStatus?.state === 'failure' ? 'Snapshot backup failed; previous recovery point retained. ' : ''}${connected ? 'Provider connected; open snapshot controls.' : 'Local browser data; open backup options.'} ${PRIVACY_NOTICE}`,
        },
      };
    },
  };
}
