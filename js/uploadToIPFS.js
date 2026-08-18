// uploadToIPFS.js — legacy compatibility wrapper for Lighthouse uploads.
// Prefer js/lighthouseStorage.js from new code.

import { uploadEncryptedSnapshot } from './lighthouseStorage.js';

export async function uploadDataToIPFS(data, client) {
  try {
    const { cid } = await uploadEncryptedSnapshot(data);
    return cid;
  } catch (err) {
    console.error('Lighthouse upload error:', err);
    return null;
  }
}