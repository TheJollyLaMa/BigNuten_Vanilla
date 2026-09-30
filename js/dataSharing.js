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
const DATA_SHARING_ROUTER_CONFIG_URL = 'data-sharing-settlement.json';
const DATA_SHARING_ROUTER_ABI = [
  'function PAYROLL_ROLE() view returns(bytes32)',
  'function CONTRIBUTOR_ADMIN_ROLE() view returns(bytes32)',
  'function hasRole(bytes32,address) view returns(bool)',
  'function approvedAssets(address) view returns(bool)',
  'function funds(bytes32) view returns(string metadataUri,bool active,bool exists)',
  'function fundBalances(bytes32,address) view returns(uint256)',
  'function isApprovedRecipient(address) view returns(bool)',
  'function contributors(address) view returns(bytes32 githubIdHash,bool approved,bool exists)',
  'function setContributorsApproved(address[],bytes32[],bool[])',
  'function completedWorkReferences(bytes32) view returns(bool)',
  'function payoutBatch(bytes32,address,address,uint256[],bytes32[],bytes32[],bytes32[],string[],bytes32[])',
  'event PayrollPaid(bytes32 indexed fundId,address indexed asset,address indexed recipient,uint256 amount,bytes32 workReference,bytes32 repositoryIdHash,bytes32 contributorIdHash,string metadataUri,bytes32 metadataHash)',
];

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
 * Maximum block range to query in a single eth_getLogs request.
 * Many RPC providers (e.g. Infura, Alchemy, public Optimism nodes) reject
 * queries that span more than 100 000 blocks ("Block range is too large").
 */
const MAX_LOG_RANGE_BLOCKS = 100_000;

/**
 * Read all DataSharingRewarded events emitted for a given wallet address
 * from the BigNutenTreasury contract.
 *
 * Queries only the most recent MAX_LOG_RANGE_BLOCKS blocks to avoid
 * "Block range is too large" errors from RPC providers.  If the query
 * still fails (e.g. a provider that enforces a smaller limit), the range
 * is halved and retried up to three times before returning an empty array.
 *
 * Returns an empty array if the treasury is not yet deployed or ethers is unavailable.
 *
 * @param {string} walletAddress  Checksummed or lower-case wallet address.
 * @returns {Promise<Array<{amount: number, ref: string, txHash: string}>>}
 */
