import { type User, type InsertUser, type Token, type InsertToken, type Trade, type InsertTrade, type Holding, type InsertHolding, type PriceAlert, type InsertPriceAlert, type DailyCheckIn, type InsertDailyCheckIn, type Badge, type InsertBadge, type Prediction, type InsertPrediction, type Bet, type InsertBet, type X402Payment, type InsertX402Payment, type LimitOrder, type InsertLimitOrder, type ExternalToken, type InsertExternalToken, type RugProtection, type InsertRugProtection, type MemeAgent, type InsertMemeAgent, type AgentServiceRequest, type InsertAgentServiceRequest, type FractionCollection, type InsertFractionCollection, type FractionHolding, type InsertFractionHolding, type FractionListing, type InsertFractionListing, type AgentSession, type InsertAgentSession, type AgentTxProposal, type InsertAgentTxProposal, users, tokens, trades, holdings, priceAlerts, dailyCheckIns, badges, predictions, bets, x402Payments, limitOrders, externalTokens, rugProtection, memeAgents, agentServiceRequests, fractionCollections, fractionHoldings, fractionListings, agentSessions, agentTxProposals } from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, and, or, gte, lte, desc, sql } from "drizzle-orm";
import ws from "ws";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByWalletAddress(walletAddress: string): Promise<User | undefined>;
  getUserBySolanaAddress(solanaAddress: string): Promise<User | undefined>;
  getUsersByFid(fid: string): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  
  getToken(id: string): Promise<Token | undefined>;
  getTokenBySymbol(symbol: string): Promise<Token | undefined>;
  getAllTokens(): Promise<Token[]>;
  createToken(token: InsertToken): Promise<Token>;
  updateToken(id: string, updates: Partial<Token>): Promise<Token | undefined>;
  
  getTrade(id: string): Promise<Trade | undefined>;
  getTradesByToken(tokenId: string): Promise<Trade[]>;
  getAllTrades(): Promise<Trade[]>;
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
  
  getBadgesByUser(userId: string): Promise<Badge[]>;
  createBadge(badge: InsertBadge): Promise<Badge>;
  getUserTokenCount(userId: string): Promise<number>;
  
  getPrediction(id: string): Promise<Prediction | undefined>;
  getPredictionByCastUrl(castUrl: string): Promise<Prediction | undefined>;
  getAllPredictions(): Promise<Prediction[]>;
  getActivePredictions(): Promise<Prediction[]>;
  createPrediction(prediction: InsertPrediction): Promise<Prediction>;
  updatePrediction(id: string, updates: Partial<Prediction>): Promise<Prediction | undefined>;
  
  getBet(id: string): Promise<Bet | undefined>;
  getBetsByPrediction(predictionId: string): Promise<Bet[]>;
  getBetsByUser(userId: string): Promise<Bet[]>;
  createBet(bet: InsertBet): Promise<Bet>;
  updateBet(id: string, updates: Partial<Bet>): Promise<Bet | undefined>;
  
  getX402Payment(id: string): Promise<X402Payment | undefined>;
  getX402PaymentsByUser(userId: string): Promise<X402Payment[]>;
  getX402PaymentsByFeature(feature: string): Promise<X402Payment[]>;
  createX402Payment(payment: InsertX402Payment): Promise<X402Payment>;
  updateX402Payment(id: string, updates: Partial<X402Payment>): Promise<X402Payment | undefined>;
  
  getLimitOrder(id: string): Promise<LimitOrder | undefined>;
  getLimitOrdersByUser(userId: string): Promise<LimitOrder[]>;
  getPendingLimitOrders(): Promise<LimitOrder[]>;
  getFillableLimitOrders(): Promise<LimitOrder[]>;
  getReadyLimitOrders(userId: string): Promise<LimitOrder[]>;
  getAllLimitOrders(): Promise<LimitOrder[]>;
  createLimitOrder(order: InsertLimitOrder): Promise<LimitOrder>;
  updateLimitOrder(id: string, updates: Partial<LimitOrder>): Promise<LimitOrder | undefined>;
  cancelLimitOrder(id: string): Promise<boolean>;
  
  getExternalToken(address: string): Promise<ExternalToken | undefined>;
  getExternalTokensByAddresses(addresses: string[]): Promise<ExternalToken[]>;
  createExternalToken(token: InsertExternalToken): Promise<ExternalToken>;
  updateExternalToken(address: string, updates: Partial<ExternalToken>): Promise<ExternalToken | undefined>;
  upsertExternalToken(token: InsertExternalToken): Promise<ExternalToken>;
  
  getRugProtection(id: string): Promise<RugProtection | undefined>;
  getRugProtectionsByUser(userId: string): Promise<RugProtection[]>;
  getActiveRugProtections(): Promise<RugProtection[]>;
  getRugProtectionByToken(userWalletAddress: string, tokenAddress: string): Promise<RugProtection | undefined>;
  createRugProtection(entry: InsertRugProtection): Promise<RugProtection>;
  updateRugProtection(id: string, updates: Partial<RugProtection>): Promise<RugProtection | undefined>;
  deleteRugProtection(id: string): Promise<boolean>;

  // Memetic Fractions
  getAllFractionCollections(): Promise<FractionCollection[]>;
  getFractionCollection(id: string): Promise<FractionCollection | undefined>;
  createFractionCollection(col: InsertFractionCollection): Promise<FractionCollection>;
  updateFractionCollection(id: string, updates: Partial<FractionCollection>): Promise<FractionCollection | undefined>;
  getFractionHoldingsByWallet(walletAddress: string): Promise<FractionHolding[]>;
  getFractionHolding(walletAddress: string, collectionId: string): Promise<FractionHolding | undefined>;
  upsertFractionHolding(walletAddress: string, collectionId: string, amountDelta: number): Promise<FractionHolding>;
  updateFractionHolding(id: string, updates: Partial<FractionHolding>): Promise<FractionHolding | undefined>;

  // Fraction Listings (P2P market)
  createFractionListing(listing: InsertFractionListing): Promise<FractionListing>;
  getFractionListingsByCollection(collectionId: string): Promise<FractionListing[]>;
  getFractionListingsByWallet(walletAddress: string): Promise<FractionListing[]>;
  getFractionListing(id: string): Promise<FractionListing | undefined>;
  updateFractionListing(id: string, updates: Partial<FractionListing>): Promise<FractionListing | undefined>;

  getMemeAgent(id: string): Promise<MemeAgent | undefined>;
  getMemeAgentByWallet(walletAddress: string): Promise<MemeAgent | undefined>;
  getMemeAgentsByWallet(walletAddress: string): Promise<MemeAgent[]>;
  getAllMemeAgents(): Promise<MemeAgent[]>;
  createMemeAgent(agent: InsertMemeAgent & { agentId: string }): Promise<MemeAgent>;
  updateMemeAgent(id: string, updates: Partial<MemeAgent>): Promise<MemeAgent | undefined>;

  clearAllAgents(): Promise<void>;

  getAgentServiceRequest(id: string): Promise<AgentServiceRequest | undefined>;
  getAgentServiceRequestsByAgent(agentId: string): Promise<AgentServiceRequest[]>;
  getAllAgentServiceRequests(): Promise<AgentServiceRequest[]>;
  createAgentServiceRequest(req: InsertAgentServiceRequest): Promise<AgentServiceRequest>;
  updateAgentServiceRequest(id: string, updates: Partial<AgentServiceRequest>): Promise<AgentServiceRequest | undefined>;

  // Agent Sessions
  createAgentSession(session: InsertAgentSession): Promise<AgentSession>;
  getAgentSession(token: string): Promise<AgentSession | undefined>;
  getAgentSessionsByWallet(walletAddress: string): Promise<AgentSession[]>;
  updateAgentSession(token: string, updates: Partial<AgentSession>): Promise<AgentSession | undefined>;
  deleteAgentSession(token: string): Promise<boolean>;

  // Agent TX Proposals
  createAgentTxProposal(proposal: InsertAgentTxProposal): Promise<AgentTxProposal>;
  getAgentTxProposal(id: string): Promise<AgentTxProposal | undefined>;
  getAgentTxProposalsByWallet(walletAddress: string): Promise<AgentTxProposal[]>;
  updateAgentTxProposal(id: string, updates: Partial<AgentTxProposal>): Promise<AgentTxProposal | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private tokens: Map<string, Token>;
  private trades: Map<string, Trade>;
  private holdings: Map<string, Holding>;
  private priceAlerts: Map<string, PriceAlert>;
  private dailyCheckIns: Map<string, DailyCheckIn>;
  private badges: Map<string, Badge>;
  private predictions: Map<string, Prediction>;
  private bets: Map<string, Bet>;
  private x402Payments: Map<string, X402Payment>;
  private limitOrders: Map<string, LimitOrder>;
  private externalTokensMap: Map<string, ExternalToken>;

  constructor() {
    this.users = new Map();
    this.tokens = new Map();
    this.trades = new Map();
    this.holdings = new Map();
    this.priceAlerts = new Map();
    this.dailyCheckIns = new Map();
    this.badges = new Map();
    this.predictions = new Map();
    this.bets = new Map();
    this.x402Payments = new Map();
    this.limitOrders = new Map();
    this.externalTokensMap = new Map();
    
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
          farcasterNotificationToken: null,
          farcasterNotificationUrl: null,
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
        castHash: null,
        castUrl: null,
        castAuthorFid: null,
        castAuthorUsername: null,
        castAuthorDisplayName: null,
        castText: null,
        castLikes: null,
        castRecasts: null,
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
  
  async getUserBySolanaAddress(solanaAddress: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.solanaAddress === solanaAddress,
    );
  }
  
  async getUsersByFid(fid: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(
      (user) => user.farcasterFid === fid,
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
      farcasterNotificationToken: insertUser.farcasterNotificationToken ?? null,
      farcasterNotificationUrl: insertUser.farcasterNotificationUrl ?? null,
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

  async getTokenBySymbol(symbol: string): Promise<Token | undefined> {
    return Array.from(this.tokens.values()).find(
      (token) => token.symbol === symbol
    );
  }

  async getAllTokens(): Promise<Token[]> {
    return Array.from(this.tokens.values());
  }

  async createToken(insertToken: InsertToken): Promise<Token> {
    // Check for duplicate symbol
    const existingToken = await this.getTokenBySymbol(insertToken.symbol);
    if (existingToken) {
      throw new Error(`A token with symbol "${insertToken.symbol}" already exists`);
    }
    
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
      castHash: insertToken.castHash ?? null,
      castUrl: insertToken.castUrl ?? null,
      castAuthorFid: insertToken.castAuthorFid ?? null,
      castAuthorUsername: insertToken.castAuthorUsername ?? null,
      castAuthorDisplayName: insertToken.castAuthorDisplayName ?? null,
      castText: insertToken.castText ?? null,
      castLikes: insertToken.castLikes ?? null,
      castRecasts: insertToken.castRecasts ?? null,
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

  async getAllTrades(): Promise<Trade[]> {
    return Array.from(this.trades.values());
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
      tokenId: insertAlert.tokenId ?? null,
      targetPrice: insertAlert.targetPrice,
      condition: insertAlert.condition,
      notifyViaFarcaster: insertAlert.notifyViaFarcaster ?? true,
      externalTokenAddress: insertAlert.externalTokenAddress ?? null,
      externalTokenSymbol: insertAlert.externalTokenSymbol ?? null,
      externalTokenName: insertAlert.externalTokenName ?? null,
      externalTokenLogoUrl: insertAlert.externalTokenLogoUrl ?? null,
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

  async getBadgesByUser(userId: string): Promise<Badge[]> {
    return Array.from(this.badges.values())
      .filter((badge) => badge.userId === userId)
      .sort((a, b) => new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime());
  }

  async createBadge(insertBadge: InsertBadge): Promise<Badge> {
    const id = randomUUID();
    const badge: Badge = {
      ...insertBadge,
      nftTokenId: insertBadge.nftTokenId ?? null,
      nftContractAddress: insertBadge.nftContractAddress ?? null,
      id,
      earnedAt: new Date()
    };
    this.badges.set(id, badge);
    return badge;
  }

  async getUserTokenCount(userId: string): Promise<number> {
    return Array.from(this.tokens.values()).filter(
      (token) => token.creatorId === userId
    ).length;
  }

  async getPrediction(id: string): Promise<Prediction | undefined> {
    return this.predictions.get(id);
  }

  async getPredictionByCastUrl(castUrl: string): Promise<Prediction | undefined> {
    return Array.from(this.predictions.values()).find(
      (pred) => pred.castUrl === castUrl
    );
  }

  async getAllPredictions(): Promise<Prediction[]> {
    return Array.from(this.predictions.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getActivePredictions(): Promise<Prediction[]> {
    return Array.from(this.predictions.values())
      .filter((pred) => pred.status === 'active')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createPrediction(insertPrediction: InsertPrediction): Promise<Prediction> {
    const id = randomUUID();
    const prediction: Prediction = {
      id,
      marketId: insertPrediction.marketId ?? null,
      castHash: insertPrediction.castHash,
      castUrl: insertPrediction.castUrl,
      castAuthorFid: insertPrediction.castAuthorFid ?? null,
      castAuthorUsername: insertPrediction.castAuthorUsername ?? null,
      castAuthorDisplayName: insertPrediction.castAuthorDisplayName ?? null,
      castText: insertPrediction.castText ?? null,
      castImageUrl: insertPrediction.castImageUrl ?? null,
      initialLikes: insertPrediction.initialLikes ?? 0,
      initialRecasts: insertPrediction.initialRecasts ?? 0,
      viralMetric: insertPrediction.viralMetric ?? 'likes',
      viralThreshold: insertPrediction.viralThreshold,
      deadline: insertPrediction.deadline,
      createdBy: insertPrediction.createdBy,
      totalPool: '0',
      totalBetsFor: '0',
      totalBetsAgainst: '0',
      status: 'active',
      winningOutcome: null,
      tokenId: null,
      resolvedAt: null,
      createdAt: new Date()
    };
    this.predictions.set(id, prediction);
    return prediction;
  }

  async updatePrediction(id: string, updates: Partial<Prediction>): Promise<Prediction | undefined> {
    const prediction = this.predictions.get(id);
    if (!prediction) return undefined;
    const updated = { ...prediction, ...updates };
    this.predictions.set(id, updated);
    return updated;
  }

  async getBet(id: string): Promise<Bet | undefined> {
    return this.bets.get(id);
  }

  async getBetsByPrediction(predictionId: string): Promise<Bet[]> {
    return Array.from(this.bets.values())
      .filter((bet) => bet.predictionId === predictionId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getBetsByUser(userId: string): Promise<Bet[]> {
    return Array.from(this.bets.values())
      .filter((bet) => bet.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createBet(insertBet: InsertBet): Promise<Bet> {
    const id = randomUUID();
    const bet: Bet = {
      ...insertBet,
      id,
      payout: '0',
      claimed: false,
      createdAt: new Date()
    };
    this.bets.set(id, bet);
    return bet;
  }

  async updateBet(id: string, updates: Partial<Bet>): Promise<Bet | undefined> {
    const bet = this.bets.get(id);
    if (!bet) return undefined;
    const updated = { ...bet, ...updates };
    this.bets.set(id, updated);
    return updated;
  }

  async getX402Payment(id: string): Promise<X402Payment | undefined> {
    return this.x402Payments.get(id);
  }

  async getX402PaymentsByUser(userId: string): Promise<X402Payment[]> {
    return Array.from(this.x402Payments.values())
      .filter((payment) => payment.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getX402PaymentsByFeature(feature: string): Promise<X402Payment[]> {
    return Array.from(this.x402Payments.values())
      .filter((payment) => payment.feature === feature)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createX402Payment(insertPayment: InsertX402Payment): Promise<X402Payment> {
    const id = randomUUID();
    const payment: X402Payment = {
      id,
      userId: insertPayment.userId,
      status: 'pending',
      txHash: insertPayment.txHash ?? null,
      amount: insertPayment.amount,
      endpoint: insertPayment.endpoint,
      feature: insertPayment.feature,
      currency: insertPayment.currency ?? 'USDC',
      network: insertPayment.network ?? 'base',
      paymentProof: insertPayment.paymentProof ?? null,
      metadata: insertPayment.metadata ?? null,
      errorMessage: insertPayment.errorMessage ?? null,
      verifiedAt: null,
      settledAt: null,
      createdAt: new Date()
    };
    this.x402Payments.set(id, payment);
    return payment;
  }

  async updateX402Payment(id: string, updates: Partial<X402Payment>): Promise<X402Payment | undefined> {
    const payment = this.x402Payments.get(id);
    if (!payment) return undefined;
    const updated = { ...payment, ...updates };
    this.x402Payments.set(id, updated);
    return updated;
  }

  async getLimitOrder(id: string): Promise<LimitOrder | undefined> {
    return this.limitOrders.get(id);
  }

  async getLimitOrdersByUser(userId: string): Promise<LimitOrder[]> {
    return Array.from(this.limitOrders.values())
      .filter((order) => order.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getPendingLimitOrders(): Promise<LimitOrder[]> {
    return Array.from(this.limitOrders.values())
      .filter((order) => order.status === 'pending')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getFillableLimitOrders(): Promise<LimitOrder[]> {
    return Array.from(this.limitOrders.values())
      .filter((order) => order.status === 'fillable' || order.status === 'ready_to_execute')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getReadyLimitOrders(userId: string): Promise<LimitOrder[]> {
    return Array.from(this.limitOrders.values())
      .filter((order) => order.userId === userId && order.status === 'fillable')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getAllLimitOrders(): Promise<LimitOrder[]> {
    return Array.from(this.limitOrders.values());
  }

  async createLimitOrder(insertOrder: InsertLimitOrder): Promise<LimitOrder> {
    const id = randomUUID();
    const order: LimitOrder = {
      id,
      userId: insertOrder.userId,
      userWalletAddress: insertOrder.userWalletAddress ?? null,
      tokenId: insertOrder.tokenId ?? null,
      tokenAddress: insertOrder.tokenAddress,
      tokenSymbol: insertOrder.tokenSymbol,
      orderType: insertOrder.orderType,
      targetPrice: insertOrder.targetPrice ?? null,
      ethAmount: insertOrder.ethAmount ?? null,
      tokenAmount: insertOrder.tokenAmount,
      totalValue: insertOrder.totalValue,
      status: 'pending',
      
      chainId: 8453,
      signature: insertOrder.signature,
      salt: insertOrder.salt,
      orderHash: insertOrder.orderHash,
      makerAmount: insertOrder.makerAmount,
      takerAmount: insertOrder.takerAmount,
      makerToken: insertOrder.makerToken,
      takerToken: insertOrder.takerToken,
      expiry: insertOrder.expiry,
      orderJson: insertOrder.orderJson,
      schemaVersion: 1,
      orderSource: '0x_native',
      
      makerTokenFilledAmount: null,
      takerTokenFilledAmount: null,
      protocolFee: null,
      
      expiresAt: insertOrder.expiresAt ?? null,
      filledAt: null,
      filledPrice: null,
      txHash: null,
      failureReason: null,
      createdAt: new Date()
    };
    this.limitOrders.set(id, order);
    return order;
  }

  async updateLimitOrder(id: string, updates: Partial<LimitOrder>): Promise<LimitOrder | undefined> {
    const order = this.limitOrders.get(id);
    if (!order) return undefined;
    const updated = { ...order, ...updates };
    this.limitOrders.set(id, updated);
    return updated;
  }

  async cancelLimitOrder(id: string): Promise<boolean> {
    const order = this.limitOrders.get(id);
    if (!order) return false;
    const updated = { ...order, status: 'cancelled' };
    this.limitOrders.set(id, updated);
    return true;
  }

  async getExternalToken(address: string): Promise<ExternalToken | undefined> {
    return Array.from(this.externalTokensMap.values()).find(
      (token) => token.address.toLowerCase() === address.toLowerCase()
    );
  }

  async getExternalTokensByAddresses(addresses: string[]): Promise<ExternalToken[]> {
    const lowerAddresses = addresses.map(a => a.toLowerCase());
    return Array.from(this.externalTokensMap.values()).filter(
      (token) => lowerAddresses.includes(token.address.toLowerCase())
    );
  }

  async createExternalToken(insertToken: InsertExternalToken): Promise<ExternalToken> {
    const id = randomUUID();
    const token: ExternalToken = {
      ...insertToken,
      id,
      chainId: insertToken.chainId ?? 8453,
      decimals: insertToken.decimals ?? 18,
      logoUrl: insertToken.logoUrl ?? null,
      currentPrice: insertToken.currentPrice ?? null,
      priceChange24h: insertToken.priceChange24h ?? null,
      volume24h: insertToken.volume24h ?? null,
      liquidity: insertToken.liquidity ?? null,
      marketCap: insertToken.marketCap ?? null,
      dexScreenerUrl: insertToken.dexScreenerUrl ?? null,
      lastUpdated: new Date(),
      createdAt: new Date(),
    };
    this.externalTokensMap.set(token.address.toLowerCase(), token);
    return token;
  }

  async updateExternalToken(address: string, updates: Partial<ExternalToken>): Promise<ExternalToken | undefined> {
    const existing = await this.getExternalToken(address);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, lastUpdated: new Date() };
    this.externalTokensMap.set(address.toLowerCase(), updated);
    return updated;
  }

  async upsertExternalToken(insertToken: InsertExternalToken): Promise<ExternalToken> {
    const existing = await this.getExternalToken(insertToken.address);
    if (existing) {
      return await this.updateExternalToken(insertToken.address, insertToken) as ExternalToken;
    }
    return await this.createExternalToken(insertToken);
  }

  private rugProtections: Map<string, RugProtection> = new Map();

  async getRugProtection(id: string): Promise<RugProtection | undefined> {
    return this.rugProtections.get(id);
  }

  async getRugProtectionsByUser(userId: string): Promise<RugProtection[]> {
    return Array.from(this.rugProtections.values())
      .filter((rp) => rp.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getActiveRugProtections(): Promise<RugProtection[]> {
    return Array.from(this.rugProtections.values())
      .filter((rp) => rp.status === 'active')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getRugProtectionByToken(userWalletAddress: string, tokenAddress: string): Promise<RugProtection | undefined> {
    return Array.from(this.rugProtections.values())
      .find((rp) => rp.userWalletAddress.toLowerCase() === userWalletAddress.toLowerCase() && 
                    rp.tokenAddress.toLowerCase() === tokenAddress.toLowerCase());
  }

  async createRugProtection(insertEntry: InsertRugProtection): Promise<RugProtection> {
    const id = randomUUID();
    const entry: RugProtection = {
      id,
      userId: insertEntry.userId,
      userWalletAddress: insertEntry.userWalletAddress,
      tokenAddress: insertEntry.tokenAddress,
      tokenSymbol: insertEntry.tokenSymbol,
      tokenName: insertEntry.tokenName ?? null,
      tokenDecimals: insertEntry.tokenDecimals ?? 18,
      depositAmount: insertEntry.depositAmount,
      vaultVersion: 'v3',
      vaultAddress: insertEntry.vaultAddress,
      status: 'active',
      autoSellEnabled: insertEntry.autoSellEnabled ?? true,
      initialLiquidity: insertEntry.initialLiquidity ?? null,
      initialOwner: insertEntry.initialOwner ?? null,
      initialBuyTax: insertEntry.initialBuyTax ?? null,
      initialSellTax: insertEntry.initialSellTax ?? null,
      lastSignalType: null,
      lastSignalSeverity: null,
      lastSignalMessage: null,
      soldPrice: null,
      soldAmount: null,
      txHash: null,
      failureReason: null,
      createdAt: new Date(),
      soldAt: null,
    };
    this.rugProtections.set(id, entry);
    return entry;
  }

  async updateRugProtection(id: string, updates: Partial<RugProtection>): Promise<RugProtection | undefined> {
    const entry = this.rugProtections.get(id);
    if (!entry) return undefined;
    const updated = { ...entry, ...updates };
    this.rugProtections.set(id, updated);
    return updated;
  }

  async deleteRugProtection(id: string): Promise<boolean> {
    return this.rugProtections.delete(id);
  }

  async getMemeAgent(_id: string): Promise<MemeAgent | undefined> { return undefined; }
  async getMemeAgentByWallet(_walletAddress: string): Promise<MemeAgent | undefined> { return undefined; }
  async getMemeAgentsByWallet(_walletAddress: string): Promise<MemeAgent[]> { return []; }
  async getAllMemeAgents(): Promise<MemeAgent[]> { return []; }
  async createMemeAgent(agent: InsertMemeAgent & { agentId: string }): Promise<MemeAgent> {
    return { ...agent, id: randomUUID(), reputationScore: 0, totalShills: 0, totalServicesDone: 0, isActive: true, createdAt: new Date(), bio: agent.bio ?? null };
  }
  async updateMemeAgent(_id: string, _updates: Partial<MemeAgent>): Promise<MemeAgent | undefined> { return undefined; }
  async clearAllAgents(): Promise<void> {}
  async getAgentServiceRequest(_id: string): Promise<AgentServiceRequest | undefined> { return undefined; }
  async getAgentServiceRequestsByAgent(_agentId: string): Promise<AgentServiceRequest[]> { return []; }
  async getAllAgentServiceRequests(): Promise<AgentServiceRequest[]> { return []; }
  async createAgentServiceRequest(req: InsertAgentServiceRequest): Promise<AgentServiceRequest> {
    return { ...req, id: randomUUID(), status: 'pending', createdAt: new Date() };
  }
  async updateAgentServiceRequest(_id: string, _updates: Partial<AgentServiceRequest>): Promise<AgentServiceRequest | undefined> { return undefined; }
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
  
  async getUserBySolanaAddress(solanaAddress: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.solanaAddress, solanaAddress)).limit(1);
    return result[0];
  }
  
  async getUsersByFid(fid: string): Promise<User[]> {
    return await this.db.select().from(users).where(eq(users.farcasterFid, fid));
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

  async getTokenBySymbol(symbol: string): Promise<Token | undefined> {
    const result = await this.db.select().from(tokens).where(eq(tokens.symbol, symbol)).limit(1);
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

  async getAllTrades(): Promise<Trade[]> {
    return await this.db.select().from(trades);
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

  async getBadgesByUser(userId: string): Promise<Badge[]> {
    return await this.db.select().from(badges)
      .where(eq(badges.userId, userId))
      .orderBy(desc(badges.earnedAt));
  }

  async createBadge(insertBadge: InsertBadge): Promise<Badge> {
    const result = await this.db.insert(badges).values(insertBadge).returning();
    return result[0];
  }

  async getUserTokenCount(userId: string): Promise<number> {
    const result = await this.db.select().from(tokens)
      .where(eq(tokens.creatorId, userId));
    return result.length;
  }

  async seedPlatformToken(): Promise<void> {
    try {
      const PLATFORM_TOKEN_ADDRESS = '0x6cDa3b61128aDeB94FFC8ec124D18bc099E8eb3d';
      const platformTokenId = '3baf19a2-49b3-4f27-92b0-cd5a3028c53f';
      
      // Check if BMEM already exists
      const existingToken = await this.getToken(platformTokenId);
      if (existingToken) {
        console.log('✅ BMEM platform token already exists');
        return;
      }
      
      // Create platform creator user if not exists
      const creatorId = '765f084e-532e-4698-8277-3a2c573906c3';
      const existingUser = await this.getUser(creatorId);
      if (!existingUser) {
        try {
          await this.db.insert(users).values({
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
        } catch (error: any) {
          // User already exists with this wallet address - that's OK
          if (error.code !== '23505') {
            throw error;
          }
        }
      }
      
      // Add BMEM platform token
      await this.db.insert(tokens).values({
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
      
      console.log('✅ BMEM platform token seeded successfully');
    } catch (error) {
      console.error('❌ Failed to seed platform token:', error);
    }
  }

  async getPrediction(id: string): Promise<Prediction | undefined> {
    const result = await this.db.select().from(predictions).where(eq(predictions.id, id)).limit(1);
    return result[0];
  }

  async getPredictionByCastUrl(castUrl: string): Promise<Prediction | undefined> {
    const result = await this.db.select().from(predictions).where(eq(predictions.castUrl, castUrl)).limit(1);
    return result[0];
  }

  async getAllPredictions(): Promise<Prediction[]> {
    return await this.db.select().from(predictions).orderBy(desc(predictions.createdAt));
  }

  async getActivePredictions(): Promise<Prediction[]> {
    return await this.db.select().from(predictions)
      .where(eq(predictions.status, 'active'))
      .orderBy(desc(predictions.createdAt));
  }

  async createPrediction(insertPrediction: InsertPrediction): Promise<Prediction> {
    const result = await this.db.insert(predictions).values(insertPrediction).returning();
    return result[0];
  }

  async updatePrediction(id: string, updates: Partial<Prediction>): Promise<Prediction | undefined> {
    const result = await this.db.update(predictions).set(updates).where(eq(predictions.id, id)).returning();
    return result[0];
  }

  async getBet(id: string): Promise<Bet | undefined> {
    const result = await this.db.select().from(bets).where(eq(bets.id, id)).limit(1);
    return result[0];
  }

  async getBetsByPrediction(predictionId: string): Promise<Bet[]> {
    return await this.db.select().from(bets)
      .where(eq(bets.predictionId, predictionId))
      .orderBy(desc(bets.createdAt));
  }

  async getBetsByUser(userId: string): Promise<Bet[]> {
    return await this.db.select().from(bets)
      .where(eq(bets.userId, userId))
      .orderBy(desc(bets.createdAt));
  }

  async createBet(insertBet: InsertBet): Promise<Bet> {
    const result = await this.db.insert(bets).values(insertBet).returning();
    return result[0];
  }

  async updateBet(id: string, updates: Partial<Bet>): Promise<Bet | undefined> {
    const result = await this.db.update(bets).set(updates).where(eq(bets.id, id)).returning();
    return result[0];
  }

  async getX402Payment(id: string): Promise<X402Payment | undefined> {
    const result = await this.db.select().from(x402Payments).where(eq(x402Payments.id, id)).limit(1);
    return result[0];
  }

  async getX402PaymentsByUser(userId: string): Promise<X402Payment[]> {
    return await this.db.select().from(x402Payments)
      .where(eq(x402Payments.userId, userId))
      .orderBy(desc(x402Payments.createdAt));
  }

  async getX402PaymentsByFeature(feature: string): Promise<X402Payment[]> {
    return await this.db.select().from(x402Payments)
      .where(eq(x402Payments.feature, feature))
      .orderBy(desc(x402Payments.createdAt));
  }

  async createX402Payment(insertPayment: InsertX402Payment): Promise<X402Payment> {
    const result = await this.db.insert(x402Payments).values(insertPayment).returning();
    return result[0];
  }

  async updateX402Payment(id: string, updates: Partial<X402Payment>): Promise<X402Payment | undefined> {
    const result = await this.db.update(x402Payments).set(updates).where(eq(x402Payments.id, id)).returning();
    return result[0];
  }

  async getLimitOrder(id: string): Promise<LimitOrder | undefined> {
    const result = await this.db.select().from(limitOrders).where(eq(limitOrders.id, id)).limit(1);
    return result[0];
  }

  async getLimitOrdersByUser(userId: string): Promise<LimitOrder[]> {
    return await this.db.select().from(limitOrders)
      .where(eq(limitOrders.userId, userId))
      .orderBy(desc(limitOrders.createdAt));
  }

  async getPendingLimitOrders(): Promise<LimitOrder[]> {
    return await this.db.select().from(limitOrders)
      .where(eq(limitOrders.status, 'pending'))
      .orderBy(desc(limitOrders.createdAt));
  }

  async getFillableLimitOrders(): Promise<LimitOrder[]> {
    return await this.db.select().from(limitOrders)
      .where(or(
        eq(limitOrders.status, 'fillable'),
        eq(limitOrders.status, 'ready_to_execute')
      ))
      .orderBy(desc(limitOrders.createdAt));
  }

  async getReadyLimitOrders(userId: string): Promise<LimitOrder[]> {
    return await this.db.select().from(limitOrders)
      .where(and(
        eq(limitOrders.userId, userId),
        eq(limitOrders.status, 'fillable')
      ))
      .orderBy(desc(limitOrders.createdAt));
  }

  async getAllLimitOrders(): Promise<LimitOrder[]> {
    return await this.db.select().from(limitOrders);
  }

  async createLimitOrder(insertOrder: InsertLimitOrder): Promise<LimitOrder> {
    const result = await this.db.insert(limitOrders).values(insertOrder).returning();
    return result[0];
  }

  async updateLimitOrder(id: string, updates: Partial<LimitOrder>): Promise<LimitOrder | undefined> {
    const result = await this.db.update(limitOrders).set(updates).where(eq(limitOrders.id, id)).returning();
    return result[0];
  }

  async cancelLimitOrder(id: string): Promise<boolean> {
    const result = await this.db.update(limitOrders)
      .set({ status: 'cancelled' })
      .where(eq(limitOrders.id, id))
      .returning();
    return result.length > 0;
  }

  async getExternalToken(address: string): Promise<ExternalToken | undefined> {
    const result = await this.db.select().from(externalTokens)
      .where(eq(externalTokens.address, address.toLowerCase()));
    return result[0];
  }

  async getExternalTokensByAddresses(addresses: string[]): Promise<ExternalToken[]> {
    if (addresses.length === 0) return [];
    const lowerAddresses = addresses.map(a => a.toLowerCase());
    const result = await this.db.select().from(externalTokens);
    return result.filter(token => lowerAddresses.includes(token.address.toLowerCase()));
  }

  async createExternalToken(insertToken: InsertExternalToken): Promise<ExternalToken> {
    const tokenData = {
      ...insertToken,
      address: insertToken.address.toLowerCase(),
    };
    const result = await this.db.insert(externalTokens).values(tokenData).returning();
    return result[0];
  }

  async updateExternalToken(address: string, updates: Partial<ExternalToken>): Promise<ExternalToken | undefined> {
    const result = await this.db.update(externalTokens)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(externalTokens.address, address.toLowerCase()))
      .returning();
    return result[0];
  }

  async upsertExternalToken(insertToken: InsertExternalToken): Promise<ExternalToken> {
    const existing = await this.getExternalToken(insertToken.address);
    if (existing) {
      const updated = await this.updateExternalToken(insertToken.address, insertToken);
      return updated as ExternalToken;
    }
    return await this.createExternalToken(insertToken);
  }

  async getRugProtection(id: string): Promise<RugProtection | undefined> {
    const [result] = await this.db.select().from(rugProtection).where(eq(rugProtection.id, id));
    return result;
  }

  async getRugProtectionsByUser(userId: string): Promise<RugProtection[]> {
    return await this.db.select().from(rugProtection)
      .where(eq(rugProtection.userId, userId))
      .orderBy(desc(rugProtection.createdAt));
  }

  async getActiveRugProtections(): Promise<RugProtection[]> {
    return await this.db.select().from(rugProtection)
      .where(eq(rugProtection.status, 'active'))
      .orderBy(desc(rugProtection.createdAt));
  }

  async getRugProtectionByToken(userWalletAddress: string, tokenAddress: string): Promise<RugProtection | undefined> {
    const [result] = await this.db.select().from(rugProtection)
      .where(and(
        eq(rugProtection.userWalletAddress, userWalletAddress.toLowerCase()),
        eq(rugProtection.tokenAddress, tokenAddress.toLowerCase())
      ));
    return result;
  }

  async createRugProtection(insertEntry: InsertRugProtection): Promise<RugProtection> {
    const [result] = await this.db.insert(rugProtection).values({
      ...insertEntry,
      tokenAddress: insertEntry.tokenAddress.toLowerCase(),
      userWalletAddress: insertEntry.userWalletAddress.toLowerCase(),
    }).returning();
    return result;
  }

  async updateRugProtection(id: string, updates: Partial<RugProtection>): Promise<RugProtection | undefined> {
    const [result] = await this.db.update(rugProtection)
      .set(updates)
      .where(eq(rugProtection.id, id))
      .returning();
    return result;
  }

  async deleteRugProtection(id: string): Promise<boolean> {
    const result = await this.db.delete(rugProtection).where(eq(rugProtection.id, id));
    return (result?.rowCount ?? 0) > 0;
  }

  async getMemeAgent(id: string): Promise<MemeAgent | undefined> {
    const [result] = await this.db.select().from(memeAgents).where(eq(memeAgents.id, id));
    return result;
  }

  // ── Memetic Fractions ──────────────────────────────────────────────────────

  async getAllFractionCollections(): Promise<FractionCollection[]> {
    return await this.db.select().from(fractionCollections)
      .where(eq(fractionCollections.isActive, true))
      .orderBy(desc(fractionCollections.createdAt));
  }

  async getFractionCollection(id: string): Promise<FractionCollection | undefined> {
    const [result] = await this.db.select().from(fractionCollections).where(eq(fractionCollections.id, id));
    return result;
  }

  async createFractionCollection(col: InsertFractionCollection): Promise<FractionCollection> {
    const [result] = await this.db.insert(fractionCollections).values(col).returning();
    return result;
  }

  async updateFractionCollection(id: string, updates: Partial<FractionCollection>): Promise<FractionCollection | undefined> {
    const [result] = await this.db.update(fractionCollections).set(updates).where(eq(fractionCollections.id, id)).returning();
    return result;
  }

  async getFractionHoldingsByWallet(walletAddress: string): Promise<FractionHolding[]> {
    return await this.db.select().from(fractionHoldings)
      .where(eq(fractionHoldings.walletAddress, walletAddress.toLowerCase()))
      .orderBy(desc(fractionHoldings.fractionAmount));
  }

  async getFractionHolding(walletAddress: string, collectionId: string): Promise<FractionHolding | undefined> {
    const [result] = await this.db.select().from(fractionHoldings)
      .where(and(
        eq(fractionHoldings.walletAddress, walletAddress.toLowerCase()),
        eq(fractionHoldings.collectionId, collectionId),
      ));
    return result;
  }

  async upsertFractionHolding(walletAddress: string, collectionId: string, amountDelta: number): Promise<FractionHolding> {
    const existing = await this.getFractionHolding(walletAddress, collectionId);
    const now = new Date();
    if (existing) {
      const [result] = await this.db.update(fractionHoldings)
        .set({ fractionAmount: existing.fractionAmount + amountDelta, updatedAt: now })
        .where(eq(fractionHoldings.id, existing.id))
        .returning();
      return result;
    }
    const [result] = await this.db.insert(fractionHoldings).values({
      walletAddress: walletAddress.toLowerCase(),
      collectionId,
      fractionAmount: Math.max(0, amountDelta),
      updatedAt: now,
    }).returning();
    return result;
  }

  async updateFractionHolding(id: string, updates: Partial<FractionHolding>): Promise<FractionHolding | undefined> {
    const [result] = await this.db.update(fractionHoldings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(fractionHoldings.id, id))
      .returning();
    return result;
  }

  // ── Fraction Listings ──────────────────────────────────────────────────────

  async createFractionListing(listing: InsertFractionListing): Promise<FractionListing> {
    const [result] = await this.db.insert(fractionListings).values({
      ...listing,
      sellerAddress: listing.sellerAddress.toLowerCase(),
    }).returning();
    return result;
  }

  async getFractionListingsByCollection(collectionId: string): Promise<FractionListing[]> {
    return await this.db.select().from(fractionListings)
      .where(and(
        eq(fractionListings.collectionId, collectionId),
        eq(fractionListings.status, "active"),
      ))
      .orderBy(fractionListings.pricePerFraction);
  }

  async getFractionListingsByWallet(walletAddress: string): Promise<FractionListing[]> {
    return await this.db.select().from(fractionListings)
      .where(eq(fractionListings.sellerAddress, walletAddress.toLowerCase()))
      .orderBy(desc(fractionListings.createdAt));
  }

  async getFractionListing(id: string): Promise<FractionListing | undefined> {
    const [result] = await this.db.select().from(fractionListings).where(eq(fractionListings.id, id));
    return result;
  }

  async updateFractionListing(id: string, updates: Partial<FractionListing>): Promise<FractionListing | undefined> {
    const [result] = await this.db.update(fractionListings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(fractionListings.id, id))
      .returning();
    return result;
  }

  async getMemeAgentByWallet(walletAddress: string): Promise<MemeAgent | undefined> {
    const [result] = await this.db.select().from(memeAgents)
      .where(eq(memeAgents.walletAddress, walletAddress.toLowerCase()))
      .orderBy(desc(memeAgents.createdAt));
    return result;
  }

  async getMemeAgentsByWallet(walletAddress: string): Promise<MemeAgent[]> {
    return await this.db.select().from(memeAgents)
      .where(eq(memeAgents.walletAddress, walletAddress.toLowerCase()))
      .orderBy(desc(memeAgents.createdAt));
  }

  async getAllMemeAgents(): Promise<MemeAgent[]> {
    return await this.db.select().from(memeAgents)
      .where(eq(memeAgents.isActive, true))
      .orderBy(
        sql`CASE WHEN ${memeAgents.boostedUntil} > now() THEN 1 ELSE 0 END DESC`,
        desc(memeAgents.reputationScore),
      );
  }

  async createMemeAgent(agent: InsertMemeAgent & { agentId: string }): Promise<MemeAgent> {
    const [result] = await this.db.insert(memeAgents).values({
      ...agent,
      walletAddress: agent.walletAddress.toLowerCase(),
    }).returning();
    return result;
  }

  async updateMemeAgent(id: string, updates: Partial<MemeAgent>): Promise<MemeAgent | undefined> {
    const [result] = await this.db.update(memeAgents)
      .set(updates)
      .where(eq(memeAgents.id, id))
      .returning();
    return result;
  }

  async clearAllAgents(): Promise<void> {
    await this.db.delete(agentServiceRequests);
    await this.db.delete(memeAgents);
  }

  async getAgentServiceRequest(id: string): Promise<AgentServiceRequest | undefined> {
    const [result] = await this.db.select().from(agentServiceRequests).where(eq(agentServiceRequests.id, id));
    return result;
  }

  async getAgentServiceRequestsByAgent(agentId: string): Promise<AgentServiceRequest[]> {
    return await this.db.select().from(agentServiceRequests)
      .where(or(
        eq(agentServiceRequests.fromAgentId, agentId),
        eq(agentServiceRequests.toAgentId, agentId)
      ))
      .orderBy(desc(agentServiceRequests.createdAt));
  }

  async getAllAgentServiceRequests(): Promise<AgentServiceRequest[]> {
    return await this.db.select().from(agentServiceRequests)
      .orderBy(desc(agentServiceRequests.createdAt));
  }

  async createAgentServiceRequest(req: InsertAgentServiceRequest): Promise<AgentServiceRequest> {
    const [result] = await this.db.insert(agentServiceRequests).values(req).returning();
    return result;
  }

  async updateAgentServiceRequest(id: string, updates: Partial<AgentServiceRequest>): Promise<AgentServiceRequest | undefined> {
    const [result] = await this.db.update(agentServiceRequests)
      .set(updates)
      .where(eq(agentServiceRequests.id, id))
      .returning();
    return result;
  }

  // ── Agent Sessions ──────────────────────────────────────────────────────────

  async createAgentSession(session: InsertAgentSession): Promise<AgentSession> {
    const [result] = await this.db.insert(agentSessions).values(session).returning();
    return result;
  }

  async getAgentSession(token: string): Promise<AgentSession | undefined> {
    const [result] = await this.db.select().from(agentSessions).where(eq(agentSessions.token, token));
    return result;
  }

  async getAgentSessionsByWallet(walletAddress: string): Promise<AgentSession[]> {
    return await this.db.select().from(agentSessions)
      .where(eq(agentSessions.walletAddress, walletAddress.toLowerCase()))
      .orderBy(desc(agentSessions.createdAt));
  }

  async updateAgentSession(token: string, updates: Partial<AgentSession>): Promise<AgentSession | undefined> {
    const [result] = await this.db.update(agentSessions)
      .set(updates)
      .where(eq(agentSessions.token, token))
      .returning();
    return result;
  }

  async deleteAgentSession(token: string): Promise<boolean> {
    const result = await this.db.delete(agentSessions).where(eq(agentSessions.token, token)).returning();
    return result.length > 0;
  }

  // ── Agent TX Proposals ──────────────────────────────────────────────────────

  async createAgentTxProposal(proposal: InsertAgentTxProposal): Promise<AgentTxProposal> {
    const [result] = await this.db.insert(agentTxProposals).values(proposal).returning();
    return result;
  }

  async getAgentTxProposal(id: string): Promise<AgentTxProposal | undefined> {
    const [result] = await this.db.select().from(agentTxProposals).where(eq(agentTxProposals.id, id));
    return result;
  }

  async getAgentTxProposalsByWallet(walletAddress: string): Promise<AgentTxProposal[]> {
    return await this.db.select().from(agentTxProposals)
      .where(eq(agentTxProposals.walletAddress, walletAddress.toLowerCase()))
      .orderBy(desc(agentTxProposals.createdAt));
  }

  async updateAgentTxProposal(id: string, updates: Partial<AgentTxProposal>): Promise<AgentTxProposal | undefined> {
    const [result] = await this.db.update(agentTxProposals)
      .set(updates)
      .where(eq(agentTxProposals.id, id))
      .returning();
    return result;
  }
}

// Using DBStorage for persistent PostgreSQL database
// Database is enabled and ready!
export const storage = new DBStorage();
