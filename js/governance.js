/**
 * js/governance.js
 * BigNuten Governance Frontend Module
 *
 * Handles on-chain governance interactions for the BigNuten community:
 *   - Loading active proposals from the BigNutenGovernance contract
 *   - Casting votes via MetaMask
 *   - Rendering proposals to a DOM element for the community dashboard
 *
 * Related issue: #47 — Deploy $BNUT-Based Community Governance System.
 *
 * Prerequisites (loaded in index.html before this module):
 *   - ethers.js v6 (via CDN)
 *   - MetaMask or another EIP-1193 browser wallet
 *
 * Usage (ES module):
 *   import { loadProposals, castVote, displayProposals } from './governance.js';
 */

// ─── Contract ABI (minimal — only the functions we call) ──────────────────────

/** Minimal ABI for the BigNutenGovernance contract. */
const GOVERNANCE_ABI = [
  // View functions
  "function proposalCount() view returns (uint256)",
  "function getProposal(uint256 proposalId) view returns (tuple(uint256 id, string description, uint256 voteFor, uint256 voteAgainst, uint256 deadline, bool executed))",
  "function hasVoted(uint256 proposalId, address voter) view returns (bool)",
  // State-changing functions
  "function vote(uint256 proposalId, bool support)",
  // Events (for log filtering — optional)
  "event Voted(uint256 indexed proposalId, address indexed voter, bool support)",
  "event ProposalCreated(uint256 indexed proposalId, string description, uint256 deadline)",
];

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Governance contract address — update after deploying BigNutenGovernance.sol.
 * In production, inject this value server-side or read from a config endpoint.
 */
const GOVERNANCE_CONTRACT_ADDRESS =
  window.GOVERNANCE_CONTRACT_ADDRESS ||
  "0x0000000000000000000000000000000000000000";

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Returns a read-only ethers.js provider backed by MetaMask's injected provider.
 * Falls back to a JSON-RPC provider if MetaMask is unavailable (read-only mode).
 *
 * @returns {import('ethers').Provider}
 */
