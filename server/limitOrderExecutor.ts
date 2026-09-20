import { IStorage } from './storage';
import { runOwnedTick, claimSideEffect } from './background/ownership';
import type { LimitOrder } from '@shared/schema';
import { ethers } from 'ethers';

// ERC-8021 Builder Code attribution
// Builder Code: bc_juic0ljs (wallet: 0xBE1B5f18cb7E00aE82F00c69a81d052b2DA6C3d6)
const BUILDER_CODE = "bc_juic0ljs";
const ERC8021_SUFFIX = "0x" + "8021" + Buffer.from(BUILDER_CODE, 'utf8').toString('hex');

// ExecutorVault contract configuration (from environment variables)
const EXECUTOR_VAULT_V1_ADDRESS = process.env.EXECUTOR_VAULT_V1_ADDRESS || "0xC9c0f3596843Babc2F45837c88864B7c98191121"; // Legacy vault
const EXECUTOR_VAULT_V2_ADDRESS = process.env.EXECUTOR_VAULT_V2_ADDRESS || "0x830C397739485065513f94a3284ebd54aE638806"; // V2 with auto-withdrawal
const EXECUTOR_VAULT_V3_ADDRESS = process.env.EXECUTOR_VAULT_V3_ADDRESS || "0x3905022308C9BdE5581078Ca4A9e413b608F764e"; // V3 with universal auto-withdrawal (Base mainnet)
const EXECUTOR_VAULT_ADDRESS = EXECUTOR_VAULT_V3_ADDRESS || EXECUTOR_VAULT_V2_ADDRESS; // Use V3 if configured, else V2
// V3 Vault ABI (with autoWithdraw parameter for universal auto-withdrawal)
const EXECUTOR_VAULT_V3_ABI = [
  "function executeSwap(address user, address fromToken, address toToken, uint256 fromAmount, uint256 minToAmount, address swapTarget, bytes calldata swapCallData, string calldata orderId, bool autoWithdraw) external returns (uint256)",
  "function executorWithdraw(address user, address token, uint256 amount) external",
  "function balances(address user, address token) external view returns (uint256)",
  "function approvedTokens(address token) external view returns (bool)",
  "function blacklistedTokens(address token) external view returns (bool)",
  "function paused() external view returns (bool)"
];

// V2/V1 Vault ABI (legacy - no autoWithdraw parameter)
const EXECUTOR_VAULT_V2_ABI = [
  "function executeSwap(address user, address fromToken, address toToken, uint256 fromAmount, uint256 minToAmount, address swapTarget, bytes calldata swapCallData, string calldata orderId) external returns (uint256)",
  "function executorWithdraw(address user, address token, uint256 amount) external",
  "function balances(address user, address token) external view returns (uint256)",
  "function approvedTokens(address token) external view returns (bool)",
  "function paused() external view returns (bool)"
];

// Select ABI based on configured vault
const EXECUTOR_VAULT_ABI = EXECUTOR_VAULT_V3_ADDRESS ? EXECUTOR_VAULT_V3_ABI : EXECUTOR_VAULT_V2_ABI;

interface PriceCache {
  price: number;
  timestamp: number;
}

export class LimitOrderExecutor {
  private storage: IStorage;
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private checkIntervalMs: number;
  private priceCache: Map<string, PriceCache> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache
  private wallet: ethers.Wallet | null = null;
  private provider: ethers.JsonRpcProvider | null = null;

  constructor(storage: IStorage, checkIntervalMs: number = 30000) {
    this.storage = storage;
    this.checkIntervalMs = checkIntervalMs;
    
    // Initialize backend wallet for automatic execution
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const rpcUrl = process.env.BASE_RPC_URL;
    
    if (privateKey && rpcUrl) {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      console.log(`💼 Backend wallet initialized: ${this.wallet.address}`);
    } else {
      console.warn('⚠️ Backend wallet not configured - automatic execution disabled');
    }
  }

