import { type User, type InsertUser, type Token, type InsertToken, type Trade, type InsertTrade, type Holding, type InsertHolding, type PriceAlert, type InsertPriceAlert, type DailyCheckIn, type InsertDailyCheckIn, users, tokens, trades, holdings, priceAlerts, dailyCheckIns } from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import ws from "ws";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByWalletAddress(walletAddress: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  
  getToken(id: string): Promise<Token | undefined>;
  getAllTokens(): Promise<Token[]>;
  createToken(token: InsertToken): Promise<Token>;
  updateToken(id: string, updates: Partial<Token>): Promise<Token | undefined>;
  
  getTrade(id: string): Promise<Trade | undefined>;
  getTradesByToken(tokenId: string): Promise<Trade[]>;
  createTrade(trade: InsertTrade): Promise<Trade>;
  
  getHolding(userId: string, tokenId: string): Promise<Holding | undefined>;
  getHoldingsByUser(userId: string): Promise<Holding[]>;
  createHolding(holding: InsertHolding): Promise<Holding>;
  updateHolding(id: string, updates: Partial<Holding>): Promise<Holding | undefined>;
  deleteHolding(id: string): Promise<boolean>;
  
  getPriceAlert(id: string): Promise<PriceAlert | undefined>;
  getPriceAlertsByUser(userId: string): Promise<PriceAlert[]>;
  getActivePriceAlerts(): Promise<PriceAlert[]>;
  createPriceAlert(alert: InsertPriceAlert): Promise<PriceAlert>;
  updatePriceAlert(id: string, updates: Partial<PriceAlert>): Promise<PriceAlert | undefined>;
  deletePriceAlert(id: string): Promise<boolean>;
  
  getDailyCheckIn(userId: string, date: Date): Promise<DailyCheckIn | undefined>;
  getCheckInsByUser(userId: string): Promise<DailyCheckIn[]>;
  createDailyCheckIn(checkIn: InsertDailyCheckIn): Promise<DailyCheckIn>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private tokens: Map<string, Token>;
  private trades: Map<string, Trade>;
  private holdings: Map<string, Holding>;
  private priceAlerts: Map<string, PriceAlert>;
  private dailyCheckIns: Map<string, DailyCheckIn>;

  constructor() {
    this.users = new Map();
    this.tokens = new Map();
    this.trades = new Map();
    this.holdings = new Map();
    this.priceAlerts = new Map();
    this.dailyCheckIns = new Map();
    
    // Seed BMEM platform token (will persist until server restart)
    this.seedPlatformToken();
  }
  
  private seedPlatformToken() {
    try {
      const PLATFORM_TOKEN_ADDRESS = '0x6cDa3b61128aDeB94FFC8ec124D18bc099E8eb3d';
      const platformTokenId = '3baf19a2-49b3-4f27-92b0-cd5a3028c53f';
      
      // Create platform creator user if not exists
      const creatorId = '765f084e-532e-4698-8277-3a2c573906c3';
      if (!this.users.has(creatorId)) {
        this.users.set(creatorId, {
          id: creatorId,
          walletAddress: '0x8988C455f0cf4D3167c32B9D65B09130454536ac',
          username: 'BasedMem',
          avatarUrl: null,
          farcasterUsername: null,
          farcasterFid: null,
          currentStreak: 0,
          longestStreak: 0,
          totalCheckIns: 0,
          lastCheckIn: null,
          createdAt: new Date('2025-10-03T10:00:00.000Z')
        });
      }
      
      // Add BMEM platform token
      this.tokens.set(platformTokenId, {
        id: platformTokenId,
        creatorId: creatorId,
        name: 'BasedMem',
        symbol: 'BMEM',
        description: 'The official platform token of BasedMem - earn BASED through daily check-ins, trading, and community engagement!',
        logoUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ccircle cx="50" cy="50" r="50" fill="%238B5CF6"/%3E%3Ctext x="50" y="70" font-size="60" text-anchor="middle" fill="white"%3EB%3C/text%3E%3C/svg%3E',
        contractAddress: PLATFORM_TOKEN_ADDRESS,
        totalSupply: '1000000000',
        currentPrice: '0.0001',
        marketCap: '100000',
        volume24h: '0',
        priceChange24h: '0',
        holderCount: 0,
        twitterUrl: null,
        telegramUrl: null,
        websiteUrl: 'https://farcaster.xyz/miniapps/742eMUUFUGM0/basedmem',
        isVerified: false,
        isPlatformToken: true,
        createdAt: new Date('2025-10-03T10:00:00.000Z')
      });
      
      console.log('✅ BMEM platform token seeded successfully. Total tokens:', this.tokens.size);
    } catch (error) {
      console.error('❌ Failed to seed platform token:', error);
    }
  }


  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByWalletAddress(walletAddress: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.walletAddress === walletAddress,
    );
  }

  async createUser(insertUser: InsertUser & { id?: string }): Promise<User> {
    const id = insertUser.id || randomUUID();
    const user: User = { 
      walletAddress: insertUser.walletAddress,
      username: insertUser.username ?? null,
      avatarUrl: insertUser.avatarUrl ?? null,
      farcasterUsername: insertUser.farcasterUsername ?? null,
      farcasterFid: insertUser.farcasterFid ?? null,
      currentStreak: 0,
      longestStreak: 0,
      totalCheckIns: 0,
      lastCheckIn: null,
      id,
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  async getToken(id: string): Promise<Token | undefined> {
    return this.tokens.get(id);
  }

  async getAllTokens(): Promise<Token[]> {
    return Array.from(this.tokens.values());
  }

  async createToken(insertToken: InsertToken): Promise<Token> {
    const id = randomUUID();
    const PLATFORM_TOKEN_ADDRESS = '0x56A83DE968BF222dc618C2EAc2F049Eb4168073d';
    const isPlatformToken = insertToken.contractAddress?.toLowerCase() === PLATFORM_TOKEN_ADDRESS.toLowerCase();
    
    const token: Token = {
      creatorId: insertToken.creatorId ?? null,
      name: insertToken.name,
      symbol: insertToken.symbol,
      description: insertToken.description ?? null,
      logoUrl: insertToken.logoUrl ?? null,
      totalSupply: insertToken.totalSupply,
      twitterUrl: insertToken.twitterUrl ?? null,
      telegramUrl: insertToken.telegramUrl ?? null,
      websiteUrl: insertToken.websiteUrl ?? null,
      id,
      contractAddress: insertToken.contractAddress ?? null,
      currentPrice: "0",
      marketCap: "0",
      volume24h: "0",
      priceChange24h: "0",
      holderCount: 0,
      isVerified: false,
      isPlatformToken,
      createdAt: new Date()
    };
    this.tokens.set(id, token);
    return token;
  }

  async updateToken(id: string, updates: Partial<Token>): Promise<Token | undefined> {
    const token = this.tokens.get(id);
    if (!token) return undefined;
    
    const updated = { ...token, ...updates };
    this.tokens.set(id, updated);
    return updated;
  }

  async getTrade(id: string): Promise<Trade | undefined> {
    return this.trades.get(id);
  }

  async getTradesByToken(tokenId: string): Promise<Trade[]> {
    return Array.from(this.trades.values()).filter(
      (trade) => trade.tokenId === tokenId
    );
  }

  async createTrade(insertTrade: InsertTrade): Promise<Trade> {
    const id = randomUUID();
    const trade: Trade = {
      ...insertTrade,
      id,
      createdAt: new Date()
    };
    this.trades.set(id, trade);
    return trade;
  }

  async getHolding(userId: string, tokenId: string): Promise<Holding | undefined> {
    return Array.from(this.holdings.values()).find(
      (holding) => holding.userId === userId && holding.tokenId === tokenId
    );
  }

  async getHoldingsByUser(userId: string): Promise<Holding[]> {
    return Array.from(this.holdings.values()).filter(
      (holding) => holding.userId === userId
    );
  }

  async createHolding(insertHolding: InsertHolding): Promise<Holding> {
    const id = randomUUID();
    const holding: Holding = {
      ...insertHolding,
      id,
      updatedAt: new Date()
    };
    this.holdings.set(id, holding);
    return holding;
  }

  async updateHolding(id: string, updates: Partial<Holding>): Promise<Holding | undefined> {
    const holding = this.holdings.get(id);
    if (!holding) return undefined;
    
    const updated = { 
      ...holding, 
      ...updates,
      updatedAt: new Date()
    };
    this.holdings.set(id, updated);
    return updated;
  }

  async deleteHolding(id: string): Promise<boolean> {
    return this.holdings.delete(id);
  }

  async getPriceAlert(id: string): Promise<PriceAlert | undefined> {
    return this.priceAlerts.get(id);
  }

  async getPriceAlertsByUser(userId: string): Promise<PriceAlert[]> {
    return Array.from(this.priceAlerts.values()).filter(
      (alert) => alert.userId === userId
    );
  }

  async getActivePriceAlerts(): Promise<PriceAlert[]> {
    return Array.from(this.priceAlerts.values()).filter(
      (alert) => alert.isActive && !alert.isTriggered
    );
  }

  async createPriceAlert(insertAlert: InsertPriceAlert): Promise<PriceAlert> {
    const id = randomUUID();
    const alert: PriceAlert = {
      userId: insertAlert.userId,
      tokenId: insertAlert.tokenId,
      targetPrice: insertAlert.targetPrice,
      condition: insertAlert.condition,
      notifyViaFarcaster: insertAlert.notifyViaFarcaster ?? true,
      id,
      isActive: true,
      isTriggered: false,
      triggeredAt: null,
      createdAt: new Date()
    };
    this.priceAlerts.set(id, alert);
    return alert;
  }

  async updatePriceAlert(id: string, updates: Partial<PriceAlert>): Promise<PriceAlert | undefined> {
    const alert = this.priceAlerts.get(id);
    if (!alert) return undefined;
    
    const updated = { ...alert, ...updates };
    this.priceAlerts.set(id, updated);
    return updated;
  }

  async deletePriceAlert(id: string): Promise<boolean> {
    return this.priceAlerts.delete(id);
  }

  async getDailyCheckIn(userId: string, date: Date): Promise<DailyCheckIn | undefined> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return Array.from(this.dailyCheckIns.values()).find(
      (checkIn) => {
        const checkInDate = new Date(checkIn.checkInDate);
        return checkIn.userId === userId && 
               checkInDate >= startOfDay && 
               checkInDate <= endOfDay;
      }
    );
  }

  async getCheckInsByUser(userId: string): Promise<DailyCheckIn[]> {
    return Array.from(this.dailyCheckIns.values())
      .filter((checkIn) => checkIn.userId === userId)
      .sort((a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime());
  }

  async createDailyCheckIn(insertCheckIn: InsertDailyCheckIn): Promise<DailyCheckIn> {
    const id = randomUUID();
    const checkIn: DailyCheckIn = {
      userId: insertCheckIn.userId,
      checkInDate: insertCheckIn.checkInDate,
      streakDay: insertCheckIn.streakDay,
      rewardClaimed: false,
      id,
      createdAt: new Date()
    };
    this.dailyCheckIns.set(id, checkIn);
    return checkIn;
  }
}

neonConfig.webSocketConstructor = ws;
neonConfig.fetchConnectionCache = true;

export class DBStorage implements IStorage {
  private db;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    
    const connectionString = process.env.DATABASE_URL.includes('?')
      ? `${process.env.DATABASE_URL}&connect_timeout=30&pool_timeout=30`
      : `${process.env.DATABASE_URL}?connect_timeout=30&pool_timeout=30`;
    
    const pool = new Pool({ 
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
    });
    
    this.db = drizzle(pool);
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByWalletAddress(walletAddress: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.walletAddress, walletAddress)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await this.db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const result = await this.db.update(users).set(updates).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getToken(id: string): Promise<Token | undefined> {
    const result = await this.db.select().from(tokens).where(eq(tokens.id, id)).limit(1);
    return result[0];
  }

  async getAllTokens(): Promise<Token[]> {
    return await this.db.select().from(tokens);
  }

  async createToken(insertToken: InsertToken): Promise<Token> {
    const PLATFORM_TOKEN_ADDRESS = '0x56A83DE968BF222dc618C2EAc2F049Eb4168073d';
    const isPlatformToken = insertToken.contractAddress?.toLowerCase() === PLATFORM_TOKEN_ADDRESS.toLowerCase();
    
    const tokenWithDefaults = {
      ...insertToken,
      contractAddress: insertToken.contractAddress ?? null,
      currentPrice: "0",
      marketCap: "0",
      volume24h: "0",
      priceChange24h: "0",
      holderCount: 0,
      isVerified: false,
      isPlatformToken,
    };
    const result = await this.db.insert(tokens).values(tokenWithDefaults).returning();
    return result[0];
  }

  async updateToken(id: string, updates: Partial<Token>): Promise<Token | undefined> {
    const result = await this.db.update(tokens).set(updates).where(eq(tokens.id, id)).returning();
    return result[0];
  }

  async getTrade(id: string): Promise<Trade | undefined> {
    const result = await this.db.select().from(trades).where(eq(trades.id, id)).limit(1);
    return result[0];
  }

  async getTradesByToken(tokenId: string): Promise<Trade[]> {
    return await this.db.select().from(trades).where(eq(trades.tokenId, tokenId));
  }

  async createTrade(insertTrade: InsertTrade): Promise<Trade> {
    const result = await this.db.insert(trades).values(insertTrade).returning();
    return result[0];
  }

  async getHolding(userId: string, tokenId: string): Promise<Holding | undefined> {
    const result = await this.db.select().from(holdings).where(
      and(eq(holdings.userId, userId), eq(holdings.tokenId, tokenId))
    ).limit(1);
    return result[0];
  }

  async getHoldingsByUser(userId: string): Promise<Holding[]> {
    return await this.db.select().from(holdings).where(eq(holdings.userId, userId));
  }

  async createHolding(insertHolding: InsertHolding): Promise<Holding> {
    const result = await this.db.insert(holdings).values(insertHolding).returning();
    return result[0];
  }

  async updateHolding(id: string, updates: Partial<Holding>): Promise<Holding | undefined> {
    const result = await this.db.update(holdings).set(updates).where(eq(holdings.id, id)).returning();
    return result[0];
  }

  async deleteHolding(id: string): Promise<boolean> {
    const result = await this.db.delete(holdings).where(eq(holdings.id, id)).returning();
    return result.length > 0;
  }

  async getPriceAlert(id: string): Promise<PriceAlert | undefined> {
    const result = await this.db.select().from(priceAlerts).where(eq(priceAlerts.id, id)).limit(1);
    return result[0];
  }

  async getPriceAlertsByUser(userId: string): Promise<PriceAlert[]> {
    return await this.db.select().from(priceAlerts).where(eq(priceAlerts.userId, userId));
  }

  async getActivePriceAlerts(): Promise<PriceAlert[]> {
    return await this.db.select().from(priceAlerts).where(
      and(eq(priceAlerts.isActive, true), eq(priceAlerts.isTriggered, false))
    );
  }

  async createPriceAlert(insertAlert: InsertPriceAlert): Promise<PriceAlert> {
    const result = await this.db.insert(priceAlerts).values(insertAlert).returning();
    return result[0];
  }

  async updatePriceAlert(id: string, updates: Partial<PriceAlert>): Promise<PriceAlert | undefined> {
    const result = await this.db.update(priceAlerts).set(updates).where(eq(priceAlerts.id, id)).returning();
    return result[0];
  }

  async deletePriceAlert(id: string): Promise<boolean> {
    const result = await this.db.delete(priceAlerts).where(eq(priceAlerts.id, id)).returning();
    return result.length > 0;
  }

  async getDailyCheckIn(userId: string, date: Date): Promise<DailyCheckIn | undefined> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await this.db.select().from(dailyCheckIns).where(
      and(
        eq(dailyCheckIns.userId, userId),
        gte(dailyCheckIns.checkInDate, startOfDay),
        lte(dailyCheckIns.checkInDate, endOfDay)
      )
    ).limit(1);
    return result[0];
  }

  async getCheckInsByUser(userId: string): Promise<DailyCheckIn[]> {
    return await this.db.select().from(dailyCheckIns)
      .where(eq(dailyCheckIns.userId, userId))
      .orderBy(desc(dailyCheckIns.checkInDate));
  }

  async createDailyCheckIn(insertCheckIn: InsertDailyCheckIn): Promise<DailyCheckIn> {
    const result = await this.db.insert(dailyCheckIns).values(insertCheckIn).returning();
    return result[0];
  }
}

// Using DBStorage for persistent PostgreSQL database
// Database is enabled and ready!
export const storage = new DBStorage();
