import { createChainHistory } from './chainHistory.js';

export const RESULT_SCHEMA = 'bignuten-competition-result/v1';

export const RESULT_EVENT_ABI = [
  'event CompetitionSettled(uint256 indexed compId,uint256 winnerCount,uint256 potDistributed,string leaderboardCID)',
  'event CompetitionCancelled(uint256 indexed compId)',
  'event EntrantJoined(uint256 indexed compId,address indexed entrant,uint256 amount)',
  'event WeeklyReport(uint256 indexed compId,address indexed entrant,uint256 week,string proofCID)',
  'event EntrantForfeited(uint256 indexed compId,address indexed entrant)',
  'event EntrantCompleted(uint256 indexed compId,address indexed entrant)',
  'event WinningsDistributed(uint256 indexed compId,address indexed winner,uint256 amount)',
  'event StreakPayout(uint256 indexed compId,address indexed entrant,uint8 place,uint256 baseRefund,uint256 bonus,uint256 totalPayout)',
  'event MeetupSelfCheckedIn(uint256 indexed compId,uint8 indexed meetupIndex,address indexed entrant,uint8 totalActivityDays,bytes32 progressHash)',
  'event MeetupPeerDecision(uint256 indexed compId,uint8 indexed meetupIndex,address indexed entrant,address peer,bool approved)',
  'event MeetupReviewerInvited(uint256 indexed compId,uint8 indexed meetupIndex,address indexed entrant,address reviewer)',
  'event MonthlyChallengeCompleted(uint256 indexed compId,address indexed entrant,uint8 activityDays,uint8 verifiedMeetups)',
];

export const AWARD_EVENT_ABI = [
  'event EditionMinted(uint256 indexed tokenId,address indexed to,uint256 amount,address indexed minter)',
];

const SETTLEMENT_CONTROL_ABI = [
  'function owner() view returns (address)',
  'function paused() view returns (bool)',
  'function getCompetition(uint256) view returns (tuple(string name,address stakeToken,uint256 stakeAmount,uint256 totalWeeks,uint256 startTime,uint256 endTime,uint256 joinDeadline,bool yieldEnabled,bool potDeployed,string metadataCID,uint8 status,uint256 potBalance,uint256 entrantCount,uint256 winnerCount))',
  'function getStreakChallenge(uint256) view returns (bool enabled,string habitType,string meetupGoal,uint8 requiredActivityDays,uint8 requiredMeetups,uint8 minimumWeeklyLogs,uint16 dailyGoal)',
  'function challengeStakeToken() view returns (address)',
  'function challengeTreasury() view returns (address)',
  'function streakAwardNFT() view returns (address)',
  'function settleCompetition(uint256,string)',
];

const ADDRESS = /^0x[0-9a-f]{40}$/i;
const HASH = /^0x[0-9a-f]{64}$/i;
export const RECEIPT_ANCHOR_ABI = [
  'function finalReceiptAnchorVersion() view returns (uint8)',
  'function finalReceiptAnchors(uint256) view returns (string cid,bytes32 receiptHash,bytes32 manifestHash)',
  'function anchorFinalReceipt(uint256,string,bytes32,bytes32)',
  'function owner() view returns (address)',
  'event FinalReceiptAnchored(uint256 indexed compId,string cid,bytes32 receiptHash,bytes32 manifestCIDHash,bytes32 manifestHash)',
];

export async function requireReceiptAnchorCapability(contract) {
  let version;
  try { version = Number(await contract.finalReceiptAnchorVersion()); } catch { /* Legacy deployment. */ }
  if (version !== 1) throw new Error('RELEASE BLOCKER — final receipt anchoring is unavailable on this deployment (including existing Base); source capability v1 requires an approved new deployment.');
}

export function validAnchorCID(cid) {
  return /^baf(?:ybei|krei)[a-h][a-z2-7]{50}[aeimquy4]$/.test(String(cid));
}

export function normalizeAnchorCID(cid) {
  if (validAnchorCID(cid)) return cid;
  if (!/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(String(cid))) throw new Error('Unsupported receipt CID; expected CIDv0 sha2-256 or CIDv1 base32 dag-pb/raw sha2-256.');
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = 0n;
  for (const char of cid) value = value * 58n + BigInt(alphabet.indexOf(char));
  const bytes = [];
  while (value > 0n) { bytes.unshift(Number(value & 255n)); value >>= 8n; }
  if (bytes.length !== 34 || bytes[0] !== 0x12 || bytes[1] !== 0x20) throw new Error('Invalid CIDv0 multihash.');
  let bits = 0;
  let buffer = 0;
  let encoded = 'b';
  for (const byte of [1, 0x70, ...bytes]) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) { bits -= 5; encoded += 'abcdefghijklmnopqrstuvwxyz234567'[(buffer >>> bits) & 31]; }
  }
  if (bits) encoded += 'abcdefghijklmnopqrstuvwxyz234567'[(buffer << (5 - bits)) & 31];
  if (!validAnchorCID(encoded)) throw new Error('Invalid normalized CID.');
  return encoded;
}

export async function verifyFinalReceiptAgainstChain({ ethers, provider, receipt, manifest, chainResult, manifestCID }) {
  await verifyPublicResultDocument(receipt, {
    chainId: chainResult.chainId, contractAddress: chainResult.document.escrow,
    competitionId: chainResult.document.competition.id, manifestCID,
  });
  if (!receipt.settlement || receipt.competition.status !== 'settled') throw new Error('A confirmed post-settlement receipt is required.');
  if (receipt.manifest?.contentHash !== manifest.contentHash) throw new Error('Receipt manifest hash mismatch.');
  await verifyManifestAgainstChain({ ethers, provider, manifest, chainResult, manifestCID });
  for (const field of ['competition', 'participants', 'settlement', 'awards', 'awardLinks']) {
    if (canonicalResultJson(receipt[field]) !== canonicalResultJson(chainResult.document[field])) {
      throw new Error(`Receipt ${field} mismatch against confirmed chain events.`);
    }
  }
  await verifyEventTimestamp(provider, {
    blockNumber: receipt.observedAt.blockNumber, blockHash: receipt.observedAt.blockHash,
    timestamp: receipt.observedAt.timestamp,
  });
  if (receipt.observedAt.blockNumber < receipt.settlement.blockNumber) throw new Error('Receipt predates settlement.');
  return true;
}

export async function verifyReceiptAnchor({ ethers, provider, contract, compId, receipt, manifest, chainResult, cid }) {
  await requireReceiptAnchorCapability(contract);
  const anchor = await contract.finalReceiptAnchors(compId);
  if (!anchor.cid) return { state: 'published-unanchored' };
  if (anchor.cid !== cid || anchor.receiptHash !== receipt.contentHash || anchor.manifestHash !== manifest.contentHash) {
    throw new Error('Immutable anchor CID/hash mismatch; replacement is not permitted.');
  }
  await verifyFinalReceiptAgainstChain({ ethers, provider, receipt, manifest, chainResult, manifestCID: receipt.manifest.cid });
  const logs = await contract.queryFilter(contract.filters.FinalReceiptAnchored(compId), 0);
  if (logs.length !== 1) throw new Error('Anchor event missing or duplicated.');
  const event = logs[0];
  if (event.args.cid !== cid || event.args.receiptHash !== receipt.contentHash ||
      event.args.manifestHash !== manifest.contentHash ||
      event.args.manifestCIDHash !== ethers.keccak256(ethers.toUtf8Bytes(receipt.manifest.cid))) {
    throw new Error('Anchor event/readback mismatch.');
  }
  const tx = await provider.getTransactionReceipt(event.transactionHash);
  if (Number(tx?.status) !== 1 || tx.blockHash !== event.blockHash) throw new Error('Anchor transaction is not confirmed on this chain.');
  return { state: 'anchor-verified', transactionHash: event.transactionHash, logIndex: event.index ?? event.logIndex };
}

export async function publishAndAnchorReceipt({
  ethers, provider, contract, signer, compId, receipt, manifest, chainResult,
  uploader, readDocument, storage, consentConfirmed, onState = () => {},
}) {
  await requireReceiptAnchorCapability(contract);
  const key = `bignuten-final-receipt:${receipt.chainId}:${receipt.escrow}:${compId}`;
  let saved = JSON.parse(storage.getItem(key) || 'null');
  if (saved && saved.contentHash !== receipt.contentHash) throw new Error('A different receipt publication is already saved; recover it before creating another.');
  const save = () => storage.setItem(key, JSON.stringify(saved));
  const identity = async () => {
    const chain = Number(await provider.send('eth_chainId', []));
    const accounts = await provider.send('eth_accounts', []);
    const account = String(await signer.getAddress()).toLowerCase();
    if (chain !== receipt.chainId || String(accounts[0]).toLowerCase() !== account ||
        account !== String(await contract.owner()).toLowerCase()) {
      throw new Error('Wallet/network changed or current wallet is not the on-chain owner.');
    }
  };
  await identity();
  await verifyFinalReceiptAgainstChain({ ethers, provider, receipt, manifest, chainResult, manifestCID: receipt.manifest.cid });
  if (!saved) {
    const existing = await contract.finalReceiptAnchors(compId);
    if (existing.cid) {
      if (existing.receiptHash !== receipt.contentHash || existing.manifestHash !== manifest.contentHash) {
        throw new Error('Immutable anchor CID/hash mismatch; recover the existing receipt rather than uploading.');
      }
      saved = { cid: existing.cid, contentHash: receipt.contentHash, transactionHash: null };
      save();
    }
  }
  if (!saved) {
    const published = await requirePublicationConsent(receipt, consentConfirmed, uploader);
    saved = { cid: published.cid, contentHash: receipt.contentHash, transactionHash: null };
    save(); // Persist upload success before readback or any signature.
  }
  saved.cid = normalizeAnchorCID(saved.cid);
  save();
  onState('published-unanchored', saved);
  if (!validAnchorCID(saved.cid)) throw new Error('Anchor requires CIDv1 base32 dag-pb/raw sha2-256; do not re-upload automatically.');
  const publishedReceipt = await readDocument(saved.cid, { contentHash: receipt.contentHash });
  await verifyFinalReceiptAgainstChain({ ethers, provider, receipt: publishedReceipt, manifest, chainResult, manifestCID: receipt.manifest.cid });
  const check = () => verifyReceiptAnchor({ ethers, provider, contract, compId, receipt, manifest, chainResult, cid: saved.cid });
  const existing = await check();
  if (existing.state === 'anchor-verified') { onState(existing.state, existing); return existing; }
  if (saved.transactionHash) {
    const pending = await provider.getTransactionReceipt(saved.transactionHash);
    if (!pending) { onState('anchoring-pending', saved); return { state: 'anchoring-pending', ...saved }; }
    if (Number(pending.status) === 1) throw new Error('Confirmed transaction has no matching anchor; mismatch requires investigation.');
    saved.transactionHash = null;
    save();
    onState('anchor-reverted', saved);
  }
  await identity();
  const tx = await contract.connect(signer).anchorFinalReceipt(compId, saved.cid, receipt.contentHash, manifest.contentHash);
  saved.transactionHash = tx.hash;
  save();
  onState('anchoring-pending', saved);
  const confirmed = await tx.wait();
  if (Number(confirmed?.status) !== 1) throw new Error('Anchor transaction reverted; publication retained for retry.');
  const verified = await check();
  if (verified.state !== 'anchor-verified') throw new Error('Anchor readback is missing.');
  onState(verified.state, verified);
  return verified;
}
const SENSITIVE_KEYS = new Set([
  'activitydays', 'weeklyactivitydays', 'weeklymetricstotals', 'activityrecords',
  'progresshash', 'proofcid', 'note', 'notes', 'health', 'healthdata', 'weight',
  'food', 'exercise', 'diagnosis', 'meetingurl', 'codehash', 'meetupcode',
]);

const ACTION_FIELDS = {
  joined: ['amount'],
  report: ['week'],
  forfeited: [],
  completed: [],
  meetupCheckIn: ['meetupIndex'],
  meetupReview: ['meetupIndex', 'actorWallet', 'approved'],
  reviewerInvited: ['meetupIndex', 'reviewerWallet'],
  monthlyCompleted: [],
  payout: ['place', 'baseRefund', 'bonus', 'totalPayout'],
  winningsDistributed: ['amount'],
};
const TOP_LEVEL_FIELDS = new Set([
  'schema', 'chainId', 'escrow', 'competition', 'observedAt', 'participants',
  'settlement', 'awards', 'awardLinks', 'manifest', 'contentHash',
]);
const COMPETITION_FIELDS = new Set([
  'id', 'name', 'stakeToken', 'stakeAmount', 'totalWeeks', 'startTime',
  'endTime', 'metadataCID', 'status',
]);
const EVENT_REF_FIELDS = new Set([
  'blockNumber', 'blockHash', 'timestamp', 'transactionHash', 'logIndex',
]);
const ACTION_PUBLIC_FIELDS = new Set([
  'type', 'blockNumber', 'blockHash', 'timestamp', 'transactionHash', 'logIndex',
  'amount', 'week', 'meetupIndex', 'actorWallet', 'approved', 'reviewerWallet',
  'place', 'baseRefund', 'bonus', 'totalPayout',
]);
const AWARD_PUBLIC_FIELDS = new Set([
  'nftAddress', 'tokenId', 'account', 'amount', 'minter', 'role', 'metadataCID',
  ...EVENT_REF_FIELDS,
]);
const AWARD_LINK_FIELDS = new Set(['role', 'tokenId', 'nftAddress', 'metadataCID']);

