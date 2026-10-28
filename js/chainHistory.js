// Adapted from DecentBusking's bounded ledgers and txHash/logIndex identities.
export function createChainHistory(storage = globalThis.localStorage) {
  const states = new Map();
  function read(scope) {
    const raw = storage.getItem(`bignutenChainHistory.v1:${scope}`);
    if (!raw) return { version: 1, cursor: -1, events: [] };
    const value = JSON.parse(raw);
    if (value.version !== 1 || !Number.isSafeInteger(value.cursor) || value.cursor < -1 || !Array.isArray(value.events) ||
        value.events.some(event => typeof event.id !== 'string' || !Number.isSafeInteger(event.blockNumber))) {
      throw new Error('Invalid saved chain history. Existing checkpoint was not replaced.');
    }
    return value;
  }
  async function scan({ scope, latestBlock, query, project, startBlock = 0, chunkSize = 10000, maxChunks = 10 }) {
    states.set(scope, { state: 'pending' });
    let saved;
    try {
      saved = read(scope);
      if (!Number.isSafeInteger(latestBlock) || latestBlock < 0 || !Number.isSafeInteger(startBlock) || startBlock < 0 ||
          !Number.isSafeInteger(chunkSize) || chunkSize < 1 || !Number.isSafeInteger(maxChunks) || maxChunks < 1) throw new Error('Invalid bounded history scan.');
      if (latestBlock < saved.cursor) throw new Error('RPC head is behind the saved checkpoint. Retry with a synchronized provider.');
      let from = saved.cursor < startBlock ? startBlock : Math.max(startBlock, saved.cursor - 12);
      for (let count = 0; count < maxChunks && from <= latestBlock; count++) {
        const to = Math.min(latestBlock, from + chunkSize - 1);
        const logs = await query(from, to);
        if (!Array.isArray(logs)) throw new Error('Invalid RPC history response.');
        const events = new Map(saved.events.map(event => [event.id, event]));
        for (const log of logs) {
          const txHash = log.transactionHash;
          const index = log.index ?? log.logIndex;
          if (!/^0x[0-9a-f]{64}$/i.test(txHash || '') || !Number.isSafeInteger(index) || index < 0 ||
              !Number.isSafeInteger(log.blockNumber) || log.blockNumber < from || log.blockNumber > to) throw new Error('RPC event lacks a stable transaction identity.');
          const id = `${txHash.toLowerCase()}:${index}`;
          if (log.removed) events.delete(id);
          else events.set(id, { ...project(log), id, txHash, logIndex: index, blockNumber: log.blockNumber });
        }
        const next = { version: 1, cursor: to, events: [...events.values()].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex) };
        storage.setItem(`bignutenChainHistory.v1:${scope}`, JSON.stringify(next));
        saved = next;
        from = to + 1;
      }
      const status = { state: saved.cursor >= latestBlock ? 'success' : 'pending', cursor: saved.cursor, latestBlock };
      states.set(scope, status);
      return { ...status, events: saved.events };
    } catch (error) {
      const status = { state: 'failure', error: error.message, cursor: saved?.cursor ?? null };
      states.set(scope, status);
      error.historyStatus = status;
      error.history = saved?.events || [];
      throw error;
    }
  }
  return { scan, read, status: scope => states.get(scope) || { state: 'idle' } };
}

export const chainHistory = createChainHistory();
