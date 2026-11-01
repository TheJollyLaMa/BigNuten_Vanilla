export function serviceUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new Error('Use an HTTPS Genie service URL (HTTP only on loopback).');
  }
  return url.href.replace(/\/$/, '');
}

export function createGenieClient({ getWallet, getUrl, getChainId, signMessage, getOrigin = () => globalThis.window?.location?.origin, fetchImpl = fetch, onChange = () => {}, now = Date.now }) {
  let wallet = '', challenge = null, challengeAt = 0, token = '', expiresAt = 0;
  let eligible = false, revision = 0, signing = null, expiryTimer = null, boundUrl = '';
  const controllers = new Set();
  const state = () => ({ wallet, eligible, authenticated: Boolean(token) && expiresAt > now(), revision });
  function notify(message) { onChange({ ...state(), message }); }
  function clear(message = 'Check assistant access again.') {
    revision++;
    for (const controller of controllers) controller.abort(new Error('Assistant access changed; pending request canceled.'));
    controllers.clear(); clearTimeout(expiryTimer);
    token = ''; expiresAt = 0; eligible = false; challenge = null; signing = null; boundUrl = '';
    wallet = String(getWallet() || '').toLowerCase();
    notify(message);
  }
  function assertCurrent(attempt) {
    if (attempt !== revision || wallet !== String(getWallet() || '').toLowerCase() ||
        (boundUrl && boundUrl !== serviceUrl(getUrl()))) {
      throw new Error('Wallet/access changed. The pending Genie result was discarded.');
    }
  }
  async function transport(route, body, signal, authenticated = false, method = body === null ? 'DELETE' : 'POST') {
    const url = serviceUrl(getUrl());
    if (authenticated && url !== boundUrl) throw new Error('Service URL changed. Check access again; no credential was sent.');
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    controllers.add(controller);
    try {
      const response = await fetchImpl(`${url}${route}`, {
        method, signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === null || body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      let value;
      try { value = await response.json(); }
      catch { throw new Error('Genie service returned an unreadable response.'); }
      if (!response.ok) throw Object.assign(new Error(value.error || `Genie service failed (HTTP ${response.status}).`), { status: response.status });
      return value;
    } finally {
      controllers.delete(controller); signal?.removeEventListener('abort', abort);
    }
  }
  async function refresh(renewChallenge = false) {
    const current = String(getWallet() || '').toLowerCase();
    if (wallet === current && token && expiresAt > now() && boundUrl === serviceUrl(getUrl())) {
      const attempt = revision;
      try {
        await transport('/usage', undefined, undefined, true, 'GET');
        assertCurrent(attempt);
        return true;
      } catch (error) { if (attempt === revision) clear(error.message); throw error; }
    }
    if (!renewChallenge || !eligible || token || wallet !== current || boundUrl !== serviceUrl(getUrl())) {
      clear(current ? 'Checking assistant access…' : 'Connect a wallet to check assistant access. Manual health tracking remains available.');
    }
    if (!current) return false;
    boundUrl = serviceUrl(getUrl());
    const attempt = revision;
    try {
      const result = await transport('/challenge', { address: current, chainId: await getChainId() });
      assertCurrent(attempt);
      if (typeof result.nonce !== 'string' || typeof result.message !== 'string' ||
          !result.message.includes('Sign in to BigNuten Genie access only. No transaction, payment or token approval.') ||
          !result.message.toLowerCase().includes(current) ||
          !result.message.includes(`\nURI: ${getOrigin()}/\n`)) throw new Error('Invalid Genie sign-in challenge.');
      challenge = result; challengeAt = now(); eligible = true;
      notify('Assistant access is available for this wallet. Sign in when you choose to use a Genie.');
      return true;
    } catch (error) {
      if (attempt === revision) clear(error.message);
      throw error;
    }
  }
  async function ensureSignedIn() {
    if (state().authenticated && wallet === String(getWallet() || '').toLowerCase() && boundUrl === serviceUrl(getUrl())) return;
    if (signing) return signing;
    const promise = (async () => {
      if (!eligible || !challenge || now() - challengeAt > 240000 || boundUrl !== serviceUrl(getUrl())) await refresh(true);
      if (!eligible) throw new Error('Connect an invited wallet before using a Genie.');
      const attempt = revision, issued = challenge;
      const signature = await signMessage(issued.message, wallet);
      assertCurrent(attempt);
      const session = await transport('/session', { ...issued, signature });
      assertCurrent(attempt);
      if (!/^[a-f0-9]{64}$/.test(session.token) || session.wallet !== wallet ||
          !Number.isFinite(session.expiresAt) || session.expiresAt <= now() || session.expiresAt > now() + 1200000) {
        throw new Error('Invalid Genie session response.');
      }
      token = session.token; expiresAt = session.expiresAt; challenge = null;
      expiryTimer = setTimeout(() => clear('Assistant sign-in expired. Check access and sign in again.'), expiresAt - now());
      expiryTimer.unref?.();
      notify('Signed in. Each hosted request still requires the appropriate data-sharing consent.');
    })();
    signing = promise;
    try { await promise; }
    finally { if (signing === promise) signing = null; }
  }
  async function request(route, body, signal, beforeSend) {
    await ensureSignedIn();
    const attempt = revision;
    try {
      beforeSend?.();
      const result = await transport(route, body, signal, true);
      assertCurrent(attempt);
      return result;
    } catch (error) {
      if (attempt === revision && [401, 403].includes(error.status)) clear(error.message);
      throw error;
    }
  }
  async function signOut() {
    try { if (state().authenticated) await transport('/session', null, undefined, true); }
    catch (error) { clear(`Local sign-out completed; server revocation failed: ${error.message}`); throw error; }
    clear('Assistant signed out. Check access to use it again.');
  }
  return { state, refresh, ensureSignedIn, request, signOut, clear, assertCurrent };
}

export const genieClient = createGenieClient({
  getWallet: () => globalThis.window?._connectedAccount,
  getUrl: () => localStorage.getItem('bignutenNutritionServiceUrl') || window.BIGNUTEN_NUTRITION_SERVICE_URL,
  getChainId: async () => {
    if (!window.ethereum) throw new Error('Connect a wallet first.');
    return Number(await window.ethereum.request({ method: 'eth_chainId' }));
  },
  signMessage: (message, address) => window.ethereum.request({
    method: 'personal_sign', params: [window.ethers.hexlify(window.ethers.toUtf8Bytes(message)), address],
  }),
  onChange: detail => globalThis.window?.dispatchEvent(new CustomEvent('bignuten:genie-access-changed', { detail })),
});

export function initGenieAccess() {
  const status = document.getElementById('assistant-access-status');
  const update = async () => {
    try { await genieClient.refresh(); }
    catch (error) { console.warn('[Genie access]', error.message); }
  };
  window.addEventListener('bignuten:genie-access-changed', event => {
    if (status) status.textContent = event.detail.message;
    document.querySelectorAll('[data-genie-access]').forEach(element => { element.hidden = !event.detail.eligible; });
  });
  window.addEventListener('bignuten:wallet-changed', () => {
    revokeGenieHostedConsent();
    document.getElementById('genie-consent-dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }));
    genieClient.clear(); void update();
  });
  window.addEventListener('focus', () => { if (genieClient.state().wallet) void update(); });
  document.getElementById('assistant-access-check')?.addEventListener('click', async () => {
    try { await genieClient.refresh(); await genieClient.ensureSignedIn(); }
    catch (error) { if (status) status.textContent = error.message; console.warn('[Genie access]', error.message); }
  });
  genieClient.clear('Connect a wallet to check assistant access. Health tracking does not require it.');
  if (genieClient.state().wallet) void update();
}
import { revokeGenieHostedConsent } from './geniePrivacy.js';
