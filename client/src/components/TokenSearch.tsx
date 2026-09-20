import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Search, Loader2, TrendingUp, TrendingDown, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export interface SearchToken {
  address: string;
  name: string;
  symbol: string;
  logoUrl: string | null;
  currentPrice: string;
  priceChange24h: string;
  volume24h: string;
  liquidity: string;
  marketCap: string;
  dexScreenerUrl: string;
}

interface TokenSearchProps {
  onSelectToken: (token: SearchToken) => void;
  placeholder?: string;
  className?: string;
}

export function TokenSearch({ onSelectToken, placeholder = "Search any Base token...", className = "" }: TokenSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading, isFetching } = useQuery<{ tokens: SearchToken[] }>({
    queryKey: [`/api/tokens/search?q=${encodeURIComponent(debouncedQuery)}`],
    enabled: debouncedQuery.length >= 2,
  });

  const handleSelect = useCallback((token: SearchToken) => {
    onSelectToken(token);
    setQuery("");
    setDebouncedQuery("");
    setIsOpen(false);
  }, [onSelectToken]);

  const handleClear = () => {
    setQuery("");
    setDebouncedQuery("");
    setIsOpen(false);
  };

  const formatPrice = (price: string | null) => {
    if (!price) return "$0.00";
    const num = parseFloat(price);
    if (num < 0.00001) return `$${num.toExponential(2)}`;
    if (num < 0.01) return `$${num.toFixed(6)}`;
    if (num < 1) return `$${num.toFixed(4)}`;
    return `$${num.toFixed(2)}`;
  };

  const formatNumber = (value: string | null) => {
    if (!value) return "$0";
    const num = parseFloat(value);
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const tokens = data?.tokens || [];

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="pl-10 pr-10"
          data-testid="input-token-search"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={handleClear}
            data-testid="button-clear-search"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        {(isLoading || isFetching) && (
          <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {isOpen && query.length >= 2 && (
        <Card className="absolute z-50 w-full mt-2 max-h-80 overflow-y-auto shadow-lg">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Searching Base tokens...
            </div>
          ) : tokens.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              No tokens found for "{query}"
            </div>
          ) : (
            <div className="divide-y divide-border">
              {tokens.map((token) => (
                <button
                  key={token.address}
                  onClick={() => handleSelect(token)}
                  className="w-full p-3 hover-elevate text-left flex items-center gap-3 transition-colors"
                  data-testid={`token-result-${token.symbol}`}
                >
                  <Avatar className="h-10 w-10">
                    {token.logoUrl ? (
                      <AvatarImage src={token.logoUrl} alt={token.name} />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                      {token.symbol?.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{token.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {token.symbol}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatPrice(token.currentPrice)}</span>
                      {token.priceChange24h && (
                        <span className={`flex items-center gap-0.5 ${
                          parseFloat(token.priceChange24h) >= 0 ? 'text-chart-2' : 'text-destructive'
                        }`}>
                          {parseFloat(token.priceChange24h) >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {Math.abs(parseFloat(token.priceChange24h)).toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right text-xs text-muted-foreground">
                    <div>Vol: {formatNumber(token.volume24h)}</div>
                    <div>Liq: {formatNumber(token.liquidity)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />}
    </div>
  );
}

export default TokenSearch;
