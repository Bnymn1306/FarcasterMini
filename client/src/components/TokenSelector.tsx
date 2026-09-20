import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, ChevronDown, Plus, Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSearchTokens, useUserTokenBalances } from '@/hooks/useTokenList';
import { useWallet } from '@/contexts/WalletContext';
import type { Token } from '@/lib/tokens';
import { Badge } from '@/components/ui/badge';
import { useCustomTokenImport, isValidEthereumAddress } from '@/hooks/useCustomTokenImport';
import { useToast } from '@/hooks/use-toast';

const QUICK_SELECT_TOKENS: Token[] = [
  {
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logoURI: '/api/token-image-proxy?url=' + encodeURIComponent('https://assets.coingecko.com/coins/images/279/small/ethereum.png'),
  },
  {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: '/api/token-image-proxy?url=' + encodeURIComponent('https://assets.coingecko.com/coins/images/6319/small/usdc.png'),
  },
  {
    address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    symbol: 'cbBTC',
    name: 'Coinbase Wrapped BTC',
    decimals: 8,
    logoURI: '/api/token-image-proxy?url=' + encodeURIComponent('https://assets.coingecko.com/coins/images/40143/standard/cbbtc.webp'),
  },
];

interface TokenSelectorProps {
  selectedToken: Token;
  onSelectToken: (token: Token) => void;
  otherToken?: Token;
  label?: string;
}

export function TokenSelector({ selectedToken, onSelectToken, otherToken, label }: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { tokens, isLoading } = useSearchTokens(searchQuery);
  const { walletAddress, getProvider } = useWallet();
  const provider = getProvider();
  const { data: balances } = useUserTokenBalances(walletAddress, provider || undefined);
  const { resolveToken, isResolving, error: resolveError, resolvedToken, reset } = useCustomTokenImport();
  const { toast } = useToast();

  // Check if search query is a valid Ethereum address not in token list
  const isValidAddress = isValidEthereumAddress(searchQuery.trim());
  const addressNotFound = isValidAddress && tokens.every(
    t => t.address.toLowerCase() !== searchQuery.trim().toLowerCase()
  );

  // Reset resolve state when dialog closes or search changes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      reset();
    }
  }, [isOpen, reset]);

  // Auto-select resolved token
  useEffect(() => {
    if (resolvedToken) {
      toast({
        title: 'Token imported',
        description: `${resolvedToken.symbol} (${resolvedToken.name}) added to your list`,
      });
      handleSelectToken(resolvedToken);
    }
  }, [resolvedToken]);

  const handleImportCustomToken = () => {
    if (!isValidAddress) return;
    resolveToken(searchQuery.trim());
  };

  const handleSelectToken = (token: Token) => {
    onSelectToken(token);
    setIsOpen(false);
    setSearchQuery('');
  };

  // Don't filter out the other token - show it with a badge instead
  // Sort tokens: owned tokens first, then alphabetically
  const sortedTokens = [...tokens].sort((a, b) => {
    const aHasBalance = balances?.[a.address];
    const bHasBalance = balances?.[b.address];
    
    if (aHasBalance && !bHasBalance) return -1;
    if (!aHasBalance && bHasBalance) return 1;
    
    // If both have balance or neither have balance, sort alphabetically
    return a.symbol.localeCompare(b.symbol);
  });

  return (
    <>
      <Button
        variant="outline"
        className="flex items-center justify-between gap-3 h-auto py-3 px-4 w-full bg-card hover-elevate active-elevate-2"
        onClick={() => setIsOpen(true)}
        data-testid={`button-select-${label?.toLowerCase() || 'token'}`}
      >
        <div className="flex items-center gap-3">
          {selectedToken.logoURI && (
            <Avatar className="h-8 w-8">
              <AvatarImage src={selectedToken.logoURI} alt={selectedToken.symbol} />
              <AvatarFallback>{selectedToken.symbol[0]}</AvatarFallback>
            </Avatar>
          )}
          <span className="font-semibold text-lg">{selectedToken.symbol}</span>
        </div>
        <ChevronDown className="h-5 w-5 text-muted-foreground" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select a token</DialogTitle>
          </DialogHeader>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name or paste address"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-token-search"
            />
          </div>

          {/* Quick Select Tokens */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {QUICK_SELECT_TOKENS.map((token) => (
              <button
                key={token.address}
                onClick={() => handleSelectToken(token)}
                className="flex items-center gap-2 px-3 py-2 rounded-full bg-muted hover-elevate active-elevate-2 transition-colors"
                data-testid={`button-quick-select-${token.symbol}`}
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage src={token.logoURI} alt={token.symbol} />
                  <AvatarFallback className="text-xs">{token.symbol[0]}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{token.symbol}</span>
              </button>
            ))}
          </div>

          {/* Your Tokens Header */}
          <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span>Your Tokens</span>
          </div>

          <ScrollArea className="h-[320px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                Loading tokens...
              </div>
            ) : addressNotFound ? (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <div className="text-center">
                  <p className="text-sm font-medium mb-1">Token not found in list</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Import this custom token by resolving on-chain
                  </p>
                </div>
                <Button
                  onClick={handleImportCustomToken}
                  disabled={isResolving}
                  className="gap-2"
                  data-testid="button-import-custom-token"
                >
                  {isResolving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resolving...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Import Token
                    </>
                  )}
                </Button>
                {resolveError && (
                  <p className="text-xs text-destructive">
                    {resolveError.message}
                  </p>
                )}
              </div>
            ) : sortedTokens.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                No tokens found
              </div>
            ) : (
              <div className="space-y-1">
                {sortedTokens.map((token) => {
                  const tokenBalance = balances?.[token.address];
                  const hasBalance = !!tokenBalance;
                  const isOtherToken = otherToken?.address.toLowerCase() === token.address.toLowerCase();
                  
                  return (
                    <button
                      key={token.address}
                      onClick={() => handleSelectToken(token)}
                      className="w-full flex items-center gap-3 p-3 rounded-md hover-elevate active-elevate-2 text-left"
                      data-testid={`button-select-token-${token.symbol}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={token.logoURI} alt={token.symbol} />
                        <AvatarFallback>{token.symbol[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{token.symbol}</span>
                          {isOtherToken && (
                            <Badge variant="outline" className="text-xs">
                              {label?.toLowerCase() === 'from' ? 'To' : 'From'}
                            </Badge>
                          )}
                          {hasBalance && (
                            <Badge variant="secondary" className="text-xs">
                              Owned
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {token.name}
                        </div>
                      </div>
                      {hasBalance && (
                        <div className="text-right">
                          <div className="font-medium">{tokenBalance.formatted}</div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
