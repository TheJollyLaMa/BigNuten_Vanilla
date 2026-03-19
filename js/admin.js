/**
 * admin.js — Contributors section of the Admin Panel + public Bounty Register
 *
 * Admin Panel (👥 Contributors tab):
 *  - Loads contributor-accounts.json + payroll-queue.json
 *  - Renders a table: GitHub, Wallet (inline-editable), Total Paid, Issues Completed, Status
 *  - Add contributor, Remove contributor, Copy invite link
 *  - Save: generates a downloadable updated JSON (no server required)
 *
 * Public section (#bounty-register):
 *  - Contributors connect MetaMask, sign a challenge message, then submit
 *  - Generates an updated contributor-accounts.json for download
 */

// ─── Raw-fetch helpers ─────────────────────────────────────────────────────────

const RAW_BASE =
  'https://raw.githubusercontent.com/TheJollyLaMa/BigNuten_Vanilla/main/';

async function fetchContributors() {
  try {
    const r = await fetch(`${RAW_BASE}contributor-accounts.json`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch {
    // fall back to same-origin (works when running from GitHub Pages / local server)
    const r = await fetch('contributor-accounts.json');
    if (!r.ok) throw new Error('contributor-accounts.json not found');
    return r.json();
  }
}

async function fetchPayroll() {
  try {
    const r = await fetch(`${RAW_BASE}payroll-queue.json`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch {
    const r = await fetch('payroll-queue.json');
    if (!r.ok) throw new Error('payroll-queue.json not found');
    return r.json();
  }
}

// ─── Shared utility: trigger a JSON file download ─────────────────────────────

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── Admin Contributors Panel ──────────────────────────────────────────────────

export function initAdminContributors() {
  const section = document.getElementById('admin-contributors-section');
  if (!section) return;

  // Open/close handler for the <details> element
  section.addEventListener('toggle', async () => {
    if (!section.open) return;
    await loadContributorsTable();
  });

  // "Add contributor" button
  const addBtn = document.getElementById('admin-contrib-add-btn');
  if (addBtn) addBtn.addEventListener('click', showAddContributorModal);

  // "Save / download JSON" button
  const saveBtn = document.getElementById('admin-contrib-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveContributors);
}

// ─── State ────────────────────────────────────────────────────────────────────

let _contributorsData = null; // parsed contributor-accounts.json
let _payrollData      = null; // parsed payroll-queue.json

async function ensureData() {
  if (!_contributorsData) {
    _contributorsData = await fetchContributors();
  }
  if (!_payrollData) {
    _payrollData = await fetchPayroll();
  }
}

// ─── Compute per-contributor stats from payroll-queue ─────────────────────────

function computeStats(githubUsername) {
  const settled = (_payrollData?.settled || []).filter(
    s => s.contributorGithub === githubUsername
  );
  const totalPaid    = settled.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const issuesCompleted = new Set(settled.map(s => s.issueRef)).size;
  return { totalPaid, issuesCompleted };
}

// ─── Render the contributors table ────────────────────────────────────────────

async function loadContributorsTable() {
  const body   = document.getElementById('admin-contrib-table-body');
  const status = document.getElementById('admin-contrib-status');
  if (!body) return;

  body.innerHTML = '<tr><td colspan="6" class="gov-loading">⏳ Loading…</td></tr>';
  if (status) status.textContent = '';

  try {
    await ensureData();
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="gov-loading">❌ ${err.message}</td></tr>`;
    return;
  }

  const contribs = _contributorsData.contributors || [];
  if (contribs.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="gov-loading">No contributors registered yet.</td></tr>';
    return;
  }

  body.innerHTML = contribs.map((c, i) => {
    const { totalPaid, issuesCompleted } = computeStats(c.github);
    const statusBadge = c.walletAddress
      ? '<span class="contrib-badge contrib-badge-registered">registered</span>'
      : '<span class="contrib-badge contrib-badge-pending">pending-wallet</span>';
    const avatarUrl = `https://github.com/${encodeURIComponent(c.github)}.png?size=32`;
    const walletDisplay = c.walletAddress || '';
    return `
      <tr data-index="${i}">
        <td class="contrib-td-github">
          <img src="${avatarUrl}" alt="${c.github}" class="contrib-avatar"
               onerror="this.style.display='none'" />
          <a href="https://github.com/${encodeURIComponent(c.github)}"
             target="_blank" rel="noopener noreferrer"
             class="contrib-github-link">@${c.github}</a>
        </td>
        <td class="contrib-td-wallet">
          <input type="text"
                 class="gov-input contrib-wallet-input"
                 value="${walletDisplay}"
                 placeholder="0x…"
                 data-index="${i}"
                 aria-label="Wallet address for ${c.github}" />
        </td>
        <td class="contrib-td-stat">${totalPaid.toLocaleString()} $BNUT</td>
        <td class="contrib-td-stat">${issuesCompleted}</td>
        <td>${statusBadge}</td>
        <td class="contrib-td-actions">
          <button class="gov-admin-action-btn contrib-invite-btn" data-index="${i}" title="Copy invite link">🔗 Invite</button>
          <button class="gov-admin-action-btn gov-admin-danger-btn contrib-remove-btn" data-index="${i}" title="Remove contributor">🗑️</button>
        </td>
      </tr>`;
  }).join('');

  // Attach inline wallet-change listeners
  body.querySelectorAll('.contrib-wallet-input').forEach(input => {
    input.addEventListener('change', e => {
      const idx = Number(e.target.dataset.index);
      _contributorsData.contributors[idx].walletAddress = e.target.value.trim();
      updateRowStatus(idx);
    });
  });

  // Remove buttons
  body.querySelectorAll('.contrib-remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = Number(e.currentTarget.dataset.index);
      const c   = _contributorsData.contributors[idx];
      if (confirm(`Remove @${c.github} from contributors? This cannot be undone without recommitting the JSON.`)) {
        _contributorsData.contributors.splice(idx, 1);
        loadContributorsTable();
      }
    });
  });

  // Invite buttons
  body.querySelectorAll('.contrib-invite-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = Number(e.currentTarget.dataset.index);
      const c   = _contributorsData.contributors[idx];
      copyInviteLink(c.github);
    });
  });
}

