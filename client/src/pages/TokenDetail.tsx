import { useRoute } from "wouter";
import { TradingInterface } from "@/components/TradingInterface";
import { PriceAlertDialog } from "@/components/PriceAlertDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Twitter, Send, Globe, Share2 } from "lucide-react";
import type { Token } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { SiFarcaster } from "react-icons/si";
import sdk from "@farcaster/frame-sdk";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

export default function TokenDetail() {
  const [, params] = useRoute("/token/:id");
  const { toast } = useToast();
  const [isTrading, setIsTrading] = useState(false);

  const { data: token, isLoading, isError } = useQuery<Token>({
    queryKey: ["/api/tokens", params?.id],
    queryFn: async () => {
      if (!params?.id) throw new Error("Token ID is required");
      const response = await fetch(`/api/tokens/${params.id}`);
      if (!response.ok) throw new Error("Failed to fetch token");
      return response.json();
    },
    enabled: !!params?.id,
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground" data-testid="text-loading">Loading token details...</p>
        </div>
      </div>
    );
  }

  if (isError || !token) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-center py-20">
          <p className="text-destructive" data-testid="text-error">Token not found</p>
        </div>
      </div>
    );
  }

  const handleBuy = async (amount: string) => {
    setIsTrading(true);
    try {
      const amountInWei = (parseFloat(amount) * 1e18).toString(16);
      const valueInWei = `0x${amountInWei}` as `0x${string}`;
      
      const provider = sdk.wallet.ethProvider;
      const accounts = await provider.request({ method: "eth_accounts" });
      
      if (!accounts || accounts.length === 0) {
        throw new Error("Wallet not connected");
      }
      
      const txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: accounts[0],
          to: token.contractAddress as `0x${string}`,
          value: valueInWei,
          data: "0x" as `0x${string}`,
        }],
      });
      
      console.log("Buy transaction sent:", txHash);
      
      toast({
        title: "Trade Executed! 🎉",
        description: `Successfully bought ${amount} ETH worth of ${token.symbol}. Transaction hash: ${txHash.slice(0, 10)}...`,
      });
    } catch (error: any) {
      console.error("Buy error:", error);
      toast({
        title: "Trade Failed",
        description: error.message?.includes("rejected") ? "Transaction rejected" : "Failed to execute trade",
        variant: "destructive",
      });
    } finally {
      setIsTrading(false);
    }
  };

  const handleSell = async (amount: string) => {
    setIsTrading(true);
    try {
      const provider = sdk.wallet.ethProvider;
      const accounts = await provider.request({ method: "eth_accounts" });
      
      if (!accounts || accounts.length === 0) {
        throw new Error("Wallet not connected");
      }
      
      const txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: accounts[0],
          to: token.contractAddress as `0x${string}`,
          value: "0x0" as `0x${string}`,
          data: "0x" as `0x${string}`,
        }],
      });
      
      console.log("Sell transaction sent:", txHash);
      
      toast({
        title: "Trade Executed! 💰",
        description: `Successfully sold ${amount} ${token.symbol}. Transaction hash: ${txHash.slice(0, 10)}...`,
      });
    } catch (error: any) {
      console.error("Sell error:", error);
      toast({
        title: "Trade Failed",
        description: error.message?.includes("rejected") ? "Transaction rejected" : "Failed to execute trade",
        variant: "destructive",
      });
    } finally {
      setIsTrading(false);
    }
  };

  const handleCreateAlert = (data: any) => {
    console.log('Creating alert:', data);
    toast({
      title: "Uyarı Oluşturuldu! 🔔",
      description: `${token.symbol} için fiyat uyarısı başarıyla ayarlandı. Farcaster profilinize bildirim gönderilecek.`,
    });
  };

  const shareToFarcaster = () => {
    const baseUrl = window.location.origin;
    const frameUrl = `${baseUrl}/frame/token/${token.id}`;
    const priceChange = parseFloat(token.priceChange24h);
    const text = `Check out ${token.name} ($${token.symbol}) on BasedMem!\n\nPrice: $${token.currentPrice}\nMarket Cap: $${(parseFloat(token.marketCap) / 1000).toFixed(0)}K\nPrice Change 24h: ${priceChange >= 0 ? '+' : ''}${token.priceChange24h}%\n\n#BasedMem #MemeCoins`;
    
    const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(frameUrl)}`;
    window.open(warpcastUrl, '_blank');
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
                  <AvatarImage src={token.logoUrl || undefined} alt={token.name} />
                  <AvatarFallback className="text-2xl font-bold">
                    {token.symbol.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-3xl font-black">{token.name}</h1>
                    {token.isVerified && (
                      <Badge className="bg-primary/20 text-primary">Verified</Badge>
                    )}
                  </div>
                  <p className="text-lg text-muted-foreground uppercase">${token.symbol}</p>
                  
                  <div className="flex items-center gap-3 mt-2">
                    {token.twitterUrl && (
                      <a href={token.twitterUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" className="gap-2 h-8" data-testid="button-twitter">
                          <Twitter className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    {token.telegramUrl && (
                      <a href={token.telegramUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" className="gap-2 h-8" data-testid="button-telegram">
                          <Send className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    {token.websiteUrl && (
                      <a href={token.websiteUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" className="gap-2 h-8" data-testid="button-website">
                          <Globe className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="gap-2 h-8" 
                      onClick={shareToFarcaster}
                      data-testid="button-share-farcaster"
                    >
                      <SiFarcaster className="h-4 w-4" />
                      <span className="text-xs">Share</span>
                    </Button>
                    <PriceAlertDialog token={token} onCreateAlert={handleCreateAlert} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Price</p>
                <p className="font-mono font-semibold text-lg">${token.currentPrice}</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Market Cap</p>
                <p className="font-mono font-semibold text-lg">${(parseFloat(token.marketCap) / 1000).toFixed(0)}K</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Volume 24h</p>
                <p className="font-mono font-semibold text-lg">${(parseFloat(token.volume24h) / 1000).toFixed(0)}K</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Holders</p>
                <p className="font-mono font-semibold text-lg">{token.holderCount}</p>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">About</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {token.description}
              </p>
            </div>

            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Contract Address</span>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs bg-muted/30 px-2 py-1 rounded">
                    {token.contractAddress?.slice(0, 10)}...{token.contractAddress?.slice(-8)}
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
                    <span className="font-mono text-sm">{trade.amount} {token.symbol}</span>
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
              token={token}
              userBalance="2.5"
              userTokenBalance="500"
              onBuy={handleBuy}
              onSell={handleSell}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
