// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BigNuten ERC-20 Token ($BNUT)
/// @author TheJollyLaMa
/// @notice The native utility and governance token of the BigNuten fitness ecosystem.
///         $BNUT is earned by contributing workouts, data, and community effort,
///         and is used for subscriptions, governance voting, and bounty payouts.
/// @dev Extends OpenZeppelin ERC20, ERC20Burnable, and Ownable (v5).
///      Deployed on Polygon, Base, or Optimism (configurable via deploy script).

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BigNuten is ERC20, ERC20Burnable, Ownable {
    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Total initial supply minted to the deployer (100 million BNUT).
    uint256 public constant INITIAL_SUPPLY = 100_000_000 * 10 ** 18;

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted whenever new BNUT tokens are minted by the owner.
    /// @param to      Recipient of the newly minted tokens.
    /// @param amount  Amount of tokens minted (in wei, 18 decimals).
    event Minted(address indexed to, uint256 amount);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @notice Deploys the BigNuten token and mints the entire initial supply
    ///         to the deployer address (typically the Treasury multisig).
    /// @param initialOwner Address that will own the contract and receive
    ///                     the initial BNUT supply.
    constructor(address initialOwner)
        ERC20("BigNuten", "BNUT")
        Ownable(initialOwner)
    {
        // Mint the full initial supply to the deployer / Treasury address.
        _mint(initialOwner, INITIAL_SUPPLY);
        emit Minted(initialOwner, INITIAL_SUPPLY);
    }

    // ─── Owner-Only Functions ─────────────────────────────────────────────────

    /// @notice Mints additional BNUT tokens to any address.
    ///         Only callable by the contract owner (Treasury or multisig).
    /// @dev    Should be used sparingly and only for ecosystem incentives
    ///         (e.g. data-sharing rewards, bounty replenishment).
    /// @param to     Recipient address.
    /// @param amount Amount of tokens to mint (in wei, 18 decimals).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
        emit Minted(to, amount);
    }

    // ─── Public Functions ─────────────────────────────────────────────────────

    /// @notice Burns `amount` tokens from the caller's balance.
    ///         Inherited from ERC20Burnable — available to any token holder.
    /// @dev    Tokens can also be burned via `burnFrom(account, amount)` if
    ///         the caller has an allowance. This is useful for subscription
    ///         contracts that consume BNUT on behalf of users.
    // burn() and burnFrom() are inherited from ERC20Burnable — no override needed.

    // ─── View Helpers ─────────────────────────────────────────────────────────

    /// @notice Returns the number of decimal places used by the token.
    ///         Overridden here for explicitness; value is the ERC20 default (18).
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
