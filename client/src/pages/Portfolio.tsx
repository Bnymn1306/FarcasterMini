import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TrendingUp, TrendingDown, Wallet, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SiFarcaster } from "react-icons/si";
import { useWallet } from "@/contexts/WalletContext";
import { useQuery } from "@tanstack/react-query";
import type { HoldingWithToken } from "@shared/schema";
import { Link } from "wouter";

export default function Portfolio() {
  const { walletAddress, isWalletConnected } = useWallet();

  const { data: userData } = useQuery({
    queryKey: ["/api/users", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      const response = await fetch(`/api/users?walletAddress=${walletAddress}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!walletAddress,
  });

  const { data: holdings = [], isLoading } = useQuery<HoldingWithToken[]>({
    queryKey: ["/api/holdings", userData?.id],
    queryFn: async () => {
      if (!userData?.id) return [];
      const response = await fetch(`/api/holdings/${userData.id}`);
      if (!response.ok) throw new Error("Failed to fetch holdings");
      return response.json();
    },
    enabled: !!userData?.id,
  });

  if (!isWalletConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-muted-foreground mb-4">Connect your wallet to view portfolio</p>
          <Button>Connect Wallet</Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  const holdingsWithCalcs = holdings.map(holding => {
    const amount = parseFloat(holding.amount);
    const avgBuyPrice = parseFloat(holding.averageBuyPrice);
    const currentPrice = parseFloat(holding.token.currentPrice);
    
    if (!isFinite(amount) || amount <= 0 || !isFinite(avgBuyPrice) || avgBuyPrice <= 0) {
      return {
        ...holding,
        value: "0.00",
        buyPrice: "0.0000",
        currentPrice: currentPrice.toFixed(4),
        pnl: 0,
        pnlValue: 0,
      };
    }
    
    const value = amount * currentPrice;
    const pnl = ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100;
    const pnlValue = value - (amount * avgBuyPrice);

    return {
      ...holding,
      value: value.toFixed(2),
      buyPrice: avgBuyPrice.toFixed(4),
      currentPrice: currentPrice.toFixed(4),
      pnl: isFinite(pnl) ? pnl : 0,
      pnlValue: isFinite(pnlValue) ? pnlValue : 0,
    };
  });

  const totalValue = holdingsWithCalcs.reduce((sum, h) => sum + parseFloat(h.value), 0);
  const totalPnL = holdingsWithCalcs.reduce((sum, h) => sum + h.pnlValue, 0);
  const totalPnLPercent = totalValue > 0 ? ((totalPnL / (totalValue - totalPnL)) * 100).toFixed(2) : "0.00";

  const sharePortfolio = async () => {
    const baseUrl = window.location.origin;
    const tokenNames = holdings.map(h => `$${h.token.symbol}`).join(', ');
    const pnlDirection = totalPnL >= 0 ? 'UP' : 'DOWN';
    const portfolioUrl = `${baseUrl}/portfolio`;
    const text = `My BasedMem Portfolio [${pnlDirection}]\n\nTotal Value: $${totalValue.toFixed(2)}\nP&L: ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)} (${totalPnL >= 0 ? '+' : ''}${totalPnLPercent}%)\nTokens: ${holdingsWithCalcs.length}\n\nHoldings: ${tokenNames}\n\n#BasedMem #MemeCoins #Portfolio`;
    
    const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(portfolioUrl)}`;
    
    try {
      const sdk = (await import("@farcaster/frame-sdk")).default;
      await sdk.actions.openUrl(warpcastUrl);
    } catch (error) {
      console.log("SDK not available, opening in new tab:", error);
      window.open(warpcastUrl, '_blank');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black mb-2">My Portfolio</h1>
          <p className="text-muted-foreground">Track your meme token holdings and performance</p>
        </div>
        <Button 
          variant="outline" 
          className="gap-2"
          onClick={sharePortfolio}
          data-testid="button-share-portfolio"
        >
          <SiFarcaster className="h-4 w-4" />
          Share Portfolio
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <div className="flex items-center gap-2 mb-2 text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span className="text-xs uppercase font-semibold">Total Value</span>
          </div>
          <p className="text-3xl font-black font-mono">${totalValue.toFixed(2)}</p>
        </Card>

        <Card className={`p-6 bg-gradient-to-br ${totalPnL >= 0 ? 'from-chart-2/10 to-chart-2/5 border-chart-2/20' : 'from-destructive/10 to-destructive/5 border-destructive/20'}`}>
          <div className="flex items-center gap-2 mb-2 text-muted-foreground">
            {totalPnL >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span className="text-xs uppercase font-semibold">Total P&L</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className={`text-3xl font-black font-mono ${totalPnL >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </p>
            <Badge className={totalPnL >= 0 ? 'bg-chart-2/20 text-chart-2' : 'bg-destructive/20 text-destructive'}>
              {totalPnL >= 0 ? '+' : ''}{totalPnLPercent}%
            </Badge>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
          <div className="flex items-center gap-2 mb-2 text-muted-foreground">
            <span className="text-xs uppercase font-semibold">Tokens Held</span>
          </div>
          <p className="text-3xl font-black font-mono">{holdingsWithCalcs.length}</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left p-4 text-xs uppercase font-semibold text-muted-foreground">Token</th>
                <th className="text-right p-4 text-xs uppercase font-semibold text-muted-foreground">Amount</th>
                <th className="text-right p-4 text-xs uppercase font-semibold text-muted-foreground">Value</th>
                <th className="text-right p-4 text-xs uppercase font-semibold text-muted-foreground">Avg Buy</th>
                <th className="text-right p-4 text-xs uppercase font-semibold text-muted-foreground">Current</th>
                <th className="text-right p-4 text-xs uppercase font-semibold text-muted-foreground">P&L</th>
                <th className="text-right p-4 text-xs uppercase font-semibold text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {holdingsWithCalcs.map((holding) => (
                <tr key={holding.id} className="border-b border-border hover-elevate" data-testid={`row-holding-${holding.id}`}>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={holding.token.logoUrl || undefined} alt={holding.token.name} />
                        <AvatarFallback>{holding.token.symbol.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold">{holding.token.name}</p>
                        <p className="text-sm text-muted-foreground uppercase">{holding.token.symbol}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-right font-mono" data-testid={`text-amount-${holding.id}`}>
                    {parseFloat(holding.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-right font-mono font-semibold" data-testid={`text-value-${holding.id}`}>
                    ${holding.value}
                  </td>
                  <td className="p-4 text-right font-mono text-sm text-muted-foreground">
                    ${holding.buyPrice}
                  </td>
                  <td className="p-4 text-right font-mono text-sm">
                    ${holding.currentPrice}
                  </td>
                  <td className="p-4 text-right" data-testid={`text-pnl-${holding.id}`}>
                    <div className="flex items-center justify-end gap-2">
                      {holding.pnl >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-chart-2" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-destructive" />
                      )}
                      <span className={`font-mono font-semibold ${holding.pnl >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
                        {holding.pnl >= 0 ? '+' : ''}{holding.pnl.toFixed(2)}%
                      </span>
                    </div>
                    <p className={`text-xs font-mono ${holding.pnl >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
                      {holding.pnl >= 0 ? '+' : ''}${holding.pnlValue.toFixed(2)}
                    </p>
                  </td>
                  <td className="p-4 text-right">
                    <Link href={`/token/${holding.tokenId}`}>
                      <Button size="sm" variant="outline" data-testid={`button-trade-${holding.id}`}>
                        Trade
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {holdingsWithCalcs.length === 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground mb-4">No tokens in your portfolio yet</p>
            <Link href="/browse">
              <Button>Start Trading</Button>
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
