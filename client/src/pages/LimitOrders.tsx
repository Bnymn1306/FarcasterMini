import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, Info, Zap, Target } from 'lucide-react';
import { LimitOrdersPanel } from '@/components/LimitOrdersPanel';
import { SwapInterface } from '@/components/SwapInterface';
import TrendingTicker from '@/components/TrendingTicker';
import { TokenInfoSidebar } from '@/components/TokenInfoSidebar';
import { Token } from '@/lib/tokens';

export default function LimitOrders() {
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);

  const handleTokenChange = useCallback((token: Token | null) => {
    setSelectedToken(token);
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            DEX Trading
          </h1>
          <Badge variant="outline" className="border-primary text-primary">
            Base L2
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Swap tokens instantly or place limit orders for automated trading
        </p>
      </div>

      {/* Trending Tokens Ticker */}
      <div className="mb-6 -mx-4">
        <TrendingTicker onTokenClick={handleTokenChange} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Trading Area */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="limit" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="swap" className="gap-2" data-testid="tab-swap">
                <Zap className="h-4 w-4" />
                Instant Swap
              </TabsTrigger>
              <TabsTrigger value="limit" className="gap-2" data-testid="tab-limit">
                <Target className="h-4 w-4" />
                Limit Orders
              </TabsTrigger>
            </TabsList>

            <TabsContent value="swap">
              <SwapInterface onToTokenChange={handleTokenChange} />
            </TabsContent>

            <TabsContent value="limit">
              <LimitOrdersPanel onTokenChange={handleTokenChange} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Info Sidebar */}
        <div className="space-y-6">
          {/* Token Info & Chart */}
          <TokenInfoSidebar token={selectedToken} />
          
          {/* Features */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-5 w-5 text-primary" />
              <h3 className="font-bold">Features</h3>
            </div>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-primary">✓</span>
                <span>Best price routing across Uniswap V2 & V3</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">✓</span>
                <span>Low slippage protection</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">✓</span>
                <span>Real-time gas estimation</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">✓</span>
                <span>Native Base L2 support</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">✓</span>
                <span>Non-custodial - you control your funds</span>
              </li>
            </ul>
          </Card>

          {/* Popular Tokens */}
          <Card className="p-6">
            <h3 className="font-bold mb-4">Popular on Base</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full" />
                  <div>
                    <div className="font-semibold text-sm">ETH</div>
                    <div className="text-xs text-muted-foreground">Ethereum</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-2 rounded hover-elevate cursor-pointer">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-500 rounded-full" />
                  <div>
                    <div className="font-semibold text-sm">USDC</div>
                    <div className="text-xs text-muted-foreground">USD Coin</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
