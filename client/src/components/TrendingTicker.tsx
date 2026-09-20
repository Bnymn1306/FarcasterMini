import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Token } from '@/lib/tokens';

interface TrendingToken {
  name: string;
  symbol: string;
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  address: string;
  logoUrl: string;
}

interface TrendingTickerProps {
  onTokenClick?: (token: Token) => void;
}

export default function TrendingTicker({ onTokenClick }: TrendingTickerProps) {
  const tickerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  const { data, isLoading } = useQuery<{ tokens: TrendingToken[] }>({
    queryKey: ['/api/trending-tokens'],
    refetchInterval: 60000, // Refresh every 60 seconds
  });

  const tokens = data?.tokens || [];

  // Duplicate tokens for seamless loop
  const displayTokens = [...tokens, ...tokens];

  useEffect(() => {
    const ticker = tickerRef.current;
    if (!ticker || tokens.length === 0) return;

    // Calculate animation parameters based on content width
    const halfWidth = ticker.scrollWidth / 2; // Half because we duplicated
    const duration = halfWidth / 150; // 150px per second (optimal speed)

    ticker.style.setProperty('--ticker-duration', `${duration}s`);
    ticker.style.setProperty('--ticker-distance', `-${halfWidth}px`);
  }, [tokens]);

  if (isLoading || tokens.length === 0) {
    return null; // Don't show ticker while loading or if no data
  }

  return (
    <div 
      className="w-full bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 border-y border-border overflow-hidden"
      data-testid="trending-ticker"
    >
      <div 
        ref={tickerRef}
        className="ticker-wrapper flex gap-8 py-3"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        style={{
          animationPlayState: isPaused ? 'paused' : 'running'
        }}
      >
        {displayTokens.map((token, index) => {
          const isPositive = token.priceChange24h >= 0;
          
          const handleTokenClick = () => {
            if (onTokenClick) {
              // Convert TrendingToken to Token format
              const tokenData: Token = {
                address: token.address,
                name: token.name,
                symbol: token.symbol,
                decimals: 18, // Default, will be fetched by parent
                logoURI: token.logoUrl,
              };
              onTokenClick(tokenData);
            }
          };
          
          return (
            <div 
              key={`${token.address}-${index}`}
              className="flex items-center gap-2 whitespace-nowrap cursor-pointer hover-elevate active-elevate-2 px-3 py-1 rounded-md transition-all"
              onClick={handleTokenClick}
              data-testid={`ticker-item-${index}`}
            >
              {/* Token Logo */}
              <img 
                src={token.logoUrl} 
                alt={token.name}
                className="w-6 h-6 rounded-full bg-muted"
                onError={(e) => {
                  // Fallback to DiceBear avatar on error
                  (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/shapes/svg?seed=${token.address}`;
                }}
                data-testid={`ticker-logo-${index}`}
              />
              <span className="font-semibold text-foreground">
                {token.name}
              </span>
              <span className="text-sm text-muted-foreground">
                ${token.priceUsd.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: token.priceUsd < 1 ? 6 : 2
                })}
              </span>
              <div 
                className={`flex items-center gap-1 text-sm font-medium ${
                  isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}
                data-testid={`ticker-change-${index}`}
              >
                {isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {isPositive ? '+' : ''}{token.priceChange24h.toFixed(2)}%
              </div>
              <div className="h-4 w-px bg-border" />
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(var(--ticker-distance, -50%));
          }
        }

        .ticker-wrapper {
          animation: ticker-scroll var(--ticker-duration, 60s) linear infinite;
        }

        .ticker-wrapper:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
