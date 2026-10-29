// uploadToIPFS.js — compatibility wrapper for IPFS uploads.
// Fitness snapshots are encrypted by the transport before any remote request.
import { uploadIpfsSnapshot } from './ipfsStorage.js';

export async function uploadDataToIPFS(data, client) {
  try {
    const { cid } = await uploadIpfsSnapshot(data, { signer: client?.signer || null });
    return cid;
  } catch {
    return null;
  }
}
