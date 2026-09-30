'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  Contract,
  isAddress,
  JsonRpcProvider,
  Wallet,
  keccak256,
} = require('ethers');
require('dotenv').config();

const MAX_METADATA_BYTES = 128 * 1024;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const DEFAULT_RELAY_URL = 'https://bignuten-vanilla.onrender.com';
const DEFAULT_ORIGIN = 'https://thejollylama.github.io';
const DEFAULT_FAVICON_FILENAME = '__bignuten_favicon.png';
const DEFAULT_FAVICON_PATH = path.resolve(__dirname, '../img/BigNuten.png');
const COLLECTION_FILE = 'collection.json';
const JSON_FILE_RE = /^(?:collection|streak-rules|competition-[A-Za-z0-9._-]+|\d+)\.json$/;
const MIME_BY_EXTENSION = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm',
};
const REGISTRY_ABI = [
  'function publishCommunityData(string cid, bytes32 contentHash) returns (uint256 shareId)',
];

function validateMetadataFile(name, bytes) {
  if (!/^[A-Za-z0-9._-]+\.json$/.test(name)) throw new Error(`Invalid metadata filename: ${name}`);
  if (bytes.length === 0 || bytes.length > MAX_METADATA_BYTES) throw new Error(`${name} must be 1-${MAX_METADATA_BYTES} bytes`);
  let document;
  try {
    document = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`${name} is not valid JSON`);
  }
  if (!document || Array.isArray(document) || typeof document !== 'object') throw new Error(`${name} must contain a JSON object`);
  if (/<(?:image-cid|artifact-cid|commit-hash|contract-address|token-id)>/i.test(bytes.toString('utf8'))) {
    throw new Error(`${name} still contains a template placeholder`);
  }
  return document;
}

function validateStreakRules(document) {
  if (document.schema !== 'bignuten-streak-rules/v1' || !Array.isArray(document.metrics) || document.metrics.length === 0 || document.metrics.length > 8) {
    throw new Error('streak-rules.json must use bignuten-streak-rules/v1 and define 1-8 metrics');
  }
  const metricIds = new Set();
  for (const metric of document.metrics) {
    if (!metric || !['hydration', 'weight', 'exercise', 'nutrition'].includes(metric.type)) throw new Error('Streak metric type is unsupported');
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(String(metric.id || '')) || metricIds.has(metric.id)) throw new Error('Streak metric IDs must be unique short slugs');
    if (!['daily', 'weekly'].includes(metric.cadence)) throw new Error(`Streak metric ${metric.id} needs daily or weekly cadence`);
    if (!Number.isFinite(metric.target) || metric.target <= 0) throw new Error(`Streak metric ${metric.id} needs a positive target`);
    if (metric.type === 'exercise' && !String(metric.exerciseType || '').trim()) throw new Error(`Streak exercise metric ${metric.id} needs an exerciseType`);
    metricIds.add(metric.id);
  }
  if (!document.metrics.some(metric => metric.cadence === 'daily')) throw new Error('At least one daily metric is required to calculate qualifying days');
  if (document.requiredActivityDays != null && (!Number.isInteger(document.requiredActivityDays) || document.requiredActivityDays < 1 || document.requiredActivityDays > 30)) {
    throw new Error('requiredActivityDays must be between 1 and 30');
  }
  return document;
}

function resolveMetadataAssets(file, mediaCids) {
  const document = structuredClone(file.document);
  for (const [sourceKey, targetKey] of [['imageFile', 'image'], ['animationFile', 'animation_url']]) {
    const referencedFile = document[sourceKey];
    if (!referencedFile) continue;
    const cid = mediaCids.get(referencedFile);
    if (!cid) throw new Error(`${file.name} asset ${referencedFile} was not pinned before its metadata`);
    document[targetKey] = `ipfs://${cid}`;
    delete document[sourceKey];
  }
  const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
  if (bytes.length > MAX_METADATA_BYTES) throw new Error(`${file.name} exceeds the JSON upload limit after CID expansion`);
  return bytes;
}

