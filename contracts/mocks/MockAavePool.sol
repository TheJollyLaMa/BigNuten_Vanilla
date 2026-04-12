// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Minimal Aave V3 Pool mock for testing StreakBetEscrow.
///      supply() accepts tokens (pull), withdraw() sends them back (push).
///      A small yield bonus can be configured to test yield capture.
contract MockAavePool {
    using SafeERC20 for IERC20;

    /// @notice Simulated extra yield (in bps, 100 = 1%).
    uint256 public yieldBps;

    function setYieldBps(uint256 _bps) external {
        yieldBps = _bps;
    }

    /// @notice Accept a supply (pull tokens from sender).
    function supply(address asset, uint256 amount, address, uint16) external {
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraw tokens back to `to`. Returns actual amount sent.
    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        uint256 bonus = (amount * yieldBps) / 10000;
        uint256 total = amount + bonus;
        uint256 balance = IERC20(asset).balanceOf(address(this));
        if (total > balance) total = balance; // cap to what we have
        IERC20(asset).safeTransfer(to, total);
        return total;
    }
}
