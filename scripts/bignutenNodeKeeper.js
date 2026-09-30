'use strict';

const { readFile, writeFile } = require('node:fs/promises');
const { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } = require('ethers');
require('dotenv').config();

const REGISTRY_ABI = [
  'function monthChallenges(uint256) view returns (bytes32)',
  'function heartbeat(uint256,uint256,bytes32,bytes32,uint256,string)',
  'function recordNodeCheck(uint256,uint256,bytes32,bytes32,uint256)',
];

function normalizePrivateKey(value) {
  const key = String(value || '').trim();
  if (/^[a-fA-F0-9]{64}$/.test(key)) return `0x${key}`;
  if (/^0x[a-fA-F0-9]{64}$/.test(key)) return key;
  throw new Error('NODE_PRIVATE_KEY must be 64 hex characters, optionally prefixed with 0x');
}

function normalizeCid(value) {
  const cid = String(value || '').trim();
  return cid.startsWith('ipfs://') ? cid.slice(7) : cid;
}

async function loadCommunityCids({ indexPath = 'bignuten-community-index.json', limit = 25 } = {}) {
  try {
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    return [...new Set((index.shares || []).map(entry => normalizeCid(entry.cid)).filter(Boolean))].slice(0, limit);
  } catch {
    return [];
  }
}

async function pinCids(cids, { apiUrl = 'http://127.0.0.1:5001', fetchImpl = fetch } = {}) {
  const pinned = [];
  for (const cid of cids.map(normalizeCid).filter(Boolean)) {
    const response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}/api/v0/pin/add?arg=${encodeURIComponent(cid)}&recursive=true`, { method: 'POST' });
    if (!response.ok) throw new Error(`Could not pin ${cid} (${response.status})`);
    pinned.push(cid);
  }
  return pinned;
}

async function sampleCids(cids, { apiUrl = 'http://127.0.0.1:5001', fetchImpl = fetch } = {}) {
  const results = [];
  for (const cid of cids.map(normalizeCid).filter(Boolean)) {
    const response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}/api/v0/cat?arg=${encodeURIComponent(cid)}`, { method: 'POST' });
    if (!response.ok) throw new Error(`Could not retrieve ${cid} (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error(`CID ${cid} returned no data`);
    results.push({ cid, size: bytes.length });
  }
  return results;
}

function createSampleProofHash(results) {
  if (!Array.isArray(results) || results.length === 0) throw new Error('At least one CID sample is required');
  return keccak256(toUtf8Bytes(JSON.stringify(results)));
}

async function submitNodeCheck({ rpcUrl, privateKey, registryAddress, nodeId, month, cids, apiUrl, softwareVersion, checkMode = 'checker' }) {
  if (!cids.length) throw new Error('No community CIDs are available for the sample');
  await pinCids(cids, { apiUrl });
  const samples = await sampleCids(cids, { apiUrl });
  const provider = new JsonRpcProvider(rpcUrl, 8453);
  const signer = new Wallet(normalizePrivateKey(privateKey), provider);
  const registry = new Contract(registryAddress, REGISTRY_ABI, signer);
  const challengeHash = await registry.monthChallenges(month);
  if (challengeHash === `0x${'0'.repeat(64)}`) throw new Error('No active challenge is configured for this month');
  const proofHash = createSampleProofHash(samples);
  const transaction = checkMode === 'operator'
    ? await registry.heartbeat(nodeId, month, challengeHash, proofHash, samples.length, softwareVersion)
    : await registry.recordNodeCheck(nodeId, month, challengeHash, proofHash, samples.length);
  return { transactionHash: transaction.hash, checkMode, challengeHash, proofHash, samples };
}

async function main() {
  const required = name => {
    const value = String(process.env[name] || '').trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const cids = await loadCommunityCids({
    indexPath: process.env.BIGNUTEN_COMMUNITY_INDEX || 'bignuten-community-index.json',
    limit: Number(process.env.BIGNUTEN_SAMPLE_LIMIT || 25),
  });
  const command = process.argv[2] || 'checker';
  if (command === 'sample-cids') {
    console.log(JSON.stringify({ cids }, null, 2));
    return;
  }
  const result = await submitNodeCheck({
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    privateKey: process.env.NODE_PRIVATE_KEY || required('PRIVATE_KEY'),
    registryAddress: required('BIGNUTEN_NETWORK_REGISTRY_ADDRESS'),
    nodeId: required('BIGNUTEN_NODE_ID'),
    month: process.env.BIGNUTEN_NETWORK_MONTH || new Date().toISOString().slice(0, 7).replace('-', ''),
    cids,
    apiUrl: process.env.IPFS_API_URL || 'http://127.0.0.1:5001',
    softwareVersion: process.env.IPFS_SOFTWARE_VERSION || 'kubo/ipfs-desktop',
    checkMode: command === 'heartbeat' ? 'operator' : 'checker',
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = { createSampleProofHash, loadCommunityCids, normalizePrivateKey, pinCids, sampleCids, submitNodeCheck };
