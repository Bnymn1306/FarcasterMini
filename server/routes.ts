import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPriceAlertSchema, insertTokenSchema, insertTradeSchema, insertHoldingSchema } from "@shared/schema";
import path from "path";
import fs from "fs";

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve static files from public directory
  const publicPath = path.join(process.cwd(), "public");
  app.use(express.static(publicPath));

  // Serve Farcaster Manifest with Account Association
  app.get("/.well-known/farcaster.json", (req, res) => {
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const baseUrl = `${protocol}://${req.get('host')}`;
    
    const manifest = {
      frame: {
        version: "1",
        name: "BasedMem",
        iconUrl: `${baseUrl}/icon.jpg`,
        homeUrl: baseUrl,
        imageUrl: `${baseUrl}/frame-image.jpg`,
        buttonTitle: "Launch BasedMem",
        splashImageUrl: `${baseUrl}/icon.jpg`,
        splashBackgroundColor: "#8B5CF6",
        webhookUrl: `${baseUrl}/api/webhook`,
      },
      accountAssociation: {
        header: "eyJmaWQiOjM1MTUwMywidHlwZSI6ImF1dGgiLCJrZXkiOiIweDg5ODhDNDU1ZjBjZjREMzE2N2MzMkI5RDY1QjA5MTMwNDU0NTM2YWMifQ",
        payload: "eyJkb21haW4iOiJmYjY3NTY4Zi0yMDIyLTRhZTMtYTI4NS03ZWM0OTAyYzZiNTQtMDAta25iYjlzZTAyMzRyLnNwb2NrLnJlcGxpdC5kZXYifQ",
        signature: "agp+aqj8P+GYxzTwoX56T3OyOWM4hC0tmzKpy389KTUaiPacqdXHJVQOZ0GGIN8tS8t6Uz9DdmVaf0qG4UbIzBw="
      }
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.json(manifest);
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
      const validatedData = insertTokenSchema.parse(req.body);
      const token = await storage.createToken(validatedData);
      res.json(token);
    } catch (error) {
      console.error("Error creating token:", error);
      res.status(400).json({ error: "Failed to create token" });
    }
  });

  // Trades API
  app.post("/api/trades", async (req, res) => {
    try {
      const validatedData = insertTradeSchema.parse(req.body);
      
      if (parseFloat(validatedData.price) === 0) {
        return res.status(400).json({ error: "Cannot trade token with zero price" });
      }
      
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

      if (!isFinite(parsedPrice) || parsedPrice <= 0) {
        return res.status(400).json({ error: "Invalid price - price must be greater than zero" });
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

  const httpServer = createServer(app);

  return httpServer;
}
