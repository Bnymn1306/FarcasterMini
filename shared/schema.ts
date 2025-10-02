import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(),
  username: text("username"),
  avatarUrl: text("avatar_url"),
  farcasterUsername: text("farcaster_username"),
  farcasterFid: text("farcaster_fid"),
  currentStreak: integer("current_streak").default(0),
  longestStreak: integer("longest_streak").default(0),
  totalCheckIns: integer("total_check_ins").default(0),
  lastCheckIn: timestamp("last_check_in"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tokens = pgTable("tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id"),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  contractAddress: text("contract_address").unique(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const holdings = pgTable("holdings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenId: varchar("token_id").notNull().references(() => tokens.id),
  amount: text("amount").notNull(),
  averageBuyPrice: text("average_buy_price").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const priceAlerts = pgTable("price_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenId: varchar("token_id").notNull().references(() => tokens.id),
  targetPrice: text("target_price").notNull(),
  condition: text("condition").notNull(),
  isActive: boolean("is_active").default(true),
  isTriggered: boolean("is_triggered").default(false),
  notifyViaFarcaster: boolean("notify_via_farcaster").default(true),
  triggeredAt: timestamp("triggered_at"),
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

export const insertDailyCheckInSchema = createInsertSchema(dailyCheckIns).omit({
  id: true,
  rewardClaimed: true,
  createdAt: true,
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

export type InsertDailyCheckIn = z.infer<typeof insertDailyCheckInSchema>;
export type DailyCheckIn = typeof dailyCheckIns.$inferSelect;

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
  token: Token;
};
