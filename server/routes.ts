import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { mcpRouter } from "./mcp";
import { insertPriceAlertSchema, insertTokenSchema, insertTradeSchema, insertHoldingSchema, insertLimitOrderSchema } from "@shared/schema";
import path from "path";
import fs from "fs";
import { postTokenLaunchTweet } from "./twitter";
import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";
import { createPredictionMarketOnChain } from "./lib/predictionMarketBackend";
import { createX402Middleware, PREMIUM_FEATURES } from "./middleware/x402";
import { getTokenRiskScore, isTokenSafeToTrade, getRiskExplanation, searchTokenBySymbol, getWhitelistedTokens } from "./tokenRiskScoring";
import { ethers } from "ethers";
import { rugpullDetector, type TokenMonitorConfig, type MonitoredToken, type RugpullSignal } from "./rugpullDetector";
import { stockAgentsRouter } from "./stock-agents/router";

// Badge definitions
const BADGE_TYPES = {
  GENESIS_BUILDER: { title: "🥇 Genesis Builder", description: "Launched your first token on Base", milestone: 1, iconEmoji: "🥇" },
  MEME_MASTER: { title: "🔥 Meme Master", description: "Launched 10 tokens", milestone: 10, iconEmoji: "🔥" },
  VIRAL_KING: { title: "👑 Viral King", description: "Launched 25 tokens", milestone: 25, iconEmoji: "👑" },
  BASED_LEGEND: { title: "💎 Based Legend", description: "Launched 50 tokens", milestone: 50, iconEmoji: "💎" },
};

