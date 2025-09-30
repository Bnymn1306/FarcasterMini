import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(),
  username: text("username"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tokens = pgTable("tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id").notNull().references(() => users.id),
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

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertTokenSchema = createInsertSchema(tokens).omit({
  id: true,
  currentPrice: true,
  marketCap: true,
  volume24h: true,
  priceChange24h: true,
  holderCount: true,
  contractAddress: true,
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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertToken = z.infer<typeof insertTokenSchema>;
export type Token = typeof tokens.$inferSelect;

export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof trades.$inferSelect;

export type InsertHolding = z.infer<typeof insertHoldingSchema>;
export type Holding = typeof holdings.$inferSelect;

export type TokenWithCreator = Token & {
  creator: User;
};

export type HoldingWithToken = Holding & {
  token: Token;
};

export type TradeWithUser = Trade & {
  user: User;
};
