import { IStorage } from './storage';
import type { LimitOrder } from '@shared/schema';
import { ethers } from 'ethers';

// ERC-8021 Builder Code attribution for Base ecosystem
const BUILDER_CODE = "bc_juic0ljs";
const ERC8021_SUFFIX = "8021" + Buffer.from(BUILDER_CODE, 'utf8').toString('hex');

const INK_RPC_URL = process.env.INK_RPC_URL || "https://rpc-gel.inkonchain.com";
const INK_CHAIN_ID = 57073;

const INK_EXECUTOR_VAULT_ADDRESS = process.env.INK_EXECUTOR_VAULT_ADDRESS || "";
const INK_WETH = "0x4200000000000000000000000000000000000006";

const LIFI_INK_ROUTER = "0x864b314D4C5a0399368609581d3E8933a63b9232";
const LIFI_API = "https://li.quest/v1";

const EXECUTOR_VAULT_V3_ABI = [
  "function executeSwap(address user, address fromToken, address toToken, uint256 fromAmount, uint256 minToAmount, address swapTarget, bytes calldata swapCallData, string calldata orderId, bool autoWithdraw) external returns (uint256)",
  "function executorWithdraw(address user, address token, uint256 amount) external",
  "function balances(address user, address token) external view returns (uint256)",
  "function approvedTokens(address token) external view returns (bool)",
  "function blacklistedTokens(address token) external view returns (bool)",
  "function paused() external view returns (bool)"
];

const ERC20_ABI = [
  "function decimals() external view returns (uint8)"
];

interface PriceCache {
  price: number;
  timestamp: number;
}

interface TokenInfo {
  decimals: number;
  timestamp: number;
}

interface LiFiQuoteResult {
  calldata: string;
  minToAmount: bigint;
  expectedToAmount: bigint;
  toToken: string;
}

export class InkLimitOrderExecutor {
  private storage: IStorage;
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private checkIntervalMs: number;
  private priceCache: Map<string, PriceCache> = new Map();
  private tokenInfoCache: Map<string, TokenInfo> = new Map();
  private readonly CACHE_TTL_MS = 60000;
  private readonly TOKEN_CACHE_TTL_MS = 86400000;
  private wallet: ethers.Wallet | null = null;
  private provider: ethers.JsonRpcProvider | null = null;

  constructor(storage: IStorage, checkIntervalMs: number = 30000) {
    this.storage = storage;
    this.checkIntervalMs = checkIntervalMs;

    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

    if (privateKey && INK_EXECUTOR_VAULT_ADDRESS) {
      this.provider = new ethers.JsonRpcProvider(INK_RPC_URL);
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      console.log(`🖊️ INK Limit Order Executor initialized: ${this.wallet.address}`);
      console.log(`🖊️ INK Vault: ${INK_EXECUTOR_VAULT_ADDRESS}`);
      console.log(`🖊️ INK Swap via LI.FI router: ${LIFI_INK_ROUTER}`);
    } else {
      if (!INK_EXECUTOR_VAULT_ADDRESS) {
        console.log('⚠️ INK_EXECUTOR_VAULT_ADDRESS not set - INK limit orders disabled');
      }
      if (!privateKey) {
        console.log('⚠️ DEPLOYER_PRIVATE_KEY not set - INK limit orders disabled');
      }
    }
  }

  start() {
    if (!INK_EXECUTOR_VAULT_ADDRESS || !this.wallet) {
      console.log('⚠️ INK limit order executor not started - vault not configured');
      return;
    }

    if (this.intervalId) {
      console.log('⚠️ INK limit order executor already running');
      return;
    }

    console.log(`🖊️ Starting INK limit order executor (check interval: ${this.checkIntervalMs}ms)`);

    this.checkAndExecuteOrders().catch(err => {
      console.error('❌ Error in initial INK limit order check:', err);
    });

    this.intervalId = setInterval(() => {
      this.checkAndExecuteOrders().catch(err => {
        console.error('❌ Error in periodic INK limit order check:', err);
      });
    }, this.checkIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 INK limit order executor stopped');
    }
  }

