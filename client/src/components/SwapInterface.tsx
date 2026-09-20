import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowDownUp, Settings2, Loader2, AlertCircle, ArrowDown } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { Token, NATIVE_ETH, ZEROX_NATIVE_ETH_SENTINEL } from '@/lib/tokens';
import { useToast } from '@/hooks/use-toast';
import { ethers } from 'ethers';
import { TradeCard } from '@/components/TradeCard';
import { useTokenList } from '@/hooks/useTokenList';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getSDK, isInFarcasterFrame } from '@/lib/farcasterInit';
import { queryClient } from '@/lib/queryClient';
import { useAccount, useConnect, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, parseUnits } from 'viem';

interface SwapQuote {
  price?: string;
  gas?: string;
  gasPrice?: string;
  estimatedGas?: string;
  buyAmount: string;
  sellAmount: string;
  allowanceTarget?: string;
  to: string;
  data: string;
  value: string;
  pathId?: string; // ODOS pathId
  isOdos?: boolean; // Flag to identify ODOS quotes
  transaction?: {
    to: string;
    data: string;
    value: string;
    gas?: string;
    gasPrice?: string;
  };
  issues?: {
    allowance?: {
      spender: string;
    };
    balance?: any;
  };
}

interface SwapInterfaceProps {
  onToTokenChange?: (token: Token | null) => void;
}

// ✅ Dynamic slippage calculation based on token pair type (Base chain optimized)
// Stablecoins: 0.5%, Major pairs (ETH/USDC): 0.5%, Meme/low-cap: 2%, Very illiquid: 3%
function calculateDynamicSlippage(fromToken: Token | null, toToken: Token | null): string {
  if (!fromToken || !toToken) return '0.01'; // Default 1%
  
  // Stablecoin addresses on Base
  const STABLECOINS = [
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // DAI
    '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca', // USDbC
  ].map(a => a.toLowerCase());
  
  // Major liquid tokens on Base (ETH, WETH, cbBTC, AERO)
  const MAJOR_TOKENS = [
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // Native ETH
    '0x4200000000000000000000000000000000000006', // WETH
    '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', // cbBTC
    '0x940181a94a35a4569e4529a3cdfb74e38fd98631', // AERO
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
  ].map(a => a.toLowerCase());
  
  const fromAddr = fromToken.address.toLowerCase();
  const toAddr = toToken.address.toLowerCase();
  
  // Both are stablecoins → very low slippage (0.3%)
  if (STABLECOINS.includes(fromAddr) && STABLECOINS.includes(toAddr)) {
    return '0.003';
  }
  
  // ETH/WETH ↔ Stablecoin (major pair) → low slippage (0.5%)
  const isFromMajor = MAJOR_TOKENS.includes(fromAddr);
  const isToMajor = MAJOR_TOKENS.includes(toAddr);
  
  if (isFromMajor && isToMajor) {
    return '0.005'; // 0.5% for major pairs like ETH/USDC
  }
  
  // One side is major token → moderate slippage (1%)
  if (isFromMajor || isToMajor) {
    return '0.01'; // 1% for mixed pairs
  }
  
  // Both are meme/low-cap tokens → higher slippage (2%)
  return '0.02';
}

// Helper: Trim decimal places to prevent ethers.parseUnits NUMERIC_FAULT
// Example: trimDecimals("0.002474999999999999998", 18) => "0.002474999999999999"
function trimDecimals(value: string, maxDecimals: number): string {
  // Remove any whitespace
  const cleaned = value.trim();
  
  // If no decimal point, return as-is
  if (!cleaned.includes('.')) {
    return cleaned;
  }
  
  // Split into integer and decimal parts
  const [integerPart, decimalPart] = cleaned.split('.');
  
  // Trim decimal part to maxDecimals
  const trimmedDecimal = decimalPart.slice(0, maxDecimals);
  
  // If no decimal part remains, return just integer
  if (!trimmedDecimal) {
    return integerPart;
  }
  
  return `${integerPart}.${trimmedDecimal}`;
}