const EVENT_ACTIONS = [
  'CompetitionSettled', 'CompetitionCancelled', 'EntrantJoined', 'WeeklyReport', 'EntrantForfeited', 'EntrantCompleted',
  'WinningsDistributed', 'StreakPayout', 'MeetupSelfCheckedIn',
  'MeetupPeerDecision', 'MeetupReviewerInvited', 'MonthlyChallengeCompleted',
];

function isAddress(value) {
  return ADDRESS.test(String(value || ''));
}

function normalizedAddress(value, label) {
  if (!isAddress(value)) throw new Error(`${label} is not a valid wallet or contract address.`);
  return String(value).toLowerCase();
}

function sortedObject(value) {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedObject(value[key])]));
}

export function canonicalResultJson(value) {
  return JSON.stringify(sortedObject(value));
}

async function sha256Hex(value) {
  const source = globalThis.crypto?.subtle;
  if (!source) throw new Error('Web Crypto SHA-256 is unavailable; result hash cannot be verified.');
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await source.digest('SHA-256', bytes));
  return `0x${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function safeNumber(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} is not a safe non-negative integer.`);
  return number;
}

function resultStatus(value) {
  const statuses = { 0: 'active', 1: 'settled', 2: 'cancelled' };
  const text = String(value ?? 'active');
  const status = Object.hasOwn(statuses, text) ? statuses[text] : text;
  if (!['active', 'settled', 'cancelled'].includes(status)) throw new Error('Competition status is unavailable.');
  return status;
}

function publicMetadataCID(value) {
  const candidates = String(value || '').split(';')
    .filter(part => !part.startsWith('cycle:') && !part.startsWith('src:'));
  const candidate = candidates.find(part => /^(?:ipfs:\/\/)?[a-zA-Z0-9]+$/.test(part));
  return candidate ? candidate.replace(/^ipfs:\/\//, '') : '';
}

function safeEventRef(event) {
  const blockNumber = safeNumber(event.blockNumber, 'Event block number');
  const logIndex = safeNumber(event.logIndex, 'Event log index');
  const timestamp = safeNumber(event.timestamp, 'Event timestamp');
  if (!HASH.test(String(event.transactionHash || ''))) throw new Error('Event transaction hash is unavailable.');
  if (!HASH.test(String(event.blockHash || ''))) throw new Error('Event block hash is unavailable or invalid.');
  return {
    blockNumber,
    blockHash: String(event.blockHash).toLowerCase(),
    timestamp,
    transactionHash: String(event.transactionHash).toLowerCase(),
    logIndex,
  };
}

function sanitizeAction(action) {
  const allowedFields = ACTION_FIELDS[action?.type];
  if (!allowedFields) throw new Error(`Unsupported public action type: ${String(action?.type || 'missing')}.`);
  const wallet = normalizedAddress(action.wallet, 'Participant wallet');
  const clean = { type: action.type, wallet, ...safeEventRef(action) };
  for (const field of allowedFields) {
    const value = action[field];
    if (value === undefined || value === null) throw new Error(`Public action ${action.type} is missing ${field}.`);
    if (field.endsWith('Wallet')) clean[field] = normalizedAddress(value, field);
    else if (field === 'approved') {
      if (typeof value !== 'boolean') throw new Error('Review decision must be a boolean.');
      clean[field] = value;
    } else if (field === 'amount' || ['baseRefund', 'bonus', 'totalPayout'].includes(field)) {
      const amount = String(value);
      if (!/^(0|[1-9]\d*)$/.test(amount)) throw new Error(`Public action ${field} must be a raw integer token amount.`);
      clean[field] = amount;
    } else clean[field] = safeNumber(value, field);
  }
  return clean;
}

function sanitizeAward(award) {
  const nftAddress = normalizedAddress(award.nftAddress, 'Achievement NFT');
  const account = normalizedAddress(award.account, 'Achievement recipient');
  const minter = normalizedAddress(award.minter, 'Achievement minter');
  const clean = {
    nftAddress,
    tokenId: String(award.tokenId),
    account,
    amount: String(award.amount),
    minter,
    ...safeEventRef(award),
  };
  if (!/^(0|[1-9]\d*)$/.test(clean.tokenId) || !/^[1-9]\d*$/.test(clean.amount)) {
    throw new Error('Achievement token ID and amount must be positive integer strings.');
  }
  if (award.role) {
    if (!['completion', 'first', 'second', 'third'].includes(award.role)) throw new Error('Unknown achievement role.');
    clean.role = award.role;
  }
  if (award.metadataCID) {
    if (!/^ipfs:\/\/[a-zA-Z0-9]+$/.test(award.metadataCID)) throw new Error('Achievement metadata reference is invalid.');
    clean.metadataCID = award.metadataCID;
  }
  return clean;
}

function sanitizeAwardLink(link) {
  const clean = {
    role: String(link.role),
    tokenId: String(link.tokenId),
    nftAddress: normalizedAddress(link.nftAddress, 'Achievement contract'),
  };
  if (!['completion', 'first', 'second', 'third'].includes(clean.role) ||
      !/^(0|[1-9]\d*)$/.test(clean.tokenId)) throw new Error('Achievement metadata link is invalid.');
  if (link.metadataCID) {
    if (!/^ipfs:\/\/[a-zA-Z0-9]+$/.test(link.metadataCID)) throw new Error('Achievement metadata CID is invalid.');
    clean.metadataCID = String(link.metadataCID);
  }
  return clean;
}

function sanitizeSettlement(settlement) {
  if (!settlement) return null;
  const clean = {
    winnerCount: safeNumber(settlement.winnerCount, 'Settlement winner count'),
    potDistributed: String(settlement.potDistributed),
    leaderboardCID: String(settlement.leaderboardCID || ''),
    ...safeEventRef(settlement),
  };
  if (!/^(0|[1-9]\d*)$/.test(clean.potDistributed)) throw new Error('Settlement total must be a raw integer token amount.');
  return clean;
}

function scanSensitiveKeys(value, path = '') {
  if (!value || typeof value !== 'object') return [];
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) found.push(path ? `${path}.${key}` : key);
    found.push(...scanSensitiveKeys(child, path ? `${path}.${key}` : key));
  }
  return found;
}

function assertExactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  const unexpected = Object.keys(value).filter(key => !allowed.has(key));
  if (unexpected.length) throw new Error(`${label} contains unsupported public fields: ${unexpected.join(', ')}.`);
}

export async function createPublicResultDocument({
  chainId,
  contractAddress,
  competition,
  observedBlock,
  actions = [],
  settlement = null,
  awards = [],
  awardLinks = [],
  manifest = null,
} = {}) {
  const id = safeNumber(competition?.id, 'Competition ID');
  const status = String(competition?.status || 'active');
  if (!['active', 'settled', 'cancelled'].includes(status)) throw new Error('Competition status is unavailable.');
  const body = {
    schema: RESULT_SCHEMA,
    chainId: safeNumber(chainId, 'Chain ID'),
    escrow: normalizedAddress(contractAddress, 'Competition escrow'),
    competition: {
      id,
      name: String(competition.name || ''),
      stakeToken: normalizedAddress(competition.stakeToken, 'Stake token'),
      stakeAmount: String(competition.stakeAmount),
      totalWeeks: safeNumber(competition.totalWeeks, 'Competition duration'),
      startTime: safeNumber(competition.startTime, 'Competition start time'),
      endTime: safeNumber(competition.endTime, 'Competition end time'),
      metadataCID: publicMetadataCID(competition.metadataCID),
      status,
    },
    observedAt: {
      blockNumber: safeNumber(observedBlock?.number, 'Observed block number'),
      blockHash: String(observedBlock?.hash || '').toLowerCase(),
      timestamp: safeNumber(observedBlock?.timestamp, 'Observed block timestamp'),
    },
    participants: [],
    settlement: sanitizeSettlement(settlement),
    awards: awards.map(sanitizeAward).sort((a, b) =>
      a.blockNumber - b.blockNumber || a.logIndex - b.logIndex || a.tokenId.localeCompare(b.tokenId)),
    awardLinks: awardLinks.map(sanitizeAwardLink).sort((a, b) => a.role.localeCompare(b.role)),
  };
  if (!/^(0|[1-9]\d*)$/.test(body.competition.stakeAmount)) throw new Error('Competition stake must be a raw integer token amount.');
  if (!HASH.test(body.observedAt.blockHash)) throw new Error('Observed block hash is unavailable.');
  if (manifest) {
    if (!/^([a-zA-Z0-9]+)$/.test(String(manifest.cid || ''))) throw new Error('Manifest CID is invalid.');
    if (!HASH.test(String(manifest.contentHash || ''))) throw new Error('Manifest content hash is invalid.');
    body.manifest = {
      cid: String(manifest.cid),
      contentHash: String(manifest.contentHash).toLowerCase(),
    };
  }
  const grouped = new Map();
  for (const action of actions.map(sanitizeAction)) {
    if (!grouped.has(action.wallet)) grouped.set(action.wallet, []);
    const { wallet, ...publicAction } = action;
    grouped.get(wallet).push(publicAction);
  }
  body.participants = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([wallet, participantActions]) => ({
    wallet,
    actions: participantActions.sort((a, b) =>
      a.blockNumber - b.blockNumber || a.logIndex - b.logIndex || a.type.localeCompare(b.type)),
  }));
  const sensitive = scanSensitiveKeys(body);
  if (sensitive.length) throw new Error(`Public result contains prohibited private fields: ${sensitive.join(', ')}.`);
  return {
    ...body,
    contentHash: await sha256Hex(canonicalResultJson(body)),
  };
}

export async function verifyPublicResultDocument(document, expected = {}) {
  if (!document || typeof document !== 'object' || Array.isArray(document) ||
      document.schema !== RESULT_SCHEMA || !HASH.test(String(document.contentHash || ''))) {
    throw new Error('Published result has an unsupported schema or missing content hash.');
  }
  assertExactKeys(document, TOP_LEVEL_FIELDS, 'Published result');
  assertExactKeys(document.competition, COMPETITION_FIELDS, 'Competition metadata');
  assertExactKeys(document.observedAt, new Set(['blockNumber', 'blockHash', 'timestamp']), 'Observed block');
  if (!Array.isArray(document.participants) || !Array.isArray(document.awards) || !Array.isArray(document.awardLinks)) {
    throw new Error('Published result arrays are invalid.');
  }
  if (document.settlement !== null) assertExactKeys(document.settlement, new Set(['winnerCount', 'potDistributed', 'leaderboardCID', ...EVENT_REF_FIELDS]), 'Settlement event');
  if (document.manifest !== undefined) assertExactKeys(document.manifest, new Set(['cid', 'contentHash']), 'Manifest link');
  for (const participant of document.participants) {
    assertExactKeys(participant, new Set(['wallet', 'actions']), 'Participant');
    if (!Array.isArray(participant.actions)) throw new Error('Participant actions are invalid.');
    for (const action of participant.actions) assertExactKeys(action, ACTION_PUBLIC_FIELDS, 'Participant action');
  }
  for (const award of document.awards) assertExactKeys(award, AWARD_PUBLIC_FIELDS, 'Achievement mint');
  for (const link of document.awardLinks) assertExactKeys(link, AWARD_LINK_FIELDS, 'Achievement metadata link');
  const flattenedActions = document.participants.flatMap(participant =>
    participant.actions.map(action => ({ ...action, wallet: participant.wallet })));
  const normalized = await createPublicResultDocument({
    chainId: document.chainId,
    contractAddress: document.escrow,
    competition: document.competition,
    observedBlock: {
      number: document.observedAt.blockNumber,
      hash: document.observedAt.blockHash,
      timestamp: document.observedAt.timestamp,
    },
    actions: flattenedActions,
    settlement: document.settlement,
    awards: document.awards,
    awardLinks: document.awardLinks,
    manifest: document.manifest,
  });
  if (canonicalResultJson(normalized) !== canonicalResultJson(document)) {
    throw new Error('Published result fields are invalid, unordered, or not canonically normalized.');
  }
  const { contentHash, ...body } = document;
  if (await sha256Hex(canonicalResultJson(body)) !== String(contentHash).toLowerCase()) {
    throw new Error('Published result content hash does not match its public fields.');
  }
  const sensitive = scanSensitiveKeys(body);
  if (sensitive.length) throw new Error(`Published result includes prohibited private fields: ${sensitive.join(', ')}.`);
  if (expected.chainId !== undefined && Number(document.chainId) !== Number(expected.chainId)) {
    throw new Error('Published result chain ID does not match selected chain data.');
  }
  if (expected.contractAddress && document.escrow !== String(expected.contractAddress).toLowerCase()) {
    throw new Error('Published result escrow address does not match chain data.');
  }
  if (expected.competitionId !== undefined && Number(document.competition?.id) !== Number(expected.competitionId)) {
    throw new Error('Published result competition ID does not match chain data.');
  }
  if (expected.manifestCID !== undefined && document.manifest?.cid !== expected.manifestCID) {
    throw new Error('Published settlement receipt does not reference the published manifest CID.');
  }
  if (expected.contentHash !== undefined && String(document.contentHash).toLowerCase() !== String(expected.contentHash).toLowerCase()) {
    throw new Error('Published content does not match the locally reviewed result hash.');
  }
  return { valid: true, contentHash: String(contentHash).toLowerCase() };
}

