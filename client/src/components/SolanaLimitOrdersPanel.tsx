import { useState, useEffect } from 'react';
import { Buffer } from 'buffer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Target, Loader2, ChevronDown, X, ArrowDown, RefreshCw, RefreshCcw, ArrowDownToLine, Vault } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useSolanaWallet } from '@/contexts/SolanaWalletContext';
import { Connection, VersionedTransaction, Transaction } from '@solana/web3.js';

// Use Solana public RPC (rate limit friendly) with backup options
const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SOL_DECIMALS = 9;

interface SolanaToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

// Our backend order format (not Jupiter)
interface SolanaLimitOrder {
  id: string;
  orderType: string;
  tokenSymbol: string;
  tokenAddress: string;
  targetPrice: string;
  solAmount: string | null;
  tokenAmount: string;
  status: string;
  inputMint: string;
  outputMint: string;
  makingAmount: string;
  takingAmount: string;
  filledPrice: string | null;
  createdAt: string;
  expiresAt: string | null;
}

interface CreateOrderParams {
  inputMint: string;
  outputMint: string;
  inputSymbol: string;
  outputSymbol: string;
  maker: string;
  makingAmount: string;
  takingAmount: string;
  targetPrice: string;
  orderType: string;
  depositTxSignature: string;
}

interface PrepareDepositResponse {
  success: boolean;
  orderId: string;
  transaction: string;
  escrowAddress: string;
  orderDetails: {
    inputMint: string;
    outputMint: string;
    inputSymbol: string;
    outputSymbol: string;
    makingAmount: string;
    takingAmount: string;
    targetPrice: string;
    orderType: string;
  };
}

interface SolanaLimitOrdersPanelProps {
  onTokenChange?: (token: SolanaToken | null) => void;
}

