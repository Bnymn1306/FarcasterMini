import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, AlertTriangle, Play, Square, Plus, Trash2, RefreshCw, Zap, Activity, Eye, AlertCircle, CheckCircle, Vault, Download, Loader2, ArrowDownToLine, ExternalLink, ShieldCheck, ShieldAlert, ShieldX, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ethers } from "ethers";
import { useWallet } from "@/contexts/WalletContext";

const EXECUTOR_VAULT_V3_ADDRESS = "0x3905022308C9BdE5581078Ca4A9e413b608F764e";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)"
];

const VAULT_V3_ABI = [
  "function deposit(address token, uint256 amount) external",
  "function withdraw(address token, uint256 amount) external",
  "function balances(address user, address token) external view returns (uint256)"
];

interface RugpullSignal {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  timestamp: number;
  details: Record<string, any>;
}

interface MonitoredToken {
  tokenAddress: string;
  userAddress: string;
  userBalance: string;
  autoSellEnabled: boolean;
  initialLiquidity?: string;
  initialOwner?: string;
  initialBuyTax?: number;
  initialSellTax?: number;
  currentLiquidity?: string;
  currentOwner?: string;
  currentBuyTax?: number;
  currentSellTax?: number;
  signals: RugpullSignal[];
  lastCheck: number;
  status: 'active' | 'sold' | 'rugged' | 'stopped';
  createdAt: number;
}

interface DetectorStats {
  isRunning: boolean;
  totalMonitored: number;
  activeTokens: number;
  soldTokens: number;
  ruggedTokens: number;
  totalSignals: number;
  criticalSignals: number;
}

interface DetectorStatus {
  success: boolean;
  stats: DetectorStats;
  tokens: MonitoredToken[];
}

interface RugProtection {
  id: string;
  userId: string;
  userWalletAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string | null;
  tokenDecimals: number;
  depositAmount: string;
  vaultVersion: string;
  vaultAddress: string;
  status: 'active' | 'sold' | 'withdrawn' | 'failed';
  autoSellEnabled: boolean;
  lastSignalType: string | null;
  lastSignalSeverity: string | null;
  lastSignalMessage: string | null;
  soldPrice: string | null;
  soldAmount: string | null;
  txHash: string | null;
  failureReason: string | null;
  createdAt: string;
  soldAt: string | null;
}