async function loadMetadataFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  let needsDefaultFavicon = false;
  for (const entry of entries) {
    if (entry.isDirectory()) throw new Error(`Nested metadata folders are not supported: ${entry.name}`);
    if (!entry.isFile()) continue;
    if (entry.name !== COLLECTION_FILE && !/^\d+\.json$/.test(entry.name)) {
      if (!/^streak-rules\.json$/.test(entry.name) && !/^competition-[A-Za-z0-9._-]+\.json$/.test(entry.name) && !MIME_BY_EXTENSION[path.extname(entry.name).toLowerCase()]) {
        throw new Error(`Unexpected metadata filename: ${entry.name}`);
      }
    }
    const bytes = await fs.readFile(path.join(directory, entry.name));
    const extension = path.extname(entry.name).toLowerCase();
    const isJson = extension === '.json';
    const mimeType = isJson ? 'application/json' : MIME_BY_EXTENSION[extension];
    const maximumSize = isJson ? MAX_METADATA_BYTES : MAX_MEDIA_BYTES;
    if (bytes.length === 0 || bytes.length > maximumSize) throw new Error(`${entry.name} exceeds its ${maximumSize}-byte upload limit`);
    const document = isJson ? validateMetadataFile(entry.name, bytes) : null;
    if (entry.name === 'streak-rules.json') validateStreakRules(document);
    if (document && (entry.name === COLLECTION_FILE || /^\d+\.json$/.test(entry.name) || /^competition-[A-Za-z0-9._-]+\.json$/.test(entry.name) || entry.name === 'streak-rules.json')
      && !String(document.image || '').trim() && !String(document.imageFile || '').trim()) {
      document.imageFile = DEFAULT_FAVICON_FILENAME;
      needsDefaultFavicon = true;
    }
    files.push({ name: entry.name, bytes, document, mimeType, isJson });
  }
  if (needsDefaultFavicon) {
    const faviconBytes = await fs.readFile(DEFAULT_FAVICON_PATH);
    const existingFavicon = files.find(file => file.name === DEFAULT_FAVICON_FILENAME);
    if (existingFavicon && !existingFavicon.bytes.equals(faviconBytes)) {
      throw new Error(`${DEFAULT_FAVICON_FILENAME} is reserved for the BigNuten favicon`);
    }
    if (!existingFavicon) {
      files.push({
        name: DEFAULT_FAVICON_FILENAME,
        bytes: faviconBytes,
        document: null,
        mimeType: MIME_BY_EXTENSION['.png'],
        isJson: false,
      });
    }
  }
  files.sort((left, right) => Number(left.isJson) - Number(right.isJson) || left.name.localeCompare(right.name, undefined, { numeric: true }));
  if (!files.some(file => file.name === COLLECTION_FILE)) throw new Error(`Metadata folder must contain ${COLLECTION_FILE}`);
  if (!files.some(file => /^\d+\.json$/.test(file.name))) throw new Error('Metadata folder must contain at least one numbered token file, such as 0.json');
  const fileNames = new Set(files.map(file => file.name));
  for (const file of files.filter(item => item.isJson)) {
    for (const reference of [file.document.imageFile, file.document.animationFile]) {
      if (reference && !fileNames.has(reference)) throw new Error(`${file.name} references missing asset ${reference}`);
    }
  }
  return files;
}