export function assertManifestLink(eventCID, uploadedCID) {
  if (!eventCID || !uploadedCID || String(eventCID) !== String(uploadedCID)) {
    throw new Error('Settlement event does not link to the uploaded result manifest.');
  }
  return true;
}

function assertSettlementAuthorityAndState({
  chainId,
  expectedChainId,
  account,
  owner,
  escrowAddress,
  escrowCode,
  paused,
  status,
  endTime,
  now,
} = {}) {
  if (Number(chainId) !== Number(expectedChainId)) throw new Error('Selected wallet network does not match the configured competition chain.');
  normalizedAddress(escrowAddress, 'Competition escrow');
  if (escrowCode === '0x' || !escrowCode) throw new Error('Competition escrow code is unavailable on the selected chain.');
  if (!isAddress(account) || !isAddress(owner) || account.toLowerCase() !== owner.toLowerCase()) {
    throw new Error('Only the current on-chain competition owner may settle.');
  }
  if (paused) throw new Error('Settlement is unavailable while the competition contract is paused.');
  if (Number(status) !== 0) throw new Error('Only an active competition can be settled.');
  if (!Number.isFinite(Number(endTime)) || Number(now) < Number(endTime)) {
    throw new Error('The on-chain competition end time has not been reached.');
  }
  return true;
}

export function assertSettlementPrerequisites(context = {}) {
  assertSettlementAuthorityAndState(context);
  const { historyComplete, awardsReady = true } = context;
  if (historyComplete !== true) throw new Error('Complete event history is unavailable; settlement preview cannot be verified.');
  if (awardsReady !== true) throw new Error('Configured achievement metadata or minter readiness is unavailable.');
  return true;
}

export async function requirePublicationConsent(document, consentConfirmed, uploader) {
  if (consentConfirmed !== true) throw new Error('Publication cancelled: explicit public-field consent is required.');
  if (typeof uploader !== 'function') throw new Error('Public result uploader is unavailable; local export remains available.');
  await verifyPublicResultDocument(document);
  const result = await uploader(document);
  if (!result?.cid || !/^[a-zA-Z0-9]+$/.test(String(result.cid))) {
    throw new Error('Storage provider did not return a valid result CID.');
  }
  return { cid: String(result.cid), state: 'uploaded-unlinked' };
}

function eventValue(args, name, index) {
  return args?.[name] ?? args?.[index];
}

function eventRow(eventName, log) {
  const args = log.args;
  const common = {
    eventName,
    transactionHash: log.transactionHash,
    blockNumber: Number(log.blockNumber),
    blockHash: log.blockHash || null,
    logIndex: Number(log.index ?? log.logIndex),
  };
  switch (eventName) {
    case 'EntrantJoined':
      return { ...common, wallet: eventValue(args, 'entrant', 1), type: 'joined', amount: String(eventValue(args, 'amount', 2)) };
    case 'WeeklyReport':
      return { ...common, wallet: eventValue(args, 'entrant', 1), type: 'report', week: Number(eventValue(args, 'week', 2)) };
    case 'EntrantForfeited':
      return { ...common, wallet: eventValue(args, 'entrant', 1), type: 'forfeited' };
    case 'EntrantCompleted':
      return { ...common, wallet: eventValue(args, 'entrant', 1), type: 'completed' };
    case 'WinningsDistributed':
      return { ...common, wallet: eventValue(args, 'winner', 1), type: 'winningsDistributed', amount: String(eventValue(args, 'amount', 2)) };
    case 'StreakPayout':
      return {
        ...common,
        wallet: eventValue(args, 'entrant', 1),
        type: 'payout',
        place: Number(eventValue(args, 'place', 2)),
        baseRefund: String(eventValue(args, 'baseRefund', 3)),
        bonus: String(eventValue(args, 'bonus', 4)),
        totalPayout: String(eventValue(args, 'totalPayout', 5)),
      };
    case 'MeetupSelfCheckedIn':
      return {
        ...common,
        wallet: eventValue(args, 'entrant', 2),
        type: 'meetupCheckIn',
        meetupIndex: Number(eventValue(args, 'meetupIndex', 1)),
      };
    case 'MeetupPeerDecision':
      return {
        ...common,
        wallet: eventValue(args, 'entrant', 2),
        type: 'meetupReview',
        meetupIndex: Number(eventValue(args, 'meetupIndex', 1)),
        actorWallet: eventValue(args, 'peer', 3),
        approved: Boolean(eventValue(args, 'approved', 4)),
      };
    case 'MeetupReviewerInvited':
      return {
        ...common,
        wallet: eventValue(args, 'entrant', 2),
        type: 'reviewerInvited',
        meetupIndex: Number(eventValue(args, 'meetupIndex', 1)),
        reviewerWallet: eventValue(args, 'reviewer', 3),
      };
    case 'MonthlyChallengeCompleted':
      return { ...common, wallet: eventValue(args, 'entrant', 1), type: 'monthlyCompleted' };
    case 'CompetitionSettled':
      return {
        ...common,
        type: 'settled',
        winnerCount: Number(eventValue(args, 'winnerCount', 1)),
        potDistributed: String(eventValue(args, 'potDistributed', 2)),
        leaderboardCID: String(eventValue(args, 'leaderboardCID', 3) || ''),
      };
    case 'CompetitionCancelled':
      return { ...common, type: 'cancelled' };
    default:
      return null;
  }
}

function historyStorage() {
  if (globalThis.localStorage) return globalThis.localStorage;
  const memory = new Map();
  return {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
  };
}

export async function collectCompetitionResult({
  ethers,
  provider,
  escrowAddress,
  compId,
  competition,
  awardAddress = '',
  awardMetadata = [],
  awardLinks = [],
  history,
  storage,
} = {}) {
  if (!ethers?.Contract || !ethers?.Interface || !provider) throw new Error('Ethers provider is unavailable.');
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const latestBlock = await provider.getBlockNumber();
  const escrowCode = await provider.getCode(escrowAddress);
  if (!escrowCode || escrowCode === '0x') throw new Error('Competition escrow code is unavailable on this chain.');
  const eventsContract = new ethers.Contract(escrowAddress, RESULT_EVENT_ABI, provider);
  const indexer = history || createChainHistory(storage || historyStorage());
  const events = [];
  for (const name of EVENT_ACTIONS) {
    const filterFactory = eventsContract.filters[name];
    if (typeof filterFactory !== 'function') throw new Error(`This escrow ABI does not expose ${name}; full result history is unavailable.`);
    const filter = filterFactory(compId);
    const result = await indexer.scan({
      scope: `${chainId}:${escrowAddress.toLowerCase()}:competition:${compId}:${name}`,
      latestBlock,
      startBlock: 0,
      chunkSize: 5000,
      maxChunks: 100,
      query: (from, to) => eventsContract.queryFilter(filter, from, to),
      project: log => eventRow(name, log),
    });
    if (result.state !== 'success') {
      throw new Error(`${name} history is still indexing through block ${result.cursor}; refresh before settlement.`);
    }
    events.push(...result.events.filter(event => event.eventName === name));
  }

  const settlementRows = events.filter(event => event.type === 'settled');
  if (settlementRows.length > 1) throw new Error('Conflicting settlement events were returned for this competition.');
  const cancellation = events.some(event => event.type === 'cancelled');
  const settlementRow = settlementRows[0] || null;
  const onChainStatus = resultStatus(competition?.status);
  if ((onChainStatus === 'settled') !== Boolean(settlementRow) ||
      (onChainStatus === 'cancelled') !== cancellation ||
      (settlementRow && cancellation)) {
    throw new Error('On-chain competition status conflicts with complete settlement/cancellation event history.');
  }
  const blockNumbers = [...new Set([...events.map(event => event.blockNumber), latestBlock])];
  const blocks = new Map();
  for (const blockNumber of blockNumbers) {
    const block = await provider.getBlock(blockNumber);
    if (!block) throw new Error(`Chain block ${blockNumber} is unavailable; event timestamps cannot be verified.`);
    blocks.set(blockNumber, block);
  }
  const timestampedEvents = events.map(event => {
    const block = blocks.get(event.blockNumber);
    if (!HASH.test(String(event.blockHash || '')) || !HASH.test(String(block?.hash || '')) ||
        event.blockHash.toLowerCase() !== block.hash.toLowerCase()) {
      throw new Error(`Event block hash mismatch at block ${event.blockNumber}.`);
    }
    return { ...event, timestamp: Number(block.timestamp) };
  });
  const actions = timestampedEvents.filter(event => event.wallet);
  const confirmedSettlementRow = timestampedEvents.find(event => event.type === 'settled') || null;
  const settlement = confirmedSettlementRow ? { ...confirmedSettlementRow } : null;
  const currentBlock = blocks.get(latestBlock);
  const awardMints = settlementRow
    ? await collectSettlementAwardMints({ ethers, provider, transactionHash: settlementRow.transactionHash, awardAddress, escrowAddress, awardMetadata })
    : [];
  const awardLinkRead = await readRegisteredAwardLinks(ethers, provider, awardLinks, latestBlock);
  const snapshot = await createPublicResultDocument({
    chainId,
    contractAddress: escrowAddress,
    competition: {
      ...competition,
      id: Number(compId),
      status: onChainStatus,
    },
    observedBlock: { number: latestBlock, hash: currentBlock.hash, timestamp: Number(currentBlock.timestamp) },
    actions,
    settlement,
    awards: awardMints,
    awardLinks: awardLinkRead.links,
  });
  return {
    chainId,
    latestBlock,
    historyComplete: true,
    settlementEvent: confirmedSettlementRow,
    settlementCID: settlementRow?.leaderboardCID || '',
    awardMints,
    awardLinkStatus: awardLinkRead,
    document: snapshot,
  };
}

export async function collectSettlementAwardMints({
  ethers,
  provider,
  transactionHash,
  awardAddress,
  escrowAddress,
  awardMetadata = [],
} = {}) {
  if (!transactionHash) return [];
  const receipt = await provider.getTransactionReceipt(transactionHash);
  if (!receipt || Number(receipt.status) !== 1) throw new Error('Confirmed settlement receipt is unavailable; award mints cannot be verified.');
  const receiptHash = String(receipt.hash || receipt.transactionHash || '').toLowerCase();
  if (!HASH.test(receiptHash) || !HASH.test(String(receipt.blockHash || ''))) {
    throw new Error('Settlement receipt transaction or block hash is unavailable.');
  }
  const iface = new ethers.Interface(AWARD_EVENT_ABI);
  const metadataById = new Map(awardMetadata.map(entry => [String(entry.tokenId), entry]));
  const awards = [];
  for (const log of receipt.logs || []) {
    if (String(log.transactionHash || '').toLowerCase() !== receiptHash ||
        Number(log.blockNumber) !== Number(receipt.blockNumber) ||
        String(log.blockHash || '').toLowerCase() !== String(receipt.blockHash).toLowerCase()) {
      throw new Error('Achievement log identity does not match the confirmed settlement receipt.');
    }
    if (isAddress(awardAddress) && String(log.address).toLowerCase() !== awardAddress.toLowerCase()) continue;
    let parsed;
    try { parsed = iface.parseLog(log); } catch { continue; }
    if (parsed?.name !== 'EditionMinted') continue;
    const tokenId = String(parsed.args.tokenId ?? parsed.args[0]);
    const account = String(parsed.args.to ?? parsed.args[1]);
    const amount = String(parsed.args.amount ?? parsed.args[2]);
    const minter = String(parsed.args.minter ?? parsed.args[3]);
    if (minter.toLowerCase() !== escrowAddress.toLowerCase()) continue;
    const block = await provider.getBlock(receipt.blockNumber);
    if (!block || block.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) {
      throw new Error('Achievement mint block does not match its settlement receipt.');
    }
    const metadata = metadataById.get(tokenId) || {};
    awards.push({
      nftAddress: String(log.address),
      tokenId,
      account,
      amount,
      minter,
      role: metadata.role,
      metadataCID: metadata.metadataCID,
      transactionHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      blockHash: log.blockHash,
      logIndex: Number(log.index ?? log.logIndex),
      timestamp: Number(block.timestamp),
    });
  }
  return awards;
}

