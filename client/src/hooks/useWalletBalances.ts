import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '@/contexts/WalletContext';
import { BASE_TOKENS, ERC20_ABI, type BaseToken } from '@/lib/baseTokens';

export interface TokenBalance {
  token: BaseToken;
  balance: string; // Raw balance (human-readable)
  balanceUSD: number;
  price: number;
  priceChange24h: number;
}

export function useWalletBalances() {
  const { walletAddress, isWalletConnected, getProvider, user } = useWallet();
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isWalletConnected || !walletAddress) {
      setBalances([]);
      return;
    }

    // Wait for user to be ready before fetching (needed for holdings)
    // If user is not set yet, skip this render cycle
    if (user === null) {
      console.log('⏳ Waiting for user to be ready before fetching balances...');
      return;
    }

    fetchBalances();
  }, [isWalletConnected, walletAddress, user]);

  const fetchBalances = async () => {
    if (!walletAddress || !isWalletConnected) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const provider = getProvider();
      if (!provider) {
        console.error('Provider not available');
        setIsLoading(false);
        return;
      }

      // Get ALL tokens: whitelist + user holdings
      const allTokens = await getAllTokens();

      // Fetch prices from backend (DEXScreener with caching)
      const priceMap = await fetchTokenPrices(allTokens);

      // Fetch balances for all tokens
      const balancePromises = allTokens.map(async (token) => {
        try {
          let rawBalance: bigint;

          if (token.symbol === 'ETH') {
            // Native ETH balance
            rawBalance = await provider.getBalance(walletAddress);
          } else {
            // ERC20 token balance
            const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
            rawBalance = await contract.balanceOf(walletAddress);
          }

          // Convert to human-readable format
          const balance = ethers.formatUnits(rawBalance, token.decimals);
          const balanceNum = parseFloat(balance);

          // Get price and calculate USD value (use address as key)
          const priceData = priceMap.get(token.address.toLowerCase()) || { price: 0, change24h: 0 };
          const balanceUSD = balanceNum * priceData.price;

          return {
            token,
            balance,
            balanceUSD,
            price: priceData.price,
            priceChange24h: priceData.change24h,
          } as TokenBalance;
        } catch (err) {
          console.error(`Error fetching balance for ${token.symbol}:`, err);
          return {
            token,
            balance: '0',
            balanceUSD: 0,
            price: 0,
            priceChange24h: 0,
          } as TokenBalance;
        }
      });

      const fetchedBalances = await Promise.all(balancePromises);

      // Filter out zero balances and sort by USD value
      const nonZeroBalances = fetchedBalances
        .filter((b) => parseFloat(b.balance) > 0)
        .sort((a, b) => b.balanceUSD - a.balanceUSD);

      setBalances(nonZeroBalances);
    } catch (err) {
      console.error('Error fetching wallet balances:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch balances');
    } finally {
      setIsLoading(false);
    }
  };

  const getAllTokens = async (): Promise<BaseToken[]> => {
    const tokenSet = new Map<string, BaseToken>();

    // Add whitelist tokens first
    BASE_TOKENS.forEach((token) => {
      tokenSet.set(token.address.toLowerCase(), token);
    });

    // Fetch user holdings and add those tokens
    if (user?.id) {
      try {
        const response = await fetch(`/api/holdings/${user.id}`);
        if (response.ok) {
          const holdings = await response.json();
          const provider = getProvider();

          // Extract tokens from holdings
          for (const holding of holdings) {
            if (holding.token && holding.token.contractAddress) {
              const address = holding.token.contractAddress.toLowerCase();

              // Skip if already in whitelist
              if (!tokenSet.has(address)) {
                // Fetch decimals from contract
                let decimals = 18; // Default fallback
                if (provider) {
                  try {
                    const contract = new ethers.Contract(holding.token.contractAddress, ERC20_ABI, provider);
                    decimals = await contract.decimals();
                  } catch (err) {
                    console.warn(`Failed to fetch decimals for ${holding.token.symbol}, using default 18:`, err);
                  }
                }

                tokenSet.set(address, {
                  symbol: holding.token.symbol || 'UNKNOWN',
                  name: holding.token.name || 'Unknown Token',
                  address: holding.token.contractAddress,
                  decimals,
                  logoUrl: holding.token.logoUrl || undefined,
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('Error fetching user holdings:', err);
      }
    }

    return Array.from(tokenSet.values());
  };

  const fetchTokenPrices = async (tokens: BaseToken[]): Promise<Map<string, { price: number; change24h: number }>> => {
    try {
      // Get all token addresses
      const addresses = tokens.map((t) => t.address);

      // Call backend endpoint (uses DEXScreener with 60s cache)
      const response = await fetch('/api/wallet/portfolio-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch token prices from backend');
      }

      const data = await response.json();

      // Map addresses to prices (use address as key, not coingeckoId)
      const priceMap = new Map<string, { price: number; change24h: number }>();

      Object.entries(data.prices).forEach(([address, priceData]: [string, any]) => {
        priceMap.set(address.toLowerCase(), {
          price: priceData.price || 0,
          change24h: priceData.change24h || 0,
        });
      });

      return priceMap;
    } catch (err) {
      console.error('Error fetching token prices:', err);
      return new Map();
    }
  };

  return {
    balances,
    isLoading,
    error,
    refetch: fetchBalances,
  };
}
