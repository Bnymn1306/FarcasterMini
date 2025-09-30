import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPriceAlertSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
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

  // Daily Check-In API
  app.post("/api/check-in", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const today = new Date();
      const existingCheckIn = await storage.getDailyCheckIn(userId, today);

      if (existingCheckIn) {
        return res.status(400).json({ error: "Already checked in today" });
      }

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayCheckIn = await storage.getDailyCheckIn(userId, yesterday);

      let newStreak = 1;
      if (yesterdayCheckIn) {
        newStreak = (user.currentStreak || 0) + 1;
      }

      const longestStreak = Math.max(newStreak, user.longestStreak || 0);
      const totalCheckIns = (user.totalCheckIns || 0) + 1;

      await storage.updateUser(userId, {
        currentStreak: newStreak,
        longestStreak,
        totalCheckIns,
        lastCheckIn: today,
      });

      const checkIn = await storage.createDailyCheckIn({
        userId,
        checkInDate: today,
        streakDay: newStreak,
      });

      const updatedUser = await storage.getUser(userId);

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

  app.get("/api/check-in/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const today = new Date();
      const todayCheckIn = await storage.getDailyCheckIn(userId, today);
      const recentCheckIns = await storage.getCheckInsByUser(userId);

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
      
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${token.name} (${token.symbol}) - BasedMem</title>
  <meta property="og:title" content="${token.name} (${token.symbol})">
  <meta property="og:description" content="Price: $${token.currentPrice} | 24h: ${priceChangeText} | Market Cap: $${(parseFloat(token.marketCap) / 1000).toFixed(0)}K">
  <meta property="og:image" content="${token.logoUrl || `${baseUrl}/logo.svg`}">
  <meta property="fc:frame" content="vNext">
  <meta property="fc:frame:image" content="${token.logoUrl || `${baseUrl}/logo.svg`}">
  <meta property="fc:frame:image:aspect_ratio" content="1:1">
  <meta property="fc:frame:button:1" content="View on BasedMem">
  <meta property="fc:frame:button:1:action" content="link">
  <meta property="fc:frame:button:1:target" content="${baseUrl}/token/${id}">
  <meta property="fc:frame:button:2" content="Price: $${token.currentPrice}">
  <meta property="fc:frame:button:3" content="Set Alert">
  <meta property="fc:frame:button:3:action" content="post">
  <meta property="fc:frame:post_url" content="${baseUrl}/api/frame/action/${id}">
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
      const imageUrl = token.logoUrl || `${baseUrl}/logo.svg`;
      
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
