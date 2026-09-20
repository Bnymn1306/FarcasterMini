import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTokenPrice } from '@/hooks/useTokenPrice';
import { cn } from '@/lib/utils';

interface TokenPriceDisplayProps {
  tokenAddress: string | null | undefined;
  tokenSymbol?: string;
  compact?: boolean;
}

export function TokenPriceDisplay({ tokenAddress, tokenSymbol, compact = false }: TokenPriceDisplayProps) {
  const { data: priceData, isLoading, isError } = useTokenPrice(tokenAddress, !!tokenAddress);

  if (!tokenAddress) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className={cn("p-4", compact && "p-3")}>
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading price...</span>
        </div>
      </Card>
    );
  }

  if (isError || !priceData) {
    return (
      <Card className={cn("p-4 bg-muted/30", compact && "p-3")}>
        <div className="text-sm text-muted-foreground text-center">
          Price data unavailable
        </div>
      </Card>
    );
  }

  const priceChange = priceData.priceChange24h;
  const isPriceUp = priceChange > 0;
  const isPriceDown = priceChange < 0;
  const isPriceFlat = Math.abs(priceChange) < 0.01;

  const formatPrice = (price: number) => {
    if (!isFinite(price) || price === 0) return "$0.00";
    
    if (price >= 1) {
      return `$${price.toFixed(2)}`;
    } else if (price >= 0.01) {
      return `$${price.toFixed(4)}`;
    } else if (price >= 0.0001) {
      return `$${price.toFixed(6)}`;
    } else if (price >= 0.000001) {
      return `$${price.toFixed(8)}`;
    } else {
      // For extremely small numbers, use up to 12 decimals to avoid scientific notation
      return `$${price.toFixed(12)}`;
    }
  };

  const formatLargeNumber = (num: number) => {
    if (num >= 1_000_000_000) {
      return `$${(num / 1_000_000_000).toFixed(2)}B`;
    } else if (num >= 1_000_000) {
      return `$${(num / 1_000_000).toFixed(2)}M`;
    } else if (num >= 1_000) {
      return `$${(num / 1_000).toFixed(2)}K`;
    }
    return `$${num.toFixed(2)}`;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-card border" data-testid="token-price-compact">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-lg">{formatPrice(priceData.price)}</span>
            {isPriceFlat ? (
              <Badge variant="outline" className="gap-1">
                <Minus className="h-3 w-3" />
                <span className="text-xs">0.00%</span>
              </Badge>
            ) : isPriceUp ? (
              <Badge variant="outline" className="gap-1 border-green-500/50 text-green-500">
                <TrendingUp className="h-3 w-3" />
                <span className="text-xs">+{priceChange.toFixed(2)}%</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-red-500/50 text-red-500">
                <TrendingDown className="h-3 w-3" />
                <span className="text-xs">{priceChange.toFixed(2)}%</span>
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            24h Vol: {formatLargeNumber(priceData.volume24h)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="p-6" data-testid="token-price-display">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">{tokenSymbol || 'Token'} Price</h3>
            <p className="text-xs text-muted-foreground">Real-time market data</p>
          </div>
          {isPriceFlat ? (
            <Minus className="h-6 w-6 text-muted-foreground" />
          ) : isPriceUp ? (
            <TrendingUp className="h-6 w-6 text-green-500" />
          ) : (
            <TrendingDown className="h-6 w-6 text-red-500" />
          )}
        </div>

        {/* Price */}
        <div className="space-y-2">
          <div className="font-mono font-bold text-3xl">{formatPrice(priceData.price)}</div>
          <div className="flex items-center gap-2">
            {isPriceFlat ? (
              <Badge variant="outline" className="gap-1">
                <Minus className="h-3 w-3" />
                <span>0.00%</span>
              </Badge>
            ) : isPriceUp ? (
              <Badge variant="outline" className="gap-1 border-green-500/50 bg-green-500/10 text-green-500">
                <TrendingUp className="h-3 w-3" />
                <span>+{priceChange.toFixed(2)}%</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-red-500/50 bg-red-500/10 text-red-500">
                <TrendingDown className="h-3 w-3" />
                <span>{priceChange.toFixed(2)}%</span>
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">24h change</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div>
            <div className="text-xs text-muted-foreground mb-1">24h Volume</div>
            <div className="font-semibold">{formatLargeNumber(priceData.volume24h)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Market Cap</div>
            <div className="font-semibold">{formatLargeNumber(priceData.marketCap)}</div>
          </div>
        </div>

        {/* Last Updated */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Updated {new Date(priceData.lastUpdated).toLocaleTimeString()}
        </div>
      </div>
    </Card>
  );
}
