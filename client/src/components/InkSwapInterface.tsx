import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { ArrowDownUp, Loader2, AlertCircle, Search, RefreshCw, Wallet, ExternalLink, CheckCircle } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ethers } from 'ethers';

interface InkQuote {
  id: string;
  estimate: {
    destinationTokenAmount: string;
    destinationTokenMinAmount: string;
    destinationUsdAmount?: number | null;
    priceImpact?: number | null;
    slippage: number;
  };
  swap?: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOutMinimum: string;
    fee: number;
    router: string;
    routeType?: 'single' | 'multi';
    multiHopPath?: string[];
    multiHopFees?: number[];
    encodedPath?: string;
  };
  transaction?: {
    to: string;
    data: string;
    value: string;
    approvalAddress?: string;
  };
}

interface InkToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

const INK_CHAIN_ID = 57073;
const INK_RPC = 'https://rpc-gel.inkonchain.com';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

const isNativeEth = (addr: string) => addr.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const isWeth = (addr: string) => addr.toLowerCase() === WETH_ADDRESS.toLowerCase();
const isWrapUnwrap = (from: InkToken | null, to: InkToken | null) => {
  if (!from || !to) return false;
  return (isNativeEth(from.address) && isWeth(to.address)) || (isWeth(from.address) && isNativeEth(to.address));
};

const FALLBACK_INK_TOKENS: InkToken[] = [
  {
    address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logoURI: '/token-logo/aHR0cHM6Ly9hc3NldHMuY29pbmdlY2tvLmNvbS9jb2lucy9pbWFnZXMvMjc5L3NtYWxsL2V0aGVyZXVtLnBuZw.png',
  },
  {
    address: '0x2D270e6886d130D724215A266106e6832161EAEd',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: '/token-logo/aHR0cHM6Ly9hc3NldHMuY29pbmdlY2tvLmNvbS9jb2lucy9pbWFnZXMvNjMxOS9zbWFsbC91c2QtY29pbi5wbmc.png',
  },
  {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    logoURI: '/token-logo/aHR0cHM6Ly9hc3NldHMuY29pbmdlY2tvLmNvbS9jb2lucy9pbWFnZXMvMjUxOC9zbWFsbC93ZXRoLnBuZw.png',
  },
  {
    address: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
    symbol: 'USDe',
    name: 'USDe',
    decimals: 18,
    logoURI: '/token-logo/aHR0cHM6Ly9hc3NldHMuY29pbmdlY2tvLmNvbS9jb2lucy9pbWFnZXMvMzM0MzEvdGh1bWIvdXNkZS5wbmc.png',
  },
  {
    address: '0xF1815bd50389c46847f0Bda824eC8da914045D14',
    symbol: 'USDC.e',
    name: 'Bridged USDC',
    decimals: 6,
    logoURI: '/token-logo/aHR0cHM6Ly9hc3NldHMuY29pbmdlY2tvLmNvbS9jb2lucy9pbWFnZXMvNjMxOS9zbWFsbC91c2QtY29pbi5wbmc.png',
  },
];

const NATIVE_ETH: InkToken = {
  address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  symbol: 'ETH',
  name: 'Ethereum',
  decimals: 18,
  logoURI: '/token-logo/aHR0cHM6Ly9hc3NldHMuY29pbmdlY2tvLmNvbS9jb2lucy9pbWFnZXMvMjc5L3NtYWxsL2V0aGVyZXVtLnBuZw.png',
};

function useInkTokenList() {
  return useQuery({
    queryKey: ['inkTokenList'],
    queryFn: async (): Promise<InkToken[]> => {
      const response = await fetch('/api/ink-tokens');
      if (!response.ok) {
        throw new Error('Failed to fetch INK tokens');
      }
      const data = await response.json();
      const fetched: InkToken[] = data.tokens || [];
      const withoutEth = fetched.filter(t => !isNativeEth(t.address));
      return [NATIVE_ETH, ...withoutEth];
    },
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
  });
}

interface InkSwapInterfaceProps {
  onToTokenChange?: (token: InkToken | null) => void;
}

