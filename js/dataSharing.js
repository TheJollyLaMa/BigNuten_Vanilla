/**
 * js/dataSharing.js
 * BigNuten Data Sharing Rewards — Opt-In Tracking & Treasury Integration
 *
 * Manages the user's health-data sharing opt-in lifecycle:
 *   • Tracks when the user first opted in (localStorage timestamp).
 *   • Calculates the current sharing streak (weeks) and pending $BNUT rewards.
 *   • Reads on-chain DataSharingRewarded events so users can see confirmed payouts.
 *   • Provides revokeDataConsent() to clear all opt-in state.
 *   • The owner calls rewardDataSharing() on the Treasury contract to settle pending rewards.
 *
 * Reward schedule (mirrors docs/TOKENOMICS.md):
 *   Initial opt-in     : 50 BNUT
 *   Per week shared    : 25 BNUT
 *   1-month streak     : +100 BNUT bonus
 *   3-month streak     : +500 BNUT bonus
 *
 * Privacy model:
 *   • No personal identifiers are stored or transmitted.
 *   • Wallet address is only used for on-chain payout reads (public ledger).
 *   • All opt-in state is stored in localStorage only — never sent to a server.
 *
 * Related issues: #49 (opt-in UI), #45 (treasury), #39 (BNUT deploy)
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** localStorage key for the opt-in first-consent timestamp (ISO string). */
const OPT_IN_DATE_KEY    = 'dataSharingOptInAt';

/** localStorage key for the per-category opt-in preferences object. */
const OPT_IN_PREFS_KEY   = 'communityDataOptIn';

/** localStorage key for the pending reward queue (array of request objects). */
const REWARD_QUEUE_KEY   = 'dataSharingRewardQueue';

/** Milliseconds per week. */
const MS_PER_WEEK        = 7 * 24 * 60 * 60 * 1000;

/** BNUT reward amounts (whole tokens — contract uses 18 decimals internally). */
export const DATA_SHARING_REWARDS = {
  optIn:       50,   // awarded on first opt-in
  perWeek:     25,   // per week of continuous sharing
  streak1Month: 100, // bonus at 4+ weeks streak
  streak3Month: 500, // bonus at 13+ weeks streak
};

/** Streak thresholds (weeks) that unlock milestone bonuses. */
const MILESTONE_1_MONTH_WEEKS = 4;
const MILESTONE_3_MONTH_WEEKS = 13;

// ─── Opt-In State Helpers ─────────────────────────────────────────────────────

/**
 * Return the stored opt-in preferences object.
 * @returns {{ exercise?: boolean, nutrition?: boolean, weight?: boolean, supplements?: boolean }}
 */
