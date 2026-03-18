// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ─────────────────────────────────────────────────────────────────────────────
// BigNutenGov — BigNuten Community Governance Contract
// ─────────────────────────────────────────────────────────────────────────────
//# Voting Model:  1 wallet = 1 vote (sybil-resistant for small community)
//# Eligibility:   Must hold >= MIN_BNUT_TO_VOTE $BNUT tokens to vote
//# Proposals:     Only DNFT holders (granted PROPOSER_ROLE) can create proposals
//# Admin:         DEFAULT_ADMIN_ROLE (TheJollyLaMa) has final say — can mark
//#                result as ENACTED or VETOED after reviewing vote outcome
//# No auto-exec:  Results are advisory — admin decides final action
//#
//# Network:       Optimism Mainnet (same as $BNUT and DNFTs)
// ─────────────────────────────────────────────────────────────────────────────

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC20Balance {
    function balanceOf(address account) external view returns (uint256);
}

contract BigNutenGov is AccessControl, ReentrancyGuard {

    // ── Roles ────────────────────────────────────────────────────────────────
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    // DEFAULT_ADMIN_ROLE = TheJollyLaMa — can grant PROPOSER_ROLE to DNFT holders

    // ── Config ───────────────────────────────────────────────────────────────
    IERC20Balance public bnutToken;             // $BNUT contract address
    uint256 public minBnutToVote = 1 * 10**18; // 1 $BNUT minimum to vote
    uint256 public votingDuration = 7 days;    // default voting window
    uint256 public quorum = 3;                 // minimum YES+NO votes for valid result

    // ── Proposal States ──────────────────────────────────────────────────────
    enum ProposalState {
        Active,    // voting open
        Passed,    // voting closed, YES > NO, quorum met
        Failed,    // voting closed, NO >= YES or quorum not met
        Enacted,   // admin confirmed: we're doing it
        Vetoed     // admin overruled: not doing it
    }

    // ── Proposal Struct ──────────────────────────────────────────────────────
    struct Proposal {
        uint256 id;
        address proposer;
        string title;
        string description;       // plain text, shown in the modal
        string optionYes;         // label for yes vote e.g. "Run the lottery"
        string optionNo;          // label for no vote e.g. "Let funds grow"
        uint256 deadline;         // block timestamp when voting closes
        uint256 yesVotes;
        uint256 noVotes;
        ProposalState state;
        string adminNote;         // optional note when admin enacts/vetoes
    }

    // ── Storage ──────────────────────────────────────────────────────────────
    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    // ── Events ───────────────────────────────────────────────────────────────
    event ProposalCreated(
        uint256 indexed id,
        address indexed proposer,
        string title,
        uint256 deadline
    );
    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool voteYes
    );
    event ProposalFinalized(uint256 indexed id, ProposalState state);
    event ProposalActedOn(uint256 indexed id, ProposalState adminAction, string note);

    // ── Constructor ──────────────────────────────────────────────────────────
    constructor(address admin, address bnutTokenAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        bnutToken = IERC20Balance(bnutTokenAddress);
    }

    // ── Modifiers ────────────────────────────────────────────────────────────
    modifier proposalExists(uint256 id) {
        require(id > 0 && id <= proposalCount, "Governance: proposal not found");
        _;
    }

    // ── Proposal Creation ────────────────────────────────────────────────────

    /**
     * @notice Create a new community proposal. Only PROPOSER_ROLE (DNFT holders).
     * @param title       Short title shown in the governance modal.
     * @param description Full description of what's being decided.
     * @param optionYes   Label for a YES vote.
     * @param optionNo    Label for a NO vote.
     * @param duration    Voting window in seconds (0 = use default 7 days).
     */
    function createProposal(
        string calldata title,
        string calldata description,
        string calldata optionYes,
        string calldata optionNo,
        uint256 duration
    ) external onlyRole(PROPOSER_ROLE) returns (uint256) {
        require(bytes(title).length > 0, "Governance: title required");
        require(bytes(description).length > 0, "Governance: description required");

        proposalCount++;
        uint256 id = proposalCount;
        uint256 window = duration > 0 ? duration : votingDuration;

        proposals[id] = Proposal({
            id: id,
            proposer: msg.sender,
            title: title,
            description: description,
            optionYes: optionYes,
            optionNo: optionNo,
            deadline: block.timestamp + window,
            yesVotes: 0,
            noVotes: 0,
            state: ProposalState.Active,
            adminNote: ""
        });

        emit ProposalCreated(id, msg.sender, title, block.timestamp + window);
        return id;
    }

    // ── Voting ───────────────────────────────────────────────────────────────

    /**
     * @notice Cast a vote on an active proposal.
     *         Requirements: hold >= minBnutToVote, have not voted, proposal still active.
     * @param proposalId  ID of the proposal to vote on.
     * @param voteYes     true = YES, false = NO.
     */
    function castVote(uint256 proposalId, bool voteYes)
        external
        nonReentrant
        proposalExists(proposalId)
    {
        Proposal storage p = proposals[proposalId];
        require(p.state == ProposalState.Active, "Governance: voting closed");
        require(block.timestamp <= p.deadline, "Governance: voting period ended");
        require(!hasVoted[proposalId][msg.sender], "Governance: already voted");
        require(
            bnutToken.balanceOf(msg.sender) >= minBnutToVote,
            "Governance: insufficient $BNUT to vote"
        );

        hasVoted[proposalId][msg.sender] = true;

        if (voteYes) {
            p.yesVotes++;
        } else {
            p.noVotes++;
        }

        emit VoteCast(proposalId, msg.sender, voteYes);
    }

    // ── Finalization ─────────────────────────────────────────────────────────

    /**
     * @notice Finalize a proposal after its deadline has passed.
     *         Anyone can call this — it just tallies and sets the state.
     */
    function finalizeProposal(uint256 proposalId)
        external
        proposalExists(proposalId)
    {
        Proposal storage p = proposals[proposalId];
        require(p.state == ProposalState.Active, "Governance: already finalized");
        require(block.timestamp > p.deadline, "Governance: voting still open");

        uint256 totalVotes = p.yesVotes + p.noVotes;
        if (totalVotes >= quorum && p.yesVotes > p.noVotes) {
            p.state = ProposalState.Passed;
        } else {
            p.state = ProposalState.Failed;
        }

        emit ProposalFinalized(proposalId, p.state);
    }

    // ── Admin Actions ────────────────────────────────────────────────────────

    /**
     * @notice Admin marks a passed proposal as enacted (we're doing it).
     * @param proposalId  ID of the proposal.
     * @param note        Optional explanation for the community.
     */
    function enactProposal(uint256 proposalId, string calldata note)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        proposalExists(proposalId)
    {
        Proposal storage p = proposals[proposalId];
        require(
            p.state == ProposalState.Passed || p.state == ProposalState.Failed,
            "Governance: finalize first"
        );
        p.state = ProposalState.Enacted;
        p.adminNote = note;
        emit ProposalActedOn(proposalId, ProposalState.Enacted, note);
    }

    /**
     * @notice Admin vetoes a proposal (overrides the vote result).
     *         Used sparingly — admin explains reasoning in note.
     * @param proposalId  ID of the proposal.
     * @param note        Required explanation — the community deserves transparency.
     */
    function vetoProposal(uint256 proposalId, string calldata note)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        proposalExists(proposalId)
    {
        require(bytes(note).length > 0, "Governance: veto note required");
        Proposal storage p = proposals[proposalId];
        require(
            p.state == ProposalState.Passed || p.state == ProposalState.Failed,
            "Governance: finalize first"
        );
        p.state = ProposalState.Vetoed;
        p.adminNote = note;
        emit ProposalActedOn(proposalId, ProposalState.Vetoed, note);
    }

    // ── Admin Config ─────────────────────────────────────────────────────────

    /// @notice Update minimum $BNUT required to vote.
    function setMinBnutToVote(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minBnutToVote = amount;
    }

    /// @notice Update default voting duration.
    function setVotingDuration(uint256 duration) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(duration >= 1 hours, "Governance: too short");
        votingDuration = duration;
    }

    /// @notice Update quorum requirement.
    function setQuorum(uint256 _quorum) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_quorum >= 1, "Governance: quorum must be >= 1");
        quorum = _quorum;
    }

    /// @notice Grant PROPOSER_ROLE to a DNFT holder.
    function addProposer(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(PROPOSER_ROLE, account);
    }

    /// @notice Revoke PROPOSER_ROLE.
    function removeProposer(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(PROPOSER_ROLE, account);
    }

    // ── View Functions ───────────────────────────────────────────────────────

    /// @notice Get full proposal details.
    function getProposal(uint256 id) external view returns (Proposal memory) {
        return proposals[id];
    }

    /// @notice Get all proposals (for frontend modal — paginate if list grows).
    function getAllProposals() external view returns (Proposal[] memory) {
        Proposal[] memory all = new Proposal[](proposalCount);
        for (uint256 i = 1; i <= proposalCount; i++) {
            all[i - 1] = proposals[i];
        }
        return all;
    }

    /// @notice Check if a wallet has voted on a proposal.
    function didVote(uint256 proposalId, address voter) external view returns (bool) {
        return hasVoted[proposalId][voter];
    }

    /// @notice Check if a wallet is eligible to vote (has enough $BNUT).
    function canVote(address voter) external view returns (bool) {
        return bnutToken.balanceOf(voter) >= minBnutToVote;
    }
}