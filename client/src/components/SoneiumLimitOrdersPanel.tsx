import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Target, Loader2, ChevronDown, X, ArrowDown, RefreshCw, Vault } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/contexts/WalletContext';
import { ethers } from 'ethers';

const SONEIUM_CHAIN_ID = 1868;
const SONEIUM_RPC = 'https://rpc.soneium.org';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

interface SoneiumToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

interface SoneiumLimitOrder {
  id: string;
  orderType: string;
  tokenSymbol: string;
  tokenAddress: string;
  targetPrice: string;
  ethAmount: string | null;
  tokenAmount: string;
  totalValue: string | null;
  status: string;
  depositTxHash: string | null;
  createdAt: string;
}

interface SoneiumLimitOrdersPanelProps {
  onTokenChange?: (token: SoneiumToken | null) => void;
}

const EXECUTOR_VAULT_V3_ABI = [
  'function deposit(address token, uint256 amount) external',
  'function balances(address user, address token) external view returns (uint256)',
];

const WETH_ABI = [
  'function deposit() external payable',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
];

const FALLBACK_SONEIUM_TOKENS: SoneiumToken[] = [
  {
    address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
  },
  {
    address: WETH_ADDRESS,
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
  },
];

export function SoneiumLimitOrdersPanel({ onTokenChange }: SoneiumLimitOrdersPanelProps) {
  const { walletAddress, isWalletConnected, connectWallet } = useWallet();
  const { toast } = useToast();

  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [selectedToken, setSelectedToken] = useState<SoneiumToken | null>(null);
  const [amount, setAmount] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  const [cancellingOrder, setCancellingOrder] = useState<string | null>(null);
  const [lookupToken, setLookupToken] = useState<SoneiumToken | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [ethBalance, setEthBalance] = useState<string>('0');
  const [tokenBalance, setTokenBalance] = useState<string>('0');
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isOnSoneium, setIsOnSoneium] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [vaultWethBalance, setVaultWethBalance] = useState<string>('0');

  const { data: vaultInfo } = useQuery<{ configured: boolean; vaultAddress?: string }>({
    queryKey: ['/api/soneium/limit-order/vault-info'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: tokenList } = useQuery<SoneiumToken[]>({
    queryKey: ['soneiumTokenListLimitOrder'],
    queryFn: async () => {
      const response = await fetch('/api/soneium-tokens');
      if (!response.ok) throw new Error('Failed to fetch Soneium tokens');
      const data = await response.json();
      return data.tokens || FALLBACK_SONEIUM_TOKENS;
    },
    staleTime: 60 * 60 * 1000,
  });

  const { data: ethPriceData } = useQuery<{ price: number }>({
    queryKey: ['/api/eth-price'],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const ethPrice = ethPriceData?.price || 0;

  const { data: tokenPriceData, isLoading: isLoadingTokenPrice } = useQuery<{ price: number; priceChange24h: number | null; liquidity: number | null }>({
    queryKey: ['/api/soneium/token-price', selectedToken?.address],
    queryFn: async () => {
      if (!selectedToken || selectedToken.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' || selectedToken.address.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
        return null;
      }
      const response = await fetch(`/api/soneium/token-price/${selectedToken.address}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!selectedToken && selectedToken.address.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' && selectedToken.address.toLowerCase() !== WETH_ADDRESS.toLowerCase(),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const currentTokenPrice = tokenPriceData?.price || null;

  const { data: openOrders, refetch: refetchOrders, isLoading: isLoadingOrders, isError: isOrdersError } = useQuery<SoneiumLimitOrder[]>({
    queryKey: ['/api/soneium/limit-order/orders', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const response = await fetch(`/api/soneium/limit-order/orders?walletAddress=${walletAddress}`);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to fetch orders');
      }
      const data = await response.json();
      return Array.isArray(data) ? data : (data.orders || []);
    },
    enabled: !!walletAddress,
    refetchInterval: 30000,
    retry: 1,
  });

  const checkSoneiumNetwork = useCallback(async () => {
    if (!isWalletConnected) return;
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) return;
      const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
      const chainId = parseInt(chainIdHex, 16);
      setIsOnSoneium(chainId === SONEIUM_CHAIN_ID);
    } catch (error) {
      console.error('Error checking network:', error);
    }
  }, [isWalletConnected]);

  useEffect(() => {
    checkSoneiumNetwork();
  }, [checkSoneiumNetwork]);

  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;
    const handleChainChanged = (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      setIsOnSoneium(chainId === SONEIUM_CHAIN_ID);
      if (chainId === SONEIUM_CHAIN_ID) {
        fetchBalances();
      }
    };
    ethereum.on('chainChanged', handleChainChanged);
    return () => {
      ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [walletAddress]);

  const switchToSoneium = async () => {
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        toast({
          title: 'Wallet Not Found',
          description: 'Please install MetaMask or another Web3 wallet',
          variant: 'destructive',
        });
        return;
      }
      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${SONEIUM_CHAIN_ID.toString(16)}` }],
        });
        setIsOnSoneium(true);
        toast({ title: 'Switched to Soneium', description: 'You are now connected to Soneium network' });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${SONEIUM_CHAIN_ID.toString(16)}`,
              chainName: 'Soneium Mainnet',
              nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
              rpcUrls: [SONEIUM_RPC],
              blockExplorerUrls: ['https://soneium.blockscout.com'],
            }],
          });
          setIsOnSoneium(true);
          toast({ title: 'Soneium Added', description: 'Soneium network has been added to your wallet' });
        } else {
          throw switchError;
        }
      }
    } catch (error: any) {
      console.error('Failed to switch to Soneium:', error);
      toast({ title: 'Network Switch Failed', description: error.message || 'Could not switch to Soneium', variant: 'destructive' });
    }
  };

  const fetchBalances = useCallback(async () => {
    if (!isWalletConnected || !walletAddress) return;
    try {
      const provider = new ethers.JsonRpcProvider(SONEIUM_RPC);
      const balance = await provider.getBalance(walletAddress);
      setEthBalance(ethers.formatEther(balance));

      if (selectedToken && orderType === 'sell' && selectedToken.address.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        setIsLoadingBalance(true);
        try {
          const contract = new ethers.Contract(selectedToken.address, ERC20_ABI, provider);
          const tokenBal = await contract.balanceOf(walletAddress);
          setTokenBalance(ethers.formatUnits(tokenBal, selectedToken.decimals));
        } catch {
          setTokenBalance('0');
        } finally {
          setIsLoadingBalance(false);
        }
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  }, [isWalletConnected, walletAddress, selectedToken, orderType]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const fetchVaultBalance = useCallback(async () => {
    if (!walletAddress || !vaultInfo?.vaultAddress) return;
    try {
      const response = await fetch(`/api/soneium/limit-order/balance?user=${walletAddress}&token=${WETH_ADDRESS}`);
      if (response.ok) {
        const data = await response.json();
        setVaultWethBalance(data.balance || '0');
      }
    } catch (error) {
      console.error('Error fetching vault balance:', error);
    }
  }, [walletAddress, vaultInfo?.vaultAddress]);

  useEffect(() => {
    fetchVaultBalance();
    const interval = setInterval(fetchVaultBalance, 30000);
    return () => clearInterval(interval);
  }, [fetchVaultBalance]);

  const handleWithdraw = async (tokenAddr: string) => {
    if (!walletAddress) return;
    setIsWithdrawing(true);
    try {
      const response = await apiRequest('POST', '/api/soneium/limit-order/withdraw', {
        walletAddress,
        tokenAddress: tokenAddr,
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      toast({
        title: 'Withdrawal successful',
        description: `${data.formattedAmount} WETH withdrawn. Tx: ${data.txHash?.slice(0, 10)}...`,
      });
      fetchVaultBalance();
      fetchBalances();
    } catch (error: any) {
      console.error('Withdrawal error:', error);
      toast({ variant: 'destructive', title: 'Withdrawal failed', description: error.message || 'Failed to withdraw' });
    } finally {
      setIsWithdrawing(false);
    }
  };

  useEffect(() => {
    const isEthAddress = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s.trim());
    if (tokenSearchQuery && isEthAddress(tokenSearchQuery)) {
      const lookupAddress = async () => {
        setIsLookingUp(true);
        try {
          const response = await fetch(`/api/soneium/token/${tokenSearchQuery.trim()}`);
          if (response.ok) {
            const token = await response.json();
            setLookupToken(token);
            toast({ title: 'Token Found', description: `${token.symbol} - ${token.name}` });
          } else {
            setLookupToken(null);
          }
        } catch {
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

  const setPercentageAmount = (percentage: number) => {
    if (orderType === 'buy') {
      const bal = parseFloat(ethBalance);
      if (bal > 0) {
        const val = percentage === 100 ? (bal * 0.99).toFixed(6) : (bal * percentage / 100).toFixed(6);
        setAmount(val);
      }
    } else if (orderType === 'sell') {
      const bal = parseFloat(tokenBalance);
      if (bal > 0) {
        setAmount((bal * percentage / 100).toFixed(6));
      }
    }
  };

  const filteredTokens = useMemo(() => {
    const tokens = tokenList || FALLBACK_SONEIUM_TOKENS;
    let filtered = tokens.filter(token =>
      token.symbol.toLowerCase().includes(tokenSearchQuery.toLowerCase()) ||
      token.name.toLowerCase().includes(tokenSearchQuery.toLowerCase()) ||
      token.address.toLowerCase().includes(tokenSearchQuery.toLowerCase())
    ).slice(0, 50);

    if (lookupToken && !filtered.find(t => t.address.toLowerCase() === lookupToken.address.toLowerCase())) {
      filtered = [lookupToken, ...filtered];
    }
    return filtered;
  }, [tokenList, tokenSearchQuery, lookupToken]);

  const handleSelectToken = (token: SoneiumToken) => {
    setSelectedToken(token);
    setIsTokenDialogOpen(false);
    setTokenSearchQuery('');
    if (onTokenChange) {
      onTokenChange(token);
    }
  };

  const calculatedReceiveAmount = useMemo(() => {
    if (!amount || !targetPrice || !ethPrice || !selectedToken) return null;
    const amountVal = parseFloat(amount);
    const priceVal = parseFloat(targetPrice);
    if (amountVal <= 0 || priceVal <= 0 || ethPrice <= 0) return null;

    if (orderType === 'buy') {
      const usdValue = amountVal * ethPrice;
      const tokenAmount = usdValue / priceVal;
      return { display: tokenAmount.toFixed(6), symbol: selectedToken.symbol, totalValue: usdValue };
    } else {
      const usdValue = amountVal * priceVal;
      const ethAmount = usdValue / ethPrice;
      return { display: ethAmount.toFixed(6), symbol: 'ETH', totalValue: usdValue };
    }
  }, [amount, targetPrice, ethPrice, selectedToken, orderType]);

  const handleCreateOrder = async () => {
    if (!isWalletConnected || !walletAddress) {
      toast({ variant: 'destructive', title: 'Wallet not connected', description: 'Please connect your wallet first' });
      return;
    }
    if (!selectedToken) {
      toast({ variant: 'destructive', title: 'No token selected', description: 'Please select a token for the limit order' });
      return;
    }
    if (!amount || !targetPrice) {
      toast({ variant: 'destructive', title: 'Invalid input', description: 'Please enter valid amounts and target price' });
      return;
    }
    if (!vaultInfo?.configured || !vaultInfo?.vaultAddress) {
      toast({ variant: 'destructive', title: 'Vault not configured', description: 'Soneium limit orders are not yet available' });
      return;
    }

    setIsCreatingOrder(true);

    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error('Please install MetaMask or another Web3 wallet');

      const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
      if (parseInt(chainIdHex, 16) !== SONEIUM_CHAIN_ID) {
        toast({ title: 'Switching network...', description: 'Please approve the network switch to Soneium' });
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${SONEIUM_CHAIN_ID.toString(16)}` }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${SONEIUM_CHAIN_ID.toString(16)}`,
                chainName: 'Soneium Mainnet',
                nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
                rpcUrls: [SONEIUM_RPC],
                blockExplorerUrls: ['https://soneium.blockscout.com'],
              }],
            });
          } else {
            throw new Error('Please switch to Soneium network to create the order');
          }
        }
        setIsOnSoneium(true);
      }

      const browserProvider = new ethers.BrowserProvider(ethereum);
      const signer = await browserProvider.getSigner();
      const vaultAddress = vaultInfo.vaultAddress;
      const amountVal = parseFloat(amount);

      let depositTxHash: string;

      if (orderType === 'buy') {
        const weiAmount = ethers.parseEther(amount);

        toast({ title: 'Wrapping ETH...', description: 'Wrapping ETH to WETH on Soneium' });
        const wethContract = new ethers.Contract(WETH_ADDRESS, WETH_ABI, signer);
        const wrapTx = await wethContract.deposit({ value: weiAmount });
        await wrapTx.wait();

        toast({ title: 'Approving WETH...', description: 'Approving WETH for vault deposit' });
        const approveTx = await wethContract.approve(vaultAddress, weiAmount);
        await approveTx.wait();

        toast({ title: 'Depositing to vault...', description: 'Depositing WETH to ExecutorVault' });
        const vaultContract = new ethers.Contract(vaultAddress, EXECUTOR_VAULT_V3_ABI, signer);
        const depositTx = await vaultContract.deposit(WETH_ADDRESS, weiAmount);
        const receipt = await depositTx.wait();
        depositTxHash = receipt.hash;
      } else {
        const tokenAmountWei = ethers.parseUnits(amount, selectedToken.decimals);

        toast({ title: 'Approving token...', description: `Approving ${selectedToken.symbol} for vault deposit` });
        const tokenContract = new ethers.Contract(selectedToken.address, ERC20_ABI, signer);
        const approveTx = await tokenContract.approve(vaultAddress, tokenAmountWei);
        await approveTx.wait();

        toast({ title: 'Depositing to vault...', description: `Depositing ${selectedToken.symbol} to ExecutorVault` });
        const vaultContract = new ethers.Contract(vaultAddress, EXECUTOR_VAULT_V3_ABI, signer);
        const depositTx = await vaultContract.deposit(selectedToken.address, tokenAmountWei);
        const receipt = await depositTx.wait();
        depositTxHash = receipt.hash;
      }

      toast({ title: 'Creating order...', description: 'Registering limit order on backend' });

      const receiveAmount = calculatedReceiveAmount;
      const ethAmountStr = orderType === 'buy' ? amount : (receiveAmount?.display || '0');
      const tokenAmountStr = orderType === 'buy' ? (receiveAmount?.display || '0') : amount;

      await apiRequest('POST', '/api/soneium/limit-order/create', {
        tokenAddress: selectedToken.address,
        tokenSymbol: selectedToken.symbol,
        orderType,
        targetPrice,
        ethAmount: ethAmountStr,
        tokenAmount: tokenAmountStr,
        totalValue: receiveAmount?.totalValue?.toString() || '0',
        depositTxHash,
        tokenDecimals: selectedToken.decimals,
        walletAddress,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/soneium/limit-order/orders'] });

      toast({ title: 'Order created!', description: 'Your Soneium limit order is now being monitored.' });

      setAmount('');
      setTargetPrice('');
      fetchBalances();
      refetchOrders();
    } catch (error: any) {
      console.error('Error creating Soneium limit order:', error);
      toast({ variant: 'destructive', title: 'Order failed', description: error.message || 'Failed to create limit order' });
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!walletAddress) return;
    setCancellingOrder(orderId);
    try {
      const response = await apiRequest('POST', '/api/soneium/limit-order/cancel', { orderId, walletAddress });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      const withdrawMsg = data.withdrawal 
        ? `Funds auto-withdrawn (${data.withdrawal.amount} WETH)` 
        : 'Your Soneium limit order has been cancelled';
      toast({ title: 'Order cancelled', description: withdrawMsg });
      fetchVaultBalance();
      refetchOrders();
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      toast({ variant: 'destructive', title: 'Cancel failed', description: error.message || 'Failed to cancel order' });
    } finally {
      setCancellingOrder(null);
    }
  };

  const getStatusBadgeVariant = (status: string): 'default' | 'secondary' | 'outline' | 'destructive' => {
    switch (status) {
      case 'pending': return 'outline';
      case 'filled': return 'default';
      case 'cancelled': return 'secondary';
      case 'failed': return 'destructive';
      default: return 'outline';
    }
  };

  if (!isWalletConnected) {
    return (
      <Card className="p-6 text-center" data-testid="card-soneium-limit-not-connected">
        <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-bold mb-2" data-testid="text-soneium-limit-title">Soneium Limit Orders</h3>
        <p className="text-muted-foreground text-sm mb-4" data-testid="text-soneium-limit-description">
          Connect your wallet to place limit orders on Soneium
        </p>
        <Button onClick={() => connectWallet()} data-testid="button-connect-soneium-limit">
          Connect Wallet
        </Button>
      </Card>
    );
  }

  if (vaultInfo && !vaultInfo.configured) {
    return (
      <Card className="p-6 text-center" data-testid="card-soneium-limit-coming-soon">
        <Vault className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-bold mb-2" data-testid="text-soneium-coming-soon-title">Soneium Limit Orders</h3>
        <p className="text-muted-foreground text-sm mb-4" data-testid="text-soneium-coming-soon-description">
          Soneium limit orders coming soon
        </p>
      </Card>
    );
  }

  if (!isOnSoneium) {
    return (
      <Card className="p-6 text-center" data-testid="card-soneium-limit-wrong-network">
        <Target className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
        <h3 className="text-lg font-bold mb-2">Switch to Soneium</h3>
        <p className="text-muted-foreground text-sm mb-4">
          Please switch your wallet to the Soneium network to use limit orders
        </p>
        <Button onClick={switchToSoneium} data-testid="button-switch-soneium-limit">
          Switch to Soneium
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="container-soneium-limit-orders">
      <Card className="p-4 sm:p-6" data-testid="card-create-soneium-order">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h3 className="font-bold" data-testid="text-create-order-title">Create Limit Order</h3>
          </div>
          <div className="flex items-center gap-2">
            <Vault className="h-4 w-4 text-muted-foreground" />
            <Badge variant="outline" className="text-xs" data-testid="badge-vault-type">
              Vault + Auto-Execute
            </Badge>
          </div>
        </div>

        <div className="text-xs text-muted-foreground mb-4 p-2 bg-muted/50 rounded-lg" data-testid="text-vault-info">
          Your funds will be deposited to the Soneium vault and automatically swapped when target price is reached.
        </div>

        <div className="flex gap-2 mb-4">
          <Button
            variant={orderType === 'buy' ? 'default' : 'outline'}
            onClick={() => setOrderType('buy')}
            className="flex-1"
            data-testid="button-soneium-order-type-buy"
          >
            Buy
          </Button>
          <Button
            variant={orderType === 'sell' ? 'default' : 'outline'}
            onClick={() => setOrderType('sell')}
            className="flex-1"
            data-testid="button-soneium-order-type-sell"
          >
            Sell
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground mb-1">Token</Label>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => setIsTokenDialogOpen(true)}
              data-testid="button-select-token-soneium"
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
            <div className="flex justify-between items-center mb-1 flex-wrap gap-1">
              <Label className="text-sm text-muted-foreground">
                {orderType === 'buy' ? 'ETH to spend' : `${selectedToken?.symbol || 'Tokens'} to sell`}
              </Label>
              <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-balance-display">
                {orderType === 'buy' && (
                  <>Balance: {parseFloat(ethBalance).toFixed(6)} ETH</>
                )}
                {orderType === 'sell' && selectedToken && (
                  isLoadingBalance ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Loading...</>
                  ) : (
                    <>Balance: {parseFloat(tokenBalance).toFixed(6)} {selectedToken.symbol}</>
                  )
                )}
              </span>
            </div>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-lg"
              data-testid="input-soneium-amount"
            />
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPercentageAmount(25)}
                disabled={orderType === 'buy' ? parseFloat(ethBalance) <= 0 : parseFloat(tokenBalance) <= 0}
                data-testid="button-soneium-amount-25"
              >
                25%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPercentageAmount(50)}
                disabled={orderType === 'buy' ? parseFloat(ethBalance) <= 0 : parseFloat(tokenBalance) <= 0}
                data-testid="button-soneium-amount-50"
              >
                50%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPercentageAmount(75)}
                disabled={orderType === 'buy' ? parseFloat(ethBalance) <= 0 : parseFloat(tokenBalance) <= 0}
                data-testid="button-soneium-amount-75"
              >
                75%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPercentageAmount(100)}
                disabled={orderType === 'buy' ? parseFloat(ethBalance) <= 0 : parseFloat(tokenBalance) <= 0}
                data-testid="button-soneium-amount-max"
              >
                MAX
              </Button>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="h-5 w-5 text-muted-foreground" />
          </div>

          {selectedToken && currentTokenPrice !== null && (
            <Card className="p-3 bg-muted/50" data-testid="card-current-token-price">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={selectedToken.logoURI} />
                    <AvatarFallback>{selectedToken.symbol.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{selectedToken.symbol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" data-testid="text-token-current-price">
                    ${currentTokenPrice < 0.01 ? currentTokenPrice.toFixed(8) : currentTokenPrice < 1 ? currentTokenPrice.toFixed(6) : currentTokenPrice.toFixed(4)}
                  </span>
                  {tokenPriceData?.priceChange24h !== null && tokenPriceData?.priceChange24h !== undefined && (
                    <span className={`text-xs font-medium ${tokenPriceData.priceChange24h >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-token-price-change">
                      {tokenPriceData.priceChange24h >= 0 ? '+' : ''}{tokenPriceData.priceChange24h.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
              {currentTokenPrice > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 text-xs text-muted-foreground"
                  onClick={() => setTargetPrice(currentTokenPrice < 0.01 ? currentTokenPrice.toFixed(8) : currentTokenPrice < 1 ? currentTokenPrice.toFixed(6) : currentTokenPrice.toFixed(4))}
                  data-testid="button-use-current-price"
                >
                  Use current price as target
                </Button>
              )}
            </Card>
          )}

          {selectedToken && isLoadingTokenPrice && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Fetching {selectedToken.symbol} price...</span>
            </div>
          )}

          <div>
            <Label className="text-sm text-muted-foreground mb-1">
              Target price (USD per {selectedToken?.symbol || 'token'})
            </Label>
            <Input
              type="number"
              placeholder="0.00"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              className="text-lg"
              data-testid="input-soneium-target-price"
            />
            {ethPrice > 0 && (
              <p className="text-xs text-muted-foreground mt-1" data-testid="text-current-eth-price">
                Current ETH: ${ethPrice.toFixed(2)}
              </p>
            )}
          </div>

          {calculatedReceiveAmount && selectedToken && (
            <Card className="p-3 bg-muted/50" data-testid="card-order-summary">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">You will receive:</span>
                <span className="font-medium" data-testid="text-receive-amount">
                  ~{calculatedReceiveAmount.display} {calculatedReceiveAmount.symbol}
                </span>
              </div>
            </Card>
          )}

          <Button
            className="w-full"
            onClick={handleCreateOrder}
            disabled={isCreatingOrder || !selectedToken || !amount || !targetPrice}
            data-testid="button-create-soneium-limit-order"
          >
            {isCreatingOrder ? (
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

      {walletAddress && vaultWethBalance !== '0' && BigInt(vaultWethBalance) > BigInt(0) && (
        <Card className="p-4 sm:p-6 border-yellow-500/50" data-testid="card-vault-balance">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Vault className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium" data-testid="text-vault-balance-label">Vault Balance</span>
              </div>
              <span className="text-lg font-bold" data-testid="text-vault-weth-amount">
                {parseFloat(ethers.formatEther(vaultWethBalance)).toFixed(6)} WETH
              </span>
              {ethPrice > 0 && (
                <span className="text-xs text-muted-foreground" data-testid="text-vault-usd-value">
                  ${(parseFloat(ethers.formatEther(vaultWethBalance)) * ethPrice).toFixed(2)} USD
                </span>
              )}
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => handleWithdraw(WETH_ADDRESS)}
              disabled={isWithdrawing}
              data-testid="button-withdraw-vault"
            >
              {isWithdrawing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {isWithdrawing ? 'Withdrawing...' : 'Withdraw WETH'}
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-4 sm:p-6" data-testid="card-soneium-open-orders">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h3 className="font-bold" data-testid="text-open-orders-title">Open Orders</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetchOrders()}
            disabled={isLoadingOrders}
            data-testid="button-refresh-soneium-orders"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingOrders ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {isLoadingOrders ? (
          <div className="text-center py-8" data-testid="loader-orders">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
          </div>
        ) : isOrdersError ? (
          <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-orders-error">
            Failed to load orders.{' '}
            <Button variant="ghost" size="sm" onClick={() => refetchOrders()} data-testid="button-retry-orders">
              Retry
            </Button>
          </div>
        ) : openOrders && openOrders.length > 0 ? (
          <div className="space-y-3" data-testid="list-soneium-orders">
            {openOrders.map((order) => (
              <Card key={order.id} className="p-3 bg-muted/30" data-testid={`card-order-${order.id.slice(0, 8)}`}>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={order.orderType === 'buy' ? 'default' : 'secondary'} className="text-xs" data-testid={`badge-order-type-${order.id.slice(0, 8)}`}>
                        {order.orderType.toUpperCase()}
                      </Badge>
                      <span className="text-sm font-medium" data-testid={`text-order-symbol-${order.id.slice(0, 8)}`}>
                        {order.tokenSymbol}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        @ ${parseFloat(order.targetPrice || '0').toFixed(6)}
                      </span>
                    </div>
                    <Badge variant={getStatusBadgeVariant(order.status)} className="text-xs" data-testid={`badge-order-status-${order.id.slice(0, 8)}`}>
                      {order.status}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span data-testid={`text-order-amounts-${order.id.slice(0, 8)}`}>
                      {order.ethAmount ? `${parseFloat(order.ethAmount).toFixed(4)} ETH` : ''}
                      {order.ethAmount && order.tokenAmount ? ' / ' : ''}
                      {order.tokenAmount ? `${parseFloat(order.tokenAmount).toFixed(4)} ${order.tokenSymbol}` : ''}
                    </span>
                    <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                  </div>

                  {(order.status === 'pending' || order.status === 'active') && (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelOrder(order.id)}
                        disabled={cancellingOrder === order.id}
                        data-testid={`button-cancel-soneium-order-${order.id.slice(0, 8)}`}
                      >
                        {cancellingOrder === order.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-orders">
            No open orders
          </div>
        )}
      </Card>

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
            data-testid="input-soneium-token-search"
          />
          <ScrollArea className="h-[300px]">
            <div className="space-y-1">
              {isLookingUp && (
                <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Looking up token...</span>
                </div>
              )}
              {filteredTokens.map((token) => (
                <Button
                  key={token.address}
                  variant="ghost"
                  className={`w-full justify-start ${lookupToken?.address === token.address ? 'bg-primary/10 border border-primary' : ''}`}
                  onClick={() => handleSelectToken(token)}
                  data-testid={`button-soneium-token-${token.symbol}`}
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
                <div className="text-center py-8 text-muted-foreground text-sm space-y-2" data-testid="text-no-tokens-found">
                  <p>No tokens found.</p>
                  <p className="text-xs">Paste a token contract address to look it up.</p>
                  <p className="text-xs opacity-70">Example: 0x4200000000000000000000000000000000000006</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