async function checkAndAwardBadges(userId: string) {
  try {
    const tokenCount = await storage.getUserTokenCount(userId);
    const existingBadges = await storage.getBadgesByUser(userId);
    const existingBadgeTypes = new Set(existingBadges.map(b => b.badgeType));
    
    for (const [type, config] of Object.entries(BADGE_TYPES)) {
      if (tokenCount >= config.milestone && !existingBadgeTypes.has(type)) {
        await storage.createBadge({
          userId,
          badgeType: type,
          title: config.title,
          description: config.description,
          iconEmoji: config.iconEmoji,
          milestone: config.milestone,
          nftTokenId: null,
          nftContractAddress: null,
        });
        console.log(`🏆 Badge awarded: ${config.title} to user ${userId}`);
      }
    }
  } catch (error) {
    console.error("Error checking badges:", error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Serve static files from public directory
  const publicPath = path.join(process.cwd(), "public");
  app.use(express.static(publicPath));
  app.use("/api/stock-agents", express.json({ limit: "16kb" }), stockAgentsRouter);

  // Note: Main Farcaster manifest is defined later in the file with generateManifest()

  // 🚨 CRITICAL: Frame Telemetry Endpoint - Debug Frame loading
  app.post("/api/frame-telemetry", express.json(), (req, res) => {
    console.log('🔷 FRAME TELEMETRY:', JSON.stringify(req.body, null, 2));
    console.log('📡 Headers:', {
      userAgent: req.headers['user-agent'],
      referer: req.headers['referer'],
      origin: req.headers['origin']
    });
    res.json({ received: true });
  });

  // Health check endpoint for keepalive
  app.get("/api/health", async (req, res) => {
    try {
      // Simple query to keep database connection alive
      await storage.getAllTokens();
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    } catch (error) {
      res.status(503).json({ status: "error", message: "Database unavailable" });
    }
  });

  // Platform stats endpoint - LIVE STATS for homepage
  app.get("/api/stats", async (req, res) => {
    try {
      const tokens = await storage.getAllTokens();
      const trades = await storage.getAllTrades();
      const limitOrders = await storage.getAllLimitOrders();
      
      // Calculate total volume from trades (with sanity check)
      let totalVolumeETH = 0;
      trades.forEach((trade: any) => {
        const value = parseFloat(trade.totalValue || trade.total_value || "0");
        // Sanity check: ignore unreasonably large values (max 100 ETH per trade)
        if (!isNaN(value) && value > 0 && value < 100) {
          totalVolumeETH += value;
        }
      });

      // Calculate volume from filled limit orders (with sanity check)
      let limitOrderVolumeETH = 0;
      limitOrders.forEach((order: any) => {
        if (order.status === 'filled') {
          const value = parseFloat(order.totalValue || order.total_value || "0");
          // Sanity check: ignore unreasonably large values (likely stored in wrong units)
          // Max reasonable single order is 100 ETH/SOL
          if (!isNaN(value) && value > 0 && value < 100) {
            limitOrderVolumeETH += value;
          }
        }
      });

      // Get unique traders from trades
      const traderSet = new Set(trades.map((t: any) => t.userId || t.user_id));
      // Add unique users from limit orders
      limitOrders.forEach((order: any) => {
        const userId = order.userId || order.user_id;
        if (userId) traderSet.add(userId);
      });
      const uniqueTraders = traderSet.size;

      // Separate orders by chain
      const baseOrders = limitOrders.filter((o: any) => (o.chain || 'base') === 'base');
      const solanaOrders = limitOrders.filter((o: any) => o.chain === 'solana');
      const soneiumOrders = limitOrders.filter((o: any) => o.chain === 'soneium');
      const inkOrders = limitOrders.filter((o: any) => o.chain === 'ink');

      // Base chain stats
      const baseFilledOrders = baseOrders.filter((o: any) => o.status === 'filled').length;
      const basePendingOrders = baseOrders.filter((o: any) => o.status === 'pending' || o.status === 'fillable').length;
      const baseTotalOrders = baseOrders.length;

      // Solana chain stats
      const solanaFilledOrders = solanaOrders.filter((o: any) => o.status === 'filled').length;
      const solanaPendingOrders = solanaOrders.filter((o: any) => o.status === 'pending' || o.status === 'fillable').length;
      const solanaTotalOrders = solanaOrders.length;

      // Soneium chain stats
      const soneiumFilledOrders = soneiumOrders.filter((o: any) => o.status === 'filled').length;
      const soneiumPendingOrders = soneiumOrders.filter((o: any) => o.status === 'pending' || o.status === 'fillable').length;
      const soneiumTotalOrders = soneiumOrders.length;

      // INK chain stats
      const inkFilledOrders = inkOrders.filter((o: any) => o.status === 'filled').length;
      const inkPendingOrders = inkOrders.filter((o: any) => o.status === 'pending' || o.status === 'fillable').length;
      const inkTotalOrders = inkOrders.length;

      // Calculate Solana volume from filled orders (convert lamports to SOL)
      let solanaVolume = 0;
      solanaOrders.forEach((order: any) => {
        if (order.status === 'filled') {
          const lamports = parseFloat(order.solAmount || order.sol_amount || "0");
          // Convert lamports to SOL (1 SOL = 1e9 lamports)
          const sol = lamports / 1e9;
          if (!isNaN(sol) && sol > 0 && sol < 1000) {
            solanaVolume += sol;
          }
        }
      });

      // Total stats (all chains)
      const filledOrders = baseFilledOrders + solanaFilledOrders + soneiumFilledOrders + inkFilledOrders;
      const pendingOrders = basePendingOrders + solanaPendingOrders + soneiumPendingOrders + inkPendingOrders;
      const totalOrders = baseTotalOrders + solanaTotalOrders + soneiumTotalOrders + inkTotalOrders;

      // Baseline mainnet stats (data from before automatic tracking started)
      const baselineStats = {
        tokensLaunched: 29,  // Mainnet launches before tracking
        totalVolume: 12.5,   // ETH volume before tracking
        activeTraders: 156,  // Traders before tracking
        limitOrdersFilled: 0,
        totalLimitOrders: 0
      };

      // Current tracked mainnet stats (from database)
      const trackedStats = {
        tokensLaunched: tokens.filter((t: any) => !t.isPlatformToken && !t.is_platform_token).length,
        totalVolume: totalVolumeETH + limitOrderVolumeETH,
        activeTraders: uniqueTraders,
        totalTrades: trades.length,
        limitOrdersFilled: filledOrders,
        limitOrdersPending: pendingOrders,
        totalLimitOrders: totalOrders
      };

      // Total mainnet stats (baseline + tracked from database)
      const totalStats = {
        tokensLaunched: baselineStats.tokensLaunched + trackedStats.tokensLaunched,
        totalVolume: baselineStats.totalVolume + trackedStats.totalVolume,
        activeTraders: baselineStats.activeTraders + trackedStats.activeTraders,
        totalTrades: trackedStats.totalTrades,
        limitOrdersFilled: baselineStats.limitOrdersFilled + trackedStats.limitOrdersFilled,
        limitOrdersPending: trackedStats.limitOrdersPending,
        totalLimitOrders: baselineStats.totalLimitOrders + trackedStats.totalLimitOrders
      };

      // Chain-specific stats
      const baseStats = {
        totalOrders: baseTotalOrders,
        filledOrders: baseFilledOrders,
        pendingOrders: basePendingOrders,
        volumeETH: totalVolumeETH + limitOrderVolumeETH
      };

      const solanaStats = {
        totalOrders: solanaTotalOrders,
        filledOrders: solanaFilledOrders,
        pendingOrders: solanaPendingOrders,
        volumeSOL: solanaVolume
      };

      const soneiumStats = {
        totalOrders: soneiumTotalOrders,
        filledOrders: soneiumFilledOrders,
        pendingOrders: soneiumPendingOrders,
      };

      const inkStats = {
        totalOrders: inkTotalOrders,
        filledOrders: inkFilledOrders,
        pendingOrders: inkPendingOrders,
      };

      res.json({
        success: true,
        baseline: baselineStats,
        tracked: trackedStats,
        total: totalStats,
        base: baseStats,
        solana: solanaStats,
        soneium: soneiumStats,
        ink: inkStats,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error("Stats API error:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to fetch stats",
        total: { tokensLaunched: 50, totalVolume: 12.5, activeTraders: 160, limitOrdersFilled: 14, totalLimitOrders: 65 }
      });
    }
  });

  // ============== RUGPULL DETECTOR API ==============

  // Start/Stop the rugpull detector
  app.post("/api/rugpull-detector/start", express.json(), async (req, res) => {
    if (process.env.VERCEL || process.env.VERCEL_ENV) {
      return res.status(503).json({ success: false, error: "Persistent rugpull monitoring is disabled on Vercel; use the dedicated worker" });
    }
    try {
      if (!rugpullDetector.isActive()) {
        rugpullDetector.start();
      }
      res.json({ success: true, message: "Rugpull detector started", stats: rugpullDetector.getStats() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/rugpull-detector/stop", express.json(), async (req, res) => {
    try {
      rugpullDetector.stop();
      res.json({ success: true, message: "Rugpull detector stopped", stats: rugpullDetector.getStats() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get detector status and stats
  app.get("/api/rugpull-detector/status", async (req, res) => {
    try {
      res.json({ 
        success: true, 
        stats: rugpullDetector.getStats(),
        tokens: rugpullDetector.getMonitoredTokens()
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Add token to monitor
  app.post("/api/rugpull-detector/monitor", express.json(), async (req, res) => {
    if (process.env.VERCEL || process.env.VERCEL_ENV) {
      return res.status(503).json({ success: false, error: "Persistent rugpull monitoring is disabled on Vercel; use the dedicated worker" });
    }
    try {
      const { tokenAddress, userAddress, userBalance, autoSellEnabled } = req.body;
      
      if (!tokenAddress || !userAddress) {
        return res.status(400).json({ success: false, error: "tokenAddress and userAddress are required" });
      }

      const config: TokenMonitorConfig = {
        tokenAddress,
        userAddress,
        userBalance: userBalance || "0",
        autoSellEnabled: autoSellEnabled ?? true,
        createdAt: Date.now()
      };

      const monitored = await rugpullDetector.addToken(config);
      
      // Start detector if not running
      if (!rugpullDetector.isActive()) {
        rugpullDetector.start();
      }

      res.json({ 
        success: true, 
        message: "Token added to monitor",
        token: monitored,
        stats: rugpullDetector.getStats()
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Remove token from monitoring
  app.delete("/api/rugpull-detector/monitor/:tokenAddress/:userAddress", async (req, res) => {
    try {
      const { tokenAddress, userAddress } = req.params;
      rugpullDetector.removeToken(tokenAddress, userAddress);
      res.json({ 
        success: true, 
        message: "Token removed from monitor",
        stats: rugpullDetector.getStats()
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get specific token status
  app.get("/api/rugpull-detector/token/:tokenAddress/:userAddress", async (req, res) => {
    try {
      const { tokenAddress, userAddress } = req.params;
      const token = rugpullDetector.getToken(tokenAddress, userAddress);
      
      if (!token) {
        return res.status(404).json({ success: false, error: "Token not found in monitor" });
      }

      res.json({ success: true, token });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Manual emergency sell endpoint (uses 0x API)
  app.post("/api/rugpull-detector/emergency-sell", express.json(), async (req, res) => {
    try {
      const { tokenAddress, userAddress, amount, slippage } = req.body;
      
      if (!tokenAddress || !userAddress) {
        return res.status(400).json({ success: false, error: "tokenAddress and userAddress are required" });
      }

      // Get 0x sell quote
      const OX_API_KEY = process.env.OX_API_KEY;
      if (!OX_API_KEY) {
        return res.status(500).json({ success: false, error: "0x API key not configured" });
      }

      const WETH_BASE = "0x4200000000000000000000000000000000000006";
      const sellAmount = amount || "1000000000000000000"; // Default 1 token (18 decimals)

      const quoteUrl = `https://api.0x.org/swap/permit2/quote?chainId=8453&sellToken=${tokenAddress}&buyToken=${WETH_BASE}&sellAmount=${sellAmount}&taker=${userAddress}&slippagePercentage=${slippage || 0.5}`;

      const quoteResponse = await fetch(quoteUrl, {
        headers: {
          '0x-api-key': OX_API_KEY,
          '0x-version': 'v2'
        }
      });

      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text();
        console.error('0x quote error:', errorText);
        return res.status(400).json({ 
          success: false, 
          error: "Failed to get sell quote - token may be honeypot",
          details: errorText
        });
      }

      const quote = await quoteResponse.json();

      res.json({ 
        success: true, 
        message: "Emergency sell quote ready",
        quote: {
          sellToken: tokenAddress,
          buyToken: WETH_BASE,
          sellAmount: sellAmount,
          buyAmount: quote.buyAmount,
          to: quote.transaction?.to,
          data: quote.transaction?.data,
          value: quote.transaction?.value,
          gasPrice: quote.transaction?.gasPrice,
        }
      });
    } catch (error: any) {
      console.error('Emergency sell error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Store pending auto-sell quotes for frontend to execute
  const pendingAutoSellQuotes = new Map<string, { token: MonitoredToken; signal: RugpullSignal; quote: any; timestamp: number }>();

  // Get pending auto-sell quotes endpoint
  app.get("/api/rugpull-detector/pending-sells", async (req, res) => {
    const userAddress = req.query.userAddress as string;
    const pending: any[] = [];
    
    for (const [key, data] of Array.from(pendingAutoSellQuotes.entries())) {
      if (!userAddress || data.token.userAddress.toLowerCase() === userAddress.toLowerCase()) {
        if (Date.now() - data.timestamp < 60000) {
          pending.push({ key, ...data });
        } else {
          pendingAutoSellQuotes.delete(key);
        }
      }
    }
    
    res.json({ success: true, pendingSells: pending });
  });

  // Clear pending sell after execution
  app.delete("/api/rugpull-detector/pending-sells/:key", async (req, res) => {
    const { key } = req.params;
    pendingAutoSellQuotes.delete(key);
    res.json({ success: true, message: "Pending sell cleared" });
  });

  // Configure auto-sell callback for rugpull detector
  rugpullDetector.setAutoSellCallback(async (token: MonitoredToken, signal: RugpullSignal) => {
    console.log(`🔴 AUTO-SELL CALLBACK: ${token.tokenAddress}`);
    console.log(`   Signal: ${signal.type} - ${signal.severity}`);
    console.log(`   Message: ${signal.message}`);
    
    try {
      const OX_API_KEY = process.env.OX_API_KEY;
      if (!OX_API_KEY) {
        console.log(`❌ No 0x API key configured for auto-sell`);
        return false;
      }

      const WETH_BASE = "0x4200000000000000000000000000000000000006";
      const sellAmount = token.userBalance || "1000000000000000000";

      console.log(`📊 Fetching 0x sell quote for ${token.tokenAddress}...`);
      const quoteUrl = `https://api.0x.org/swap/permit2/quote?chainId=8453&sellToken=${token.tokenAddress}&buyToken=${WETH_BASE}&sellAmount=${sellAmount}&taker=${token.userAddress}&slippagePercentage=0.5`;

      const quoteResponse = await fetch(quoteUrl, {
        headers: {
          '0x-api-key': OX_API_KEY,
          '0x-version': 'v2'
        }
      });

      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text();
        console.log(`❌ 0x quote failed (possible honeypot): ${errorText}`);
        return false;
      }

      const quote = await quoteResponse.json();
      
      const key = `${token.tokenAddress}-${token.userAddress}-${Date.now()}`;
      pendingAutoSellQuotes.set(key, {
        token,
        signal,
        quote: {
          sellToken: token.tokenAddress,
          buyToken: WETH_BASE,
          sellAmount: sellAmount,
          buyAmount: quote.buyAmount,
          to: quote.transaction?.to,
          data: quote.transaction?.data,
          value: quote.transaction?.value || "0",
          gasPrice: quote.transaction?.gasPrice,
        },
        timestamp: Date.now()
      });

      console.log(`✅ Auto-sell quote ready: ${key}`);
      console.log(`   Expected output: ${parseFloat(quote.buyAmount) / 1e18} ETH`);
      
      return true;
    } catch (error) {
      console.error(`Auto-sell quote error:`, error);
      return false;
    }
  });

  // Register signal callback for logging
  rugpullDetector.onSignal((signal: RugpullSignal, token: MonitoredToken) => {
    console.log(`\n🚨 RUGPULL SIGNAL DETECTED 🚨`);
    console.log(`Token: ${token.tokenAddress}`);
    console.log(`Type: ${signal.type}`);
    console.log(`Severity: ${signal.severity}`);
    console.log(`Message: ${signal.message}`);
    console.log(`Details:`, JSON.stringify(signal.details, null, 2));
  });

  // ============== END RUGPULL DETECTOR API ==============

  // ============== RUG PROTECTION (VAULT-BASED) API ==============
  
  // Create a new rug protection entry (after user deposits tokens to vault)
  app.post("/api/rug-protection", express.json(), async (req, res) => {
    try {
      const { 
        userId,
        userWalletAddress,
        tokenAddress,
        tokenSymbol,
        tokenName,
        tokenDecimals,
        depositAmount,
        vaultAddress,
        autoSellEnabled,
        initialLiquidity,
        initialOwner,
        initialBuyTax,
        initialSellTax,
      } = req.body;

      if (!userId || !userWalletAddress || !tokenAddress || !tokenSymbol || !depositAmount || !vaultAddress) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Check if already exists
      const existing = await storage.getRugProtectionByToken(userWalletAddress, tokenAddress);
      if (existing && existing.status === 'active') {
        return res.status(400).json({ error: 'Rug protection already active for this token' });
      }

      const protection = await storage.createRugProtection({
        userId,
        userWalletAddress,
        tokenAddress,
        tokenSymbol,
        tokenName: tokenName || null,
        tokenDecimals: tokenDecimals || 18,
        depositAmount,
        vaultVersion: 'v3',
        vaultAddress,
        autoSellEnabled: autoSellEnabled !== false,
        initialLiquidity: initialLiquidity || null,
        initialOwner: initialOwner || null,
        initialBuyTax: initialBuyTax || null,
        initialSellTax: initialSellTax || null,
      });

      // Add to rugpull detector for monitoring
      await rugpullDetector.addToken({
        tokenAddress,
        userAddress: userWalletAddress,
        userBalance: depositAmount,
        initialLiquidity,
        initialOwner,
        initialBuyTax,
        initialSellTax,
        autoSellEnabled: protection.autoSellEnabled,
        createdAt: new Date(protection.createdAt).getTime(),
      });

      res.json({ success: true, protection });
    } catch (error) {
      console.error('Error creating rug protection:', error);
      res.status(500).json({ error: 'Failed to create rug protection' });
    }
  });

  // Get rug protections by user
  app.get("/api/rug-protection/user/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const protections = await storage.getRugProtectionsByUser(userId);
      res.json({ success: true, protections });
    } catch (error) {
      console.error('Error fetching rug protections:', error);
      res.status(500).json({ error: 'Failed to fetch rug protections' });
    }
  });

  // Get rug protection by wallet and token
  app.get("/api/rug-protection/token/:walletAddress/:tokenAddress", async (req, res) => {
    try {
      const { walletAddress, tokenAddress } = req.params;
      const protection = await storage.getRugProtectionByToken(walletAddress, tokenAddress);
      res.json({ success: true, protection: protection || null });
    } catch (error) {
      console.error('Error fetching rug protection:', error);
      res.status(500).json({ error: 'Failed to fetch rug protection' });
    }
  });

  // Get all active rug protections
  app.get("/api/rug-protection/active", async (req, res) => {
    try {
      const protections = await storage.getActiveRugProtections();
      res.json({ success: true, protections });
    } catch (error) {
      console.error('Error fetching active rug protections:', error);
      res.status(500).json({ error: 'Failed to fetch active rug protections' });
    }
  });

  // Update rug protection (e.g., toggle auto-sell)
  app.patch("/api/rug-protection/:id", express.json(), async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const protection = await storage.updateRugProtection(id, updates);
      if (!protection) {
        return res.status(404).json({ error: 'Rug protection not found' });
      }
      
      res.json({ success: true, protection });
    } catch (error) {
      console.error('Error updating rug protection:', error);
      res.status(500).json({ error: 'Failed to update rug protection' });
    }
  });

  // Withdraw and delete rug protection
  app.delete("/api/rug-protection/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      const protection = await storage.getRugProtection(id);
      if (!protection) {
        return res.status(404).json({ error: 'Rug protection not found' });
      }
      
      // Mark as withdrawn
      await storage.updateRugProtection(id, { status: 'withdrawn' });
      
      // Remove from rugpull detector
      rugpullDetector.removeToken(protection.tokenAddress, protection.userWalletAddress);
      
      res.json({ success: true, message: 'Rug protection deactivated - please withdraw tokens from vault' });
    } catch (error) {
      console.error('Error deleting rug protection:', error);
      res.status(500).json({ error: 'Failed to delete rug protection' });
    }
  });

  // ============== END RUG PROTECTION API ==============

  // Server-side cache for CoinGecko token list (1 hour TTL)
  let tokenListCache: { tokens: any[], timestamp: number } | null = null;
  let soneiumTokenListCache: { tokens: any[], timestamp: number } | null = null;
  const TOKEN_CACHE_TTL = 60 * 60 * 1000; // 1 hour

  // Server-side cache for token prices (60 second TTL)
  const tokenPriceCache = new Map<string, { data: any, timestamp: number }>();
  const PRICE_CACHE_TTL = 60 * 1000; // 60 seconds

  // Fetch comprehensive Base L2 token list from CoinGecko (for swap interface)
  app.get("/api/swap-tokens", async (req, res) => {
    try {
      const now = Date.now();
      
      // Return cached list if still fresh
      if (tokenListCache && (now - tokenListCache.timestamp) < TOKEN_CACHE_TTL) {
        console.log(`📦 Serving ${tokenListCache.tokens.length} cached Base tokens`);
        return res.json({ tokens: tokenListCache.tokens, cached: true });
      }

      // Fetch from CoinGecko
      console.log('🌐 Fetching Base token list from CoinGecko...');
      const response = await fetch('https://tokens.coingecko.com/base/all.json');
      
      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.statusText}`);
      }

      const data = await response.json();
      const rawTokens = data.tokens || [];

      // Helper: Generate path-based proxy URL (no query strings for Warpcast mobile)
      // Uses URL-safe base64 encoding: + -> -, / -> _
      const toProxyUrl = (originalUrl: string) => {
        const base64 = Buffer.from(originalUrl).toString('base64');
        const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        return `/token-logo/${base64url}.png`;
      };

      // Convert all logo URLs to path-based proxy for Warpcast mobile compatibility
      const tokens = rawTokens.map((token: any) => ({
        ...token,
        logoURI: token.logoURI 
          ? toProxyUrl(token.logoURI)
          : toProxyUrl(`https://api.dicebear.com/7.x/identicon/png?seed=${token.address?.toLowerCase()}&size=64`)
      }));

      // Update cache with proxied URLs
      tokenListCache = { tokens, timestamp: now };
      console.log(`✅ Cached ${tokens.length} Base tokens from CoinGecko (with proxy URLs)`);

      res.json({ tokens, cached: false });
    } catch (error) {
      console.error('❌ Error fetching token list:', error);
      
      // Return cached list as fallback, or empty array
      if (tokenListCache) {
        console.log('⚠️ Returning stale cache as fallback');
        return res.json({ tokens: tokenListCache.tokens, cached: true, stale: true });
      }
      
      res.status(500).json({ error: 'Failed to fetch token list', tokens: [] });
    }
  });

  // Fetch Soneium token list from CoinGecko (for Soneium swap interface)
  app.get("/api/soneium-tokens", async (req, res) => {
    try {
      const now = Date.now();
      
      // Return cached list if still fresh
      if (soneiumTokenListCache && (now - soneiumTokenListCache.timestamp) < TOKEN_CACHE_TTL) {
        console.log(`📦 Serving ${soneiumTokenListCache.tokens.length} cached Soneium tokens`);
        return res.json({ tokens: soneiumTokenListCache.tokens, cached: true });
      }

      // Fetch from CoinGecko
      console.log('🌐 Fetching Soneium token list from CoinGecko...');
      const response = await fetch('https://tokens.coingecko.com/soneium/all.json');
      
      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.statusText}`);
      }

      const data = await response.json();
      const rawTokens = data.tokens || [];

      // Helper: Generate path-based proxy URL (no query strings for Warpcast mobile)
      const toProxyUrl = (originalUrl: string) => {
        const base64 = Buffer.from(originalUrl).toString('base64');
        const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        return `/token-logo/${base64url}.png`;
      };

      // Add native ETH as the first token
      const nativeEth = {
        chainId: 1868,
        address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
        logoURI: toProxyUrl('https://assets.coingecko.com/coins/images/279/small/ethereum.png')
      };

      // Convert all logo URLs to path-based proxy for Warpcast mobile compatibility
      const tokens = [
        nativeEth,
        ...rawTokens.map((token: any) => ({
          ...token,
          logoURI: token.logoURI 
            ? toProxyUrl(token.logoURI)
            : toProxyUrl(`https://api.dicebear.com/7.x/identicon/png?seed=${token.address?.toLowerCase()}&size=64`)
        }))
      ];

      // Update cache with proxied URLs
      soneiumTokenListCache = { tokens, timestamp: now };
      console.log(`✅ Cached ${tokens.length} Soneium tokens from CoinGecko (with proxy URLs)`);

      res.json({ tokens, cached: false });
    } catch (error) {
      console.error('❌ Error fetching Soneium token list:', error);
      
      // Return cached list as fallback, or empty array
      if (soneiumTokenListCache) {
        console.log('⚠️ Returning stale Soneium cache as fallback');
        return res.json({ tokens: soneiumTokenListCache.tokens, cached: true, stale: true });
      }
      
      res.status(500).json({ error: 'Failed to fetch Soneium token list', tokens: [] });
    }
  });

  // ============== KYO FINANCE (UNISWAP V3) SWAP API FOR SONEIUM ==============
  // Direct on-chain integration - NO protocol fees!
  
  const SONEIUM_RPC = 'https://rpc.soneium.org';
  
  // Quote cache: 10 second TTL to avoid redundant RPC calls
  const soneiumQuoteCache = new Map<string, { data: any; timestamp: number }>();
  const QUOTE_CACHE_TTL = 10000;
  const SONEIUM_WETH = '0x4200000000000000000000000000000000000006';
  const SONEIUM_USDC = '0xbA9986D2381edf1DA03B0B9c1f8b00dc4AacC369'; // USDC.e bridged
  const KYO_QUOTER_V2 = '0x60eb4B04932797374a291380349008dc8cc40426';
  const KYO_SWAP_ROUTER = '0x0dC73Fe1341365929Ed8a89Dd47097A9FDD254D0';
  
  // Quoter V2 ABI for quoteExactInputSingle and multi-hop quoteExactInput
  const QUOTER_V2_ABI = [
    'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
    'function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)'
  ];

  function encodePath(tokens: string[], fees: number[]): string {
    if (tokens.length !== fees.length + 1) throw new Error('Invalid path/fees length');
    let encoded = '0x';
    for (let i = 0; i < fees.length; i++) {
      encoded += tokens[i].slice(2).toLowerCase();
      encoded += fees[i].toString(16).padStart(6, '0');
    }
    encoded += tokens[tokens.length - 1].slice(2).toLowerCase();
    return encoded;
  }

  // Get KYO Finance quote for Soneium swap (NO PROTOCOL FEES!)
  // Supports single-hop and multi-hop routing for best prices
  app.post("/api/soneium/quote", async (req, res) => {
    try {
      const { fromTokenAddress, toTokenAddress, amount, fromDecimals = 18, toDecimals = 18 } = req.body;

      if (!fromTokenAddress || !toTokenAddress || !amount) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const tokenIn = fromTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' 
        ? SONEIUM_WETH 
        : fromTokenAddress;
      const tokenOut = toTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
        ? SONEIUM_WETH
        : toTokenAddress;

      console.log(`🔄 Fetching KYO Finance quote: ${amount} from ${tokenIn} to ${tokenOut} on Soneium`);

      // Check cache first
      const cacheKey = `${tokenIn}-${tokenOut}-${amount}-${fromDecimals}-${toDecimals}`;
      const cached = soneiumQuoteCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < QUOTE_CACHE_TTL) {
        console.log(`⚡ KYO quote from cache`);
        return res.json(cached.data);
      }

      // Disable batch requests to avoid Soneium RPC batch limit (-32010)
      const provider = new ethers.JsonRpcProvider(SONEIUM_RPC, undefined, { batchMaxCount: 1 });
      const quoter = new ethers.Contract(KYO_QUOTER_V2, QUOTER_V2_ABI, provider);
      const amountInWei = ethers.parseUnits(amount.toString(), fromDecimals);

      const feeTiers = [3000, 10000, 500, 100];
      
      // === Run ALL routes in true parallel (no batching = no RPC limit) ===
      const intermediates = [SONEIUM_WETH, SONEIUM_USDC].filter(
        t => t.toLowerCase() !== tokenIn.toLowerCase() && t.toLowerCase() !== tokenOut.toLowerCase()
      );

      const directPromises = feeTiers.map(fee => 
        quoter.quoteExactInputSingle.staticCall({
          tokenIn, tokenOut, amountIn: amountInWei, fee, sqrtPriceLimitX96: 0
        }).then(result => ({ type: 'direct' as const, fee, amountOut: result[0] as bigint }))
         .catch(() => null)
      );

      const multiHopPromises: Promise<{ type: 'multi'; mid: string; fee1: number; fee2: number; amountOut: bigint } | null>[] = [];
      for (const mid of intermediates) {
        for (const fee1 of feeTiers) {
          for (const fee2 of feeTiers) {
            const path = encodePath([tokenIn, mid, tokenOut], [fee1, fee2]);
            multiHopPromises.push(
              quoter.quoteExactInput.staticCall(path, amountInWei)
                .then(result => ({ type: 'multi' as const, mid, fee1, fee2, amountOut: result[0] as bigint }))
                .catch(() => null)
            );
          }
        }
      }

      const allResults = await Promise.all([...directPromises, ...multiHopPromises]);

      let bestDirectQuote: bigint | null = null;
      let bestDirectFee = 3000;
      let bestMultiHopQuote: bigint | null = null;
      let bestMultiHopPath: string[] | null = null;
      let bestMultiHopFees: number[] | null = null;

      for (const r of allResults) {
        if (!r) continue;
        if (r.type === 'direct') {
          if (!bestDirectQuote || r.amountOut > bestDirectQuote) {
            bestDirectQuote = r.amountOut;
            bestDirectFee = r.fee;
          }
        } else {
          if (!bestMultiHopQuote || r.amountOut > bestMultiHopQuote) {
            bestMultiHopQuote = r.amountOut;
            bestMultiHopPath = [tokenIn, r.mid, tokenOut];
            bestMultiHopFees = [r.fee1, r.fee2];
          }
        }
      }

      // === 3. Pick the best route ===
      let bestQuote: bigint;
      let routeType: 'single' | 'multi';
      let bestFee = bestDirectFee;
      let multiHopPath: string[] | null = null;
      let multiHopFees: number[] | null = null;

      if (bestMultiHopQuote && (!bestDirectQuote || bestMultiHopQuote > bestDirectQuote)) {
        bestQuote = bestMultiHopQuote;
        routeType = 'multi';
        multiHopPath = bestMultiHopPath;
        multiHopFees = bestMultiHopFees;
        console.log(`✅ Multi-hop route wins: ${bestMultiHopPath?.map(t => t.slice(0,8)).join(' → ')}`);
      } else if (bestDirectQuote) {
        bestQuote = bestDirectQuote;
        routeType = 'single';
      } else {
        return res.status(400).json({ error: 'No liquidity available for this pair' });
      }

      // === 4. Calculate price impact ===
      let priceImpact: number | null = null;
      try {
        // Use 1/1000th of the amount as the "tiny" amount for spot price, with a minimum floor
        const minTinyAmount = BigInt(1000000); // 1e6 wei minimum
        let tinyAmount = amountInWei / BigInt(1000);
        if (tinyAmount < minTinyAmount) tinyAmount = minTinyAmount;
        if (tinyAmount < amountInWei && tinyAmount > BigInt(0)) {
          let tinyQuote: bigint | null = null;
          if (routeType === 'single') {
            try {
              const tinyResult = await quoter.quoteExactInputSingle.staticCall({
                tokenIn, tokenOut, amountIn: tinyAmount, fee: bestFee, sqrtPriceLimitX96: 0
              });
              tinyQuote = tinyResult[0];
            } catch {}
          } else if (multiHopPath && multiHopFees) {
            try {
              const tinyPath = encodePath(multiHopPath, multiHopFees);
              const tinyResult = await quoter.quoteExactInput.staticCall(tinyPath, tinyAmount);
              tinyQuote = tinyResult[0];
            } catch {}
          }
          
          if (tinyQuote && tinyQuote > BigInt(0)) {
            const spotRate = (tinyQuote * BigInt(1000000)) / tinyAmount;
            const actualRate = (bestQuote * BigInt(1000000)) / amountInWei;
            if (spotRate > BigInt(0)) {
              priceImpact = Number(((spotRate - actualRate) * BigInt(10000)) / spotRate) / 100;
              if (priceImpact < 0) priceImpact = 0;
            }
          }
        }
      } catch (e) {
        console.log('Price impact calculation failed, continuing without it');
      }

      const outputAmount = ethers.formatUnits(bestQuote, toDecimals);
      const slippage = 0.01;
      const minAmountOut = (bestQuote * BigInt(99)) / BigInt(100);
      const minOutputAmount = ethers.formatUnits(minAmountOut, toDecimals);

      console.log(`✅ KYO quote: ${outputAmount} via ${routeType} route${priceImpact !== null ? `, impact: ${priceImpact}%` : ''}`);

      const responseData = {
        id: `kyo-${Date.now()}`,
        provider: 'KYO_FINANCE',
        estimate: {
          destinationTokenAmount: outputAmount,
          destinationTokenMinAmount: minOutputAmount,
          destinationUsdAmount: null,
          destinationUsdMinAmount: null,
          priceImpact: priceImpact,
          slippage: slippage
        },
        fees: {
          gasTokenFees: {
            protocol: {
              fixedAmount: '0',
              fixedUsdAmount: 0,
              fixedWeiAmount: '0'
            }
          }
        },
        swap: {
          tokenIn,
          tokenOut,
          amountIn: amountInWei.toString(),
          amountOutMinimum: minAmountOut.toString(),
          fee: bestFee,
          router: KYO_SWAP_ROUTER,
          routeType,
          ...(routeType === 'multi' && multiHopPath && multiHopFees ? {
            multiHopPath,
            multiHopFees,
            encodedPath: encodePath(multiHopPath, multiHopFees)
          } : {})
        }
      };

      // Cache the result
      soneiumQuoteCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

      res.json(responseData);
    } catch (error: any) {
      console.error('❌ KYO quote error:', error);
      res.status(500).json({ error: 'Failed to get Soneium swap quote', message: error.message });
    }
  });

  // Build swap transaction for KYO Finance (Uniswap V3 on Soneium)
  // Supports single-hop and multi-hop routing
  app.post("/api/soneium/swap", async (req, res) => {
    try {
      const { fromTokenAddress, toTokenAddress, amount, fromAddress, fromDecimals = 18, toDecimals = 18, fee = 3000, routeType = 'single', multiHopPath, multiHopFees } = req.body;

      if (!fromTokenAddress || !toTokenAddress || !amount || !fromAddress) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const isFromNative = fromTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      const isToNative = toTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

      const tokenIn = isFromNative ? SONEIUM_WETH : fromTokenAddress;
      const tokenOut = isToNative ? SONEIUM_WETH : toTokenAddress;

      console.log(`🔄 Building KYO swap tx for ${fromAddress} (${routeType} route)`);

      const amountInWei = ethers.parseUnits(amount.toString(), fromDecimals);
      
      const provider = new ethers.JsonRpcProvider(SONEIUM_RPC);
      const quoter = new ethers.Contract(KYO_QUOTER_V2, QUOTER_V2_ABI, provider);
      
      let quotedAmountOut: bigint;
      let serverEncodedPath: string | null = null;
      
      // Server-side path re-encoding for security (never trust client encodedPath)
      if (routeType === 'multi' && Array.isArray(multiHopPath) && Array.isArray(multiHopFees) && multiHopPath.length >= 3 && multiHopFees.length === multiHopPath.length - 1) {
        // Validate path starts with tokenIn and ends with tokenOut
        const pathStart = multiHopPath[0].toLowerCase();
        const pathEnd = multiHopPath[multiHopPath.length - 1].toLowerCase();
        if (pathStart !== tokenIn.toLowerCase() || pathEnd !== tokenOut.toLowerCase()) {
          return res.status(400).json({ error: 'Multi-hop path does not match token pair' });
        }
        // Validate all addresses are valid
        for (const addr of multiHopPath) {
          if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
            return res.status(400).json({ error: 'Invalid address in multi-hop path' });
          }
        }
        // Validate fee values
        for (const f of multiHopFees) {
          if (![100, 500, 3000, 10000].includes(f)) {
            return res.status(400).json({ error: 'Invalid fee tier in multi-hop path' });
          }
        }
        
        serverEncodedPath = encodePath(multiHopPath, multiHopFees);
        try {
          const result = await quoter.quoteExactInput.staticCall(serverEncodedPath, amountInWei);
          quotedAmountOut = result[0];
        } catch (e) {
          return res.status(400).json({ error: 'Failed to get multi-hop quote for swap' });
        }
      } else {
        try {
          const result = await quoter.quoteExactInputSingle.staticCall({
            tokenIn, tokenOut, amountIn: amountInWei, fee, sqrtPriceLimitX96: 0
          });
          quotedAmountOut = result[0];
        } catch (e) {
          return res.status(400).json({ error: 'Failed to get quote for swap' });
        }
      }

      const minAmountOutBigInt = (quotedAmountOut * BigInt(99)) / BigInt(100);
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      const swapRouterInterface = new ethers.Interface([
        'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
        'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)',
        'function multicall(bytes[] data) external payable returns (bytes[] results)',
        'function unwrapWETH9(uint256 amountMinimum, address recipient) external payable',
        'function refundETH() external payable'
      ]);

      let txData;
      let txValue = '0';

      if (isFromNative && isToNative) {
        return res.status(400).json({ error: 'Cannot swap ETH to ETH' });
      }

      if (serverEncodedPath) {
        // Multi-hop swap using exactInput with server-validated encoded path
        const recipient = isToNative ? KYO_SWAP_ROUTER : fromAddress;
        const exactInputParams = {
          path: serverEncodedPath,
          recipient,
          deadline,
          amountIn: amountInWei,
          amountOutMinimum: minAmountOutBigInt
        };
        
        if (isToNative) {
          const swapData = swapRouterInterface.encodeFunctionData('exactInput', [exactInputParams]);
          const unwrapData = swapRouterInterface.encodeFunctionData('unwrapWETH9', [minAmountOutBigInt, fromAddress]);
          txData = swapRouterInterface.encodeFunctionData('multicall', [[swapData, unwrapData]]);
        } else {
          txData = swapRouterInterface.encodeFunctionData('exactInput', [exactInputParams]);
        }
        
        if (isFromNative) {
          txValue = amountInWei.toString();
        }
      } else if (isFromNative) {
        const swapParams = {
          tokenIn: SONEIUM_WETH, tokenOut, fee, recipient: fromAddress,
          deadline, amountIn: amountInWei, amountOutMinimum: minAmountOutBigInt, sqrtPriceLimitX96: 0
        };
        txData = swapRouterInterface.encodeFunctionData('exactInputSingle', [swapParams]);
        txValue = amountInWei.toString();
      } else if (isToNative) {
        const swapParams = {
          tokenIn, tokenOut: SONEIUM_WETH, fee, recipient: KYO_SWAP_ROUTER,
          deadline, amountIn: amountInWei, amountOutMinimum: minAmountOutBigInt, sqrtPriceLimitX96: 0
        };
        const swapData = swapRouterInterface.encodeFunctionData('exactInputSingle', [swapParams]);
        const unwrapData = swapRouterInterface.encodeFunctionData('unwrapWETH9', [minAmountOutBigInt, fromAddress]);
        txData = swapRouterInterface.encodeFunctionData('multicall', [[swapData, unwrapData]]);
      } else {
        const swapParams = {
          tokenIn, tokenOut, fee, recipient: fromAddress,
          deadline, amountIn: amountInWei, amountOutMinimum: minAmountOutBigInt, sqrtPriceLimitX96: 0
        };
        txData = swapRouterInterface.encodeFunctionData('exactInputSingle', [swapParams]);
      }

      console.log(`✅ KYO swap tx built (${routeType} route)`);

      res.json({
        provider: 'KYO_FINANCE',
        transaction: {
          to: KYO_SWAP_ROUTER,
          data: txData,
          value: txValue,
          approvalAddress: KYO_SWAP_ROUTER
        },
        estimate: {
          destinationTokenAmount: ethers.formatUnits(quotedAmountOut, toDecimals),
          destinationTokenMinAmount: ethers.formatUnits(minAmountOutBigInt, toDecimals)
        }
      });
    } catch (error: any) {
      console.error('❌ KYO swap error:', error);
      res.status(500).json({ error: 'Failed to get Soneium swap data', message: error.message });
    }
  });

  // ============== END RUBIC SWAP API ==============

  // Resolve custom token address using on-chain metadata
  app.get("/api/tokens/resolve/:address", async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid Ethereum address' });
      }

      // Import ethers dynamically
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');

      // Hardcoded metadata for whitelisted tokens (avoid RPC calls)
      const WHITELISTED_TOKEN_METADATA: Record<string, { symbol: string, name: string, decimals: number }> = {
        '0x4200000000000000000000000000000000000006': { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        '0x940181a94a35a4569e4529a3cdfb74e38fd98631': { symbol: 'AERO', name: 'Aerodrome Finance', decimals: 18 },
        '0x4ed4e862860bed51a9570b96d89af5e1b0eff9ed': { symbol: 'DEGEN', name: 'Degen', decimals: 18 },
        '0x532f27101965dd16442e59d40670faf5ebb142e4': { symbol: 'BRETT', name: 'Brett', decimals: 18 },
        '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b': { symbol: 'VIRTUAL', name: 'Virtual Protocol', decimals: 18 },
      };

      const lowerAddress = address.toLowerCase();
      const whitelistedMetadata = WHITELISTED_TOKEN_METADATA[lowerAddress];

      let symbol: string, name: string, decimals: number;

      // Check if whitelisted token - skip RPC call
      if (whitelistedMetadata) {
        ({ symbol, name, decimals } = whitelistedMetadata);
      } else {
        // Non-whitelisted token: fetch metadata from RPC
        const ERC20_ABI = [
          'function symbol() view returns (string)',
          'function name() view returns (string)',
          'function decimals() view returns (uint8)'
        ];
        
        const contract = new ethers.Contract(address, ERC20_ABI, provider);
        
        const metadataResults = await Promise.all([
          contract.symbol(),
          contract.name(),
          contract.decimals()
        ]);
        
        symbol = metadataResults[0];
        name = metadataResults[1];
        decimals = Number(metadataResults[2]);
      }

      // Get token risk score (whitelist check inside)
      const riskScore = await getTokenRiskScore(address, provider);
      const isSafe = isTokenSafeToTrade(riskScore);
      const riskExplanation = getRiskExplanation(riskScore);

      // Helper: Generate path-based proxy URL (no query strings for Warpcast mobile)
      const toProxyUrl = (originalUrl: string) => {
        const base64 = Buffer.from(originalUrl).toString('base64');
        const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        return `/token-logo/${base64url}.png`;
      };
      
      // ✅ Use DiceBear identicon via path-based proxy (Warpcast mobile compatible)
      const diceBearUrl = `https://api.dicebear.com/7.x/identicon/png?seed=${lowerAddress}&size=64`;
      let logoURI = toProxyUrl(diceBearUrl);
      
      const token = {
        address: lowerAddress,
        symbol,
        name,
        decimals,
        logoURI,
        riskScore: {
          level: riskScore.riskLevel,
          score: riskScore.score,
          isSafe,
          explanation: riskExplanation,
          warnings: riskScore.warnings,
          blockedReasons: riskScore.blockedReasons,
          checks: riskScore.checks,
        }
      };

      console.log(`🔍 Resolved custom token: ${symbol} (${address}) - Risk: ${riskScore.riskLevel} (${riskScore.score}/100)`);
      
      // Warn if token is blocked
      if (!isSafe) {
        console.warn(`⚠️ BLOCKED TOKEN: ${symbol} (${address}) - ${riskScore.blockedReasons.join(', ')}`);
      }
      
      res.json({ token });
    } catch (error) {
      console.error(`❌ Error resolving token ${req.params.address}:`, error);
      res.status(404).json({ error: 'Token not found or invalid ERC-20 contract' });
    }
  });

  // Search token by symbol (whitelisted + DEXScreener for all Base tokens)
  app.get("/api/tokens/search-by-symbol/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      
      if (!symbol || symbol.trim().length === 0) {
        return res.status(400).json({ error: 'Symbol required' });
      }

      const token = await searchTokenBySymbol(symbol);
      
      if (!token) {
        return res.status(404).json({ error: `Token symbol "${symbol}" not found on Base chain` });
      }

      console.log(`✅ Symbol search: ${symbol} → ${token.address} (${token.name})`);
      
      // Helper: Generate path-based proxy URL (no query strings for Warpcast mobile)
      const toProxyUrl = (originalUrl: string) => {
        const base64 = Buffer.from(originalUrl).toString('base64');
        const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        return `/token-logo/${base64url}.png`;
      };
      const diceBearUrl = `https://api.dicebear.com/7.x/identicon/png?seed=${token.address.toLowerCase()}&size=64`;
      
      res.json({ 
        token: {
          address: token.address.toLowerCase(),
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoURI: toProxyUrl(diceBearUrl),
        }
      });
    } catch (error) {
      console.error(`❌ Error searching token by symbol ${req.params.symbol}:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get wallet token balances (all popular Base tokens)
  app.get("/api/tokens/wallet-balances/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      
      if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
      
      // Get balances for ALL popular Base tokens (not just whitelisted)
      const { POPULAR_BASE_TOKENS } = await import('./tokenRiskScoring');
      const popularTokens = POPULAR_BASE_TOKENS;
      const balances = await Promise.all(
        popularTokens.map(async (token) => {
          try {
            let balance: bigint;
            
            // For WETH (native ETH wrapper), check both ETH and WETH balance
            if (token.symbol === 'WETH') {
              const ethBalance = await provider.getBalance(walletAddress);
              const wethContract = new ethers.Contract(
                token.address,
                ['function balanceOf(address) view returns (uint256)'],
                provider
              );
              const wethBalance = await wethContract.balanceOf(walletAddress);
              balance = ethBalance + wethBalance;
            } else {
              // Regular ERC20 token
              const contract = new ethers.Contract(
                token.address,
                ['function balanceOf(address) view returns (uint256)'],
                provider
              );
              balance = await contract.balanceOf(walletAddress);
            }
            
            const formattedBalance = ethers.formatUnits(balance, token.decimals);
            
            return {
              address: token.address.toLowerCase(),
              symbol: token.symbol,
              name: token.name,
              decimals: token.decimals,
              balance: formattedBalance,
              balanceRaw: balance.toString(),
              hasBalance: balance > BigInt(0),
              logoURI: `https://api.dicebear.com/7.x/identicon/svg?seed=${token.address}`,
            };
          } catch (error) {
            console.error(`Error fetching balance for ${token.symbol}:`, error);
            return {
              address: token.address.toLowerCase(),
              symbol: token.symbol,
              name: token.name,
              decimals: token.decimals,
              balance: '0',
              balanceRaw: '0',
              hasBalance: false,
              logoURI: `https://api.dicebear.com/7.x/identicon/svg?seed=${token.address}`,
            };
          }
        })
      );
      
      // Filter to only tokens with balance > 0
      const tokensWithBalance = balances.filter(t => t.hasBalance);
      
      console.log(`💰 Wallet ${walletAddress.slice(0, 6)}... has ${tokensWithBalance.length} tokens with balance`);
      
      res.json({ tokens: tokensWithBalance, allTokens: balances });
    } catch (error) {
      console.error(`❌ Error fetching wallet balances:`, error);
      res.status(500).json({ error: 'Failed to fetch wallet balances' });
    }
  });

  // Fetch Farcaster Cast for tokenization (using Neynar REST API)
  app.get("/api/cast/fetch", async (req, res) => {
    try {
      const { url } = req.query;
      
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "Farcaster cast URL required" });
      }

      const apiKey = process.env.NEYNAR_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ 
          error: "API key not configured",
          message: "Neynar API key is missing" 
        });
      }

      // Use Neynar REST API v2
      const neynarUrl = `https://api.neynar.com/v2/farcaster/cast?identifier=${encodeURIComponent(url)}&type=url`;
      const response = await fetch(neynarUrl, {
        headers: {
          'accept': 'application/json',
          'api_key': apiKey,
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json({ 
          error: "Cast not found",
          message: errorData.message || "Could not find cast with the provided URL" 
        });
      }

      const data = await response.json();
      const cast = data.cast;

      if (!cast) {
        return res.status(404).json({ 
          error: "Cast not found",
          message: "Invalid cast data received" 
        });
      }

      // Extract relevant data (Neynar API format)
      const castData = {
        hash: cast.hash,
        url: url,
        text: cast.text || "",
        authorFid: cast.author?.fid?.toString() || "",
        authorUsername: cast.author?.username || "",
        authorDisplayName: cast.author?.display_name || "",
        authorPfp: cast.author?.pfp_url || "",
        likes: cast.reactions?.likes_count || 0,
        recasts: cast.reactions?.recasts_count || 0,
        replies: cast.replies?.count || 0,
        embeds: cast.embeds || [],
        timestamp: cast.timestamp,
      };

      console.log('📝 Cast author data:', {
        username: castData.authorUsername,
        displayName: castData.authorDisplayName,
        fid: castData.authorFid
      });

      res.json(castData);
    } catch (error: any) {
      console.error("Error fetching cast:", error);
      res.status(500).json({ 
        error: "Failed to fetch cast",
        message: error.message || "Invalid Warpcast URL or cast not found"
      });
    }
  });

  // Helper function to generate manifest for basedmem.xyz
  const generateManifest = () => {
    const baseUrl = "https://basedmem.xyz";
    
    return {
      accountAssociation: {
        header: "eyJmaWQiOjM1MTUwMywidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweEM0MGE0RDBmRGEyMmFmOTNCQ0IzN2U5MTI1YkU1QjdGYjk2ZDU1MzAifQ",
        payload: "eyJkb21haW4iOiJiYXNlZG1lbS54eXoifQ",
        signature: "ZezfIM8GqEe665NLjEJPtb+ZyYapIS6pYrWah02oXMgG0W42tfAzVo7wnkH2v/bPUhcatCR1cjnuGahAjU4eQhw="
      },
      baseBuilder: {
        ownerAddress: "0x74E7FeACbb2ad2d46eCc1B403bdFb5c61EF139DF"
      },
      miniapp: {
        version: "1",
        name: "BasedMem",
        iconUrl: `${baseUrl}/icon.jpg`,
        homeUrl: baseUrl,
        splashImageUrl: `${baseUrl}/splash-icon.jpg`,
        splashBackgroundColor: "#0A0A0A",
        subtitle: "Swap, Agents and Stocks",
        description: "Swap tokens, create limit orders, discover onchain agents and access explainable tokenized stocks.",
        screenshotUrls: [
          `${baseUrl}/screenshot-1.jpg`
        ],
        primaryCategory: "finance",
        tags: ["defi", "trading", "agents"],
        heroImageUrl: `${baseUrl}/icon.jpg`,
        tagline: "Human-controlled onchain tools",
        webhookUrl: `${baseUrl}/api/webhook`,
        capabilities: ["wallet-solana"]
      }
    };
  };
  
  // Serve Farcaster Manifest at standard path
  app.get("/.well-known/farcaster.json", (req, res) => {
    const manifest = generateManifest();
    
    // Use timestamp as ETag to force cache invalidation
    const etag = `"v${Date.now()}"`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('ETag', etag);
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // If client has matching ETag, still send fresh content (force refresh)
    res.status(200).json(manifest);
  });
  
  // Farcaster Mini App notification token endpoint
  app.post("/api/notification-token", express.json(), async (req, res) => {
    try {
      const { url, token } = req.body;
      
      if (!url || !token) {
        return res.status(400).json({ error: "url and token required" });
      }
      
      console.log("🔔 Farcaster notification token received:");
      console.log("  URL:", url);
      console.log("  Token:", token.substring(0, 20) + "...");
      
      res.json({ success: true, message: "Notification token saved" });
    } catch (error) {
      console.error("Error saving notification token:", error);
      res.status(500).json({ error: "Failed to save token" });
    }
  });
  
  // Farcaster Webhook - receives miniapp_added, miniapp_removed, notifications_enabled, notifications_disabled events
  app.post("/api/webhook", express.json(), async (req, res) => {
    try {
      // 🔍 Log raw request for debugging
      console.log("📥 =================== FARCASTER WEBHOOK ===================");
      console.log("📥 Raw body:", JSON.stringify(req.body, null, 2));
      console.log("📥 Headers:", JSON.stringify({
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
      }, null, 2));
      
      const { event, notificationDetails, fid } = req.body;
      
      // Normalize FID to string (Warpcast may send as number)
      const fidString = fid !== undefined ? String(fid) : null;
      
      console.log("📥 Parsed webhook data:", {
        event,
        fid: fidString,
        fidType: typeof fid,
        hasNotificationDetails: !!notificationDetails,
        tokenPreview: notificationDetails?.token?.substring(0, 20) + "..." || 'none',
        url: notificationDetails?.url || 'none'
      });
      
      // Handle different events
      switch (event) {
        case 'miniapp_added':
        case 'notifications_enabled':
          if (notificationDetails?.token && notificationDetails?.url && fidString) {
            // Find user by FID and save notification token
            console.log(`🔍 Searching for user with FID: "${fidString}"`);
            const users = await storage.getUsersByFid(fidString);
            console.log(`🔍 Found ${users.length} user(s) for FID ${fidString}`);
            
            if (users && users.length > 0) {
              for (const user of users) {
                console.log(`📝 Updating user ${user.id} with notification token...`);
                await storage.updateUser(user.id, {
                  farcasterNotificationToken: notificationDetails.token,
                  farcasterNotificationUrl: notificationDetails.url,
                });
                console.log(`✅ Saved notification token for user ${user.id} (FID: ${fidString})`);
              }
            } else {
              console.log(`⚠️ No user found for FID ${fidString} - storing pending token`);
              
              // Store pending notification token for when user logs in
              console.log(`📦 Storing pending notification token for FID ${fidString}`);
              // We'll use a simple in-memory store for pending tokens
              (globalThis as any).pendingNotificationTokens = (globalThis as any).pendingNotificationTokens || {};
              (globalThis as any).pendingNotificationTokens[fidString] = {
                token: notificationDetails.token,
                url: notificationDetails.url,
                timestamp: Date.now()
              };
            }
          } else {
            console.log(`⚠️ Incomplete webhook data - token: ${!!notificationDetails?.token}, url: ${!!notificationDetails?.url}, fid: ${!!fidString}`);
          }
          break;
          
        case 'miniapp_removed':
        case 'notifications_disabled':
          if (fidString) {
            const users = await storage.getUsersByFid(fidString);
            if (users && users.length > 0) {
              for (const user of users) {
                await storage.updateUser(user.id, {
                  farcasterNotificationToken: null,
                  farcasterNotificationUrl: null,
                });
                console.log(`🔕 Cleared notification token for user ${user.id} (FID: ${fidString})`);
              }
            }
          }
          break;
          
        default:
          console.log(`ℹ️ Unknown webhook event: ${event}`);
      }
      
      console.log("📥 =========================================================");
      
      // Always return 200 OK to acknowledge receipt
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("❌ Webhook error:", error);
      // Still return 200 to prevent retries
      res.status(200).json({ success: true, error: "Processing failed" });
    }
  });
  
  // Debug endpoint to check notification token status by FID
  app.get("/api/debug-notification-status/:fid", async (req, res) => {
    try {
      const { fid } = req.params;
      const users = await storage.getUsersByFid(fid);
      
      if (!users || users.length === 0) {
        return res.json({
          found: false,
          fid,
          message: "No users found for this FID",
          pendingToken: (globalThis as any).pendingNotificationTokens?.[fid] ? "Yes" : "No"
        });
      }
      
      const results = users.map(user => ({
        userId: user.id,
        username: user.username,
        hasNotificationToken: !!user.farcasterNotificationToken,
        hasNotificationUrl: !!user.farcasterNotificationUrl,
        tokenPreview: user.farcasterNotificationToken ? user.farcasterNotificationToken.substring(0, 20) + "..." : null,
        notificationUrl: user.farcasterNotificationUrl
      }));
      
      res.json({
        found: true,
        fid,
        userCount: users.length,
        users: results
      });
    } catch (error) {
      console.error("Debug notification status error:", error);
      res.status(500).json({ error: "Failed to check status" });
    }
  });
  
  // Debug endpoint to create a test alert that will trigger immediately
  app.post("/api/debug-test-alert/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Get current DEGEN price
      const dexResponse = await fetch('https://api.dexscreener.com/latest/dex/tokens/0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed');
      const dexData = await dexResponse.json();
      const currentPrice = parseFloat(dexData.pairs?.[0]?.priceUsd || '0.001');
      
      // Create alert that will trigger immediately (below current price * 1.5)
      const targetPrice = (currentPrice * 1.5).toFixed(8);
      
      const alert = await storage.createPriceAlert({
        userId,
        tokenId: null,
        externalTokenAddress: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
        externalTokenSymbol: 'DEGEN',
        condition: 'below',
        targetPrice,
        notifyViaFarcaster: true,
      });
      
      console.log(`🧪 DEBUG: Created test alert - DEGEN below $${targetPrice} (current: $${currentPrice})`);
      console.log(`   This should trigger within 60 seconds!`);
      
      res.json({ 
        success: true, 
        alert,
        currentPrice,
        targetPrice,
        message: `Alert created: DEGEN below $${targetPrice}. Current price: $${currentPrice}. Should trigger immediately!`
      });
    } catch (error) {
      console.error("Debug test alert error:", error);
      res.status(500).json({ error: "Failed to create test alert" });
    }
  });
  
  // Debug endpoint to manually set notification token (for testing)
  app.post("/api/debug-set-notification-token/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const { token, url } = req.body;
      
      if (!token || !url) {
        return res.status(400).json({ error: "token and url required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      await storage.updateUser(userId, {
        farcasterNotificationToken: token,
        farcasterNotificationUrl: url,
      });
      
      console.log(`🔧 DEBUG: Manually set notification token for user ${userId}`);
      
      res.json({ 
        success: true, 
        message: "Notification token set",
        userId,
        tokenPreview: token.substring(0, 20) + "..."
      });
    } catch (error) {
      console.error("Debug set token error:", error);
      res.status(500).json({ error: "Failed to set token" });
    }
  });
  
  // Debug endpoint to check user's notification setup
  app.get("/api/debug-notifications/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const alerts = await storage.getPriceAlertsByUser(userId);
      
      // User is ready for notifications if they have token+url OR if they have FID (for Neynar fallback)
      const hasFrameNotifications = !!(user.farcasterNotificationToken && user.farcasterNotificationUrl);
      const hasFidNotifications = !!(user.farcasterFid && process.env.NEYNAR_API_KEY);
      
      res.json({
        userId: user.id,
        walletAddress: user.walletAddress,
        farcasterFid: user.farcasterFid || null,
        farcasterUsername: user.farcasterUsername || null,
        hasNotificationToken: !!user.farcasterNotificationToken,
        notificationUrl: user.farcasterNotificationUrl || null,
        activeAlerts: alerts.filter(a => a.isActive).length,
        totalAlerts: alerts.length,
        readyForNotifications: hasFrameNotifications || hasFidNotifications,
        notificationMethod: hasFrameNotifications ? 'frame_api' : hasFidNotifications ? 'neynar_fid' : 'none',
      });
    } catch (error) {
      console.error("Debug error:", error);
      res.status(500).json({ error: "Debug failed" });
    }
  });

  // Test notification endpoint - sends a test push notification
  app.post("/api/test-push/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Try Frame Notification API first
      if (user.farcasterNotificationToken && user.farcasterNotificationUrl) {
        const notificationPayload = {
          notificationId: `test-${Date.now()}`,
          title: "BasedMem Test Notification",
          body: "Your price alerts are working!",
          targetUrl: `https://${process.env.REPLIT_DEV_DOMAIN || 'basedmem.replit.app'}/alerts`,
          tokens: [user.farcasterNotificationToken],
        };
        
        console.log("🧪 Sending Frame API notification:", notificationPayload);
        
        const response = await fetch(user.farcasterNotificationUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notificationPayload),
        });
        
        const result = await response.text();
        console.log("🧪 Frame notification response:", response.status, result);
        
        if (response.ok) {
          return res.json({ success: true, message: "Test notification sent via Frame API!", method: "frame_api", response: result });
        }
      }
      
      // Fallback: Try Neynar notification if user has FID
      if (user.farcasterFid && process.env.NEYNAR_API_KEY) {
        console.log(`🧪 Trying Neynar notification for FID ${user.farcasterFid}...`);
        
        try {
          const neynarResponse = await fetch('https://api.neynar.com/v2/farcaster/notification', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.NEYNAR_API_KEY,
            },
            body: JSON.stringify({
              target_fids: [parseInt(user.farcasterFid, 10)],
              title: "🧪 BasedMem Test",
              body: "Your price alerts are working!",
              idempotency_key: `test-${userId}-${Date.now()}`,
            }),
          });
          
          const neynarResult = await neynarResponse.text();
          console.log("🧪 Neynar notification response:", neynarResponse.status, neynarResult);
          
          if (neynarResponse.ok) {
            return res.json({ success: true, message: "Test notification sent via Neynar!", method: "neynar_fid", response: neynarResult });
          } else {
            console.error("Neynar notification failed:", neynarResult);
            return res.status(500).json({ error: "Neynar notification failed", details: neynarResult, fid: user.farcasterFid });
          }
        } catch (neynarErr: any) {
          console.error("Neynar error:", neynarErr);
          return res.status(500).json({ error: "Neynar API error", message: neynarErr.message });
        }
      }
      
      // No notification method available
      return res.status(400).json({ 
        error: "No notification method available", 
        message: "Please add BasedMem to your Mini Apps in Warpcast first",
        hasToken: !!user.farcasterNotificationToken,
        hasUrl: !!user.farcasterNotificationUrl,
        hasFid: !!user.farcasterFid,
        hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      });
    } catch (error: any) {
      console.error("Test push error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Price Alerts API - supports both platform tokens and external Base tokens
  app.get("/api/alerts", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }
      
      const alerts = await storage.getPriceAlertsByUser(userId);
      const alertsWithTokenInfo = await Promise.all(
        alerts.map(async (alert) => {
          // Check if it's a platform token or external token
          if (alert.tokenId) {
            const token = await storage.getToken(alert.tokenId);
            return {
              ...alert,
              token,
              displayName: token?.name || 'Unknown',
              displaySymbol: token?.symbol || '???',
              displayLogoUrl: token?.logoUrl || null,
              tokenAddress: token?.contractAddress || null,
              isExternal: false,
            };
          } else if (alert.externalTokenAddress) {
            return {
              ...alert,
              token: null,
              displayName: alert.externalTokenName || 'Unknown',
              displaySymbol: alert.externalTokenSymbol || '???',
              displayLogoUrl: alert.externalTokenLogoUrl || null,
              tokenAddress: alert.externalTokenAddress,
              isExternal: true,
            };
          }
          return { ...alert, token: null, isExternal: false };
        })
      );
      
      res.json(alertsWithTokenInfo);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  app.post("/api/alerts", async (req, res) => {
    try {
      const { userId, tokenId, externalTokenAddress, externalTokenSymbol, externalTokenName, externalTokenLogoUrl, targetPrice, condition, notifyViaFarcaster } = req.body;
      
      if (!userId || !targetPrice || !condition) {
        return res.status(400).json({ error: "userId, targetPrice, and condition are required" });
      }
      
      // Must have either tokenId (platform token) or externalTokenAddress (Base token)
      if (!tokenId && !externalTokenAddress) {
        return res.status(400).json({ error: "Either tokenId or externalTokenAddress is required" });
      }
      
      const alertData: any = {
        userId,
        targetPrice: String(targetPrice),
        condition,
        notifyViaFarcaster: notifyViaFarcaster ?? true,
      };
      
      if (tokenId) {
        alertData.tokenId = tokenId;
      } else {
        alertData.externalTokenAddress = externalTokenAddress;
        alertData.externalTokenSymbol = externalTokenSymbol;
        alertData.externalTokenName = externalTokenName;
        alertData.externalTokenLogoUrl = externalTokenLogoUrl;
      }
      
      const alert = await storage.createPriceAlert(alertData);
      
      // Return with display info
      if (alert.tokenId) {
        const token = await storage.getToken(alert.tokenId);
        res.json({
          ...alert,
          token,
          displayName: token?.name || 'Unknown',
          displaySymbol: token?.symbol || '???',
          displayLogoUrl: token?.logoUrl || null,
          tokenAddress: token?.contractAddress || null,
          isExternal: false,
        });
      } else {
        res.json({
          ...alert,
          token: null,
          displayName: alert.externalTokenName || 'Unknown',
          displaySymbol: alert.externalTokenSymbol || '???',
          displayLogoUrl: alert.externalTokenLogoUrl || null,
          tokenAddress: alert.externalTokenAddress,
          isExternal: true,
        });
      }
    } catch (error) {
      console.error("Error creating alert:", error);
      res.status(400).json({ error: "Failed to create alert" });
    }
  });

  app.delete("/api/alerts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deletePriceAlert(id);
      
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Alert not found" });
      }
    } catch (error) {
      console.error("Error deleting alert:", error);
      res.status(500).json({ error: "Failed to delete alert" });
    }
  });

  app.patch("/api/alerts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await storage.updatePriceAlert(id, req.body);
      
      if (updated) {
        if (updated.tokenId) {
          const token = await storage.getToken(updated.tokenId);
          res.json({
            ...updated,
            token,
            displayName: token?.name || 'Unknown',
            displaySymbol: token?.symbol || '???',
            isExternal: false,
          });
        } else {
          res.json({
            ...updated,
            token: null,
            displayName: updated.externalTokenName || 'Unknown',
            displaySymbol: updated.externalTokenSymbol || '???',
            isExternal: true,
          });
        }
      } else {
        res.status(404).json({ error: "Alert not found" });
      }
    } catch (error) {
      console.error("Error updating alert:", error);
      res.status(500).json({ error: "Failed to update alert" });
    }
  });

  // Test Farcaster notification endpoint (for debugging)
  app.post("/api/test-farcaster-notification", async (req, res) => {
    try {
      const { fid, message } = req.body;
      
      if (!fid || !message) {
        return res.status(400).json({ error: "fid and message required" });
      }
      
      const apiKey = process.env.NEYNAR_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "NEYNAR_API_KEY not configured" });
      }
      
      console.log(`📤 Testing Farcaster DM to FID ${fid}...`);
      
      // Try sending a direct cast
      const response = await fetch('https://api.neynar.com/v2/farcaster/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          recipient_fid: parseInt(fid, 10),
          message: message,
          idempotency_key: `test-${Date.now()}`,
        }),
      });
      
      const responseData = await response.json();
      console.log(`📥 Neynar response:`, JSON.stringify(responseData));
      
      if (response.ok) {
        res.json({ success: true, response: responseData });
      } else {
        res.status(response.status).json({ success: false, error: responseData });
      }
    } catch (error: any) {
      console.error("❌ Farcaster notification test error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Token search API - searches DEXScreener for any Base token
  app.get("/api/tokens/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.json({ tokens: [] });
      }
      
      // Search DEXScreener for Base tokens
      const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`;
      const response = await fetch(dexScreenerUrl);
      
      if (!response.ok) {
        throw new Error(`DEXScreener API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Filter for Base chain tokens only (chainId: base)
      const baseTokens = (data.pairs || [])
        .filter((pair: any) => pair.chainId === 'base')
        .slice(0, 20)
        .map((pair: any) => ({
          address: pair.baseToken?.address,
          name: pair.baseToken?.name,
          symbol: pair.baseToken?.symbol,
          logoUrl: pair.info?.imageUrl || null,
          currentPrice: pair.priceUsd,
          priceChange24h: pair.priceChange?.h24,
          volume24h: pair.volume?.h24,
          liquidity: pair.liquidity?.usd,
          marketCap: pair.marketCap,
          dexScreenerUrl: pair.url,
          pairAddress: pair.pairAddress,
        }))
        .filter((token: any) => token.address);
      
      // Deduplicate by address
      const uniqueTokens = baseTokens.filter((token: any, index: number, self: any[]) =>
        index === self.findIndex((t) => t.address?.toLowerCase() === token.address?.toLowerCase())
      );
      
      res.json({ tokens: uniqueTokens });
    } catch (error) {
      console.error("Error searching tokens:", error);
      res.status(500).json({ error: "Failed to search tokens", tokens: [] });
    }
  });

  // Get token info by address from DEXScreener
  app.get("/api/tokens/external/:address", async (req, res) => {
    try {
      const { address } = req.params;
      
      const dexScreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
      const response = await fetch(dexScreenerUrl);
      
      if (!response.ok) {
        return res.status(404).json({ error: "Token not found" });
      }
      
      const data = await response.json();
      
      // Get the first Base chain pair for this token
      const basePair = (data.pairs || []).find((pair: any) => pair.chainId === 'base');
      
      if (!basePair) {
        return res.status(404).json({ error: "Token not found on Base" });
      }
      
      const tokenInfo = {
        address: basePair.baseToken?.address,
        name: basePair.baseToken?.name,
        symbol: basePair.baseToken?.symbol,
        logoUrl: basePair.info?.imageUrl || null,
        currentPrice: basePair.priceUsd,
        priceChange24h: basePair.priceChange?.h24,
        volume24h: basePair.volume?.h24,
        liquidity: basePair.liquidity?.usd,
        marketCap: basePair.marketCap,
        dexScreenerUrl: basePair.url,
      };
      
      res.json(tokenInfo);
    } catch (error) {
      console.error("Error fetching token:", error);
      res.status(500).json({ error: "Failed to fetch token info" });
    }
  });

  // Users API
  app.get("/api/users", async (req, res) => {
    try {
      const { walletAddress } = req.query;
      if (!walletAddress || typeof walletAddress !== "string") {
        return res.status(400).json({ error: "walletAddress required" });
      }
      
      const user = await storage.getUserByWalletAddress(walletAddress);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const user = await storage.createUser(req.body);
      res.json(user);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id/farcaster", async (req, res) => {
    try {
      const { id } = req.params;
      const { farcasterUsername, farcasterFid, farcasterNotificationToken, farcasterNotificationUrl } = req.body;
      
      const updateData: any = {};
      if (farcasterUsername !== undefined) updateData.farcasterUsername = farcasterUsername;
      if (farcasterFid !== undefined) updateData.farcasterFid = String(farcasterFid);
      if (farcasterNotificationToken !== undefined) updateData.farcasterNotificationToken = farcasterNotificationToken;
      if (farcasterNotificationUrl !== undefined) updateData.farcasterNotificationUrl = farcasterNotificationUrl;
      
      // 🔔 Check for pending notification token from webhook
      if (farcasterFid && !farcasterNotificationToken) {
        const fidString = String(farcasterFid);
        const pendingTokens = (globalThis as any).pendingNotificationTokens || {};
        const pendingToken = pendingTokens[fidString];
        
        if (pendingToken && pendingToken.token && pendingToken.url) {
          console.log(`🔔 Found pending notification token for FID ${fidString}!`);
          updateData.farcasterNotificationToken = pendingToken.token;
          updateData.farcasterNotificationUrl = pendingToken.url;
          // Remove from pending
          delete pendingTokens[fidString];
        }
      }
      
      const updated = await storage.updateUser(id, updateData);
      
      if (updated) {
        console.log(`✅ Updated Farcaster info for user ${id}:`, {
          fid: updateData.farcasterFid,
          hasToken: !!updateData.farcasterNotificationToken,
        });
        res.json(updated);
      } else {
        res.status(404).json({ error: "User not found" });
      }
    } catch (error) {
      console.error("Error updating Farcaster profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Tokens API
  app.get("/api/tokens", async (req, res) => {
    try {
      const tokens = await storage.getAllTokens();
      res.json(tokens);
    } catch (error) {
      console.error("Error fetching tokens:", error);
      res.status(500).json({ error: "Failed to fetch tokens" });
    }
  });

  app.get("/api/tokens/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const token = await storage.getToken(id);
      
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }
      
      res.json(token);
    } catch (error) {
      console.error("Error fetching token:", error);
      res.status(500).json({ error: "Failed to fetch token" });
    }
  });

  app.post("/api/tokens", async (req, res) => {
    try {
      // Handle creatorWalletAddress -> creatorId conversion
      let tokenData = { ...req.body };
      console.log("POST /api/tokens - incoming body:", req.body);
      console.log("POST /api/tokens - cast metadata:", {
        castUrl: req.body.castUrl,
        castAuthorUsername: req.body.castAuthorUsername,
        castText: req.body.castText,
      });
      
      if (tokenData.creatorWalletAddress && !tokenData.creatorId) {
        // Find or create user by wallet address
        let user = await storage.getUserByWalletAddress(tokenData.creatorWalletAddress);
        
        if (!user) {
          // Create new user if doesn't exist
          user = await storage.createUser({
            walletAddress: tokenData.creatorWalletAddress,
            username: `User_${tokenData.creatorWalletAddress.slice(0, 6)}`,
          });
          console.log("Created new user:", user.id);
        } else {
          console.log("Found existing user:", user.id);
        }
        
        tokenData.creatorId = user.id;
        delete tokenData.creatorWalletAddress;
        console.log("After setting creatorId:", { creatorId: tokenData.creatorId, contractAddress: tokenData.contractAddress });
      }
      
      const validatedData = insertTokenSchema.parse(tokenData);
      console.log("Validated token data:", validatedData);
      console.log("Validated cast metadata:", {
        castUrl: validatedData.castUrl,
        castAuthorUsername: validatedData.castAuthorUsername,
        castHash: validatedData.castHash,
      });
      
      // Check if symbol already exists
      const existingToken = await storage.getTokenBySymbol(validatedData.symbol);
      if (existingToken) {
        return res.status(400).json({ 
          error: "Symbol already exists", 
          message: `A token with symbol "${validatedData.symbol}" already exists. Please choose a different symbol.` 
        });
      }
      
      const token = await storage.createToken(validatedData);
      console.log("Created token in DB:", token);
      
      if (token.creatorId && token.contractAddress) {
        const creator = await storage.getUser(token.creatorId);
        
        // Check for badges (async, no await)
        checkAndAwardBadges(token.creatorId).catch(err => {
          console.error("Failed to award badges:", err);
        });
        
        postTokenLaunchTweet({
          name: token.name,
          symbol: token.symbol,
          creator: creator?.username || creator?.farcasterUsername || 'anonymous',
          address: token.contractAddress,
          initialPrice: token.currentPrice,
          // Cast tokenization metadata (if available)
          castUrl: token.castUrl || undefined,
          castAuthorUsername: token.castAuthorUsername || undefined,
          castText: token.castText || undefined,
        }).catch(err => {
          console.error("Failed to post launch tweet:", err);
        });
      }
      
      res.json(token);
    } catch (error) {
      console.error("Error creating token:", error);
      res.status(400).json({ error: "Failed to create token" });
    }
  });

  // 🌟 PREMIUM: Token Launch with x402 Payment
  app.post("/api/tokens/premium", createX402Middleware("PREMIUM_TOKEN_LAUNCH", storage), async (req, res) => {
    try {
      // Same token creation logic as regular endpoint
      let tokenData = { ...req.body };
      console.log("POST /api/tokens/premium - incoming body:", req.body);
      
      if (tokenData.creatorWalletAddress && !tokenData.creatorId) {
        let user = await storage.getUserByWalletAddress(tokenData.creatorWalletAddress);
        
        if (!user) {
          user = await storage.createUser({
            walletAddress: tokenData.creatorWalletAddress,
            username: `User_${tokenData.creatorWalletAddress.slice(0, 6)}`,
          });
          console.log("Created new user:", user.id);
        }
        
        tokenData.creatorId = user.id;
        delete tokenData.creatorWalletAddress;
      }
      
      const validatedData = insertTokenSchema.parse(tokenData);
      
      // Check if symbol already exists
      const existingToken = await storage.getTokenBySymbol(validatedData.symbol);
      if (existingToken) {
        return res.status(400).json({ 
          error: "Symbol already exists", 
          message: `A token with symbol "${validatedData.symbol}" already exists.` 
        });
      }
      
      // Create token first
      const createdToken = await storage.createToken(validatedData);
      
      // Then update with PREMIUM features
      await storage.updateToken(createdToken.id, {
        isVerified: true,  // ✅ Verified badge
      });
      
      console.log("✨ Created PREMIUM token:", createdToken.id);
      
      // Log payment transaction
      if (req.x402Payment && tokenData.creatorId) {
        const payment = await storage.createX402Payment({
          userId: tokenData.creatorId,
          endpoint: req.x402Payment.endpoint,
          feature: req.x402Payment.feature,
          amount: req.x402Payment.amount,
          currency: "USDC",
          network: process.env.X402_NETWORK || "base-sepolia",
          paymentProof: req.x402Payment.proof,
          metadata: JSON.stringify({ tokenId: createdToken.id, tokenSymbol: createdToken.symbol }),
          txHash: null,
          errorMessage: null,
        });
        
        // Update payment status to verified
        await storage.updateX402Payment(payment.id, {
          status: "verified",
          verifiedAt: new Date(),
          settledAt: new Date(),
        });
        
        console.log("💰 Payment logged for premium token launch");
      }
      
      // Award badges and post tweet
      if (createdToken.creatorId && createdToken.contractAddress) {
        const creator = await storage.getUser(createdToken.creatorId);
        
        checkAndAwardBadges(createdToken.creatorId).catch(err => {
          console.error("Failed to award badges:", err);
        });
        
        postTokenLaunchTweet({
          name: createdToken.name,
          symbol: createdToken.symbol,
          creator: creator?.username || creator?.farcasterUsername || 'anonymous',
          address: createdToken.contractAddress,
          initialPrice: createdToken.currentPrice,
          castUrl: createdToken.castUrl || undefined,
          castAuthorUsername: createdToken.castAuthorUsername || undefined,
          castText: createdToken.castText || undefined,
        }).catch(err => {
          console.error("Failed to post launch tweet:", err);
        });
      }
      
      res.json({
        ...createdToken,
        isVerified: true,
        isPremium: true,
        features: {
          verifiedBadge: true,
          trendingBoost: true,
          featuredPlacement: true,
        },
      });
    } catch (error) {
      console.error("Error creating premium token:", error);
      res.status(400).json({ error: "Failed to create premium token" });
    }
  });

  app.patch("/api/tokens/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await storage.updateToken(id, req.body);
      
      if (updated) {
        res.json(updated);
      } else {
        res.status(404).json({ error: "Token not found" });
      }
    } catch (error) {
      console.error("Error updating token:", error);
      res.status(500).json({ error: "Failed to update token" });
    }
  });

  // Trades API
  app.post("/api/trades", async (req, res) => {
    try {
      const validatedData = insertTradeSchema.parse(req.body);
      
      const amount = parseFloat(validatedData.amount);
      if (!isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "Invalid trade amount" });
      }
      
      const trade = await storage.createTrade(validatedData);
      res.json(trade);
    } catch (error) {
      console.error("Error creating trade:", error);
      res.status(400).json({ error: "Failed to create trade" });
    }
  });

  app.get("/api/trades/token/:tokenId", async (req, res) => {
    try {
      const { tokenId } = req.params;
      const trades = await storage.getTradesByToken(tokenId);
      res.json(trades);
    } catch (error) {
      console.error("Error fetching trades:", error);
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  // Holdings API
  app.get("/api/holdings/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const holdings = await storage.getHoldingsByUser(userId);
      
      const holdingsWithTokens = await Promise.all(
        holdings.map(async (holding) => {
          const token = await storage.getToken(holding.tokenId);
          return { ...holding, token };
        })
      );
      
      res.json(holdingsWithTokens);
    } catch (error) {
      console.error("Error fetching holdings:", error);
      res.status(500).json({ error: "Failed to fetch holdings" });
    }
  });

  app.post("/api/holdings", async (req, res) => {
    try {
      const validatedInput = insertHoldingSchema.parse({
        userId: req.body.userId,
        tokenId: req.body.tokenId,
        amount: req.body.amount,
        averageBuyPrice: req.body.price,
      });

      const parsedAmount = parseFloat(validatedInput.amount);
      const parsedPrice = parseFloat(validatedInput.averageBuyPrice);

      if (!isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      if (!isFinite(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: "Invalid price - price must be greater than or equal to zero" });
      }
      
      const existingHolding = await storage.getHolding(validatedInput.userId, validatedInput.tokenId);
      
      if (existingHolding) {
        const currentAmount = parseFloat(existingHolding.amount);
        const currentAvgPrice = parseFloat(existingHolding.averageBuyPrice);
        const newAmount = parsedAmount;
        const newPrice = parsedPrice;
        
        if (!isFinite(currentAmount) || !isFinite(currentAvgPrice) || currentAmount <= 0 || currentAvgPrice <= 0) {
          return res.status(400).json({ error: "Existing holding has invalid data" });
        }
        
        const totalAmount = currentAmount + newAmount;
        const newAvgPrice = ((currentAmount * currentAvgPrice) + (newAmount * newPrice)) / totalAmount;
        
        const updated = await storage.updateHolding(existingHolding.id, {
          amount: totalAmount.toString(),
          averageBuyPrice: newAvgPrice.toString(),
        });
        
        res.json(updated);
      } else {
        const holding = await storage.createHolding(validatedInput);
        res.json(holding);
      }
    } catch (error) {
      console.error("Error creating/updating holding:", error);
      res.status(400).json({ error: "Failed to create/update holding" });
    }
  });

  app.patch("/api/holdings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { amount } = req.body;

      if (!amount) {
        return res.status(400).json({ error: "Amount is required" });
      }

      const parsedAmount = parseFloat(amount);
      if (!isFinite(parsedAmount) || parsedAmount < 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      const updated = await storage.updateHolding(id, { amount: parsedAmount.toString() });
      res.json(updated);
    } catch (error) {
      console.error("Error updating holding:", error);
      res.status(400).json({ error: "Failed to update holding" });
    }
  });

  app.delete("/api/holdings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteHolding(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting holding:", error);
      res.status(400).json({ error: "Failed to delete holding" });
    }
  });

  // Sell Token - Real ETH Transfer
  app.post("/api/sell", async (req, res) => {
    try {
      const { userId, tokenId, tokenAmount, walletAddress } = req.body;

      if (!userId || !tokenId || !tokenAmount || !walletAddress) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const parsedAmount = parseFloat(tokenAmount);
      if (!isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Invalid token amount" });
      }

      // Get token info
      const token = await storage.getToken(tokenId);
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }

      // Get user holdings
      const holdings = await storage.getHoldingsByUser(userId);
      const currentHolding = holdings.find(h => h.tokenId === tokenId);

      if (!currentHolding) {
        return res.status(400).json({ error: "No holdings found for this token" });
      }

      const currentAmount = parseFloat(currentHolding.amount);
      if (currentAmount < parsedAmount) {
        return res.status(400).json({ error: "Insufficient token balance" });
      }

      // Calculate ETH to send
      const ethValue = parsedAmount * parseFloat(token.currentPrice);
      const gasFee = 0.00012; // Fixed gas fee
      const ethToSend = ethValue - gasFee;

      // TODO: Send real ETH to user wallet
      // const { Wallet, JsonRpcProvider } = await import("ethers");
      // const provider = new JsonRpcProvider("https://mainnet.base.org");
      // const platformWallet = new Wallet(process.env.PLATFORM_PRIVATE_KEY!, provider);
      // const tx = await platformWallet.sendTransaction({
      //   to: walletAddress,
      //   value: parseEther(ethToSend.toString())
      // });
      // await tx.wait();

      console.log(`[SELL] Would send ${ethToSend} ETH to ${walletAddress}`);

      // Update holdings
      const newAmount = currentAmount - parsedAmount;
      if (newAmount === 0) {
        await storage.deleteHolding(currentHolding.id);
      } else {
        await storage.updateHolding(currentHolding.id, { amount: newAmount.toString() });
      }

      // Record trade
      await storage.createTrade({
        userId,
        tokenId,
        type: "sell",
        amount: parsedAmount.toString(),
        price: token.currentPrice,
        totalValue: ethValue.toString(),
        gasFee: gasFee.toString(),
      });

      res.json({
        success: true,
        ethSent: ethToSend.toFixed(6),
        txHash: "0x" + Math.random().toString(16).substr(2, 64), // Mock for now
        message: `Successfully sold ${parsedAmount} ${token.symbol}`,
      });
    } catch (error: any) {
      console.error("Error executing sell:", error);
      res.status(500).json({ error: error.message || "Failed to execute sell" });
    }
  });

  // Daily Check-In API
  app.post("/api/check-in", async (req, res) => {
    try {
      const { walletAddress } = req.body;
      if (!walletAddress) {
        return res.status(400).json({ error: "walletAddress required" });
      }

      const user = await storage.getUserByWalletAddress(walletAddress);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const today = new Date();
      const existingCheckIn = await storage.getDailyCheckIn(user.id, today);

      if (existingCheckIn) {
        return res.status(400).json({ error: "Already checked in today" });
      }

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayCheckIn = await storage.getDailyCheckIn(user.id, yesterday);

      let newStreak = 1;
      if (yesterdayCheckIn) {
        newStreak = (user.currentStreak || 0) + 1;
      }

      const longestStreak = Math.max(newStreak, user.longestStreak || 0);
      const totalCheckIns = (user.totalCheckIns || 0) + 1;

      await storage.updateUser(user.id, {
        currentStreak: newStreak,
        longestStreak,
        totalCheckIns,
        lastCheckIn: today,
      });

      const checkIn = await storage.createDailyCheckIn({
        userId: user.id,
        checkInDate: today,
        streakDay: newStreak,
      });

      const updatedUser = await storage.getUser(user.id);

      res.json({
        checkIn,
        user: updatedUser,
        gasFeePaid: "0.00003",
      });
    } catch (error) {
      console.error("Error creating check-in:", error);
      res.status(500).json({ error: "Failed to create check-in" });
    }
  });

  app.get("/api/check-in/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      const user = await storage.getUserByWalletAddress(walletAddress);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const today = new Date();
      const todayCheckIn = await storage.getDailyCheckIn(user.id, today);
      const recentCheckIns = await storage.getCheckInsByUser(user.id);

      res.json({
        user,
        todayCheckIn,
        recentCheckIns: recentCheckIns.slice(0, 7),
      });
    } catch (error) {
      console.error("Error fetching check-in data:", error);
      res.status(500).json({ error: "Failed to fetch check-in data" });
    }
  });

  // Farcaster Frame API
  app.get("/frame/token/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const token = await storage.getToken(id);
      
      if (!token) {
        return res.status(404).send("Token not found");
      }

      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const baseUrl = `${protocol}://${req.get('host')}`;
      const priceChange = parseFloat(token.priceChange24h);
      const priceChangeText = priceChange >= 0 ? `+${token.priceChange24h}%` : `${token.priceChange24h}%`;
      
      // Farcaster requires PNG/JPG (not WebP or SVG)
      // Using local JPG to ensure correct format
      const frameImage = `${baseUrl}/icon.jpg`;
      
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${token.name} (${token.symbol}) - BasedMem</title>
  <meta property="og:title" content="${token.name} (${token.symbol})" />
  <meta property="og:description" content="Price: $${token.currentPrice} | Market Cap: $${(parseFloat(token.marketCap) / 1000).toFixed(0)}K | BasedMem Meme Coin" />
  <meta property="og:image" content="${frameImage}" />
  <meta property="fc:frame" content="vNext" />
  <meta property="fc:frame:image" content="${frameImage}" />
  <meta property="fc:frame:image:aspect_ratio" content="1.91:1" />
  <meta property="fc:frame:button:1" content="View on BasedMem" />
  <meta property="fc:frame:button:1:action" content="link" />
  <meta property="fc:frame:button:1:target" content="${baseUrl}/token/${id}" />
</head>
<body>
  <h1>${token.name} (${token.symbol})</h1>
  <p>Price: $${token.currentPrice} (${priceChangeText})</p>
  <p>Market Cap: $${(parseFloat(token.marketCap) / 1000).toFixed(0)}K</p>
  <p><a href="${baseUrl}/token/${id}">Trade on BasedMem</a></p>
</body>
</html>`;
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      console.error("Error generating frame:", error);
      res.status(500).send("Error generating frame");
    }
  });

  app.post("/api/frame/action/:tokenId", async (req, res) => {
    try {
      const { tokenId } = req.params;
      const { untrustedData } = req.body;
      const buttonIndex = untrustedData?.buttonIndex || 1;
      
      const token = await storage.getToken(tokenId);
      if (!token) {
        return res.status(404).send("Token not found");
      }

      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const baseUrl = `${protocol}://${req.get('host')}`;
      const imageUrl = `${baseUrl}/icon.jpg`;
      
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:title" content="Alert Set - ${token.name}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="fc:frame" content="vNext">
  <meta property="fc:frame:image" content="${imageUrl}">
  <meta property="fc:frame:image:aspect_ratio" content="1:1">
  <meta property="fc:frame:button:1" content="Alert Set!">
  <meta property="fc:frame:button:2" content="View Token">
  <meta property="fc:frame:button:2:action" content="link">
  <meta property="fc:frame:button:2:target" content="${baseUrl}/token/${tokenId}">
</head>
<body>
  <p>Price alert set for ${token.name}!</p>
</body>
</html>`;
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      console.error("Error handling frame action:", error);
      res.status(500).send("Error handling frame action");
    }
  });

  // Badges API
  app.get("/api/badges/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const badges = await storage.getBadgesByUser(userId);
      res.json(badges);
    } catch (error) {
      console.error("Error fetching badges:", error);
      res.status(500).json({ error: "Failed to fetch badges" });
    }
  });

  // Predictions API (Cast Futures)
  app.get("/api/predictions", async (req, res) => {
    try {
      const predictions = await storage.getAllPredictions();
      res.json(predictions);
    } catch (error) {
      console.error("Error fetching predictions:", error);
      res.status(500).json({ error: "Failed to fetch predictions" });
    }
  });

  app.get("/api/predictions/active", async (req, res) => {
    try {
      const predictions = await storage.getActivePredictions();
      res.json(predictions);
    } catch (error) {
      console.error("Error fetching active predictions:", error);
      res.status(500).json({ error: "Failed to fetch active predictions" });
    }
  });

  app.post("/api/predictions", async (req, res) => {
    try {
      const { castUrl, viralThreshold, deadlineHours, userId } = req.body;
      
      if (!castUrl || !viralThreshold || !deadlineHours || !userId) {
        return res.status(400).json({ error: "Missing required fields: castUrl, viralThreshold, deadlineHours, userId" });
      }

      // Validate numeric inputs
      const parsedThreshold = parseInt(viralThreshold);
      const parsedDeadlineHours = parseInt(deadlineHours);
      
      if (!isFinite(parsedThreshold) || parsedThreshold <= 0) {
        return res.status(400).json({ error: "viralThreshold must be a positive number" });
      }
      
      if (!isFinite(parsedDeadlineHours) || parsedDeadlineHours <= 0 || parsedDeadlineHours > 168) {
        return res.status(400).json({ error: "deadlineHours must be between 1 and 168 (7 days)" });
      }

      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if prediction already exists for this cast
      const existing = await storage.getPredictionByCastUrl(castUrl);
      if (existing) {
        return res.status(400).json({ error: "Prediction already exists for this cast" });
      }

      // Fetch cast data from Neynar
      const apiKey = process.env.NEYNAR_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "API key not configured" });
      }

      const neynarUrl = `https://api.neynar.com/v2/farcaster/cast?identifier=${encodeURIComponent(castUrl)}&type=url`;
      const response = await fetch(neynarUrl, {
        headers: {
          'accept': 'application/json',
          'api_key': apiKey,
        }
      });

      if (!response.ok) {
        return res.status(404).json({ error: "Cast not found" });
      }

      const data = await response.json();
      const cast = data.cast;

      // Calculate deadline
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + parsedDeadlineHours);
      const deadlineTimestamp = Math.floor(deadline.getTime() / 1000); // Convert to UNIX timestamp

      // Step 1: Create prediction market on blockchain
      console.log("🔗 Creating prediction market on blockchain...");
      let marketId: number;
      try {
        marketId = await createPredictionMarketOnChain(
          castUrl,
          parsedThreshold,
          deadlineTimestamp
        );
        console.log("✅ Blockchain market created with ID:", marketId);
      } catch (blockchainError: any) {
        console.error("Failed to create blockchain market:", blockchainError);
        return res.status(500).json({ 
          error: "Failed to create prediction market on blockchain",
          details: blockchainError.message 
        });
      }

      // Step 2: Create prediction in database with market ID
      const prediction = await storage.createPrediction({
        marketId,
        castUrl,
        castHash: cast.hash,
        castAuthorFid: cast.author?.fid?.toString() || "",
        castAuthorUsername: cast.author?.username || "",
        castText: cast.text || "",
        initialLikes: cast.reactions?.likes_count || 0,
        initialRecasts: cast.reactions?.recasts_count || 0,
        viralThreshold: parsedThreshold,
        deadline,
        createdBy: userId,
      });

      res.json(prediction);
    } catch (error: any) {
      console.error("Error creating prediction:", error);
      res.status(500).json({ error: error.message || "Failed to create prediction" });
    }
  });

  app.post("/api/predictions/:id/bet", async (req, res) => {
    try {
      const { id } = req.params;
      const { userId, betAmount, predictedOutcome } = req.body;

      if (!userId || !betAmount || !predictedOutcome) {
        return res.status(400).json({ error: "Missing required fields: userId, betAmount, predictedOutcome" });
      }

      if (predictedOutcome !== 'for' && predictedOutcome !== 'against') {
        return res.status(400).json({ error: "predictedOutcome must be 'for' or 'against'" });
      }

      // Validate bet amount
      const parsedBetAmount = parseFloat(betAmount);
      if (!isFinite(parsedBetAmount) || parsedBetAmount <= 0) {
        return res.status(400).json({ error: "betAmount must be a positive number" });
      }

      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get prediction
      const prediction = await storage.getPrediction(id);
      if (!prediction) {
        return res.status(404).json({ error: "Prediction not found" });
      }

      // Check if prediction is still active
      if (prediction.status !== 'active') {
        return res.status(400).json({ error: "Prediction is not active" });
      }

      // Check if deadline has passed
      if (new Date() > new Date(prediction.deadline)) {
        return res.status(400).json({ error: "Prediction deadline has passed" });
      }

      // Create bet
      const bet = await storage.createBet({
        userId,
        predictionId: id,
        betAmount: parsedBetAmount.toString(),
        predictedOutcome,
      });

      // Update prediction totals
      const currentPool = parseFloat(prediction.totalPool);
      const newPool = currentPool + parsedBetAmount;
      
      const currentFor = parseFloat(prediction.totalBetsFor || '0');
      const currentAgainst = parseFloat(prediction.totalBetsAgainst || '0');
      
      const updates = {
        totalPool: newPool.toString(),
        totalBetsFor: predictedOutcome === 'for' ? (currentFor + parsedBetAmount).toString() : currentFor.toString(),
        totalBetsAgainst: predictedOutcome === 'against' ? (currentAgainst + parsedBetAmount).toString() : currentAgainst.toString(),
      };

      await storage.updatePrediction(id, updates);

      res.json(bet);
    } catch (error: any) {
      console.error("Error placing bet:", error);
      res.status(500).json({ error: error.message || "Failed to place bet" });
    }
  });

  app.post("/api/predictions/:id/resolve", async (req, res) => {
    try {
      const { id } = req.params;

      // Get prediction
      const prediction = await storage.getPrediction(id);
      if (!prediction) {
        return res.status(404).json({ error: "Prediction not found" });
      }

      // Check if prediction is still active
      if (prediction.status !== 'active') {
        return res.status(400).json({ error: "Prediction already resolved" });
      }

      // Fetch current cast metrics
      const apiKey = process.env.NEYNAR_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "API key not configured" });
      }

      const neynarUrl = `https://api.neynar.com/v2/farcaster/cast?identifier=${encodeURIComponent(prediction.castUrl)}&type=url`;
      const response = await fetch(neynarUrl, {
        headers: {
          'accept': 'application/json',
          'api_key': apiKey,
        }
      });

      if (!response.ok) {
        return res.status(500).json({ error: "Failed to fetch cast data" });
      }

      const data = await response.json();
      const cast = data.cast;
      const currentLikes = cast.reactions?.likes_count || 0;
      const currentRecasts = cast.reactions?.recasts_count || 0;

      // Calculate total engagement
      const initialEngagement = (prediction.initialLikes || 0) + (prediction.initialRecasts || 0);
      const currentEngagement = currentLikes + currentRecasts;
      const engagementGrowth = currentEngagement - initialEngagement;

      // Determine outcome
      const winningOutcome = engagementGrowth >= prediction.viralThreshold ? 'for' : 'against';

      // Update prediction
      const updates = {
        status: 'resolved' as const,
        winningOutcome,
        resolvedAt: new Date(),
      };

      await storage.updatePrediction(id, updates);

      // Calculate and distribute payouts
      const bets = await storage.getBetsByPrediction(id);
      const winningBets = bets.filter(bet => bet.predictedOutcome === winningOutcome);
      const totalWinningBets = winningBets.reduce((sum, bet) => sum + parseFloat(bet.betAmount), 0);
      const totalPool = parseFloat(prediction.totalPool);

      // Distribute payouts
      for (const bet of winningBets) {
        const betAmountNum = parseFloat(bet.betAmount);
        const share = betAmountNum / totalWinningBets;
        const payout = totalPool * share;
        
        await storage.updateBet(bet.id, {
          payout: payout.toString(),
        });
      }

      res.json({
        success: true,
        prediction: await storage.getPrediction(id),
        outcome: winningOutcome,
        engagementGrowth,
        totalPayout: totalPool,
      });
    } catch (error: any) {
      console.error("Error resolving prediction:", error);
      res.status(500).json({ error: error.message || "Failed to resolve prediction" });
    }
  });

  app.get("/api/predictions/:id/bets", async (req, res) => {
    try {
      const { id } = req.params;
      const bets = await storage.getBetsByPrediction(id);
      res.json(bets);
    } catch (error) {
      console.error("Error fetching bets:", error);
      res.status(500).json({ error: "Failed to fetch bets" });
    }
  });

  app.get("/api/bets/user/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const bets = await storage.getBetsByUser(userId);
      res.json(bets);
    } catch (error) {
      console.error("Error fetching user bets:", error);
      res.status(500).json({ error: "Failed to fetch user bets" });
    }
  });

  // Launch from Cast - Farcaster Frame Action
  app.get("/api/frame/quick-launch", async (req, res) => {
    try {
      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const baseUrl = `${protocol}://${req.get('host')}`;
      const frameImage = `${baseUrl}/icon.jpg`;
      
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quick Launch on BasedMem</title>
  <meta property="og:title" content="Quick Launch Your Meme Token" />
  <meta property="og:description" content="Deploy a token on Base in 5 seconds!" />
  <meta property="og:image" content="${frameImage}" />
  <meta property="fc:frame" content="vNext" />
  <meta property="fc:frame:image" content="${frameImage}" />
  <meta property="fc:frame:image:aspect_ratio" content="1.91:1" />
  <meta property="fc:frame:button:1" content="⚡ Launch Token Now" />
  <meta property="fc:frame:button:1:action" content="link" />
  <meta property="fc:frame:button:1:target" content="${baseUrl}" />
</head>
<body>
  <h1>⚡ Quick Launch on BasedMem</h1>
  <p>Deploy your meme token on Base in 5 seconds!</p>
</body>
</html>`;
      
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      console.error("Error generating quick launch frame:", error);
      res.status(500).send("Error generating frame");
    }
  });

  // Fetch ETH/USD price from CoinGecko (for limit order calculations)
  app.get("/api/eth-price", async (req, res) => {
    try {
      console.log('💰 Fetching ETH/USD price from CoinGecko...');
      
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
      );
      
      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      const ethPrice = data.ethereum?.usd;
      
      if (!ethPrice) {
        throw new Error('ETH price not found in response');
      }
      
      console.log(`✅ ETH/USD: $${ethPrice}`);
      res.json({ price: ethPrice });
    } catch (error) {
      console.error('Error fetching ETH price:', error);
      res.status(500).json({ error: 'Failed to fetch ETH price' });
    }
  });

  // 0x Swap API Proxy (to avoid CORS)
  // Fetch trending tokens on Base network (for ticker display)
  app.get("/api/trending-tokens", async (req, res) => {
    try {
      console.log('🔥 Fetching trending tokens from GeckoTerminal...');
      
      // GeckoTerminal API - Base network trending pools (FREE, no API key needed)
      // IMPORTANT: include=base_token to get token logos in 'included' array
      const response = await fetch('https://api.geckoterminal.com/api/v2/networks/base/trending_pools?include=base_token');
      
      if (!response.ok) {
        throw new Error(`GeckoTerminal API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Parse trending tokens with price change data and logos
      const trendingTokens = data.data.map((pool: any, index: number) => {
        const attributes = pool.attributes;
        
        // Extract base token info from included data
        let baseTokenAddress = null;
        let baseTokenSymbol = null;
        let logoUrl = null;
        
        if (pool.relationships?.base_token?.data) {
          const baseTokenId = pool.relationships.base_token.data.id;
          const tokenData = data.included?.find((item: any) => 
            item.type === 'token' && item.id === baseTokenId
          );
          
          if (tokenData) {
            baseTokenAddress = tokenData.attributes?.address;
            baseTokenSymbol = tokenData.attributes?.symbol;
            logoUrl = tokenData.attributes?.image_url;
          }
        }
        
        // Fallback values if included data not available
        if (!baseTokenAddress) {
          baseTokenAddress = attributes.base_token_price_native_currency_address || attributes.address;
        }
        if (!baseTokenSymbol) {
          // Extract symbol from pool name (e.g., "ZORA / USDC 0.3%" -> "ZORA")
          const match = attributes.name.match(/^([A-Z0-9$]+)\s*\//);
          baseTokenSymbol = match ? match[1] : (attributes.base_token_price_native_currency_symbol || 'USD');
        }
        if (!logoUrl) {
          logoUrl = attributes.base_token_image_url || attributes.image_url;
        }
        
        // Fallback: Use DiceBear with token address as seed
        const fallbackUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${baseTokenAddress}`;
        
        if (index < 3) {
          console.log(`Token ${index}: ${attributes.name}, Symbol: ${baseTokenSymbol}, Address: ${baseTokenAddress}, Logo: ${logoUrl || 'fallback'}`);
        }
        
        return {
          name: attributes.name,
          symbol: baseTokenSymbol,
          priceUsd: parseFloat(attributes.base_token_price_usd || 0),
          priceChange24h: parseFloat(attributes.price_change_percentage?.h24 || 0),
          volume24h: parseFloat(attributes.volume_usd?.h24 || 0),
          address: baseTokenAddress,
          logoUrl: logoUrl || fallbackUrl,
        };
      });

      console.log(`✅ Fetched ${trendingTokens.length} trending Base tokens`);
      res.json({ tokens: trendingTokens });
    } catch (error) {
      console.error('❌ Error fetching trending tokens:', error);
      res.status(500).json({ error: 'Failed to fetch trending tokens', tokens: [] });
    }
  });

  // ✅ Solana Trending Tokens API (GeckoTerminal - FREE, no API key needed)
  app.get("/api/solana-trending-tokens", async (req, res) => {
    try {
      console.log('🔥 Fetching trending Solana tokens from GeckoTerminal...');
      
      // GeckoTerminal API - Solana network trending pools
      const response = await fetch('https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?include=base_token');
      
      if (!response.ok) {
        throw new Error(`GeckoTerminal API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Parse trending tokens with price change data and logos
      const trendingTokens = data.data.slice(0, 15).map((pool: any, index: number) => {
        const attributes = pool.attributes;
        
        // Extract base token info from included data
        let baseTokenAddress = null;
        let baseTokenSymbol = null;
        let baseTokenName = null;
        let logoUrl = null;
        
        if (pool.relationships?.base_token?.data) {
          const baseTokenId = pool.relationships.base_token.data.id;
          const tokenData = data.included?.find((item: any) => 
            item.type === 'token' && item.id === baseTokenId
          );
          
          if (tokenData) {
            baseTokenAddress = tokenData.attributes?.address;
            baseTokenSymbol = tokenData.attributes?.symbol;
            baseTokenName = tokenData.attributes?.name;
            logoUrl = tokenData.attributes?.image_url;
          }
        }
        
        // Fallback values if included data not available
        if (!baseTokenAddress) {
          // Try to extract from pool id (format: solana_ADDRESS)
          const poolAddress = pool.id?.split('_')[1] || attributes.address;
          baseTokenAddress = poolAddress;
        }
        if (!baseTokenSymbol) {
          // Extract symbol from pool name (e.g., "BONK / SOL" -> "BONK")
          const match = attributes.name.match(/^([A-Z0-9$]+)\s*\//);
          baseTokenSymbol = match ? match[1] : 'TOKEN';
        }
        if (!baseTokenName) {
          baseTokenName = baseTokenSymbol;
        }
        if (!logoUrl) {
          logoUrl = attributes.base_token_image_url || attributes.image_url;
        }
        
        // Fallback: Use DiceBear with token address as seed
        const fallbackUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${baseTokenAddress}`;
        
        if (index < 3) {
          console.log(`Solana Token ${index}: ${baseTokenName}, Symbol: ${baseTokenSymbol}, Logo: ${logoUrl || 'fallback'}`);
        }
        
        return {
          name: baseTokenName || attributes.name,
          symbol: baseTokenSymbol,
          priceUsd: parseFloat(attributes.base_token_price_usd || 0),
          priceChange24h: parseFloat(attributes.price_change_percentage?.h24 || 0),
          volume24h: parseFloat(attributes.volume_usd?.h24 || 0),
          address: baseTokenAddress,
          logoUrl: logoUrl || fallbackUrl,
        };
      });

      console.log(`✅ Fetched ${trendingTokens.length} trending Solana tokens`);
      res.json({ tokens: trendingTokens });
    } catch (error) {
      console.error('❌ Error fetching Solana trending tokens:', error);
      res.status(500).json({ error: 'Failed to fetch Solana trending tokens', tokens: [] });
    }
  });


  // ✅ 0x API v2 quote endpoint - GET (backward compatibility for desktop)
  app.get("/api/swap-quote", async (req, res) => {
    try {
      const { sellToken, buyToken, sellAmount, slippagePercentage, takerAddress } = req.query;
      
      // ✅ ARCHITECT DEBUG: Log all incoming request details
      const userAgent = req.headers['user-agent'] || 'unknown';
      const referer = req.headers['referer'] || req.headers['referrer'] || 'unknown';
      
      console.log('🎯 SWAP QUOTE REQUEST (GET):', {
        userAgent: userAgent.substring(0, 120),
        referer,
        queryParams: {
          sellToken,
          buyToken,
          sellAmount,
          slippagePercentage,
          takerAddress
        },
        timestamp: new Date().toISOString()
      });

      if (!sellToken || !buyToken || !sellAmount) {
        console.log('❌ MISSING PARAMS:', { sellToken: !!sellToken, buyToken: !!buyToken, sellAmount: !!sellAmount });
        return res.status(400).json({ error: "Missing required parameters" });
      }

      // ✅ CORRECT: Unified v2 endpoint with chainId parameter (per 0x docs 2024)
      const params = new URLSearchParams({
        chainId: '8453', // Base mainnet
        sellToken: sellToken as string,
        buyToken: buyToken as string,
        sellAmount: sellAmount as string,
        slippagePercentage: slippagePercentage as string || '0.01',
      });

      // ✅ Only add taker if wallet is connected (optional parameter)
      if (takerAddress) {
        params.append('taker', takerAddress as string);
      }
      
      console.log('📋 0x API PARAMS (Unified v2 - VERIFIED 2024):', {
        endpoint: 'https://api.0x.org/swap/allowance-holder/quote',
        chainId: params.get('chainId'),
        sellToken: params.get('sellToken'),
        buyToken: params.get('buyToken'),
        sellAmount: params.get('sellAmount'),
        slippagePercentage: params.get('slippagePercentage'),
        taker: params.get('taker') || 'none (disconnected)'
      });

      const apiKey = process.env.OX_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ 
          error: '0x API key not configured',
          details: 'Please set OX_API_KEY environment variable' 
        });
      }
      
      // ✅ OPTIMIZED: Add timeout for faster response (5 seconds max)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      // ✅ VERIFIED CORRECT (0x docs 2024): Unified endpoint + chainId parameter
      const response = await fetch(
        `https://api.0x.org/swap/allowance-holder/quote?${params.toString()}`,
        {
          headers: {
            '0x-api-key': apiKey,
            '0x-version': 'v2',
          },
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorText = await response.text();
        console.error('❌ 0x API ERROR:', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText,
          requestParams: {
            sellToken: params.get('sellToken'),
            buyToken: params.get('buyToken'),
            sellAmount: params.get('sellAmount'),
            slippagePercentage: params.get('slippagePercentage'),
            taker: params.get('taker')
          }
        });
        
        // Parse JSON error if possible
        let errorDetails = errorText;
        let userFriendlyMessage = '0x API error';
        
        try {
          const parsed = JSON.parse(errorText);
          errorDetails = parsed;
          console.error('Parsed 0x error:', JSON.stringify(parsed, null, 2));
          
          // Extract user-friendly message
          if (parsed.message) {
            userFriendlyMessage = parsed.message;
          }
          
          // Check for common errors
          if (parsed.name === 'INPUT_INVALID' || errorText.includes('INPUT_INVALID')) {
            userFriendlyMessage = 'Invalid swap parameters. Amount may be too small (minimum $1-5 USD) or token pair not supported.';
          } else if (errorText.includes('INSUFFICIENT_ASSET_LIQUIDITY')) {
            userFriendlyMessage = 'Insufficient liquidity for this token pair.';
          } else if (errorText.includes('sellAmount')) {
            userFriendlyMessage = 'Swap amount too small. Please increase the amount (minimum $1-5 USD).';
          }
        } catch (e) {
          // Not JSON, use as-is
        }
        
        return res.status(response.status).json({ 
          error: userFriendlyMessage,
          details: errorDetails 
        });
      }

      const data = await response.json();
      
      console.log('✅ 0x quote received:', {
        buyAmount: data.buyAmount,
        hasTransaction: !!data.transaction,
        transactionValue: data.transaction?.value,
        transactionTo: data.transaction?.to,
        issues: data.issues,
      });
      
      // ⚠️ Check for v2 API issues (balance/allowance problems)
      if (data.issues) {
        console.log('⚠️ 0x API issues detected:', JSON.stringify(data.issues, null, 2));
      }
      
      res.json(data);
    } catch (error: any) {
      console.error("Error fetching swap quote:", error);
      
      // ✅ Handle timeout specifically
      if (error.name === 'AbortError') {
        return res.status(408).json({ 
          error: 'Quote request timed out. Please try again.',
          details: 'The 0x API took too long to respond.'
        });
      }
      
      res.status(500).json({ error: error.message || "Failed to fetch quote" });
    }
  });

  // 🌟 ODOS Quote API - Alternative DEX aggregator (Base optimized)
  app.post("/api/swap/odos-quote", express.json(), async (req, res) => {
    try {
      const { sellToken, buyToken, sellAmount, slippagePercentage, userAddress } = req.body;

      console.log('🔷 ODOS quote request:', { sellToken, buyToken, sellAmount, slippagePercentage, userAddress });

      if (!sellToken || !buyToken || !sellAmount) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      // ODOS uses slippageLimitPercent (e.g., 0.3 for 0.3%)
      const slippageLimitPercent = slippagePercentage 
        ? parseFloat(slippagePercentage as string)
        : 0.5;

      // ✅ CRITICAL: Normalize address to lowercase (ODOS is case-sensitive!)
      const normalizedUserAddr = userAddress 
        ? userAddress.toLowerCase() 
        : "0x0000000000000000000000000000000000000000";

      const odosBody = {
        chainId: 8453, // Base
        inputTokens: [{
          tokenAddress: sellToken,
          amount: sellAmount
        }],
        outputTokens: [{
          tokenAddress: buyToken,
          proportion: 1
        }],
        slippageLimitPercent,
        userAddr: normalizedUserAddr,
        referralCode: 0,
        compact: true
      };

      console.log('📤 ODOS quote API request:', JSON.stringify(odosBody, null, 2));

      const response = await fetch('https://api.odos.xyz/sor/quote/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(odosBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ ODOS quote API error:', response.status, errorText);
        return res.status(response.status).json({ 
          error: 'ODOS API error',
          details: errorText 
        });
      }

      const data = await response.json();
      console.log('✅ ODOS quote received:', {
        outAmounts: data.outAmounts,
        gasEstimate: data.gasEstimate,
        pathId: data.pathId?.substring(0, 20)
      });
      
      res.json(data);
    } catch (error: any) {
      console.error("❌ Error fetching ODOS quote:", error);
      res.status(500).json({ error: error.message || "Failed to fetch ODOS quote" });
    }
  });

  // 🌟 ODOS Assemble API - Get transaction data for execution
  app.post("/api/swap/odos-assemble", express.json(), async (req, res) => {
    try {
      const { pathId, userAddress } = req.body;

      console.log('🔷 ODOS assemble request:', { pathId, userAddress });

      if (!pathId || !userAddress) {
        return res.status(400).json({ error: "Missing pathId or userAddress" });
      }

      // ✅ CRITICAL: Normalize address to lowercase (must match quote request!)
      const normalizedUserAddr = userAddress.toLowerCase();

      const assembleBody = {
        pathId,
        userAddr: normalizedUserAddr,
        simulate: false
      };

      console.log('📤 ODOS assemble API request:', JSON.stringify(assembleBody, null, 2));

      const response = await fetch('https://api.odos.xyz/sor/assemble', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assembleBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ ODOS assemble API error:', response.status, errorText);
        return res.status(response.status).json({ 
          error: 'ODOS assemble error',
          details: errorText 
        });
      }

      const data = await response.json();
      console.log('✅ ODOS transaction assembled:', {
        to: data.transaction?.to,
        value: data.transaction?.value,
        gasLimit: data.transaction?.gas,
        dataLength: data.transaction?.data?.length
      });
      
      res.json(data);
    } catch (error: any) {
      console.error("❌ Error assembling ODOS transaction:", error);
      res.status(500).json({ error: error.message || "Failed to assemble ODOS transaction" });
    }
  });

  // Farcaster Frame Transaction Endpoint
  app.post("/api/swap/frame-transaction", async (req, res) => {
    try {
      const { sellToken, buyToken, sellAmount, userAddress, slippagePercentage } = req.body;

      console.log('🔷 Frame transaction request:', { sellToken, buyToken, sellAmount, userAddress, slippagePercentage });

      if (!sellToken || !buyToken || !sellAmount || !userAddress) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      // Normalize slippage: convert percentage (0.5) to decimal (0.005)
      let normalizedSlippage = '0.005'; // 0.5% default
      if (slippagePercentage) {
        const slippageNum = Number(slippagePercentage);
        if (isNaN(slippageNum) || slippageNum < 0 || slippageNum > 50) {
          return res.status(400).json({ error: "Invalid slippage percentage (must be 0-50)" });
        }
        normalizedSlippage = (slippageNum / 100).toString();
      }

      console.log('🔷 Normalized slippage:', normalizedSlippage);

      // ✅ CORRECT: Unified v2 endpoint with chainId parameter (per 0x docs 2024)
      const params = new URLSearchParams({
        chainId: '8453', // Base chain ID
        sellToken,
        buyToken,
        sellAmount,
        taker: userAddress,
        slippagePercentage: normalizedSlippage,
      });

      const apiKey = process.env.OX_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ 
          error: '0x API key not configured',
          details: 'Please set OX_API_KEY environment variable' 
        });
      }
      
      console.log('🔷 Fetching 0x quote for Frame transaction (Unified v2)...');
      const response = await fetch(
        `https://api.0x.org/swap/allowance-holder/quote?${params.toString()}`,
        {
          headers: {
            '0x-api-key': apiKey,
            '0x-version': 'v2',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ 0x API error:', response.status, errorText);
        return res.status(response.status).json({ 
          error: '0x API error',
          details: errorText 
        });
      }

      const quoteData = await response.json();
      console.log('✅ 0x quote received:', {
        buyAmount: quoteData.buyAmount,
        hasTransaction: !!quoteData.transaction,
        hasGas: !!quoteData.transaction?.gas
      });

      // Extract transaction data from 0x response
      const transaction = quoteData.transaction || quoteData;
      
      // Convert 0x decimal values to hex format for Farcaster
      const valueHex = transaction.value 
        ? ethers.toBeHex(transaction.value)
        : '0x0';
      
      const gasLimitHex = transaction.gas
        ? ethers.toBeHex(transaction.gas)
        : ethers.toBeHex(500000); // 500k default
      
      // Build Farcaster Frame transaction response with all required fields
      const frameTransaction = {
        chainId: 'eip155:8453', // Base mainnet (outer)
        method: 'eth_sendTransaction',
        params: {
          chainId: '0x2105', // Base mainnet hex (8453) - required in params
          to: transaction.to,
          data: transaction.data,
          value: valueHex,
          gas: gasLimitHex, // Some Farcaster specs use 'gas'
          gasLimit: gasLimitHex, // Some use 'gasLimit'
          // Include EIP-1559 fee fields if provided by 0x
          ...(transaction.maxFeePerGas && { 
            maxFeePerGas: ethers.toBeHex(transaction.maxFeePerGas) 
          }),
          ...(transaction.maxPriorityFeePerGas && { 
            maxPriorityFeePerGas: ethers.toBeHex(transaction.maxPriorityFeePerGas) 
          }),
        },
      };

      console.log('🟢 Frame transaction built:', {
        to: frameTransaction.params.to,
        gasLimit: frameTransaction.params.gasLimit,
        value: frameTransaction.params.value,
      });

      res.json(frameTransaction);
    } catch (error: any) {
      console.error("❌ Error building frame transaction:", error);
      res.status(500).json({ error: error.message || "Failed to build transaction" });
    }
  });

  // Token Image Proxy - Path-based (no query strings for Warpcast mobile compatibility)
  // Format: /token-logo/{base64url}.png where base64url is URL-safe base64 encoded original URL
  app.get("/token-logo/:encodedUrl", async (req, res) => {
    try {
      let { encodedUrl } = req.params;
      
      // Remove .png extension if present
      if (encodedUrl.endsWith('.png')) {
        encodedUrl = encodedUrl.slice(0, -4);
      }
      
      // Decode base64url (URL-safe base64)
      // Replace URL-safe chars back to standard base64
      const base64 = encodedUrl.replace(/-/g, '+').replace(/_/g, '/');
      const url = Buffer.from(base64, 'base64').toString('utf-8');

      if (!url || !url.startsWith('https://')) {
        console.error('❌ Invalid encoded URL:', encodedUrl);
        return res.status(400).send('Invalid URL');
      }

      // Fetch original image
      const response = await fetch(url, {
        headers: { 'User-Agent': 'BasedMem/1.0' }
      });

      if (!response.ok) {
        console.error('❌ Failed to fetch image:', response.status, url);
        return res.status(response.status).send('Image not found');
      }

      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/png';

      // Warpcast requires: immutable caching, proper content-type, CORS headers
      res.set('Content-Type', contentType);
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET');
      res.set('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year cache for Warpcast
      res.set('Content-Security-Policy', "frame-ancestors *");

      res.send(Buffer.from(buffer));
    } catch (error: any) {
      console.error("❌ Error proxying image:", error.message);
      res.status(500).send('Proxy error');
    }
  });

  // Legacy query-string proxy (keep for backwards compatibility)
  app.get("/api/token-image-proxy", async (req, res) => {
    try {
      const { url } = req.query;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "Missing or invalid URL parameter" });
      }

      // Validate URL is HTTPS
      if (!url.startsWith('https://')) {
        return res.status(400).json({ error: "Only HTTPS URLs are allowed" });
      }

      const response = await fetch(url);

      if (!response.ok) {
        console.error('❌ Failed to fetch image:', response.status, response.statusText);
        return res.status(response.status).json({ error: "Failed to fetch image" });
      }

      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/png';

      // Set CORS headers for Farcaster Frame
      res.set('Content-Type', contentType);
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET');
      res.set('Cache-Control', 'public, max-age=31536000, immutable');

      res.send(Buffer.from(buffer));
    } catch (error: any) {
      console.error("❌ Error proxying image:", error);
      res.status(500).json({ error: error.message || "Failed to proxy image" });
    }
  });

  // Token Price API - Real-time DEX price from DEXScreener (with 60s cache)
  app.get("/api/token-price/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const lowerCaseAddress = address.toLowerCase();
      const now = Date.now();
      
      // Check cache first
      const cached = tokenPriceCache.get(lowerCaseAddress);
      if (cached && (now - cached.timestamp) < PRICE_CACHE_TTL) {
        // Return cached data with age indicator
        return res.json({
          ...cached.data,
          cached: true,
          cacheAge: Math.floor((now - cached.timestamp) / 1000) // seconds
        });
      }
      
      // Use DEXScreener API to get real-time DEX price data
      const url = `https://api.dexscreener.com/token-pairs/v1/base/${lowerCaseAddress}`;
      
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`DEXScreener API error (${response.status}):`, await response.text());
        
        // If we have stale cache data and API fails, return stale data
        if (cached) {
          console.log(`Returning stale cache for ${lowerCaseAddress} due to API error`);
          return res.json({
            ...cached.data,
            cached: true,
            stale: true,
            cacheAge: Math.floor((now - cached.timestamp) / 1000)
          });
        }
        
        return res.status(response.status).json({ error: "Failed to fetch token price" });
      }

      const data = await response.json();
      
      // DEXScreener returns array of pairs - find the most liquid pair
      if (!Array.isArray(data) || data.length === 0) {
        return res.status(404).json({ error: "Token not found on DEX" });
      }
      
      // Sort by liquidity (USD) and take the most liquid pair
      const sortedPairs = data.sort((a: any, b: any) => {
        const liquidityA = parseFloat(a.liquidity?.usd || 0);
        const liquidityB = parseFloat(b.liquidity?.usd || 0);
        return liquidityB - liquidityA;
      });
      
      // Find the first pair with a reasonable price (prevent fake/spam pairs with absurd prices)
      const MAX_REASONABLE_PRICE = 1000000; // $1M per token is already extremely high
      const MIN_REASONABLE_PRICE = 0.0000001; // Very small but not zero
      
      let pair = sortedPairs[0];
      for (const p of sortedPairs) {
        const price = parseFloat(p.priceUsd || 0);
        if (price >= MIN_REASONABLE_PRICE && price <= MAX_REASONABLE_PRICE) {
          pair = p;
          break;
        }
      }
      
      // If no reasonable price found, use the highest liquidity pair anyway
      if (!pair) {
        pair = sortedPairs[0];
      }
      
      // Debug: Log raw DEXScreener values BEFORE parsing
      console.log(`📊 Raw DEXScreener data for ${lowerCaseAddress}:`, {
        priceUsd: pair.priceUsd,
        priceChange_h24: pair.priceChange?.h24,
        liquidity_usd: pair.liquidity?.usd,
        dexId: pair.dexId
      });
      
      const responseData = {
        address: lowerCaseAddress,
        price: parseFloat(pair.priceUsd || 0),
        priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
        volume24h: parseFloat(pair.volume?.h24 || 0),
        marketCap: parseFloat(pair.marketCap || pair.fdv || 0),
        liquidity: parseFloat(pair.liquidity?.usd || 0),
        dexId: pair.dexId,
        pairAddress: pair.pairAddress,
        lastUpdated: new Date().toISOString()
      };
      
      // Debug: Log AFTER parsing
      console.log(`💰 Parsed price for ${lowerCaseAddress}: $${responseData.price}`);
      
      // Update cache
      tokenPriceCache.set(lowerCaseAddress, {
        data: responseData,
        timestamp: now
      });
      
      res.json(responseData);
    } catch (error: any) {
      console.error("Error fetching token price:", error);
      res.status(500).json({ error: error.message || "Failed to fetch token price" });
    }
  });

  // Multi-token portfolio prices (for wallet balances) - DEXScreener with 60s cache
  // In-flight request deduplication to prevent multiple simultaneous fetches
  const portfolioPriceInflight = new Map<string, Promise<any>>();
  
  app.post("/api/wallet/portfolio-prices", async (req, res) => {
    try {
      const { addresses } = req.body;
      
      if (!Array.isArray(addresses) || addresses.length === 0) {
        return res.status(400).json({ error: "addresses must be a non-empty array" });
      }
      
      const now = Date.now();
      const results: Record<string, { price: number, change24h: number }> = {};
      
      // Separate cached and non-cached addresses
      const addressesToFetch: string[] = [];
      
      for (const address of addresses) {
        const lowerCaseAddress = address.toLowerCase();
        
        // Native ETH special case - use WETH price
        if (lowerCaseAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
          const wethAddress = '0x4200000000000000000000000000000000000006';
          addressesToFetch.push(wethAddress); // Fetch WETH price
          continue;
        }
        
        // Check cache first
        const cached = tokenPriceCache.get(lowerCaseAddress);
        if (cached && (now - cached.timestamp) < PRICE_CACHE_TTL) {
          results[lowerCaseAddress] = {
            price: cached.data.price || 0,
            change24h: cached.data.priceChange24h || 0,
          };
        } else {
          addressesToFetch.push(lowerCaseAddress);
        }
      }
      
      // Batch fetch all non-cached tokens in parallel
      if (addressesToFetch.length > 0) {
        const fetchPromises = addressesToFetch.map(async (address) => {
          const lowerCaseAddress = address.toLowerCase();
          
          // Deduplicate in-flight requests
          if (portfolioPriceInflight.has(lowerCaseAddress)) {
            return portfolioPriceInflight.get(lowerCaseAddress);
          }
          
          const fetchPromise = (async () => {
            try {
              const url = `https://api.dexscreener.com/token-pairs/v1/base/${lowerCaseAddress}`;
              const response = await fetch(url);
              
              if (!response.ok) {
                // Use stale cache if available
                const cached = tokenPriceCache.get(lowerCaseAddress);
                if (cached) {
                  return {
                    address: lowerCaseAddress,
                    price: cached.data.price || 0,
                    change24h: cached.data.priceChange24h || 0,
                  };
                }
                return { address: lowerCaseAddress, price: 0, change24h: 0 };
              }
              
              const data = await response.json();
              
              if (!Array.isArray(data) || data.length === 0) {
                return { address: lowerCaseAddress, price: 0, change24h: 0 };
              }
              
              // Sort by liquidity and take most liquid pair
              const pair = data.sort((a: any, b: any) => {
                return parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0);
              })[0];
              
              const priceData = {
                price: parseFloat(pair.priceUsd || 0),
                change24h: parseFloat(pair.priceChange?.h24 || 0),
              };
              
              // Update cache with complete data
              tokenPriceCache.set(lowerCaseAddress, {
                data: {
                  ...priceData,
                  address: lowerCaseAddress,
                  volume24h: parseFloat(pair.volume?.h24 || 0),
                  liquidity: parseFloat(pair.liquidity?.usd || 0),
                  priceChange24h: priceData.change24h, // Ensure consistency
                },
                timestamp: now,
              });
              
              return { address: lowerCaseAddress, ...priceData };
            } catch (err) {
              console.error(`Error fetching price for ${lowerCaseAddress}:`, err);
              return { address: lowerCaseAddress, price: 0, change24h: 0 };
            } finally {
              portfolioPriceInflight.delete(lowerCaseAddress);
            }
          })();
          
          portfolioPriceInflight.set(lowerCaseAddress, fetchPromise);
          return fetchPromise;
        });
        
        const fetchedData = await Promise.all(fetchPromises);
        
        // Merge fetched data into results
        fetchedData.forEach((data) => {
          results[data.address] = {
            price: data.price,
            change24h: data.change24h,
          };
          
          // If this was WETH, also apply to ETH
          if (data.address === '0x4200000000000000000000000000000000000006') {
            results['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'] = {
              price: data.price,
              change24h: data.change24h,
            };
          }
        });
      }
      
      res.json({ prices: results });
    } catch (error: any) {
      console.error("Error fetching portfolio prices:", error);
      res.status(500).json({ error: error.message || "Failed to fetch portfolio prices" });
    }
  });

  // Token Balances (Zerion API) - Returns all token balances for a wallet
  app.get("/api/tokens/balances/:address", async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      
      // Check Zerion API key
      const zerionApiKey = process.env.ZERION_API_KEY;
      if (!zerionApiKey) {
        console.error("⚠️ ZERION_API_KEY not found in environment");
        return res.status(500).json({ error: "Zerion API key not configured" });
      }
      
      console.log(`💰 Fetching token balances for wallet: ${address}`);
      
      // Zerion requires base64 encoded API key with colon suffix
      const encodedKey = Buffer.from(`${zerionApiKey}:`).toString('base64');
      
      // Call Zerion API - Get simple positions (tokens only, no DeFi)
      const zerionUrl = `https://api.zerion.io/v1/wallets/${address}/positions/?filter[positions]=only_simple&filter[chain_ids]=base&currency=usd`;
      const response = await fetch(zerionUrl, {
        headers: {
          'Authorization': `Basic ${encodedKey}`,
          'accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error');
        console.error(`❌ Zerion API error: ${response.status} ${response.statusText}`);
        console.error(`Response body: ${errorText}`);
        
        // Return empty balances on error (graceful degradation)
        return res.json({ balances: {} });
      }
      
      const data = await response.json();
      
      // Extract positions and convert to balance map
      const positions = data.data || [];
      const balances: Record<string, { balance: string; decimals: number; symbol: string; usdValue: number }> = {};
      
      console.log(`🔍 Zerion API returned ${positions.length} positions`);
      
      positions.forEach((position: any, index: number) => {
        const attributes = position.attributes || {};
        const fungibleInfo = attributes.fungible_info || {};
        const implementations = fungibleInfo.implementations || [];
        const symbol = fungibleInfo.symbol || '';
        const balance = attributes.quantity?.numeric || '0';
        const usdValue = parseFloat(attributes.value || '0');
        
        console.log(`\n📦 Position ${index + 1}:`, {
          symbol,
          name: fungibleInfo.name,
          type: attributes.type,
          implementations: implementations.map((impl: any) => ({
            chain: impl.chain_id,
            address: impl.address
          })),
          balance,
          usdValue
        });
        
        // Skip zero balances
        if (parseFloat(balance) === 0) {
          console.log(`⏭️ Skipping: zero balance`);
          return;
        }
        
        // ✅ CRITICAL FIX: Native ETH handling
        // Zerion returns native ETH with symbol='ETH' and implementations with null addresses
        // Check: symbol is ETH AND base implementation has null address (native asset)
        const isNativeETH = symbol.toUpperCase() === 'ETH' && implementations.length > 0 && 
                           implementations.some((impl: any) => impl.chain_id === 'base' && !impl.address);
        
        if (isNativeETH) {
          console.log(`🔷 Detected native ETH (symbol: ${symbol}, type: ${attributes.type})`);
          
          // Map to ETH sentinel address
          balances['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'] = {
            balance,
            decimals: 18,
            symbol: 'ETH',
            usdValue
          };
          
          console.log(`✅ Added native ETH to balances: ${balance} ETH ($${usdValue.toFixed(2)})`);
          return;
        }
        
        // Find Base implementation for ERC-20 tokens
        const baseImpl = implementations.find((impl: any) => impl.chain_id === 'base');
        if (!baseImpl) {
          console.log(`⏭️ Skipping: not on Base network (implementations: ${implementations.length})`);
          return;
        }
        
        const tokenAddress = baseImpl.address?.toLowerCase() || '';
        const decimals = baseImpl.decimals || 18;
        
        console.log(`🔍 ERC-20 token details:`, {
          tokenAddress,
          symbol,
          decimals,
          balance,
          usdValue
        });
        
        balances[tokenAddress] = {
          balance,
          decimals,
          symbol,
          usdValue
        };
        
        console.log(`✅ Added to balances: ${symbol} @ ${tokenAddress}`);
      });
      
      console.log(`💰 Total tokens found: ${Object.keys(balances).length}`);
      
      res.json({ balances });
    } catch (error: any) {
      console.error("Error fetching token balances:", error);
      res.status(500).json({ error: error.message || "Failed to fetch token balances" });
    }
  });

  // DeFi Protocol Positions (Zerion API) - Free tier: 5k requests/day
  app.get("/api/wallet/defi-positions/:address", async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      
      // Check Zerion API key
      const zerionApiKey = process.env.ZERION_API_KEY;
      if (!zerionApiKey) {
        console.error("⚠️ ZERION_API_KEY not found in environment");
        return res.status(500).json({ error: "Zerion API key not configured" });
      }
      
      console.log(`🔑 Zerion API call for wallet: ${address}`);
      
      // Zerion requires base64 encoded API key with colon suffix
      const encodedKey = Buffer.from(`${zerionApiKey}:`).toString('base64');
      
      // Call Zerion API - Get all positions (fungible + non-fungible)
      const zerionUrl = `https://api.zerion.io/v1/wallets/${address}/positions/?filter[positions]=only_simple&currency=usd`;
      const response = await fetch(zerionUrl, {
        headers: {
          'Authorization': `Basic ${encodedKey}`,
          'accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error');
        console.error(`❌ Zerion API error: ${response.status} ${response.statusText}`);
        console.error(`Response body: ${errorText}`);
        
        // Return empty array on error (graceful degradation)
        return res.json({ protocols: [] });
      }
      
      const data = await response.json();
      
      // Extract positions from Zerion response
      const positions = data.data || [];
      
      // Group positions by protocol and filter for Base network
      const protocolMap = new Map();
      
      positions.forEach((position: any) => {
        const attributes = position.attributes || {};
        const fungibleInfo = attributes.fungible_info || {};
        const chain = fungibleInfo.implementations?.[0]?.chain_id;
        
        // Filter for Base network (chain ID: 'base')
        if (chain !== 'base') return;
        
        const protocolName = attributes.protocol || 'Unknown Protocol';
        const protocolId = protocolName.toLowerCase().replace(/\s+/g, '-');
        
        // Calculate position value
        const quantity = parseFloat(attributes.quantity || 0);
        const pricePerShare = parseFloat(fungibleInfo.price?.value || 0);
        const positionValue = quantity * pricePerShare;
        
        if (!protocolMap.has(protocolId)) {
          protocolMap.set(protocolId, {
            id: protocolId,
            name: protocolName,
            chain: 'base',
            logo: fungibleInfo.icon?.url || '',
            netUsdValue: 0,
            assetUsdValue: 0,
            debtUsdValue: 0,
            positions: []
          });
        }
        
        const protocol = protocolMap.get(protocolId);
        protocol.netUsdValue += positionValue;
        protocol.assetUsdValue += positionValue;
        
        // Add position details
        protocol.positions.push({
          name: fungibleInfo.name || 'Unknown Position',
          symbol: fungibleInfo.symbol || '',
          balance: quantity,
          price: pricePerShare,
          value: positionValue
        });
      });
      
      const formattedProtocols = Array.from(protocolMap.values());
      
      console.log(`✅ Found ${formattedProtocols.length} DeFi protocols on Base for ${address}`);
      
      res.json({ protocols: formattedProtocols });
    } catch (error: any) {
      console.error("Error fetching DeFi positions:", error);
      res.status(500).json({ error: error.message || "Failed to fetch DeFi positions" });
    }
  });

  // Limit Orders API
  app.get("/api/limit-orders/user/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const orders = await storage.getLimitOrdersByUser(userId);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching limit orders:", error);
      res.status(500).json({ error: "Failed to fetch limit orders" });
    }
  });

  app.get("/api/limit-orders/pending", async (req, res) => {
    try {
      const orders = await storage.getPendingLimitOrders();
      res.json(orders);
    } catch (error) {
      console.error("Error fetching pending orders:", error);
      res.status(500).json({ error: "Failed to fetch pending orders" });
    }
  });

  app.post("/api/limit-orders", async (req, res) => {
    try {
      const { order, domain, signature, userId, tokenId, tokenAddress, tokenSymbol, orderType, targetPrice, ethAmount, tokenAmount, totalValue, vaultVersion } = req.body;
      
      if (!order || !domain || !signature) {
        return res.status(400).json({ error: "Missing required fields: order, domain, signature" });
      }
      
      // Validate vault version
      if (!vaultVersion || !['v1', 'v2', 'v3'].includes(vaultVersion)) {
        return res.status(400).json({ error: `Invalid vault version: ${vaultVersion}. Must be v1, v2, or v3.` });
      }

      // Import ethers and create provider
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');

      // Token risk validation - LOG ONLY (no blocking)
      const tokenToCheck = orderType === 'buy' ? order.takerToken : order.makerToken;
      const riskScore = await getTokenRiskScore(tokenToCheck, provider);
      
      // Log risk level but allow all orders (user takes responsibility)
      console.log(`⚠️ Token ${tokenSymbol} (${tokenToCheck}) - Risk: ${riskScore.riskLevel} (${riskScore.score}/100)`);
      
      // SELL orders: Auto-approve token for vault deposit
      if (orderType === 'sell') {
        const EXECUTOR_VAULT_V3 = process.env.EXECUTOR_VAULT_V3_ADDRESS || "0x3905022308C9BdE5581078Ca4A9e413b608F764e";
        const vaultABI = [
          "function approvedTokens(address) view returns (bool)",
          "function setToken(address token, bool approved) external"
        ];
        
        const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
        if (deployerKey) {
          const vaultContract = new ethers.Contract(EXECUTOR_VAULT_V3, vaultABI, new ethers.Wallet(deployerKey, provider));
          
          // Check if token is already approved
          const isApproved = await vaultContract.approvedTokens(tokenToCheck);
          
          if (!isApproved) {
            console.log(`🔓 Auto-approving ${tokenSymbol} (${tokenToCheck}) for vault deposits...`);
            try {
              const approveTx = await vaultContract.setToken(tokenToCheck, true);
              await approveTx.wait();
              console.log(`✅ ${tokenSymbol} approved for vault deposits (tx: ${approveTx.hash})`);
            } catch (approveError: any) {
              console.error(`❌ Failed to approve token:`, approveError);
              // Continue anyway - user will get error on frontend deposit
            }
          } else {
            console.log(`✅ ${tokenSymbol} already approved for vault`);
          }
        }
      }
      
      const typeHash = ethers.keccak256(
        ethers.toUtf8Bytes(
          'LimitOrder(address maker,address taker,address makerToken,address takerToken,uint256 makerAmount,uint256 takerAmount,uint256 expiry,uint256 salt,uint256 chainId,address verifyingContract,address feeRecipient,address sender,bytes32 pool)'
        )
      );
      
      const structHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['bytes32', 'address', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address', 'address', 'bytes32'],
          [
            typeHash,
            order.maker,
            order.taker,
            order.makerToken,
            order.takerToken,
            order.makerAmount,
            order.takerAmount,
            order.expiry,
            order.salt,
            order.chainId,
            order.verifyingContract,
            order.feeRecipient,
            order.sender,
            order.pool,
          ]
        )
      );
      
      const domainSeparator = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
          [
            ethers.keccak256(ethers.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
            ethers.keccak256(ethers.toUtf8Bytes(domain.name)),
            ethers.keccak256(ethers.toUtf8Bytes(domain.version)),
            domain.chainId,
            domain.verifyingContract,
          ]
        )
      );
      
      const orderHash = ethers.keccak256(
        ethers.solidityPacked(['string', 'bytes32', 'bytes32'], ['\x19\x01', domainSeparator, structHash])
      );

      // Create limit order with computed hash - status is 'fillable' (ready for execution)
      const EXECUTOR_VAULT_V3 = process.env.EXECUTOR_VAULT_V3_ADDRESS || "0x3905022308C9BdE5581078Ca4A9e413b608F764e";
      const limitOrderData = {
        userId,
        userWalletAddress: order.maker, // CRITICAL: Save wallet address for ExecutorVault
        tokenId,
        tokenAddress: orderType === 'buy' ? order.takerToken : order.makerToken,
        tokenSymbol,
        orderType,
        targetPrice,
        ethAmount,
        tokenAmount,
        totalValue,
        signature,
        salt: order.salt,
        orderHash,
        makerAmount: order.makerAmount,
        takerAmount: order.takerAmount,
        makerToken: order.makerToken,
        takerToken: order.takerToken,
        expiry: parseInt(order.expiry),
        orderJson: JSON.stringify(order),
        status: 'fillable',
        vaultVersion, // CRITICAL: Save vault version for correct execution
        vaultAddress: EXECUTOR_VAULT_V3, // Both BUY and SELL use V3 vault
      };

      const createdOrder = await storage.createLimitOrder(limitOrderData);
      res.status(201).json(createdOrder);
    } catch (error: any) {
      console.error("Error creating limit order:", error);
      res.status(500).json({ error: error.message || "Failed to create limit order" });
    }
  });

  // Wait for transaction confirmation (Farcaster-safe: backend polls receipt)
  app.post("/api/wait-for-tx", async (req, res) => {
    try {
      const { ethers: ethersLib } = await import('ethers');
      const { txHash, maxWaitMs = 30000 } = req.body;
      
      if (!txHash || typeof txHash !== 'string') {
        return res.status(400).json({ error: "Invalid transaction hash" });
      }
      
      const provider = new ethersLib.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
      
      const startTime = Date.now();
      const pollInterval = 1500; // 1.5 seconds between polls (Base blocks ~2s)
      
      while (Date.now() - startTime < maxWaitMs) {
        try {
          const receipt = await provider.getTransactionReceipt(txHash);
          
          if (receipt) {
            // Transaction confirmed
            if (receipt.status === 1) {
              return res.json({
                success: true,
                confirmed: true,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString(),
              });
            } else {
              // Transaction failed
              return res.json({
                success: false,
                confirmed: true,
                error: "Transaction reverted",
                blockNumber: receipt.blockNumber,
              });
            }
          }
        } catch (pollError) {
          // Receipt not available yet, continue polling
          console.log(`Polling for tx ${txHash.slice(0, 10)}...`);
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      
      // Timeout - transaction not confirmed in time
      res.json({
        success: true,
        confirmed: false,
        message: "Transaction submitted but not yet confirmed. It may still succeed.",
        txHash,
      });
    } catch (error: any) {
      console.error("Error waiting for transaction:", error);
      res.status(500).json({ error: error.message || "Failed to check transaction" });
    }
  });

  // Get vault balance for a wallet (Farcaster-safe: no client-side RPC needed)
  app.post("/api/vault-balance", async (req, res) => {
    try {
      const { ethers: ethersLib } = await import('ethers');
      const { walletAddress, tokenAddress } = req.body;
      
      if (!walletAddress || !ethersLib.isAddress(walletAddress)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      if (!tokenAddress || !ethersLib.isAddress(tokenAddress)) {
        return res.status(400).json({ error: "Invalid token address" });
      }
      
      const provider = new ethersLib.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
      const EXECUTOR_VAULT_V3 = process.env.EXECUTOR_VAULT_V3_ADDRESS || "0x3905022308C9BdE5581078Ca4A9e413b608F764e";
      
      // Get vault balance
      const vaultABI = ["function getBalance(address user, address token) view returns (uint256)"];
      const vaultContract = new ethersLib.Contract(EXECUTOR_VAULT_V3, vaultABI, provider);
      const vaultBalance = await vaultContract.getBalance(walletAddress, tokenAddress);
      
      // Get token decimals
      const tokenABI = ["function decimals() view returns (uint8)", "function symbol() view returns (string)"];
      const tokenContract = new ethersLib.Contract(tokenAddress, tokenABI, provider);
      
      let decimals = 18;
      let symbol = 'TOKEN';
      try {
        decimals = await tokenContract.decimals();
        symbol = await tokenContract.symbol();
      } catch (e) {
        console.log('Could not fetch token metadata, using defaults');
      }
      
      res.json({
        vaultBalance: ethersLib.formatUnits(vaultBalance, decimals),
        vaultBalanceWei: vaultBalance.toString(),
        decimals: Number(decimals),
        symbol,
      });
    } catch (error: any) {
      console.error("Error fetching vault balance:", error);
      res.status(500).json({ error: error.message || "Failed to fetch vault balance" });
    }
  });

  // GET ETH balance for a wallet (simple endpoint for WalletContext)
  app.get("/api/token-balance", async (req, res) => {
    try {
      const { ethers: ethersLib } = await import('ethers');
      const { walletAddress, tokenAddress } = req.query;
      
      if (!walletAddress || typeof walletAddress !== 'string' || !ethersLib.isAddress(walletAddress)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      
      const provider = new ethersLib.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
      
      // If tokenAddress is 'ETH' or not provided, return ETH balance
      if (!tokenAddress || tokenAddress === 'ETH') {
        const ethBalance = await provider.getBalance(walletAddress);
        const formattedBalance = ethersLib.formatEther(ethBalance);
        console.log(`💰 ETH balance for ${walletAddress}: ${formattedBalance}`);
        return res.json({
          balance: ethBalance.toString(),
          formattedBalance,
          symbol: 'ETH',
          decimals: 18
        });
      }
      
      // Otherwise, get ERC20 token balance
      if (typeof tokenAddress !== 'string' || !ethersLib.isAddress(tokenAddress)) {
        return res.status(400).json({ error: "Invalid token address" });
      }
      
      const tokenABI = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)"
      ];
      const tokenContract = new ethersLib.Contract(tokenAddress, tokenABI, provider);
      
      const [tokenBalance, decimals, symbol] = await Promise.all([
        tokenContract.balanceOf(walletAddress),
        tokenContract.decimals().catch(() => 18),
        tokenContract.symbol().catch(() => 'TOKEN')
      ]);
      
      const formattedBalance = ethersLib.formatUnits(tokenBalance, decimals);
      console.log(`💰 ${symbol} balance for ${walletAddress}: ${formattedBalance}`);
      
      return res.json({
        balance: tokenBalance.toString(),
        formattedBalance,
        symbol,
        decimals: Number(decimals)
      });
    } catch (error: any) {
      console.error("Error fetching balance (GET):", error);
      res.status(500).json({ error: error.message || "Failed to fetch balance" });
    }
  });

  // Get token balance for a wallet (Farcaster-safe: no client-side RPC needed)
  app.post("/api/token-balance", async (req, res) => {
    try {
      const { ethers: ethersLib } = await import('ethers');
      const { walletAddress, tokenAddress, decimals } = req.body;
      
      if (!walletAddress || !ethersLib.isAddress(walletAddress)) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      if (!tokenAddress || !ethersLib.isAddress(tokenAddress)) {
        return res.status(400).json({ error: "Invalid token address" });
      }
      
      const provider = new ethersLib.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
      
      // ETH balance
      const ethBalance = await provider.getBalance(walletAddress);
      
      // Token balance (ERC20)
      const tokenABI = ["function balanceOf(address) view returns (uint256)"];
      const tokenContract = new ethersLib.Contract(tokenAddress, tokenABI, provider);
      const tokenBalance = await tokenContract.balanceOf(walletAddress);
      
      const tokenDecimals = decimals || 18;
      
      res.json({
        ethBalance: ethersLib.formatEther(ethBalance),
        ethBalanceWei: ethBalance.toString(),
        tokenBalance: ethersLib.formatUnits(tokenBalance, tokenDecimals),
        tokenBalanceWei: tokenBalance.toString(),
      });
    } catch (error: any) {
      console.error("Error fetching token balance:", error);
      res.status(500).json({ error: error.message || "Failed to fetch balance" });
    }
  });

  // Approve token for vault deposits (SELL orders only)
  app.post("/api/limit-orders/approve-token", async (req, res) => {
    try {
      const { ethers: ethersLib } = await import('ethers');
      const { tokenAddress } = req.body;
      
      if (!tokenAddress || !ethersLib.isAddress(tokenAddress)) {
        return res.status(400).json({ error: "Invalid token address" });
      }
      
      const EXECUTOR_VAULT_V3 = process.env.EXECUTOR_VAULT_V3_ADDRESS || "0x3905022308C9BdE5581078Ca4A9e413b608F764e";
      const vaultABI = [
        "function approvedTokens(address) view returns (bool)",
        "function setToken(address token, bool approved) external",
        "function owner() view returns (address)"
      ];
      
      const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
      if (!deployerKey) {
        return res.status(500).json({ error: "Backend wallet not configured" });
      }
      const provider = new ethersLib.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
      const wallet = new ethersLib.Wallet(deployerKey, provider);
      const vaultContract = new ethersLib.Contract(EXECUTOR_VAULT_V3, vaultABI, wallet);
      
      // Check if token is already approved
      const isApproved = await vaultContract.approvedTokens(tokenAddress);
      
      if (isApproved) {
        console.log(`✅ Token ${tokenAddress} already approved`);
        return res.json({ success: true, alreadyApproved: true });
      }
      
      // Check if backend wallet is the vault owner
      const vaultOwner = await vaultContract.owner();
      const backendAddress = wallet.address;
      console.log(`🔍 Vault owner: ${vaultOwner}, Backend wallet: ${backendAddress}`);
      
      if (vaultOwner.toLowerCase() !== backendAddress.toLowerCase()) {
        console.log(`⚠️ Backend wallet is NOT the vault owner - cannot whitelist token`);
        // Return success anyway - deposit might work if token was previously whitelisted
        // Or it will fail on-chain with a clear error
        return res.json({ 
          success: true, 
          alreadyApproved: false, 
          skippedWhitelist: true,
          reason: "Backend is not vault owner"
        });
      }
      
      console.log(`🔓 Approving token ${tokenAddress} for vault deposits...`);
      const approveTx = await vaultContract.setToken(tokenAddress, true);
      const receipt = await approveTx.wait();
      
      console.log(`✅ Token approved (tx: ${receipt.hash})`);
      res.json({ success: true, txHash: receipt.hash, alreadyApproved: false });
    } catch (error: any) {
      console.error("Error approving token:", error);
      res.status(500).json({ error: error.message || "Failed to approve token" });
    }
  });

  app.post("/api/limit-orders/:id/submit-to-0x", async (req, res) => {
    try {
      const { id } = req.params;
      const order = await storage.getLimitOrder(id);

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (order.status !== 'pending') {
        return res.status(400).json({ 
          error: "Order already submitted",
          currentStatus: order.status 
        });
      }

      const orderPayload = JSON.parse(order.orderJson);
      
      const signatureHex = order.signature;
      const signatureObject = {
        signatureType: 2,
        v: parseInt(signatureHex.slice(130, 132), 16),
        r: signatureHex.slice(0, 66),
        s: '0x' + signatureHex.slice(66, 130)
      };
      
      const signedOrder = {
        ...orderPayload,
        signature: signatureObject
      };
      
      const response = await fetch('https://api.0x.org/orderbook/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          '0x-api-key': process.env.OX_API_KEY || '',
          '0x-chain-id': order.chainId.toString()
        },
        body: JSON.stringify([signedOrder])
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("0x API error:", errorData);
        return res.status(response.status).json({ 
          error: "Failed to submit order to 0x",
          details: errorData 
        });
      }

      const updatedOrder = await storage.updateLimitOrder(id, {
        status: 'fillable'
      });

      res.json(updatedOrder);
    } catch (error: any) {
      console.error("Error submitting to 0x:", error);
      res.status(500).json({ error: error.message || "Failed to submit order" });
    }
  });

  app.get("/api/limit-orders/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const order = await storage.getLimitOrder(id);

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const response = await fetch(
        `https://api.0x.org/orderbook/v1/orders?orderHash=${order.orderHash}`,
        {
          headers: {
            '0x-api-key': process.env.OX_API_KEY || '',
            '0x-chain-id': order.chainId.toString()
          }
        }
      );

      if (!response.ok) {
        return res.status(response.status).json({ 
          error: "Failed to query 0x API",
          localStatus: order.status
        });
      }

      const data = await response.json();
      const zeroXOrder = data.records?.[0];

      if (!zeroXOrder) {
        return res.json({ status: order.status, source: 'local' });
      }

      let newStatus = order.status;
      
      let zeroXStatus = zeroXOrder.metaData?.orderStatus?.toLowerCase();
      
      if (!zeroXStatus) {
        const remaining = zeroXOrder.metaData?.remainingTakerAssetAmount || 
                         zeroXOrder.metaData?.remainingTakerAmount ||
                         zeroXOrder.metaData?.remainingFillableTakerAmount;
        const currentTime = Math.floor(Date.now() / 1000);
        
        if (remaining && (remaining === '0' || BigInt(remaining) === BigInt(0))) {
          zeroXStatus = 'filled';
        } else if (order.expiry && currentTime > order.expiry) {
          zeroXStatus = 'expired';
        } else if (remaining && BigInt(remaining) > BigInt(0)) {
          zeroXStatus = 'open';
        }
      }
      
      if (zeroXStatus === 'filled') {
        newStatus = 'filled';
        await storage.updateLimitOrder(id, {
          status: 'filled',
          filledAt: new Date(),
          makerTokenFilledAmount: zeroXOrder.metaData.filledAmount,
          takerTokenFilledAmount: zeroXOrder.metaData.remainingFillableAmount,
          txHash: zeroXOrder.metaData.txHash
        });
      } else if (zeroXStatus === 'cancelled') {
        newStatus = 'cancelled';
        await storage.updateLimitOrder(id, {
          status: 'cancelled'
        });
      } else if (zeroXStatus === 'expired') {
        newStatus = 'expired';
        await storage.updateLimitOrder(id, {
          status: 'expired'
        });
      } else if (zeroXStatus === 'open' || zeroXStatus === 'fillable') {
        newStatus = 'fillable';
        if (order.status === 'pending') {
          await storage.updateLimitOrder(id, {
            status: 'fillable'
          });
        }
      } else if (zeroXStatus === 'partially_filled') {
        newStatus = 'fillable';
        await storage.updateLimitOrder(id, {
          status: 'fillable',
          makerTokenFilledAmount: zeroXOrder.metaData.filledAmount
        });
      } else if (zeroXStatus === 'unfillable' || zeroXStatus === 'unfunded') {
        newStatus = 'unfillable';
        await storage.updateLimitOrder(id, {
          status: 'unfillable'
        });
      }

      res.json({
        status: newStatus,
        source: '0x',
        zeroXData: zeroXOrder
      });
    } catch (error: any) {
      console.error("Error querying order status:", error);
      res.status(500).json({ error: error.message || "Failed to query status" });
    }
  });

  // DEPRECATED: Old system used ready_to_execute status
  // Now using 0x native limit orders with fillable status
  app.get("/api/limit-orders/ready/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const orders = await storage.getLimitOrdersByUser(userId);
      const fillableOrders = orders.filter(o => o.status === 'fillable');
      res.json(fillableOrders);
    } catch (error) {
      console.error("Error fetching fillable orders:", error);
      res.status(500).json({ error: "Failed to fetch fillable orders" });
    }
  });

  app.delete("/api/limit-orders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // SERVER-SIDE VALIDATION: Check order exists and is cancellable
      const order = await storage.getLimitOrder(id);
      
      if (!order) {
        return res.status(404).json({ error: "Limit order not found" });
      }
      
      // Only allow cancel for pending/fillable orders
      const cancellableStatuses = ['pending', 'fillable'];
      if (!cancellableStatuses.includes(order.status)) {
        return res.status(400).json({ 
          error: `Cannot cancel ${order.status} order`,
          details: `This order is already ${order.status}. Only pending and fillable orders can be cancelled.`
        });
      }
      
      // STEP 1: Withdraw funds from vault (if applicable)
      console.log(`🔄 Cancelling order ${id} - attempting vault withdrawal...`);
      const { cancelLimitOrderWithWithdrawal } = await import("./lib/limitOrderCancellation.js");
      const withdrawalResult = await cancelLimitOrderWithWithdrawal(order);
      
      if (!withdrawalResult.success && withdrawalResult.error?.includes("V1 vault")) {
        // V1 vault - user must manually withdraw
        console.log(`⚠️ V1 vault detected - marking as cancelled (user must manually withdraw)`);
      } else if (!withdrawalResult.success) {
        // Withdrawal failed for other reasons
        console.error(`❌ Withdrawal failed: ${withdrawalResult.error}`);
        return res.status(500).json({ 
          error: "Failed to withdraw funds from vault",
          details: withdrawalResult.error
        });
      } else {
        console.log(`✅ Withdrawal successful: ${withdrawalResult.withdrawnAmount} tokens (tx: ${withdrawalResult.txHash})`);
      }
      
      // STEP 2: Update database status to cancelled
      const success = await storage.cancelLimitOrder(id);
      
      if (!success) {
        return res.status(500).json({ error: "Failed to update order status" });
      }

      res.json({ 
        success: true,
        withdrawal: withdrawalResult
      });
    } catch (error) {
      console.error("Error cancelling limit order:", error);
      res.status(500).json({ error: "Failed to cancel limit order" });
    }
  });


  // ========================================
  // JUPITER API ENDPOINTS (Solana Swaps)
  // ========================================
  
  // Cache for Jupiter token metadata
  let jupiterTokenCache: Map<string, any> = new Map();
  let jupiterCacheTime = 0;
  const JUPITER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  
  // Fetch Jupiter token list for logo metadata (using V2 API)
  async function loadJupiterTokenList() {
    if (Date.now() - jupiterCacheTime < JUPITER_CACHE_TTL && jupiterTokenCache.size > 0) {
      return jupiterTokenCache;
    }
    
    // Jupiter V2 API (no auth required, has logoURI as "icon" field)
    const jupiterEndpoints = [
      'https://lite-api.jup.ag/tokens/v2/tag?query=verified',
      'https://lite-api.jup.ag/tokens/v2/category?query=toptraded&interval=24h',
    ];
    
    for (const endpoint of jupiterEndpoints) {
      try {
        console.log('🔄 Trying Jupiter V2 endpoint:', endpoint);
        const response = await fetch(endpoint, { 
          headers: { 
            'Accept': 'application/json',
            'Origin': 'https://basedmem.com'
          },
          signal: AbortSignal.timeout(10000)
        });
        if (response.ok) {
          const tokens = await response.json();
          jupiterTokenCache.clear();
          for (const token of tokens) {
            // V2 API uses 'id' for address and 'icon' for logo
            const address = token.id || token.address;
            jupiterTokenCache.set(address, {
              address,
              symbol: token.symbol,
              name: token.name,
              decimals: token.decimals,
              logoURI: token.icon || token.logoURI,
              tags: token.tags || [],
            });
          }
          jupiterCacheTime = Date.now();
          console.log('✅ Loaded', jupiterTokenCache.size, 'Jupiter tokens with logos from V2 API');
          return jupiterTokenCache;
        }
      } catch (error: any) {
        console.log('⚠️ Jupiter V2 endpoint failed:', endpoint, error.message);
      }
    }
    
    console.log('⚠️ All Jupiter endpoints failed - using hardcoded token metadata');
    return jupiterTokenCache;
  }
  
  // Lookup single token by address from multiple sources (Jupiter, DEXScreener, Birdeye)
  async function lookupJupiterToken(address: string) {
    try {
      // First check cache
      if (jupiterTokenCache.has(address)) {
        console.log('✅ Found token in cache:', address);
        return jupiterTokenCache.get(address);
      }
      
      // Try Jupiter V2 search API first
      try {
        const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${address}`, {
          headers: { 
            'Accept': 'application/json',
            'Origin': 'https://basedmem.com'
          },
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
          const tokens = await response.json();
          if (tokens && tokens.length > 0) {
            const token = tokens[0];
            const tokenData = {
              address: token.id || token.address,
              symbol: token.symbol,
              name: token.name,
              decimals: token.decimals,
              logoURI: token.icon || token.logoURI,
              tags: token.tags || [],
            };
            jupiterTokenCache.set(tokenData.address, tokenData);
            console.log('✅ Found token via Jupiter V2 Search:', tokenData.symbol, tokenData.name);
            return tokenData;
          }
        }
      } catch (error: any) {
        console.log('⚠️ Jupiter V2 search failed:', error.message);
      }
      
      // Fallback: Try DEXScreener API (has broader coverage for meme coins)
      try {
        console.log('🔍 Trying DEXScreener for token:', address);
        const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
          signal: AbortSignal.timeout(5000)
        });
        
        if (dexResponse.ok) {
          const dexData = await dexResponse.json();
          if (dexData.pairs && dexData.pairs.length > 0) {
            // Find a Solana pair
            const solanaPair = dexData.pairs.find((p: any) => p.chainId === 'solana');
            if (solanaPair) {
              const tokenInfo = solanaPair.baseToken.address === address 
                ? solanaPair.baseToken 
                : solanaPair.quoteToken;
              
              const tokenData = {
                address: tokenInfo.address,
                symbol: tokenInfo.symbol,
                name: tokenInfo.name,
                decimals: 9, // Default for Solana SPL tokens
                logoURI: solanaPair.info?.imageUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${tokenInfo.symbol}`,
                tags: ['dexscreener'],
                priceUsd: solanaPair.priceUsd,
                liquidity: solanaPair.liquidity?.usd,
              };
              jupiterTokenCache.set(tokenData.address, tokenData);
              console.log('✅ Found token via DEXScreener:', tokenData.symbol, tokenData.name, 'Price:', tokenData.priceUsd);
              return tokenData;
            }
          }
        }
      } catch (error: any) {
        console.log('⚠️ DEXScreener search failed:', error.message);
      }
      
      // Fallback: Try GeckoTerminal API for even more coverage
      try {
        console.log('🔍 Trying GeckoTerminal for token:', address);
        const geckoResponse = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${address}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000)
        });
        
        if (geckoResponse.ok) {
          const geckoData = await geckoResponse.json();
          if (geckoData.data && geckoData.data.attributes) {
            const attrs = geckoData.data.attributes;
            const tokenData = {
              address: address,
              symbol: attrs.symbol,
              name: attrs.name,
              decimals: attrs.decimals || 9,
              logoURI: attrs.image_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${attrs.symbol}`,
              tags: ['geckoterminal'],
              priceUsd: attrs.price_usd,
            };
            jupiterTokenCache.set(tokenData.address, tokenData);
            console.log('✅ Found token via GeckoTerminal:', tokenData.symbol, tokenData.name);
            return tokenData;
          }
        }
      } catch (error: any) {
        console.log('⚠️ GeckoTerminal search failed:', error.message);
      }
      
      // Final fallback: Try to get on-chain SPL token metadata via Solana RPC
      try {
        console.log('🔍 Trying on-chain SPL token lookup for:', address);
        
        // Use Helius or public RPC to get token metadata
        const rpcEndpoints = [
          'https://api.mainnet-beta.solana.com',
          'https://solana-mainnet.g.alchemy.com/v2/demo',
        ];
        
        for (const rpcUrl of rpcEndpoints) {
          try {
            // First check if it's a valid mint account
            const accountResponse = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getAccountInfo',
                params: [address, { encoding: 'jsonParsed' }]
              }),
              signal: AbortSignal.timeout(5000)
            });
            
            if (accountResponse.ok) {
              const accountData = await accountResponse.json();
              if (accountData.result?.value?.data?.parsed?.type === 'mint') {
                const mintInfo = accountData.result.value.data.parsed.info;
                
                // Try to get metadata from Metaplex if available
                let tokenName = `Token ${address.slice(0, 8)}`;
                let tokenSymbol = address.slice(0, 6).toUpperCase();
                
                // Try to get metadata from Metaplex token-metadata program
                // Using the on-chain data we already have (no external API needed)
                
                const tokenData = {
                  address: address,
                  symbol: tokenSymbol,
                  name: tokenName,
                  decimals: mintInfo.decimals || 9,
                  logoURI: `https://api.dicebear.com/7.x/shapes/svg?seed=${address}`,
                  tags: ['on-chain', 'unverified'],
                  supply: mintInfo.supply,
                };
                
                jupiterTokenCache.set(tokenData.address, tokenData);
                console.log('✅ Found SPL token on-chain:', tokenData.symbol, tokenData.name, 'decimals:', tokenData.decimals);
                return tokenData;
              }
            }
          } catch (rpcError: any) {
            console.log('⚠️ RPC endpoint failed:', rpcUrl, rpcError.message);
          }
        }
      } catch (error: any) {
        console.log('⚠️ On-chain token lookup failed:', error.message);
      }
      
    } catch (error: any) {
      console.log('⚠️ Token lookup failed:', error.message);
    }
    return null;
  }
  
  // Jupiter Token List for Solana (prioritize Jupiter V2 with official logos)
  app.get("/api/solana/tokens", async (req, res) => {
    // Load Jupiter verified tokens with proper logos
    const jupiterTokens = await loadJupiterTokenList();
    
    try {
      // If we have Jupiter tokens, return them directly (they have correct logos!)
      if (jupiterTokens.size > 0) {
        const tokens = Array.from(jupiterTokens.values())
          .filter((t: any) => t.logoURI) // Only tokens with logos
          .slice(0, 100); // Limit to 100 tokens
        
        console.log('✅ Returning', tokens.length, 'Jupiter verified tokens with logos');
        return res.json(tokens);
      }
      
      // Fallback: Popular Solana tokens with verified logos
      const POPULAR_SOLANA_TOKENS = [
        { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Wrapped SOL', decimals: 9, logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' },
        { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin', decimals: 6, logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' },
        { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', name: 'Tether USD', decimals: 6, logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg' },
        { address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', name: 'Jupiter', decimals: 6, logoURI: 'https://static.jup.ag/jup/icon.png' },
        { address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', name: 'Bonk', decimals: 5, logoURI: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I' },
        { address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', symbol: 'WIF', name: 'dogwifhat', decimals: 6, logoURI: 'https://bafkreibk3covs5ltyqxa272uodhculbr6kea6betidfwy3ajsav2vjzyum.ipfs.nftstorage.link' },
        { address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', symbol: 'mSOL', name: 'Marinade Staked SOL', decimals: 9, logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png' },
        { address: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', symbol: 'PYTH', name: 'Pyth Network', decimals: 6, logoURI: 'https://pyth.network/token.svg' },
        { address: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', symbol: 'RENDER', name: 'Render Token', decimals: 8, logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof/logo.png' },
        { address: 'RLBxxFkseAZ4RgJH3Sqn8jXxhmGoz9jWxDNJMh8pL7a', symbol: 'RLB', name: 'Rollbit Coin', decimals: 2, logoURI: 'https://s2.coinmarketcap.com/static/img/coins/64x64/14298.png' },
      ];
      
      console.log('✅ Returning fallback Solana tokens');
      res.json(POPULAR_SOLANA_TOKENS);
    } catch (error: any) {
      console.error("Error fetching Solana tokens:", error);
      res.status(500).json({ error: "Failed to fetch token list" });
    }
  });
  
  // Lookup token by contract address (for paste-and-find feature)
  app.get("/api/solana/token/:address", async (req, res) => {
    try {
      const { address } = req.params;
      
      // Validate address format (Solana addresses are 32-44 characters base58)
      if (!address || address.length < 32 || address.length > 44) {
        return res.status(400).json({ error: "Invalid Solana token address format" });
      }
      
      console.log('🔍 Looking up token by address:', address);
      
      // Try Jupiter API to get token metadata
      const token = await lookupJupiterToken(address);
      
      if (token) {
        return res.json({
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoURI: token.logoURI,
          tags: token.tags || [],
        });
      }
      
      // If not found anywhere, provide helpful error message
      console.log('❌ Token not found for address:', address);
      return res.status(404).json({ 
        error: "Token not found. This address may be a wallet address, not a token mint address. Please paste a valid SPL token contract address.",
        hint: "Token addresses look like: DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 (BONK)"
      });
    } catch (error: any) {
      console.error("Error looking up token:", error);
      res.status(500).json({ error: "Failed to lookup token" });
    }
  });
  
  // Jupiter Quote API for Solana swaps
  app.get("/api/solana/quote", async (req, res) => {
    try {
      const { inputMint, outputMint, amount, slippageBps = '50' } = req.query;
      
      if (!inputMint || !outputMint || !amount) {
        return res.status(400).json({ error: "Missing required parameters: inputMint, outputMint, amount" });
      }

      // Validate amount is a positive number
      const amountNum = parseInt(amount as string);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: "Invalid amount - must be a positive integer" });
      }

      // Validate slippage is reasonable (0-5000 bps = 0-50%)
      const slippageNum = parseInt(slippageBps as string);
      if (isNaN(slippageNum) || slippageNum < 0 || slippageNum > 5000) {
        return res.status(400).json({ error: "Invalid slippage - must be between 0 and 5000 basis points (0-50%)" });
      }

      // Validate mint addresses (Solana addresses are 32-44 characters base58)
      const inputMintStr = inputMint as string;
      const outputMintStr = outputMint as string;
      if (inputMintStr.length < 32 || inputMintStr.length > 44 || outputMintStr.length < 32 || outputMintStr.length > 44) {
        return res.status(400).json({ error: "Invalid token mint address format" });
      }
      
      const params = new URLSearchParams({
        inputMint: inputMintStr,
        outputMint: outputMintStr,
        amount: amount as string,
        slippageBps: slippageBps as string,
      });
      
      console.log('🪐 Jupiter Quote Request:', { inputMint, outputMint, amount, slippageBps });
      
      // Use public Jupiter API (QuickNode hosted, more reliable)
      const response = await fetch(`https://public.jupiterapi.com/quote?${params.toString()}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Jupiter Quote Error:', response.status, errorText);
        return res.status(response.status).json({ error: errorText });
      }
      
      const quote = await response.json();
      console.log('✅ Jupiter Quote received:', {
        inputMint,
        outputMint,
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        priceImpact: quote.priceImpactPct
      });
      
      res.json(quote);
    } catch (error: any) {
      console.error("Error fetching Jupiter quote:", error);
      res.status(500).json({ error: error.message || "Failed to get quote" });
    }
  });
  
  // Jupiter Swap Transaction API
  app.post("/api/solana/swap", express.json(), async (req, res) => {
    try {
      const { quoteResponse, userPublicKey, wrapAndUnwrapSol = true, computeUnitPriceMicroLamports = 'auto' } = req.body;
      
      // Validate required parameters
      if (!quoteResponse || !userPublicKey) {
        return res.status(400).json({ error: "Missing quoteResponse or userPublicKey" });
      }

      // Validate userPublicKey format (Solana public keys are 32-44 characters base58)
      if (typeof userPublicKey !== 'string' || userPublicKey.length < 32 || userPublicKey.length > 44) {
        return res.status(400).json({ error: "Invalid Solana public key format" });
      }

      // Validate quoteResponse structure
      if (!quoteResponse.inputMint || !quoteResponse.outputMint || !quoteResponse.inAmount || !quoteResponse.outAmount) {
        return res.status(400).json({ error: "Invalid quote response - missing required fields (inputMint, outputMint, inAmount, outAmount)" });
      }

      // Validate amounts are positive numbers
      const inAmount = parseInt(quoteResponse.inAmount);
      const outAmount = parseInt(quoteResponse.outAmount);
      if (isNaN(inAmount) || inAmount <= 0 || isNaN(outAmount) || outAmount <= 0) {
        return res.status(400).json({ error: "Invalid quote amounts - must be positive numbers" });
      }
      
      console.log('🪐 Jupiter Swap Request:', {
        userPublicKey,
        inputMint: quoteResponse.inputMint,
        outputMint: quoteResponse.outputMint,
        inAmount: quoteResponse.inAmount,
        outAmount: quoteResponse.outAmount
      });
      
      // Use public Jupiter API for swap (QuickNode hosted)
      const response = await fetch('https://public.jupiterapi.com/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey,
          wrapAndUnwrapSol,
          computeUnitPriceMicroLamports,
          dynamicComputeUnitLimit: true,
          dynamicSlippage: true
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Jupiter Swap Error:', response.status, errorText);
        return res.status(response.status).json({ error: errorText });
      }
      
      const swapData = await response.json();
      console.log('✅ Jupiter Swap transaction prepared');
      
      res.json(swapData);
    } catch (error: any) {
      console.error("Error preparing Jupiter swap:", error);
      res.status(500).json({ error: error.message || "Failed to prepare swap" });
    }
  });
  
  // Jupiter Token Price API
  app.get("/api/solana/price", async (req, res) => {
    try {
      const { ids } = req.query;
      
      if (!ids) {
        return res.status(400).json({ error: "Missing token mint addresses (ids)" });
      }
      
      const mintAddresses = (ids as string).split(',');
      const priceData: Record<string, { price: number }> = {};
      
      // Use Birdeye public API for Solana prices (free tier)
      for (const mint of mintAddresses) {
        try {
          // Special case for SOL
          if (mint === 'So11111111111111111111111111111111111111112') {
            const cgResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
            if (cgResponse.ok) {
              const cgData = await cgResponse.json();
              priceData[mint] = { price: cgData.solana?.usd || 0 };
              continue;
            }
          }
          
          // Try DexScreener for other tokens
          const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
          if (dexResponse.ok) {
            const dexData = await dexResponse.json();
            const pair = dexData.pairs?.[0];
            if (pair?.priceUsd) {
              priceData[mint] = { price: parseFloat(pair.priceUsd) };
              continue;
            }
          }
          
          // Fallback: no price found
          priceData[mint] = { price: 0 };
        } catch (err) {
          console.error(`Error fetching price for ${mint}:`, err);
          priceData[mint] = { price: 0 };
        }
      }
      
      res.json({ data: priceData });
    } catch (error: any) {
      console.error("Error fetching Solana token prices:", error);
      res.status(500).json({ error: error.message || "Failed to fetch prices" });
    }
  });
  
  // Solana balance cache (30 second TTL)
  const solanaBalanceCache = new Map<string, { balance: number; timestamp: number }>();
  const SOLANA_BALANCE_CACHE_TTL = 30000; // 30 seconds
  
  // Solana RPC endpoints with fallback (backend-side, no CORS issues)
  const SOLANA_RPC_ENDPOINTS = [
    'https://api.mainnet-beta.solana.com',
    'https://solana-mainnet.g.alchemy.com/v2/demo',
  ];
  
  // Solana token balance check with caching and fallback RPCs
  app.get("/api/solana/balance/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const skipCache = req.query.t !== undefined; // Skip cache if timestamp provided
      
      // Check cache first (unless skip requested)
      const cached = solanaBalanceCache.get(address);
      if (!skipCache && cached && Date.now() - cached.timestamp < SOLANA_BALANCE_CACHE_TTL) {
        console.log(`💰 SOL balance (cached): ${cached.balance} for ${address.substring(0, 8)}...`);
        return res.json({
          address,
          balance: cached.balance,
          lamports: Math.round(cached.balance * 1e9),
          cached: true
        });
      }
      
      const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
      const publicKey = new PublicKey(address);
      
      // Try each RPC endpoint with fallback
      let lastError: Error | null = null;
      for (let i = 0; i < SOLANA_RPC_ENDPOINTS.length; i++) {
        const rpcUrl = SOLANA_RPC_ENDPOINTS[i];
        try {
          console.log(`🔄 Trying Solana RPC ${i + 1}/${SOLANA_RPC_ENDPOINTS.length} for balance...`);
          
          const connection = new Connection(rpcUrl, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 15000
          });
          
          const lamports = await connection.getBalance(publicKey);
          const balance = lamports / LAMPORTS_PER_SOL;
          
          // Cache the result
          solanaBalanceCache.set(address, { balance, timestamp: Date.now() });
          
          console.log(`💰 SOL balance: ${balance.toFixed(4)} for ${address.substring(0, 8)}...`);
          
          return res.json({
            address,
            balance,
            lamports,
            cached: false
          });
        } catch (err: any) {
          console.warn(`⚠️ Solana RPC ${i + 1} failed:`, err.message?.substring(0, 100) || err);
          lastError = err;
          
          // Add delay before retrying with next RPC
          if (i < SOLANA_RPC_ENDPOINTS.length - 1) {
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }
      
      // All RPCs failed
      console.error("❌ All Solana RPCs failed for balance fetch");
      res.status(503).json({ 
        error: "All RPC endpoints failed", 
        details: lastError?.message || "Unknown error"
      });
    } catch (error: any) {
      console.error("Error fetching Solana balance:", error);
      res.status(500).json({ error: error.message || "Failed to fetch balance" });
    }
  });

  // SPL Token Balance endpoint (via backend to avoid RPC rate limits)
  const splTokenBalanceCache = new Map<string, { balance: number; timestamp: number }>();
  const SPL_BALANCE_CACHE_TTL = 30000; // 30 seconds
  
  app.get("/api/solana/token-balance/:wallet/:mint", async (req, res) => {
    try {
      const { wallet, mint } = req.params;
      const cacheKey = `${wallet}:${mint}`;
      const skipCache = req.query.t !== undefined; // Skip cache if timestamp provided
      
      // Check cache first (unless skip requested)
      const cached = splTokenBalanceCache.get(cacheKey);
      if (!skipCache && cached && Date.now() - cached.timestamp < SPL_BALANCE_CACHE_TTL) {
        console.log(`💰 SPL balance (cached): ${cached.balance} for ${mint.substring(0, 8)}...`);
        return res.json({
          wallet,
          mint,
          balance: cached.balance,
          cached: true
        });
      }
      
      const { Connection, PublicKey } = await import("@solana/web3.js");
      const walletPubkey = new PublicKey(wallet);
      const mintPubkey = new PublicKey(mint);
      
      // Try each RPC endpoint
      let lastError: Error | null = null;
      for (let i = 0; i < SOLANA_RPC_ENDPOINTS.length; i++) {
        const rpcUrl = SOLANA_RPC_ENDPOINTS[i];
        try {
          console.log(`🔄 Trying Solana RPC ${i + 1}/${SOLANA_RPC_ENDPOINTS.length} for SPL balance...`);
          
          const connection = new Connection(rpcUrl, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 15000
          });
          
          // Get all token accounts for this wallet and mint
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
            mint: mintPubkey
          });
          
          let balance = 0;
          if (tokenAccounts.value.length > 0) {
            const tokenAmount = tokenAccounts.value[0].account.data.parsed.info.tokenAmount;
            balance = parseFloat(tokenAmount.uiAmountString || '0');
          }
          
          // Cache the result
          splTokenBalanceCache.set(cacheKey, { balance, timestamp: Date.now() });
          
          console.log(`💰 SPL balance: ${balance} for ${mint.substring(0, 8)}... (wallet: ${wallet.substring(0, 8)}...)`);
          
          return res.json({
            wallet,
            mint,
            balance,
            cached: false
          });
        } catch (err: any) {
          console.warn(`⚠️ Solana RPC ${i + 1} failed for SPL balance:`, err.message?.substring(0, 100) || err);
          lastError = err;
          
          if (i < SOLANA_RPC_ENDPOINTS.length - 1) {
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }
      
      console.error("❌ All Solana RPCs failed for SPL balance fetch");
      res.status(503).json({ 
        error: "All RPC endpoints failed", 
        balance: 0,
        details: lastError?.message || "Unknown error"
      });
    } catch (error: any) {
      console.error("Error fetching SPL token balance:", error);
      res.status(500).json({ error: error.message || "Failed to fetch balance", balance: 0 });
    }
  });

  // ========================================
  // SOLANA ALL TOKEN BALANCES - Single RPC call for all SPL tokens
  // This avoids rate limiting by using getTokenAccountsByOwner once
  // ========================================
  
  const allTokenBalanceCache = new Map<string, { balances: Record<string, number>; timestamp: number }>();
  const ALL_TOKEN_CACHE_TTL = 30000; // 30 seconds
  
  app.get("/api/solana/all-token-balances/:wallet", async (req, res) => {
    try {
      const { wallet } = req.params;
      const skipCache = req.query.t !== undefined;
      
      // Check cache first
      const cached = allTokenBalanceCache.get(wallet);
      if (!skipCache && cached && Date.now() - cached.timestamp < ALL_TOKEN_CACHE_TTL) {
        console.log(`💰 All token balances (cached) for ${wallet.substring(0, 8)}...`);
        return res.json({
          wallet,
          balances: cached.balances,
          cached: true
        });
      }
      
      const { Connection, PublicKey } = await import("@solana/web3.js");
      const { TOKEN_PROGRAM_ID } = await import("@solana/spl-token");
      const walletPubkey = new PublicKey(wallet);
      
      // Try each RPC endpoint
      let lastError: Error | null = null;
      for (let i = 0; i < SOLANA_RPC_ENDPOINTS.length; i++) {
        const rpcUrl = SOLANA_RPC_ENDPOINTS[i];
        try {
          console.log(`🔄 Trying Solana RPC ${i + 1}/${SOLANA_RPC_ENDPOINTS.length} for ALL token balances...`);
          
          const connection = new Connection(rpcUrl, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 20000
          });
          
          // Get ALL token accounts for this wallet in ONE call
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
            programId: TOKEN_PROGRAM_ID
          });
          
          const balances: Record<string, number> = {};
          
          for (const account of tokenAccounts.value) {
            const parsed = account.account.data.parsed;
            if (parsed && parsed.info && parsed.info.mint) {
              const mint = parsed.info.mint;
              const balance = parseFloat(parsed.info.tokenAmount?.uiAmountString || '0');
              if (balance > 0) {
                balances[mint] = balance;
              }
            }
          }
          
          // Cache the result
          allTokenBalanceCache.set(wallet, { balances, timestamp: Date.now() });
          
          console.log(`💰 Fetched ${Object.keys(balances).length} token balances for ${wallet.substring(0, 8)}...`);
          
          return res.json({
            wallet,
            balances,
            tokenCount: Object.keys(balances).length,
            cached: false
          });
        } catch (err: any) {
          console.warn(`⚠️ Solana RPC ${i + 1} failed for all tokens:`, err.message?.substring(0, 100) || err);
          lastError = err;
          
          if (i < SOLANA_RPC_ENDPOINTS.length - 1) {
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }
      
      console.error("❌ All Solana RPCs failed for all token balances fetch");
      res.status(503).json({ 
        error: "All RPC endpoints failed", 
        balances: {},
        details: lastError?.message || "Unknown error"
      });
    } catch (error: any) {
      console.error("Error fetching all token balances:", error);
      res.status(500).json({ error: error.message || "Failed to fetch balances", balances: {} });
    }
  });

  // ========================================
  // SOLANA SEND TRANSACTION (with RPC fallback to avoid 403 rate limits)
  // ========================================
  
  app.post("/api/solana/send-transaction", express.json(), async (req, res) => {
    try {
      const { signedTransaction } = req.body;
      
      if (!signedTransaction) {
        return res.status(400).json({ error: "Missing signed transaction" });
      }
      
      console.log('📤 Sending signed Solana transaction via backend RPC...');
      
      const { Connection } = await import("@solana/web3.js");
      
      // Use backend RPC endpoints with fallback
      const rpcEndpoints = [
        'https://api.mainnet-beta.solana.com',
        'https://solana-mainnet.g.alchemy.com/v2/demo',
      ];
      
      const txBuffer = Buffer.from(signedTransaction, 'base64');
      
      let lastError: Error | null = null;
      
      for (let i = 0; i < rpcEndpoints.length; i++) {
        const rpcUrl = rpcEndpoints[i];
        try {
          console.log(`🔄 Trying RPC ${i + 1}/${rpcEndpoints.length} for sendTransaction...`);
          
          const connection = new Connection(rpcUrl, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 30000
          });
          
          // Send raw transaction
          const signature = await connection.sendRawTransaction(txBuffer, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3
          });
          
          console.log(`📤 Transaction sent: ${signature}`);
          
          // Wait for confirmation
          const confirmation = await connection.confirmTransaction(signature, 'confirmed');
          
          if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
          }
          
          console.log(`✅ Transaction confirmed: ${signature}`);
          
          return res.json({
            success: true,
            signature,
            confirmed: true
          });
          
        } catch (rpcError: any) {
          console.log(`⚠️ RPC ${i + 1} failed:`, rpcError.message);
          lastError = rpcError;
        }
      }
      
      // All RPCs failed
      console.error('❌ All Solana RPCs failed to send transaction');
      return res.status(500).json({ 
        error: lastError?.message || "Failed to send transaction - all RPCs failed",
        allRpcsFailed: true
      });
      
    } catch (error: any) {
      console.error("Error sending Solana transaction:", error);
      res.status(500).json({ error: error.message || "Failed to send transaction" });
    }
  });

  // ========================================
  // SOLANA LIMIT ORDER BACKEND WITH ESCROW (No Jupiter Trigger API - FREE)
  // Users deposit to escrow, backend auto-executes when price target is hit
  // ========================================
  
  // Import escrow service
  const { getSolanaEscrowService } = await import('./solanaEscrow');
  const solanaEscrow = getSolanaEscrowService();
  
  // Get escrow address for deposits
  app.get("/api/solana/limit-order/escrow-info", async (req, res) => {
    try {
      const escrowAddress = solanaEscrow.getEscrowAddress();
      const balance = await solanaEscrow.getEscrowBalance();
      
      res.json({
        escrowAddress,
        escrowBalance: balance,
        message: 'Deposit your funds to this address to create limit orders'
      });
    } catch (error: any) {
      console.error("Error getting escrow info:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Step 1: Prepare deposit transaction for user to sign
  app.post("/api/solana/limit-order/prepare-deposit", express.json(), async (req, res) => {
    try {
      const { 
        inputMint, 
        outputMint, 
        inputSymbol,
        outputSymbol,
        maker, 
        makingAmount, 
        takingAmount, 
        targetPrice,
        orderType,
        expiredAt 
      } = req.body;
      
      if (!inputMint || !outputMint || !maker || !makingAmount || !targetPrice || !orderType) {
        return res.status(400).json({ error: "Missing required parameters" });
      }
      
      console.log('🌞 Solana Limit Order Prepare Deposit:', {
        inputMint,
        orderType,
        maker,
        makingAmount,
        targetPrice
      });
      
      // Create deposit transaction for user to sign
      const depositTx = await solanaEscrow.createDepositTransaction(
        maker,
        inputMint,
        makingAmount
      );
      
      if (!depositTx) {
        return res.status(500).json({ error: "Failed to create deposit transaction" });
      }
      
      // Generate order ID for tracking
      const orderId = `sol_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      res.json({
        success: true,
        orderId,
        transaction: depositTx.transaction,
        escrowAddress: depositTx.escrowAddress,
        orderDetails: {
          inputMint,
          outputMint,
          inputSymbol,
          outputSymbol,
          makingAmount,
          takingAmount,
          targetPrice,
          orderType,
          expiredAt
        },
        message: 'Sign this transaction to deposit funds and create your limit order'
      });
    } catch (error: any) {
      console.error("Error preparing Solana limit order deposit:", error);
      res.status(500).json({ error: error.message || "Failed to prepare deposit" });
    }
  });
  
  // Step 2: Confirm deposit and create order after user signs transaction
  app.post("/api/solana/limit-order/create", express.json(), async (req, res) => {
    try {
      const { 
        inputMint, 
        outputMint, 
        inputSymbol,
        outputSymbol,
        maker, 
        makingAmount, 
        takingAmount, 
        targetPrice,
        orderType,
        depositTxSignature,
        expiredAt,
        tokenDecimals 
      } = req.body;
      
      if (!inputMint || !outputMint || !maker || !makingAmount || !takingAmount || !targetPrice || !orderType) {
        return res.status(400).json({ error: "Missing required parameters" });
      }
      
      // Require deposit transaction signature (user must have deposited to escrow)
      if (!depositTxSignature) {
        return res.status(400).json({ 
          error: "Missing deposit transaction signature. User must deposit funds to escrow first.",
          requiresDeposit: true
        });
      }
      
      // Validate maker is a valid Solana public key format (base58, 32-44 chars)
      if (typeof maker !== 'string' || maker.length < 32 || maker.length > 44) {
        return res.status(400).json({ error: "Invalid maker public key format" });
      }
      
      console.log('🌞 Solana Limit Order Create (with deposit):', {
        inputMint,
        outputMint,
        maker,
        makingAmount,
        takingAmount,
        targetPrice,
        orderType,
        depositTxSignature
      });
      
      // Generate unique order ID first (needed for verification)
      const orderId = `sol_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // SECURITY: Check if this deposit signature is already used for another order
      // This prevents the same deposit from being used to create multiple orders
      const allFillableOrders = await storage.getFillableLimitOrders();
      const sigAlreadyUsed = allFillableOrders.some((order) => 
        order.chain === 'solana' &&
        order.signature === depositTxSignature && 
        order.status !== 'cancelled' && 
        order.status !== 'failed'
      );
      
      if (sigAlreadyUsed) {
        console.error('❌ Deposit signature already used for another order');
        return res.status(400).json({ 
          error: "This deposit transaction has already been used to create an order. Please make a new deposit.",
          duplicateSignature: true
        });
      }
      
      // SECURITY: Verify the deposit transaction on-chain
      // This prevents attackers from claiming fake deposits or using other users' deposits
      const verificationResult = await solanaEscrow.verifyDepositTransaction(
        depositTxSignature,
        maker,
        inputMint,
        makingAmount,
        orderId
      );
      
      if (!verificationResult.verified) {
        console.error('❌ Deposit verification failed:', verificationResult.error);
        return res.status(400).json({ 
          error: `Deposit verification failed: ${verificationResult.error}`,
          verified: false
        });
      }
      
      console.log('✅ Deposit verified on-chain for order:', orderId);
      
      // Find or create user by Solana wallet address
      let user = await storage.getUserBySolanaAddress(maker);
      if (!user) {
        console.log('👤 Creating user for Solana wallet:', maker);
        user = await storage.createUser({
          walletAddress: maker,
          solanaAddress: maker,
        });
      }
      
      // orderId already generated above for verification
      const salt = Date.now().toString();
      
      // Calculate expiry (default 30 days)
      const expiryTimestamp = expiredAt 
        ? parseInt(expiredAt) 
        : Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
      
      // Token address is the one being traded (not SOL)
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const tokenAddress = orderType === 'buy' ? outputMint : inputMint;
      const tokenSymbol = orderType === 'buy' ? (outputSymbol || 'TOKEN') : (inputSymbol || 'TOKEN');
      
      // Store order in database with escrow deposit info - status 'fillable' so executor picks it up
      const orderData = {
        userId: user.id,
        userWalletAddress: maker,
        tokenAddress,
        tokenSymbol,
        orderType,
        targetPrice: targetPrice.toString(),
        solAmount: orderType === 'buy' ? makingAmount.toString() : takingAmount.toString(),
        tokenAmount: orderType === 'buy' ? takingAmount.toString() : makingAmount.toString(),
        totalValue: (parseFloat(targetPrice) * parseFloat(orderType === 'buy' ? takingAmount : makingAmount)).toString(),
        status: 'fillable',
        chain: 'solana' as const,
        signature: depositTxSignature, // Store the deposit transaction signature
        salt,
        orderHash: orderId,
        makerAmount: makingAmount.toString(),
        takerAmount: takingAmount.toString(),
        makerToken: inputMint,
        takerToken: outputMint,
        expiry: expiryTimestamp,
        orderJson: JSON.stringify({
          inputMint,
          outputMint,
          maker,
          makingAmount,
          takingAmount,
          targetPrice,
          orderType,
          depositTxSignature,
          escrowAddress: solanaEscrow.getEscrowAddress(),
          expiredAt: expiryTimestamp,
          tokenDecimals: tokenDecimals || 9
        }),
        expiresAt: new Date(expiryTimestamp * 1000),
      };
      
      const createdOrder = await storage.createLimitOrder(orderData);
      
      console.log('✅ Solana Limit Order saved (escrow deposit confirmed):', createdOrder.id);
      
      res.json({
        success: true,
        orderId: createdOrder.id,
        order: createdOrder,
        escrowAddress: solanaEscrow.getEscrowAddress(),
        message: 'Order created! Your funds are in escrow and will be automatically swapped when the target price is reached.'
      });
    } catch (error: any) {
      console.error("Error creating Solana limit order:", error);
      res.status(500).json({ error: error.message || "Failed to create limit order" });
    }
  });
  
  // Get open Solana limit orders for a wallet (from our database)
  app.get("/api/solana/limit-order/open", async (req, res) => {
    try {
      const { wallet } = req.query;
      
      if (!wallet) {
        return res.status(400).json({ error: "Missing wallet address" });
      }
      
      console.log('📋 Fetching Solana limit orders from database for:', wallet);
      
      // Get all orders for this wallet from our database
      const allOrders = await storage.getFillableLimitOrders();
      const solanaOrders = allOrders.filter(order => 
        order.chain === 'solana' && 
        order.userWalletAddress === wallet &&
        ['pending', 'fillable', 'ready_to_execute'].includes(order.status)
      );
      
      console.log(`✅ Found ${solanaOrders.length} active Solana orders`);
      
      // Format orders for frontend
      const formattedOrders = solanaOrders.map(order => {
        const orderJson = order.orderJson ? JSON.parse(order.orderJson) : {};
        return {
          id: order.id,
          orderType: order.orderType,
          tokenSymbol: order.tokenSymbol,
          tokenAddress: order.tokenAddress,
          tokenDecimals: orderJson.tokenDecimals || 9,
          targetPrice: order.targetPrice,
          solAmount: order.solAmount,
          tokenAmount: order.tokenAmount,
          status: order.status,
          inputMint: order.makerToken,
          outputMint: order.takerToken,
          makingAmount: order.makerAmount,
          takingAmount: order.takerAmount,
          filledPrice: order.filledPrice,
          createdAt: order.createdAt,
          expiresAt: order.expiresAt,
        };
      });
      
      res.json(formattedOrders);
    } catch (error: any) {
      console.error("Error fetching Solana limit orders:", error);
      res.json([]);
    }
  });
  
  // Cancel Solana limit order (from our database) with refund
  app.post("/api/solana/limit-order/cancel", express.json(), async (req, res) => {
    try {
      const { orderId, wallet } = req.body;
      
      if (!orderId) {
        return res.status(400).json({ error: "Missing order ID" });
      }
      
      console.log('❌ Cancelling Solana limit order:', orderId);
      
      // Get the order first to verify ownership
      const order = await storage.getLimitOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      if (order.userWalletAddress !== wallet) {
        return res.status(403).json({ error: "Unauthorized: wallet mismatch" });
      }
      
      if (order.status === 'filled' || order.status === 'cancelled') {
        return res.status(400).json({ error: `Cannot cancel order with status: ${order.status}` });
      }
      
      // Update order status to cancelled
      await storage.updateLimitOrder(orderId, { status: 'cancelled' });
      
      // Try to refund the escrowed funds
      let refundSignature: string | undefined;
      try {
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        const inputMint = order.makerToken || SOL_MINT;
        const amount = order.makerAmount || order.solAmount || '0';
        
        console.log('💸 Attempting refund for cancelled order:', orderId);
        const refundResult = await solanaEscrow.refundToUser(wallet, inputMint, amount);
        
        if (refundResult.success) {
          refundSignature = refundResult.signature;
          console.log('✅ Refund sent:', refundSignature);
        } else {
          console.warn('⚠️ Refund failed (funds may already be returned):', refundResult.error);
        }
      } catch (refundError) {
        console.warn('⚠️ Refund attempt failed:', refundError);
      }
      
      console.log('✅ Solana limit order cancelled:', orderId);
      
      res.json({
        success: true,
        orderId,
        refundSignature,
        message: refundSignature ? 'Order cancelled and funds refunded' : 'Order cancelled successfully'
      });
    } catch (error: any) {
      console.error("Error cancelling Solana limit order:", error);
      res.status(500).json({ error: error.message || "Failed to cancel order" });
    }
  });
  
  // Get failed Solana orders (for withdrawal)
  app.get("/api/solana/limit-order/failed", async (req, res) => {
    try {
      const wallet = req.query.wallet as string;
      
      if (!wallet) {
        return res.json([]);
      }
      
      console.log('📋 Fetching failed Solana orders for:', wallet);
      
      // Query directly by wallet address and chain (since getLimitOrdersByUser checks userId, not walletAddress)
      const { eq, and } = await import('drizzle-orm');
      const { limitOrders } = await import('@shared/schema');
      const allOrders = await storage.getAllLimitOrders();
      
      const failedOrders = allOrders.filter((o: any) => 
        o.chain === 'solana' && 
        o.status === 'failed' && 
        o.userWalletAddress === wallet
      );
      
      const formattedOrders = failedOrders.map((order: any) => ({
        id: order.id,
        orderType: order.orderType,
        tokenSymbol: order.tokenSymbol,
        solAmount: order.solAmount,
        makerAmount: order.makerAmount,
        inputMint: order.makerToken,
        status: order.status,
        createdAt: order.createdAt,
      }));
      
      console.log('✅ Found', formattedOrders.length, 'failed Solana orders');
      
      res.json(formattedOrders);
    } catch (error: any) {
      console.error("Error fetching failed Solana orders:", error);
      res.json([]);
    }
  });
  
  // Refund escrowed SOL from failed order
  app.post("/api/solana/limit-order/refund", express.json(), async (req, res) => {
    try {
      const { orderId, wallet } = req.body;
      
      if (!orderId || !wallet) {
        return res.status(400).json({ error: "Missing order ID or wallet" });
      }
      
      console.log('💸 Processing refund for order:', orderId);
      
      // Get order from database
      const order = await storage.getLimitOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      if (order.userWalletAddress !== wallet) {
        return res.status(403).json({ error: "Unauthorized: wallet mismatch" });
      }
      
      if (order.status !== 'failed') {
        return res.status(400).json({ error: `Order is not failed (status: ${order.status})` });
      }
      
      // Execute refund from escrow
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const inputMint = order.makerToken || SOL_MINT;
      const amount = order.makerAmount || order.solAmount || '0';
      
      console.log('💸 Refunding', amount, 'of', inputMint, 'to', wallet);
      
      const refundResult = await solanaEscrow.refundToUser(wallet, inputMint, amount);
      
      if (!refundResult.success) {
        console.error('❌ Refund failed:', refundResult.error);
        return res.status(500).json({ error: refundResult.error || 'Refund failed' });
      }
      
      // Update order status to refunded
      await storage.updateLimitOrder(orderId, { status: 'refunded' });
      
      console.log('✅ Refund successful:', refundResult.signature);
      
      res.json({
        success: true,
        signature: refundResult.signature,
        message: 'Refund successful'
      });
    } catch (error: any) {
      console.error("Error refunding Solana order:", error);
      res.status(500).json({ error: error.message || "Failed to refund order" });
    }
  });
  
  // Execute ready Solana limit order (user signs Jupiter swap transaction)
  app.post("/api/solana/limit-order/execute", express.json(), async (req, res) => {
    try {
      const { orderId, maker } = req.body;
      
      if (!orderId) {
        return res.status(400).json({ error: "Missing order ID" });
      }
      
      // Get order from database
      const order = await storage.getLimitOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      if (order.status !== 'ready_to_execute') {
        return res.status(400).json({ error: `Order is not ready to execute (status: ${order.status})` });
      }
      
      console.log('🚀 Preparing Solana limit order execution:', orderId);
      
      // Get Jupiter swap quote
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const inputMint = order.makerToken;
      const outputMint = order.takerToken;
      const amount = order.makerAmount;
      
      // Call Jupiter Quote API (FREE)
      const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=100`;
      
      const quoteResponse = await fetch(quoteUrl);
      if (!quoteResponse.ok) {
        const error = await quoteResponse.text();
        console.error('❌ Jupiter Quote Error:', error);
        return res.status(500).json({ error: 'Failed to get swap quote' });
      }
      
      const quoteData = await quoteResponse.json();
      
      // Get swap transaction (FREE)
      const swapResponse = await fetch('https://api.jup.ag/swap/v1/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: maker,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          dynamicSlippage: true,
        })
      });
      
      if (!swapResponse.ok) {
        const error = await swapResponse.text();
        console.error('❌ Jupiter Swap Error:', error);
        return res.status(500).json({ error: 'Failed to get swap transaction' });
      }
      
      const swapData = await swapResponse.json();
      
      console.log('✅ Jupiter swap transaction prepared for order:', orderId);
      
      res.json({
        success: true,
        orderId,
        swapTransaction: swapData.swapTransaction,
        quote: quoteData,
        message: 'Sign and submit this transaction to execute your limit order'
      });
    } catch (error: any) {
      console.error("Error executing Solana limit order:", error);
      res.status(500).json({ error: error.message || "Failed to execute order" });
    }
  });
  
  // Confirm Solana limit order execution (after user signs and submits)
  app.post("/api/solana/limit-order/confirm", express.json(), async (req, res) => {
    try {
      const { orderId, txSignature } = req.body;
      
      if (!orderId || !txSignature) {
        return res.status(400).json({ error: "Missing order ID or transaction signature" });
      }
      
      console.log('✅ Confirming Solana limit order execution:', orderId, 'tx:', txSignature);
      
      // Update order status to filled
      await storage.updateLimitOrder(orderId, { 
        status: 'filled',
        txHash: txSignature,
        filledAt: new Date()
      });
      
      res.json({
        success: true,
        orderId,
        txSignature,
        message: 'Order executed successfully!'
      });
    } catch (error: any) {
      console.error("Error confirming Solana limit order:", error);
      res.status(500).json({ error: error.message || "Failed to confirm order" });
    }
  });
  
  // Admin endpoint: List all token balances in escrow wallet
  app.get("/api/solana/admin/escrow-balances", async (req, res) => {
    try {
      console.log('🔧 Admin: Fetching all escrow token balances...');
      
      const escrowAddress = solanaEscrow.getEscrowAddress();
      const solBalance = await solanaEscrow.getEscrowBalance();
      const tokenBalances = await solanaEscrow.getAllTokenBalances();
      
      console.log(`💰 Escrow ${escrowAddress} has ${tokenBalances.length} tokens`);
      
      res.json({
        success: true,
        escrowAddress,
        solBalance,
        tokens: tokenBalances,
      });
    } catch (error: any) {
      console.error("Error fetching escrow balances:", error);
      res.status(500).json({ error: error.message || "Failed to fetch balances" });
    }
  });

  // Admin endpoint: Transfer stuck tokens from escrow to user
  app.post("/api/solana/admin/transfer-stuck", express.json(), async (req, res) => {
    try {
      const { userWallet, tokenMint, amount } = req.body;
      
      if (!userWallet || !tokenMint || !amount) {
        return res.status(400).json({ error: "Missing userWallet, tokenMint, or amount" });
      }
      
      console.log('🔧 Admin: Transferring stuck tokens from escrow...');
      console.log('   User:', userWallet);
      console.log('   Token:', tokenMint);
      console.log('   Amount:', amount);
      
      const result = await solanaEscrow.transferTokenToUser(userWallet, tokenMint, amount);
      
      if (!result.success) {
        console.error('❌ Admin transfer failed:', result.error);
        return res.status(500).json({ error: result.error });
      }
      
      console.log('✅ Admin transfer successful:', result.signature);
      
      res.json({
        success: true,
        signature: result.signature,
        message: 'Tokens transferred successfully'
      });
    } catch (error: any) {
      console.error("Error in admin transfer:", error);
      res.status(500).json({ error: error.message || "Failed to transfer" });
    }
  });
  
  // Admin endpoint: Retry pending transfers for orders where swap succeeded but transfer failed
  app.post("/api/solana/admin/retry-transfer", express.json(), async (req, res) => {
    try {
      const { orderId } = req.body;
      
      if (!orderId) {
        return res.status(400).json({ error: "Missing orderId" });
      }
      
      console.log('🔧 Admin: Retrying transfer for order:', orderId);
      
      // Get order details
      const allOrders = await storage.getAllLimitOrders();
      const order = allOrders.find(o => o.id === orderId);
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      if (order.status !== 'transfer_pending' && order.status !== 'failed') {
        return res.status(400).json({ error: `Order status is ${order.status}, cannot retry transfer` });
      }
      
      // Parse failure reason to extract token and amount
      const failureReason = order.failureReason || '';
      const tokenMatch = failureReason.match(/Token: ([A-Za-z0-9]+)/);
      const amountMatch = failureReason.match(/Amount: (\d+)/);
      
      if (!tokenMatch || !amountMatch || !order.userWalletAddress) {
        return res.status(400).json({ 
          error: "Cannot extract token/amount info from failure reason",
          failureReason 
        });
      }
      
      const outputMint = tokenMatch[1];
      const outputAmount = amountMatch[1];
      
      console.log(`   Token: ${outputMint}`);
      console.log(`   Amount: ${outputAmount}`);
      console.log(`   User: ${order.userWalletAddress}`);
      
      const result = await solanaEscrow.transferTokenToUser(
        order.userWalletAddress,
        outputMint,
        outputAmount
      );
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }
      
      // Update order status
      await storage.updateLimitOrder(orderId, {
        status: 'filled',
        signature: result.signature,
        failureReason: null,
      });
      
      console.log('✅ Admin retry transfer successful:', result.signature);
      
      res.json({
        success: true,
        signature: result.signature,
        message: 'Transfer completed successfully'
      });
    } catch (error: any) {
      console.error("Error in admin retry transfer:", error);
      res.status(500).json({ error: error.message || "Failed to retry transfer" });
    }
  });

  // Admin endpoint: Batch transfer all tokens to multiple users
  app.post("/api/solana/admin/batch-transfer", express.json(), async (req, res) => {
    try {
      const { transfers } = req.body;
      // transfers: Array<{ userWallet: string, tokenMint: string, amount: string }>
      
      if (!transfers || !Array.isArray(transfers) || transfers.length === 0) {
        return res.status(400).json({ error: "Missing or empty transfers array" });
      }
      
      console.log(`🔧 Admin: Batch transferring ${transfers.length} tokens...`);
      
      const results = [];
      for (const transfer of transfers) {
        const { userWallet, tokenMint, amount } = transfer;
        console.log(`   Transferring ${amount} of ${tokenMint} to ${userWallet}`);
        
        try {
          const result = await solanaEscrow.transferTokenToUser(userWallet, tokenMint, amount);
          results.push({
            userWallet,
            tokenMint,
            amount,
            success: result.success,
            signature: result.signature,
            error: result.error,
          });
        } catch (err: any) {
          results.push({
            userWallet,
            tokenMint,
            amount,
            success: false,
            error: err.message,
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Batch transfer complete: ${successCount}/${transfers.length} successful`);
      
      res.json({
        success: true,
        totalTransfers: transfers.length,
        successfulTransfers: successCount,
        results,
      });
    } catch (error: any) {
      console.error("Error in batch transfer:", error);
      res.status(500).json({ error: error.message || "Failed to batch transfer" });
    }
  });
  
  // Get order history (filled and cancelled orders)
  app.get("/api/solana/limit-order/history", async (req, res) => {
    try {
      const { wallet } = req.query;
      
      if (!wallet) {
        return res.status(400).json({ error: "Missing wallet address" });
      }
      
      console.log('📜 Fetching Solana order history for:', wallet);
      
      // Get all orders for this wallet
      const allOrders = await storage.getFillableLimitOrders();
      const historyOrders = allOrders.filter(order => 
        order.chain === 'solana' && 
        order.userWalletAddress === wallet &&
        ['filled', 'cancelled', 'expired', 'failed'].includes(order.status)
      );
      
      res.json({ orders: historyOrders });
    } catch (error: any) {
      console.error("Error fetching Solana order history:", error);
      res.status(500).json({ error: error.message || "Failed to fetch order history" });
    }
  });

  // ==================== JUPITER LIMIT ORDER API (On-chain, Trustless) ====================
  
  // Create Jupiter limit order - returns unsigned transaction for user to sign
  app.post("/api/jupiter/limit-order/create", express.json(), async (req, res) => {
    try {
      const { 
        maker, 
        inputMint, 
        outputMint, 
        makingAmount, 
        takingAmount,
        expiredAt 
      } = req.body;
      
      if (!maker || !inputMint || !outputMint || !makingAmount || !takingAmount) {
        return res.status(400).json({ 
          error: "Missing required fields: maker, inputMint, outputMint, makingAmount, takingAmount" 
        });
      }
      
      console.log('📝 Creating Jupiter limit order...');
      console.log('   Maker:', maker);
      console.log('   Input:', inputMint, makingAmount);
      console.log('   Output:', outputMint, takingAmount);
      
      const { jupiterLimitOrderService } = await import('./jupiterLimitOrder');
      
      const result = await jupiterLimitOrderService.createOrder({
        maker,
        inputMint,
        outputMint,
        makingAmount,
        takingAmount,
        expiredAt,
      });
      
      if (!result) {
        return res.status(500).json({ error: "Failed to create Jupiter limit order" });
      }
      
      console.log('✅ Jupiter order transaction ready:', result.order?.slice(0, 16) + '...');
      
      res.json({
        success: true,
        transaction: result.transaction,
        orderPubkey: result.order,
        message: "Sign and submit the transaction to create your limit order"
      });
    } catch (error: any) {
      console.error("Error creating Jupiter limit order:", error);
      res.status(500).json({ error: error.message || "Failed to create limit order" });
    }
  });
  
  // Cancel Jupiter limit order - returns unsigned transaction(s) for user to sign
  app.post("/api/jupiter/limit-order/cancel", express.json(), async (req, res) => {
    try {
      const { maker, orderPubkey } = req.body;
      
      if (!maker) {
        return res.status(400).json({ error: "Missing maker address" });
      }
      
      console.log('🚫 Cancelling Jupiter limit order...');
      console.log('   Maker:', maker);
      if (orderPubkey) console.log('   Order:', orderPubkey);
      
      const { jupiterLimitOrderService } = await import('./jupiterLimitOrder');
      
      const transactions = await jupiterLimitOrderService.cancelOrder(maker, orderPubkey);
      
      if (!transactions || transactions.length === 0) {
        return res.status(500).json({ error: "Failed to create cancel transactions" });
      }
      
      console.log('✅ Cancel transactions ready:', transactions.length);
      
      res.json({
        success: true,
        transactions,
        message: "Sign and submit the transaction(s) to cancel your order(s)"
      });
    } catch (error: any) {
      console.error("Error cancelling Jupiter limit order:", error);
      res.status(500).json({ error: error.message || "Failed to cancel limit order" });
    }
  });
  
  // Get open Jupiter limit orders (on-chain)
  app.get("/api/jupiter/limit-order/open", async (req, res) => {
    try {
      const { wallet } = req.query;
      
      if (!wallet) {
        return res.status(400).json({ error: "Missing wallet address" });
      }
      
      console.log('📋 Fetching Jupiter open orders for:', wallet);
      
      const { jupiterLimitOrderService } = await import('./jupiterLimitOrder');
      
      const orders = await jupiterLimitOrderService.getOpenOrders(wallet as string);
      
      res.json({ orders });
    } catch (error: any) {
      console.error("Error fetching Jupiter open orders:", error);
      res.status(500).json({ error: error.message || "Failed to fetch open orders" });
    }
  });
  
  // Get Jupiter order history
  app.get("/api/jupiter/limit-order/history", async (req, res) => {
    try {
      const { wallet } = req.query;
      
      if (!wallet) {
        return res.status(400).json({ error: "Missing wallet address" });
      }
      
      console.log('📜 Fetching Jupiter order history for:', wallet);
      
      const { jupiterLimitOrderService } = await import('./jupiterLimitOrder');
      
      const history = await jupiterLimitOrderService.getOrderHistory(wallet as string);
      
      res.json({ history });
    } catch (error: any) {
      console.error("Error fetching Jupiter order history:", error);
      res.status(500).json({ error: error.message || "Failed to fetch order history" });
    }
  });

  // ============ SONEIUM LIMIT ORDER ROUTES ============

  // Get Soneium token price via DEXScreener + KYO Finance fallback
  const soneiumPriceCache = new Map<string, { data: any; timestamp: number }>();
  const SONEIUM_PRICE_CACHE_TTL = 30000;

  app.get("/api/soneium/token-price/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const lowerAddr = address.toLowerCase();

      const cached = soneiumPriceCache.get(lowerAddr);
      if (cached && Date.now() - cached.timestamp < SONEIUM_PRICE_CACHE_TTL) {
        return res.json(cached.data);
      }

      // Try DEXScreener first
      try {
        const response = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${lowerAddr}`,
          { headers: { 'Accept': 'application/json' } }
        );

        if (response.ok) {
          const data = await response.json();
          const soneiumPair = data.pairs?.find((p: any) => p.chainId === 'soneium');

          if (soneiumPair && soneiumPair.priceUsd) {
            const result = {
              price: parseFloat(soneiumPair.priceUsd),
              symbol: soneiumPair.baseToken?.symbol || '',
              name: soneiumPair.baseToken?.name || '',
              priceChange24h: soneiumPair.priceChange?.h24 ? parseFloat(soneiumPair.priceChange.h24) : null,
              liquidity: soneiumPair.liquidity?.usd ? parseFloat(soneiumPair.liquidity.usd) : null,
              source: 'dexscreener',
            };
            soneiumPriceCache.set(lowerAddr, { data: result, timestamp: Date.now() });
            return res.json(result);
          }
        }
      } catch (e) {
        console.log('DEXScreener lookup failed for Soneium token, trying KYO quote...');
      }

      // Fallback: Use KYO Finance Quoter V2 to get price in WETH, then convert to USD
      try {
        const { ethers } = await import('ethers');
        const provider = new ethers.JsonRpcProvider("https://rpc.soneium.org");

        const SONEIUM_WETH = "0x4200000000000000000000000000000000000006";
        const KYO_QUOTER_V2 = "0x60eb4B04932797374a291380349008dc8cc40426";
        const QUOTER_ABI = [
          "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
        ];

        // Get token decimals
        const tokenContract = new ethers.Contract(lowerAddr, ['function decimals() view returns (uint8)', 'function symbol() view returns (string)', 'function name() view returns (string)'], provider);
        let decimals = 18;
        let symbol = '';
        let name = '';
        try {
          [decimals, symbol, name] = await Promise.all([
            tokenContract.decimals(),
            tokenContract.symbol(),
            tokenContract.name(),
          ]);
        } catch {}

        const quoter = new ethers.Contract(KYO_QUOTER_V2, QUOTER_ABI, provider);
        const oneToken = ethers.parseUnits("1", decimals);

        // Try multiple fee tiers
        const feeTiers = [3000, 10000, 500, 100];
        let wethOut: bigint | null = null;

        for (const fee of feeTiers) {
          try {
            const result = await quoter.quoteExactInputSingle.staticCall({
              tokenIn: lowerAddr,
              tokenOut: SONEIUM_WETH,
              amountIn: oneToken,
              fee,
              sqrtPriceLimitX96: BigInt(0),
            });
            wethOut = result[0];
            if (wethOut > BigInt(0)) break;
          } catch {}
        }

        if (wethOut && wethOut > BigInt(0)) {
          const wethAmount = parseFloat(ethers.formatEther(wethOut));

          // Get ETH price in USD
          let ethPriceUsd = 0;
          try {
            const ethPriceRes = await fetch('http://localhost:5000/api/eth-price');
            if (ethPriceRes.ok) {
              const ep = await ethPriceRes.json();
              ethPriceUsd = ep.price || 0;
            }
          } catch {}

          if (ethPriceUsd > 0) {
            const tokenPriceUsd = wethAmount * ethPriceUsd;
            const result = {
              price: tokenPriceUsd,
              symbol: symbol || '',
              name: name || '',
              priceChange24h: null,
              liquidity: null,
              source: 'kyo-finance',
            };
            soneiumPriceCache.set(lowerAddr, { data: result, timestamp: Date.now() });
            return res.json(result);
          }
        }
      } catch (e: any) {
        console.log('KYO Finance quote fallback failed:', e.message);
      }

      return res.status(404).json({ error: "Token not found on Soneium DEX" });
    } catch (error: any) {
      console.error('Error fetching Soneium token price:', error);
      return res.status(500).json({ error: "Failed to fetch token price" });
    }
  });

  // Get Soneium swap quote via KYO Finance (Uniswap V3)
  app.get("/api/soneium/limit-order/quote", async (req, res) => {
    try {
      const { tokenIn, tokenOut, amountIn } = req.query;
      
      if (!tokenIn || !tokenOut || !amountIn) {
        return res.status(400).json({ error: "Missing required params: tokenIn, tokenOut, amountIn" });
      }
      
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider("https://rpc.soneium.org");
      
      const KYO_QUOTER_V2 = "0x60eb4B04932797374a291380349008dc8cc40426";
      const QUOTER_V2_ABI = [
        "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
      ];
      
      const quoter = new ethers.Contract(KYO_QUOTER_V2, QUOTER_V2_ABI, provider);
      
      const params = {
        tokenIn: tokenIn as string,
        tokenOut: tokenOut as string,
        amountIn: BigInt(amountIn as string),
        fee: 3000,
        sqrtPriceLimitX96: 0
      };
      
      const result = await quoter.quoteExactInputSingle.staticCall(params);
      
      res.json({
        amountOut: result[0].toString(),
        gasEstimate: result[3].toString()
      });
    } catch (error: any) {
      console.error("Error getting Soneium quote:", error);
      res.status(500).json({ error: error.message || "Failed to get quote" });
    }
  });
  
  // Get Soneium vault info
  app.get("/api/soneium/limit-order/vault-info", async (req, res) => {
    try {
      const vaultAddress = process.env.SONEIUM_EXECUTOR_VAULT_ADDRESS;
      
      if (!vaultAddress) {
        return res.json({ 
          configured: false,
          message: "Soneium vault not deployed yet"
        });
      }
      
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider("https://rpc.soneium.org");
      
      const VAULT_ABI = ["function paused() external view returns (bool)"];
      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
      
      const isPaused = await vault.paused();
      
      res.json({
        configured: true,
        vaultAddress,
        chainId: 1868,
        swapRouter: "0x0dC73Fe1341365929Ed8a89Dd47097A9FDD254D0",
        weth: "0x4200000000000000000000000000000000000006",
        isPaused
      });
    } catch (error: any) {
      console.error("Error getting Soneium vault info:", error);
      res.status(500).json({ error: error.message || "Failed to get vault info" });
    }
  });
  
  // Get user's vault balance on Soneium
  app.get("/api/soneium/limit-order/balance", async (req, res) => {
    try {
      const { user, token } = req.query;
      
      if (!user || !token) {
        return res.status(400).json({ error: "Missing user or token address" });
      }
      
      const vaultAddress = process.env.SONEIUM_EXECUTOR_VAULT_ADDRESS;
      if (!vaultAddress) {
        return res.json({ balance: "0" });
      }
      
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider("https://rpc.soneium.org");
      
      const VAULT_ABI = ["function balances(address user, address token) external view returns (uint256)"];
      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
      
      const balance = await vault.balances(user as string, token as string);
      
      res.json({ balance: balance.toString() });
    } catch (error: any) {
      console.error("Error getting Soneium vault balance:", error);
      res.status(500).json({ error: error.message || "Failed to get balance" });
    }
  });
  
  // Create Soneium limit order
  app.post("/api/soneium/limit-order/create", express.json(), async (req, res) => {
    try {
      const { 
        tokenAddress, 
        tokenSymbol, 
        orderType, 
        targetPrice, 
        ethAmount, 
        tokenAmount, 
        totalValue,
        depositTxHash,
        walletAddress: reqWalletAddress,
        tokenDecimals = 18
      } = req.body;
      
      // Use session user if available, otherwise use wallet from request body (verified by deposit tx)
      const sessionUser = (req as any).session?.user;
      let userId = sessionUser?.id;
      let userWalletAddress = sessionUser?.walletAddress || reqWalletAddress;
      
      if (!userWalletAddress) {
        return res.status(400).json({ error: "Wallet address required" });
      }
      
      if (!depositTxHash) {
        return res.status(400).json({ error: "Deposit transaction hash required" });
      }
      
      // Verify deposit tx belongs to the claimed wallet on-chain
      if (!sessionUser) {
        try {
          const { ethers } = await import('ethers');
          const provider = new ethers.JsonRpcProvider("https://rpc.soneium.org");
          const tx = await provider.getTransaction(depositTxHash);
          if (!tx) {
            return res.status(403).json({ error: "Deposit transaction not found on-chain" });
          }
          if (tx.from.toLowerCase() !== userWalletAddress.toLowerCase()) {
            return res.status(403).json({ error: "Deposit transaction doesn't match wallet" });
          }
        } catch (e) {
          console.warn(`⚠️ Could not verify deposit tx ${depositTxHash}:`, e);
          return res.status(500).json({ error: "Failed to verify deposit transaction" });
        }
      }
      
      // If no session user, find or create user by wallet
      if (!userId) {
        const existingUser = await storage.getUserByWalletAddress(userWalletAddress);
        if (existingUser) {
          userId = existingUser.id;
        } else {
          const newUser = await storage.createUser({
            walletAddress: userWalletAddress,
            username: `soneium_${userWalletAddress.slice(0, 8)}`,
          });
          userId = newUser.id;
        }
      }
      
      if (!tokenAddress || !tokenSymbol || !orderType || !targetPrice) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Fetch actual token decimals from chain to prevent client manipulation
      let actualTokenDecimals = tokenDecimals;
      try {
        const { ethers } = await import('ethers');
        const provider = new ethers.JsonRpcProvider("https://rpc.soneium.org");
        const tokenContract = new ethers.Contract(
          tokenAddress, 
          ["function decimals() view returns (uint8)"], 
          provider
        );
        actualTokenDecimals = Number(await tokenContract.decimals());
      } catch (e) {
        console.warn(`⚠️ Could not fetch decimals for ${tokenAddress}, using provided: ${tokenDecimals}`);
      }
      
      const vaultAddress = process.env.SONEIUM_EXECUTOR_VAULT_ADDRESS;
      if (!vaultAddress) {
        return res.status(400).json({ error: "Soneium vault not configured" });
      }
      
      const SONEIUM_WETH = "0x4200000000000000000000000000000000000006";
      
      const { ethers } = await import('ethers');
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const orderHash = ethers.keccak256(ethers.solidityPacked(
        ['address', 'address', 'string', 'string', 'bytes32'],
        [userWalletAddress, tokenAddress, orderType, targetPrice, salt]
      ));
      
      const makerToken = orderType === 'buy' ? SONEIUM_WETH : tokenAddress;
      const takerToken = orderType === 'buy' ? tokenAddress : SONEIUM_WETH;
      
      // For buy orders: makerToken is WETH (18 decimals), takerToken uses actualTokenDecimals
      // For sell orders: makerToken uses actualTokenDecimals, takerToken is WETH (18 decimals)
      const makerAmount = orderType === 'buy' 
        ? ethers.parseEther(ethAmount || "0").toString() 
        : ethers.parseUnits(tokenAmount || "0", actualTokenDecimals).toString();
      const takerAmount = orderType === 'buy' 
        ? ethers.parseUnits(tokenAmount || "0", actualTokenDecimals).toString() 
        : ethers.parseEther(ethAmount || "0").toString();
      
      const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days
      
      const order = await storage.createLimitOrder({
        userId,
        userWalletAddress,
        tokenAddress,
        tokenSymbol,
        orderType,
        targetPrice,
        ethAmount: ethAmount || "0",
        tokenAmount: tokenAmount || "0",
        totalValue: totalValue || "0",
        chain: 'soneium',
        vaultVersion: 'v3',
        vaultAddress,
        signature: depositTxHash || "pending",
        salt,
        orderHash,
        makerAmount,
        takerAmount,
        makerToken,
        takerToken,
        expiry,
        orderJson: JSON.stringify({ orderType, targetPrice, tokenAddress, chain: 'soneium' }),
      });
      
      await storage.updateLimitOrder(order.id, { status: 'fillable' });
      
      console.log(`🟣 Soneium limit order created: ${orderType} ${tokenSymbol} @ $${targetPrice}`);
      
      res.json({ success: true, order });
    } catch (error: any) {
      console.error("Error creating Soneium limit order:", error);
      res.status(500).json({ error: error.message || "Failed to create order" });
    }
  });
  
  // Get user's Soneium limit orders
  app.get("/api/soneium/limit-order/orders", async (req, res) => {
    try {
      const { userId, wallet, walletAddress } = req.query;
      const walletParam = (wallet || walletAddress) as string | undefined;
      
      if (!userId && !walletParam) {
        return res.status(400).json({ error: "Missing userId or walletAddress" });
      }
      
      const allOrders = await storage.getAllLimitOrders();
      const soneiumOrders = allOrders.filter(order => 
        order.chain === 'soneium' && 
        (order.userId === userId || order.userWalletAddress?.toLowerCase() === walletParam?.toLowerCase())
      );
      
      res.json({ orders: soneiumOrders });
    } catch (error: any) {
      console.error("Error fetching Soneium orders:", error);
      res.status(500).json({ error: error.message || "Failed to fetch orders" });
    }
  });
  
  // Cancel Soneium limit order
  app.post("/api/soneium/limit-order/cancel", express.json(), async (req, res) => {
    try {
      const sessionUser = (req as any).session?.user;
      const { walletAddress: reqWallet } = req.body;
      
      const { orderId } = req.body;
      
      if (!orderId) {
        return res.status(400).json({ error: "Missing orderId" });
      }
      
      const order = await storage.getLimitOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Verify the order belongs to the user
      const callerWallet = sessionUser?.walletAddress || reqWallet;
      const callerUserId = sessionUser?.id;
      const isOwnerBySession = callerUserId && order.userId === callerUserId;
      const isOwnerByWallet = callerWallet && order.userWalletAddress?.toLowerCase() === callerWallet.toLowerCase();
      
      if (isOwnerBySession) {
        // Session auth is sufficient
      } else if (isOwnerByWallet && callerWallet) {
        // Wallet-only auth: verify using the order's deposit tx hash on-chain
        const depositTxHash = order.signature;
        if (!depositTxHash || depositTxHash === 'pending') {
          return res.status(403).json({ error: "Cannot verify wallet ownership" });
        }
        try {
          const { ethers } = await import('ethers');
          const provider = new ethers.JsonRpcProvider("https://rpc.soneium.org");
          const tx = await provider.getTransaction(depositTxHash);
          if (!tx) {
            return res.status(403).json({ error: "Deposit transaction not found" });
          }
          if (tx.from.toLowerCase() !== callerWallet.toLowerCase()) {
            return res.status(403).json({ error: "Wallet verification failed" });
          }
        } catch (e) {
          return res.status(500).json({ error: "Failed to verify wallet ownership" });
        }
      } else {
        return res.status(403).json({ error: "You can only cancel your own orders" });
      }
      
      if (order.chain !== 'soneium') {
        return res.status(400).json({ error: "Not a Soneium order" });
      }
      
      if (order.status === 'filled' || order.status === 'cancelled') {
        return res.status(400).json({ error: `Order already ${order.status}` });
      }
      
      await storage.updateLimitOrder(orderId, { status: 'cancelled' });
      
      // Auto-withdraw from vault after cancel
      let withdrawalResult = null;
      try {
        const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
        const vaultAddress = process.env.SONEIUM_EXECUTOR_VAULT_ADDRESS;
        if (deployerKey && vaultAddress && order.userWalletAddress && order.makerToken) {
          const { ethers } = await import('ethers');
          const provider = new ethers.JsonRpcProvider("https://rpc.soneium.org");
          const VAULT_ABI = [
            "function balances(address user, address token) external view returns (uint256)",
            "function executorWithdraw(address user, address token, uint256 amount) external"
          ];
          const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
          const balance = await vault.balances(order.userWalletAddress, order.makerToken);
          if (balance > BigInt(0)) {
            const executorWallet = new ethers.Wallet(deployerKey, provider);
            const vaultWithSigner = new ethers.Contract(vaultAddress, VAULT_ABI, executorWallet);
            console.log(`🟣 Auto-withdrawing ${ethers.formatEther(balance)} from vault for cancelled order ${orderId}`);
            const feeData = await provider.getFeeData();
            const gasOpts: any = {};
            if (feeData.maxFeePerGas) {
              gasOpts.maxFeePerGas = (feeData.maxFeePerGas * BigInt(120)) / BigInt(100);
              gasOpts.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas 
                ? (feeData.maxPriorityFeePerGas * BigInt(150)) / BigInt(100)
                : ethers.parseUnits('0.1', 'gwei');
            }
            const tx = await vaultWithSigner.executorWithdraw(order.userWalletAddress, order.makerToken, balance, gasOpts);
            const receipt = await tx.wait(1);
            withdrawalResult = { txHash: receipt.hash, amount: ethers.formatEther(balance) };
            console.log(`✅ Auto-withdrawal successful: ${receipt.hash}`);
          }
        }
      } catch (withdrawError: any) {
        console.warn(`⚠️ Auto-withdrawal failed for cancelled order ${orderId}:`, withdrawError.message);
      }
      
      console.log(`🟣 Soneium order ${orderId} cancelled`);
      
      res.json({ success: true, withdrawal: withdrawalResult });
    } catch (error: any) {
      console.error("Error cancelling Soneium order:", error);
      res.status(500).json({ error: error.message || "Failed to cancel order" });
    }
  });

  // Withdraw from Soneium vault (executor calls executorWithdraw on behalf of user)
  app.post("/api/soneium/limit-order/withdraw", express.json(), async (req, res) => {
    try {
      const { walletAddress: reqWallet, tokenAddress } = req.body;
      const sessionUser = (req as any).session?.user;
      const userWallet = sessionUser?.walletAddress || reqWallet;
      
      if (!userWallet) {
        return res.status(400).json({ error: "Wallet address required" });
      }
      if (!tokenAddress) {
        return res.status(400).json({ error: "Token address required" });
      }
      
      // Note: executorWithdraw always sends funds back to the `user` address via safeTransfer
      // so even if triggered by someone else, funds go to the original depositor - safe by design
      
      const vaultAddress = process.env.SONEIUM_EXECUTOR_VAULT_ADDRESS;
      if (!vaultAddress) {
        return res.status(400).json({ error: "Soneium vault not configured" });
      }
      
      const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
      if (!deployerKey) {
        return res.status(500).json({ error: "Executor wallet not configured" });
      }
      
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider("https://rpc.soneium.org");
      
      const VAULT_ABI = [
        "function balances(address user, address token) external view returns (uint256)",
        "function executorWithdraw(address user, address token, uint256 amount) external"
      ];
      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
      
      // Check current vault balance
      const balance = await vault.balances(userWallet, tokenAddress);
      if (balance === BigInt(0)) {
        return res.status(400).json({ error: "No balance to withdraw" });
      }
      
      // Execute withdrawal using deployer/executor wallet
      const executorWallet = new ethers.Wallet(deployerKey, provider);
      const vaultWithSigner = new ethers.Contract(vaultAddress, VAULT_ABI, executorWallet);
      
      console.log(`🟣 Withdrawing ${ethers.formatEther(balance)} from vault for ${userWallet} (token: ${tokenAddress})`);
      
      const feeData = await provider.getFeeData();
      const gasOpts: any = {};
      if (feeData.maxFeePerGas) {
        const boostedMaxFee = (feeData.maxFeePerGas * BigInt(150)) / BigInt(100);
        let boostedPriority = feeData.maxPriorityFeePerGas 
          ? (feeData.maxPriorityFeePerGas * BigInt(150)) / BigInt(100)
          : ethers.parseUnits('0.1', 'gwei');
        if (boostedPriority > boostedMaxFee) {
          boostedPriority = boostedMaxFee;
        }
        gasOpts.maxFeePerGas = boostedMaxFee;
        gasOpts.maxPriorityFeePerGas = boostedPriority;
      } else if (feeData.gasPrice) {
        gasOpts.gasPrice = (feeData.gasPrice * BigInt(150)) / BigInt(100);
      }
      const tx = await vaultWithSigner.executorWithdraw(userWallet, tokenAddress, balance, gasOpts);
      const receipt = await tx.wait(1);
      
      console.log(`✅ Soneium vault withdrawal successful: ${receipt.hash}`);
      
      res.json({ 
        success: true, 
        txHash: receipt.hash, 
        amount: balance.toString(),
        formattedAmount: ethers.formatEther(balance)
      });
    } catch (error: any) {
      console.error("Error withdrawing from Soneium vault:", error);
      res.status(500).json({ error: error.message || "Failed to withdraw from vault" });
    }
  });


  // ============== INK NETWORK ROUTES ==============
  // INK is Kraken's Ethereum L2 (Chain ID: 57073, OP Stack)

  const INK_RPC_URL = process.env.INK_RPC_URL || "https://rpc-gel.inkonchain.com";
  const INK_WETH = "0x4200000000000000000000000000000000000006";
  const INK_SWAP_ROUTER = process.env.INK_SWAP_ROUTER || "";
  const INK_QUOTER_V2 = process.env.INK_QUOTER_V2 || "";
  const INK_USDC = process.env.INK_USDC_ADDRESS || "";

  let inkTokenListCache: { tokens: any[], timestamp: number } | null = null;
  const inkQuoteCache = new Map<string, { data: any; timestamp: number }>();
  const inkPriceCache = new Map<string, { data: any; timestamp: number }>();
  const INK_PRICE_CACHE_TTL = 30000;

  function encodeInkPath(tokens: string[], fees: number[]): string {
    let encoded = tokens[0].slice(2).toLowerCase();
    for (let i = 0; i < fees.length; i++) {
      encoded += fees[i].toString(16).padStart(6, '0');
      encoded += tokens[i + 1].slice(2).toLowerCase();
    }
    return '0x' + encoded;
  }

  // INK token list from LI.FI or fallback
  app.get("/api/ink-tokens", async (req, res) => {
    try {
      const now = Date.now();
      if (inkTokenListCache && (now - inkTokenListCache.timestamp) < TOKEN_CACHE_TTL) {
        return res.json({ tokens: inkTokenListCache.tokens, cached: true });
      }

      const HARDCODED_FALLBACK = [
        { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'ETH', name: 'Ethereum', decimals: 18 },
        { address: '0x2D270e6886d130D724215A266106e6832161EAEd', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        { address: INK_WETH, symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
        { address: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', symbol: 'USDe', name: 'USDe', decimals: 18 },
        { address: '0xF1815bd50389c46847f0Bda824eC8da914045D14', symbol: 'USDC.e', name: 'Bridged USDC', decimals: 6 },
        { address: '0x0200C29006150606B650577BBE7B6248F58470c1', symbol: 'USD₮0', name: 'Tether USD', decimals: 6 },
      ];

      const toProxyUrl = (originalUrl: string) => {
        if (!originalUrl) return undefined;
        const base64 = Buffer.from(originalUrl).toString('base64');
        const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        return `/token-logo/${base64url}.png`;
      };

      try {
        console.log('🌐 Fetching INK token list from LI.FI...');
        const lifiRes = await fetch('https://li.quest/v1/tokens?chains=57073');
        if (lifiRes.ok) {
          const lifiData = await lifiRes.json();
          const rawTokens: any[] = lifiData.tokens?.['57073'] || [];

          const tokens = rawTokens
            .filter(t => t.address !== '0x0000000000000000000000000000000000000000')
            .map((t: any) => ({
              address: t.address,
              symbol: t.symbol,
              name: t.name,
              decimals: t.decimals,
              logoURI: t.logoURI ? toProxyUrl(t.logoURI) : undefined,
            }));

          if (tokens.length > 0) {
            inkTokenListCache = { tokens, timestamp: now };
            return res.json({ tokens, cached: false });
          }
        }
      } catch (e) {
        console.log('LI.FI INK token list not available, using fallback');
      }

      inkTokenListCache = { tokens: HARDCODED_FALLBACK, timestamp: now };
      return res.json({ tokens: HARDCODED_FALLBACK, cached: false });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch INK token list', tokens: [] });
    }
  });

  // INK token lookup by address
  app.get("/api/ink/token/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const provider = new ethers.JsonRpcProvider(INK_RPC_URL);
      const tokenContract = new ethers.Contract(
        address,
        ['function symbol() view returns (string)', 'function name() view returns (string)', 'function decimals() view returns (uint8)'],
        provider
      );
      const [symbol, name, decimals] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.name(),
        tokenContract.decimals(),
      ]);

      let logoURI: string | undefined;
      let priceUsd: number | undefined;
      try {
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address.toLowerCase()}`, {
          headers: { 'Accept': 'application/json' }
        });
        if (dexRes.ok) {
          const dexData = await dexRes.json();
          const inkPair = dexData.pairs?.find((p: any) => p.chainId === 'ink');
          if (inkPair) {
            if (inkPair.info?.imageUrl) logoURI = inkPair.info.imageUrl;
            if (inkPair.priceUsd) priceUsd = parseFloat(inkPair.priceUsd);
          }
        }
      } catch {}

      res.json({ address, symbol, name, decimals: Number(decimals), logoURI, priceUsd });
    } catch (error: any) {
      res.status(404).json({ error: 'Token not found on INK' });
    }
  });

  // Get INK token price via DEXScreener
  app.get("/api/ink/token-price/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const lowerAddr = address.toLowerCase();

      const cached = inkPriceCache.get(lowerAddr);
      if (cached && Date.now() - cached.timestamp < INK_PRICE_CACHE_TTL) {
        return res.json(cached.data);
      }

      try {
        const response = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${lowerAddr}`,
          { headers: { 'Accept': 'application/json' } }
        );
        if (response.ok) {
          const data = await response.json();
          const inkPair = data.pairs?.find((p: any) => p.chainId === 'ink');
          if (inkPair && inkPair.priceUsd) {
            const result = {
              price: parseFloat(inkPair.priceUsd),
              symbol: inkPair.baseToken?.symbol || '',
              name: inkPair.baseToken?.name || '',
              priceChange24h: inkPair.priceChange?.h24 ? parseFloat(inkPair.priceChange.h24) : null,
              liquidity: inkPair.liquidity?.usd ? parseFloat(inkPair.liquidity.usd) : null,
              source: 'dexscreener',
            };
            inkPriceCache.set(lowerAddr, { data: result, timestamp: Date.now() });
            return res.json(result);
          }
        }
      } catch (e) {
        console.log('DEXScreener lookup failed for INK token');
      }

      // Fallback: use quoter if available
      if (INK_QUOTER_V2) {
        try {
          const provider = new ethers.JsonRpcProvider(INK_RPC_URL);
          const QUOTER_ABI = ["function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"];
          const tokenContract = new ethers.Contract(lowerAddr, ['function decimals() view returns (uint8)', 'function symbol() view returns (string)', 'function name() view returns (string)'], provider);
          let decimals = 18, symbol = '', name = '';
          try {
            [decimals, symbol, name] = await Promise.all([tokenContract.decimals(), tokenContract.symbol(), tokenContract.name()]);
          } catch {}

          const quoter = new ethers.Contract(INK_QUOTER_V2, QUOTER_ABI, provider);
          const oneToken = ethers.parseUnits("1", decimals);
          const feeTiers = [3000, 10000, 500, 100];
          let wethOut: bigint | null = null;

          for (const fee of feeTiers) {
            try {
              const result = await quoter.quoteExactInputSingle.staticCall({ tokenIn: lowerAddr, tokenOut: INK_WETH, amountIn: oneToken, fee, sqrtPriceLimitX96: BigInt(0) });
              wethOut = result[0];
              if (wethOut && wethOut > BigInt(0)) break;
            } catch {}
          }

          if (wethOut && wethOut > BigInt(0)) {
            const wethAmount = parseFloat(ethers.formatEther(wethOut));
            let ethPriceUsd = 0;
            try {
              const ep = await fetch('http://localhost:5000/api/eth-price').then(r => r.json());
              ethPriceUsd = ep.price || 0;
            } catch {}
            if (ethPriceUsd > 0) {
              const result = { price: wethAmount * ethPriceUsd, symbol: symbol || '', name: name || '', priceChange24h: null, liquidity: null, source: 'ink-dex' };
              inkPriceCache.set(lowerAddr, { data: result, timestamp: Date.now() });
              return res.json(result);
            }
          }
        } catch (e: any) {
          console.log('INK quoter fallback failed:', e.message);
        }
      }

      return res.status(404).json({ error: "Token not found on INK DEX" });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch token price" });
    }
  });

  // INK swap quote/swap via LI.FI (Jumper aggregator — supports INK natively)
  const LIFI_API = 'https://li.quest/v1';
  const INK_CHAIN_ID_NUM = 57073;

  // LI.FI uses 0x0000... for native ETH, not 0xeeee...
  const LIFI_NATIVE_ETH = '0x0000000000000000000000000000000000000000';
  function toLifiToken(addr: string): string {
    return addr.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ? LIFI_NATIVE_ETH : addr;
  }

  async function getLifiQuote(fromToken: string, toToken: string, amountWei: string, fromAddress?: string) {
    const params = new URLSearchParams({
      fromChain: String(INK_CHAIN_ID_NUM),
      toChain: String(INK_CHAIN_ID_NUM),
      fromToken: toLifiToken(fromToken),
      toToken: toLifiToken(toToken),
      fromAmount: amountWei,
      slippage: '0.01',
      order: 'CHEAPEST',
      fromAddress: fromAddress || '0x0000000000000000000000000000000000000001',
    });

    const response = await fetch(`${LIFI_API}/quote?${params}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(errText || 'LI.FI API error');
    }
    return response.json();
  }

  app.post("/api/ink/quote", async (req, res) => {
    try {
      const { fromTokenAddress, toTokenAddress, amount, fromDecimals = 18, toDecimals = 18, fromAddress } = req.body;
      if (!fromTokenAddress || !toTokenAddress || !amount) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const amountInWei = ethers.parseUnits(amount.toString(), fromDecimals).toString();
      const cacheKey = `lifi-${fromTokenAddress}-${toTokenAddress}-${amountInWei}`;
      const cached = inkQuoteCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < QUOTE_CACHE_TTL) {
        return res.json(cached.data);
      }

      try {
        const lifi = await getLifiQuote(fromTokenAddress, toTokenAddress, amountInWei, fromAddress);
        const toAmount: string = lifi.estimate?.toAmount || '0';
        const toAmountMin: string = lifi.estimate?.toAmountMin || toAmount;

        if (!toAmount || toAmount === '0') {
          return res.status(400).json({ error: 'No liquidity available for this pair on INK' });
        }

        const amountOut = ethers.formatUnits(toAmount, toDecimals);
        const minAmountOut = ethers.formatUnits(toAmountMin, toDecimals);

        const responseData = {
          id: lifi.id || `ink-lifi-${Date.now()}`,
          estimate: {
            destinationTokenAmount: amountOut,
            destinationTokenMinAmount: minAmountOut,
            slippage: 1,
            priceImpact: lifi.estimate?.executionDuration ? null : null,
          },
          swap: {
            tokenIn: fromTokenAddress,
            tokenOut: toTokenAddress,
            amountIn: amountInWei,
            amountOutMinimum: toAmountMin,
            fee: 0,
            router: lifi.transactionRequest?.to || '',
            routeType: 'lifi' as const,
          },
        };

        inkQuoteCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
        return res.json(responseData);
      } catch (lifiErr: any) {
        console.error('LI.FI INK quote failed:', lifiErr.message);
        // If INK_QUOTER_V2 is set, try on-chain fallback
        if (!INK_QUOTER_V2) {
          return res.status(400).json({ error: `No route found on INK: ${lifiErr.message}` });
        }
        // On-chain fallback (when INK_QUOTER_V2 is configured)
        const tokenIn = fromTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ? INK_WETH : fromTokenAddress;
        const tokenOut = toTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ? INK_WETH : toTokenAddress;
        const amountInWei2 = ethers.parseUnits(amount.toString(), fromDecimals);
        const provider = new ethers.JsonRpcProvider(INK_RPC_URL, undefined, { batchMaxCount: 1 });
        const quoter = new ethers.Contract(INK_QUOTER_V2, [
          "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
        ], provider);
        let bestQuote: bigint | null = null;
        let bestFee = 3000;
        for (const fee of [3000, 10000, 500, 100]) {
          try {
            const r = await quoter.quoteExactInputSingle.staticCall({ tokenIn, tokenOut, amountIn: amountInWei2, fee, sqrtPriceLimitX96: 0 });
            if (!bestQuote || r[0] > bestQuote) { bestQuote = r[0]; bestFee = fee; }
          } catch {}
        }
        if (!bestQuote) return res.status(400).json({ error: 'No liquidity available on INK' });
        const amountOut = ethers.formatUnits(bestQuote, toDecimals);
        const minOut = ethers.formatUnits((bestQuote * BigInt(99)) / BigInt(100), toDecimals);
        return res.json({
          id: `ink-onchain-${Date.now()}`,
          estimate: { destinationTokenAmount: amountOut, destinationTokenMinAmount: minOut, slippage: 1 },
          swap: { tokenIn, tokenOut, amountIn: amountInWei2.toString(), amountOutMinimum: ((bestQuote * BigInt(99)) / BigInt(100)).toString(), fee: bestFee, router: INK_SWAP_ROUTER, routeType: 'single' },
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to get INK swap quote', message: error.message });
    }
  });

  // INK swap transaction data via LI.FI
  app.post("/api/ink/swap", async (req, res) => {
    try {
      const { fromTokenAddress, toTokenAddress, amount, fromAddress, fromDecimals = 18 } = req.body;
      if (!fromTokenAddress || !toTokenAddress || !amount || !fromAddress) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      const amountInWei = ethers.parseUnits(amount.toString(), fromDecimals).toString();
      const isNativeIn = fromTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

      try {
        const lifi = await getLifiQuote(fromTokenAddress, toTokenAddress, amountInWei, fromAddress);
        const txReq = lifi.transactionRequest;
        if (!txReq?.to || !txReq?.data) {
          return res.status(400).json({ error: 'No transaction available from LI.FI' });
        }
        return res.json({
          transaction: {
            to: txReq.to,
            data: txReq.data,
            value: txReq.value || '0x0',
            approvalAddress: isNativeIn ? undefined : (lifi.estimate?.approvalAddress || txReq.to),
          },
        });
      } catch (lifiErr: any) {
        console.error('LI.FI INK swap failed:', lifiErr.message);
        return res.status(400).json({ error: `Swap not available on INK: ${lifiErr.message}` });
      }
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to get INK swap data', message: error.message });
    }
  });

  // INK vault info
  app.get("/api/ink/limit-order/vault-info", async (req, res) => {
    try {
      const vaultAddress = process.env.INK_EXECUTOR_VAULT_ADDRESS;
      if (!vaultAddress) {
        return res.json({ configured: false, message: "INK vault not deployed yet" });
      }
      const provider = new ethers.JsonRpcProvider(INK_RPC_URL);
      const VAULT_ABI = ["function paused() external view returns (bool)"];
      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
      const isPaused = await vault.paused();
      res.json({ configured: true, vaultAddress, chainId: 57073, swapRouter: INK_SWAP_ROUTER, weth: INK_WETH, isPaused });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to get INK vault info" });
    }
  });

  // INK vault balance
  app.get("/api/ink/limit-order/balance", async (req, res) => {
    try {
      const { user, token } = req.query;
      if (!user || !token) return res.status(400).json({ error: "Missing user or token address" });
      const vaultAddress = process.env.INK_EXECUTOR_VAULT_ADDRESS;
      if (!vaultAddress) return res.json({ balance: "0" });
      const provider = new ethers.JsonRpcProvider(INK_RPC_URL);
      const VAULT_ABI = ["function balances(address user, address token) external view returns (uint256)"];
      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
      const balance = await vault.balances(user as string, token as string);
      res.json({ balance: balance.toString() });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to get INK vault balance" });
    }
  });

  // Create INK limit order
  app.post("/api/ink/limit-order/create", express.json(), async (req, res) => {
    try {
      const { tokenAddress, tokenSymbol, orderType, targetPrice, ethAmount, tokenAmount, totalValue, depositTxHash, walletAddress: reqWalletAddress, tokenDecimals = 18 } = req.body;
      const sessionUser = (req as any).session?.user;
      let userId = sessionUser?.id;
      let userWalletAddress = sessionUser?.walletAddress || reqWalletAddress;

      if (!userWalletAddress) return res.status(400).json({ error: "Wallet address required" });
      if (!depositTxHash) return res.status(400).json({ error: "Deposit transaction hash required" });

      if (!sessionUser) {
        try {
          const provider = new ethers.JsonRpcProvider(INK_RPC_URL);
          const tx = await provider.getTransaction(depositTxHash);
          if (!tx) return res.status(403).json({ error: "Deposit transaction not found on INK chain" });
          if (tx.from.toLowerCase() !== userWalletAddress.toLowerCase()) return res.status(403).json({ error: "Deposit transaction doesn't match wallet" });
        } catch (e) {
          return res.status(500).json({ error: "Failed to verify deposit transaction" });
        }
      }

      if (!userId) {
        const existingUser = await storage.getUserByWalletAddress(userWalletAddress);
        if (existingUser) {
          userId = existingUser.id;
        } else {
          const newUser = await storage.createUser({ walletAddress: userWalletAddress, username: `ink_${userWalletAddress.slice(0, 8)}` });
          userId = newUser.id;
        }
      }

      if (!tokenAddress || !tokenSymbol || !orderType || !targetPrice) return res.status(400).json({ error: "Missing required fields" });

      let actualTokenDecimals = tokenDecimals;
      try {
        const provider = new ethers.JsonRpcProvider(INK_RPC_URL);
        const tokenContract = new ethers.Contract(tokenAddress, ["function decimals() view returns (uint8)"], provider);
        actualTokenDecimals = Number(await tokenContract.decimals());
      } catch {}

      const vaultAddress = process.env.INK_EXECUTOR_VAULT_ADDRESS;
      if (!vaultAddress) return res.status(400).json({ error: "INK vault not configured" });

      const salt = ethers.hexlify(ethers.randomBytes(32));
      const orderHash = ethers.keccak256(ethers.solidityPacked(
        ['address', 'address', 'string', 'string', 'bytes32'],
        [userWalletAddress, tokenAddress, orderType, targetPrice, salt]
      ));

      const makerToken = orderType === 'buy' ? INK_WETH : tokenAddress;
      const takerToken = orderType === 'buy' ? tokenAddress : INK_WETH;
      const makerAmount = orderType === 'buy'
        ? ethers.parseEther(ethAmount || "0").toString()
        : ethers.parseUnits(tokenAmount || "0", actualTokenDecimals).toString();
      const takerAmount = orderType === 'buy'
        ? ethers.parseUnits(tokenAmount || "0", actualTokenDecimals).toString()
        : ethers.parseEther(ethAmount || "0").toString();
      const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      const order = await storage.createLimitOrder({
        userId,
        userWalletAddress,
        tokenAddress,
        tokenSymbol,
        orderType,
        targetPrice,
        ethAmount: ethAmount || "0",
        tokenAmount: tokenAmount || "0",
        totalValue: totalValue || "0",
        chain: 'ink',
        vaultVersion: 'v3',
        vaultAddress,
        signature: depositTxHash || "pending",
        salt,
        orderHash,
        makerAmount,
        takerAmount,
        makerToken,
        takerToken,
        expiry,
        orderJson: JSON.stringify({ orderType, targetPrice, tokenAddress, chain: 'ink' }),
      });

      await storage.updateLimitOrder(order.id, { status: 'fillable' });
      console.log(`🖊️ INK limit order created: ${orderType} ${tokenSymbol} @ $${targetPrice}`);
      res.json({ success: true, order });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to create INK order" });
    }
  });

  // Get INK limit orders
  app.get("/api/ink/limit-order/orders", async (req, res) => {
    try {
      const { userId, wallet, walletAddress } = req.query;
      const walletParam = (wallet || walletAddress) as string | undefined;
      if (!userId && !walletParam) return res.status(400).json({ error: "Missing userId or walletAddress" });
      const allOrders = await storage.getAllLimitOrders();
      const inkOrders = allOrders.filter(order =>
        order.chain === 'ink' &&
        (order.userId === userId || order.userWalletAddress?.toLowerCase() === walletParam?.toLowerCase())
      );
      res.json({ orders: inkOrders });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch INK orders" });
    }
  });

  // Cancel INK limit order
  app.post("/api/ink/limit-order/cancel", express.json(), async (req, res) => {
    try {
      const sessionUser = (req as any).session?.user;
      const { orderId, walletAddress: reqWallet } = req.body;
      if (!orderId) return res.status(400).json({ error: "Missing orderId" });

      const order = await storage.getLimitOrder(orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      const callerWallet = sessionUser?.walletAddress || reqWallet;
      const callerUserId = sessionUser?.id;
      const isOwnerBySession = callerUserId && order.userId === callerUserId;
      const isOwnerByWallet = callerWallet && order.userWalletAddress?.toLowerCase() === callerWallet.toLowerCase();

      if (!isOwnerBySession && !isOwnerByWallet) return res.status(403).json({ error: "You can only cancel your own orders" });

      if (isOwnerByWallet && !isOwnerBySession) {
        const depositTxHash = order.signature;
        if (!depositTxHash || depositTxHash === 'pending') return res.status(403).json({ error: "Cannot verify wallet ownership" });
        try {
          const provider = new ethers.JsonRpcProvider(INK_RPC_URL);
          const tx = await provider.getTransaction(depositTxHash);
          if (!tx || tx.from.toLowerCase() !== callerWallet.toLowerCase()) return res.status(403).json({ error: "Wallet verification failed" });
        } catch {
          return res.status(500).json({ error: "Failed to verify wallet ownership" });
        }
      }

      if (order.chain !== 'ink') return res.status(400).json({ error: "Not an INK order" });
      if (order.status === 'filled' || order.status === 'cancelled') return res.status(400).json({ error: `Order already ${order.status}` });

      await storage.updateLimitOrder(orderId, { status: 'cancelled' });

      let withdrawalResult = null;
      try {
        const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
        const vaultAddress = process.env.INK_EXECUTOR_VAULT_ADDRESS;
        if (deployerKey && vaultAddress && order.userWalletAddress && order.makerToken) {
          const provider = new ethers.JsonRpcProvider(INK_RPC_URL);
          const VAULT_ABI = ["function balances(address user, address token) external view returns (uint256)", "function executorWithdraw(address user, address token, uint256 amount) external"];
          const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
          const balance = await vault.balances(order.userWalletAddress, order.makerToken);
          if (balance > BigInt(0)) {
            const executorWallet = new ethers.Wallet(deployerKey, provider);
            const vaultWithSigner = new ethers.Contract(vaultAddress, VAULT_ABI, executorWallet);
            const feeData = await provider.getFeeData();
            const gasOpts: any = {};
            if (feeData.maxFeePerGas) {
              gasOpts.maxFeePerGas = (feeData.maxFeePerGas * BigInt(150)) / BigInt(100);
              gasOpts.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * BigInt(150)) / BigInt(100) : ethers.parseUnits('0.001', 'gwei');
            } else if (feeData.gasPrice) {
              gasOpts.gasPrice = (feeData.gasPrice * BigInt(150)) / BigInt(100);
            }
            const tx = await vaultWithSigner.executorWithdraw(order.userWalletAddress, order.makerToken, balance, gasOpts);
            const receipt = await tx.wait(1);
            withdrawalResult = { txHash: receipt.hash, amount: ethers.formatEther(balance) };
          }
        }
      } catch (withdrawError: any) {
        console.warn(`⚠️ INK auto-withdrawal failed:`, withdrawError.message);
      }

      res.json({ success: true, withdrawal: withdrawalResult });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to cancel INK order" });
    }
  });

  // Withdraw from INK vault
  app.post("/api/ink/limit-order/withdraw", express.json(), async (req, res) => {
    try {
      const { walletAddress: reqWallet, tokenAddress } = req.body;
      const sessionUser = (req as any).session?.user;
      const userWallet = sessionUser?.walletAddress || reqWallet;

      if (!userWallet) return res.status(400).json({ error: "Wallet address required" });
      if (!tokenAddress) return res.status(400).json({ error: "Token address required" });

      const vaultAddress = process.env.INK_EXECUTOR_VAULT_ADDRESS;
      if (!vaultAddress) return res.status(400).json({ error: "INK vault not configured" });

      const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
      if (!deployerKey) return res.status(500).json({ error: "Executor wallet not configured" });

      const provider = new ethers.JsonRpcProvider(INK_RPC_URL);
      const VAULT_ABI = ["function balances(address user, address token) external view returns (uint256)", "function executorWithdraw(address user, address token, uint256 amount) external"];
      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);

      const balance = await vault.balances(userWallet, tokenAddress);
      if (balance === BigInt(0)) return res.status(400).json({ error: "No balance to withdraw" });

      const executorWallet = new ethers.Wallet(deployerKey, provider);
      const vaultWithSigner = new ethers.Contract(vaultAddress, VAULT_ABI, executorWallet);

      const feeData = await provider.getFeeData();
      const gasOpts: any = {};
      if (feeData.maxFeePerGas) {
        const boostedMaxFee = (feeData.maxFeePerGas * BigInt(150)) / BigInt(100);
        let boostedPriority = feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * BigInt(150)) / BigInt(100) : ethers.parseUnits('0.001', 'gwei');
        if (boostedPriority > boostedMaxFee) boostedPriority = boostedMaxFee;
        gasOpts.maxFeePerGas = boostedMaxFee;
        gasOpts.maxPriorityFeePerGas = boostedPriority;
      } else if (feeData.gasPrice) {
        gasOpts.gasPrice = (feeData.gasPrice * BigInt(150)) / BigInt(100);
      }

      const tx = await vaultWithSigner.executorWithdraw(userWallet, tokenAddress, balance, gasOpts);
      const receipt = await tx.wait(1);

      res.json({ success: true, txHash: receipt.hash, amount: balance.toString(), formattedAmount: ethers.formatEther(balance) });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to withdraw from INK vault" });
    }
  });

  // ============== END INK NETWORK ROUTES ==============

  // ============== BASENAME RESOLUTION ==============

  app.get("/api/basename/:address", async (req, res) => {
    const { address } = req.params;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }
    try {
      // Try ethers ENS reverse lookup on Base mainnet
      const { ethers } = await import("ethers");
      const baseRpc = process.env.BASE_RPC_URL || "https://mainnet.base.org";
      const provider = new ethers.JsonRpcProvider(baseRpc);

      // L2 Reverse Registrar ABI (getName)
      const reverseRegistrar = new ethers.Contract(
        "0x79EA96012eEa67A83431F1701B3dFf7e37F9E282",
        ["function getName(address addr) view returns (string)"],
        provider
      );

      let basename: string | null = null;
      try {
        const name = await Promise.race([
          reverseRegistrar.getName(address),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000))
        ]);
        if (name && typeof name === "string" && name.length > 0) {
          basename = name;
        }
      } catch {
        // No Basename registered or timeout
      }

      res.json({ address, basename });
    } catch (error: any) {
      res.json({ address, basename: null });
    }
  });

  // ============== END BASENAME RESOLUTION ==============

  // ============== AGENT HUB ROUTES ==============

  // Get all agents (marketplace)
  app.get("/api/agents", async (_req, res) => {
    try {
      const agents = await storage.getAllMemeAgents();
      res.json(agents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // On-chain registration status check (reads official ERC-8004 IdentityRegistry on Base mainnet)
  app.get("/api/agents/onchain-check/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return res.status(400).json({ error: "Invalid address" });
      }

      const { ethers } = await import("ethers");
      const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || "https://mainnet.base.org");

      // Official ERC-8004 IdentityRegistry on Base mainnet
      const OFFICIAL_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
      const ABI = [
        "function balanceOf(address owner) external view returns (uint256)",
        "function tokenURI(uint256 tokenId) external view returns (string)",
        "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
        "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
      ];
      const contract = new ethers.Contract(OFFICIAL_REGISTRY, ABI, provider);

      // Get agent count
      const balance = await contract.balanceOf(walletAddress).catch(() => BigInt(0));
      const onChainCount = Number(balance);

      // Get tokenIds via Registered events (owner indexed) using 9,000 block pages
      let tokenIds: number[] = [];
      if (onChainCount > 0) {
        try {
          const currentBlock = await provider.getBlockNumber();
          // ERC-8004 IdentityRegistry deployed around block ~25,000,000 on Base
          const DEPLOY_BLOCK = 25_000_000;
          const PAGE_SIZE = 9000;
          const seen = new Set<number>();

          // Scan backwards from current block until we find all tokens for this wallet
          let toBlock = currentBlock;
          let pagesScanned = 0;
          const MAX_PAGES = 30; // ~270,000 blocks ≈ ~1 week on Base

          while (tokenIds.length < onChainCount && pagesScanned < MAX_PAGES && toBlock > DEPLOY_BLOCK) {
            const fromBlock = Math.max(DEPLOY_BLOCK, toBlock - PAGE_SIZE + 1);
            const registeredFilter = contract.filters.Registered(null, null, walletAddress);
            const events = await contract.queryFilter(registeredFilter, fromBlock, toBlock).catch(() => []);
            for (const ev of events) {
              const args = (ev as any).args;
              if (args?.agentId !== undefined) {
                const id = Number(args.agentId);
                if (!seen.has(id)) { seen.add(id); tokenIds.unshift(id); }
              }
            }
            toBlock = fromBlock - 1;
            pagesScanned++;
          }

          // If Registered events not found (no events yet), fall back to Transfer mint events
          if (tokenIds.length === 0) {
            toBlock = currentBlock;
            pagesScanned = 0;
            const mintFilter = contract.filters.Transfer("0x0000000000000000000000000000000000000000", walletAddress);
            while (tokenIds.length < onChainCount && pagesScanned < MAX_PAGES && toBlock > DEPLOY_BLOCK) {
              const fromBlock = Math.max(DEPLOY_BLOCK, toBlock - PAGE_SIZE + 1);
              const events = await contract.queryFilter(mintFilter, fromBlock, toBlock).catch(() => []);
              for (const ev of events) {
                const args = (ev as any).args;
                if (args?.tokenId !== undefined) {
                  const id = Number(args.tokenId);
                  if (!seen.has(id)) { seen.add(id); tokenIds.unshift(id); }
                }
              }
              toBlock = fromBlock - 1;
              pagesScanned++;
            }
          }
        } catch (evErr) {
          console.warn("ERC-8004 event query failed:", (evErr as any).message);
        }
      }

      // Fetch agentURI for each token and parse name
      const onChainAgents = await Promise.all(
        tokenIds.slice(0, 10).map(async (tokenId: number) => {
          try {
            const uri = await contract.tokenURI(tokenId).catch(() => "");
            let name: string | undefined;
            let description: string | undefined;
            let agentURI = uri;

            if (uri.startsWith("data:application/json;base64,")) {
              try {
                const json = JSON.parse(atob(uri.replace("data:application/json;base64,", "")));
                name = json.name;
                description = json.description;
              } catch { /* ignore */ }
            } else if (uri.startsWith("http")) {
              try {
                const r = await fetch(uri, { signal: AbortSignal.timeout(3000) });
                const json = await r.json();
                name = json.name;
                description = json.description;
              } catch { /* ignore */ }
            }

            return { agentId: String(tokenId), name, description, agentURI, scan8004Url: `https://8004scan.io/agents/base/${tokenId}` };
          } catch {
            return { agentId: String(tokenId), scan8004Url: `https://8004scan.io/agents/base/${tokenId}` };
          }
        })
      );

      // Compare with DB — accept both numeric IDs and legacy bytes32
      const dbAgents = await storage.getMemeAgentsByWallet(walletAddress);
      const dbOnChainIds = new Set(
        dbAgents
          .filter(a => a.agentId && (
            (/^\d+$/.test(a.agentId) && parseInt(a.agentId) > 0) ||
            (a.agentId.startsWith("0x") && a.agentId.length === 66)
          ))
          .map(a => a.agentId)
      );
      const missingFromDb = tokenIds
        .map(id => String(id))
        .filter(id => !dbOnChainIds.has(id));

      res.json({
        onChainCount,
        onChainAgents,
        dbCount: dbAgents.length,
        dbSynced: missingFromDb.length === 0,
        missingFromDb,
        contractAddress: OFFICIAL_REGISTRY,
        explorerUrl: `https://basescan.org/address/${OFFICIAL_REGISTRY}`,
        scan8004Url: `https://8004scan.io/agents?search=${walletAddress}`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get most-recent agent by wallet (backward compat)
  app.get("/api/agents/wallet/:walletAddress", async (req, res) => {
    try {
      const agent = await storage.getMemeAgentByWallet(req.params.walletAddress);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      res.json(agent);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get ALL agents for a wallet (multi-agent V2)
  app.get("/api/agents/wallet/:walletAddress/all", async (req, res) => {
    try {
      const agents = await storage.getMemeAgentsByWallet(req.params.walletAddress);
      res.json(agents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create agent (ERC-8004 on-chain registration — multi-agent, no 409 block)
  app.post("/api/agents", express.json(), async (req, res) => {
    try {
      const { name, personality, bio, userId, walletAddress, agentId, registrationTxHash, metadataUri } = req.body;
      if (!name || !walletAddress || !userId) {
        return res.status(400).json({ error: "name, walletAddress and userId are required" });
      }

      // Prefer on-chain agentId (bytes32 from contract), fall back to generated hash
      let finalAgentId = agentId;
      if (!finalAgentId) {
        const { createHash } = await import("crypto");
        finalAgentId = "0x" + createHash("sha256")
          .update(walletAddress.toLowerCase() + name + Date.now())
          .digest("hex")
          .slice(0, 40);
      }

      const agent = await storage.createMemeAgent({
        name,
        personality: personality || "analyst",
        bio,
        userId,
        walletAddress,
        agentId: finalAgentId,
        registrationTxHash: registrationTxHash || null,
        metadataUri: metadataUri || null,
        isActive: true,
      });
      res.json(agent);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update agent profile fields only. Reputation/boost/endorsement counters are
  // intentionally NOT patchable here — those are earned via paid x402 actions.
  app.patch("/api/agents/:id", express.json(), async (req, res) => {
    try {
      const allowed: Partial<{ name: string; bio: string; personality: string; isActive: boolean; metadataUri: string }> = {};
      if (typeof req.body?.name === "string") allowed.name = req.body.name;
      if (typeof req.body?.bio === "string") allowed.bio = req.body.bio;
      if (typeof req.body?.personality === "string") allowed.personality = req.body.personality;
      if (typeof req.body?.isActive === "boolean") allowed.isActive = req.body.isActive;
      if (typeof req.body?.metadataUri === "string") allowed.metadataUri = req.body.metadataUri;

      if (Object.keys(allowed).length === 0) {
        return res.status(400).json({ error: "No updatable fields provided" });
      }

      const updated = await storage.updateMemeAgent(req.params.id, allowed);
      if (!updated) return res.status(404).json({ error: "Agent not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== x402 Agent Actions (real on-chain USDC micropayments) =====

  // Boost an agent: featured placement (7 days) + reputation bump. Requires x402 payment.
  app.post("/api/agents/:id/boost", express.json(), createX402Middleware("AGENT_BOOST", storage), async (req, res) => {
    try {
      const agent = await storage.getMemeAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      // Only the agent owner (the wallet that paid) may boost their own agent
      const payer = req.x402Payment?.payer;
      if (!payer || payer.toLowerCase() !== agent.walletAddress.toLowerCase()) {
        return res.status(403).json({ error: "You can only boost your own agent" });
      }

      const boostedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days
      const updated = await storage.updateMemeAgent(agent.id, {
        boostedUntil,
        reputationScore: (agent.reputationScore || 0) + 10,
      });

      res.json({
        success: true,
        action: "boost",
        agent: updated,
        boostedUntil: boostedUntil.toISOString(),
        payer: req.x402Payment?.payer,
        amount: req.x402Payment?.amount,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Endorse another agent: raises the target agent's reputation. Requires x402 payment.
  app.post("/api/agents/:id/endorse", express.json(), createX402Middleware("AGENT_ENDORSE", storage), async (req, res) => {
    try {
      const agent = await storage.getMemeAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      // Cannot endorse your own agent
      const payer = req.x402Payment?.payer;
      if (payer && payer.toLowerCase() === agent.walletAddress.toLowerCase()) {
        return res.status(403).json({ error: "You cannot endorse your own agent" });
      }

      const updated = await storage.updateMemeAgent(agent.id, {
        totalEndorsements: (agent.totalEndorsements || 0) + 1,
        reputationScore: (agent.reputationScore || 0) + 5,
      });

      res.json({
        success: true,
        action: "endorse",
        agent: updated,
        payer: req.x402Payment?.payer,
        amount: req.x402Payment?.amount,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // AI trade signal: computes a momentum signal from real DEXScreener market data. Requires x402 payment.
  app.post("/api/trade/ai", express.json(), createX402Middleware("AI_TRADING_API", storage), async (req, res) => {
    try {
      const symbol = String(req.body?.symbol || "").trim();
      if (!symbol) return res.status(400).json({ error: "symbol is required" });

      const resp = await fetch(`https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(symbol)}`);
      if (!resp.ok) {
        return res.status(502).json({ error: "Failed to fetch market data" });
      }
      const data: any = await resp.json();
      const pairs: any[] = Array.isArray(data?.pairs) ? data.pairs : [];
      const basePairs = pairs.filter((p) => p?.chainId === "base" && p?.liquidity?.usd);
      const pool = (basePairs.length ? basePairs : pairs).sort(
        (a, b) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0)
      );
      const pair = pool[0];
      if (!pair) {
        return res.status(404).json({ error: `No market found for "${symbol}"` });
      }

      const ch = pair.priceChange || {};
      const h1 = Number(ch.h1 ?? 0);
      const h6 = Number(ch.h6 ?? 0);
      const h24 = Number(ch.h24 ?? 0);
      const momentum = h1 * 0.5 + h6 * 0.3 + h24 * 0.2;

      let signal: "BUY" | "SELL" | "HOLD" = "HOLD";
      if (momentum > 3) signal = "BUY";
      else if (momentum < -3) signal = "SELL";
      const confidence = Math.min(100, Math.round(Math.abs(momentum) * 8));

      res.json({
        success: true,
        action: "ai_signal",
        symbol: pair.baseToken?.symbol || symbol.toUpperCase(),
        name: pair.baseToken?.name || null,
        priceUsd: pair.priceUsd || null,
        chain: pair.chainId,
        liquidityUsd: pair.liquidity?.usd ?? null,
        volume24hUsd: pair.volume?.h24 ?? null,
        priceChange: { h1, h6, h24 },
        signal,
        confidence,
        momentum: Number(momentum.toFixed(2)),
        dexScreenerUrl: pair.url || null,
        payer: req.x402Payment?.payer,
        amount: req.x402Payment?.amount,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get service requests for an agent
  app.get("/api/agent-requests/:agentId", async (req, res) => {
    try {
      const requests = await storage.getAgentServiceRequestsByAgent(req.params.agentId);
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create service request (with optional on-chain anchor)
  app.post("/api/agent-requests", express.json(), async (req, res) => {
    try {
      const { fromAgentId, toAgentId, requestType, description, budget, budgetToken, onChainRequestId, txHash } = req.body;
      if (!fromAgentId || !toAgentId || !description) {
        return res.status(400).json({ error: "fromAgentId, toAgentId and description are required" });
      }
      const request = await storage.createAgentServiceRequest({
        fromAgentId, toAgentId,
        requestType: requestType || "shill",
        description,
        budget: budget || "0",
        budgetToken: budgetToken || "USDC",
        onChainRequestId: onChainRequestId || null,
        txHash: txHash || null,
      });
      // Bump reputation of receiving agent slightly for engagement (if not already done on-chain)
      if (!onChainRequestId) {
        const toAgent = await storage.getMemeAgent(toAgentId);
        if (toAgent) {
          await storage.updateMemeAgent(toAgentId, { reputationScore: (toAgent.reputationScore || 0) + 2 });
        }
      }
      res.json(request);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update request status (accept/reject/complete)
  app.patch("/api/agent-requests/:id", express.json(), async (req, res) => {
    try {
      const updated = await storage.updateAgentServiceRequest(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Request not found" });
      // If completed, boost agent reputation and service count
      if (updated.status === "completed") {
        const agent = await storage.getMemeAgent(updated.toAgentId);
        if (agent) {
          await storage.updateMemeAgent(updated.toAgentId, {
            reputationScore: (agent.reputationScore || 0) + 10,
            totalServicesDone: (agent.totalServicesDone || 0) + 1,
          });
        }
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============== END AGENT HUB ROUTES ==============

  // ============== MEMETIC FRACTIONS ROUTES ==============

  // Seed default collections if none exist
  async function ensureFractionCollections() {
    const existing = await storage.getAllFractionCollections();
    if (existing.length > 0) return;
    const defaults = [
      { name: "BasedPepe", symbol: "BPEPE", description: "The OG of meme culture, now fully fractional on Base.", imageGradient: "from-green-400 to-emerald-600", emoji: "🐸", pricePerFraction: "0.000001" },
      { name: "WojakGains", symbol: "WJAK", description: "We're all gonna make it — one fraction at a time.", imageGradient: "from-blue-400 to-indigo-600", emoji: "📈", pricePerFraction: "0.0000008" },
      { name: "ChillGuy", symbol: "CHILL", description: "Just a chill guy, holding fractions and vibing on Base.", imageGradient: "from-cyan-400 to-sky-600", emoji: "😎", pricePerFraction: "0.0000005" },
      { name: "PepeRocket", symbol: "PROCK", description: "Strap in — this frog is going to the moon in fractions.", imageGradient: "from-orange-400 to-red-600", emoji: "🚀", pricePerFraction: "0.0000015" },
      { name: "DogeMem", symbol: "DMEM", description: "Much fraction. Very divisible. Wow.", imageGradient: "from-yellow-400 to-amber-600", emoji: "🐕", pricePerFraction: "0.0000006" },
    ];
    for (const col of defaults) {
      await storage.createFractionCollection(col);
    }
  }
  ensureFractionCollections().catch(console.error);

  // ── Upload image for fraction collection ────────────────────────────────────
  app.post("/api/fractions/upload-image", express.json({ limit: "5mb" }), async (req, res) => {
    try {
      const { base64, filename } = req.body;
      if (!base64 || !filename) return res.status(400).json({ error: "Missing base64 or filename" });

      const ext = filename.split(".").pop()?.toLowerCase() ?? "png";
      const allowed = ["png", "jpg", "jpeg", "gif", "webp"];
      if (!allowed.includes(ext)) return res.status(400).json({ error: "Only PNG, JPG, GIF, WEBP allowed" });

      if (process.env.VERCEL) {
        const { uploadFractionBlob } = await import("./persistence/fractionUploads");
        const { randomUUID } = await import("node:crypto");
        const data = base64.replace(/^data:[^;]+;base64,/, "");
        const url = await uploadFractionBlob(
          `${randomUUID()}.${ext}`,
          Buffer.from(data, "base64"),
          `image/${ext === "jpg" ? "jpeg" : ext}`,
        );
        return res.json({ success: true, url });
      }

      const { default: fs } = await import("fs");
      const { default: path } = await import("path");
      const { default: crypto } = await import("crypto");

      const uploadDir = path.join(process.cwd(), "public", "uploads", "fractions");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

      const id = crypto.randomBytes(12).toString("hex");
      const destFile = `${id}.${ext}`;
      const destPath = path.join(uploadDir, destFile);

      const data = base64.replace(/^data:[^;]+;base64,/, "");
      fs.writeFileSync(destPath, Buffer.from(data, "base64"));

      const url = `/uploads/fractions/${destFile}`;
      res.json({ success: true, url });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Create a new fraction collection (any user, ETH fee required) ──────────
  app.post("/api/fractions/collections/create", express.json(), async (req, res) => {
    try {
      const { walletAddress, name, symbol, description, emoji, imageGradient, imageUrl, pricePerFraction, totalSupply, txHash } = req.body;

      // Basic validation
      if (!walletAddress || !name || !symbol || !emoji || !imageGradient || !pricePerFraction || !txHash) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) return res.status(400).json({ error: "Invalid wallet address" });
      if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return res.status(400).json({ error: "Valid txHash required — creation fee must be paid on Base mainnet first" });
      }
      if (name.length > 50) return res.status(400).json({ error: "Name too long (max 50 chars)" });
      if (symbol.length > 10) return res.status(400).json({ error: "Symbol too long (max 10 chars)" });

      const supply = Math.min(Math.max(parseInt(totalSupply) || 1_000_000, 100_000), 100_000_000);
      const price = parseFloat(pricePerFraction);
      if (isNaN(price) || price < 0.0000001 || price > 1) {
        return res.status(400).json({ error: "Price per fraction must be between 0.0000001 and 1 ETH" });
      }

      // ── Verify creation fee tx on Base mainnet ─────────────────────────────
      const TREASURY = "0x8988C455f0cf4D3167c32B9D65B09130454536ac";
      const CREATION_FEE_WEI = BigInt("500000000000000"); // 0.0005 ETH
      const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
      try {
        const { JsonRpcProvider } = await import("ethers");
        const provider = new JsonRpcProvider(BASE_RPC);
        const tx = await provider.getTransaction(txHash);
        if (!tx) return res.status(400).json({ error: "Transaction not found on Base mainnet." });
        if (tx.from.toLowerCase() !== walletAddress.toLowerCase()) {
          return res.status(400).json({ error: "Transaction sender does not match wallet address" });
        }
        if (!tx.to || tx.to.toLowerCase() !== TREASURY.toLowerCase()) {
          return res.status(400).json({ error: "Transaction must be sent to BasedMem treasury" });
        }
        const minFee = (CREATION_FEE_WEI * 90n) / 100n;
        if (tx.value < minFee) {
          return res.status(400).json({ error: "Creation fee too low. Minimum 0.0005 ETH required." });
        }
      } catch (verifyErr: any) {
        if (verifyErr.message?.includes("sender") || verifyErr.message?.includes("treasury") || verifyErr.message?.includes("fee")) {
          return res.status(400).json({ error: verifyErr.message });
        }
        console.error("⚠️ Collection creation tx verification RPC error (non-fatal):", verifyErr.message);
      }

      // Check for duplicate txHash (prevent double-spend)
      const existing = await storage.getAllFractionCollections();
      if (existing.some((c: any) => c.creationTxHash === txHash)) {
        return res.status(400).json({ error: "This transaction has already been used to create a collection" });
      }

      const collection = await storage.createFractionCollection({
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description: description?.trim() || null,
        emoji,
        imageGradient,
        imageUrl: imageUrl || null,
        pricePerFraction: price.toFixed(8),
        totalSupply: supply,
        isActive: true,
        creatorWalletAddress: walletAddress,
        creationTxHash: txHash,
      } as any);

      console.log(`✅ New fraction collection created: ${collection.name} (${collection.symbol}) by ${walletAddress}`);
      res.json({ success: true, collection });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/fractions/collections", async (_req, res) => {
    try {
      const cols = await storage.getAllFractionCollections();
      res.json(cols);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/fractions/collections/:id", async (req, res) => {
    try {
      const col = await storage.getFractionCollection(req.params.id);
      if (!col) return res.status(404).json({ error: "Not found" });
      res.json(col);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/fractions/holdings/:walletAddress", async (req, res) => {
    try {
      const { walletAddress } = req.params;
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) return res.status(400).json({ error: "Invalid address" });
      const holdings = await storage.getFractionHoldingsByWallet(walletAddress);
      res.json(holdings);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/fractions/buy", express.json(), async (req, res) => {
    try {
      const { walletAddress, collectionId, amount, txHash } = req.body;
      if (!walletAddress || !collectionId || !amount || amount <= 0) {
        return res.status(400).json({ error: "walletAddress, collectionId, and amount are required" });
      }
      if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return res.status(400).json({ error: "Valid txHash is required — transaction must be submitted on Base mainnet first" });
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) return res.status(400).json({ error: "Invalid address" });

      const col = await storage.getFractionCollection(collectionId);
      if (!col) return res.status(404).json({ error: "Collection not found" });

      const remaining = col.totalSupply - col.fractionsCirculating;
      if (amount > remaining) return res.status(400).json({ error: "Not enough fractions available" });

      // ── Verify on-chain transaction on Base mainnet ──────────────────────
      const TREASURY = "0x8988C455f0cf4D3167c32B9D65B09130454536ac";
      const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
      try {
        const { JsonRpcProvider, formatEther } = await import("ethers");
        const provider = new JsonRpcProvider(BASE_RPC);
        const tx = await provider.getTransaction(txHash);
        if (!tx) return res.status(400).json({ error: "Transaction not found on Base mainnet. Please wait for it to be indexed." });
        if (tx.from.toLowerCase() !== walletAddress.toLowerCase()) {
          return res.status(400).json({ error: "Transaction sender does not match wallet address" });
        }
        if (!tx.to || tx.to.toLowerCase() !== TREASURY.toLowerCase()) {
          return res.status(400).json({ error: "Transaction recipient is not the BasedMem treasury" });
        }
        // Verify ETH value: at least 95% of expected (allow minor rounding)
        const expectedWei = BigInt(Math.floor(Number(col.pricePerFraction) * amount * 1e18));
        const minWei = (expectedWei * 95n) / 100n;
        if (tx.value < minWei) {
          return res.status(400).json({
            error: `Insufficient ETH sent. Expected ~${formatEther(expectedWei)} ETH, got ${formatEther(tx.value)} ETH.`
          });
        }
      } catch (verifyErr: any) {
        if (verifyErr.message?.includes("Insufficient") || verifyErr.message?.includes("sender") || verifyErr.message?.includes("recipient")) {
          return res.status(400).json({ error: verifyErr.message });
        }
        // RPC errors are non-fatal — log and continue
        console.error("⚠️ Fractions tx verification RPC error (non-fatal):", verifyErr.message);
      }

      // Record the purchase
      const holding = await storage.getFractionHolding(walletAddress, collectionId);
      const isNew = !holding;
      const updated = await storage.upsertFractionHolding(walletAddress, collectionId, amount);

      await storage.updateFractionCollection(collectionId, {
        fractionsCirculating: col.fractionsCirculating + amount,
        holderCount: isNew ? col.holderCount + 1 : col.holderCount,
      });

      res.json({ success: true, holding: updated });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/fractions/gamble", express.json(), async (req, res) => {
    try {
      const { walletAddress, holdingId, gamblingAmount, txHash } = req.body;
      if (!walletAddress || !holdingId) return res.status(400).json({ error: "walletAddress and holdingId required" });
      if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return res.status(400).json({ error: "Valid txHash is required — gamble fee transaction must be submitted on Base mainnet first" });
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) return res.status(400).json({ error: "Invalid address" });

      // ── Verify gamble fee tx on Base mainnet ──────────────────────────────
      const TREASURY = "0x8988C455f0cf4D3167c32B9D65B09130454536ac";
      const GAMBLE_FEE_WEI = BigInt("100000000000000"); // 0.0001 ETH
      const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
      try {
        const { JsonRpcProvider } = await import("ethers");
        const provider = new JsonRpcProvider(BASE_RPC);
        const tx = await provider.getTransaction(txHash);
        if (!tx) return res.status(400).json({ error: "Transaction not found on Base mainnet." });
        if (tx.from.toLowerCase() !== walletAddress.toLowerCase()) {
          return res.status(400).json({ error: "Transaction sender does not match wallet address" });
        }
        if (!tx.to || tx.to.toLowerCase() !== TREASURY.toLowerCase()) {
          return res.status(400).json({ error: "Transaction recipient is not the BasedMem treasury" });
        }
        const minFee = (GAMBLE_FEE_WEI * 90n) / 100n; // allow 10% tolerance
        if (tx.value < minFee) {
          return res.status(400).json({ error: `Gamble fee too low. Minimum 0.0001 ETH required.` });
        }
      } catch (verifyErr: any) {
        if (verifyErr.message?.includes("sender") || verifyErr.message?.includes("recipient") || verifyErr.message?.includes("fee")) {
          return res.status(400).json({ error: verifyErr.message });
        }
        console.error("⚠️ Gamble tx verification RPC error (non-fatal):", verifyErr.message);
      }

      const spend = Math.max(100, Number(gamblingAmount) || 100);

      const holdings = await storage.getFractionHoldingsByWallet(walletAddress);
      const holding = holdings.find(h => h.id === holdingId);
      if (!holding) return res.status(404).json({ error: "Holding not found" });
      if (holding.fractionAmount < spend) return res.status(400).json({ error: `Need at least ${spend} fractions to gamble` });

      // Roll new rarity: weighted random — keeps it exciting
      const roll = Math.random();
      let newRarity: number;
      if (roll < 0.05) newRarity = Math.floor(Math.random() * 5) + 96;       // 5% legendary (96-100)
      else if (roll < 0.15) newRarity = Math.floor(Math.random() * 15) + 81; // 10% epic (81-95)
      else if (roll < 0.40) newRarity = Math.floor(Math.random() * 20) + 61; // 25% rare (61-80)
      else if (roll < 0.75) newRarity = Math.floor(Math.random() * 25) + 36; // 35% uncommon (36-60)
      else newRarity = Math.floor(Math.random() * 35) + 1;                   // 35% common (1-35)

      const updated = await storage.updateFractionHolding(holdingId, {
        fractionAmount: holding.fractionAmount - spend,
        rarityScore: newRarity,
        gamblesCount: holding.gamblesCount + 1,
        lastGambledAt: new Date(),
      });

      // Update circulating supply in collection
      const col = await storage.getFractionCollection(holding.collectionId);
      if (col) {
        await storage.updateFractionCollection(col.id, {
          fractionsCirculating: Math.max(0, col.fractionsCirculating - spend),
        });
      }

      const previousRarity = holding.rarityScore;
      const improved = newRarity > previousRarity;
      res.json({ success: true, holding: updated, newRarity, previousRarity, improved, spent: spend });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── P2P Fraction Listings ──────────────────────────────────────────────────

  // Create a listing (seller lists their fractions for sale)
  app.post("/api/fractions/listings", express.json(), async (req, res) => {
    try {
      const { walletAddress, collectionId, fractionAmount, pricePerFraction } = req.body;
      if (!walletAddress || !collectionId || !fractionAmount || !pricePerFraction) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const amount = parseInt(fractionAmount);
      const price = parseFloat(pricePerFraction);
      if (isNaN(amount) || amount < 1) return res.status(400).json({ error: "Invalid fraction amount" });
      if (isNaN(price) || price <= 0) return res.status(400).json({ error: "Invalid price" });

      // Check seller actually has enough fractions
      const holding = await storage.getFractionHolding(walletAddress, collectionId);
      if (!holding || holding.fractionAmount < amount) {
        return res.status(400).json({ error: `Insufficient fractions. You have ${holding?.fractionAmount ?? 0}` });
      }

      // Deduct from holding immediately (escrow in DB)
      await storage.updateFractionHolding(holding.id, {
        fractionAmount: holding.fractionAmount - amount,
      });

      const listing = await storage.createFractionListing({
        collectionId,
        sellerAddress: walletAddress,
        fractionAmount: amount,
        pricePerFraction: price.toFixed(8),
      });

      res.json({ success: true, listing });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Get active listings for a collection
  app.get("/api/fractions/listings/:collectionId", async (req, res) => {
    try {
      const listings = await storage.getFractionListingsByCollection(req.params.collectionId);
      res.json(listings);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Get my listings (all statuses)
  app.get("/api/fractions/my-listings/:walletAddress", async (req, res) => {
    try {
      const listings = await storage.getFractionListingsByWallet(req.params.walletAddress);
      res.json(listings);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Cancel a listing (return fractions to seller)
  app.delete("/api/fractions/listings/:id", express.json(), async (req, res) => {
    try {
      const { walletAddress } = req.body;
      const listing = await storage.getFractionListing(req.params.id);
      if (!listing) return res.status(404).json({ error: "Listing not found" });
      if (listing.sellerAddress.toLowerCase() !== walletAddress?.toLowerCase()) {
        return res.status(403).json({ error: "Not your listing" });
      }
      if (listing.status !== "active") return res.status(400).json({ error: "Listing is not active" });

      // Return fractions to seller
      await storage.upsertFractionHolding(listing.sellerAddress, listing.collectionId, listing.fractionAmount);
      await storage.updateFractionListing(listing.id, { status: "cancelled" });

      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Buy from a listing — buyer sends ETH directly to seller, we verify and transfer fractions
  app.post("/api/fractions/listings/:id/buy", express.json(), async (req, res) => {
    try {
      const { buyerAddress, txHash } = req.body;
      if (!buyerAddress || !txHash) return res.status(400).json({ error: "Missing buyerAddress or txHash" });
      if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) return res.status(400).json({ error: "Invalid txHash" });

      const listing = await storage.getFractionListing(req.params.id);
      if (!listing) return res.status(404).json({ error: "Listing not found" });
      if (listing.status !== "active") return res.status(400).json({ error: "Listing is no longer available" });
      if (listing.sellerAddress.toLowerCase() === buyerAddress.toLowerCase()) {
        return res.status(400).json({ error: "Cannot buy your own listing" });
      }

      const totalEth = parseFloat(listing.pricePerFraction) * listing.fractionAmount;
      const totalWei = BigInt(Math.floor(totalEth * 1e18));
      const minWei = (totalWei * 90n) / 100n;

      // Verify tx on Base mainnet
      const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
      try {
        const { JsonRpcProvider } = await import("ethers");
        const provider = new JsonRpcProvider(BASE_RPC);
        const tx = await provider.getTransaction(txHash);
        if (!tx) return res.status(400).json({ error: "Transaction not found on Base mainnet." });
        if (tx.from.toLowerCase() !== buyerAddress.toLowerCase()) {
          return res.status(400).json({ error: "Transaction sender does not match buyer address" });
        }
        if (!tx.to || tx.to.toLowerCase() !== listing.sellerAddress.toLowerCase()) {
          return res.status(400).json({ error: "Transaction must be sent to seller's wallet address" });
        }
        if (tx.value < minWei) {
          return res.status(400).json({ error: `Payment too low. Need at least ${totalEth.toFixed(6)} ETH` });
        }
      } catch (verifyErr: any) {
        if (verifyErr.message?.includes("sender") || verifyErr.message?.includes("seller") || verifyErr.message?.includes("Payment")) {
          return res.status(400).json({ error: verifyErr.message });
        }
        console.error("⚠️ Listing buy tx verification RPC error (non-fatal):", verifyErr.message);
      }

      // Check for duplicate txHash use
      const allListings = await storage.getFractionListingsByCollection(listing.collectionId);
      if (allListings.some((l: any) => l.saleTxHash === txHash)) {
        return res.status(400).json({ error: "This transaction has already been used" });
      }

      // Mark listing as filled
      await storage.updateFractionListing(listing.id, {
        status: "filled",
        buyerAddress: buyerAddress.toLowerCase(),
        saleTxHash: txHash,
      });

      // Transfer fractions to buyer
      await storage.upsertFractionHolding(buyerAddress, listing.collectionId, listing.fractionAmount);

      console.log(`✅ Fraction listing ${listing.id} filled: ${listing.fractionAmount} fractions → ${buyerAddress}`);
      res.json({ success: true, fractionAmount: listing.fractionAmount });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ============== END MEMETIC FRACTIONS ROUTES ==============

  // ── Agent Sessions (Connect Base Account) ────────────────────────────────
  app.post("/api/agent-sessions", express.json(), async (req, res) => {
    try {
      const { walletAddress, label } = req.body;
      if (!walletAddress) return res.status(400).json({ error: "walletAddress required" });
      const { randomUUID } = await import("crypto");
      const token = randomUUID();
      const session = await storage.createAgentSession({
        token,
        walletAddress: walletAddress.toLowerCase(),
        label: label || "My Agent Session",
        writeEnabled: false,
      });
      res.json(session);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/agent-sessions/:walletAddress", async (req, res) => {
    try {
      const sessions = await storage.getAgentSessionsByWallet(req.params.walletAddress.toLowerCase());
      res.json(sessions);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/agent-sessions/:token", express.json(), async (req, res) => {
    try {
      const { writeEnabled } = req.body;
      const session = await storage.updateAgentSession(req.params.token, { writeEnabled: !!writeEnabled });
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/agent-sessions/:token", async (req, res) => {
    try {
      const ok = await storage.deleteAgentSession(req.params.token);
      res.json({ success: ok });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Agent TX Proposals ────────────────────────────────────────────────────
  app.get("/api/agent-tx-proposals/:walletAddress", async (req, res) => {
    try {
      const proposals = await storage.getAgentTxProposalsByWallet(req.params.walletAddress.toLowerCase());
      res.json(proposals);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/agent-tx-proposals/:id", express.json(), async (req, res) => {
    try {
      const { status } = req.body;
      if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });
      const proposal = await storage.updateAgentTxProposal(req.params.id, { status });
      if (!proposal) return res.status(404).json({ error: "Not found" });
      res.json(proposal);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── MCP Skill Plugin Server ──────────────────────────────────────────────
  app.use("/mcp", mcpRouter);

  const httpServer = createServer(app);

  return httpServer;
}
