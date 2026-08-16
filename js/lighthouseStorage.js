const SESSION_KEY = 'lighthouseSession';

function getEthers() {
  if (!window.ethers) throw new Error('ethers is not available.');
  return window.ethers;
}

function getLighthouse() {
  if (!window.lighthouse) throw new Error('Lighthouse SDK is not available.');
  return window.lighthouse;
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.apiKey || !parsed?.publicKey || !parsed?.signedMessage) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    apiKey: session.apiKey,
    publicKey: session.publicKey,
    signedMessage: session.signedMessage,
    createdAt: new Date().toISOString(),
  }));
}

async function requestSignedSession() {
  if (!window.ethereum) throw new Error('MetaMask is not installed.');

  const { BrowserProvider } = getEthers();
  const provider = new BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const publicKey = await signer.getAddress();

  const lighthouse = getLighthouse();
  const authMessage = await lighthouse.getAuthMessage(publicKey);
  const message = authMessage?.data?.message || authMessage?.message;
  if (!message) throw new Error('Lighthouse did not return an auth message.');

  const signedMessage = await signer.signMessage(message);
  const apiKeyResponse = typeof lighthouse.getApiKey === 'function'
    ? await lighthouse.getApiKey(publicKey, signedMessage)
    : typeof lighthouse.getJWT === 'function'
      ? await lighthouse.getJWT(publicKey, signedMessage)
      : typeof lighthouse.getJwt === 'function'
        ? await lighthouse.getJwt(publicKey, signedMessage)
        : null;

  const apiKey = apiKeyResponse?.data?.apiKey
    ?? apiKeyResponse?.data?.JWT
    ?? apiKeyResponse?.data?.jwt
    ?? apiKeyResponse?.data?.token
    ?? apiKeyResponse?.apiKey
    ?? apiKeyResponse?.JWT
    ?? apiKeyResponse?.jwt
    ?? apiKeyResponse?.token;

  if (!apiKey) throw new Error('Lighthouse did not return an upload token.');

  const session = { apiKey, publicKey, signedMessage };
  saveSession(session);
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
  sessionStorage.removeItem(SESSION_KEY);
}

export function lighthouseGatewayUrl(cid) {
  return `https://gateway.lighthouse.storage/ipfs/${cid}`;
}

export async function uploadEncryptedSnapshot(data, { fileName = 'bignuten-snapshot.json' } = {}) {
  const session = await ensureSession({ promptIfMissing: true });
  const file = new File([JSON.stringify(data, null, 2)], fileName, { type: 'application/json' });
  const lighthouse = getLighthouse();
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
  const lighthouse = getLighthouse();
  if (session && typeof lighthouse.fetchEncryptionKey === 'function' && typeof lighthouse.decryptFile === 'function') {
    try {
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
