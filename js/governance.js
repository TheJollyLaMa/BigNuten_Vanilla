/**
 * js/governance.js
 * BigNuten In-App Governance Module
 *
 * Handles on-chain governance for BigNutenGov contract on Optimism Mainnet:
 *   - Loading proposals via getAllProposals()
 *   - Casting votes via castVote(proposalId, voteYes)
 *   - Creating proposals via createProposal() (PROPOSER_ROLE only)
 *   - Rendering proposals to the governance modal DOM
 *
 * Contract: 0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD (Optimism)
 * Related issue: #47 — Build In-App Governance Contract & Modal
 *
 * Prerequisites (loaded in index.html before this module):
 *   - ethers.js v6 (via CDN)
 *   - js/contracts.js (sets window.GOVERNANCE_CONTRACT_ADDRESS)
 *   - MetaMask or another EIP-1193 browser wallet
 */

// ─── Minimal ABI (only the functions and events we call) ─────────────────────

const GOVERNANCE_ABI = [
  // View
  "function getAllProposals() view returns (tuple(uint256 id, address proposer, string title, string description, string optionYes, string optionNo, uint256 deadline, uint256 yesVotes, uint256 noVotes, uint8 state, string adminNote)[])",
  "function hasVoted(uint256 proposalId, address voter) view returns (bool)",
  "function canVote(address voter) view returns (bool)",
  "function quorum() view returns (uint256)",
  "function PROPOSER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  // State-changing
  "function castVote(uint256 proposalId, bool voteYes)",
  "function createProposal(string title, string description, string optionYes, string optionNo, uint256 duration) returns (uint256)",
  // Events
  "event VoteCast(uint256 indexed proposalId, address indexed voter, bool voteYes)",
  "event ProposalCreated(uint256 indexed id, address indexed proposer, string title, uint256 deadline)",
];

// ─── Proposal state enum (must match BigNutenGov.sol) ────────────────────────
const PROPOSAL_STATE = {
  0: { label: "Active",  emoji: "🗳️",  cssClass: "badge-active"  },
  1: { label: "Passed",  emoji: "✅",  cssClass: "badge-passed"  },
  2: { label: "Failed",  emoji: "❌",  cssClass: "badge-failed"  },
  3: { label: "Enacted", emoji: "⚡",  cssClass: "badge-enacted" },
  4: { label: "Vetoed",  emoji: "🚫",  cssClass: "badge-vetoed"  },
};

// ─── Configuration ────────────────────────────────────────────────────────────

const GOVERNANCE_CONTRACT_ADDRESS =
  window.GOVERNANCE_CONTRACT_ADDRESS ||
  "0x58c21942716eB78aCfeD1BACE81f5189bad5E2cD";

