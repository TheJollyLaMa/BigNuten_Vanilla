// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BigNuten Treasury & Contributor Payout Contract
/// @author TheJollyLaMa
/// @notice Holds the $BNUT token reserve and pays out contributors for
///         completing GitHub issues tagged with bounty amounts, and rewards
///         users who opt in to share their anonymized health data.
///         Related issues: #39 (deploy), #45 (bounty bot integration), #49 (data sharing).
/// @dev The owner is the deployer (multisig recommended for production).
///      Only the owner can trigger payouts or emergency withdrawals.
///      Integrates with the bounty-payout GitHub Actions workflow and the
///      in-app data sharing opt-in reward flow.

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BigNutenTreasury is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice The $BNUT ERC-20 token managed by this treasury.
    IERC20 public immutable bnutToken;

    /// @notice Cumulative BNUT rewarded to each address for data sharing.
    mapping(address => uint256) public dataSharingRewards;

    /// @notice Double-pay guard: true if the given GitHub issue reference has
    ///         already been settled via payContributor or batchPayContributors.
    mapping(string => bool) public issuePaid;

    /// @notice Canonical on-chain total BNUT paid out to each contributor
    ///         across all bounty payouts (does not include data-sharing rewards).
    mapping(address => uint256) public totalPaid;

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when a contributor receives a BNUT bounty payout.
    /// @param contributor Wallet address of the contributor being paid.
    /// @param amount      BNUT amount transferred (18 decimals).
    /// @param issueRef    GitHub issue reference, e.g. "TheJollyLaMa/BigNuten_Vanilla#45".
    event ContributorPaid(
        address indexed contributor,
        uint256 amount,
        string issueRef
    );

    /// @notice Emitted when the owner withdraws tokens from the treasury.
    /// @param to     Destination address for the withdrawn tokens.
    /// @param amount Amount withdrawn (18 decimals).
    event TokensWithdrawn(address indexed to, uint256 amount);

    /// @notice Emitted when a user receives a BNUT reward for sharing health data.
    /// @param user    Wallet address of the rewarded user.
    /// @param amount  BNUT amount transferred (18 decimals).
    /// @param ref     Human-readable reference, e.g. "data-sharing:week:4" or "data-sharing:streak:1month".
    event DataSharingRewarded(
        address indexed user,
        uint256 amount,
        string ref
    );

    /// @notice Emitted when the owner recovers a non-BNUT token sent here by mistake.
    event TokenRecovered(address indexed token, address indexed to, uint256 amount);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @notice Sets the BNUT token address and the initial contract owner.
    /// @param _bnutToken    Address of the deployed BigNuten ERC-20 contract.
    /// @param initialOwner  Address that will own this treasury (multisig recommended).
    constructor(address _bnutToken, address initialOwner) Ownable(initialOwner) {
        require(_bnutToken != address(0), "Treasury: zero token address");
        bnutToken = IERC20(_bnutToken);
    }

    // ─── Owner-Only Functions ─────────────────────────────────────────────────

    /// @notice Transfers BNUT to a contributor as a bounty for a completed issue.
    ///         Called by the GitHub Actions bounty-payout workflow after manual
    ///         approval by TheJollyLaMa.
    /// @dev    Reverts if the treasury balance is insufficient.
    /// @param contributor Wallet address of the contributor to pay.
    /// @param amount      BNUT amount to send (18 decimals).
    /// @param issueRef    Human-readable GitHub issue reference for auditability.
    function payContributor(
        address contributor,
        uint256 amount,
        string memory issueRef
    ) external onlyOwner whenNotPaused nonReentrant {
        _validateContributorPayout(contributor, amount, issueRef);
        require(bnutToken.balanceOf(address(this)) >= amount,"Treasury: insufficient BNUT balance");

        issuePaid[issueRef] = true;
        totalPaid[contributor] += amount;

        bnutToken.safeTransfer(contributor, amount);

        emit ContributorPaid(contributor, amount, issueRef);
    }

    /// @notice Batch payout — pays multiple contributors in a single transaction.
    ///         Useful for the weekly payroll-settlement flow where the owner
    ///         clicks "Settle Payroll" in the UI and all queued payouts are
    ///         processed at once without storing a private key in CI.
    /// @param contributors  Wallet addresses of contributors to pay.
    /// @param amounts       BNUT amounts to send (18 decimals), one per contributor.
    /// @param issueRefs     GitHub issue references for auditability, one per entry.
    function batchPayContributors(
        address[] calldata contributors,
        uint256[] calldata amounts,
        string[]  calldata issueRefs
    ) external onlyOwner whenNotPaused nonReentrant {
        require(
            contributors.length == amounts.length &&
            amounts.length      == issueRefs.length,
            "Treasury: array length mismatch"
        );

        uint256 totalRequired = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalRequired += amounts[i];
        }
        require(
            bnutToken.balanceOf(address(this)) >= totalRequired,
            "Treasury: insufficient BNUT balance"
        );

        for (uint256 i = 0; i < contributors.length; i++) {
            // issuePaid is set before the next iteration, so duplicate refs in one batch revert.
            _validateContributorPayout(contributors[i], amounts[i], issueRefs[i]);

            issuePaid[issueRefs[i]] = true;
            totalPaid[contributors[i]] += amounts[i];

            bnutToken.safeTransfer(contributors[i], amounts[i]);

            emit ContributorPaid(contributors[i], amounts[i], issueRefs[i]);
        }
    }

    /// @notice Emergency withdrawal — sends BNUT back to the owner.
    ///         Use only if funds need to be moved (e.g. contract migration).
    ///         Intentionally allowed while paused so funds can always be rescued.
    /// @param amount BNUT amount to withdraw (18 decimals).
    function withdrawTokens(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Treasury: amount must be > 0");
        require(
            bnutToken.balanceOf(address(this)) >= amount,
            "Treasury: insufficient BNUT balance"
        );

        bnutToken.safeTransfer(owner(), amount);

        emit TokensWithdrawn(owner(), amount);
    }

    /// @notice Recover a non-BNUT ERC-20 sent to the treasury by mistake.
    /// @param token  ERC-20 address (must not be the BNUT token).
    /// @param amount Amount to send to the owner.
    function recoverToken(address token, uint256 amount) external onlyOwner nonReentrant {
        require(token != address(bnutToken), "Treasury: use withdrawTokens for BNUT");
        require(amount > 0, "Treasury: amount must be > 0");
        IERC20(token).safeTransfer(owner(), amount);
        emit TokenRecovered(token, owner(), amount);
    }

    /// @notice Pause all payouts and rewards (emergency stop).
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume payouts and rewards.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Reward a user with BNUT for opting in and sharing anonymised health data.
    ///         Called by the owner after verifying opt-in status in the app.
    ///         Emits DataSharingRewarded so the payout is traceable on-chain.
    /// @param user    Wallet address of the user to reward.
    /// @param amount  BNUT amount to send (18 decimals).
    /// @param ref     Human-readable reference describing the reward, e.g.
    ///                "data-sharing:optin", "data-sharing:week:4", or
    ///                "data-sharing:streak:1month".
    function rewardDataSharing(
        address user,
        uint256 amount,
        string calldata ref
    ) external onlyOwner whenNotPaused nonReentrant {
        require(user != address(0), "Treasury: zero user address");
        require(amount > 0, "Treasury: amount must be > 0");
        require(
            bnutToken.balanceOf(address(this)) >= amount,
            "Treasury: insufficient BNUT balance"
        );

        dataSharingRewards[user] += amount;

        bnutToken.safeTransfer(user, amount);

        emit DataSharingRewarded(user, amount, ref);
    }

    /// @notice Batch reward multiple users for data sharing in a single transaction.
    /// @param users   Wallet addresses of users to reward.
    /// @param amounts BNUT amounts to send (18 decimals), one per user.
    /// @param refs    Human-readable references, one per user.
    function batchRewardDataSharing(
        address[] calldata users,
        uint256[] calldata amounts,
        string[]  calldata refs
    ) external onlyOwner whenNotPaused nonReentrant {
        require(
            users.length == amounts.length &&
            amounts.length == refs.length,
            "Treasury: array length mismatch"
        );

        // Pre-check: treasury must hold enough BNUT for the entire batch.
        uint256 totalRequired = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "Treasury: amount must be > 0");
            totalRequired += amounts[i];
        }
        require(
            bnutToken.balanceOf(address(this)) >= totalRequired,
            "Treasury: insufficient BNUT balance for batch"
        );

        for (uint256 i = 0; i < users.length; i++) {
            require(users[i] != address(0), "Treasury: zero user address");

            dataSharingRewards[users[i]] += amounts[i];

            bnutToken.safeTransfer(users[i], amounts[i]);

            emit DataSharingRewarded(users[i], amounts[i], refs[i]);
        }
    }

    function _validateContributorPayout(address contributor, uint256 amount, string memory issueRef) private view {
        require(contributor != address(0), "Treasury: zero contributor address");
        require(amount > 0, "Treasury: amount must be > 0");
        require(bytes(issueRef).length > 0, "Treasury: issue ref required");
        require(!issuePaid[issueRef], "Treasury: issue already paid");
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /// @notice Returns the current BNUT balance held by this treasury contract.
    /// @return balance The BNUT balance in wei (18 decimals).
    function getBalance() public view returns (uint256 balance) {
        return bnutToken.balanceOf(address(this));
    }

    /// @notice Returns the total BNUT rewarded to a user for data sharing.
    /// @param user Wallet address to query.
    /// @return total Cumulative BNUT rewarded to that address (18 decimals).
    function getDataSharingRewards(address user) public view returns (uint256 total) {
        return dataSharingRewards[user];
    }

    /// @notice Returns the total BNUT paid to a contributor across all bounty payouts.
    /// @param contributor Wallet address to query.
    /// @return total Cumulative BNUT paid to that address (18 decimals).
    function getTotalPaid(address contributor) public view returns (uint256 total) {
        return totalPaid[contributor];
    }

    /// @notice Returns whether the given GitHub issue reference has already been paid.
    /// @param issueRef GitHub issue reference, e.g. "TheJollyLaMa/BigNuten_Vanilla#45".
    /// @return paid True if the issue has been settled.
    function isIssuePaid(string calldata issueRef) public view returns (bool paid) {
        return issuePaid[issueRef];
    }
}
