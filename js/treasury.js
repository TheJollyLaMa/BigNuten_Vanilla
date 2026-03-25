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

/** Fallback treasury contract address (Optimism Mainnet deployment). */
const DEFAULT_TREASURY_ADDRESS = '0x143cC41AC075FFA40be1993827DA6ffB4638A363';

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
 * Used as the lower bound when scanning for ContributorPaid events.
 */
const TREASURY_DEPLOY_BLOCK = 130_000_000;

/**
 * Safe chunk size per queryFilter request (Optimism public RPC caps at ~10 000 blocks).
 */
const RPC_BLOCK_CHUNK = 9_000;

/**
 * Max parallel queryFilter requests sent at once.
 * Keeps the public-RPC rate limiter happy while still being ~5× faster than
 * sequential iteration.
 */
const CHUNK_CONCURRENCY = 5;

/**
 * Query all ContributorPaid events emitted by the BigNutenTreasury contract.
 * Returns events sorted most-recent first.
 *
 * Always uses a public Optimism JSON-RPC for log queries.  MetaMask's injected
 * provider routes through Infura which rejects `eth_getLogs` requests that span
 * more than ~2000 blocks — far less than our 9000-block chunks.  The public
 * `mainnet.optimism.io` endpoint supports up to 10000 blocks per request and
 * is the correct choice for read-only archive queries.
 *
 * Block chunks are fetched in parallel batches of CHUNK_CONCURRENCY to stay
 * well under the per-endpoint rate limit while still completing quickly.
 *
 * The scan window starts at `max(TREASURY_DEPLOY_BLOCK, latestBlock - 500_000)`,
 * which covers the last ~11 days of Optimism blocks.  This makes the function
 * robust against an inaccurate TREASURY_DEPLOY_BLOCK constant while keeping
 * the number of chunks small (≤ 56 chunks for a 500k-block window).
 *
 * @returns {Promise<Array<{contributor: string, issueRef: string, amount: number, txHash: string, blockNumber: number, timestamp: number}>>}
 */
export async function getContributorPaidEvents() {
  const treasuryAddress =
    window.TREASURY_CONTRACT_ADDRESS ||
    window.CONTRACTS?.treasury ||
    DEFAULT_TREASURY_ADDRESS;

  if (
    !treasuryAddress ||
    treasuryAddress === '0x0000000000000000000000000000000000000000'
  ) {
    return [];
  }

  const abi = await loadTreasuryAbi();

  // Always use the public Optimism JSON-RPC for log queries.
  // MetaMask routes through Infura which caps eth_getLogs at ~2 000 blocks;
  // our 9 000-block chunks would all fail silently (caught → []).
  const provider = new ethers.JsonRpcProvider(
    window.CONTRACTS?.rpcUrl || 'https://mainnet.optimism.io'
  );

  const treasury = new ethers.Contract(treasuryAddress, abi, provider);
  const filter   = treasury.filters.ContributorPaid();

  // Scan from whichever is later: the known deploy block OR 500 000 blocks
  // before the current tip (~11 days on Optimism at 2-second blocks).
  // This keeps chunk count small while tolerating an imprecise deploy block.
  const latestBlock = await provider.getBlockNumber();
  const startBlock  = Math.max(TREASURY_DEPLOY_BLOCK, latestBlock - 500_000);
  const chunks = [];
  for (let from = startBlock; from <= latestBlock; from += RPC_BLOCK_CHUNK) {
    chunks.push([from, Math.min(from + RPC_BLOCK_CHUNK - 1, latestBlock)]);
  }

  // Fetch chunks in parallel batches to avoid hammering the RPC with too many
  // concurrent requests while still being far faster than sequential iteration.
  let failedChunks = 0;
  const allLogs = [];
  for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
    const batch = chunks.slice(i, i + CHUNK_CONCURRENCY);
    const results = await Promise.all(
      batch.map(([from, to]) =>
        treasury.queryFilter(filter, from, to).catch(err => {
          failedChunks++;
          console.warn(`[getContributorPaidEvents] chunk ${from}-${to} failed:`, err);
          return [];
        })
      )
    );
    allLogs.push(...results.flat());
  }

  // If every single chunk failed, surface an error so the caller can show the
  // Retry button instead of silently rendering "No settled payouts found on-chain."
  if (chunks.length > 0 && failedChunks === chunks.length) {
    throw new Error(
      `All ${chunks.length} block-range queries failed. ` +
      'Check that the RPC endpoint (mainnet.optimism.io) is reachable and try again.'
    );
  }

  // Collect unique block numbers and batch-fetch timestamps in parallel.
  const blockNums = [...new Set(allLogs.map(l => l.blockNumber))];
  const blockTimestamps = new Map();
  await Promise.all(blockNums.map(async (bn) => {
    try {
      const block = await provider.getBlock(bn);
      blockTimestamps.set(bn, block?.timestamp || 0);
    } catch (_) {
      blockTimestamps.set(bn, 0);
    }
  }));

  const events = allLogs.map((log) => ({
    contributor: log.args.contributor,
    // Strip the compound-key wallet+role suffix (":0x…" or ":0x…:role") before
    // storing the display ref.  The raw compound key lives on-chain; we only need
    // the human-readable GitHub ref for display purposes.
    issueRef:    (log.args.issueRef || '').replace(/:0x[0-9a-fA-F]+(?::[a-z][a-z-]*)?$/i, ''),
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
 * Settle a batch of payouts in a single `batchPayContributors()` call.
 * The owner signs the transaction with MetaMask — no private key stored anywhere.
 *
 * Each element in `payouts` maps to one entry in the batch:
 *   - `contributor` — recipient wallet address
 *   - `amount`      — BNUT to transfer (whole tokens, not wei)
 *   - `issueRef`    — Unique key for this entry in the contract's `issuePaid` mapping.
 *                     Use the compound format `"org/repo#N:0xlowerContributor"` for
 *                     multi-contributor issues so each contributor gets an independent
 *                     payment record and the batch never triggers a duplicate-key revert.
 *
 * The caller is responsible for:
 *   1. Filtering out entries where `isIssuePaid(issueRef)` is already true.
 *   2. Ensuring every `contributor` is a valid (non-zero) Optimism address.
 *   3. Passing one entry per issue — the contract guards duplicates via `issuePaid`.
 *
 * @param {Array<{contributor: string, amount: string, issueRef: string}>} payouts
 *   Entries from the pending queue to include in the batch.
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