const OPTIMISM_RPC_URL =
  (window.CONTRACTS && window.CONTRACTS.rpcUrl) ||
  "https://mainnet.optimism.io";

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function _getProvider() {
  if (window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  console.warn(
    "[governance.js] MetaMask not found — using read-only Optimism RPC. Voting unavailable."
  );
  return new ethers.JsonRpcProvider(OPTIMISM_RPC_URL);
}

async function _getSigner() {
  if (!window.ethereum) {
    throw new Error("MetaMask is required. Install it at https://metamask.io");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
}

function _sanitize(str) {
  const d = document.createElement("div");
  d.textContent = String(str || "");
  return d.innerHTML;
}

// ─── Exported: loadProposals ──────────────────────────────────────────────────

/**
 * Fetch all proposals from the contract.
 * Returns an array of normalised plain objects sorted open-first, then by
 * deadline descending.
 *
 * @returns {Promise<Array>}
 */
export async function loadProposals() {
  const provider = _getProvider();
  const contract = new ethers.Contract(
    GOVERNANCE_CONTRACT_ADDRESS,
    GOVERNANCE_ABI,
    provider
  );

  const raw = await contract.getAllProposals();
  const now = Date.now();

  return [...raw]
    .map((p) => {
      const deadlineMs = Number(p.deadline) * 1000;
      const stateNum = Number(p.state);
      return {
        id:          Number(p.id),
        proposer:    p.proposer,
        title:       p.title,
        description: p.description,
        optionYes:   p.optionYes,
        optionNo:    p.optionNo,
        deadline:    new Date(deadlineMs),
        yesVotes:    Number(p.yesVotes),
        noVotes:     Number(p.noVotes),
        state:       stateNum,
        adminNote:   p.adminNote,
        isActive:    stateNum === 0 && deadlineMs > now,
      };
    })
    .sort((a, b) => {
      // Active proposals first, then by deadline descending.
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return b.deadline - a.deadline;
    });
}

// ─── Exported: castVote ───────────────────────────────────────────────────────

/**
 * Cast a YES or NO vote on a proposal via MetaMask.
 * Wallet must hold >= minBnutToVote $BNUT (enforced on-chain).
 *
 * @param {number}  proposalId
 * @param {boolean} voteYes  – true = YES, false = NO
 * @returns {Promise<string>} transaction hash
 */
export async function castVote(proposalId, voteYes) {
  const signer = await _getSigner();
  const contract = new ethers.Contract(
    GOVERNANCE_CONTRACT_ADDRESS,
    GOVERNANCE_ABI,
    signer
  );
  console.log(
    `[governance.js] Casting ${voteYes ? "YES" : "NO"} on proposal #${proposalId}…`
  );
  const tx = await contract.castVote(proposalId, voteYes);
  console.log("[governance.js] Vote tx:", tx.hash);
  await tx.wait();
  console.log("[governance.js] Vote confirmed.");
  return tx.hash;
}

// ─── Exported: createProposal ─────────────────────────────────────────────────

/**
 * Create a new governance proposal (PROPOSER_ROLE only).
 *
 * @param {string} title
 * @param {string} description
 * @param {string} optionYes   – label for YES vote
 * @param {string} optionNo    – label for NO vote
 * @param {number} durationDays – voting window in days (0 = contract default 7d)
 * @returns {Promise<number>} new proposal ID
 */
export async function createProposal(
  title,
  description,
  optionYes,
  optionNo,
  durationDays
) {
  const signer = await _getSigner();
  const contract = new ethers.Contract(
    GOVERNANCE_CONTRACT_ADDRESS,
    GOVERNANCE_ABI,
    signer
  );
  const durationSec =
    durationDays > 0 ? Math.floor(durationDays) * 86400 : 0;
  console.log("[governance.js] Creating proposal:", title);
  const tx = await contract.createProposal(
    title,
    description,
    optionYes,
    optionNo,
    durationSec
  );
  const receipt = await tx.wait();
  console.log("[governance.js] Proposal created. Tx:", tx.hash);
  // Parse ProposalCreated event to get the new ID.
  const iface = new ethers.Interface(GOVERNANCE_ABI);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "ProposalCreated") {
        return Number(parsed.args.id);
      }
    } catch (_) {
      // ignore non-matching logs
    }
  }
  return -1;
}

// ─── Exported: isProposer ─────────────────────────────────────────────────────

/**
 * Check if a wallet holds PROPOSER_ROLE (i.e. is a DNFT holder/proposer).
 *
 * @param {string} address
 * @returns {Promise<boolean>}
 */
export async function isProposer(address) {
  if (!address) return false;
  try {
    const provider = _getProvider();
    const contract = new ethers.Contract(
      GOVERNANCE_CONTRACT_ADDRESS,
      GOVERNANCE_ABI,
      provider
    );
    const role = await contract.PROPOSER_ROLE();
    return await contract.hasRole(role, address);
  } catch (err) {
    console.error("[governance.js] isProposer error:", err);
    return false;
  }
}

// ─── Exported: displayProposals ───────────────────────────────────────────────

/**
 * Render governance proposals into #gov-proposals-container.
 * Fetches wallet state (has voted, can vote) in parallel per proposal.
 *
 * @param {string} containerId – id of the DOM element to render into
 * @returns {Promise<void>}
 */
