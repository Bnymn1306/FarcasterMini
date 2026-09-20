import { IStorage } from './storage';
import { rugpullDetector, type MonitoredToken, type RugpullSignal } from './rugpullDetector';
import { ethers } from 'ethers';
import type { RugProtection } from '@shared/schema';

const EXECUTOR_VAULT_V3_ADDRESS = process.env.EXECUTOR_VAULT_V3_ADDRESS || "0x3905022308C9BdE5581078Ca4A9e413b608F764e";
const WETH_BASE = '0x4200000000000000000000000000000000000006';

const EXECUTOR_VAULT_V3_ABI = [
  "function executeSwap(address user, address fromToken, address toToken, uint256 fromAmount, uint256 minToAmount, address swapTarget, bytes calldata swapCallData, string calldata orderId, bool autoWithdraw) external returns (uint256)",
  "function balances(address user, address token) external view returns (uint256)",
  "function paused() external view returns (bool)"
];

export class RugProtectionExecutor {
  private storage: IStorage;
  private intervalId: NodeJS.Timeout | null = null;
  private wallet: ethers.Wallet | null = null;
  private provider: ethers.JsonRpcProvider | null = null;

  constructor(storage: IStorage) {
    this.storage = storage;
    
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const rpcUrl = process.env.BASE_RPC_URL;
    
    if (privateKey && rpcUrl) {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      console.log(`🛡️ RugProtection Executor wallet initialized: ${this.wallet.address}`);
    } else {
      console.warn('⚠️ Backend wallet not configured - rug protection auto-sell disabled');
    }

    this.setupAutoSellCallback();
  }

  private setupAutoSellCallback() {
    rugpullDetector.setAutoSellCallback(async (token: MonitoredToken, signal: RugpullSignal): Promise<boolean> => {
      console.log(`🚨 Auto-sell callback triggered for ${token.tokenAddress}`);
      console.log(`   Signal: ${signal.type} - ${signal.severity}`);
      console.log(`   Message: ${signal.message}`);

      try {
        const protection = await this.storage.getRugProtectionByToken(
          token.userAddress,
          token.tokenAddress
        );

        if (!protection) {
          console.log(`⚠️ No rug protection found for ${token.tokenAddress} / ${token.userAddress}`);
          return false;
        }

        if (protection.status !== 'active') {
          console.log(`⚠️ Rug protection not active (status: ${protection.status})`);
          return false;
        }

        await this.storage.updateRugProtection(protection.id, {
          lastSignalType: signal.type,
          lastSignalSeverity: signal.severity,
          lastSignalMessage: signal.message,
        });

        const result = await this.executeAutoSell(protection, signal);
        return result.success;
      } catch (error) {
        console.error('Auto-sell callback error:', error);
        return false;
      }
    });
  }

  private async executeAutoSell(protection: RugProtection, signal: RugpullSignal): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      if (!this.wallet || !this.provider) {
        return { success: false, error: 'Wallet not initialized' };
      }

      const apiKey = process.env.OX_API_KEY;
      if (!apiKey) {
        return { success: false, error: '0x API key not configured' };
      }

      console.log(`🔄 Executing emergency sell for ${protection.tokenSymbol}`);
      console.log(`   User: ${protection.userWalletAddress}`);
      console.log(`   Amount: ${protection.depositAmount}`);

      const sellToken = protection.tokenAddress;
      const buyToken = WETH_BASE;
      const sellAmount = protection.depositAmount;

      const params = {
        chainId: '8453',
        sellToken,
        buyToken,
        sellAmount,
        taker: EXECUTOR_VAULT_V3_ADDRESS,
        slippagePercentage: '0.05',
      };

      const quoteUrl = `https://api.0x.org/swap/allowance-holder/quote?` + new URLSearchParams(params).toString();
      console.log(`🔍 Getting 0x quote for emergency sell...`);

      const quoteResponse = await fetch(quoteUrl, {
        headers: {
          '0x-api-key': apiKey,
          '0x-version': 'v2',
        },
      });

      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text();
        console.error('0x API error:', errorText);
        
        await this.storage.updateRugProtection(protection.id, {
          status: 'failed',
          failureReason: `0x API error: ${quoteResponse.status} - ${errorText.substring(0, 200)}`,
        });
        
