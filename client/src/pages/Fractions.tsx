import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useWallet } from "@/contexts/WalletContext";
import { parseEther } from "ethers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Layers, Sparkles, Zap, Trophy, Star, Flame, Crown, Dices, TrendingUp, Wallet, ExternalLink, CheckCircle, Clock, AlertCircle, ShoppingBag, Tag, X, ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { FractionCollection, FractionHolding, FractionListing } from "@shared/schema";

// Treasury address receives all fraction mint payments (Base mainnet)
const TREASURY_ADDRESS = "0x8988C455f0cf4D3167c32B9D65B09130454536ac";

// ── Tier helpers ────────────────────────────────────────────────────────────

interface Tier {
  name: string;
  min: number;
  max: number;
  color: string;
  glow: string;
  icon: typeof Star;
  description: string;
}

const TIERS: Tier[] = [
  { name: "Bronze", min: 1, max: 999, color: "text-amber-600", glow: "shadow-amber-500/40", icon: Star, description: "1 – 999 fractions" },
  { name: "Silver", min: 1_000, max: 9_999, color: "text-slate-300", glow: "shadow-slate-300/40", icon: Trophy, description: "1,000 – 9,999 fractions" },
  { name: "Gold", min: 10_000, max: 99_999, color: "text-yellow-400", glow: "shadow-yellow-400/40", icon: Crown, description: "10,000 – 99,999 fractions" },
  { name: "Legendary", min: 100_000, max: 999_999, color: "text-purple-400", glow: "shadow-purple-500/40", icon: Flame, description: "100,000 – 999,999 fractions" },
  { name: "Whale", min: 1_000_000, max: Infinity, color: "text-cyan-400", glow: "shadow-cyan-400/40", icon: Sparkles, description: "1,000,000+ fractions — Full NFT!" },
];

function getTier(amount: number): Tier {
  return TIERS.find(t => amount >= t.min && amount <= t.max) ?? TIERS[0];
}

// Rarity label from rarityScore (1-100)
function getRarityLabel(score: number): { label: string; color: string } {
  if (score >= 96) return { label: "Legendary", color: "text-yellow-400" };
  if (score >= 81) return { label: "Epic", color: "text-purple-400" };
  if (score >= 61) return { label: "Rare", color: "text-blue-400" };
  if (score >= 36) return { label: "Uncommon", color: "text-green-400" };
  return { label: "Common", color: "text-muted-foreground" };
}

function formatAmount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

// ── Collection Card ─────────────────────────────────────────────────────────