  private async checkAndExecuteOrders() {
    if (this.isProcessing) {
      console.log('⏭️ Previous INK check still processing, skipping...');
      return;
    }

    this.isProcessing = true;

    try {
      const allOrders = await this.storage.getFillableLimitOrders();
      const inkOrders = allOrders.filter(order => order.chain === 'ink');

      console.log(`🖊️ INK limit order check: ${inkOrders.length} active orders`);

      if (inkOrders.length === 0) {
        return;
      }

      for (const order of inkOrders) {
        try {
          await this.processOrder(order);
        } catch (error) {
          console.error(`❌ Error processing INK order ${order.id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Error in INK limit order executor:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processOrder(order: LimitOrder) {
    try {
      console.log(`🖊️ Processing INK order: ${order.orderType} ${order.tokenSymbol} @ target $${order.targetPrice}`);

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
        console.log(`✅ Price condition met for ${order.tokenSymbol}! Executing INK order...`);
        await this.executeOrder(order, currentPrice);
      } else {
        console.log(`⏸️ Order not ready: ${order.orderType} ${order.tokenSymbol} - current=$${currentPrice}, target=$${targetPrice}`);
      }
    } catch (error) {
      console.error(`❌ Error processing INK order ${order.id}:`, error);
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
      const inkPair = data.pairs?.find((p: any) => p.chainId === 'ink');

      if (inkPair && inkPair.priceUsd) {
        const price = parseFloat(inkPair.priceUsd);
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
    if (tokenAddress.toLowerCase() === INK_WETH.toLowerCase()) {
      return 18;
    }

    const cacheKey = tokenAddress.toLowerCase();
    const cached = this.tokenInfoCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.TOKEN_CACHE_TTL_MS) {
      return cached.decimals;
    }

    try {
      if (!this.provider) return 18;

      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
      const decimals = await tokenContract.decimals();

      this.tokenInfoCache.set(cacheKey, { decimals: Number(decimals), timestamp: Date.now() });
      return Number(decimals);
    } catch (error) {
      console.warn(`⚠️ Could not fetch decimals for ${tokenAddress}, defaulting to 18`);
      return 18;
    }
  }

  private async getLiFiQuoteAndCalldata(
    fromToken: string,
    toToken: string,
    amountIn: bigint,
    vaultAddress: string
  ): Promise<LiFiQuoteResult | null> {
    try {
      const fromTokenAddr = fromToken.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
        ? '0x0000000000000000000000000000000000000000'
        : fromToken;
      const toTokenAddr = toToken.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
        ? '0x0000000000000000000000000000000000000000'
        : toToken;

      const params = new URLSearchParams({
        fromChain: String(INK_CHAIN_ID),
        toChain: String(INK_CHAIN_ID),
        fromToken: fromTokenAddr,
        toToken: toTokenAddr,
        fromAmount: amountIn.toString(),
        fromAddress: vaultAddress,
        toAddress: vaultAddress,
        slippage: '0.01',
        integrator: 'basedmem',
      });

      const url = `${LIFI_API}/quote?${params.toString()}`;
      console.log(`🔍 LI.FI INK quote: ${fromTokenAddr} → ${toTokenAddr}, amount=${amountIn}`);

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ LI.FI quote error ${response.status}:`, errText.slice(0, 200));
        return null;
      }

      const quote = await response.json();

      const txData = quote?.transactionRequest?.data;
      const txTo = quote?.transactionRequest?.to;
      const toAmount = quote?.estimate?.toAmount;
      const toAmountMin = quote?.estimate?.toAmountMin;

      if (!txData || !txTo) {
        console.error('❌ LI.FI quote missing transaction data');
        return null;
      }

      const expectedToAmount = BigInt(toAmount || '0');
      const minToAmount = BigInt(toAmountMin || '0');

      console.log(`✅ LI.FI INK quote: expected=${expectedToAmount}, min=${minToAmount}, router=${txTo}`);

      return {
        calldata: txData,
        minToAmount,
        expectedToAmount,
        toToken: toTokenAddr,
      };
    } catch (error: any) {
      console.error('❌ LI.FI quote fetch error:', error.message);
      return null;
    }
  }

  private async executeOrder(order: LimitOrder, currentPrice: number) {
    if (!this.wallet || !this.provider) {
      console.error('❌ Wallet not initialized');
      return;
    }

    try {
      console.log(`🖊️ Executing INK swap via ExecutorVault + LI.FI...`);

      await this.storage.updateLimitOrder(order.id, { filledPrice: currentPrice.toString() });

      const vault = new ethers.Contract(
        INK_EXECUTOR_VAULT_ADDRESS,
        EXECUTOR_VAULT_V3_ABI,
        this.wallet
      );

      const isPaused = await vault.paused();
      if (isPaused) {
        console.error('❌ INK Vault is paused');
        return;
      }

      const userAddress = order.userWalletAddress;
      if (!userAddress) {
        console.error('❌ Order missing user wallet address');
        return;
      }

      const fromToken = order.makerToken || INK_WETH;
      const toToken = order.takerToken || INK_WETH;
      const fromAmount = BigInt(order.makerAmount);

      const fromDecimals = await this.getTokenDecimals(fromToken);
      const toDecimals = await this.getTokenDecimals(toToken);

      const userBalance = await vault.balances(userAddress, fromToken);
      if (userBalance < fromAmount) {
        console.error(`❌ Insufficient vault balance: ${ethers.formatUnits(userBalance, fromDecimals)} < ${ethers.formatUnits(fromAmount, fromDecimals)}`);
        await this.storage.updateLimitOrder(order.id, { status: 'failed', failureReason: 'Insufficient vault balance' });
        return;
      }

      const lifiResult = await this.getLiFiQuoteAndCalldata(
        fromToken,
        toToken,
        fromAmount,
        INK_EXECUTOR_VAULT_ADDRESS
      );

      if (!lifiResult) {
        console.error('❌ Could not get swap calldata from LI.FI');
        return;
      }

      const { calldata: swapCallData, minToAmount } = lifiResult;

      if (minToAmount === BigInt(0)) {
        console.error('❌ LI.FI returned zero min amount');
        return;
      }

      console.log(`🔄 Executing INK swap: ${ethers.formatUnits(fromAmount, fromDecimals)} → min ${ethers.formatUnits(minToAmount, toDecimals)}`);

      const feeData = await this.provider!.getFeeData();
      const gasOverrides: any = {};
      if (feeData.maxFeePerGas) {
        const boostedMaxFee = (feeData.maxFeePerGas * BigInt(150)) / BigInt(100);
        let boostedPriority = feeData.maxPriorityFeePerGas
          ? (feeData.maxPriorityFeePerGas * BigInt(150)) / BigInt(100)
          : ethers.parseUnits('0.001', 'gwei');
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
        LIFI_INK_ROUTER,
        swapCallData,
        order.id,
        true
      );
      // Append ERC-8021 Builder Code attribution suffix
      const txWithAttribution = { ...txData, ...gasOverrides, data: txData.data + ERC8021_SUFFIX };
      console.log(`🏷️ ERC-8021 Builder Code appended: ${BUILDER_CODE}`);
      const tx = await this.wallet!.sendTransaction(txWithAttribution);

      console.log(`📝 INK TX submitted: ${tx.hash}`);
      const receipt = await tx.wait(1);

      if (receipt.status === 1) {
        console.log(`✅ INK order ${order.id} filled successfully!`);
        await this.storage.updateLimitOrder(order.id, {
          status: 'filled',
          filledPrice: currentPrice.toString(),
          txHash: tx.hash,
          filledAt: new Date()
        });
      } else {
        console.error(`❌ INK transaction failed`);
        await this.storage.updateLimitOrder(order.id, { status: 'failed', failureReason: 'Transaction reverted' });
      }
    } catch (error: any) {
      console.error(`❌ Error executing INK order:`, error.message);

      if (error.message?.includes('user rejected') || error.message?.includes('denied')) {
        return;
      }

      const currentFailureReason = order.failureReason || '';
      const retryMatch = currentFailureReason.match(/^\[RETRY:(\d+)\]/);
      const retryCount = retryMatch ? parseInt(retryMatch[1]) + 1 : 1;

      if (retryCount >= 3) {
        console.error(`❌ INK order ${order.id} failed after ${retryCount} retries`);
        await this.storage.updateLimitOrder(order.id, {
          status: 'failed',
          failureReason: `Max retries exceeded: ${error.message?.slice(0, 80)}`
        });
      } else {
        await this.storage.updateLimitOrder(order.id, {
          status: 'fillable',
          failureReason: `[RETRY:${retryCount}] ${error.message?.slice(0, 80)}`
        });
      }
    }
  }
}

let inkExecutorInstance: InkLimitOrderExecutor | null = null;

export function getInkLimitOrderExecutor(storage: IStorage): InkLimitOrderExecutor {
  if (!inkExecutorInstance) {
    inkExecutorInstance = new InkLimitOrderExecutor(storage);
  }
  return inkExecutorInstance;
}
