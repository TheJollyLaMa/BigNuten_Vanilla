function getEthers() {
  if (!window.ethers) throw new Error('ethers is not available.');
  return window.ethers;
}

function getLighthouse({ strict = true } = {}) {
  const lighthouse =
    window.lighthouse ||
    window.Lighthouse ||
    window.LighthouseWeb3 ||
    window.lighthouseWeb3 ||
    null;

  if (lighthouse && !window.lighthouse) {
    window.lighthouse = lighthouse;
  }

  if (!lighthouse) {
    const message = '[Lighthouse] SDK not available';
    console.warn(message, {
      hasLower: !!window.lighthouse,
      hasUpper: !!window.Lighthouse,
      hasUpperWeb3: !!window.LighthouseWeb3,
      hasLowerWeb3: !!window.lighthouseWeb3,
    });
    if (strict) {
      throw new Error('Lighthouse SDK is not available. Use JSON backup or reload the page.');
    }
    return null;
  }

  return lighthouse;
}

const LIGHTHOUSE_AUTH_BASE = 'https://encryption.lighthouse.storage';
const LIGHTHOUSE_OLD_AUTH_BASE = 'https://api.lighthouse.storage';
const LIGHTHOUSE_IPFS_GATEWAY_BASE = 'https://electric-halibut-ovtd2.lighthouseweb3.xyz/ipfs/';
let manualLighthouseTokenRef = '';

export function getManualLighthouseToken() {
  return manualLighthouseTokenRef;
}

export function setManualLighthouseToken(token) {
  const value = String(token || '').trim();
  if (value) {
    manualLighthouseTokenRef = value;
  } else {
    manualLighthouseTokenRef = '';
  }
  return value;
}

export function clearManualLighthouseToken() {
  manualLighthouseTokenRef = '';
}

function readSession() {
  const session = window._lighthouseSessionRef || null;
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
  const manualToken = !!session.manualToken || !!session.authToken && !session.signedMessage && !session.jwt;
  window._lighthouseSessionRef = {
    jwt: token,
    apiKey: token,
    authToken: token,
    publicKey: session.publicKey,
    signedMessage: session.signedMessage,
    manualToken,
    createdAt: new Date().toISOString(),
  };
  return window._lighthouseSessionRef;
}

function promptForLighthouseToken(purpose) {
  if (typeof window.prompt !== 'function') return '';
  const value = window.prompt(`Enter your Lighthouse API key to ${purpose}:`, '');
  return String(value || '').trim();
}

function parseMaybeJson(payload) {
  if (typeof payload !== 'string') return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

function extractAuthMessage(payload) {
  const value = parseMaybeJson(payload);
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return first?.message || first?.data?.message || first?.data || first?.result || null;
  }
  return value?.data?.message || value?.message || value?.data || value?.result || null;
}

function extractJwtToken(payload) {
  const value = parseMaybeJson(payload);
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return first?.token || first?.JWT || first?.jwt || first?.data?.token || first?.data?.JWT || first?.data?.jwt || null;
  }
  const nested = value?.data?.token
    ?? value?.data?.JWT
    ?? value?.data?.jwt
    ?? value?.token
    ?? value?.JWT
    ?? value?.jwt
    ?? null;
  return nested && nested !== value ? extractJwtToken(nested) : nested;
}