function updateRowStatus(idx) {
  const row = document.querySelector(`#admin-contrib-table-body tr[data-index="${idx}"]`);
  if (!row) return;
  const c   = _contributorsData.contributors[idx];
  const statusTd = row.querySelector('td:nth-child(5)');
  if (!statusTd) return;
  statusTd.innerHTML = c.walletAddress
    ? '<span class="contrib-badge contrib-badge-registered">registered</span>'
    : '<span class="contrib-badge contrib-badge-pending">pending-wallet</span>';
}

// ─── Copy invite link ─────────────────────────────────────────────────────────

function copyInviteLink(github) {
  const url  = `${window.location.origin}${window.location.pathname}#bounty-register`;
  const text = `Hey @${github}! You can register your Optimism wallet for $BNUT bounty payouts here: ${url}`;
  navigator.clipboard.writeText(text).then(() => {
    const status = document.getElementById('admin-contrib-status');
    if (status) {
      status.textContent = `✅ Invite link for @${github} copied to clipboard!`;
      setTimeout(() => { status.textContent = ''; }, 3000);
    }
  }).catch(() => {
    prompt('Copy this invite link:', text);
  });
}

// ─── Add contributor modal ─────────────────────────────────────────────────────

function showAddContributorModal() {
  const modal   = document.getElementById('admin-add-contributor-modal');
  const overlay = document.getElementById('admin-add-contributor-overlay');
  if (modal) modal.classList.remove('hidden');
  if (overlay) overlay.classList.remove('hidden');
}

function hideAddContributorModal() {
  const modal   = document.getElementById('admin-add-contributor-modal');
  const overlay = document.getElementById('admin-add-contributor-overlay');
  if (modal) modal.classList.add('hidden');
  if (overlay) overlay.classList.add('hidden');
}

export function initAddContributorModal() {
  const closeBtn  = document.getElementById('admin-add-contrib-close');
  const overlay   = document.getElementById('admin-add-contributor-overlay');
  const submitBtn = document.getElementById('admin-add-contrib-submit');

  if (closeBtn)  closeBtn.addEventListener('click', hideAddContributorModal);
  if (overlay)   overlay.addEventListener('click', hideAddContributorModal);
  if (submitBtn) submitBtn.addEventListener('click', handleAddContributor);
}

async function handleAddContributor() {
  const githubInput  = document.getElementById('admin-add-contrib-github');
  const walletInput  = document.getElementById('admin-add-contrib-wallet');
  const statusEl     = document.getElementById('admin-add-contrib-status');

  const github = (githubInput?.value || '').trim().replace(/^@/, '');
  const wallet = (walletInput?.value || '').trim();

  if (!github) {
    if (statusEl) statusEl.textContent = '⚠️ Enter a GitHub username.';
    return;
  }

  try {
    await ensureData();
  } catch (err) {
    if (statusEl) statusEl.textContent = `❌ ${err.message}`;
    return;
  }

  const exists = _contributorsData.contributors.some(c => c.github === github);
  if (exists) {
    if (statusEl) statusEl.textContent = `⚠️ @${github} is already in the contributors list.`;
    return;
  }

  _contributorsData.contributors.push({
    github,
    displayName: github,
    role: 'contributor',
    walletAddress: wallet,
    bnutEarned: 0,
    bnutPending: 0,
    issuesClosed: [],
    registeredAt: new Date().toISOString(),
  });

  hideAddContributorModal();
  if (githubInput) githubInput.value = '';
  if (walletInput) walletInput.value = '';
  if (statusEl)    statusEl.textContent = '';

  await loadContributorsTable();

  const adminStatus = document.getElementById('admin-contrib-status');
  if (adminStatus) {
    adminStatus.textContent = `✅ @${github} added. Click "💾 Save / Download JSON" to persist.`;
  }
}

// ─── Save / download updated JSON ─────────────────────────────────────────────