function buildAuthorizationMessage({ wallet, origin, nonce, expiresAt, legacy = false }) {
  return [
    'BigNuten private storage authorization',
    `Wallet: ${wallet.toLowerCase()}`,
    `Origin: ${origin}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    legacy
      ? 'Purpose: request a short-lived Pinata upload URL; the relay never receives file contents.'
      : 'Purpose: request a short-lived Pinata upload URL for public metadata or media; the relay never receives file contents.',
  ].join('\n');
}

function lastJsonLine(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Kubo may emit progress records before the final result.
    }
  }
  throw new Error('IPFS Desktop returned no JSON result');
}

async function uploadThroughPinataRelay(file, { wallet, signer, relayUrl, origin, fetchImpl = fetch }) {
  const headers = { origin, 'content-type': 'application/json' };
  const requestAuthorization = async legacy => {
    const nonceResponse = await fetchImpl(`${relayUrl}/api/storage/nonce`, {
      method: 'POST', headers, body: JSON.stringify({ wallet, origin }),
    });
    if (!nonceResponse.ok) throw new Error(`Storage relay nonce failed (${nonceResponse.status})`);
    const { nonce, expiresAt } = await nonceResponse.json();
    const signature = await signer.signMessage(buildAuthorizationMessage({ wallet, origin, nonce, expiresAt, legacy }));
    const response = await fetchImpl(`${relayUrl}/api/pinata-upload-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ wallet, origin, nonce, expiresAt, signature, name: file.name, size: file.bytes.length, type: file.mimeType }),
    });
    return { response, detail: response.ok ? '' : (await response.text()).slice(0, 500) };
  };
  let authorization = await requestAuthorization(false);
  if (!authorization.response.ok && /Wallet signature does not match wallet/i.test(authorization.detail)) {
    authorization = await requestAuthorization(true);
  }
  if (!authorization.response.ok) {
    throw new Error(`Pinata upload authorization failed (${authorization.response.status}): ${authorization.detail}`);
  }
  const { url } = await authorization.response.json();
  const form = new FormData();
  form.append('file', new Blob([file.bytes], { type: file.mimeType }), file.name);
  form.append('network', 'public');
  const uploadResponse = await fetchImpl(url, { method: 'POST', body: form });
  if (!uploadResponse.ok) throw new Error(`Pinata upload failed (${uploadResponse.status})`);
  const result = await uploadResponse.json();
  const cid = result.IpfsHash || result.cid || result.data?.cid;
  if (!cid) throw new Error(`Pinata response did not include a CID for ${file.name}`);
  return String(cid);
}

async function pinOnLocalDesktop(file, { apiUrl, fetchImpl = fetch }) {
  const form = new FormData();
  form.append('file', new Blob([file.bytes], { type: file.mimeType }), file.name);
  const url = new URL('/api/v0/add', apiUrl);
  url.searchParams.set('cid-version', '1');
  url.searchParams.set('pin', 'true');
  const response = await fetchImpl(url, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`IPFS Desktop add failed for ${file.name} (${response.status})`);
  const result = lastJsonLine(await response.text());
  const cid = result.Hash || result.cid;
  if (!cid) throw new Error(`IPFS Desktop did not return a CID for ${file.name}`);
  return String(cid);
}

async function publishCidsToRegistry(records, { registryAddress, provider, signer }) {
  const registry = new Contract(registryAddress, REGISTRY_ABI, signer.connect(provider));
  const published = [];
  for (const record of records) {
    const transaction = await registry.publishCommunityData(record.pinataUri, keccak256(record.bytes));
    const receipt = await transaction.wait();
    published.push({ cid: record.pinataCid, transactionHash: receipt.hash });
    console.log(`Published ${record.name} CID to community registry: ${receipt.hash}`);
  }
  return published;
}

