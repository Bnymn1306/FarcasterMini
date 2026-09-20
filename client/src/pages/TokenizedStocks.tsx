import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Contract, formatUnits, parseUnits } from "ethers";
import { AlertTriangle, ArrowRight, BadgeCheck, Bot, Check, ChevronRight, CircleDollarSign, Clock3, Loader2, RefreshCw, ShieldCheck, Sparkles, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/contexts/WalletContext";
import { assertFreshQuote, exactApproval } from "@/lib/stockTradeSecurity";
import { useCreateStockPlan, useStockAssets, useStockPortfolio, useStockQuote, useStockStrategies, useStockUsdc, useStockUsdcBalance, type StockAsset, type StockPlan, type StockQuote } from "@/hooks/use-stock-agents";
import { AskBase } from "@/components/stock-agents/AskBase";

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const money = (value?: number | string | null) => value === undefined || value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value));
const assetMark = (asset: StockAsset) => asset.logoUrl ? <img src={asset.logoUrl} className="h-9 w-9 rounded-xl object-cover" alt="" /> : <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 font-mono text-xs font-bold text-primary">{asset.symbol.slice(0, 2)}</span>;
const quoteStages = [
  "Checking fresh price and issuer status",
  "Verifying the approved pool and building your quote",
  "Validating exact intent and simulating the transaction",
] as const;

