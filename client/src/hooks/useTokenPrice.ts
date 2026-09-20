import { useQuery } from '@tanstack/react-query';

interface TokenPrice {
  address: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  lastUpdated: string;
}

export function useTokenPrice(tokenAddress: string | null | undefined, enabled: boolean = true) {
  return useQuery<TokenPrice>({
    queryKey: ['/api/token-price', tokenAddress],
    queryFn: async () => {
      if (!tokenAddress) {
        throw new Error('Token address is required');
      }
      
      const response = await fetch(`/api/token-price/${tokenAddress}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch token price');
      }
      
      return response.json();
    },
    enabled: enabled && !!tokenAddress && tokenAddress.length === 42,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000, // Consider data stale after 15 seconds
    retry: 2,
  });
}
