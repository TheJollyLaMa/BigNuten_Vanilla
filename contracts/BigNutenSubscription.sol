// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BigNuten On-Chain Subscription Manager
/// @author TheJollyLaMa
/// @notice Tracks subscription expiry for BigNuten users.
///         Subscriptions can be purchased with ETH (standard rate) or
///         $BNUT tokens (discounted rate). Payment verification and tier
///         selection happens in the frontend (js/subscription.js);
///         this contract is the source of truth for subscription status.
///         Related issues: #42 (UI), #43 (crypto flow), #44 ($BNUT discounts).
/// @dev The owner (a backend signer or multisig) calls `subscribe()` after
///      confirming off-chain payment via PayPal/Stripe, or the subscription
///      logic verifies on-chain payment before calling in.

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BigNutenSubscription is Ownable {
    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice The $BNUT ERC-20 token used for discounted subscriptions.
    IERC20 public immutable bnutToken;

    /// @notice Subscription expiry timestamp (Unix) per user address.
    mapping(address => uint256) private _expiry;

    /// @notice Price of a 30-day subscription in ETH (wei).
    ///         Default: 0.01 ETH — update via `setEthPrice()`.
    uint256 public ethPricePerMonth = 0.01 ether;

    /// @notice Price of a 30-day subscription in BNUT (18 decimals).
    ///         Default: 500 BNUT — roughly 50% discount vs ETH equivalent.
    ///         Update via `setBnutPrice()`.
    uint256 public bnutPricePerMonth = 500 * 10 ** 18;

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when a user's subscription is activated or extended.
    /// @param user   Subscriber's wallet address.
    /// @param expiry New expiry timestamp (Unix seconds).
    event Subscribed(address indexed user, uint256 expiry);

    /// @notice Emitted when ETH collected from subscriptions is withdrawn.
    /// @param to     Recipient address.
    /// @param amount ETH amount in wei.
    event EthWithdrawn(address indexed to, uint256 amount);

    /// @notice Emitted when BNUT collected from subscriptions is withdrawn.
    /// @param to     Recipient address.
    /// @param amount BNUT amount (18 decimals).
    event BnutWithdrawn(address indexed to, uint256 amount);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @notice Initialises the subscription contract with the BNUT token address
    ///         and sets the contract owner.
    /// @param _bnutToken   Address of the deployed BigNuten ERC-20 contract.
    /// @param initialOwner Address that owns and administers this contract.
    constructor(address _bnutToken, address initialOwner) Ownable(initialOwner) {
        require(_bnutToken != address(0), "Subscription: zero token address");
        bnutToken = IERC20(_bnutToken);
    }

    // ─── Owner-Only Subscription Grant ───────────────────────────────────────

    /// @notice Grants or extends a subscription for `user` by `durationDays`.
    ///         Called by the owner after verifying off-chain (PayPal/Stripe)
    ///         or on-chain (ETH/BNUT) payment.
    /// @dev    If the user already has an active subscription, duration is
    ///         stacked on top of the existing expiry.
    /// @param user         Address of the subscriber.
    /// @param durationDays Number of days to grant.
    function subscribe(address user, uint256 durationDays) external onlyOwner {
        require(user != address(0), "Subscription: zero user address");
        require(durationDays > 0, "Subscription: duration must be > 0");

        uint256 base = _expiry[user] > block.timestamp
            ? _expiry[user]  // stack on existing active subscription
            : block.timestamp;

        _expiry[user] = base + (durationDays * 1 days);
        emit Subscribed(user, _expiry[user]);
    }

    // ─── Self-Service ETH Subscription ───────────────────────────────────────

    /// @notice Allows a user to subscribe for 30 days by sending ETH directly.
    ///         Requires `msg.value >= ethPricePerMonth`.
    function subscribeWithEth() external payable {
        require(
            msg.value >= ethPricePerMonth,
            "Subscription: insufficient ETH sent"
        );

        uint256 base = _expiry[msg.sender] > block.timestamp
            ? _expiry[msg.sender]
            : block.timestamp;

        _expiry[msg.sender] = base + 30 days;
        emit Subscribed(msg.sender, _expiry[msg.sender]);

        // Refund any overpayment.
        uint256 excess = msg.value - ethPricePerMonth;
        if (excess > 0) {
            (bool refunded, ) = payable(msg.sender).call{value: excess}("");
            require(refunded, "Subscription: ETH refund failed");
        }
    }

    // ─── Self-Service BNUT Subscription (Discounted) ─────────────────────────

    /// @notice Allows a user to subscribe for 30 days by spending BNUT tokens.
    ///         Caller must have approved this contract for at least
    ///         `bnutPricePerMonth` BNUT before calling.
    ///         Related to issue #44.
    function subscribeWithBnut() external {
        require(
            bnutToken.allowance(msg.sender, address(this)) >= bnutPricePerMonth,
            "Subscription: insufficient BNUT allowance"
        );
        require(
            bnutToken.balanceOf(msg.sender) >= bnutPricePerMonth,
            "Subscription: insufficient BNUT balance"
        );

        bool transferred = bnutToken.transferFrom(
            msg.sender,
            address(this),
            bnutPricePerMonth
        );
        require(transferred, "Subscription: BNUT transfer failed");

        uint256 base = _expiry[msg.sender] > block.timestamp
            ? _expiry[msg.sender]
            : block.timestamp;

        _expiry[msg.sender] = base + 30 days;
        emit Subscribed(msg.sender, _expiry[msg.sender]);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /// @notice Returns true if `user` has an active (non-expired) subscription.
    /// @param user Address to check.
    function isSubscribed(address user) public view returns (bool) {
        return _expiry[user] > block.timestamp;
    }

    /// @notice Returns the Unix timestamp when `user`'s subscription expires.
    ///         Returns 0 if the user has never subscribed.
    /// @param user Address to check.
    function getExpiry(address user) public view returns (uint256) {
        return _expiry[user];
    }

    // ─── Admin Price Configuration ────────────────────────────────────────────

    /// @notice Updates the ETH price for a 30-day subscription.
    /// @param priceWei New price in wei.
    function setEthPrice(uint256 priceWei) external onlyOwner {
        ethPricePerMonth = priceWei;
    }

    /// @notice Updates the BNUT price for a 30-day subscription.
    /// @param priceBnut New price in BNUT (18 decimals).
    function setBnutPrice(uint256 priceBnut) external onlyOwner {
        bnutPricePerMonth = priceBnut;
    }

    // ─── Fund Withdrawal ─────────────────────────────────────────────────────

    /// @notice Withdraws ETH collected from subscriptions to the owner.
    function withdrawEth() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "Subscription: no ETH to withdraw");
        (bool sent, ) = payable(owner()).call{value: bal}("");
        require(sent, "Subscription: ETH withdrawal failed");
        emit EthWithdrawn(owner(), bal);
    }

    /// @notice Withdraws BNUT collected from subscriptions to the owner.
    function withdrawBnut() external onlyOwner {
        uint256 bal = bnutToken.balanceOf(address(this));
        require(bal > 0, "Subscription: no BNUT to withdraw");
        bool sent = bnutToken.transfer(owner(), bal);
        require(sent, "Subscription: BNUT withdrawal failed");
        emit BnutWithdrawn(owner(), bal);
    }

    // ─── Fallback ─────────────────────────────────────────────────────────────

    /// @dev Accept plain ETH transfers (e.g. from `subscribeWithEth`).
    receive() external payable {}
}
