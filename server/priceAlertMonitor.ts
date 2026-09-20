import { IStorage } from './storage';
import type { PriceAlert } from '@shared/schema';

interface PriceCache {
  price: number;
  timestamp: number;
}

export class PriceAlertMonitor {
  private storage: IStorage;
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private checkIntervalMs: number;
  private priceCache: Map<string, PriceCache> = new Map();
  private readonly CACHE_TTL_MS = 60000;

  constructor(storage: IStorage, checkIntervalMs: number = 60000) {
    this.storage = storage;
    this.checkIntervalMs = checkIntervalMs;
  }

  start() {
    if (this.intervalId) {
      console.log('⚠️ Price alert monitor already running');
      return;
    }

    console.log(`🔔 Starting price alert monitor (check interval: ${this.checkIntervalMs}ms)`);
    
    this.checkAlerts().catch(err => {
      console.error('❌ Error in initial price alert check:', err);
    });
    
    this.intervalId = setInterval(() => {
      this.checkAlerts().catch(err => {
        console.error('❌ Error in periodic price alert check:', err);
      });
    }, this.checkIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Price alert monitor stopped');
    }
  }

  private async checkAlerts() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const activeAlerts = await this.storage.getActivePriceAlerts();
      
      if (activeAlerts.length === 0) {
        return;
      }

      console.log(`🔔 Checking ${activeAlerts.length} active price alerts`);
      
      // Log details of each alert
      for (const alert of activeAlerts) {
        console.log(`   📋 Alert ${alert.id.slice(0,8)}: ${alert.externalTokenSymbol || 'Token'} ${alert.condition} $${alert.targetPrice} (user: ${alert.userId.slice(0,8)}...)`);
      }

