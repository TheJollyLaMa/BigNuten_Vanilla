/**
 * js/treasury.js
 * BigNuten Treasury — Browser-Side Payroll Module
 *
 * Provides functions for the owner to:
 *   1. Load the pending payroll queue from payroll-queue.json (GitHub raw URL).
 *   2. Check the current treasury $BNUT balance.
 *   3. Settle all pending payouts in one on-chain batch call via MetaMask —
 *      no private key required; the owner's connected wallet signs the transaction.
 *
 * The payroll queue is populated by the `.github/workflows/bounty-payout.yml`
 * workflow (which only needs GITHUB_TOKEN, not a private key).
 *
 * Related issues: #45 (bounty bot), #46 (bounty label system)
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Raw GitHub URL for the payroll queue file. */
const PAYROLL_QUEUE_URL =
  'https://raw.githubusercontent.com/TheJollyLaMa/BigNuten_Vanilla/main/payroll-queue.json';

/** Optimism Mainnet chain ID. */
const OPTIMISM_CHAIN_ID = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Load the BigNutenTreasury ABI from abis/BigNutenTreasury.json.
 * @returns {Promise<Array>}
 */
async function loadTreasuryAbi() {
  const res = await fetch('abis/BigNutenTreasury.json');
  if (!res.ok) throw new Error('Failed to load BigNutenTreasury ABI');
  return res.json();
}

/**
 * Return a read/write ethers provider + signer from the connected MetaMask.
 * Throws if MetaMask is not available or no account is connected.
 * @returns {Promise<{provider: ethers.BrowserProvider, signer: ethers.Signer, address: string}>}
 */
async function getSignerContext() {
  if (!window.ethereum) throw new Error('MetaMask is not installed.');

  const provider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await provider.send('eth_accounts', []);
  if (!accounts || accounts.length === 0) {
    throw new Error('No wallet connected — please connect MetaMask first.');
  }

  const network = await provider.getNetwork();
  if (Number(network.chainId) !== OPTIMISM_CHAIN_ID) {
    throw new Error(
      `Wrong network. Please switch MetaMask to Optimism Mainnet (chain ID ${OPTIMISM_CHAIN_ID}).`
    );
  }

  const signer  = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address };
}

// ─── Exported: loadPayrollQueue ───────────────────────────────────────────────

/**
 * Fetch the current payroll queue from the repo.
 *
 * @returns {Promise<{pending: Array, settled: Array}>}
 *   pending — entries not yet settled on-chain
 *   settled — entries that have been paid out
 */
export async function loadPayrollQueue() {
  // Cache-bust so we always see the latest committed version.
  const res = await fetch(PAYROLL_QUEUE_URL + '?t=' + Date.now());
  if (!res.ok) throw new Error('Could not fetch payroll-queue.json from GitHub.');
  const queue = await res.json();
  return {
    pending: Array.isArray(queue.pending) ? queue.pending : [],
    settled: Array.isArray(queue.settled) ? queue.settled : [],
  };
}

// ─── Exported: getTreasuryBalance ─────────────────────────────────────────────

/**
 * Return the current $BNUT balance held by the treasury contract (as a number).
 *
 * @returns {Promise<number>} Balance in whole BNUT tokens.
 */
export async function getTreasuryBalance() {
  const treasuryAddress =
    window.TREASURY_CONTRACT_ADDRESS ||
    window.CONTRACTS?.treasury ||
    '0x0000000000000000000000000000000000000000';

  if (
    !treasuryAddress ||
    treasuryAddress === '0x0000000000000000000000000000000000000000'
  ) {
    return 0;
  }

  const abi = await loadTreasuryAbi();
  const provider = new ethers.JsonRpcProvider(
    window.CONTRACTS?.rpcUrl || 'https://mainnet.optimism.io'
  );
  const treasury = new ethers.Contract(treasuryAddress, abi, provider);
  const balanceWei = await treasury.getBalance();
  return Number(ethers.formatEther(balanceWei));
}

// ─── Exported: isTreasuryOwner ────────────────────────────────────────────────

/**
 * Check whether `walletAddress` is the owner of the Treasury contract.
 *
 * @param {string} walletAddress
 * @returns {Promise<boolean>}
 */
export async function isTreasuryOwner(walletAddress) {
  const treasuryAddress =
    window.TREASURY_CONTRACT_ADDRESS ||
    window.CONTRACTS?.treasury ||
    '0x0000000000000000000000000000000000000000';

  if (
    !walletAddress ||
    !treasuryAddress ||
    treasuryAddress === '0x0000000000000000000000000000000000000000'
  ) {
    return false;
  }

  try {
    const abi = await loadTreasuryAbi();
    const provider = new ethers.JsonRpcProvider(
      window.CONTRACTS?.rpcUrl || 'https://mainnet.optimism.io'
    );
    const treasury = new ethers.Contract(treasuryAddress, abi, provider);
    const owner = await treasury.owner();
    return owner.toLowerCase() === walletAddress.toLowerCase();
  } catch (_) {
    return false;
  }
}

