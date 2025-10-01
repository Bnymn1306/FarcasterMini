// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BondingCurveToken.sol";

contract TokenFactory {
    event TokenCreated(
        address indexed tokenAddress,
        string name,
        string symbol,
        address indexed creator,
        uint256 timestamp
    );
    
    mapping(address => address[]) public creatorTokens;
    address[] public allTokens;
    
    function createToken(
        string memory name,
        string memory symbol
    ) external returns (address) {
        BondingCurveToken newToken = new BondingCurveToken(
            name,
            symbol,
            msg.sender
        );
        
        address tokenAddress = address(newToken);
        
        creatorTokens[msg.sender].push(tokenAddress);
        allTokens.push(tokenAddress);
        
        emit TokenCreated(tokenAddress, name, symbol, msg.sender, block.timestamp);
        
        return tokenAddress;
    }
    
    function getCreatorTokens(address creator) external view returns (address[] memory) {
        return creatorTokens[creator];
    }
    
    function getAllTokens() external view returns (address[] memory) {
        return allTokens;
    }
    
    function getTokenCount() external view returns (uint256) {
        return allTokens.length;
    }
}