      for (const alert of activeAlerts) {
        try {
          await this.processAlert(alert);
        } catch (error) {
          console.error(`❌ Error processing alert ${alert.id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Error in price alert monitor:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processAlert(alert: PriceAlert) {
    const tokenAddress = alert.externalTokenAddress || 
      (alert.tokenId ? await this.getTokenAddress(alert.tokenId) : null);
    
    if (!tokenAddress) {
      console.warn(`⚠️ No token address for alert ${alert.id}`);
      return;
    }

    const currentPrice = await this.getTokenPrice(tokenAddress);
    if (!currentPrice) {
      console.log(`   ❌ No price for ${alert.externalTokenSymbol || 'Token'} (${tokenAddress.slice(0,10)}...)`);
      return;
    }

    const targetPrice = parseFloat(alert.targetPrice);
    const shouldTrigger = alert.condition === 'above' 
      ? currentPrice >= targetPrice 
      : currentPrice <= targetPrice;
    
    console.log(`   💰 ${alert.externalTokenSymbol || 'Token'}: $${currentPrice.toFixed(6)} vs target $${targetPrice} (${alert.condition}) → ${shouldTrigger ? '🎯 TRIGGER!' : '⏳ waiting'}`);

    if (shouldTrigger) {
      console.log(`🎯 Alert triggered! ${alert.externalTokenSymbol || 'Token'} ${alert.condition} $${targetPrice} (current: $${currentPrice})`);
      
      await this.storage.updatePriceAlert(alert.id, {
        isTriggered: true,
        isActive: false,
        triggeredAt: new Date(),
      });

      if (alert.notifyViaFarcaster) {
        await this.sendFarcasterNotification(alert, currentPrice);
      }
    }
  }

  private async getTokenAddress(tokenId: string): Promise<string | null> {
    try {
      const token = await this.storage.getToken(tokenId);
      return token?.contractAddress || null;
    } catch {
      return null;
    }
  }

  private async getTokenPrice(tokenAddress: string): Promise<number | null> {
    const cached = this.priceCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.price;
    }

    try {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        { signal: AbortSignal.timeout(10000) }
      );
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      const pairs = data.pairs || [];
      
      if (pairs.length === 0) {
        return null;
      }

      const basePairs = pairs.filter((p: any) => p.chainId?.toLowerCase() === 'base');
      if (basePairs.length === 0) {
        // Fallback: use any pair if no Base-specific pairs found
        console.log(`⚠️ No Base pairs found for ${tokenAddress}, using top pair`);
        const topPair = pairs[0];
        if (topPair?.priceUsd) {
          const price = parseFloat(topPair.priceUsd);
          this.priceCache.set(tokenAddress, { price, timestamp: Date.now() });
          return price;
        }
        return null;
      }

      const bestPair = basePairs.reduce((best: any, current: any) => {
        const bestLiquidity = parseFloat(best.liquidity?.usd || '0');
        const currentLiquidity = parseFloat(current.liquidity?.usd || '0');
        return currentLiquidity > bestLiquidity ? current : best;
      });

      const price = parseFloat(bestPair.priceUsd || '0');
      
      this.priceCache.set(tokenAddress, { price, timestamp: Date.now() });
      
      return price;
    } catch (error) {
      console.error(`❌ Failed to get price for ${tokenAddress}:`, error);
      return null;
    }
  }

  private async sendFarcasterNotification(alert: PriceAlert, currentPrice: number) {
    try {
      const user = await this.storage.getUser(alert.userId);
      if (!user) {
        console.warn(`⚠️ User ${alert.userId} not found - skipping notification`);
        return;
      }

      const tokenSymbol = alert.externalTokenSymbol || 'Token';
      const targetPrice = parseFloat(alert.targetPrice);
      const direction = alert.condition === 'above' ? '📈' : '📉';
      
      // Check if user has Frame notification token (from addFrame)
      if (user.farcasterNotificationToken && user.farcasterNotificationUrl) {
        console.log(`🔔 Sending Frame notification to user ${user.id}...`);
        
        // Use Farcaster Frame Notification API
        const notificationPayload = {
          notificationId: `alert-${alert.id}`,
          title: `${direction} Price Alert: $${tokenSymbol}`,
          body: `${alert.condition === 'above' ? 'Above' : 'Below'} $${targetPrice.toFixed(6)} - Now: $${currentPrice.toFixed(6)}`,
          targetUrl: `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://basedmem.replit.app'}/alerts`,
          tokens: [user.farcasterNotificationToken],
        };
        
        try {
          const response = await fetch(user.farcasterNotificationUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(notificationPayload),
          });
          
          if (response.ok) {
            const result = await response.json();
            console.log(`✅ Frame notification sent to user ${user.id}:`, result);
            return;
          } else {
            const errorData = await response.text();
            console.error(`❌ Frame notification failed:`, errorData);
          }
        } catch (err) {
          console.error(`❌ Frame notification error:`, err);
        }
      }
      
      // Fallback: Try Neynar if user has FID but no notification token
      if (user.farcasterFid) {
        const apiKey = process.env.NEYNAR_API_KEY;
        if (apiKey) {
          console.log(`📤 Trying Neynar notification for FID ${user.farcasterFid}...`);
          
          // Send notification via Neynar webhook (requires paid plan)
          const message = `${direction} Price Alert!\n$${tokenSymbol} ${alert.condition === 'above' ? 'above' : 'below'} $${targetPrice.toFixed(6)}\nNow: $${currentPrice.toFixed(6)}`;
          
          try {
            const response = await fetch('https://api.neynar.com/v2/farcaster/notification', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
              },
              body: JSON.stringify({
                target_fids: [parseInt(user.farcasterFid, 10)],
                title: `${direction} $${tokenSymbol} Alert`,
                body: message,
                idempotency_key: `alert-${alert.id}-${Date.now()}`,
              }),
            });
            
            if (response.ok) {
              console.log(`✅ Neynar notification sent to FID ${user.farcasterFid}`);
              return;
            }
          } catch (err) {
            console.error(`❌ Neynar notification error:`, err);
          }
        }
      }
      
      // Final fallback: Log the notification
      console.log(`📨 Alert triggered for user ${user.id} (@${user.farcasterUsername || 'unknown'}): ${tokenSymbol} ${alert.condition} $${targetPrice} (no notification method available)`);
    } catch (error) {
      console.error('❌ Error sending Farcaster notification:', error);
    }
  }
}
