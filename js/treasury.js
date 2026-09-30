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
const SETTLEMENT_ROUTER_CONFIG_URL = 'settlement-router.json';

/** Shared Settlement Router network: Base. */
const SETTLEMENT_CHAIN_ID = 8453;
const LEGACY_OPTIMISM_CHAIN_ID = 10;
const LEGACY_TREASURY_DEPLOY_BLOCK = 130_000_000;
const LEGACY_TREASURY_ABI = [
  'function owner() view returns (address)',
  'function getBalance() view returns (uint256)',
  'function isIssuePaid(string) view returns (bool)',
  'function batchPayContributors(address[],uint256[],string[])',
  'event ContributorPaid(address indexed contributor,uint256 amount,string issueRef)',
];
const ROUTER_ABI = [
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function PAYROLL_ROLE() view returns (bytes32)',
  'function CONTRIBUTOR_ADMIN_ROLE() view returns (bytes32)',
  'function hasRole(bytes32,address) view returns (bool)',
  'function funds(bytes32) view returns (string,bool,bool)',
  'function fundBalances(bytes32,address) view returns (uint256)',
  'function contributors(address) view returns (bytes32,bool,bool)',
  'function setContributorApproved(address,bytes32,bool)',
  'function completedWorkReferences(bytes32) view returns (bool)',
  'function payout(bytes32,address,address,uint256,bytes32,bytes32,bytes32,string,bytes32)',
  'event PayrollPaid(bytes32 indexed fundId,address indexed asset,address indexed recipient,uint256 amount,bytes32 workReference,bytes32 repositoryIdHash,bytes32 contributorIdHash,string metadataUri,bytes32 metadataHash)',
];

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

async function loadSettlementRouterConfig() {
  const res = await fetch(SETTLEMENT_ROUTER_CONFIG_URL + '?t=' + Date.now());
  if (!res.ok) throw new Error('Failed to load settlement router configuration');
  return res.json();
}

function activeNetworkConfig() {
  return window.CONTRACTS || window.getActiveBigNutenNetwork?.() || {};
}

function isLegacyOptimismActive() {
  return Number(activeNetworkConfig().chainId) === LEGACY_OPTIMISM_CHAIN_ID;
}

