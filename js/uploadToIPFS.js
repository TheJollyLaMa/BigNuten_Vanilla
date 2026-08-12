// uploadToIPFS.js — W3up/Storacha upload implementation.
// Used exclusively by js/providers/w3upProvider.js — do not call directly from business logic.

import { computeSnapshotHash } from './storageProvider.js';

export async function uploadDataToIPFS(data, client) {
  try {
    if (!client) {
      console.error("Client not provided.");
      return null;
    }

    const historyKey = 'snapshotHistory';
    // Retrieve existing snapshot history from localStorage
    const storedHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');
    // Embed snapshot chain so each snapshot is self-describing
    const payload = {
      ...data,
      snapshotHistory: storedHistory.map(entry => ({ cid: entry.cid, timestamp: entry.timestamp })),
    };

    // Content-address the canonical payload before uploading
    const hash = await computeSnapshotHash(payload);

    // Create the blob and upload
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const cid = await client.uploadFile(blob);

    const now = new Date().toISOString();
    const snapshotEntry = {
      cid: cid.toString(),
      hash,
      data: payload,
    };
    localStorage.setItem(`fitnessTrackerSnapshot-${now}`, JSON.stringify(snapshotEntry));

    const newEntry = { timestamp: now, cid: cid.toString(), hash };
    storedHistory.unshift(newEntry);
    localStorage.setItem(historyKey, JSON.stringify(storedHistory));

    return cid.toString();
  } catch (err) {
    console.error("IPFS Upload Error:", err);
    return null;
  }
}