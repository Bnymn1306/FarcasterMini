import { TrendingUp, TrendingDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Token } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface TokenCardProps {
  token: Token;
  onTrade?: (tokenId: string) => void;
  onViewDetails?: (tokenId: string) => void;
}

export function TokenCard({ token, onTrade, onViewDetails }: TokenCardProps) {
  const priceChange = parseFloat(token.priceChange24h);
  const isPositive = priceChange >= 0;

  const formatNumber = (num: string) => {
    const value = parseFloat(num);
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatPrice = (price: string) => {
    const value = parseFloat(price);
    if (value < 0.01) return `$${value.toFixed(6)}`;
    return `$${value.toFixed(4)}`;
  };

  return (
    <Card 
      className="p-6 space-y-4 hover-elevate transition-transform hover:scale-[1.02]"
      data-testid={`card-token-${token.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-16 w-16 ring-4 ring-primary/20">
            <AvatarImage src={token.logoUrl || undefined} alt={token.name} />
            <AvatarFallback className="text-lg font-bold">
              {token.symbol.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          
          <div>
            <h3 className="font-bold text-lg" data-testid={`text-token-name-${token.id}`}>
              {token.name}
            </h3>
            <p className="text-sm text-muted-foreground uppercase">
              ${token.symbol}
            </p>
          </div>
        </div>

        {token.isVerified && (
          <Badge variant="secondary" className="bg-primary/20 text-primary">
            Verified
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono font-semibold text-2xl" data-testid={`text-price-${token.id}`}>
            {formatPrice(token.currentPrice)}
          </span>
          
          <Badge 
            variant={isPositive ? "secondary" : "destructive"}
            className={`gap-1 ${isPositive ? 'bg-chart-2/20 text-chart-2' : ''}`}
            data-testid={`badge-change-${token.id}`}
          >
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(priceChange).toFixed(2)}%
          </Badge>
        </div>

        <div className="h-12 bg-muted/30 rounded-md flex items-center justify-center text-xs text-muted-foreground">
          Price Chart
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border">
        <div>
          <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">
            Market Cap
          </p>
          <p className="font-mono text-sm font-semibold" data-testid={`text-mcap-${token.id}`}>
            {formatNumber(token.marketCap)}
          </p>
        </div>
        
        <div>
          <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">
            Volume
          </p>
          <p className="font-mono text-sm font-semibold" data-testid={`text-volume-${token.id}`}>
            {formatNumber(token.volume24h)}
          </p>
        </div>
        
        <div>
          <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">
            Holders
          </p>
          <p className="font-mono text-sm font-semibold" data-testid={`text-holders-${token.id}`}>
            {token.holderCount}
          </p>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          onClick={() => onTrade?.(token.id)}
          className="flex-1"
          data-testid={`button-trade-${token.id}`}
        >
          Trade
        </Button>
        
        <Button
          onClick={() => onViewDetails?.(token.id)}
          variant="outline"
          className="flex-1 gap-2"
          data-testid={`button-details-${token.id}`}
        >
          Details
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
