import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface SolanaTrendingToken {
  name: string;
  symbol: string;
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  address: string;
  logoUrl: string;
}

interface SolanaTrendingTickerProps {
  onTokenClick?: (token: { address: string; name: string; symbol: string; logoUrl: string }) => void;
}

export default function SolanaTrendingTicker({ onTokenClick }: SolanaTrendingTickerProps) {
  const tickerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  const { data, isLoading } = useQuery<{ tokens: SolanaTrendingToken[] }>({
    queryKey: ['/api/solana-trending-tokens'],
    refetchInterval: 60000,
  });

  const tokens = data?.tokens || [];

  const displayTokens = [...tokens, ...tokens];

  useEffect(() => {
    const ticker = tickerRef.current;
    if (!ticker || tokens.length === 0) return;

    const halfWidth = ticker.scrollWidth / 2;
    const duration = halfWidth / 150;

    ticker.style.setProperty('--solana-ticker-duration', `${duration}s`);
    ticker.style.setProperty('--solana-ticker-distance', `-${halfWidth}px`);
  }, [tokens]);

  if (isLoading || tokens.length === 0) {
    return null;
  }

  return (
    <div 
      className="w-full bg-gradient-to-r from-purple-500/10 via-cyan-500/10 to-purple-500/10 border-y border-border overflow-hidden"
      data-testid="solana-trending-ticker"
    >
      <div 
        ref={tickerRef}
        className="solana-ticker-wrapper flex gap-8 py-3"
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
              onTokenClick({
                address: token.address,
                name: token.name,
                symbol: token.symbol,
                logoUrl: token.logoUrl,
              });
            }
          };
          
          return (
            <div 
              key={`${token.address}-${index}`}
              className="flex items-center gap-2 whitespace-nowrap cursor-pointer hover-elevate active-elevate-2 px-3 py-1 rounded-md transition-all"
              onClick={handleTokenClick}
              data-testid={`solana-ticker-item-${index}`}
            >
              <img 
                src={token.logoUrl} 
                alt={token.name}
                className="w-6 h-6 rounded-full bg-muted"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/shapes/svg?seed=${token.address}`;
                }}
                data-testid={`solana-ticker-logo-${index}`}
              />
              <span className="font-semibold text-foreground">
                {token.symbol}
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
                data-testid={`solana-ticker-change-${index}`}
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
        @keyframes solana-ticker-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(var(--solana-ticker-distance, -50%));
          }
        }

        .solana-ticker-wrapper {
          animation: solana-ticker-scroll var(--solana-ticker-duration, 60s) linear infinite;
        }

        .solana-ticker-wrapper:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
