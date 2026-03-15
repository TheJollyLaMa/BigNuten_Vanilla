// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BigNuten Community Governance
/// @author TheJollyLaMa
/// @notice Allows $BNUT token holders to vote on community proposals.
///         Any address with a positive BNUT balance may cast one vote per
///         proposal. The owner creates and executes proposals.
///         Related issue: #47 — Deploy $BNUT-Based Community Governance System.
/// @dev This is an intentionally simple governance stub.
///      Future iterations can integrate Governor Bravo / OpenZeppelin Governor.

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BigNutenGovernance is Ownable {
    // ─── Types ────────────────────────────────────────────────────────────────

    /// @notice Represents a single governance proposal.
    struct Proposal {
        uint256 id;           // Unique auto-incrementing proposal ID.
        string description;   // Human-readable description of the proposal.
        uint256 voteFor;      // Cumulative count of votes in favour.
        uint256 voteAgainst;  // Cumulative count of votes against.
        uint256 deadline;     // Unix timestamp after which voting closes.
        bool executed;        // True once the owner has executed the proposal.
    }

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice The $BNUT token used to gate voting rights.
    IERC20 public immutable bnutToken;

    /// @notice Auto-incrementing counter for proposal IDs.
    uint256 private _nextProposalId;

    /// @notice All proposals by ID.
    mapping(uint256 => Proposal) public proposals;

    /// @notice Tracks whether a given voter has already voted on a proposal.
    ///         proposalId => voterAddress => hasVoted
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when a new proposal is created.
    /// @param proposalId Auto-assigned proposal ID.
    /// @param description Human-readable description.
    /// @param deadline    Unix timestamp when voting closes.
    event ProposalCreated(
        uint256 indexed proposalId,
        string description,
        uint256 deadline
    );

    /// @notice Emitted when a BNUT holder casts a vote.
    /// @param proposalId Proposal being voted on.
    /// @param voter      Address of the voter.
    /// @param support    True = vote for, false = vote against.
    event Voted(
        uint256 indexed proposalId,
        address indexed voter,
        bool support
    );

    /// @notice Emitted when a proposal is executed by the owner.
    /// @param proposalId  Executed proposal ID.
    /// @param passed      True if voteFor > voteAgainst at execution time.
    event ProposalExecuted(uint256 indexed proposalId, bool passed);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @notice Initialises governance with the BNUT token address and owner.
    /// @param _bnutToken   Address of the deployed BigNuten ERC-20 contract.
    /// @param initialOwner Address that will own and administer the contract.
    constructor(address _bnutToken, address initialOwner) Ownable(initialOwner) {
        require(_bnutToken != address(0), "Governance: zero token address");
        bnutToken = IERC20(_bnutToken);
    }

    // ─── Owner-Only Functions ─────────────────────────────────────────────────

    /// @notice Creates a new governance proposal.
    /// @param description  A clear description of what the proposal entails.
    /// @param durationDays Number of days the voting window stays open.
    /// @return proposalId  The ID of the newly created proposal.
    function createProposal(
        string memory description,
        uint256 durationDays
    ) external onlyOwner returns (uint256 proposalId) {
        require(bytes(description).length > 0, "Governance: empty description");
        require(durationDays > 0, "Governance: duration must be > 0");

        proposalId = _nextProposalId++;

        proposals[proposalId] = Proposal({
            id: proposalId,
            description: description,
            voteFor: 0,
            voteAgainst: 0,
            deadline: block.timestamp + (durationDays * 1 days),
            executed: false
        });

        emit ProposalCreated(proposalId, description, proposals[proposalId].deadline);
    }

    /// @notice Executes a proposal after its voting deadline has passed.
    ///         Marks it as executed and emits whether it passed.
    ///         The actual on-chain effect of the proposal is left to
    ///         the owner/DAO to implement based on the outcome.
    /// @param proposalId ID of the proposal to execute.
    function executeProposal(uint256 proposalId) external onlyOwner {
        Proposal storage p = proposals[proposalId];
        require(p.deadline != 0, "Governance: proposal does not exist");
        require(block.timestamp >= p.deadline, "Governance: voting still open");
        require(!p.executed, "Governance: already executed");

        p.executed = true;
        bool passed = p.voteFor > p.voteAgainst;

        emit ProposalExecuted(proposalId, passed);
    }

    // ─── Public Voting ────────────────────────────────────────────────────────

    /// @notice Casts a vote on an open proposal.
    ///         Requires the caller to hold at least 1 BNUT (any amount > 0).
    ///         Each address may vote exactly once per proposal.
    /// @param proposalId ID of the proposal to vote on.
    /// @param support    True to vote in favour, false to vote against.
    function vote(uint256 proposalId, bool support) external {
        Proposal storage p = proposals[proposalId];
        require(p.deadline != 0, "Governance: proposal does not exist");
        require(block.timestamp < p.deadline, "Governance: voting closed");
        require(!p.executed, "Governance: proposal already executed");
        require(!hasVoted[proposalId][msg.sender], "Governance: already voted");
        require(
            bnutToken.balanceOf(msg.sender) > 0,
            "Governance: must hold BNUT to vote"
        );

        hasVoted[proposalId][msg.sender] = true;

        if (support) {
            p.voteFor += 1;
        } else {
            p.voteAgainst += 1;
        }

        emit Voted(proposalId, msg.sender, support);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /// @notice Returns the full Proposal struct for a given ID.
    /// @param proposalId ID of the proposal to retrieve.
    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        require(proposals[proposalId].deadline != 0, "Governance: proposal does not exist");
        return proposals[proposalId];
    }

    /// @notice Returns the total number of proposals created so far.
    function proposalCount() external view returns (uint256) {
        return _nextProposalId;
    }
}
