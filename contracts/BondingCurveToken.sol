// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BondingCurveToken is ERC20, Ownable {
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 10**18; // 1B tokens
    uint256 public constant GRADUATION_THRESHOLD = 30 ether; // 30 ETH to graduate
    uint256 public reserveBalance; // ETH in bonding curve
    bool public graduated;
    
    // Bonding curve parameters (linear: price = reserveBalance * slope / totalSupply)
    uint256 public constant CURVE_SLOPE = 1e15; // 0.001 ETH per token initially
    
    address public factory;
    
    event TokensPurchased(address indexed buyer, uint256 ethAmount, uint256 tokenAmount);
    event TokensSold(address indexed seller, uint256 tokenAmount, uint256 ethAmount);
    event Graduated(uint256 reserveBalance, uint256 timestamp);
    
    constructor(
        string memory name,
        string memory symbol,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        factory = msg.sender;
        _mint(address(this), INITIAL_SUPPLY);
    }
    
    // Calculate token price based on current reserve (linear bonding curve)
    function getBuyPrice(uint256 tokenAmount) public view returns (uint256) {
        require(!graduated, "Token has graduated");
        // Simple linear pricing: more ETH in reserve = higher price
        uint256 currentPrice = (reserveBalance * 1e18) / totalSupply();
        if (currentPrice < CURVE_SLOPE) currentPrice = CURVE_SLOPE;
        return (tokenAmount * currentPrice) / 1e18;
    }
    
    function getSellPrice(uint256 tokenAmount) public view returns (uint256) {
        require(!graduated, "Token has graduated");
        uint256 currentPrice = (reserveBalance * 1e18) / totalSupply();
        if (currentPrice < CURVE_SLOPE) currentPrice = CURVE_SLOPE;
        // Sell price is slightly lower (0.3% fee)
        return ((tokenAmount * currentPrice) / 1e18) * 997 / 1000;
    }
    
    // Buy tokens with ETH
    function buy() external payable {
        require(!graduated, "Token has graduated");
        require(msg.value > 0, "Must send ETH");
        
        uint256 tokenAmount = (msg.value * 1e18) / getBuyPrice(1e18);
        require(tokenAmount > 0, "Invalid token amount");
        require(balanceOf(address(this)) >= tokenAmount, "Insufficient token supply");
        
        reserveBalance += msg.value;
        _transfer(address(this), msg.sender, tokenAmount);
        
        emit TokensPurchased(msg.sender, msg.value, tokenAmount);
        
        // Check for graduation
        if (reserveBalance >= GRADUATION_THRESHOLD) {
            _graduate();
        }
    }
    
    // Sell tokens for ETH
    function sell(uint256 tokenAmount) external {
        require(!graduated, "Token has graduated");
        require(tokenAmount > 0, "Must sell positive amount");
        require(balanceOf(msg.sender) >= tokenAmount, "Insufficient token balance");
        
        uint256 ethAmount = getSellPrice(tokenAmount);
        require(reserveBalance >= ethAmount, "Insufficient reserve");
        
        _transfer(msg.sender, address(this), tokenAmount);
        reserveBalance -= ethAmount;
        
        (bool success, ) = msg.sender.call{value: ethAmount}("");
        require(success, "ETH transfer failed");
        
        emit TokensSold(msg.sender, tokenAmount, ethAmount);
    }
    
    // Graduate to Uniswap (simplified - just locks the reserve)
    function _graduate() internal {
        graduated = true;
        emit Graduated(reserveBalance, block.timestamp);
        // In production: create Uniswap pair, add liquidity, lock LP tokens
    }
    
    // Get current stats
    function getStats() external view returns (
        uint256 price,
        uint256 reserve,
        uint256 supply,
        bool isGraduated
    ) {
        price = getBuyPrice(1e18);
        reserve = reserveBalance;
        supply = totalSupply() - balanceOf(address(this));
        isGraduated = graduated;
    }
    
    // Allow contract to receive ETH
    receive() external payable {}
}
