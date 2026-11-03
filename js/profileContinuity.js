import { createProfileStorage, LocalProfileCoordinator, migrateLegacyStorage, walletProfileId, PROFILE_SELECTION_KEY, selectedHealthProfile } from './profileContinuityCore.mjs';
import { mergeSnapshotData, normalizeFitnessData, retrofitOldSnapshots, patchAllSnapshotHistory } from './fitnessData.js';
import { fitnessRecovery } from './snapshotRecovery.js';

const nativeStorage = globalThis.localStorage;
const profileStore = createProfileStorage(nativeStorage);
const migration = migrateLegacyStorage(nativeStorage);
profileStore.api.setLegacyGuestFallback(!migration.complete);
const coordinator = new LocalProfileCoordinator({
  storage: nativeStorage,
  profileStorage: profileStore.api,
  locks: globalThis.navigator?.locks,
  makeChannel: typeof globalThis.BroadcastChannel === 'function' ? name => new BroadcastChannel(name) : null,
  confirmTakeover: async () => globalThis.confirm?.('Another tab wants to edit this profile. Yield editing now? Save any pending form values first; unsaved form text is not transferred.') ?? false,
  onChange: renderStatus,
});
let panel;
let cover;
let initialized = false;
let storageFacadeInstalled = false;
globalThis.__bignutenProfileCanWrite = () => coordinator.isWriter();
globalThis.__bignutenProfileIsReady = false;

try {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, enumerable: true, get: () => profileStore.storage });
  storageFacadeInstalled = globalThis.localStorage === profileStore.storage;
} catch (error) {
  console.error('[profile] Could not install the profile-scoped storage facade.', error);
}
if (!storageFacadeInstalled) throw new Error('BigNuten cannot enforce profile isolation in this browser; local profile editing is stopped.');

let startupProfileId = 'guest';
let switchingProfile = false;
const nativeAddEventListener = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function (type, listener, options) {
  if (type !== 'DOMContentLoaded' || (this !== document && this !== globalThis)) return nativeAddEventListener.call(this, type, listener, options);
  const target = this;
  return nativeAddEventListener.call(target, type, event => {
    Promise.resolve(globalThis.__bignutenProfileReady).then(() => {
      if (options?.signal?.aborted) return;
      if (typeof listener === 'function') listener.call(target, event);
      else listener?.handleEvent?.(event);
    }).catch(error => console.error('[profile] Startup was stopped before app initialization.', error));
  }, options);
};

function stateLabel(status) {
  return ({ writer: 'Editing here', readonly: 'Read-only in this tab', connecting: 'Checking local writer…', yielding: 'Handing off editing…', releasing: 'Switching profile…', unavailable: 'Editing unavailable', closed: 'Closed' })[status] || status;
}

function activeIdentity() {
  const id = profileStore.api.getProfile();
  return id === 'guest' ? 'Guest · local only' : `Wallet ${id.slice(7, 13)}…${id.slice(-4)}`;
}

function localInventory(profileId) {
  try {
    const raw = profileStore.api.readProfile(profileId, 'fitnessTrackerData');
    if (!raw) return { raw: null, data: null, count: 0 };
    const data = normalizeFitnessData(JSON.parse(raw));
    const count = ['weightLogs', 'emotions', 'foods', 'supplements', 'measurements', 'metricLogs', 'painLogs', 'sessionLog'].reduce((sum, key) => sum + (Array.isArray(data[key]) ? data[key].length : 0), 0)
      + Object.keys(data.waterDailyHistory || {}).length;
    return { raw, data, count };
  } catch { return { raw: null, data: null, count: 0 }; }
}

function renderStatus({ status = coordinator.status, error = '' } = {}) {
  if (!panel) return;
  const profile = profileStore.api.getProfile();
  const writer = status === 'writer' && coordinator.isWriter();
  panel.querySelector('#bn-profile-identity').textContent = activeIdentity();
  panel.querySelector('#bn-profile-state').textContent = stateLabel(status);
  const note = status === 'unavailable'
    ? `${error || 'Safe same-browser coordination is unavailable.'} This profile remains read-only; do not edit in another tab.`
    : profile === 'guest'
      ? 'Local-only data lives in this browser profile and origin. This app cannot detect whether another browser has records.'
      : 'This wallet profile is local to this browser profile and origin. Connecting a wallet does not sync or upload health data.';
  panel.querySelector('#bn-profile-note').textContent = [
    error && status !== 'unavailable' ? error : '',
    !migration.complete ? 'Legacy data migration is incomplete. Original browser keys remain untouched; some records may still be read from them. Free browser storage and reload before deleting data.' : '',
    note,
  ].filter(Boolean).join(' ');
  const takeover = panel.querySelector('#bn-profile-takeover');
  takeover.hidden = writer || status === 'unavailable' || status === 'connecting';
  takeover.disabled = status === 'yielding' || status === 'releasing';
  const copy = panel.querySelector('#bn-profile-copy-guest');
  panel.querySelector('#bn-profile-use-guest').hidden = profile === 'guest';
  panel.querySelector('#bn-profile-use-wallet').hidden = profile !== 'guest' || walletProfileId(window._connectedAccount) === 'guest';
  const guest = localInventory('guest');
  copy.hidden = profile === 'guest' || !writer || !guest.count;
  copy.textContent = `Copy ${guest.count} guest records into this wallet`;
  panel.querySelector('#bn-profile-backup-help').textContent = 'LocalStorage profile namespacing is not encryption or a shared-computer privacy boundary. Cross-browser continuity is not automatic. Create an encrypted IPFS snapshot while connected to this wallet, then carry its CID to the other browser and restore it there. IPFS receives ciphertext only; the hosted relay does not receive file contents. The wallet signature must reproduce the same key. Keep a separate backup and verify the restored data.';
}