export async function displayProposals(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`[governance.js] #${containerId} not found.`);
    return;
  }

  container.innerHTML = `<p class="gov-loading">⏳ Loading proposals…</p>`;

  try {
    const provider = _getProvider();
    const contract = new ethers.Contract(
      GOVERNANCE_CONTRACT_ADDRESS,
      GOVERNANCE_ABI,
      provider
    );

    // Resolve connected wallet (if any) — read-only, no prompt.
    let walletAddress = null;
    let walletCanVote = false;
    let quorumValue = 5;

    try {
      if (window.ethereum) {
        const p = new ethers.BrowserProvider(window.ethereum);
        const accounts = await p.send("eth_accounts", []);
        if (accounts && accounts.length > 0) {
          walletAddress = accounts[0];
          walletCanVote = await contract.canVote(walletAddress);
        }
      }
      quorumValue = Number(await contract.quorum());
    } catch (_) {
      // Non-fatal — fall through to read-only display.
    }

    const proposals = await loadProposals();

    if (proposals.length === 0) {
      container.innerHTML =
        `<p class="gov-empty">No governance proposals yet — check back soon!</p>`;
      return;
    }

    // For active proposals, batch-check hasVoted for connected wallet.
    const votedMap = {};
    if (walletAddress) {
      await Promise.all(
        proposals
          .filter((p) => p.isActive)
          .map(async (p) => {
            try {
              votedMap[p.id] = await contract.hasVoted(p.id, walletAddress);
            } catch (_) {
              votedMap[p.id] = false;
            }
          })
      );
    }

    container.innerHTML = "";

    proposals.forEach((proposal) => {
      const totalVotes = proposal.yesVotes + proposal.noVotes;
      const yesPct =
        totalVotes > 0 ? Math.round((proposal.yesVotes / totalVotes) * 100) : 0;
      const noPct = totalVotes > 0 ? 100 - yesPct : 0;
      const quorumMet = totalVotes >= quorumValue;

      const stateInfo = PROPOSAL_STATE[proposal.state] || {
        label: "Unknown", emoji: "❓", cssClass: "badge-unknown",
      };

      // Vote buttons (only for Active proposals)
      let voteSection = "";
      if (proposal.isActive) {
        const alreadyVoted = votedMap[proposal.id] === true;
        if (alreadyVoted) {
          voteSection = `<p class="gov-voted-notice">✓ You have already voted on this proposal.</p>`;
        } else if (!walletAddress) {
          voteSection = `<p class="gov-connect-notice">🔗 Connect wallet to vote.</p>`;
        } else if (!walletCanVote) {
          voteSection = `<p class="gov-no-bnut-notice">💰 You need ≥1 $BNUT to vote.</p>`;
        } else {
          voteSection = `
            <div class="gov-vote-buttons">
              <button class="gov-btn-yes" data-id="${proposal.id}" data-vote="yes">
                ✅ ${_sanitize(proposal.optionYes) || "Yes"}
              </button>
              <button class="gov-btn-no" data-id="${proposal.id}" data-vote="no">
                ❌ ${_sanitize(proposal.optionNo) || "No"}
              </button>
            </div>`;
        }
      }

      // Admin note (Enacted / Vetoed)
      const adminNoteHtml = proposal.adminNote
        ? `<p class="gov-admin-note">📋 Admin note: ${_sanitize(proposal.adminNote)}</p>`
        : "";

      const card = document.createElement("div");
      card.className = `proposal-card${proposal.isActive ? " proposal-active" : ""}`;
      card.innerHTML = `
        <div class="proposal-header">
          <span class="proposal-id">#${proposal.id}</span>
          <span class="badge ${stateInfo.cssClass}">${stateInfo.emoji} ${stateInfo.label}</span>
        </div>
        <h4 class="proposal-title">${_sanitize(proposal.title)}</h4>
        <p class="proposal-description">${_sanitize(proposal.description)}</p>
        <div class="gov-vote-bar">
          <div class="gov-vote-bar-yes" style="width:${yesPct}%" title="${proposal.yesVotes} yes votes"></div>
          <div class="gov-vote-bar-no"  style="width:${noPct}%"  title="${proposal.noVotes} no votes"></div>
        </div>
        <div class="gov-vote-counts">
          <span>✅ ${_sanitize(proposal.optionYes) || "Yes"}: ${proposal.yesVotes}</span>
          <span>❌ ${_sanitize(proposal.optionNo)  || "No"}: ${proposal.noVotes}</span>
          <span class="gov-quorum${quorumMet ? " quorum-met" : " quorum-unmet"}">
            ${quorumMet ? "✅" : "⏳"} Quorum (${quorumValue}): ${quorumMet ? "met" : `${totalVotes}/${quorumValue}`}
          </span>
        </div>
        <p class="proposal-deadline">
          ${proposal.isActive ? "⏰ Voting closes" : "🔒 Voting closed"}:
          ${proposal.deadline.toLocaleString()}
        </p>
        ${adminNoteHtml}
        ${voteSection}
      `;
      container.appendChild(card);
    });

    // Delegate vote button clicks to avoid stale closures.
    container.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-id][data-vote]");
      if (!btn) return;
      const proposalId = Number(btn.dataset.id);
      const voteYes = btn.dataset.vote === "yes";

      btn.disabled = true;
      btn.textContent = "⏳ Submitting…";

      try {
        const txHash = await castVote(proposalId, voteYes);
        alert(
          `✅ Vote submitted!\nTx: ${txHash}\n\nRefreshing proposals…`
        );
        await displayProposals(containerId);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = voteYes
          ? `✅ ${btn.closest(".proposal-card").querySelector(".gov-btn-yes")?.textContent || "Yes"}`
          : `❌ ${btn.closest(".proposal-card")?.querySelector(".gov-btn-no")?.textContent || "No"}`;
        alert(`❌ Vote failed: ${err.reason || err.message || err}`);
      }
    }, { once: true });

  } catch (err) {
    container.innerHTML = `<p class="gov-error">⚠️ Failed to load proposals: ${_sanitize(err.message)}</p>`;
    console.error("[governance.js] displayProposals error:", err);
  }
}
