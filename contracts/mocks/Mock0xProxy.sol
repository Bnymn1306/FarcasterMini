// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Mock0xProxy
 * @notice Mock 0x Exchange Proxy for testing (simulates token swaps)
 */
contract Mock0xProxy {
    using SafeERC20 for IERC20;

    // Swap configuration: fromToken => toToken => (amountToSpend, amountToReturn)
    mapping(address => mapping(address => SwapConfig)) public swapConfigs;

    struct SwapConfig {
        uint256 amountToSpend;
        uint256 amountToReturn;
        bool isConfigured;
    }

    /**
     * @notice Configure swap behavior (for testing)
     */
    function setSwapConfig(
        address fromToken,
        address toToken,
        uint256 amountToSpend,
        uint256 amountToReturn
    ) external {
        swapConfigs[fromToken][toToken] = SwapConfig({
            amountToSpend: amountToSpend,
            amountToReturn: amountToReturn,
            isConfigured: true
        });
    }

    /**
     * @notice Execute mock swap
     * @dev Measures actual delivered amount to handle fee-on-transfer tokens realistically
     */
    function swap(
        address fromToken,
        address toToken,
        uint256 requestedAmount,
        uint256 /* minOutput - ignored in mock */
    ) external returns (uint256) {
        SwapConfig memory config = swapConfigs[fromToken][toToken];
        require(config.isConfigured, "Swap not configured");

        // Pull fromToken from caller (vault)
        IERC20(fromToken).safeTransferFrom(msg.sender, address(this), config.amountToSpend);

        // Measure vault balance before/after to handle fee-on-transfer tokens
        // This mirrors production 0x behavior where quotes reflect taker-received amounts
        uint256 vaultBalanceBefore = IERC20(toToken).balanceOf(msg.sender);
        
        // Send toToken to caller (vault)
        IERC20(toToken).safeTransfer(msg.sender, config.amountToReturn);
        
        uint256 vaultBalanceAfter = IERC20(toToken).balanceOf(msg.sender);
        
        // Return actual amount delivered (accounts for fee-on-transfer)
        return vaultBalanceAfter - vaultBalanceBefore;
    }

    /**
     * @notice Fallback to handle arbitrary calldata (0x-style)
     */
    fallback() external {
        // No-op - allows any calldata for testing
    }
}
