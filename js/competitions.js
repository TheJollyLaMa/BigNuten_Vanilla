/**
 * js/competitions.js
 * v3.1.0 — Streak Bets & Achievement Competitions Module
 *
 * Provides:
 *  - initCompetitions()          — call once on DOMContentLoaded
 *  - loadCompetitionsList()      — fetch all comps from chain, render in admin & user modals
 *
 * Features:
 *  - Admin: create / settle / cancel competitions
 *  - User:  join, self-report weekly, forfeit, view streak
 *  - Aave yield: deploy pot / withdraw (admin)
 *  - IPFS: publish leaderboard CID on settlement
 *
 * All on-chain calls target StreakBetEscrow on Optimism Mainnet.
 * Related issue: #71 (v3.1.0 Epic).
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const COMP_HISTORY_KEY  = 'bignuten_comp_history';
const ZERO_ADDR         = '0x0000000000000000000000000000000000000000';

// Status enums matching the contract
const COMP_STATUS = { 0: 'Active', 1: 'Settled', 2: 'Cancelled' };
const ENTRANT_STATUS = { 0: 'Joined', 1: 'Completed', 2: 'Forfeited' };

// Minimal ABI fragments — full ABI lives in abis/StreakBetEscrow.json
const STREAK_BET_ABI = [
  'function nextCompId() view returns (uint256)',
  'function getCompetition(uint256 compId) view returns (string name, address stakeToken, uint256 stakeAmount, uint256 totalWeeks, uint256 startTime, uint256 endTime, bool yieldEnabled, string metadataCID, uint8 status, uint256 potBalance, uint256 entrantCount, uint256 winnerCount)',
  'function getEntrant(uint256 compId, address addr) view returns (uint256 reportsSubmitted, uint8 status)',
  'function createCompetition(string name, address stakeToken, uint256 stakeAmount, uint256 totalWeeks, uint256 startTime, uint256 endTime, bool yieldEnabled, string metadataCID)',
  'function joinCompetition(uint256 compId) payable',
  'function submitReport(uint256 compId, string proofCID)',
  'function forfeit(uint256 compId)',
  'function deployToAave(uint256 compId)',
  'function withdrawFromAave(uint256 compId)',
  'function settleCompetition(uint256 compId, string leaderboardCID)',
  'function cancelCompetition(uint256 compId)',
  'event CompetitionCreated(uint256 indexed compId, string name, address stakeToken, uint256 stakeAmount, uint256 totalWeeks, uint256 startTime, uint256 endTime, bool yieldEnabled, string metadataCID)',
  'event EntrantJoined(uint256 indexed compId, address indexed entrant, uint256 amount)',
  'event WeeklyReport(uint256 indexed compId, address indexed entrant, uint256 week, string proofCID)',
  'event EntrantCompleted(uint256 indexed compId, address indexed entrant)',
  'event EntrantForfeited(uint256 indexed compId, address indexed entrant)',
  'event WinningsDistributed(uint256 indexed compId, address indexed winner, uint256 amount)',
  'event CompetitionSettled(uint256 indexed compId, uint256 winnerCount, uint256 potDistributed, string leaderboardCID)',
];

const ERC20_APPROVE_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStreakBetAddress() {
  return (window.CONTRACTS && window.CONTRACTS.streakBetEscrow) || '';
}

function getRpc() {
  return (window.CONTRACTS && window.CONTRACTS.rpcUrl) || 'https://mainnet.optimism.io';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortAddr(a) {
  return a ? a.slice(0, 6) + '…' + a.slice(-4) : '—';
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(Number(ts) * 1000).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function fmtToken(amount, token, decimals) {
  if (token === ZERO_ADDR) {
    return (Number(amount) / 1e18).toFixed(4) + ' ETH';
  }
  const d = decimals || 18;
  return (Number(amount) / (10 ** d)).toFixed(d > 8 ? 4 : 2) + ' tokens';
}

function statusBadge(code) {
  const label = COMP_STATUS[code] || 'Unknown';
  const colors = { Active: '#00e676', Settled: '#ffd740', Cancelled: '#ff5252' };
  return `<span style="color:${colors[label] || '#aaa'}; font-weight:600;">${label}</span>`;
}

function setEl(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function statusMsg(id, msg, isErr) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = isErr ? '#ff5252' : '#00e676';
}

async function requireMetaMask() {
  if (!window.ethereum) throw new Error('MetaMask not detected.');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  return accounts[0];
}

async function requireOptimism(provider) {
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 10) {
    throw new Error('Please switch MetaMask to Optimism Mainnet (chain 10).');
  }
}

// ─── Read-Only Contract Instance ──────────────────────────────────────────────

function getReadContract() {
  const addr = getStreakBetAddress();
  if (!addr) return null;
  const provider = new ethers.JsonRpcProvider(getRpc());
  return new ethers.Contract(addr, STREAK_BET_ABI, provider);
}

// ─── Load All Competitions ────────────────────────────────────────────────────

async function fetchAllCompetitions() {
  const contract = getReadContract();
  if (!contract) return [];

  const total = Number(await contract.nextCompId());
  const comps = [];
  for (let i = 0; i < total; i++) {
    try {
      const c = await contract.getCompetition(i);
      comps.push({
        id: i,
        name:         c.name,
        stakeToken:   c.stakeToken,
        stakeAmount:  c.stakeAmount,
        totalWeeks:   Number(c.totalWeeks),
        startTime:    Number(c.startTime),
        endTime:      Number(c.endTime),
        yieldEnabled: c.yieldEnabled,
        metadataCID:  c.metadataCID,
        status:       Number(c.status),
        potBalance:   c.potBalance,
        entrantCount: Number(c.entrantCount),
        winnerCount:  Number(c.winnerCount),
      });
    } catch (err) {
      console.warn(`[Comp] Error fetching comp #${i}:`, err.message);
    }
  }
  return comps;
}

// ─── Admin: Render Competition List ───────────────────────────────────────────

async function renderAdminCompList() {
  const listEl = document.getElementById('comp-admin-list');
  if (!listEl) return;

  if (!getStreakBetAddress()) {
    listEl.innerHTML = '<p style="color:#ffd740;">⚠️ StreakBetEscrow contract address not configured yet. Deploy the contract and add it to <code>contracts.js</code>.</p>';
    return;
  }

  listEl.innerHTML = '<p class="gov-loading">Loading competitions…</p>';

  try {
    const comps = await fetchAllCompetitions();
    if (comps.length === 0) {
      listEl.innerHTML = '<p style="color:#aaa;">No competitions created yet.</p>';
      return;
    }

    let html = '<table class="comp-table"><thead><tr>' +
      '<th>#</th><th>Name</th><th>Token</th><th>Stake</th><th>Weeks</th>' +
      '<th>Entrants</th><th>Winners</th><th>Status</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    for (const c of comps) {
      const tokenLabel = c.stakeToken === ZERO_ADDR ? 'ETH' : shortAddr(c.stakeToken);
      html += `<tr>
        <td>${c.id}</td>
        <td>${escHtml(c.name)}</td>
        <td>${tokenLabel}</td>
        <td>${fmtToken(c.stakeAmount, c.stakeToken)}</td>
        <td>${c.totalWeeks}</td>
        <td>${c.entrantCount}</td>
        <td>${c.winnerCount}</td>
        <td>${statusBadge(c.status)}</td>
        <td>
          ${c.status === 0 ? `
            <button class="comp-action-btn" onclick="window._compSettle(${c.id})">✅ Settle</button>
            <button class="comp-action-btn comp-danger" onclick="window._compCancel(${c.id})">❌ Cancel</button>
            ${c.yieldEnabled ? `<button class="comp-action-btn" onclick="window._compDeployAave(${c.id})">🌾 Aave</button>` : ''}
          ` : '—'}
        </td>
      </tr>`;
    }
    html += '</tbody></table>';
    listEl.innerHTML = html;
  } catch (err) {
    listEl.innerHTML = `<p style="color:#ff5252;">❌ ${escHtml(err.message)}</p>`;
  }
}

// ─── User: Render Competition List ────────────────────────────────────────────

async function renderUserCompList() {
  const listEl = document.getElementById('comp-user-list');
  if (!listEl) return;

  if (!getStreakBetAddress()) {
    listEl.innerHTML = '<p style="color:#ffd740;">⚠️ Competitions not yet available. Check back soon!</p>';
    return;
  }

  listEl.innerHTML = '<p class="gov-loading">Loading competitions…</p>';

  try {
    const comps = await fetchAllCompetitions();
    const activeComps = comps.filter(c => c.status === 0);

    if (activeComps.length === 0) {
      listEl.innerHTML = '<p style="color:#aaa;">No active competitions right now. Check back soon!</p>';
      return;
    }

    let wallet = null;
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        wallet = accounts[0] || null;
      }
    } catch (_) { /* not connected */ }

    const contract = getReadContract();
    let html = '';

    for (const c of activeComps) {
      const tokenLabel = c.stakeToken === ZERO_ADDR ? 'ETH' : shortAddr(c.stakeToken);
      let entrantInfo = '';
      let actionBtns = '';

      if (wallet && contract) {
        try {
          const e = await contract.getEntrant(c.id, wallet);
          const reports = Number(e.reportsSubmitted);
          const status  = Number(e.status);

          if (reports > 0 || status === 1 || status === 2) {
            // Already joined
            const statusLabel = ENTRANT_STATUS[status] || 'Unknown';
            entrantInfo = `<p class="comp-entrant-status">Your status: <strong>${statusLabel}</strong> · Reports: ${reports}/${c.totalWeeks}</p>`;

            if (status === 0) {
              // Still active — can report or forfeit
              actionBtns = `
                <button class="comp-user-btn" onclick="window._compReport(${c.id})">📝 Submit Report</button>
                <button class="comp-user-btn comp-danger" onclick="window._compForfeit(${c.id})">🏳️ Forfeit</button>
              `;
            }
          } else {
            // Not joined yet
            actionBtns = `<button class="comp-user-btn comp-join" onclick="window._compJoin(${c.id})">🎯 Join Competition</button>`;
          }
        } catch (_) {
          actionBtns = `<button class="comp-user-btn comp-join" onclick="window._compJoin(${c.id})">🎯 Join Competition</button>`;
        }
      } else {
        actionBtns = '<p style="color:#aaa; font-size:0.85rem;">Connect wallet to join</p>';
      }

      html += `
        <div class="comp-card">
          <div class="comp-card-header">
            <h4>${escHtml(c.name)}</h4>
            ${statusBadge(c.status)}
          </div>
          <div class="comp-card-body">
            <div class="comp-stat"><span>Token</span><strong>${tokenLabel}</strong></div>
            <div class="comp-stat"><span>Stake</span><strong>${fmtToken(c.stakeAmount, c.stakeToken)}</strong></div>
            <div class="comp-stat"><span>Weeks</span><strong>${c.totalWeeks}</strong></div>
            <div class="comp-stat"><span>Entrants</span><strong>${c.entrantCount}</strong></div>
            <div class="comp-stat"><span>Dates</span><strong>${fmtDate(c.startTime)} – ${fmtDate(c.endTime)}</strong></div>
            ${c.yieldEnabled ? '<div class="comp-stat"><span>Yield</span><strong>🌾 Aave enabled</strong></div>' : ''}
            ${c.metadataCID ? `<div class="comp-stat"><span>Rules</span><a href="https://dweb.link/ipfs/${c.metadataCID}" target="_blank" rel="noopener noreferrer" style="color:#00e5ff;">IPFS ↗</a></div>` : ''}
          </div>
          ${entrantInfo}
          <div class="comp-card-actions">${actionBtns}</div>
        </div>
      `;
    }

    listEl.innerHTML = html;
  } catch (err) {
    listEl.innerHTML = `<p style="color:#ff5252;">❌ ${escHtml(err.message)}</p>`;
  }
}

