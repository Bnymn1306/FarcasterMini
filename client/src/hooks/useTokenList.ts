import { useQuery } from '@tanstack/react-query';
import { BASE_TOKENS, type Token } from '@/lib/tokens';
import { Contract, BrowserProvider, formatUnits } from 'ethers';

const BASE_CHAIN_ID = 8453;

// Minimal ERC-20 ABI for balanceOf
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

async function fetchTokenList(): Promise<Token[]> {
  try {
    // Fetch comprehensive Base token list from backend (2000+ tokens via CoinGecko)
    const response = await fetch('/api/swap-tokens');
    
    if (!response.ok) {
      throw new Error('Failed to fetch token list');
    }

    const data = await response.json();
    const tokens = data.tokens || [];
    
    console.log(`✅ Loaded ${tokens.length} Base L2 tokens from CoinGecko`);
    
    // Merge with our curated list (ensures priority tokens always available)
    const mergedTokens = [
      ...BASE_TOKENS,
      ...tokens.filter((t: Token) => 
        !BASE_TOKENS.some(bt => bt.address.toLowerCase() === t.address.toLowerCase())
      )
    ];
    
    return mergedTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
  } catch (error) {
    console.error('❌ Error fetching comprehensive token list, falling back to curated list:', error);
    // Fallback to hardcoded list if API fails
    return BASE_TOKENS.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }
}

export function useTokenList() {
  return useQuery({
    queryKey: ['tokenList', BASE_CHAIN_ID],
    queryFn: fetchTokenList,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

export function useSearchTokens(searchQuery: string, walletAddress?: string) {
  const { data: tokens, isLoading } = useTokenList();
  
  if (!tokens) return { tokens: [], isLoading };
  
  if (!searchQuery.trim()) {
    return { tokens, isLoading };
  }
  
  const query = searchQuery.toLowerCase().trim();
  const filtered = tokens.filter(token => 
    token.symbol.toLowerCase().includes(query) ||
    token.name.toLowerCase().includes(query) ||
    token.address.toLowerCase().includes(query)
  );
  
  return { tokens: filtered, isLoading };
}

// Hook to get user's token balances (optimized for performance)
export function useUserTokenBalances(walletAddress?: string, provider?: BrowserProvider) {
  const { data: allTokens } = useTokenList();
  
  return useQuery({
    queryKey: ['userBalances', walletAddress, BASE_CHAIN_ID],
    queryFn: async () => {
      if (!walletAddress || !allTokens || !provider) {
        return {};
      }
      
      // Performance optimization: Always include curated tokens + top 100 others
      // to avoid 2000+ RPC calls on wallet connect
      // IMPORTANT: Normalize ALL addresses to lowercase for Set comparison
      const curatedAddresses = new Set(BASE_TOKENS.map(t => t.address.toLowerCase()));
      const curatedTokens = allTokens.filter(t => 
        curatedAddresses.has(t.address?.toLowerCase?.() || '')
      );
      const otherTokens = allTokens.filter(t => 
        !curatedAddresses.has(t.address?.toLowerCase?.() || '')
      ).slice(0, 100);
      const tokensToCheck = [...curatedTokens, ...otherTokens];
      
      console.log(`🎯 Curated tokens included: ${curatedTokens.length}/${BASE_TOKENS.length}`);
      
      console.log(`💰 Fetching balances for ${tokensToCheck.length} top tokens (wallet: ${walletAddress.slice(0, 6)}...)`);
      
      const balances: Record<string, { balance: string; formatted: string }> = {};
      
      // Fetch balances in parallel (batched to avoid rate limits)
      const BATCH_SIZE = 20;
      for (let i = 0; i < tokensToCheck.length; i += BATCH_SIZE) {
        const batch = tokensToCheck.slice(i, i + BATCH_SIZE);
        
        await Promise.all(
          batch.map(async (token) => {
          try {
            // Special handling for native ETH
            if (token.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
              const balance = await provider.getBalance(walletAddress);
              const formatted = formatUnits(balance, 18);
              
              if (parseFloat(formatted) > 0) {
                balances[token.address] = {
                  balance: balance.toString(),
                  formatted: parseFloat(formatted).toFixed(6)
                };
              }
              return;
            }
            
            // ERC-20 token balance
            const contract = new Contract(token.address, ERC20_ABI, provider);
            const balance = await contract.balanceOf(walletAddress);
            const formatted = formatUnits(balance, token.decimals);
            
            // Only include tokens with non-zero balance
            if (parseFloat(formatted) > 0) {
              balances[token.address] = {
                balance: balance.toString(),
                formatted: parseFloat(formatted).toFixed(6)
              };
            }
          } catch (error) {
            // Silently ignore errors for individual tokens
            console.debug(`Failed to fetch balance for ${token.symbol}:`, error);
          }
          })
        );
      }
      
      console.log(`✅ Found balances for ${Object.keys(balances).length} tokens out of ${tokensToCheck.length} checked`);
      return balances;
    },
    enabled: !!walletAddress && !!allTokens && !!provider,
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
}