export function verifySettlementReceipt({ ethers, escrowAddress, compId, receipt, cid } = {}) {
  if (!receipt || Number(receipt.status) !== 1) throw new Error('Settlement transaction did not confirm successfully.');
  const transactionHash = String(receipt.hash || receipt.transactionHash || '').toLowerCase();
  const blockHash = String(receipt.blockHash || '').toLowerCase();
  if (!HASH.test(transactionHash) || !HASH.test(blockHash)) {
    throw new Error('Confirmed settlement receipt is missing its transaction or block hash.');
  }
  const iface = new ethers.Interface(RESULT_EVENT_ABI);
  const matches = [];
  for (const log of receipt.logs || []) {
    if (String(log.address).toLowerCase() !== String(escrowAddress).toLowerCase()) continue;
    let parsed;
    try { parsed = iface.parseLog(log); } catch { continue; }
    if (parsed?.name !== 'CompetitionSettled' || String(parsed.args.compId) !== String(compId)) continue;
    if (String(log.transactionHash || '').toLowerCase() !== transactionHash ||
        Number(log.blockNumber) !== Number(receipt.blockNumber) ||
        String(log.blockHash || '').toLowerCase() !== blockHash) {
      throw new Error('CompetitionSettled event identity does not match the confirmed transaction receipt.');
    }
    matches.push({ parsed, log });
  }
  if (matches.length !== 1) throw new Error('Confirmed transaction does not contain exactly one matching CompetitionSettled event.');
  const eventCID = String(matches[0].parsed.args.leaderboardCID || '');
  assertManifestLink(eventCID, cid);
  return {
    transactionHash,
    blockNumber: Number(receipt.blockNumber),
    blockHash,
    logIndex: Number(matches[0].log.index ?? matches[0].log.logIndex),
    winnerCount: Number(matches[0].parsed.args.winnerCount),
    potDistributed: String(matches[0].parsed.args.potDistributed),
    leaderboardCID: eventCID,
  };
}

export function assertSettlementReceiptMatchesChain(receipt, chainResult) {
  const event = chainResult?.settlementEvent;
  if (!event) throw new Error('Selected-chain settlement event is unavailable.');
  const matches = String(receipt.transactionHash).toLowerCase() === String(event.transactionHash).toLowerCase() &&
    Number(receipt.blockNumber) === Number(event.blockNumber) &&
    String(receipt.blockHash).toLowerCase() === String(event.blockHash).toLowerCase() &&
    Number(receipt.logIndex) === Number(event.logIndex) &&
    Number(receipt.winnerCount) === Number(event.winnerCount) &&
    String(receipt.potDistributed) === String(event.potDistributed) &&
    String(receipt.leaderboardCID) === String(event.leaderboardCID);
  if (!matches) throw new Error('Settlement receipt fields do not match complete selected-chain event history.');
  return true;
}

export async function verifyEventTimestamp(provider, event) {
  const block = await provider.getBlock(Number(event.blockNumber));
  if (!block) throw new Error(`Chain block ${event.blockNumber} is unavailable.`);
  if (!HASH.test(String(event.blockHash || '')) || !HASH.test(String(block.hash || '')) ||
      block.hash.toLowerCase() !== event.blockHash.toLowerCase()) {
    throw new Error(`Chain block hash mismatch at ${event.blockNumber}.`);
  }
  if (Number(block.timestamp) !== Number(event.timestamp)) throw new Error(`Chain timestamp mismatch at ${event.blockNumber}.`);
  return true;
}

export function verifyAwardMintsAgainstPayouts({ awards = [], actions = [], awardLinks = [], escrowAddress } = {}) {
  const payouts = actions.filter(action => action.type === 'payout');
  if (!payouts.length) {
    if (awards.length) throw new Error('Achievement mints were returned without matching payout actions.');
    return true;
  }
  if (awardLinks.length !== 4 || new Set(awardLinks.map(link => link.role)).size !== 4 ||
      new Set(awardLinks.map(link => String(link.tokenId))).size !== 4 ||
      new Set(awardLinks.map(link => String(link.nftAddress).toLowerCase())).size !== 1) {
    throw new Error('Four unique competition achievement metadata links are required to verify payout mints.');
  }
  const roles = new Map(awardLinks.map(link => [link.role, link]));
  for (const role of ['completion', 'first', 'second', 'third']) {
    if (!roles.has(role)) throw new Error(`Achievement metadata link for ${role} is unavailable.`);
  }
  const used = new Set();
  for (const payout of payouts) {
    const requiredRoles = ['completion'];
    if (payout.place >= 1 && payout.place <= 3) requiredRoles.push(['first', 'second', 'third'][payout.place - 1]);
    for (const role of requiredRoles) {
      const link = roles.get(role);
      const matches = awards.filter((award, index) =>
        !used.has(index) &&
        award.role === role &&
        String(award.tokenId) === String(link.tokenId) &&
        String(award.nftAddress).toLowerCase() === String(link.nftAddress).toLowerCase() &&
        String(award.account).toLowerCase() === String(payout.wallet).toLowerCase() &&
        String(award.minter).toLowerCase() === String(escrowAddress).toLowerCase() &&
        String(award.amount) === '1');
      if (matches.length !== 1) {
        throw new Error(`Confirmed ${role} achievement mint does not match payout recipient ${payout.wallet}.`);
      }
      used.add(awards.indexOf(matches[0]));
    }
  }
  if (used.size !== awards.length) throw new Error('Unexpected or duplicate achievement mint log does not match confirmed payout actions.');
  return true;
}

export async function verifyManifestAgainstChain({ ethers, manifest, chainResult, provider, manifestCID } = {}) {
  await verifyPublicResultDocument(manifest, {
    chainId: chainResult.chainId,
    contractAddress: chainResult.document.escrow,
    competitionId: chainResult.document.competition.id,
  });
  assertManifestLink(chainResult.settlementCID, manifestCID);
  if (manifest.competition.status !== 'active' || manifest.settlement !== null || manifest.awards.length) {
    throw new Error('Settlement manifest is not a pre-settlement public snapshot.');
  }
  const manifestBlock = await provider.getBlock(manifest.observedAt.blockNumber);
  if (!manifestBlock || manifestBlock.hash.toLowerCase() !== manifest.observedAt.blockHash ||
      Number(manifestBlock.timestamp) !== manifest.observedAt.timestamp) {
    throw new Error('Manifest snapshot block hash or timestamp does not match the selected chain.');
  }
  const { status: _manifestStatus, ...manifestCompetition } = manifest.competition;
  const { status: _chainStatus, ...chainCompetition } = chainResult.document.competition;
  if (canonicalResultJson(manifestCompetition) !== canonicalResultJson(chainCompetition)) {
    throw new Error('Manifest competition metadata does not match current chain data.');
  }
  const settlementTx = chainResult.settlementEvent?.transactionHash?.toLowerCase();
  const preSettlementActions = chainResult.document.participants.flatMap(participant =>
    participant.actions
      .filter(action => action.transactionHash.toLowerCase() !== settlementTx)
      .map(action => ({ wallet: participant.wallet, ...action })));
  const manifestActions = manifest.participants.flatMap(participant =>
    participant.actions.map(action => ({ wallet: participant.wallet, ...action })));
  if (manifestActions.some(action => action.blockNumber > manifest.observedAt.blockNumber)) {
    throw new Error('Manifest includes an event newer than its claimed chain snapshot block.');
  }
  const sortActions = actions => actions.sort((a, b) =>
    a.blockNumber - b.blockNumber || a.logIndex - b.logIndex || a.wallet.localeCompare(b.wallet));
  if (canonicalResultJson(sortActions(preSettlementActions)) !== canonicalResultJson(sortActions(manifestActions))) {
    throw new Error('Published manifest participant actions do not match complete pre-settlement chain history.');
  }
  if (manifest.awardLinks.length) {
    const identityLinks = manifest.awardLinks.map(({ role, tokenId, nftAddress }) => ({ role, tokenId, nftAddress }));
    const historicalLinks = await readRegisteredAwardLinks(
      ethers,
      provider,
      identityLinks,
      manifest.observedAt.blockNumber,
    );
    if (!historicalLinks.checked) throw new Error('Registered achievement token URI could not be read at the manifest snapshot block.');
    if (canonicalResultJson(historicalLinks.links) !== canonicalResultJson(manifest.awardLinks)) {
      throw new Error('Manifest achievement token URIs do not match the NFT contract at the snapshot block.');
    }
  }
  const payouts = chainResult.document.participants.flatMap(participant =>
    participant.actions.map(action => ({ ...action, wallet: participant.wallet })));
  verifyAwardMintsAgainstPayouts({
    awards: chainResult.awardMints || chainResult.document.awards,
    actions: payouts,
    awardLinks: manifest.awardLinks,
    escrowAddress: chainResult.document.escrow,
  });
  return true;
}

export function assertDraftMatchesCurrentChain(draft, current) {
  if (!draft || !current?.document || current.settlementEvent ||
      current.document.competition.status !== 'active') {
    throw new Error('Competition state changed after the public preview; rebuild the local draft.');
  }
  const omitStatus = ({ status: _status, ...competition }) => competition;
  const flatten = document => document.participants.flatMap(participant =>
    participant.actions.map(action => ({ wallet: participant.wallet, ...action })))
    .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex || a.wallet.localeCompare(b.wallet));
  if (draft.chainId !== current.chainId ||
      draft.escrow !== current.document.escrow ||
      draft.competition.id !== current.document.competition.id ||
      canonicalResultJson(omitStatus(draft.competition)) !== canonicalResultJson(omitStatus(current.document.competition)) ||
      canonicalResultJson(draft.awardLinks) !== canonicalResultJson(current.document.awardLinks) ||
      canonicalResultJson(flatten(draft)) !== canonicalResultJson(flatten(current.document))) {
    throw new Error('Public preview is stale: competition terms, award links or participant actions changed. Rebuild and review it.');
  }
  return true;
}

export function publicResultFieldPaths(document) {
  const paths = ['schema', 'chainId', 'escrow'];
  for (const key of Object.keys(document.competition || {})) paths.push(`competition.${key}`);
  for (const key of Object.keys(document.observedAt || {})) paths.push(`observedAt.${key}`);
  if (document.participants?.length) {
    paths.push('participants[].wallet');
    const actionFields = [...new Set(document.participants.flatMap(participant =>
      (participant.actions || []).flatMap(action => Object.keys(action))))].sort();
    for (const key of actionFields) paths.push(`participants[].actions[].${key}`);
  } else paths.push('participants[] (empty)');
  if (document.settlement) for (const key of Object.keys(document.settlement)) paths.push(`settlement.${key}`);
  else paths.push('settlement (not present in pre-settlement manifest)');
  if (document.awards?.length) {
    for (const key of [...new Set(document.awards.flatMap(award => Object.keys(award)))].sort()) paths.push(`awards[].${key}`);
  } else paths.push('awards[] (empty in pre-settlement manifest)');
  if (document.awardLinks?.length) {
    for (const key of [...new Set(document.awardLinks.flatMap(link => Object.keys(link)))].sort()) paths.push(`awardLinks[].${key}`);
  } else paths.push('awardLinks[] (empty)');
  if (document.manifest) {
    for (const key of Object.keys(document.manifest)) paths.push(`manifest.${key}`);
  }
  paths.push('contentHash (SHA-256 over canonical public JSON)');
  return paths;
}

function node(tag, text = '') {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  return element;
}

