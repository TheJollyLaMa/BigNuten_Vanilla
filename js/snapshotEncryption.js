import { validateFitnessSnapshot } from './fitnessSchema.js';

export const SNAPSHOT_ENCRYPTION_FORMAT = 'bignuten-encrypted-snapshot';
export const SNAPSHOT_ENCRYPTION_PURPOSE = 'BigNuten snapshot encryption key v1\nAddress: {address}\nThis signature only unlocks your own backups.';
const HKDF_SALT = new TextEncoder().encode('BigNuten snapshot encryption HKDF salt v1');
const keyCache = new Map();

function webCrypto() {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle || !crypto?.getRandomValues) throw new Error('Secure browser cryptography is unavailable. Use a current browser; local JSON backup remains available.');
  return crypto;
}

function encodeBase64(bytes) {
  if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

function decodeBase64(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Encrypted snapshot contains invalid base64 data.');
  }
  if (typeof atob === 'function') return Uint8Array.from(atob(value), char => char.charCodeAt(0));
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function signatureBytes(signature) {
  if (typeof signature !== 'string' || !/^0x(?:[0-9a-f]{2})+$/i.test(signature)) throw new Error('Wallet returned an invalid signature; no upload was made.');
  return Uint8Array.from(signature.slice(2).match(/.{2}/g), pair => parseInt(pair, 16));
}

function purposeMessage(address) {
  return SNAPSHOT_ENCRYPTION_PURPOSE.replace('{address}', address);
}

function aadFor(address) {
  return new TextEncoder().encode(`BigNuten encrypted snapshot address v1\n${address}`);
}

async function signerAddress(signer) {
  if (!signer || typeof signer.getAddress !== 'function' || typeof signer.signMessage !== 'function') {
    throw new Error('Connect a wallet that can sign messages to encrypt or restore an IPFS snapshot. Local JSON backup remains available.');
  }
  const address = await signer.getAddress();
  if (typeof address !== 'string' || !/^0x[0-9a-f]{40}$/i.test(address)) throw new Error('Wallet returned an invalid address.');
  return address;
}

async function deriveKey(signature, message) {
  const material = await webCrypto().subtle.importKey('raw', signatureBytes(signature), 'HKDF', false, ['deriveKey']);
  return webCrypto().subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: new TextEncoder().encode(message) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function keyForSigner(signer, { checkDeterminism = false, expectedAddress = '' } = {}) {
  const address = await signerAddress(signer);
  if (expectedAddress && address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(`This encrypted snapshot belongs to wallet ${expectedAddress}. Connect that wallet to restore it.`);
  }
  const cacheKey = address.toLowerCase();
  const cached = keyCache.get(cacheKey);
  if (cached && (!checkDeterminism || cached.deterministicVerified)) return { address, key: cached.key };
  const message = purposeMessage(address);
  const firstSignature = await signer.signMessage(message);
  const firstBytes = signatureBytes(firstSignature);
  if (checkDeterminism) {
    const secondSignature = await signer.signMessage(message);
    const secondBytes = signatureBytes(secondSignature);
    if (firstSignature.toLowerCase() !== secondSignature.toLowerCase() || firstBytes.length !== secondBytes.length || firstBytes.some((byte, index) => byte !== secondBytes[index])) {
      throw new Error('This wallet returned different signatures for the same backup key request. Remote upload was cancelled; your local JSON backup is still available.');
    }
  }
  const key = await deriveKey(firstSignature, message);
  keyCache.set(cacheKey, { key, deterministicVerified: !!checkDeterminism });
  return { address, key };
}

export function isEncryptedSnapshotEnvelope(value) {
  return !!value && typeof value === 'object' && value.format === SNAPSHOT_ENCRYPTION_FORMAT;
}

export async function encryptFitnessSnapshot(snapshot, signer) {
  const data = validateFitnessSnapshot(snapshot);
  const crypto = webCrypto();
  const { address, key } = await keyForSigner(signer, { checkDeterminism: true });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aadFor(address), tagLength: 128 },
    key,
    plaintext,
  );
  return {
    format: SNAPSHOT_ENCRYPTION_FORMAT,
    version: 1,
    alg: 'AES-GCM',
    kdf: 'HKDF-SHA256',
    address,
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptFitnessSnapshot(envelope, signer) {
  if (!isEncryptedSnapshotEnvelope(envelope) || envelope.version !== 1 || envelope.alg !== 'AES-GCM' || envelope.kdf !== 'HKDF-SHA256') {
    throw new Error('Unsupported or incomplete encrypted snapshot envelope.');
  }
  if (typeof envelope.address !== 'string' || !/^0x[0-9a-f]{40}$/i.test(envelope.address)) throw new Error('Encrypted snapshot has an invalid wallet address.');
  const iv = decodeBase64(envelope.iv);
  const ciphertext = decodeBase64(envelope.ciphertext);
  if (iv.length !== 12 || ciphertext.length < 16) throw new Error('Encrypted snapshot is incomplete or damaged.');
  const { key } = await keyForSigner(signer, { expectedAddress: envelope.address });
  try {
    const plaintext = await webCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aadFor(envelope.address), tagLength: 128 },
      key,
      ciphertext,
    );
    return validateFitnessSnapshot(JSON.parse(new TextDecoder().decode(plaintext)));
  } catch {
    throw new Error('Snapshot decryption failed. The ciphertext may be damaged or tampered with; no local data was changed.');
  }
}

export function clearSnapshotEncryptionKeyCache() {
  keyCache.clear();
}
