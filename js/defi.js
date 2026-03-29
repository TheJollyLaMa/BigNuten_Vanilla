/**
 * js/defi.js
 * v3 DeFi Treasury Panel — Yield Management Dashboard & Manual Dev Fund Borrowing
 *
 * Provides:
 *  - initDeFiPanel()      — call once on DOMContentLoaded
 *  - loadDeFiBalances()   — exposed on window for the modal onOpen callback
 *
 * Protocols supported (Optimism Mainnet):
 *  - Aave V3  — supply USDC, borrow USDC
 *  - Alchemix V2 (alUSD AlchemistV2) — deposit yvUSDC, mint/borrow alUSD
 *
 * Movement history is persisted in localStorage under 'defi_movement_history'.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFI_HISTORY_KEY        = 'defi_movement_history';
const DEFI_HISTORY_MAX        = 200;
const DEFI_SCRAPE_BLOCKS      = 2000;  // ~5.5 h on Optimism (2 s block time)
const DEFI_SCRAPE_COOLDOWN_MS = 10 * 60 * 1000; // 10 min between background scrapes
const DEFI_SCRAPE_TS_KEY      = 'defi_last_scrape_ts';

// Aave V3 on Optimism Mainnet
const AAVE_V3_POOL_ADDRESS    = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
// Alchemix V2 alUSD AlchemistV2 on Optimism Mainnet
const ALCHEMIST_V2_ADDRESS    = '0x10294d57A419C8eb78C648372c5bAA27fD1484af';
// Recommended yvUSDC yield token for Alchemix on Optimism (Yearn USDC vault)
const ALCHEMIX_YIELD_TOKEN    = '0xaD17A225074191d5c8a37B50FdA1AE278a2EE6A2';

// Aave returns max uint256 for health factor when there is no debt
const AAVE_MAX_HF_STRING = '115792089237316195423570985008687907853269984665640564039457.584';
// Alchemix: 1% slippage tolerance on depositUnderlying (99 out of 100 basis)
const ALCHEMIX_MIN_OUT_PERCENT = 99n;

// Minimal ABIs ─────────────────────────────────────────────────────────────────

const ERC20_MIN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

const AAVE_POOL_ABI = [
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
];

const ALCHEMIST_V2_ABI = [
  'function accounts(address owner) view returns (int256 debt, address[] depositedTokens)',
  'function positions(address owner, address yieldToken) view returns (uint256 shares, uint256 lastAccruedWeight)',
  'function convertSharesToUnderlyingTokens(address yieldToken, uint256 shares) view returns (uint256)',
  'function deposit(address yieldToken, uint256 amount, address recipient) returns (uint256)',
  'function depositUnderlying(address yieldToken, uint256 amount, address recipient, uint256 minimumAmountOut) returns (uint256)',
  'function mint(uint256 amount, address recipient)',
];

const TREASURY_MIN_ABI = [
  'function getBalance() view returns (uint256 balance)',
  'function owner() view returns (address)',
];

// Event ABIs for chain scraping ───────────────────────────────────────────────

const AAVE_EVENTS_ABI = [
  'event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)',
  'event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint256 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)',
  'event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)',
  'event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)',
];

const ALCHEMIST_EVENTS_ABI = [
  'event Deposit(address indexed sender, address indexed yieldToken, uint256 amount, address indexed recipient)',
  'event Withdraw(address indexed sender, address indexed yieldToken, uint256 amount, address indexed recipient)',
  'event Mint(address indexed sender, uint256 amount, address indexed recipient)',
  'event Burn(address indexed sender, uint256 amount, address indexed recipient)',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRpc() {
  return (window.CONTRACTS && window.CONTRACTS.rpcUrl) || 'https://mainnet.optimism.io';
}

function getUsdcAddress() {
  return (window.CONTRACTS && window.CONTRACTS.usdc) || '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85';
}

function getTreasuryAddress() {
  return window.TREASURY_CONTRACT_ADDRESS || '0x143cC41AC075FFA40be1993827DA6ffB4638A363';
}

function getEscrowAddress() {
  return (window.CONTRACTS && window.CONTRACTS.dnftEscrow) || '0x23A457AD3C33d68E4fAd2FCa7c5d9a511E0C350e';
}

function fmtUsdc(wei) {
  return (Number(wei) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtEther(wei) {
  try {
    const n = Number(ethers.formatEther(wei));
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } catch { return '—'; }
}

function fmtAaveBase(raw) {
  // Aave prices are USD * 1e8 (8 decimals via Chainlink)
  return (Number(raw) / 1e8).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function statusEl(id, msg, isErr) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = isErr ? '#ff6b6b' : '#00e5ff';
}

async function requireOptimism(provider) {
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 10) {
    throw new Error('Please switch MetaMask to Optimism Mainnet (chain ID 10).');
  }
}

async function requireMetaMask() {
  if (!window.ethereum) throw new Error('MetaMask not detected. Please install MetaMask.');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) throw new Error('No wallet connected.');
  return accounts[0];
}

// ─── Admin Guard ──────────────────────────────────────────────────────────────

async function requireAdmin(wallet, provider) {
  const treasury = getTreasuryAddress();
  if (!treasury || treasury === '0x0000000000000000000000000000000000000000') {
    throw new Error('Treasury contract address not configured.');
  }
  const contract = new ethers.Contract(treasury, TREASURY_MIN_ABI, provider);
  let owner;
  try {
    owner = await contract.owner();
  } catch (err) {
    console.warn('[DeFi] requireAdmin owner() call failed:', err);
    throw new Error('Could not verify admin status — treasury contract unreachable.');
  }
  if (owner.toLowerCase() !== wallet.toLowerCase()) {
    throw new Error('🚫 Access denied. Only the treasury owner can perform this action.');
  }
}

// ─── Movement History ─────────────────────────────────────────────────────────

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(DEFI_HISTORY_KEY) || '[]');
  } catch { return []; }
}

function addHistory(entry) {
  const history = getHistory();
  history.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (history.length > DEFI_HISTORY_MAX) history.length = DEFI_HISTORY_MAX;
  localStorage.setItem(DEFI_HISTORY_KEY, JSON.stringify(history));
}

function renderHistory() {
  const container = document.getElementById('defi-history-list');
  if (!container) return;
  const history = getHistory();
  if (history.length === 0) {
    container.innerHTML = '<p style="color:#7a9aa8;font-size:0.83rem;">No movements recorded yet.</p>';
    return;
  }
  const rows = history.map(e => {
    const date = new Date(e.timestamp).toLocaleString();
    const hash = e.txHash
      ? `<a href="https://optimistic.etherscan.io/tx/${e.txHash}" target="_blank" rel="noopener noreferrer" style="color:#00e5ff;font-family:monospace;font-size:0.75rem;">${e.txHash.slice(0, 10)}…</a>`
      : '—';
    const sourceTag = e.fromChain
      ? '<span style="font-size:0.68rem;color:#7a9aa8;margin-left:0.3rem;" title="Scraped from chain">⛓</span>'
      : '';
    return `<tr>
      <td>${date}</td>
      <td><span class="defi-protocol-badge defi-protocol-${(e.protocol || '').toLowerCase()}">${e.protocol || '—'}</span></td>
      <td>${e.action || '—'}${sourceTag}</td>
      <td>${e.amount || '—'}</td>
      <td>${hash}</td>
    </tr>`;
  }).join('');
  container.innerHTML = `
    <table class="treasury-mints-table">
      <thead>
        <tr>
          <th>Date</th><th>Protocol</th><th>Action</th><th>Amount</th><th>Tx</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ─── Chain Event Scraping ─────────────────────────────────────────────────────

async function scrapeChainEvents(silent = false) {
  // Cooldown: skip background scrapes that are too recent
  if (silent) {
    const lastTs = Number(localStorage.getItem(DEFI_SCRAPE_TS_KEY) || 0);
    if (Date.now() - lastTs < DEFI_SCRAPE_COOLDOWN_MS) {
      console.log('[DeFi] Background scrape skipped (cooldown).');
      return;
    }
  }

  const scrapeBtn    = document.getElementById('defi-scrape-btn');
  const scrapeStatus = document.getElementById('defi-scrape-status');

  if (scrapeBtn) { scrapeBtn.disabled = true; scrapeBtn.textContent = '⏳ Scraping…'; }
  if (scrapeStatus) { scrapeStatus.textContent = ''; scrapeStatus.style.color = '#00e5ff'; }

  // Block-timestamp cache to minimise RPC calls; returns null on failure
  const blockTsCache = {};
  async function getBlockTs(provider, blockNumber) {
    if (blockTsCache[blockNumber] !== undefined) return blockTsCache[blockNumber];
    try {
      const blk = await provider.getBlock(blockNumber);
      blockTsCache[blockNumber] = blk ? Number(blk.timestamp) * 1000 : null;
    } catch { blockTsCache[blockNumber] = null; }
    return blockTsCache[blockNumber];
  }

  try {
    const rpc      = getRpc();
    const provider = new ethers.JsonRpcProvider(rpc);
    const usdcAddr = getUsdcAddress().toLowerCase();
    const treasury = getTreasuryAddress().toLowerCase();

    let wallet = null;
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        wallet = accounts[0] ? accounts[0].toLowerCase() : null;
      }
    } catch {}

    // Build deduplicated list of addresses to search
    const watchAddrs = [...new Set([treasury, wallet].filter(Boolean))];

    const currentBlock = await provider.getBlockNumber();
    const fromBlock    = Math.max(0, currentBlock - DEFI_SCRAPE_BLOCKS);

    const aavePool  = new ethers.Contract(AAVE_V3_POOL_ADDRESS, [...AAVE_POOL_ABI, ...AAVE_EVENTS_ABI], provider);
    const alchemist = new ethers.Contract(ALCHEMIST_V2_ADDRESS, [...ALCHEMIST_V2_ABI, ...ALCHEMIST_EVENTS_ABI], provider);

    const scraped = [];

    // Helper: push entry only when we have a valid block timestamp
    async function pushEvent(entry, blockNumber) {
      const ts = await getBlockTs(provider, blockNumber);
      if (ts === null) return; // skip event rather than record misleading timestamp
      scraped.push({ ...entry, timestamp: new Date(ts).toISOString(), fromChain: true });
    }

    for (const addr of watchAddrs) {
      // ── Aave Supply (onBehalfOf = addr) ────────────────────────────────────
      try {
        const evts = await aavePool.queryFilter(aavePool.filters.Supply(null, null, addr), fromBlock, currentBlock);
        for (const e of evts) {
          if (e.args.reserve.toLowerCase() !== usdcAddr) continue;
          await pushEvent({
            protocol: 'Aave', action: 'Supply',
            amount: (Number(e.args.amount) / 1e6).toFixed(2) + ' USDC',
            txHash: e.transactionHash,
          }, e.blockNumber);
        }
      } catch (err) { console.warn('[DeFi] Aave Supply scrape:', err.message); }

      // ── Aave Borrow (onBehalfOf = addr) ────────────────────────────────────
      try {
        const evts = await aavePool.queryFilter(aavePool.filters.Borrow(null, null, addr), fromBlock, currentBlock);
        for (const e of evts) {
          if (e.args.reserve.toLowerCase() !== usdcAddr) continue;
          await pushEvent({
            protocol: 'Aave', action: 'Borrow',
            amount: (Number(e.args.amount) / 1e6).toFixed(2) + ' USDC',
            txHash: e.transactionHash,
          }, e.blockNumber);
        }
      } catch (err) { console.warn('[DeFi] Aave Borrow scrape:', err.message); }

      // ── Aave Repay (user = addr) ────────────────────────────────────────────
      try {
        const evts = await aavePool.queryFilter(aavePool.filters.Repay(null, addr), fromBlock, currentBlock);
        for (const e of evts) {
          if (e.args.reserve.toLowerCase() !== usdcAddr) continue;
          await pushEvent({
            protocol: 'Aave', action: 'Repay',
            amount: (Number(e.args.amount) / 1e6).toFixed(2) + ' USDC',
            txHash: e.transactionHash,
          }, e.blockNumber);
        }
      } catch (err) { console.warn('[DeFi] Aave Repay scrape:', err.message); }

      // ── Aave Withdraw (user = addr) ─────────────────────────────────────────
      try {
        const evts = await aavePool.queryFilter(aavePool.filters.Withdraw(null, addr), fromBlock, currentBlock);
        for (const e of evts) {
          if (e.args.reserve.toLowerCase() !== usdcAddr) continue;
          await pushEvent({
            protocol: 'Aave', action: 'Withdraw',
            amount: (Number(e.args.amount) / 1e6).toFixed(2) + ' USDC',
            txHash: e.transactionHash,
          }, e.blockNumber);
        }
      } catch (err) { console.warn('[DeFi] Aave Withdraw scrape:', err.message); }

      // ── Alchemix Deposit (sender = addr) ───────────────────────────────────
      try {
        const evts = await alchemist.queryFilter(alchemist.filters.Deposit(addr), fromBlock, currentBlock);
        for (const e of evts) {
          await pushEvent({
            protocol: 'Alchemix', action: 'Deposit',
            amount: (Number(e.args.amount) / 1e6).toFixed(2) + ' yvUSDC',
            txHash: e.transactionHash,
          }, e.blockNumber);
        }
      } catch (err) { console.warn('[DeFi] Alchemix Deposit scrape:', err.message); }

      // ── Alchemix Mint (sender = addr) ───────────────────────────────────────
      try {
        const evts = await alchemist.queryFilter(alchemist.filters.Mint(addr), fromBlock, currentBlock);
        for (const e of evts) {
          await pushEvent({
            protocol: 'Alchemix', action: 'Borrow/Mint',
            amount: Number(ethers.formatEther(e.args.amount)).toFixed(4) + ' alUSD',
            txHash: e.transactionHash,
          }, e.blockNumber);
        }
      } catch (err) { console.warn('[DeFi] Alchemix Mint scrape:', err.message); }

      // ── Alchemix Repay/Burn (sender = addr) ─────────────────────────────────
      try {
        const evts = await alchemist.queryFilter(alchemist.filters.Burn(addr), fromBlock, currentBlock);
        for (const e of evts) {
          await pushEvent({
            protocol: 'Alchemix', action: 'Repay',
            amount: Number(ethers.formatEther(e.args.amount)).toFixed(4) + ' alUSD',
            txHash: e.transactionHash,
          }, e.blockNumber);
        }
      } catch (err) { console.warn('[DeFi] Alchemix Repay scrape:', err.message); }

      // ── Alchemix Withdraw (sender = addr) ──────────────────────────────────
      try {
        const evts = await alchemist.queryFilter(alchemist.filters.Withdraw(addr), fromBlock, currentBlock);
        for (const e of evts) {
          await pushEvent({
            protocol: 'Alchemix', action: 'Withdraw',
            amount: (Number(e.args.amount) / 1e6).toFixed(2) + ' yvUSDC',
            txHash: e.transactionHash,
          }, e.blockNumber);
        }
      } catch (err) { console.warn('[DeFi] Alchemix Withdraw scrape:', err.message); }
    }

    // Merge: deduplicate by txHash against existing localStorage history
    const existing       = getHistory();
    const existingHashes = new Set(existing.map(e => e.txHash).filter(Boolean));
    const toAdd          = scraped.filter(e => e.txHash && !existingHashes.has(e.txHash));

    // Record successful scrape time before touching history
    localStorage.setItem(DEFI_SCRAPE_TS_KEY, String(Date.now()));

    if (toAdd.length > 0) {
      const merged = [...toAdd, ...existing];
      merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      if (merged.length > DEFI_HISTORY_MAX) merged.length = DEFI_HISTORY_MAX;
      localStorage.setItem(DEFI_HISTORY_KEY, JSON.stringify(merged));
      renderHistory();
      console.log(`[DeFi] Scraped ${toAdd.length} new chain event(s).`);
      if (!silent && scrapeStatus) {
        scrapeStatus.textContent = `✅ Added ${toAdd.length} new event(s) from chain.`;
      }
    } else {
      console.log('[DeFi] Chain scrape: no new events found.');
      if (!silent && scrapeStatus) {
        scrapeStatus.textContent = '✅ No new events found on chain.';
      }
    }
  } catch (err) {
    console.warn('[DeFi] Chain scrape error:', err);
    if (!silent && scrapeStatus) {
      scrapeStatus.textContent = '⚠️ Scrape failed: ' + (err.message || err);
      scrapeStatus.style.color = '#ff6b6b';
    }
  } finally {
    if (scrapeBtn) { scrapeBtn.disabled = false; scrapeBtn.textContent = '🔍 Scrape Chain Events'; }
  }
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportHistoryCSV() {
  const history = getHistory();
  if (history.length === 0) { alert('No movement history to export.'); return; }

  const header = ['Timestamp', 'Protocol', 'Action', 'Amount', 'Tx Hash', 'Etherscan URL'];
  const rows = history.map(e => [
    e.timestamp || '',
    e.protocol  || '',
    e.action    || '',
    e.amount    || '',
    e.txHash    || '',
    e.txHash ? `https://optimistic.etherscan.io/tx/${e.txHash}` : '',
  ]);

  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `defi-history-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Copy to Clipboard ────────────────────────────────────────────────────────

async function copyHistoryToClipboard() {
  const history = getHistory();
  if (history.length === 0) { alert('No movement history to copy.'); return; }

  const header = 'Timestamp\tProtocol\tAction\tAmount\tTx Hash';
  const rows   = history.map(e => [
    e.timestamp ? new Date(e.timestamp).toLocaleString() : '',
    e.protocol  || '',
    e.action    || '',
    e.amount    || '',
    e.txHash    || '',
  ].join('\t'));

  const text = [header, ...rows].join('\n');

  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('defi-copy-history-btn');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    }
  } catch (err) {
    alert('Failed to copy to clipboard: ' + (err.message || err));
  }
}

// ─── Balance Readers ──────────────────────────────────────────────────────────

async function loadOverviewBalances() {
  const rpc      = getRpc();
  const provider = new ethers.JsonRpcProvider(rpc);
  const usdc     = getUsdcAddress();
  const treasury = getTreasuryAddress();
  const escrow   = getEscrowAddress();

  const usdcContract     = new ethers.Contract(usdc, ERC20_MIN_ABI, provider);
  const treasuryContract = new ethers.Contract(treasury, TREASURY_MIN_ABI, provider);

  const [treasuryBnut, escrowUsdc, walletAddr] = await Promise.allSettled([
    treasuryContract.getBalance(),
    usdcContract.balanceOf(escrow),
    Promise.resolve(
      window.ethereum
        ? window.ethereum.request({ method: 'eth_accounts' }).then(a => a[0] || null)
        : null
    ),
  ]);

  setEl('defi-treasury-bnut',
    treasuryBnut.status === 'fulfilled'
      ? fmtEther(treasuryBnut.value) + ' BNUT'
      : 'Error');

  setEl('defi-escrow-usdc',
    escrowUsdc.status === 'fulfilled'
      ? fmtUsdc(escrowUsdc.value) + ' USDC'
      : 'Error');

  const wallet = walletAddr.status === 'fulfilled' ? walletAddr.value : null;
  if (wallet) {
    const [walletUsdcBal, walletEthBal] = await Promise.allSettled([
      usdcContract.balanceOf(wallet),
      provider.getBalance(wallet),
    ]);
    setEl('defi-wallet-usdc',
      walletUsdcBal.status === 'fulfilled'
        ? fmtUsdc(walletUsdcBal.value) + ' USDC'
        : 'Error');
    setEl('defi-wallet-eth',
      walletEthBal.status === 'fulfilled'
        ? fmtEther(walletEthBal.value) + ' ETH'
        : 'Error');
    setEl('defi-wallet-addr', wallet);
  } else {
    setEl('defi-wallet-usdc', 'Connect wallet');
    setEl('defi-wallet-eth', 'Connect wallet');
    setEl('defi-wallet-addr', '—');
  }
}

async function loadAaveBalances() {
  const rpc      = getRpc();
  const provider = new ethers.JsonRpcProvider(rpc);
  const pool     = new ethers.Contract(AAVE_V3_POOL_ADDRESS, AAVE_POOL_ABI, provider);

  // Determine address to query: prefer connected wallet, fallback treasury
  let addr = null;
  try {
    if (window.ethereum) {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      addr = accounts[0] || null;
    }
  } catch {}
  if (!addr) addr = getTreasuryAddress();

  setEl('defi-aave-addr', addr);

  try {
    const [totalCollateralBase, totalDebtBase, availableBorrowsBase, , ltv, healthFactor] =
      await pool.getUserAccountData(addr);

    const collateral = fmtAaveBase(totalCollateralBase);
    const debt       = fmtAaveBase(totalDebtBase);
    const available  = fmtAaveBase(availableBorrowsBase);
    const ltvPct     = (Number(ltv) / 100).toFixed(2) + '%';
    const hf         = Number(ethers.formatEther(healthFactor)).toFixed(3);

    setEl('defi-aave-collateral', collateral + ' USD');
    setEl('defi-aave-debt', debt + ' USD');
    setEl('defi-aave-available', available + ' USD');
    setEl('defi-aave-ltv', ltvPct);
    setEl('defi-aave-hf', hf === AAVE_MAX_HF_STRING ? '∞' : hf);

    const ltvNum = Number(ltv) / 100;
    const ltvBar = document.getElementById('defi-aave-ltv-bar-fill');
    if (ltvBar) ltvBar.style.width = Math.min(ltvNum, 100) + '%';
  } catch (e) {
    console.warn('[DeFi] Aave read error:', e);
    ['defi-aave-collateral', 'defi-aave-debt', 'defi-aave-available', 'defi-aave-ltv', 'defi-aave-hf']
      .forEach(id => setEl(id, 'Error'));
  }
}

async function loadAlchemixBalances() {
  const rpc       = getRpc();
  const provider  = new ethers.JsonRpcProvider(rpc);
  const alchemist = new ethers.Contract(ALCHEMIST_V2_ADDRESS, ALCHEMIST_V2_ABI, provider);

  let addr = null;
  try {
    if (window.ethereum) {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      addr = accounts[0] || null;
    }
  } catch {}
  if (!addr) addr = getTreasuryAddress();

  setEl('defi-alchemix-addr', addr);

  try {
    const [debt, depositedTokens] = await alchemist.accounts(addr);
    const debtNum = Number(ethers.formatEther(debt));

    let totalCollateral = 0n;
    for (const yt of depositedTokens) {
      try {
        const pos = await alchemist.positions(addr, yt);
        const underlying = await alchemist.convertSharesToUnderlyingTokens(yt, pos.shares);
        totalCollateral += underlying;
      } catch {}
    }

    // Collateral is in USDC-like units (6 decimals)
    const collateralNum = Number(totalCollateral) / 1e6;
    const ltvPct = collateralNum > 0 ? ((Math.abs(debtNum) / collateralNum) * 100).toFixed(2) + '%' : '0.00%';
    const debtCeiling = collateralNum > 0 ? (collateralNum * 0.5).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';

    const availableAlUsd = collateralNum > 0
      ? Math.max(0, collateralNum * 0.5 - Math.abs(debtNum)).toLocaleString(undefined, { maximumFractionDigits: 4 })
      : '0';

    setEl('defi-alchemix-collateral', collateralNum.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' USDC');
    setEl('defi-alchemix-debt', Math.abs(debtNum).toLocaleString(undefined, { maximumFractionDigits: 4 }) + ' alUSD');
    setEl('defi-alchemix-ceiling', debtCeiling ? debtCeiling + ' alUSD (50%)' : '—');
    setEl('defi-alchemix-available', availableAlUsd + ' alUSD');
    setEl('defi-alchemix-ltv', ltvPct);

    const ltvBar = document.getElementById('defi-alchemix-ltv-bar-fill');
    if (ltvBar) ltvBar.style.width = Math.min(parseFloat(ltvPct), 100) + '%';
  } catch (e) {
    console.warn('[DeFi] Alchemix read error:', e);
    ['defi-alchemix-collateral', 'defi-alchemix-debt', 'defi-alchemix-ceiling', 'defi-alchemix-ltv']
      .forEach(id => setEl(id, 'Error'));
  }
}

// ─── Action: Aave Supply ──────────────────────────────────────────────────────

async function aaveSupplyUsdc() {
  const statusId = 'defi-aave-supply-status';
  try {
    statusEl(statusId, '⏳ Connecting wallet…');
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    await requireAdmin(wallet, provider);

    const amountInput = document.getElementById('defi-aave-supply-amount');
    const rawAmt = amountInput ? amountInput.value.trim() : '';
    if (!rawAmt || isNaN(rawAmt) || Number(rawAmt) <= 0) {
      throw new Error('Enter a valid USDC amount.');
    }
    const amountWei = BigInt(Math.floor(Number(rawAmt) * 1e6));

    const signer      = await provider.getSigner();
    const usdcAddr    = getUsdcAddress();
    const usdcContract = new ethers.Contract(usdcAddr, ERC20_MIN_ABI, signer);

    // Approve Aave to spend USDC
    statusEl(statusId, '⏳ Approving USDC…');
    const allowance = await usdcContract.allowance(wallet, AAVE_V3_POOL_ADDRESS);
    if (allowance < amountWei) {
      const approveTx = await usdcContract.approve(AAVE_V3_POOL_ADDRESS, amountWei);
      statusEl(statusId, '⏳ Waiting for approval tx…');
      await approveTx.wait();
    }

    const pool = new ethers.Contract(AAVE_V3_POOL_ADDRESS, AAVE_POOL_ABI, signer);
    statusEl(statusId, '⏳ Supplying to Aave…');
    const tx = await pool.supply(usdcAddr, amountWei, wallet, 0);
    statusEl(statusId, '⏳ Waiting for confirmation…');
    await tx.wait();

    addHistory({ protocol: 'Aave', action: 'Supply', amount: rawAmt + ' USDC', txHash: tx.hash });
    renderHistory();
    statusEl(statusId, `✅ Supplied ${rawAmt} USDC to Aave. Tx: ${tx.hash.slice(0, 10)}…`);
    await loadAaveBalances();
  } catch (e) {
    statusEl(statusId, '❌ ' + (e.reason || e.message || 'Unknown error'), true);
  }
}

// ─── Action: Aave Borrow ──────────────────────────────────────────────────────

async function aaveBorrowUsdc() {
  const statusId = 'defi-aave-borrow-status';
  try {
    statusEl(statusId, '⏳ Connecting wallet…');
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    await requireAdmin(wallet, provider);

    const amountInput = document.getElementById('defi-aave-borrow-amount');
    const rawAmt = amountInput ? amountInput.value.trim() : '';
    if (!rawAmt || isNaN(rawAmt) || Number(rawAmt) <= 0) {
      throw new Error('Enter a valid USDC amount to borrow.');
    }
    const amountWei = BigInt(Math.floor(Number(rawAmt) * 1e6));

    const signer  = await provider.getSigner();
    const pool    = new ethers.Contract(AAVE_V3_POOL_ADDRESS, AAVE_POOL_ABI, signer);
    const usdcAddr = getUsdcAddress();

    statusEl(statusId, '⏳ Submitting borrow tx…');
    // interestRateMode 2 = variable rate
    const tx = await pool.borrow(usdcAddr, amountWei, 2, 0, wallet);
    statusEl(statusId, '⏳ Waiting for confirmation…');
    await tx.wait();

    addHistory({ protocol: 'Aave', action: 'Borrow', amount: rawAmt + ' USDC', txHash: tx.hash });
    renderHistory();
    statusEl(statusId, `✅ Borrowed ${rawAmt} USDC from Aave. Tx: ${tx.hash.slice(0, 10)}…`);
    await loadAaveBalances();
  } catch (e) {
    statusEl(statusId, '❌ ' + (e.reason || e.message || 'Unknown error'), true);
  }
}

// ─── Action: Alchemix Deposit ─────────────────────────────────────────────────

async function alchemixDepositUsdc() {
  const statusId = 'defi-alchemix-deposit-status';
  try {
    statusEl(statusId, '⏳ Connecting wallet…');
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    await requireAdmin(wallet, provider);

    const amountInput = document.getElementById('defi-alchemix-deposit-amount');
    const rawAmt = amountInput ? amountInput.value.trim() : '';
    if (!rawAmt || isNaN(rawAmt) || Number(rawAmt) <= 0) {
      throw new Error('Enter a valid USDC amount.');
    }
    // USDC has 6 decimals
    const amountWei = BigInt(Math.floor(Number(rawAmt) * 1e6));

    const signer       = await provider.getSigner();
    const usdcAddr     = getUsdcAddress();
    const usdcContract = new ethers.Contract(usdcAddr, ERC20_MIN_ABI, signer);

    // Approve AlchemistV2 to spend USDC
    statusEl(statusId, '⏳ Approving USDC for Alchemix…');
    const allowance = await usdcContract.allowance(wallet, ALCHEMIST_V2_ADDRESS);
    if (allowance < amountWei) {
      const approveTx = await usdcContract.approve(ALCHEMIST_V2_ADDRESS, amountWei);
      statusEl(statusId, '⏳ Waiting for approval tx…');
      await approveTx.wait();
    }

    const alchemist = new ethers.Contract(ALCHEMIST_V2_ADDRESS, ALCHEMIST_V2_ABI, signer);
    statusEl(statusId, '⏳ Depositing USDC into Alchemix…');
    // depositUnderlying: converts USDC → yvUSDC internally, 1% slippage tolerance
    const minOut = amountWei * ALCHEMIX_MIN_OUT_PERCENT / 100n;
    const tx = await alchemist.depositUnderlying(ALCHEMIX_YIELD_TOKEN, amountWei, wallet, minOut);
    statusEl(statusId, '⏳ Waiting for confirmation…');
    await tx.wait();

    addHistory({ protocol: 'Alchemix', action: 'Deposit', amount: rawAmt + ' USDC', txHash: tx.hash });
    renderHistory();
    statusEl(statusId, `✅ Deposited ${rawAmt} USDC into Alchemix. Tx: ${tx.hash.slice(0, 10)}…`);
    await loadAlchemixBalances();
  } catch (e) {
    statusEl(statusId, '❌ ' + (e.reason || e.message || 'Unknown error'), true);
  }
}

// ─── Action: Alchemix Borrow (Mint alUSD) ─────────────────────────────────────

async function alchemixMintAlUsd() {
  const statusId = 'defi-alchemix-borrow-status';
  try {
    statusEl(statusId, '⏳ Connecting wallet…');
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    await requireAdmin(wallet, provider);

    const amountInput = document.getElementById('defi-alchemix-borrow-amount');
    const rawAmt = amountInput ? amountInput.value.trim() : '';
    if (!rawAmt || isNaN(rawAmt) || Number(rawAmt) <= 0) {
      throw new Error('Enter a valid alUSD amount to mint.');
    }
    const amountWei = ethers.parseEther(rawAmt);

    const signer    = await provider.getSigner();
    const alchemist = new ethers.Contract(ALCHEMIST_V2_ADDRESS, ALCHEMIST_V2_ABI, signer);

    statusEl(statusId, '⏳ Minting alUSD…');
    const tx = await alchemist.mint(amountWei, wallet);
    statusEl(statusId, '⏳ Waiting for confirmation…');
    await tx.wait();

    addHistory({ protocol: 'Alchemix', action: 'Borrow/Mint', amount: rawAmt + ' alUSD', txHash: tx.hash });
    renderHistory();
    statusEl(statusId, `✅ Minted ${rawAmt} alUSD from Alchemix. Tx: ${tx.hash.slice(0, 10)}…`);
    await loadAlchemixBalances();
  } catch (e) {
    statusEl(statusId, '❌ ' + (e.reason || e.message || 'Unknown error'), true);
  }
}

// ─── Action: Aave Max Borrow to Dev Fund ──────────────────────────────────────

async function aaveMaxBorrowToDevFund() {
  const statusId = 'defi-aave-max-borrow-status';
  try {
    statusEl(statusId, '⏳ Connecting wallet…');
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    await requireAdmin(wallet, provider);

    const rpcProvider = new ethers.JsonRpcProvider(getRpc());
    const pool        = new ethers.Contract(AAVE_V3_POOL_ADDRESS, AAVE_POOL_ABI, rpcProvider);

    statusEl(statusId, '⏳ Reading Aave position…');
    const [, totalDebtBase, availableBorrowsBase] = await pool.getUserAccountData(wallet);

    if (availableBorrowsBase === 0n) {
      throw new Error('No USDC available to borrow from Aave (check collateral and LTV).');
    }

    // availableBorrowsBase is USD * 1e8; USDC has 6 decimals → divide by 100
    const availableUsdcWei = availableBorrowsBase / 100n;
    const availableHuman   = (Number(availableUsdcWei) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const debtHuman        = fmtAaveBase(totalDebtBase);
    const treasury         = getTreasuryAddress();

    const confirmed = confirm(
      `Max Borrow → Treasury Dev Fund (Aave V3)\n\n` +
      `Available to borrow: ${availableHuman} USDC\n` +
      `Current debt: ${debtHuman} USD\n` +
      `Recipient: ${treasury}\n\n` +
      `This will borrow the maximum safe amount from Aave V3 and send it directly to the treasury.`
    );
    if (!confirmed) { statusEl(statusId, ''); return; }

    const signer   = await provider.getSigner();
    const poolSigned = new ethers.Contract(AAVE_V3_POOL_ADDRESS, AAVE_POOL_ABI, signer);
    const usdcAddr = getUsdcAddress();

    statusEl(statusId, '⏳ Submitting borrow tx…');
    // interestRateMode 2 = variable rate; Aave V3 sends borrowed tokens to msg.sender (wallet)
    // Debt is assigned to onBehalfOf (wallet). Funds are then forwarded to treasury.
    const tx = await poolSigned.borrow(usdcAddr, availableUsdcWei, 2, 0, wallet);
    statusEl(statusId, '⏳ Waiting for confirmation…');
    await tx.wait();

    // Transfer borrowed USDC to treasury (two-step: borrow → wallet, transfer → treasury)
    // If the transfer below fails, the borrowed USDC remains in the wallet.
    const usdcSigned = new ethers.Contract(usdcAddr, ERC20_MIN_ABI, signer);
    statusEl(statusId, '⏳ Transferring USDC to treasury…');
    const transferTx = await usdcSigned.transfer(treasury, availableUsdcWei);
    await transferTx.wait();

    addHistory({ protocol: 'Aave', action: 'Max Borrow → Dev Fund', amount: availableHuman + ' USDC', txHash: tx.hash });
    renderHistory();
    const txLink = `https://optimistic.etherscan.io/tx/${tx.hash}`;
    statusEl(statusId, `✅ Borrowed ${availableHuman} USDC and sent to treasury. Tx: ${tx.hash.slice(0, 10)}… — ${txLink}`);
    await loadAaveBalances();
  } catch (e) {
    statusEl(statusId, '❌ ' + (e.reason || e.message || 'Unknown error'), true);
  }
}

// ─── Action: Alchemix Max Borrow to Dev Fund ──────────────────────────────────

async function alchemixMaxBorrowToDevFund() {
  const statusId = 'defi-alchemix-max-borrow-status';
  try {
    statusEl(statusId, '⏳ Connecting wallet…');
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    await requireAdmin(wallet, provider);

    const rpcProvider = new ethers.JsonRpcProvider(getRpc());
    const alchemist   = new ethers.Contract(ALCHEMIST_V2_ADDRESS, ALCHEMIST_V2_ABI, rpcProvider);

    statusEl(statusId, '⏳ Reading Alchemix position…');
    const [debt, depositedTokens] = await alchemist.accounts(wallet);

    let totalCollateral = 0n;
    for (const yt of depositedTokens) {
      try {
        const pos        = await alchemist.positions(wallet, yt);
        const underlying = await alchemist.convertSharesToUnderlyingTokens(yt, pos.shares);
        totalCollateral += underlying;
      } catch (posErr) {
        console.warn('[DeFi] Could not read Alchemix position for yield token', yt, posErr);
      }
    }

    if (totalCollateral === 0n) {
      throw new Error('No collateral deposited in Alchemix.');
    }

    // Collateral is USDC (6 dec); debt is alUSD (18 dec, stored as negative int256)
    // Scale collateral to 18 decimals to work in the same space as debt
    const collateral18 = totalCollateral * 10n ** 12n;
    const debtAbs18    = debt < 0n ? -debt : debt;

    // Safe borrow ceiling at 50% LTV in 18-decimal space
    const ceiling18   = collateral18 / 2n;
    const available18 = ceiling18 > debtAbs18 ? ceiling18 - debtAbs18 : 0n;

    if (available18 === 0n) {
      throw new Error('Already at or above the 50% safe LTV ceiling. Repay some debt first.');
    }

    const collateralHuman = (Number(totalCollateral) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const debtHuman       = (Number(debtAbs18) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 });
    const availableHuman  = (Number(available18) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 });
    const ltvAfter        = '50.00'; // max borrow always brings LTV to exactly the 50% ceiling
    const treasury        = getTreasuryAddress();

    const confirmed = confirm(
      `Max Borrow → Treasury Dev Fund (Alchemix V2)\n\n` +
      `Collateral: ${collateralHuman} USDC\n` +
      `Current debt: ${debtHuman} alUSD\n` +
      `Available to mint: ${availableHuman} alUSD\n` +
      `LTV after: ${ltvAfter}% (50% ceiling)\n` +
      `Recipient: ${treasury}\n\n` +
      `This will mint the maximum safe alUSD and send it directly to the treasury dev fund.`
    );
    if (!confirmed) { statusEl(statusId, ''); return; }

    const signer          = await provider.getSigner();
    const alchemistSigned = new ethers.Contract(ALCHEMIST_V2_ADDRESS, ALCHEMIST_V2_ABI, signer);

    statusEl(statusId, '⏳ Minting alUSD to treasury…');
    const tx = await alchemistSigned.mint(available18, treasury);
    statusEl(statusId, '⏳ Waiting for confirmation…');
    await tx.wait();

    addHistory({ protocol: 'Alchemix', action: 'Max Borrow → Dev Fund', amount: availableHuman + ' alUSD', txHash: tx.hash });
    renderHistory();
    const txLink = `https://optimistic.etherscan.io/tx/${tx.hash}`;
    statusEl(statusId, `✅ Minted ${availableHuman} alUSD to treasury. Tx: ${tx.hash.slice(0, 10)}… — ${txLink}`);
    await loadAlchemixBalances();
  } catch (e) {
    statusEl(statusId, '❌ ' + (e.reason || e.message || 'Unknown error'), true);
  }
}

// ─── Action: Aave Sweep Idle USDC ─────────────────────────────────────────────

async function aaveSweepUsdc() {
  const statusId = 'defi-aave-sweep-status';
  try {
    statusEl(statusId, '⏳ Connecting wallet…');
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    await requireAdmin(wallet, provider);

    const signer       = await provider.getSigner();
    const usdcAddr     = getUsdcAddress();
    const usdcContract = new ethers.Contract(usdcAddr, ERC20_MIN_ABI, signer);

    statusEl(statusId, '⏳ Reading idle USDC balance…');
    const balance = await usdcContract.balanceOf(wallet);
    if (balance === 0n) {
      throw new Error('No idle USDC available to sweep.');
    }

    const humanAmt = (Number(balance) / 1e6).toFixed(6);
    const confirmed = confirm(`Sweep all idle USDC to Aave?\n\nAmount: ${humanAmt} USDC\n\nThis will supply your full wallet USDC balance to Aave V3.`);
    if (!confirmed) {
      statusEl(statusId, '');
      return;
    }

    statusEl(statusId, '⏳ Approving USDC for Aave…');
    const allowance = await usdcContract.allowance(wallet, AAVE_V3_POOL_ADDRESS);
    if (allowance < balance) {
      const approveTx = await usdcContract.approve(AAVE_V3_POOL_ADDRESS, balance);
      statusEl(statusId, '⏳ Waiting for approval tx…');
      await approveTx.wait();
    }

    const pool = new ethers.Contract(AAVE_V3_POOL_ADDRESS, AAVE_POOL_ABI, signer);
    statusEl(statusId, '⏳ Sweeping USDC into Aave…');
    const tx = await pool.supply(usdcAddr, balance, wallet, 0);
    statusEl(statusId, '⏳ Waiting for confirmation…');
    await tx.wait();

    addHistory({ protocol: 'Aave', action: 'Sweep', amount: humanAmt + ' USDC', txHash: tx.hash });
    renderHistory();
    statusEl(statusId, `✅ Swept ${humanAmt} USDC to Aave. Tx: ${tx.hash.slice(0, 10)}…`);
    await loadAaveBalances();
  } catch (e) {
    statusEl(statusId, '❌ ' + (e.reason || e.message || 'Unknown error'), true);
  }
}

// ─── Action: Alchemix Sweep Idle USDC ─────────────────────────────────────────

async function alchemixSweepUsdc() {
  const statusId = 'defi-alchemix-sweep-status';
  try {
    statusEl(statusId, '⏳ Connecting wallet…');
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    await requireAdmin(wallet, provider);

    const signer       = await provider.getSigner();
    const usdcAddr     = getUsdcAddress();
    const usdcContract = new ethers.Contract(usdcAddr, ERC20_MIN_ABI, signer);

    statusEl(statusId, '⏳ Reading idle USDC balance…');
    const balance = await usdcContract.balanceOf(wallet);
    if (balance === 0n) {
      throw new Error('No idle USDC available to sweep.');
    }

    const humanAmt = (Number(balance) / 1e6).toFixed(6);
    const confirmed = confirm(`Sweep all idle USDC to Alchemix?\n\nAmount: ${humanAmt} USDC\n\nThis will deposit your full wallet USDC balance into Alchemix V2 (yvUSDC vault) via depositUnderlying().`);
    if (!confirmed) {
      statusEl(statusId, '');
      return;
    }

    statusEl(statusId, '⏳ Approving USDC for Alchemix…');
    const allowance = await usdcContract.allowance(wallet, ALCHEMIST_V2_ADDRESS);
    if (allowance < balance) {
      const approveTx = await usdcContract.approve(ALCHEMIST_V2_ADDRESS, balance);
      statusEl(statusId, '⏳ Waiting for approval tx…');
      await approveTx.wait();
    }

    const alchemist = new ethers.Contract(ALCHEMIST_V2_ADDRESS, ALCHEMIST_V2_ABI, signer);
    statusEl(statusId, '⏳ Depositing USDC into Alchemix…');
    const minOut = balance * ALCHEMIX_MIN_OUT_PERCENT / 100n;
    const tx = await alchemist.depositUnderlying(ALCHEMIX_YIELD_TOKEN, balance, wallet, minOut);
    statusEl(statusId, '⏳ Waiting for confirmation…');
    await tx.wait();

    addHistory({ protocol: 'Alchemix', action: 'Sweep', amount: humanAmt + ' USDC', txHash: tx.hash });
    renderHistory();
    statusEl(statusId, `✅ Swept ${humanAmt} USDC into Alchemix. Tx: ${tx.hash.slice(0, 10)}…`);
    await loadAlchemixBalances();
  } catch (e) {
    statusEl(statusId, '❌ ' + (e.reason || e.message || 'Unknown error'), true);
  }
}

// ─── Main Load ────────────────────────────────────────────────────────────────

async function loadDeFiBalances() {
  const refreshBtn = document.getElementById('defi-refresh-btn');
  if (refreshBtn) refreshBtn.disabled = true;

  try {
    await Promise.allSettled([
      loadOverviewBalances(),
      loadAaveBalances(),
      loadAlchemixBalances(),
    ]);
    renderHistory();
    // Silently scrape recent chain events in the background (non-blocking)
    scrapeChainEvents(true).catch(e => console.warn('[DeFi] Background scrape error:', e));
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initDeFiPanel() {
  // Refresh button
  const refreshBtn = document.getElementById('defi-refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadDeFiBalances);

  // Aave actions
  const aaveSupplyBtn = document.getElementById('defi-aave-supply-btn');
  if (aaveSupplyBtn) aaveSupplyBtn.addEventListener('click', aaveSupplyUsdc);

  const aaveBorrowBtn = document.getElementById('defi-aave-borrow-btn');
  if (aaveBorrowBtn) aaveBorrowBtn.addEventListener('click', aaveBorrowUsdc);

  const aaveMaxBorrowBtn = document.getElementById('defi-aave-max-borrow-btn');
  if (aaveMaxBorrowBtn) aaveMaxBorrowBtn.addEventListener('click', aaveMaxBorrowToDevFund);

  const aaveSweepBtn = document.getElementById('defi-aave-sweep-btn');
  if (aaveSweepBtn) aaveSweepBtn.addEventListener('click', aaveSweepUsdc);

  // Alchemix actions
  const alchDepositBtn = document.getElementById('defi-alchemix-deposit-btn');
  if (alchDepositBtn) alchDepositBtn.addEventListener('click', alchemixDepositUsdc);

  const alchBorrowBtn = document.getElementById('defi-alchemix-borrow-btn');
  if (alchBorrowBtn) alchBorrowBtn.addEventListener('click', alchemixMintAlUsd);

  const alchMaxBorrowBtn = document.getElementById('defi-alchemix-max-borrow-btn');
  if (alchMaxBorrowBtn) alchMaxBorrowBtn.addEventListener('click', alchemixMaxBorrowToDevFund);

  const alchSweepBtn = document.getElementById('defi-alchemix-sweep-btn');
  if (alchSweepBtn) alchSweepBtn.addEventListener('click', alchemixSweepUsdc);

  // Clear history
  const clearBtn = document.getElementById('defi-clear-history-btn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (confirm('Clear all movement history?')) {
      localStorage.removeItem(DEFI_HISTORY_KEY);
      renderHistory();
    }
  });

  // Scrape chain events
  const scrapeBtn = document.getElementById('defi-scrape-btn');
  if (scrapeBtn) scrapeBtn.addEventListener('click', () => scrapeChainEvents(false));

  // CSV export
  const csvBtn = document.getElementById('defi-export-csv-btn');
  if (csvBtn) csvBtn.addEventListener('click', exportHistoryCSV);

  // Copy to clipboard
  const copyBtn = document.getElementById('defi-copy-history-btn');
  if (copyBtn) copyBtn.addEventListener('click', copyHistoryToClipboard);

  // Expose for modal onOpen callback
  window.loadDeFiBalances = loadDeFiBalances;
}
