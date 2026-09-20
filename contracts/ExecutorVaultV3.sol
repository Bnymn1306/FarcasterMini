// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ExecutorVaultV3
 * @notice Universal auto-withdrawal vault for automated limit order execution
 * @dev V3 enables automatic execution + withdrawal for ANY Base token
 * 
 * Key Features:
 * - Deposit whitelist (only approved tokens like WETH/USDC)
 * - Universal toToken support (ANY token can be purchased)
 * - Auto-withdrawal (tokens sent directly to user wallet)
 * - Token blacklist (block malicious contracts)
 * - Fee-on-transfer detection (both fromToken and toToken)
 */
contract ExecutorVaultV3 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // User balances: user => token => amount
    mapping(address => mapping(address => uint256)) public balances;
    
    // Authorized backend executor
    address public executor;
    
    // Whitelisted swap targets (0x Exchange Proxy)
    mapping(address => bool) public approvedSwapTargets;
    
    // Approved deposit tokens (limits to audited tokens)
    mapping(address => bool) public approvedTokens;
    
    // Blacklisted output tokens (block malicious contracts)
    mapping(address => bool) public blacklistedTokens;
    
    // Emergency pause
    bool public paused;
    
    // Maximum fee-on-transfer tolerance (basis points)
    uint256 public maxFeeOnTransferBps = 500; // 5%
    
    // Events
    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdraw(address indexed user, address indexed token, uint256 amount);
    event SwapExecuted(
        address indexed user,
        address indexed fromToken,
        address indexed toToken,
        uint256 fromAmount,
        uint256 toAmount,
        string orderId,
        bool autoWithdrawn
    );
    event AutoWithdraw(address indexed user, address indexed token, uint256 amount);
    event ExecutorUpdated(address indexed oldExecutor, address indexed newExecutor);
    event SwapTargetUpdated(address indexed target, bool approved);
    event TokenUpdated(address indexed token, bool approved);
    event TokenBlacklisted(address indexed token, bool blacklisted);
    event MaxFeeUpdated(uint256 oldMaxFeeBps, uint256 newMaxFeeBps);
    event PauseToggled(bool paused);
    
    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }
    
    constructor(address _executor, address _zeroXProxy, address _weth) Ownable(msg.sender) {
        require(_executor != address(0), "Invalid executor");
        require(_zeroXProxy != address(0), "Invalid 0x proxy");
        require(_weth != address(0), "Invalid WETH");
        
        executor = _executor;
        
        // Whitelist 0x Exchange Proxy
        approvedSwapTargets[_zeroXProxy] = true;
        emit SwapTargetUpdated(_zeroXProxy, true);
        
        // Approve WETH by default (standard ERC20)
        approvedTokens[_weth] = true;
        emit TokenUpdated(_weth, true);
    }
    
    /**
     * @notice Deposit ERC20 tokens to vault for order execution
     * @param token Token address to deposit
     * @param amount Amount to deposit
     */
    function deposit(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Amount must be > 0");
        require(approvedTokens[token], "Token not approved for deposit");
        
        // Record balance before transfer (fee-on-transfer detection)
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        
        // Transfer tokens from user to vault (SafeERC20)
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        // Calculate actual received amount (handles fee-on-transfer)
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        uint256 actualAmount = balanceAfter - balanceBefore;
        require(actualAmount > 0, "No tokens received");
        
        // Update user balance with actual received amount
        balances[msg.sender][token] += actualAmount;
        
        emit Deposit(msg.sender, token, actualAmount);
    }
    
    /**
     * @notice Withdraw tokens from vault
     * @param token Token address to withdraw
     * @param amount Amount to withdraw
     */
    function withdraw(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Amount must be > 0");
        require(balances[msg.sender][token] >= amount, "Insufficient balance");
        
        // Update user balance (checks-effects-interactions)
        balances[msg.sender][token] -= amount;
        
        // Transfer tokens to user (SafeERC20)
        IERC20(token).safeTransfer(msg.sender, amount);
        
        emit Withdraw(msg.sender, token, amount);
    }
    
    /**
     * @notice Executor withdraws tokens on behalf of user (only callable by executor)
     * @param user User whose funds to withdraw
     * @param token Token address to withdraw
     * @param amount Amount to withdraw (use type(uint256).max for all balance)
     */
    function executorWithdraw(address user, address token, uint256 amount) external nonReentrant whenNotPaused {
        require(msg.sender == executor, "Only executor can call");
        require(user != address(0), "Invalid user");
        require(token != address(0), "Invalid token");
        
        // If amount is max uint256, withdraw all balance
        uint256 withdrawAmount = amount;
        if (amount == type(uint256).max) {
            withdrawAmount = balances[user][token];
        }
        
        require(withdrawAmount > 0, "Nothing to withdraw");
        require(balances[user][token] >= withdrawAmount, "Insufficient balance");
        
        // Update user balance (checks-effects-interactions)
        balances[user][token] -= withdrawAmount;
        
        // Transfer tokens to user (SafeERC20)
        IERC20(token).safeTransfer(user, withdrawAmount);
        
        emit Withdraw(user, token, withdrawAmount);
    }
    
    /**
     * @notice Execute swap on behalf of user with universal auto-withdrawal support
     * @param user User whose funds to use
     * @param fromToken Token to swap from (must be approved for deposits)
     * @param toToken Token to swap to (ANY token allowed, subject to blacklist)
     * @param fromAmount Amount to swap
     * @param minToAmount Minimum tokens to receive (slippage protection)
     * @param swapTarget 0x Exchange Proxy address (must be whitelisted)
     * @param swapCallData Encoded swap transaction data
     * @param orderId Associated limit order ID for tracking
     * @param autoWithdraw If true, send toTokens directly to user wallet (no vault storage)
     */
    function executeSwap(
        address user,
        address fromToken,
        address toToken,
        uint256 fromAmount,
        uint256 minToAmount,
        address swapTarget,
        bytes calldata swapCallData,
        string calldata orderId,
        bool autoWithdraw
    ) external nonReentrant whenNotPaused returns (uint256 toAmount) {
        require(msg.sender == executor, "Only executor can call");
        require(user != address(0), "Invalid user");
        require(approvedSwapTargets[swapTarget], "Swap target not approved");
        require(approvedTokens[fromToken], "From token not approved for deposits");
        require(balances[user][fromToken] >= fromAmount, "Insufficient user balance");
        require(minToAmount > 0, "Invalid min amount");
        
        // V3 UNIVERSAL SUPPORT: Only check blacklist for toToken (no approval required)
        if (autoWithdraw) {
            require(!blacklistedTokens[toToken], "Output token is blacklisted");
        } else {
            // Legacy vault storage mode: require toToken approval
            require(approvedTokens[toToken], "To token not approved for vault storage");
        }
        
        // CHECKS-EFFECTS-INTERACTIONS pattern
        
        // Effects: Deduct from user's balance BEFORE external calls
        balances[user][fromToken] -= fromAmount;
        
        // Record balances before swap (fee-on-transfer detection)
        uint256 fromBalanceBefore = IERC20(fromToken).balanceOf(address(this));
        uint256 toBalanceBefore = IERC20(toToken).balanceOf(address(this));
        
        // Interactions: Approve using SafeERC20 (handles non-standard tokens)
        IERC20(fromToken).safeIncreaseAllowance(swapTarget, fromAmount);
        
        // Execute swap via 0x
        (bool success, bytes memory returnData) = swapTarget.call(swapCallData);
        
        // Always reset allowance (even if swap failed) - SafeERC20 handles USDT-style tokens
        uint256 remainingAllowance = IERC20(fromToken).allowance(address(this), swapTarget);
        if (remainingAllowance > 0) {
            IERC20(fromToken).safeDecreaseAllowance(swapTarget, remainingAllowance);
        }
        
        require(success, string(abi.encodePacked("Swap failed: ", returnData)));
        
        // Verify fromToken balance and handle partial fills (0x may spend less than fromAmount)
        uint256 fromBalanceAfter = IERC20(fromToken).balanceOf(address(this));
        uint256 actualFromSpent = fromBalanceBefore - fromBalanceAfter;
        
        // Allow under-spend (partial fills, fee-on-transfer) - refund unspent to user
        require(actualFromSpent <= fromAmount, "Swap spent more than expected");
        if (actualFromSpent < fromAmount) {
            uint256 refundAmount = fromAmount - actualFromSpent;
            balances[user][fromToken] += refundAmount;
        }
        
        // Calculate tokens received (balance delta method)
        uint256 toBalanceAfter = IERC20(toToken).balanceOf(address(this));
        toAmount = toBalanceAfter - toBalanceBefore;
        
        // Enforce slippage protection with fee-on-transfer tolerance
        // Formula: toAmount >= minToAmount * (100% - maxFee%)
        uint256 minToAmountWithFee = (minToAmount * (10000 - maxFeeOnTransferBps)) / 10000;
        require(toAmount >= minToAmountWithFee, "Slippage or excessive fee-on-transfer detected");
        
        // Additional safety: ensure we received something
        require(toAmount > 0, "Swap returned zero tokens");
        
        // V3 AUTO-WITHDRAWAL: Send tokens directly to user or store in vault
        if (autoWithdraw) {
            // Measure user balance before transfer (handles fee-on-transfer on vault→user hop)
            uint256 userBalanceBefore = IERC20(toToken).balanceOf(user);
            
            // Direct transfer to user wallet (zero vault storage)
            IERC20(toToken).safeTransfer(user, toAmount);
            
            // Verify user actually received enough (protects against fee-on-transfer tokens)
            uint256 userBalanceAfter = IERC20(toToken).balanceOf(user);
            uint256 actualReceived = userBalanceAfter - userBalanceBefore;
            require(actualReceived >= minToAmountWithFee, "User received less than minimum after transfer fee");
            
            emit AutoWithdraw(user, toToken, actualReceived);
        } else {
            // Legacy mode: Credit received tokens to user's vault balance
            balances[user][toToken] += toAmount;
        }
        
        emit SwapExecuted(user, fromToken, toToken, fromAmount, toAmount, orderId, autoWithdraw);
        
        return toAmount;
    }
    
    /**
     * @notice Update executor address (only owner)
     * @param newExecutor New executor address
     */
    function setExecutor(address newExecutor) external onlyOwner {
        require(newExecutor != address(0), "Invalid executor");
        address oldExecutor = executor;
        executor = newExecutor;
        emit ExecutorUpdated(oldExecutor, newExecutor);
    }
    
    /**
     * @notice Add or remove approved swap target (only owner)
     * @param target Swap target address (e.g., 0x Exchange Proxy)
     * @param approved Whether to approve or revoke
     */
    function setSwapTarget(address target, bool approved) external onlyOwner {
        require(target != address(0), "Invalid target");
        approvedSwapTargets[target] = approved;
        emit SwapTargetUpdated(target, approved);
    }
    
    /**
     * @notice Add or remove approved deposit token (only owner)
     * @param token Token address to approve/revoke for deposits
     * @param approved Whether to approve or revoke
     */
    function setToken(address token, bool approved) external onlyOwner {
        require(token != address(0), "Invalid token");
        approvedTokens[token] = approved;
        emit TokenUpdated(token, approved);
    }
    
    /**
     * @notice Add or remove blacklisted output token (only owner)
     * @param token Token address to blacklist/unblacklist
     * @param blacklisted Whether to blacklist or unblacklist
     */
    function setBlacklistedToken(address token, bool blacklisted) external onlyOwner {
        require(token != address(0), "Invalid token");
        blacklistedTokens[token] = blacklisted;
        emit TokenBlacklisted(token, blacklisted);
    }
    
    /**
     * @notice Update maximum fee-on-transfer tolerance (only owner)
     * @param newMaxFeeBps New maximum fee in basis points (100 = 1%)
     */
    function setMaxFeeOnTransferBps(uint256 newMaxFeeBps) external onlyOwner {
        require(newMaxFeeBps <= 1000, "Max fee cannot exceed 10%");
        uint256 oldMaxFeeBps = maxFeeOnTransferBps;
        maxFeeOnTransferBps = newMaxFeeBps;
        emit MaxFeeUpdated(oldMaxFeeBps, newMaxFeeBps);
    }
    
    /**
     * @notice Emergency pause/unpause (only owner)
     * @param _paused New pause state
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseToggled(_paused);
    }
    
    /**
     * @notice Get user's balance for a token
     * @param user User address
     * @param token Token address
     * @return User's balance
     */
    function getBalance(address user, address token) external view returns (uint256) {
        return balances[user][token];
    }
}
