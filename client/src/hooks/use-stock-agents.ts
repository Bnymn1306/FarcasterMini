import { useMutation, useQuery } from "@tanstack/react-query";
export type StockAsset = { symbol: string; name: string; address: string; logoUrl?: string; price?: number; priceUpdatedAt?: string; marketOpen?: boolean; authorized?: boolean | null; multiplier?: number; decimals?: number; available: boolean; tradeAvailable?: boolean; executionAvailable?: boolean; executionVenue?: string | null; reasons?: string[] };
export type StockStrategy = { id: string; name: string; description: string; riskLevel: string; timeHorizon: string; assetSymbols: string[]; disclaimer: string };
export type StockPlan = { summary: string; riskLevel: string; allocations: { symbol: string; percentage: number; rationale: string }[]; warnings: string[] };
export type StockPortfolio = { walletAddress: string; totalValue: string | null; hasUnpricedPositions: boolean; positions: { symbol: string; rawTokenAmount: string; rawTokenQuantity: string; underlyingShareQuantity: string; value: string | null; allocation: number | null }[] };
export type StockQuote = { provider: string; pool: string; quoteBlockNumber: number; buyToken: string; sellToken: string; buyAmount: string; minBuyAmount: string; sellAmount: string; priceImpact?: number; allowanceTarget: string; expiresAt: string; transaction: { to: string; data: string; value: string; gas?: string }; preflight: { hasBalance: boolean; hasAllowance: boolean; simulated: boolean }; warnings: string[] };
export type AskBaseSource = { title: string; url: string; publisher: string; publishedAt: string | null; kind: "news" | "official" | "research" | "market-data" };
export type AskBaseResponse = { answer: string; asOf: string; assets: StockAsset[]; sources: AskBaseSource[]; warnings: string[] };

const backendError = async (r: Response) => {
  if (r.ok) return;
  const body = await r.json().catch(() => ({}));
  throw new Error(body?.error?.message || body?.message || `${r.status}: ${r.statusText}`);
};
const getJson = <T,>(url: string) => fetch(url, { credentials: "include" }).then(async r => { await backendError(r); return r.json() as Promise<T>; });
const postJson = <T,>(url: string, payload: unknown) => fetch(url, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).then(async r => { await backendError(r); return r.json() as Promise<T>; });
export function useStockAssets() { return useQuery({ queryKey: ["/api/stock-agents/assets"], queryFn: async () => (await getJson<{ assets: StockAsset[]; usdc: StockAsset }>("/api/stock-agents/assets")).assets }); }
export function useStockUsdc() { return useQuery({ queryKey: ["/api/stock-agents/assets", "usdc"], queryFn: async () => (await getJson<{ assets: StockAsset[]; usdc: StockAsset }>("/api/stock-agents/assets")).usdc }); }
export function useStockUsdcBalance(walletAddress: string, tokenAddress?: string) {
  return useQuery({
    queryKey: ["/api/token-balance", walletAddress, tokenAddress],
    queryFn: () => getJson<{ balance: string; formattedBalance: string }>(`/api/token-balance?walletAddress=${walletAddress}&tokenAddress=${tokenAddress}`),
    enabled: !!walletAddress && !!tokenAddress,
    refetchInterval: 15_000,
  });
}
export function useStockStrategies() { return useQuery({ queryKey: ["/api/stock-agents/strategies"], queryFn: async () => (await getJson<{ strategies: StockStrategy[] }>("/api/stock-agents/strategies")).strategies }); }
export function useStockPortfolio(walletAddress: string) { return useQuery({ queryKey: ["/api/stock-agents/portfolio", walletAddress], queryFn: async () => { const value = await getJson<{ positions: StockPortfolio["positions"]; totalValue: string | null; hasUnpricedPositions: boolean }>(`/api/stock-agents/portfolio/${walletAddress}`); return { ...value, walletAddress }; }, enabled: !!walletAddress }); }
export function useCreateStockPlan() { return useMutation({ mutationFn: (payload: { prompt: string; walletAddress: string; strategyId?: string }) => postJson<StockPlan & { success: boolean }>("/api/stock-agents/plan", payload) }); }
export function useStockQuote() { return useMutation({ mutationFn: (payload: { walletAddress: string; buyToken: string; sellToken: string; sellAmount: string; slippageBps: number; chainId: 8453 }) => postJson<StockQuote>("/api/stock-agents/quote", payload) }); }
export function useAskBase() { return useMutation({ mutationFn: (payload: { message: string; language: "en" | "tr" }) => postJson<AskBaseResponse & { success: boolean }>("/api/stock-agents/ask", payload) }); }