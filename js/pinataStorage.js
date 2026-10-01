function getPinataToken({ strict = true } = {}) {
  const token =
    window.pinataToken ||
    window.PinataToken ||
    window.pinataJWT ||
    window.PinataJWT ||
    null;

  if (!token) {
    const message = '[Pinata] token not available';
    console.warn(message);
    if (strict) {
      throw new Error('Pinata token is not available. Use JSON backup or add your Pinata JWT in Settings.');
    }
    return null;
  }

  return String(token).trim();
}

const PINATA_API_BASE = 'https://api.pinata.cloud';
const PINATA_GATEWAY_BASE = 'https://gateway.pinata.cloud/ipfs/';
const STORAGE_RELAY_URL = window.BIGNUTEN_STORAGE_RELAY_URL || '';
let manualPinataTokenRef = '';

export function getManualPinataToken() {
  return manualPinataTokenRef;
}

export function setManualPinataToken(token) {
  const value = String(token || '').trim();
  manualPinataTokenRef = value;
  return value;
}

export function clearManualPinataToken() {
  manualPinataTokenRef = '';
}

function readSession() {
  const session = window._ipfsSessionRef || null;
  if (!session) return null;
  const token = session.jwt || session.apiKey || session.authToken || null;
  if (!token && !session.relay && !session.desktop) return null;
  return {
    ...session,
    jwt: session.jwt || token,
    apiKey: session.apiKey || token,
    authToken: token,
    manualToken: !!session.manualToken,
  };
}

function saveSession(session) {
  const token = session.jwt || session.apiKey || session.authToken || null;
  window._ipfsSessionRef = {
    ...session,
    jwt: token,
    apiKey: token,
    authToken: token,
    publicKey: session.publicKey || 'ipfs',
    identity: session.identity || 'IPFS',
    signedMessage: session.signedMessage || token,
    manualToken: !!session.manualToken,
    createdAt: new Date().toISOString(),
  };
  return window._ipfsSessionRef;
}

function promptForPinataToken(purpose) {
  if (typeof window.prompt !== 'function') return '';
  return String(window.prompt(`Enter your Pinata JWT to ${purpose}:`, '') || '').trim();
}

