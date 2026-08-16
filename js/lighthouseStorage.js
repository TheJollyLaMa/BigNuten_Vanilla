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

function readSession() {
  return window._lighthouseSessionRef || null;
}

function saveSession(session) {
  window._lighthouseSessionRef = {
    apiKey: session.apiKey,
    publicKey: session.publicKey,
    signedMessage: session.signedMessage,
    createdAt: new Date().toISOString(),
  };
  return window._lighthouseSessionRef;
}

async function requestSignedSession() {
  if (!window.ethereum) throw new Error('MetaMask is not installed.');
  const lighthouse = getLighthouse({ strict: false });
  if (!lighthouse) {
    throw new Error('Lighthouse SDK is not loaded. Use JSON backup or reload the page.');
  }

  const { BrowserProvider } = getEthers();
  const provider = new BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const publicKey = await signer.getAddress();
  console.info('[Lighthouse] Starting wallet-signed session', {
    address: publicKey,
    hasGetAuthMessage: typeof lighthouse.getAuthMessage === 'function',
    hasGetApiKey: typeof lighthouse.getApiKey === 'function',
    hasGetJWT: typeof lighthouse.getJWT === 'function',
    hasGetJwt: typeof lighthouse.getJwt === 'function',
  });
  const authMessage = await lighthouse.getAuthMessage(publicKey);
  const message = authMessage?.data?.message || authMessage?.message;
  if (!message) throw new Error('Lighthouse did not return an auth message.');

  const signedMessage = await signer.signMessage(message);
  const authBody = new URLSearchParams({
    publicKey,
    signedMessage,
  });
  const authResponse = await fetch('https://api.lighthouse.storage/api/auth/create_api_key', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: authBody,
  });

  if (!authResponse.ok) {
    throw new Error(`Lighthouse auth failed (HTTP ${authResponse.status}).`);
  }

  const apiKeyResponse = await authResponse.json();

  const apiKey = typeof apiKeyResponse === 'string'
    ? apiKeyResponse
    : apiKeyResponse?.data?.apiKey
      ?? apiKeyResponse?.data?.JWT
      ?? apiKeyResponse?.data?.jwt
      ?? apiKeyResponse?.data?.token
      ?? apiKeyResponse?.apiKey
      ?? apiKeyResponse?.JWT
      ?? apiKeyResponse?.jwt
      ?? apiKeyResponse?.token;

  if (!apiKey) throw new Error('Lighthouse did not return an upload token.');

  const session = saveSession({ apiKey, publicKey, signedMessage });
  console.info('[Lighthouse] Session ready', {
    address: publicKey,
    hasApiKey: !!apiKey,
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

export async function connectLighthouseSession() {
  return ensureSession({ promptIfMissing: true });
}

export async function restoreLighthouseSession() {
  return ensureSession({ promptIfMissing: false });
}

export function clearLighthouseSession() {
  delete window._lighthouseSessionRef;
}

export function lighthouseGatewayUrl(cid) {
  return `https://gateway.lighthouse.storage/ipfs/${encodeURIComponent(String(cid || '').trim())}`;
}

export async function uploadEncryptedSnapshot(data, { fileName = 'bignuten-snapshot.json' } = {}) {
  const session = await ensureSession({ promptIfMissing: true });
  const file = new File([JSON.stringify(data, null, 2)], fileName, { type: 'application/json' });
  const lighthouse = getLighthouse({ strict: false });
  if (!lighthouse) {
    throw new Error('Lighthouse SDK is not loaded. Use JSON backup or reload the page.');
  }
  console.info('[Lighthouse] Uploading encrypted snapshot', {
    fileName,
    address: session.publicKey,
    hasUploadEncrypted: typeof lighthouse.uploadEncrypted === 'function',
  });
  const upload = await lighthouse.uploadEncrypted(file, session.apiKey, session.publicKey, session.signedMessage);
  const cid = upload?.data?.[0]?.Hash
    ?? upload?.data?.Hash
    ?? upload?.data?.hash
    ?? upload?.data?.cid
    ?? upload?.Hash
    ?? upload?.hash
    ?? upload?.cid;
  if (!cid) throw new Error('Lighthouse upload did not return a CID.');
  return { cid: String(cid), session };
}

export async function fetchSnapshotData(cid) {
  const trimmedCid = String(cid || '').trim();
  if (!trimmedCid) throw new Error('No CID provided.');

  const session = await ensureSession({ promptIfMissing: false });
  const lighthouse = session ? getLighthouse({ strict: false }) : null;
  if (session && lighthouse && typeof lighthouse.fetchEncryptionKey === 'function' && typeof lighthouse.decryptFile === 'function') {
    try {
      console.info('[Lighthouse] Attempting encrypted snapshot decrypt', {
        cid: trimmedCid,
        address: session.publicKey,
      });
      const keyObject = await lighthouse.fetchEncryptionKey(trimmedCid, session.publicKey, session.signedMessage);
      const decrypted = await lighthouse.decryptFile(trimmedCid, keyObject?.data?.key, 'application/json');
      const text = await toText(decrypted);
      return JSON.parse(text);
    } catch (err) {
      console.warn('[Lighthouse] Decrypt failed, falling back to raw fetch:', err);
    }
  }

  const response = await fetch(lighthouseGatewayUrl(trimmedCid));
  if (!response.ok) throw new Error(`Failed to fetch from Lighthouse gateway (HTTP ${response.status}).`);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Snapshot is encrypted or not valid JSON. Connect Lighthouse to decrypt it.');
  }
}