export function SolanaLimitOrdersPanel({ onTokenChange }: SolanaLimitOrdersPanelProps) {
  const { publicKey, isConnected, connect, signTransaction, balance, refreshBalance } = useSolanaWallet();
  const { toast } = useToast();
  
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [selectedToken, setSelectedToken] = useState<SolanaToken | null>(null);
  const [solAmount, setSolAmount] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  const [cancellingOrder, setCancellingOrder] = useState<string | null>(null);
  const [lookupToken, setLookupToken] = useState<SolanaToken | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [executingOrder, setExecutingOrder] = useState<string | null>(null);

  // Fetch token balance when token is selected and orderType is 'sell'
  useEffect(() => {
    const fetchTokenBalance = async () => {
      if (!selectedToken || !publicKey || orderType !== 'sell') {
        setTokenBalance(null);
        return;
      }
      
      setIsLoadingBalance(true);
      try {
        const response = await fetch(`/api/solana/token-balance/${publicKey}/${selectedToken.address}`);
        if (response.ok) {
          const data = await response.json();
          setTokenBalance(data.balance || 0);
          console.log(`💰 Token balance: ${data.balance} ${selectedToken.symbol}`);
        } else {
          setTokenBalance(0);
        }
      } catch (error) {
        console.error('Failed to fetch token balance:', error);
        setTokenBalance(0);
      } finally {
        setIsLoadingBalance(false);
      }
    };
    
    fetchTokenBalance();
  }, [selectedToken, publicKey, orderType]);

  // Helper to set percentage of balance
  const setPercentageAmount = (percentage: number) => {
    if (orderType === 'buy' && balance) {
      const amount = (parseFloat(balance) * percentage / 100).toFixed(6);
      setSolAmount(amount);
    } else if (orderType === 'sell' && tokenBalance !== null && tokenBalance > 0) {
      const amount = (tokenBalance * percentage / 100).toFixed(6);
      setSolAmount(amount);
    }
  };
  
  // Auto-detect contract address and lookup token
  useEffect(() => {
    const isSolanaAddress = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());
    
    if (tokenSearchQuery && isSolanaAddress(tokenSearchQuery)) {
      const lookupAddress = async () => {
        setIsLookingUp(true);
        try {
          const response = await fetch(`/api/solana/token/${tokenSearchQuery.trim()}`);
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
  }, [tokenSearchQuery, toast]);

  // ✅ Refresh SOL balance when connected
  useEffect(() => {
    if (isConnected && publicKey) {
      console.log('🔄 LimitOrders: Refreshing SOL balance on mount/connect...');
      refreshBalance();
    }
  }, [isConnected, publicKey, refreshBalance]);

  const { data: tokenList } = useQuery<SolanaToken[]>({
    queryKey: ['/api/solana/tokens'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: openOrders, refetch: refetchOrders, isLoading: isLoadingOrders, isError: isOrdersError } = useQuery<SolanaLimitOrder[]>({
    queryKey: ['/api/solana/limit-order/open', publicKey],
    queryFn: async () => {
      if (!publicKey) return [];
      const response = await fetch(`/api/solana/limit-order/open?wallet=${publicKey}`);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch orders');
      }
      const data = await response.json();
      // Our backend returns an array directly
      return Array.isArray(data) ? data : [];
    },
    enabled: !!publicKey,
    refetchInterval: 30000,
    retry: 1,
  });

  const { data: solPrice } = useQuery<{ price: number }>({
    queryKey: ['/api/solana/price', SOL_MINT],
    queryFn: async () => {
      const response = await fetch(`/api/solana/price?ids=${SOL_MINT}`);
      if (!response.ok) throw new Error('Failed to fetch SOL price');
      const data = await response.json();
      return { price: data.data?.[SOL_MINT]?.price || 0 };
    },
    refetchInterval: 60000,
  });

  const createOrderMutation = useMutation({
    mutationFn: async (params: CreateOrderParams) => {
      const response = await apiRequest('POST', '/api/solana/limit-order/create', params);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/solana/limit-order/open'] });
      toast({
        title: 'Order created!',
        description: 'Your limit order is now being monitored. You will be notified when the target price is reached.',
      });
    },
  });
  
  // Execute order mutation (for ready_to_execute orders)
  const executeOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiRequest('POST', '/api/solana/limit-order/execute', {
        orderId,
        maker: publicKey,
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
  });

  // Query for failed orders (need refund)
  const { data: failedOrders, refetch: refetchFailedOrders } = useQuery<SolanaLimitOrder[]>({
    queryKey: ['/api/solana/limit-order/failed', publicKey],
    queryFn: async () => {
      if (!publicKey) return [];
      const response = await fetch(`/api/solana/limit-order/failed?wallet=${publicKey}`);
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!publicKey,
    refetchInterval: 60000,
  });

  // Refund mutation
  const [refundingOrder, setRefundingOrder] = useState<string | null>(null);
  
  const handleRefundOrder = async (orderId: string) => {
    if (!publicKey) return;
    
    setRefundingOrder(orderId);
    
    try {
      const response = await apiRequest('POST', '/api/solana/limit-order/refund', {
        orderId,
        wallet: publicKey,
      });
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      toast({
        title: 'Refund successful!',
        description: `SOL has been returned to your wallet. TX: ${data.signature?.slice(0, 8)}...`,
      });
      
      refetchFailedOrders();
      refreshBalance();
      
    } catch (error: any) {
      console.error('Error refunding order:', error);
      toast({
        variant: 'destructive',
        title: 'Refund failed',
        description: error.message || 'Failed to refund order',
      });
    } finally {
      setRefundingOrder(null);
    }
  };

  const filteredTokens = (() => {
    let tokens = tokenList?.filter(token => 
      token.symbol.toLowerCase().includes(tokenSearchQuery.toLowerCase()) ||
      token.name.toLowerCase().includes(tokenSearchQuery.toLowerCase()) ||
      token.address.toLowerCase().includes(tokenSearchQuery.toLowerCase())
    ).slice(0, 50) || [];
    
    // Add lookup token at the beginning if found and not already in list
    if (lookupToken && !tokens.find(t => t.address === lookupToken.address)) {
      tokens = [lookupToken, ...tokens];
    }
    
    return tokens;
  })();

  const handleSelectToken = (token: SolanaToken) => {
    setSelectedToken(token);
    setIsTokenDialogOpen(false);
    setTokenSearchQuery('');
    if (onTokenChange) {
      onTokenChange(token);
    }
  };

  const calculateAmounts = () => {
    if (!solAmount || !targetPrice || !selectedToken) return null;
    
    const solValue = parseFloat(solAmount);
    const priceValue = parseFloat(targetPrice);
    const currentSolPrice = solPrice?.price || 0;
    
    if (solValue <= 0 || priceValue <= 0 || currentSolPrice <= 0) return null;
    
    if (orderType === 'buy') {
      const solInLamports = Math.floor(solValue * Math.pow(10, SOL_DECIMALS));
      const solUsdValue = solValue * currentSolPrice;
      const tokenAmount = solUsdValue / priceValue;
      const tokenInSmallestUnit = Math.floor(tokenAmount * Math.pow(10, selectedToken.decimals));
      
      return {
        makingAmount: solInLamports.toString(),
        takingAmount: tokenInSmallestUnit.toString(),
        displayTokenAmount: tokenAmount.toFixed(6),
        inputMint: SOL_MINT,
        outputMint: selectedToken.address,
      };
    } else {
      const tokenInSmallestUnit = Math.floor(solValue * Math.pow(10, selectedToken.decimals));
      const tokenUsdValue = solValue * priceValue;
      const solAmount = tokenUsdValue / currentSolPrice;
      const solInLamports = Math.floor(solAmount * Math.pow(10, SOL_DECIMALS));
      
      return {
        makingAmount: tokenInSmallestUnit.toString(),
        takingAmount: solInLamports.toString(),
        displayTokenAmount: solAmount.toFixed(6),
        inputMint: selectedToken.address,
        outputMint: SOL_MINT,
      };
    }
  };

  const handleCreateOrder = async () => {
    if (!isConnected || !publicKey) {
      toast({
        variant: 'destructive',
        title: 'Wallet not connected',
        description: 'Please connect your wallet first',
      });
      return;
    }

    if (!signTransaction) {
      toast({
        variant: 'destructive',
        title: 'Wallet not ready',
        description: 'Please reconnect your wallet',
      });
      return;
    }

    if (!selectedToken) {
      toast({
        variant: 'destructive',
        title: 'No token selected',
        description: 'Please select a token for the limit order',
      });
      return;
    }

    const amounts = calculateAmounts();
    if (!amounts) {
      toast({
        variant: 'destructive',
        title: 'Invalid input',
        description: 'Please enter valid amounts and target price',
      });
      return;
    }

    try {
      console.log('🌞 Creating Solana limit order with escrow deposit:', {
        orderType,
        inputMint: amounts.inputMint,
        outputMint: amounts.outputMint,
        makingAmount: amounts.makingAmount,
        takingAmount: amounts.takingAmount,
        targetPrice,
        maker: publicKey
      });

      // Step 1: Get deposit transaction from backend
      toast({
        title: 'Preparing deposit...',
        description: 'Getting escrow deposit transaction',
      });

      const prepareResponse = await apiRequest('POST', '/api/solana/limit-order/prepare-deposit', {
        inputMint: amounts.inputMint,
        outputMint: amounts.outputMint,
        inputSymbol: orderType === 'buy' ? 'SOL' : selectedToken.symbol,
        outputSymbol: orderType === 'buy' ? selectedToken.symbol : 'SOL',
        maker: publicKey,
        makingAmount: amounts.makingAmount,
        takingAmount: amounts.takingAmount,
        targetPrice,
        orderType,
      });

      const prepareData: PrepareDepositResponse = await prepareResponse.json();
      
      if (!prepareData.success || !prepareData.transaction) {
        throw new Error('Failed to prepare deposit transaction');
      }

      console.log('📝 Deposit transaction prepared, escrow:', prepareData.escrowAddress);

      // Step 2: User signs the deposit transaction
      toast({
        title: 'Sign deposit transaction',
        description: 'Please approve the deposit to escrow in your wallet',
      });

      const transactionBuffer = Buffer.from(prepareData.transaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuffer);

      // Sign with user's wallet
      const signedTx = await signTransaction(transaction);
      
      // Step 3: Send signed transaction via backend (with RPC fallback to avoid rate limits)
      toast({
        title: 'Sending deposit...',
        description: 'Submitting transaction to Solana network',
      });

      // Serialize signed transaction
      const serializedTx = Buffer.from(signedTx.serialize()).toString('base64');
      
      // Send via backend which has RPC fallback
      const sendResponse = await apiRequest('POST', '/api/solana/send-transaction', {
        signedTransaction: serializedTx
      });
      
      const sendData = await sendResponse.json();
      
      if (!sendData.success || !sendData.signature) {
        throw new Error(sendData.error || 'Failed to send transaction');
      }
      
      const signature = sendData.signature;
      console.log('📤 Deposit transaction sent:', signature);
      console.log('✅ Deposit confirmed:', signature);

      // Step 4: Create order in backend with deposit signature
      await createOrderMutation.mutateAsync({
        inputMint: amounts.inputMint,
        outputMint: amounts.outputMint,
        inputSymbol: orderType === 'buy' ? 'SOL' : selectedToken.symbol,
        outputSymbol: orderType === 'buy' ? selectedToken.symbol : 'SOL',
        maker: publicKey,
        makingAmount: amounts.makingAmount,
        takingAmount: amounts.takingAmount,
        targetPrice,
        orderType,
        depositTxSignature: signature,
      });

      // Refresh balance after deposit
      refreshBalance();
      refetchOrders();
      setSolAmount('');
      setTargetPrice('');

    } catch (error: any) {
      console.error('Error creating limit order:', error);
      toast({
        variant: 'destructive',
        title: 'Order failed',
        description: error.message || 'Failed to create limit order',
      });
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!publicKey) return;
    
    setCancellingOrder(orderId);
    
    try {
      // Simply cancel in our database - no transaction signing needed
      const response = await apiRequest('POST', '/api/solana/limit-order/cancel', {
        orderId,
        maker: publicKey,
      });

      const cancelData = await response.json();
      
      if (cancelData.error) {
        throw new Error(cancelData.error);
      }

      toast({
        title: 'Order cancelled',
        description: 'Your limit order has been cancelled',
      });

      refetchOrders();

    } catch (error: any) {
      console.error('Error cancelling order:', error);
      toast({
        variant: 'destructive',
        title: 'Cancel failed',
        description: error.message || 'Failed to cancel order',
      });
    } finally {
      setCancellingOrder(null);
    }
  };

  // Execute a ready_to_execute order
  const handleExecuteOrder = async (orderId: string) => {
    if (!publicKey || !signTransaction) return;
    
    setExecutingOrder(orderId);
    
    try {
      // Get the swap transaction from backend
      const executeData = await executeOrderMutation.mutateAsync(orderId);
      
      if (!executeData.swapTransaction) {
        throw new Error('No swap transaction returned');
      }

      toast({
        title: 'Signing transaction...',
        description: 'Please sign the swap transaction in your wallet',
      });

      // Sign and submit the swap transaction
      const txBuffer = Buffer.from(executeData.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuffer);

      const signedTx = await signTransaction(transaction);

      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const rawTransaction = signedTx.serialize();
      const txHash = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      toast({
        title: 'Transaction submitted!',
        description: 'Confirming transaction...',
      });

      await connection.confirmTransaction(txHash, 'confirmed');

      // Confirm execution in backend
      await apiRequest('POST', '/api/solana/limit-order/confirm', {
        orderId,
        txSignature: txHash,
      });

      toast({
        title: 'Order executed!',
        description: 'Your limit order has been filled successfully',
      });

      refetchOrders();

    } catch (error: any) {
      console.error('Error executing order:', error);
      
      if (error.message?.includes('rejected') || error.message?.includes('cancelled')) {
        toast({
          variant: 'destructive',
          title: 'Transaction rejected',
          description: 'You rejected the transaction',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Execution failed',
          description: error.message || 'Failed to execute order',
        });
      }
    } finally {
      setExecutingOrder(null);
    }
  };

  const formatAmount = (amount: string, decimals: number): string => {
    const value = parseFloat(amount) / Math.pow(10, decimals);
    if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(2)}K`;
    return value.toFixed(4);
  };

  const getTokenInfo = (mint: string): SolanaToken | undefined => {
    if (mint === SOL_MINT) {
      return { 
        address: SOL_MINT, 
        symbol: 'SOL', 
        name: 'Solana', 
        decimals: 9, 
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' 
      };
    }
    return tokenList?.find(t => t.address === mint);
  };

  const amounts = calculateAmounts();

  if (!isConnected) {
    return (
      <Card className="p-6 text-center">
        <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-bold mb-2">Solana Limit Orders</h3>
        <p className="text-muted-foreground text-sm mb-4">
          Connect your wallet to place limit orders via Jupiter
        </p>
        <Button onClick={() => connect()} data-testid="button-connect-solana-limit">
          Connect Wallet
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h3 className="font-bold">Create Limit Order</h3>
          </div>
          <div className="flex items-center gap-2">
            <Vault className="h-4 w-4 text-muted-foreground" />
            <Badge variant="outline" className="text-xs">
              Escrow + Auto-Execute
            </Badge>
          </div>
        </div>
        
        <div className="text-xs text-muted-foreground mb-4 p-2 bg-muted/50 rounded-lg">
          Your funds will be deposited to escrow and automatically swapped when target price is reached.
        </div>

        <div className="flex gap-2 mb-4">
          <Button
            variant={orderType === 'buy' ? 'default' : 'outline'}
            onClick={() => setOrderType('buy')}
            className="flex-1"
            data-testid="button-order-type-buy"
          >
            Buy
          </Button>
          <Button
            variant={orderType === 'sell' ? 'default' : 'outline'}
            onClick={() => setOrderType('sell')}
            className="flex-1"
            data-testid="button-order-type-sell"
          >
            Sell
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground mb-1">Token</Label>
            <Button
              variant="outline"
              className="w-full justify-between h-12"
              onClick={() => setIsTokenDialogOpen(true)}
              data-testid="button-select-token-solana"
            >
              {selectedToken ? (
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={selectedToken.logoURI} />
                    <AvatarFallback>{selectedToken.symbol.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span>{selectedToken.symbol}</span>
                </div>
              ) : (
                <span className="text-muted-foreground">Select token</span>
              )}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <Label className="text-sm text-muted-foreground">
                {orderType === 'buy' ? 'SOL to spend' : `${selectedToken?.symbol || 'Tokens'} to sell`}
              </Label>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                {orderType === 'buy' && balance && (
                  <>Balance: {balance} SOL</>
                )}
                {orderType === 'sell' && selectedToken && (
                  isLoadingBalance ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Loading...</>
                  ) : tokenBalance !== null ? (
                    <>Balance: {tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} {selectedToken.symbol}</>
                  ) : null
                )}
              </span>
            </div>
            <Input
              type="number"
              placeholder="0.00"
              value={solAmount}
              onChange={(e) => setSolAmount(e.target.value)}
              className="h-12 text-lg"
              data-testid="input-sol-amount"
            />
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPercentageAmount(25)}
                disabled={(orderType === 'buy' && !balance) || (orderType === 'sell' && (tokenBalance === null || tokenBalance <= 0))}
                data-testid="button-amount-25"
              >
                25%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPercentageAmount(50)}
                disabled={(orderType === 'buy' && !balance) || (orderType === 'sell' && (tokenBalance === null || tokenBalance <= 0))}
                data-testid="button-amount-50"
              >
                50%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPercentageAmount(75)}
                disabled={(orderType === 'buy' && !balance) || (orderType === 'sell' && (tokenBalance === null || tokenBalance <= 0))}
                data-testid="button-amount-75"
              >
                75%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPercentageAmount(100)}
                disabled={(orderType === 'buy' && !balance) || (orderType === 'sell' && (tokenBalance === null || tokenBalance <= 0))}
                data-testid="button-amount-max"
              >
                MAX
              </Button>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="h-5 w-5 text-muted-foreground" />
          </div>

          <div>
            <Label className="text-sm text-muted-foreground mb-1">
              Target price (USD per {selectedToken?.symbol || 'token'})
            </Label>
            <Input
              type="number"
              placeholder="0.00"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              className="h-12 text-lg"
              data-testid="input-target-price"
            />
            {solPrice && (
              <p className="text-xs text-muted-foreground mt-1">
                Current SOL: ${solPrice.price.toFixed(2)}
              </p>
            )}
          </div>

          {amounts && selectedToken && (
            <Card className="p-3 bg-muted/50">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">You will receive:</span>
                <span className="font-medium">
                  {orderType === 'buy' 
                    ? `~${amounts.displayTokenAmount} ${selectedToken.symbol}`
                    : `~${amounts.displayTokenAmount} SOL`
                  }
                </span>
              </div>
            </Card>
          )}

          <Button
            className="w-full h-12"
            onClick={handleCreateOrder}
            disabled={createOrderMutation.isPending || !selectedToken || !solAmount || !targetPrice}
            data-testid="button-create-limit-order"
          >
            {createOrderMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Creating Order...
              </>
            ) : (
              <>
                <Target className="h-4 w-4 mr-2" />
                Create {orderType === 'buy' ? 'Buy' : 'Sell'} Order
              </>
            )}
          </Button>
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">Open Orders</h3>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => refetchOrders()}
            disabled={isLoadingOrders}
            data-testid="button-refresh-orders"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingOrders ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {isLoadingOrders ? (
          <div className="text-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
          </div>
        ) : isOrdersError ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Failed to load orders. <Button variant="ghost" size="sm" onClick={() => refetchOrders()}>Retry</Button>
          </div>
        ) : openOrders && openOrders.length > 0 ? (
          <div className="space-y-3">
            {openOrders.map((order) => {
              const inputToken = getTokenInfo(order.inputMint);
              const outputToken = getTokenInfo(order.outputMint);
              const inputDecimals = inputToken?.decimals || 9;
              const outputDecimals = outputToken?.decimals || 9;
              const isReadyToExecute = order.status === 'ready_to_execute';

              return (
                <Card key={order.id} className={`p-3 ${isReadyToExecute ? 'bg-green-500/10 border-green-500/50' : 'bg-muted/30'}`}>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={order.orderType === 'buy' ? 'default' : 'secondary'} className="text-xs">
                          {order.orderType.toUpperCase()}
                        </Badge>
                        <span className="text-sm font-medium">
                          {order.tokenSymbol}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          @ ${parseFloat(order.targetPrice || '0').toFixed(6)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {isReadyToExecute && (
                          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/50 text-xs">
                            Ready!
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {order.status}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span>
                          {formatAmount(order.makingAmount, inputDecimals)} {inputToken?.symbol || '?'}
                        </span>
                        <ArrowDown className="h-3 w-3 rotate-[-90deg]" />
                        <span>
                          {formatAmount(order.takingAmount, outputDecimals)} {outputToken?.symbol || '?'}
                        </span>
                      </div>
                      {order.filledPrice && (
                        <span className="text-green-400">
                          Current: ${parseFloat(order.filledPrice).toFixed(6)}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2 justify-end">
                      {isReadyToExecute && (
                        <Button
                          size="sm"
                          onClick={() => handleExecuteOrder(order.id)}
                          disabled={executingOrder === order.id}
                          className="bg-green-600 hover:bg-green-700"
                          data-testid={`button-execute-order-${order.id.slice(0, 8)}`}
                        >
                          {executingOrder === order.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Target className="h-4 w-4 mr-1" />
                          )}
                          Execute Now
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelOrder(order.id)}
                        disabled={cancellingOrder === order.id}
                        data-testid={`button-cancel-order-${order.id.slice(0, 8)}`}
                      >
                        {cancellingOrder === order.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No open orders
          </div>
        )}
      </Card>

      {/* Failed Orders Section - Need Refund */}
      {failedOrders && failedOrders.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-red-400">Failed Orders (Need Withdrawal)</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchFailedOrders()}
              data-testid="button-refresh-failed-orders"
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="space-y-3">
            {failedOrders.map((order) => {
              const inputAmount = order.makingAmount || order.solAmount || '0';
              const solValue = parseFloat(inputAmount) / 1e9;
              
              return (
                <Card 
                  key={order.id} 
                  className="p-3 border-red-500/30 bg-red-500/5"
                  data-testid={`card-failed-order-${order.id.slice(0, 8)}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-xs">
                          FAILED
                        </Badge>
                        <span className="font-medium">
                          {order.orderType?.toUpperCase()} {order.tokenSymbol}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Deposited: {solValue.toFixed(4)} SOL
                      </div>
                    </div>
                    
                    <Button
                      size="sm"
                      onClick={() => handleRefundOrder(order.id)}
                      disabled={refundingOrder === order.id}
                      className="bg-orange-600 hover:bg-orange-700"
                      data-testid={`button-withdraw-${order.id.slice(0, 8)}`}
                    >
                      {refundingOrder === order.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <ArrowDownToLine className="h-4 w-4 mr-1" />
                      )}
                      Withdraw
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </Card>
      )}

      <Dialog open={isTokenDialogOpen} onOpenChange={setIsTokenDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Token</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Search by name, symbol, or address..."
            value={tokenSearchQuery}
            onChange={(e) => setTokenSearchQuery(e.target.value)}
            className="mb-4"
            data-testid="input-token-search"
          />
          <ScrollArea className="h-[300px]">
            <div className="space-y-1">
              {isLookingUp && (
                <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Looking up token...</span>
                </div>
              )}
              {filteredTokens.slice(0, 50).map((token) => (
                <Button
                  key={token.address}
                  variant="ghost"
                  className={`w-full justify-start h-12 ${lookupToken?.address === token.address ? 'bg-primary/10 border border-primary' : ''}`}
                  onClick={() => handleSelectToken(token)}
                  data-testid={`button-token-${token.symbol}`}
                >
                  <Avatar className="h-6 w-6 mr-3">
                    <AvatarImage src={token.logoURI} />
                    <AvatarFallback>{token.symbol.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <div className="text-left flex-1">
                    <div className="font-medium flex items-center gap-2">
                      {token.symbol}
                      {lookupToken?.address === token.address && (
                        <Badge variant="secondary" className="text-xs">Found</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{token.name}</div>
                  </div>
                </Button>
              ))}
              {filteredTokens.length === 0 && !isLookingUp && (
                <div className="text-center py-8 text-muted-foreground text-sm space-y-2">
                  <p>No tokens found.</p>
                  <p className="text-xs">Paste a SPL token contract address (not a wallet address).</p>
                  <p className="text-xs opacity-70">Example: DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
