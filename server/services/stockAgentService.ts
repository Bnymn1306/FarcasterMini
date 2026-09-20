import { ethers } from "ethers";
import { z } from "zod";

export const BASE_CHAIN_ID = 8453;
export const BASE_USDC = { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, symbol: "USDC" } as const;
export const AERODROME_FACTORY = "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef";
export const AERODROME_QUOTER = "0x514c8B5f54112481E28028F1166Bd78501089259";
export const AERODROME_SWAP_ROUTER = "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F";
export const AERODROME_TICK_SPACING = 10;
export const AERODROME_STOCK_POOLS: Record<string, string> = {
  "0xb20000000000000000000078ee7ce2fe4908108c": "0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9",
  "0xb2000000000000000000002d0ba3164cc74f58b7": "0xB1987CAD1682841b4b641d50E520777eC5Ab5542",
  "0xb200000000000000000000c2e324d24d7eecd1fb": "0xA3b1E3f9747065e2073722Ff4c9027d3eA4994F0",
  "0xb2000000000000000000008bc8786b856e61707c": "0xEAF57753BC382E0324a1D43F72E7027705a2273E",
  "0xb200000000000000000000d9192b6b456483c2e8": "0xd03Bc8C7F2FAedCe2aac81bF0444AEA08Ea06E9b",
  "0xb200000000000000000000ab99cfa739e253872b": "0x7103eB3c9590d1281f7dc03b2A9EE27C39dF5D54",
  "0xb2000000000000000000004884b426556b92883d": "0x8b27f626ab668197000BC722A1012022CAeD10E2",
  "0xb200000000000000000000397293cb8cda9a10c5": "0x5A8236f575471e7BfCA2C8462a200c28f737246E",
  "0xb2000000000000000000007b9fcbd005511acbd5": "0x0bf58fe0FAc935Ac69595c19B12Ba0d75E3F8c0E",
  "0xb2000000000000000000001e800a7f5189430cd0": "0x469337fDcc5E8f38e2E4B670B04F57865D13a7BB",
};
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const SOURCE_URL = "https://docs.base.org/specifications/b20/tokenized-stocks-on-base";
// Catalog addresses and feeds were checked against the official Base B20 specification on this date.
const CHECKED_DATE = "2026-09-04";

export type StockAsset = { symbol: string; name: string; address: string; decimals: number; sector: string; feedAddress: string };
export const B20_ASSETS: StockAsset[] = [
  ["AAPLc","Apple","0xb200000000000000000000C2e324d24d7eEcd1fb","0x787f13dEa48Db0897CbCDD985de77809D837F988","Technology"],
  ["AMZNc","Amazon","0xb200000000000000000000d9192b6B456483C2E8","0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295","Consumer Discretionary"],
  ["COINc","Coinbase","0xb200000000000000000000c85a31389D71F3ecfb","0x408e44f504A7371a345F03a73dDC96A4b48e8aa7","Financial Services"],
  ["CRCLc","Circle","0xB20000000000000000000019f6E7C675b73C2e4D","0x0231cF2635D1E17bB5c2462cc7504Ba1fBd61f33","Financial Services"],
  ["GOOGLc","Alphabet","0xb2000000000000000000002D0BA3164cc74f58B7","0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2","Communication Services"],
  ["INTCc","Intel","0xB2000000000000000000004AFF16039bA04bdFBc","0xAB657C39bac0D5886250D70849e2E3E008F2EECB","Semiconductors"],
  ["METAc","Meta","0xb2000000000000000000008bC8786B856E61707C","0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D","Communication Services"],
  ["MSFTc","Microsoft","0xb200000000000000000000Ab99cFa739E253872B","0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c","Technology"],
  ["MSTRc","Strategy","0xb2000000000000000000004884b426556b92883d","0xB3cE282CD188b35DA0E38D8Bc7d58e33173D202a","Financial Services"],
  ["NVDAc","NVIDIA","0xb20000000000000000000078ee7ce2fE4908108C","0x04689a41629776563E6822F76f2e57D148d28513","Semiconductors"],
  ["SNDKc","Sandisk","0xb200000000000000000000397293Cb8cda9a10c5","0x388b0dC46C0Fb05A74BeE0994fa5b02c6Fcca2eA","Technology"],
  ["SPCXc","SpaceX","0xb2000000000000000000007b9fcbd005511aCBd5","0x6A634B235903C4ad6376892180d6fF8612e3Fa68","Industrials"],
  ["TSLAc","Tesla","0xb2000000000000000000001e800a7f5189430cD0","0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4","Consumer Discretionary"],
].map(([symbol, name, address, feedAddress, sector]) => ({
  symbol,
  name,
  address: address.toLowerCase(),
  feedAddress: feedAddress.toLowerCase(),
  sector,
  decimals: 8,
}));

