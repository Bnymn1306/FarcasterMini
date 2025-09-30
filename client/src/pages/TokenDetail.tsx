import { useRoute } from "wouter";
import { TradingInterface } from "@/components/TradingInterface";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Twitter, Send, Globe } from "lucide-react";
import type { Token } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function TokenDetail() {
  const [, params] = useRoute("/token/:id");
  const { toast } = useToast();

  const mockToken: Token = {
    id: params?.id || '1',
    creatorId: 'creator1',
    name: 'Doge Moon',
    symbol: 'DMOON',
    description: 'Doge Moon is the ultimate meme coin taking the crypto world by storm! 🚀 With a passionate community and ambitious roadmap, we\'re headed straight to the moon. Our mission is to combine meme culture with real utility, creating a token that\'s both fun and valuable. Join our growing community of moon-bound astronauts and let\'s make crypto history together! To the moon and beyond! 🌙✨',
    logoUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=dmoon',
    contractAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4',
    totalSupply: '1000000000',
    currentPrice: '0.0042',
    marketCap: '420000',
    volume24h: '52000',
    priceChange24h: '15.8',
    holderCount: 1337,
    twitterUrl: 'https://twitter.com/dogemoon',
    telegramUrl: 'https://t.me/dogemoon',
    websiteUrl: 'https://dogemoon.io',
    isVerified: true,
    createdAt: new Date('2024-01-15'),
  };

  const handleBuy = (amount: string) => {
    toast({
      title: "Trade Executed!",
      description: `Successfully bought ${amount} ETH worth of ${mockToken.symbol}`,
    });
  };

  const handleSell = (amount: string) => {
    toast({
      title: "Trade Executed!",
      description: `Successfully sold ${amount} ${mockToken.symbol}`,
    });
  };

  const recentTrades = [
    { type: 'buy', amount: '0.5', price: '0.0042', time: '2 min ago' },
    { type: 'sell', amount: '1.2', price: '0.0041', time: '5 min ago' },
    { type: 'buy', amount: '0.8', price: '0.0040', time: '12 min ago' },
    { type: 'buy', amount: '2.0', price: '0.0039', time: '18 min ago' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20 ring-4 ring-primary/20">
                  <AvatarImage src={mockToken.logoUrl || undefined} alt={mockToken.name} />
                  <AvatarFallback className="text-2xl font-bold">
                    {mockToken.symbol.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-3xl font-black">{mockToken.name}</h1>
                    {mockToken.isVerified && (
                      <Badge className="bg-primary/20 text-primary">Verified</Badge>
                    )}
                  </div>
                  <p className="text-lg text-muted-foreground uppercase">${mockToken.symbol}</p>
                  
                  <div className="flex items-center gap-3 mt-2">
                    {mockToken.twitterUrl && (
                      <a href={mockToken.twitterUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" className="gap-2 h-8">
                          <Twitter className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    {mockToken.telegramUrl && (
                      <a href={mockToken.telegramUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" className="gap-2 h-8">
                          <Send className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    {mockToken.websiteUrl && (
                      <a href={mockToken.websiteUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" className="gap-2 h-8">
                          <Globe className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Price</p>
                <p className="font-mono font-semibold text-lg">${mockToken.currentPrice}</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Market Cap</p>
                <p className="font-mono font-semibold text-lg">${(parseFloat(mockToken.marketCap) / 1000).toFixed(0)}K</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Volume 24h</p>
                <p className="font-mono font-semibold text-lg">${(parseFloat(mockToken.volume24h) / 1000).toFixed(0)}K</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Holders</p>
                <p className="font-mono font-semibold text-lg">{mockToken.holderCount}</p>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">About</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {mockToken.description}
              </p>
            </div>

            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Contract Address</span>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs bg-muted/30 px-2 py-1 rounded">
                    {mockToken.contractAddress?.slice(0, 10)}...{mockToken.contractAddress?.slice(-8)}
                  </code>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold text-lg mb-4">Recent Trades</h3>
            <div className="space-y-3">
              {recentTrades.map((trade, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={trade.type === 'buy' ? 'secondary' : 'destructive'}
                      className={trade.type === 'buy' ? 'bg-chart-2/20 text-chart-2' : ''}
                    >
                      {trade.type.toUpperCase()}
                    </Badge>
                    <span className="font-mono text-sm">{trade.amount} {mockToken.symbol}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm">${trade.price}</p>
                    <p className="text-xs text-muted-foreground">{trade.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-24">
            <TradingInterface 
              token={mockToken}
              userBalance="2.5"
              onBuy={handleBuy}
              onSell={handleSell}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
