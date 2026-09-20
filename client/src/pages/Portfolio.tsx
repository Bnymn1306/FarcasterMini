import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TrendingUp, TrendingDown, Wallet, Share2, RefreshCw, Loader2, ExternalLink, Info, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SiFarcaster } from "react-icons/si";
import { useWallet } from "@/contexts/WalletContext";
import { useQuery } from "@tanstack/react-query";
import type { HoldingWithToken } from "@shared/schema";
import { Link } from "wouter";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChain } from "@/contexts/ChainContext";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { SolanaWalletSelector } from "@/components/SolanaWalletSelector";

interface DeFiProtocol {
  id: string;
  name: string;
  chain: string;
  logo?: string;
  netUsdValue: number;
  positions: {
    name: string;
    assetUsdValue: number;
    debtUsdValue: number;
    netUsdValue: number;
  }[];
}

function formatPrice(price: number): string {
  if (!isFinite(price) || price === 0) return "0.00";
  
  if (price >= 1) {
    return price.toFixed(2);
  } else if (price >= 0.0001) {
    return price.toFixed(4);
  } else if (price >= 0.000001) {
    return price.toFixed(6);
  } else {
    return price.toFixed(8);
  }
}

export default function Portfolio() {
  const { walletAddress, isWalletConnected } = useWallet();
  const { balances: walletBalances, isLoading: isLoadingBalances, refetch: refetchBalances } = useWalletBalances();
  const { chainInfo, isBase, isSolana } = useChain();
  const { publicKey: solanaPublicKey, isConnected: solanaConnected, balance: solanaBalance, refreshBalance: refreshSolanaBalance, walletType: solanaWalletType } = useSolanaWallet();

  const { data: userData, isLoading: isLoadingUser } = useQuery({
    queryKey: ["/api/users", walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error("No wallet address");
      const response = await fetch(`/api/users?walletAddress=${walletAddress}`);
      if (!response.ok) throw new Error("Failed to fetch user");
      return response.json();
    },
    enabled: !!walletAddress && isBase,
  });

  // Fetch DeFi positions from DeBank API (Base only)
  const { data: defiProtocols = [], isLoading: isLoadingDeFi, error: defiError } = useQuery<DeFiProtocol[]>({
    queryKey: ["/api/wallet/defi-positions", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const response = await fetch(`/api/wallet/defi-positions/${walletAddress}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to fetch DeFi positions');
      }
      const data = await response.json();
      return data.protocols || [];
    },
    enabled: !!walletAddress && isBase,
    refetchInterval: 60000, // Refresh every minute
    retry: 2, // Retry failed requests twice
  });

  const { data: holdings = [], isLoading: isLoadingHoldings } = useQuery<HoldingWithToken[]>({
    queryKey: ["/api/holdings", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      
      const userResponse = await fetch(`/api/users?walletAddress=${walletAddress}`);
      if (!userResponse.ok) return [];
      const user = await userResponse.json();
      
      if (!user?.id) return [];
      
      const holdingsResponse = await fetch(`/api/holdings/${user.id}`);
      if (!holdingsResponse.ok) return [];
      
      return holdingsResponse.json();
    },
    enabled: !!walletAddress && isBase,
  });

  const isLoading = isLoadingUser || isLoadingHoldings;

  // Handle Solana chain first - don't require EVM wallet for Solana users
  if (isSolana) {
    const walletDisplayName = solanaWalletType 
      ? solanaWalletType.charAt(0).toUpperCase() + solanaWalletType.slice(1)
      : "Solana Wallet";

    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Wallet className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-black">Portfolio</h1>
            <Badge variant="outline" className="border-purple-500 text-purple-500">
              {chainInfo.icon} Solana
            </Badge>
          </div>
          <p className="text-muted-foreground">Track your Solana holdings</p>
        </div>

        {solanaConnected && solanaPublicKey ? (
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Wallet className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      {walletDisplayName}
                      <Badge variant="secondary" className="text-xs">Connected</Badge>
                    </h3>
                    <p className="text-sm text-muted-foreground font-mono">
                      {solanaPublicKey.slice(0, 8)}...{solanaPublicKey.slice(-8)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => refreshSolanaBalance()}
                    data-testid="button-refresh-sol-balance"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <SolanaWalletSelector 
                    trigger={
                      <Button variant="outline" size="sm" data-testid="button-change-wallet">
                        Change Wallet
                      </Button>
                    }
                  />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-lg bg-purple-500/10">
                  <Coins className="h-6 w-6 text-purple-500" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">SOL Balance</h3>
                  <p className="text-sm text-muted-foreground">Native Solana</p>
                </div>
              </div>
              <div className="text-4xl font-black text-purple-500" data-testid="text-sol-balance">
                {solanaBalance} SOL
              </div>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Info className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Birdeye</h3>
                    <p className="text-sm text-muted-foreground">Portfolio tracker</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Track all your Solana tokens, DeFi positions, and NFTs in one place.
                </p>
                <Button asChild className="w-full gap-2">
                  <a href={`https://birdeye.so/portfolio/${solanaPublicKey}`} target="_blank" rel="noopener noreferrer">
                    View on Birdeye
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-accent/10">
                    <TrendingUp className="h-6 w-6 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Step Finance</h3>
                    <p className="text-sm text-muted-foreground">DeFi Dashboard</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Monitor all your Solana DeFi positions, staking, and LP tokens.
                </p>
                <Button asChild variant="outline" className="w-full gap-2">
                  <a href={`https://app.step.finance/en/dashboard?watching=${solanaPublicKey}`} target="_blank" rel="noopener noreferrer">
                    View on Step
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </Card>
            </div>
          </div>
        ) : (
          <Card className="p-8 text-center">
            <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-6">Connect your Solana wallet to view portfolio</p>
            <SolanaWalletSelector 
              trigger={
                <Button size="lg" className="gap-2" data-testid="button-connect-solana">
                  <Wallet className="h-5 w-5" />
                  Connect Wallet
                </Button>
              }
            />
          </Card>
        )}

        <Card className="mt-6 p-4 bg-muted/30">
          <p className="text-sm text-muted-foreground text-center">
            Switch to Base network for full portfolio tracking with on-chain data.
          </p>
        </Card>
      </div>
    );
  }

  // Base chain - require EVM wallet
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
        buyPrice: "0.00",
        currentPrice: formatPrice(currentPrice),
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
      buyPrice: formatPrice(avgBuyPrice),
      currentPrice: formatPrice(currentPrice),
      pnl: isFinite(pnl) ? pnl : 0,
      pnlValue: isFinite(pnlValue) ? pnlValue : 0,
    };
  });

  // Calculate totals from wallet balances
  const walletTotalValue = walletBalances.reduce((sum, b) => sum + b.balanceUSD, 0);
  
  // Calculate totals from holdings
  const totalValue = holdingsWithCalcs.reduce((sum, h) => sum + parseFloat(h.value), 0);
  const totalPnL = holdingsWithCalcs.reduce((sum, h) => sum + h.pnlValue, 0);
  const totalPnLPercent = totalValue > 0 ? ((totalPnL / (totalValue - totalPnL)) * 100).toFixed(2) : "0.00";
  
  // Grand total (wallet + holdings)
  const grandTotalValue = walletTotalValue + totalValue;

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
      <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl font-black mb-2">My Portfolio</h1>
            <p className="text-muted-foreground">Base Network - Wallet Balances & DeFi Positions</p>
          </div>
          <Badge variant="outline" className="border-primary text-primary">
            {chainInfo.icon} Base
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={refetchBalances}
            disabled={isLoadingBalances}
            data-testid="button-refresh-balances"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingBalances ? 'animate-spin' : ''}`} />
          </Button>
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={sharePortfolio}
            data-testid="button-share-portfolio"
          >
            <SiFarcaster className="h-4 w-4" />
            Share
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <div className="flex items-center gap-2 mb-2 text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span className="text-xs uppercase font-semibold">Total Net Worth</span>
          </div>
          <p className="text-3xl font-black font-mono" data-testid="text-total-value">${grandTotalValue.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Wallet: ${walletTotalValue.toFixed(2)} • Holdings: ${totalValue.toFixed(2)}
          </p>
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
            <span className="text-xs uppercase font-semibold">Assets</span>
          </div>
          <p className="text-3xl font-black font-mono" data-testid="text-total-assets">
            {walletBalances.length + holdingsWithCalcs.length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            In Wallet: {walletBalances.length} • In Trades: {holdingsWithCalcs.length}
          </p>
        </Card>
      </div>

      {/* Tabs: Wallet vs Trading History */}
      <Tabs defaultValue="wallet" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2" data-testid="tabs-portfolio">
          <TabsTrigger value="wallet" data-testid="tab-wallet">Wallet Balances</TabsTrigger>
          <TabsTrigger value="holdings" data-testid="tab-holdings">Trading History</TabsTrigger>
        </TabsList>

        {/* Wallet Balances Tab (DeBank-style) */}
        <TabsContent value="wallet" className="space-y-6" data-testid="content-wallet">
          <Card className="p-6">
            <h2 className="text-xl font-black mb-4">Token Balances (Base Network)</h2>
            
            {isLoadingBalances ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
                <p className="text-muted-foreground">Loading balances...</p>
              </div>
            ) : walletBalances.length === 0 ? (
              <div className="text-center py-12">
                <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No tokens found in your wallet</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {walletBalances.map((balance) => (
                  <Card 
                    key={balance.token.address} 
                    className="p-4 hover-elevate cursor-pointer" 
                    data-testid={`card-token-${balance.token.symbol}`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={balance.token.logoUrl} alt={balance.token.name} />
                        <AvatarFallback>{balance.token.symbol.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{balance.token.symbol}</p>
                        <p className="text-xs text-muted-foreground">
                          {balance.priceChange24h >= 0 ? '+' : ''}
                          {balance.priceChange24h.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-lg font-black font-mono">
                        ${balance.balanceUSD.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono truncate" title={balance.balance}>
                        {parseFloat(balance.balance).toLocaleString(undefined, { 
                          maximumFractionDigits: balance.token.decimals === 18 ? 4 : 2 
                        })}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>

          {/* DeFi Positions (DeBank API) */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black">DeFi Protocols</h2>
              {isLoadingDeFi && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Track your positions across Aerodrome, Uniswap, Aave, and other Base protocols
            </p>
            
            {defiError ? (
              <div className="text-center py-12">
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 max-w-md mx-auto">
                  <p className="text-destructive font-semibold mb-2">Error Loading DeFi Positions</p>
                  <p className="text-sm text-muted-foreground">
                    {(defiError as Error).message || 'Failed to fetch DeFi data'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    This may be due to DeBank API rate limiting. Please try again in a few moments.
                  </p>
                </div>
              </div>
            ) : isLoadingDeFi ? (
              <div className="text-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
                <p className="text-muted-foreground">Loading DeFi positions...</p>
              </div>
            ) : defiProtocols.length === 0 ? (
              <div className="text-center py-12">
                <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No DeFi positions found on Base network</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Start earning yield by depositing into protocols like Aerodrome, Aave, or Moonwell
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {defiProtocols.map((protocol) => (
                  <Card 
                    key={protocol.id} 
                    className="p-4 hover-elevate cursor-pointer"
                    data-testid={`card-defi-${protocol.id}`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      {protocol.logo ? (
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={protocol.logo} alt={protocol.name} />
                          <AvatarFallback>{protocol.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                      ) : (
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>{protocol.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                      )}
                      <p className="font-semibold text-sm truncate" title={protocol.name}>
                        {protocol.name}
                      </p>
                    </div>
                    <p className="text-lg font-black font-mono" data-testid={`text-defi-value-${protocol.id}`}>
                      ${protocol.netUsdValue.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {protocol.positions.length} position{protocol.positions.length !== 1 ? 's' : ''}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Trading History Tab (existing holdings) */}
        <TabsContent value="holdings" data-testid="content-holdings">
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
            <p className="text-muted-foreground mb-4">No trading history yet</p>
            <Link href="/browse">
              <Button>Start Trading</Button>
            </Link>
          </div>
        )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
