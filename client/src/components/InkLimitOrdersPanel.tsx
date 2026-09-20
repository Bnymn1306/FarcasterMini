import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Target, Loader2, ChevronDown, X, RefreshCw, Vault } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/contexts/WalletContext';
import { ethers } from 'ethers';

const INK_CHAIN_ID = 57073;
const INK_RPC = 'https://rpc-gel.inkonchain.com';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

interface InkToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

interface InkLimitOrder {
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

interface InkLimitOrdersPanelProps {
  onTokenChange?: (token: InkToken | null) => void;
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

const FALLBACK_INK_TOKENS: InkToken[] = [
  { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  { address: WETH_ADDRESS, symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
];

export function InkLimitOrdersPanel({ onTokenChange }: InkLimitOrdersPanelProps) {
  const { walletAddress, isWalletConnected, connectWallet } = useWallet();
  const { toast } = useToast();

  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [selectedToken, setSelectedToken] = useState<InkToken | null>(null);
  const [amount, setAmount] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [tokenSearchQuery, setTokenSearchQuery] = useState('');
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState<string | null>(null);
  const [ethBalance, setEthBalance] = useState<string>('0');
  const [tokenBalance, setTokenBalance] = useState<string>('0');
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isOnInk, setIsOnInk] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [vaultWethBalance, setVaultWethBalance] = useState<string>('0');

  const { data: vaultInfo } = useQuery<{ configured: boolean; vaultAddress?: string }>({
    queryKey: ['/api/ink/limit-order/vault-info'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: tokenList } = useQuery<InkToken[]>({
    queryKey: ['inkTokenListLimitOrder'],
    queryFn: async () => {
      const response = await fetch('/api/ink-tokens');
      if (!response.ok) throw new Error('Failed to fetch INK tokens');
      const data = await response.json();
      return data.tokens || FALLBACK_INK_TOKENS;
    },
    staleTime: 60 * 60 * 1000,
  });

  const { data: ethPriceData } = useQuery<{ price: number }>({
    queryKey: ['/api/eth-price'],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const ethPrice = ethPriceData?.price || 0;

  const { data: tokenPriceData } = useQuery<{ price: number; priceChange24h?: number | null }>({
    queryKey: ['/api/ink/token-price', selectedToken?.address],
    queryFn: async () => {
      if (!selectedToken) return null;
      const res = await fetch(`/api/ink/token-price/${selectedToken.address}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedToken && selectedToken.address !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const currentTokenPrice = tokenPriceData?.price ?? null;

  const { data: openOrders, refetch: refetchOrders, isLoading: isLoadingOrders } = useQuery<InkLimitOrder[]>({
    queryKey: ['/api/ink/limit-order/orders', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const response = await fetch(`/api/ink/limit-order/orders?walletAddress=${walletAddress}`);
      if (!response.ok) throw new Error('Failed to fetch orders');
      const data = await response.json();
      return Array.isArray(data) ? data : (data.orders || []);
    },
    enabled: !!walletAddress,
    refetchInterval: 30000,
    retry: 1,
  });

  const checkInkNetwork = useCallback(async () => {
    if (!isWalletConnected) return;
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) return;
      const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
      setIsOnInk(parseInt(chainIdHex, 16) === INK_CHAIN_ID);
    } catch (error) {
      console.error('Error checking network:', error);
    }
  }, [isWalletConnected]);

  useEffect(() => {
    checkInkNetwork();
  }, [checkInkNetwork]);

  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;
    const handleChainChanged = (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      setIsOnInk(chainId === INK_CHAIN_ID);
      if (chainId === INK_CHAIN_ID) fetchBalances();
    };
    ethereum.on('chainChanged', handleChainChanged);
    return () => { ethereum.removeListener('chainChanged', handleChainChanged); };
  }, [walletAddress]);

  const switchToInk = async () => {
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        toast({ title: 'Wallet Not Found', description: 'Please install MetaMask or another Web3 wallet', variant: 'destructive' });
        return;
      }
      try {
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${INK_CHAIN_ID.toString(16)}` }] });
        setIsOnInk(true);
        toast({ title: 'Switched to INK', description: 'You are now connected to INK network' });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${INK_CHAIN_ID.toString(16)}`,
              chainName: 'INK Mainnet',
              nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
              rpcUrls: [INK_RPC],
              blockExplorerUrls: ['https://explorer.inkonchain.com'],
            }],
          });
          setIsOnInk(true);
          toast({ title: 'INK Added', description: 'INK network has been added to your wallet' });
        } else {
          throw switchError;
        }
      }
    } catch (error: any) {
      toast({ title: 'Network Switch Failed', description: error.message || 'Could not switch to INK', variant: 'destructive' });
    }
  };

  const fetchBalances = useCallback(async () => {
    if (!isWalletConnected || !walletAddress) return;
    try {
      const provider = new ethers.JsonRpcProvider(INK_RPC);
      const balance = await provider.getBalance(walletAddress);
      setEthBalance(ethers.formatEther(balance));

      if (selectedToken && orderType === 'sell' && selectedToken.address.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        try {
          const contract = new ethers.Contract(selectedToken.address, ERC20_ABI, provider);
          const tokenBal = await contract.balanceOf(walletAddress);
          setTokenBalance(ethers.formatUnits(tokenBal, selectedToken.decimals));
        } catch {
          setTokenBalance('0');
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
      const response = await fetch(`/api/ink/limit-order/balance?user=${walletAddress}&token=${WETH_ADDRESS}`);
      if (response.ok) {
        const data = await response.json();
        setVaultWethBalance(data.balance || '0');
      }
    } catch (error) {
      console.error('Error fetching INK vault balance:', error);
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
      const response = await apiRequest('POST', '/api/ink/limit-order/withdraw', { walletAddress, tokenAddress: tokenAddr });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      toast({ title: 'Withdrawal successful', description: `${data.formattedAmount} WETH withdrawn. Tx: ${data.txHash?.slice(0, 10)}...` });
      fetchVaultBalance();
      fetchBalances();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Withdrawal failed', description: error.message || 'Failed to withdraw' });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const setPercentageAmount = (percentage: number) => {
    if (orderType === 'buy') {
      const bal = parseFloat(ethBalance);
      if (bal > 0) {
        const val = percentage === 100 ? (bal * 0.99).toFixed(6) : (bal * percentage / 100).toFixed(6);
        setAmount(val);
      }
    } else {
      const bal = parseFloat(tokenBalance);
      if (bal > 0) setAmount((bal * percentage / 100).toFixed(6));
    }
  };

  const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim());

  const filteredTokens = useMemo(() => {
    const tkns = tokenList || FALLBACK_INK_TOKENS;
    return tkns.filter(token =>
      token.symbol.toLowerCase().includes(tokenSearchQuery.toLowerCase()) ||
      token.name.toLowerCase().includes(tokenSearchQuery.toLowerCase()) ||
      token.address.toLowerCase().includes(tokenSearchQuery.toLowerCase())
    ).slice(0, 50);
  }, [tokenList, tokenSearchQuery]);

  const handleSelectToken = (token: InkToken) => {
    setSelectedToken(token);
    setIsTokenDialogOpen(false);
    setTokenSearchQuery('');
    if (onTokenChange) onTokenChange(token);
  };

  const handleTokenSearchChange = async (value: string) => {
    setTokenSearchQuery(value);
    const trimmed = value.trim();
    if (!isAddress(trimmed)) return;
    const tkns = tokenList || FALLBACK_INK_TOKENS;
    const alreadyInList = tkns.some(t => t.address.toLowerCase() === trimmed.toLowerCase());
    if (alreadyInList) return;
    setIsSearchingAddress(true);
    try {
      const res = await fetch(`/api/ink/token/${trimmed}`);
      if (res.ok) {
        const found: InkToken = await res.json();
        handleSelectToken(found);
      }
    } catch {}
    setIsSearchingAddress(false);
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
      toast({ variant: 'destructive', title: 'Vault not configured', description: 'INK limit orders are not yet available. Deploy the vault first.' });
      return;
    }

    setIsCreatingOrder(true);

    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error('Please install MetaMask or another Web3 wallet');

      const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
      if (parseInt(chainIdHex, 16) !== INK_CHAIN_ID) {
        toast({ title: 'Switching network...', description: 'Please approve the network switch to INK' });
        try {
          await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${INK_CHAIN_ID.toString(16)}` }] });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${INK_CHAIN_ID.toString(16)}`,
                chainName: 'INK Mainnet',
                nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
                rpcUrls: [INK_RPC],
                blockExplorerUrls: ['https://explorer.inkonchain.com'],
              }],
            });
          } else {
            throw new Error('Please switch to INK network to create the order');
          }
        }
        setIsOnInk(true);
      }

      const browserProvider = new ethers.BrowserProvider(ethereum);
      const signer = await browserProvider.getSigner();
      const vaultAddress = vaultInfo.vaultAddress;

      let depositTxHash: string;

      if (orderType === 'buy') {
        const weiAmount = ethers.parseEther(amount);

        toast({ title: 'Wrapping ETH...', description: 'Wrapping ETH to WETH on INK' });
        const wethContract = new ethers.Contract(WETH_ADDRESS, WETH_ABI, signer);
        const wrapTx = await wethContract.deposit({ value: weiAmount });
        await wrapTx.wait();

        toast({ title: 'Approving WETH...', description: 'Approving WETH for vault deposit' });
        const approveTx = await wethContract.approve(vaultAddress, weiAmount);
        await approveTx.wait();

        toast({ title: 'Depositing to vault...', description: 'Depositing WETH to INK ExecutorVault' });
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

        toast({ title: 'Depositing to vault...', description: `Depositing ${selectedToken.symbol} to INK ExecutorVault` });
        const vaultContract = new ethers.Contract(vaultAddress, EXECUTOR_VAULT_V3_ABI, signer);
        const depositTx = await vaultContract.deposit(selectedToken.address, tokenAmountWei);
        const receipt = await depositTx.wait();
        depositTxHash = receipt.hash;
      }

      toast({ title: 'Creating order...', description: 'Registering INK limit order on backend' });

      const receiveAmount = calculatedReceiveAmount;
      const ethAmountStr = orderType === 'buy' ? amount : (receiveAmount?.display || '0');
      const tokenAmountStr = orderType === 'buy' ? (receiveAmount?.display || '0') : amount;

      await apiRequest('POST', '/api/ink/limit-order/create', {
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

      queryClient.invalidateQueries({ queryKey: ['/api/ink/limit-order/orders'] });
      toast({ title: 'Order created!', description: 'Your INK limit order is now being monitored.' });

      setAmount('');
      setTargetPrice('');
      fetchBalances();
      refetchOrders();
    } catch (error: any) {
      console.error('Error creating INK limit order:', error);
      toast({ variant: 'destructive', title: 'Order failed', description: error.message || 'Failed to create limit order' });
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!walletAddress) return;
    setCancellingOrder(orderId);
    try {
      const response = await apiRequest('POST', '/api/ink/limit-order/cancel', { orderId, walletAddress });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      toast({ title: 'Order cancelled', description: data.withdrawal ? `Funds auto-withdrawn (${data.withdrawal.amount} WETH)` : 'Your INK limit order has been cancelled' });
      fetchVaultBalance();
      refetchOrders();
    } catch (error: any) {
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
      <Card className="p-6 text-center" data-testid="card-ink-limit-not-connected">
        <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-bold mb-2">INK Limit Orders</h3>
        <p className="text-muted-foreground text-sm mb-4">Connect your wallet to place limit orders on INK network</p>
        <Button onClick={() => connectWallet()} data-testid="button-connect-ink-limit">Connect Wallet</Button>
      </Card>
    );
  }

  if (vaultInfo && !vaultInfo.configured) {
    return (
      <Card className="p-6 text-center" data-testid="card-ink-limit-coming-soon">
        <Vault className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-bold mb-2">INK Limit Orders</h3>
        <p className="text-muted-foreground text-sm mb-4">
          INK limit orders coming soon. The ExecutorVault is being deployed to INK mainnet.
        </p>
        <Badge variant="outline">Deploying Soon</Badge>
      </Card>
    );
  }

  if (!isOnInk) {
    return (
      <Card className="p-6 text-center" data-testid="card-ink-limit-wrong-network">
        <Target className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
        <h3 className="text-lg font-bold mb-2">Switch to INK</h3>
        <p className="text-muted-foreground text-sm mb-4">Please switch your wallet to INK network to use limit orders</p>
        <Button onClick={switchToInk} data-testid="button-switch-ink-limit">Switch to INK</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="container-ink-limit-orders">
      <Card className="p-4 sm:p-6" data-testid="card-create-ink-order">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h3 className="font-bold">Create INK Limit Order</h3>
          </div>
          <Badge variant="outline" className="text-xs">Vault + Auto-Execute</Badge>
        </div>

        <div className="text-xs text-muted-foreground mb-4 p-2 bg-muted/50 rounded-lg">
          Your funds are deposited to the INK ExecutorVault and automatically swapped when target price is reached.
        </div>

        {parseFloat(vaultWethBalance) > 0 && (
          <div className="mb-4 p-3 bg-muted/30 rounded-lg flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs text-muted-foreground">Vault WETH Balance</div>
              <div className="text-sm font-semibold">{parseFloat(vaultWethBalance).toFixed(6)} WETH</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => handleWithdraw(WETH_ADDRESS)} disabled={isWithdrawing} data-testid="button-ink-vault-withdraw">
              {isWithdrawing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Withdraw
            </Button>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <Button variant={orderType === 'buy' ? 'default' : 'outline'} onClick={() => setOrderType('buy')} className="flex-1" data-testid="button-ink-order-type-buy">Buy</Button>
          <Button variant={orderType === 'sell' ? 'default' : 'outline'} onClick={() => setOrderType('sell')} className="flex-1" data-testid="button-ink-order-type-sell">Sell</Button>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground mb-1">Token</Label>
            <Button variant="outline" className="w-full justify-between" onClick={() => setIsTokenDialogOpen(true)} data-testid="button-select-ink-token">
              {selectedToken ? (
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={selectedToken.logoURI} />
                    <AvatarFallback>{selectedToken.symbol.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span>{selectedToken.symbol}</span>
                </div>
              ) : <span className="text-muted-foreground">Select token</span>}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1 flex-wrap gap-1">
              <Label className="text-sm text-muted-foreground">
                {orderType === 'buy' ? 'ETH to spend' : `${selectedToken?.symbol || 'Tokens'} to sell`}
              </Label>
              <span className="text-xs text-muted-foreground">
                Balance: {orderType === 'buy' ? `${parseFloat(ethBalance).toFixed(6)} ETH` : `${parseFloat(tokenBalance).toFixed(6)} ${selectedToken?.symbol}`}
              </span>
            </div>
            <Input
              type="number"
              placeholder="0.0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              data-testid="input-ink-order-amount"
            />
            <div className="flex gap-1 mt-1">
              {[25, 50, 75, 100].map(pct => (
                <Button key={pct} size="sm" variant="ghost" className="text-xs px-2 h-6" onClick={() => setPercentageAmount(pct)} data-testid={`button-ink-order-pct-${pct}`}>
                  {pct}%
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
              <Label className="text-sm text-muted-foreground">Target Price (USD)</Label>
              {currentTokenPrice !== null && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Current: ${currentTokenPrice === 0 ? '0' : currentTokenPrice >= 1 ? currentTokenPrice.toFixed(4).replace(/\.?0+$/, '') : currentTokenPrice.toFixed(Math.min(Math.max(4, Math.ceil(-Math.log10(currentTokenPrice)) + 4), 12)).replace(/0+$/, '')}
                    {tokenPriceData?.priceChange24h != null && (
                      <span className={tokenPriceData.priceChange24h >= 0 ? 'text-green-500 ml-1' : 'text-red-500 ml-1'}>
                        ({tokenPriceData.priceChange24h >= 0 ? '+' : ''}{tokenPriceData.priceChange24h.toFixed(2)}%)
                      </span>
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-5 px-1 py-0"
                    onClick={() => setTargetPrice(currentTokenPrice.toString())}
                    data-testid="button-ink-use-current-price"
                  >
                    Use current
                  </Button>
                </div>
              )}
            </div>
            <Input
              type="number"
              placeholder="0.00"
              value={targetPrice}
              onChange={e => setTargetPrice(e.target.value)}
              data-testid="input-ink-target-price"
            />
          </div>

          {calculatedReceiveAmount && (
            <div className="p-3 bg-muted/30 rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">You will receive ~</span>
                <span className="font-semibold">{calculatedReceiveAmount.display} {calculatedReceiveAmount.symbol}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Total value ~</span>
                <span>${calculatedReceiveAmount.totalValue.toFixed(2)}</span>
              </div>
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleCreateOrder}
            disabled={isCreatingOrder || !selectedToken || !amount || !targetPrice}
            data-testid="button-create-ink-order"
          >
            {isCreatingOrder ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating Order...</> : 'Create Limit Order'}
          </Button>
        </div>
      </Card>

      <Card className="p-4 sm:p-6" data-testid="card-ink-open-orders">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-bold">Your INK Orders</h3>
          <Button size="icon" variant="ghost" onClick={() => refetchOrders()} data-testid="button-refresh-ink-orders">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {isLoadingOrders ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !openOrders || openOrders.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">No INK limit orders yet</div>
        ) : (
          <div className="space-y-3">
            {openOrders.map(order => (
              <div key={order.id} className="border rounded-lg p-3 space-y-2" data-testid={`card-ink-order-${order.id}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={order.orderType === 'buy' ? 'default' : 'secondary'} className="text-xs">
                      {order.orderType.toUpperCase()}
                    </Badge>
                    <span className="font-semibold text-sm">{order.tokenSymbol}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getStatusBadgeVariant(order.status)} className="text-xs">
                      {order.status}
                    </Badge>
                    {(order.status === 'fillable' || order.status === 'pending') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCancelOrder(order.id)}
                        disabled={cancellingOrder === order.id}
                        data-testid={`button-cancel-ink-order-${order.id}`}
                      >
                        {cancellingOrder === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <span className="text-muted-foreground">Target: </span>
                    <span className="text-foreground font-medium">${parseFloat(order.targetPrice).toFixed(6)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Amount: </span>
                    <span className="text-foreground font-medium">
                      {order.orderType === 'buy' ? `${order.ethAmount} ETH` : `${order.tokenAmount} ${order.tokenSymbol}`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={isTokenDialogOpen} onOpenChange={setIsTokenDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh]" data-testid="dialog-ink-limit-token-select">
          <DialogHeader>
            <DialogTitle>Select Token (INK)</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Search by name, symbol, or paste address..."
            value={tokenSearchQuery}
            onChange={e => handleTokenSearchChange(e.target.value)}
            className="mb-2"
            data-testid="input-ink-limit-token-search"
          />
          <ScrollArea className="h-[400px]">
            <div className="space-y-1">
              {isSearchingAddress ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Looking up token on-chain...</span>
                </div>
              ) : filteredTokens.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  {isAddress(tokenSearchQuery.trim())
                    ? 'Token not found on INK network'
                    : 'No tokens found'}
                </div>
              ) : (
                filteredTokens.map(token => (
                  <button
                    key={token.address}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover-elevate text-left"
                    onClick={() => handleSelectToken(token)}
                    data-testid={`button-ink-limit-token-${token.symbol}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={token.logoURI} />
                      <AvatarFallback>{token.symbol.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold text-sm">{token.symbol}</div>
                      <div className="text-xs text-muted-foreground">{token.name}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