export function InkSwapInterface({ onToTokenChange }: InkSwapInterfaceProps) {
  const { walletAddress, isWalletConnected, connectWallet } = useWallet();
  const { toast } = useToast();
  const { data: tokenList, isLoading: isLoadingTokens } = useInkTokenList();

  const tokens = tokenList || FALLBACK_INK_TOKENS;

  const [fromToken, setFromToken] = useState<InkToken | null>(FALLBACK_INK_TOKENS[0]);
  const [toToken, setToToken] = useState<InkToken | null>(FALLBACK_INK_TOKENS[1]);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [tokenDialogRole, setTokenDialogRole] = useState<'from' | 'to'>('from');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [fromBalance, setFromBalance] = useState<string>('0');
  const [toBalance, setToBalance] = useState<string>('0');
  const [isOnInk, setIsOnInk] = useState(false);
  const [quote, setQuote] = useState<InkQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quoteDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (tokenList && tokenList.length > 0) {
      const eth = tokenList.find(t => isNativeEth(t.address)) || NATIVE_ETH;
      setFromToken(eth);
      const usdc = tokenList.find(t => t.symbol === 'USDC' || t.symbol === 'USDC.e');
      const weth = tokenList.find(t => isWeth(t.address));
      setToToken(usdc || weth || tokenList[1] || null);
    }
  }, [tokenList]);

  useEffect(() => {
    if (onToTokenChange) {
      onToTokenChange(toToken);
    }
  }, [toToken, onToTokenChange]);

  const checkNetwork = useCallback(async () => {
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
    checkNetwork();
  }, [checkNetwork]);

  const switchToInk = async () => {
    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) {
        toast({ title: 'Wallet Not Found', description: 'Please install MetaMask or another Web3 wallet', variant: 'destructive' });
        return;
      }
      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${INK_CHAIN_ID.toString(16)}` }],
        });
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
      console.error('Failed to switch to INK:', error);
      toast({ title: 'Network Switch Failed', description: error.message || 'Could not switch to INK', variant: 'destructive' });
    }
  };

  const fetchTokenBalance = useCallback(async (token: InkToken | null): Promise<string> => {
    if (!isWalletConnected || !walletAddress || !token) return '0';
    try {
      const provider = new ethers.JsonRpcProvider(INK_RPC);
      if (token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        const balance = await provider.getBalance(walletAddress);
        return ethers.formatEther(balance);
      }
      const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
      const contract = new ethers.Contract(token.address, erc20Abi, provider);
      const balance = await contract.balanceOf(walletAddress);
      return ethers.formatUnits(balance, token.decimals);
    } catch (error) {
      return '0';
    }
  }, [isWalletConnected, walletAddress]);

  const fetchBalance = useCallback(async () => {
    if (!isWalletConnected || !walletAddress) return;
    const [from, to] = await Promise.all([
      fetchTokenBalance(fromToken),
      fetchTokenBalance(toToken),
    ]);
    setFromBalance(from);
    setToBalance(to);
  }, [isWalletConnected, walletAddress, fromToken, toToken, fetchTokenBalance]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;
    const handleChainChanged = (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      setIsOnInk(chainId === INK_CHAIN_ID);
      if (chainId === INK_CHAIN_ID) fetchBalance();
    };
    ethereum.on('chainChanged', handleChainChanged);
    return () => { ethereum.removeListener('chainChanged', handleChainChanged); };
  }, [fetchBalance]);

  const isWrapUnwrapPair = isWrapUnwrap(fromToken, toToken);

  const fetchQuote = useCallback(async () => {
    if (!fromToken || !toToken || !fromAmount || parseFloat(fromAmount) <= 0) {
      setQuote(null);
      setToAmount('');
      setQuoteError(null);
      return;
    }

    if (isWrapUnwrap(fromToken, toToken)) {
      setToAmount(fromAmount);
      setQuoteError(null);
      setQuote({ id: 'wrap-unwrap', estimate: { destinationTokenAmount: fromAmount, destinationTokenMinAmount: fromAmount, slippage: 0 } } as InkQuote);
      return;
    }

    setIsLoading(true);
    setQuoteError(null);

    try {
      const response = await fetch('/api/ink/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromTokenAddress: fromToken.address,
          toTokenAddress: toToken.address,
          amount: fromAmount,
          fromDecimals: fromToken.decimals,
          toDecimals: toToken.decimals,
          fromAddress: walletAddress || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get quote');
      }

      const data: InkQuote = await response.json();
      setQuote(data);
      setToAmount(data.estimate?.destinationTokenAmount || '');
    } catch (error: any) {
      setQuoteError(error.message || 'Failed to get quote');
      setQuote(null);
      setToAmount('');
    } finally {
      setIsLoading(false);
    }
  }, [fromToken, toToken, fromAmount]);

  useEffect(() => {
    if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setQuote(null);
      setToAmount('');
      return;
    }
    quoteDebounceRef.current = setTimeout(() => { fetchQuote(); }, 500);
    return () => { if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current); };
  }, [fromAmount, fromToken, toToken, fetchQuote]);

  const handleSwap = async () => {
    if (!quote || !fromToken || !toToken || !walletAddress) {
      toast({ title: 'Cannot Swap', description: 'Please enter an amount and wait for a quote', variant: 'destructive' });
      return;
    }

    setIsSwapping(true);

    try {
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error('Please install MetaMask or another Web3 wallet');

      const currentChainId = await ethereum.request({ method: 'eth_chainId' });
      if (parseInt(currentChainId, 16) !== INK_CHAIN_ID) {
        try {
          await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${INK_CHAIN_ID.toString(16)}` }] });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{ chainId: `0x${INK_CHAIN_ID.toString(16)}`, chainName: 'INK Mainnet', nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 }, rpcUrls: [INK_RPC], blockExplorerUrls: ['https://explorer.inkonchain.com'] }],
            });
          } else {
            throw new Error('Please switch to INK network to complete the swap');
          }
        }
      }

      if (isWrapUnwrap(fromToken, toToken)) {
        const browserProvider = new ethers.BrowserProvider(ethereum);
        const signer = await browserProvider.getSigner();
        const wethContract = new ethers.Contract(WETH_ADDRESS, ['function deposit() external payable', 'function withdraw(uint256 wad) external'], signer);
        const amount = ethers.parseEther(fromAmount);

        if (isNativeEth(fromToken.address)) {
          const tx = await wethContract.deposit({ value: amount });
          toast({ title: 'Wrapping ETH...', description: `Tx: ${tx.hash.slice(0, 10)}...` });
          await tx.wait();
          toast({ title: 'Wrap Successful', description: `Wrapped ${fromAmount} ETH to WETH on INK` });
        } else {
          const tx = await wethContract.withdraw(amount);
          toast({ title: 'Unwrapping WETH...', description: `Tx: ${tx.hash.slice(0, 10)}...` });
          await tx.wait();
          toast({ title: 'Unwrap Successful', description: `Unwrapped ${fromAmount} WETH to ETH on INK` });
        }

        setFromAmount('');
        setToAmount('');
        setQuote(null);
        fetchBalance();
        setIsSwapping(false);
        return;
      }

      const swapResponse = await fetch('/api/ink/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromTokenAddress: fromToken.address,
          toTokenAddress: toToken.address,
          amount: fromAmount,
          fromAddress: walletAddress,
          fromDecimals: fromToken.decimals,
          toDecimals: toToken.decimals,
          fee: quote.swap?.fee || 3000,
          routeType: quote.swap?.routeType || 'single',
          multiHopPath: quote.swap?.multiHopPath,
          multiHopFees: quote.swap?.multiHopFees,
          encodedPath: quote.swap?.encodedPath,
        }),
      });

      if (!swapResponse.ok) {
        const errorData = await swapResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get swap data');
      }

      const swapData = await swapResponse.json();
      const browserProvider = new ethers.BrowserProvider(ethereum);
      const signer = await browserProvider.getSigner();

      const isNativeToken = fromToken.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

      if (!isNativeToken && swapData.transaction?.approvalAddress) {
        const tokenContract = new ethers.Contract(
          fromToken.address,
          ['function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)'],
          signer
        );
        const currentAllowance = await tokenContract.allowance(walletAddress, swapData.transaction.approvalAddress);
        const requiredAmount = ethers.parseUnits(fromAmount, fromToken.decimals);

        if (currentAllowance < requiredAmount) {
          toast({ title: 'Approval Required', description: `Please approve ${fromToken.symbol} spending in your wallet` });
          const approveTx = await tokenContract.approve(swapData.transaction.approvalAddress, ethers.MaxUint256);
          await approveTx.wait(1);
        }
      }

      const txRequest: any = {
        to: swapData.transaction.to,
        data: swapData.transaction.data,
        value: swapData.transaction.value || '0',
      };

      try {
        const gasEstimate = await signer.estimateGas(txRequest);
        txRequest.gasLimit = (gasEstimate * BigInt(130)) / BigInt(100);
      } catch {
        txRequest.gasLimit = BigInt(500000);
      }

      toast({ title: 'Confirm Swap', description: `Swapping ${fromAmount} ${fromToken.symbol} → ${toToken.symbol} on INK` });
      const tx = await signer.sendTransaction(txRequest);
      toast({ title: 'Transaction Submitted', description: `Tx: ${tx.hash.slice(0, 10)}...` });

      const receipt = await tx.wait(1);

      if (receipt?.status === 1) {
        toast({
          title: 'Swap Successful',
          description: `Swapped ${fromAmount} ${fromToken.symbol} → ${toAmount} ${toToken.symbol}`,
        });
        setFromAmount('');
        setToAmount('');
        setQuote(null);
        fetchBalance();
      } else {
        throw new Error('Transaction failed on-chain');
      }
    } catch (error: any) {
      console.error('INK Swap error:', error);
      if (error.code !== 4001) {
        toast({ title: 'Swap Failed', description: error.message || 'Transaction failed', variant: 'destructive' });
      }
    } finally {
      setIsSwapping(false);
    }
  };

  const handleSwitchTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
    setToAmount('');
    setQuote(null);
  };

  const openTokenDialog = (role: 'from' | 'to') => {
    setTokenDialogRole(role);
    setSearchQuery('');
    setTokenDialogOpen(true);
  };

  const handleSelectToken = (token: InkToken) => {
    if (tokenDialogRole === 'from') {
      setFromToken(token);
      if (toToken?.address === token.address) setToToken(null);
    } else {
      setToToken(token);
      if (fromToken?.address === token.address) setFromToken(null);
    }
    setTokenDialogOpen(false);
    setFromAmount('');
    setToAmount('');
    setQuote(null);
  };

  const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim());

  const filteredTokens = tokens.filter(t =>
    t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.address.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 100);

  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    const trimmed = value.trim();
    if (!isAddress(trimmed)) return;
    const alreadyInList = tokens.some(t => t.address.toLowerCase() === trimmed.toLowerCase());
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

  if (!isWalletConnected) {
    return (
      <Card className="p-6 text-center" data-testid="card-ink-swap-not-connected">
        <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-bold mb-2">INK Swap</h3>
        <p className="text-muted-foreground text-sm mb-4">Connect your wallet to swap tokens on INK network</p>
        <Button onClick={() => connectWallet()} data-testid="button-connect-ink-swap">Connect Wallet</Button>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6" data-testid="card-ink-swap">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">INK Swap</span>
          <Badge variant="outline" className="text-xs">Kraken L2</Badge>
        </div>
        <div className="flex items-center gap-2">
          {!isOnInk && (
            <Button size="sm" variant="outline" onClick={switchToInk} data-testid="button-switch-ink-network">
              Switch to INK
            </Button>
          )}
          {isOnInk && (
            <Badge variant="outline" className="text-xs text-green-600 border-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              INK
            </Badge>
          )}
          <Button size="icon" variant="ghost" onClick={fetchBalance} data-testid="button-refresh-ink-balances">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <span className="text-xs text-muted-foreground" data-testid="text-ink-from-balance">
              Balance: {parseFloat(fromBalance).toFixed(6)} {fromToken?.symbol}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="flex items-center gap-2 min-w-[120px]"
              onClick={() => openTokenDialog('from')}
              data-testid="button-ink-select-from-token"
            >
              {fromToken ? (
                <>
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={fromToken.logoURI} />
                    <AvatarFallback className="text-xs">{fromToken.symbol.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className="font-semibold">{fromToken.symbol}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Select</span>
              )}
            </Button>
            <Input
              type="number"
              placeholder="0.0"
              value={fromAmount}
              onChange={e => setFromAmount(e.target.value)}
              className="text-right text-lg font-semibold border-0 bg-transparent focus-visible:ring-0"
              data-testid="input-ink-from-amount"
            />
          </div>
          <div className="flex gap-1 mt-2">
            {[25, 50, 75, 100].map(pct => (
              <Button
                key={pct}
                size="sm"
                variant="ghost"
                className="text-xs px-2 h-6"
                onClick={() => {
                  const bal = parseFloat(fromBalance);
                  if (bal > 0) {
                    const val = pct === 100 ? (bal * 0.99).toFixed(6) : (bal * pct / 100).toFixed(6);
                    setFromAmount(val);
                  }
                }}
                data-testid={`button-ink-pct-${pct}`}
              >
                {pct}%
              </Button>
            ))}
          </div>
        </div>

        <div className="flex justify-center">
          <Button size="icon" variant="ghost" onClick={handleSwitchTokens} data-testid="button-ink-switch-tokens">
            <ArrowDownUp className="h-5 w-5" />
          </Button>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <span className="text-xs text-muted-foreground" data-testid="text-ink-to-balance">
              Balance: {parseFloat(toBalance).toFixed(6)} {toToken?.symbol}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="flex items-center gap-2 min-w-[120px]"
              onClick={() => openTokenDialog('to')}
              data-testid="button-ink-select-to-token"
            >
              {toToken ? (
                <>
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={toToken.logoURI} />
                    <AvatarFallback className="text-xs">{toToken.symbol.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className="font-semibold">{toToken.symbol}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Select</span>
              )}
            </Button>
            <div className="flex-1 text-right">
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin ml-auto" />
              ) : (
                <span className="text-lg font-semibold text-muted-foreground" data-testid="text-ink-to-amount">
                  {toAmount ? parseFloat(toAmount).toFixed(6) : '0.0'}
                </span>
              )}
            </div>
          </div>
        </div>

        {quoteError && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <span className="text-xs text-destructive">{quoteError}</span>
          </div>
        )}

        {quote && !quoteError && !isWrapUnwrapPair && (
          <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded-lg space-y-1">
            <div className="flex justify-between">
              <span>Route</span>
              <span className="font-medium">{quote.swap?.routeType === 'multi' ? 'Multi-hop' : 'Direct'} via INK DEX</span>
            </div>
            {quote.estimate.priceImpact != null && (
              <div className="flex justify-between">
                <span>Price Impact</span>
                <span className={quote.estimate.priceImpact > 5 ? 'text-destructive' : 'text-green-600'}>
                  {quote.estimate.priceImpact.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        )}

        {isWrapUnwrapPair && (
          <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded-lg">
            <div className="flex justify-between">
              <span>Type</span>
              <span className="font-medium">{isNativeEth(fromToken?.address || '') ? 'Wrap ETH → WETH' : 'Unwrap WETH → ETH'} (1:1)</span>
            </div>
          </div>
        )}

        <Button
          className="w-full"
          onClick={handleSwap}
          disabled={isSwapping || isLoading || !quote || !fromAmount || !fromToken || !toToken}
          data-testid="button-ink-swap"
        >
          {isSwapping ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Swapping...</>
          ) : isLoading ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Getting Quote...</>
          ) : !fromAmount ? (
            'Enter Amount'
          ) : !fromToken || !toToken ? (
            'Select Tokens'
          ) : quoteError ? (
            'No Route Available'
          ) : (
            `Swap ${fromToken?.symbol} → ${toToken?.symbol}`
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Powered by INK DEX (Kraken L2) •{' '}
          <a href="https://explorer.inkonchain.com" target="_blank" rel="noopener noreferrer" className="underline flex-inline items-center gap-0.5">
            Explorer <ExternalLink className="h-3 w-3 inline" />
          </a>
        </p>
      </div>

      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh]" data-testid="dialog-ink-token-select">
          <DialogHeader>
            <DialogTitle>Select Token (INK)</DialogTitle>
            <DialogDescription>Choose a token to swap on INK network</DialogDescription>
          </DialogHeader>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, symbol, or paste address..."
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              className="pl-9"
              data-testid="input-ink-token-search"
            />
          </div>
          <ScrollArea className="h-[400px]">
            {isLoadingTokens || isSearchingAddress ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredTokens.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {isAddress(searchQuery) ? 'Token not found on INK network' : 'No tokens found'}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredTokens.map(token => (
                  <button
                    key={token.address}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover-elevate text-left"
                    onClick={() => handleSelectToken(token)}
                    data-testid={`button-ink-token-${token.symbol}`}
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
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
