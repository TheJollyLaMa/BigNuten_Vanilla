const test = require('node:test');
const assert = require('node:assert/strict');
const { createNonceStore, createStorageRelayServer, buildAuthorizationMessage } = require('../services/storageRelay');

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