function _getProvider() {
  if (window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  // Fallback: configurable public RPC for reading data without a wallet.
  // Set window.FALLBACK_RPC_URL in your page to match the network your
  // contracts are deployed on (Polygon, Base, Optimism, etc.).
  const fallbackRpc = window.FALLBACK_RPC_URL || "https://polygon-rpc.com";
  console.warn(
    `[governance.js] MetaMask not found — using fallback RPC (${fallbackRpc}). Voting will not be available.`
  );
  return new ethers.JsonRpcProvider(fallbackRpc);
}

/**
 * Returns an ethers.js Signer for the currently connected MetaMask account.
 * Prompts the user to connect their wallet if not already connected.
 *
 * @returns {Promise<import('ethers').Signer>}
 */
async function _getSigner() {
  if (!window.ethereum) {
    throw new Error(
      "MetaMask is required to vote. Install it at https://metamask.io"
    );
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
}

/**
 * Formats a Unix timestamp into a human-readable local date/time string.
 *
 * @param {bigint|number} timestamp - Unix timestamp in seconds.
 * @returns {string} Formatted date string.
 */
function _formatDeadline(timestamp) {
  return new Date(Number(timestamp) * 1000).toLocaleString();
}

// ─── Exported Functions ───────────────────────────────────────────────────────

/**
 * Fetches all proposals from the BigNutenGovernance contract and returns
 * them as an array of plain objects sorted by deadline (most recent first).
 *
 * Only proposals that exist (deadline !== 0) are included.
 *
 * @returns {Promise<Array<{
 *   id: number,
 *   description: string,
 *   voteFor: number,
 *   voteAgainst: number,
 *   deadline: Date,
 *   executed: boolean,
 *   isOpen: boolean
 * }>>} Array of proposal objects.
 *
 * @example
 *   const proposals = await loadProposals();
 *   proposals.forEach(p => console.log(p.description, p.isOpen ? 'OPEN' : 'CLOSED'));
 */
export async function loadProposals() {
  try {
    const provider = _getProvider();
    const contract = new ethers.Contract(
      GOVERNANCE_CONTRACT_ADDRESS,
      GOVERNANCE_ABI,
      provider
    );

    const count = await contract.proposalCount();
    const total = Number(count);

    if (total === 0) {
      return [];
    }

    // Fetch all proposals in parallel.
    const proposalPromises = Array.from({ length: total }, (_, i) =>
      contract.getProposal(i).catch(() => null)
    );
    const raw = await Promise.all(proposalPromises);

    const now = Date.now();

    return raw
      .filter(Boolean) // Remove any failed fetches.
      .map((p) => ({
        id: Number(p.id),
        description: p.description,
        voteFor: Number(p.voteFor),
        voteAgainst: Number(p.voteAgainst),
        deadline: new Date(Number(p.deadline) * 1000),
        executed: p.executed,
        isOpen: !p.executed && Number(p.deadline) * 1000 > now,
      }))
      .sort((a, b) => b.deadline - a.deadline); // Most recent first.
  } catch (err) {
    console.error("[governance.js] loadProposals error:", err);
    throw err;
  }
}

/**
 * Casts a vote on a governance proposal via MetaMask.
 * The connected wallet must hold at least 1 $BNUT token.
 * Each address can vote only once per proposal (enforced on-chain).
 *
 * @param {number} proposalId - The numeric ID of the proposal to vote on.
 * @param {boolean} support   - true = vote FOR, false = vote AGAINST.
 * @returns {Promise<string>} The transaction hash of the vote.
 *
 * @example
 *   const txHash = await castVote(0, true); // Vote FOR proposal #0
 *   console.log('Vote tx:', txHash);
 */
export async function castVote(proposalId, support) {
  try {
    const signer = await _getSigner();
    const contract = new ethers.Contract(
      GOVERNANCE_CONTRACT_ADDRESS,
      GOVERNANCE_ABI,
      signer
    );

    console.log(
      `[governance.js] Casting ${support ? "FOR" : "AGAINST"} vote on proposal #${proposalId}…`
    );

    const tx = await contract.vote(proposalId, support);
    console.log("[governance.js] Vote tx submitted:", tx.hash);
    await tx.wait();
    console.log("[governance.js] Vote confirmed on-chain!");
    return tx.hash;
  } catch (err) {
    console.error("[governance.js] castVote error:", err);
    throw err;
  }
}

/**
 * Renders governance proposals into a DOM container element.
 * Displays proposal description, vote counts, status, and deadline.
 * Adds "Vote For" / "Vote Against" buttons for open proposals.
 *
 * @param {string} containerId - The `id` of the DOM element to render into.
 * @param {Array} [proposals]  - Optional pre-loaded proposals array.
 *   If omitted, `loadProposals()` is called automatically.
 * @returns {Promise<void>}
 *
 * @example
 *   // Render proposals into <div id="governance-container"></div>
 *   await displayProposals('governance-container');
 */
export async function displayProposals(containerId, proposals) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(
      `[governance.js] displayProposals: element #${containerId} not found.`
    );
    return;
  }

  // Show a loading indicator.
  container.innerHTML = "<p>Loading proposals…</p>";

  try {
    const items = proposals || (await loadProposals());

    if (items.length === 0) {
      container.innerHTML =
        "<p>No governance proposals yet. Check back soon!</p>";
      return;
    }

    container.innerHTML = ""; // Clear loading indicator.

    items.forEach((proposal) => {
      const totalVotes = proposal.voteFor + proposal.voteAgainst;
      const forPct =
        totalVotes > 0
          ? Math.round((proposal.voteFor / totalVotes) * 100)
          : 0;
      const againstPct = totalVotes > 0 ? 100 - forPct : 0;

      const statusBadge = proposal.executed
        ? '<span class="badge badge-executed">Executed</span>'
        : proposal.isOpen
        ? '<span class="badge badge-open">Open</span>'
        : '<span class="badge badge-closed">Closed</span>';

      const voteButtons = proposal.isOpen
        ? `<div class="vote-buttons">
             <button
               class="btn btn-vote-for"
               onclick="window._bnutVote(${proposal.id}, true)"
               title="Vote in favour of this proposal"
             >
               👍 Vote For
             </button>
             <button
               class="btn btn-vote-against"
               onclick="window._bnutVote(${proposal.id}, false)"
               title="Vote against this proposal"
             >
               👎 Vote Against
             </button>
           </div>`
        : "";

      const card = document.createElement("div");
      card.className = "proposal-card";
      card.innerHTML = `
        <div class="proposal-header">
          <span class="proposal-id">#${proposal.id}</span>
          ${statusBadge}
        </div>
        <p class="proposal-description">${proposal.description}</p>
        <div class="vote-bar">
          <div class="vote-bar-for" style="width:${forPct}%" title="${proposal.voteFor} votes for"></div>
          <div class="vote-bar-against" style="width:${againstPct}%" title="${proposal.voteAgainst} votes against"></div>
        </div>
        <div class="vote-counts">
          <span>✅ For: ${proposal.voteFor}</span>
          <span>❌ Against: ${proposal.voteAgainst}</span>
        </div>
        <p class="proposal-deadline">
          ${proposal.isOpen ? "Voting closes" : "Voting closed"}:
          ${proposal.deadline.toLocaleString()}
        </p>
        ${voteButtons}
      `;

      container.appendChild(card);
    });

    // Attach vote handler to window so inline onclick handlers can reach it.
    window._bnutVote = async (proposalId, support) => {
      try {
        const txHash = await castVote(proposalId, support);
        alert(`✅ Vote submitted!\nTx: ${txHash}\nRefreshing proposals…`);
        // Refresh the display after a successful vote.
        await displayProposals(containerId);
      } catch (err) {
        alert(`❌ Vote failed: ${err.message || err}`);
      }
    };
  } catch (err) {
    container.innerHTML = `<p class="error">Failed to load proposals: ${err.message}</p>`;
    console.error("[governance.js] displayProposals error:", err);
  }
}
