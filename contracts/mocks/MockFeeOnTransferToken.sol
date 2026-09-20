// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockFeeOnTransferToken
 * @notice ERC20 token that charges a fee on every transfer (for testing)
 */
contract MockFeeOnTransferToken is ERC20 {
    uint256 public feeBps; // Fee in basis points (100 = 1%)

    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        uint256 _feeBps
    ) ERC20(name, symbol) {
        require(_feeBps <= 1000, "Fee cannot exceed 10%");
        feeBps = _feeBps;
        _mint(msg.sender, initialSupply);
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        if (from != address(0) && to != address(0)) {
            // Calculate fee (basis points)
            uint256 fee = (value * feeBps) / 10000;
            uint256 amountAfterFee = value - fee;

            // Burn the fee
            super._update(from, address(0), fee);
            // Transfer remaining amount
            super._update(from, to, amountAfterFee);
        } else {
            // Minting or burning - no fee
            super._update(from, to, value);
        }
    }
}
