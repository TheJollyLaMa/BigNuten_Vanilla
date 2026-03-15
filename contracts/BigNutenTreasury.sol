// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BigNuten Treasury & Contributor Payout Contract
/// @author TheJollyLaMa
/// @notice Holds the $BNUT token reserve and pays out contributors for
///         completing GitHub issues tagged with bounty amounts.
///         Related issues: #39 (deploy), #45 (bounty bot integration).
/// @dev The owner is the deployer (multisig recommended for production).
///      Only the owner can trigger payouts or emergency withdrawals.
///      Integrates with the bounty-payout GitHub Actions workflow.

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BigNutenTreasury is Ownable {
    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice The $BNUT ERC-20 token managed by this treasury.
    IERC20 public immutable bnutToken;

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
    ///         approval by @TheJollyLaMa.
    /// @dev    Reverts if the treasury balance is insufficient.
    /// @param contributor Wallet address of the contributor to pay.
    /// @param amount      BNUT amount to send (18 decimals).
    /// @param issueRef    Human-readable GitHub issue reference for auditability.
    function payContributor(
        address contributor,
        uint256 amount,
        string memory issueRef
    ) external onlyOwner {
        require(contributor != address(0), "Treasury: zero contributor address");
        require(amount > 0, "Treasury: amount must be > 0");
        require(
            bnutToken.balanceOf(address(this)) >= amount,
            "Treasury: insufficient BNUT balance"
        );

        // Transfer BNUT directly from treasury to the contributor.
        bool success = bnutToken.transfer(contributor, amount);
        require(success, "Treasury: transfer failed");

        emit ContributorPaid(contributor, amount, issueRef);
    }

    /// @notice Emergency withdrawal — sends BNUT back to the owner.
    ///         Use only if funds need to be moved (e.g. contract migration).
    /// @param amount BNUT amount to withdraw (18 decimals).
    function withdrawTokens(uint256 amount) external onlyOwner {
        require(amount > 0, "Treasury: amount must be > 0");
        require(
            bnutToken.balanceOf(address(this)) >= amount,
            "Treasury: insufficient BNUT balance"
        );

        bool success = bnutToken.transfer(owner(), amount);
        require(success, "Treasury: withdrawal failed");

        emit TokensWithdrawn(owner(), amount);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /// @notice Returns the current BNUT balance held by this treasury contract.
    /// @return balance The BNUT balance in wei (18 decimals).
    function getBalance() public view returns (uint256 balance) {
        return bnutToken.balanceOf(address(this));
    }
}