async function publishMetadata({ directory, outputPath, publishToRegistry = false }) {
  const rawPrivateKey = String(process.env.PRIVATE_KEY || '').trim();
  const privateKey = /^[a-fA-F0-9]{64}$/.test(rawPrivateKey) ? `0x${rawPrivateKey}` : rawPrivateKey;
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) throw new Error('PRIVATE_KEY must be set in BigNuten_Vanilla/.env');
  const relayUrl = String(process.env.BIGNUTEN_STORAGE_RELAY_URL || DEFAULT_RELAY_URL).replace(/\/$/, '');
  const origin = String(process.env.BIGNUTEN_STORAGE_ORIGIN || DEFAULT_ORIGIN).trim();
  const apiUrl = String(process.env.IPFS_API_URL || 'http://127.0.0.1:5001').replace(/\/$/, '');
  const files = await loadMetadataFiles(directory);
  const registryAddress = String(process.env.BIGNUTEN_NETWORK_REGISTRY_ADDRESS || '').trim();
  if (publishToRegistry && !registryAddress) throw new Error('BIGNUTEN_NETWORK_REGISTRY_ADDRESS is required with --publish-to-registry');
  let registryProvider = null;
  if (publishToRegistry) {
    if (!isAddress(registryAddress)) throw new Error('BIGNUTEN_NETWORK_REGISTRY_ADDRESS must be a valid address');
    registryProvider = new JsonRpcProvider(process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org', 8453);
    if (Number((await registryProvider.getNetwork()).chainId) !== 8453) throw new Error('Registry RPC must point to Base Mainnet');
    if ((await registryProvider.getCode(registryAddress)) === '0x') throw new Error('No contract found at BIGNUTEN_NETWORK_REGISTRY_ADDRESS');
  }
  const signer = new Wallet(privateKey);
  const wallet = signer.address;
  const records = [];
  const mediaCids = new Map();

  for (const file of files) {
    let uploadBytes = file.bytes;
    if (file.isJson) {
      uploadBytes = resolveMetadataAssets(file, mediaCids);
    }
    const uploadFile = { ...file, bytes: uploadBytes };
    const [pinataCid, localCid] = await Promise.all([
      uploadThroughPinataRelay(uploadFile, { wallet, signer, relayUrl, origin }),
      pinOnLocalDesktop(uploadFile, { apiUrl }),
    ]);
    const record = {
      name: file.name,
      pinataCid,
      pinataUri: `ipfs://${pinataCid}`,
      localCid,
      localUri: `ipfs://${localCid}`,
      contentHash: keccak256(uploadBytes),
      bytes: uploadBytes,
    };
    if (!file.isJson) mediaCids.set(file.name, pinataCid);
    records.push(record);
    console.log(`${file.name}: Pinata ${pinataCid}; local IPFS ${localCid}`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    network: 'base',
    publisher: wallet,
    collectionUri: records.find(record => record.name === COLLECTION_FILE).pinataUri,
    streakRulesUri: records.find(record => record.name === 'streak-rules.json')?.pinataUri || null,
    streakRulesUri: records.find(record => record.name === 'streak-rules.json')?.pinataUri || null,
    tokens: records.filter(record => /^\d+\.json$/.test(record.name)).map(record => ({
      tokenId: Number(record.name.slice(0, -5)),
      uri: record.pinataUri,
      pinataCid: record.pinataCid,
      localCid: record.localCid,
      contentHash: record.contentHash,
    })),
    files: records.map(({ bytes, ...record }) => record),
    media: records.filter(record => MIME_BY_EXTENSION[path.extname(record.name).toLowerCase()]).map(record => ({
      name: record.name,
      pinataCid: record.pinataCid,
      localCid: record.localCid,
      contentHash: record.contentHash,
    })),
    publishedToRegistry: [],
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Metadata CID manifest written to ${outputPath}`);
  if (publishToRegistry) {
    output.publishedToRegistry = await publishCidsToRegistry(records, {
      registryAddress,
      provider: registryProvider,
      signer,
    });
    await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  }
  return output;
}

async function main() {
  const args = process.argv.slice(2);
  const publishToRegistry = args.includes('--publish-to-registry');
  const positional = args.filter(arg => !arg.startsWith('--'));
  if (positional.length !== 1) throw new Error('Usage: node scripts/publishDecentMetadata.js <metadata-folder> [--publish-to-registry]');
  const directory = path.resolve(positional[0]);
  const outputPath = path.resolve(process.env.DECENT_METADATA_MANIFEST || 'deployments/decent-metadata-cids.json');
  await publishMetadata({ directory, outputPath, publishToRegistry });
}

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = { buildAuthorizationMessage, lastJsonLine, loadMetadataFiles, publishMetadata, resolveMetadataAssets, validateMetadataFile, validateStreakRules, DEFAULT_FAVICON_FILENAME };
