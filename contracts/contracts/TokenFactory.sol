// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BondingCurveToken.sol";

contract TokenFactory {
    event TokenCreated(
        address indexed tokenAddress,
        string name,
        string symbol,
        address indexed creator
    );
    
    function createToken(
        string memory name,
        string memory symbol
    ) external returns (address) {
        BondingCurveToken token = new BondingCurveToken(name, symbol, msg.sender);
        
        emit TokenCreated(address(token), name, symbol, msg.sender);
        
        return address(token);
    }
}
