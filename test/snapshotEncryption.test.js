'use strict';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { Wallet } = require('ethers');

const original = Object.fromEntries(['crypto', 'window', 'fetch', 'localStorage', 'sessionStorage', 'requestIdleCallback'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let encryption, transport, validateFitnessSnapshot;
const sample = { dataVersion: 1, weightLogs: [{ weight: 72 }], exercises: { types: ['Push-ups'], entries: [] }, waterDailyHistory: { '2026-10-28': 3 } };
const walletA = new Wallet('0x' + '11'.repeat(32));
const walletB = new Wallet('0x' + '22'.repeat(32));
const signerFor = wallet => ({ getAddress: () => wallet.getAddress(), signMessage: message => wallet.signMessage(message) });

before(async () => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  global.window = { BIGNUTEN_STORAGE_RELAY_URL: '', prompt: () => '' };
  global.requestIdleCallback = callback => callback();
  encryption = await import('../js/snapshotEncryption.js');
  ({ validateFitnessSnapshot } = await import('../js/fitnessSchema.js'));
  transport = await import('../js/pinataStorage.js');
});
beforeEach(() => {
  encryption.clearSnapshotEncryptionKeyCache();
  global.fetch = async () => { throw new Error('Unexpected remote request'); };
  window._ipfsSessionRef = null;
  transport.clearManualPinataToken();
});
after(() => {
  transport.clearManualPinataToken();
  for (const [key, descriptor] of Object.entries(original)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});

test('encrypts and decrypts with a versioned AES-GCM envelope and a wallet signature', async () => {
  let calls = 0;
  const signer = { getAddress: signerFor(walletA).getAddress, signMessage: message => { calls++; return walletA.signMessage(message); } };
  const envelope = await encryption.encryptFitnessSnapshot(sample, signer);
  assert.deepEqual(Object.keys(envelope), ['format', 'version', 'alg', 'kdf', 'address', 'iv', 'ciphertext']);
  assert.equal(envelope.format, 'bignuten-encrypted-snapshot');
  assert.equal(envelope.version, 1);
  assert.equal(envelope.alg, 'AES-GCM');
  assert.equal(envelope.kdf, 'HKDF-SHA256');
  assert.equal(envelope.address, walletA.address);
  assert.equal(Buffer.from(envelope.iv, 'base64').length, 12);
  assert.equal(calls, 2, 'the first encrypted upload key requires two matching wallet signatures');
  assert.deepEqual(await encryption.decryptFitnessSnapshot(envelope, signer), validateFitnessSnapshot(sample));
  const nextEnvelope = await encryption.encryptFitnessSnapshot(sample, signer);
  assert.notEqual(nextEnvelope.iv, envelope.iv, 'every upload gets a fresh random IV');
  assert.equal(calls, 2, 'the derived key is reused in memory');
});

test('rejects a wrong wallet before decrypting or writing local data', async () => {
  const envelope = await encryption.encryptFitnessSnapshot(sample, signerFor(walletA));
  let wrongWalletSignatures = 0;
  const wrongSigner = { getAddress: signerFor(walletB).getAddress, signMessage: message => { wrongWalletSignatures++; return walletB.signMessage(message); } };
  await assert.rejects(() => encryption.decryptFitnessSnapshot(envelope, wrongSigner), /belongs to wallet.*Connect that wallet/i);
  assert.equal(wrongWalletSignatures, 0);
});

test('rejects authenticated-ciphertext tampering with a clear error', async () => {
  const envelope = await encryption.encryptFitnessSnapshot(sample, signerFor(walletA));
  const bytes = Buffer.from(envelope.ciphertext, 'base64');
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(() => encryption.decryptFitnessSnapshot({ ...envelope, ciphertext: bytes.toString('base64') }, signerFor(walletA)), /decryption failed.*tampered/i);
});

test('wrong-wallet and tampered CID restores reject before any local recovery or profile writes', async () => {
  const envelope = await encryption.encryptFitnessSnapshot(sample, signerFor(walletA));
  const tamperedBytes = Buffer.from(envelope.ciphertext, 'base64');
  tamperedBytes[tamperedBytes.length - 1] ^= 1;
  const tampered = { ...envelope, ciphertext: tamperedBytes.toString('base64') };
  const values = new Map([['fitnessTrackerData', '{ exact original bytes }']]);
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  global.localStorage = storage;
  try {
    const fitness = await import('../js/fitnessData.js');
    window.ethereum = {};
    for (const [payload, signer, message] of [
      [envelope, signerFor(walletB), /belongs to wallet/i],
      [tampered, signerFor(walletA), /decryption failed.*no local data was changed/i],
    ]) {
      const before = new Map(values);
      window.ethers = { BrowserProvider: class { async getSigner() { return signer; } } };
      global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(payload) });
      await assert.rejects(() => fitness.importAndMergeFromCID('bafy-encrypted-test'), message);
      assert.deepEqual(values, before);
      assert.equal(values.has('bignutenRecoveryUndo.v1'), false);
    }
  } finally {
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage);
    else delete globalThis.localStorage;
  }
});