export async function getOnChainDataSharingHistory(walletAddress) {
  const activeConfig = window.CONTRACTS || {};
  const activeLabel = activeConfig.label || 'selected network';
  const activeChainId = Number(activeConfig.chainId || 8453);

  if (!walletAddress || typeof ethers === 'undefined') {
    return [];
  }

  console.time('[dataSharing] history fetch');
  try {
    const provider = new ethers.JsonRpcProvider(activeConfig.rpcUrl || 'https://mainnet.base.org');
    let eventSource;
    let filter;
    let formatAmount;
    let getReference;
    if (activeChainId === 8453) {
      const configResponse = await fetch(DATA_SHARING_ROUTER_CONFIG_URL);
      if (!configResponse.ok) return [];
      const config = await configResponse.json();
      const router = new ethers.Contract(config.routerAddress, DATA_SHARING_ROUTER_ABI, provider);
      const fundId = ethers.keccak256(ethers.toUtf8Bytes(config.fundSlug));
      eventSource = router;
      filter = router.filters.PayrollPaid(fundId, config.asset.address, walletAddress);
      formatAmount = amount => Number(ethers.formatUnits(amount, config.asset.decimals));
      getReference = metadataUri => String(metadataUri || '').replace(/^data-sharing:/, '');
    } else {
      const treasuryAddress = activeConfig.treasury || window.TREASURY_CONTRACT_ADDRESS || '';
      if (!treasuryAddress || treasuryAddress === '0x0000000000000000000000000000000000000000') {
        console.info(`[dataSharing] Treasury is not deployed on ${activeLabel}; on-chain reward history is unavailable.`);
        return [];
      }
      const response = await fetch('abis/BigNutenTreasury.json');
      if (!response.ok) return [];
      eventSource = new ethers.Contract(treasuryAddress, await response.json(), provider);
      filter = eventSource.filters.DataSharingRewarded(walletAddress);
      formatAmount = amount => Number(ethers.formatEther(amount));
      getReference = ref => ref;
    }

    // Determine a bounded recent range to avoid "Block range is too large" errors.
    let latestBlock;
    try {
      latestBlock = await provider.getBlockNumber();
    } catch (_) {
      latestBlock = null;
    }

    let range = MAX_LOG_RANGE_BLOCKS;
    let logs  = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const fromBlock = latestBlock !== null
        ? Math.max(0, latestBlock - range)
        : 0;
      try {
        logs = await eventSource.queryFilter(filter, fromBlock, 'latest');
        break; // success
      } catch (queryErr) {
        const msg = String(queryErr?.message || queryErr).toLowerCase();
        const isRangeError =
          msg.includes('block range') ||
          msg.includes('too large') ||
          msg.includes('query returned more than') ||
          msg.includes('exceed') ||
          msg.includes('limit');

        if (isRangeError && attempt < maxRetries - 1) {
          range = Math.floor(range / 2);
          console.warn(
            `[dataSharing] RPC range error — retrying with range ${range} blocks (attempt ${attempt + 2}/${maxRetries})`
          );
        } else {
          throw queryErr;
        }
      }
    }

    if (!logs) return [];

    return logs.map(log => ({
      amount:  formatAmount(log.args.amount),
      ref:     getReference(activeChainId === 8453 ? log.args.metadataUri : log.args.ref),
      txHash:  log.transactionHash,
    }));
  } catch (err) {
    console.warn('[dataSharing] Could not fetch on-chain history:', err);
    return [];
  } finally {
    console.timeEnd('[dataSharing] history fetch');
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

export function prepareDataSharingRouterPayouts(batch, ethersApi, routerConfig) {
  if (!Array.isArray(batch) || batch.length === 0) throw new Error('No data sharing rewards to settle.');
  const repositoryIdHash = ethersApi.keccak256(ethersApi.toUtf8Bytes(routerConfig.repositorySlug));
  const contributorIdHash = ethersApi.keccak256(ethersApi.toUtf8Bytes('BigNuten data-sharing participant'));
  const coder = ethersApi.AbiCoder.defaultAbiCoder();
  const groups = new Map();
  const references = new Set();

  batch.forEach((entry, index) => {
    if (!ethersApi.isAddress(entry.walletAddress)) throw new Error(`Invalid reward wallet at row ${index + 1}.`);
    const wallet = ethersApi.getAddress(entry.walletAddress);
    const amount = ethersApi.parseUnits(String(entry.amount), routerConfig.asset.decimals);
    if (amount <= 0n) throw new Error(`Reward amount at row ${index + 1} must be greater than zero.`);
    const ref = String(entry.ref || 'data-sharing:reward').trim();
    const metadataUri = `data-sharing:${ref}`;
    const workReference = ethersApi.keccak256(coder.encode(
      ['bytes32', 'address', 'string'],
      [repositoryIdHash, wallet, ref],
    ));
    if (references.has(workReference)) throw new Error(`Duplicate data-sharing reward at row ${index + 1}; work references must be unique.`);
    references.add(workReference);
    const metadataHash = ethersApi.keccak256(ethersApi.toUtf8Bytes(ref));
    if (!groups.has(wallet.toLowerCase())) {
      groups.set(wallet.toLowerCase(), {
        wallet,
        amounts: [],
        workReferences: [],
        repositoryIdHashes: [],
        contributorIdHashes: [],
        metadataUris: [],
        metadataHashes: [],
      });
    }
    const group = groups.get(wallet.toLowerCase());
    group.amounts.push(amount);
    group.workReferences.push(workReference);
    group.repositoryIdHashes.push(repositoryIdHash);
    group.contributorIdHashes.push(contributorIdHash);
    group.metadataUris.push(metadataUri);
    group.metadataHashes.push(metadataHash);
  });
  return [...groups.values()];
}

/**
 * Settle pending data-sharing rewards from the connected owner wallet.
 * Base payouts use the dedicated ArtFi Settlements Router fund. Optimism retains
 * its legacy BigNutenTreasury path.
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

  if (!window.ethereum) throw new Error('MetaMask is not installed.');
  const provider = new ethers.BrowserProvider(window.ethereum);
  const network  = await provider.getNetwork();
  const activeChainId = Number(window.CONTRACTS?.chainId || 8453);
  const activeLabel = window.CONTRACTS?.label || 'Base Mainnet';
  if (Number(network.chainId) !== activeChainId) {
    throw new Error(`Please switch MetaMask to ${activeLabel} (chain ID ${activeChainId}).`);
  }

  const signer = await provider.getSigner();
  if (activeChainId === 10) {
    const treasuryAddress = window.TREASURY_CONTRACT_ADDRESS || window.CONTRACTS?.treasury || '';
    if (!treasuryAddress) throw new Error('Legacy Optimism BigNutenTreasury is not configured.');
    const res = await fetch('abis/BigNutenTreasury.json');
    if (!res.ok) throw new Error('Failed to load BigNutenTreasury ABI.');
    const treasury = new ethers.Contract(treasuryAddress, await res.json(), signer);
    const tx = await treasury.batchRewardDataSharing(
      batch.map(entry => entry.walletAddress),
      batch.map(entry => ethers.parseEther(String(entry.amount))),
      batch.map(entry => entry.ref),
    );
    await tx.wait();
    return [tx.hash];
  }
  if (activeChainId !== 8453) throw new Error('Data-sharing router rewards are configured for Base Mainnet only.');

  const configResponse = await fetch(DATA_SHARING_ROUTER_CONFIG_URL);
  if (!configResponse.ok) throw new Error('Could not load the Base data-sharing router configuration.');
  const routerConfig = await configResponse.json();
  if (Number(routerConfig.chainId) !== 8453 || routerConfig.fundSlug !== 'bignuten-health-data-rewards') {
    throw new Error('Health-data rewards must use the dedicated bignuten-health-data-rewards fund on Base.');
  }
  const router = new ethers.Contract(routerConfig.routerAddress, DATA_SHARING_ROUTER_ABI, signer);
  const fundId = ethers.keccak256(ethers.toUtf8Bytes(routerConfig.fundSlug));
  const [fund, payrollRole, contributorAdminRole, assetApproved] = await Promise.all([
    router.funds(fundId),
    router.PAYROLL_ROLE(),
    router.CONTRIBUTOR_ADMIN_ROLE(),
    router.approvedAssets(routerConfig.asset.address),
  ]);
  if (!fund.exists || !fund.active) throw new Error('The bignuten-health-data-rewards fund has not been created and activated on ArtFi’s router.');
  if (!assetApproved) throw new Error(`${routerConfig.asset.symbol} is not an approved ArtFi router asset.`);
  if (!(await router.hasRole(payrollRole, await signer.getAddress()))) throw new Error('Connected wallet needs PAYROLL_ROLE on ArtFi’s router.');

  const preparedPayouts = prepareDataSharingRouterPayouts(batch, ethers, routerConfig);
  const payouts = [];
  for (const payout of preparedPayouts) {
    const remainingIndices = [];
    for (let index = 0; index < payout.workReferences.length; index += 1) {
      if (!(await router.completedWorkReferences(payout.workReferences[index]))) remainingIndices.push(index);
    }
    if (!remainingIndices.length) continue;
    const remaining = { wallet: payout.wallet };
    for (const field of ['amounts', 'workReferences', 'repositoryIdHashes', 'contributorIdHashes', 'metadataUris', 'metadataHashes']) {
      remaining[field] = remainingIndices.map(index => payout[field][index]);
    }
    payouts.push(remaining);
  }
  if (!payouts.length) return [];
  let totalAmount = 0n;
  for (const payout of payouts) totalAmount += payout.amounts.reduce((sum, amount) => sum + amount, 0n);
  const balance = await router.fundBalances(fundId, routerConfig.asset.address);
  if (balance < totalAmount) throw new Error(`The data-sharing fund has ${ethers.formatUnits(balance, routerConfig.asset.decimals)} ${routerConfig.asset.symbol}; this batch needs ${ethers.formatUnits(totalAmount, routerConfig.asset.decimals)}.`);

  const recipientRecords = await Promise.all(payouts.map(payout => router.contributors(payout.wallet)));
  const unapprovedIndices = recipientRecords.flatMap((record, index) => record.approved ? [] : [index]);
  if (unapprovedIndices.length) {
    if (!(await router.hasRole(contributorAdminRole, await signer.getAddress()))) {
      const wallets = unapprovedIndices.map(index => payouts[index].wallet);
      throw new Error(`Connect a CONTRIBUTOR_ADMIN_ROLE wallet to approve these ArtFi recipients: ${wallets.join(', ')}`);
    }
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const wallets = unapprovedIndices.map(index => payouts[index].wallet);
    const githubIdHashes = unapprovedIndices.map(index => {
      const existingHash = recipientRecords[index].githubIdHash;
      if (existingHash !== ethers.ZeroHash) return existingHash;
      return ethers.keccak256(coder.encode(
        ['string', 'address'],
        ['BigNuten data-sharing recipient', payouts[index].wallet],
      ));
    });
    const approvals = unapprovedIndices.map(() => true);
    const approval = await router.setContributorsApproved(wallets, githubIdHashes, approvals);
    await approval.wait();
  }
  for (const payout of payouts) {
    if (!(await router.isApprovedRecipient(payout.wallet))) throw new Error(`ArtFi router recipient approval failed for ${payout.wallet}.`);
  }

  const transactionHashes = [];
  for (const payout of payouts) {
    const transaction = await router.payoutBatch(
      fundId,
      routerConfig.asset.address,
      payout.wallet,
      payout.amounts,
      payout.workReferences,
      payout.repositoryIdHashes,
      payout.contributorIdHashes,
      payout.metadataUris,
      payout.metadataHashes,
    );
    await transaction.wait();
    transactionHashes.push(transaction.hash);
  }
  return transactionHashes;
}