async function requestAuthMessage(publicKey, lighthouse) {
  if (lighthouse && typeof lighthouse.getAuthMessage === 'function') {
    const authResponse = await lighthouse.getAuthMessage(publicKey);
    const message = extractAuthMessage(authResponse);
    if (message) return message;
  }

  const endpoints = [
    `${LIGHTHOUSE_AUTH_BASE}/api/message/${encodeURIComponent(publicKey)}`,
    `${LIGHTHOUSE_OLD_AUTH_BASE}/api/auth/get_message?publicKey=${encodeURIComponent(publicKey)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) continue;
      const body = await response.text();
      const message = extractAuthMessage(body);
      if (message) return message;
    } catch (err) {
      console.warn('[Lighthouse] Auth message fetch failed:', endpoint, err);
    }
  }

  return null;
}

async function requestJwt(publicKey, signedMessage, lighthouse) {
  if (lighthouse && typeof lighthouse.getJWT === 'function') {
    const jwtResponse = await lighthouse.getJWT(publicKey, signedMessage);
    const token = extractJwtToken(jwtResponse);
    if (token) return token;
  }

  const response = await fetch(`${LIGHTHOUSE_AUTH_BASE}/api/message/get-jwt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address: publicKey,
      signature: signedMessage,
      chain: 'ALL',
    }),
  });

  if (!response.ok) {
    throw new Error(`Lighthouse JWT request failed with HTTP ${response.status}.`);
  }

  const body = await response.text();
  const token = extractJwtToken(body);
  if (token) return token;
  throw new Error('Lighthouse did not return a JWT.');
}

async function requestSignedSession() {
  if (!window.ethereum) throw new Error('MetaMask is not installed.');

  const { BrowserProvider } = getEthers();
  const provider = new BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const publicKey = await signer.getAddress();
  const manualToken = getManualLighthouseToken() || promptForLighthouseToken('upload or download a snapshot');
  if (manualToken) {
    setManualLighthouseToken(manualToken);
    const session = saveSession({ authToken: manualToken, publicKey, signedMessage: manualToken, manualToken: true });
    console.info('[Lighthouse] Manual token session ready', {
      address: publicKey,
      hasToken: !!manualToken,
      sessionCreatedAt: session.createdAt,
    });
    return session;
  }

  const lighthouse = getLighthouse({ strict: false });
  if (!lighthouse) {
    throw new Error('Lighthouse SDK is not loaded. Use JSON backup or reload the page.');
  }

  console.info('[Lighthouse] Starting wallet-signed session', {
    address: publicKey,
    hasGetAuthMessage: typeof lighthouse.getAuthMessage === 'function',
    hasGetJWT: typeof lighthouse.getJWT === 'function',
  });
  const message = await requestAuthMessage(publicKey, lighthouse);
  if (!message) throw new Error('Lighthouse did not return an auth message.');

  const signedMessage = await signer.signMessage(message);
  const jwt = await requestJwt(publicKey, signedMessage, lighthouse);

  if (!jwt) throw new Error('Lighthouse did not return an upload token.');

  const session = saveSession({ jwt, publicKey, signedMessage });
  console.info('[Lighthouse] Session ready', {
    address: publicKey,
    hasJwt: !!jwt,
    sessionCreatedAt: session.createdAt,
  });
  return session;
}

async function ensureSession({ promptIfMissing = true } = {}) {
  const cached = readSession();
  if (cached) return cached;
  if (!promptIfMissing) return null;
  return requestSignedSession();
}

function toText(blob) {
  if (typeof blob === 'string') return Promise.resolve(blob);
  if (blob instanceof Blob) return blob.text();
  if (blob && typeof blob.text === 'function') return blob.text();
  return Promise.resolve(String(blob ?? ''));
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

export async function connectLighthouseSession() {
  return ensureSession({ promptIfMissing: true });
}

export async function restoreLighthouseSession() {
  return ensureSession({ promptIfMissing: false });
}

export function clearLighthouseSession() {
  window._lighthouseSessionRef = null;
}

export function lighthouseGatewayUrl(cid) {
  return `${LIGHTHOUSE_IPFS_GATEWAY_BASE}${encodeURIComponent(String(cid || '').trim())}`;
}

export async function uploadEncryptedSnapshot(data, { fileName = 'bignuten-snapshot.json', snapshotMeta = null } = {}) {
  const session = await requestSignedSession();
  const payload = wrapSnapshotPayload(data, snapshotMeta || {});
  const file = new File([JSON.stringify(payload, null, 2)], fileName, { type: 'application/json' });
  const lighthouse = getLighthouse({ strict: false });
  if (!lighthouse) {
    throw new Error('Lighthouse SDK is not loaded. Use JSON backup or reload the page.');
  }
  const authToken = session.authToken || session.jwt || session.apiKey;
  console.info('[Lighthouse] Uploading encrypted snapshot', {
    fileName,
    address: session.publicKey,
    hasUploadEncrypted: typeof lighthouse.uploadEncrypted === 'function',
  });
  const upload = await lighthouse.uploadEncrypted(file, authToken, session.publicKey, session.signedMessage || authToken);
  const cid = upload?.data?.[0]?.Hash
    ?? upload?.data?.Hash
    ?? upload?.data?.hash
    ?? upload?.data?.cid
    ?? upload?.Hash
    ?? upload?.hash
    ?? upload?.cid;
  if (!cid) throw new Error('Lighthouse upload did not return a CID.');
  if (session.manualToken) {
    clearLighthouseSession();
    clearManualLighthouseToken();
  }
  return { cid: String(cid), session };
}

async function fetchSnapshotViaNode(cid, apiKey) {
  const response = await fetch(`https://node.lighthouse.storage/api/v0/cat?arg=${encodeURIComponent(String(cid || '').trim())}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Lighthouse fetch failed: ${response.statusText}`);
  }

  const text = await response.text();
  try {
    return unwrapSnapshotPayload(JSON.parse(text));
  } catch {
    return unwrapSnapshotPayload(text);
  }
}

