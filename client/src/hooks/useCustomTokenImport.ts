import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Token } from '@/lib/tokens';

interface ResolveTokenResponse {
  token: Token;
}

const BASE_CHAIN_ID = 8453;

export function useCustomTokenImport() {
  const queryClient = useQueryClient();

  const resolveMutation = useMutation({
    mutationFn: async (address: string): Promise<Token> => {
      const response = await fetch(`/api/tokens/resolve/${address}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resolve token');
      }

      const data: ResolveTokenResponse = await response.json();
      return data.token;
    },
    onSuccess: (token) => {
      // Add resolved token to the cached token list
      queryClient.setQueryData(['tokenList', BASE_CHAIN_ID], (oldData: Token[] | undefined) => {
        if (!oldData) return [token];
        
        // Check if token already exists
        const exists = oldData.some(t => t.address.toLowerCase() === token.address.toLowerCase());
        if (exists) return oldData;
        
        // Add new token and re-sort
        return [...oldData, token].sort((a, b) => a.symbol.localeCompare(b.symbol));
      });
      
      console.log(`✅ Custom token imported: ${token.symbol} (${token.address})`);
    }
  });

  return {
    resolveToken: resolveMutation.mutate,
    isResolving: resolveMutation.isPending,
    error: resolveMutation.error,
    resolvedToken: resolveMutation.data,
    reset: resolveMutation.reset
  };
}

// Helper function to validate Ethereum address format
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
