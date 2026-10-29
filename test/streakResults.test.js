'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const address = number => `0x${String(number).padStart(40, '0')}`;
const hash = char => `0x${char.repeat(64)}`;
const escrow = address(100);
const participant = address(200);
const txHash = hash('a');
const blockHash = hash('b');

const competition = {
  id: 7,
  name: 'Local test competition',
  stakeToken: address(300),
  stakeAmount: '1000000',
  totalWeeks: 4,
  startTime: 1700000000,
  endTime: 1701000000,
  metadataCID: 'QmCompetition',
  status: 'active',
};

const eventRef = {
  transactionHash: txHash,
  blockHash,
  blockNumber: 40,
  timestamp: 1701000001,
  logIndex: 2,
};

async function buildDocument() {
  const { createPublicResultDocument } = await import('../js/streakResults.mjs');
  return createPublicResultDocument({
    chainId: 31337,
    contractAddress: escrow,
    competition,
    observedBlock: { number: 44, hash: hash('c'), timestamp: 1701000005 },
    actions: [{
      ...eventRef,
      wallet: participant,
      type: 'report',
      week: 1,
      proofCID: 'QmPrivateProof',
      activityDays: 99,
      notes: 'private note',
    }],
  });
}

test('public result payload is deterministic, privacy-minimized, and hash-verifiable', async () => {
  const { canonicalResultJson, verifyPublicResultDocument } = await import('../js/streakResults.mjs');
  const first = await buildDocument();
  const second = await buildDocument();
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(canonicalResultJson(first), canonicalResultJson(second));
  assert.deepEqual(Object.keys(first.participants[0].actions[0]).sort(), [
    'blockHash', 'blockNumber', 'logIndex', 'timestamp', 'transactionHash', 'type', 'week',
  ]);
  assert.equal(JSON.stringify(first).includes('QmPrivateProof'), false);
  assert.equal(JSON.stringify(first).includes('private note'), false);
  await verifyPublicResultDocument(first, { chainId: 31337, contractAddress: escrow, competitionId: 7 });
  const nativeStake = await (await import('../js/streakResults.mjs')).createPublicResultDocument({
    chainId: 31337,
    contractAddress: escrow,
    competition: { ...competition, stakeToken: '0x0000000000000000000000000000000000000000' },
    observedBlock: { number: 44, hash: hash('c'), timestamp: 1701000005 },
  });
  assert.equal(nativeStake.competition.stakeToken, '0x0000000000000000000000000000000000000000');

  const tampered = structuredClone(first);
  tampered.participants[0].actions[0].week = 2;
  await assert.rejects(verifyPublicResultDocument(tampered), /canonically normalized|content hash/);
});

test('settlement prerequisite guards reject wrong role, chain, code, pause, timing, history, and awards', async () => {
  const { assertSettlementPrerequisites, currentChallengeConfigMatchesRecord } = await import('../js/streakResults.mjs');
  const valid = {
    chainId: 31337,
    expectedChainId: 31337,
    account: address(1),
    owner: address(1),
    escrowAddress: escrow,
    escrowCode: '0x6000',
    paused: false,
    status: 0,
    endTime: 100,
    now: 101,
    historyComplete: true,
    awardsReady: true,
  };
  assert.equal(assertSettlementPrerequisites(valid), true);
  assert.equal(assertSettlementPrerequisites({ ...valid, now: 100 }), true, 'settlement is allowed when block time reaches the contract end time');
  for (const [change, message] of [
    [{ account: address(2) }, /owner/],
    [{ chainId: 1 }, /network/],
    [{ escrowCode: '0x' }, /code/],
    [{ paused: true }, /paused/],
    [{ status: 1 }, /active/],
    [{ now: 99 }, /end time/],
    [{ historyComplete: false }, /history/],
    [{ awardsReady: false }, /achievement/],
  ]) assert.throws(() => assertSettlementPrerequisites({ ...valid, ...change }), message);

  const record = {
    ready: true,
    awardAddress: address(5),
    awardTokenIds: { completion: '10', first: '11', second: '12', third: '13' },
  };
  const currentConfig = {
    awardRecord: record,
    awardAddress: address(5),
    awardTokenIds: record.awardTokenIds,
    competitionStakeToken: address(6),
    challengeStakeToken: address(6),
  };
  assert.equal(currentChallengeConfigMatchesRecord(currentConfig), true);
  assert.equal(currentChallengeConfigMatchesRecord({
    ...currentConfig,
    awardTokenIds: { ...record.awardTokenIds, third: '14' },
  }), false, 'a changed global award range must block a historical competition');
  assert.equal(currentChallengeConfigMatchesRecord({
    ...currentConfig,
    challengeStakeToken: address(7),
  }), false, 'a changed global stake asset must block a historical competition');
  assert.equal(currentChallengeConfigMatchesRecord({
    ...currentConfig,
    awardRecord: { ...record, ready: false },
  }), false, 'missing local crosslinks remain unavailable rather than verified');
});