// ─── Admin Actions ────────────────────────────────────────────────────────────

async function adminCreateComp() {
  const statusId = 'comp-create-status';
  try {
    statusMsg(statusId, '⏳ Connecting wallet…');
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    const signer   = await provider.getSigner();
    const contract = new ethers.Contract(getStreakBetAddress(), STREAK_BET_ABI, signer);

    const name        = document.getElementById('comp-create-name')?.value.trim();
    const tokenSelect = document.getElementById('comp-create-token')?.value || 'ETH';
    const stakeRaw    = document.getElementById('comp-create-stake')?.value.trim();
    const weeks       = document.getElementById('comp-create-weeks')?.value.trim();
    const startDate   = document.getElementById('comp-create-start')?.value;
    const endDate     = document.getElementById('comp-create-end')?.value;
    const yieldOn     = document.getElementById('comp-create-yield')?.checked || false;
    const metaCID     = document.getElementById('comp-create-cid')?.value.trim() || '';

    if (!name) throw new Error('Enter a competition name.');
    if (!stakeRaw || isNaN(stakeRaw) || Number(stakeRaw) <= 0) throw new Error('Enter a valid stake amount.');
    if (!weeks || isNaN(weeks) || Number(weeks) < 1) throw new Error('Enter at least 1 week.');
    if (!startDate || !endDate) throw new Error('Select start and end dates.');

    let stakeToken = ZERO_ADDR;
    let stakeAmount;
    if (tokenSelect === 'ETH') {
      stakeAmount = ethers.parseEther(stakeRaw);
    } else if (tokenSelect === 'USDC') {
      stakeToken = window.CONTRACTS?.usdc || ZERO_ADDR;
      stakeAmount = BigInt(Math.floor(Number(stakeRaw) * 1e6));
    } else if (tokenSelect === 'BNUT') {
      stakeToken = window.CONTRACTS?.bnut || ZERO_ADDR;
      stakeAmount = ethers.parseUnits(stakeRaw, 18);
    }

    const startTime = Math.floor(new Date(startDate).getTime() / 1000);
    const endTime   = Math.floor(new Date(endDate).getTime() / 1000);

    if (endTime <= startTime) throw new Error('End date must be after start date.');

    statusMsg(statusId, '⏳ Submitting create tx…');
    const tx = await contract.createCompetition(
      name, stakeToken, stakeAmount, Number(weeks),
      startTime, endTime, yieldOn, metaCID
    );
    statusMsg(statusId, '⏳ Waiting for confirmation…');
    await tx.wait();

    statusMsg(statusId, `✅ Competition "${name}" created! Tx: ${tx.hash.slice(0, 10)}…`);
    await renderAdminCompList();
  } catch (err) {
    statusMsg(statusId, '❌ ' + (err.reason || err.message || 'Unknown error'), true);
  }
}

