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
import { Target, Loader2, ChevronDown, X, RefreshCw, Shield, Zap, Wallet, Ban } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useSolanaWallet } from '@/contexts/SolanaWalletContext';
import { Connection, VersionedTransaction } from '@solana/web3.js';

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

interface SolanaLimitOrder {
  id: string;
  orderType: string;
  tokenSymbol: string;
  tokenAddress: string;
  tokenDecimals?: number;
  targetPrice: string;
  solAmount?: string;
  tokenAmount: string;
  status: string;
  inputMint: string;
  outputMint: string;
  makingAmount?: string;
  takingAmount?: string;
  filledPrice?: string;
  createdAt: string;
  expiresAt?: string;
}

interface JupiterLimitOrderPanelProps {
  onTokenChange?: (token: SolanaToken | null) => void;
}

export function JupiterLimitOrderPanel({ onTokenChange }: JupiterLimitOrderPanelProps) {
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
  const [isCreating, setIsCreating] = useState(false);
  const [solPriceUsd, setSolPriceUsd] = useState<number | null>(null);
  const [tokenBalance, setTokenBalance] = useState<string | null>(null);
  const [isLoadingTokenBalance, setIsLoadingTokenBalance] = useState(false);

  // Fetch token balance when in sell mode and token is selected
  useEffect(() => {
    const fetchTokenBalance = async () => {
      if (!publicKey || !selectedToken || orderType !== 'sell') {
        setTokenBalance(null);
        return;
      }
      
      setIsLoadingTokenBalance(true);
      try {
        const response = await fetch(`/api/solana/token-balance/${publicKey}/${selectedToken.address}`);
        if (response.ok) {
          const data = await response.json();
          setTokenBalance(data.balance || '0');
        } else {
          setTokenBalance('0');
        }
      } catch (error) {
        console.error('Error fetching token balance:', error);
        setTokenBalance('0');
      } finally {
        setIsLoadingTokenBalance(false);
      }
    };
    
    fetchTokenBalance();
  }, [publicKey, selectedToken, orderType]);

  // Fetch trending tokens
  const { data: trendingTokens } = useQuery<SolanaToken[]>({
    queryKey: ['/api/solana-trending-tokens'],
    select: (data: any) => (data?.tokens || []).map((t: any) => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals || 9,
      logoURI: t.logoUrl || t.logoURI || `https://api.dicebear.com/7.x/shapes/svg?seed=${t.address}`,
    })),
  });

  // Fetch open orders from our database (escrow-based)
  const { data: solanaOrders, refetch: refetchOrders, isLoading: isLoadingOrders } = useQuery<any[]>({
    queryKey: ['/api/solana/limit-order/open', publicKey],
    enabled: !!publicKey,
    refetchInterval: 15000,
    queryFn: async () => {
      if (!publicKey) return [];
      const response = await fetch(`/api/solana/limit-order/open?wallet=${publicKey}`);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
  });

  // Token price query
  const { data: tokenPriceData } = useQuery<{ data: Record<string, { price: number }> }>({
    queryKey: ['/api/solana/price', selectedToken?.address],
    enabled: !!selectedToken,
    refetchInterval: 10000,
    queryFn: async () => {
      if (!selectedToken?.address) return { data: {} };
      const response = await fetch(`/api/solana/price?ids=${selectedToken.address}`);
      if (!response.ok) return { data: {} };
      return response.json();
    },
  });

  const currentPrice: number | null = tokenPriceData?.data?.[selectedToken?.address || '']?.price || null;

  // Fetch SOL price in USD
  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        const response = await fetch('/api/solana/price?ids=So11111111111111111111111111111111111111112');
        if (response.ok) {
          const data = await response.json();
          const price = data.data?.['So11111111111111111111111111111111111111112']?.price;
          if (price && price > 0) {
            setSolPriceUsd(price);
            console.log('💰 SOL Price:', price);
          } else {
            // Fallback: try CoinGecko directly
            const cgResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
            if (cgResponse.ok) {
              const cgData = await cgResponse.json();
              if (cgData.solana?.usd) {
                setSolPriceUsd(cgData.solana.usd);
                console.log('💰 SOL Price (CoinGecko fallback):', cgData.solana.usd);
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch SOL price:', error);
        // Use reasonable fallback
        setSolPriceUsd(220);
      }
    };
    
    fetchSolPrice();
    const interval = setInterval(fetchSolPrice, 30000);
    return () => clearInterval(interval);
  }, []);

  // Look up token by contract address
  const lookupTokenByAddress = async (address: string) => {
    if (!address || address.length < 32) return;
    
    setIsLookingUp(true);
    try {
      const response = await fetch(`/api/solana/token/${address}`);
      if (response.ok) {
        const data = await response.json();
        // API returns token data directly (not wrapped in .token)
        if (data.address && data.symbol) {
          setLookupToken({
            address: data.address,
            symbol: data.symbol,
            name: data.name,
            decimals: data.decimals,
            logoURI: data.logoURI,
          });
        }
      }
    } catch (error) {
      console.error('Token lookup failed:', error);
    } finally {
      setIsLookingUp(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (tokenSearchQuery.length >= 32) {
        lookupTokenByAddress(tokenSearchQuery);
      } else {
        setLookupToken(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [tokenSearchQuery]);

  const selectToken = (token: SolanaToken) => {
    setSelectedToken(token);
    setIsTokenDialogOpen(false);
    setTokenSearchQuery('');
    setLookupToken(null);
    onTokenChange?.(token);
  };

  const calculateAmounts = () => {
    if (!selectedToken || !solAmount || !targetPrice || !solPriceUsd) return null;
    
    const solAmountNum = parseFloat(solAmount);
    const targetPriceNum = parseFloat(targetPrice);
    
    if (isNaN(solAmountNum) || isNaN(targetPriceNum) || solAmountNum <= 0 || targetPriceNum <= 0) {
      return null;
    }

    if (orderType === 'buy') {
      // Buy: Spend SOL to get tokens at target USD price
      // USD value = SOL amount * SOL price
      // Token amount = USD value / target price per token
      const usdValue = solAmountNum * solPriceUsd;
      const tokenAmount = usdValue / targetPriceNum;
      
      const makingAmount = Math.floor(solAmountNum * Math.pow(10, SOL_DECIMALS)).toString();
      const takingAmount = Math.floor(tokenAmount * Math.pow(10, selectedToken.decimals)).toString();
      
      return {
        inputMint: SOL_MINT,
        outputMint: selectedToken.address,
        makingAmount,
        takingAmount,
        displayMaking: solAmountNum,
        displayTaking: tokenAmount,
        usdValue,
      };
    } else {
      // Sell: Sell tokens to get SOL at target USD price
      // USD value = token amount * target price
      // SOL received = USD value / SOL price
      const tokenAmountNum = parseFloat(solAmount);
      const usdValue = tokenAmountNum * targetPriceNum;
      const solReceived = usdValue / solPriceUsd;
      
      // Use floor and subtract 1 to ensure we never exceed available balance
      // This prevents "insufficient funds" errors from rounding
      const rawMakingAmount = Math.floor(tokenAmountNum * Math.pow(10, selectedToken.decimals));
      const makingAmount = Math.max(1, rawMakingAmount - 1).toString();
      const takingAmount = Math.floor(solReceived * Math.pow(10, SOL_DECIMALS)).toString();
      
      return {
        inputMint: selectedToken.address,
        outputMint: SOL_MINT,
        makingAmount,
        takingAmount,
        displayMaking: tokenAmountNum,
        displayTaking: solReceived,
        usdValue,
      };
    }
  };

  const handleCreateOrder = async () => {
    if (!publicKey || !signTransaction) {
      toast({
        variant: 'destructive',
        title: 'Wallet not connected',
        description: 'Please connect your Solana wallet first',
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

    setIsCreating(true);
    
    try {
      console.log('🌞 Creating Solana limit order (escrow-based):', {
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
        description: 'Creating escrow deposit transaction',
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

      const prepareData = await prepareResponse.json();
      
      if (!prepareData.success || !prepareData.transaction) {
        throw new Error(prepareData.error || 'Failed to prepare deposit');
      }

      console.log('📝 Deposit transaction ready, escrow:', prepareData.escrowAddress?.slice(0, 12) + '...');

      // Step 2: User signs the deposit transaction
      toast({
        title: 'Sign deposit',
        description: 'Please approve the deposit to escrow in your wallet',
      });

      const transactionBuffer = Buffer.from(prepareData.transaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuffer);

      const signedTx = await signTransaction(transaction);

      // Step 3: Send deposit transaction
      toast({
        title: 'Sending deposit...',
        description: 'Confirming on Solana network',
      });

      const serializedTx = Buffer.from(signedTx.serialize()).toString('base64');
      
      const sendResponse = await apiRequest('POST', '/api/solana/send-transaction', {
        signedTransaction: serializedTx
      });
      
      const sendData = await sendResponse.json();
      
      if (!sendData.success || !sendData.signature) {
        throw new Error(sendData.error || 'Failed to send deposit transaction');
      }
      
      console.log('✅ Deposit confirmed:', sendData.signature);

      // Step 4: Create the limit order with deposit signature
      toast({
        title: 'Creating order...',
        description: 'Registering limit order with deposit',
      });

      const createResponse = await apiRequest('POST', '/api/solana/limit-order/create', {
        inputMint: amounts.inputMint,
        outputMint: amounts.outputMint,
        inputSymbol: orderType === 'buy' ? 'SOL' : selectedToken.symbol,
        outputSymbol: orderType === 'buy' ? selectedToken.symbol : 'SOL',
        maker: publicKey,
        makingAmount: amounts.makingAmount,
        takingAmount: amounts.takingAmount,
        targetPrice,
        orderType,
        depositTxSignature: sendData.signature,
        tokenDecimals: selectedToken.decimals,
      });

      const createData = await createResponse.json();
      
      if (!createData.success) {
        throw new Error(createData.error || 'Failed to create order');
      }
      
      console.log('✅ Limit order created:', createData.orderId);

      toast({
        title: 'Order created!',
        description: 'Your limit order is active. It will auto-execute when target price is reached.',
      });

      refreshBalance();
      refetchOrders();
      setSolAmount('');
      setTargetPrice('');

    } catch (error: any) {
      console.error('Error creating Solana limit order:', error);
      toast({
        variant: 'destructive',
        title: 'Order failed',
        description: error.message || 'Failed to create limit order',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!publicKey) return;
    
    setCancellingOrder(orderId);
    
    try {
      // Cancel order and request refund from escrow
      const response = await apiRequest('POST', '/api/solana/limit-order/cancel', {
        orderId,
        wallet: publicKey,
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to cancel order');
      }

      toast({
        title: 'Order cancelled',
        description: data.refundSignature 
          ? 'Your funds have been refunded to your wallet'
          : 'Order cancelled successfully',
      });

      refreshBalance();
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

  const filteredTokens = (trendingTokens || []).filter(token => 
    token.symbol.toLowerCase().includes(tokenSearchQuery.toLowerCase()) ||
    token.name.toLowerCase().includes(tokenSearchQuery.toLowerCase()) ||
    token.address.toLowerCase().includes(tokenSearchQuery.toLowerCase())
  );

  const amounts = calculateAmounts();

  // Format token amounts for display
  const formatTokenAmount = (amount: string, decimals: number) => {
    const num = Number(amount) / Math.pow(10, decimals);
    if (num < 0.0001) return num.toExponential(4);
    return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  return (
    <div className="space-y-4">
      {/* Jupiter Badge */}
      <div className="flex items-center gap-2 justify-center">
        <Badge variant="outline" className="bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border-orange-500/30">
          <Shield className="w-3 h-3 mr-1 text-orange-400" />
          Jupiter On-Chain Orders
        </Badge>
        <Badge variant="outline" className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30">
          <Zap className="w-3 h-3 mr-1 text-green-400" />
          Auto-Execute
        </Badge>
      </div>

      {/* Wallet Connection */}
      {!isConnected ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground mb-4">Connect your Solana wallet to use limit orders</p>
          <Button onClick={() => connect()} data-testid="button-connect-wallet">
            Connect Wallet
          </Button>
        </Card>
      ) : (
        <>
          {/* Order Type Toggle */}
          <div className="flex gap-2">
            <Button
              variant={orderType === 'buy' ? 'default' : 'outline'}
              className={`flex-1 ${orderType === 'buy' ? 'bg-green-600 hover:bg-green-700' : ''}`}
              onClick={() => setOrderType('buy')}
              data-testid="button-order-buy"
            >
              Buy
            </Button>
            <Button
              variant={orderType === 'sell' ? 'default' : 'outline'}
              className={`flex-1 ${orderType === 'sell' ? 'bg-red-600 hover:bg-red-700' : ''}`}
              onClick={() => setOrderType('sell')}
              data-testid="button-order-sell"
            >
              Sell
            </Button>
          </div>

          {/* Token Selection */}
          <div>
            <Label>Token</Label>
            <Button
              variant="outline"
              className="w-full justify-between mt-1"
              onClick={() => setIsTokenDialogOpen(true)}
              data-testid="button-select-token"
            >
              {selectedToken ? (
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={selectedToken.logoURI} />
                    <AvatarFallback>{selectedToken.symbol.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span>{selectedToken.symbol}</span>
                  {currentPrice && (
                    <span className="text-muted-foreground text-sm ml-2">
                      ${currentPrice.toFixed(6)}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">Select token</span>
              )}
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>

          {/* Amount Input */}
          <div>
            <Label>{orderType === 'buy' ? 'SOL Amount' : 'Token Amount'}</Label>
            <div className="relative mt-1">
              <Input
                type="number"
                placeholder={orderType === 'buy' ? '0.0 SOL' : '0.0'}
                value={solAmount}
                onChange={(e) => setSolAmount(e.target.value)}
                data-testid="input-amount"
              />
            </div>
            {/* Buy mode: show SOL balance */}
            {orderType === 'buy' && balance !== null && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">
                  Balance: {Number(balance).toFixed(4)} SOL
                </p>
                <div className="flex gap-1">
                  {[25, 50, 75, 100].map((pct) => (
                    <Button
                      key={pct}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-7"
                      onClick={() => {
                        const maxAmount = Math.max(0, Number(balance) - 0.01);
                        const amount = (maxAmount * pct / 100).toFixed(6);
                        setSolAmount(amount);
                      }}
                      data-testid={`button-percent-${pct}`}
                    >
                      {pct === 100 ? 'MAX' : `${pct}%`}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {/* Sell mode: show token balance */}
            {orderType === 'sell' && selectedToken && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">
                  {isLoadingTokenBalance ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading balance...
                    </span>
                  ) : (
                    <>Balance: {tokenBalance ? Number(tokenBalance).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '0'} {selectedToken.symbol}</>
                  )}
                </p>
                {tokenBalance && Number(tokenBalance) > 0 && (
                  <div className="flex gap-1">
                    {[25, 50, 75, 100].map((pct) => (
                      <Button
                        key={pct}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-7"
                        onClick={() => {
                          // Use floor to avoid rounding up which causes insufficient funds
                          const rawAmount = Number(tokenBalance) * pct / 100;
                          // Floor to 9 decimal places (token precision) then format
                          const flooredAmount = Math.floor(rawAmount * 1e9) / 1e9;
                          // For MAX, subtract tiny epsilon to ensure we don't exceed balance
                          const finalAmount = pct === 100 ? flooredAmount * 0.9999 : flooredAmount;
                          setSolAmount(finalAmount.toFixed(6));
                        }}
                        data-testid={`button-sell-percent-${pct}`}
                      >
                        {pct === 100 ? 'MAX' : `${pct}%`}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Target Price */}
          <div>
            <Label>Target Price (USD)</Label>
            <Input
              type="number"
              placeholder="0.0"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              className="mt-1"
              data-testid="input-target-price"
            />
            {currentPrice && (
              <p className="text-xs text-muted-foreground mt-1">
                Current: ${currentPrice.toFixed(6)}
                {targetPrice && parseFloat(targetPrice) > 0 && (
                  <span className={parseFloat(targetPrice) < currentPrice ? ' text-green-400' : ' text-red-400'}>
                    {' '}({((parseFloat(targetPrice) - currentPrice) / currentPrice * 100).toFixed(1)}%)
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Order Preview */}
          {amounts && (
            <Card className="p-3 bg-muted/50">
              <p className="text-sm text-muted-foreground mb-2">Order Preview</p>
              <div className="flex items-center justify-between text-sm">
                <span>
                  {orderType === 'buy' ? 'Spend' : 'Sell'}: {amounts.displayMaking.toFixed(6)} {orderType === 'buy' ? 'SOL' : selectedToken?.symbol}
                </span>
                <span>→</span>
                <span>
                  {orderType === 'buy' ? 'Receive' : 'Get'}: {
                    amounts.displayTaking < 0.0001 
                      ? amounts.displayTaking.toExponential(4)
                      : amounts.displayTaking.toLocaleString(undefined, { maximumFractionDigits: 6 })
                  } {orderType === 'buy' ? selectedToken?.symbol : 'SOL'}
                </span>
              </div>
              {amounts.usdValue && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  ≈ ${amounts.usdValue < 0.01 ? amounts.usdValue.toFixed(6) : amounts.usdValue.toFixed(2)} USD
                </p>
              )}
            </Card>
          )}
          
          {/* SOL Price Info */}
          {solPriceUsd && (
            <p className="text-xs text-muted-foreground text-center">
              SOL Price: ${solPriceUsd.toFixed(2)}
            </p>
          )}

          {/* Create Order Button */}
          <Button
            className="w-full"
            disabled={!selectedToken || !solAmount || !targetPrice || isCreating}
            onClick={handleCreateOrder}
            data-testid="button-create-order"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Target className="w-4 h-4 mr-2" />
                Create Limit Order
              </>
            )}
          </Button>

          {/* Open Orders */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Your Limit Orders</h3>
              <Button variant="ghost" size="sm" onClick={() => refetchOrders()} data-testid="button-refresh-orders">
                <RefreshCw className={`w-4 h-4 ${isLoadingOrders ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {isLoadingOrders ? (
              <div className="text-center py-4">
                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
              </div>
            ) : solanaOrders && solanaOrders.length > 0 ? (
              <div className="space-y-2">
                {solanaOrders.map((order) => (
                  <Card key={order.id} className="p-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={order.orderType === 'buy' ? 'default' : 'destructive'} className="text-xs">
                            {order.orderType.toUpperCase()}
                          </Badge>
                          <span className="text-sm font-medium">{order.tokenSymbol}</span>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            order.status === 'filled' ? 'text-green-400 border-green-400' :
                            order.status === 'cancelled' ? 'text-gray-400' :
                            order.status === 'failed' ? 'text-red-400 border-red-400' :
                            'text-yellow-400 border-yellow-400'
                          }`}
                        >
                          {order.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <p>Target: ${parseFloat(order.targetPrice).toFixed(6)}</p>
                        {order.orderType === 'buy' ? (
                          <p>Spend: {formatTokenAmount(order.makingAmount || '0', 9)} SOL</p>
                        ) : (
                          <p>Sell: {formatTokenAmount(order.makingAmount || '0', order.tokenDecimals || 9)} {order.tokenSymbol}</p>
                        )}
                        {order.orderType === 'buy' ? (
                          <p>Get: {formatTokenAmount(order.takingAmount || '0', order.tokenDecimals || 9)} {order.tokenSymbol}</p>
                        ) : (
                          <p>Get: {formatTokenAmount(order.takingAmount || '0', 9)} SOL</p>
                        )}
                      </div>
                      {/* Action buttons based on status */}
                      <div className="flex gap-2 mt-1">
                        {(order.status === 'pending' || order.status === 'fillable') && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs"
                            onClick={() => handleCancelOrder(order.id)}
                            disabled={cancellingOrder === order.id}
                            data-testid={`button-cancel-order-${order.id.slice(0, 8)}`}
                          >
                            {cancellingOrder === order.id ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Ban className="w-3 h-3 mr-1" />
                            )}
                            Cancel & Withdraw
                          </Button>
                        )}
                        {order.status === 'failed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs text-yellow-400"
                            onClick={() => handleCancelOrder(order.id)}
                            disabled={cancellingOrder === order.id}
                            data-testid={`button-withdraw-order-${order.id.slice(0, 8)}`}
                          >
                            {cancellingOrder === order.id ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Wallet className="w-3 h-3 mr-1" />
                            )}
                            Withdraw Funds
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">No active orders</p>
            )}
          </div>
        </>
      )}

      {/* Token Selection Dialog */}
      <Dialog open={isTokenDialogOpen} onOpenChange={setIsTokenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Token</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Search by name, symbol, or paste contract address..."
            value={tokenSearchQuery}
            onChange={(e) => setTokenSearchQuery(e.target.value)}
            className="mb-4"
            data-testid="input-token-search"
          />
          <ScrollArea className="h-[300px]">
            {isLookingUp && (
              <div className="flex items-center gap-2 p-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Looking up token...</span>
              </div>
            )}
            {lookupToken && (
              <div
                className="flex items-center gap-3 p-2 hover:bg-muted rounded cursor-pointer border-b"
                onClick={() => selectToken(lookupToken)}
              >
                <Avatar className="w-8 h-8">
                  <AvatarImage src={lookupToken.logoURI} />
                  <AvatarFallback>{lookupToken.symbol.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{lookupToken.symbol}</p>
                  <p className="text-xs text-muted-foreground">{lookupToken.name}</p>
                </div>
                <Badge variant="outline" className="ml-auto">Found</Badge>
              </div>
            )}
            {filteredTokens.map((token) => (
              <div
                key={token.address}
                className="flex items-center gap-3 p-2 hover:bg-muted rounded cursor-pointer"
                onClick={() => selectToken(token)}
                data-testid={`token-option-${token.symbol}`}
              >
                <Avatar className="w-8 h-8">
                  <AvatarImage src={token.logoURI} />
                  <AvatarFallback>{token.symbol.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{token.symbol}</p>
                  <p className="text-xs text-muted-foreground">{token.name}</p>
                </div>
              </div>
            ))}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
