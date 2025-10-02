// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BondingCurveToken is ERC20, Ownable {
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 10**18; // 1B tokens
    uint256 public constant GRADUATION_THRESHOLD = 30 ether; // 30 ETH to graduate
    uint256 public reserveBalance; // ETH in bonding curve
    uint256 public circulatingSupply; // Tokens sold from bonding curve
    bool public graduated;
    
    // Bonding curve: price = (k * circulatingSupply) / INITIAL_SUPPLY
    // k = initial price multiplier
    uint256 public constant K_MULTIPLIER = 1e15; // 0.001 ETH base price
    
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
    
    // Linear bonding curve: price increases with circulating supply
    // Cost to buy tokenAmount starting from current circulatingSupply
    function getBuyPrice(uint256 tokenAmount) public view returns (uint256) {
        require(!graduated, "Token has graduated");
        require(circulatingSupply + tokenAmount <= INITIAL_SUPPLY, "Exceeds supply");
        
        // Price = k * (circulatingSupply + tokenAmount/2)
        // This is average price over the buy
        uint256 avgSupply = circulatingSupply + (tokenAmount / 2);
        uint256 avgPrice = (K_MULTIPLIER * avgSupply) / INITIAL_SUPPLY;
        if (avgPrice < K_MULTIPLIER / 1000) avgPrice = K_MULTIPLIER / 1000; // Minimum price
        
        return (tokenAmount * avgPrice) / 1e18;
    }
    
    // Sell price mirrors buy price minus 0.3% fee
    function getSellPrice(uint256 tokenAmount) public view returns (uint256) {
        require(!graduated, "Token has graduated");
        require(tokenAmount <= circulatingSupply, "Exceeds circulating");
        
        // Price at midpoint of sell range
        uint256 avgSupply = circulatingSupply - (tokenAmount / 2);
        uint256 avgPrice = (K_MULTIPLIER * avgSupply) / INITIAL_SUPPLY;
        if (avgPrice < K_MULTIPLIER / 1000) avgPrice = K_MULTIPLIER / 1000;
        
        // 0.3% fee stays in reserve
        return ((tokenAmount * avgPrice) / 1e18) * 997 / 1000;
    }
    
    // Buy tokens with ETH
    function buy() external payable {
        require(!graduated, "Token has graduated");
        require(msg.value > 0, "Must send ETH");
        
        // Calculate how many tokens can be bought with sent ETH
        // Binary search for token amount (simplified: use approximation)
        uint256 tokenAmount = (msg.value * INITIAL_SUPPLY) / (K_MULTIPLIER * (circulatingSupply + 1));
        
        // Refine: calculate exact cost and adjust
        uint256 actualCost = getBuyPrice(tokenAmount);
        if (actualCost > msg.value) {
            tokenAmount = (tokenAmount * msg.value) / actualCost;
        }
        
        require(tokenAmount > 0, "Invalid token amount");
        require(balanceOf(address(this)) >= tokenAmount, "Insufficient token supply");
        require(circulatingSupply + tokenAmount <= INITIAL_SUPPLY, "Exceeds supply");
        
        reserveBalance += msg.value;
        circulatingSupply += tokenAmount;
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
        require(tokenAmount <= circulatingSupply, "Exceeds circulating supply");
        
        uint256 ethAmount = getSellPrice(tokenAmount);
        require(reserveBalance >= ethAmount, "Insufficient reserve");
        
        _transfer(msg.sender, address(this), tokenAmount);
        circulatingSupply -= tokenAmount;
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
        uint256 circulating,
        bool isGraduated
    ) {
        price = circulatingSupply > 0 ? getBuyPrice(1e18) : K_MULTIPLIER / 1000;
        reserve = reserveBalance;
        circulating = circulatingSupply;
        isGraduated = graduated;
    }
    
    // Allow contract to receive ETH
    receive() external payable {}
}
