import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ArrowDownUp, Loader2, AlertCircle, Search, RefreshCw, Wallet } from 'lucide-react';
import { useSolanaWallet } from '@/contexts/SolanaWalletContext';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useQuery } from '@tanstack/react-query';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

interface SolanaToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
}

interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: any[];
}

// Helper: Generate path-based proxy URL for Frame compatibility
const proxyUrl = (url: string) => {
  const base64 = btoa(url);
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `/token-logo/${base64url}.png`;
};

const POPULAR_SOLANA_TOKENS: SolanaToken[] = [
  { 
    address: 'So11111111111111111111111111111111111111112', 
    symbol: 'SOL', 
    name: 'Solana', 
    decimals: 9, 
    logoURI: proxyUrl('https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png')
  },
  { 
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 
    symbol: 'USDC', 
    name: 'USD Coin', 
    decimals: 6, 
    logoURI: proxyUrl('https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png')
  },
  { 
    address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 
    symbol: 'JUP', 
    name: 'Jupiter', 
    decimals: 6,
    logoURI: proxyUrl('https://static.jup.ag/jup/icon.png')
  },
  { 
    address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 
    symbol: 'BONK', 
    name: 'Bonk', 
    decimals: 5,
    logoURI: proxyUrl('https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I')
  },
  { 
    address: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', 
    symbol: 'mSOL', 
    name: 'Marinade Staked SOL', 
    decimals: 9,
    logoURI: proxyUrl('https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png')
  },
  {
    address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    symbol: 'WIF',
    name: 'dogwifhat',
    decimals: 6,
    logoURI: proxyUrl('https://bafkreibk3covs5ltyqxa272uodhculbr6kea6betidfwy3ajsav2vjzyum.ipfs.nftstorage.link')
  },
  {
    address: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
    symbol: 'PYTH',
    name: 'Pyth Network',
    decimals: 6,
    logoURI: proxyUrl('https://pyth.network/token.svg')
  },
];

interface SolanaSwapInterfaceProps {
  onToTokenChange?: (token: SolanaToken | null) => void;
}

