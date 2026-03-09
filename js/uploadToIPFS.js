// uploadToIPFS.js — browser-compatible version using window.w3up

export async function uploadDataToIPFS(data, client) {
  try {
    if (!client) {
      console.error("Client not provided.");
      return null;
    }

    const historyKey = 'snapshotHistory';
    // Retrieve existing snapshot history from localStorage
    const storedHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');
    // Get previous snapshot's CID (the most recent in history, if any)
    const previousCid = storedHistory.length > 0 ? storedHistory[0].cid : null;
    // Add snapshotHistory to the data (array of {cid, timestamp}, most recent first)
    data.snapshotHistory = storedHistory.map(entry => ({ cid: entry.cid, timestamp: entry.timestamp }));

    // Create the blob after modifying the data
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const cid = await client.uploadFile(blob);

    const now = new Date().toISOString();
    const snapshotEntry = {
      cid: cid.toString(),
      data,
      snapshotHistory: [...storedHistory.map(h => ({ cid: h.cid, timestamp: h.timestamp }))]
    };
    localStorage.setItem(`fitnessTrackerSnapshot-${now}`, JSON.stringify(snapshotEntry));

    const newEntry = { timestamp: now, cid: cid.toString() };
    storedHistory.unshift(newEntry);
    localStorage.setItem(historyKey, JSON.stringify(storedHistory));

    return cid.toString();
  } catch (err) {
    console.error("IPFS Upload Error:", err);
    return null;
  }
}