test('publication requires explicit consent and a valid uploader result', async () => {
  const { requirePublicationConsent } = await import('../js/streakResults.mjs');
  const document = await buildDocument();
  let uploads = 0;
  const uploader = async () => { uploads += 1; return { cid: 'bafyLocalDraft' }; };
  await assert.rejects(requirePublicationConsent(document, false, uploader), /explicit public-field consent/);
  assert.equal(uploads, 0);
  await assert.rejects(requirePublicationConsent(document, true, async () => ({ cid: 'not a cid' })), /valid result CID/);
  assert.equal((await requirePublicationConsent(document, true, uploader)).state, 'uploaded-unlinked');
  assert.equal(uploads, 1);
});

test('manifest CID, chain timestamp, and settlement receipt links are strict', async () => {
  const { ethers } = require('ethers');
  const {
    RESULT_EVENT_ABI,
    assertManifestLink,
    assertSettlementReceiptMatchesChain,
    verifyEventTimestamp,
    verifySettlementReceipt,
  } = await import('../js/streakResults.mjs');
  assert.equal(assertManifestLink('bafyResult1', 'bafyResult1'), true);
  assert.throws(() => assertManifestLink('bafyResult1', 'bafyResult2'), /does not link/);
  const provider = { getBlock: async () => ({ hash: blockHash, timestamp: 1701000001 }) };
  assert.equal(await verifyEventTimestamp(provider, { blockNumber: 40, blockHash, timestamp: 1701000001 }), true);
  await assert.rejects(verifyEventTimestamp(provider, { blockNumber: 40, blockHash: hash('d'), timestamp: 1701000001 }), /hash mismatch/);
  await assert.rejects(verifyEventTimestamp(provider, { blockNumber: 40, blockHash, timestamp: 1701000002 }), /timestamp mismatch/);

  const iface = new ethers.Interface(RESULT_EVENT_ABI);
  const event = iface.encodeEventLog(iface.getEvent('CompetitionSettled'), [7n, 2n, 100n, 'bafyResult1']);
  const receipt = {
    status: 1,
    hash: txHash,
    blockNumber: 40,
    blockHash,
    logs: [{
      address: escrow,
      ...event,
      transactionHash: txHash,
      blockNumber: 40,
      blockHash,
      index: 3,
    }],
  };
  const settlementReceipt = verifySettlementReceipt({ ethers, escrowAddress: escrow, compId: 7, receipt, cid: 'bafyResult1' });
  assert.equal(settlementReceipt.leaderboardCID, 'bafyResult1');
  assert.equal(assertSettlementReceiptMatchesChain(settlementReceipt, {
    settlementEvent: {
      transactionHash: txHash,
      blockNumber: 40,
      blockHash,
      logIndex: 3,
      winnerCount: 2,
      potDistributed: '100',
      leaderboardCID: 'bafyResult1',
    },
  }), true);
  assert.throws(() => assertSettlementReceiptMatchesChain(settlementReceipt, {
    settlementEvent: { transactionHash: hash('e') },
  }), /do not match/);
  assert.throws(() => verifySettlementReceipt({ ethers, escrowAddress: escrow, compId: 7, receipt: { ...receipt, status: 0 }, cid: 'bafyResult1' }), /did not confirm/);
  assert.throws(() => verifySettlementReceipt({ ethers, escrowAddress: escrow, compId: 7, receipt, cid: 'bafyOther' }), /does not link/);
});

