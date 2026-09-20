import { useState, useEffect, useRef, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { X, Target, Loader2, Zap, Info, ChevronDown, ArrowDown } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/contexts/WalletContext';
import { ethers } from 'ethers';
import type { LimitOrder, User } from '@shared/schema';
import { TokenPriceDisplay } from '@/components/TokenPriceDisplay';
import { useTokenPrice } from '@/hooks/useTokenPrice';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useZeroXLimitOrder } from '@/hooks/useZeroXLimitOrder';
import { TokenSelector } from '@/components/TokenSelector';
import { TradeCard } from '@/components/TradeCard';
import { useTokenList } from '@/hooks/useTokenList';
import type { Token } from '@/lib/tokens';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// ExecutorVault addresses (Base mainnet)
const EXECUTOR_VAULT_V1_ADDRESS = "0xC9c0f3596843Babc2F45837c88864B7c98191121";
const EXECUTOR_VAULT_V2_ADDRESS = "0x830C397739485065513f94a3284ebd54aE638806";
const EXECUTOR_VAULT_V3_ADDRESS = "0x3905022308C9BdE5581078Ca4A9e413b608F764e";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

interface LimitOrdersPanelProps {
  onTokenChange?: (token: Token | null) => void;
}

export function LimitOrdersPanel({ onTokenChange }: LimitOrdersPanelProps) {
  const { walletAddress, isWalletConnected, connectWallet, getProvider } = useWallet();
  const { toast } = useToast();
  const { createAndSubmitOrder, isCreating } = useZeroXLimitOrder();
  
  // Token list (2000+ Base tokens)
  const { data: allTokens } = useTokenList();
  
  // Selected token state
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [targetPrice, setTargetPrice] = useState('');
  const [ethAmount, setEthAmount] = useState(''); // For buy: ETH spending, for sell: token amount
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<string>('0'); // User's token balance for SELL orders
  const [wethBalance, setWethBalance] = useState<string>('0'); // User's WETH balance
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false); // Token picker dialog
  const [tokenSearchQuery, setTokenSearchQuery] = useState(''); // Search query for token picker
  // Always use V3 vault (universal auto-withdrawal for all tokens)
  const vaultVersion: 'v1' | 'v2' | 'v3' = 'v3';
  const [tokenRiskLevel, setTokenRiskLevel] = useState<'approved' | 'guarded' | 'blocked' | null>(null);
  const [tokenRiskWarnings, setTokenRiskWarnings] = useState<string[]>([]);
  
  // Track the current address to prevent race conditions
  const currentAddressRef = useRef(selectedToken?.address || '');
  
  // Track previous ready orders count to prevent duplicate toasts
  const previousReadyCountRef = useRef(0);
  
  // Auto-import token from contract address
  const [resolvedToken, setResolvedToken] = useState<Token | null>(null);
  const [resolvedTokenPrice, setResolvedTokenPrice] = useState<number | null>(null);
  const [isResolvingToken, setIsResolvingToken] = useState(false);
  
  // Derived values from selected token
  const tokenAddress = selectedToken?.address || '';
  const tokenSymbol = selectedToken?.symbol || '';
  const tokenName = selectedToken?.name || '';
  const tokenDecimals = selectedToken?.decimals || 18;
  
  // Track if handleSelectToken is currently running (prevent overlaps)
  const isFetchingRef = useRef(false);
  
  // Handle token selection from TokenSelector (function declaration for hoisting)
  async function handleSelectToken(token: Token) {
    // Guard against concurrent calls
    if (isFetchingRef.current) {
      console.log('Token selection already in progress, skipping...');
      return;
    }
    
    // Set selectedToken FIRST (preserve it even if fetch fails)
    setSelectedToken(token);
    
    // Notify parent component of token change
    if (onTokenChange) {
      onTokenChange(token);
    }
    
    setIsFetchingToken(true);
    isFetchingRef.current = true;
    
    // Clear previous risk state
    setTokenRiskLevel(null);
    setTokenRiskWarnings([]);
    setTokenBalance('0');
    
    try {
      // Fetch token risk score
      const riskResponse = await fetch(`/api/tokens/resolve/${token.address}`);
      if (riskResponse.ok) {
        const riskData = await riskResponse.json();
        setTokenRiskLevel(riskData.riskLevel || 'approved');
        setTokenRiskWarnings(riskData.warnings || []);
      } else {
        // Risk fetch failed - set default approved (token still usable)
        setTokenRiskLevel('approved');
        console.warn('Risk fetch failed, defaulting to approved');
      }
      
      // For SELL orders: fetch token balance using direct RPC (works in Frame)
      if (orderType === 'sell' && isWalletConnected && walletAddress) {
        try {
          const rpcProvider = new ethers.JsonRpcProvider("https://mainnet.base.org");
          const erc20Abi = ['function balanceOf(address owner) view returns (uint256)'];
          const tokenContract = new ethers.Contract(token.address, erc20Abi, rpcProvider);
          const balance = await tokenContract.balanceOf(walletAddress);
          const formatted = ethers.formatUnits(balance, token.decimals);
          console.log(`💰 Token Balance: ${formatted} ${token.symbol} for ${walletAddress.slice(0, 8)}...`);
          setTokenBalance(formatted);
        } catch (balanceError) {
          console.error('Error fetching token balance:', balanceError);
          setTokenBalance('0');
        }
      }
    } catch (error) {
      console.error('Error fetching token data:', error);
      // Don't clear selectedToken on error - keep it usable
      setTokenRiskLevel('approved'); // Default to approved
      toast({
        variant: 'destructive',
        title: 'Error loading token data',
        description: 'Some token details could not be loaded, but you can still trade.',
      });
    } finally {
      setIsFetchingToken(false);
      isFetchingRef.current = false;
    }
  };

  // Fetch ETH/USD price for calculations
  const { data: ethPriceData } = useQuery<{ price: number }>({
    queryKey: ['/api/eth-price'],
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000, // Consider data stale after 30s
  });

  const ethPrice = ethPriceData?.price || 0;

  // Fetch live token price for comparison
  const { data: livePrice } = useTokenPrice(tokenAddress, tokenAddress.length === 42);
  
  // ✅ Use direct RPC for read-only balance calls (works in Farcaster Frame)
  const BASE_RPC = "https://mainnet.base.org";
  
  // Fetch WETH balance for BUY orders - Using RPC directly for reliability
  useEffect(() => {
    async function fetchWETHBalance() {
      if (!walletAddress || !isWalletConnected) {
        setWethBalance('0');
        return;
      }
      
      try {
        // ✅ Use direct RPC provider for read-only calls (more reliable in Frame)
        const rpcProvider = new ethers.JsonRpcProvider(BASE_RPC);
        const erc20Abi = ['function balanceOf(address owner) view returns (uint256)'];
        const wethContract = new ethers.Contract(WETH_ADDRESS, erc20Abi, rpcProvider);
        const balance = await wethContract.balanceOf(walletAddress);
        const formatted = ethers.formatEther(balance);
        console.log(`💰 WETH Balance: ${formatted} for ${walletAddress.slice(0, 8)}...`);
        setWethBalance(formatted);
      } catch (error) {
        console.error('Error fetching WETH balance:', error);
        setWethBalance('0');
      }
    }
    
    fetchWETHBalance();
  }, [walletAddress, isWalletConnected]);

  // Set default token (USDC) when token list loads AND fetch its data
  useEffect(() => {
    if (allTokens && allTokens.length > 0 && !selectedToken) {
      const defaultToken = allTokens.find(t => t.symbol === 'USDC') || allTokens[0];
      // handleSelectToken will set selectedToken + fetch risk/balance
      handleSelectToken(defaultToken);
    }
  }, [allTokens]);

  // Reset search query when dialog closes
  useEffect(() => {
    if (!isTokenDialogOpen) {
      setTokenSearchQuery('');
    }
  }, [isTokenDialogOpen]);
  
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

  // Calculate what user will receive (BUY: tokens, SELL: WETH)
  const calculatedReceiveAmount = (() => {
    if (!ethAmount || !targetPrice || !ethPrice) return '0';
    const amount = parseFloat(ethAmount);
    const usdPerToken = parseFloat(targetPrice);
    const usdPerEth = ethPrice;
    
    // Guard against invalid inputs
    if (amount <= 0 || usdPerToken <= 0 || usdPerEth <= 0) return '0';
    
    let receiveQty: number;
    
    if (orderType === 'buy') {
      // BUY: Spending ETH → Receiving TOKENS
      // amount is ETH, calculate tokens
      receiveQty = (amount * usdPerEth) / usdPerToken;
    } else {
      // SELL: Selling TOKENS → Receiving WETH
      // amount is tokens, calculate WETH
      receiveQty = (amount * usdPerToken) / usdPerEth;
    }
    
    // Guard against non-finite results (Infinity, NaN)
    if (!isFinite(receiveQty)) return '0';
    
    // Use toFixed(30) to avoid scientific notation, then trim trailing zeros
    return receiveQty.toFixed(30).replace(/\.?0+$/, '');
  })();

  const { data: userData } = useQuery<User>({
    queryKey: ['/api/users', walletAddress],
    queryFn: async () => {
      const response = await fetch(`/api/users?walletAddress=${walletAddress}`);
      if (!response.ok) {
        throw new Error('User not found');
      }
      return response.json();
    },
    enabled: !!walletAddress,
  });

  const userId = userData?.id;

  const { data: orders = [], isLoading } = useQuery<LimitOrder[]>({
    queryKey: ['/api/limit-orders/user', userId],
    enabled: !!userId,
    refetchInterval: 30000, // Poll every 30s to catch backend-failed orders
    staleTime: 15000, // Consider data fresh for 15s
    refetchOnWindowFocus: true, // Refresh when user returns to tab
  });

  // Poll for ready to execute orders
  const { data: readyOrders = [] } = useQuery<LimitOrder[]>({
    queryKey: ['/api/limit-orders/ready', userId],
    enabled: !!userId,
    refetchInterval: 15000, // Poll every 15 seconds
  });

  // V3 orders are auto-executed by backend - no need to show ready toast
  // Keep tracking for backward compatibility with V1 orders only
  useEffect(() => {
    previousReadyCountRef.current = readyOrders.length;
  }, [readyOrders.length]);


  // Withdraw funds from failed/cancelled orders (BUY: WETH, SELL: token)
  const handleWithdrawFailedOrder = async (order: LimitOrder) => {
    if (!window.ethereum || !walletAddress) {
      toast({
        variant: "destructive",
        title: "Wallet not connected",
        description: "Please connect your wallet to withdraw funds",
      });
      return;
    }

    if (!order.makerAmount) {
      toast({
        variant: "destructive",
        title: "No funds to withdraw",
        description: "This order has no deposited funds",
      });
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      
      // Request wallet access first
      let signer;
      try {
        await provider.send('eth_requestAccounts', []);
        signer = await provider.getSigner();
      } catch (signerError: any) {
        const errorMessage = signerError?.message || '';
        if (errorMessage.includes('not been authorized') || 
            errorMessage.includes('User rejected') ||
            signerError?.code === 4001 || signerError?.code === 4100) {
          toast({
            variant: "destructive",
            title: "Wallet not authorized",
            description: "Please authorize this site in your wallet extension",
          });
          return;
        }
        throw signerError;
      }
      
      // Select vault based on order version (V1/V2/V3)
      const EXECUTOR_VAULT_ADDRESS = order.vaultVersion === 'v3'
        ? EXECUTOR_VAULT_V3_ADDRESS
        : order.vaultVersion === 'v1'
        ? EXECUTOR_VAULT_V1_ADDRESS
        : EXECUTOR_VAULT_V2_ADDRESS;
      
      // Determine which token to withdraw
      // BUY orders: withdraw WETH (makerToken)
      // SELL orders: withdraw the token being sold (use makerToken field)
      const tokenToWithdraw = order.orderType === 'buy' 
        ? WETH_ADDRESS 
        : (order.makerToken || order.tokenAddress);
      
      const tokenSymbol = order.orderType === 'buy' ? 'WETH' : order.tokenSymbol;
      
      // Validation: Ensure token address is valid
      if (!tokenToWithdraw || tokenToWithdraw.length !== 42 || !tokenToWithdraw.startsWith('0x')) {
        toast({
          variant: "destructive",
          title: "Invalid token address",
          description: "Cannot withdraw - token address is missing or invalid",
        });
        return;
      }
      
      // Convert makerAmount from string to BigInt
      // API returns integer strings (no scientific notation)
      let orderAmountBigInt: bigint;
      try {
        const amountString = order.makerAmount.trim();
        
        // Validate it's a pure integer string (no decimals, no scientific notation)
        if (!/^[0-9]+$/.test(amountString)) {
          throw new Error('Amount must be a valid integer string');
        }
        
        orderAmountBigInt = BigInt(amountString);
      } catch (e) {
        console.error('makerAmount conversion error:', e, 'value:', order.makerAmount);
        toast({
          variant: "destructive",
          title: "Invalid order amount",
          description: "Cannot withdraw - order data is corrupted. Please contact support.",
        });
        return;
      }
      
      const VAULT_ABI = [
        "function withdraw(address token, uint256 amount) external",
        "function balances(address user, address token) external view returns (uint256)",
      ];

      const vaultContract = new ethers.Contract(EXECUTOR_VAULT_ADDRESS, VAULT_ABI, signer);
      
      // Check actual vault balance before withdrawal
      const vaultBalance = await vaultContract.balances(walletAddress, tokenToWithdraw);
      
      if (vaultBalance === BigInt(0)) {
        toast({
          variant: "destructive",
          title: `No ${tokenSymbol} in vault`,
          description: `Your vault balance is empty. ${tokenSymbol} may have been withdrawn already or used by another order.`,
        });
        return;
      }
      
      // Withdraw minimum of (order amount, vault balance) to avoid revert
      const withdrawAmount = vaultBalance < orderAmountBigInt 
        ? vaultBalance 
        : orderAmountBigInt;

      toast({
        title: `Withdrawing ${tokenSymbol} from Vault`,
        description: `Withdrawing ${ethers.formatEther(withdrawAmount)} ${tokenSymbol}... (${order.vaultVersion || 'v2'} vault)`,
      });

      const withdrawTx = await vaultContract.withdraw(tokenToWithdraw, withdrawAmount);
      
      toast({
        title: 'Withdrawal submitted',
        description: `Transaction: ${withdrawTx.hash.slice(0, 10)}...`,
      });
      
      await withdrawTx.wait();

      toast({
        title: 'Withdrawal successful!',
        description: `${ethers.formatEther(withdrawAmount)} ${tokenSymbol} returned to your wallet`,
      });

      // Refresh balances and orders
      queryClient.invalidateQueries({ queryKey: ['/api/vault-balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/weth-balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/limit-orders/user', userId] });
      
    } catch (error: any) {
      console.error('Withdrawal error:', error);
      toast({
        variant: "destructive",
        title: "Withdrawal failed",
        description: error.message || `Failed to withdraw ${order.orderType === 'buy' ? 'WETH' : order.tokenSymbol} from vault`,
      });
    }
  };

  // Withdraw tokens from filled orders (V1 only - V2/V3 auto-withdraw)
  const handleWithdrawFilledOrder = async (order: LimitOrder) => {
    if (!window.ethereum || !walletAddress) {
      toast({
        variant: "destructive",
        title: "Wallet not connected",
        description: "Please connect your wallet",
      });
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      
      // Request wallet access first
      let signer;
      try {
        await provider.send('eth_requestAccounts', []);
        signer = await provider.getSigner();
      } catch (signerError: any) {
        const errorMessage = signerError?.message || '';
        if (errorMessage.includes('not been authorized') || 
            errorMessage.includes('User rejected') ||
            signerError?.code === 4001 || signerError?.code === 4100) {
          toast({
            variant: "destructive",
            title: "Wallet not authorized",
            description: "Please authorize this site in your wallet extension",
          });
          return;
        }
        throw signerError;
      }
      
      // Select vault based on order version (V1/V2/V3)
      const EXECUTOR_VAULT_ADDRESS = order.vaultVersion === 'v3'
        ? EXECUTOR_VAULT_V3_ADDRESS
        : order.vaultVersion === 'v1'
        ? EXECUTOR_VAULT_V1_ADDRESS
        : EXECUTOR_VAULT_V2_ADDRESS;
      
      const tokenAddress = order.orderType === 'buy' ? order.tokenAddress : WETH_ADDRESS;
      const tokenSymbol = order.orderType === 'buy' ? order.tokenSymbol : 'WETH';
      
      const VAULT_ABI = [
        "function withdraw(address token, uint256 amount) external",
        "function balances(address user, address token) external view returns (uint256)"
      ];

      const vaultContract = new ethers.Contract(EXECUTOR_VAULT_ADDRESS, VAULT_ABI, signer);
      const vaultBalance = await vaultContract.balances(walletAddress, tokenAddress);
      
      if (vaultBalance === BigInt(0)) {
        toast({
          variant: "destructive",
          title: "No tokens in vault",
          description: `You have no ${tokenSymbol} to withdraw`,
        });
        return;
      }

      toast({
        title: 'Withdrawing Tokens',
        description: `Withdrawing ${ethers.formatEther(vaultBalance)} ${tokenSymbol}...`,
      });

      const withdrawTx = await vaultContract.withdraw(tokenAddress, vaultBalance);
      
      toast({
        title: 'Withdrawal submitted',
        description: `Transaction: ${withdrawTx.hash.slice(0, 10)}...`,
      });
      
      await withdrawTx.wait();

      toast({
        title: 'Tokens withdrawn!',
        description: `${ethers.formatEther(vaultBalance)} ${tokenSymbol} sent to your wallet`,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/vault-balance'] });
      
    } catch (error: any) {
      console.error('Withdrawal error:', error);
      toast({
        variant: "destructive",
        title: "Withdrawal failed",
        description: error.message || "Failed to withdraw tokens",
      });
    }
  };

  const cancelOrderMutation = useMutation({
    mutationFn: async (order: LimitOrder) => {
      // ✅ FARCASTER-SAFE: Use getProvider() instead of window.ethereum
      const provider = getProvider();
      if (!provider || !walletAddress) {
        throw new Error('Wallet not connected');
      }

      // WITHDRAW WETH FROM VAULT (if buy order)
      if (order.orderType === 'buy' && order.makerAmount) {
        const signer = await provider.getSigner();
        
        // Select vault based on order version (V1/V2/V3)
        const EXECUTOR_VAULT_ADDRESS = order.vaultVersion === 'v3'
          ? EXECUTOR_VAULT_V3_ADDRESS
          : order.vaultVersion === 'v1'
          ? EXECUTOR_VAULT_V1_ADDRESS
          : EXECUTOR_VAULT_V2_ADDRESS;
        
        const VAULT_ABI = [
          "function withdraw(address token, uint256 amount) external",
        ];

        toast({
          title: 'Step 1/2: Withdrawing WETH',
          description: `Withdrawing from ${order.vaultVersion || 'v2'} vault...`,
        });

        const vaultContract = new ethers.Contract(EXECUTOR_VAULT_ADDRESS, VAULT_ABI, signer);
        const withdrawTx = await vaultContract.withdraw(WETH_ADDRESS, order.makerAmount, {
          gasLimit: BigInt(150000)
        });
        
        // ✅ FARCASTER-SAFE: Use backend to wait for confirmation
        toast({
          title: 'Step 1/2: Confirming Withdrawal',
          description: 'Waiting for confirmation...',
        });
        
        const waitResponse = await apiRequest('POST', '/api/wait-for-tx', {
          txHash: withdrawTx.hash,
          maxWaitMs: 20000
        });
        const waitData = await waitResponse.json();
        
        if (!waitData.success || (waitData.confirmed && waitData.error)) {
          throw new Error(`Withdrawal failed: ${waitData.error || 'Transaction reverted'}`);
        }
      }

      toast({
        title: 'Step 2/2: Cancelling Order',
        description: 'Updating order status...',
      });

      const response = await apiRequest('DELETE', `/api/limit-orders/${order.id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/limit-orders/user', userId] });
      toast({
        title: '✅ Order Cancelled!',
        description: 'Your WETH has been withdrawn and order is cancelled.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Cancel Failed',
        description: error.message || 'Failed to cancel order',
        variant: 'destructive',
      });
    },
  });

  const executeOrderMutation = useMutation({
    mutationFn: async (order: LimitOrder) => {
      if (!window.ethereum) {
        throw new Error('MetaMask not found');
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Fetch token decimals if selling ERC20
      let tokenDecimals = 18; // Default for ETH
      if (order.orderType === 'sell') {
        const tokenContract = new ethers.Contract(
          order.tokenAddress,
          ['function decimals() view returns (uint8)'],
          provider
        );
        tokenDecimals = await tokenContract.decimals();
      }

      // Get 0x quote for the swap
      const sellToken = order.orderType === 'buy' ? 'ETH' : order.tokenAddress;
      const buyToken = order.orderType === 'buy' ? order.tokenAddress : 'ETH';
      const sellAmount = order.orderType === 'buy' 
        ? ethers.parseEther(order.ethAmount || '0').toString()
        : ethers.parseUnits(order.tokenAmount, tokenDecimals).toString();

      const quoteResponse = await fetch(
        `/api/swap/quote?chainId=8453&sellToken=${sellToken}&buyToken=${buyToken}&sellAmount=${sellAmount}&slippagePercentage=0.03&taker=${walletAddress}`
      );

      if (!quoteResponse.ok) {
        throw new Error('Failed to get swap quote');
      }

      const quote = await quoteResponse.json();

      // If selling ERC20, check allowance and approve if needed
      if (order.orderType === 'sell') {
        const tokenContract = new ethers.Contract(
          order.tokenAddress,
          [
            'function approve(address spender, uint256 amount) returns (bool)',
            'function allowance(address owner, address spender) view returns (uint256)'
          ],
          signer
        );
        
        // Use actual sellAmount from quote for allowance check
        const requiredAmount = BigInt(quote.sellAmount);
        const currentAllowance = await tokenContract.allowance(walletAddress, quote.to);
        
        // Only approve if current allowance is insufficient
        if (currentAllowance < requiredAmount) {
          const approveTx = await tokenContract.approve(quote.to, requiredAmount);
          await approveTx.wait();
        }
      }

      // Execute swap - convert hex values to BigInt
      const tx = await signer.sendTransaction({
        to: quote.to,
        data: quote.data,
        value: quote.value ? BigInt(quote.value) : BigInt(0),
        gasLimit: quote.gas ? BigInt(quote.gas) : undefined,
      });

      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error('Transaction receipt not found');
      }

      // Update order status to filled
      const response = await apiRequest('POST', `/api/limit-orders/${order.id}/execute`, {
        txHash: receipt.hash,
      });

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/limit-orders/user', userId] });
      queryClient.invalidateQueries({ queryKey: ['/api/limit-orders/ready', userId] });
      toast({
        title: 'Order Executed!',
        description: 'Your limit order has been filled successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Execution Failed',
        description: error.message || 'Failed to execute order',
        variant: 'destructive',
      });
    },
  });

  // Refresh balance when orderType or wallet changes (SELL orders only)
  useEffect(() => {
    if (orderType === 'sell' && selectedToken && isWalletConnected && walletAddress) {
      // Re-fetch balance using the existing handler logic
      handleSelectToken(selectedToken);
    }
  }, [orderType, walletAddress]);

  const resetForm = () => {
    setTargetPrice('');
    setEthAmount('');
    setTokenBalance('0');
    // Reset to default token (USDC) AND fetch its data
    if (allTokens && allTokens.length > 0) {
      const defaultToken = allTokens.find(t => t.symbol === 'USDC') || allTokens[0];
      handleSelectToken(defaultToken); // This will set token + fetch risk/balance
    }
  };

  // Handler for MAX button (both BUY and SELL orders)
  const handleMaxAmount = () => {
    if (orderType === 'buy' && wethBalance && parseFloat(wethBalance) > 0) {
      setEthAmount(wethBalance);
    } else if (orderType === 'sell' && tokenBalance && parseFloat(tokenBalance) > 0) {
      setEthAmount(tokenBalance);
    }
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isWalletConnected || !walletAddress) {
      toast({
        title: 'Wallet Connection Required',
        description: 'Please connect your wallet to create limit orders.',
        variant: 'destructive',
      });
      connectWallet();
      return;
    }
    
    if (!userId) {
      toast({
        title: 'User Not Found',
        description: 'Please reconnect your wallet.',
        variant: 'destructive',
      });
      return;
    }

    if (!tokenSymbol || !tokenName) {
      toast({
        title: 'Loading Token',
        description: 'Please wait for token information to load.',
        variant: 'destructive',
      });
      return;
    }

    if (isFetchingToken) {
      toast({
        title: 'Loading Token Info',
        description: 'Please wait for token information to finish loading.',
        variant: 'destructive',
      });
      return;
    }

    if (!ethPrice) {
      toast({
        title: 'Price Data Missing',
        description: 'ETH price not available. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    const targetPriceNum = parseFloat(targetPrice);
    const ethAmountNum = parseFloat(ethAmount);
    
    // Validate target price is entered
    if (!targetPrice || targetPriceNum <= 0) {
      toast({
        title: 'Target Price Required',
        description: 'Please enter the target price for order execution (e.g. $1.50)',
        variant: 'destructive',
      });
      return;
    }
    
    // Validate amount is entered
    if (!ethAmount || ethAmountNum <= 0) {
      toast({
        title: 'Amount Required',
        description: orderType === 'buy' 
          ? 'Please enter how much WETH you want to spend.'
          : `Please enter how much ${tokenSymbol} you want to sell.`,
        variant: 'destructive',
      });
      return;
    }
    
    // Validate minimum trade size (0x requires ~$1-5 minimum)
    const MIN_ETH_AMOUNT = 0.001; // 0.001 ETH (~$3-4 USD minimum)
    if (orderType === 'buy' && ethAmountNum < MIN_ETH_AMOUNT) {
      toast({
        title: 'Amount Too Low',
        description: `Minimum order amount is ${MIN_ETH_AMOUNT} WETH (~$3-4 USD). Please increase the amount.`,
        variant: 'destructive',
      });
      return;
    }

    // Check balance for BUY orders
    if (orderType === 'buy') {
      const wethBalanceNum = parseFloat(wethBalance);
      if (wethBalanceNum < ethAmountNum) {
        toast({
          title: 'Insufficient WETH Balance',
          description: `Your WETH balance: ${wethBalance}. Please enter a lower amount or deposit WETH to the vault.`,
          variant: 'destructive',
        });
        return;
      }
    }

    // Check balance for SELL orders
    if (orderType === 'sell') {
      const tokenBalanceNum = parseFloat(tokenBalance);
      if (tokenBalanceNum < ethAmountNum) {
        toast({
          title: 'Insufficient Token Balance',
          description: `Your ${tokenSymbol} balance: ${parseFloat(tokenBalance).toFixed(6)}. Please enter a lower amount.`,
          variant: 'destructive',
        });
        return;
      }
    }

    // Calculate total value in USD
    const totalValue = (() => {
      const amount = parseFloat(ethAmount);
      if (orderType === 'buy') {
        // BUY: ETH amount * ETH price = USD value
        return (amount * ethPrice).toString();
      } else {
        // SELL: Token amount * token price = USD value
        return (amount * targetPriceNum).toString();
      }
    })();
    
    createAndSubmitOrder(
      {
        userId,
        tokenAddress,
        tokenSymbol,
        tokenDecimals: selectedToken?.decimals || 18, // ✅ Pass decimals directly (no RPC needed in Farcaster!)
        orderType,
        targetPrice,
        ethAmount,
        tokenAmount: calculatedReceiveAmount, // What user will receive
        totalValue,
        vaultVersion,
      },
      {
        onSuccess: () => {
          resetForm();
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* Create Limit Order Form - Compact Mobile Layout */}
      <Card className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-accent" />
            <h2 className="text-lg font-bold">Create Limit Order</h2>
          </div>
          <Select value={orderType} onValueChange={(value: any) => setOrderType(value)}>
            <SelectTrigger className="w-[100px] h-8" data-testid="select-order-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="buy">Buy</SelectItem>
              <SelectItem value="sell">Sell</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <form onSubmit={handleCreateOrder} className="space-y-3">

          {/* Modern Dual-Card Layout */}
          {!selectedToken ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
              <span className="text-muted-foreground text-sm">Loading tokens...</span>
            </div>
          ) : (
            <>
              {/* FROM Card */}
              <TradeCard
                role="from"
                label={orderType === 'buy' ? 'You Spend' : 'You Sell'}
                token={orderType === 'buy' ? {
                  symbol: 'WETH',
                  name: 'Wrapped Ether',
                  address: WETH_ADDRESS,
                  logoURI: `/token-logo/${btoa('https://assets.coingecko.com/coins/images/2518/small/weth.png').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')}.png`,
                  decimals: 18,
                } : selectedToken}
                amount={ethAmount}
                balance={
                  orderType === 'buy' 
                    ? `${wethBalance} WETH`
                    : `${parseFloat(tokenBalance).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${selectedToken.symbol}`
                }
                isLoading={isFetchingToken}
                riskLevel={orderType === 'sell' ? tokenRiskLevel : null}
                riskWarnings={orderType === 'sell' ? tokenRiskWarnings : []}
                showQuickAmounts={
                  (orderType === 'buy' && parseFloat(wethBalance) > 0) || 
                  (orderType === 'sell' && parseFloat(tokenBalance) > 0)
                }
                onTokenClick={() => orderType === 'sell' && setIsTokenDialogOpen(true)}
                onAmountChange={setEthAmount}
                onMaxClick={handleMaxAmount}
              />

              {/* Swap Toggle Button */}
              <div className="flex justify-center -my-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-card"
                  onClick={() => setOrderType(orderType === 'buy' ? 'sell' : 'buy')}
                  data-testid="button-swap-toggle"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>

              {/* TO Card */}
              <TradeCard
                role="to"
                label={orderType === 'buy' ? 'You Buy' : 'You Receive'}
                token={orderType === 'buy' ? selectedToken : {
                  symbol: 'WETH',
                  name: 'Wrapped Ether',
                  address: WETH_ADDRESS,
                  logoURI: `/token-logo/${btoa('https://assets.coingecko.com/coins/images/2518/small/weth.png').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')}.png`,
                  decimals: 18,
                }}
                amount={calculatedReceiveAmount}
                balance={
                  orderType === 'buy'
                    ? `Est. ${calculatedReceiveAmount} ${selectedToken.symbol}`
                    : `Est. ${calculatedReceiveAmount} WETH`
                }
                isLoading={isFetchingToken}
                riskLevel={orderType === 'buy' ? tokenRiskLevel : null}
                riskWarnings={orderType === 'buy' ? tokenRiskWarnings : []}
                readOnly={true}
                onTokenClick={() => orderType === 'buy' && setIsTokenDialogOpen(true)}
                onAmountChange={() => {}}
              />

              {/* Live Price Display */}
              {tokenAddress && tokenAddress.length === 42 && !isFetchingToken && (
                <TokenPriceDisplay 
                  tokenAddress={tokenAddress} 
                  tokenSymbol={tokenSymbol || undefined}
                  compact={true}
                />
              )}

              {/* Target Price Section - Compact */}
              <div className="space-y-2">
                <Label htmlFor="targetPrice" className="text-sm font-semibold">Limit Price (USD)</Label>
                <Input
                  id="targetPrice"
                  type="number"
                  step="any"
                  min="0"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder={livePrice ? `${livePrice.price.toFixed(4)}` : "0.00"}
                  required
                  className="text-lg h-10 font-semibold"
                  data-testid="input-target-price"
                />

                {/* Market Price Quick-Set Buttons */}
                {livePrice && (
                  <div className="flex gap-1.5 flex-wrap items-center">
                    <span className="text-xs text-muted-foreground">
                      Market: ${livePrice.price.toFixed(4)}
                    </span>
                    {[1, 5, 10].map((percent) => (
                      <Button
                        key={percent}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newPrice = livePrice.price * (1 + percent / 100);
                          setTargetPrice(newPrice.toFixed(4));
                        }}
                        className="h-6 px-2 text-xs"
                        data-testid={`button-quick-set-${percent}`}
                      >
                        +{percent}%
                      </Button>
                    ))}
                  </div>
                )}

                {/* Price Comparison - Compact */}
                {targetPrice && livePrice && (
                  (() => {
                    const target = parseFloat(targetPrice);
                    const live = livePrice.price;
                    const diff = target - live;
                    const diffPercent = (diff / live) * 100;
                    const isBuyOrder = orderType === 'buy';
                    const willExecute = (isBuyOrder && live <= target) || (!isBuyOrder && live >= target);
                    
                    return (
                      <div className={`p-2 rounded-md text-xs ${
                        willExecute 
                          ? 'bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400'
                          : 'bg-muted border'
                      }`}>
                        <div className="flex items-center gap-1 font-medium">
                          {diffPercent > 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : diffPercent < 0 ? (
                            <TrendingDown className="h-3 w-3" />
                          ) : null}
                          <span>
                            {Math.abs(diffPercent).toFixed(2)}% {diffPercent > 0 ? 'above' : 'below'} market
                          </span>
                          {willExecute && <span className="ml-1 opacity-75">• Executes now</span>}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            </>
          )}

          {targetPrice && ethAmount && ethPrice > 0 && (
            <div className="p-2 bg-muted rounded-md text-xs">
              <span className="text-muted-foreground">Receive: </span>
              <span className="font-semibold">
                ~{parseFloat(calculatedReceiveAmount).toLocaleString()} {orderType === 'buy' ? (tokenSymbol || 'tokens') : 'WETH'}
              </span>
              <span className="text-muted-foreground"> • ${(() => {
                const amount = parseFloat(ethAmount);
                const price = parseFloat(targetPrice);
                if (orderType === 'buy') {
                  return (amount * ethPrice).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  });
                } else {
                  return (amount * price).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  });
                }
              })()}</span>
            </div>
          )}

          {!isWalletConnected && (
            <div className="p-2 bg-primary/10 border border-primary/20 rounded-md">
              <p className="text-xs text-primary font-medium text-center">
                Connect wallet to create orders
              </p>
            </div>
          )}

          <Button 
            type="submit" 
            className="w-full gap-2 h-10"
            disabled={isCreating}
            data-testid="button-create-limit-order"
          >
            <Target className="h-4 w-4" />
            {isCreating ? 'Creating...' : !isWalletConnected ? 'Connect Wallet' : 'Create Order'}
          </Button>
        </form>
      </Card>

      {/* Active Orders List - Compact */}
      <Card className="p-3 sm:p-4">
        <h3 className="font-bold text-sm mb-3">My Limit Orders</h3>
        
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No limit orders yet. Create your first order above!
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div 
                key={order.id} 
                className="flex flex-col gap-3 p-3 border rounded-md hover-elevate"
                data-testid={`limit-order-${order.id}`}
              >
                {/* Header Row - Token info and badges */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={order.orderType === 'buy' ? 'default' : 'secondary'} className="text-xs">
                    {order.orderType.toUpperCase()}
                  </Badge>
                  <span className="font-semibold text-sm">{order.tokenSymbol}</span>
                  <Badge 
                    variant="outline"
                    className={`text-xs ${
                      order.status === 'pending' ? 'border-yellow-500 text-yellow-500' :
                      order.status === 'ready_to_execute' ? 'border-blue-500 text-blue-500' :
                      order.status === 'filled' ? 'border-green-500 text-green-500' :
                      order.status === 'failed' ? 'border-red-600 text-red-600' :
                      'border-gray-500 text-gray-500'
                    }`}
                  >
                    {order.status === 'ready_to_execute' ? 'READY' : order.status.toUpperCase()}
                  </Badge>
                  {order.vaultVersion && (
                    <Badge 
                      variant="outline"
                      className={`text-xs ${
                        order.vaultVersion === 'v3' ? 'border-green-500/50 text-green-600 dark:text-green-400' :
                        order.vaultVersion === 'v2' ? 'border-blue-500/50 text-blue-600 dark:text-blue-400' :
                        'border-gray-500/50 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {(order.vaultVersion === 'v3' || order.vaultVersion === 'v2') && <Zap className="h-3 w-3 mr-0.5" />}
                      {order.vaultVersion.toUpperCase()}
                    </Badge>
                  )}
                </div>
                
                {/* Order Details */}
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">
                    {order.ethAmount ? (
                      <>Spending: {order.ethAmount} ETH → ~{parseFloat(order.tokenAmount).toLocaleString()} {order.tokenSymbol}</>
                    ) : (
                      <>Amount: {order.tokenAmount} @ ${order.targetPrice}</>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Target: ${order.targetPrice} | Total: ${parseFloat(order.totalValue).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </div>
                  {order.status === 'failed' && order.failureReason && (
                    <div className="text-xs text-red-600 mt-1 break-words">
                      {order.failureReason.includes('no Route matched') 
                        ? 'Trade too small (min ~$0.5)' 
                        : order.failureReason.includes('Insufficient vault balance')
                        ? 'Insufficient WETH in vault'
                        : order.failureReason.slice(0, 50)}
                    </div>
                  )}
                  {order.status === 'failed' && order.orderType === 'buy' && order.makerAmount && (
                    <div className="text-xs text-amber-600 mt-1">
                      {ethers.formatEther(order.makerAmount)} WETH in vault
                    </div>
                  )}
                </div>

                {/* Action Buttons - Full Width, Wrap on Mobile */}
                <div className="flex flex-wrap gap-1.5">
                  {/* Withdraw button for FAILED orders */}
                  {order.status === 'failed' && order.makerAmount && 
                   (order.orderType === 'buy' || (order.makerToken || order.tokenAddress)) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleWithdrawFailedOrder(order)}
                      disabled={cancelOrderMutation.isPending}
                      data-testid={`button-withdraw-${order.id}`}
                      className="border-amber-500 text-amber-600 hover:bg-amber-50 text-xs h-8"
                    >
                      Withdraw
                    </Button>
                  )}
                  {/* Withdraw button for CANCELLED orders */}
                  {order.status === 'cancelled' && order.makerAmount && 
                   (order.orderType === 'buy' || (order.makerToken || order.tokenAddress)) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleWithdrawFailedOrder(order)}
                      disabled={cancelOrderMutation.isPending}
                      data-testid={`button-withdraw-cancelled-${order.id}`}
                      className="border-purple-500 text-purple-600 hover:bg-purple-50 text-xs h-8"
                    >
                      Withdraw
                    </Button>
                  )}
                  {/* Withdraw button for FILLED V1 orders */}
                  {order.status === 'filled' && order.vaultVersion === 'v1' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleWithdrawFilledOrder(order)}
                      data-testid={`button-withdraw-filled-${order.id}`}
                      className="border-green-500 text-green-600 hover:bg-green-50 text-xs h-8"
                    >
                      Withdraw
                    </Button>
                  )}
                  {/* Auto-withdrawal notice for FILLED V2/V3 orders */}
                  {order.status === 'filled' && (order.vaultVersion === 'v2' || order.vaultVersion === 'v3') && (
                    <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Zap className="h-3 w-3" />
                      <span>Auto-delivered</span>
                    </div>
                  )}
                  {order.status === 'ready_to_execute' && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => executeOrderMutation.mutate(order)}
                      disabled={executeOrderMutation.isPending}
                      data-testid={`button-execute-order-${order.id}`}
                      className="text-xs h-8"
                    >
                      {executeOrderMutation.isPending ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ...
                        </>
                      ) : (
                        'Execute'
                      )}
                    </Button>
                  )}
                  {(order.status === 'pending' || order.status === 'fillable') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelOrderMutation.mutate(order)}
                      disabled={cancelOrderMutation.isPending}
                      data-testid={`button-cancel-order-${order.id}`}
                      className="text-xs h-8"
                    >
                      {cancelOrderMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <X className="h-3 w-3 mr-0.5" />
                          Cancel
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Token Picker Dialog */}
      <Dialog open={isTokenDialogOpen} onOpenChange={setIsTokenDialogOpen}>
        <DialogContent className="max-w-md">
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
          <ScrollArea className="h-[400px] px-1 mt-2">
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
                      onClick={() => {
                        handleSelectToken(token);
                        setIsTokenDialogOpen(false);
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-md hover-elevate active-elevate-2 text-left"
                      data-testid={`button-select-token-${token.symbol}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={token.logoURI} alt={token.symbol} />
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