  start() {
    if (this.intervalId) {
      console.log('⚠️ Limit order executor already running');
      return;
    }

    console.log(`🎯 Starting limit order executor (check interval: ${this.checkIntervalMs}ms)`);
    
    // Run immediately on start (with error handling)
    this.checkAndExecuteOrders().catch(err => {
      console.error('❌ Error in initial limit order check:', err);
    });
    
    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkAndExecuteOrders().catch(err => {
        console.error('❌ Error in periodic limit order check:', err);
      });
    }, this.checkIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Limit order executor stopped');
    }
  }

  public async tick(owner: "vm" | "workflow" = "vm", generation?: string) {
    return runOwnedTick("base", () => this.checkAndExecuteOrdersInternal(), owner, generation);
  }

  private async checkAndExecuteOrders() {
    return this.tick();
  }

  private async checkAndExecuteOrdersInternal() {
    if (this.isProcessing) {
      console.log('⏭️ Previous check still processing, skipping...');
      return;
    }

    this.isProcessing = true;

    try {
      // Get all fillable orders (ready for execution)
      const allFillableOrders = await this.storage.getFillableLimitOrders();
      
      console.log(`🔍 Limit order check: ${allFillableOrders.length} fillable orders (BUY and SELL)`);
      
      if (allFillableOrders.length === 0) {
        return; // No orders to process
      }

      // Process all orders via vault (unified execution path)
      for (const order of allFillableOrders) {
        try {
          await this.processOrder(order);
        } catch (error) {
          console.error(`❌ Error processing order ${order.id}:`, error);
          // Continue with next order even if one fails
        }
      }
    } catch (error) {
      console.error('❌ Error in limit order executor:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processOrder(order: LimitOrder) {
    try {
      console.log(`📊 Processing order: ${order.orderType} ${order.tokenSymbol} @ target $${order.targetPrice} [status: ${order.status}]`);
      
      if (!order.targetPrice) {
        console.log(`⚠️ Order ${order.id} missing target price, skipping`);
        return;
      }

      // CRITICAL: For 'ready_to_execute' orders, retry immediately without price check
      // These orders already hit their target price once, so we should keep trying
      if (order.status === 'ready_to_execute') {
        const lastFilledPrice = order.filledPrice ? parseFloat(order.filledPrice) : parseFloat(order.targetPrice);
        console.log(`🔄 RETRYING ready_to_execute order for ${order.tokenSymbol} (previous price: $${lastFilledPrice})`);
        await this.executeOrder(order, lastFilledPrice);
        return;
      }

      // Get current price from DEXScreener API
      const currentPrice = await this.getCurrentPrice(order.tokenAddress);
      
      if (!currentPrice) {
        console.log(`⚠️ Could not fetch price for ${order.tokenSymbol} (${order.tokenAddress})`);
        return;
      }

      console.log(`💵 Current price for ${order.tokenSymbol}: $${currentPrice}`);
      
      const targetPrice = parseFloat(order.targetPrice);
      const shouldExecute = this.shouldExecuteOrder(order.orderType, currentPrice, targetPrice);

      if (shouldExecute) {
        console.log(`✅ Executing ${order.orderType} order for ${order.tokenSymbol}: current=${currentPrice}, target=${targetPrice}`);
        await this.executeOrder(order, currentPrice);
      } else {
        console.log(`⏸️ Order not ready: ${order.orderType} ${order.tokenSymbol} - current=$${currentPrice}, target=$${targetPrice}`);
      }
    } catch (error) {
      console.error(`❌ Error processing order ${order.id}:`, error);
      throw error;
    }
  }

  private shouldExecuteOrder(orderType: string, currentPrice: number, targetPrice: number): boolean {
    if (orderType === 'buy') {
      // Buy when current price is at or below target
      return currentPrice <= targetPrice;
    } else if (orderType === 'sell') {
      // Sell when current price is at or above target
      return currentPrice >= targetPrice;
    }
    return false;
  }

  private async getCurrentPrice(tokenAddress: string): Promise<number | null> {
    try {
      const lowerCaseAddress = tokenAddress.toLowerCase();
      
      // Check cache first
      const cached = this.priceCache.get(lowerCaseAddress);
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
        return cached.price;
      }

      // Use DEXScreener API for real-time DEX prices (matches user's view)
      // This provides accurate Base chain DEX prices without API key
      const url = `https://api.dexscreener.com/latest/dex/tokens/${lowerCaseAddress}`;
      
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`DEXScreener API error (${response.status}):`, await response.text());
        
        // Return stale cache if available (graceful degradation)
        if (cached) {
          console.log(`⚠️ Using stale cache for ${tokenAddress} (age: ${Math.floor((Date.now() - cached.timestamp) / 1000)}s)`);
          return cached.price;
        }
        return null;
      }

      const data = await response.json();
      
      // Response format: { pairs: [{ chainId, priceUsd, liquidity, ... }] }
      if (!data.pairs || data.pairs.length === 0) {
        console.error(`No DEX pairs found for token ${tokenAddress}`);
        return null;
      }
      
      // Filter for Base chain pairs and sort by liquidity (highest first)
      const basePairs = data.pairs
        .filter((pair: any) => pair.chainId === 'base')
        .sort((a: any, b: any) => {
          const liquidityA = a.liquidity?.usd || 0;
          const liquidityB = b.liquidity?.usd || 0;
          return liquidityB - liquidityA;
        });
      
      if (basePairs.length === 0) {
        console.error(`No Base chain pairs found for token ${tokenAddress}`);
        return null;
      }
      
      // Use the most liquid pair's price
      const bestPair = basePairs[0];
      const price = parseFloat(bestPair.priceUsd);
      
      if (isNaN(price)) {
        console.error(`Invalid price data for token ${tokenAddress}`);
        return null;
      }
      
      console.log(`📊 DEXScreener price for ${tokenAddress}: $${price} (liquidity: $${bestPair.liquidity?.usd || 0})`);
      
      // Update cache
      this.priceCache.set(lowerCaseAddress, {
        price,
        timestamp: Date.now()
      });
      
      return price;
    } catch (error) {
      console.error('Error fetching current price:', error);
      return null;
    }
  }

  private async executeOrder(order: LimitOrder, filledPrice: number) {
    if (!await claimSideEffect(order.id, "swap")) return;
    try {
      console.log(`🔄 Attempting to execute order ${order.id} for ${order.tokenSymbol} at $${filledPrice}`);

      if (!this.wallet || !this.provider) {
        console.warn('⚠️ Backend wallet not available, marking as ready for manual execution');
        await this.storage.updateLimitOrder(order.id, {
          status: 'ready_to_execute',
          filledPrice: filledPrice.toString(),
        });
        return;
      }

      // AUTOMATIC EXECUTION FLOW:
      // 1. Get 0x swap quote
      // 2. Execute swap transaction with backend wallet
      // 3. Update order status to 'filled'

      const swapResult = await this.executeSwapViaZeroX(order);
      
      if (swapResult.success) {
        await this.storage.updateLimitOrder(order.id, {
          status: 'filled',
          filledPrice: filledPrice.toString(),
          txHash: swapResult.txHash,
        });
        console.log(`✅ Order ${order.id} automatically executed! TxHash: ${swapResult.txHash}`);
      } else if (swapResult.isPermanentFailure) {
        // Permanent failure - mark as failed, don't retry
        console.error(`❌ Order ${order.id} permanently failed: ${swapResult.error}`);
        await this.storage.updateLimitOrder(order.id, {
          status: 'failed',
          failureReason: swapResult.errorDetails || swapResult.error || 'Unknown error',
        });
      } else {
        // Temporary failure - fallback to manual execution
        console.warn(`⚠️ Automatic execution failed (temporary): ${swapResult.error}`);
        await this.storage.updateLimitOrder(order.id, {
          status: 'ready_to_execute',
          filledPrice: filledPrice.toString(),
        });
      }
    } catch (error) {
      console.error(`Error executing order ${order.id}:`, error);
      // Fallback to manual execution
      await this.storage.updateLimitOrder(order.id, {
        status: 'ready_to_execute',
        filledPrice: filledPrice.toString(),
      });
    }
  }

  private async executeSwapViaZeroX(order: LimitOrder): Promise<{ success: boolean; txHash?: string; error?: string; isPermanentFailure?: boolean; errorDetails?: string }> {
    try {
      if (!this.wallet || !this.provider) {
        return { success: false, error: 'Wallet not initialized' };
      }

      const WETH_BASE = '0x4200000000000000000000000000000000000006';
      const ZERO_X_PROXY = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF';
      const apiKey = process.env.OX_API_KEY;
      
      if (!apiKey) {
        return { success: false, error: '0x API key not configured' };
      }

      // Determine swap direction
      const isBuyOrder = order.orderType === 'buy';
      const sellToken = isBuyOrder ? WETH_BASE : order.tokenAddress;
      const buyToken = isBuyOrder ? order.tokenAddress : WETH_BASE;
      
      console.log(`🔍 Token addresses - Sell: ${sellToken}, Buy: ${buyToken}`);
      console.log(`🔍 Order token address: ${order.tokenAddress}, Symbol: ${order.tokenSymbol}`);
      
      // CRITICAL: Use correct amounts based on what user deposited to vault
      // Buy order: user deposits WETH (makerToken), wants tokenAddress (takerToken)
      // Sell order: user deposits tokenAddress (makerToken), wants WETH (takerToken)
      // Vault debits from user's balance of sellToken, so we use makerAmount (what user deposited)
      const sellAmount = order.makerAmount;

      console.log(`📊 Getting 0x swap quote: ${sellAmount} ${isBuyOrder ? 'WETH' : order.tokenSymbol} → ${isBuyOrder ? order.tokenSymbol : 'WETH'}`);

      // ✅ CORRECT: Unified v2 endpoint with chainId parameter (per 0x docs 2024)
      const params = {
        chainId: '8453', // Base mainnet
        sellToken,
        buyToken,
        sellAmount: sellAmount || '0',
        taker: EXECUTOR_VAULT_ADDRESS,
        slippagePercentage: '0.01',
      };
      
      console.log(`🔍 0x API params:`, JSON.stringify(params, null, 2));
      
      const quoteUrl = `https://api.0x.org/swap/allowance-holder/quote?` + new URLSearchParams(params).toString();
      console.log(`🔍 Full 0x API URL: ${quoteUrl}`);

      const quoteResponse = await fetch(quoteUrl, {
        headers: {
          '0x-api-key': apiKey,
          '0x-version': 'v2',
        },
      });

      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text();
        console.error('0x API error:', errorText);
        
        // Check for permanent failures (no route found)
        let isPermanentFailure = false;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.message && (
            errorJson.message.includes('no Route matched') ||
            errorJson.message.includes('Insufficient liquidity')
          )) {
            isPermanentFailure = true;
          }
        } catch (e) {
          // Not JSON, check text
          if (errorText.includes('no Route matched') || errorText.includes('Insufficient liquidity')) {
            isPermanentFailure = true;
          }
        }
        
        return { 
          success: false, 
          error: `0x API error: ${quoteResponse.status}`,
          isPermanentFailure,
          errorDetails: errorText
        };
      }

      const quote = await quoteResponse.json();
      
      console.log(`💱 Swap quote received: ${quote.buyAmount} ${isBuyOrder ? order.tokenSymbol : 'WETH'}`);
      console.log(`🔍 Quote response keys:`, Object.keys(quote));
      
      // 0x API v2: transaction data is nested under quote.transaction.data
      if (!quote.transaction || !quote.transaction.data) {
        console.error('❌ Invalid quote response - missing transaction.data:', quote);
        return {
          success: false,
          error: '0x API returned invalid quote (missing transaction data)',
          isPermanentFailure: true,
          errorDetails: 'Quote response missing required transaction.data field'
        };
      }

      // Select vault and ABI based on order version
      // v1 = legacy manual withdrawal (no auto-withdraw)
      // v2 = auto-withdrawal via executorWithdraw
      // v3 = universal auto-withdrawal built into executeSwap
      let vaultAddress: string;
      let vaultABI: string[];
      let vaultLabel: string;
      let isV3 = false;
      
      if (order.vaultVersion === 'v3') {
        // V3 orders require V3 vault address to be configured
        if (!EXECUTOR_VAULT_V3_ADDRESS) {
          return {
            success: false,
            error: 'V3 vault not configured',
            isPermanentFailure: true,
            errorDetails: 'EXECUTOR_VAULT_V3_ADDRESS environment variable not set. Cannot execute V3 orders.'
          };
        }
        vaultAddress = EXECUTOR_VAULT_V3_ADDRESS;
        vaultABI = EXECUTOR_VAULT_V3_ABI;
        vaultLabel = 'v3';
        isV3 = true;
      } else if (order.vaultVersion === 'v1') {
        // V1 orders use V1 vault with manual withdrawal
        vaultAddress = EXECUTOR_VAULT_V1_ADDRESS;
        vaultABI = EXECUTOR_VAULT_V2_ABI; // V1/V2 use same ABI
        vaultLabel = 'v1';
      } else {
        // V2 orders (default) use V2 vault with executorWithdraw
        vaultAddress = EXECUTOR_VAULT_V2_ADDRESS;
        vaultABI = EXECUTOR_VAULT_V2_ABI;
        vaultLabel = 'v2';
      }
      
      console.log(`📦 Using ExecutorVault ${vaultLabel}: ${vaultAddress}`);
      
      // Create ExecutorVault contract instance with correct ABI
      const vaultContract = new ethers.Contract(
        vaultAddress,
        vaultABI,
        this.wallet
      );

      // Check if vault is paused
      const isPaused = await vaultContract.paused();
      if (isPaused) {
        return { success: false, error: 'ExecutorVault is paused' };
      }

      // Get user's wallet address from order (NOT userId which is FID!)
      if (!order.userWalletAddress) {
        return { 
          success: false, 
          error: 'Order missing userWalletAddress - cannot execute via vault' 
        };
      }
      
      const userWalletAddress = order.userWalletAddress;
      
      // Check user's vault balance for sellToken
      const userBalance = await vaultContract.balances(userWalletAddress, sellToken);
      const requiredAmount = ethers.getBigInt(sellAmount || '0');
      
      if (userBalance < requiredAmount) {
        const errorMsg = `Insufficient vault balance: ${ethers.formatEther(userBalance)} ${isBuyOrder ? 'WETH' : order.tokenSymbol} (need ${ethers.formatEther(requiredAmount)})`;
        return { 
          success: false, 
          error: errorMsg,
          isPermanentFailure: true, // User needs to deposit more funds
          errorDetails: `${errorMsg}. Please deposit WETH to ExecutorVault before creating orders.`
        };
      }

      // Calculate minimum buy amount (slippage protection - 1%)
      const buyAmountBigInt = ethers.getBigInt(quote.buyAmount);
      const minBuyAmount = (buyAmountBigInt * BigInt(99)) / BigInt(100);

      // Execute swap via ExecutorVault
      console.log(`📤 Executing swap via ExecutorVault ${vaultLabel}...`);
      console.log(`🎯 Swap Target (Settler): ${quote.transaction.to}`);
      console.log(`📝 Swap calldata length: ${quote.transaction.data.length} bytes`);
      console.log(`💰 Sell Amount: ${ethers.formatEther(sellAmount)} ${isBuyOrder ? 'WETH' : order.tokenSymbol}`);
      console.log(`📈 Min Buy Amount: ${ethers.formatEther(minBuyAmount)} ${isBuyOrder ? order.tokenSymbol : 'WETH'}`);
      
      // V3: Auto-withdrawal built into executeSwap
      // V2: Manual executorWithdraw after swap
      // V1: Manual user withdrawal via UI
      
      // ERC-8021: Append Builder Code suffix to calldata for Base attribution
      // Suffix is appended to the encoded tx data - ignored by EVM, read by Base indexers
      const appendBuilderCode = async (populatedTx: any) => {
        const rawData = populatedTx.data as string;
        const suffix = ERC8021_SUFFIX.slice(2); // strip '0x' prefix
        return { ...populatedTx, data: rawData + suffix };
      };

      let txData: any;
      if (isV3) {
        txData = await vaultContract.executeSwap.populateTransaction(
          userWalletAddress,
          sellToken,
          buyToken,
          sellAmount,
          minBuyAmount.toString(),
          quote.transaction.to,
          quote.transaction.data,
          order.id,
          true
        );
      } else {
        txData = await vaultContract.executeSwap.populateTransaction(
          userWalletAddress,
          sellToken,
          buyToken,
          sellAmount,
          minBuyAmount.toString(),
          quote.transaction.to,
          quote.transaction.data,
          order.id
        );
      }

      // Append ERC-8021 attribution suffix
      const txWithAttribution = await appendBuilderCode(txData);
      console.log(`🏷️ ERC-8021 Builder Code appended: ${BUILDER_CODE}`);

      const tx = await this.wallet!.sendTransaction(txWithAttribution);

      console.log(`⏳ Waiting for swap confirmation: ${tx.hash}`);
      const receipt = await tx.wait();

      if (receipt && receipt.status === 1) {
        console.log(`✅ Swap successful! Block: ${receipt.blockNumber}`);
        
        // AUTO-WITHDRAWAL LOGIC:
        // V3: Automatic (built into executeSwap with autoWithdraw=true)
        // V2: Manual executorWithdraw call after swap
        // V1: User manually withdraws via UI
        
        if (isV3) {
          // V3: Auto-withdrawal already happened in executeSwap
          console.log(`✅ V3 AUTO-WITHDRAWAL: Tokens automatically sent to user wallet!`);
        } else if (order.vaultVersion === 'v2' || !order.vaultVersion) {
          // V2: Call executorWithdraw to send tokens to user wallet
          try {
            console.log(`🔄 V2 Auto-withdrawing ${isBuyOrder ? order.tokenSymbol : 'WETH'} to ${userWalletAddress}...`);
            
            const withdrawTx = await vaultContract.executorWithdraw(
              userWalletAddress,
              buyToken,
              ethers.MaxUint256 // Withdraw all balance
            );
            
            console.log(`⏳ Waiting for withdrawal confirmation: ${withdrawTx.hash}`);
            const withdrawReceipt = await withdrawTx.wait();
            
            if (withdrawReceipt && withdrawReceipt.status === 1) {
              console.log(`✅ V2 AUTO-WITHDRAWAL SUCCESSFUL! Tokens sent to user wallet.`);
            } else {
              console.warn(`⚠️ V2 Auto-withdrawal transaction failed - user can manually withdraw`);
            }
          } catch (withdrawError: any) {
            console.error('V2 Auto-withdrawal error:', withdrawError.message || withdrawError);
            console.warn(`⚠️ Swap succeeded but auto-withdrawal failed. User can withdraw manually.`);
          }
        } else {
          // V1: No auto-withdrawal
          console.log(`ℹ️  V1 order - tokens available in vault for manual withdrawal`);
        }
        
        return { success: true, txHash: tx.hash };
      } else {
        return { success: false, error: 'Swap transaction failed' };
      }

    } catch (error: any) {
      console.error('Error executing swap:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }
}