function appendResultPanel(anchor, id, label) {
  if (!anchor?.parentElement) return null;
  let panel = document.getElementById(id);
  if (panel) return panel;
  panel = node('section');
  panel.id = id;
  panel.className = 'streak-results-panel';
  panel.setAttribute('aria-labelledby', `${id}-title`);
  const title = node('h3', label);
  title.id = `${id}-title`;
  const intro = node('p', 'Live and archived action results from the selected RPC. Refresh reads public chain events; it does not verify a live deployment or publish data.');
  const refresh = node('button', 'Refresh public results');
  refresh.type = 'button';
  refresh.dataset.streakResultsRefresh = id;
  const status = node('p', 'Not loaded. Use Refresh public results to read chain data.');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.dataset.resultsStatus = '';
  const list = node('div');
  list.dataset.resultsList = '';
  panel.append(title, intro, refresh, status, list);
  anchor.parentElement.insertBefore(panel, anchor.nextSibling);
  return panel;
}

function ensureResultsPanels() {
  return [
    appendResultPanel(document.getElementById('streak-challenge-list'), 'streak-results-user', 'Live and archived StreakBet results'),
    appendResultPanel(document.getElementById('streak-admin-challenge-list'), 'streak-results-admin', 'Admin result archive'),
    appendResultPanel(document.getElementById('comp-user-list'), 'competition-results-user', 'Live and archived competition results'),
    appendResultPanel(document.getElementById('comp-admin-list'), 'competition-results-admin', 'Admin result archive'),
  ].filter(Boolean);
}

async function loadCompetitionAwardRecord({ competitionId, chainId, escrowAddress }) {
  try {
    const { getCompetitionAwardMetadata } = await import('./competitionAwards.mjs');
    return getCompetitionAwardMetadata(globalThis.localStorage, {
      competitionId,
      chainId,
      escrowAddress,
    });
  } catch {
    return null;
  }
}

function normalizeAwardRecord(record, { competitionId, chainId, escrowAddress }) {
  if (!record || record.schema !== 'bignuten-competition-award-record/v1' ||
      String(record.competitionId) !== String(competitionId) ||
      Number(record.chainId) !== Number(chainId) ||
      String(record.escrowAddress).toLowerCase() !== String(escrowAddress).toLowerCase() ||
      !isAddress(record.achievementContractAddress) ||
      !Array.isArray(record.records) || record.records.length !== 4) {
    return { ready: false, awardAddress: '', metadata: [], links: [] };
  }
  const roles = ['completion', 'first', 'second', 'third'];
  const ids = record.records.map(item => String(item.tokenId));
  if (new Set(ids).size !== 4 || ids.some(id => !/^(0|[1-9]\d*)$/.test(id)) ||
      roles.some(role => !/^(0|[1-9]\d*)$/.test(String(record.awardTokenIds?.[role])) ||
        !record.records.some(item => item.role === role && String(item.tokenId) === String(record.awardTokenIds[role])))) {
    return { ready: false, awardAddress: '', metadata: [], links: [] };
  }
  const metadata = record.records.map(item => ({
    role: item.role,
    tokenId: String(item.tokenId),
  }));
  const links = metadata.map(item => ({
    role: item.role,
    tokenId: item.tokenId,
    nftAddress: record.achievementContractAddress,
  }));
  return {
    ready: true,
    awardAddress: record.achievementContractAddress,
    awardTokenIds: Object.fromEntries(roles.map(role => [role, String(record.awardTokenIds[role])])),
    metadata,
    links,
  };
}

export function currentChallengeConfigMatchesRecord({
  awardRecord,
  awardAddress,
  awardTokenIds,
  competitionStakeToken,
  challengeStakeToken,
} = {}) {
  const roles = ['completion', 'first', 'second', 'third'];
  if (!awardRecord?.ready || !isAddress(awardAddress) ||
      !isAddress(competitionStakeToken) || !isAddress(challengeStakeToken) ||
      String(awardRecord.awardAddress).toLowerCase() !== String(awardAddress).toLowerCase() ||
      String(competitionStakeToken).toLowerCase() !== String(challengeStakeToken).toLowerCase()) return false;
  return roles.every(role =>
    /^(0|[1-9]\d*)$/.test(String(awardTokenIds?.[role] ?? '')) &&
    String(awardRecord.awardTokenIds?.[role]) === String(awardTokenIds[role]));
}

async function checkCurrentChallengeSettlementReadiness({
  ethers,
  provider,
  contract,
  escrowAddress,
  competition,
  awardRecord,
} = {}) {
  try {
    const [
      awardAddress,
      treasury,
      stakeToken,
      completionId,
      firstId,
      secondId,
      thirdId,
    ] = await Promise.all([
      contract.streakAwardNFT(),
      contract.challengeTreasury(),
      contract.challengeStakeToken(),
      contract.completionAwardId(),
      contract.firstPlaceAwardId(),
      contract.secondPlaceAwardId(),
      contract.thirdPlaceAwardId(),
    ]);
    const awardTokenIds = {
      completion: String(completionId),
      first: String(firstId),
      second: String(secondId),
      third: String(thirdId),
    };
    const matches = currentChallengeConfigMatchesRecord({
      awardRecord,
      awardAddress,
      awardTokenIds,
      competitionStakeToken: competition.stakeToken,
      challengeStakeToken: stakeToken,
    });
    if (!matches || !isAddress(awardAddress) ||
        awardAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
      return { ready: false, awardAddress };
    }
    if (await provider.getCode(awardAddress) === '0x') return { ready: false, awardAddress };
    const nft = new ethers.Contract(awardAddress, [
      'function MINTER_ROLE() view returns (bytes32)',
      'function hasRole(bytes32,address) view returns (bool)',
    ], provider);
    const minterRole = await nft.MINTER_ROLE();
    const isNativeStake = stakeToken.toLowerCase() === '0x0000000000000000000000000000000000000000';
    const [isMinter, treasuryCode, tokenCode] = await Promise.all([
      nft.hasRole(minterRole, escrowAddress),
      provider.getCode(treasury),
      isNativeStake ? Promise.resolve('0x') : provider.getCode(stakeToken),
    ]);
    return {
      ready: Boolean(isMinter) && treasuryCode !== '0x' && (isNativeStake || tokenCode !== '0x'),
      awardAddress,
    };
  } catch {
    return { ready: false, awardAddress: '' };
  }
}

async function readRegisteredAwardLinks(ethers, provider, awardLinks, blockTag) {
  if (!awardLinks.length) return { links: [], checked: false, unavailableRoles: [] };
  const nftAddress = awardLinks[0].nftAddress;
  if (!isAddress(nftAddress) || awardLinks.some(link => link.nftAddress.toLowerCase() !== nftAddress.toLowerCase())) {
    return { links: awardLinks, checked: false, unavailableRoles: awardLinks.map(link => link.role) };
  }
  try {
    const nft = new ethers.Contract(nftAddress, [
      'function uri(uint256 tokenId) view returns (string)',
    ], provider);
    const unavailableRoles = [];
    const failedRoles = [];
    const links = await Promise.all(awardLinks.map(async link => {
      try {
        const uri = String(await nft.uri(link.tokenId, blockTag === undefined ? {} : { blockTag }));
        if (/^ipfs:\/\/[a-zA-Z0-9]+$/.test(uri)) return { ...link, metadataCID: uri };
        unavailableRoles.push(link.role);
      } catch { failedRoles.push(link.role); }
      if (!unavailableRoles.includes(link.role)) unavailableRoles.push(link.role);
      return link;
    }));
    return { links, checked: failedRoles.length === 0, unavailableRoles, failedRoles };
  } catch {
    const failedRoles = awardLinks.map(link => link.role);
    return { links: awardLinks, checked: false, unavailableRoles: failedRoles, failedRoles };
  }
}

async function mountAwardsPanel(panels) {
  const adminPanel = panels.find(panel => panel.id === 'streak-results-admin');
  if (!adminPanel || document.getElementById('competition-awards-root')) return;
  const root = node('div');
  root.id = 'competition-awards-root';
  adminPanel.append(root);
  const load = node('button', 'Open local award metadata and templates');
  load.type = 'button';
  root.append(load);
  load.addEventListener('click', async () => {
    load.disabled = true;
    try {
      const { mountCompetitionAwardsPanel } = await import('./competitionAwards.mjs');
      mountCompetitionAwardsPanel(root, { storage: globalThis.localStorage });
      load.remove();
    } catch (error) {
      root.append(node('p', `UNAVAILABLE — achievement metadata/template module could not be loaded: ${error.message}`));
      load.disabled = false;
    }
  });
}

function textList(parent, values) {
  const list = node('ul');
  for (const value of values) list.append(node('li', value));
  parent.append(list);
}

function displayAction(action) {
  const typeNames = {
    joined: 'joined',
    report: 'submitted a report (proof CID omitted)',
    forfeited: 'forfeited',
    completed: 'completed',
    meetupCheckIn: `checked in to meetup ${action.meetupIndex + 1}`,
    meetupReview: `${action.approved ? 'approved' : 'disputed'} meetup ${action.meetupIndex + 1} for ${action.actorWallet}`,
    reviewerInvited: `guest reviewer ${action.reviewerWallet} invited for meetup ${action.meetupIndex + 1}`,
    monthlyCompleted: 'monthly completion event',
    payout: `settlement-recorded competition place ${action.place}, base ${action.baseRefund}, bonus ${action.bonus}, total ${action.totalPayout} raw token units`,
    winningsDistributed: `winnings distributed: ${action.amount} raw token units`,
  };
  const date = new Date(Number(action.timestamp) * 1000);
  const timestamp = Number.isFinite(date.getTime()) ? `${date.toISOString()} (${action.timestamp})` : `timestamp unavailable (${action.timestamp})`;
  return `${timestamp} · ${typeNames[action.type] || 'unknown action'} · block ${action.blockNumber}`;
}

function explorerTxAnchor(transactionHash) {
  const base = String(globalThis.window?.CONTRACTS?.explorerTxUrl || '');
  if (!HASH.test(String(transactionHash || ''))) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const link = node('a', 'View transaction');
    link.href = `${base.replace(/\/?$/, '/')}${transactionHash}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  } catch { return null; }
}

function ipfsGatewayUrl(cid) {
  return `https://gateway.pinata.cloud/ipfs/${encodeURIComponent(String(cid || '').trim())}`;
}

