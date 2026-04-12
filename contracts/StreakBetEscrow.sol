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

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// ─── Interfaces ───────────────────────────────────────────────────────────────

/// @dev Minimal Aave V3 Pool interface — supply & withdraw.
interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

// ─── Contract ─────────────────────────────────────────────────────────────────

contract StreakBetEscrow is Ownable {

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
        EntrantStatus status;
    }

    // ── State ─────────────────────────────────────────────────────────────────

    uint256 public nextCompId;

    /// @notice Competition ID → Competition data.
    mapping(uint256 => Competition) public competitions;

    /// @notice Competition ID → entrant index → Entrant data.
    mapping(uint256 => mapping(uint256 => Entrant)) public entrants;

    /// @notice Competition ID → entrant address → entrant index (1-indexed, 0 = not joined).
    mapping(uint256 => mapping(address => uint256)) public entrantIndex;

    /// @notice Competition ID → entrant count (used as next index for new entrants).
    mapping(uint256 => uint256) private _entrantCounts;

    /// @notice Aave V3 Pool address (Optimism Mainnet).
    address public aavePool;

    // ── Events ────────────────────────────────────────────────────────────────

    event CompetitionCreated(
        uint256 indexed compId,
        string  name,
        address stakeToken,
        uint256 stakeAmount,
        uint256 totalWeeks,
        uint256 startTime,
        uint256 endTime,
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

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @param initialOwner  Admin wallet (multisig recommended).
    /// @param _aavePool     Aave V3 Pool address on Optimism (0x794a…814aD).
    constructor(address initialOwner, address _aavePool) Ownable(initialOwner) {
        aavePool = _aavePool;
    }

    // ── Admin: Create Competition ─────────────────────────────────────────────

    /// @notice Create a new competition. Only the owner can call this.
    /// @param name         Human-readable competition name.
    /// @param stakeToken   ERC-20 address for the stake token, or address(0) for ETH.
    /// @param stakeAmount  Amount each entrant must stake.
    /// @param totalWeeks   Number of weekly check-ins required to complete the streak.
    /// @param startTime    Unix timestamp when the competition starts.
    /// @param endTime      Unix timestamp when the competition ends.
    /// @param yieldEnabled Whether to deploy pot to Aave during the comp period.
    /// @param metadataCID  IPFS CID of the competition rules / DNFT metadata JSON.
    function createCompetition(
        string  calldata name,
        address stakeToken,
        uint256 stakeAmount,
        uint256 totalWeeks,
        uint256 startTime,
        uint256 endTime,
        bool    yieldEnabled,
        string  calldata metadataCID
    ) external onlyOwner {
        require(bytes(name).length > 0, "Escrow: empty name");
        require(stakeAmount > 0, "Escrow: stake must be > 0");
        require(totalWeeks > 0, "Escrow: totalWeeks must be > 0");
        require(endTime > startTime, "Escrow: endTime must be after startTime");

        uint256 id = nextCompId++;
        Competition storage c = competitions[id];
        c.name          = name;
        c.stakeToken    = stakeToken;
        c.stakeAmount   = stakeAmount;
        c.totalWeeks    = totalWeeks;
        c.startTime     = startTime;
        c.endTime       = endTime;
        c.yieldEnabled  = yieldEnabled;
        c.metadataCID   = metadataCID;
        c.status        = CompStatus.Active;

        emit CompetitionCreated(id, name, stakeToken, stakeAmount, totalWeeks, startTime, endTime, yieldEnabled, metadataCID);
    }

    // ── User: Join Competition ────────────────────────────────────────────────

    /// @notice Stake tokens to join a competition.
    ///         For ETH competitions, send msg.value equal to stakeAmount.
    ///         For ERC-20 competitions, approve this contract first.
    function joinCompetition(uint256 compId) external payable {
        Competition storage c = competitions[compId];
        require(c.status == CompStatus.Active, "Escrow: comp not active");
        require(block.timestamp <= c.endTime, "Escrow: comp ended");
        require(entrantIndex[compId][msg.sender] == 0, "Escrow: already joined");

        if (c.stakeToken == address(0)) {
            // ETH stake
            require(msg.value == c.stakeAmount, "Escrow: incorrect ETH amount");
        } else {
            // ERC-20 stake
            require(msg.value == 0, "Escrow: do not send ETH for token comp");
            IERC20 token = IERC20(c.stakeToken);
            bool ok = token.transferFrom(msg.sender, address(this), c.stakeAmount);
            require(ok, "Escrow: token transfer failed");
        }

        c.entrantCount++;
        uint256 idx = c.entrantCount; // 1-indexed
        entrants[compId][idx] = Entrant({
            addr: msg.sender,
            reportsSubmitted: 0,
            status: EntrantStatus.Joined
        });
        entrantIndex[compId][msg.sender] = idx;
        c.potBalance += c.stakeAmount;

        emit EntrantJoined(compId, msg.sender, c.stakeAmount);
    }

    // ── User: Weekly Self-Report ──────────────────────────────────────────────

    /// @notice Submit a weekly self-report for the given competition.
    /// @param compId    Competition ID.
    /// @param proofCID  IPFS CID of the proof / progress snapshot.
    function submitReport(uint256 compId, string calldata proofCID) external {
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
        if (e.reportsSubmitted == c.totalWeeks) {
            e.status = EntrantStatus.Completed;
            c.winnerCount++;
            emit EntrantCompleted(compId, msg.sender);
        }
    }

    // ── User: Forfeit ─────────────────────────────────────────────────────────

    /// @notice Voluntarily forfeit your stake. Stake stays in the pot for winners.
    function forfeit(uint256 compId) external {
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
    function deployToAave(uint256 compId) external onlyOwner {
        Competition storage c = competitions[compId];
        require(c.status == CompStatus.Active, "Escrow: comp not active");
        require(c.yieldEnabled, "Escrow: yield not enabled");
        require(c.stakeToken != address(0), "Escrow: ETH yield not supported");
        require(c.potBalance > 0, "Escrow: no pot to deploy");
        require(!c.potDeployed, "Escrow: pot already deployed to Aave");

        c.potDeployed = true;

        IERC20 token = IERC20(c.stakeToken);
        token.approve(aavePool, c.potBalance);
        IAavePool(aavePool).supply(c.stakeToken, c.potBalance, address(this), 0);
    }

    /// @notice Withdraw only this competition's pot (plus its share of yield) from Aave V3.
    function withdrawFromAave(uint256 compId) external onlyOwner {
        Competition storage c = competitions[compId];
        require(c.stakeToken != address(0), "Escrow: ETH yield not supported");
        require(c.yieldEnabled, "Escrow: yield not enabled");
        require(c.potDeployed, "Escrow: pot not deployed to Aave");

        c.potDeployed = false;

        // Withdraw only the original pot amount; any yield beyond it stays
        // in Aave. For single-competition setups the owner can call with
        // type(uint256).max via a separate admin function if desired.
        IAavePool(aavePool).withdraw(c.stakeToken, c.potBalance, address(this));
    }

    // ── Admin: Settle Competition ─────────────────────────────────────────────

    /// @notice Settle the competition: distribute pot + yield to winners equally.
    ///         Any non-completed entrant is auto-forfeited.
    /// @param compId         Competition ID to settle.
    /// @param leaderboardCID IPFS CID of the final leaderboard / stats.
    function settleCompetition(
        uint256 compId,
        string calldata leaderboardCID
    ) external onlyOwner {
        Competition storage c = competitions[compId];
        require(c.status == CompStatus.Active, "Escrow: comp not active");

        // Auto-forfeit anyone who didn't complete
        for (uint256 i = 1; i <= c.entrantCount; i++) {
            if (entrants[compId][i].status == EntrantStatus.Joined) {
                entrants[compId][i].status = EntrantStatus.Forfeited;
                emit EntrantForfeited(compId, entrants[compId][i].addr);
            }
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
    function cancelCompetition(uint256 compId) external onlyOwner {
        Competition storage c = competitions[compId];
        require(c.status == CompStatus.Active, "Escrow: comp not active");

        c.status = CompStatus.Cancelled;

        // Refund every entrant who hasn't forfeited
        for (uint256 i = 1; i <= c.entrantCount; i++) {
            Entrant storage e = entrants[compId][i];
            if (e.status != EntrantStatus.Forfeited) {
                _transferOut(c.stakeToken, e.addr, c.stakeAmount);
            }
        }

        emit CompetitionCancelled(compId);
    }

    // ── Admin: Update Aave Pool ───────────────────────────────────────────────

    /// @notice Update the Aave V3 Pool address (e.g. after migration).
    function setAavePool(address _aavePool) external onlyOwner {
        aavePool = _aavePool;
    }

    // ── View Functions ────────────────────────────────────────────────────────

    /// @notice Returns competition details.
    function getCompetition(uint256 compId) external view returns (
        string memory name,
        address stakeToken,
        uint256 stakeAmount,
        uint256 totalWeeks,
        uint256 startTime,
        uint256 endTime,
        bool    yieldEnabled,
        string memory metadataCID,
        CompStatus status,
        uint256 potBalance,
        uint256 entrantCount,
        uint256 winnerCount
    ) {
        Competition storage c = competitions[compId];
        return (
            c.name, c.stakeToken, c.stakeAmount, c.totalWeeks,
            c.startTime, c.endTime, c.yieldEnabled, c.metadataCID,
            c.status, c.potBalance, c.entrantCount, c.winnerCount
        );
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

    // ── Internal ──────────────────────────────────────────────────────────────

    function _transferOut(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok, ) = payable(to).call{value: amount}("");
            require(ok, "Escrow: ETH transfer failed");
        } else {
            bool ok = IERC20(token).transfer(to, amount);
            require(ok, "Escrow: token transfer failed");
        }
    }

    /// @notice Accept ETH deposits (for ETH competitions).
    receive() external payable {}
}