async function adminSettleComp(compId) {
  const cid = prompt('Enter the IPFS CID for the final leaderboard (or leave empty):') || '';
  try {
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    const signer   = await provider.getSigner();
    const contract = new ethers.Contract(getStreakBetAddress(), STREAK_BET_ABI, signer);
    const tx = await contract.settleCompetition(compId, cid);
    await tx.wait();
    alert(`✅ Competition #${compId} settled!`);
    await renderAdminCompList();
  } catch (err) {
    alert('❌ ' + (err.reason || err.message));
  }
}

async function adminCancelComp(compId) {
  if (!confirm(`Cancel competition #${compId}? All entrants will be refunded.`)) return;
  try {
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    const signer   = await provider.getSigner();
    const contract = new ethers.Contract(getStreakBetAddress(), STREAK_BET_ABI, signer);
    const tx = await contract.cancelCompetition(compId);
    await tx.wait();
    alert(`✅ Competition #${compId} cancelled and refunded.`);
    await renderAdminCompList();
  } catch (err) {
    alert('❌ ' + (err.reason || err.message));
  }
}

async function adminDeployAave(compId) {
  if (!confirm(`Deploy competition #${compId} pot to Aave for yield?`)) return;
  try {
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    const signer   = await provider.getSigner();
    const contract = new ethers.Contract(getStreakBetAddress(), STREAK_BET_ABI, signer);
    const tx = await contract.deployToAave(compId);
    await tx.wait();
    alert(`✅ Competition #${compId} pot deployed to Aave.`);
  } catch (err) {
    alert('❌ ' + (err.reason || err.message));
  }
}

