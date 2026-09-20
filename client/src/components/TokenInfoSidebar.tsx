import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Copy, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { Token } from '@/lib/tokens';

interface TokenInfoSidebarProps {
  token: Token | null;
}

interface TokenPriceData {
  price: number;
  volume24h: number;
  liquidity: number;
  priceChange24h?: number;
  cached?: boolean;
  cacheAge?: number;
}

export function TokenInfoSidebar({ token }: TokenInfoSidebarProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Fetch token price and market data
  const { data: priceData } = useQuery<TokenPriceData>({
    queryKey: ['/api/token-price', token?.address],
    enabled: !!token,
    refetchInterval: 30000, // Refresh every 30s (reduced from 10s for better performance)
  });

  const handleCopyAddress = async () => {
    if (!token) return;
    
    try {
      await navigator.clipboard.writeText(token.address);
      setCopied(true);
      toast({
        title: 'Address Copied',
        description: `${token.symbol} contract address copied to clipboard`,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy address to clipboard',
        variant: 'destructive',
      });
    }
  };

  // Format large numbers
  const formatNumber = (num: number | undefined): string => {
    if (!num || num === 0) return 'N/A';
    
    if (num >= 1_000_000_000) {
      return `$${(num / 1_000_000_000).toFixed(2)}B`;
    } else if (num >= 1_000_000) {
      return `$${(num / 1_000_000).toFixed(2)}M`;
    } else if (num >= 1_000) {
      return `$${(num / 1_000).toFixed(2)}K`;
    } else {
      return `$${num.toFixed(2)}`;
    }
  };

  if (!token) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground py-8">
          <p className="text-sm">Select a token to view details</p>
        </div>
      </Card>
    );
  }

  const explorerUrl = `https://basescan.org/token/${token.address}`;

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Token Header */}
        <div className="flex items-center gap-3 pb-4 border-b">
          {token.logoURI ? (
            <img src={token.logoURI} alt={token.symbol} className="w-10 h-10 rounded-full" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">{token.symbol[0]}</span>
            </div>
          )}
          <div className="flex-1">
            <h3 className="font-semibold text-lg" data-testid="text-token-name">{token.name}</h3>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs" data-testid="badge-token-symbol">
                {token.symbol}
              </Badge>
              {priceData?.price !== undefined && (
                <span className="text-sm font-medium text-muted-foreground">
                  ${priceData.price.toFixed(4)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Contract Address */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Contract Address</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-muted rounded-md text-xs font-mono truncate" data-testid="text-contract-address">
              {token.address}
            </code>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleCopyAddress}
              className="flex-shrink-0"
              data-testid="button-copy-address"
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => window.open(explorerUrl, '_blank')}
              className="flex-shrink-0"
              data-testid="button-explorer"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Liquidity & 24h Volume */}
        <div className="grid grid-cols-2 gap-4 pb-4 border-b">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Liquidity Pool</p>
            <p className="text-sm font-semibold" data-testid="text-liquidity">
              {formatNumber(priceData?.liquidity)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">24h Volume</p>
            <p className="text-sm font-semibold" data-testid="text-volume-24h">
              {formatNumber(priceData?.volume24h)}
            </p>
          </div>
        </div>

        {/* Price Chart */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Price Chart</h3>
          <div className="relative w-full bg-muted rounded-lg overflow-hidden" style={{ height: '280px' }}>
            <iframe
              src={`https://dexscreener.com/base/${token.address}?embed=1&theme=dark&trades=0&info=0`}
              title={`${token.symbol} Price Chart`}
              className="w-full h-full border-0"
              data-testid="iframe-token-chart"
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Live data from DEXScreener
          </p>
        </div>
      </div>
    </Card>
  );
}
