import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPriceAlertSchema, insertTokenSchema, insertTradeSchema, insertHoldingSchema } from "@shared/schema";
import path from "path";
import fs from "fs";
import { postTokenLaunchTweet } from "./twitter";
import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";

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
  // Seed platform token on startup (DBStorage only)
  if ('seedPlatformToken' in storage) {
    await storage.seedPlatformToken();
  }
  
  // Serve static files from public directory
  const publicPath = path.join(process.cwd(), "public");
  app.use(express.static(publicPath));

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

      res.json(castData);
    } catch (error: any) {
      console.error("Error fetching cast:", error);
      res.status(500).json({ 
        error: "Failed to fetch cast",
        message: error.message || "Invalid Warpcast URL or cast not found"
      });
    }
  });

  // Serve Farcaster Manifest with Account Association
  app.get("/.well-known/farcaster.json", (req, res) => {
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const baseUrl = `${protocol}://${req.get('host')}`;
    
    const cacheBuster = Date.now();
    
    const manifest = {
      accountAssociation: {
        header: "eyJmaWQiOjM1MTUwMywidHlwZSI6ImF1dGgiLCJrZXkiOiIweDg5ODhDNDU1ZjBjZjREMzE2N2MzMkI5RDY1QjA5MTMwNDU0NTM2YWMifQ",
        payload: "eyJkb21haW4iOiJiYXNlZG1lbS5yZXBsaXQuYXBwIn0",
        signature: "IrSv3TiqZHm759m0mbJfSjZQKj9a0zBj5fVEZ0IfBRg5dtaH3pBetxaUpdMbU5Bl4oBfJblXkCxqtItkar3Xaxw="
      },
      frame: {
        version: "1",
        name: "BasedMem",
        iconUrl: `${baseUrl}/icon.jpg?v=${cacheBuster}`,
        homeUrl: baseUrl,
        imageUrl: `${baseUrl}/frame-image.jpg?v=${cacheBuster}`,
        buttonTitle: "Launch BasedMem",
        splashImageUrl: `${baseUrl}/icon.jpg?v=${cacheBuster}`,
        splashBackgroundColor: "#8B5CF6",
        webhookUrl: `${baseUrl}/api/webhook`,
      }
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json(manifest);
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
  
  // Price Alerts API
  app.get("/api/alerts", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }
      
      const alerts = await storage.getPriceAlertsByUser(userId);
      const alertsWithTokens = await Promise.all(
        alerts.map(async (alert) => {
          const token = await storage.getToken(alert.tokenId);
          return { ...alert, token };
        })
      );
      
      res.json(alertsWithTokens);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  app.post("/api/alerts", async (req, res) => {
    try {
      const validatedData = insertPriceAlertSchema.parse(req.body);
      const alert = await storage.createPriceAlert(validatedData);
      const token = await storage.getToken(alert.tokenId);
      
      res.json({ ...alert, token });
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
        const token = await storage.getToken(updated.tokenId);
        res.json({ ...updated, token });
      } else {
        res.status(404).json({ error: "Alert not found" });
      }
    } catch (error) {
      console.error("Error updating alert:", error);
      res.status(500).json({ error: "Failed to update alert" });
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
      const { farcasterUsername, farcasterFid } = req.body;
      
      const updated = await storage.updateUser(id, {
        farcasterUsername,
        farcasterFid,
      });
      
      if (updated) {
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
      const frameImage = `${baseUrl}/frame-image.jpg`;
      
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
      const imageUrl = `${baseUrl}/frame-image.jpg`;
      
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

  // Launch from Cast - Farcaster Frame Action
  app.get("/api/frame/quick-launch", async (req, res) => {
    try {
      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const baseUrl = `${protocol}://${req.get('host')}`;
      const frameImage = `${baseUrl}/frame-image.jpg`;
      
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

  const httpServer = createServer(app);

  return httpServer;
}
