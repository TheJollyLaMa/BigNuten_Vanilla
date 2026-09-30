'use strict';

const { createServer } = require('node:http');
const { randomBytes } = require('node:crypto');
const { verifyMessage } = require('ethers');
require('dotenv').config();

const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_METADATA_BYTES = 128 * 1024;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const NONCE_TTL_MS = 5 * 60 * 1000;
const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UPLOAD_TYPES = new Map([
  ['application/json', { extensions: ['.json'], maxBytes: MAX_METADATA_BYTES }],
  ['image/jpeg', { extensions: ['.jpg', '.jpeg'], maxBytes: MAX_MEDIA_BYTES }],
  ['image/png', { extensions: ['.png'], maxBytes: MAX_MEDIA_BYTES }],
  ['image/gif', { extensions: ['.gif'], maxBytes: MAX_MEDIA_BYTES }],
  ['image/webp', { extensions: ['.webp'], maxBytes: MAX_MEDIA_BYTES }],
  ['video/mp4', { extensions: ['.mp4'], maxBytes: MAX_MEDIA_BYTES }],
  ['video/webm', { extensions: ['.webm'], maxBytes: MAX_MEDIA_BYTES }],
]);

function parseAllowedOrigins(value) {
  return new Set(String(value || '').split(',').map(item => item.trim()).filter(Boolean).map(item => new URL(item).origin));
}

function sendJson(response, status, body, origin = '') {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(origin ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}),
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function createNonceStore() {
  const entries = new Map();
  return {
    issue({ wallet, origin, now = Date.now(), ttlMs = NONCE_TTL_MS }) {
      const nonce = randomBytes(24).toString('hex');
      entries.set(nonce, { wallet: wallet.toLowerCase(), origin, expiresAt: now + ttlMs });
      return { nonce, expiresAt: now + ttlMs };
    },
    consume(nonce, expected, now = Date.now()) {
      const entry = entries.get(nonce);
      entries.delete(nonce);
      if (!entry || entry.expiresAt <= now) throw new Error('Nonce is missing or expired');
      if (entry.wallet !== expected.wallet.toLowerCase() || entry.origin !== expected.origin) {
        throw new Error('Nonce binding does not match the wallet and origin');
      }
      return entry;
    },
    size() { return entries.size; },
  };
}

function buildAuthorizationMessage({ wallet, origin, nonce, expiresAt }) {
  return [
    'BigNuten private storage authorization',
    `Wallet: ${wallet.toLowerCase()}`,
    `Origin: ${origin}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    'Purpose: request a short-lived Pinata upload URL for public metadata or media; the relay never receives file contents.',
  ].join('\n');
}

function validateUploadMetadata(body) {
  const type = UPLOAD_TYPES.get(String(body?.type || '').toLowerCase());
  const name = String(body?.name || '');
  if (!type) throw new Error('Upload type is not allowed');
  if (!FILE_NAME_RE.test(name) || !type.extensions.some(extension => name.toLowerCase().endsWith(extension))) {
    throw new Error('Invalid upload filename for content type');
  }
  if (!Number.isInteger(body.size) || body.size < 1 || body.size > type.maxBytes) throw new Error('Invalid upload size');
}

function createStorageRelayServer({ pinataSignUrl, pinataJwt, allowedOrigins, nonceStore = createNonceStore(), fetchImpl = fetch, now = () => Date.now(), verifyMessageImpl = verifyMessage } = {}) {
  if (!pinataJwt) throw new Error('PINATA_JWT is required');
  if (!pinataSignUrl) throw new Error('PINATA_SIGN_URL is required');
  if (!(allowedOrigins instanceof Set) || allowedOrigins.size === 0) throw new Error('At least one allowed origin is required');

  async function signUpload(body) {
    validateUploadMetadata(body);
    const origin = new URL(body.origin).origin;
    if (!allowedOrigins.has(origin)) throw new Error('Origin is not allowed');
    if (!/^0x[a-fA-F0-9]{40}$/.test(body.wallet)) throw new Error('Invalid wallet');
    nonceStore.consume(body.nonce, { wallet: body.wallet, origin }, now());
    const message = buildAuthorizationMessage(body);
    const recovered = await verifyMessageImpl(message, body.signature);
    if (recovered.toLowerCase() !== body.wallet.toLowerCase()) throw new Error('Wallet signature does not match wallet');

    const response = await fetchImpl(pinataSignUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${pinataJwt}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        network: 'public',
        date: Math.floor(now() / 1000),
        expires: 60,
        max_file_size: body.size,
        mime_types: [body.type],
        filename: body.name,
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400);
      throw new Error(`Pinata signing failed (${response.status}): ${detail}`);
    }
    const result = await response.json();
    const url = result.data || result.url;
    if (!url) throw new Error('Pinata did not return a signed upload URL');
    return url;
  }

  return {
    server: createServer(async (request, response) => {
      const requestUrl = new URL(request.url, 'http://localhost');
      const requestOrigin = String(request.headers.origin || '');
      const origin = requestOrigin ? new URL(requestOrigin).origin : '';
      const corsOrigin = allowedOrigins.has(origin) ? origin : '';
      try {
        if (request.method === 'OPTIONS') {
          response.writeHead(corsOrigin ? 204 : 403, corsOrigin ? {
            'access-control-allow-origin': corsOrigin,
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-headers': 'content-type',
            vary: 'origin',
          } : {});
          response.end();
          return;
        }
        if (request.method === 'GET' && requestUrl.pathname === '/health') {
          sendJson(response, 200, { ok: true, service: 'bignuten-storage-relay' });
          return;
        }
        if (request.method === 'POST' && requestUrl.pathname === '/api/storage/nonce') {
          if (!corsOrigin) throw new Error('Origin is not allowed');
          const body = await readJson(request);
          const requestOriginValue = new URL(body.origin).origin;
          if (requestOriginValue !== corsOrigin) throw new Error('Origin does not match request origin');
          if (!/^0x[a-fA-F0-9]{40}$/.test(body.wallet)) throw new Error('Invalid wallet');
          sendJson(response, 200, nonceStore.issue({ wallet: body.wallet, origin: corsOrigin }), corsOrigin);
          return;
        }
        if (request.method === 'POST' && requestUrl.pathname === '/api/pinata-upload-url') {
          if (!corsOrigin) throw new Error('Origin is not allowed');
          const body = await readJson(request);
          const url = await signUpload(body);
          sendJson(response, 200, { url }, corsOrigin);
          return;
        }
        sendJson(response, 404, { error: 'Not found' }, corsOrigin);
      } catch (error) {
        sendJson(response, 400, { error: error.message }, corsOrigin);
      }
    }),
    signUpload,
    nonceStore,
  };
}

function createConfiguredServer() {
  return createStorageRelayServer({
    pinataJwt: process.env.PINATA_JWT,
    pinataSignUrl: process.env.PINATA_SIGN_URL || 'https://uploads.pinata.cloud/v3/files/sign',
    allowedOrigins: parseAllowedOrigins(process.env.BIGNUTEN_STORAGE_ALLOWED_ORIGINS),
  });
}

if (require.main === module) {
  const { server } = createConfiguredServer();
  const port = Number(process.env.PORT || 8787);
  server.listen(port, '0.0.0.0', () => console.log(`BigNuten storage relay listening on ${port}`));
}

module.exports = {
  MAX_METADATA_BYTES,
  MAX_MEDIA_BYTES,
  buildAuthorizationMessage,
  createNonceStore,
  createStorageRelayServer,
  parseAllowedOrigins,
  UPLOAD_TYPES,
  validateUploadMetadata,
};