test('pre-settlement manifest links only when its hash, snapshot block, and actions match chain history', async () => {
  const { createPublicResultDocument, verifyManifestAgainstChain } = await import('../js/streakResults.mjs');
  const observedBlock = { number: 44, hash: hash('c'), timestamp: 1701000005 };
  const action = {
    ...eventRef,
    wallet: participant,
    type: 'joined',
    amount: '1000000',
  };
  const manifest = await createPublicResultDocument({
    chainId: 31337,
    contractAddress: escrow,
    competition,
    observedBlock,
    actions: [action],
  });
  const settlementEvent = {
    ...eventRef,
    transactionHash: hash('d'),
    blockHash: hash('e'),
    blockNumber: 45,
    timestamp: 1701000006,
    logIndex: 1,
    winnerCount: 0,
    potDistributed: '1000000',
    leaderboardCID: 'bafyResult1',
  };
  const chainDocument = await createPublicResultDocument({
    chainId: 31337,
    contractAddress: escrow,
    competition: { ...competition, status: 'settled' },
    observedBlock: { number: 46, hash: hash('f'), timestamp: 1701000007 },
    actions: [action],
    settlement: settlementEvent,
    manifest: { cid: 'bafyResult1', contentHash: manifest.contentHash },
  });
  const chainResult = {
    chainId: 31337,
    settlementCID: 'bafyResult1',
    settlementEvent,
    document: chainDocument,
    awardMints: [],
  };
  const provider = {
    getBlock: async number => number === 44
      ? { hash: hash('c'), timestamp: 1701000005 }
      : { hash: hash('b'), timestamp: 1701000001 },
  };
  assert.equal(await verifyManifestAgainstChain({
    manifest,
    chainResult,
    provider,
    manifestCID: 'bafyResult1',
  }), true);
  const changedAction = await createPublicResultDocument({
    chainId: 31337,
    contractAddress: escrow,
    competition,
    observedBlock,
    actions: [{ ...action, amount: '2000000' }],
  });
  await assert.rejects(verifyManifestAgainstChain({
    manifest: changedAction,
    chainResult,
    provider,
    manifestCID: 'bafyResult1',
  }), /participant actions do not match/);
});

test('achievement token URI links are accepted only when read from the NFT contract at snapshot block', async () => {
  const { createPublicResultDocument, verifyManifestAgainstChain } = await import('../js/streakResults.mjs');
  const nftAddress = address(400);
  const awardLinks = [{
    role: 'completion',
    tokenId: '900',
    nftAddress,
    metadataCID: 'ipfs://bafyMetadata',
  }];
  const manifest = await createPublicResultDocument({
    chainId: 31337,
    contractAddress: escrow,
    competition,
    observedBlock: { number: 44, hash: hash('c'), timestamp: 1701000005 },
    awardLinks,
  });
  const settlementEvent = {
    ...eventRef,
    transactionHash: hash('d'),
    blockHash: hash('e'),
    blockNumber: 45,
    timestamp: 1701000006,
    logIndex: 1,
    winnerCount: 0,
    potDistributed: '1000000',
    leaderboardCID: 'bafyResult1',
  };
  const chainDocument = await createPublicResultDocument({
    chainId: 31337,
    contractAddress: escrow,
    competition: { ...competition, status: 'settled' },
    observedBlock: { number: 46, hash: hash('f'), timestamp: 1701000007 },
    settlement: settlementEvent,
    awardLinks,
  });
  const chainResult = {
    chainId: 31337,
    settlementCID: 'bafyResult1',
    settlementEvent,
    document: chainDocument,
    awardMints: [],
  };
  const provider = {
    getBlock: async () => ({ hash: hash('c'), timestamp: 1701000005 }),
  };
  const ethersForURI = uri => ({
    Contract: class {
      async uri(_tokenId, options) {
        assert.equal(options.blockTag, 44);
        return uri;
      }
    },
  });
  assert.equal(await verifyManifestAgainstChain({
    ethers: ethersForURI('ipfs://bafyMetadata'),
    manifest,
    chainResult,
    provider,
    manifestCID: 'bafyResult1',
  }), true);
  await assert.rejects(verifyManifestAgainstChain({
    ethers: ethersForURI('ipfs://bafyOther'),
    manifest,
    chainResult,
    provider,
    manifestCID: 'bafyResult1',
  }), /token URIs do not match/);
});

test('achievement mint roles and recipients crosslink to confirmed payouts', async () => {
  const { verifyAwardMintsAgainstPayouts } = await import('../js/streakResults.mjs');
  const nft = address(400);
  const roles = ['completion', 'first', 'second', 'third'];
  const links = roles.map((role, index) => ({
    role,
    tokenId: String(800 + index),
    nftAddress: nft,
    metadataCID: `ipfs://bafy${index}`,
  }));
  const payout = { type: 'payout', wallet: participant, place: 1 };
  const awards = ['completion', 'first'].map(role => {
    const link = links.find(item => item.role === role);
    return {
      role,
      tokenId: link.tokenId,
      nftAddress: nft,
      account: participant,
      minter: escrow,
      amount: '1',
    };
  });
  assert.equal(verifyAwardMintsAgainstPayouts({ awards, actions: [payout], awardLinks: links, escrowAddress: escrow }), true);
  assert.throws(() => verifyAwardMintsAgainstPayouts({
    awards: awards.map(award => ({ ...award, account: address(201) })),
    actions: [payout],
    awardLinks: links,
    escrowAddress: escrow,
  }), /does not match payout recipient/);
});