export function SwapInterface({ onToTokenChange }: SwapInterfaceProps) {
  const { walletAddress, isWalletConnected, connectWallet, getProvider, refreshBalance } = useWallet();
  const { toast } = useToast();
  const { data: allTokens } = useTokenList();
  
  // Wagmi hooks for Farcaster Frame transactions
  const { isConnected: wagmiConnected, address: wagmiAddress } = useAccount();
  const { connect, connectors } = useConnect();
  const { sendTransactionAsync, isPending: isWagmiPending } = useSendTransaction();
  const [pendingTxHash, setPendingTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: pendingTxHash,
  });
  
  // Auto-import token from contract address
  const [resolvedToken, setResolvedToken] = useState<Token | null>(null);
  const [resolvedTokenPrice, setResolvedTokenPrice] = useState<number | null>(null);
  const [isResolvingToken, setIsResolvingToken] = useState(false);
  
  // Helper: Proxy token images for Farcaster Frame (path-based, no query strings for Warpcast mobile)
  const getProxiedImageUrl = (url: string | undefined) => {
    if (!url) return url;
    // If already proxied (path-based), return as-is
    if (url.startsWith('/token-logo/')) return url;
    // Convert to path-based proxy URL (Warpcast blocks query strings)
    const base64 = btoa(url);
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return `/token-logo/${base64url}.png`;
  };
  
  // Track if tokens have been initialized
  const tokensInitialized = useRef(false);
  
  // Default tokens
  const defaultFromToken = allTokens?.find(t => t.symbol === 'ETH') || allTokens?.[0];
  const defaultToToken = allTokens?.find(t => t.symbol === 'USDC') || allTokens?.[1];
  
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken] = useState<Token | null>(null);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fromBalance, setFromBalance] = useState<string>('');
  const [toBalance, setToBalance] = useState<string>('');
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  
  // Token dialog state (shared between FROM/TO)
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [tokenDialogRole, setTokenDialogRole] = useState<'from' | 'to'>('from');
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  
  // Auto-resolve token when contract address is pasted in search
  useEffect(() => {
    const searchTrimmed = tokenSearchQuery.trim();
    
    // Check if input looks like a contract address (0x + 40 hex chars)
    const isContractAddress = /^0x[a-fA-F0-9]{40}$/.test(searchTrimmed);
    
    if (!isContractAddress) {
      setResolvedToken(null);
      return;
    }
    
    // Check if already in token list
    const existingToken = allTokens?.find(
      t => t.address.toLowerCase() === searchTrimmed.toLowerCase()
    );
    
    if (existingToken) {
      setResolvedToken(null); // Already in list, no need to resolve
      return;
    }
    
    // Auto-resolve from backend
    const resolveToken = async () => {
      setIsResolvingToken(true);
      try {
        const response = await fetch(`/api/tokens/resolve/${searchTrimmed}`);
        
        if (!response.ok) {
          setResolvedToken(null);
          return;
        }
        
        const responseData = await response.json();
        const tokenData = responseData.token; // Backend returns { token: { ... } }
        
        // Validate minimum token data (even blocked tokens should be shown with warning)
        if (!tokenData || !tokenData.symbol || !tokenData.name) {
          console.error('Invalid token data received (missing symbol/name):', responseData);
          setResolvedToken(null);
          return;
        }
        
        // Use default decimals if missing (18 is standard for most ERC-20 tokens)
        const decimals = typeof tokenData.decimals === 'number' ? tokenData.decimals : 18;
        
        const importedToken: Token = {
          address: tokenData.address,
          symbol: tokenData.symbol,
          name: tokenData.name,
          decimals: decimals,
          logoURI: tokenData.logoURI || '',
        };
        
        setResolvedToken(importedToken);
        
        // Fetch token price
        try {
          const priceResponse = await fetch(`/api/token-price/${tokenData.address}`);
          if (priceResponse.ok) {
            const priceData = await priceResponse.json();
            setResolvedTokenPrice(priceData.price || null);
          }
        } catch (priceError) {
          console.warn('Failed to fetch token price:', priceError);
          setResolvedTokenPrice(null);
        }
        
        // Show warning toast if token is risky/blocked
        if (tokenData.riskScore && tokenData.riskScore.score >= 80) {
          toast({
            title: 'High Risk Token Detected',
            description: `${tokenData.symbol} may be unsafe. Use at your own risk.`,
            variant: 'destructive',
          });
        }
      } catch (error) {
        setResolvedToken(null);
        setResolvedTokenPrice(null);
      } finally {
        setIsResolvingToken(false);
      }
    };
    
    resolveToken();
  }, [tokenSearchQuery, allTokens, toast]);

  // Quote fetching using GET endpoint (simple and working)
  const fetchQuote = async () => {
    const floatAmount = parseFloat(fromAmount);
    
    if (!floatAmount || floatAmount <= 0 || !fromToken || !toToken) {
      setToAmount('');
      setQuote(null);
      return;
    }

    // ✅ SPECIAL CASE: ETH ↔ WETH (wrap/unwrap) - 1:1 ratio, no API needed
    const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
    const isWETH = (addr: string) => addr.toLowerCase() === WETH_ADDRESS.toLowerCase();
    const isETH = (addr: string) => addr === NATIVE_ETH.address || addr.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    
    if ((isETH(fromToken.address) && isWETH(toToken.address)) || 
        (isWETH(fromToken.address) && isETH(toToken.address))) {
      console.log('🔄 ETH ↔ WETH: Using 1:1 ratio (no API needed)');
      
      const trimmedAmount = trimDecimals(fromAmount, 18);
      const amount = ethers.parseUnits(trimmedAmount, 18).toString();
      
      // Create a synthetic quote for wrap/unwrap (1:1 ratio)
      const syntheticQuote: SwapQuote = {
        buyAmount: amount,
        sellAmount: amount,
        to: WETH_ADDRESS,
        data: isETH(fromToken.address) ? '0xd0e30db0' : '0x2e1a7d4d', // deposit() or withdraw()
        value: isETH(fromToken.address) ? amount : '0',
        transaction: {
          to: WETH_ADDRESS,
          data: isETH(fromToken.address) ? '0xd0e30db0' : '0x2e1a7d4d',
          value: isETH(fromToken.address) ? amount : '0',
        }
      };
      
      setQuote(syntheticQuote);
      setToAmount(fromAmount); // 1:1 ratio
      setIsLoadingQuote(false);
      return;
    }

    setIsLoadingQuote(true);
    try {
      // ✅ CRITICAL FIX: Trim decimal places to prevent NUMERIC_FAULT
      // JavaScript floating-point creates numbers like "0.002474999999999999998"
      // ethers.parseUnits() fails with too many decimals
      const trimmedAmount = trimDecimals(fromAmount, fromToken.decimals);
      
      // ✅ ARCHITECT FIX: Use token-specific decimals (not hard-coded 18!)
      const sellAmount = ethers.parseUnits(trimmedAmount, fromToken.decimals).toString();

      // ✅ CRITICAL: Use 0x native ETH sentinel for native ETH swaps!
      // When user selects ETH, we must use 0xEeee...EEeE instead of WETH address
      // This tells 0x to use native ETH path (value=sellAmount) instead of WETH/Permit2 path
      const sellTokenAddress = fromToken.address === NATIVE_ETH.address 
        ? ZEROX_NATIVE_ETH_SENTINEL 
        : fromToken.address;

      // ✅ Dynamic slippage based on token pair (Base chain optimized)
      const dynamicSlippage = calculateDynamicSlippage(fromToken, toToken);
      console.log('📊 Dynamic slippage:', dynamicSlippage, 'for', fromToken.symbol, '→', toToken.symbol);
      
      const params = new URLSearchParams({
        sellToken: sellTokenAddress,
        buyToken: toToken.address,
        sellAmount: sellAmount,
        slippagePercentage: dynamicSlippage,
      });

      if (walletAddress) {
        params.append('takerAddress', walletAddress);
      }

      console.log('🌐 Fetching quote:', { sellToken: fromToken.symbol, buyToken: toToken.symbol, sellAmount, slippage: dynamicSlippage });

      const response = await fetch(`${window.location.origin}/api/swap-quote?${params.toString()}`);

      console.log('📡 0x response status:', response.status, response.statusText);
      
      // ✅ FIX: Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('❌ Non-JSON response received:', contentType);
        // Silently fail for non-JSON responses (server may be restarting)
        setToAmount('');
        setQuote(null);
        return;
      }
      
      const data = await response.json();
      console.log('✅ 0x quote received:', data);
      
      if (!response.ok || data.error) {
        const errorMsg = data.error || 'Failed to fetch quote';
        console.error('❌ Quote error:', errorMsg);
        throw new Error(errorMsg);
      }
      
      if (!data.buyAmount) {
        console.error('❌ Invalid quote:', data);
        throw new Error('Invalid quote received');
      }
      
      console.log('🔍 Quote data:', { 
        buyAmount: data.buyAmount,
        hasTransaction: !!data.transaction
      });
      
      // ✅ ARCHITECT FIX: Do NOT override transaction.value!
      // 0x API uses WETH address (0x4200...0006) and returns Permit2 calldata with value=0
      // Overriding to ETH amount breaks simulation (contract expects WETH, not ETH)
      
      setQuote(data);
      
      const buyAmount = ethers.formatUnits(data.buyAmount, toToken.decimals);
      setToAmount(buyAmount);
      
      console.log('✅ Quote success:', buyAmount, toToken.symbol);
    } catch (error: any) {
      console.error('Quote error:', error);
      
      // ✅ FIX: Show actual error message to user
      const errorMessage = error?.message || 'Failed to fetch swap quote';
      
      toast({
        title: 'Quote Error',
        description: errorMessage,
        variant: 'destructive',
      });
      setToAmount('');
      setQuote(null);
    } finally {
      setIsLoadingQuote(false);
    }
  };

  // ✅ SIMPLIFIED: Fetch balance directly from blockchain (NO Zerion API!)
  // ✅ FIX: Use Base RPC for ERC-20 reads (Farcaster provider may not support contract calls)
  const fetchBalance = async (token: Token): Promise<string> => {
    if (!isWalletConnected || !walletAddress) {
      return '0';
    }

    try {
      // ✅ CRITICAL FIX: Always use Base RPC for reading balances
      // Farcaster Frame provider only supports transaction signing, not contract reads
      const BASE_RPC = 'https://mainnet.base.org';
      const rpcProvider = new ethers.JsonRpcProvider(BASE_RPC);

      // Check if native ETH
      const isNativeETH = token.symbol.toUpperCase() === 'ETH' || 
                          token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      
      if (isNativeETH) {
        // Native ETH - direct blockchain read via RPC
        const rawBalance = await rpcProvider.getBalance(walletAddress);
        const formattedBalance = (Number(rawBalance) / 1e18).toFixed(6);
        console.log(`✅ Native ETH balance: ${formattedBalance} ETH`);
        return formattedBalance;
      }

      // ERC-20 token - read from contract via Base RPC
      const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];
      const contract = new ethers.Contract(token.address, ERC20_ABI, rpcProvider);
      const rawBalance = await contract.balanceOf(walletAddress);
      const formattedBalance = ethers.formatUnits(rawBalance, token.decimals);
      console.log(`✅ ${token.symbol} balance: ${formattedBalance}`);
      return formattedBalance;
    } catch (error) {
      console.error(`Balance fetch error for ${token.symbol}:`, error);
      return '0';
    }
  };

  // Frame detection on mount
  useEffect(() => {
    const inFrame = isInFarcasterFrame();
    console.log('🔍 Frame detection:', inFrame ? 'YES' : 'NO');
  }, []);

  // Set default tokens when list loads (initialize ONCE to avoid reset loops)
  useEffect(() => {
    if (allTokens && allTokens.length > 0 && !tokensInitialized.current) {
      setFromToken(defaultFromToken || allTokens[0]);
      setToToken(defaultToToken || allTokens[1]);
      tokensInitialized.current = true;
    }
  }, [allTokens, defaultFromToken, defaultToToken]);

  // Notify parent of toToken changes
  useEffect(() => {
    console.log('🟡 useEffect [toToken, onToTokenChange] fired:', {
      toToken: toToken?.symbol || 'null',
      hasCallback: !!onToTokenChange
    });
    
    if (onToTokenChange) {
      console.log('🟡 Calling onToTokenChange with:', toToken?.symbol || 'null');
      onToTokenChange(toToken);
    } else {
      console.warn('⚠️ onToTokenChange callback is NOT defined!');
    }
  }, [toToken, onToTokenChange]);

  // Fetch balances when wallet connects or tokens change
  useEffect(() => {
    const fetchBalances = async () => {
      // ✅ FIX: Check walletAddress is not empty!
      // WalletContext sets provider before address in Frame auto-connect
      if (!isWalletConnected || !walletAddress || !fromToken || !toToken) {
        setFromBalance('');
        setToBalance('');
        return;
      }

      console.log('🔄 Fetching balances for:', fromToken.symbol, toToken.symbol);
      setIsLoadingBalances(true);
      try {
        const [from, to] = await Promise.all([
          fetchBalance(fromToken),
          fetchBalance(toToken),
        ]);
        setFromBalance(from);
        setToBalance(to);
        console.log('✅ Balances loaded:', { from: `${from} ${fromToken.symbol}`, to: `${to} ${toToken.symbol}` });
      } catch (error) {
        console.error('Error fetching balances:', error);
      } finally {
        setIsLoadingBalances(false);
      }
    };

    fetchBalances();
  }, [isWalletConnected, walletAddress, fromToken, toToken]);

  // ✅ OPTIMIZED: Fast debounced quote fetching (300ms instead of 500ms)
  // Show loading immediately, fetch quote after short debounce
  useEffect(() => {
    const inFrame = isInFarcasterFrame();
    const shouldFetch = !!(fromAmount && parseFloat(fromAmount) > 0 && (isWalletConnected || inFrame));
    
    // ✅ Show loading state immediately (faster feedback)
    if (shouldFetch && fromToken && toToken) {
      setIsLoadingQuote(true);
    }
    
    // ✅ FASTER: 300ms debounce (was 500ms)
    const timer = setTimeout(() => {
      if (shouldFetch) {
        fetchQuote();
      } else {
        setIsLoadingQuote(false);
        setToAmount('');
        setQuote(null);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [fromAmount, fromToken, toToken, slippage, isWalletConnected, walletAddress]);

  // Reset search query when dialog closes
  useEffect(() => {
    if (!isTokenDialogOpen) {
      setTokenSearchQuery('');
    }
  }, [isTokenDialogOpen]);

  // Filter tokens based on search query + add resolved token
  const filteredTokens = useMemo(() => {
    if (!allTokens) return [];
    
    const query = tokenSearchQuery.toLowerCase().trim();
    
    // If no search query, show all tokens
    if (!query) return allTokens;
    
    // Filter existing tokens
    const filtered = allTokens.filter(token => 
      token.symbol.toLowerCase().includes(query) ||
      token.name.toLowerCase().includes(query) ||
      token.address.toLowerCase().includes(query)
    );
    
    // Add resolved token at the top if found
    if (resolvedToken && !filtered.find(t => t.address.toLowerCase() === resolvedToken.address.toLowerCase())) {
      return [resolvedToken, ...filtered];
    }
    
    return filtered;
  }, [allTokens, tokenSearchQuery, resolvedToken]);

  // Format balance (guard against NaN)
  const formatBalance = (balance: string, symbol: string): string => {
    if (!balance || balance === '' || isNaN(parseFloat(balance))) {
      return `0.0000 ${symbol}`;
    }
    return `${parseFloat(balance).toFixed(4)} ${symbol}`;
  };

  // Open token dialog (context-aware: FROM or TO)
  const openTokenDialog = (role: 'from' | 'to') => {
    console.log('🔷 openTokenDialog called:', { role });
    setTokenDialogRole(role);
    setIsTokenDialogOpen(true);
  };

  // Handle token selection from dialog (context-aware)
  const handleTokenSelect = (token: Token) => {
    console.log('🟢 handleTokenSelect called:', {
      role: tokenDialogRole,
      tokenSymbol: token.symbol,
      tokenAddress: token.address
    });
    
    if (tokenDialogRole === 'from') {
      console.log('🟢 Setting fromToken:', token.symbol);
      setFromToken(token);
    } else {
      console.log('🟢 Setting toToken:', token.symbol);
      setToToken(token);
    }
    setIsTokenDialogOpen(false);
  };

  const handleSwapTokens = () => {
    if (!fromToken || !toToken) return;
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
    setToAmount('');
    setQuote(null);
  };

  const handleSwap = async () => {
    // ✅ CRITICAL DEBUG: Log EVERYTHING for Samsung device debugging
    console.log('🚨 SWAP BUTTON CLICKED!');
    console.log('🔍 Device Info:', {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor,
      inFrame: isInFarcasterFrame(),
      isWalletConnected,
      walletAddress,
      fromToken: fromToken?.symbol,
      toToken: toToken?.symbol,
      fromAmount,
      hasQuote: !!quote
    });
    
    // ✅ TELEMETRY: Track swap button clicks!
    fetch('/api/frame-telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'swap_click',
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      })
    }).catch(() => {});
    
    // ✅ ARCHITECT FIX: Detect Frame on EVERY swap (bypass stale cache!)
    const inFrame = isInFarcasterFrame();
    console.log('🔍 SWAP - Frame check:', {
      inFrame,
      isWalletConnected,
      ua: navigator.userAgent.substring(0, 100)
    });
    
    // ✅ SHORT-CIRCUIT: Frame swaps bypass wallet check entirely!
    if (inFrame) {
      console.log('✅ Frame mode detected - bypassing wallet check');
      // Continue to Frame transaction flow (no wallet connection needed)
    } else if (!isWalletConnected) {
      // Regular browser mode requires wallet
      toast({
        title: 'Wallet Connection Required',
        description: 'Please connect your wallet to swap tokens.',
        variant: 'destructive',
      });
      await connectWallet();
      return;
    }

    // Validate amount is entered
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      toast({
        title: 'Amount Required',
        description: 'Please enter the amount you want to swap.',
        variant: 'destructive',
      });
      return;
    }

    // ✅ NO MINIMUM LIMIT - Users can swap any amount they want
    // The only real constraint is gas fees - 0x API will reject if amount is too small to cover fees
    const fromAmountNum = parseFloat(fromAmount);
    
    console.log('💰 VALIDATION CHECK:', {
      fromToken: fromToken?.symbol,
      toToken: toToken?.symbol,
      fromAmount: fromAmount,
      fromAmountNum: fromAmountNum,
      isNaN: isNaN(fromAmountNum),
    });

    // Check balance
    if (fromBalance && parseFloat(fromBalance) < fromAmountNum) {
      toast({
        title: 'Insufficient Balance',
        description: `Your balance: ${parseFloat(fromBalance).toFixed(4)} ${fromToken?.symbol}. Please enter a lower amount.`,
        variant: 'destructive',
      });
      return;
    }
    
    // ⚠️ For ETH swaps, ensure enough balance for amount + gas (Base gas is very cheap ~0.0003 ETH)
    if (fromToken?.address === NATIVE_ETH.address && fromBalance) {
      const ethBalance = parseFloat(fromBalance);
      const gasBuffer = 0.0005; // ~0.0005 ETH for Base gas fees (very cheap L2)
      if (ethBalance < fromAmountNum + gasBuffer) {
        const maxSwap = Math.max(0, ethBalance - gasBuffer);
        toast({
          title: 'Insufficient ETH for Gas',
          description: `Keep ~${gasBuffer} ETH for gas. Try swapping ${maxSwap.toFixed(4)} ETH or less.`,
          variant: 'destructive',
        });
        return;
      }
    }

    if (!quote || !fromToken || !toToken) {
      toast({
        title: 'Waiting for Quote',
        description: 'Please wait for the price quote to load or try changing the amount.',
        variant: 'destructive',
      });
      return;
    }

    console.log('🔄 Starting swap...', {
      from: fromToken.symbol,
      to: toToken.symbol,
      amount: fromAmount,
      quote: quote,
      isFrameMode: isInFarcasterFrame()
    });

    setIsSwapping(true);
    try {
      // 🔄 SPECIAL CASE: WETH ↔ ETH direct wrap/unwrap (no 0x API needed!)
      // This is much cheaper and doesn't require approval
      const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
      const isWETH = (addr: string) => addr.toLowerCase() === WETH_ADDRESS.toLowerCase();
      const isETH = (addr: string) => addr === NATIVE_ETH.address || addr.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      
      // WETH -> ETH (unwrap) or ETH -> WETH (wrap)
      if ((isWETH(fromToken.address) && isETH(toToken.address)) || 
          (isETH(fromToken.address) && isWETH(toToken.address))) {
        
        const isWrap = isETH(fromToken.address); // ETH -> WETH
        console.log(`🔄 ${isWrap ? 'ETH -> WETH (wrap)' : 'WETH -> ETH (unwrap)'}: Direct contract call`);
        
        const trimmedAmount = trimDecimals(fromAmount, 18);
        const amount = ethers.parseUnits(trimmedAmount, 18);
        
        toast({
          title: isWrap ? 'Wrapping ETH' : 'Unwrapping WETH',
          description: isWrap ? 'Converting ETH to WETH...' : 'Converting WETH to ETH...',
        });
        
        // 📱 FARCASTER FRAME MODE: Use Wagmi for wrap/unwrap
        if (inFrame) {
          console.log('📱 Frame mode: Using Wagmi for wrap/unwrap');
          
          // Ensure Wagmi connected
          if (!wagmiConnected) {
            const farcasterConnector = connectors.find(c => c.id === 'farcasterMiniApp');
            if (farcasterConnector) {
              connect({ connector: farcasterConnector });
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          // WETH contract ABI encoded function calls
          // deposit(): 0xd0e30db0 (no params, payable)
          // withdraw(uint256): 0x2e1a7d4d + encoded amount
          let txData: `0x${string}`;
          let txValue: bigint;
          
          if (isWrap) {
            // ETH -> WETH: deposit() with ETH value
            txData = '0xd0e30db0' as `0x${string}`;
            txValue = BigInt(amount.toString());
          } else {
            // WETH -> ETH: withdraw(amount) with 0 value
            const iface = new ethers.Interface(['function withdraw(uint256 wad)']);
            txData = iface.encodeFunctionData('withdraw', [amount]) as `0x${string}`;
            txValue = BigInt(0);
          }
          
          try {
            const hash = await sendTransactionAsync({
              to: WETH_ADDRESS as `0x${string}`,
              data: txData,
              value: txValue,
            });
            
            console.log(`✅ ${isWrap ? 'Wrap' : 'Unwrap'} tx sent:`, hash);
            setPendingTxHash(hash);
            
            toast({
              title: `${isWrap ? 'Wrap' : 'Unwrap'} Submitted!`,
              description: `Transaction sent. Waiting for confirmation...`,
            });
            
            // Wait for confirmation (up to 60 seconds)
            const BASE_RPC = 'https://mainnet.base.org';
            const rpcProvider = new ethers.JsonRpcProvider(BASE_RPC);
            
            let confirmed = false;
            for (let i = 0; i < 30; i++) {
              await new Promise(r => setTimeout(r, 2000));
              try {
                const receipt = await rpcProvider.getTransactionReceipt(hash);
                if (receipt && receipt.status === 1) {
                  confirmed = true;
                  break;
                }
              } catch (e) {
                console.log('Still waiting for confirmation...');
              }
            }
            
            if (confirmed) {
              toast({
                title: `${isWrap ? 'Wrap' : 'Unwrap'} Successful!`,
                description: `Converted ${fromAmount} ${isWrap ? 'ETH to WETH' : 'WETH to ETH'}`,
              });
            } else {
              toast({
                title: 'Transaction Pending',
                description: 'Check your wallet for transaction status.',
              });
            }
            
            setFromAmount('');
            setToAmount('');
            setQuote(null);
            setTimeout(() => refreshBalance(), 3000);
            return;
          } catch (err: any) {
            console.error('Frame wrap/unwrap error:', err);
            throw new Error(err?.message || 'Transaction failed');
          }
        }
        
        // 🖥️ DESKTOP MODE: Use ethers.js provider
        let provider = getProvider();
        
        // Fallback to window.ethereum if no provider
        if (!provider && typeof window !== 'undefined' && (window as any).ethereum) {
          try {
            // Request account access first
            await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
            provider = new ethers.BrowserProvider((window as any).ethereum);
          } catch (err) {
            console.error('Failed to connect to wallet:', err);
            throw new Error('Please connect your wallet first');
          }
        }
        
        if (!provider) throw new Error('No wallet provider available');
        
        let signer;
        try {
          signer = await provider.getSigner();
        } catch (signerErr: any) {
          console.error('Failed to get signer:', signerErr);
          // Try reconnecting
          if ((window as any).ethereum) {
            await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
            provider = new ethers.BrowserProvider((window as any).ethereum);
            signer = await provider.getSigner();
          } else {
            throw new Error('Please connect your wallet first');
          }
        }
        const wethContract = new ethers.Contract(
          WETH_ADDRESS,
          ['function deposit() payable', 'function withdraw(uint256 wad)'],
          signer
        );
        
        const tx = isWrap 
          ? await wethContract.deposit({ value: amount })
          : await wethContract.withdraw(amount);
        
        console.log(`✅ ${isWrap ? 'Wrap' : 'Unwrap'} tx sent:`, tx.hash);
        
        await tx.wait(1);
        console.log(`✅ ${isWrap ? 'Wrap' : 'Unwrap'} confirmed!`);
        
        toast({
          title: `${isWrap ? 'Wrap' : 'Unwrap'} Successful!`,
          description: `Converted ${fromAmount} ${isWrap ? 'ETH to WETH' : 'WETH to ETH'}`,
        });
        
        setFromAmount('');
        setToAmount('');
        setQuote(null);
        setTimeout(() => refreshBalance(), 2000);
        return;
      }
      
      // 🎯 FRAME MODE: Use Wagmi hooks for reliable Farcaster wallet transactions
      if (inFrame) {
        console.log('📱 FRAME MODE: Using Wagmi for Farcaster swap');
        
        // ✅ Ensure Wagmi is connected to Farcaster wallet
        if (!wagmiConnected) {
          console.log('🔄 Connecting Wagmi to Farcaster wallet...');
          try {
            const farcasterConnector = connectors.find(c => c.id === 'farcasterMiniApp');
            if (farcasterConnector) {
              connect({ connector: farcasterConnector });
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (err) {
            console.warn('Could not auto-connect Wagmi:', err);
          }
        }
        
        // ✅ Get 0x quote from backend
        const trimmedAmount = trimDecimals(fromAmount, fromToken.decimals);
        const sellAmount = ethers.parseUnits(trimmedAmount, fromToken.decimals).toString();
        
        const sellTokenAddress = fromToken.address === NATIVE_ETH.address 
          ? ZEROX_NATIVE_ETH_SENTINEL 
          : fromToken.address;
        
        const buyTokenAddress = toToken.address === NATIVE_ETH.address
          ? ZEROX_NATIVE_ETH_SENTINEL
          : toToken.address;
        
        // ✅ CRITICAL: Include takerAddress for transaction simulation
        const effectiveAddress = wagmiAddress || walletAddress;
        
        // ✅ Dynamic slippage based on token pair (Base chain optimized)
        const dynamicSlippage = calculateDynamicSlippage(fromToken, toToken);
        console.log('📊 Frame swap dynamic slippage:', dynamicSlippage, 'for', fromToken.symbol, '→', toToken.symbol);
        
        const params = new URLSearchParams({
          sellToken: sellTokenAddress,
          buyToken: buyTokenAddress,
          sellAmount: sellAmount,
          slippagePercentage: dynamicSlippage,
        });
        
        // ✅ FIX: Add taker address for proper simulation
        if (effectiveAddress) {
          params.append('takerAddress', effectiveAddress);
        }
        
        console.log('🌐 Fetching 0x quote for Frame swap...', { takerAddress: effectiveAddress, slippage: dynamicSlippage });
        const response = await fetch(`${window.location.origin}/api/swap-quote?${params.toString()}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('❌ Swap quote error:', errorData);
          
          let errorMsg = 'Failed to get swap quote';
          if (errorData.details) {
            const details = typeof errorData.details === 'string' ? errorData.details : JSON.stringify(errorData.details);
            console.error('Error details:', details);
            
            if (details.includes('INSUFFICIENT_ASSET_LIQUIDITY')) {
              errorMsg = 'Insufficient liquidity for this swap. Try a different token or smaller amount.';
            } else if (details.includes('VALIDATION_ERROR') || details.includes('sellAmount')) {
              errorMsg = `Swap amount too small. Minimum ~$1-5 USD required. Try increasing the amount.`;
            } else if (details.includes('balance')) {
              errorMsg = 'Insufficient balance for this swap.';
            } else {
              errorMsg = `Swap failed: ${details.substring(0, 100)}`;
            }
          }
          throw new Error(errorMsg);
        }
        
        const backendQuote = await response.json();
        console.log('✅ Got quote from backend:', backendQuote);
        
        // ✅ CRITICAL: Check for balance issues from 0x API
        if (backendQuote.issues?.balance) {
          const actualWei = BigInt(backendQuote.issues.balance.actual || '0');
          const expectedWei = BigInt(backendQuote.issues.balance.expected || '0');
          const actualEth = Number(actualWei) / 1e18;
          const expectedEth = Number(expectedWei) / 1e18;
          
          console.error('❌ 0x API Balance Issue:', {
            actual: actualEth.toFixed(6),
            expected: expectedEth.toFixed(6),
            shortfall: (expectedEth - actualEth).toFixed(6)
          });
          
          // Refresh balance to show correct amount
          refreshBalance();
          
          throw new Error(`Insufficient balance! Your actual ETH: ${actualEth.toFixed(4)}. Needed: ${expectedEth.toFixed(4)}. Please use MAX button or enter a smaller amount.`);
        }
        
        let transaction = backendQuote.transaction || backendQuote;
        
        if (!transaction.to || !transaction.data) {
          console.error('❌ Missing required transaction fields:', { to: transaction.to, data: !!transaction.data });
          throw new Error('Invalid swap quote received. Please try again.');
        }
        
        // ✅ CRITICAL FIX: Check and handle ERC-20 token approval for Frame mode
        // 0x API v2 uses Permit2 for ERC-20 swaps, which requires token approval
        const isNativeETH = fromToken.address.toLowerCase() === NATIVE_ETH.address.toLowerCase();
        const allowanceTarget = backendQuote.issues?.allowance?.spender || backendQuote.allowanceTarget;
        
        if (!isNativeETH && allowanceTarget) {
          console.log('🔷 Frame: Checking ERC-20 allowance for', fromToken.symbol);
          
          // Read current allowance from blockchain via RPC
          const BASE_RPC = 'https://mainnet.base.org';
          const rpcProvider = new ethers.JsonRpcProvider(BASE_RPC);
          const ERC20_ABI = [
            'function allowance(address owner, address spender) view returns (uint256)',
            'function approve(address spender, uint256 amount) returns (bool)'
          ];
          const tokenContract = new ethers.Contract(fromToken.address, ERC20_ABI, rpcProvider);
          
          const effectiveAddress = wagmiAddress || walletAddress;
          const currentAllowance = await tokenContract.allowance(effectiveAddress, allowanceTarget);
          const trimmedAmount = trimDecimals(fromAmount, fromToken.decimals);
          const requiredAmount = ethers.parseUnits(trimmedAmount, fromToken.decimals);
          
          console.log('🔷 Allowance check:', {
            current: currentAllowance.toString(),
            required: requiredAmount.toString(),
            needsApproval: currentAllowance < requiredAmount
          });
          
          if (currentAllowance < requiredAmount) {
            console.log('🔷 Frame: Requesting token approval for', fromToken.symbol);
            
            toast({
              title: 'Token Approval Required',
              description: `Approve ${fromToken.symbol} for swapping...`,
            });
            
            // Build approval transaction data
            const approveInterface = new ethers.Interface(ERC20_ABI);
            const approveData = approveInterface.encodeFunctionData('approve', [
              allowanceTarget,
              ethers.MaxUint256 // Unlimited approval
            ]);
            
            try {
              // Send approval transaction via Wagmi
              const approveTxHash = await sendTransactionAsync({
                to: fromToken.address as `0x${string}`,
                data: approveData as `0x${string}`,
                value: BigInt(0),
              });
              
              console.log('✅ Approval transaction sent:', approveTxHash);
              
              toast({
                title: 'Approval Submitted',
                description: 'Waiting for confirmation...',
              });
              
              // Wait for approval confirmation (poll for receipt)
              let confirmed = false;
              let attempts = 0;
              const maxAttempts = 30; // 30 seconds max wait
              
              while (!confirmed && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                try {
                  const receipt = await rpcProvider.getTransactionReceipt(approveTxHash);
                  if (receipt && receipt.status === 1) {
                    confirmed = true;
                    console.log('✅ Approval confirmed!');
                  } else if (receipt && receipt.status === 0) {
                    throw new Error('Approval transaction failed');
                  }
                } catch (e) {
                  // Receipt not found yet, continue waiting
                }
                attempts++;
              }
              
              if (!confirmed) {
                throw new Error('Approval confirmation timed out. Please try again.');
              }
              
              toast({
                title: 'Approval Confirmed!',
                description: 'Fetching fresh swap quote...',
              });
              
              // ✅ CRITICAL FIX: After approval, fetch a FRESH quote!
              // The original quote may have expired during the approval wait time
              console.log('🔄 Fetching fresh quote after approval...');
              
              const freshParams = new URLSearchParams({
                sellToken: sellTokenAddress,
                buyToken: buyTokenAddress,
                sellAmount: sellAmount,
                slippagePercentage: dynamicSlippage, // ✅ Use same dynamic slippage
              });
              
              if (effectiveAddress) {
                freshParams.append('takerAddress', effectiveAddress);
              }
              
              const freshResponse = await fetch(`${window.location.origin}/api/swap-quote?${freshParams.toString()}`);
              
              if (!freshResponse.ok) {
                const errorData = await freshResponse.json();
                throw new Error(`Failed to get fresh quote after approval: ${errorData.error || 'Unknown error'}`);
              }
              
              const freshQuote = await freshResponse.json();
              console.log('✅ Fresh quote received after approval');
              
              // Update transaction with fresh quote
              const freshTransaction = freshQuote.transaction || freshQuote;
              transaction.to = freshTransaction.to;
              transaction.data = freshTransaction.data;
              transaction.value = freshTransaction.value;
              
            } catch (approveError: any) {
              console.error('❌ Approval error:', approveError);
              if (approveError?.message?.includes('rejected') || approveError?.message?.includes('denied')) {
                throw new Error('Approval was rejected. Please approve to continue.');
              }
              throw new Error(`Approval failed: ${approveError?.message || 'Unknown error'}`);
            }
          } else {
            console.log('✅ Sufficient allowance exists, proceeding with swap');
          }
        }
        
        // ✅ WAGMI FIX: Convert value to BigInt for Wagmi/Viem
        const rawValue = transaction.value || '0';
        let valueBigInt: bigint;
        if (typeof rawValue === 'string' && rawValue.startsWith('0x')) {
          valueBigInt = BigInt(rawValue);
        } else {
          valueBigInt = BigInt(rawValue);
        }
        
        console.log('🔷 Wagmi transaction params:', {
          to: transaction.to,
          value: valueBigInt.toString(),
          dataLength: transaction.data?.length,
          dataPrefix: transaction.data?.substring(0, 20),
          fromToken: fromToken.symbol,
          toToken: toToken.symbol,
        });
        
        toast({
          title: 'Sending Transaction',
          description: 'Confirm the swap in your Farcaster wallet...',
        });
        
        // ✅ Use Wagmi sendTransactionAsync for reliable Farcaster transactions
        try {
          const txHash = await sendTransactionAsync({
            to: transaction.to as `0x${string}`,
            data: transaction.data as `0x${string}`,
            value: valueBigInt,
          });
          
          console.log('✅ Transaction sent via Wagmi:', txHash);
          setPendingTxHash(txHash);
          
          toast({
            title: 'Transaction Sent',
            description: `Waiting for confirmation: ${txHash.substring(0, 10)}...`,
          });
          
          // ✅ CRITICAL FIX: Wait for transaction to be confirmed on blockchain
          // Don't show "Swap Successful" until we verify it actually succeeded
          const BASE_RPC = 'https://mainnet.base.org';
          const rpcProvider = new ethers.JsonRpcProvider(BASE_RPC);
          
          let confirmed = false;
          let attempts = 0;
          const maxAttempts = 60; // 60 seconds max wait
          
          console.log('⏳ Waiting for transaction confirmation...');
          
          while (!confirmed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
              const receipt = await rpcProvider.getTransactionReceipt(txHash);
              if (receipt) {
                if (receipt.status === 1) {
                  confirmed = true;
                  console.log('✅ Transaction confirmed successfully!', receipt);
                  
                  toast({
                    title: 'Swap Successful!',
                    description: `Swapped ${fromToken.symbol} for ${toToken.symbol}. TX: ${txHash.substring(0, 10)}...`,
                  });
                  
                  setFromAmount('');
                  setToAmount('');
                  setQuote(null);
                  
                  // Refresh balance after successful swap
                  setTimeout(() => {
                    refreshBalance();
                  }, 2000);
                  
                } else if (receipt.status === 0) {
                  // Transaction REVERTED on chain
                  console.error('❌ Transaction reverted on chain!', receipt);
                  throw new Error('Transaction failed on blockchain. The swap was reverted. Please try again with a smaller amount or different token.');
                }
              }
            } catch (receiptError: any) {
              // Receipt not found yet, continue waiting (unless it's our custom error)
              if (receiptError.message?.includes('reverted') || receiptError.message?.includes('failed')) {
                throw receiptError;
              }
              console.log(`⏳ Attempt ${attempts + 1}/${maxAttempts}: Receipt not found yet...`);
            }
            attempts++;
          }
          
          if (!confirmed) {
            console.warn('⚠️ Transaction confirmation timed out - check basescan manually');
            toast({
              title: 'Transaction Pending',
              description: `Check basescan.org for TX: ${txHash}`,
              variant: 'destructive',
            });
          }
          
          return;
        } catch (wagmiError: any) {
          console.error('❌ Wagmi sendTransaction error:', {
            error: wagmiError,
            message: wagmiError?.message,
            cause: wagmiError?.cause,
            shortMessage: wagmiError?.shortMessage,
          });
          
          const errorMsg = wagmiError?.message || wagmiError?.shortMessage || JSON.stringify(wagmiError);
          const errorLower = errorMsg.toLowerCase();
          
          // Handle specific error cases
          if (errorLower.includes('rejected') || errorLower.includes('denied') || errorLower.includes('user rejected')) {
            throw new Error('Transaction was rejected by wallet.');
          } else if (errorLower.includes('simulation failed') || errorLower.includes('insufficient') || errorLower.includes('balance')) {
            throw new Error('Insufficient ETH balance. You need more ETH for this swap + gas fees.');
          } else if (errorLower.includes('gas')) {
            throw new Error('Not enough ETH for gas fees. Please add more ETH to your wallet.');
          }
          throw new Error(`Wallet error: ${errorMsg.substring(0, 150)}`);
        }
      }
      
      // 🖥️ DESKTOP MODE: Standard Web3 transaction flow
      console.log('🖥️ DESKTOP MODE: Using browser wallet (MetaMask, etc)');
      let provider = getProvider();
      
      // Try window.ethereum if no provider
      if (!provider && typeof window !== 'undefined' && (window as any).ethereum) {
        try {
          await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
          provider = new ethers.BrowserProvider((window as any).ethereum);
        } catch (err) {
          console.error('Failed to connect wallet:', err);
          throw new Error('Please connect your wallet first');
        }
      }
      
      if (!provider) {
        console.error('❌ Provider is null');
        throw new Error('Wallet provider not available. Please reconnect your wallet.');
      }
      console.log('✅ Desktop provider obtained');

      // 🌐 DESKTOP-ONLY SWAP FLOW (Frame uses SDK above)
      console.log('1️⃣ Desktop provider ready, getting signer...');
      let signer;
      try {
        signer = await provider.getSigner();
      } catch (signerErr: any) {
        console.error('Failed to get signer:', signerErr);
        // Try reconnecting
        if ((window as any).ethereum) {
          await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
          provider = new ethers.BrowserProvider((window as any).ethereum);
          signer = await provider.getSigner();
        } else {
          throw new Error('Please connect your wallet first');
        }
      }
      const userAddress = await signer.getAddress();
      console.log('✅ Signer obtained:', userAddress);

      // 🌟 0x API v2 uses nested transaction object
      const transaction = quote.transaction || quote;
      const allowanceTarget = quote.issues?.allowance?.spender || quote.allowanceTarget;

      // Check if we need to approve ERC20
      if (fromToken.address !== NATIVE_ETH.address && allowanceTarget) {
        console.log('3️⃣ Checking ERC20 allowance...');
        const tokenContract = new ethers.Contract(
          fromToken.address,
          ['function allowance(address owner, address spender) view returns (uint256)', 'function approve(address spender, uint256 amount) returns (bool)'],
          signer
        );

        const allowance = await tokenContract.allowance(
          walletAddress,
          allowanceTarget
        );

        const trimmedAmount = trimDecimals(fromAmount, fromToken.decimals);
        const sellAmount = ethers.parseUnits(trimmedAmount, fromToken.decimals);
        console.log('Allowance:', allowance.toString(), 'Required:', sellAmount.toString());

        if (allowance < sellAmount) {
          console.log('4️⃣ Approving token...');
          const approveTx = await tokenContract.approve(
            allowanceTarget,
            ethers.MaxUint256
          );
          
          toast({
            title: 'Approving Token',
            description: 'Waiting for approval confirmation...',
          });

          // ✅ Wait for approval confirmation (desktop mode only)
          await approveTx.wait(1); // Fast confirmation (1 block ~2s on Base)
          console.log('✅ Token approved');
        } else {
          console.log('✅ Allowance sufficient, skipping approval');
        }
      }

      // Execute swap
      console.log('5️⃣ Preparing swap transaction...');
      
      // ✅ ARCHITECT FIX: Always trust 0x API transaction.value!
      // When we send WETH address: 0x returns Permit2 calldata (value=0)
      // When we send native ETH sentinel (0xEeee...): 0x returns native ETH path (value=sellAmount)
      // Both paths are handled correctly by just using the API's transaction.value
      
      const txParams: any = {
        to: transaction.to,
        data: transaction.data,
        value: transaction.value || '0', // Trust 0x API value (handles both WETH and native ETH)
      };

      // ✅ CRITICAL: Use gas from 0x API directly (prevents estimateGas revert!)
      const gasFromQuote = transaction.gas || quote.gas;
      if (gasFromQuote) {
        console.log('✅ Using 0x API gas estimate:', gasFromQuote);
        txParams.gasLimit = gasFromQuote;
      } else {
        // Only fallback if 0x didn't provide gas
        console.warn('⚠️ No gas from 0x, using conservative default');
        txParams.gasLimit = BigInt(1000000); // Higher default for complex swaps
      }

      // ✅ Use gas price from 0x if available
      if (transaction.gasPrice || quote.gasPrice) {
        txParams.gasPrice = transaction.gasPrice || quote.gasPrice;
        console.log('✅ Using 0x gas price:', txParams.gasPrice);
      }

      console.log('Transaction params:', {
        to: txParams.to,
        value: txParams.value,
        gasLimit: txParams.gasLimit?.toString(),
        gasPrice: txParams.gasPrice?.toString(),
        dataLength: txParams.data?.length
      });

      console.log('6️⃣ Sending transaction...');

      const tx = await signer.sendTransaction(txParams);
      console.log('✅ Transaction sent:', tx.hash);

      toast({
        title: 'Swap Submitted',
        description: inFrame 
          ? `Transaction sent! Hash: ${tx.hash.slice(0, 10)}...`
          : 'Waiting for confirmation...',
      });

      // ✅ FRAME FIX: Skip tx.wait() in Frame mode!
      // Farcaster Frame SDK provider doesn't support eth_getTransactionReceipt
      // Desktop wallets (MetaMask/Rabby) support it, so we can wait for confirmation
      if (!inFrame) {
        console.log('🖥️ Desktop mode: Waiting for transaction confirmation...');
        await tx.wait(1); // Fast confirmation (1 block ~2s on Base)
        console.log('✅ Transaction confirmed on-chain');
      } else {
        console.log('📱 Frame mode: Skipping tx.wait() (provider limitation)');
      }

      toast({
        title: 'Swap Successful',
        description: inFrame 
          ? `Swap submitted successfully! Check your wallet for ${toToken.symbol}.`
          : `Swapped ${fromAmount} ${fromToken.symbol} for ${toAmount} ${toToken.symbol}`,
      });

      // Reset form
      setFromAmount('');
      setToAmount('');
      setQuote(null);

      // ✅ REFRESH BALANCES after successful swap!
      // This ensures USDC and other token balances appear after swap
      // Wait longer in Frame mode since tx might not be confirmed yet
      setTimeout(async () => {
        try {
          console.log('🔄 Refreshing balances after swap...');
          const [from, to] = await Promise.all([
            fetchBalance(fromToken),
            fetchBalance(toToken),
          ]);
          setFromBalance(from);
          setToBalance(to);
          console.log('✅ Balances refreshed after swap:', { 
            from: `${from} ${fromToken.symbol}`, 
            to: `${to} ${toToken.symbol}` 
          });
        } catch (error) {
          console.error('Failed to refresh balances after swap:', error);
        }
      }, inFrame ? 3000 : 2000); // Wait 3s in Frame (tx not confirmed), 2s in Desktop
    } catch (error: any) {
      console.error('Swap error:', error);
      
      let errorMessage = 'Transaction failed. Please try again.';
      let errorTitle = 'Swap Failed';
      
      if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
        errorMessage = 'Transaction rejected by user.';
      } else if (error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for transaction.';
      } else if (
        error.message?.includes('missing revert data') ||
        error.message?.includes('estimateGas') ||
        error.message?.includes('UNPREDICTABLE_GAS_LIMIT') ||
        error.code === 'UNPREDICTABLE_GAS_LIMIT'
      ) {
        errorTitle = 'Instant Swap Not Available';
        errorMessage = `This token cannot be instantly swapped (low liquidity or contract issue). Try using Limit Orders instead - they work for any token!`;
      } else if (error.message?.includes('gas')) {
        errorMessage = 'Gas estimation failed. Try adjusting the amount or use Limit Orders.';
      } else if (error.message?.includes('RPC')) {
        errorMessage = 'RPC connection failed. Please check your wallet settings.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSwapping(false);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <Card className="p-3 sm:p-4 md:p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="text-lg sm:text-xl md:text-2xl font-bold">Instant Swap</h3>
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" data-testid="button-swap-settings">
                <Settings2 className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Swap Settings</DialogTitle>
                <DialogDescription>
                  Customize your swap preferences
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="slippage">Slippage Tolerance (%)</Label>
                  <Input
                    id="slippage"
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="50"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    data-testid="input-slippage"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Your transaction will revert if price changes unfavorably by more than this percentage.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Modern Dual-Card Layout */}
        {!fromToken || !toToken ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
            <span className="text-muted-foreground">Loading tokens...</span>
          </div>
        ) : (
          <>
            {/* FROM Card */}
            <TradeCard
              role="from"
              label="You Pay"
              token={fromToken}
              logoUrl={getProxiedImageUrl(fromToken.logoURI)}
              amount={fromAmount}
              balance={formatBalance(fromBalance, fromToken.symbol)}
              isLoading={isLoadingBalances}
              showQuickAmounts={parseFloat(fromBalance || '0') > 0}
              onTokenClick={() => openTokenDialog('from')}
              onAmountChange={setFromAmount}
              onMaxClick={() => setFromAmount(fromBalance)}
            />

            {/* Swap Toggle Button */}
            <div className="flex justify-center -my-2 sm:-my-3 z-10 relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSwapTokens}
                className="rounded-full h-8 w-8 sm:h-10 sm:w-10 border-2 border-muted bg-background hover-elevate active-elevate-2"
                data-testid="button-swap-direction"
              >
                <ArrowDown className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>

            {/* TO Card */}
            <TradeCard
              role="to"
              label="You Receive"
              token={toToken}
              logoUrl={getProxiedImageUrl(toToken.logoURI)}
              amount={toAmount}
              balance={formatBalance(toBalance, toToken.symbol)}
              isLoading={isLoadingQuote || isLoadingBalances}
              showMaxButton={false}
              readOnly
              onTokenClick={() => openTokenDialog('to')}
              onAmountChange={() => {}}
            />
          </>
        )}

        {/* Quote Info or Wallet Prompt */}
        {!isWalletConnected && fromAmount && parseFloat(fromAmount) > 0 ? (
          <div className="mt-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs sm:text-sm font-medium text-primary">Connect Wallet for Live Quotes</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                  Connect your wallet to see real-time swap quotes
                </p>
              </div>
            </div>
          </div>
        ) : quote && fromToken && toToken && fromAmount && toAmount && 
             parseFloat(fromAmount) > 0 && parseFloat(toAmount) > 0 && (
          <div className="mt-3 p-2.5 sm:p-3 bg-muted rounded-lg space-y-1.5">
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Rate</span>
              <span data-testid="text-swap-rate" className="font-medium">
                1 {fromToken.symbol} = {(parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(6)} {toToken.symbol}
              </span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Estimated Gas</span>
              <span data-testid="text-estimated-gas">
                {(() => {
                  const gasEstimate = quote.gas || quote.estimatedGas;
                  if (!gasEstimate || isNaN(Number(gasEstimate))) {
                    return 'N/A';
                  }
                  return `${(Number(gasEstimate) / 1e9).toFixed(9)} ETH`;
                })()}
              </span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Slippage</span>
              <span data-testid="text-slippage">
                {(parseFloat(calculateDynamicSlippage(fromToken, toToken)) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        )}

        {/* Swap Button */}
        <Button
          className="w-full mt-4 h-10 sm:h-11 text-sm sm:text-base"
          onClick={handleSwap}
          disabled={!fromAmount || !toAmount || isLoadingQuote || isSwapping}
          data-testid="button-execute-swap"
        >
          {isSwapping ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Swapping...
            </>
          ) : isLoadingQuote ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Getting Quote...
            </>
          ) : !isWalletConnected ? (
            'Connect Wallet'
          ) : fromToken && toToken ? (
            `Swap ${fromToken.symbol} for ${toToken.symbol}`
          ) : (
            'Select Tokens'
          )}
        </Button>

        {/* Warning - More compact */}
        <div className="mt-3 flex items-start gap-1.5 text-[10px] sm:text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 mt-0.5 flex-shrink-0" />
          <p>
            Prices are estimated. Always review before confirming.
          </p>
        </div>
      </Card>

      {/* Token Picker Dialog (Shared for FROM/TO) */}
      <Dialog open={isTokenDialogOpen} onOpenChange={setIsTokenDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[85vh] overflow-hidden left-1/2 -translate-x-1/2">
          <DialogHeader>
            <DialogTitle>Select a Token</DialogTitle>
          </DialogHeader>
          
          {/* Search Input - Auto-resolves contract addresses */}
          <div className="px-1 space-y-1">
            <Input
              type="text"
              placeholder="Search by name, symbol or address..."
              value={tokenSearchQuery}
              onChange={(e) => setTokenSearchQuery(e.target.value)}
              className="h-10"
              data-testid="input-token-search"
              autoFocus
            />
            {isResolvingToken && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Resolving token...
              </p>
            )}
          </div>

          {/* Token List */}
          <ScrollArea className="h-[50vh] sm:h-[400px] px-1 mt-2">
            {!allTokens ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading tokens...
              </div>
            ) : filteredTokens.length > 0 ? (
              <div className="space-y-1">
                {filteredTokens.map((token) => {
                  // Check if this is the resolved token (auto-imported)
                  const isResolved = resolvedToken?.address.toLowerCase() === token.address.toLowerCase();
                  const price = isResolved ? resolvedTokenPrice : null;
                  
                  return (
                    <button
                      key={token.address}
                      onClick={() => handleTokenSelect(token)}
                      className="w-full flex items-center gap-3 p-3 rounded-md hover-elevate active-elevate-2 text-left"
                      data-testid={`button-select-token-${token.symbol}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={getProxiedImageUrl(token.logoURI)} alt={token.symbol} />
                        <AvatarFallback>{token.symbol?.[0] || '?'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold">{token.symbol}</div>
                        <div className="text-xs text-muted-foreground truncate">{token.name}</div>
                      </div>
                      {price !== null && (
                        <div className="text-xs text-muted-foreground">
                          ${price.toFixed(6)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <p className="text-sm">No tokens found</p>
                <p className="text-xs mt-1">Try a different search term</p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