// ─── User Actions ─────────────────────────────────────────────────────────────

async function userJoinComp(compId) {
  try {
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    const signer   = await provider.getSigner();
    const readContract = getReadContract();
    const c = await readContract.getCompetition(compId);
    const stakeToken = c.stakeToken;
    const stakeAmount = c.stakeAmount;

    const contract = new ethers.Contract(getStreakBetAddress(), STREAK_BET_ABI, signer);

    if (stakeToken === ZERO_ADDR) {
      const tx = await contract.joinCompetition(compId, { value: stakeAmount });
      await tx.wait();
    } else {
      // ERC-20: approve first
      const tokenContract = new ethers.Contract(stakeToken, ERC20_APPROVE_ABI, signer);
      const allowance = await tokenContract.allowance(wallet, getStreakBetAddress());
      if (allowance < stakeAmount) {
        const approveTx = await tokenContract.approve(getStreakBetAddress(), stakeAmount);
        await approveTx.wait();
      }
      const tx = await contract.joinCompetition(compId);
      await tx.wait();
    }

    alert(`✅ Joined competition #${compId}!`);
    await renderUserCompList();
  } catch (err) {
    alert('❌ ' + (err.reason || err.message));
  }
}

async function userSubmitReport(compId) {
  const cid = prompt('Enter an IPFS CID for your weekly proof (or leave empty for self-report):') || '';
  try {
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    const signer   = await provider.getSigner();
    const contract = new ethers.Contract(getStreakBetAddress(), STREAK_BET_ABI, signer);
    const tx = await contract.submitReport(compId, cid);
    await tx.wait();
    alert(`✅ Report submitted for competition #${compId}!`);
    await renderUserCompList();
  } catch (err) {
    alert('❌ ' + (err.reason || err.message));
  }
}