export async function renderFinalReceiptAnchor(card, result, competition, provider, readDocument = readPublishedDocument) {
  const status = node('p', 'FINAL RECEIPT — checking immutable anchor capability.');
  card.append(status);
  try {
    const ethers = globalThis.ethers || globalThis.window?.ethers;
    const contract = new ethers.Contract(result.document.escrow, RECEIPT_ANCHOR_ABI, provider);
    await requireReceiptAnchorCapability(contract);
    const anchor = await contract.finalReceiptAnchors(competition.id);
    const key = `bignuten-final-receipt:${result.chainId}:${result.document.escrow}:${competition.id}`;
    const saved = JSON.parse(globalThis.localStorage?.getItem(key) || 'null');
    const cid = anchor.cid || saved?.cid;
    if (!cid) {
      status.textContent = 'RELEASE BLOCKER — final receipt is not anchored. No saved publication exists in this browser. If published elsewhere, recover that CID instead of uploading again.';
      status.dataset.state = 'unanchored';
      const manifest = await readDocument(result.settlementCID, {});
      const receipt = await createPublicResultDocument({
        chainId: result.chainId, contractAddress: result.document.escrow,
        competition: result.document.competition,
        observedBlock: {
          number: result.document.observedAt.blockNumber, hash: result.document.observedAt.blockHash,
          timestamp: result.document.observedAt.timestamp,
        },
        actions: result.document.participants.flatMap(person => person.actions.map(action => ({ ...action, wallet: person.wallet }))),
        settlement: result.settlementEvent, awards: result.awardMints, awardLinks: result.document.awardLinks,
        manifest: { cid: result.settlementCID, contentHash: manifest.contentHash },
      });
      await verifyFinalReceiptAgainstChain({ ethers, provider, receipt, manifest, chainResult: result, manifestCID: result.settlementCID });
      const preview = node('pre', canonicalResultJson(receipt));
      preview.tabIndex = 0;
      const details = node('details');
      details.append(node('summary', 'Review final receipt before first publication'), preview);
      card.append(details);
      const recoverCID = node('input');
      recoverCID.placeholder = 'Already published receipt CID (optional recovery)';
      recoverCID.setAttribute('aria-label', 'Published final receipt CID to recover');
      card.append(recoverCID);
      const publish = node('button', 'Review / publish or recover final receipt and anchor as owner');
      publish.type = 'button';
      card.append(publish);
      publish.addEventListener('click', async () => {
        publish.disabled = true;
        try {
          const walletProvider = new ethers.BrowserProvider(window.ethereum);
          const signer = await walletProvider.getSigner();
          let selectedReceipt = receipt;
          if (recoverCID.value.trim()) {
            const recoveredCID = normalizeAnchorCID(recoverCID.value.trim());
            selectedReceipt = await readDocument(recoveredCID, {});
            await verifyFinalReceiptAgainstChain({ ethers, provider: walletProvider, receipt: selectedReceipt, manifest, chainResult: result, manifestCID: result.settlementCID });
            globalThis.localStorage.setItem(key, JSON.stringify({
              cid: recoveredCID, contentHash: selectedReceipt.contentHash, transactionHash: null,
            }));
          }
          if (!window.confirm(fieldConfirmationText(selectedReceipt))) throw new Error('Explicit publication/anchor consent was not given.');
          await publishAndAnchorReceipt({
            ethers, provider: walletProvider,
            contract: new ethers.Contract(result.document.escrow, RECEIPT_ANCHOR_ABI, walletProvider),
            signer, compId: competition.id, receipt: selectedReceipt, manifest, chainResult: result,
            storage: globalThis.localStorage, consentConfirmed: true,
            uploader: getUploader(await signer.getAddress(), signer), readDocument,
            onState(state) { status.dataset.state = state; status.textContent = `${state.toUpperCase()} — final receipt`; },
          });
          window.dispatchEvent(new CustomEvent('bignuten:competition-settled'));
        } catch (error) {
          status.dataset.state = 'anchor-failed-or-mismatch';
          status.textContent = `REVERT / MISMATCH / UNAVAILABLE — ${error.message}; saved publication retained.`;
        } finally { publish.disabled = false; }
      });
      return;
    }
    const receipt = await readDocument(cid, {
      chainId: result.chainId, contractAddress: result.document.escrow, competitionId: competition.id,
    });
    const manifest = await readDocument(receipt.manifest?.cid, {});
    const verified = await verifyReceiptAnchor({
      ethers, provider, contract, compId: competition.id, receipt, manifest, chainResult: result, cid,
    });
    status.dataset.state = verified.state;
    status.textContent = `${verified.state.toUpperCase()} — CID ${cid}; receipt SHA-256 ${receipt.contentHash}; manifest SHA-256 ${manifest.contentHash}. Hashes are attestations, not proof of truth.`;
    const link = node('a', 'Read final receipt');
    link.href = ipfsGatewayUrl(cid);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    card.append(link);
    if (verified.transactionHash) {
      const txLink = explorerTxAnchor(verified.transactionHash);
      if (txLink) {
        txLink.textContent = `Anchor transaction · event log ${verified.logIndex}`;
        txLink.href += `#eventlog#${verified.logIndex}`;
        card.append(txLink);
      }
      card.append(node('p', `Anchor tx ${verified.transactionHash} · log ${verified.logIndex} · chain ${result.chainId} · escrow ${result.document.escrow}`));
    } else {
      const retry = node('button', 'Recover published receipt / retry owner anchor (no upload)');
      retry.type = 'button';
      card.append(retry);
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        try {
          const walletProvider = new ethers.BrowserProvider(window.ethereum);
          const outcome = await publishAndAnchorReceipt({
            ethers, provider: walletProvider,
            contract: new ethers.Contract(result.document.escrow, RECEIPT_ANCHOR_ABI, walletProvider),
            signer: await walletProvider.getSigner(), compId: competition.id,
            receipt, manifest, chainResult: result, storage: globalThis.localStorage,
            readDocument: readPublishedDocument, consentConfirmed: true,
            onState(state) { status.dataset.state = state; status.textContent = `${state.toUpperCase()} — ${cid}`; },
          });
          if (outcome.state === 'anchor-verified') window.dispatchEvent(new CustomEvent('bignuten:competition-settled'));
        } catch (error) {
          status.dataset.state = 'anchor-failed-or-mismatch';
          status.textContent = `REVERT / MISMATCH / UNAVAILABLE — ${error.message}; saved publication retained.`;
        } finally { retry.disabled = false; }
      });
    }
  } catch (error) {
    status.dataset.state = 'anchor-unavailable-or-mismatch';
    status.textContent = `FINAL RECEIPT RELEASE BLOCKER / UNVERIFIED — ${error.message}`;
  }
}

async function renderCollectedResult(root, result, competition, provider) {
  const card = node('article');
  const final = competition.status === 'settled' || competition.status === 1;
  card.append(node('h4', `${final ? 'ARCHIVE' : 'LIVE · NOT FINAL'} — ${competition.name} (#${competition.id})`));
  card.append(node('p', `Chain ${result.chainId} · escrow ${result.document.escrow} · result snapshot ${result.latestBlock}`));
  const participants = result.document.participants;
  if (!participants.length) card.append(node('p', 'No participant actions were returned by the event scan.'));
  for (const participant of participants) {
    const details = node('details');
    details.append(node('summary', `${participant.wallet} · ${participant.actions.length} public action(s)`));
    const actions = node('ul');
    for (const action of participant.actions) {
      const item = node('li');
      item.append(document.createTextNode(`${displayAction(action)} · `));
      item.append(explorerTxAnchor(action.transactionHash) || node('span', `tx ${action.transactionHash} (explorer link unavailable)`));
      actions.append(item);
    }
    details.append(actions);
    card.append(details);
  }
  if (result.document.awardLinks.length) {
    card.append(node('h5', 'Competition award IDs and registered token URI checks'));
    card.append(node('p', 'Role/token ID assignments are read from this browser’s local award record; they are not proof of the escrow’s private per-competition snapshot.'));
    if (!result.awardLinkStatus?.checked) {
      card.append(node('p', 'UNAVAILABLE — one or more DecentNFT token URI reads failed; no token URI or CID is inferred from local metadata.'));
    } else if (result.awardLinkStatus.unavailableRoles.length) {
      card.append(node('p', `UNAVAILABLE — no supported ipfs://CID token URI was read on-chain for: ${result.awardLinkStatus.unavailableRoles.join(', ')}. No URI or CID is inferred from local metadata.`));
    } else {
      card.append(node('p', `REGISTERED TOKEN URIS READ from this selected chain at result block ${result.latestBlock}.`));
    }
    const links = node('ul');
    for (const link of result.document.awardLinks) {
      const item = node('li');
      item.append(document.createTextNode(`${link.role} · token ${link.tokenId} · NFT ${link.nftAddress} · `));
      if (link.metadataCID) {
        const cid = link.metadataCID.replace(/^ipfs:\/\//, '');
        const metadataLink = node('a', link.metadataCID);
        metadataLink.href = ipfsGatewayUrl(cid);
        metadataLink.target = '_blank';
        metadataLink.rel = 'noopener noreferrer';
        item.append(metadataLink);
      } else item.append(node('span', 'metadata URI unavailable'));
      links.append(item);
    }
    card.append(links);
  }
  if (result.settlementEvent) {
    await renderFinalReceiptAnchor(card, result, competition, provider);
    const event = result.settlementEvent;
    const settlementDate = new Date(Number(event.timestamp) * 1000);
    const settlementTime = Number.isFinite(settlementDate.getTime()) ? settlementDate.toISOString() : 'timestamp unavailable';
    const settlementDetails = node('p', `SETTLEMENT EVENT · block ${event.blockNumber} at ${settlementTime} (${event.timestamp}) · ${event.winnerCount} winner(s) · event-reported pot ${event.potDistributed} raw token units (per-entrant payouts are separate logs) · CID ${event.leaderboardCID || 'none'} · tx ${event.transactionHash} `);
    settlementDetails.append(explorerTxAnchor(event.transactionHash) || node('span', '(explorer link unavailable)'));
    card.append(settlementDetails);
    if (event.leaderboardCID) {
      try {
        const manifest = await readPublishedDocument(event.leaderboardCID, {
          chainId: result.chainId,
          contractAddress: result.document.escrow,
          competitionId: competition.id,
        });
        await verifyManifestAgainstChain({
          ethers: globalThis.ethers || globalThis.window?.ethers,
          manifest,
          chainResult: result,
          provider,
          manifestCID: event.leaderboardCID,
        });
        const link = node('a', `Manifest CID ${event.leaderboardCID} · content verified`);
        link.href = ipfsGatewayUrl(event.leaderboardCID);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        card.append(link);
        card.append(node('p', `MANIFEST VERIFIED AGAINST THIS RPC — SHA-256 ${manifest.contentHash}; its action list matches the chain through settlement. This is not independent deployment verification.`));
      } catch (error) {
        card.append(node('p', `UNAVAILABLE / UNVERIFIED — settlement event has CID ${event.leaderboardCID}, but public content could not be verified against chain history: ${error.message}`));
      }
    } else card.append(node('p', 'UNAVAILABLE — the confirmed settlement event has no result manifest CID.'));
  }
  if (result.document.awards.length) {
    card.append(node('h5', 'Achievement mints (settlement transaction logs)'));
    const mintList = node('ul');
    for (const award of result.document.awards) {
      const item = node('li');
      item.append(document.createTextNode(`${award.account} received token ${award.tokenId} × ${award.amount} from ${award.nftAddress}; role ${award.role || 'metadata role unavailable'}; `));
      item.append(explorerTxAnchor(award.transactionHash) || node('span', `tx ${award.transactionHash} (explorer link unavailable)`));
      mintList.append(item);
    }
    card.append(mintList);
    try {
      const actions = result.document.participants.flatMap(participant =>
        participant.actions.map(action => ({ ...action, wallet: participant.wallet })));
      verifyAwardMintsAgainstPayouts({
        awards: result.awardMints,
        actions,
        awardLinks: result.document.awardLinks,
        escrowAddress: result.document.escrow,
      });
      card.append(node('p', 'ACHIEVEMENT RECEIPTS VERIFIED AGAINST EACH SETTLEMENT-RECORDED COMPETITION PLACE AND THE LOCAL METADATA LINKS; multiple tied recipients may share the same place and award role. The local metadata record is not proof of the contract snapshot.'));
    } catch (error) {
      card.append(node('p', `UNVERIFIED — achievement mint and payout crosslink failed: ${error.message}`));
    }
  } else if (result.settlementEvent) {
    card.append(node('p', 'UNAVAILABLE — no matching EditionMinted log was decoded for the configured achievement NFT. This is not a claim that no award was minted.'));
  }
  card.append(node('p', `Result SHA-256: ${result.document.contentHash} · event timestamps are read from chain blocks; verify the displayed hashes/receipts independently.`));
  const exportButton = node('button', 'Export this chain snapshot locally');
  exportButton.type = 'button';
  exportButton.addEventListener('click', () => downloadJson(result.document, `bignuten-result-${competition.id}.json`));
  card.append(exportButton);
  const fields = node('details');
  fields.append(node('summary', 'Public fields included'));
  textList(fields, publicResultFieldPaths(result.document));
  card.append(fields);
  root.append(card);
}

function downloadJson(value, filename) {
  const blob = new Blob([canonicalResultJson(value)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = node('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readConfig() {
  const config = globalThis.window?.CONTRACTS || {};
  const address = config.streakBetEscrow || '';
  const rpcUrl = config.rpcUrl || '';
  const chainId = Number(config.chainId);
  if (!isAddress(address) || !rpcUrl || !Number.isSafeInteger(chainId) || chainId < 1) {
    throw new Error('UNAVAILABLE — configured chain ID, RPC URL, or StreakBet escrow address is missing.');
  }
  return { address, rpcUrl, chainId, explorerTxUrl: config.explorerTxUrl || '' };
}

async function refreshResults(panel) {
  const status = panel.querySelector('[data-results-status]');
  const list = panel.querySelector('[data-results-list]');
  list.replaceChildren();
  status.textContent = 'PENDING — reading selected-chain competition and event history.';
  try {
    const config = readConfig();
    const ethers = globalThis.ethers || globalThis.window?.ethers;
    if (!ethers?.JsonRpcProvider) throw new Error('Ethers provider is unavailable.');
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== config.chainId) throw new Error('RPC chain ID does not match the configured competition network.');
    const code = await provider.getCode(config.address);
    if (code === '0x') throw new Error('Configured StreakBet address has no contract code on this chain.');
    const readContract = new ethers.Contract(config.address, [
      'function nextCompId() view returns (uint256)',
      'function getCompetition(uint256) view returns (tuple(string name,address stakeToken,uint256 stakeAmount,uint256 totalWeeks,uint256 startTime,uint256 endTime,uint256 joinDeadline,bool yieldEnabled,bool potDeployed,string metadataCID,uint8 status,uint256 potBalance,uint256 entrantCount,uint256 winnerCount))',
    ], provider);
    const total = Number(await readContract.nextCompId());
    if (!Number.isSafeInteger(total) || total < 0 || total > 1000) throw new Error('Competition count is outside the supported results scan limit.');
    if (!total) {
      status.textContent = 'No competitions were returned by this selected chain.';
      return;
    }
    let unavailable = 0;
    for (let compId = 0; compId < total; compId += 1) {
      try {
        const c = await readContract.getCompetition(compId);
        const competition = {
          id: compId,
          name: c.name,
          stakeToken: c.stakeToken,
          stakeAmount: String(c.stakeAmount),
          totalWeeks: Number(c.totalWeeks),
          startTime: Number(c.startTime),
          endTime: Number(c.endTime),
          metadataCID: c.metadataCID,
          status: Number(c.status) === 1 ? 'settled' : Number(c.status) === 2 ? 'cancelled' : 'active',
        };
        const awardRecord = await loadCompetitionAwardRecord({
          competitionId: compId,
          chainId: config.chainId,
          escrowAddress: config.address,
        });
        const awardDetails = normalizeAwardRecord(awardRecord, {
          competitionId: compId,
          chainId: config.chainId,
          escrowAddress: config.address,
        });
        const result = await collectCompetitionResult({
          ethers,
          provider,
          escrowAddress: config.address,
          compId,
          competition,
          awardAddress: awardDetails.awardAddress,
          awardMetadata: awardDetails.metadata,
          awardLinks: awardDetails.links,
        });
        await renderCollectedResult(list, result, competition, provider);
      } catch (error) {
        unavailable += 1;
        const card = node('article');
        card.append(node('h4', `UNAVAILABLE — competition #${compId}`));
        card.append(node('p', error.message || 'Result history could not be verified.'));
        list.append(card);
      }
    }
    status.textContent = unavailable
      ? `PARTIAL / UNAVAILABLE — ${unavailable} of ${total} competition result(s) could not be verified from this RPC.`
      : 'CHAIN DATA READ — this client queried the configured RPC; no independent live-deployment verification is claimed.';
    status.dataset.state = unavailable ? 'partial' : 'success';
  } catch (error) {
    status.textContent = error.message || 'UNAVAILABLE — selected-chain results could not be loaded.';
    status.dataset.state = 'error';
  }
}

function addFieldDisclosure(panel, payload) {
  const fields = node('details');
  fields.append(node('summary', 'Review the exact public fields before upload'));
  textList(fields, publicResultFieldPaths(payload));
  fields.append(node('p', 'Excluded: raw health values, activity-day totals, progress hashes, report/proof CIDs, notes, meeting URLs, meetup codes, and private health records.'));
  panel.append(fields);
}

function getSettlementPanel() {
  const candidates = [
    document.querySelector('#challenge-modal .gov-modal'),
    document.querySelector('#comp-admin-modal .gov-modal'),
  ].filter(Boolean);
  const host = candidates.find(element =>
    !element.closest('[hidden], .modal-hidden') &&
    getComputedStyle(element).display !== 'none' &&
    element.getClientRects().length > 0) || document.body;
  let panel = document.getElementById('streak-settlement-preview');
  if (panel) panel.remove();
  panel = node('section');
  panel.id = 'streak-settlement-preview';
  panel.className = 'streak-results-panel';
  panel.setAttribute('aria-live', 'polite');
  host.append(panel);
  return panel;
}

async function beginMonthlyChallengeSettlement(button) {
  const compId = String(button.dataset.comp || '');
  if (!/^(0|[1-9]\d*)$/.test(compId)) throw new Error('Challenge settlement has no valid competition ID.');
  const ethers = globalThis.ethers || globalThis.window?.ethers;
  if (!ethers?.BrowserProvider || !globalThis.window?.ethereum) {
    throw new Error('Wallet provider is unavailable; no settlement transaction was sent.');
  }
  const config = globalThis.window.CONTRACTS || {};
  const escrowAddress = config.streakBetEscrow || '';
  if (!isAddress(escrowAddress)) throw new Error('Configured StreakBet escrow address is unavailable.');
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(escrowAddress, SETTLEMENT_CONTROL_ABI, signer);
  await beginCompetitionSettlement({
    ethers,
    provider,
    signer,
    contract,
    compId,
    expectedChainId: Number(config.chainId),
  });
}

function bindMonthlySettlementInterception() {
  if (document.documentElement.dataset.streakSettlementCapture === 'bound') return;
  document.documentElement.dataset.streakSettlementCapture = 'bound';
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-streak-action="settle"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    button.disabled = true;
    void beginMonthlyChallengeSettlement(button).catch(error => {
      const panel = getSettlementPanel();
      panel.append(node('p', `BLOCKED / UNAVAILABLE — ${error.message}. No settlement transaction was sent.`));
    }).finally(() => { button.disabled = false; });
  }, true);
}

function getUploader(wallet, signer) {
  if (globalThis.window?.BIGNUTEN_STORAGE_RELAY_URL) {
    return async document => {
      const { uploadViaStorageRelay } = await import('./pinataStorage.js');
      return uploadViaStorageRelay(document, {
        fileName: `bignuten-competition-${document.competition.id}-manifest.json`,
        wallet,
        signer,
        relayUrl: window.BIGNUTEN_STORAGE_RELAY_URL,
      });
    };
  }
  return async document => {
    const { uploadIpfsSnapshot } = await import('./pinataStorage.js');
    return uploadIpfsSnapshot(document, {
      fileName: `bignuten-competition-${document.competition.id}-manifest.json`,
    });
  };
}

async function readPublishedDocument(cid, expected) {
  const urls = [
    ipfsGatewayUrl(cid),
    `https://dweb.link/ipfs/${encodeURIComponent(cid)}`,
  ];
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`IPFS readback returned HTTP ${response.status}.`);
      const document = await response.json();
      await verifyPublicResultDocument(document, expected);
      return document;
    } catch (error) { lastError = error; }
  }
  throw new Error(`Public upload readback is unavailable or invalid; settlement remains blocked. ${lastError?.message || ''}`.trim());
}