// ─── Exported: isIssuePaid ────────────────────────────────────────────────────

/**
 * Check on-chain whether a GitHub issue reference has already been settled.
 *
 * @param {string} issueRef  e.g. "TheJollyLaMa/BigNuten_Vanilla#107"
 * @returns {Promise<boolean>}
 */
export async function isIssuePaid(issueRef) {
  const treasuryAddress =
    window.TREASURY_CONTRACT_ADDRESS ||
    window.CONTRACTS?.treasury ||
    '0x0000000000000000000000000000000000000000';

  if (
    !issueRef ||
    !treasuryAddress ||
    treasuryAddress === '0x0000000000000000000000000000000000000000'
  ) {
    return false;
  }

  try {
    const abi = await loadTreasuryAbi();
    const provider = new ethers.JsonRpcProvider(
      window.CONTRACTS?.rpcUrl || 'https://mainnet.optimism.io'
    );
    const treasury = new ethers.Contract(treasuryAddress, abi, provider);
    return await treasury.isIssuePaid(issueRef);
  } catch (_) {
    return false;
  }
}

// ─── Exported: getContributorPaidEvents ──────────────────────────────────────

/**
 * Optimism block at which BigNutenTreasury was deployed (2026-03-19).
 * Querying from this block avoids "block range too large" RPC errors on Optimism
 * that occur when fromBlock is 0 and the range spans the entire chain history.
 */
const TREASURY_DEPLOY_BLOCK = 130000000;

/**
 * Query all ContributorPaid events emitted by the BigNutenTreasury contract.
 * Returns events sorted most-recent first.
 * Throws on RPC/ABI errors so callers can surface the error to the user.
 *
 * @returns {Promise<Array<{contributor: string, issueRef: string, amount: number, txHash: string, blockNumber: number, timestamp: number}>>}
 */
export async function getContributorPaidEvents() {
  const treasuryAddress =
    window.TREASURY_CONTRACT_ADDRESS ||
    window.CONTRACTS?.treasury ||
    '0x0000000000000000000000000000000000000000';

  if (
    !treasuryAddress ||
    treasuryAddress === '0x0000000000000000000000000000000000000000'
  ) {
    return [];
  }

  const abi      = await loadTreasuryAbi();
  const provider = new ethers.JsonRpcProvider(
    window.CONTRACTS?.rpcUrl || 'https://mainnet.optimism.io'
  );
  const treasury = new ethers.Contract(treasuryAddress, abi, provider);
  const filter   = treasury.filters.ContributorPaid();
  // Query from the contract deployment block to avoid RPC range-too-large errors.
  const logs     = await treasury.queryFilter(filter, TREASURY_DEPLOY_BLOCK, 'latest');

  // Collect unique block numbers and batch-fetch block timestamps
  const blockNums = [...new Set(logs.map(l => l.blockNumber))];
  const blockTimestamps = new Map();
  await Promise.all(blockNums.map(async (bn) => {
    try {
      const block = await provider.getBlock(bn);
      blockTimestamps.set(bn, block?.timestamp || 0);
    } catch (_) {
      blockTimestamps.set(bn, 0);
    }
  }));

  const events = logs.map((log) => ({
    contributor: log.args.contributor,
    issueRef:    log.args.issueRef,
    amount:      Number(ethers.formatEther(log.args.amount)),
    txHash:      log.transactionHash,
    blockNumber: log.blockNumber,
    timestamp:   blockTimestamps.get(log.blockNumber) || 0,
  }));

  // Most recent first
  return events.sort((a, b) => b.blockNumber - a.blockNumber);
}

// ─── Exported: settlePayroll ──────────────────────────────────────────────────

/**
 * Settle all pending payouts in a single `batchPayContributors()` call.
 * The owner signs the transaction with MetaMask — no private key stored anywhere.
 *
 * @param {Array<{contributor: string, amount: string, issueRef: string}>} payouts
 *   Subset of pending queue entries to settle (defaults to all pending).
 * @returns {Promise<string>} Transaction hash of the batch settlement.
 */
export async function settlePayroll(payouts) {
  if (!payouts || payouts.length === 0) {
    throw new Error('No payouts to settle.');
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
      'Treasury contract address is not set. Deploy the contract first and update js/contracts.js.'
    );
  }

  const { signer } = await getSignerContext();
  const abi        = await loadTreasuryAbi();
  const treasury   = new ethers.Contract(treasuryAddress, abi, signer);

  const contributors = payouts.map(p => p.contributor);
  const amounts      = payouts.map(p => ethers.parseEther(String(p.amount)));
  const issueRefs    = payouts.map(p => p.issueRef);

  const tx = await treasury.batchPayContributors(contributors, amounts, issueRefs);
  await tx.wait();
  return tx.hash;
}
