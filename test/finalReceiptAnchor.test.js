const { test } = require('node:test');
const assert = require('node:assert/strict');

async function fixture() {
  const api = await import('../js/streakResults.mjs');
  const hash = char => `0x${char.repeat(64)}`;
  const owner = `0x${'1'.repeat(40)}`;
  const escrow = `0x${'2'.repeat(40)}`;
  const cid = `bafkrei${'a'.repeat(52)}`;
  const competition = {
    id: 0, name: 'Local', stakeToken: owner, stakeAmount: '100', totalWeeks: 1,
    startTime: 1, endTime: 2, metadataCID: '', status: 'active',
  };
  const manifest = await api.createPublicResultDocument({
    chainId: 31337, contractAddress: escrow, competition,
    observedBlock: { number: 10, hash: hash('a'), timestamp: 100 },
  });
  const settlement = {
    winnerCount: 0, potDistributed: '0', leaderboardCID: 'manifestCID',
    blockNumber: 11, blockHash: hash('b'), timestamp: 101, transactionHash: hash('c'), logIndex: 0,
  };
  const receipt = await api.createPublicResultDocument({
    chainId: 31337, contractAddress: escrow, competition: { ...competition, status: 'settled' },
    observedBlock: { number: 11, hash: hash('b'), timestamp: 101 }, settlement,
    manifest: { cid: 'manifestCID', contentHash: manifest.contentHash },
  });
  const chainResult = { chainId: 31337, document: receipt, settlementCID: 'manifestCID', settlementEvent: settlement, awardMints: [] };
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  let anchor = { cid: '' };
  let uploads = 0, sends = 0, readFailures = 0, sendFailures = 0, pending = false;
  const states = [];
  const provider = {
    send: async method => method === 'eth_chainId' ? '0x7a69' : [owner],
    getBlock: async number => number === 10 ? { hash: hash('a'), timestamp: 100 } : { hash: hash('b'), timestamp: 101 },
    getTransactionReceipt: async () => pending ? null : { status: 1, blockHash: hash('d') },
  };
  const contract = {
    finalReceiptAnchorVersion: async () => 1,
    finalReceiptAnchors: async () => anchor,
    owner: async () => owner,
    filters: { FinalReceiptAnchored: () => ({}) },
    queryFilter: async () => [{ args: { ...anchor, manifestCID: 'manifestCID' }, blockHash: hash('d'), transactionHash: hash('e'), index: 3 }],
    connect() { return this; },
    anchorFinalReceipt: async (_id, newCID, receiptHash, manifestHash) => {
      sends++;
      if (sendFailures-- > 0) throw new Error('Signature rejected');
      return {
        hash: hash('e'),
        wait: async () => {
          if (pending) throw new Error('RPC disconnected after broadcast');
          anchor = { cid: newCID, receiptHash, manifestHash };
          return { status: 1 };
        },
      };
    },
  };
  const args = {
    ethers: {}, provider, contract, signer: { getAddress: async () => owner }, compId: 0,
    receipt, manifest, chainResult, storage, consentConfirmed: true,
    uploader: async () => { uploads++; return { cid }; },
    readDocument: async () => {
      if (readFailures-- > 0) throw new Error('Gateway unavailable');
      return receipt;
    },
    onState: state => states.push(state),
  };
  return {
    api, args, states, cid, values,
    counts: () => ({ uploads, sends }),
    failRead: () => { readFailures = 1; }, failSend: () => { sendFailures = 1; },
    setPending: value => { pending = value; }, setAnchor: value => { anchor = value; },
  };
}

test('legacy capability is a release blocker before upload/signature', async () => {
  const f = await fixture();
  f.args.contract.finalReceiptAnchorVersion = async () => { throw new Error('unknown selector'); };
  await assert.rejects(f.api.publishAndAnchorReceipt(f.args), /RELEASE BLOCKER/);
  assert.deepEqual(f.counts(), { uploads: 0, sends: 0 });
});

test('strict CID format and lossless CIDv0 normalization without upload', async () => {
  const { api, cid } = await fixture();
  assert.equal(api.validAnchorCID(cid), true);
  assert.equal(api.validAnchorCID(`${cid}/path`), false);
  const { ethers } = require('ethers');
  const v0 = ethers.encodeBase58(ethers.concat(['0x1220', ethers.sha256(ethers.toUtf8Bytes('local document'))]));
  assert.match(api.normalizeAnchorCID(v0), /^bafybei[a-z2-7]{52}$/);
  assert.equal(api.normalizeAnchorCID(api.normalizeAnchorCID(v0)), api.normalizeAnchorCID(v0));
  assert.throws(() => api.normalizeAnchorCID('QmInvalid'), /Unsupported/);
});