function fieldConfirmationText(payload) {
  const documentType = payload.manifest ? 'separate settlement receipt' : 'pre-settlement competition manifest';
  return [
    `Publish this public ${documentType} to IPFS?`,
    'The exact public fields are listed below. Full payload values:',
    ...publicResultFieldPaths(payload).map(path => `• ${path}`),
    '',
    JSON.stringify(payload, null, 2),
    '',
    'Excluded: raw health values, activity-day totals, progress hashes, proof CIDs, notes, meeting URLs/codes, and private health records.',
    'IPFS pins may persist indefinitely. This upload is separate from settlement; no transaction is sent now.',
  ].join('\n');
}

export async function beginCompetitionSettlement({
  ethers,
  provider,
  signer,
  contract,
  compId,
  expectedChainId = Number(globalThis.window?.CONTRACTS?.chainId),
  awardAddress = '',
  awardMetadata = [],
  awardLinks = [],
} = {}) {
  const panel = getSettlementPanel();
  panel.append(node('h3', `Settlement preview · competition #${compId}`));
  const status = node('p', 'PENDING — verifying owner, selected network, chain history, and settlement prerequisites.');
  status.dataset.state = 'pending';
  panel.append(status);
  try {
    const account = await signer.getAddress();
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== Number(expectedChainId)) {
      throw new Error('Selected wallet network does not match the configured competition chain.');
    }
    const escrowAddress = contract.target || contract.address;
    await requireReceiptAnchorCapability(new ethers.Contract(escrowAddress, RECEIPT_ANCHOR_ABI, provider));
    const [owner, competition, paused, escrowCode, latestBlock] = await Promise.all([
      contract.owner(),
      contract.getCompetition(compId),
      contract.paused(),
      provider.getCode(escrowAddress),
      provider.getBlockNumber(),
    ]);
    const latestBlockData = await provider.getBlock(latestBlock);
    if (!latestBlockData) throw new Error('Current chain block is unavailable; settlement end time cannot be verified.');
    assertSettlementAuthorityAndState({
      chainId: Number(network.chainId),
      expectedChainId,
      account,
      owner,
      escrowAddress,
      escrowCode,
      paused,
      status: Number(competition.status),
      endTime: Number(competition.endTime),
      now: Number(latestBlockData.timestamp),
    });
    let awardsReady = true;
    let currentAwardAddress = awardAddress;
    let challengeEnabled = false;
    let localAwardDetails = null;
    let challenge;
    try { challenge = await contract.getStreakChallenge(compId); }
    catch { throw new Error('Competition challenge configuration is unavailable; settlement prerequisites cannot be verified.'); }
    challengeEnabled = Boolean(challenge.enabled);
    if (challengeEnabled) {
      const localRecord = await loadCompetitionAwardRecord({
        competitionId: Number(compId),
        chainId: Number(network.chainId),
        escrowAddress,
      });
      localAwardDetails = normalizeAwardRecord(localRecord, {
        competitionId: Number(compId),
        chainId: Number(network.chainId),
        escrowAddress,
      });
      awardsReady = localAwardDetails.ready;
      if (awardsReady) {
        currentAwardAddress = localAwardDetails.awardAddress;
        awardMetadata = localAwardDetails.metadata;
        awardLinks = localAwardDetails.links;
      }
      const readiness = await checkCurrentChallengeSettlementReadiness({
        ethers, provider, contract, escrowAddress, competition, awardRecord: localAwardDetails,
      });
      awardsReady = awardsReady && readiness.ready;
      if (!currentAwardAddress) currentAwardAddress = readiness.awardAddress;
    }
    const competitionView = {
      id: Number(compId),
      name: competition.name,
      stakeToken: competition.stakeToken,
      stakeAmount: String(competition.stakeAmount),
      totalWeeks: Number(competition.totalWeeks),
      startTime: Number(competition.startTime),
      endTime: Number(competition.endTime),
      metadataCID: competition.metadataCID,
      status: Number(competition.status),
    };
    const result = await collectCompetitionResult({
      ethers, provider, escrowAddress, compId, competition: competitionView,
      awardAddress: currentAwardAddress, awardMetadata, awardLinks,
    });
    const settlementContext = {
      chainId: Number(network.chainId),
      expectedChainId,
      account,
      owner,
      escrowAddress,
      escrowCode,
      paused,
      status: Number(competition.status),
      endTime: Number(competition.endTime),
      now: Number(latestBlockData.timestamp),
      historyComplete: result.historyComplete,
      awardsReady: true,
    };
    assertSettlementPrerequisites(settlementContext);
    status.textContent = 'LOCAL DRAFT — no upload or transaction has been sent.';
    status.dataset.state = 'draft';
    const fields = node('pre', canonicalResultJson(result.document));
    fields.tabIndex = 0;
    fields.setAttribute('aria-label', 'Sanitized public result manifest preview');
    panel.append(fields);
    addFieldDisclosure(panel, result.document);
    if (challengeEnabled) {
      panel.append(node('p',
        'SNAPSHOT LIMITATION — the competition stake token and local award ID/NFT record are compared with current public getters; current treasury code and minter role are checked for availability. This escrow exposes no per-competition treasury or award-ID snapshot getter. A match is not proof of the historical private snapshot. If current settings differ, settlement is blocked; if prior settings were changed and later restored, that history cannot be verified here.'));
    }
    const exportButton = node('button', 'Export local draft only');
    exportButton.type = 'button';
    exportButton.addEventListener('click', () => downloadJson(result.document, `bignuten-competition-${compId}-draft.json`));
    panel.append(exportButton);
    if (!awardsReady) {
      status.textContent = 'LOCAL DRAFT ONLY — current asset/award configuration or minter/treasury readiness is unavailable; settlement and publication are blocked.';
      status.dataset.state = 'blocked';
      panel.append(node('p', 'BLOCKED — the competition stake token and current global stake token must match; saved award IDs/NFT must match current getters; and the current NFT minter, treasury and stake asset must be readable. These checks do not prove the escrow’s private per-competition snapshot.'));
      return;
    }
    const consent = node('input');
    consent.type = 'checkbox';
    const consentLabel = node('label');
    consentLabel.append(consent, document.createTextNode(' I reviewed the exact fields and consent to publishing this manifest; no raw health values or notes are included.'));
    panel.append(consentLabel);
    const uploadButton = node('button', 'Publish manifest to IPFS');
    uploadButton.type = 'button';
    uploadButton.disabled = true;
    consent.addEventListener('change', () => { uploadButton.disabled = !consent.checked; });
    panel.append(uploadButton);
    const transactionButton = node('button', 'Submit settlement transaction with published CID');
    transactionButton.type = 'button';
    transactionButton.disabled = true;
    panel.append(transactionButton);
    const publishedStatus = node('p', 'NOT PUBLISHED — local draft only.');
    publishedStatus.setAttribute('role', 'status');
    panel.append(publishedStatus);
    let uploadedCID = '';

    uploadButton.addEventListener('click', async () => {
      uploadButton.disabled = true;
      try {
        if (!consent.checked || !window.confirm(fieldConfirmationText(result.document))) {
          publishedStatus.textContent = 'NOT PUBLISHED — explicit confirmation was not given.';
          uploadButton.disabled = !consent.checked;
          return;
        }
        publishedStatus.textContent = 'PENDING — waiting for explicit storage authorization and provider upload; no settlement transaction has been sent.';
        const publication = await requirePublicationConsent(result.document, true, getUploader(account, signer));
        uploadedCID = publication.cid;
        publishedStatus.textContent = `UPLOADED — ${uploadedCID}. Chain link pending; settlement has not been submitted. Verifying public readback…`;
        await readPublishedDocument(uploadedCID, {
          chainId: result.chainId,
          contractAddress: escrowAddress,
          competitionId: Number(compId),
          contentHash: result.document.contentHash,
        });
        publishedStatus.textContent = `PUBLIC MANIFEST VERIFIED BY CID READBACK — ${uploadedCID}. Not yet linked by a confirmed settlement transaction.`;
        transactionButton.disabled = false;
      } catch (error) {
        uploadedCID = '';
        publishedStatus.textContent = `FAILED / UNAVAILABLE — ${error.message}. Settlement remains blocked.`;
        uploadButton.disabled = !consent.checked;
      }
    });

    transactionButton.addEventListener('click', async () => {
      transactionButton.disabled = true;
      let settlementConfirmed = false;
      let settlementSubmitted = false;
      let settlementFailed = false;
      let confirmedHash = '';
      try {
        if (!uploadedCID) throw new Error('No verified public manifest CID is available.');
        if (!window.confirm(`Submit settlement for competition #${compId} on chain ${expectedChainId} using CID ${uploadedCID}? This is a live owner transaction; the contract's existing payout policy applies.`)) {
          publishedStatus.textContent = `PUBLISHED BUT UNLINKED — ${uploadedCID}; settlement transaction was not sent.`;
          transactionButton.disabled = false;
          return;
        }
        const networkNow = await provider.getNetwork();
        const latestBlockNumber = await provider.getBlockNumber();
        const latestBlock = await provider.getBlock(latestBlockNumber);
        if (!latestBlock) throw new Error('Current chain block is unavailable; end-time prerequisite cannot be rechecked.');
        const [ownerNow, competitionNow, pausedNow, escrowCodeNow] = await Promise.all([
          contract.owner(), contract.getCompetition(compId), contract.paused(), provider.getCode(escrowAddress),
        ]);
        const readinessNow = challengeEnabled
          ? await checkCurrentChallengeSettlementReadiness({
            ethers,
            provider,
            contract,
            escrowAddress,
            competition: competitionNow,
            awardRecord: localAwardDetails,
          })
          : { ready: true };
        assertSettlementPrerequisites({
          chainId: Number(networkNow.chainId),
          expectedChainId,
          account: await signer.getAddress(),
          owner: ownerNow,
          escrowAddress,
          escrowCode: escrowCodeNow,
          paused: pausedNow,
          status: Number(competitionNow.status),
          endTime: Number(competitionNow.endTime),
          now: Number(latestBlock.timestamp),
          historyComplete: true,
          awardsReady: readinessNow.ready,
        });
        const currentResult = await collectCompetitionResult({
          ethers,
          provider,
          escrowAddress,
          compId,
          competition: { ...competitionView, status: 'active' },
          awardAddress: currentAwardAddress,
          awardMetadata,
          awardLinks,
        });
        assertDraftMatchesCurrentChain(result.document, currentResult);
        publishedStatus.textContent = 'PENDING — requesting settlement transaction confirmation.';
        const tx = await contract.connect(signer).settleCompetition(compId, uploadedCID);
        settlementSubmitted = true;
        confirmedHash = String(tx.hash || '');
        publishedStatus.textContent = `PENDING — settlement transaction ${tx.hash}; waiting for chain receipt.`;
        const receipt = await tx.wait();
        settlementConfirmed = Number(receipt?.status) === 1;
        settlementFailed = Number(receipt?.status) === 0;
        if (settlementFailed) throw new Error('Settlement transaction has a confirmed reverted receipt.');
        confirmedHash = String(receipt?.hash || tx.hash);
        const settlementReceipt = verifySettlementReceipt({
          ethers, escrowAddress, compId, receipt, cid: uploadedCID,
        });
        const settledCompetition = await contract.getCompetition(compId);
        if (Number(settledCompetition.status) !== 1) throw new Error('Receipt confirmed, but on-chain competition status is not Settled.');
        const settlementBlock = await provider.getBlock(settlementReceipt.blockNumber);
        if (!settlementBlock) throw new Error('Settlement receipt block is unavailable.');
        await verifyEventTimestamp(provider, {
          blockNumber: settlementReceipt.blockNumber,
          blockHash: settlementReceipt.blockHash,
          timestamp: Number(settlementBlock.timestamp),
        });
        publishedStatus.textContent =
          `CONFIRMED — settlement ${settlementReceipt.transactionHash}, block ${settlementReceipt.blockNumber}; ` +
          `CompetitionSettled links CID ${uploadedCID}. Final payout/mint receipt is being read from chain.`;
        publishedStatus.dataset.state = 'confirmed';
        const finalResult = await collectCompetitionResult({
          ethers, provider, escrowAddress, compId,
          competition: { ...competitionView, status: 'settled' },
          awardAddress: currentAwardAddress,
          awardMetadata,
          awardLinks,
        });
        assertManifestLink(finalResult.settlementCID, uploadedCID);
        assertSettlementReceiptMatchesChain(settlementReceipt, finalResult);
        const finalActions = finalResult.document.participants.flatMap(participant =>
          participant.actions.map(action => ({ ...action, wallet: participant.wallet })));
        let awardReceiptVerified = true;
        let awardReceiptError = '';
        try {
          verifyAwardMintsAgainstPayouts({
            awards: finalResult.awardMints,
            actions: finalActions,
            awardLinks,
            escrowAddress,
          });
        } catch (error) {
          awardReceiptVerified = false;
          awardReceiptError = error.message;
        }
        const finalDocument = await createPublicResultDocument({
          chainId: finalResult.chainId,
          contractAddress: escrowAddress,
          competition: { ...competitionView, status: 'settled' },
          observedBlock: {
            number: finalResult.document.observedAt.blockNumber,
            hash: finalResult.document.observedAt.blockHash,
            timestamp: finalResult.document.observedAt.timestamp,
          },
          actions: finalActions,
          settlement: {
            ...finalResult.settlementEvent,
            leaderboardCID: finalResult.settlementCID,
          },
          awards: finalResult.awardMints,
          awardLinks,
          manifest: { cid: uploadedCID, contentHash: result.document.contentHash },
        });
        const receiptPreview = node('pre', canonicalResultJson(finalDocument));
        receiptPreview.tabIndex = 0;
        receiptPreview.setAttribute('aria-label', 'Chain-derived settlement receipt preview');
        panel.append(node('h4', 'Confirmed settlement receipt · local draft, not uploaded'));
        panel.append(receiptPreview);
        const receiptExport = node('button', 'Export confirmed receipt locally');
        receiptExport.type = 'button';
        receiptExport.addEventListener('click', () => downloadJson(finalDocument, `bignuten-competition-${compId}-receipt.json`));
        panel.append(receiptExport);
        const receiptConsent = node('input');
        receiptConsent.type = 'checkbox';
        const receiptLabel = node('label');
        receiptLabel.append(receiptConsent, document.createTextNode(' I reviewed this public receipt and consent to publication and a separate immutable owner-authorized on-chain anchor. The anchor attests to hashes, not truth; confirmed chain events and manifest must match.'));
        panel.append(receiptLabel);
        const publishReceipt = node('button', 'Publish and anchor final receipt (or recover saved publication)');
        publishReceipt.type = 'button';
        publishReceipt.disabled = true;
        receiptConsent.addEventListener('change', () => { publishReceipt.disabled = !receiptConsent.checked || !awardReceiptVerified; });
        panel.append(publishReceipt);
        const receiptStatus = node('p', awardReceiptVerified
          ? `LOCAL DRAFT — settlement event and payout/mint links match selected-chain receipts; receipt is not uploaded. Manifest CID ${uploadedCID} is the CID anchored by the contract.`
          : `LOCAL DRAFT — settlement event is confirmed, but award mint/payout crosslinks are UNVERIFIED: ${awardReceiptError}. Local export is available; receipt publication is blocked. Manifest CID ${uploadedCID} is the CID anchored by the contract.`);
        receiptStatus.dataset.state = awardReceiptVerified ? 'draft' : 'unverified';
        panel.append(receiptStatus);
        publishReceipt.addEventListener('click', async () => {
          publishReceipt.disabled = true;
          try {
            if (!awardReceiptVerified) throw new Error('Award mint/payout crosslinks are unverified.');
            if (!receiptConsent.checked || !window.confirm(fieldConfirmationText(finalDocument))) {
              receiptStatus.textContent = 'NOT PUBLISHED — explicit receipt confirmation was not given.';
              publishReceipt.disabled = !receiptConsent.checked;
              return;
            }
            const anchorContract = new ethers.Contract(escrowAddress, RECEIPT_ANCHOR_ABI, provider);
            const anchored = await publishAndAnchorReceipt({
              ethers, provider, contract: anchorContract, signer, compId,
              receipt: finalDocument, manifest: result.document, chainResult: finalResult,
              uploader: getUploader(account, signer), readDocument: readPublishedDocument,
              storage: globalThis.localStorage, consentConfirmed: true,
              onState(state, details) {
                receiptStatus.dataset.state = state;
                receiptStatus.textContent = `${state.toUpperCase()} — CID ${details.cid || ''}; transaction ${details.transactionHash || 'not submitted'}. Release requires verified immutable anchor.`;
              },
            });
            if (anchored.state === 'anchor-verified') {
              receiptStatus.append(explorerTxAnchor(anchored.transactionHash) || node('span', anchored.transactionHash));
              window.dispatchEvent(new CustomEvent('bignuten:competition-settled'));
            } else publishReceipt.disabled = false;
          } catch (error) {
            receiptStatus.dataset.state = 'anchor-failed-or-mismatch';
            receiptStatus.textContent = `REVERT / MISMATCH / UNAVAILABLE — ${error.message}. Any saved published CID and pending transaction are retained; retry checks chain state without duplicate upload.`;
            publishReceipt.disabled = !receiptConsent.checked;
          }
        });
        window.dispatchEvent(new CustomEvent('bignuten:competition-settled'));
      } catch (error) {
        if (settlementConfirmed) {
          publishedStatus.textContent = `CONFIRMED TX ${confirmedHash} — settlement receipt or result verification is unavailable: ${error.message}. Do not assume the public manifest link or award receipts were verified.`;
          publishedStatus.dataset.state = 'confirmed-unverified';
          transactionButton.disabled = true;
        } else if (settlementFailed) {
          publishedStatus.textContent = `FAILED — transaction ${confirmedHash || '(hash unavailable)'} has a confirmed reverted receipt: ${error.message}. Settlement was not confirmed; review prerequisites before starting a new attempt.`;
          publishedStatus.dataset.state = 'failed';
          transactionButton.disabled = true;
        } else if (settlementSubmitted) {
          publishedStatus.textContent = `PENDING / UNAVAILABLE — transaction ${confirmedHash || '(hash unavailable)'} was submitted, but confirmation could not be verified: ${error.message}. Do not retry until chain status is checked.`;
          publishedStatus.dataset.state = 'pending-unverified';
          transactionButton.disabled = true;
        } else {
          publishedStatus.textContent = `FAILED / UNAVAILABLE — ${error.message}. Do not treat this transaction as confirmed.`;
          publishedStatus.dataset.state = 'error';
          transactionButton.disabled = !uploadedCID;
        }
      }
    });
  } catch (error) {
    status.textContent = `BLOCKED / UNAVAILABLE — ${error.message}. No upload or settlement transaction was sent.`;
    status.dataset.state = 'error';
  }
}

export function initCompetitionResults() {
  if (!globalThis.document) return;
  const panels = ensureResultsPanels();
  bindMonthlySettlementInterception();
  void mountAwardsPanel(panels);
  for (const panel of panels) {
    panel.querySelector('[data-streak-results-refresh]')?.addEventListener('click', () => refreshResults(panel));
  }
  document.addEventListener('click', event => {
    if (event.target.closest('[data-open-monthly-challenge]')) {
      const panel = document.getElementById('streak-results-user');
      if (panel) refreshResults(panel);
    }
  });
  window.addEventListener('bignuten:network-changed', () => {
    for (const panel of panels) {
      const status = panel.querySelector('[data-results-status]');
      if (status) status.textContent = 'Network changed. Refresh to load results from the newly selected chain.';
    }
  });
  window.addEventListener('bignuten:competition-settled', () => {
    for (const panel of panels) void refreshResults(panel);
  });
}