function ensureStatusPanel() {
  if (panel || !document.body) return;
  panel = document.createElement('section');
  panel.id = 'profile-continuity-status';
  panel.setAttribute('aria-label', 'Health profile and storage status');
  panel.style.cssText = 'margin:10px 0;padding:10px 12px;border:1px solid #65b8cb;border-radius:10px;background:#102633;color:#e8f7ff;font:13px/1.4 system-ui';
  panel.innerHTML = '<details id="bn-profile-details" style="border:1px solid #65b8cb;border-radius:10px;background:#102633;box-shadow:0 4px 18px #0008"><summary style="padding:8px 10px;border-radius:10px;cursor:pointer"><strong id="bn-profile-identity"></strong><span> · </span><span id="bn-profile-state"></span></summary><div style="padding:0 10px 10px"><p id="bn-profile-note" style="margin:4px 0 8px"></p><button id="bn-profile-takeover" type="button" hidden>Take over editing</button> <button id="bn-profile-copy-guest" type="button" hidden></button><details style="margin-top:5px"><summary>Move data between browsers</summary><p id="bn-profile-backup-help"></p><button id="bn-profile-open-backups" type="button">Open encrypted backup options</button></details></div></details>';
  const settings = document.querySelector('#settings-modal .modal');
  const choices = document.createElement('p');
  choices.innerHTML = '<button type="button" id="bn-profile-use-guest">Use original Guest records</button> <button type="button" id="bn-profile-use-wallet">Use separate wallet records</button>';
  panel.querySelector('#bn-profile-note').after(choices);
  panel.querySelector('#bn-profile-use-guest').addEventListener('click', () => {
    if (confirm('Open the original browser Guest records? Wallet records stay saved separately. Save any pending form first.')) void selectProfile('guest');
  });
  panel.querySelector('#bn-profile-use-wallet').addEventListener('click', () => {
    const wallet = walletProfileId(window._connectedAccount);
    if (wallet !== 'guest' && confirm('Open separate wallet records? Your original Guest records stay saved and are not copied automatically. Save any pending form first.')) void selectProfile(wallet);
  });
  if (settings) settings.querySelector('.settings-header')?.after(panel);
  else document.body.appendChild(panel);
  cover = document.createElement('div');
  cover.id = 'profile-continuity-transition';
  cover.setAttribute('role', 'status');
  cover.setAttribute('aria-live', 'polite');
  cover.textContent = 'Switching health profile… Previous profile data is temporarily hidden.';
  cover.style.cssText = 'position:fixed;inset:0;z-index:999999;display:none;place-items:center;padding:24px;background:#07131fee;color:#fff;text-align:center;font:20px/1.5 system-ui';
  document.body.appendChild(cover);
  panel.querySelector('#bn-profile-takeover').addEventListener('click', async () => {
    if (!globalThis.confirm?.('Take over editing in this tab? The other tab will be asked to yield. Do not proceed until it has saved or abandoned pending form text.')) return;
    panel.querySelector('#bn-profile-state').textContent = 'Requesting takeover…';
    const taken = await coordinator.takeOver();
    if (!taken) renderStatus({ status: coordinator.status, error: 'The other tab did not yield, or its writer lock could not be verified.' });
    else announceProfileReady();
  });
  panel.querySelector('#bn-profile-copy-guest').addEventListener('click', async () => {
    const guest = localInventory('guest');
    if (!guest.data || !guest.count || !coordinator.isWriter()) return;
    const targetRaw = profileStore.api.readProfile(profileStore.api.getProfile(), 'fitnessTrackerData');
    let target;
    try { target = targetRaw ? normalizeFitnessData(JSON.parse(targetRaw)) : normalizeFitnessData({}); }
    catch (error) { alert(`Wallet profile cannot be safely read: ${error.message}`); return; }
    const conflicts = countConflicts(target, guest.data);
    const yes = confirm(`Copy ${guest.count} guest health records into ${activeIdentity()}? This keeps the guest copy and backs up the wallet profile before merging. ${conflicts ? `${conflicts} overlapping record value(s) will be retained in both the backup and guest source; the existing wallet value wins.` : 'No conflicting records were found.'}`);
    if (!yes || !coordinator.isWriter()) return;
    try {
      const backupKey = 'bignutenProfileCopyBackups.v1';
      let backups;
      try { backups = JSON.parse(localStorage.getItem(backupKey) || '[]'); }
      catch { alert('Existing profile-copy backups are unreadable. Export them before trying again.'); return; }
      if (!Array.isArray(backups) || backups.length >= 100) { alert('Profile-copy backup history is full or invalid. Export/review it before copying more data.'); return; }
      backups.unshift({ version: 1, createdAt: new Date().toISOString(), source: 'guest', sourceRaw: guest.raw, target: profileStore.api.getProfile(), targetRaw });
      localStorage.setItem(backupKey, JSON.stringify(backups));
      const merged = mergeSnapshotData(target, guest.data);
      fitnessRecovery.save(merged);
      window.dispatchEvent(new CustomEvent('bignuten:fitness-data-restored'));
      panel.querySelector('#bn-profile-state').textContent = `Copied ${guest.count} records. Guest copy retained; ${conflicts} conflict(s) preserved for review.`;
    } catch (error) {
      alert(`Copy stopped without deleting the guest profile. ${error.message}`);
    }
  });
  panel.querySelector('#bn-profile-open-backups').addEventListener('click', () => document.getElementById('ipfsIcon')?.click());
  renderStatus();
}