export default function TokenizedStocks() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { walletAddress, isWalletConnected, connectWallet, getProvider, ensureBaseChain } = useWallet();
  const assetsQuery = useStockAssets();
  const usdcQuery = useStockUsdc();
  const usdcBalanceQuery = useStockUsdcBalance(walletAddress, usdcQuery.data?.address);
  const strategiesQuery = useStockStrategies();
  const portfolioQuery = useStockPortfolio(walletAddress);
  const planMutation = useCreateStockPlan();
  const quoteMutation = useStockQuote();
  const [prompt, setPrompt] = useState("A thoughtful basket of durable technology and consumer businesses. I prefer measured risk and a 12 month horizon.");
  const [strategyId, setStrategyId] = useState<string>();
  const [plan, setPlan] = useState<StockPlan>();
  const [tradeAsset, setTradeAsset] = useState<StockAsset>();
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [tradeAmount, setTradeAmount] = useState("");
  const [quote, setQuote] = useState<StockQuote>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approvalNeeded, setApprovalNeeded] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [quoteExpiresAt, setQuoteExpiresAt] = useState<number>();
  const [quoteStage, setQuoteStage] = useState(0);
  const assets = assetsQuery.data ?? [];
  const tradePosition = portfolioQuery.data?.positions.find(position => position.symbol === tradeAsset?.symbol);
  const selectedStrategy = useMemo(() => strategiesQuery.data?.find(s => s.id === strategyId), [strategiesQuery.data, strategyId]);
  const stale = assets.some(a => a.priceUpdatedAt && Date.now() - new Date(a.priceUpdatedAt).getTime() > 24 * 60 * 60 * 1000);

  useEffect(() => { if (quote) { const timeout = window.setTimeout(() => setQuote(undefined), 30_000); return () => window.clearTimeout(timeout); } }, [quote]);
  useEffect(() => {
    if (!quoteMutation.isPending) {
      setQuoteStage(0);
      return;
    }
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setQuoteStage(elapsed >= 2400 ? 2 : elapsed >= 900 ? 1 : 0);
    }, 150);
    return () => window.clearInterval(interval);
  }, [quoteMutation.isPending]);

  async function createPlan() {
    if (!walletAddress) { await connectWallet(); return; }
    planMutation.mutate({ prompt, walletAddress, strategyId }, { onSuccess: value => { setPlan(value); toast({ title: "Your plan is ready", description: "Review every allocation before trading." }); }, onError: error => toast({ title: "Plan unavailable", description: error.message, variant: "destructive" }) });
  }
  function openTrade(asset: StockAsset, side: "buy" | "sell" = "buy") {
    setTradeAsset(asset);
    setTradeSide(side);
    setTradeAmount("");
    setQuote(undefined);
    setAcknowledged(false);
    setApprovalNeeded(false);
  }
  function changeTradeAmount(value: string) {
    setTradeAmount(value);
    if (quote) {
      setQuote(undefined);
      setAcknowledged(false);
      setApprovalNeeded(false);
    }
  }
  function requestQuote(asset: StockAsset) {
    if (!walletAddress) { connectWallet(); return; }
    setTradeAsset(asset); setQuote(undefined); setAcknowledged(false);
    if (!usdcQuery.data?.address) { toast({ title: "USDC unavailable", description: usdcQuery.error?.message || "The backend did not return a Base USDC address.", variant: "destructive" }); return; }
    let sellAmount: string;
    try {
      sellAmount = parseUnits(tradeAmount.trim(), tradeSide === "buy" ? 6 : (asset.decimals ?? 8)).toString();
      if (BigInt(sellAmount) <= BigInt(0)) throw new Error();
      if (tradeSide === "sell" && (!tradePosition || BigInt(sellAmount) > BigInt(tradePosition.rawTokenAmount))) throw new Error();
    } catch {
      toast({ title: "Enter a valid amount", description: tradeSide === "buy" ? "Enter the USDC amount you want to spend." : `Enter a ${asset.symbol} amount within your wallet balance.`, variant: "destructive" });
      return;
    }
    quoteMutation.mutate({
      walletAddress,
      buyToken: tradeSide === "buy" ? asset.address : usdcQuery.data.address,
      sellToken: tradeSide === "buy" ? usdcQuery.data.address : asset.address,
      sellAmount,
      slippageBps: 75,
      chainId: 8453,
    }, { onSuccess: value => { setQuote(value); setQuoteExpiresAt(new Date(value.expiresAt).getTime()); }, onError: error => toast({ title: "Quote unavailable", description: error.message, variant: "destructive" }) });
  }
  async function approveTrade() {
    if (!quote || !acknowledged) return;
    try { assertFreshQuote(quoteExpiresAt); } catch { setQuote(undefined); toast({ title: "Quote expired", description: "Fetch a fresh quote before approving.", variant: "destructive" }); return; }
    const provider = getProvider();
    if (!provider) { toast({ title: "Wallet unavailable", description: "Reconnect your Base wallet and try again.", variant: "destructive" }); return; }
    try {
      await ensureBaseChain();
      const signer = await provider.getSigner();
      const inputTokenAddress = tradeSide === "buy" ? usdcQuery.data?.address : tradeAsset?.address;
      const inputSymbol = tradeSide === "buy" ? "USDC" : tradeAsset?.symbol;
      if (quote.allowanceTarget && inputTokenAddress) {
        const token = new Contract(inputTokenAddress, ["function allowance(address,address) view returns (uint256)"], signer);
        if (await token.allowance(walletAddress, quote.allowanceTarget) < BigInt(quote.sellAmount)) { setApprovalNeeded(true); return; }
      }
      if (!quote.preflight.hasBalance) throw new Error(`This wallet does not have enough ${inputSymbol} for the reviewed trade.`);
      if (!quote.preflight.simulated) throw new Error(`Fetch a fresh quote after the exact ${inputSymbol} approval so BasedMem can simulate it before submission.`);
      setSubmitting(true);
      await ensureBaseChain();
      const tx = await signer.sendTransaction({ to: quote.transaction.to, data: quote.transaction.data, value: BigInt(quote.transaction.value || "0"), gasLimit: quote.transaction.gas ? BigInt(quote.transaction.gas) : undefined });
      await tx.wait();
      toast({ title: "Swap confirmed on Base", description: `Transaction ${short(tx.hash)} is confirmed.` });
      setQuote(undefined); setTradeAsset(undefined); await Promise.all([portfolioQuery.refetch(), usdcBalanceQuery.refetch()]);
    } catch (error: any) {
      toast({ title: error?.code === "ACTION_REJECTED" || error?.code === 4001 ? "Approval cancelled" : "Transaction not submitted", description: error?.message || "No onchain action was completed.", variant: "destructive" });
    } finally { setSubmitting(false); }
  }
  async function approveToken() {
    const provider = getProvider();
    const inputTokenAddress = tradeSide === "buy" ? usdcQuery.data?.address : tradeAsset?.address;
    const inputSymbol = tradeSide === "buy" ? "USDC" : tradeAsset?.symbol;
    if (!provider || !quote?.allowanceTarget || !inputTokenAddress || !tradeAsset) return;
    try {
      try { assertFreshQuote(quoteExpiresAt); } catch { setQuote(undefined); throw new Error(`Quote expired. Fetch a fresh quote before approving ${inputSymbol}.`); }
      setApprovalPending(true);
      await ensureBaseChain();
      const signer = await provider.getSigner();
      const token = new Contract(inputTokenAddress, ["function approve(address,uint256) returns (bool)"], signer);
      const approval = exactApproval(quote.allowanceTarget, quote.sellAmount);
      const tx = await token.approve(approval.spender, approval.amount);
      await tx.wait();
      setApprovalNeeded(false); setQuote(undefined);
      toast({ title: `${inputSymbol} approval confirmed`, description: "Fetching a fresh quote for your review." });
      requestQuote(tradeAsset);
    } catch (error: any) {
      toast({ title: error?.code === "ACTION_REJECTED" || error?.code === 4001 ? `${inputSymbol} approval cancelled` : `${inputSymbol} approval failed`, description: error?.message || "No approval was completed.", variant: "destructive" });
    } finally { setApprovalPending(false); }
  }

  return <div className="min-h-[100dvh] min-w-0 overflow-x-clip pb-10">
    <section className="relative border-b border-cyan-400/20 bg-[radial-gradient(circle_at_82%_20%,rgba(34,211,238,.18),transparent_34%),linear-gradient(135deg,#080d18_0%,#111b30_58%,#102d36_100%)] text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-12 xl:px-8 xl:py-16">
        <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-primary"><span className="h-2 w-2 rounded-full bg-primary animate-pulse" /> Base-native stock access</div>
        <div className="grid gap-8 md:grid-cols-[1.45fr_.75fr] md:items-end">
          <div><h1 className="max-w-3xl text-4xl font-bold leading-[.95] tracking-[-.055em] text-white sm:text-6xl">Markets, explained.<br/><span className="text-cyan-300">Actions, yours.</span></h1><p className="mt-5 max-w-xl text-sm leading-6 text-white/75 sm:text-base">BasedMem agents turn your words into transparent tokenized-stock baskets. They can research and propose. Only you can approve an onchain transaction.</p></div>
          <div className="rounded-2xl border border-primary/15 bg-card/70 p-4 shadow-sm backdrop-blur"><div className="flex items-center gap-3"><div className="rounded-xl bg-primary p-2 text-primary-foreground"><ShieldCheck className="h-5 w-5"/></div><div><p className="text-sm font-semibold">Human approval, always</p><p className="text-xs text-muted-foreground">No autonomous execution</p></div></div><div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs"><span className="text-muted-foreground">Network</span><span className="font-mono font-medium text-primary">Base · 8453</span></div></div>
        </div>
      </div>
    </section>
    <main className="mx-auto w-full min-w-0 max-w-6xl space-y-10 px-4 py-8 md:px-6 xl:px-8">
      {!isWalletConnected && <button onClick={() => connectWallet()} className="flex w-full items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-left transition-transform hover:-translate-y-0.5"><Wallet className="h-5 w-5 text-primary"/><span className="flex-1 text-sm"><b>Connect a Base wallet</b><br/><span className="text-xs text-muted-foreground">Connect to create plans and read your onchain B20 portfolio.</span></span><ChevronRight className="h-5 w-5 text-primary"/></button>}
      <div className="flex gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-900"><ShieldCheck className="h-4 w-4 shrink-0"/><span><b>Verified Aerodrome execution is available for listed pools.</b> Purchases use direct USDC pools, exact approvals, short-lived quotes, decoded intent checks, and a pre-send simulation. Availability is limited to eligible jurisdictions outside the United States.</span></div>
      {stale && <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800"><Clock3 className="h-4 w-4 shrink-0"/>Some Chainlink reference prices are delayed. Trading remains available through a fresh verified Aerodrome quote and onchain preflight checks.</div>}
      <section><div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-mono uppercase tracking-widest text-primary">01 / discover</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Tokenized stock shelf</h2></div><Button variant="ghost" size="sm" onClick={() => assetsQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button></div>
        {assetsQuery.isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3].map(i => <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted"/>)}</div> : assetsQuery.isError ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">The stock shelf is temporarily unavailable. <button className="font-semibold text-primary underline" onClick={() => assetsQuery.refetch()}>Try again</button></div> : assets.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No tokenized assets are available for this wallet right now.</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{assets.map(asset => { const canTrade = Boolean(asset.tradeAvailable); const referenceDelayed = asset.reasons?.includes("FEED_STALE"); const position = portfolioQuery.data?.positions.find(p => p.symbol === asset.symbol); return <article key={asset.symbol} className="group rounded-2xl border bg-card p-4 transition-all hover:-translate-y-1 hover:border-primary/35 hover:shadow-md"><div className="flex items-start justify-between">{assetMark(asset)}<span lang="en" className={`rounded-full px-2 py-1 text-[10px] font-bold tracking-wide ${canTrade ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{canTrade ? referenceDelayed ? "POOL LIVE · REFERENCE DELAYED" : "POOL LIVE" : asset.executionAvailable ? "SAFETY CHECK UNAVAILABLE" : "NO APPROVED ROUTE"}</span></div><div className="mt-4 flex justify-between"><div><p className="font-mono text-sm font-bold">{asset.symbol}</p><p className="mt-0.5 text-xs text-muted-foreground">{asset.name}</p></div><div className="text-right"><p className="text-sm font-semibold">{money(asset.price)}</p>{referenceDelayed && asset.priceUpdatedAt && <p className="mt-0.5 text-[10px] text-muted-foreground">Reference verified {new Date(asset.priceUpdatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>}</div></div><div className="mt-4 grid grid-cols-2 gap-2"><Button size="sm" variant="outline" disabled={!canTrade} onClick={() => openTrade(asset, "buy")}>{canTrade ? "Buy" : "Unavailable"}</Button><Button size="sm" variant="outline" disabled={!canTrade || !position} onClick={() => openTrade(asset, "sell")}>Sell</Button></div></article>})}</div>}</section>
      <section className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><div className="rounded-3xl bg-foreground p-5 text-background md:p-7"><p className="text-xs font-mono uppercase tracking-widest text-primary">02 / tell the agent</p><h2 className="mt-2 text-2xl font-bold tracking-tight">What should your basket feel like?</h2><Textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="mt-5 min-h-28 border-background/20 bg-background/10 text-background placeholder:text-background/40 focus-visible:ring-primary" /><div className="mt-4 flex flex-wrap gap-2">{strategiesQuery.data?.map(strategy => <button key={strategy.id} onClick={() => setStrategyId(strategy.id)} className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${strategyId === strategy.id ? "border-primary bg-primary text-primary-foreground" : "border-background/20 text-background/75 hover:bg-background/10"}`}>{strategy.name}</button>)}</div><Button onClick={createPlan} disabled={planMutation.isPending || !prompt.trim()} className="mt-5 bg-primary text-primary-foreground hover:bg-primary/90">{planMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}Generate my transparent plan</Button></div>
        <div className="rounded-3xl border bg-card p-5 md:p-7"><p className="text-xs font-mono uppercase tracking-widest text-primary">Agent boundaries</p><ul className="mt-5 space-y-4 text-sm"><li className="flex gap-3"><BadgeCheck className="h-5 w-5 shrink-0 text-primary"/>Allocation rationales are visible, not hidden.</li><li className="flex gap-3"><BadgeCheck className="h-5 w-5 shrink-0 text-primary"/>Live pool quotes, token status, and route integrity are checked before a trade.</li><li className="flex gap-3"><BadgeCheck className="h-5 w-5 shrink-0 text-primary"/>Every onchain action waits for your signature.</li></ul>{selectedStrategy && <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">{selectedStrategy.disclaimer}</p>}</div></section>
      {plan && <section className="animate-in fade-in slide-in-from-bottom-3 duration-500 rounded-3xl border border-primary/20 bg-card p-5 md:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-mono uppercase tracking-widest text-primary">03 / your proposal</p><h2 className="mt-1 text-2xl font-bold">A basket you can inspect</h2></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{plan.riskLevel} risk</span></div><p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">{plan.summary}</p><div className="mt-6 space-y-3">{plan.allocations.map(allocation => { const asset = assets.find(a => a.symbol === allocation.symbol); const canTrade = Boolean(asset?.tradeAvailable); return <div key={allocation.symbol} className="grid gap-3 rounded-2xl bg-muted/60 p-4 sm:grid-cols-[.65fr_1fr_2fr_auto] sm:items-center"><div className="flex items-center gap-2">{asset ? assetMark(asset) : <CircleDollarSign className="h-8 w-8 text-primary"/>}<b className="font-mono text-sm">{allocation.symbol}</b></div><div><b className="text-lg">{allocation.percentage}%</b><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full bg-primary" style={{width:`${allocation.percentage}%`}}/></div></div><p className="text-xs leading-5 text-muted-foreground">{allocation.rationale}</p><Button size="sm" variant="outline" disabled={!canTrade} onClick={() => asset && requestQuote(asset)}>{canTrade ? "Buy" : "Unavailable"}</Button></div> })}</div>{plan.warnings.length > 0 && <div className="mt-5 space-y-2">{plan.warnings.map(warning => <p key={warning} className="flex gap-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0"/>{warning}</p>)}</div>}</section>}
      <section className="rounded-3xl border bg-card p-5 md:p-7"><div className="flex items-center justify-between"><div><p className="text-xs font-mono uppercase tracking-widest text-primary">Your holdings</p><h2 className="mt-1 text-2xl font-bold">Portfolio, on your wallet</h2></div>{isWalletConnected && <span className="font-mono text-xs text-muted-foreground">{short(walletAddress)}</span>}</div>{!isWalletConnected ? <p className="mt-6 text-sm text-muted-foreground">Connect your Base wallet to view tokenized-stock positions.</p> : portfolioQuery.isLoading ? <div className="mt-6 h-16 animate-pulse rounded-xl bg-muted"/> : portfolioQuery.isError ? <p className="mt-6 text-sm text-muted-foreground">Portfolio unavailable. <button className="text-primary underline" onClick={() => portfolioQuery.refetch()}>Retry</button></p> : <><p className="mt-6 text-3xl font-bold">{money(portfolioQuery.data?.totalValue)}</p><div className="mt-5 divide-y">{portfolioQuery.data?.positions?.length ? portfolioQuery.data.positions.map(position => { const heldAsset = assets.find(a => a.symbol === position.symbol); return <div key={position.symbol} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="font-mono font-semibold">{position.symbol}</span><span className="ml-auto text-right">{money(position.value)} <span className="ml-2 text-xs text-muted-foreground">{position.rawTokenQuantity} {position.symbol}</span></span><Button size="sm" variant="outline" disabled={!heldAsset?.tradeAvailable} onClick={() => heldAsset && openTrade(heldAsset, "sell")}>Sell</Button></div> }) : <p className="py-5 text-sm text-muted-foreground">No tokenized-stock positions yet. Start with a plan, then choose each trade yourself.</p>}</div></>}</section>
     </main>
     <AskBase onInspectAsset={asset => openTrade(asset, "buy")} />
    <Dialog open={!!tradeAsset} onOpenChange={open => { if (!open && !submitting && !approvalPending) { setTradeAsset(undefined); setQuote(undefined); setApprovalNeeded(false); } }}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader><DialogTitle>Review before your wallet sees it</DialogTitle></DialogHeader>
        {tradeAsset && <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-muted p-3">
            {assetMark(tradeAsset)}
            <div><p className="font-mono font-bold">{tradeAsset.symbol}</p><p className="text-xs text-muted-foreground">Tokenized stock {tradeSide === "buy" ? "purchase" : "sale"} on Base</p></div>
          </div>
          <label className="block text-sm font-medium">
            <span className="flex items-center justify-between">
               <span>{tradeSide === "buy" ? "USDC" : tradeAsset.symbol} amount</span>
              <span className="text-xs font-normal text-muted-foreground">
                 Available: {tradeSide === "buy" ? (usdcBalanceQuery.isLoading ? "Loading…" : `${Number(usdcBalanceQuery.data?.formattedBalance || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`) : `${Number(tradePosition?.rawTokenQuantity || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })} ${tradeAsset.symbol}`}
              </span>
            </span>
            <div className="mt-2 flex gap-2">
              <input value={tradeAmount} onChange={e => changeTradeAmount(e.target.value)} inputMode="decimal" placeholder="Enter amount" className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 font-mono"/>
               <Button type="button" variant="outline" onClick={() => changeTradeAmount(tradeSide === "buy" ? (usdcBalanceQuery.data?.formattedBalance || "") : (tradePosition?.rawTokenQuantity || ""))} disabled={tradeSide === "buy" ? !usdcBalanceQuery.data : !tradePosition}>Max</Button>
            </div>
          </label>
           {!quote && <div className="space-y-3">
             <Button className="w-full" disabled={quoteMutation.isPending || Number(tradeAmount) <= 0} onClick={() => requestQuote(tradeAsset)}>{quoteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{quoteMutation.isPending ? "Preparing fresh quote" : "Get fresh quote"}</Button>
             {quoteMutation.isPending && <div role="status" aria-live="polite" className="rounded-2xl border bg-muted/50 p-3">
               <p className="text-xs font-medium">{quoteStages[quoteStage]}</p>
               <div className="mt-3 grid grid-cols-3 gap-1" aria-hidden="true">
                 {quoteStages.map((_, index) => <span key={index} className={`h-1.5 rounded-full transition-colors ${index <= quoteStage ? "bg-primary" : "bg-border"}`}/>)}
               </div>
               <p className="mt-2 text-[11px] text-muted-foreground">Fresh pricing, wallet eligibility, exact amounts, recipient, and expiry are checked before this quote is shown.</p>
             </div>}
           </div>}
          {quote && <>
            <div className="rounded-2xl border p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Venue</span><b>{quote.provider}</b></div>
               <div className="mt-3 flex justify-between"><span className="text-muted-foreground">You pay</span><b>{formatUnits(quote.sellAmount, tradeSide === "buy" ? 6 : (tradeAsset.decimals ?? 8))} {tradeSide === "buy" ? "USDC" : tradeAsset.symbol}</b></div>
               <div className="mt-3 flex justify-between"><span className="text-muted-foreground">You receive</span><b>{formatUnits(quote.buyAmount, tradeSide === "buy" ? (tradeAsset.decimals ?? 8) : 6)} {tradeSide === "buy" ? tradeAsset.symbol : "USDC"}</b></div>
               <div className="mt-3 flex justify-between"><span className="text-muted-foreground">Minimum received</span><b>{formatUnits(quote.minBuyAmount, tradeSide === "buy" ? (tradeAsset.decimals ?? 8) : 6)} {tradeSide === "buy" ? tradeAsset.symbol : "USDC"}</b></div>
              {quote.priceImpact !== undefined && <div className="mt-3 flex justify-between text-xs"><span className="text-muted-foreground">Price impact</span><span>{quote.priceImpact}%</span></div>}
              <p className="mt-4 flex items-center gap-2 border-t pt-3 text-xs text-amber-700"><Clock3 className="h-4 w-4"/>This quote is short-lived. Regenerate it if it expires.</p>
            </div>
            {quote.warnings.map(w => <p key={w} className="flex gap-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0"/>{w}</p>)}
            <button onClick={() => setAcknowledged(!acknowledged)} className="flex gap-3 text-left text-xs"><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${acknowledged ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{acknowledged && <Check className="h-3 w-3"/>}</span><span>I confirm I am outside the United States, am in an eligible jurisdiction, accept the issuer terms, understand the risks, and reviewed this quote.</span></button>
             {approvalNeeded ? <div className="space-y-2 rounded-2xl border border-primary/20 bg-primary/5 p-3"><p className="text-xs text-muted-foreground">Step 1 of 2: approve exactly {formatUnits(quote.sellAmount, tradeSide === "buy" ? 6 : (tradeAsset.decimals ?? 8))} {tradeSide === "buy" ? "USDC" : tradeAsset.symbol} for the verified Aerodrome SwapRouter. After confirmation, a fresh quote will be generated and simulated for a separate swap approval.</p><Button className="w-full" disabled={!acknowledged || approvalPending} onClick={approveToken}>{approvalPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ShieldCheck className="mr-2 h-4 w-4"/>}Approve {tradeSide === "buy" ? "USDC" : tradeAsset.symbol} in wallet</Button></div> : <Button className="w-full" disabled={!acknowledged || submitting} onClick={approveTrade}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ShieldCheck className="mr-2 h-4 w-4"/>}Review allowance and continue</Button>}
            <button className="mx-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => { setQuote(undefined); setAcknowledged(false); setApprovalNeeded(false); }}><X className="h-3 w-3"/>Discard quote</button>
          </>}
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}