async function resolveRuntimeNetworkConfig() {
  if (window.ethereum && window.BIGNUTEN_NETWORKS) {
    const chainId = Number.parseInt(await window.ethereum.request({ method: 'eth_chainId' }), 16);
    const match = Object.entries(window.BIGNUTEN_NETWORKS)
      .find(([, config]) => Number(config.chainId) === chainId);
    if (match) return window.getBigNutenNetworkConfig(match[0]);
  }
  return activeNetworkConfig();
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
  const activeChainId = Number(activeNetworkConfig().chainId || network.chainId);
  if (Number(network.chainId) !== activeChainId) {
    throw new Error(`MetaMask is on chain ${network.chainId}; select ${activeNetworkConfig().label || 'the active BigNuten network'} in MetaMask.`);
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
export async function getTreasuryBalance(currency = 'BNUT') {
  const runtimeConfig = await resolveRuntimeNetworkConfig();
  if (Number(runtimeConfig.chainId) === LEGACY_OPTIMISM_CHAIN_ID) {
    const treasuryAddress = runtimeConfig.treasury || window.TREASURY_CONTRACT_ADDRESS;
    if (!treasuryAddress || String(currency).toUpperCase() !== 'BNUT') return 0;
    const provider = new ethers.JsonRpcProvider(runtimeConfig.rpcUrl || 'https://optimism-rpc.publicnode.com');
    const treasury = new ethers.Contract(treasuryAddress, LEGACY_TREASURY_ABI, provider);
    return Number(ethers.formatEther(await treasury.getBalance()));
  }
  const config = await loadSettlementRouterConfig();
  const asset = config.assets?.[String(currency).toUpperCase()];
  if (!config.routerAddress || !asset?.address) return 0;
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  const router = new ethers.Contract(config.routerAddress, ROUTER_ABI, provider);
  const fundId = ethers.keccak256(ethers.toUtf8Bytes(config.fundSlug));
  return Number(ethers.formatUnits(await router.fundBalances(fundId, asset.address), asset.decimals));
}

export async function getPayrollSettlementOptions(currency = 'BNUT') {
  const config = await resolveRuntimeNetworkConfig();
  const symbol = String(currency || 'BNUT').toUpperCase();
  const options = [];
  const provider = new ethers.JsonRpcProvider(config.rpcUrl || 'https://mainnet.base.org');

  if (config.treasury) {
    const tokenAddress = config.bnut;
    let balance = 0;
    if (tokenAddress && symbol === 'BNUT') {
      const token = new ethers.Contract(tokenAddress, ['function balanceOf(address) view returns (uint256)'], provider);
      balance = Number(ethers.formatEther(await token.balanceOf(config.treasury)));
    }
    options.push({ source: 'treasury', label: 'BigNuten Treasury', address: config.treasury, balance, available: symbol === 'BNUT' });
  }

  if (Number(config.chainId) === LEGACY_OPTIMISM_CHAIN_ID) return options;

  const routerConfig = await loadSettlementRouterConfig();
  const asset = routerConfig.assets?.[symbol];
  if (routerConfig.routerAddress && asset?.address) {
    const routerProvider = new ethers.JsonRpcProvider(routerConfig.rpcUrl, routerConfig.chainId);
    const router = new ethers.Contract(routerConfig.routerAddress, ROUTER_ABI, routerProvider);
    const fundId = ethers.keccak256(ethers.toUtf8Bytes(routerConfig.fundSlug));
    const balance = Number(ethers.formatUnits(await router.fundBalances(fundId, asset.address), asset.decimals));
    options.push({ source: 'router', label: `Settlements Router · ${routerConfig.fundSlug}`, address: routerConfig.routerAddress, balance, available: true });
  }
  return options;
}

// ─── Exported: isTreasuryOwner ────────────────────────────────────────────────

/**
 * Check whether `walletAddress` is the owner of the Treasury contract.
 *
 * @param {string} walletAddress
 * @returns {Promise<boolean>}
 */
export async function isTreasuryOwner(walletAddress) {
  try {
    if (isLegacyOptimismActive()) {
      const treasuryAddress = activeNetworkConfig().treasury || window.TREASURY_CONTRACT_ADDRESS;
      if (!walletAddress || !treasuryAddress) return false;
      const provider = new ethers.JsonRpcProvider(activeNetworkConfig().rpcUrl || 'https://optimism-rpc.publicnode.com');
      const treasury = new ethers.Contract(treasuryAddress, LEGACY_TREASURY_ABI, provider);
      return (await treasury.owner()).toLowerCase() === walletAddress.toLowerCase();
    }
    const config = await loadSettlementRouterConfig();
    if (!walletAddress || !config.routerAddress) return false;
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    const router = new ethers.Contract(config.routerAddress, ROUTER_ABI, provider);
    return router.hasRole(await router.DEFAULT_ADMIN_ROLE(), walletAddress);
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
  try {
    if (isLegacyOptimismActive()) {
      const treasuryAddress = activeNetworkConfig().treasury || window.TREASURY_CONTRACT_ADDRESS;
      if (!issueRef || !treasuryAddress) return false;
      const provider = new ethers.JsonRpcProvider(activeNetworkConfig().rpcUrl || 'https://optimism-rpc.publicnode.com');
      const treasury = new ethers.Contract(treasuryAddress, LEGACY_TREASURY_ABI, provider);
      return treasury.isIssuePaid(issueRef);
    }
    const config = await loadSettlementRouterConfig();
    if (!issueRef || !config.routerAddress) return false;
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    const router = new ethers.Contract(config.routerAddress, ROUTER_ABI, provider);
    return router.completedWorkReferences(ethers.keccak256(ethers.toUtf8Bytes(issueRef)));
  } catch (_) {
    return false;
  }
}

// ─── Exported: getContributorPaidEvents ──────────────────────────────────────

/**
 * The shared router is on Base. A rolling window keeps public-RPC log queries
 * bounded while covering recent project payroll activity.
 */
const SETTLEMENT_ROUTER_DEPLOY_BLOCK = 0;

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
 * Query PayrollPaid events emitted by the shared Settlement Router.
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
  if (isLegacyOptimismActive()) {
    const treasuryAddress = activeNetworkConfig().treasury || window.TREASURY_CONTRACT_ADDRESS;
    if (!treasuryAddress) return [];
    const provider = new ethers.JsonRpcProvider(activeNetworkConfig().rpcUrl || 'https://optimism-rpc.publicnode.com');
    const treasury = new ethers.Contract(treasuryAddress, LEGACY_TREASURY_ABI, provider);
    const latestBlock = await provider.getBlockNumber();
    const filter = treasury.filters.ContributorPaid();
    const fromBlock = Math.max(LEGACY_TREASURY_DEPLOY_BLOCK, latestBlock - 500_000);
    const logs = await treasury.queryFilter(filter, fromBlock, latestBlock);
    return logs.map(log => ({
      contributor: log.args.contributor,
      issueRef: log.args.issueRef,
      amount: Number(ethers.formatEther(log.args.amount)),
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      timestamp: 0,
    })).sort((a, b) => b.blockNumber - a.blockNumber);
  }
  const config = await loadSettlementRouterConfig();
  if (!config.routerAddress) return [];

  // Always use the public Optimism JSON-RPC for log queries.
  // MetaMask routes through Infura which caps eth_getLogs at ~2 000 blocks;
  // our 9 000-block chunks would all fail silently (caught → []).
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  const router = new ethers.Contract(config.routerAddress, ROUTER_ABI, provider);
  const filter = router.filters.PayrollPaid();

  // Scan from whichever is later: the known deploy block OR 500 000 blocks
  // before the current tip (~11 days on Optimism at 2-second blocks).
  // This keeps chunk count small while tolerating an imprecise deploy block.
  const latestBlock = await provider.getBlockNumber();
  const startBlock  = Math.max(SETTLEMENT_ROUTER_DEPLOY_BLOCK, latestBlock - 500_000);
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
        router.queryFilter(filter, from, to).catch(err => {
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
      'Check that the Optimism RPC endpoint is reachable and try again.'
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
    issueRef:    String(log.args.metadataUri || log.args.workReference),
    amount:      Number(ethers.formatUnits(log.args.amount, config.assets?.[Object.keys(config.assets || {}).find(symbol => config.assets[symbol].address?.toLowerCase() === String(log.args.asset).toLowerCase())]?.decimals || 18)),
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
export async function settlePayroll(payouts, { source = 'router' } = {}) {
  if (!payouts || payouts.length === 0) {
    throw new Error('No payouts to settle.');
  }
  if (isLegacyOptimismActive()) {
    if (payouts.some(p => String(p.currency || 'BNUT').toUpperCase() !== 'BNUT')) {
      throw new Error('Legacy Optimism treasury can settle BNUT entries only.');
    }
    const treasuryAddress = activeNetworkConfig().treasury || window.TREASURY_CONTRACT_ADDRESS;
    if (!treasuryAddress) throw new Error('Legacy Optimism treasury address is not configured.');
    const { signer } = await getSignerContext();
    const treasury = new ethers.Contract(treasuryAddress, LEGACY_TREASURY_ABI, signer);
    const tx = await treasury.batchPayContributors(
      payouts.map(p => ethers.getAddress(p.contributor)),
      payouts.map(p => ethers.parseEther(String(p.amount))),
      payouts.map(p => p.issueRef),
    );
    await tx.wait();
    return tx.hash;
  }

  const config = await loadSettlementRouterConfig();
  if (source === 'treasury') {
    const treasuryAddress = activeNetworkConfig().treasury;
    if (!treasuryAddress) throw new Error('Base BigNuten Treasury is not deployed yet.');
    if (payouts.some(p => String(p.currency || 'BNUT').toUpperCase() !== 'BNUT')) {
      throw new Error('BigNuten Treasury can settle BNUT entries only.');
    }
    const { signer } = await getSignerContext();
    const treasury = new ethers.Contract(treasuryAddress, LEGACY_TREASURY_ABI, signer);
    const tx = await treasury.batchPayContributors(
      payouts.map(p => ethers.getAddress(p.contributor)),
      payouts.map(p => ethers.parseEther(String(p.amount))),
      payouts.map(p => p.issueRef),
    );
    await tx.wait();
    return tx.hash;
  }
  if (!config.routerAddress) throw new Error('Settlement router address is not configured.');
  const { signer } = await getSignerContext();
  const router = new ethers.Contract(config.routerAddress, ROUTER_ABI, signer);
  const owner = await signer.getAddress();
  const fundId = ethers.keccak256(ethers.toUtf8Bytes(config.fundSlug));
  if (!(await router.hasRole(await router.PAYROLL_ROLE(), owner))) {
    throw new Error('Connected wallet lacks PAYROLL_ROLE on the settlement router.');
  }

  let lastHash;
  for (const payout of payouts) {
    const currency = String(payout.currency || 'BNUT').toUpperCase();
    const asset = config.assets?.[currency];
    if (!asset?.address || asset.manual) throw new Error(`${currency} is not configured for router settlement.`);
    const recipient = ethers.getAddress(payout.contributor);
    const contributorHash = ethers.id(String(payout.contributorGithub || '').trim());
    const contributor = await router.contributors(recipient);
    if (!(contributor.approved ?? contributor[1])) {
      await (await router.setContributorApproved(recipient, contributorHash, true)).wait();
    }
    const workReference = ethers.keccak256(ethers.toUtf8Bytes(payout.issueRef));
    const repository = String(payout.issueRef).split('#')[0];
    const metadataUri = `https://github.com/${payout.issueRef.replace('#', '/issues/')}`;
    const metadataHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payout)));
    const tx = await router.payout(
      fundId,
      asset.address,
      recipient,
      ethers.parseUnits(String(payout.amount), asset.decimals),
      workReference,
      ethers.id(repository),
      contributorHash,
      metadataUri,
      metadataHash,
    );
    await tx.wait();
    lastHash = tx.hash;
  }
  return lastHash;
}
