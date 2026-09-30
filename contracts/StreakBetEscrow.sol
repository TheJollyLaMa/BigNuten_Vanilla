// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title StreakBetEscrow — Competition & Streak Bet Escrow with optional Aave yield
/// @author TheJollyLaMa / BigNuten
/// @notice Admin-definable competitions where users stake tokens, self-report
///         weekly progress, and split the pot (plus Aave yield) among finishers.
///         Failed participants forfeit their stake to the winners' pot.
///         Related issue: #71 (v3.1.0 Epic).
/// @dev    Owner creates competitions via createCompetition(). Users join by
///         staking the required token amount. Weekly self-reports are recorded
///         on-chain. On settlement the owner distributes principal + yield back
///         to winners and publishes an IPFS CID for the final leaderboard.
///
///         Security (v3.1.1):
///         - ReentrancyGuard on all external state-changing entry points.
///         - SafeERC20 for all ERC-20 transfers and approvals.
///         - Pausable emergency stop for admin use.
///         - joinDeadline to prevent late-entry / front-running.
///         - Settlement only allowed after competition end time.
///         - Yield captured in potBalance after Aave withdrawal.
///
///         Production best practices:
///         - Deploy behind a Gnosis Safe multisig.
///         - Consider a Timelock controller for critical parameter changes.
///         - Externalize Aave pool address via governance if needed.

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

// ─── Interfaces ───────────────────────────────────────────────────────────────

/// @dev Minimal Aave V3 Pool interface — supply & withdraw.
interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    function getReserveNormalizedIncome(address asset) external view returns (uint256);
}

interface ICompetitionAchievementNFT {
    function MINTER_ROLE() external view returns (bytes32);
    function hasRole(bytes32 role, address account) external view returns (bool);
    function creatorOf(uint256 tokenId) external view returns (address);
    function kindOf(uint256 tokenId) external view returns (uint8);
    function maxSupply(uint256 tokenId) external view returns (uint256);
    function mintAchievement(address to, uint256 tokenId, uint256 amount) external;
}

interface ICompetitionTreasury {
    function bnutToken() external view returns (IERC20);
}

interface IMeetupReviewArbiter {
    function addSelfVote(uint256 compId, uint8 meetupIndex, address attendee, bool solo) external returns (bool);
    function invite(uint256 compId, uint8 meetupIndex, address attendee, address reviewer) external;
    function isInvited(uint256 compId, uint8 meetupIndex, address attendee, address reviewer) external view returns (bool);
    function tally(uint256 compId, uint8 meetupIndex, address attendee) external view returns (uint32 approvals, uint32 rejections);
    function recordVote(uint256 compId, uint8 meetupIndex, address attendee, address reviewer, bool attended) external returns (uint8);
}

contract MeetupReviewArbiter is IMeetupReviewArbiter {
    error UnauthorizedArbiterCaller();
    error InvalidReviewerInvitation();

    struct VoteTally { uint32 approvals; uint32 rejections; }

    address private immutable escrow;
    mapping(uint256 => mapping(uint8 => mapping(address => VoteTally))) private tallies;
    mapping(uint256 => mapping(uint8 => mapping(address => mapping(address => bool)))) private invited;
    mapping(uint256 => mapping(uint8 => mapping(address => mapping(address => bool)))) private reviewed;

    constructor(address escrowAddress) { escrow = escrowAddress; }

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert UnauthorizedArbiterCaller();
        _;
    }

    function addSelfVote(uint256 compId, uint8 meetupIndex, address attendee, bool solo) external onlyEscrow returns (bool) {
        tallies[compId][meetupIndex][attendee].approvals = 1;
        return solo;
    }

    function invite(uint256 compId, uint8 meetupIndex, address attendee, address reviewer) external onlyEscrow {
        VoteTally storage vote = tallies[compId][meetupIndex][attendee];
        if (reviewer == address(0) || reviewer == attendee || vote.approvals != vote.rejections || invited[compId][meetupIndex][attendee][reviewer] || reviewed[compId][meetupIndex][attendee][reviewer]) {
            revert InvalidReviewerInvitation();
        }
        invited[compId][meetupIndex][attendee][reviewer] = true;
    }

    function isInvited(uint256 compId, uint8 meetupIndex, address attendee, address reviewer) external view returns (bool) {
        return invited[compId][meetupIndex][attendee][reviewer];
    }

    function tally(uint256 compId, uint8 meetupIndex, address attendee) external view returns (uint32 approvals, uint32 rejections) {
        VoteTally storage vote = tallies[compId][meetupIndex][attendee];
        return (vote.approvals, vote.rejections);
    }

    function recordVote(uint256 compId, uint8 meetupIndex, address attendee, address reviewer, bool attended) external onlyEscrow returns (uint8 decision) {
        if (reviewed[compId][meetupIndex][attendee][reviewer]) revert InvalidReviewerInvitation();
        reviewed[compId][meetupIndex][attendee][reviewer] = true;
        VoteTally storage vote = tallies[compId][meetupIndex][attendee];
        if (attended) vote.approvals++;
        else vote.rejections++;
        uint256 total = uint256(vote.approvals) + vote.rejections;
        if ((total == 2 && vote.approvals == 2) || (total >= 3 && vote.approvals > total / 2)) return 1;
        if (total >= 3 && vote.rejections > total / 2) return 2;
        return 0;
    }
}

// ─── Contract ─────────────────────────────────────────────────────────────────