test('publication/readback failure and signature failure retain one upload for retry', async () => {
  const f = await fixture();
  f.failRead();
  await assert.rejects(f.api.publishAndAnchorReceipt(f.args), /Gateway/);
  assert.equal(f.counts().uploads, 1);
  f.failSend();
  await assert.rejects(f.api.publishAndAnchorReceipt(f.args), /Signature/);
  assert.equal(f.counts().uploads, 1);
  const result = await f.api.publishAndAnchorReceipt(f.args);
  assert.equal(result.state, 'anchor-verified');
  assert.equal(f.counts().uploads, 1);
  assert.ok(f.states.includes('published-unanchored'));
  assert.ok(f.states.includes('anchoring-pending'));
  assert.ok(f.states.includes('anchor-verified'));
  await f.api.publishAndAnchorReceipt(f.args);
  assert.deepEqual(f.counts(), { uploads: 1, sends: 2 });
});

test('pending broadcast never requests duplicate anchor or upload', async () => {
  const f = await fixture();
  f.setPending(true);
  await assert.rejects(f.api.publishAndAnchorReceipt(f.args), /disconnected/);
  const recovered = await f.api.publishAndAnchorReceipt(f.args);
  assert.equal(recovered.state, 'anchoring-pending');
  assert.deepEqual(f.counts(), { uploads: 1, sends: 1 });
});

test('confirmed revert permits safe retry with the same publication', async () => {
  const f = await fixture();
  const send = f.args.contract.anchorFinalReceipt;
  f.args.contract.anchorFinalReceipt = async () => ({
    hash: `0x${'e'.repeat(64)}`, wait: async () => ({ status: 0 }),
  });
  await assert.rejects(f.api.publishAndAnchorReceipt(f.args), /reverted/);
  const getReceipt = f.args.provider.getTransactionReceipt;
  let oldReceipt = true;
  f.args.provider.getTransactionReceipt = async () => oldReceipt ? { status: 0 } : getReceipt();
  f.args.contract.anchorFinalReceipt = async (...args) => {
    oldReceipt = false;
    return send(...args);
  };
  assert.equal((await f.api.publishAndAnchorReceipt(f.args)).state, 'anchor-verified');
  assert.equal(f.counts().uploads, 1);
  assert.ok(f.states.includes('anchor-reverted'));
});

test('network change during upload preserves CID but prevents anchor signature', async () => {
  const f = await fixture();
  const readNetwork = f.args.provider.send;
  const upload = f.args.uploader;
  f.args.uploader = async document => {
    const result = await upload(document);
    f.args.provider.send = async method => method === 'eth_chainId' ? '0x2105' : [];
    return result;
  };
  await assert.rejects(f.api.publishAndAnchorReceipt(f.args), /Wallet\/network changed/);
  assert.deepEqual(f.counts(), { uploads: 1, sends: 0 });
  f.args.provider.send = readNetwork;
  assert.equal((await f.api.publishAndAnchorReceipt(f.args)).state, 'anchor-verified');
  assert.deepEqual(f.counts(), { uploads: 1, sends: 1 });
});

test('a valid canonical hash does not make a forged settlement true', async () => {
  const f = await fixture();
  const receipt = f.args.receipt;
  const forged = await f.api.createPublicResultDocument({
    chainId: receipt.chainId, contractAddress: receipt.escrow, competition: receipt.competition,
    observedBlock: { number: receipt.observedAt.blockNumber, hash: receipt.observedAt.blockHash, timestamp: receipt.observedAt.timestamp },
    settlement: { ...receipt.settlement, transactionHash: `0x${'f'.repeat(64)}` },
    manifest: receipt.manifest,
  });
  await f.api.verifyPublicResultDocument(forged);
  await assert.rejects(f.api.verifyFinalReceiptAgainstChain({
    ...f.args, receipt: forged, manifestCID: receipt.manifest.cid,
  }), /settlement mismatch/);
});

test('wallet/network and content/manifest/event mismatch fail closed', async () => {
  for (const change of [
    args => { args.provider.send = async method => method === 'eth_chainId' ? '0x2105' : []; },
    args => { args.signer.getAddress = async () => `0x${'9'.repeat(40)}`; },
    args => { args.receipt.manifest.contentHash = `0x${'f'.repeat(64)}`; },
    args => { args.chainResult.document = { ...args.receipt, participants: [{ wallet: 'forged' }] }; },
  ]) {
    const f = await fixture();
    change(f.args);
    await assert.rejects(f.api.publishAndAnchorReceipt(f.args));
    assert.deepEqual(f.counts(), { uploads: 0, sends: 0 });
  }
  const f = await fixture();
  f.setAnchor({ cid: f.cid, receiptHash: `0x${'f'.repeat(64)}`, manifestHash: f.args.manifest.contentHash });
  await assert.rejects(f.api.publishAndAnchorReceipt(f.args), /anchor CID\/hash mismatch/);
  assert.equal(f.counts().sends, 0);
});
