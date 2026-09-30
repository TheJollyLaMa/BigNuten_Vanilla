// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Minimal Aave V3 Pool mock for testing StreakBetEscrow.
///      supply() accepts tokens (pull), withdraw() sends them back (push).
///      Yield is simulated by raising the liquidity index, like the real pool.
contract MockAavePool {
    using SafeERC20 for IERC20;

    uint256 public liquidityIndex = 1e27;
    mapping(address => bool) private _unsupportedAssets;

    /// @notice Grow the liquidity index by `_bps` (100 = 1%) to simulate accrued yield.
    function setYieldBps(uint256 _bps) external {
        liquidityIndex = (liquidityIndex * (10000 + _bps)) / 10000;
    }

    function setReserveSupported(address asset, bool supported) external {
        _unsupportedAssets[asset] = !supported;
    }

    function getReserveNormalizedIncome(address asset) external view returns (uint256) {
        return _unsupportedAssets[asset] ? 0 : liquidityIndex;
    }

    /// @notice Accept a supply (pull tokens from sender).
    function supply(address asset, uint256 amount, address, uint16) external {
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraw tokens back to `to`. Returns actual amount sent.
    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        uint256 balance = IERC20(asset).balanceOf(address(this));
        require(amount <= balance, "MockAave: insufficient liquidity");
        IERC20(asset).safeTransfer(to, amount);
        return amount;
    }
}