contract StreakBetEscrow is Ownable, ReentrancyGuard, Pausable {

    using SafeERC20 for IERC20;

    error InvalidChallengeConfiguration(uint8 reason);
    error InvalidMeetupAction(uint8 reason);
    error InvalidPeerReview(uint8 reason);
    error InvalidStreakAward(uint8 reason);

    // ── Enums ─────────────────────────────────────────────────────────────────

    enum CompStatus { Active, Settled, Cancelled }
    enum EntrantStatus { Joined, Completed, Forfeited }

    // ── Structs ───────────────────────────────────────────────────────────────

    struct Competition {
        string  name;             // human-readable title
        address stakeToken;       // ERC-20 address or address(0) for ETH
        uint256 stakeAmount;      // amount each entrant must stake (wei / token-decimals)
        uint256 totalWeeks;       // streak length (number of weekly check-ins required)
        uint256 startTime;        // unix timestamp when comp begins
        uint256 endTime;          // unix timestamp when comp ends
        uint256 joinDeadline;     // unix timestamp after which no new entrants may join
        bool    yieldEnabled;     // if true, pot is deployed to Aave during comp
        bool    potDeployed;      // true after deployToAave(); prevents double-deployment
        string  metadataCID;      // IPFS CID of competition rules / DNFT metadata
        CompStatus status;
        uint256 potBalance;       // total staked (in escrow)
        uint256 entrantCount;
        uint256 winnerCount;
    }

    struct Entrant {
        address addr;
        uint256 reportsSubmitted; // number of weekly reports filed
        uint256 verifiedActivityDays;
        uint64 qualifiedAt;
        uint8 verifiedMeetups;
        uint8 place;
        EntrantStatus status;
        bool disqualified;
    }

    struct StreakChallengeConfig {
        bool enabled;
        string habitType;
        string meetupGoal;
        uint8 requiredActivityDays;
        uint8 requiredMeetups;
        uint8 minimumWeeklyLogs;
        uint16 dailyGoal;
        address treasury;
        address awardNFT;
        uint256 completionAwardId;
        uint256 firstPlaceAwardId;
        uint256 secondPlaceAwardId;
        uint256 thirdPlaceAwardId;
    }

    struct Meetup {
        uint64 opensAt;
        uint64 closesAt;
        bytes32 codeHash;
        string meetingUrl;
        bool configured;
    }

    struct MeetupAttendance {
        uint8 totalActivityDays;
        uint8 weeklyActivityDays;
        bytes32 progressHash;
        bool checkedIn;
        bool peerApproved;
    }

    /// @notice Input params for createCompetition — avoids stack-too-deep on 9-arg call.
    struct CreateParams {
        string  name;
        address stakeToken;
        uint256 stakeAmount;
        uint256 totalWeeks;
        uint256 startTime;
        uint256 endTime;
        uint256 joinDeadline;
        bool    yieldEnabled;
        string  metadataCID;
    }

    // ── State ─────────────────────────────────────────────────────────────────

    uint256 public nextCompId;

    /// @notice Competition ID → Competition data.
    mapping(uint256 => Competition) internal competitions;

    /// @notice Competition ID → entrant index → Entrant data.
    mapping(uint256 => mapping(uint256 => Entrant)) internal entrants;

    /// @notice Competition ID → entrant address → entrant index (1-indexed, 0 = not joined).
    mapping(uint256 => mapping(address => uint256)) internal entrantIndex;
    mapping(uint256 => StreakChallengeConfig) private streakChallenges;
    mapping(uint256 => mapping(uint8 => Meetup)) public meetups;
    mapping(uint256 => mapping(uint8 => mapping(address => MeetupAttendance))) public meetupAttendance;
    mapping(uint256 => mapping(uint8 => mapping(address => mapping(address => bool)))) public meetupPeerReviewed;
    IMeetupReviewArbiter private reviewArbiter;
    address public challengeStakeToken;

    address public challengeTreasury;
    ICompetitionAchievementNFT public streakAwardNFT;
    uint256 public completionAwardId;
    uint256 public firstPlaceAwardId;
    uint256 public secondPlaceAwardId;
    uint256 public thirdPlaceAwardId;

    uint256 public constant MAX_MEETUPS_PER_CHALLENGE = 12;
    uint256 public constant MAX_WEEKLY_LOGS = 7;
    uint256 public constant MEETUP_DURATION = 1 hours;

    /// @notice Aave V3 Pool address.
    address public aavePool;

    /// @notice Competition ID → scaled Aave balance (principal / liquidity index at supply time).
    mapping(uint256 => uint256) private aaveScaledBalance;

    /// @notice Number of competitions whose pot is currently supplied to Aave.
    uint256 private deployedPotCount;

    uint256 private constant RAY = 1e27;

    // ── Events ────────────────────────────────────────────────────────────────

    event CompetitionCreated(
        uint256 indexed compId,
        string  name,
        address stakeToken,
        uint256 stakeAmount,
        uint256 totalWeeks,
        uint256 startTime,
        uint256 endTime,
        uint256 joinDeadline,
        bool    yieldEnabled,
        string  metadataCID
    );

    event CompetitionSettled(
        uint256 indexed compId,
        uint256 winnerCount,
        uint256 potDistributed,
        string  leaderboardCID
    );

    event CompetitionCancelled(uint256 indexed compId);

    event EntrantJoined(uint256 indexed compId, address indexed entrant, uint256 amount);
    event WeeklyReport(uint256 indexed compId, address indexed entrant, uint256 week, string proofCID);
    event EntrantForfeited(uint256 indexed compId, address indexed entrant);
    event EntrantCompleted(uint256 indexed compId, address indexed entrant);
    event WinningsDistributed(uint256 indexed compId, address indexed winner, uint256 amount);
    event AaveYieldCaptured(uint256 indexed compId, uint256 withdrawn, uint256 originalPot);
    event AavePoolUpdated(address indexed previousPool, address indexed newPool);
    event ChallengeTokenConfigured(address indexed token);
    event ChallengeTreasuryConfigured(address indexed treasury);
    event StreakChallengeConfigured(uint256 indexed compId, string habitType, uint8 requiredActivityDays, uint8 requiredMeetups, uint8 minimumWeeklyLogs, string meetupGoal);
    event MeetupScheduled(uint256 indexed compId, uint8 indexed meetupIndex, uint64 opensAt, uint64 closesAt, bytes32 codeHash, string meetingUrl);
    event MeetupSelfCheckedIn(uint256 indexed compId, uint8 indexed meetupIndex, address indexed entrant, uint8 totalActivityDays, bytes32 progressHash);
    event MeetupPeerDecision(uint256 indexed compId, uint8 indexed meetupIndex, address indexed entrant, address peer, bool approved);
    event MeetupReviewerInvited(uint256 indexed compId, uint8 indexed meetupIndex, address indexed entrant, address reviewer);
    event MonthlyChallengeCompleted(uint256 indexed compId, address indexed entrant, uint8 activityDays, uint8 verifiedMeetups);
    event StreakPayout(uint256 indexed compId, address indexed entrant, uint8 place, uint256 baseRefund, uint256 bonus, uint256 totalPayout);

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @param initialOwner  Admin wallet (multisig recommended).
    /// @param _aavePool     Optional Aave V3 Pool address. Use zero to configure Aave later.
    constructor(address initialOwner, address _aavePool) Ownable(initialOwner) {
        require(_aavePool == address(0) || _aavePool.code.length > 0, "Escrow: Aave pool has no code");
        aavePool = _aavePool;
        reviewArbiter = IMeetupReviewArbiter(address(new MeetupReviewArbiter(address(this))));
    }

    // ── Admin: Create Competition ─────────────────────────────────────────────

    /// @notice Create a new competition. Only the owner can call this.
    /// @param p  CreateParams struct containing all competition configuration.
    function createCompetition(CreateParams calldata p) external onlyOwner whenNotPaused {
        require(bytes(p.name).length > 0, "Escrow: empty name");
        require(p.stakeAmount > 0, "Escrow: stake must be > 0");
        require(p.totalWeeks > 0, "Escrow: totalWeeks must be > 0");
        require(p.endTime > p.startTime, "Escrow: endTime must be after startTime");
        require(p.joinDeadline <= p.endTime, "Escrow: joinDeadline must be <= endTime");
        require(p.joinDeadline >= p.startTime, "Escrow: joinDeadline must be >= startTime");
        require(!(p.yieldEnabled && p.stakeToken == address(0)), "Escrow: ETH yield not supported");
        if (p.yieldEnabled) {
            require(aavePool != address(0), "Escrow: Aave pool not configured");
            require(
                IAavePool(aavePool).getReserveNormalizedIncome(p.stakeToken) > 0,
                "Escrow: unsupported Aave asset"
            );
        }

        uint256 id = nextCompId++;
        Competition storage c = competitions[id];
        c.name          = p.name;
        c.stakeToken    = p.stakeToken;
        c.stakeAmount   = p.stakeAmount;
        c.totalWeeks    = p.totalWeeks;
        c.startTime     = p.startTime;
        c.endTime       = p.endTime;
        c.joinDeadline  = p.joinDeadline;
        c.yieldEnabled  = p.yieldEnabled;
        c.metadataCID   = p.metadataCID;
        c.status        = CompStatus.Active;

        emit CompetitionCreated(id, p.name, p.stakeToken, p.stakeAmount, p.totalWeeks, p.startTime, p.endTime, p.joinDeadline, p.yieldEnabled, p.metadataCID);
    }

    function setChallengeStakeToken(address token) external onlyOwner {
        if (token == address(0) || token.code.length == 0) revert InvalidChallengeConfiguration(1);
        challengeStakeToken = token;
        emit ChallengeTokenConfigured(token);
    }

    function setChallengeTreasury(address treasuryAddress) external onlyOwner {
        if (treasuryAddress == address(0) || treasuryAddress.code.length == 0) revert InvalidChallengeConfiguration(2);
        if (address(ICompetitionTreasury(treasuryAddress).bnutToken()) != challengeStakeToken) revert InvalidChallengeConfiguration(3);
        challengeTreasury = treasuryAddress;
        emit ChallengeTreasuryConfigured(treasuryAddress);
    }

    function setStreakAwards(address nftAddress, uint256 completionId, uint256 firstId, uint256 secondId, uint256 thirdId) external onlyOwner {
        if (nftAddress == address(0) || nftAddress.code.length == 0) revert InvalidStreakAward(1);
        if (
            completionId == firstId || completionId == secondId || completionId == thirdId ||
            firstId == secondId || firstId == thirdId || secondId == thirdId
        ) revert InvalidStreakAward(2);
        ICompetitionAchievementNFT nft = ICompetitionAchievementNFT(nftAddress);
        if (!nft.hasRole(nft.MINTER_ROLE(), address(this))) revert InvalidStreakAward(3);
        _requireWaterAchievement(nft, completionId);
        _requireWaterAchievement(nft, firstId);
        _requireWaterAchievement(nft, secondId);
        _requireWaterAchievement(nft, thirdId);
        streakAwardNFT = nft;
        completionAwardId = completionId;
        firstPlaceAwardId = firstId;
        secondPlaceAwardId = secondId;
        thirdPlaceAwardId = thirdId;
    }

    function configureStreakChallenge(
        uint256 compId,
        string calldata habitType,
        string calldata meetupGoal,
        uint8 requiredActivityDays,
        uint8 requiredMeetups,
        uint8 minimumWeeklyLogs,
        uint16 dailyGoal
    ) external onlyOwner whenNotPaused {
        Competition storage c = competitions[compId];
        if (c.status != CompStatus.Active || c.entrantCount != 0) revert InvalidChallengeConfiguration(7);
        if (c.stakeToken != challengeStakeToken || challengeStakeToken == address(0)) revert InvalidChallengeConfiguration(8);
        if (c.yieldEnabled || c.totalWeeks != requiredMeetups) revert InvalidChallengeConfiguration(9);
        if (bytes(habitType).length == 0 || bytes(habitType).length > 32) revert InvalidChallengeConfiguration(10);
        if (requiredActivityDays == 0 || requiredActivityDays > 30) revert InvalidChallengeConfiguration(11);
        if (requiredMeetups == 0 || requiredMeetups > MAX_MEETUPS_PER_CHALLENGE) revert InvalidChallengeConfiguration(12);
        if (minimumWeeklyLogs == 0 || minimumWeeklyLogs > MAX_WEEKLY_LOGS) revert InvalidChallengeConfiguration(13);
        if (dailyGoal == 0 || bytes(meetupGoal).length == 0) revert InvalidChallengeConfiguration(14);
        if (challengeTreasury == address(0) || address(streakAwardNFT) == address(0)) revert InvalidChallengeConfiguration(15);
        streakChallenges[compId] = StreakChallengeConfig({
            enabled: true,
            habitType: habitType,
            meetupGoal: meetupGoal,
            requiredActivityDays: requiredActivityDays,
            requiredMeetups: requiredMeetups,
            minimumWeeklyLogs: minimumWeeklyLogs,
            dailyGoal: dailyGoal,
            treasury: challengeTreasury,
            awardNFT: address(streakAwardNFT),
            completionAwardId: completionAwardId,
            firstPlaceAwardId: firstPlaceAwardId,
            secondPlaceAwardId: secondPlaceAwardId,
            thirdPlaceAwardId: thirdPlaceAwardId
        });
        emit StreakChallengeConfigured(compId, habitType, requiredActivityDays, requiredMeetups, minimumWeeklyLogs, meetupGoal);
    }

    function scheduleMeetup(uint256 compId, uint8 meetupIndex, uint64 opensAt, uint64 closesAt, bytes32 codeHash, string calldata meetingUrl) external onlyOwner whenNotPaused {
        Competition storage c = competitions[compId];
        StreakChallengeConfig storage config = streakChallenges[compId];
        if (!config.enabled || c.status != CompStatus.Active) revert InvalidMeetupAction(1);
        if (meetupIndex >= config.requiredMeetups) revert InvalidMeetupAction(2);
        if (codeHash == bytes32(0)) revert InvalidMeetupAction(3);
        if (opensAt <= block.timestamp || closesAt <= opensAt) revert InvalidMeetupAction(4);
        if (uint256(closesAt) - uint256(opensAt) > MEETUP_DURATION) revert InvalidMeetupAction(5);
        uint256 weekStart = c.startTime + uint256(meetupIndex) * 7 days;
        uint256 competitionEnd = c.startTime + (c.endTime - c.startTime);
        uint256 weekEnd = meetupIndex == config.requiredMeetups - 1 ? competitionEnd : weekStart + 7 days;
        if (weekEnd > competitionEnd) weekEnd = competitionEnd;
        if (opensAt < weekStart || closesAt > weekEnd) revert InvalidMeetupAction(6);
        if (meetups[compId][meetupIndex].configured && block.timestamp >= meetups[compId][meetupIndex].opensAt) revert InvalidMeetupAction(7);

        meetups[compId][meetupIndex] = Meetup(opensAt, closesAt, codeHash, meetingUrl, true);
        emit MeetupScheduled(compId, meetupIndex, opensAt, closesAt, codeHash, meetingUrl);
    }

    function selfCheckInMeetup(
        uint256 compId,
        uint8 meetupIndex,
        string calldata inviteCode,
        uint8 totalActivityDays,
        uint8 weeklyActivityDays,
        bool meetupGoalMet,
        bytes32 progressHash
    ) external whenNotPaused {
        Competition storage c = competitions[compId];
        StreakChallengeConfig storage config = streakChallenges[compId];
        Meetup storage meetup = meetups[compId][meetupIndex];
        uint256 entrantPosition = entrantIndex[compId][msg.sender];
        if (!config.enabled || c.status != CompStatus.Active) revert InvalidMeetupAction(8);
        if (!meetup.configured || block.timestamp < meetup.opensAt || block.timestamp > meetup.closesAt) revert InvalidMeetupAction(9);
        if (entrantPosition == 0) revert InvalidMeetupAction(10);
        Entrant storage entrant = entrants[compId][entrantPosition];
        if (entrant.status != EntrantStatus.Joined || entrant.disqualified) revert InvalidMeetupAction(11);
        if (keccak256(bytes(inviteCode)) != meetup.codeHash) revert InvalidMeetupAction(12);
        if (weeklyActivityDays < config.minimumWeeklyLogs || weeklyActivityDays > MAX_WEEKLY_LOGS) revert InvalidMeetupAction(13);
        if (totalActivityDays < entrant.verifiedActivityDays || totalActivityDays > c.totalWeeks * 7 + 2) revert InvalidMeetupAction(14);
        if (!meetupGoalMet) revert InvalidMeetupAction(15);
        if (progressHash == bytes32(0)) revert InvalidMeetupAction(16);
        if (meetupAttendance[compId][meetupIndex][msg.sender].checkedIn) revert InvalidMeetupAction(17);

        meetupAttendance[compId][meetupIndex][msg.sender] = MeetupAttendance(totalActivityDays, weeklyActivityDays, progressHash, true, false);
        emit MeetupSelfCheckedIn(compId, meetupIndex, msg.sender, totalActivityDays, progressHash);
        if (reviewArbiter.addSelfVote(compId, meetupIndex, msg.sender, c.entrantCount == 1)) {
            _approveMeetupPeer(compId, meetupIndex, msg.sender, entrantPosition);
        }
    }

    function inviteMeetupReviewer(uint256 compId, uint8 meetupIndex, address attendee, address reviewer) external onlyOwner whenNotPaused {
        MeetupAttendance storage attendance = meetupAttendance[compId][meetupIndex][attendee];
        uint256 attendeePosition = entrantIndex[compId][attendee];
        if (!streakChallenges[compId].enabled || competitions[compId].status != CompStatus.Active) revert InvalidPeerReview(1);
        if (!attendance.checkedIn || attendance.peerApproved || attendeePosition == 0 || entrants[compId][attendeePosition].disqualified) revert InvalidPeerReview(5);
        if (entrantIndex[compId][reviewer] != 0) revert InvalidPeerReview(10);
        reviewArbiter.invite(compId, meetupIndex, attendee, reviewer);
        emit MeetupReviewerInvited(compId, meetupIndex, attendee, reviewer);
    }

    function reviewPolicyVersion() external pure returns (uint8) { return 1; }

    function meetupReviewerInvited(uint256 compId, uint8 meetupIndex, address attendee, address reviewer) external view returns (bool) {
        return reviewArbiter.isInvited(compId, meetupIndex, attendee, reviewer);
    }

    function getMeetupReviewTally(uint256 compId, uint8 meetupIndex, address attendee) external view returns (uint32 approvals, uint32 rejections) {
        return reviewArbiter.tally(compId, meetupIndex, attendee);
    }

    function reviewMeetupAttendance(uint256 compId, uint8 meetupIndex, address attendee, bool attended) external whenNotPaused {
        Meetup storage meetup = meetups[compId][meetupIndex];
        uint256 reviewerPosition = entrantIndex[compId][msg.sender];
        uint256 attendeePosition = entrantIndex[compId][attendee];
        MeetupAttendance storage reviewerAttendance = meetupAttendance[compId][meetupIndex][msg.sender];
        MeetupAttendance storage attendeeAttendance = meetupAttendance[compId][meetupIndex][attendee];
        if (!streakChallenges[compId].enabled || competitions[compId].status != CompStatus.Active) revert InvalidPeerReview(1);
        if (!meetup.configured || block.timestamp < meetup.opensAt || block.timestamp > uint256(meetup.closesAt) + 1 days) revert InvalidPeerReview(2);
        if (attendee == msg.sender || attendeePosition == 0) revert InvalidPeerReview(3);
        if (reviewerPosition == 0 && !reviewArbiter.isInvited(compId, meetupIndex, attendee, msg.sender)) revert InvalidPeerReview(4);
        if (reviewerPosition != 0 && entrants[compId][reviewerPosition].status == EntrantStatus.Forfeited) revert InvalidPeerReview(4);
        if (entrants[compId][attendeePosition].status == EntrantStatus.Forfeited || entrants[compId][attendeePosition].disqualified) revert InvalidPeerReview(5);
        if (reviewerPosition != 0 && !reviewerAttendance.checkedIn) revert InvalidPeerReview(6);
        if (!attendeeAttendance.checkedIn || attendeeAttendance.peerApproved) revert InvalidPeerReview(7);
        if (meetupPeerReviewed[compId][meetupIndex][attendee][msg.sender]) revert InvalidPeerReview(8);
        meetupPeerReviewed[compId][meetupIndex][attendee][msg.sender] = true;

        uint8 decision = reviewArbiter.recordVote(compId, meetupIndex, attendee, msg.sender, attended);
        if (decision == 1) {
            _approveMeetupPeer(compId, meetupIndex, attendee, attendeePosition);
        } else if (decision == 2) {
            _rejectMeetupPeer(compId, attendeePosition);
        }
        emit MeetupPeerDecision(compId, meetupIndex, attendee, msg.sender, attended);
    }

    // ── User: Join Competition ────────────────────────────────────────────────

    /// @notice Stake tokens to join a competition.
    ///         For ETH competitions, send msg.value equal to stakeAmount.
    ///         For ERC-20 competitions, approve this contract first.
    function joinCompetition(uint256 compId) external payable nonReentrant whenNotPaused {
        Competition storage c = competitions[compId];
        require(c.status == CompStatus.Active, "Escrow: comp not active");
        require(block.timestamp <= c.joinDeadline, "Escrow: join deadline passed");
        require(entrantIndex[compId][msg.sender] == 0, "Escrow: already joined");

        if (c.stakeToken == address(0)) {
            // ETH stake
            require(msg.value == c.stakeAmount, "Escrow: incorrect ETH amount");
        } else {
            // ERC-20 stake
            require(msg.value == 0, "Escrow: do not send ETH for token comp");
            IERC20(c.stakeToken).safeTransferFrom(msg.sender, address(this), c.stakeAmount);
        }

        c.entrantCount++;
        uint256 idx = c.entrantCount; // 1-indexed
        entrants[compId][idx] = Entrant({
            addr: msg.sender,
            reportsSubmitted: 0,
            verifiedActivityDays: 0,
            qualifiedAt: 0,
            verifiedMeetups: 0,
            place: 0,
            status: EntrantStatus.Joined,
            disqualified: false
        });
        entrantIndex[compId][msg.sender] = idx;
        c.potBalance += c.stakeAmount;

        emit EntrantJoined(compId, msg.sender, c.stakeAmount);
    }

    // ── User: Weekly Self-Report ──────────────────────────────────────────────

    /// @notice Submit a weekly self-report for the given competition.
    /// @param compId    Competition ID.
    /// @param proofCID  IPFS CID of the proof / progress snapshot.
    function submitReport(uint256 compId, string calldata proofCID) external whenNotPaused {
        Competition storage c = competitions[compId];
        require(c.status == CompStatus.Active, "Escrow: comp not active");

        uint256 idx = entrantIndex[compId][msg.sender];
        require(idx != 0, "Escrow: not an entrant");

        Entrant storage e = entrants[compId][idx];
        require(e.status == EntrantStatus.Joined, "Escrow: already completed or forfeited");
        require(e.reportsSubmitted < c.totalWeeks, "Escrow: all reports already filed");

        e.reportsSubmitted++;

        emit WeeklyReport(compId, msg.sender, e.reportsSubmitted, proofCID);

        // Auto-complete if all weeks are reported
        if (e.reportsSubmitted == c.totalWeeks && !streakChallenges[compId].enabled) {
            e.status = EntrantStatus.Completed;
            c.winnerCount++;
            emit EntrantCompleted(compId, msg.sender);
        }
    }

    // ── User: Forfeit ─────────────────────────────────────────────────────────

    /// @notice Voluntarily forfeit your stake. Stake stays in the pot for winners.
    function forfeit(uint256 compId) external whenNotPaused {
        Competition storage c = competitions[compId];
        require(c.status == CompStatus.Active, "Escrow: comp not active");

        uint256 idx = entrantIndex[compId][msg.sender];
        require(idx != 0, "Escrow: not an entrant");

        Entrant storage e = entrants[compId][idx];
        require(e.status == EntrantStatus.Joined, "Escrow: already completed or forfeited");

        e.status = EntrantStatus.Forfeited;

        emit EntrantForfeited(compId, msg.sender);
    }

    // ── Admin: Deploy Pot to Aave ─────────────────────────────────────────────

    /// @notice Deploy the competition pot to Aave V3 for yield.
    ///         Only works for ERC-20 competitions with yieldEnabled.
    function deployToAave(uint256 compId) external onlyOwner whenNotPaused {
        Competition storage c = competitions[compId];
        require(c.status == CompStatus.Active, "Escrow: comp not active");
        require(c.yieldEnabled, "Escrow: yield not enabled");
        require(c.stakeToken != address(0), "Escrow: ETH yield not supported");
        require(c.potBalance > 0, "Escrow: no pot to deploy");
        require(!c.potDeployed, "Escrow: pot already deployed to Aave");

        uint256 index = IAavePool(aavePool).getReserveNormalizedIncome(c.stakeToken);
        require(index > 0, "Escrow: invalid Aave index");

        c.potDeployed = true;
        deployedPotCount++;
        aaveScaledBalance[compId] = (c.potBalance * RAY) / index;

        IERC20(c.stakeToken).forceApprove(aavePool, c.potBalance);
        IAavePool(aavePool).supply(c.stakeToken, c.potBalance, address(this), 0);
    }

    /// @notice Withdraw this competition's pot (plus its share of yield) from Aave V3.
    ///         Updates potBalance to include any earned yield so it is distributed on settle.
    ///         The competition's share is tracked as a scaled balance so yield is attributed
    ///         per competition even when several pots share the same aToken balance.
    function withdrawFromAave(uint256 compId) external onlyOwner nonReentrant whenNotPaused {
        Competition storage c = competitions[compId];
        require(c.stakeToken != address(0), "Escrow: ETH yield not supported");
        require(c.yieldEnabled, "Escrow: yield not enabled");
        require(c.potDeployed, "Escrow: pot not deployed to Aave");

        uint256 index = IAavePool(aavePool).getReserveNormalizedIncome(c.stakeToken);
        uint256 amount = (aaveScaledBalance[compId] * index) / RAY;

        c.potDeployed = false;
        deployedPotCount--;
        aaveScaledBalance[compId] = 0;

        uint256 originalPot = c.potBalance;
        uint256 withdrawn = IAavePool(aavePool).withdraw(c.stakeToken, amount, address(this));
        c.potBalance = withdrawn;

        emit AaveYieldCaptured(compId, withdrawn, originalPot);
    }

    // ── Admin: Settle Competition ─────────────────────────────────────────────

    /// @notice Settle the competition: distribute pot + yield to winners equally.
    ///         Any non-completed entrant is auto-forfeited.
    /// @param compId         Competition ID to settle.
    /// @param leaderboardCID IPFS CID of the final leaderboard / stats.
    function settleCompetition(
        uint256 compId,
        string calldata leaderboardCID
    ) external onlyOwner nonReentrant whenNotPaused {
        Competition storage c = competitions[compId];
        require(c.status == CompStatus.Active, "Escrow: comp not active");
        require(block.timestamp >= c.endTime, "Escrow: comp has not ended yet");
        require(!c.potDeployed, "Escrow: withdraw pot from Aave first");

        // Auto-forfeit anyone who didn't complete
        for (uint256 i = 1; i <= c.entrantCount; i++) {
            if (entrants[compId][i].status == EntrantStatus.Joined) {
                entrants[compId][i].status = EntrantStatus.Forfeited;
                emit EntrantForfeited(compId, entrants[compId][i].addr);
            }
        }

        if (streakChallenges[compId].enabled) {
            _settleStreakCompetition(compId, c, leaderboardCID);
            return;
        }

        c.status = CompStatus.Settled;

        // Use the tracked potBalance so multi-competition accounting is safe.
        uint256 totalToDistribute = c.potBalance;

        if (c.winnerCount > 0 && totalToDistribute > 0) {
            uint256 share = totalToDistribute / c.winnerCount;
            uint256 distributed = 0;
            for (uint256 i = 1; i <= c.entrantCount; i++) {
                if (entrants[compId][i].status == EntrantStatus.Completed) {
                    _transferOut(c.stakeToken, entrants[compId][i].addr, share);
                    distributed += share;
                    emit WinningsDistributed(compId, entrants[compId][i].addr, share);
                }
            }
            // Send any dust remainder to the contract owner
            uint256 dust = totalToDistribute - distributed;
            if (dust > 0) {
                _transferOut(c.stakeToken, owner(), dust);
            }
        }

        // Zero out pot so it cannot be double-claimed
        c.potBalance = 0;

        emit CompetitionSettled(compId, c.winnerCount, totalToDistribute, leaderboardCID);
    }

    // ── Admin: Cancel Competition ─────────────────────────────────────────────

    /// @notice Cancel a competition and refund all entrants their stake.
    function cancelCompetition(uint256 compId) external onlyOwner nonReentrant whenNotPaused {
        Competition storage c = competitions[compId];
        require(c.status == CompStatus.Active, "Escrow: comp not active");
        require(!c.potDeployed, "Escrow: withdraw pot from Aave first");

        c.status = CompStatus.Cancelled;

        uint256 remaining = c.potBalance;
        c.potBalance = 0;

        // Refund every entrant who hasn't forfeited
        for (uint256 i = 1; i <= c.entrantCount; i++) {
            Entrant storage e = entrants[compId][i];
            if (e.status != EntrantStatus.Forfeited) {
                // Aave index rounding can return a pot 1 wei short; never refund more than is held.
                uint256 refund = c.stakeAmount < remaining ? c.stakeAmount : remaining;
                remaining -= refund;
                if (refund > 0) _transferOut(c.stakeToken, e.addr, refund);
            }
        }

        // Forfeited stakes (and any yield) go to the owner instead of being stranded.
        if (remaining > 0) {
            _transferOut(c.stakeToken, owner(), remaining);
        }

        emit CompetitionCancelled(compId);
    }

    // ── Admin: Update Aave Pool ───────────────────────────────────────────────

    /// @notice Update the Aave V3 Pool address (e.g. after migration).
    ///         Blocked while any pot is supplied to the current pool.
    function setAavePool(address _aavePool) external onlyOwner whenNotPaused {
        require(_aavePool != address(0), "Escrow: zero Aave pool");
        require(deployedPotCount == 0, "Escrow: pots still deployed to Aave");
        require(_aavePool.code.length > 0, "Escrow: Aave pool has no code");
        emit AavePoolUpdated(aavePool, _aavePool);
        aavePool = _aavePool;
    }

    // ── Admin: Pause / Unpause ────────────────────────────────────────────────

    /// @notice Pause all user and admin actions (emergency stop).
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the contract after an emergency.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ── View Functions ────────────────────────────────────────────────────────

    /// @notice Returns competition details as a struct (avoids stack-too-deep).
    function getCompetition(uint256 compId) external view returns (Competition memory) {
        return competitions[compId];
    }

    /// @notice Returns entrant details for a given competition and entrant address.
    function getEntrant(uint256 compId, address addr) external view returns (
        bool    joined,
        uint256 reportsSubmitted,
        EntrantStatus status
    ) {
        uint256 idx = entrantIndex[compId][addr];
        if (idx == 0) return (false, 0, EntrantStatus.Joined); // not joined
        Entrant storage e = entrants[compId][idx];
        return (true, e.reportsSubmitted, e.status);
    }

    function getStreakEntrant(uint256 compId, address addr) external view returns (
        bool joined,
        uint256 reportsSubmitted,
        uint8 verifiedMeetups,
        uint8 verifiedActivityDays,
        uint8 place,
        uint64 qualifiedAt,
        bool disqualified,
        EntrantStatus status
    ) {
        uint256 idx = entrantIndex[compId][addr];
        if (idx == 0) return (false, 0, 0, 0, 0, 0, false, EntrantStatus.Joined);
        Entrant storage e = entrants[compId][idx];
        return (true, e.reportsSubmitted, e.verifiedMeetups, uint8(e.verifiedActivityDays), e.place, e.qualifiedAt, e.disqualified, e.status);
    }

    function getStreakChallenge(uint256 compId) external view returns (
        bool enabled,
        string memory habitType,
        string memory meetupGoal,
        uint8 requiredActivityDays,
        uint8 requiredMeetups,
        uint8 minimumWeeklyLogs,
        uint16 dailyGoal
    ) {
        StreakChallengeConfig storage config = streakChallenges[compId];
        return (config.enabled, config.habitType, config.meetupGoal, config.requiredActivityDays, config.requiredMeetups, config.minimumWeeklyLogs, config.dailyGoal);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _refreshStreakCompletion(uint256 compId, address account, Entrant storage entrant, Competition storage competition, StreakChallengeConfig storage config) private {
        if (
            entrant.status == EntrantStatus.Joined &&
            !entrant.disqualified &&
            entrant.verifiedMeetups >= config.requiredMeetups &&
            entrant.verifiedActivityDays >= config.requiredActivityDays
        ) {
            entrant.status = EntrantStatus.Completed;
            entrant.qualifiedAt = uint64(block.timestamp);
            competition.winnerCount++;
            emit EntrantCompleted(compId, account);
            emit MonthlyChallengeCompleted(compId, account, uint8(entrant.verifiedActivityDays), entrant.verifiedMeetups);
        }
    }

    function _settleStreakCompetition(uint256 compId, Competition storage competition, string calldata leaderboardCID) private {
        StreakChallengeConfig storage config = streakChallenges[compId];
        competition.status = CompStatus.Settled;
        uint256 totalPot = competition.potBalance;
        uint256 first;
        uint256 second;
        uint256 third;

        for (uint256 i = 1; i <= competition.entrantCount; i++) {
            if (entrants[compId][i].status != EntrantStatus.Completed) continue;
            if (_streakRankBefore(compId, i, first)) {
                third = second;
                second = first;
                first = i;
            } else if (_streakRankBefore(compId, i, second)) {
                third = second;
                second = i;
            } else if (_streakRankBefore(compId, i, third)) {
                third = i;
            }
        }

        if (competition.winnerCount == 0) {
            if (totalPot > 0) IERC20(competition.stakeToken).safeTransfer(config.treasury, totalPot);
            competition.potBalance = 0;
            emit CompetitionSettled(compId, 0, totalPot, leaderboardCID);
            return;
        }

        (uint256 baseRefundTotal, uint256 totalWeight) = _assignStreakPlaces(compId, first, second, third);
        uint256 bonusPool = totalPot - baseRefundTotal;
        uint256 distributed = _distributeStreakPayouts(compId, config, bonusPool, totalWeight);
        uint256 dust = totalPot - distributed;
        if (dust > 0) IERC20(competition.stakeToken).safeTransfer(config.treasury, dust);
        competition.potBalance = 0;
        emit CompetitionSettled(compId, competition.winnerCount, totalPot, leaderboardCID);
    }

    function _assignStreakPlaces(uint256 compId, uint256 first, uint256 second, uint256 third) private returns (uint256 baseRefundTotal, uint256 totalWeight) {
        Competition storage competition = competitions[compId];
        for (uint256 i = 1; i <= competition.entrantCount; i++) {
            Entrant storage entrant = entrants[compId][i];
            if (entrant.status != EntrantStatus.Completed) continue;
            entrant.place = i == first ? 1 : i == second ? 2 : i == third ? 3 : 0;
            baseRefundTotal += entrant.place == 3 ? competition.stakeAmount / 2 : competition.stakeAmount;
            totalWeight += entrant.place == 1 ? 3 : entrant.place == 2 ? 2 : 1;
        }
    }

    function _distributeStreakPayouts(uint256 compId, StreakChallengeConfig storage config, uint256 bonusPool, uint256 totalWeight) private returns (uint256 distributed) {
        Competition storage competition = competitions[compId];
        for (uint256 i = 1; i <= competition.entrantCount; i++) {
            Entrant storage entrant = entrants[compId][i];
            if (entrant.status == EntrantStatus.Completed) {
                distributed += _payStreakEntrant(compId, entrant, config, bonusPool, totalWeight);
            }
        }
    }

    function _streakRankBefore(uint256 compId, uint256 candidateIndex, uint256 currentIndex) private view returns (bool) {
        if (currentIndex == 0) return true;
        Entrant storage candidate = entrants[compId][candidateIndex];
        Entrant storage current = entrants[compId][currentIndex];
        if (candidate.verifiedActivityDays != current.verifiedActivityDays) return candidate.verifiedActivityDays > current.verifiedActivityDays;
        if (candidate.reportsSubmitted != current.reportsSubmitted) return candidate.reportsSubmitted > current.reportsSubmitted;
        if (candidate.qualifiedAt != current.qualifiedAt) return candidate.qualifiedAt < current.qualifiedAt;
        return candidateIndex < currentIndex;
    }

    function _payStreakEntrant(
        uint256 compId,
        Entrant storage entrant,
        StreakChallengeConfig storage config,
        uint256 bonusPool,
        uint256 totalWeight
    ) private returns (uint256 payout) {
        uint256 baseRefund = entrant.place == 3 ? competitions[compId].stakeAmount / 2 : competitions[compId].stakeAmount;
        uint256 weight = entrant.place == 1 ? 3 : entrant.place == 2 ? 2 : 1;
        uint256 bonus = bonusPool * weight / totalWeight;
        payout = baseRefund + bonus;
        ICompetitionAchievementNFT nft = ICompetitionAchievementNFT(config.awardNFT);
        nft.mintAchievement(entrant.addr, config.completionAwardId, 1);
        if (entrant.place == 1) nft.mintAchievement(entrant.addr, config.firstPlaceAwardId, 1);
        if (entrant.place == 2) nft.mintAchievement(entrant.addr, config.secondPlaceAwardId, 1);
        if (entrant.place == 3) nft.mintAchievement(entrant.addr, config.thirdPlaceAwardId, 1);
        _transferOut(competitions[compId].stakeToken, entrant.addr, payout);
        emit StreakPayout(compId, entrant.addr, entrant.place, baseRefund, bonus, payout);
        emit WinningsDistributed(compId, entrant.addr, payout);
    }

    function _approveMeetupPeer(uint256 compId, uint8 meetupIndex, address attendee, uint256 attendeePosition) private {
        MeetupAttendance storage attendance = meetupAttendance[compId][meetupIndex][attendee];
        if (attendance.peerApproved) return;
        Entrant storage entrant = entrants[compId][attendeePosition];
        Competition storage competition = competitions[compId];
        attendance.peerApproved = true;
        entrant.verifiedMeetups++;
        entrant.verifiedActivityDays = attendance.totalActivityDays;
        _refreshStreakCompletion(compId, attendee, entrant, competition, streakChallenges[compId]);
    }

    function _rejectMeetupPeer(uint256 compId, uint256 attendeePosition) private {
        Entrant storage entrant = entrants[compId][attendeePosition];
        if (entrant.status == EntrantStatus.Completed) competitions[compId].winnerCount--;
        entrant.disqualified = true;
        entrant.status = EntrantStatus.Forfeited;
    }

    function _requireWaterAchievement(ICompetitionAchievementNFT nft, uint256 tokenId) private view {
        if (nft.creatorOf(tokenId) == address(0)) revert InvalidStreakAward(4);
        if (nft.kindOf(tokenId) != 1) revert InvalidStreakAward(5);
        if (nft.maxSupply(tokenId) != 0) revert InvalidStreakAward(6);
    }

    function _transferOut(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok, ) = payable(to).call{value: amount}("");
            require(ok, "Escrow: ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /// @notice Accept ETH deposits (for ETH competitions).
    receive() external payable {}
}