async function userForfeitComp(compId) {
  if (!confirm(`Forfeit competition #${compId}? Your stake will go to the winners' pot.`)) return;
  try {
    const wallet   = await requireMetaMask();
    const provider = new ethers.BrowserProvider(window.ethereum);
    await requireOptimism(provider);
    const signer   = await provider.getSigner();
    const contract = new ethers.Contract(getStreakBetAddress(), STREAK_BET_ABI, signer);
    const tx = await contract.forfeit(compId);
    await tx.wait();
    alert(`🏳️ Forfeited competition #${compId}.`);
    await renderUserCompList();
  } catch (err) {
    alert('❌ ' + (err.reason || err.message));
  }
}

// ─── Expose for inline onclick handlers ───────────────────────────────────────

window._compSettle     = adminSettleComp;
window._compCancel     = adminCancelComp;
window._compDeployAave = adminDeployAave;
window._compJoin       = userJoinComp;
window._compReport     = userSubmitReport;
window._compForfeit    = userForfeitComp;

// ─── Local History ────────────────────────────────────────────────────────────

function getCompHistory() {
  try { return JSON.parse(localStorage.getItem(COMP_HISTORY_KEY)) || []; }
  catch { return []; }
}

function addCompHistory(entry) {
  const hist = getCompHistory();
  hist.unshift({ ...entry, ts: Date.now() });
  if (hist.length > 100) hist.length = 100;
  localStorage.setItem(COMP_HISTORY_KEY, JSON.stringify(hist));
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initCompetitions() {
  // Admin: create button
  const createBtn = document.getElementById('comp-create-btn');
  if (createBtn) {
    createBtn.addEventListener('click', adminCreateComp);
  }

  // Expose loadCompetitionsList on window for modal open callbacks
  window.loadCompetitionsList = async function () {
    await Promise.all([renderAdminCompList(), renderUserCompList()]);
  };
}

export async function loadCompetitionsList() {
  await Promise.all([renderAdminCompList(), renderUserCompList()]);
}
