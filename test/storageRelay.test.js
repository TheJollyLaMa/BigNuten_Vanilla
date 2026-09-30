const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_MEDIA_BYTES, createNonceStore, createStorageRelayServer, buildAuthorizationMessage, validateUploadMetadata } = require('../services/storageRelay');

const wallet = '0x807061DF657A7697c04045dA7d16D941861cAABc';
const origin = 'https://bignuten.example';

function fakePinata() {
  return async () => ({ ok: true, async json() { return { data: 'https://uploads.pinata.example/signed' }; } });
}

test('issues a wallet-and-origin-bound nonce and signs a Pinata URL without receiving content', async () => {
  const nonceStore = createNonceStore();
  let captured;
  const relay = createStorageRelayServer({
    pinataJwt: 'server-only',
    pinataSignUrl: 'https://uploads.pinata.example/sign',
    allowedOrigins: new Set([origin]),
    nonceStore,
    now: () => 1_000_000,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return fakePinata()();
    },
    verifyMessageImpl: async () => wallet,
  });
  const issued = nonceStore.issue({ wallet, origin, now: 1_000_000 });
  const body = {
    wallet,
    origin,
    nonce: issued.nonce,
    expiresAt: issued.expiresAt,
    name: 'private-snapshot.json',
    size: 42,
    type: 'application/json',
    signature: '0xsignature',
  };
  body.signatureMessage = buildAuthorizationMessage(body);
  const url = await relay.signUpload(body);
  assert.equal(url, 'https://uploads.pinata.example/signed');
  assert.equal(captured.options.body.includes('private-snapshot.json'), true);
  assert.equal(captured.options.body.includes('private-data'), false);
  assert.equal(nonceStore.size(), 0);
});

test('rejects a replayed upload authorization', async () => {
  const nonceStore = createNonceStore();
  const relay = createStorageRelayServer({
    pinataJwt: 'server-only',
    pinataSignUrl: 'https://uploads.pinata.example/sign',
    allowedOrigins: new Set([origin]),
    nonceStore,
    fetchImpl: fakePinata(),
    verifyMessageImpl: async () => wallet,
  });
  const issued = nonceStore.issue({ wallet, origin });
  const body = { wallet, origin, nonce: issued.nonce, expiresAt: issued.expiresAt, name: 'snapshot.json', size: 1, type: 'application/json', signature: '0xsignature' };
  await relay.signUpload(body);
  await assert.rejects(() => relay.signUpload(body), /Nonce is missing or expired/);
});

test('allows bounded competition image and video uploads through the same signed URL relay', () => {
  for (const [name, type] of [
    ['badge.png', 'image/png'],
    ['poster.gif', 'image/gif'],
    ['preview.mp4', 'video/mp4'],
  ]) {
    assert.equal(validateUploadMetadata({ name, type, size: MAX_MEDIA_BYTES }), undefined);
  }
  assert.throws(() => validateUploadMetadata({ name: 'badge.mp4', type: 'image/png', size: 1 }), /filename/);
  assert.throws(() => validateUploadMetadata({ name: 'badge.svg', type: 'image/svg+xml', size: 1 }), /not allowed/);
  assert.throws(() => validateUploadMetadata({ name: 'large.mp4', type: 'video/mp4', size: MAX_MEDIA_BYTES + 1 }), /size/);
  assert.throws(() => validateUploadMetadata({ name: '../badge.png', type: 'image/png', size: 1 }), /filename/);
});
