import { IStorage } from './storage';
import { runOwnedTick, claimSideEffect } from './background/ownership';
import type { LimitOrder } from '@shared/schema';
import { ethers } from 'ethers';

// ERC-8021 Builder Code attribution for Base ecosystem
const BUILDER_CODE = "bc_juic0ljs";
const ERC8021_SUFFIX = "8021" + Buffer.from(BUILDER_CODE, 'utf8').toString('hex');

const SONEIUM_RPC_URL = "https://rpc.soneium.org";
const SONEIUM_CHAIN_ID = 1868;

const SONEIUM_EXECUTOR_VAULT_ADDRESS = process.env.SONEIUM_EXECUTOR_VAULT_ADDRESS || "";
const KYO_SWAP_ROUTER = "0x0dC73Fe1341365929Ed8a89Dd47097A9FDD254D0";
const KYO_QUOTER_V2 = "0x60eb4B04932797374a291380349008dc8cc40426";
const SONEIUM_WETH = "0x4200000000000000000000000000000000000006";
const SONEIUM_USDC = "0xbA9986D2381edf1DA03B0B9c1f8b00dc4AacC369";

const EXECUTOR_VAULT_V3_ABI = [
  "function executeSwap(address user, address fromToken, address toToken, uint256 fromAmount, uint256 minToAmount, address swapTarget, bytes calldata swapCallData, string calldata orderId, bool autoWithdraw) external returns (uint256)",
  "function executorWithdraw(address user, address token, uint256 amount) external",
  "function balances(address user, address token) external view returns (uint256)",
  "function approvedTokens(address token) external view returns (bool)",
  "function blacklistedTokens(address token) external view returns (bool)",
  "function paused() external view returns (bool)"
];

const UNISWAP_V3_SWAP_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
  "function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)"
];

const QUOTER_V2_ABI = [
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
  "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)"
];

const FEE_TIERS = [3000, 10000, 500, 100];

interface PriceCache {
  price: number;
  timestamp: number;
}

interface TokenInfo {
  decimals: number;
  timestamp: number;
}

const ERC20_ABI = [
  "function decimals() external view returns (uint8)"
];

export class SoneiumLimitOrderExecutor {
  private storage: IStorage;
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private checkIntervalMs: number;
  private priceCache: Map<string, PriceCache> = new Map();
  private tokenInfoCache: Map<string, TokenInfo> = new Map();
  private readonly CACHE_TTL_MS = 60000;
  private readonly TOKEN_CACHE_TTL_MS = 86400000; // 24 hours for token info
  private wallet: ethers.Wallet | null = null;
  private provider: ethers.JsonRpcProvider | null = null;

  constructor(storage: IStorage, checkIntervalMs: number = 30000) {
    this.storage = storage;
    this.checkIntervalMs = checkIntervalMs;
    
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    
    if (privateKey && SONEIUM_EXECUTOR_VAULT_ADDRESS) {
      this.provider = new ethers.JsonRpcProvider(SONEIUM_RPC_URL);
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      console.log(`🟣 Soneium Limit Order Executor initialized: ${this.wallet.address}`);
      console.log(`🟣 Soneium Vault: ${SONEIUM_EXECUTOR_VAULT_ADDRESS}`);
    } else {
      if (!SONEIUM_EXECUTOR_VAULT_ADDRESS) {
        console.log('⚠️ SONEIUM_EXECUTOR_VAULT_ADDRESS not set - Soneium limit orders disabled');
      }
      if (!privateKey) {
        console.log('⚠️ DEPLOYER_PRIVATE_KEY not set - Soneium limit orders disabled');
      }
    }
  }

  start() {
    if (!SONEIUM_EXECUTOR_VAULT_ADDRESS || !this.wallet) {
      console.log('⚠️ Soneium limit order executor not started - vault not configured');
      return;
    }

    if (this.intervalId) {
      console.log('⚠️ Soneium limit order executor already running');
      return;
    }

    console.log(`🟣 Starting Soneium limit order executor (check interval: ${this.checkIntervalMs}ms)`);
    
    this.checkAndExecuteOrders().catch(err => {
      console.error('❌ Error in initial Soneium limit order check:', err);
    });
    
    this.intervalId = setInterval(() => {
      this.checkAndExecuteOrders().catch(err => {
        console.error('❌ Error in periodic Soneium limit order check:', err);
      });
    }, this.checkIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Soneium limit order executor stopped');
    }
  }

  public async tick(owner: "vm" | "workflow" = "vm", generation?: string) {
    return runOwnedTick("soneium", () => this.checkAndExecuteOrdersInternal(), owner, generation);
  }