export async function fetchSnapshotData(cid, { session: providedSession = null } = {}) {
  const trimmedCid = String(cid || '').trim();
  if (!trimmedCid) throw new Error('No CID provided.');

  let session = providedSession || null;

  const fetchWithSession = async (currentSession) => {
    const lighthouse = currentSession ? getLighthouse({ strict: false }) : null;
    if (currentSession && lighthouse && typeof lighthouse.fetchEncryptionKey === 'function' && typeof lighthouse.decryptFile === 'function') {
      try {
        console.info('[Lighthouse] Attempting encrypted snapshot decrypt', {
          cid: trimmedCid,
          address: currentSession.publicKey,
        });
        const authToken = currentSession.authToken || currentSession.signedMessage;
        const keyObject = await lighthouse.fetchEncryptionKey(trimmedCid, currentSession.publicKey, authToken);
        const decrypted = await lighthouse.decryptFile(trimmedCid, keyObject?.data?.key, 'application/json');
        const text = await toText(decrypted);
        return unwrapSnapshotPayload(JSON.parse(text));
      } catch (err) {
        console.warn('[Lighthouse] Decrypt failed, trying authenticated fetch:', err);
      }
    }

    if (currentSession?.authToken || currentSession?.jwt || currentSession?.apiKey) {
      try {
        return await fetchSnapshotViaNode(trimmedCid, currentSession.authToken || currentSession.jwt || currentSession.apiKey);
      } catch (err) {
        console.warn('[Lighthouse] Authenticated snapshot fetch failed:', err);
      }
    }

    return null;
  };

  try {
    const authenticated = await fetchWithSession(session);
    if (authenticated !== null) return authenticated;

    const response = await fetch(lighthouseGatewayUrl(trimmedCid));
    if (response.ok) {
      const text = await response.text();
      try {
        return unwrapSnapshotPayload(JSON.parse(text));
      } catch {
        if (!providedSession) {
          const apiKey = promptForLighthouseToken('download this snapshot');
          if (apiKey) return await fetchSnapshotViaNode(trimmedCid, apiKey);
        }
        throw new Error('Snapshot is encrypted or not valid JSON. Enter your Lighthouse API key when prompted.');
      }
    }

    if (response.status === 401 || response.status === 402) {
      if (!providedSession) {
        const apiKey = promptForLighthouseToken('download this snapshot');
        if (apiKey) return await fetchSnapshotViaNode(trimmedCid, apiKey);
      }
      throw new Error('This snapshot is private or encrypted. Enter your Lighthouse API key when prompted, then try again.');
    }

    throw new Error(`Failed to fetch from Lighthouse gateway (HTTP ${response.status}).`);
  } finally {
    if (!providedSession && session?.manualToken) {
      clearLighthouseSession();
      clearManualLighthouseToken();
    }
  }
}