export default function RugpullDetector() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { walletAddress, isWalletConnected, getProvider } = useWallet();
  const [newTokenAddress, setNewTokenAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [autoSellEnabled, setAutoSellEnabled] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositStep, setDepositStep] = useState<'idle' | 'approving' | 'depositing' | 'registering'>('idle');
  const [isApproved, setIsApproved] = useState(false);
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<{ symbol: string; name: string; decimals: number; balance: string } | null>(null);
  const [withdrawingIds, setWithdrawingIds] = useState<Set<string>>(new Set());
  const [vaultBalances, setVaultBalances] = useState<Record<string, string>>({});

  useEffect(() => {
    if (walletAddress) {
      // First try to get existing user (using query param)
      apiRequest('GET', `/api/users?walletAddress=${walletAddress}`)
        .then(res => {
          if (res.ok) {
            return res.json();
          }
          // User not found, create new user
          return apiRequest('POST', '/api/users', { walletAddress })
            .then(r => r.json());
        })
        .then(data => {
          if (data && data.id) {
            setUserId(data.id);
          }
        })
        .catch((err) => {
          console.error('User fetch/create error:', err);
        });
    }
  }, [walletAddress]);

  useEffect(() => {
    const fetchTokenInfo = async () => {
      if (!newTokenAddress || !ethers.isAddress(newTokenAddress) || !walletAddress) {
        setTokenInfo(null);
        return;
      }
      try {
        // ✅ Use dedicated RPC provider for reading token data (works in Farcaster mobile)
        // This doesn't depend on wallet provider which may not support RPC calls in Frame
        const rpcProvider = new ethers.JsonRpcProvider('https://mainnet.base.org');
        const tokenContract = new ethers.Contract(newTokenAddress, ERC20_ABI, rpcProvider);
        console.log('🔍 Fetching token info for:', newTokenAddress);
        const [symbol, name, decimals, balance] = await Promise.all([
          tokenContract.symbol(),
          tokenContract.name(),
          tokenContract.decimals(),
          tokenContract.balanceOf(walletAddress)
        ]);
        console.log('✅ Token info fetched:', { symbol, name, decimals: Number(decimals) });
        setTokenInfo({
          symbol,
          name,
          decimals: Number(decimals),
          balance: ethers.formatUnits(balance, decimals)
        });
      } catch (err) {
        console.error('❌ Failed to fetch token info:', err);
        setTokenInfo(null);
      }
    };
    fetchTokenInfo();
  }, [newTokenAddress, walletAddress]);

  const { data: status, isLoading, refetch } = useQuery<DetectorStatus>({
    queryKey: ['/api/rugpull-detector/status'],
    refetchInterval: 2000,
  });

  const { data: protectionsData, isLoading: protectionsLoading } = useQuery<{ success: boolean; protections: RugProtection[] }>({
    queryKey: ['/api/rug-protection/user', userId],
    enabled: !!userId,
    refetchInterval: 5000,
  });
  
  const protections = protectionsData?.protections;

  // Fetch vault balances for active protections with proper cleanup
  useEffect(() => {
    let isMounted = true;
    let interval: NodeJS.Timeout | null = null;

    const fetchVaultBalances = async () => {
      if (!walletAddress || !protections?.length) {
        if (isMounted) {
          setVaultBalances({});
        }
        return;
      }
      
      try {
        const freshBalances: Record<string, string> = {};
        
        const activeProtections = protections.filter(
          p => p.status === 'active' || p.status === 'failed'
        );
        
        // ✅ Use dedicated RPC provider for reading vault balances (works in Farcaster mobile)
        const rpcProvider = new ethers.JsonRpcProvider('https://mainnet.base.org');
        
        await Promise.all(
          activeProtections.map(async (protection) => {
            try {
              const vaultContract = new ethers.Contract(protection.vaultAddress, VAULT_V3_ABI, rpcProvider);
              const balance = await vaultContract.balances(walletAddress, protection.tokenAddress);
              freshBalances[protection.id] = ethers.formatUnits(balance, protection.tokenDecimals);
            } catch {
              freshBalances[protection.id] = '0';
            }
          })
        );
        
        if (isMounted) {
          setVaultBalances(freshBalances);
        }
      } catch (err) {
        console.error('Error fetching vault balances:', err);
      }
    };
    
    fetchVaultBalances();
    interval = setInterval(fetchVaultBalances, 10000);
    
    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [walletAddress, protections]);

  // Check approval status when token/amount changes
  useEffect(() => {
    if (tokenInfo && depositAmount && walletAddress) {
      checkApprovalStatus();
    } else {
      setIsApproved(false);
    }
  }, [tokenInfo, depositAmount, walletAddress, newTokenAddress]);

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/rugpull-detector/start');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rugpull-detector/status'] });
      toast({ title: "Detector Started", description: "Rugpull detector is now monitoring" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/rugpull-detector/stop');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rugpull-detector/status'] });
      toast({ title: "Detector Stopped", description: "Rugpull detector has been stopped" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const addTokenMutation = useMutation({
    mutationFn: async (data: { tokenAddress: string; userAddress: string; autoSellEnabled: boolean }) => {
      const res = await apiRequest('POST', '/api/rugpull-detector/monitor', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rugpull-detector/status'] });
      setNewTokenAddress("");
      toast({ title: "Token Added", description: "Token is now being monitored for rug signals" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const removeTokenMutation = useMutation({
    mutationFn: async (data: { tokenAddress: string; userAddress: string }) => {
      const res = await apiRequest('DELETE', `/api/rugpull-detector/monitor/${data.tokenAddress}/${data.userAddress}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rugpull-detector/status'] });
      toast({ title: "Token Removed", description: "Token removed from monitoring" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const emergencySellMutation = useMutation({
    mutationFn: async (data: { tokenAddress: string; userAddress: string }) => {
      const res = await apiRequest('POST', '/api/rugpull-detector/emergency-sell', data);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Emergency Sell Quote Ready", 
        description: `Estimated output: ${data.quote?.buyAmount ? (parseFloat(data.quote.buyAmount) / 1e18).toFixed(6) : '?'} ETH`
      });
    },
    onError: (error: any) => {
      toast({ title: "Sell Failed", description: error.message, variant: "destructive" });
    }
  });

  // Check if token is approved for deposit
  const checkApprovalStatus = async () => {
    if (!newTokenAddress || !walletAddress || !depositAmount || !tokenInfo) return;
    
    setIsCheckingApproval(true);
    try {
      const rpcProvider = new ethers.JsonRpcProvider('https://mainnet.base.org');
      const tokenReadContract = new ethers.Contract(newTokenAddress, ERC20_ABI, rpcProvider);
      const depositAmountWei = ethers.parseUnits(depositAmount, tokenInfo.decimals);
      const currentAllowance = await tokenReadContract.allowance(walletAddress, EXECUTOR_VAULT_V3_ADDRESS);
      console.log('📋 Checking allowance:', currentAllowance.toString(), 'Need:', depositAmountWei.toString());
      setIsApproved(currentAllowance >= depositAmountWei);
    } catch (error) {
      console.error('Error checking approval:', error);
      setIsApproved(false);
    } finally {
      setIsCheckingApproval(false);
    }
  };

  // Step 1: Approve token (separate transaction - FARCASTER-SAFE)
  const handleApproveToken = async () => {
    const walletProvider = getProvider();
    if (!newTokenAddress || !walletAddress || !depositAmount || !tokenInfo || !walletProvider) {
      toast({ title: "Error", description: "Please fill all fields and connect wallet", variant: "destructive" });
      return;
    }

    setIsDepositing(true);
    setDepositStep('approving');
    try {
      const signer = await walletProvider.getSigner();
      const tokenWriteContract = new ethers.Contract(newTokenAddress, ERC20_ABI, signer);
      const depositAmountWei = ethers.parseUnits(depositAmount, tokenInfo.decimals);

      console.log('🔓 Sending approve transaction...');
      // Use unlimited approval to avoid future approve transactions
      const maxApproval = ethers.MaxUint256;
      const approveTx = await tokenWriteContract.approve(EXECUTOR_VAULT_V3_ADDRESS, maxApproval, {
        gasLimit: 100000n
      });
      console.log('⏳ Waiting for approve tx via backend:', approveTx.hash);
      
      toast({ title: "Confirming Approval", description: "Waiting for blockchain confirmation..." });
      
      // ✅ FARCASTER-SAFE: Use backend to wait for confirmation (no client-side eth_getTransactionReceipt)
      const approveWaitResponse = await apiRequest('POST', '/api/wait-for-tx', {
        txHash: approveTx.hash,
        maxWaitMs: 30000
      });
      const approveWaitData = await approveWaitResponse.json();
      
      if (!approveWaitData.success || (approveWaitData.confirmed && approveWaitData.error)) {
        throw new Error(`Approval failed: ${approveWaitData.error || 'Transaction reverted'}`);
      }
      console.log('✅ Approval confirmed via backend');
      
      toast({ title: "Approved", description: "Token approved! Now click Deposit to continue." });
      
      // Verify allowance after backend confirmation
      const rpcProvider = new ethers.JsonRpcProvider('https://mainnet.base.org');
      const tokenReadContract = new ethers.Contract(newTokenAddress, ERC20_ABI, rpcProvider);
      
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const verifiedAllowance = await tokenReadContract.allowance(walletAddress, EXECUTOR_VAULT_V3_ADDRESS);
        console.log(`📋 Allowance check ${i+1}: ${verifiedAllowance.toString()}`);
        if (verifiedAllowance >= depositAmountWei) {
          setIsApproved(true);
          break;
        }
      }
    } catch (error: any) {
      console.error('Approve error:', error);
      toast({ 
        title: "Approval Failed", 
        description: error.message || "Failed to approve token", 
        variant: "destructive" 
      });
    } finally {
      setIsDepositing(false);
      setDepositStep('idle');
    }
  };

  // Step 2: Deposit token (separate transaction - FARCASTER-SAFE)
  const handleVaultDeposit = async () => {
    const walletProvider = getProvider();
    if (!newTokenAddress || !walletAddress || !userId || !depositAmount || !tokenInfo || !walletProvider) {
      toast({ title: "Error", description: "Please fill all fields and connect wallet", variant: "destructive" });
      return;
    }

    setIsDepositing(true);
    setDepositStep('depositing');
    try {
      // ✅ STEP 1: Backend must whitelist the token in the vault contract first
      toast({ title: "Preparing Vault", description: "Checking token whitelist status..." });
      console.log('🔐 Checking token whitelist status via backend...');
      
      const whitelistResponse = await apiRequest('POST', '/api/limit-orders/approve-token', {
        tokenAddress: newTokenAddress
      });
      const whitelistData = await whitelistResponse.json();
      
      if (!whitelistData.success) {
        throw new Error(whitelistData.error || 'Failed to check token whitelist');
      }
      
      if (whitelistData.alreadyApproved) {
        console.log('✅ Token already whitelisted in vault');
      } else if (whitelistData.skippedWhitelist) {
        console.log('⚠️ Token whitelist skipped:', whitelistData.reason);
        // Token is NOT whitelisted, deposit will fail on-chain
        throw new Error('This token is not yet approved for Rug Shield deposits. Please contact support or try a different token.');
      } else {
        console.log('✅ Token whitelisted in vault:', whitelistData.txHash);
        toast({ title: "Token Approved", description: "Vault is ready for deposit" });
      }
      
      const signer = await walletProvider.getSigner();
      const vaultContract = new ethers.Contract(EXECUTOR_VAULT_V3_ADDRESS, VAULT_V3_ABI, signer);
      const depositAmountWei = ethers.parseUnits(depositAmount, tokenInfo.decimals);

      console.log('💰 Sending deposit transaction...');
      const depositTx = await vaultContract.deposit(newTokenAddress, depositAmountWei, {
        gasLimit: 150000n
      });
      console.log('⏳ Waiting for deposit tx via backend:', depositTx.hash);
      
      toast({ title: "Confirming Deposit", description: "Waiting for blockchain confirmation..." });
      
      // ✅ FARCASTER-SAFE: Use backend to wait for confirmation
      const depositWaitResponse = await apiRequest('POST', '/api/wait-for-tx', {
        txHash: depositTx.hash,
        maxWaitMs: 30000
      });
      const depositWaitData = await depositWaitResponse.json();
      
      if (!depositWaitData.success || (depositWaitData.confirmed && depositWaitData.error)) {
        throw new Error(`Deposit failed: ${depositWaitData.error || 'Transaction reverted'}`);
      }
      console.log('✅ Deposit confirmed via backend');
      
      toast({ title: "Deposited", description: `${depositAmount} ${tokenInfo.symbol} deposited to vault` });

      setDepositStep('registering');
      const res = await apiRequest('POST', '/api/rug-protection', {
        userId,
        userWalletAddress: walletAddress,
        tokenAddress: newTokenAddress,
        tokenSymbol: tokenInfo.symbol,
        tokenName: tokenInfo.name,
        tokenDecimals: tokenInfo.decimals,
        depositAmount: depositAmountWei.toString(),
        vaultVersion: 'v3',
        vaultAddress: EXECUTOR_VAULT_V3_ADDRESS,
        autoSellEnabled,
      });

      if (!res.ok) {
        throw new Error('Failed to register protection');
      }

      queryClient.invalidateQueries({ queryKey: ['/api/rug-protection/user', userId] });
      queryClient.invalidateQueries({ queryKey: ['/api/rugpull-detector/status'] });
      
      setNewTokenAddress("");
      setDepositAmount("");
      setTokenInfo(null);
      setIsApproved(false);
      
      toast({ 
        title: "Protection Active", 
        description: `${tokenInfo.symbol} is now protected with auto-sell` 
      });

    } catch (error: any) {
      console.error('Vault deposit error:', error);
      toast({ 
        title: "Deposit Failed", 
        description: error.message || "Failed to deposit to vault", 
        variant: "destructive" 
      });
    } finally {
      setIsDepositing(false);
      setDepositStep('idle');
    }
  };

  const handleWithdraw = async (protection: RugProtection) => {
    const walletProvider = getProvider();
    if (!walletAddress || !walletProvider || withdrawingIds.has(protection.id)) return;

    setWithdrawingIds(prev => {
      const next = new Set([...prev]);
      next.add(protection.id);
      return next;
    });
    try {
      // Use dedicated RPC provider for READING (works in Farcaster mobile)
      const rpcProvider = new ethers.JsonRpcProvider('https://mainnet.base.org');
      const vaultReadContract = new ethers.Contract(protection.vaultAddress, VAULT_V3_ABI, rpcProvider);
      
      // Use wallet signer for WRITING (transactions)
      const signer = await walletProvider.getSigner();
      const vaultWriteContract = new ethers.Contract(protection.vaultAddress, VAULT_V3_ABI, signer);

      // Check balance using RPC provider (read operation)
      const balance = await vaultReadContract.balances(walletAddress, protection.tokenAddress);
      console.log('💰 Vault balance for', protection.tokenSymbol, ':', balance.toString());
      
      if (balance === 0n) {
        toast({ title: "No Balance", description: "No tokens to withdraw from vault", variant: "destructive" });
        setWithdrawingIds(prev => {
          const next = new Set([...prev]);
          next.delete(protection.id);
          return next;
        });
        return;
      }

      console.log('📤 Sending withdraw transaction...');
      // Use manual gas limit to bypass Farcaster gas estimation issues
      const withdrawTx = await vaultWriteContract.withdraw(protection.tokenAddress, balance, {
        gasLimit: 150000n
      });
      console.log('⏳ Waiting for withdraw tx via backend:', withdrawTx.hash);
      
      toast({ title: "Confirming Withdrawal", description: "Waiting for blockchain confirmation..." });
      
      // ✅ FARCASTER-SAFE: Use backend to wait for confirmation
      const withdrawWaitResponse = await apiRequest('POST', '/api/wait-for-tx', {
        txHash: withdrawTx.hash,
        maxWaitMs: 30000
      });
      const withdrawWaitData = await withdrawWaitResponse.json();
      
      if (!withdrawWaitData.success || (withdrawWaitData.confirmed && withdrawWaitData.error)) {
        throw new Error(`Withdrawal failed: ${withdrawWaitData.error || 'Transaction reverted'}`);
      }
      console.log('✅ Withdraw confirmed via backend');

      await apiRequest('PATCH', `/api/rug-protection/${protection.id}`, { status: 'withdrawn' });
      
      queryClient.invalidateQueries({ queryKey: ['/api/rug-protection/user', userId] });
      toast({ title: "Withdrawn Successfully", description: `${protection.tokenSymbol} tokens withdrawn from vault` });

    } catch (error: any) {
      console.error('Withdraw error:', error);
      toast({ title: "Withdraw Failed", description: error.message || "Transaction failed", variant: "destructive" });
    } finally {
      setWithdrawingIds(prev => {
        const next = new Set([...prev]);
        next.delete(protection.id);
        return next;
      });
    }
  };

  const handleAddToken = () => {
    if (!newTokenAddress || !walletAddress) {
      toast({ title: "Error", description: "Please enter token address and connect wallet", variant: "destructive" });
      return;
    }
    addTokenMutation.mutate({
      tokenAddress: newTokenAddress,
      userAddress: walletAddress,
      autoSellEnabled
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-500 text-white';
      case 'HIGH': return 'bg-orange-500 text-white';
      case 'MEDIUM': return 'bg-yellow-500 text-black';
      case 'LOW': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getStatusIcon = (tokenStatus: string) => {
    switch (tokenStatus) {
      case 'active': return <ShieldCheck className="w-4 h-4" />;
      case 'sold': return <CheckCircle className="w-4 h-4" />;
      case 'withdrawn': return <ArrowDownToLine className="w-4 h-4" />;
      case 'failed': return <ShieldX className="w-4 h-4" />;
      case 'rugged': return <ShieldAlert className="w-4 h-4" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  const getStatusStyles = (tokenStatus: string) => {
    switch (tokenStatus) {
      case 'active': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'sold': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'withdrawn': return 'bg-slate-500/10 text-slate-300 border-slate-500/30';
      case 'failed': return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'rugged': return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'stopped': return 'bg-slate-500/10 text-slate-300 border-slate-500/30';
      default: return 'bg-slate-500/10 text-slate-300 border-slate-500/30';
    }
  };

  const formatTimestamp = (ts: number | string) => {
    const date = new Date(ts);
    return date.toLocaleTimeString();
  };

  const formatAmount = (amount: string, decimals: number = 18) => {
    try {
      return parseFloat(ethers.formatUnits(amount, decimals)).toFixed(4);
    } catch {
      return '0';
    }
  };

  const protectionsList = Array.isArray(protections) ? protections : [];
  const activeProtections = protectionsList.filter(p => p.status === 'active');
  const completedProtections = protectionsList.filter(p => p.status !== 'active');

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20 border border-primary/30">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Rug Shield</h1>
            <p className="text-muted-foreground text-sm">
              Real-time monitoring with auto-sell protection
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          {status?.stats?.isRunning ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              data-testid="button-stop-detector"
            >
              <Square className="w-4 h-4 mr-1" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              data-testid="button-start-detector"
              className="bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90"
            >
              <Play className="w-4 h-4 mr-1" />
              Start
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="overflow-hidden border border-violet-500/30 bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 shadow-lg shadow-violet-500/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-violet-300 uppercase tracking-wider font-medium">Status</p>
                <p className="text-lg font-bold flex items-center gap-2 mt-1">
                  {status?.stats?.isRunning ? (
                    <>
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400"></span>
                      </span>
                      <span className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">Running</span>
                    </>
                  ) : (
                    <>
                      <span className="w-3 h-3 rounded-full bg-slate-500"></span>
                      <span className="text-slate-300">Stopped</span>
                    </>
                  )}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/30 to-purple-600/20 border border-violet-400/20">
                <Activity className="w-6 h-6 text-violet-300" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border border-emerald-500/30 bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 shadow-lg shadow-emerald-500/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-emerald-300 uppercase tracking-wider font-medium">Protected</p>
                <p className="text-3xl font-bold text-emerald-400 mt-1 drop-shadow-[0_0_12px_rgba(52,211,153,0.5)]">{activeProtections.length}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/30 to-green-600/20 border border-emerald-400/20">
                <ShieldCheck className="w-6 h-6 text-emerald-300" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border border-orange-500/30 bg-gradient-to-br from-orange-950 via-slate-900 to-slate-950 shadow-lg shadow-orange-500/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-orange-300 uppercase tracking-wider font-medium">Signals</p>
                <p className="text-3xl font-bold text-orange-400 mt-1 drop-shadow-[0_0_12px_rgba(251,146,60,0.5)]">{status?.stats?.totalSignals || 0}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500/30 to-amber-600/20 border border-orange-400/20">
                <AlertTriangle className="w-6 h-6 text-orange-300" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border border-cyan-500/30 bg-gradient-to-br from-cyan-950 via-slate-900 to-slate-950 shadow-lg shadow-cyan-500/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-cyan-300 uppercase tracking-wider font-medium">Auto-Sold</p>
                <p className="text-3xl font-bold text-cyan-400 mt-1 drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]">{protectionsList.filter(p => p.status === 'sold').length}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/30 to-teal-600/20 border border-cyan-400/20">
                <CheckCircle className="w-6 h-6 text-cyan-300" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="vault" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-900/80 border border-slate-700/50 p-1">
          <TabsTrigger value="vault" data-testid="tab-vault" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-violet-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-cyan-500/20">
            <Vault className="w-4 h-4 mr-2" />
            Vault Protection
          </TabsTrigger>
          <TabsTrigger value="monitor" data-testid="tab-monitor" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-violet-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-cyan-500/20">
            <Eye className="w-4 h-4 mr-2" />
            Monitor Only
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vault" className="space-y-6 mt-6">
          {/* Deposit Form */}
          <Card className="border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-cyan-950/20 to-slate-900 shadow-xl shadow-cyan-500/5">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/30 to-violet-600/20 border border-cyan-400/30">
                  <Vault className="w-6 h-6 text-cyan-300" />
                </div>
                <div>
                  <CardTitle className="text-xl text-white">Enable Vault Protection</CardTitle>
                  <CardDescription className="mt-1 text-slate-400">
                    Deposit tokens for automatic rug protection. If a rug signal is detected, tokens are automatically sold.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-300">Token Address</Label>
                  <Input
                    placeholder="0x... Token Contract Address"
                    value={newTokenAddress}
                    onChange={(e) => setNewTokenAddress(e.target.value)}
                    data-testid="input-vault-token-address"
                    className="bg-slate-800/80 border-slate-600 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-300">Amount to Protect</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="0.0"
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      data-testid="input-deposit-amount"
                      className="bg-slate-800/80 border-slate-600 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-500/20"
                    />
                    {tokenInfo && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDepositAmount(tokenInfo.balance)}
                        data-testid="button-max-amount"
                        className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300"
                      >
                        Max
                      </Button>
                    )}
                  </div>
                  {tokenInfo && (
                    <p className="text-xs text-slate-400">
                      Balance: {parseFloat(tokenInfo.balance).toFixed(4)} {tokenInfo.symbol}
                    </p>
                  )}
                </div>
              </div>

              {tokenInfo && (
                <div className="p-4 bg-gradient-to-r from-violet-950/50 to-cyan-950/50 rounded-xl border border-violet-500/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-gradient-to-br from-violet-500/30 to-cyan-500/20 border border-violet-400/30">
                      <Zap className="w-5 h-5 text-violet-300" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">{tokenInfo.name}</p>
                      <p className="text-xs text-violet-300">{tokenInfo.symbol} - {tokenInfo.decimals} decimals</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-800/70 border border-emerald-500/30">
                  <Switch
                    id="vault-auto-sell"
                    checked={autoSellEnabled}
                    onCheckedChange={setAutoSellEnabled}
                    data-testid="switch-vault-auto-sell"
                  />
                  <Label htmlFor="vault-auto-sell" className="text-sm cursor-pointer">
                    <span className="font-medium text-white">Auto-Sell on Rug Detection</span>
                    <span className="block text-xs text-emerald-400">Automatically sell when danger detected</span>
                  </Label>
                </div>
                <div className="flex gap-2">
                  {!isApproved ? (
                    <Button
                      onClick={handleApproveToken}
                      disabled={isDepositing || !newTokenAddress || !depositAmount || !tokenInfo}
                      data-testid="button-approve-token"
                      className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-semibold min-w-[140px] shadow-lg shadow-amber-500/25"
                    >
                      {isDepositing && depositStep === 'approving' ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Approving...
                        </>
                      ) : isCheckingApproval ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        <>
                          <Shield className="w-4 h-4 mr-2" />
                          1. Approve
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleVaultDeposit}
                      disabled={isDepositing || !newTokenAddress || !depositAmount || !tokenInfo || !userId}
                      data-testid="button-vault-deposit"
                      className="bg-gradient-to-r from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 text-white font-semibold min-w-[180px] shadow-lg shadow-cyan-500/25"
                    >
                      {isDepositing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {depositStep === 'depositing' ? 'Depositing...' : 'Registering...'}
                        </>
                      ) : (
                        <>
                          <Shield className="w-4 h-4 mr-2" />
                          2. Deposit & Protect
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {!walletAddress && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <p className="text-sm text-amber-500">Connect wallet to enable protection</p>
                </div>
              )}
              {!userId && walletAddress && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  <p className="text-sm text-blue-400">Setting up your account...</p>
                </div>
              )}
              {newTokenAddress && !ethers.isAddress(newTokenAddress) && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <p className="text-sm text-amber-500">Enter a valid Base token address (starts with 0x). Solana tokens are not supported.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Protections */}
          {activeProtections.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-semibold">Active Protections</h2>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  {activeProtections.length}
                </Badge>
              </div>
              
              <div className="grid gap-4">
                {activeProtections.map((protection) => (
                  <Card 
                    key={protection.id} 
                    className="border-emerald-500/20 bg-gradient-to-br from-slate-900/80 to-emerald-900/10 overflow-hidden"
                    data-testid={`protection-card-${protection.id}`}
                  >
                    <CardContent className="p-5">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-3">
                          {/* Token Header */}
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <div className="p-2 rounded-lg bg-emerald-500/20">
                                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                              </div>
                              <span className="text-xl font-bold">{protection.tokenSymbol}</span>
                            </div>
                            <code className="text-xs font-mono px-2 py-1 rounded bg-slate-800 text-slate-300">
                              {protection.tokenAddress.slice(0, 10)}...{protection.tokenAddress.slice(-8)}
                            </code>
                            <Badge className={`${getStatusStyles(protection.status)} flex items-center gap-1`}>
                              {getStatusIcon(protection.status)}
                              <span className="capitalize">{protection.status}</span>
                            </Badge>
                            {protection.autoSellEnabled && (
                              <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-500/10">
                                <Zap className="w-3 h-3 mr-1" />
                                Auto-Sell
                              </Badge>
                            )}
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="p-3 rounded-lg bg-slate-800/50">
                              <p className="text-xs text-slate-400 uppercase tracking-wider">Deposited</p>
                              <p className="text-lg font-semibold text-white">
                                {formatAmount(protection.depositAmount, protection.tokenDecimals)}
                              </p>
                              <p className="text-xs text-slate-300">{protection.tokenSymbol}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-800/50">
                              <p className="text-xs text-slate-400 uppercase tracking-wider">Vault Balance</p>
                              <p className="text-lg font-semibold text-emerald-400">
                                {vaultBalances[protection.id] ? parseFloat(vaultBalances[protection.id]).toFixed(4) : '...'}
                              </p>
                              <p className="text-xs text-slate-300">{protection.tokenSymbol}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-800/50">
                              <p className="text-xs text-slate-400 uppercase tracking-wider">Vault</p>
                              <p className="text-lg font-semibold text-white">V3</p>
                              <p className="text-xs text-slate-300">ExecutorVault</p>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-800/50">
                              <p className="text-xs text-slate-400 uppercase tracking-wider">Protected Since</p>
                              <p className="text-lg font-semibold text-white">
                                {new Date(protection.createdAt).toLocaleDateString()}
                              </p>
                              <p className="text-xs text-slate-300">{new Date(protection.createdAt).toLocaleTimeString()}</p>
                            </div>
                          </div>

                          {/* Signal Alert */}
                          {protection.lastSignalMessage && (
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-amber-400">Signal Detected</p>
                                <p className="text-sm text-amber-300/80">{protection.lastSignalMessage}</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Withdraw Button - Always Visible & Prominent */}
                        <div className="flex flex-col gap-2 lg:min-w-[200px]">
                          <Button
                            variant="outline"
                            onClick={() => handleWithdraw(protection)}
                            disabled={withdrawingIds.has(protection.id)}
                            data-testid={`button-withdraw-${protection.id}`}
                            className="w-full border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500"
                          >
                            {withdrawingIds.has(protection.id) ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Withdrawing...
                              </>
                            ) : (
                              <>
                                <ArrowDownToLine className="w-4 h-4 mr-2" />
                                Withdraw All
                              </>
                            )}
                          </Button>
                          <p className="text-xs text-center text-slate-400">
                            Withdraw tokens from vault anytime
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Completed/Historical Protections */}
          {completedProtections.length > 0 && (
            <Card className="border-slate-700/50">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-slate-300" />
                  <CardTitle className="text-base">History</CardTitle>
                  <Badge variant="outline" className="text-slate-300 border-slate-600">
                    {completedProtections.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {completedProtections.map((protection) => (
                    <div
                      key={protection.id}
                      className="flex items-center justify-between gap-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50"
                      data-testid={`protection-history-${protection.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg ${
                          protection.status === 'sold' ? 'bg-cyan-500/20' :
                          protection.status === 'withdrawn' ? 'bg-slate-500/20' :
                          'bg-red-500/20'
                        }`}>
                          {getStatusIcon(protection.status)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{protection.tokenSymbol}</span>
                            <Badge className={`${getStatusStyles(protection.status)} text-xs`}>
                              {protection.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-400 truncate">
                            {formatAmount(protection.depositAmount, protection.tokenDecimals)} {protection.tokenSymbol}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        {protection.status === 'sold' && protection.soldPrice && (
                          <div className="text-right">
                            <p className="text-sm font-medium text-cyan-400">
                              +{parseFloat(protection.soldPrice).toFixed(6)} ETH
                            </p>
                            <p className="text-xs text-slate-400">Auto-sold</p>
                          </div>
                        )}
                        {protection.txHash && (
                          <a
                            href={`https://basescan.org/tx/${protection.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4 text-slate-300" />
                          </a>
                        )}
                        {protection.status === 'failed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleWithdraw(protection)}
                            disabled={withdrawingIds.has(protection.id)}
                            data-testid={`button-withdraw-failed-${protection.id}`}
                            className="border-slate-600"
                          >
                            {withdrawingIds.has(protection.id) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <ArrowDownToLine className="w-4 h-4 mr-1" />
                                Withdraw
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {!protectionsLoading && !protections?.length && (
            <Card className="border-dashed border-2 border-slate-700">
              <CardContent className="py-12 text-center">
                <div className="p-4 rounded-full bg-slate-800/50 w-fit mx-auto mb-4">
                  <Shield className="w-12 h-12 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-300 mb-2">No Protected Tokens Yet</h3>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  Deposit tokens above to enable rug protection. Your tokens will be automatically sold if a rug signal is detected.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="monitor" className="space-y-6 mt-6">
          <Card className="border-slate-700/50 bg-gradient-to-br from-slate-900/80 to-slate-800/50">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-700/50">
                  <Plus className="w-5 h-5 text-slate-300" />
                </div>
                <div>
                  <CardTitle>Add Token to Monitor</CardTitle>
                  <CardDescription className="mt-1">
                    Monitor-only mode: Get alerts but no automatic selling
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="0x... Token Contract Address"
                  value={newTokenAddress}
                  onChange={(e) => setNewTokenAddress(e.target.value)}
                  className="flex-1 bg-slate-900/50 border-slate-700"
                  data-testid="input-token-address"
                />
                <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50">
                  <Switch
                    id="auto-sell"
                    checked={autoSellEnabled}
                    onCheckedChange={setAutoSellEnabled}
                    data-testid="switch-auto-sell"
                  />
                  <Label htmlFor="auto-sell" className="text-sm whitespace-nowrap">Auto-Sell</Label>
                </div>
                <Button
                  onClick={handleAddToken}
                  disabled={addTokenMutation.isPending || !newTokenAddress}
                  data-testid="button-add-token"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Monitor
                </Button>
              </div>
              {!walletAddress && (
                <div className="flex items-center gap-2 p-3 mt-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <p className="text-sm text-amber-500">Connect wallet to add tokens</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-700/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-700/50">
                  <Eye className="w-5 h-5 text-slate-300" />
                </div>
                <div>
                  <CardTitle>Monitored Tokens</CardTitle>
                  <CardDescription>
                    Real-time monitoring every 100ms for liquidity, ownership, tax, honeypot signals
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
              ) : !status?.tokens?.length ? (
                <div className="text-center py-12">
                  <Eye className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-400">No tokens being monitored. Add a token above to start.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {status.tokens.map((token) => (
                    <div
                      key={`${token.tokenAddress}-${token.userAddress}`}
                      className="border border-slate-700/50 rounded-xl p-4 space-y-3 bg-slate-800/30"
                      data-testid={`token-card-${token.tokenAddress}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-sm font-mono truncate">{token.tokenAddress}</code>
                            <Badge className={getStatusStyles(token.status)}>
                              {token.status}
                            </Badge>
                            {token.autoSellEnabled && (
                              <Badge variant="outline" className="border-cyan-500/50 text-cyan-400">
                                <Zap className="w-3 h-3 mr-1" />
                                Auto-Sell
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                            <div className="p-2 rounded-lg bg-slate-900/50">
                              <span className="block text-xs text-slate-400">Liquidity</span>
                              <span className="font-medium">{parseFloat(token.currentLiquidity || '0').toFixed(4)} ETH</span>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-900/50">
                              <span className="block text-xs text-slate-400">Buy Tax</span>
                              <span className="font-medium">{token.currentBuyTax || 0}%</span>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-900/50">
                              <span className="block text-xs text-slate-400">Sell Tax</span>
                              <span className="font-medium">{token.currentSellTax || 0}%</span>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-900/50">
                              <span className="block text-xs text-slate-400">Last Check</span>
                              <span className="font-medium">{formatTimestamp(token.lastCheck)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => emergencySellMutation.mutate({
                              tokenAddress: token.tokenAddress,
                              userAddress: token.userAddress
                            })}
                            disabled={emergencySellMutation.isPending}
                            title="Emergency Sell"
                            data-testid={`button-emergency-sell-${token.tokenAddress}`}
                            className="hover:bg-orange-500/20"
                          >
                            <Zap className="w-4 h-4 text-orange-500" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeTokenMutation.mutate({
                              tokenAddress: token.tokenAddress,
                              userAddress: token.userAddress
                            })}
                            disabled={removeTokenMutation.isPending}
                            title="Remove"
                            data-testid={`button-remove-${token.tokenAddress}`}
                            className="hover:bg-red-500/20"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>

                      {token.signals.length > 0 && (
                        <div className="border-t border-slate-700/50 pt-3 space-y-2">
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Recent Signals</p>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {token.signals.slice(-5).reverse().map((signal, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 text-xs p-2 rounded-lg bg-slate-900/50"
                              >
                                <Badge className={`${getSeverityColor(signal.severity)} text-[10px] px-1.5 py-0`}>
                                  {signal.severity}
                                </Badge>
                                <span className="flex-1 truncate">{signal.message}</span>
                                <span className="text-slate-400">{formatTimestamp(signal.timestamp)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detection Algorithms Info */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-cyan-500/5">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <CheckCircle className="w-5 h-5 text-primary" />
            </div>
            <CardTitle>Detection Algorithms</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { title: "Liquidity Removal", desc: "Detects LP token burns/withdrawals" },
              { title: "Ownership Changes", desc: "Monitors owner() address changes" },
              { title: "Honeypot Detection", desc: "Checks if selling is blocked (99% tax)" },
              { title: "Tax Increases", desc: "Alerts on buy/sell tax changes" },
              { title: "Blacklist Detection", desc: "Checks if your address is blacklisted" },
              { title: "Trading Pause", desc: "Detects paused() or disabled trading" },
            ].map((algo, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                <p className="font-medium text-sm">{algo.title}</p>
                <p className="text-xs text-slate-400 mt-1">{algo.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
