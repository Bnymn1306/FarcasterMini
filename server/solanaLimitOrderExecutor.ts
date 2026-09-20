import { IStorage } from './storage';
import type { LimitOrder } from '@shared/schema';
import { getSolanaEscrowService, SolanaEscrowService } from './solanaEscrow';

interface PriceCache {
  price: number;
  timestamp: number;
}

export class SolanaLimitOrderExecutor {
  private storage: IStorage;
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private checkIntervalMs: number;
  private priceCache: Map<string, PriceCache> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache
  private escrowService: SolanaEscrowService;

  constructor(storage: IStorage, checkIntervalMs: number = 30000) {
    this.storage = storage;
    this.checkIntervalMs = checkIntervalMs;
    this.escrowService = getSolanaEscrowService();
    console.log('🌞 Solana Limit Order Executor initialized');
  }

  start() {
    if (this.intervalId) {
      console.log('⚠️ Solana limit order executor already running');
      return;
    }

    console.log(`🌞 Starting Solana limit order executor (check interval: ${this.checkIntervalMs}ms)`);
    
    // Run immediately on start
    this.checkAndExecuteOrders().catch(err => {
      console.error('❌ Error in initial Solana limit order check:', err);
    });
    
    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkAndExecuteOrders().catch(err => {
        console.error('❌ Error in periodic Solana limit order check:', err);
      });
    }, this.checkIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Solana limit order executor stopped');
    }
  }

  private async checkAndExecuteOrders() {
    if (this.isProcessing) {
      console.log('⏭️ Previous Solana check still processing, skipping...');
      return;
    }

    this.isProcessing = true;

    try {
      // First, retry any pending transfers
      await this.retryPendingTransfers();
      
      // Get all fillable Solana orders
      const allOrders = await this.storage.getFillableLimitOrders();
      const solanaOrders = allOrders.filter(order => order.chain === 'solana');
      
      console.log(`🌞 Solana limit order check: ${solanaOrders.length} active orders`);
      
      if (solanaOrders.length === 0) {
        return;
      }

      for (const order of solanaOrders) {
        try {
          await this.processOrder(order);
        } catch (error) {
          console.error(`❌ Error processing Solana order ${order.id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Error in Solana limit order executor:', error);
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Retry transfers for orders where swap succeeded but transfer failed
   */
  private async retryPendingTransfers() {
    try {
      const allOrders = await this.storage.getAllLimitOrders();
      const pendingTransfers = allOrders.filter(
        order => order.chain === 'solana' && order.status === 'transfer_pending'
      );
      
      if (pendingTransfers.length === 0) {
        return;
      }
      
      console.log(`🔄 Retrying ${pendingTransfers.length} pending transfers...`);
      
      for (const order of pendingTransfers) {
        try {
          // Parse failure reason to extract token and amount info
          const failureReason = order.failureReason || '';
          const tokenMatch = failureReason.match(/Token: ([A-Za-z0-9]+)/);
          const amountMatch = failureReason.match(/Amount: (\d+)/);
          
          if (!tokenMatch || !amountMatch || !order.userWalletAddress) {
            console.error(`❌ Cannot retry transfer for order ${order.id} - missing info`);
            continue;
          }
          
          const outputMint = tokenMatch[1];
          const outputAmount = amountMatch[1];
          
          console.log(`📤 Retrying transfer for order ${order.id}: ${outputAmount} of ${outputMint} to ${order.userWalletAddress}`);
          
          const result = await this.escrowService.transferTokenToUser(
            order.userWalletAddress,
            outputMint,
            outputAmount
          );
          
          if (result.success) {
            console.log(`✅ Retry transfer successful for order ${order.id}: ${result.signature}`);
            await this.storage.updateLimitOrder(order.id, {
              status: 'filled',
              signature: result.signature,
              failureReason: null,
            });
          } else {
            console.log(`⚠️ Retry transfer failed for order ${order.id}: ${result.error}`);
          }
        } catch (error) {
          console.error(`❌ Error retrying transfer for order ${order.id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Error in retryPendingTransfers:', error);
    }
  }

  private async processOrder(order: LimitOrder) {
    try {
      console.log(`🌞 Processing Solana order: ${order.orderType} ${order.tokenSymbol} @ target $${order.targetPrice}`);
      
      if (!order.targetPrice) {
        console.log(`⚠️ Solana order ${order.id} missing target price, skipping`);
        return;
      }

      // Skip orders already being executed or completed
      if (order.status === 'executing' || order.status === 'filled') {
        return;
      }

      // Get current price from DEXScreener (Solana support)
      const currentPrice = await this.getCurrentPrice(order.tokenAddress);
      
      if (!currentPrice) {
        console.log(`⚠️ Could not fetch Solana price for ${order.tokenSymbol} (${order.tokenAddress})`);
        return;
      }

      console.log(`💵 Current Solana price for ${order.tokenSymbol}: $${currentPrice}`);
      
      const targetPrice = parseFloat(order.targetPrice);
      const shouldExecute = this.shouldExecuteOrder(order.orderType, currentPrice, targetPrice);

      if (shouldExecute) {
        console.log(`✅ Solana order ready! ${order.orderType} ${order.tokenSymbol}: current=$${currentPrice}, target=$${targetPrice}`);
        
        // Parse order JSON for mint addresses
        let orderData: any = {};
        try {
          orderData = order.orderJson ? JSON.parse(order.orderJson) : {};
        } catch (e) {
          console.error('Failed to parse order JSON:', e);
        }
        
        const inputMint = orderData.inputMint || order.makerToken;
        const outputMint = orderData.outputMint || order.takerToken;
        const inputAmount = order.makerAmount || orderData.makingAmount;
        
        if (!inputMint || !outputMint || !inputAmount) {
          console.error(`❌ Solana order ${order.id} missing mint/amount info, cannot execute`);
          await this.storage.updateLimitOrder(order.id, {
            status: 'failed',
            filledPrice: currentPrice.toString(),
          });
          return;
        }
        
        // SECURITY: Verify the deposit is still valid and not already used
        // This uses the in-memory verification (orders created after restart won't have this,
        // but their deposits are still tracked by signature in the order)
        const orderIdStr = order.orderHash || order.id.toString();
        const depositInfo = this.escrowService.getDepositInfo(orderIdStr);
        
        if (depositInfo) {
          if (depositInfo.usedForExecution) {
            console.error(`❌ Solana order ${order.id} deposit already used, skipping`);
            await this.storage.updateLimitOrder(order.id, {
              status: 'failed',
              filledPrice: currentPrice.toString(),
            });
            return;
          }
          
          // Verify the deposit matches this order's user
          if (depositInfo.userWallet !== order.userWalletAddress) {
            console.error(`❌ Solana order ${order.id} deposit user mismatch, skipping`);
            await this.storage.updateLimitOrder(order.id, {
              status: 'failed',
              filledPrice: currentPrice.toString(),
            });
            return;
          }
          
          console.log(`✅ Deposit verified for order ${order.id}: ${depositInfo.amount.toString()} from ${depositInfo.userWallet.slice(0,8)}...`);
        } else {
          // For orders created before restart, trust the deposit signature stored in the order
          const depositSig = orderData.depositTxSignature || order.signature;
          if (!depositSig) {
            console.error(`❌ Solana order ${order.id} has no deposit signature, skipping`);
            await this.storage.updateLimitOrder(order.id, {
              status: 'failed',
              filledPrice: currentPrice.toString(),
            });
            return;
          }
          console.log(`⚠️ Order ${order.id} deposit not in memory cache, using stored signature: ${depositSig.slice(0,16)}...`);
        }
        
        // Mark as executing to prevent double execution
        await this.storage.updateLimitOrder(order.id, {
          status: 'executing',
        });
        
        console.log(`🔄 Executing Solana order ${order.id} via escrow...`);
        
        // Ensure we have a valid wallet address
        const userWallet = order.userWalletAddress;
        if (!userWallet) {
          console.error(`❌ Solana order ${order.id} has no user wallet address, skipping`);
          await this.storage.updateLimitOrder(order.id, {
            status: 'failed',
            filledPrice: currentPrice.toString(),
          });
          return;
        }
        
        // Execute the swap using escrowed funds
        // Use 5% slippage for meme coins - they are very volatile
        const result = await this.escrowService.executeSwap(
          userWallet,
          inputMint,
          outputMint,
          inputAmount,
          500 // 5% slippage for volatile meme coins
        );
        
        if (result.success) {
          console.log(`✅ Solana order ${order.id} executed successfully!`);
          console.log(`   TX: ${result.outputTxSignature}`);
          console.log(`   Output amount: ${result.outputAmount}`);
          
          // SECURITY: Mark deposit as used to prevent double-spending
          this.escrowService.markDepositAsUsed(orderIdStr);
          
          await this.storage.updateLimitOrder(order.id, {
            status: 'filled',
            filledPrice: currentPrice.toString(),
            filledAt: new Date(),
            // Store tx hash in signature field since that's what schema has
            signature: result.outputTxSignature,
          });
        } else if (result.error?.startsWith('SWAP_OK_TRANSFER_FAILED')) {
          // Special case: Swap succeeded but token transfer to user failed
          // Mark as transfer_pending so we can retry the transfer
          console.error(`⚠️ Solana order ${order.id} swap succeeded but transfer failed!`);
          console.error(`   Error: ${result.error}`);
          
          // Mark deposit as used since swap was successful
          this.escrowService.markDepositAsUsed(orderIdStr);
          
          await this.storage.updateLimitOrder(order.id, {
            status: 'transfer_pending',
            filledPrice: currentPrice.toString(),
            filledAt: new Date(),
            signature: result.outputTxSignature, // Store swap tx for reference
            failureReason: result.error,
          });
        } else {
          console.error(`❌ Solana order ${order.id} execution failed:`, result.error);
          
          // Mark as failed but keep funds in escrow for retry or refund
          await this.storage.updateLimitOrder(order.id, {
            status: 'failed',
            filledPrice: currentPrice.toString(),
            failureReason: result.error,
          });
        }
      } else {
        console.log(`⏸️ Solana order not ready: ${order.orderType} ${order.tokenSymbol} - current=$${currentPrice}, target=$${targetPrice}`);
      }
    } catch (error) {
      console.error(`❌ Error processing Solana order ${order.id}:`, error);
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
      // Check cache first
      const cached = this.priceCache.get(tokenAddress);
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
        return cached.price;
      }

      // Use DEXScreener API for Solana token prices
      const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
      
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`DEXScreener API error for Solana (${response.status}):`, await response.text());
        
        // Return stale cache if available
        if (cached) {
          console.log(`⚠️ Using stale cache for Solana token ${tokenAddress}`);
          return cached.price;
        }
        return null;
      }

      const data = await response.json();
      
      if (!data.pairs || data.pairs.length === 0) {
        console.error(`No DEX pairs found for Solana token ${tokenAddress}`);
        return null;
      }
      
      // Filter for Solana pairs and sort by liquidity
      const solanaPairs = data.pairs
        .filter((pair: any) => pair.chainId === 'solana')
        .sort((a: any, b: any) => {
          const liquidityA = a.liquidity?.usd || 0;
          const liquidityB = b.liquidity?.usd || 0;
          return liquidityB - liquidityA;
        });
      
      if (solanaPairs.length === 0) {
        console.error(`No Solana pairs found for token ${tokenAddress}`);
        return null;
      }
      
      // Use the most liquid pair's price
      const bestPair = solanaPairs[0];
      const price = parseFloat(bestPair.priceUsd);
      
      if (isNaN(price)) {
        console.error(`Invalid Solana price data for token ${tokenAddress}`);
        return null;
      }
      
      console.log(`📊 DEXScreener Solana price for ${tokenAddress}: $${price} (liquidity: $${bestPair.liquidity?.usd || 0})`);
      
      // Update cache
      this.priceCache.set(tokenAddress, {
        price,
        timestamp: Date.now()
      });
      
      return price;
    } catch (error) {
      console.error('Error fetching Solana current price:', error);
      return null;
    }
  }
}
