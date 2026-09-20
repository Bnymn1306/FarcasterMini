import { Router } from "express";
import { z } from "zod";
import { AERODROME_SWAP_ROUTER, BASE_CHAIN_ID, BASE_USDC, B20_ASSETS, StockAgentError, addressSchema, asset, assetsResponse, createAerodromeQuote, getLegalFlags, liveAsset, portfolio, preflightSwap, tradeBlockingReasons, uintStringSchema } from "../services/stockAgentService";
import { askBase } from "../services/askBaseService";
import { consumeSharedAskRequest } from "../persistence/durableState";
export const stockAgentsRouter = Router();
const askRateLimits = new Map<string, { startedAt: number; count: number }>();
async function consumeAskRequest(key: string) {
  if (process.env.VERCEL) {
    try {
      return await consumeSharedAskRequest(key);
    } catch {
      throw new StockAgentError(503, "ASK_RATE_LIMIT_UNAVAILABLE", "Research is temporarily unavailable because shared rate limit storage is unavailable.");
    }
  }
  const now = Date.now();
  if (askRateLimits.size > 2_000) {
    askRateLimits.forEach((window, id) => {
      if (now - window.startedAt >= 60_000) askRateLimits.delete(id);
    });
  }
  const window = askRateLimits.get(key);
  if (!window || now - window.startedAt >= 60_000) {
    askRateLimits.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (window.count >= 10) return false;
  window.count += 1;
  return true;
}
const strategies = [
  { id: "balanced", name: "Balanced B20", description: "Diversifies equally across currently available B20 assets.", riskLevel: "moderate", timeHorizon: "long-term", assetSymbols: B20_ASSETS.map(a => a.symbol), disclaimer: "Informational allocation only; losses are possible and returns are not guaranteed." },
  { id: "focused", name: "Prompt Focus", description: "Tilts toward symbols or sectors mentioned in your prompt.", riskLevel: "higher", timeHorizon: "long-term", assetSymbols: B20_ASSETS.map(a => a.symbol), disclaimer: "Concentration can increase losses; this is not investment advice." },
];
function fail(res: any, e: unknown) { if (e instanceof StockAgentError) return res.status(e.status).json({ success: false, error: { code: e.code, message: e.message } }); if (e instanceof z.ZodError) return res.status(400).json({ success: false, error: { code: "INVALID_REQUEST", message: "Request validation failed.", details: e.flatten() } }); console.error("Stock agents error", e); return res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Request failed." } }); }
stockAgentsRouter.get("/assets", async (_req, res) => { try { res.json({ success: true, ...(await assetsResponse()) }); } catch (e) { fail(res, e); } });
stockAgentsRouter.get("/strategies", (_req, res) => res.json({ success: true, strategies, legal: getLegalFlags() }));
stockAgentsRouter.post("/ask", async (req, res) => { try {
  if (!await consumeAskRequest(req.ip || "unknown")) {
    throw new StockAgentError(429, "ASK_RATE_LIMITED", req.body?.language === "tr"
      ? "Çok fazla araştırma isteği gönderdiniz. Lütfen bir dakika sonra tekrar deneyin."
      : "Too many research requests. Please try again in one minute.");
  }
  const input = z.object({ message: z.string().trim().min(2).max(500), language: z.enum(["en", "tr"]).default("en") }).strict().parse(req.body);
  res.json({ success: true, ...(await askBase(input.message, input.language)) });
} catch (e) { fail(res, e); } });
stockAgentsRouter.post("/plan", async (req, res) => { try {
  const input = z.object({ prompt: z.string().trim().min(3).max(1000), walletAddress: addressSchema, strategyId: z.enum(["balanced", "focused"]).optional() }).strict().parse(req.body);
  const all = await assetsResponse(); const eligible = all.assets.filter(a => a.tradeAvailable);
  if (!eligible.length) throw new StockAgentError(503, "NO_TRADEABLE_ASSETS", "No B20 asset currently passes onchain safety checks.");
  const focused = input.strategyId === "focused" || (input.strategyId === undefined && eligible.some(a => input.prompt.toLowerCase().includes(a.symbol.toLowerCase()) || input.prompt.toLowerCase().includes(a.sector.toLowerCase())));
  const scores = eligible.map(a => ({ a, score: focused && (input.prompt.toLowerCase().includes(a.symbol.toLowerCase()) || input.prompt.toLowerCase().includes(a.sector.toLowerCase())) ? 2 : 1 }));
  const sum = scores.reduce((n, x) => n + x.score, 0);
  const allocations = scores.map((x, i) => ({ symbol: x.a.symbol, percentage: i === scores.length - 1 ? +(100 - scores.slice(0, -1).reduce((n, y) => n + Math.floor(y.score / sum * 10000) / 100, 0)).toFixed(2) : Math.floor(x.score / sum * 10000) / 100, rationale: x.score > 1 ? "Matched your stated symbol or sector preference." : "Included from currently available B20 assets for diversification." }));
  res.json({ success: true, summary: focused ? "Prompt-focused allocation across trade-enabled B20 assets." : "Balanced allocation across trade-enabled B20 assets.", riskLevel: focused ? "higher" : "moderate", allocations, warnings: ["Informational only; not investment advice.", "Issuer eligibility is enforced by token contracts and may prevent a trade.", ...all.assets.filter(a => !a.tradeAvailable).map(a => `${a.symbol} excluded: ${tradeBlockingReasons(a.reasons).join(", ") || "NO_APPROVED_ROUTE"}`), ...all.assets.filter(a => a.tradeAvailable && a.reasons.includes("FEED_STALE")).map(a => `${a.symbol}: reference price is delayed; execution uses a fresh Aerodrome quote.`)], generatedAt: new Date().toISOString(), legal: getLegalFlags() });
} catch (e) { fail(res, e); } });
stockAgentsRouter.get("/portfolio/:walletAddress", async (req, res) => { try { res.json({ success: true, ...(await portfolio(addressSchema.parse(req.params.walletAddress))) }); } catch (e) { fail(res, e); } });
stockAgentsRouter.post("/quote", async (req, res) => { try {
  const q = z.object({ walletAddress: addressSchema, buyToken: addressSchema, sellToken: addressSchema, sellAmount: uintStringSchema, slippageBps: z.number().int().min(1).max(500), chainId: z.literal(BASE_CHAIN_ID) }).strict().parse(req.body);
  const usdc = BASE_USDC.address.toLowerCase(); const sell = q.sellToken.toLowerCase(); const buy = q.buyToken.toLowerCase();
  if ((sell === usdc) === (buy === usdc)) throw new StockAgentError(400, "INVALID_PAIR", "Trades must be between Base USDC and one allowlisted B20 token.");
  const stock = asset(sell === usdc ? q.buyToken : q.sellToken);
  const [status, quote] = await Promise.all([
    liveAsset(stock),
    createAerodromeQuote(q.walletAddress, q.sellToken, q.buyToken, q.sellAmount, q.slippageBps),
  ]);
  const blockingReasons = tradeBlockingReasons(status.reasons);
  if (blockingReasons.length) throw new StockAgentError(409, "ASSET_UNAVAILABLE", "Asset failed onchain token safety checks.", blockingReasons);
  const preflight = await preflightSwap(q.walletAddress, q.sellToken, q.sellAmount, AERODROME_SWAP_ROUTER, quote.transaction);
  res.json({
    success: true,
    provider: "Aerodrome Slipstream",
    pool: quote.pool,
    quoteBlockNumber: quote.blockNumber,
    buyToken: q.buyToken,
    sellToken: q.sellToken,
    buyAmount: quote.buyAmount,
    minBuyAmount: quote.minBuyAmount,
    sellAmount: q.sellAmount,
    allowanceTarget: AERODROME_SWAP_ROUTER,
    transaction: quote.transaction,
    preflight,
    warnings: [
      "Review and explicitly approve this transaction in your wallet.",
      "Coinbase Tokenized Stocks are only available in eligible jurisdictions outside the United States.",
      "Issuer policy and venue checks may still prevent a trade.",
      ...(status.reasons.includes("FEED_STALE") ? ["The Chainlink reference price is delayed. This transaction uses a fresh Aerodrome pool quote instead."] : []),
      ...(preflight.hasBalance ? [] : [`Your wallet does not currently have enough ${sell === usdc ? "USDC" : stock.symbol} for this quote.`]),
    ],
    expiresAt: quote.expiresAt,
    legal: getLegalFlags(),
  });
} catch (e) { fail(res, e); } });