async function saveContributors() {
  const status = document.getElementById('admin-contrib-status');
  try {
    await ensureData();
  } catch (err) {
    if (status) status.textContent = `❌ ${err.message}`;
    return;
  }

  // Sync wallet values from inputs back into data (in case user typed without triggering 'change')
  document.querySelectorAll('.contrib-wallet-input').forEach(input => {
    const idx = Number(input.dataset.index);
    if (_contributorsData.contributors[idx]) {
      _contributorsData.contributors[idx].walletAddress = input.value.trim();
    }
  });

  downloadJSON(_contributorsData, 'contributor-accounts.json');
  if (status) {
    status.innerHTML = '✅ contributor-accounts.json downloaded. Commit it to the repo to persist changes. ' +
      '<a href="https://github.com/TheJollyLaMa/BigNuten_Vanilla/blob/main/contributor-accounts.json" ' +
      'target="_blank" rel="noopener" style="color:#00e5ff;">View current file ↗</a>';
  }
}

// ─── Public Bounty Register section ───────────────────────────────────────────

export function initBountyRegister() {
  const section = document.getElementById('bounty-register-section');
  if (!section) return;

  const connectBtn = document.getElementById('br-connect-btn');
  const submitBtn  = document.getElementById('br-submit-btn');
  const statusEl   = document.getElementById('br-status');

  if (connectBtn) connectBtn.addEventListener('click', brConnect);
  if (submitBtn)  submitBtn.addEventListener('click', brSubmit);
}

async function brConnect() {
  const statusEl   = document.getElementById('br-status');
  const walletSpan = document.getElementById('br-wallet-display');
  const connectBtn = document.getElementById('br-connect-btn');
  const form       = document.getElementById('br-register-form');

  if (!window.ethereum) {
    if (statusEl) statusEl.textContent = '⚠️ MetaMask not detected. Please install MetaMask.';
    return;
  }

  try {
    if (statusEl) statusEl.textContent = '⏳ Connecting MetaMask…';
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const addr = accounts[0];
    if (walletSpan) walletSpan.textContent = addr;
    if (connectBtn) connectBtn.textContent = '✅ Connected';
    if (form) form.classList.remove('hidden');
    if (statusEl) statusEl.textContent = '';

    // Pre-fill wallet input
    const walletInput = document.getElementById('br-wallet-input');
    if (walletInput) walletInput.value = addr;
  } catch (err) {
    if (statusEl) statusEl.textContent = `❌ Connection failed: ${err.message}`;
  }
}

async function brSubmit() {
  const statusEl     = document.getElementById('br-status');
  const githubInput  = document.getElementById('br-github-input');
  const walletInput  = document.getElementById('br-wallet-input');
  const submitBtn    = document.getElementById('br-submit-btn');

  const github = (githubInput?.value || '').trim().replace(/^@/, '');
  const wallet = (walletInput?.value || '').trim();

  if (!github) {
    if (statusEl) statusEl.textContent = '⚠️ Enter your GitHub username.';
    return;
  }
  if (!wallet) {
    if (statusEl) statusEl.textContent = '⚠️ Connect MetaMask or enter your Optimism wallet address.';
    return;
  }
  if (!wallet.startsWith('0x') || wallet.length !== 42) {
    if (statusEl) statusEl.textContent = '⚠️ Invalid wallet address — must start with 0x and be 42 characters long.';
    return;
  }
  if (!window.ethereum) {
    if (statusEl) statusEl.textContent = '⚠️ MetaMask not detected. Please install MetaMask and refresh.';
    return;
  }
  if (!window.ethers) {
    if (statusEl) statusEl.textContent = '⚠️ Ethers.js library not loaded. Please refresh the page.';
    return;
  }

  try {
    if (submitBtn) submitBtn.disabled = true;
    if (statusEl) statusEl.textContent = '⏳ Sign the message in MetaMask…';

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();
    const signerAddr = await signer.getAddress();

    if (signerAddr.toLowerCase() !== wallet.toLowerCase()) {
      if (statusEl) statusEl.textContent = '⚠️ Connected wallet does not match the address entered.';
      return;
    }

    const message = `BigNuten Bounty Registration\nGitHub: @${github}\nWallet: ${wallet}\nTimestamp: ${new Date().toISOString()}`;
    await signer.signMessage(message); // just proves ownership

    // Load and update contributor-accounts.json
    let contributorData;
    try {
      contributorData = await fetchContributors();
    } catch {
      contributorData = { contributors: [] };
    }

    const existing = contributorData.contributors.find(c => c.github === github);
    if (existing) {
      existing.walletAddress = wallet;
    } else {
      contributorData.contributors.push({
        github,
        displayName: github,
        role: 'contributor',
        walletAddress: wallet,
        bnutEarned: 0,
        bnutPending: 0,
        issuesClosed: [],
        registeredAt: new Date().toISOString(),
      });
    }

    downloadJSON(contributorData, 'contributor-accounts.json');

    if (statusEl) {
      statusEl.innerHTML =
        '✅ Signed! Your updated <code>contributor-accounts.json</code> has been downloaded. ' +
        'Please share it with the repo maintainer or open a PR to register your wallet. ' +
        'Once merged, you will receive $BNUT bounty payouts to your Optimism address.';
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = `❌ ${err.message || err}`;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}
