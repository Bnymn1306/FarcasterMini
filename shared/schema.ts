import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(), // Base/EVM wallet
  solanaAddress: text("solana_address"), // Solana wallet address (linked via Farcaster)
  username: text("username"),
  avatarUrl: text("avatar_url"),
  farcasterUsername: text("farcaster_username"),
  farcasterFid: text("farcaster_fid"),
  farcasterNotificationToken: text("farcaster_notification_token"),
  farcasterNotificationUrl: text("farcaster_notification_url"),
  currentStreak: integer("current_streak").default(0),
  longestStreak: integer("longest_streak").default(0),
  totalCheckIns: integer("total_check_ins").default(0),
  lastCheckIn: timestamp("last_check_in"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Chain types for multi-chain support
export type ChainType = 'base' | 'solana' | 'soneium' | 'ink';

export const tokens = pgTable("tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id"),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  // Multi-chain support
  chain: text("chain").$type<ChainType>().notNull().default('base'),
  contractAddress: text("contract_address"), // EVM contract address (Base)
  mintAddress: text("mint_address"), // Solana SPL token mint address
  totalSupply: text("total_supply").notNull(),
  currentPrice: text("current_price").notNull().default("0"),
  marketCap: text("market_cap").notNull().default("0"),
  volume24h: text("volume_24h").notNull().default("0"),
  priceChange24h: text("price_change_24h").notNull().default("0"),
  holderCount: integer("holder_count").default(0),
  twitterUrl: text("twitter_url"),
  telegramUrl: text("telegram_url"),
  websiteUrl: text("website_url"),
  isVerified: boolean("is_verified").default(false),
  isPlatformToken: boolean("is_platform_token").default(false),
  // Cast Tokenization fields
  castHash: text("cast_hash"),
  castUrl: text("cast_url"),
  castAuthorFid: text("cast_author_fid"),
  castAuthorUsername: text("cast_author_username"),
  castAuthorDisplayName: text("cast_author_display_name"),
  castText: text("cast_text"),
  castLikes: integer("cast_likes").default(0),
  castRecasts: integer("cast_recasts").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tokenId: varchar("token_id").notNull().references(() => tokens.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  amount: text("amount").notNull(),
  price: text("price").notNull(),
  totalValue: text("total_value").notNull(),
  gasFee: text("gas_fee").notNull(),
  chain: text("chain").$type<ChainType>().notNull().default('base'),
  txSignature: text("tx_signature"), // Solana transaction signature
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const holdings = pgTable("holdings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenId: varchar("token_id").notNull().references(() => tokens.id),
  amount: text("amount").notNull(),
  averageBuyPrice: text("average_buy_price").notNull(),
  chain: text("chain").$type<ChainType>().notNull().default('base'),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const priceAlerts = pgTable("price_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenId: varchar("token_id").references(() => tokens.id),
  externalTokenAddress: text("external_token_address"),
  externalTokenSymbol: text("external_token_symbol"),
  externalTokenName: text("external_token_name"),
  externalTokenLogoUrl: text("external_token_logo_url"),
  targetPrice: text("target_price").notNull(),
  condition: text("condition").notNull(),
  isActive: boolean("is_active").default(true),
  isTriggered: boolean("is_triggered").default(false),
  notifyViaFarcaster: boolean("notify_via_farcaster").default(true),
  triggeredAt: timestamp("triggered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const externalTokens = pgTable("external_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull().unique(),
  chainId: integer("chain_id").notNull().default(8453),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  decimals: integer("decimals").notNull().default(18),
  logoUrl: text("logo_url"),
  currentPrice: text("current_price"),
  priceChange24h: text("price_change_24h"),
  volume24h: text("volume_24h"),
  liquidity: text("liquidity"),
  marketCap: text("market_cap"),
  dexScreenerUrl: text("dex_screener_url"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dailyCheckIns = pgTable("daily_check_ins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  checkInDate: timestamp("check_in_date").notNull(),
  streakDay: integer("streak_day").notNull(),
  rewardClaimed: boolean("reward_claimed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const badges = pgTable("badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  badgeType: text("badge_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  iconEmoji: text("icon_emoji").notNull(),
  nftTokenId: text("nft_token_id"),
  nftContractAddress: text("nft_contract_address"),
  milestone: integer("milestone").notNull(),
  earnedAt: timestamp("earned_at").defaultNow().notNull(),
});

export const predictions = pgTable("predictions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  marketId: integer("market_id").unique(),
  castUrl: text("cast_url").notNull().unique(),
  castHash: text("cast_hash").notNull(),
  castAuthorFid: text("cast_author_fid"),
  castAuthorUsername: text("cast_author_username"),
  castAuthorDisplayName: text("cast_author_display_name"),
  castText: text("cast_text"),
  castImageUrl: text("cast_image_url"),
  initialLikes: integer("initial_likes").default(0),
  initialRecasts: integer("initial_recasts").default(0),
  viralMetric: text("viral_metric").notNull().default("likes"),
  viralThreshold: integer("viral_threshold").notNull(),
  deadline: timestamp("deadline").notNull(),
  status: text("status").notNull().default("active"),
  totalPool: text("total_pool").notNull().default("0"),
  totalBetsFor: text("total_bets_for").notNull().default("0"),
  totalBetsAgainst: text("total_bets_against").notNull().default("0"),
  winningOutcome: text("winning_outcome"),
  tokenId: varchar("token_id").references(() => tokens.id),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bets = pgTable("bets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  predictionId: varchar("prediction_id").notNull().references(() => predictions.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  betAmount: text("bet_amount").notNull(),
  predictedOutcome: text("predicted_outcome").notNull(),
  payout: text("payout").default("0"),
  claimed: boolean("claimed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const x402Payments = pgTable("x402_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull(),
  feature: text("feature").notNull(),
  amount: text("amount").notNull(),
  currency: text("currency").notNull().default("USDC"),
  network: text("network").notNull().default("base-sepolia"),
  txHash: text("tx_hash"),
  status: text("status").notNull().default("pending"),
  paymentProof: text("payment_proof"),
  metadata: text("metadata"),
  errorMessage: text("error_message"),
  verifiedAt: timestamp("verified_at"),
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const limitOrders = pgTable("limit_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  userWalletAddress: text("user_wallet_address"),
  tokenId: varchar("token_id").references(() => tokens.id),
  tokenAddress: text("token_address").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  orderType: text("order_type").notNull(),
  targetPrice: text("target_price"),
  ethAmount: text("eth_amount"),
  solAmount: text("sol_amount"), // For Solana orders
  tokenAmount: text("token_amount").notNull(),
  totalValue: text("total_value").notNull(),
  status: text("status").notNull().default("pending"),
  vaultVersion: text("vault_version").$type<'v1' | 'v2' | 'v3'>().default('v2'),
  vaultAddress: text("vault_address"),
  
  // Multi-chain support
  chain: text("chain").$type<ChainType>().notNull().default('base'),
  chainId: integer("chain_id").notNull().default(8453),
  signature: text("signature").notNull(),
  salt: text("salt").notNull(),
  orderHash: text("order_hash").notNull(),
  makerAmount: text("maker_amount").notNull(),
  takerAmount: text("taker_amount").notNull(),
  makerToken: text("maker_token").notNull(),
  takerToken: text("taker_token").notNull(),
  expiry: integer("expiry").notNull(),
  orderJson: text("order_json").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  orderSource: text("order_source").notNull().default("0x_native"),
  
  makerTokenFilledAmount: text("maker_token_filled_amount"),
  takerTokenFilledAmount: text("taker_token_filled_amount"),
  protocolFee: text("protocol_fee"),
  
  expiresAt: timestamp("expires_at"),
  filledAt: timestamp("filled_at"),
  filledPrice: text("filled_price"),
  txHash: text("tx_hash"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Rug Protection - vault-based token monitoring with auto-sell
export const rugProtection = pgTable("rug_protection", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  userWalletAddress: text("user_wallet_address").notNull(),
  tokenAddress: text("token_address").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  tokenName: text("token_name"),
  tokenDecimals: integer("token_decimals").default(18),
  depositAmount: text("deposit_amount").notNull(),
  vaultVersion: text("vault_version").$type<'v3'>().default('v3'),
  vaultAddress: text("vault_address").notNull(),
  status: text("status").$type<'active' | 'sold' | 'withdrawn' | 'failed'>().notNull().default('active'),
  autoSellEnabled: boolean("auto_sell_enabled").notNull().default(true),
  initialLiquidity: text("initial_liquidity"),
  initialOwner: text("initial_owner"),
  initialBuyTax: integer("initial_buy_tax"),
  initialSellTax: integer("initial_sell_tax"),
  lastSignalType: text("last_signal_type"),
  lastSignalSeverity: text("last_signal_severity"),
  lastSignalMessage: text("last_signal_message"),
  soldPrice: text("sold_price"),
  soldAmount: text("sold_amount"),
  txHash: text("tx_hash"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  soldAt: timestamp("sold_at"),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  currentStreak: true,
  longestStreak: true,
  totalCheckIns: true,
  lastCheckIn: true,
  createdAt: true,
});

export const insertTokenSchema = createInsertSchema(tokens).omit({
  id: true,
  currentPrice: true,
  marketCap: true,
  volume24h: true,
  priceChange24h: true,
  holderCount: true,
  isVerified: true,
  isPlatformToken: true,
  createdAt: true,
});

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  createdAt: true,
});

export const insertHoldingSchema = createInsertSchema(holdings).omit({
  id: true,
  updatedAt: true,
});

export const insertPriceAlertSchema = createInsertSchema(priceAlerts).omit({
  id: true,
  isActive: true,
  isTriggered: true,
  triggeredAt: true,
  createdAt: true,
});

export const insertExternalTokenSchema = createInsertSchema(externalTokens).omit({
  id: true,
  lastUpdated: true,
  createdAt: true,
});

export const insertDailyCheckInSchema = createInsertSchema(dailyCheckIns).omit({
  id: true,
  rewardClaimed: true,
  createdAt: true,
});

export const insertBadgeSchema = createInsertSchema(badges).omit({
  id: true,
  earnedAt: true,
});

export const insertPredictionSchema = createInsertSchema(predictions).omit({
  id: true,
  totalPool: true,
  totalBetsFor: true,
  totalBetsAgainst: true,
  status: true,
  winningOutcome: true,
  tokenId: true,
  resolvedAt: true,
  createdAt: true,
});

export const insertBetSchema = createInsertSchema(bets).omit({
  id: true,
  payout: true,
  claimed: true,
  createdAt: true,
});

export const insertX402PaymentSchema = createInsertSchema(x402Payments).omit({
  id: true,
  status: true,
  verifiedAt: true,
  settledAt: true,
  createdAt: true,
});

export const insertLimitOrderSchema = createInsertSchema(limitOrders).omit({
  id: true,
  status: true,
  filledAt: true,
  filledPrice: true,
  txHash: true,
  createdAt: true,
  chainId: true,
  schemaVersion: true,
  orderSource: true,
  makerTokenFilledAmount: true,
  takerTokenFilledAmount: true,
  protocolFee: true,
}).refine(
  (data) => {
    if (!data.targetPrice) return true;
    const targetPrice = parseFloat(data.targetPrice);
    return isFinite(targetPrice) && targetPrice > 0;
  },
  {
    message: "Target price must be a valid positive number",
    path: ["targetPrice"],
  }
).refine(
  (data) => {
    if (!data.ethAmount) return true; // Optional field for backward compatibility
    const ethAmount = parseFloat(data.ethAmount);
    return isFinite(ethAmount) && ethAmount > 0;
  },
  {
    message: "ETH amount must be a valid positive number",
    path: ["ethAmount"],
  }
).refine(
  (data) => {
    const tokenAmount = parseFloat(data.tokenAmount);
    return isFinite(tokenAmount) && tokenAmount > 0;
  },
  {
    message: "Token amount must be a valid positive number",
    path: ["tokenAmount"],
  }
).refine(
  (data) => {
    // Solana orders don't require vaultAddress
    if (data.chain === 'solana') {
      return true;
    }
    // Base BUY orders MUST have vaultAddress
    if (data.orderType === 'buy') {
      return !!data.vaultAddress && data.vaultAddress.length > 0;
    }
    // Base SELL orders MUST NOT have vaultAddress (vault bypass)
    if (data.orderType === 'sell') {
      return !data.vaultAddress || data.vaultAddress === null;
    }
    return true;
  },
  {
    message: "Base BUY orders require vaultAddress; SELL orders must have vaultAddress=null",
    path: ["vaultAddress"],
  }
);

export const insertRugProtectionSchema = createInsertSchema(rugProtection).omit({
  id: true,
  status: true,
  lastSignalType: true,
  lastSignalSeverity: true,
  lastSignalMessage: true,
  soldPrice: true,
  soldAmount: true,
  txHash: true,
  failureReason: true,
  createdAt: true,
  soldAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertToken = z.infer<typeof insertTokenSchema>;
export type Token = typeof tokens.$inferSelect;

export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof trades.$inferSelect;

export type InsertHolding = z.infer<typeof insertHoldingSchema>;
export type Holding = typeof holdings.$inferSelect;

export type InsertPriceAlert = z.infer<typeof insertPriceAlertSchema>;
export type PriceAlert = typeof priceAlerts.$inferSelect;

export type InsertExternalToken = z.infer<typeof insertExternalTokenSchema>;
export type ExternalToken = typeof externalTokens.$inferSelect;

export type InsertDailyCheckIn = z.infer<typeof insertDailyCheckInSchema>;
export type DailyCheckIn = typeof dailyCheckIns.$inferSelect;

export type InsertBadge = z.infer<typeof insertBadgeSchema>;
export type Badge = typeof badges.$inferSelect;

export type InsertPrediction = z.infer<typeof insertPredictionSchema>;
export type Prediction = typeof predictions.$inferSelect;

export type InsertBet = z.infer<typeof insertBetSchema>;
export type Bet = typeof bets.$inferSelect;

export type InsertX402Payment = z.infer<typeof insertX402PaymentSchema>;
export type X402Payment = typeof x402Payments.$inferSelect;

export type InsertLimitOrder = z.infer<typeof insertLimitOrderSchema>;
export type LimitOrder = typeof limitOrders.$inferSelect;

export type LimitOrderWithToken = LimitOrder & {
  token?: Token;
};

export type TokenWithCreator = Token & {
  creator: User;
};

export type HoldingWithToken = Holding & {
  token: Token;
};

export type TradeWithUser = Trade & {
  user: User;
};

export type PriceAlertWithToken = PriceAlert & {
  token?: Token | null;
};

export type PriceAlertDisplay = PriceAlert & {
  displayName: string;
  displaySymbol: string;
  displayLogoUrl: string | null;
  tokenAddress: string | null;
  isExternal: boolean;
};

export type PredictionWithBets = Prediction & {
  bets: Bet[];
  creator: User;
};

export type BetWithPrediction = Bet & {
  prediction: Prediction;
  user: User;
};

export type InsertRugProtection = z.infer<typeof insertRugProtectionSchema>;
export type RugProtection = typeof rugProtection.$inferSelect;

// ── Memetic Fractions (DN404 / ERC-404 inspired) ─────────────────────────────

export const fractionCollections = pgTable("fraction_collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  imageGradient: text("image_gradient").notNull().default("from-purple-500 to-cyan-500"),
  emoji: text("emoji").notNull().default("🐸"),
  totalSupply: integer("total_supply").notNull().default(1_000_000),
  pricePerFraction: text("price_per_fraction").notNull().default("0.000001"),
  holderCount: integer("holder_count").notNull().default(0),
  fractionsCirculating: integer("fractions_circulating").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  creatorWalletAddress: text("creator_wallet_address"),
  creationTxHash: text("creation_tx_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const fractionHoldings = pgTable("fraction_holdings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  collectionId: varchar("collection_id").notNull(),
  fractionAmount: integer("fraction_amount").notNull().default(0),
  rarityScore: integer("rarity_score").notNull().default(50),
  gamblesCount: integer("gambles_count").notNull().default(0),
  lastGambledAt: timestamp("last_gambled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFractionCollectionSchema = createInsertSchema(fractionCollections).omit({
  id: true,
  holderCount: true,
  fractionsCirculating: true,
  createdAt: true,
});
export type InsertFractionCollection = z.infer<typeof insertFractionCollectionSchema>;
export type FractionCollection = typeof fractionCollections.$inferSelect;

export const insertFractionHoldingSchema = createInsertSchema(fractionHoldings).omit({
  id: true,
  rarityScore: true,
  gamblesCount: true,
  lastGambledAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFractionHolding = z.infer<typeof insertFractionHoldingSchema>;
export type FractionHolding = typeof fractionHoldings.$inferSelect;

// ── Fraction Listings (P2P secondary market) ──────────────────────────────────

export const fractionListings = pgTable("fraction_listings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collection_id").notNull(),
  sellerAddress: text("seller_address").notNull(),
  fractionAmount: integer("fraction_amount").notNull(),
  pricePerFraction: text("price_per_fraction").notNull(), // ETH string
  status: text("status").notNull().default("active"), // active | filled | cancelled
  buyerAddress: text("buyer_address"),
  saleTxHash: text("sale_tx_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFractionListingSchema = createInsertSchema(fractionListings).omit({
  id: true, status: true, buyerAddress: true, saleTxHash: true, createdAt: true, updatedAt: true,
});
export type InsertFractionListing = z.infer<typeof insertFractionListingSchema>;
export type FractionListing = typeof fractionListings.$inferSelect;

// ── Agent Hub ────────────────────────────────────────────────────────────────

export const memeAgents = pgTable("meme_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  name: text("name").notNull(),
  personality: text("personality").notNull().default("analyst"), // analyst | shiller | degen | whale | sniper
  bio: text("bio"),
  agentId: text("agent_id").notNull(), // ERC-8004 on-chain bytes32 agentId
  registrationTxHash: text("registration_tx_hash"), // Base mainnet tx hash
  metadataUri: text("metadata_uri"),                // IPFS/HTTPS metadata pointer
  reputationScore: integer("reputation_score").notNull().default(0),
  totalShills: integer("total_shills").notNull().default(0),
  totalServicesDone: integer("total_services_done").notNull().default(0),
  totalEndorsements: integer("total_endorsements").notNull().default(0),
  boostedUntil: timestamp("boosted_until"), // when in the future, agent is featured/boosted
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMemeAgentSchema = createInsertSchema(memeAgents).omit({
  id: true,
  agentId: true,
  reputationScore: true,
  totalShills: true,
  totalServicesDone: true,
  totalEndorsements: true,
  boostedUntil: true,
  createdAt: true,
});

export type InsertMemeAgent = z.infer<typeof insertMemeAgentSchema>;
export type MemeAgent = typeof memeAgents.$inferSelect;

export const agentServiceRequests = pgTable("agent_service_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromAgentId: varchar("from_agent_id").notNull(),
  toAgentId: varchar("to_agent_id").notNull(),
  requestType: text("request_type").notNull().default("shill"), // shill | analysis | alert | collab
  description: text("description").notNull(),
  budget: text("budget").notNull().default("0"),
  budgetToken: text("budget_token").notNull().default("USDC"),
  status: text("status").notNull().default("pending"), // pending | accepted | completed | rejected
  onChainRequestId: text("on_chain_request_id"), // bytes32 requestId from ERC-8004 contract
  txHash: text("tx_hash"),                        // tx hash of emitServiceRequest call
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAgentServiceRequestSchema = createInsertSchema(agentServiceRequests).omit({
  id: true,
  status: true,
  createdAt: true,
});

export type InsertAgentServiceRequest = z.infer<typeof insertAgentServiceRequestSchema>;
export type AgentServiceRequest = typeof agentServiceRequests.$inferSelect;

// ── Agent Sessions (Connect Base Account) ────────────────────────────────────

export const agentSessions = pgTable("agent_sessions", {
  token: text("token").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  label: text("label").default("My Agent Session"),
  writeEnabled: boolean("write_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAgentSessionSchema = createInsertSchema(agentSessions).omit({ createdAt: true });
export type InsertAgentSession = z.infer<typeof insertAgentSessionSchema>;
export type AgentSession = typeof agentSessions.$inferSelect;

// ── Agent TX Proposals ────────────────────────────────────────────────────────

export const agentTxProposals = pgTable("agent_tx_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionToken: text("session_token").notNull(),
  walletAddress: text("wallet_address").notNull(),
  toolName: text("tool_name").notNull(),
  description: text("description").notNull(),
  deepLink: text("deep_link"),
  status: text("status").notNull().default("pending"),
  agentContext: text("agent_context"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAgentTxProposalSchema = createInsertSchema(agentTxProposals).omit({ id: true, status: true, createdAt: true });
export type InsertAgentTxProposal = z.infer<typeof insertAgentTxProposalSchema>;
export type AgentTxProposal = typeof agentTxProposals.$inferSelect;