test('legacy plaintext IPFS snapshots remain restorable without wallet signing', async () => {
  global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(sample) });
  const restored = await transport.fetchSnapshotData('bafy-legacy', { session: null });
  assert.deepEqual(restored, sample);
});

test('refuses remote upload when a wallet returns non-deterministic signatures', async () => {
  let signatures = 0;
  let networkRequests = 0;
  const signer = {
    getAddress: async () => walletA.address,
    signMessage: async () => `0x${String(++signatures).padStart(2, '0')}`.padEnd(132, 'a'),
  };
  global.fetch = async () => { networkRequests++; throw new Error('must not upload'); };
  await assert.rejects(() => transport.uploadIpfsDesktopSnapshot(sample, { signer }), /different signatures.*upload was cancelled.*local JSON backup/i);
  assert.equal(networkRequests, 0);
});

test('Pinata JWT never appears in uploaded snapshot JSON or serialized snapshot output', async () => {
  const jwt = 'synthetic-pinata-jwt-never-serialize';
  window.prompt = () => jwt;
  let serializedUpload = '';
  global.fetch = async (_url, options) => {
    serializedUpload = options.body;
    return { ok: true, status: 200, text: async () => JSON.stringify({ IpfsHash: 'bafy-encrypted' }) };
  };
  await transport.uploadPinnedSnapshot(sample, { signer: signerFor(walletA) });
  assert.ok(serializedUpload);
  assert.equal(serializedUpload.includes(jwt), false);
  const remotePayload = JSON.parse(serializedUpload).pinataContent;
  assert.equal(remotePayload.format, 'bignuten-encrypted-snapshot');
  assert.equal(JSON.stringify(remotePayload).includes(jwt), false);
  assert.equal(JSON.stringify({ snapshot: remotePayload, hash: 'synthetic-hash' }).includes(jwt), false);
});


test('JWT storage is session-scoped by default and localStorage persistence requires explicit opt-in', () => {
  const sessionValues = new Map(), localValues = new Map();
  const storage = values => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) });
  global.sessionStorage = storage(sessionValues);
  global.localStorage = storage(localValues);
  const jwt = 'synthetic-session-only-pinata-jwt';
  transport.setManualPinataToken(jwt);
  assert.equal(transport.getManualPinataToken(), jwt);
  assert.equal(sessionValues.get('bignuten.pinata.jwt.session'), jwt);
  assert.equal(localValues.has('bignuten.pinata.jwt.persisted'), false);
  transport.setManualPinataToken(jwt, { persist: true });
  assert.equal(localValues.get('bignuten.pinata.jwt.persisted'), jwt);
  assert.equal(transport.isManualPinataTokenPersistent(), true);
  transport.clearManualPinataToken();
  assert.equal(sessionValues.has('bignuten.pinata.jwt.session'), false);
  assert.equal(localValues.has('bignuten.pinata.jwt.persisted'), false);
});