function parseMaybeJson(payload) {
  if (typeof payload !== 'string') return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

function extractHash(payload) {
  const value = parseMaybeJson(payload);
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value?.IpfsHash || value?.ipfsHash || value?.Hash || value?.hash || value?.cid || null;
}

function normalizeIpfsRef(ref) {
  const value = String(ref || '').trim();
  if (!value) return '';
  const ipfsMatch = value.match(/(?:ipfs:\/\/|\/ipfs\/)([a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*)/);
  if (ipfsMatch?.[1]) return ipfsMatch[1];
  try {
    const url = new URL(value);
    const pathMatch = url.pathname.match(/\/ipfs\/([^/?#]+)/);
    if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
  } catch {
    /* not a URL */
  }
  return value;
}

function wrapSnapshotPayload(data, snapshotMeta = {}) {
  const lineage = Array.isArray(snapshotMeta.lineage) ? snapshotMeta.lineage.slice(0, 25) : [];
  if (!snapshotMeta || (!snapshotMeta.sessionAddress && !snapshotMeta.previousSnapshot && !lineage.length && !snapshotMeta.sourceHash)) {
    return data;
  }

  return {
    __bignutenSnapshot: true,
    version: 1,
    createdAt: snapshotMeta.createdAt || new Date().toISOString(),
    sessionAddress: snapshotMeta.sessionAddress || '',
    sourceHash: snapshotMeta.sourceHash || '',
    previousSnapshot: snapshotMeta.previousSnapshot || null,
    lineage,
    data,
  };
}

function unwrapSnapshotPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (payload.__bignutenSnapshot && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload.data;
  }
  return payload;
}

async function requestSession() {
  const manualToken = getManualPinataToken() || promptForPinataToken('upload or download a snapshot');
  if (!manualToken) return null;
  setManualPinataToken(manualToken);
  const session = saveSession({ authToken: manualToken, jwt: manualToken, apiKey: manualToken, manualToken: true });
  console.info('[Pinata] manual token session ready', {
    hasToken: true,
    sessionCreatedAt: session.createdAt,
  });
  return session;
}

async function ensureSession({ promptIfMissing = true } = {}) {
  const cached = readSession();
  if (cached) return cached;
  if (!promptIfMissing) return null;
  return requestSession();
}

function createPinataHeaders(token) {
  return {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
  };
}

export async function connectPinataSession({ mode = 'hosted' } = {}) {
  if (mode === 'desktop') {
    const response = await fetch('http://127.0.0.1:5001/api/v0/version');
    if (!response.ok) throw new Error('IPFS Desktop is not reachable. Start IPFS Desktop and allow this site in its CORS settings.');
    return saveSession({ desktop: true, identity: 'IPFS Desktop', publicKey: 'ipfs-desktop' });
  }
  if (mode === 'hosted' && STORAGE_RELAY_URL && window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const wallet = await signer.getAddress();
    return saveSession({
      relay: true,
      signer,
      wallet,
      identity: wallet,
      publicKey: wallet,
    });
  }
  return ensureSession({ promptIfMissing: true });
}

export async function restorePinataSession() {
  return ensureSession({ promptIfMissing: false });
}

export function clearPinataSession() {
  window._ipfsSessionRef = null;
}

export function ipfsGatewayUrl(cid) {
  return `${PINATA_GATEWAY_BASE}${encodeURIComponent(String(cid || '').trim())}`;
}

export async function uploadPinnedSnapshot(data, { fileName = 'bignuten-snapshot.json', snapshotMeta = null } = {}) {
  const session = await requestSession();
  if (!session) throw new Error('Pinata JWT is required to upload snapshots.');

  const payload = wrapSnapshotPayload(data, snapshotMeta || {});
  const response = await fetch(`${PINATA_API_BASE}/pinning/pinJSONToIPFS`, {
    method: 'POST',
    headers: createPinataHeaders(session.authToken || session.jwt || session.apiKey),
    body: JSON.stringify({
      pinataContent: payload,
      pinataMetadata: {
        name: fileName,
      },
      pinataOptions: {
        cidVersion: 1,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Pinata upload failed with HTTP ${response.status}.`);
  }

  const body = await response.text();
  const cid = normalizeIpfsRef(extractHash(body));
  if (!cid) throw new Error('Pinata upload did not return a CID.');

  if (session.manualToken) {
    clearPinataSession();
    clearManualPinataToken();
  }

  return { cid: String(cid), session };
}

export async function uploadViaStorageRelay(data, {
  fileName = 'bignuten-snapshot.json',
  wallet,
  signer,
  relayUrl = STORAGE_RELAY_URL,
  snapshotMeta = null,
} = {}) {
  if (!relayUrl || !wallet || !signer) throw new Error('Storage relay, wallet, and signer are required.');
  const payload = wrapSnapshotPayload(data, snapshotMeta || {});
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const origin = globalThis.location?.origin || 'unknown';
  const nonceResponse = await fetch(`${relayUrl.replace(/\/$/, '')}/api/storage/nonce`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet, origin }),
  });
  if (!nonceResponse.ok) throw new Error(`Storage relay nonce failed (${nonceResponse.status})`);
  const { nonce, expiresAt } = await nonceResponse.json();
  const message = [
    'BigNuten private storage authorization',
    `Wallet: ${wallet.toLowerCase()}`,
    `Origin: ${origin}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    'Purpose: request a short-lived Pinata upload URL for public metadata or media; the relay never receives file contents.',
  ].join('\n');
  const signature = await signer.signMessage(message);
  const signingResponse = await fetch(`${relayUrl.replace(/\/$/, '')}/api/pinata-upload-url`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet, origin, nonce, expiresAt, signature, name: fileName, size: bytes.byteLength, type: 'application/json' }),
  });
  if (!signingResponse.ok) throw new Error(`Storage relay signing failed (${signingResponse.status})`);
  const { url } = await signingResponse.json();
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/json' }), fileName);
  form.append('network', 'public');
  const uploadResponse = await fetch(url, { method: 'POST', body: form });
  if (!uploadResponse.ok) throw new Error(`Pinata upload failed (${uploadResponse.status})`);
  const result = await uploadResponse.json();
  const cid = result.IpfsHash || result.cid || result.data?.cid;
  if (!cid) throw new Error('Pinata upload response did not include a CID.');
  return { cid: String(cid), session: { relay: true, wallet, identity: wallet } };
}

export async function uploadIpfsDesktopSnapshot(data, {
  fileName = 'bignuten-snapshot.json',
  snapshotMeta = null,
  apiUrl = 'http://127.0.0.1:5001',
} = {}) {
  const payload = wrapSnapshotPayload(data, snapshotMeta || {});
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/json' }), fileName);
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/v0/add?cid-version=1&pin=true`, {
    method: 'POST',
    body: form,
  });
  if (!response.ok) throw new Error(`IPFS Desktop upload failed (${response.status})`);
  const result = await response.json();
  const cid = result.Hash || result.cid;
  if (!cid) throw new Error('IPFS Desktop response did not include a CID.');
  return { cid: String(cid), session: { desktop: true, identity: 'IPFS Desktop' } };
}

export async function fetchSnapshotData(cid, { session: providedSession = null } = {}) {
  const trimmedCid = normalizeIpfsRef(cid);
  if (!trimmedCid) throw new Error('No CID provided.');

  const fetchViaGateway = async () => {
    const response = await fetch(ipfsGatewayUrl(trimmedCid));
    if (!response.ok) return null;
    const text = await response.text();
    try {
      return unwrapSnapshotPayload(JSON.parse(text));
    } catch {
      return unwrapSnapshotPayload(text);
    }
  };

  const gatewayPayload = await fetchViaGateway();
  if (gatewayPayload !== null) return gatewayPayload;

  throw new Error('Failed to fetch from Pinata gateway.');
}

export const uploadIpfsSnapshot = uploadPinnedSnapshot;
