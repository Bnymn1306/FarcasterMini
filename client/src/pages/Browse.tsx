import { TokenGrid } from "@/components/TokenGrid";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Token } from "@shared/schema";
import { useChain } from "@/contexts/ChainContext";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Search, TrendingUp } from "lucide-react";

export default function Browse() {
  const [, setLocation] = useLocation();
  const { chainInfo, isBase, isSolana } = useChain();

  // Fetch created meme tokens from our database
  const { data: tokens = [], isLoading, isError } = useQuery<Token[]>({
    queryKey: ["/api/tokens"],
    enabled: isBase,
  });

  if (isSolana) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Search className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-black">Browse Tokens</h1>
            <Badge variant="outline" className="border-purple-500 text-purple-500">
              {chainInfo.icon} Solana
            </Badge>
          </div>
          <p className="text-muted-foreground">Discover Solana meme tokens</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Pump.fun</h3>
                <p className="text-sm text-muted-foreground">Trending meme coins</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Browse and trade the latest Solana meme coins with bonding curve mechanics.
            </p>
            <Button asChild className="w-full gap-2">
              <a href="https://pump.fun" target="_blank" rel="noopener noreferrer">
                Browse Pump.fun
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-lg bg-accent/10">
                <Search className="h-6 w-6 text-accent" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Birdeye</h3>
                <p className="text-sm text-muted-foreground">Token explorer</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Explore all Solana tokens with charts, analytics, and trading data.
            </p>
            <Button asChild variant="outline" className="w-full gap-2">
              <a href="https://birdeye.so/find-gems" target="_blank" rel="noopener noreferrer">
                Explore on Birdeye
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-lg bg-chart-2/10">
                <TrendingUp className="h-6 w-6 text-chart-2" />
              </div>
              <div>
                <h3 className="font-bold text-lg">DEX Screener</h3>
                <p className="text-sm text-muted-foreground">Price charts</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Real-time charts and trading data for all Solana tokens.
            </p>
            <Button asChild variant="outline" className="w-full gap-2">
              <a href="https://dexscreener.com/solana" target="_blank" rel="noopener noreferrer">
                View on DEXScreener
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-lg bg-purple-500/10">
                <Search className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Jupiter</h3>
                <p className="text-sm text-muted-foreground">Token search</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Search and swap any Solana token with the best rates.
            </p>
            <Button asChild variant="outline" className="w-full gap-2">
              <a href="https://jup.ag/tokens" target="_blank" rel="noopener noreferrer">
                Browse Jupiter
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </Card>
        </div>

        <Card className="mt-6 p-4 bg-muted/30">
          <p className="text-sm text-muted-foreground text-center">
            Switch to Base network to browse BasedMem tokens with full trading features.
          </p>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8 flex items-center gap-3">
          <h1 className="text-3xl font-black mb-2">Browse Tokens</h1>
          <Badge variant="outline" className="border-primary text-primary">
            {chainInfo.icon} Base
          </Badge>
        </div>
        <p className="text-muted-foreground">Loading tokens...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8 flex items-center gap-3">
          <h1 className="text-3xl font-black mb-2">Browse Tokens</h1>
          <Badge variant="outline" className="border-primary text-primary">
            {chainInfo.icon} Base
          </Badge>
        </div>
        <p className="text-destructive">Failed to load tokens. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-center gap-3">
        <div>
          <h1 className="text-3xl font-black mb-2">Explore Meme Tokens</h1>
          <p className="text-muted-foreground">Discover and trade the hottest meme coins on Base</p>
        </div>
        <Badge variant="outline" className="border-primary text-primary">
          {chainInfo.icon} Base
        </Badge>
      </div>
      
      <TokenGrid 
        tokens={tokens}
        onTrade={(id) => setLocation(`/token/${id}`)}
        onViewDetails={(id) => setLocation(`/token/${id}`)}
      />
    </div>
  );
}
