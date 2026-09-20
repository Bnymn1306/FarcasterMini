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

interface KyoQuote {
  id: string;
  provider?: string;
  estimate: {
    destinationTokenAmount: string;
    destinationTokenMinAmount: string;
    destinationUsdAmount?: number | null;
    destinationUsdMinAmount?: number | null;
    priceImpact?: number | null;
    slippage: number;
  };
  fees?: {
    gasTokenFees?: {
      gas?: any;
      nativeToken?: any;
      protocol?: {
        fixedAmount: string;
        fixedUsdAmount: number;
        fixedWeiAmount: string;
      };
      provider?: any;
    };
    percentFees?: any;
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

interface SoneiumToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

const SONEIUM_CHAIN_ID = 1868;
const SONEIUM_RPC = 'https://rpc.soneium.org';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

const isNativeEth = (addr: string) => addr.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const isWeth = (addr: string) => addr.toLowerCase() === WETH_ADDRESS.toLowerCase();
const isWrapUnwrap = (from: SoneiumToken | null, to: SoneiumToken | null) => {
  if (!from || !to) return false;
  return (isNativeEth(from.address) && isWeth(to.address)) || (isWeth(from.address) && isNativeEth(to.address));
};

const FALLBACK_SONEIUM_TOKENS: SoneiumToken[] = [
  {
    address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logoURI: '/token-logo/aHR0cHM6Ly9hc3NldHMuY29pbmdlY2tvLmNvbS9jb2lucy9pbWFnZXMvMjc5L3NtYWxsL2V0aGVyZXVtLnBuZw.png',
  },
  {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    logoURI: '/token-logo/aHR0cHM6Ly9hc3NldHMuY29pbmdlY2tvLmNvbS9jb2lucy9pbWFnZXMvMjUxOC9zbWFsbC93ZXRoLnBuZw.png',
  },
];

function useSoneiumTokenList() {
  return useQuery({
    queryKey: ['soneiumTokenList'],
    queryFn: async (): Promise<SoneiumToken[]> => {
      const response = await fetch('/api/soneium-tokens');
      if (!response.ok) {
        throw new Error('Failed to fetch Soneium tokens');
      }
      const data = await response.json();
      console.log(`✅ Loaded ${data.tokens?.length || 0} Soneium tokens`);
      return data.tokens || FALLBACK_SONEIUM_TOKENS;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

interface SoneiumSwapInterfaceProps {
  onToTokenChange?: (token: SoneiumToken | null) => void;
}

export function SoneiumSwapInterface({ onToTokenChange }: SoneiumSwapInterfaceProps) {
  const { walletAddress, isWalletConnected, connectWallet, getProvider } = useWallet();
  const { toast } = useToast();
  const { data: tokenList, isLoading: isLoadingTokens } = useSoneiumTokenList();
  
  const tokens = tokenList || FALLBACK_SONEIUM_TOKENS;

  const [fromToken, setFromToken] = useState<SoneiumToken | null>(FALLBACK_SONEIUM_TOKENS[0]);
  const [toToken, setToToken] = useState<SoneiumToken | null>(FALLBACK_SONEIUM_TOKENS[1]);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [tokenDialogRole, setTokenDialogRole] = useState<'from' | 'to'>('from');
  const [searchQuery, setSearchQuery] = useState('');
  const [ethBalance, setEthBalance] = useState<string>('0');
  const [fromBalance, setFromBalance] = useState<string>('0');
  const [toBalance, setToBalance] = useState<string>('0');
  const [isOnSoneium, setIsOnSoneium] = useState(false);
  const [quote, setQuote] = useState<KyoQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quoteDebounceRef = useRef<NodeJS.Timeout | null>(null);
  
  // Update tokens when list loads
  useEffect(() => {
    if (tokenList && tokenList.length > 0) {
      if (!fromToken || fromToken.address === FALLBACK_SONEIUM_TOKENS[0].address) {
        setFromToken(tokenList[0]);
      }
      if (!toToken || toToken.address === FALLBACK_SONEIUM_TOKENS[1].address) {
        const weth = tokenList.find(t => t.symbol === 'WETH') || tokenList[1];
        setToToken(weth || null);
      }
    }
  }, [tokenList]);

  useEffect(() => {
    if (onToTokenChange) {
      onToTokenChange(toToken);
    }
  }, [toToken, onToTokenChange]);

  const checkAndSwitchToSoneium = useCallback(async () => {
    if (!isWalletConnected) return;
    
    try {
      const provider = await getProvider();
      if (!provider) return;
      
      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);
      
      if (currentChainId === SONEIUM_CHAIN_ID) {
        setIsOnSoneium(true);
        return;
      }
      
      setIsOnSoneium(false);
    } catch (error) {
      console.error('Error checking network:', error);
    }
  }, [isWalletConnected, getProvider]);

  useEffect(() => {
    checkAndSwitchToSoneium();
  }, [checkAndSwitchToSoneium]);

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
        toast({
          title: 'Switched to Soneium',
          description: 'You are now connected to Soneium network',
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${SONEIUM_CHAIN_ID.toString(16)}`,
              chainName: 'Soneium Mainnet',
              nativeCurrency: {
                name: 'Ethereum',
                symbol: 'ETH',
                decimals: 18,
              },
              rpcUrls: [SONEIUM_RPC],
              blockExplorerUrls: ['https://soneium.blockscout.com/'],
            }],
          });
          setIsOnSoneium(true);
          toast({
            title: 'Soneium Added',
            description: 'Soneium network has been added to your wallet',
          });
        } else {
          throw switchError;
        }
      }
    } catch (error: any) {
      console.error('Failed to switch to Soneium:', error);
      toast({
        title: 'Network Switch Failed',
        description: error.message || 'Could not switch to Soneium',
        variant: 'destructive',
      });
    }
  };

  const fetchTokenBalance = useCallback(async (token: SoneiumToken | null): Promise<string> => {
    if (!isWalletConnected || !walletAddress || !token) return '0';
    
    try {
      const provider = new ethers.JsonRpcProvider(SONEIUM_RPC);
      
      // Native ETH
      if (token.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        const balance = await provider.getBalance(walletAddress);
        return ethers.formatEther(balance);
      }
      
      // ERC20 token
      const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
      const contract = new ethers.Contract(token.address, erc20Abi, provider);
      const balance = await contract.balanceOf(walletAddress);
      return ethers.formatUnits(balance, token.decimals);
    } catch (error) {
      console.error(`Error fetching ${token.symbol} balance:`, error);
      return '0';
    }
  }, [isWalletConnected, walletAddress]);

  const fetchBalance = useCallback(async () => {
    if (!isWalletConnected || !walletAddress) return;
    
    try {
      const provider = new ethers.JsonRpcProvider(SONEIUM_RPC);
      const balance = await provider.getBalance(walletAddress);
      setEthBalance(ethers.formatEther(balance));
      
      // Fetch token-specific balances
      if (fromToken) {
        const fromBal = await fetchTokenBalance(fromToken);
        setFromBalance(fromBal);
      }
      if (toToken) {
        const toBal = await fetchTokenBalance(toToken);
        setToBalance(toBal);
      }
    } catch (error) {
      console.error('Error fetching Soneium balance:', error);
    }
  }, [isWalletConnected, walletAddress, fromToken, toToken, fetchTokenBalance]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    const handleChainChanged = (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      if (chainId === SONEIUM_CHAIN_ID) {
        setIsOnSoneium(true);
        fetchBalance();
      } else {
        setIsOnSoneium(false);
      }
    };

    ethereum.on('chainChanged', handleChainChanged);
    return () => {
      ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [fetchBalance]);

  const isWrapUnwrapPair = isWrapUnwrap(fromToken, toToken);

  const fetchQuote = useCallback(async () => {
    if (!fromToken || !toToken || !fromAmount || parseFloat(fromAmount) <= 0) {
      setQuote(null);
      setToAmount('');
      setQuoteError(null);
      return;
    }

    // WETH ↔ ETH: 1:1 wrap/unwrap, no DEX needed
    if (isWrapUnwrap(fromToken, toToken)) {
      setToAmount(fromAmount);
      setQuoteError(null);
      setQuote({
        id: 'wrap-unwrap',
        estimate: {
          destinationTokenAmount: fromAmount,
          destinationTokenMinAmount: fromAmount,
        }
      } as KyoQuote);
      return;
    }

    setIsLoading(true);
    setQuoteError(null);

    try {
      console.log(`🔄 Fetching KYO Finance quote for ${fromAmount} ${fromToken.symbol} -> ${toToken.symbol}`);
      
      const response = await fetch('/api/soneium/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromTokenAddress: fromToken.address,
          toTokenAddress: toToken.address,
          amount: fromAmount,
          fromDecimals: fromToken.decimals,
          toDecimals: toToken.decimals
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get quote');
      }

      const data: KyoQuote = await response.json();
      console.log(`✅ Quote received: ${data.estimate?.destinationTokenAmount}`);
      
      setQuote(data);
      setToAmount(data.estimate?.destinationTokenAmount || '');
    } catch (error: any) {
      console.error('❌ Quote error:', error);
      setQuoteError(error.message || 'Failed to get quote');
      setQuote(null);
      setToAmount('');
    } finally {
      setIsLoading(false);
    }
  }, [fromToken, toToken, fromAmount]);

  useEffect(() => {
    if (quoteDebounceRef.current) {
      clearTimeout(quoteDebounceRef.current);
    }

    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setQuote(null);
      setToAmount('');
      return;
    }

    quoteDebounceRef.current = setTimeout(() => {
      fetchQuote();
    }, 500);

    return () => {
      if (quoteDebounceRef.current) {
        clearTimeout(quoteDebounceRef.current);
      }
    };
  }, [fromAmount, fromToken, toToken, fetchQuote]);

  const handleSwap = async () => {
    if (!quote || !fromToken || !toToken || !walletAddress) {
      toast({
        title: 'Cannot Swap',
        description: 'Please enter an amount and wait for a quote',
        variant: 'destructive'
      });
      return;
    }

    setIsSwapping(true);

    try {
      console.log(`🔄 Executing swap: ${fromAmount} ${fromToken.symbol} -> ${toToken.symbol}`);

      // Ensure we're on Soneium network before swapping
      const ethereum = (window as any).ethereum;
      if (ethereum) {
        const currentChainId = await ethereum.request({ method: 'eth_chainId' });
        if (parseInt(currentChainId, 16) !== SONEIUM_CHAIN_ID) {
          console.log('🔄 Switching to Soneium before swap...');
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
                  blockExplorerUrls: ['https://soneium.blockscout.com/'],
                }],
              });
            } else {
              throw new Error('Please switch to Soneium network to complete the swap');
            }
          }
        }
      }

      // Handle WETH ↔ ETH wrap/unwrap directly (no DEX needed)
      if (isWrapUnwrap(fromToken, toToken)) {
        const walletProvider = (window as any).ethereum;
        if (!walletProvider) throw new Error('Web3 wallet required');
        const browserProvider = new ethers.BrowserProvider(walletProvider);
        const signer = await browserProvider.getSigner();
        const wethContract = new ethers.Contract(
          WETH_ADDRESS,
          ['function deposit() external payable', 'function withdraw(uint256 wad) external'],
          signer
        );
        const amount = ethers.parseEther(fromAmount);
        
        if (isNativeEth(fromToken.address)) {
          // ETH → WETH (wrap)
          console.log(`🔄 Wrapping ${fromAmount} ETH to WETH...`);
          const tx = await wethContract.deposit({ value: amount });
          toast({ title: 'Wrapping ETH...', description: `Tx: ${tx.hash.slice(0, 10)}...` });
          await tx.wait();
          toast({ title: 'Wrap Successful', description: `Wrapped ${fromAmount} ETH to WETH` });
        } else {
          // WETH → ETH (unwrap)
          console.log(`🔄 Unwrapping ${fromAmount} WETH to ETH...`);
          const tx = await wethContract.withdraw(amount);
          toast({ title: 'Unwrapping WETH...', description: `Tx: ${tx.hash.slice(0, 10)}...` });
          await tx.wait();
          toast({ title: 'Unwrap Successful', description: `Unwrapped ${fromAmount} WETH to ETH` });
        }

        setFromAmount('');
        setToAmount('');
        setQuote(null);
        fetchBalance();
        setIsSwapping(false);
        return;
      }

      const swapResponse = await fetch('/api/soneium/swap', {
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
        })
      });

      if (!swapResponse.ok) {
        const errorText = await swapResponse.text();
        let errorMessage = 'Failed to get swap data';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData?.error || errorData?.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const swapData = await swapResponse.json();
      console.log('✅ Swap data received:', swapData);

      // Use window.ethereum directly for Soneium swaps (browser wallet required)
      const walletProvider = (window as any).ethereum;
      if (!walletProvider) {
        throw new Error('Please install MetaMask or another Web3 wallet to swap on Soneium');
      }

      // Verify wallet is connected to Soneium network (chainId 1868)
      const currentChainId = await walletProvider.request({ method: 'eth_chainId' });
      const soneiumChainId = '0x74c'; // 1868 in hex
      
      if (currentChainId !== soneiumChainId) {
        console.log('⚠️ Switching to Soneium network...');
        try {
          await walletProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: soneiumChainId }],
          });
        } catch (switchError: any) {
          // If the network doesn't exist, add it
          if (switchError.code === 4902) {
            await walletProvider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: soneiumChainId,
                chainName: 'Soneium',
                nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://rpc.soneium.org'],
                blockExplorerUrls: ['https://soneium.blockscout.com'],
              }],
            });
          } else {
            throw new Error('Please switch your wallet to Soneium network');
          }
        }
      }

      // Create ethers provider from window.ethereum
      const browserProvider = new ethers.BrowserProvider(walletProvider);
      const signer = await browserProvider.getSigner();
      
      const isNativeToken = fromToken.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      
      if (!isNativeToken && swapData.transaction?.approvalAddress) {
        console.log('🔄 Checking token approval...');
        const tokenContract = new ethers.Contract(
          fromToken.address,
          ['function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)'],
          signer
        );
        
        const currentAllowance = await tokenContract.allowance(walletAddress, swapData.transaction.approvalAddress);
        const requiredAmount = ethers.parseUnits(fromAmount, fromToken.decimals);
        
        if (currentAllowance < requiredAmount) {
          console.log('🔄 Approving token spend...');
          toast({
            title: 'Approval Required',
            description: `Please approve ${fromToken.symbol} spending in your wallet`,
          });
          const approveTx = await tokenContract.approve(swapData.transaction.approvalAddress, ethers.MaxUint256);
          console.log('🔄 Waiting for approval confirmation...');
          await approveTx.wait(1);
          console.log('✅ Token approved, verifying on-chain...');
          
          let verifiedAllowance = await tokenContract.allowance(walletAddress, swapData.transaction.approvalAddress);
          let retries = 0;
          while (verifiedAllowance < requiredAmount && retries < 6) {
            console.log(`⏳ Waiting for approval to propagate (attempt ${retries + 1})...`);
            await new Promise(r => setTimeout(r, retries < 2 ? 500 : 1500));
            verifiedAllowance = await tokenContract.allowance(walletAddress, swapData.transaction.approvalAddress);
            retries++;
          }
          if (verifiedAllowance < requiredAmount) {
            console.warn('⚠️ Allowance query lagging, proceeding since tx was confirmed');
          }
          console.log('✅ Approval verified on-chain');
        }
      }

      console.log('🔄 Sending swap transaction...');
      
      // Build transaction object
      const txRequest: { to: string; data: string; value: string; gasLimit?: bigint } = {
        to: swapData.transaction.to,
        data: swapData.transaction.data,
        value: swapData.transaction.value || '0'
      };
      
      // Try gas estimation first, fall back to manual gas limit
      try {
        const gasEstimate = await signer.estimateGas(txRequest);
        // Add 30% buffer to gas estimate
        txRequest.gasLimit = (gasEstimate * BigInt(130)) / BigInt(100);
        console.log(`⛽ Gas estimate: ${gasEstimate.toString()}, using: ${txRequest.gasLimit.toString()}`);
      } catch (gasError: any) {
        console.warn('⚠️ Gas estimation failed, using manual gas limit:', gasError.message);
        // If gas estimation fails, check if it's an approval issue
        if (gasError.message?.includes('STF')) {
          // STF = SafeTransferFrom failure - likely approval or balance issue
          if (!isNativeToken) {
            const tokenContract = new ethers.Contract(
              fromToken.address,
              ['function allowance(address,address) view returns (uint256)', 'function balanceOf(address) view returns (uint256)'],
              signer
            );
            const [allowance, balance] = await Promise.all([
              tokenContract.allowance(walletAddress, swapData.transaction.approvalAddress),
              tokenContract.balanceOf(walletAddress)
            ]);
            const requiredAmount = ethers.parseUnits(fromAmount, fromToken.decimals);
            console.log(`🔍 Debug - Allowance: ${allowance.toString()}, Balance: ${balance.toString()}, Required: ${requiredAmount.toString()}`);
            
            if (balance < requiredAmount) {
              throw new Error(`Insufficient ${fromToken.symbol} balance. You have ${ethers.formatUnits(balance, fromToken.decimals)} but need ${fromAmount}`);
            }
            if (allowance < requiredAmount) {
              throw new Error(`Token approval insufficient. Please try the swap again to trigger a new approval.`);
            }
          }
          // If allowance and balance are fine, try with a generous gas limit
          txRequest.gasLimit = BigInt(500000);
          console.log('🔄 Retrying with manual gas limit 500000...');
        } else {
          // For other errors, use generous gas limit
          txRequest.gasLimit = BigInt(500000);
        }
      }
      
      const tx = await signer.sendTransaction(txRequest);

      toast({
        title: 'Swap Submitted',
        description: `Transaction hash: ${tx.hash.slice(0, 10)}...`,
      });

      console.log('🔄 Waiting for confirmation...');
      const receipt = await tx.wait(1);
      console.log('✅ Swap confirmed:', receipt?.hash);

      toast({
        title: 'Swap Successful',
        description: `Swapped ${fromAmount} ${fromToken.symbol} for ${toToken.symbol}`,
      });

      setFromAmount('');
      setToAmount('');
      setQuote(null);
      fetchBalance();

    } catch (error: any) {
      console.error('❌ Swap error:', error);
      let errorMsg = error.message || 'Transaction failed';
      // Make common errors more user-friendly
      if (errorMsg.includes('STF')) {
        errorMsg = 'Token transfer failed. This can happen if the token requires a fresh approval. Please try the swap again.';
      } else if (errorMsg.includes('Too little received')) {
        errorMsg = 'Price moved too much during the swap. Please try again with higher slippage.';
      } else if (errorMsg.includes('user rejected') || errorMsg.includes('User denied')) {
        errorMsg = 'Transaction was rejected in your wallet.';
      } else if (errorMsg.length > 150) {
        errorMsg = errorMsg.slice(0, 150) + '...';
      }
      toast({
        title: 'Swap Failed',
        description: errorMsg,
        variant: 'destructive'
      });
    } finally {
      setIsSwapping(false);
    }
  };

  const handleSwapTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
    setQuote(null);
  };

  const openTokenDialog = (role: 'from' | 'to') => {
    setTokenDialogRole(role);
    setSearchQuery('');
    setTokenDialogOpen(true);
  };

  const selectToken = (token: SoneiumToken) => {
    if (tokenDialogRole === 'from') {
      if (token.address === toToken?.address) {
        handleSwapTokens();
      } else {
        setFromToken(token);
      }
    } else {
      if (token.address === fromToken?.address) {
        handleSwapTokens();
      } else {
        setToToken(token);
      }
    }
    setTokenDialogOpen(false);
  };

  const filteredTokens = tokens.filter(token =>
    token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isWalletConnected) {
    return (
      <Card className="p-6">
        <div className="text-center space-y-4">
          <Wallet className="h-12 w-12 mx-auto text-muted-foreground" />
          <h3 className="text-lg font-semibold">Connect Your Wallet</h3>
          <p className="text-muted-foreground text-sm">
            Connect your wallet to swap tokens on Soneium
          </p>
          <Button onClick={() => connectWallet()} className="w-full" data-testid="button-connect-wallet">
            Connect Wallet
          </Button>
        </div>
      </Card>
    );
  }

  if (!isOnSoneium) {
    return (
      <Card className="p-6">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto text-yellow-500" />
          <h3 className="text-lg font-semibold">Switch to Soneium</h3>
          <p className="text-muted-foreground text-sm">
            Please switch your wallet to the Soneium network to continue
          </p>
          <Button onClick={switchToSoneium} className="w-full" data-testid="button-switch-soneium">
            Switch to Soneium
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Swap on Soneium</h3>
          <Badge variant="outline" className="gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            Connected
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>From</Label>
            {fromToken && (
              <span className="text-xs text-muted-foreground">
                Balance: {(Math.floor(parseFloat(fromBalance) * 1e6) / 1e6).toString()} {fromToken.symbol}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="min-w-[140px] justify-start gap-2"
              onClick={() => openTokenDialog('from')}
              data-testid="button-select-from-token"
            >
              {fromToken ? (
                <>
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={fromToken.logoURI} />
                    <AvatarFallback>{fromToken.symbol[0]}</AvatarFallback>
                  </Avatar>
                  {fromToken.symbol}
                </>
              ) : (
                'Select Token'
              )}
            </Button>
            <Input
              type="number"
              placeholder="0.0"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              className="flex-1"
              data-testid="input-from-amount"
            />
          </div>
          {fromToken && parseFloat(fromBalance) > 0 && (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-6 px-2"
                onClick={() => {
                  const val = parseFloat(fromBalance) * 0.25;
                  setFromAmount((Math.floor(val * 1e6) / 1e6).toString());
                }}
                data-testid="button-25-percent"
              >
                25%
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-6 px-2"
                onClick={() => {
                  const val = parseFloat(fromBalance) * 0.5;
                  setFromAmount((Math.floor(val * 1e6) / 1e6).toString());
                }}
                data-testid="button-50-percent"
              >
                50%
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-6 px-2"
                onClick={() => {
                  const val = parseFloat(fromBalance) * 0.75;
                  setFromAmount((Math.floor(val * 1e6) / 1e6).toString());
                }}
                data-testid="button-75-percent"
              >
                75%
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-6 px-2"
                onClick={() => {
                  const isNativeETH = fromToken.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
                  if (isNativeETH) {
                    // Leave some ETH for gas
                    const maxVal = Math.max(0, parseFloat(fromBalance) - 0.001);
                    // Truncate to 6 decimals (floor, not round) to avoid exceeding balance
                    const truncated = Math.floor(maxVal * 1e6) / 1e6;
                    setFromAmount(truncated.toString());
                  } else {
                    // Use full precision balance for tokens to avoid rounding up
                    setFromAmount(fromBalance);
                  }
                }}
                data-testid="button-max"
              >
                MAX
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSwapTokens}
            className="rounded-full"
            data-testid="button-swap-direction"
          >
            <ArrowDownUp className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>To</Label>
            {toToken && (
              <span className="text-xs text-muted-foreground">
                Balance: {parseFloat(toBalance).toFixed(6)} {toToken.symbol}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="min-w-[140px] justify-start gap-2"
              onClick={() => openTokenDialog('to')}
              data-testid="button-select-to-token"
            >
              {toToken ? (
                <>
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={toToken.logoURI} />
                    <AvatarFallback>{toToken.symbol[0]}</AvatarFallback>
                  </Avatar>
                  {toToken.symbol}
                </>
              ) : (
                'Select Token'
              )}
            </Button>
            <Input
              type="number"
              placeholder="0.0"
              value={toAmount}
              readOnly
              className="flex-1 bg-muted/50"
              data-testid="input-to-amount"
            />
          </div>
        </div>

        {quote && quote.estimate && (
          <div className={`rounded-lg p-3 text-sm space-y-2 border ${
            quote.estimate.priceImpact != null && quote.estimate.priceImpact > 10
              ? 'bg-red-500/10 border-red-500/30'
              : quote.estimate.priceImpact != null && quote.estimate.priceImpact > 3
              ? 'bg-yellow-500/10 border-yellow-500/30'
              : 'bg-green-500/10 border-green-500/20'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle className={`h-4 w-4 ${
                  quote.estimate.priceImpact != null && quote.estimate.priceImpact > 10 ? 'text-red-500' :
                  quote.estimate.priceImpact != null && quote.estimate.priceImpact > 3 ? 'text-yellow-500' : 'text-green-500'
                }`} />
                <span className={`font-medium ${
                  quote.estimate.priceImpact != null && quote.estimate.priceImpact > 10 ? 'text-red-600 dark:text-red-400' :
                  quote.estimate.priceImpact != null && quote.estimate.priceImpact > 3 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'
                }`}>Quote Ready</span>
              </div>
              {quote.swap?.routeType === 'multi' && (
                <Badge variant="secondary" className="text-[10px]" data-testid="badge-multi-hop">Multi-hop</Badge>
              )}
            </div>
            
            {quote.estimate.priceImpact != null && quote.estimate.priceImpact > 10 && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-2 text-xs flex items-start gap-2" data-testid="warning-high-price-impact">
                <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <span className="text-red-600 dark:text-red-400 font-medium">
                  High price impact ({quote.estimate.priceImpact.toFixed(1)}%). Low liquidity in this pool may cause significant value loss.
                </span>
              </div>
            )}
            
            {quote.estimate.priceImpact != null && quote.estimate.priceImpact > 3 && quote.estimate.priceImpact <= 10 && (
              <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-md p-2 text-xs flex items-start gap-2" data-testid="warning-medium-price-impact">
                <AlertCircle className="h-3.5 w-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />
                <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                  Moderate price impact ({quote.estimate.priceImpact.toFixed(1)}%). Consider using a smaller amount.
                </span>
              </div>
            )}
            
            <div className="space-y-1 text-xs text-muted-foreground">
              {quote.estimate.destinationTokenAmount && (
                <div className="flex justify-between flex-wrap gap-1">
                  <span>You receive:</span>
                  <span className="font-medium text-foreground">{parseFloat(quote.estimate.destinationTokenAmount).toFixed(6)} {toToken?.symbol}</span>
                </div>
              )}
              {quote.estimate.destinationTokenMinAmount && (
                <div className="flex justify-between flex-wrap gap-1">
                  <span>Minimum received:</span>
                  <span>{parseFloat(quote.estimate.destinationTokenMinAmount).toFixed(6)} {toToken?.symbol}</span>
                </div>
              )}
              {quote.estimate.priceImpact != null && (
                <div className="flex justify-between flex-wrap gap-1">
                  <span>Price Impact:</span>
                  <span className={`font-medium ${
                    quote.estimate.priceImpact > 10 ? 'text-red-500' :
                    quote.estimate.priceImpact > 3 ? 'text-yellow-500' :
                    quote.estimate.priceImpact > 1 ? 'text-foreground' : 'text-green-500'
                  }`}>{quote.estimate.priceImpact.toFixed(2)}%</span>
                </div>
              )}
              {quote.estimate.slippage !== undefined && (
                <div className="flex justify-between flex-wrap gap-1">
                  <span>Slippage tolerance:</span>
                  <span>{(quote.estimate.slippage * 100).toFixed(1)}%</span>
                </div>
              )}
              {quote.fees?.gasTokenFees?.protocol?.fixedUsdAmount && quote.fees.gasTokenFees.protocol.fixedUsdAmount > 0.5 && (
                <div className="flex justify-between text-yellow-500 flex-wrap gap-1">
                  <span>Protocol Fee:</span>
                  <span>${quote.fees.gasTokenFees.protocol.fixedUsdAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}


        {quoteError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-600 dark:text-red-400">Quote Error</p>
                <p className="text-muted-foreground text-xs mt-1">{quoteError}</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-muted/30 border border-muted rounded-lg p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            {isWrapUnwrapPair ? (
              <>
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                <span>Direct {fromToken && isNativeEth(fromToken.address) ? 'Wrap' : 'Unwrap'} - 1:1 conversion, no fees</span>
              </>
            ) : (
              <>
                <span>Powered by</span>
                <a 
                  href="https://app.kyo.finance" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
                >
                  KYO Finance <ExternalLink className="h-3 w-3" />
                </a>
                <span>(Uniswap V3) - Zero protocol fees</span>
              </>
            )}
          </div>
        </div>

        <Button 
          className="w-full" 
          disabled={!quote || isLoading || isSwapping}
          onClick={handleSwap}
          data-testid="button-swap"
        >
          {isSwapping ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {isWrapUnwrapPair ? (fromToken && isNativeEth(fromToken.address) ? 'Wrapping...' : 'Unwrapping...') : 'Swapping...'}
            </>
          ) : isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Getting Quote...
            </>
          ) : quote ? (
            isWrapUnwrapPair
              ? (fromToken && isNativeEth(fromToken.address) ? `Wrap ${fromAmount} ETH to WETH` : `Unwrap ${fromAmount} WETH to ETH`)
              : `Swap ${fromToken?.symbol} for ${toToken?.symbol}`
          ) : (
            'Enter amount to get quote'
          )}
        </Button>
      </div>

      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Token</DialogTitle>
            <DialogDescription>Choose a token to {tokenDialogRole === 'from' ? 'sell' : 'buy'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-token-search"
              />
            </div>
            <ScrollArea className="h-[300px]">
              {isLoadingTokens ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading tokens...</span>
                </div>
              ) : filteredTokens.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  No tokens found
                </div>
              ) : (
              <div className="space-y-1">
                {filteredTokens.map((token) => (
                  <button
                    key={token.address}
                    onClick={() => selectToken(token)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover-elevate text-left"
                    data-testid={`token-option-${token.symbol}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={token.logoURI} />
                      <AvatarFallback>{token.symbol[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{token.symbol}</div>
                      <div className="text-xs text-muted-foreground truncate">{token.name}</div>
                    </div>
                  </button>
                ))}
              </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