export function SolanaSwapInterface({ onToTokenChange }: SolanaSwapInterfaceProps) {
  const { isConnected: connected, isConnecting, publicKey: walletAddress, connect, getConnection, balance: solBalance, refreshBalance } = useSolanaWallet();
  const { connection } = useConnection();
  const { sendTransaction, signTransaction } = useWallet();
  const { toast } = useToast();

  const [fromToken, setFromToken] = useState<SolanaToken | null>(POPULAR_SOLANA_TOKENS[0]);
  const [toToken, setToToken] = useState<SolanaToken | null>(POPULAR_SOLANA_TOKENS[1]);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [tokenDialogRole, setTokenDialogRole] = useState<'from' | 'to'>('from');
  const [searchQuery, setSearchQuery] = useState('');
  const [slippageBps, setSlippageBps] = useState(50);
  const [tokenBalances, setTokenBalances] = useState<Record<string, number>>({});
  const [lookupToken, setLookupToken] = useState<SolanaToken | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const { data: tokenList, isLoading: tokensLoading } = useQuery<SolanaToken[]>({
    queryKey: ['/api/solana/tokens'],
    staleTime: 5 * 60 * 1000,
  });

  // Auto-detect contract address and lookup token
  useEffect(() => {
    const isSolanaAddress = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());
    
    if (searchQuery && isSolanaAddress(searchQuery)) {
      const lookupAddress = async () => {
        setIsLookingUp(true);
        try {
          const response = await fetch(`/api/solana/token/${searchQuery.trim()}`);
          if (response.ok) {
            const token = await response.json();
            setLookupToken(token);
            toast({
              title: 'Token Found',
              description: `${token.symbol} - ${token.name}`,
            });
          } else {
            setLookupToken(null);
          }
        } catch (error) {
          setLookupToken(null);
        } finally {
          setIsLookingUp(false);
        }
      };
      lookupAddress();
    } else {
      setLookupToken(null);
    }
  }, [searchQuery, toast]);

  // ✅ Refresh SOL balance when connected
  useEffect(() => {
    if (connected && walletAddress) {
      console.log('🔄 Refreshing SOL balance on mount/connect...');
      refreshBalance();
    }
  }, [connected, walletAddress, refreshBalance]);

  // Fetch token balances for wallet (uses backend API for SOL balance to avoid rate limits)
  const fetchTokenBalances = useCallback(async () => {
    console.log('🔄 fetchTokenBalances called:', { connected, walletAddress: walletAddress?.slice(0, 8), hasConnection: !!connection });
    if (!connected || !walletAddress) {
      console.log('⚠️ fetchTokenBalances early return:', { connected, hasWallet: !!walletAddress });
      return;
    }
    
    try {
      // Start with existing balances to preserve values on fetch failure
      const balances: Record<string, number> = { ...tokenBalances };
      
      // Add timestamp to bust cache and get fresh data
      const cacheBust = Date.now();
      
      // Fetch SOL balance and ALL SPL token balances in parallel (2 calls total)
      const [solResponse, allTokensResponse] = await Promise.all([
        fetch(`/api/solana/balance/${walletAddress}?t=${cacheBust}`).catch(() => null),
        fetch(`/api/solana/all-token-balances/${walletAddress}?t=${cacheBust}`).catch(() => null)
      ]);
      
      // Process SOL balance
      if (solResponse?.ok) {
        const solData = await solResponse.json();
        balances['So11111111111111111111111111111111111111112'] = solData.balance;
        console.log('💰 SOL balance from backend:', solData.balance);
      }
      
      // Process ALL SPL token balances from single RPC call
      if (allTokensResponse?.ok) {
        const allTokensData = await allTokensResponse.json();
        if (allTokensData.balances) {
          for (const [mint, balance] of Object.entries(allTokensData.balances)) {
            balances[mint] = balance as number;
            console.log(`💰 Token ${mint.slice(0, 8)}... balance:`, balance);
          }
          console.log(`💰 Loaded ${Object.keys(allTokensData.balances).length} token balances in single RPC call`);
        }
      }
      
      setTokenBalances(balances);
      console.log('💰 Total token balances:', Object.keys(balances).length, 'tokens');
    } catch (error) {
      console.error('Failed to fetch token balances:', error);
    }
  }, [connected, walletAddress]); // Removed fromToken/toToken - now fetching ALL tokens in single call

  useEffect(() => {
    fetchTokenBalances();
  }, [fetchTokenBalances]);

  // Filter tokens and include lookup token at the top if found
  const filteredTokens = (() => {
    let tokens = (tokenList || POPULAR_SOLANA_TOKENS).filter(token => 
      token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.address.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 50);
    
    // Add lookup token at the beginning if found and not already in list
    if (lookupToken && !tokens.find(t => t.address === lookupToken.address)) {
      tokens = [lookupToken, ...tokens];
    }
    
    return tokens;
  })();

  const fetchQuote = useCallback(async () => {
    if (!fromToken || !toToken || !fromAmount || parseFloat(fromAmount) <= 0) {
      setQuote(null);
      setToAmount('');
      return;
    }

    setIsLoading(true);
    try {
      const inputAmount = Math.floor(parseFloat(fromAmount) * (10 ** fromToken.decimals));
      
      const response = await fetch(
        `/api/solana/quote?inputMint=${fromToken.address}&outputMint=${toToken.address}&amount=${inputAmount}&slippageBps=${slippageBps}`
      );

      if (!response.ok) {
        throw new Error('Failed to get quote');
      }

      const quoteData: JupiterQuote = await response.json();
      setQuote(quoteData);
      
      const outAmount = parseInt(quoteData.outAmount) / (10 ** toToken.decimals);
      setToAmount(outAmount.toFixed(6));
    } catch (error: any) {
      console.error('Quote error:', error);
      toast({
        title: 'Quote Error',
        description: error.message || 'Failed to get quote',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [fromToken, toToken, fromAmount, slippageBps, toast]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchQuote();
    }, 150); // Reduced from 500ms for faster UX
    return () => clearTimeout(debounce);
  }, [fetchQuote]);

  useEffect(() => {
    onToTokenChange?.(toToken);
  }, [toToken, onToTokenChange]);

  const handleSwap = async () => {
    if (!connected || !walletAddress || !quote || !fromToken || !toToken) {
      toast({
        title: 'Cannot Swap',
        description: 'Please connect your wallet and get a quote first',
        variant: 'destructive',
      });
      return;
    }

    if (!sendTransaction || !signTransaction) {
      toast({
        title: 'Wallet Error',
        description: 'Wallet does not support signing transactions',
        variant: 'destructive',
      });
      return;
    }

    setIsSwapping(true);
    try {
      console.log("🔄 Starting Solana swap...");
      
      const response = await fetch('/api/solana/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: walletAddress,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Swap failed');
      }

      const swapData = await response.json();
      console.log("📦 Got swap transaction from Jupiter");
      
      // Jupiter returns versioned transactions (V0) - deserialize it
      const transactionBuffer = Buffer.from(swapData.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuffer);
      console.log("📝 Transaction deserialized, sending via Wallet Adapter...");
      
      // Sign transaction with wallet
      const signedTransaction = await signTransaction(transaction);
      console.log("📝 Transaction signed, sending via backend RPC...");
      
      // Serialize and send via backend to avoid RPC rate limits
      const serializedTx = Buffer.from(signedTransaction.serialize()).toString('base64');
      
      const sendResponse = await fetch('/api/solana/send-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTransaction: serializedTx }),
      });
      
      if (!sendResponse.ok) {
        const sendError = await sendResponse.json();
        throw new Error(sendError.error || 'Failed to send transaction');
      }
      
      const sendData = await sendResponse.json();
      const signature = sendData.signature;
      console.log("✅ Transaction sent via backend, signature:", signature);

      toast({
        title: 'Swap Successful!',
        description: `Swapped ${fromAmount} ${fromToken.symbol} for ${toAmount} ${toToken.symbol}`,
      });

      setFromAmount('');
      setToAmount('');
      setQuote(null);
      
      // Refresh balances immediately and retry a few times to catch updates
      // Transaction is already confirmed by backend, but RPC might need a moment
      // Also refresh SOL balance from context with cache-busting
      fetchTokenBalances();
      refreshBalance(true);
      setTimeout(() => {
        fetchTokenBalances();
        refreshBalance(true);
      }, 1500);
      setTimeout(() => {
        fetchTokenBalances();
        refreshBalance(true);
      }, 4000);
    } catch (error: any) {
      console.error('Swap error:', error);
      
      // Provide more helpful error messages
      let errorMessage = error.message || 'Failed to execute swap';
      if (errorMessage.includes('User rejected')) {
        errorMessage = 'Transaction was cancelled';
      } else if (errorMessage.includes('insufficient')) {
        errorMessage = 'Insufficient balance for swap';
      }
      
      toast({
        title: 'Swap Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSwapping(false);
    }
  };

  const handleSwapTokens = () => {
    const tempToken = fromToken;
    const tempAmount = fromAmount;
    setFromToken(toToken);
    setToToken(tempToken);
    setFromAmount(toAmount);
    setToAmount(tempAmount);
    setQuote(null);
  };

  const openTokenDialog = (role: 'from' | 'to') => {
    setTokenDialogRole(role);
    setSearchQuery('');
    setTokenDialogOpen(true);
  };

  const selectToken = (token: SolanaToken) => {
    if (tokenDialogRole === 'from') {
      if (toToken?.address === token.address) {
        setToToken(fromToken);
      }
      setFromToken(token);
    } else {
      if (fromToken?.address === token.address) {
        setFromToken(toToken);
      }
      setToToken(token);
    }
    setTokenDialogOpen(false);
    setQuote(null);
  };

  const priceImpact = quote?.priceImpactPct ? parseFloat(quote.priceImpactPct) : 0;
  const isPriceImpactHigh = priceImpact > 1;
  const isPriceImpactVeryHigh = priceImpact > 5;

  // Get balance for display - use context balance for SOL as fallback
  const getFromBalance = (): string => {
    if (!fromToken) return '0.0000';
    // For SOL, use context balance if tokenBalances not loaded yet
    if (fromToken.address === 'So11111111111111111111111111111111111111112') {
      const contextBal = solBalance ? parseFloat(solBalance) : 0;
      const tokenBal = tokenBalances[fromToken.address];
      const finalBal = tokenBal !== undefined ? tokenBal : contextBal;
      return finalBal > 0 ? finalBal.toFixed(4) : '0.0000';
    }
    const bal = tokenBalances[fromToken.address];
    return bal !== undefined ? bal.toFixed(4) : '0.0000';
  };

  const getToBalance = (): string => {
    if (!toToken) return '0.0000';
    // For SOL, use context balance if tokenBalances not loaded yet
    if (toToken.address === 'So11111111111111111111111111111111111111112') {
      const contextBal = solBalance ? parseFloat(solBalance) : 0;
      const tokenBal = tokenBalances[toToken.address];
      const finalBal = tokenBal !== undefined ? tokenBal : contextBal;
      return finalBal > 0 ? finalBal.toFixed(4) : '0.0000';
    }
    const bal = tokenBalances[toToken.address];
    return bal !== undefined ? bal.toFixed(4) : '0.0000';
  };

  // Handle MAX click with fee buffer for SOL
  const handleMaxClick = async () => {
    if (!fromToken) return;
    
    const isSOL = fromToken.address === 'So11111111111111111111111111111111111111112';
    let balance: number | null = null;
    
    if (isSOL && connection && walletAddress) {
      try {
        const pubKey = new PublicKey(walletAddress);
        const lamports = await connection.getBalance(pubKey);
        balance = lamports / 1e9;
        setTokenBalances(prev => ({ ...prev, [fromToken.address]: balance! }));
      } catch (e) {
        toast({ title: 'Balance Fetch Failed', variant: 'destructive' });
        return;
      }
    } else {
      balance = tokenBalances[fromToken.address] || 0;
    }
    
    const feeBuffer = isSOL ? 0.02 : 0;
    const maxAmount = Math.max(0, balance - feeBuffer);
    setFromAmount(maxAmount.toFixed(6));
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <Card className="p-3 sm:p-4 md:p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="text-lg sm:text-xl md:text-2xl font-bold">Instant Swap</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchQuote}
            disabled={isLoading}
            className="h-8 w-8 sm:h-9 sm:w-9"
            data-testid="button-refresh-quote"
          >
            <RefreshCw className={`h-4 w-4 sm:h-5 sm:w-5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* FROM Card - TradeCard style */}
        {fromToken && (
          <div className="p-3 sm:p-4 rounded-xl border bg-muted/30">
            <Label className="text-xs sm:text-sm text-muted-foreground mb-2 block">You Pay</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="flex items-center gap-2 h-auto py-2 px-3 bg-card hover-elevate active-elevate-2 shrink-0"
                onClick={() => openTokenDialog('from')}
                data-testid="button-select-from-token"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={fromToken.logoURI} alt={fromToken.symbol} />
                  <AvatarFallback className="text-sm">{fromToken.symbol[0]}</AvatarFallback>
                </Avatar>
                <div className="text-left">
                  <div className="font-bold text-base sm:text-lg leading-tight">{fromToken.symbol}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground truncate max-w-[80px] sm:max-w-[100px]">{fromToken.name}</div>
                </div>
                <ArrowDownUp className="h-4 w-4 text-muted-foreground flex-shrink-0 rotate-90" />
              </Button>
              <div className="flex-1 min-w-0">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  placeholder="0.0"
                  className="text-xl sm:text-2xl h-auto py-2 text-right font-semibold border-0 bg-transparent focus-visible:ring-0"
                  data-testid="input-from-amount"
                />
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground mt-2">
              <span>Balance: {getFromBalance()} {fromToken.symbol}</span>
            </div>
            {/* Quick Amount Buttons */}
            {connected && parseFloat(getFromBalance()) > 0 && (
              <div className="flex gap-1.5 mt-2">
                {[
                  { label: '25%', value: 25 },
                  { label: '50%', value: 50 },
                  { label: '75%', value: 75 },
                  { label: 'MAX', value: 100 }
                ].map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => option.value === 100 ? handleMaxClick() : setFromAmount((parseFloat(getFromBalance()) * option.value / 100).toFixed(6))}
                    className="flex-1 h-6 text-[10px] sm:text-xs font-semibold px-2"
                    data-testid={`button-quick-${option.label.toLowerCase()}`}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Swap Toggle Button */}
        <div className="flex justify-center -my-2 sm:-my-3 z-10 relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSwapTokens}
            className="rounded-full h-8 w-8 sm:h-10 sm:w-10 border-2 border-muted bg-background hover-elevate active-elevate-2"
            data-testid="button-swap-direction"
          >
            <ArrowDownUp className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </div>

        {/* TO Card - TradeCard style */}
        {toToken && (
          <div className="p-3 sm:p-4 rounded-xl border bg-muted/30">
            <Label className="text-xs sm:text-sm text-muted-foreground mb-2 block">You Receive</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="flex items-center gap-2 h-auto py-2 px-3 bg-card hover-elevate active-elevate-2 shrink-0"
                onClick={() => openTokenDialog('to')}
                data-testid="button-select-to-token"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={toToken.logoURI} alt={toToken.symbol} />
                  <AvatarFallback className="text-sm">{toToken.symbol[0]}</AvatarFallback>
                </Avatar>
                <div className="text-left">
                  <div className="font-bold text-base sm:text-lg leading-tight">{toToken.symbol}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground truncate max-w-[80px] sm:max-w-[100px]">{toToken.name}</div>
                </div>
                <ArrowDownUp className="h-4 w-4 text-muted-foreground flex-shrink-0 rotate-90" />
              </Button>
              <div className="flex-1 min-w-0">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={toAmount}
                  readOnly
                  placeholder="0.0"
                  className="text-xl sm:text-2xl h-auto py-2 text-right font-semibold border-0 bg-transparent focus-visible:ring-0"
                  data-testid="input-to-amount"
                />
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground mt-2">
              {isLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <span>Balance: {getToBalance()} {toToken.symbol}</span>
              )}
            </div>
          </div>
        )}

        {/* Quote Info */}
        {quote && fromToken && toToken && fromAmount && toAmount && 
         parseFloat(fromAmount) > 0 && parseFloat(toAmount) > 0 && (
          <div className="mt-3 p-2.5 sm:p-3 bg-muted rounded-lg space-y-1.5">
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Rate</span>
              <span data-testid="text-swap-rate" className="font-medium">
                1 {fromToken.symbol} = {(parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(6)} {toToken.symbol}
              </span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Price Impact</span>
              <span className={isPriceImpactVeryHigh ? 'text-red-500 font-bold' : isPriceImpactHigh ? 'text-yellow-500' : ''}>
                {priceImpact.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Slippage</span>
              <span>{(slippageBps / 100).toFixed(1)}%</span>
            </div>
          </div>
        )}

        {/* High Price Impact Warning */}
        {isPriceImpactVeryHigh && (
          <div className="mt-3 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="text-sm text-red-500">
              High price impact! Consider reducing trade size.
            </span>
          </div>
        )}

        {/* Swap Button */}
        <Button
          className="w-full mt-4 h-10 sm:h-11 text-sm sm:text-base"
          onClick={handleSwap}
          disabled={!fromAmount || !toAmount || isLoading || isSwapping || parseFloat(fromAmount) <= 0}
          data-testid="button-swap"
        >
          {isSwapping ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Swapping...
            </>
          ) : isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Getting Quote...
            </>
          ) : isConnecting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : !connected ? (
            'Connect Wallet'
          ) : fromToken && toToken ? (
            `Swap ${fromToken.symbol} for ${toToken.symbol}`
          ) : (
            'Select Tokens'
          )}
        </Button>

        {/* Warning */}
        <div className="mt-3 flex items-start gap-1.5 text-[10px] sm:text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 mt-0.5 flex-shrink-0" />
          <p>Prices are estimated via Jupiter. Always review before confirming.</p>
        </div>
      </Card>

      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px] max-h-[85vh] overflow-hidden left-1/2 -translate-x-1/2">
          <DialogHeader>
            <DialogTitle>Select Token</DialogTitle>
            <DialogDescription>
              Choose a Solana token to swap. Tokens with balances are shown first.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            {isLookingUp ? (
              <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-purple-500" />
            ) : (
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            )}
            <Input
              placeholder="Search or paste contract address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-token-search"
            />
          </div>
          {lookupToken && (
            <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/30 text-sm text-purple-400">
              Found: {lookupToken.symbol} - {lookupToken.name}
            </div>
          )}
          <ScrollArea className="h-[50vh] sm:h-[400px]">
            <div className="space-y-1">
              {tokensLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                [...filteredTokens]
                  .sort((a, b) => {
                    const balA = tokenBalances[a.address] || 0;
                    const balB = tokenBalances[b.address] || 0;
                    return balB - balA;
                  })
                  .map((token) => {
                    const balance = tokenBalances[token.address];
                    return (
                      <button
                        key={token.address}
                        onClick={() => selectToken(token)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover-elevate cursor-pointer"
                        data-testid={`token-option-${token.symbol}`}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={token.logoURI} />
                          <AvatarFallback className="bg-gradient-to-br from-purple-500 to-cyan-500 text-white text-xs font-bold">
                            {token.symbol.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left min-w-0">
                          <div className="font-medium">{token.symbol}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {token.name.length > 25 ? token.name.slice(0, 25) + '...' : token.name}
                          </div>
                        </div>
                        {balance !== undefined && balance > 0 && (
                          <span className="text-sm font-medium text-purple-500 shrink-0">
                            {balance.toFixed(4)}
                          </span>
                        )}
                        {token.tags?.includes('verified') && (
                          <Badge variant="outline" className="text-xs shrink-0">Verified</Badge>
                        )}
                      </button>
                    );
                  })
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