  private async checkAndExecuteOrders() {
    return this.tick();
  }

  private async checkAndExecuteOrdersInternal() {
    if (this.isProcessing) {
      console.log('⏭️ Previous Soneium check still processing, skipping...');
      return;
    }

    this.isProcessing = true;

    try {
      const allOrders = await this.storage.getFillableLimitOrders();
      const soneiumOrders = allOrders.filter(order => order.chain === 'soneium');
      
      console.log(`🟣 Soneium limit order check: ${soneiumOrders.length} active orders`);
      
      if (soneiumOrders.length === 0) {
        return;
      }

      for (const order of soneiumOrders) {
        try {
          await this.processOrder(order);
        } catch (error) {
          console.error(`❌ Error processing Soneium order ${order.id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Error in Soneium limit order executor:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processOrder(order: LimitOrder) {
    try {
      console.log(`🟣 Processing Soneium order: ${order.orderType} ${order.tokenSymbol} @ target $${order.targetPrice}`);
      
      if (!order.targetPrice) {
        console.log(`⚠️ Order ${order.id} missing target price, skipping`);
        return;
      }

      const currentPrice = await this.getCurrentPrice(order.tokenAddress);
      
      if (!currentPrice) {
        console.log(`⚠️ Could not fetch price for ${order.tokenSymbol} (${order.tokenAddress})`);
        return;
      }

      console.log(`💵 Current price for ${order.tokenSymbol}: $${currentPrice}`);

      const targetPrice = parseFloat(order.targetPrice);
      const shouldExecute = this.checkPriceCondition(order.orderType, currentPrice, targetPrice);

      if (shouldExecute) {
        console.log(`✅ Price condition met for ${order.tokenSymbol}! Executing order...`);
        await this.executeOrder(order, currentPrice);
      } else {
        console.log(`⏸️ Order not ready: ${order.orderType} ${order.tokenSymbol} - current=$${currentPrice}, target=$${targetPrice}`);
      }
    } catch (error) {
      console.error(`❌ Error processing Soneium order ${order.id}:`, error);
    }
  }

  private checkPriceCondition(orderType: string, currentPrice: number, targetPrice: number): boolean {
    if (orderType === 'buy') {
      return currentPrice <= targetPrice;
    } else if (orderType === 'sell') {
      return currentPrice >= targetPrice;
    }
    return false;
  }

  private async getCurrentPrice(tokenAddress: string): Promise<number | null> {
    const cacheKey = tokenAddress.toLowerCase();
    const cached = this.priceCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.price;
    }

    try {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        { headers: { 'Accept': 'application/json' } }
      );
      
      if (!response.ok) {
        console.error(`DEXScreener API error: ${response.status}`);
        return null;
      }

      const data = await response.json();
      
      const soneiumPair = data.pairs?.find((p: any) => p.chainId === 'soneium');
      
      if (soneiumPair && soneiumPair.priceUsd) {
        const price = parseFloat(soneiumPair.priceUsd);
        this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
        console.log(`📊 DEXScreener price for ${tokenAddress}: $${price}`);
        return price;
      }

      return null;
    } catch (error) {
      console.error('Error fetching price from DEXScreener:', error);
      return null;
    }
  }

  private async getTokenDecimals(tokenAddress: string): Promise<number> {
    // WETH always has 18 decimals
    if (tokenAddress.toLowerCase() === SONEIUM_WETH.toLowerCase()) {
      return 18;
    }

    const cacheKey = tokenAddress.toLowerCase();
    const cached = this.tokenInfoCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.TOKEN_CACHE_TTL_MS) {
      return cached.decimals;
    }

    try {
      if (!this.provider) return 18; // Default to 18 if no provider
      
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
      const decimals = await tokenContract.decimals();
      
      this.tokenInfoCache.set(cacheKey, { decimals: Number(decimals), timestamp: Date.now() });
      return Number(decimals);
    } catch (error) {
      console.warn(`⚠️ Could not fetch decimals for ${tokenAddress}, defaulting to 18`);
      return 18; // Default to 18 decimals if call fails
    }
  }

  private async executeOrder(order: LimitOrder, currentPrice: number) {
    if (!await claimSideEffect(order.id, "swap")) return;
    if (!this.wallet || !this.provider) {
      console.error('❌ Wallet not initialized');
      return;
    }

    try {
      console.log(`🟣 Executing Soneium swap via ExecutorVault...`);
      
      // Update filled price but keep status as fillable until execution completes
      await this.storage.updateLimitOrder(order.id, { filledPrice: currentPrice.toString() });

      const vault = new ethers.Contract(
        SONEIUM_EXECUTOR_VAULT_ADDRESS,
        EXECUTOR_VAULT_V3_ABI,
        this.wallet
      );

      const isPaused = await vault.paused();
      if (isPaused) {
        console.error('❌ Vault is paused');
        return;
      }

      const userAddress = order.userWalletAddress;
      if (!userAddress) {
        console.error('❌ Order missing user wallet address');
        return;
      }

      const fromToken = order.makerToken;
      const toToken = order.takerToken;
      const fromAmount = BigInt(order.makerAmount);
      
      // Get token decimals for proper amount handling
      const fromDecimals = await this.getTokenDecimals(fromToken || SONEIUM_WETH);
      const toDecimals = await this.getTokenDecimals(toToken || SONEIUM_WETH);
      
      const userBalance = await vault.balances(userAddress, fromToken);
      if (userBalance < fromAmount) {
        console.error(`❌ Insufficient vault balance: ${ethers.formatUnits(userBalance, fromDecimals)} < ${ethers.formatUnits(fromAmount, fromDecimals)}`);
        await this.storage.updateLimitOrder(order.id, { status: 'failed', failureReason: 'Insufficient vault balance' });
        return;
      }

      const bestRoute = await this.findBestRoute(fromToken, toToken, fromAmount);
      if (!bestRoute) {
        console.error('❌ Could not get swap quote from any fee tier or route');
        return;
      }

      const minToAmount = (bestRoute.quote * BigInt(99)) / BigInt(100);

      const swapCallData = bestRoute.routeType === 'multi'
        ? this.encodeMultiHopSwapCall(bestRoute.path!, bestRoute.fees!, fromAmount, minToAmount, SONEIUM_EXECUTOR_VAULT_ADDRESS)
        : this.encodeSwapCall(fromToken, toToken, bestRoute.fee!, fromAmount, minToAmount, SONEIUM_EXECUTOR_VAULT_ADDRESS);

      console.log(`🔄 Executing swap: ${ethers.formatUnits(fromAmount, fromDecimals)} → min ${ethers.formatUnits(minToAmount, toDecimals)} (route: ${bestRoute.routeType}, fee: ${bestRoute.fee || bestRoute.fees?.join('-')})`);

      const feeData = await this.provider!.getFeeData();
      const gasOverrides: any = {};
      if (feeData.maxFeePerGas) {
        const boostedMaxFee = (feeData.maxFeePerGas * BigInt(150)) / BigInt(100);
        let boostedPriority = feeData.maxPriorityFeePerGas 
          ? (feeData.maxPriorityFeePerGas * BigInt(150)) / BigInt(100)
          : ethers.parseUnits('0.1', 'gwei');
        if (boostedPriority > boostedMaxFee) {
          boostedPriority = boostedMaxFee;
        }
        gasOverrides.maxFeePerGas = boostedMaxFee;
        gasOverrides.maxPriorityFeePerGas = boostedPriority;
      } else if (feeData.gasPrice) {
        gasOverrides.gasPrice = (feeData.gasPrice * BigInt(150)) / BigInt(100);
      }

      const txData = await vault.executeSwap.populateTransaction(
        userAddress,
        fromToken,
        toToken,
        fromAmount,
        minToAmount,
        KYO_SWAP_ROUTER,
        swapCallData,
        order.id,
        true
      );
      // Append ERC-8021 Builder Code attribution suffix
      const txWithAttribution = { ...txData, ...gasOverrides, data: txData.data + ERC8021_SUFFIX };
      console.log(`🏷️ ERC-8021 Builder Code appended: ${BUILDER_CODE}`);
      const tx = await this.wallet!.sendTransaction(txWithAttribution);

      console.log(`📝 TX submitted: ${tx.hash}`);
      const receipt = await tx.wait(1);

      if (receipt.status === 1) {
        console.log(`✅ Soneium order ${order.id} filled successfully!`);
        await this.storage.updateLimitOrder(order.id, { 
          status: 'filled', 
          filledPrice: currentPrice.toString(), 
          txHash: tx.hash,
          filledAt: new Date()
        });
      } else {
        console.error(`❌ Transaction failed`);
        await this.storage.updateLimitOrder(order.id, { status: 'failed', failureReason: 'Transaction reverted' });
      }
    } catch (error: any) {
      console.error(`❌ Error executing Soneium order:`, error.message);
      
      if (error.message?.includes('user rejected') || error.message?.includes('denied')) {
        return;
      }
      
      // Track retry attempts via failureReason prefix
      const currentFailureReason = order.failureReason || '';
      const retryMatch = currentFailureReason.match(/^\[RETRY:(\d+)\]/);
      const retryCount = retryMatch ? parseInt(retryMatch[1]) + 1 : 1;
      
      if (retryCount >= 3) {
        // After 3 retries, mark as failed permanently
        console.error(`❌ Order ${order.id} failed after ${retryCount} retries`);
        await this.storage.updateLimitOrder(order.id, { 
          status: 'failed', 
          failureReason: `Max retries exceeded: ${error.message?.slice(0, 80)}`
        });
      } else {
        // Keep as fillable but record retry count
        await this.storage.updateLimitOrder(order.id, { 
          status: 'fillable', 
          failureReason: `[RETRY:${retryCount}] ${error.message?.slice(0, 80)}`
        });
      }
    }
  }

  private encodePath(tokens: string[], fees: number[]): string {
    if (tokens.length !== fees.length + 1) throw new Error('Invalid path/fees length');
    let encoded = tokens[0].slice(2).toLowerCase();
    for (let i = 0; i < fees.length; i++) {
      encoded += fees[i].toString(16).padStart(6, '0');
      encoded += tokens[i + 1].slice(2).toLowerCase();
    }
    return '0x' + encoded;
  }

  private async findBestRoute(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<{
    quote: bigint;
    routeType: 'single' | 'multi';
    fee?: number;
    path?: string[];
    fees?: number[];
  } | null> {
    if (!this.provider) return null;

    const quoter = new ethers.Contract(KYO_QUOTER_V2, QUOTER_V2_ABI, this.provider);
    let bestQuote = BigInt(0);
    let bestRoute: any = null;

    for (const fee of FEE_TIERS) {
      try {
        const result = await quoter.quoteExactInputSingle.staticCall({
          tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0
        });
        const quoteAmount = result[0];
        if (quoteAmount > bestQuote) {
          bestQuote = quoteAmount;
          bestRoute = { quote: quoteAmount, routeType: 'single' as const, fee };
        }
      } catch {}
    }

    const intermediaries = [SONEIUM_WETH, SONEIUM_USDC];
    for (const mid of intermediaries) {
      if (mid.toLowerCase() === tokenIn.toLowerCase() || mid.toLowerCase() === tokenOut.toLowerCase()) continue;
      for (const fee1 of FEE_TIERS) {
        for (const fee2 of FEE_TIERS) {
          try {
            const path = this.encodePath([tokenIn, mid, tokenOut], [fee1, fee2]);
            const result = await quoter.quoteExactInput.staticCall(path, amountIn);
            const quoteAmount = result[0];
            if (quoteAmount > bestQuote) {
              bestQuote = quoteAmount;
              bestRoute = { quote: quoteAmount, routeType: 'multi' as const, path: [tokenIn, mid, tokenOut], fees: [fee1, fee2] };
            }
          } catch {}
        }
      }
    }

    if (bestRoute) {
      console.log(`📊 Best route: ${bestRoute.routeType}, quote: ${ethers.formatUnits(bestQuote, 18)}, fee: ${bestRoute.fee || bestRoute.fees?.join('-')}`);
    }

    return bestRoute;
  }

  private encodeSwapCall(
    tokenIn: string,
    tokenOut: string,
    fee: number,
    amountIn: bigint,
    amountOutMinimum: bigint,
    recipient: string
  ): string {
    const iface = new ethers.Interface(UNISWAP_V3_SWAP_ROUTER_ABI);
    
    const params = {
      tokenIn,
      tokenOut,
      fee,
      recipient,
      deadline: Math.floor(Date.now() / 1000) + 300,
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0
    };

    return iface.encodeFunctionData('exactInputSingle', [params]);
  }

  private encodeMultiHopSwapCall(
    pathTokens: string[],
    fees: number[],
    amountIn: bigint,
    amountOutMinimum: bigint,
    recipient: string
  ): string {
    const iface = new ethers.Interface(UNISWAP_V3_SWAP_ROUTER_ABI);
    const path = this.encodePath(pathTokens, fees);

    const params = {
      path,
      recipient,
      deadline: Math.floor(Date.now() / 1000) + 300,
      amountIn,
      amountOutMinimum
    };

    return iface.encodeFunctionData('exactInput', [params]);
  }
}

let soneiumExecutorInstance: SoneiumLimitOrderExecutor | null = null;

export function getSoneiumLimitOrderExecutor(storage: IStorage): SoneiumLimitOrderExecutor {
  if (!soneiumExecutorInstance) {
    soneiumExecutorInstance = new SoneiumLimitOrderExecutor(storage);
  }
  return soneiumExecutorInstance;
}