export const addressSchema = z.string().refine(ethers.isAddress, "Invalid EVM address");
export const uintStringSchema = z.string().regex(/^[0-9]+$/, "Must be an unsigned integer").refine(v => BigInt(v) > BigInt(0), "Must be greater than zero");
export class StockAgentError extends Error { constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); } }
const legal = { informationalOnly: true, notInvestmentAdvice: true, noGuaranteedReturns: true, eligibilityIssuerEnforced: true, explicitWalletApprovalRequired: true } as const;
export const getLegalFlags = () => legal;
export const catalogMetadata = { sourceUrl: SOURCE_URL, checkedDate: CHECKED_DATE };

let provider: ethers.JsonRpcProvider | undefined;
async function rpc() {
  if (!process.env.BASE_RPC_URL) throw new StockAgentError(503, "RPC_UNAVAILABLE", "BASE_RPC_URL is not configured.");
  provider ??= new ethers.JsonRpcProvider(process.env.BASE_RPC_URL, BASE_CHAIN_ID, { staticNetwork: true, batchMaxCount: 1 });
  if (Number((await provider.getNetwork()).chainId) !== BASE_CHAIN_ID) throw new StockAgentError(503, "WRONG_CHAIN", "RPC must be Base mainnet (8453).");
  return provider;
}
const erc20 = new ethers.Interface([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);
const b20 = new ethers.Interface(["function multiplier() view returns (uint256)"]);
const feed = new ethers.Interface(["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"]);
const aerodromeFactory = new ethers.Interface([
  "function getPool(address tokenA,address tokenB,int24 tickSpacing) view returns (address)",
]);
const aerodromeQuoter = new ethers.Interface([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,int24 tickSpacing,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
const aerodromeRouter = new ethers.Interface([
  "function factory() view returns (address)",
  "function exactInputSingle((address tokenIn,address tokenOut,int24 tickSpacing,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
]);
const multicall = new ethers.Interface([
  "function aggregate3(tuple(address target,bool allowFailure,bytes callData)[] calls) payable returns (tuple(bool success,bytes returnData)[] returnData)",
]);
async function call(p: ethers.JsonRpcProvider, to: string, i: ethers.Interface, method: string, args: unknown[] = []) {
  return i.decodeFunctionResult(method, await p.call({ to, data: i.encodeFunctionData(method, args) }));
}
export type AssetLive = { price: number | null; priceRaw: string | null; priceUpdatedAt: string | null; multiplier: string; available: boolean; reasons: string[] };
export function tradeBlockingReasons(reasons: string[]) {
  return reasons.filter(reason => !reason.startsWith("FEED_"));
}
const liveCache = new Map<string, { expiresAt: number; value: AssetLive }>();
const liveInFlight = new Map<string, Promise<AssetLive>>();
export async function liveAsset(asset: StockAsset): Promise<AssetLive> {
  const key = asset.address.toLowerCase();
  const cached = liveCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = liveInFlight.get(key);
  if (pending) return pending;
  const task = (async () => {
    const p = await rpc();
    const reasons: string[] = [];
    let multiplier = "0";
    let price: number | null = null;
    let priceRaw: string | null = null;
    let priceUpdatedAt: string | null = null;
    const [multiplierResult, feedResult] = await Promise.allSettled([
      call(p, asset.address, b20, "multiplier"),
      call(p, asset.feedAddress, feed, "latestRoundData"),
    ]);
    if (multiplierResult.status === "fulfilled") {
      multiplier = multiplierResult.value[0].toString();
      if (BigInt(multiplier) <= BigInt(0)) reasons.push("INVALID_MULTIPLIER");
    } else {
      reasons.push("TOKEN_STATUS_UNAVAILABLE");
    }
    if (feedResult.status === "fulfilled") {
      const [roundId, answer, , updatedAt, answeredInRound] = feedResult.value.map(BigInt);
      const updated = Number(updatedAt);
      const now = Math.floor(Date.now() / 1000);
      if (answer <= BigInt(0)) reasons.push("FEED_NON_POSITIVE");
      if (answeredInRound < roundId) reasons.push("FEED_ROUND_INCOMPLETE");
      // Official Base docs specify 8 decimals and a 24-hour heartbeat.
      if (updated === 0 || updated > now + 300 || now - updated > 24 * 60 * 60) reasons.push("FEED_STALE");
      // Keep the last valid observation visible even when it is outside the
      // freshness window. It remains reference-only; execution is authorized
      // by a fresh venue quote and the exact transaction simulation.
      if (answer > BigInt(0) && answeredInRound >= roundId && updated > 0 && updated <= now + 300) {
        priceRaw = answer.toString();
        price = Number(answer) / 1e8;
        priceUpdatedAt = new Date(updated * 1000).toISOString();
      }
    } else {
      reasons.push("FEED_STATUS_UNAVAILABLE");
    }
    const value = { price, priceRaw, priceUpdatedAt, multiplier, available: reasons.length === 0, reasons };
    liveCache.set(key, { expiresAt: Date.now() + 60_000, value });
    return value;
  })().finally(() => liveInFlight.delete(key));
  liveInFlight.set(key, task);
  return task;
}
async function allLiveAssets(): Promise<AssetLive[]> {
  const cached = B20_ASSETS.map(asset => liveCache.get(asset.address.toLowerCase()));
  if (cached.every(entry => entry && entry.expiresAt > Date.now())) {
    return cached.map(entry => entry!.value);
  }
  const p = await rpc();
  const calls = B20_ASSETS.flatMap(asset => [
    { target: asset.address, allowFailure: true, callData: b20.encodeFunctionData("multiplier") },
    { target: asset.feedAddress, allowFailure: true, callData: feed.encodeFunctionData("latestRoundData") },
  ]);
  const encoded = multicall.encodeFunctionData("aggregate3", [calls]);
  const raw = await p.call({ to: MULTICALL3, data: encoded });
  const results = multicall.decodeFunctionResult("aggregate3", raw)[0] as Array<{ success: boolean; returnData: string }>;
  const now = Math.floor(Date.now() / 1000);
  return B20_ASSETS.map((asset, index) => {
    const reasons: string[] = [];
    let multiplier = "0";
    let price: number | null = null;
    let priceRaw: string | null = null;
    let priceUpdatedAt: string | null = null;
    const multiplierCall = results[index * 2];
    const feedCall = results[index * 2 + 1];
    if (multiplierCall?.success) {
      multiplier = b20.decodeFunctionResult("multiplier", multiplierCall.returnData)[0].toString();
      if (BigInt(multiplier) <= BigInt(0)) reasons.push("INVALID_MULTIPLIER");
    } else {
      reasons.push("TOKEN_STATUS_UNAVAILABLE");
    }
    if (feedCall?.success) {
      const round = feed.decodeFunctionResult("latestRoundData", feedCall.returnData);
      const roundId = BigInt(round[0]);
      const answer = BigInt(round[1]);
      const updated = Number(round[3]);
      const answeredInRound = BigInt(round[4]);
      if (answer <= BigInt(0)) reasons.push("FEED_NON_POSITIVE");
      if (answeredInRound < roundId) reasons.push("FEED_ROUND_INCOMPLETE");
      if (updated === 0 || updated > now + 300 || now - updated > 24 * 60 * 60) reasons.push("FEED_STALE");
      if (answer > BigInt(0) && answeredInRound >= roundId && updated > 0 && updated <= now + 300) {
        priceRaw = answer.toString();
        price = Number(answer) / 1e8;
        priceUpdatedAt = new Date(updated * 1000).toISOString();
      }
    } else {
      reasons.push("FEED_STATUS_UNAVAILABLE");
    }
    const value = { price, priceRaw, priceUpdatedAt, multiplier, available: reasons.length === 0, reasons };
    liveCache.set(asset.address.toLowerCase(), { expiresAt: Date.now() + 60_000, value });
    return value;
  });
}
export async function assetsResponse() {
  const live = await allLiveAssets();
  return {
    chainId: BASE_CHAIN_ID,
    usdc: BASE_USDC,
    assets: B20_ASSETS.map((asset, i) => ({
      symbol: asset.symbol,
      name: asset.name,
      address: asset.address,
      decimals: asset.decimals,
      sector: asset.sector,
      price: live[i].price,
      priceUpdatedAt: live[i].priceUpdatedAt,
      multiplier: live[i].multiplier,
      available: live[i].available,
      tradeAvailable: Boolean(AERODROME_STOCK_POOLS[asset.address.toLowerCase()])
        && tradeBlockingReasons(live[i].reasons).length === 0,
      authorized: null,
      executionAvailable: Boolean(AERODROME_STOCK_POOLS[asset.address.toLowerCase()]),
      executionVenue: AERODROME_STOCK_POOLS[asset.address.toLowerCase()] ? "Aerodrome Slipstream" : null,
      reasons: live[i].reasons,
    })),
    legal,
  };
}
export function asset(address: string) {
  const result = B20_ASSETS.find(a => a.address.toLowerCase() === address.toLowerCase());
  if (!result) throw new StockAgentError(400, "ASSET_NOT_ALLOWLISTED", "Only B20 addresses in the official Base catalog are supported.");
  return result;
}

export async function createAerodromeQuote(
  walletAddress: string,
  tokenIn: string,
  tokenOut: string,
  sellAmount: string,
  slippageBps: number,
) {
  const p = await rpc();
  const usdc = BASE_USDC.address.toLowerCase();
  const inputIsUsdc = tokenIn.toLowerCase() === usdc;
  const outputIsUsdc = tokenOut.toLowerCase() === usdc;
  if (inputIsUsdc === outputIsUsdc) {
    throw new StockAgentError(400, "INVALID_PAIR", "Trades must be between Base USDC and one allowlisted B20 token.");
  }
  const stock = asset(inputIsUsdc ? tokenOut : tokenIn);
  const expectedPool = AERODROME_STOCK_POOLS[stock.address.toLowerCase()];
  if (!expectedPool) {
    throw new StockAgentError(
      451,
      "TRADE_VENUE_UNAVAILABLE",
      "No issuer-listed Aerodrome USDC pool is available for this stock. BasedMem will not route through an unapproved venue.",
    );
  }

  const [poolResult, routerFactoryResult, quoteResult, blockNumber] = await Promise.all([
    call(p, AERODROME_FACTORY, aerodromeFactory, "getPool", [BASE_USDC.address, stock.address, AERODROME_TICK_SPACING]),
    call(p, AERODROME_SWAP_ROUTER, aerodromeRouter, "factory"),
    call(p, AERODROME_QUOTER, aerodromeQuoter, "quoteExactInputSingle", [[
      tokenIn,
      tokenOut,
      BigInt(sellAmount),
      AERODROME_TICK_SPACING,
      0,
    ]]),
    p.getBlockNumber(),
  ]);

  const returnedPool = ethers.getAddress(poolResult[0]);
  const returnedFactory = ethers.getAddress(routerFactoryResult[0]);
  if (
    returnedPool.toLowerCase() !== expectedPool.toLowerCase()
    || returnedFactory.toLowerCase() !== AERODROME_FACTORY.toLowerCase()
  ) {
    throw new StockAgentError(503, "TRADE_VENUE_MISMATCH", "Aerodrome's live pool or router configuration does not match the reviewed allowlist.");
  }

  const buyAmount = BigInt(quoteResult[0]);
  if (buyAmount <= BigInt(0)) {
    throw new StockAgentError(503, "QUOTE_UNAVAILABLE", "Aerodrome did not return a positive output amount.");
  }
  const minBuyAmount = buyAmount * BigInt(10_000 - slippageBps) / BigInt(10_000);
  if (minBuyAmount <= BigInt(0)) {
    throw new StockAgentError(503, "QUOTE_UNAVAILABLE", "The minimum output amount is invalid.");
  }

  const deadline = Math.floor(Date.now() / 1000) + 30;
  const params = {
    tokenIn: ethers.getAddress(tokenIn),
    tokenOut: ethers.getAddress(tokenOut),
    tickSpacing: AERODROME_TICK_SPACING,
    recipient: ethers.getAddress(walletAddress),
    deadline,
    amountIn: BigInt(sellAmount),
    amountOutMinimum: minBuyAmount,
    sqrtPriceLimitX96: 0,
  };
  const data = aerodromeRouter.encodeFunctionData("exactInputSingle", [params]);
  assertAerodromeQuoteIntent(data, walletAddress, tokenIn, tokenOut, sellAmount, minBuyAmount, deadline);

  return {
    stock,
    pool: returnedPool,
    buyAmount: buyAmount.toString(),
    minBuyAmount: minBuyAmount.toString(),
    blockNumber,
    expiresAt: new Date(deadline * 1000).toISOString(),
    transaction: {
      to: ethers.getAddress(AERODROME_SWAP_ROUTER),
      data,
      value: "0",
    },
  };
}

export function assertAerodromeQuoteIntent(
  data: string,
  walletAddress: string,
  tokenIn: string,
  tokenOut: string,
  sellAmount: string,
  minBuyAmount: bigint,
  deadline: number,
) {
  const decoded = aerodromeRouter.decodeFunctionData("exactInputSingle", data)[0];
  if (
    decoded.tokenIn.toLowerCase() !== tokenIn.toLowerCase()
    || decoded.tokenOut.toLowerCase() !== tokenOut.toLowerCase()
    || Number(decoded.tickSpacing) !== AERODROME_TICK_SPACING
    || decoded.recipient.toLowerCase() !== walletAddress.toLowerCase()
    || Number(decoded.deadline) !== deadline
    || BigInt(decoded.amountIn) !== BigInt(sellAmount)
    || BigInt(decoded.amountOutMinimum) !== minBuyAmount
    || BigInt(decoded.sqrtPriceLimitX96) !== BigInt(0)
  ) {
    throw new StockAgentError(503, "QUOTE_INTENT_MISMATCH", "The generated Aerodrome transaction does not match the reviewed trade intent.");
  }
}
export async function portfolio(walletAddress: string) {
  const p = await rpc(); const live = await allLiveAssets();
  const calls = B20_ASSETS.map(asset => ({
    target: asset.address,
    allowFailure: true,
    callData: erc20.encodeFunctionData("balanceOf", [walletAddress]),
  }));
  const encoded = multicall.encodeFunctionData("aggregate3", [calls]);
  const raw = await p.call({ to: MULTICALL3, data: encoded });
  const balances = multicall.decodeFunctionResult("aggregate3", raw)[0] as Array<{ success: boolean; returnData: string }>;
  const positionValues: bigint[] = [];
  const positions = B20_ASSETS.map((a, i) => {
    if (!balances[i]?.success) throw new StockAgentError(503, "PORTFOLIO_UNAVAILABLE", `Could not read ${a.symbol} balance.`);
    const balance = erc20.decodeFunctionResult("balanceOf", balances[i].returnData)[0];
    const rawBalance = BigInt(balance);
    const scaledBalance = rawBalance * BigInt(live[i].multiplier) / BigInt("1000000000000000000");
    // Official B20 total-return feeds already include the multiplier, so USD
    // value is raw token balance × feed price (not scaled balance × feed price).
    const valueRaw = live[i].priceRaw === null ? null : rawBalance * BigInt(live[i].priceRaw);
    positionValues.push(valueRaw ?? BigInt("0"));
    return {
      symbol: a.symbol,
      rawTokenAmount: rawBalance.toString(),
      rawTokenQuantity: ethers.formatUnits(balance, a.decimals),
      underlyingShareQuantity: ethers.formatUnits(scaledBalance, a.decimals),
      value: valueRaw === null ? null : ethers.formatUnits(valueRaw, 16),
      allocation: null as number | null,
    };
  });
  const totalRaw = positionValues.reduce((sum, value) => sum + value, BigInt("0"));
  const hasUnpricedPositions = positions.some((position, index) => BigInt(position.rawTokenAmount) > BigInt("0") && live[index].priceRaw === null);
  const totalValue = hasUnpricedPositions ? null : ethers.formatUnits(totalRaw, 16);
  for (let i = 0; i < positions.length; i++) {
    positions[i].allocation = !hasUnpricedPositions && totalRaw > BigInt("0")
      ? Number(positionValues[i] * BigInt("1000000") / totalRaw) / 10_000
      : null;
  }
  return {
    walletAddress: ethers.getAddress(walletAddress),
    totalValue,
    hasUnpricedPositions,
    positions: positions.filter(position => BigInt(position.rawTokenAmount) > BigInt("0")),
    readAt: new Date().toISOString(),
    legal,
  };
}
export async function preflightSwap(walletAddress: string, sellToken: string, sellAmount: string, allowanceTarget: string, transaction: { to: string; data: string; value: string }) {
  const p = await rpc();
  const [balanceResult, allowanceResult] = await Promise.all([
    call(p, sellToken, erc20, "balanceOf", [walletAddress]),
    call(p, sellToken, erc20, "allowance", [walletAddress, allowanceTarget]),
  ]);
  const balance = BigInt(balanceResult[0]);
  const allowance = BigInt(allowanceResult[0]);
  const required = BigInt(sellAmount);
  return evaluatePreflight(balance, allowance, required, () =>
    p.call({ from: walletAddress, to: transaction.to, data: transaction.data, value: transaction.value }),
  );
}

export async function evaluatePreflight(
  balance: bigint,
  allowance: bigint,
  required: bigint,
  simulate: () => Promise<unknown>,
) {
  let simulated = false;
  if (balance >= required && allowance >= required) {
    try {
      await simulate();
    } catch {
      throw new StockAgentError(
        451,
        "TRADE_SIMULATION_REJECTED",
        "The issuer policy or Aerodrome route rejected this wallet transaction. The trade remains unavailable for this wallet or region.",
      );
    }
    simulated = true;
  }
  return { hasBalance: balance >= required, hasAllowance: allowance >= required, simulated };
}