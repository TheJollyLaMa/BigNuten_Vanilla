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
  const session = window._lighthouseSessionRef || window._pinataSessionRef || null;
  if (!session) return null;
  const token = session.jwt || session.apiKey || session.authToken || null;
  if (!token) return null;
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
  window._lighthouseSessionRef = {
    jwt: token,
    apiKey: token,
    authToken: token,
    publicKey: session.publicKey || 'pinata',
    identity: session.identity || 'Pinata',
    signedMessage: session.signedMessage || token,
    manualToken: !!session.manualToken,
    createdAt: new Date().toISOString(),
  };
  window._pinataSessionRef = window._lighthouseSessionRef;
  return window._lighthouseSessionRef;
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

export async function connectPinataSession() {
  return ensureSession({ promptIfMissing: true });
}

export async function restorePinataSession() {
  return ensureSession({ promptIfMissing: false });
}

export function clearPinataSession() {
  window._lighthouseSessionRef = null;
  window._pinataSessionRef = null;
}

export function pinataGatewayUrl(cid) {
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
  const cid = extractHash(body);
  if (!cid) throw new Error('Pinata upload did not return a CID.');

  if (session.manualToken) {
    clearPinataSession();
    clearManualPinataToken();
  }

  return { cid: String(cid), session };
}

export async function fetchSnapshotData(cid, { session: providedSession = null } = {}) {
  const trimmedCid = String(cid || '').trim();
  if (!trimmedCid) throw new Error('No CID provided.');

  const fetchViaGateway = async () => {
    const response = await fetch(pinataGatewayUrl(trimmedCid));
    if (!response.ok) return null;
    const text = await response.text();
    try {
      return unwrapSnapshotPayload(JSON.parse(text));
    } catch {
      return unwrapSnapshotPayload(text);
    }
  };

  const session = providedSession || await ensureSession({ promptIfMissing: false });
  if (session?.authToken || session?.jwt || session?.apiKey) {
    try {
      const response = await fetch(pinataGatewayUrl(trimmedCid), {
        headers: createPinataHeaders(session.authToken || session.jwt || session.apiKey),
      });
      if (response.ok) {
        const text = await response.text();
        try {
          return unwrapSnapshotPayload(JSON.parse(text));
        } catch {
          return unwrapSnapshotPayload(text);
        }
      }
    } catch (err) {
      console.warn('[Pinata] authenticated snapshot fetch failed:', err);
    }
  }

  const gatewayPayload = await fetchViaGateway();
  if (gatewayPayload !== null) return gatewayPayload;

  throw new Error('Failed to fetch from Pinata gateway.');
}

export const getManualLighthouseToken = getManualPinataToken;
export const setManualLighthouseToken = setManualPinataToken;
export const clearManualLighthouseToken = clearManualPinataToken;
export const connectLighthouseSession = connectPinataSession;
export const restoreLighthouseSession = restorePinataSession;
export const clearLighthouseSession = clearPinataSession;
export const lighthouseGatewayUrl = pinataGatewayUrl;
export const uploadEncryptedSnapshot = uploadPinnedSnapshot;
