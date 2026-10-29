import { clearLocalHealthData } from './snapshotRecovery.js';
import { clearManualPinataToken, clearSnapshotEncryptionKeyCache } from './ipfsStorage.js';

// Compose above the transport/recovery layers to avoid circular imports.
export function clearAllLocalData(storage = globalThis.localStorage) {
  try {
    clearLocalHealthData(storage);
  } finally {
    clearSnapshotEncryptionKeyCache();
    clearManualPinataToken();
  }
}