function countConflicts(current, incoming) {
  let conflicts = 0;
  const fields = ['weightLogs', 'supplements', 'foods', 'measurements', 'metricLogs', 'breathworkSessions', 'sessionLog', 'painLogs', 'chantingSessions', 'emotions'];
  const stableKey = entry => entry?.id !== undefined ? `id:${entry.id}` : entry?.sessionId !== undefined ? `session:${entry.sessionId}` : null;
  for (const field of fields) {
    const existing = new Map((current[field] || []).map(entry => [stableKey(entry), JSON.stringify(entry)]).filter(([key]) => key));
    for (const entry of incoming[field] || []) {
      const key = stableKey(entry);
      if (key && existing.has(key) && existing.get(key) !== JSON.stringify(entry)) conflicts++;
    }
  }
  for (const [date, count] of Object.entries(incoming.waterDailyHistory || {})) {
    if (Object.hasOwn(current.waterDailyHistory || {}, date) && current.waterDailyHistory[date] !== count) conflicts++;
  }
  return conflicts;
}

function announceProfileReady() {
  globalThis.__bignutenProfileIsReady = true;
  cover && (cover.style.display = 'none');
  window.dispatchEvent(new CustomEvent('bignuten:profile-changed', { detail: { profileId: profileStore.api.getProfile(), status: coordinator.status } }));
  window.dispatchEvent(new CustomEvent('bignuten:fitness-data-restored'));
  renderStatus();
}

async function selectProfile(profileId) {
  try { nativeStorage.setItem(PROFILE_SELECTION_KEY, profileId); }
  catch (error) { alert(`Could not remember the health profile. Nothing switched: ${error.message}`); return; }
  switchingProfile = true;
  globalThis.__bignutenProfileIsReady = false;
  if (cover) { cover.textContent = `Switching to ${profileId === 'guest' ? 'guest' : 'wallet'} profile safely. Previous profile data is hidden.`; cover.style.display = 'grid'; }
  await coordinator.close();
  globalThis.location?.reload?.();
}

export async function initializeProfileContinuity() {
  if (initialized) return;
  initialized = true;
  if (!migration.complete) console.error('[profile] Legacy local data remains intact, but profile migration could not finish:', migration.error);
  ensureStatusPanel();
  if (cover) { cover.textContent = 'Checking this browser profile and its local writer…'; cover.style.display = 'grid'; }
  window.addEventListener('bignuten:wallet-changed', () => {
    const next = walletProfileId(window._connectedAccount);
    const current = profileStore.api.getProfile();
    if (current !== 'guest' && next !== current) queueMicrotask(() => { void selectProfile('guest'); });
    else renderStatus();
  });
  try {
    const accounts = await Promise.race([
      Promise.resolve(globalThis.ethereum?.request?.({ method: 'eth_accounts' })).catch(() => []),
      new Promise(resolve => setTimeout(() => resolve([]), 2000)),
    ]);
    startupProfileId = selectedHealthProfile(nativeStorage.getItem(PROFILE_SELECTION_KEY), Array.isArray(accounts) ? accounts[0] : '');
  } catch { startupProfileId = 'guest'; }
  if (switchingProfile) return;
  profileStore.api.setProfile(startupProfileId);
  await coordinator.activate(startupProfileId);
  if (coordinator.isWriter()) {
    retrofitOldSnapshots();
    patchAllSnapshotHistory();
  }
  announceProfileReady();
}

export const profileContinuity = {
  get profileId() { return profileStore.api.getProfile(); },
  get status() { return coordinator.status; },
  switchToWallet(address) { return selectProfile(walletProfileId(address)); },
  takeOver: () => coordinator.takeOver(),
  close: () => coordinator.close(),
};