function loadOptInPrefs() {
  try {
    return JSON.parse(localStorage.getItem(OPT_IN_PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Return true if the user has at least one category enabled.
 */
function isAnyOptedIn() {
  const prefs = loadOptInPrefs();
  return Object.values(prefs).some(v => v === true);
}

/**
 * Return the stored first-consent timestamp as a Date, or null.
 */
function loadOptInDate() {
  const raw = localStorage.getItem(OPT_IN_DATE_KEY);
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Persist the first-consent timestamp (called the first time a user enables a toggle).
 */
function recordOptInDate() {
  if (!localStorage.getItem(OPT_IN_DATE_KEY)) {
    localStorage.setItem(OPT_IN_DATE_KEY, new Date().toISOString());
  }
}

/**
 * Clear all opt-in state — called by revokeDataConsent().
 */
function clearOptInState() {
  localStorage.removeItem(OPT_IN_PREFS_KEY);
  localStorage.removeItem(OPT_IN_DATE_KEY);
  localStorage.removeItem(REWARD_QUEUE_KEY);
}

// ─── Streak & Reward Calculation ──────────────────────────────────────────────

/**
 * Calculate the number of full weeks the user has been sharing data.
 * Returns 0 if no opt-in date is recorded or no categories are active.
 *
 * @returns {number} Full weeks of continuous sharing.
 */
export function getStreakWeeks() {
  if (!isAnyOptedIn()) return 0;
  const optInDate = loadOptInDate();
  if (!optInDate) return 0;
  const elapsed = Date.now() - optInDate.getTime();
  return Math.floor(elapsed / MS_PER_WEEK);
}

/**
 * Calculate the total $BNUT the user has earned so far (not necessarily paid out).
 *
 * Reward breakdown:
 *   50  (opt-in)
 * + 25 × streakWeeks
 * + 100 (if streakWeeks ≥ 4)
 * + 500 (if streakWeeks ≥ 13)
 *
 * @returns {number} Total BNUT earned (whole tokens).
 */
export function calculateEarnedBnut() {
  if (!isAnyOptedIn()) return 0;
  const optInDate = loadOptInDate();
  if (!optInDate) return 0;

  const weeks = getStreakWeeks();
  let earned = DATA_SHARING_REWARDS.optIn + weeks * DATA_SHARING_REWARDS.perWeek;

  if (weeks >= MILESTONE_1_MONTH_WEEKS) earned += DATA_SHARING_REWARDS.streak1Month;
  if (weeks >= MILESTONE_3_MONTH_WEEKS) earned += DATA_SHARING_REWARDS.streak3Month;

  return earned;
}

/**
 * Return the next milestone description and BNUT bonus.
 * @returns {{ label: string, bonus: number, weeksRemaining: number } | null}
 */
export function getNextMilestone() {
  const weeks = getStreakWeeks();
  if (weeks < MILESTONE_1_MONTH_WEEKS) return { label: '1-month streak',  bonus: DATA_SHARING_REWARDS.streak1Month,  weeksRemaining: MILESTONE_1_MONTH_WEEKS - weeks };
  if (weeks < MILESTONE_3_MONTH_WEEKS) return { label: '3-month streak',  bonus: DATA_SHARING_REWARDS.streak3Month,  weeksRemaining: MILESTONE_3_MONTH_WEEKS - weeks };
  return null; // all milestones reached
}

// ─── On-Chain Reward History ──────────────────────────────────────────────────

/**
 * Read all DataSharingRewarded events emitted for a given wallet address
 * from the BigNutenTreasury contract.
 *
 * Returns an empty array if the treasury is not yet deployed or ethers is unavailable.
 *
 * @param {string} walletAddress  Checksummed or lower-case wallet address.
 * @returns {Promise<Array<{amount: number, ref: string, txHash: string}>>}
 */
export async function getOnChainDataSharingHistory(walletAddress) {
  const treasuryAddress =
    window.TREASURY_CONTRACT_ADDRESS ||
    window.CONTRACTS?.treasury ||
    '0x0000000000000000000000000000000000000000';

  if (
    !walletAddress ||
    !treasuryAddress ||
    treasuryAddress === '0x0000000000000000000000000000000000000000' ||
    typeof ethers === 'undefined'
  ) {
    return [];
  }

  try {
    const provider = new ethers.JsonRpcProvider(
      window.CONTRACTS?.rpcUrl || 'https://mainnet.optimism.io'
    );
    const res = await fetch('abis/BigNutenTreasury.json');
    if (!res.ok) return [];
    const abi = await res.json();

    const treasury  = new ethers.Contract(treasuryAddress, abi, provider);
    const filter    = treasury.filters.DataSharingRewarded(walletAddress);
    const logs      = await treasury.queryFilter(filter, 0, 'latest');

    return logs.map(log => ({
      amount:  Number(ethers.formatEther(log.args.amount)),
      ref:     log.args.ref,
      txHash:  log.transactionHash,
    }));
  } catch (err) {
    console.warn('[dataSharing] Could not fetch on-chain history:', err);
    return [];
  }
}

/**
 * Return the cumulative on-chain confirmed BNUT for this wallet.
 * Falls back to 0 if the treasury is not yet deployed.
 *
 * @param {string} walletAddress
 * @returns {Promise<number>} Total confirmed BNUT (whole tokens).
 */
export async function getConfirmedDataSharingBnut(walletAddress) {
  const history = await getOnChainDataSharingHistory(walletAddress);
  return history.reduce((sum, h) => sum + h.amount, 0);
}

// ─── Full Status Object ───────────────────────────────────────────────────────

/**
 * Return a comprehensive data-sharing status object for the UI.
 *
 * @param {string|null} walletAddress  Connected wallet, or null for anonymous view.
 * @returns {Promise<{
 *   optedIn: boolean,
 *   optInDate: Date|null,
 *   streakWeeks: number,
 *   earnedBnut: number,
 *   confirmedBnut: number,
 *   pendingBnut: number,
 *   nextMilestone: object|null,
 *   onChainHistory: Array,
 * }>}
 */
export async function getDataSharingStatus(walletAddress) {
  const optedIn       = isAnyOptedIn();
  const optInDate     = loadOptInDate();
  const streakWeeks   = getStreakWeeks();
  const earnedBnut    = calculateEarnedBnut();
  const nextMilestone = getNextMilestone();

  let confirmedBnut = 0;
  let onChainHistory = [];

  if (walletAddress) {
    onChainHistory  = await getOnChainDataSharingHistory(walletAddress);
    confirmedBnut   = onChainHistory.reduce((s, h) => s + h.amount, 0);
  }

  const pendingBnut = Math.max(0, earnedBnut - confirmedBnut);

  return {
    optedIn,
    optInDate,
    streakWeeks,
    earnedBnut,
    confirmedBnut,
    pendingBnut,
    nextMilestone,
    onChainHistory,
  };
}

// ─── Opt-In Lifecycle ─────────────────────────────────────────────────────────

/**
 * Record the first-consent timestamp when the user enables any toggle.
 * Safe to call multiple times — only persists on the very first call.
 */
export function onUserOptIn() {
  recordOptInDate();
}

/**
 * Revoke all data-sharing consent.
 * Clears opt-in preferences, the first-consent timestamp, and any queued reward requests.
 * This is irreversible from a streak perspective — re-opting in starts a fresh streak.
 */
export function revokeDataConsent() {
  clearOptInState();
}

// ─── Owner: Data Sharing Reward Settlement ────────────────────────────────────

/**
 * Settle pending data-sharing rewards from the connected owner wallet.
 * Calls `rewardDataSharing()` on the Treasury contract for each user in the batch.
 *
 * This is the owner-side function called from the admin payroll panel.
 *
 * @param {Array<{walletAddress: string, amount: number, ref: string}>} batch
 * @returns {Promise<string>} Transaction hash.
 */
export async function settleDataSharingRewards(batch) {
  if (!batch || batch.length === 0) {
    throw new Error('No data sharing rewards to settle.');
  }

  const treasuryAddress =
    window.TREASURY_CONTRACT_ADDRESS ||
    window.CONTRACTS?.treasury ||
    '0x0000000000000000000000000000000000000000';

  if (
    !treasuryAddress ||
    treasuryAddress === '0x0000000000000000000000000000000000000000'
  ) {
    throw new Error(
      'Treasury contract is not deployed. Update js/contracts.js with the deployed address.'
    );
  }

  if (!window.ethereum) throw new Error('MetaMask is not installed.');
  const provider = new ethers.BrowserProvider(window.ethereum);
  const network  = await provider.getNetwork();
  if (Number(network.chainId) !== (window.CONTRACTS?.chainId || 10)) {
    throw new Error('Please switch MetaMask to Optimism Mainnet (chain ID 10).');
  }

  const signer   = await provider.getSigner();
  const res      = await fetch('abis/BigNutenTreasury.json');
  if (!res.ok) throw new Error('Failed to load BigNutenTreasury ABI.');
  const abi      = await res.json();
  const treasury = new ethers.Contract(treasuryAddress, abi, signer);

  const users   = batch.map(b => b.walletAddress);
  const amounts = batch.map(b => ethers.parseEther(String(b.amount)));
  const refs    = batch.map(b => b.ref);

  const tx = await treasury.batchRewardDataSharing(users, amounts, refs);
  await tx.wait();
  return tx.hash;
}