function CollectionCard({
  col,
  userHolding,
  onBuy,
}: {
  col: FractionCollection;
  userHolding?: FractionHolding;
  onBuy: (col: FractionCollection) => void;
}) {
  const tier = userHolding ? getTier(userHolding.fractionAmount) : null;
  const TierIcon = tier?.icon ?? Star;
  const pct = Math.round((col.fractionsCirculating / col.totalSupply) * 100);
  const available = col.totalSupply - col.fractionsCirculating;

  return (
    <Card
      className="group relative overflow-hidden hover-elevate transition-all duration-300"
      data-testid={`card-collection-${col.id}`}
    >
      {/* Banner */}
      <div className={`h-28 relative overflow-hidden ${col.imageUrl ? "" : `bg-gradient-to-br ${col.imageGradient}`} flex items-center justify-center`}>
        {col.imageUrl ? (
          <img src={col.imageUrl} alt={col.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : null}
        {!col.imageUrl && <span className="text-5xl relative z-10">{col.emoji}</span>}
        {tier && (
          <div className={`absolute top-2 right-2 z-20 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs font-bold ${tier.color}`}>
            <TierIcon className="h-3 w-3" />
            {tier.name}
          </div>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-base">{col.name}</h3>
            <span className="text-xs text-muted-foreground font-mono">{col.symbol}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{col.description}</p>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>{formatAmount(col.fractionsCirculating)} minted</span>
            <span>{pct}% claimed</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${col.imageGradient} transition-all`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{col.holderCount} holders</span>
          <span>{formatAmount(available)} left</span>
        </div>

        {/* User holding badge */}
        {userHolding && userHolding.fractionAmount > 0 && (
          <div className="flex items-center gap-1.5 bg-muted rounded-lg px-2 py-1.5 text-xs">
            <TierIcon className={`h-3.5 w-3.5 ${tier?.color}`} />
            <span className="font-semibold">You hold:</span>
            <span>{formatAmount(userHolding.fractionAmount)}</span>
            <span className="text-muted-foreground">fractions</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="flex-1 text-xs text-muted-foreground">
            <span className="font-mono">{col.pricePerFraction} ETH</span>
            <span className="text-muted-foreground/60"> / fraction</span>
          </div>
          <Button
            size="sm"
            onClick={() => onBuy(col)}
            data-testid={`button-buy-${col.id}`}
            className="gap-1.5"
          >
            <Layers className="h-3.5 w-3.5" />
            Mint
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Holding Card (My Portfolio) ─────────────────────────────────────────────

function HoldingCard({
  holding,
  col,
  onGamble,
  onSell,
}: {
  holding: FractionHolding;
  col: FractionCollection;
  onGamble: (h: FractionHolding, col: FractionCollection) => void;
  onSell: (h: FractionHolding, col: FractionCollection) => void;
}) {
  const tier = getTier(holding.fractionAmount);
  const TierIcon = tier.icon;
  const rarity = getRarityLabel(holding.rarityScore);

  return (
    <Card
      className="group relative overflow-hidden hover-elevate transition-all duration-300"
      data-testid={`card-holding-${holding.id}`}
    >
      <div className={`h-20 relative overflow-hidden ${col.imageUrl ? "" : `bg-gradient-to-br ${col.imageGradient}`} flex items-center justify-center`}>
        {col.imageUrl ? (
          <img src={col.imageUrl} alt={col.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="text-4xl relative z-10">{col.emoji}</span>
        )}
      </div>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm">{col.name}</span>
          <Badge variant="secondary" className={`text-[10px] ${rarity.color}`}>
            {rarity.label}
          </Badge>
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-bold ${tier.color}`}>
          <TierIcon className="h-4 w-4" />
          {tier.name}
          <span className="text-muted-foreground font-normal text-xs ml-1">{formatAmount(holding.fractionAmount)}</span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Rarity: <span className="font-mono font-bold text-foreground">{holding.rarityScore}</span>/100</span>
          <span>{holding.gamblesCount} gambles</span>
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1 text-xs"
            onClick={() => onGamble(holding, col)}
            disabled={holding.fractionAmount < 100}
            data-testid={`button-gamble-${holding.id}`}
          >
            <Dices className="h-3 w-3" />
            Gamble
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1 text-xs"
            onClick={() => onSell(holding, col)}
            disabled={holding.fractionAmount < 1}
            data-testid={`button-sell-${holding.id}`}
          >
            <Tag className="h-3 w-3" />
            Sell
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Buy Modal ───────────────────────────────────────────────────────────────

type TxStep = "input" | "awaiting_wallet" | "pending" | "recording" | "done" | "error";

function BuyModal({
  col,
  open,
  onClose,
  walletAddress,
}: {
  col: FractionCollection | null;
  open: boolean;
  onClose: () => void;
  walletAddress: string;
}) {
  const [amount, setAmount] = useState("1000");
  const [step, setStep] = useState<TxStep>("input");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { getProvider } = useWallet();

  const handleClose = () => {
    if (step === "pending" || step === "awaiting_wallet") return; // block close while tx in flight
    setStep("input");
    setTxHash(null);
    setErrorMsg(null);
    onClose();
  };

  const handleMint = async () => {
    if (!col || !walletAddress || Number(amount) <= 0) return;
    const provider = getProvider();
    if (!provider) {
      setErrorMsg("Wallet not connected. Please connect your ETH wallet first.");
      setStep("error");
      return;
    }

    const ethCostRaw = (Number(amount) * parseFloat(col.pricePerFraction)).toFixed(18);
    const ethValue = parseEther(ethCostRaw);

    try {
      // Step 1: Ask wallet to approve the tx
      setStep("awaiting_wallet");
      setErrorMsg(null);

      const signer = await provider.getSigner();

      // Encode collectionId + amount in data field for on-chain traceability
      const dataHex =
        "0x" +
        Buffer.from(`fractions:${col.id}:${amount}`, "utf8").toString("hex");

      const tx = await signer.sendTransaction({
        to: TREASURY_ADDRESS,
        value: ethValue,
        data: dataHex,
      });

      // Step 2: Show pending with tx hash
      setTxHash(tx.hash);
      setStep("pending");

      // Step 3: Wait for 1 confirmation on Base (~2s)
      await tx.wait(1);

      // Step 4: Record on backend
      setStep("recording");
      const res = await apiRequest("POST", "/api/fractions/buy", {
        walletAddress,
        collectionId: col.id,
        amount: Number(amount),
        txHash: tx.hash,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Recording failed");

      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/fractions/collections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fractions/holdings", walletAddress] });
      toast({ title: "Fractions minted!", description: `${Number(amount).toLocaleString()} ${col.symbol} are yours on Base mainnet.` });
    } catch (e: any) {
      const msg = e?.message || "Transaction failed";
      if (msg.includes("cancelled") || msg.includes("rejected") || msg.includes("denied") || e?.code === 4001) {
        setStep("input");
        toast({ title: "Transaction cancelled", variant: "destructive" });
      } else {
        setErrorMsg(msg);
        setStep("error");
      }
    }
  };

  if (!col) return null;
  const ethCost = (Number(amount) * parseFloat(col.pricePerFraction)).toFixed(8);
  const tier = getTier(Number(amount));
  const TierIcon = tier.icon;
  const basescanUrl = txHash ? `https://basescan.org/tx/${txHash}` : null;

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-md" data-testid="modal-buy-fractions">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Mint {col.name} Fractions
          </DialogTitle>
        </DialogHeader>

        <div className={`rounded-lg h-20 bg-gradient-to-br ${col.imageGradient} flex items-center justify-center text-4xl`}>
          <span>{col.emoji}</span>
        </div>

        {/* ── Input step ── */}
        {step === "input" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Number of fractions</label>
              <Input
                type="number"
                min="1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="1000"
                data-testid="input-fraction-amount"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[100, 1000, 10000, 100000].map(v => (
                <Button key={v} size="sm" variant="outline" onClick={() => setAmount(String(v))}
                  data-testid={`button-quick-amount-${v}`} className="text-xs">
                  {formatAmount(v)}
                </Button>
              ))}
            </div>

            {Number(amount) > 0 && (
              <div className={`flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-semibold ${tier.color}`}>
                <TierIcon className="h-4 w-4" />
                <span>{tier.name} tier</span>
                <span className="text-xs text-muted-foreground font-normal ml-auto">{tier.description}</span>
              </div>
            )}

            <div className="rounded-lg bg-muted p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">You pay</span>
                <span className="font-mono font-bold">{ethCost} ETH</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Network</span>
                <span className="font-medium text-blue-400">Base Mainnet</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Treasury</span>
                <span className="font-mono">{TREASURY_ADDRESS.slice(0, 6)}…{TREASURY_ADDRESS.slice(-4)}</span>
              </div>
            </div>

            <Button className="w-full gap-2" onClick={handleMint}
              disabled={!amount || Number(amount) <= 0}
              data-testid="button-confirm-mint">
              <Layers className="h-4 w-4" />
              Mint {Number(amount) > 0 ? `${Number(amount).toLocaleString()} Fractions` : "Fractions"} on Base
            </Button>
          </div>
        )}

        {/* ── Awaiting wallet approval ── */}
        {step === "awaiting_wallet" && (
          <div className="py-6 flex flex-col items-center gap-4 text-center">
            <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <div>
              <p className="font-semibold">Waiting for wallet approval…</p>
              <p className="text-sm text-muted-foreground mt-1">
                Approve the transaction in your wallet (MetaMask / Farcaster)
              </p>
            </div>
          </div>
        )}

        {/* ── Pending on chain ── */}
        {step === "pending" && (
          <div className="py-4 flex flex-col items-center gap-4 text-center">
            <Clock className="h-10 w-10 text-yellow-400 animate-pulse" />
            <div>
              <p className="font-semibold">Transaction submitted!</p>
              <p className="text-sm text-muted-foreground mt-1">Waiting for 1 confirmation on Base…</p>
            </div>
            {basescanUrl && (
              <a href={basescanUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                data-testid="link-basescan">
                <ExternalLink className="h-3.5 w-3.5" />
                View on Basescan
              </a>
            )}
          </div>
        )}

        {/* ── Recording on backend ── */}
        {step === "recording" && (
          <div className="py-6 flex flex-col items-center gap-4 text-center">
            <div className="h-10 w-10 rounded-full border-4 border-accent border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">Registering your fractions…</p>
          </div>
        )}

        {/* ── Done ── */}
        {step === "done" && (
          <div className="py-4 flex flex-col items-center gap-4 text-center">
            <CheckCircle className="h-12 w-12 text-green-400" />
            <div>
              <p className="font-bold text-lg">Minted!</p>
              <p className="text-sm text-muted-foreground">
                {Number(amount).toLocaleString()} {col.symbol} fractions are now yours.
              </p>
            </div>
            {basescanUrl && (
              <a href={basescanUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                View on Basescan
              </a>
            )}
            <Button className="w-full" onClick={handleClose} data-testid="button-done-mint">Done</Button>
          </div>
        )}

        {/* ── Error ── */}
        {step === "error" && (
          <div className="py-4 flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <div>
              <p className="font-semibold">Transaction failed</p>
              <p className="text-sm text-muted-foreground mt-1 break-all">{errorMsg}</p>
            </div>
            {basescanUrl && (
              <a href={basescanUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                View on Basescan
              </a>
            )}
            <Button variant="outline" className="w-full" onClick={() => setStep("input")}>Try Again</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Gamble fee in ETH (sent to treasury as on-chain proof)
const GAMBLE_FEE_ETH = "0.0001";

// ── Gamble Modal ────────────────────────────────────────────────────────────

type GambleStep = "confirm" | "awaiting_wallet" | "pending" | "rolling" | "done" | "error";

function GambleModal({
  holding,
  col,
  open,
  onClose,
  walletAddress,
}: {
  holding: FractionHolding | null;
  col: FractionCollection | null;
  open: boolean;
  onClose: () => void;
  walletAddress: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { getProvider } = useWallet();
  const [step, setStep] = useState<GambleStep>("confirm");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ newRarity: number; previousRarity: number; improved: boolean; spent: number } | null>(null);

  const handleClose = () => {
    if (step === "pending" || step === "awaiting_wallet") return;
    setStep("confirm");
    setTxHash(null);
    setErrorMsg(null);
    setResult(null);
    onClose();
  };

  const handleGamble = async () => {
    if (!holding || !col) return;
    const provider = getProvider();
    if (!provider) {
      setErrorMsg("Wallet not connected. Please connect your ETH wallet first.");
      setStep("error");
      return;
    }

    try {
      setStep("awaiting_wallet");
      setErrorMsg(null);

      const signer = await provider.getSigner();
      const dataHex = "0x" + Buffer.from(`gamble:${holding.id}`, "utf8").toString("hex");

      const tx = await signer.sendTransaction({
        to: TREASURY_ADDRESS,
        value: parseEther(GAMBLE_FEE_ETH),
        data: dataHex,
      });

      setTxHash(tx.hash);
      setStep("pending");

      await tx.wait(1);

      // Call backend to execute the re-roll
      setStep("rolling");
      const res = await apiRequest("POST", "/api/fractions/gamble", {
        walletAddress,
        holdingId: holding.id,
        gamblingAmount: 100,
        txHash: tx.hash,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Gamble failed");

      setResult(data);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/fractions/holdings", walletAddress] });
    } catch (e: any) {
      const msg = e?.message || "Transaction failed";
      if (msg.includes("cancelled") || msg.includes("rejected") || msg.includes("denied") || e?.code === 4001) {
        setStep("confirm");
        toast({ title: "Transaction cancelled", variant: "destructive" });
      } else {
        setErrorMsg(msg);
        setStep("error");
      }
    }
  };

  const handleAgain = () => {
    setStep("confirm");
    setTxHash(null);
    setErrorMsg(null);
    setResult(null);
  };

  if (!holding || !col) return null;
  const rarity = result ? getRarityLabel(result.newRarity) : null;
  const basescanUrl = txHash ? `https://basescan.org/tx/${txHash}` : null;

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-sm" data-testid="modal-gamble">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dices className="h-5 w-5 text-accent" />
            Gamble Mint
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-center">
          <div className={`rounded-lg h-20 bg-gradient-to-br ${col.imageGradient} flex items-center justify-center text-4xl ${step === "rolling" ? "animate-bounce" : ""}`}>
            <span>{col.emoji}</span>
          </div>

          {/* ── Confirm ── */}
          {step === "confirm" && (
            <>
              <p className="text-sm text-muted-foreground">
                Spend <span className="font-bold text-foreground">100 fractions</span> + <span className="font-bold text-foreground">{GAMBLE_FEE_ETH} ETH</span> to re-roll your NFT rarity. Could go up — could go down.
              </p>
              <div className="rounded-lg bg-muted p-3 space-y-1 text-xs text-muted-foreground text-left">
                <div className="flex justify-between">
                  <span>Current rarity</span>
                  <span className="font-bold text-foreground">{holding.rarityScore}/100 — {getRarityLabel(holding.rarityScore).label}</span>
                </div>
                <div className="flex justify-between">
                  <span>Your fractions</span>
                  <span className="font-bold text-foreground">{formatAmount(holding.fractionAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Gamble fee</span>
                  <span className="font-bold text-foreground">{GAMBLE_FEE_ETH} ETH on Base</span>
                </div>
              </div>
              <Button
                className="w-full gap-2"
                onClick={handleGamble}
                disabled={holding.fractionAmount < 100}
                data-testid="button-confirm-gamble"
              >
                <Dices className="h-4 w-4" />
                Roll the Dice
              </Button>
            </>
          )}

          {/* ── Awaiting wallet ── */}
          {step === "awaiting_wallet" && (
            <div className="py-4 flex flex-col items-center gap-3">
              <div className="h-10 w-10 rounded-full border-4 border-accent border-t-transparent animate-spin" />
              <p className="text-sm text-muted-foreground">Approve {GAMBLE_FEE_ETH} ETH gamble fee in your wallet…</p>
            </div>
          )}

          {/* ── Pending ── */}
          {step === "pending" && (
            <div className="py-4 flex flex-col items-center gap-3">
              <Clock className="h-10 w-10 text-yellow-400 animate-pulse" />
              <p className="text-sm text-muted-foreground">Confirming on Base…</p>
              {basescanUrl && (
                <a href={basescanUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" />View on Basescan
                </a>
              )}
            </div>
          )}

          {/* ── Rolling ── */}
          {step === "rolling" && (
            <div className="py-4 flex flex-col items-center gap-3">
              <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              <p className="text-sm text-muted-foreground">Rolling your rarity…</p>
            </div>
          )}

          {/* ── Done ── */}
          {step === "done" && result && rarity && (
            <div className="space-y-3">
              <div className={`text-2xl font-black ${rarity.color}`}>
                {result.improved ? "UP!" : "Down…"}
              </div>
              <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Previous</span>
                  <span className="font-mono">{result.previousRarity}/100</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-muted-foreground">New</span>
                  <span className={`font-mono ${rarity.color}`}>{result.newRarity}/100 — {rarity.label}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                  <span>Fractions spent</span>
                  <span>100</span>
                </div>
              </div>
              {basescanUrl && (
                <a href={basescanUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" />View on Basescan
                </a>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleAgain} data-testid="button-gamble-again">
                  <Dices className="h-4 w-4 mr-1.5" />Again
                </Button>
                <Button className="flex-1" onClick={handleClose} data-testid="button-gamble-done">Done</Button>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {step === "error" && (
            <div className="py-2 space-y-3">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
              <p className="text-sm text-muted-foreground break-all">{errorMsg}</p>
              {basescanUrl && (
                <a href={basescanUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" />View on Basescan
                </a>
              )}
              <Button variant="outline" className="w-full" onClick={() => setStep("confirm")}>Try Again</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Sell Modal ───────────────────────────────────────────────────────────────

function SellModal({
  holding,
  col,
  open,
  onClose,
  walletAddress,
}: {
  holding: FractionHolding | null;
  col: FractionCollection | null;
  open: boolean;
  onClose: () => void;
  walletAddress: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [amount, setAmount] = useState("100");
  const [priceRaw, setPriceRaw] = useState("");
  const [loading, setLoading] = useState(false);

  const handleClose = () => { setAmount("100"); setPriceRaw(""); setLoading(false); onClose(); };

  if (!holding || !col) return null;

  const amountNum = parseInt(amount) || 0;
  const priceNum = parseFloat(priceRaw) || 0;
  const totalEth = (amountNum * priceNum).toFixed(6);
  const available = holding.fractionAmount;

  const handleList = async () => {
    if (amountNum < 1 || amountNum > available) {
      toast({ title: "Invalid amount", description: `You have ${available} fractions`, variant: "destructive" }); return;
    }
    if (priceNum <= 0) {
      toast({ title: "Invalid price", variant: "destructive" }); return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/fractions/listings", {
        walletAddress,
        collectionId: col.id,
        fractionAmount: amountNum,
        pricePerFraction: priceNum.toFixed(8),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to create listing");
      queryClient.invalidateQueries({ queryKey: ["/api/fractions/holdings", walletAddress] });
      queryClient.invalidateQueries({ queryKey: ["/api/fractions/listings", col.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/fractions/my-listings", walletAddress] });
      toast({ title: "Listing created!", description: `${amountNum.toLocaleString()} ${col.symbol} fractions listed at ${priceNum} ETH each.` });
      handleClose();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-sm" data-testid="modal-sell-fractions">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-accent" />
            List Fractions for Sale
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className={`rounded-lg h-14 bg-gradient-to-br ${col.imageGradient} flex items-center gap-3 px-4`}>
            <span className="text-3xl">{col.emoji}</span>
            <div>
              <div className="font-bold text-white text-sm">{col.name}</div>
              <div className="text-white/70 text-xs">You hold: {formatAmount(available)} fractions</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount to sell</label>
            <Input
              type="number" value={amount} onChange={e => setAmount(e.target.value)}
              min="1" max={available} placeholder="100"
              data-testid="input-sell-amount"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Available: {formatAmount(available)}</span>
              <button className="text-primary hover:underline" onClick={() => setAmount(String(available))}>Max</button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Price per fraction (ETH)</label>
            <Input
              type="number" value={priceRaw} onChange={e => setPriceRaw(e.target.value)}
              step="0.000001" min="0.000001" placeholder={col.pricePerFraction}
              data-testid="input-sell-price"
            />
            <div className="text-xs text-muted-foreground">Mint price: {col.pricePerFraction} ETH</div>
          </div>

          {amountNum > 0 && priceNum > 0 && (
            <div className="rounded-lg bg-muted p-3 text-sm flex justify-between">
              <span className="text-muted-foreground">Total you receive</span>
              <span className="font-mono font-bold">{totalEth} ETH</span>
            </div>
          )}

          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5">
            Fractions are locked in escrow when listed. Buyers send ETH directly to your wallet. Cancel anytime to get fractions back.
          </div>

          <Button className="w-full gap-2" onClick={handleList} disabled={loading || amountNum < 1 || priceNum <= 0} data-testid="button-confirm-sell">
            <Tag className="h-4 w-4" />
            {loading ? "Creating listing…" : "List for Sale"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Buy Listing Modal ─────────────────────────────────────────────────────────

type BuyListingStep = "confirm" | "awaiting_wallet" | "pending" | "recording" | "done" | "error";

function BuyListingModal({
  listing,
  col,
  open,
  onClose,
  walletAddress,
}: {
  listing: FractionListing | null;
  col: FractionCollection | null;
  open: boolean;
  onClose: () => void;
  walletAddress: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { getProvider } = useWallet();

  const [step, setStep] = useState<BuyListingStep>("confirm");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClose = () => {
    if (step === "pending" || step === "awaiting_wallet") return;
    setStep("confirm"); setTxHash(null); setErrorMsg(null); onClose();
  };

  if (!listing || !col) return null;

  const totalEth = (parseFloat(listing.pricePerFraction) * listing.fractionAmount).toFixed(6);
  const basescanUrl = txHash ? `https://basescan.org/tx/${txHash}` : null;
  const sellerShort = `${listing.sellerAddress.slice(0, 6)}…${listing.sellerAddress.slice(-4)}`;

  const handleBuy = async () => {
    const provider = getProvider();
    if (!provider) { setErrorMsg("Connect your ETH wallet first."); setStep("error"); return; }
    try {
      setStep("awaiting_wallet");
      try { await provider.send("eth_requestAccounts", []); } catch {}
      const signer = await provider.getSigner();
      const { parseEther: pe } = await import("ethers");
      const tx = await signer.sendTransaction({
        to: listing.sellerAddress,
        value: pe(totalEth),
      });
      setTxHash(tx.hash);
      setStep("pending");
      await tx.wait(1);

      setStep("recording");
      const res = await apiRequest("POST", `/api/fractions/listings/${listing.id}/buy`, {
        buyerAddress: walletAddress,
        txHash: tx.hash,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Recording failed");

      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/fractions/holdings", walletAddress] });
      queryClient.invalidateQueries({ queryKey: ["/api/fractions/listings", col.id] });
      toast({ title: "Purchase complete!", description: `${data.fractionAmount.toLocaleString()} ${col.symbol} fractions added to your portfolio.` });
    } catch (e: any) {
      const msg = e?.message || "Failed";
      if (msg.includes("cancelled") || msg.includes("rejected") || msg.includes("denied") || e?.code === 4001) {
        setStep("confirm"); toast({ title: "Transaction cancelled", variant: "destructive" });
      } else { setErrorMsg(msg); setStep("error"); }
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-sm" data-testid="modal-buy-listing">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            Buy Fractions
          </DialogTitle>
        </DialogHeader>

        {step === "confirm" && (
          <div className="space-y-4">
            <div className={`rounded-lg h-14 bg-gradient-to-br ${col.imageGradient} flex items-center gap-3 px-4`}>
              <span className="text-3xl">{col.emoji}</span>
              <div>
                <div className="font-bold text-white text-sm">{col.name}</div>
                <div className="text-white/70 text-xs">{col.symbol} Fractions</div>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-bold">{listing.fractionAmount.toLocaleString()} fractions</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price per fraction</span>
                <span className="font-mono">{listing.pricePerFraction} ETH</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Total cost</span>
                <span className="font-mono font-bold text-primary">{totalEth} ETH</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Seller</span>
                <span className="font-mono text-muted-foreground">{sellerShort}</span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5">
              ETH goes directly to the seller. Fractions are credited to your portfolio after on-chain verification.
            </div>
            <Button className="w-full gap-2" onClick={handleBuy} data-testid="button-confirm-buy-listing">
              <ShoppingBag className="h-4 w-4" />
              Pay {totalEth} ETH
            </Button>
          </div>
        )}

        {step === "awaiting_wallet" && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">Approve payment in your wallet…</p>
          </div>
        )}

        {(step === "pending" || step === "recording") && (
          <div className="py-6 flex flex-col items-center gap-4 text-center">
            <Clock className="h-10 w-10 text-yellow-400 animate-pulse" />
            <div>
              <p className="font-semibold">{step === "pending" ? "Waiting for confirmation…" : "Recording purchase…"}</p>
              <p className="text-sm text-muted-foreground mt-1">Base mainnet</p>
            </div>
            {basescanUrl && (
              <a href={basescanUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />View on Basescan
              </a>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="py-4 flex flex-col items-center gap-4 text-center">
            <CheckCircle className="h-14 w-14 text-green-400" />
            <div>
              <p className="font-black text-xl">Fractions Acquired!</p>
              <p className="text-sm text-muted-foreground mt-1">{listing.fractionAmount.toLocaleString()} {col.symbol} added to your portfolio.</p>
            </div>
            {basescanUrl && (
              <a href={basescanUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />View on Basescan
              </a>
            )}
            <Button className="w-full" onClick={handleClose} data-testid="button-done-buy-listing">Done</Button>
          </div>
        )}

        {step === "error" && (
          <div className="py-4 flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="text-sm text-muted-foreground break-all">{errorMsg}</p>
            {basescanUrl && (
              <a href={basescanUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />View on Basescan
              </a>
            )}
            <Button variant="outline" className="w-full" onClick={() => setStep("confirm")}>Try Again</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Create Collection Modal ──────────────────────────────────────────────────

const CREATION_FEE_ETH = "0.0005";

const GRADIENT_OPTIONS = [
  { label: "Purple → Cyan",   value: "from-purple-500 to-cyan-500" },
  { label: "Green → Blue",    value: "from-green-500 to-blue-500" },
  { label: "Pink → Orange",   value: "from-pink-500 to-orange-400" },
  { label: "Yellow → Red",    value: "from-yellow-400 to-red-500" },
  { label: "Blue → Purple",   value: "from-blue-500 to-purple-600" },
  { label: "Teal → Green",    value: "from-teal-400 to-green-500" },
  { label: "Rose → Pink",     value: "from-rose-500 to-pink-500" },
  { label: "Amber → Yellow",  value: "from-amber-500 to-yellow-400" },
  { label: "Indigo → Blue",   value: "from-indigo-500 to-blue-400" },
  { label: "Cyan → Teal",     value: "from-cyan-400 to-teal-500" },
];

const EMOJI_PRESETS = ["🐸","🐶","🐱","🐻","🦊","🐸","🚀","💎","🌙","⭐","🔥","💀","🎭","🎲","🦄","🤖","👾","🌈","🍕","⚡"];

type CreateStep = "form" | "awaiting_wallet" | "pending" | "creating" | "done" | "error";

function CreateCollectionModal({ open, onClose, walletAddress }: { open: boolean; onClose: () => void; walletAddress: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { getProvider } = useWallet();

  const [step, setStep]               = useState<CreateStep>("form");
  const [txHash, setTxHash]           = useState<string | null>(null);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [createdCol, setCreatedCol]   = useState<FractionCollection | null>(null);

  // form fields
  const [name, setName]               = useState("");
  const [symbol, setSymbol]           = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji]             = useState("🐸");
  const [gradient, setGradient]       = useState(GRADIENT_OPTIONS[0].value);
  const [priceRaw, setPriceRaw]       = useState("0.000001");
  const [supply, setSupply]           = useState("1000000");

  // image upload
  const [imageFile, setImageFile]     = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 4MB allowed", variant: "destructive" });
      return;
    }
    setImageFile(file);
    setUploadedImageUrl(null);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile || !imagePreview) return null;
    setIsUploading(true);
    try {
      const res = await apiRequest("POST", "/api/fractions/upload-image", {
        base64: imagePreview,
        filename: imageFile.name,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Upload failed");
      setUploadedImageUrl(data.url);
      return data.url;
    } catch (e: any) {
      toast({ title: "Image upload failed", description: e.message, variant: "destructive" });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (step === "pending" || step === "awaiting_wallet") return;
    setStep("form");
    setTxHash(null); setErrorMsg(null); setCreatedCol(null);
    setName(""); setSymbol(""); setDescription(""); setEmoji("🐸");
    setGradient(GRADIENT_OPTIONS[0].value); setPriceRaw("0.000001"); setSupply("1000000");
    setImageFile(null); setImagePreview(null); setUploadedImageUrl(null);
    onClose();
  };

  // Auto-derive symbol from name
  const handleNameChange = (v: string) => {
    setName(v);
    const auto = v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
    setSymbol(auto);
  };

  const handleCreate = async () => {
    if (!name.trim() || !symbol.trim()) {
      toast({ title: "Name and symbol required", variant: "destructive" }); return;
    }
    const price = parseFloat(priceRaw);
    if (isNaN(price) || price < 0.0000001 || price > 1) {
      toast({ title: "Invalid price", description: "Between 0.0000001 and 1 ETH", variant: "destructive" }); return;
    }

    const provider = getProvider();
    if (!provider) {
      setErrorMsg("Wallet not connected. Please connect your ETH wallet first.");
      setStep("error"); return;
    }

    try {
      setStep("awaiting_wallet");
      setErrorMsg(null);

      // Request account access first (required for ethers v6 with some wallets)
      try {
        await provider.send("eth_requestAccounts", []);
      } catch (accErr: any) {
        if (accErr?.code === 4001 || accErr?.message?.toLowerCase().includes("rejected") || accErr?.message?.toLowerCase().includes("cancelled")) {
          setStep("form");
          toast({ title: "Wallet access denied", variant: "destructive" });
          return;
        }
        // Non-fatal — proceed and let getSigner handle it
      }

      const signer = await provider.getSigner();
      const dataHex = "0x" + Buffer.from(`create-collection:${name.trim()}:${symbol.trim()}`, "utf8").toString("hex");

      const tx = await signer.sendTransaction({
        to: TREASURY_ADDRESS,
        value: parseEther(CREATION_FEE_ETH),
        data: dataHex,
      });

      setTxHash(tx.hash);
      setStep("pending");
      await tx.wait(1);

      setStep("creating");

      // Upload image if one was selected
      let finalImageUrl: string | null = uploadedImageUrl;
      if (imageFile && !uploadedImageUrl) {
        finalImageUrl = await uploadImage();
      }

      const res = await apiRequest("POST", "/api/fractions/collections/create", {
        walletAddress,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description: description.trim() || undefined,
        emoji,
        imageGradient: gradient,
        imageUrl: finalImageUrl || undefined,
        pricePerFraction: price.toFixed(8),
        totalSupply: parseInt(supply) || 1_000_000,
        txHash: tx.hash,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Creation failed");

      setCreatedCol(data.collection);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/fractions/collections"] });
      toast({ title: "Collection launched!", description: `${data.collection.name} is now live on BasedMem.` });
    } catch (e: any) {
      const msg = e?.message || "Failed";
      if (msg.includes("cancelled") || msg.includes("rejected") || msg.includes("denied") || e?.code === 4001) {
        setStep("form");
        toast({ title: "Transaction cancelled", variant: "destructive" });
      } else {
        setErrorMsg(msg);
        setStep("error");
      }
    }
  };

  const basescanUrl = txHash ? `https://basescan.org/tx/${txHash}` : null;

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="modal-create-collection">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            Launch Your Fraction Collection
          </DialogTitle>
        </DialogHeader>

        {/* ── Form ── */}
        {step === "form" && (
          <div className="space-y-4">
            {/* Preview banner */}
            <div
              className={`rounded-lg h-24 relative overflow-hidden flex items-center justify-center cursor-pointer group ${!imagePreview ? `bg-gradient-to-br ${gradient}` : ""}`}
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-image-preview-click"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
              ) : null}
              <div className="relative z-10 flex flex-col items-center gap-1 text-white/80 group-hover:text-white transition-colors">
                {!imagePreview && <ImageIcon className="h-6 w-6" />}
                <span className="text-xs font-medium bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full">
                  {imagePreview ? "Click to change image" : "Click to upload image"}
                </span>
              </div>
              {imageFile && (
                <button
                  className="absolute top-1.5 right-1.5 z-20 bg-black/60 rounded-full p-0.5 text-white hover:bg-black/80 transition-colors"
                  onClick={e => { e.stopPropagation(); setImageFile(null); setImagePreview(null); setUploadedImageUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  data-testid="button-remove-image"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={handleImageSelect}
              data-testid="input-image-file"
            />

            {/* Name + Symbol */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Collection Name</label>
                <Input value={name} onChange={e => handleNameChange(e.target.value)} placeholder="BasedPepe" maxLength={50} data-testid="input-collection-name" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Symbol</label>
                <Input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase().slice(0,10))} placeholder="PEPE" maxLength={10} data-testid="input-collection-symbol" />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description (optional)</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="The most based meme on Base..." maxLength={200} data-testid="input-collection-description" />
            </div>

            {/* Gradient picker (fallback when no image) */}
            {!imagePreview && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Background Color (if no image)</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {GRADIENT_OPTIONS.map(g => (
                    <button key={g.value} onClick={() => setGradient(g.value)} title={g.label}
                      className={`h-8 rounded-md bg-gradient-to-br ${g.value} border-2 transition-all ${gradient === g.value ? "border-white scale-105" : "border-transparent"}`}
                      data-testid={`button-gradient-${g.label}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Price + Supply */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Price / Fraction (ETH)</label>
                <Input type="number" value={priceRaw} onChange={e => setPriceRaw(e.target.value)} step="0.0000001" min="0.0000001" max="1" data-testid="input-price-per-fraction" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Supply</label>
                <Input type="number" value={supply} onChange={e => setSupply(e.target.value)} placeholder="1000000" min="100000" max="100000000" data-testid="input-total-supply" />
              </div>
            </div>

            {/* Fee info box */}
            <div className="rounded-lg bg-muted p-3 space-y-1.5 text-sm">
              <div className="font-semibold text-foreground">Collection Creation Fee</div>
              <div className="flex justify-between text-muted-foreground">
                <span>One-time fee (spam protection)</span>
                <span className="font-mono font-bold text-foreground">{CREATION_FEE_ETH} ETH</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Network</span>
                <span className="font-medium text-blue-400">Base Mainnet</span>
              </div>
              <div className="text-xs text-muted-foreground pt-1 border-t border-border">
                After payment is confirmed on-chain, your collection goes live instantly. You earn ETH from every fraction mint.
              </div>
            </div>

            <Button className="w-full gap-2" onClick={handleCreate}
              disabled={!name.trim() || !symbol.trim()}
              data-testid="button-create-collection">
              <Sparkles className="h-4 w-4" />
              Pay {CREATION_FEE_ETH} ETH &amp; Launch Collection
            </Button>
          </div>
        )}

        {/* ── Awaiting wallet ── */}
        {step === "awaiting_wallet" && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <div>
              <p className="font-semibold">Approve in your wallet</p>
              <p className="text-sm text-muted-foreground mt-1">Pay {CREATION_FEE_ETH} ETH to launch your collection on Base</p>
            </div>
          </div>
        )}

        {/* ── Pending ── */}
        {step === "pending" && (
          <div className="py-6 flex flex-col items-center gap-4 text-center">
            <Clock className="h-12 w-12 text-yellow-400 animate-pulse" />
            <div>
              <p className="font-semibold">Transaction submitted!</p>
              <p className="text-sm text-muted-foreground mt-1">Waiting for confirmation on Base…</p>
            </div>
            {basescanUrl && (
              <a href={basescanUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />View on Basescan
              </a>
            )}
          </div>
        )}

        {/* ── Creating on backend ── */}
        {step === "creating" && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <div className="h-10 w-10 rounded-full border-4 border-accent border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">Deploying your collection…</p>
          </div>
        )}

        {/* ── Done ── */}
        {step === "done" && createdCol && (
          <div className="py-4 flex flex-col items-center gap-4 text-center">
            <CheckCircle className="h-14 w-14 text-green-400" />
            <div>
              <p className="font-black text-xl">Collection Launched!</p>
              <p className="text-muted-foreground text-sm mt-1">
                <span className="font-bold text-foreground">{createdCol.name}</span> ({createdCol.symbol}) is live — anyone can now mint fractions.
              </p>
            </div>
            <div className={`rounded-lg h-16 w-full bg-gradient-to-br ${createdCol.imageGradient} flex items-center justify-center text-4xl`}>
              <span>{createdCol.emoji}</span>
            </div>
            {basescanUrl && (
              <a href={basescanUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />View on Basescan
              </a>
            )}
            <Button className="w-full" onClick={handleClose} data-testid="button-done-create">Done</Button>
          </div>
        )}

        {/* ── Error ── */}
        {step === "error" && (
          <div className="py-4 flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <div>
              <p className="font-semibold">Launch failed</p>
              <p className="text-sm text-muted-foreground mt-1 break-all">{errorMsg}</p>
            </div>
            {basescanUrl && (
              <a href={basescanUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />View on Basescan
              </a>
            )}
            <Button variant="outline" className="w-full" onClick={() => setStep("form")}>Back to Form</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function Fractions() {
  const { walletAddress } = useWallet();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [buyTarget, setBuyTarget] = useState<FractionCollection | null>(null);
  const [gambleTarget, setGambleTarget] = useState<{ holding: FractionHolding; col: FractionCollection } | null>(null);
  const [sellTarget, setSellTarget] = useState<{ holding: FractionHolding; col: FractionCollection } | null>(null);
  const [buyListingTarget, setBuyListingTarget] = useState<{ listing: FractionListing; col: FractionCollection } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedMarket, setExpandedMarket] = useState<string | null>(null);

  const { data: collections = [], isLoading: loadingCols } = useQuery<FractionCollection[]>({
    queryKey: ["/api/fractions/collections"],
  });

  const { data: holdings = [] } = useQuery<FractionHolding[]>({
    queryKey: ["/api/fractions/holdings", walletAddress],
    enabled: !!walletAddress,
  });

  // Listings for the currently expanded collection
  const { data: activeListings = [] } = useQuery<FractionListing[]>({
    queryKey: ["/api/fractions/listings", expandedMarket],
    enabled: !!expandedMarket,
  });

  const holdingsMap: Record<string, FractionHolding> = {};
  holdings.forEach(h => { holdingsMap[h.collectionId] = h; });

  const myHoldings = holdings.filter(h => h.fractionAmount > 0);

  const handleCancelListing = async (listing: FractionListing) => {
    try {
      const res = await apiRequest("DELETE", `/api/fractions/listings/${listing.id}`, { walletAddress });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ["/api/fractions/listings", listing.collectionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/fractions/holdings", walletAddress] });
      toast({ title: "Listing cancelled", description: "Fractions returned to your portfolio." });
    } catch (e: any) {
      toast({ title: "Cancel failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-accent/5 to-background border-b border-border">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(139,92,246,0.15),_transparent_60%)]" />
        <div className="relative max-w-7xl mx-auto px-4 py-10 sm:py-16">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Layers className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
                Memetic Fractions
              </h1>
            </div>
            <Badge variant="secondary" className="text-xs font-bold gap-1">
              <Zap className="h-3 w-3" />
              DN404 Inspired
            </Badge>
          </div>
          <p className="text-muted-foreground max-w-xl text-sm sm:text-base">
            Own fractional shares of legendary meme NFTs. Accumulate fractions to level up your tier, or gamble mint to re-roll your rarity score.
          </p>

          {/* Global stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {[
              { label: "Collections", value: collections.length, icon: Layers },
              { label: "Total Supply", value: "5M", icon: TrendingUp },
              { label: "My Holdings", value: myHoldings.length, icon: Wallet },
              { label: "My Tier", value: myHoldings.length > 0 ? getTier(Math.max(...myHoldings.map(h => h.fractionAmount))).name : "—", icon: Trophy },
            ].map(stat => (
              <div key={stat.label} className="bg-card border border-border rounded-lg px-3 py-2.5 flex items-center gap-2" data-testid={`stat-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>
                <stat.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                  <div className="font-bold text-sm">{stat.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">

        {/* Tier ladder */}
        <section>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-400" />
            Tier Ladder
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {TIERS.map(tier => {
              const TierIcon = tier.icon;
              return (
                <div
                  key={tier.name}
                  className="bg-card border border-border rounded-lg p-3 text-center space-y-1"
                  data-testid={`tier-card-${tier.name.toLowerCase()}`}
                >
                  <TierIcon className={`h-5 w-5 mx-auto ${tier.color}`} />
                  <div className={`font-bold text-sm ${tier.color}`}>{tier.name}</div>
                  <div className="text-[10px] text-muted-foreground">{tier.description}</div>
                </div>
              );
            })}
          </div>
        </section>

        {/* My Portfolio */}
        {walletAddress && myHoldings.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              My Portfolio
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {myHoldings.map(h => {
                const col = collections.find(c => c.id === h.collectionId);
                if (!col) return null;
                return (
                  <HoldingCard
                    key={h.id}
                    holding={h}
                    col={col}
                    onGamble={(holding, c) => setGambleTarget({ holding, col: c })}
                    onSell={(holding, c) => setSellTarget({ holding, col: c })}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Collections */}
        <section>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              Available Collections
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 shrink-0"
              onClick={() => {
                if (!walletAddress) {
                  return;
                }
                setCreateOpen(true);
              }}
              disabled={!walletAddress}
              data-testid="button-launch-collection"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {walletAddress ? "Launch Your Collection" : "Connect Wallet to Launch"}
            </Button>
          </div>
          {loadingCols ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-60 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {collections.map(col => (
                <CollectionCard
                  key={col.id}
                  col={col}
                  userHolding={holdingsMap[col.id]}
                  onBuy={c => {
                    if (!walletAddress) return;
                    setBuyTarget(c);
                  }}
                />
              ))}
            </div>
          )}
          {!walletAddress && (
            <div className="mt-4 rounded-lg border border-border bg-card p-6 text-center text-muted-foreground text-sm" data-testid="text-connect-wallet-prompt">
              <Wallet className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              Connect your wallet to mint fractions
            </div>
          )}
        </section>

        {/* P2P Market */}
        <section>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-green-400" />
            P2P Fraction Market
          </h2>
          <div className="space-y-3">
            {collections.map(col => (
              <div key={col.id} className="border border-border rounded-lg bg-card overflow-hidden">
                {/* Collection row header */}
                <button
                  className="w-full flex items-center gap-3 p-3 hover-elevate text-left"
                  onClick={() => setExpandedMarket(prev => prev === col.id ? null : col.id)}
                  data-testid={`button-market-expand-${col.id}`}
                >
                  <div className={`h-10 w-10 rounded-md bg-gradient-to-br ${col.imageGradient} flex items-center justify-center text-xl shrink-0`}>
                    {col.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{col.name}</div>
                    <div className="text-xs text-muted-foreground">{col.symbol} · floor {col.pricePerFraction} ETH</div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {expandedMarket === col.id ? "Hide" : "View listings"}
                  </div>
                </button>

                {/* Expanded listings */}
                {expandedMarket === col.id && (
                  <div className="border-t border-border">
                    {activeListings.length === 0 ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        No active listings for {col.name} yet.
                        {walletAddress && holdingsMap[col.id]?.fractionAmount > 0 && (
                          <div className="mt-2">
                            <Button size="sm" variant="outline" className="gap-1.5"
                              onClick={() => setSellTarget({ holding: holdingsMap[col.id], col })}>
                              <Tag className="h-3.5 w-3.5" />
                              List yours for sale
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {activeListings.map(listing => {
                          const total = (parseFloat(listing.pricePerFraction) * listing.fractionAmount).toFixed(6);
                          const isMine = walletAddress && listing.sellerAddress.toLowerCase() === walletAddress.toLowerCase();
                          const sellerShort = `${listing.sellerAddress.slice(0, 6)}…${listing.sellerAddress.slice(-4)}`;
                          return (
                            <div key={listing.id} className="flex items-center gap-3 p-3" data-testid={`listing-${listing.id}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-bold text-sm">{listing.fractionAmount.toLocaleString()}</span>
                                  <span className="text-xs text-muted-foreground">fractions</span>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <span className="font-mono text-xs text-muted-foreground">{listing.pricePerFraction} ETH each</span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                                  <span>Total: <span className="font-mono font-bold text-foreground">{total} ETH</span></span>
                                  <span>· by {isMine ? <span className="text-primary">you</span> : sellerShort}</span>
                                </div>
                              </div>
                              {isMine ? (
                                <Button size="sm" variant="outline" className="gap-1 text-xs shrink-0"
                                  onClick={() => handleCancelListing(listing)}
                                  data-testid={`button-cancel-listing-${listing.id}`}>
                                  <X className="h-3 w-3" />
                                  Cancel
                                </Button>
                              ) : walletAddress ? (
                                <Button size="sm" className="gap-1 text-xs shrink-0"
                                  onClick={() => setBuyListingTarget({ listing, col })}
                                  data-testid={`button-buy-listing-${listing.id}`}>
                                  <ShoppingBag className="h-3 w-3" />
                                  Buy
                                </Button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border border-border rounded-lg bg-card p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            How Memetic Fractions Work
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            {[
              {
                icon: Layers,
                title: "1. Mint Fractions",
                body: "Each meme NFT collection is divided into 1,000,000 fractions. Buy as many as you want — every fraction counts toward your tier.",
              },
              {
                icon: Trophy,
                title: "2. Level Up Your Tier",
                body: "Accumulate fractions to climb from Bronze → Silver → Gold → Legendary → Whale. Whales hold 1M fractions = a full NFT.",
              },
              {
                icon: Dices,
                title: "3. Gamble Mint",
                body: "Spend 100 fractions to re-roll your NFT rarity score (1–100). Higher rarity = cooler bragging rights. The risk is real!",
              },
            ].map(item => (
              <div key={item.title} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  <item.icon className="h-4 w-4 text-primary shrink-0" />
                  {item.title}
                </div>
                <p className="text-muted-foreground text-xs">{item.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Modals */}
      <BuyModal
        col={buyTarget}
        open={!!buyTarget}
        onClose={() => setBuyTarget(null)}
        walletAddress={walletAddress ?? ""}
      />
      <GambleModal
        holding={gambleTarget?.holding ?? null}
        col={gambleTarget?.col ?? null}
        open={!!gambleTarget}
        onClose={() => setGambleTarget(null)}
        walletAddress={walletAddress ?? ""}
      />
      <CreateCollectionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        walletAddress={walletAddress ?? ""}
      />
      <SellModal
        holding={sellTarget?.holding ?? null}
        col={sellTarget?.col ?? null}
        open={!!sellTarget}
        onClose={() => setSellTarget(null)}
        walletAddress={walletAddress ?? ""}
      />
      <BuyListingModal
        listing={buyListingTarget?.listing ?? null}
        col={buyListingTarget?.col ?? null}
        open={!!buyListingTarget}
        onClose={() => setBuyListingTarget(null)}
        walletAddress={walletAddress ?? ""}
      />
    </div>
  );
}