        return { success: false, error: `0x API error: ${quoteResponse.status}` };
      }

      const quote = await quoteResponse.json();
      
      if (!quote.transaction || !quote.transaction.data) {
        console.error('Invalid quote response - missing transaction data');
        await this.storage.updateRugProtection(protection.id, {
          status: 'failed',
          failureReason: 'Invalid 0x quote response',
        });
        return { success: false, error: 'Invalid 0x quote response' };
      }

      console.log(`💱 Quote received: ${ethers.formatEther(quote.buyAmount)} WETH`);

      const vaultContract = new ethers.Contract(
        EXECUTOR_VAULT_V3_ADDRESS,
        EXECUTOR_VAULT_V3_ABI,
        this.wallet
      );

      const isPaused = await vaultContract.paused();
      if (isPaused) {
        await this.storage.updateRugProtection(protection.id, {
          status: 'failed',
          failureReason: 'ExecutorVault is paused',
        });
        return { success: false, error: 'ExecutorVault is paused' };
      }

      const userBalance = await vaultContract.balances(protection.userWalletAddress, sellToken);
      const requiredAmount = ethers.getBigInt(sellAmount);
      
      if (userBalance < requiredAmount) {
        await this.storage.updateRugProtection(protection.id, {
          status: 'failed',
          failureReason: `Insufficient vault balance: ${ethers.formatEther(userBalance)} (need ${ethers.formatEther(requiredAmount)})`,
        });
        return { success: false, error: 'Insufficient vault balance' };
      }

      const buyAmountBigInt = ethers.getBigInt(quote.buyAmount);
      const minBuyAmount = (buyAmountBigInt * BigInt(95)) / BigInt(100);

      console.log(`📤 Executing emergency swap via ExecutorVault V3...`);
      console.log(`   Swap Target: ${quote.transaction.to}`);
      console.log(`   Sell: ${ethers.formatUnits(sellAmount, protection.tokenDecimals || 18)} ${protection.tokenSymbol}`);
      console.log(`   Min Buy: ${ethers.formatEther(minBuyAmount)} WETH`);

      const tx = await vaultContract.executeSwap(
        protection.userWalletAddress,
        sellToken,
        buyToken,
        sellAmount,
        minBuyAmount.toString(),
        quote.transaction.to,
        quote.transaction.data,
        `rug-${protection.id}`,
        true
      );

      console.log(`⏳ Waiting for confirmation: ${tx.hash}`);
      const receipt = await tx.wait();

      if (receipt && receipt.status === 1) {
        console.log(`✅ Emergency sell successful! Block: ${receipt.blockNumber}`);
        
        await this.storage.updateRugProtection(protection.id, {
          status: 'sold',
          soldPrice: ethers.formatEther(quote.buyAmount),
          soldAmount: quote.buyAmount,
          txHash: tx.hash,
          soldAt: new Date(),
        });

        rugpullDetector.removeToken(protection.tokenAddress, protection.userWalletAddress);
        
        return { success: true, txHash: tx.hash };
      } else {
        await this.storage.updateRugProtection(protection.id, {
          status: 'failed',
          failureReason: 'Transaction failed',
        });
        return { success: false, error: 'Transaction failed' };
      }

    } catch (error: any) {
      console.error('Execute auto-sell error:', error);
      
      await this.storage.updateRugProtection(protection.id, {
        status: 'failed',
        failureReason: error.message || 'Unknown error',
      });
      
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  async syncActiveProtections() {
    try {
      const activeProtections = await this.storage.getActiveRugProtections();
      console.log(`🔄 Syncing ${activeProtections.length} active rug protections to detector`);

      for (const protection of activeProtections) {
        const existing = rugpullDetector.getToken(protection.tokenAddress, protection.userWalletAddress);
        
        if (!existing) {
          await rugpullDetector.addToken({
            tokenAddress: protection.tokenAddress,
            userAddress: protection.userWalletAddress,
            userBalance: protection.depositAmount,
            initialLiquidity: protection.initialLiquidity || undefined,
            initialOwner: protection.initialOwner || undefined,
            initialBuyTax: protection.initialBuyTax || undefined,
            initialSellTax: protection.initialSellTax || undefined,
            autoSellEnabled: protection.autoSellEnabled,
            createdAt: new Date(protection.createdAt).getTime(),
          });
          console.log(`   Added ${protection.tokenSymbol} to detector`);
        }
      }
    } catch (error) {
      console.error('Error syncing active protections:', error);
    }
  }

  start(syncIntervalMs: number = 60000) {
    if (this.intervalId) {
      console.log('⚠️ RugProtection executor already running');
      return;
    }

    console.log(`🛡️ Starting RugProtection Executor (sync interval: ${syncIntervalMs}ms)`);
    
    this.syncActiveProtections().catch(err => {
      console.error('Initial sync error:', err);
    });

    this.intervalId = setInterval(() => {
      this.syncActiveProtections().catch(err => {
        console.error('Sync error:', err);
      });
    }, syncIntervalMs);

    if (!rugpullDetector.isActive()) {
      rugpullDetector.start();
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 RugProtection executor stopped');
    }
  }
}
