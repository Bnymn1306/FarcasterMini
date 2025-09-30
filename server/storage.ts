import { type User, type InsertUser, type Token, type InsertToken, type Trade, type InsertTrade, type Holding, type InsertHolding } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByWalletAddress(walletAddress: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private tokens: Map<string, Token>;
  private trades: Map<string, Trade>;
  private holdings: Map<string, Holding>;

  constructor() {
    this.users = new Map();
    this.tokens = new Map();
    this.trades = new Map();
    this.holdings = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByWalletAddress(walletAddress: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.walletAddress === walletAddress,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      walletAddress: insertUser.walletAddress,
      username: insertUser.username ?? null,
      avatarUrl: insertUser.avatarUrl ?? null,
      id,
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async getToken(id: string): Promise<Token | undefined> {
    return this.tokens.get(id);
  }

  async getAllTokens(): Promise<Token[]> {
    return Array.from(this.tokens.values());
  }

  async createToken(insertToken: InsertToken): Promise<Token> {
    const id = randomUUID();
    const token: Token = {
      creatorId: insertToken.creatorId,
      name: insertToken.name,
      symbol: insertToken.symbol,
      description: insertToken.description ?? null,
      logoUrl: insertToken.logoUrl ?? null,
      totalSupply: insertToken.totalSupply,
      twitterUrl: insertToken.twitterUrl ?? null,
      telegramUrl: insertToken.telegramUrl ?? null,
      websiteUrl: insertToken.websiteUrl ?? null,
      id,
      contractAddress: null,
      currentPrice: "0",
      marketCap: "0",
      volume24h: "0",
      priceChange24h: "0",
      holderCount: 0,
      isVerified: false,
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
}

export const storage = new MemStorage();
