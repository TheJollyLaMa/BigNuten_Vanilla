// uploadToIPFS.js — compatibility wrapper for IPFS uploads.
// Prefer js/ipfsStorage.js from new code.

import { uploadIpfsSnapshot } from './ipfsStorage.js';

export async function uploadDataToIPFS(data, client) {
  try {
    const { cid } = await uploadIpfsSnapshot(data);
    return cid;
  } catch (err) {
    console.error('IPFS upload error:', err);
    return null;
  }
}