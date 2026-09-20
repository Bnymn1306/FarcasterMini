import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ethers } from 'ethers';
import { ArrowDownToLine, ArrowUpFromLine, Wallet, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useWallet } from '@/contexts/WalletContext';

const EXECUTOR_VAULT_V1_ADDRESS = "0xC9c0f3596843Babc2F45837c88864B7c98191121"; // Legacy (manual withdrawal)
const EXECUTOR_VAULT_V2_ADDRESS = "0x830C397739485065513f94a3284ebd54aE638806"; // Whitelisted tokens only
const EXECUTOR_VAULT_V3_ADDRESS = "0x3905022308C9BdE5581078Ca4A9e413b608F764e"; // Universal auto-withdrawal
const EXECUTOR_VAULT_ADDRESS = EXECUTOR_VAULT_V3_ADDRESS; // Always use V3 for all tokens
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const BASE_RPC = "https://mainnet.base.org"; // ✅ Use official Base RPC (llamarpc lags behind)

const WETH_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function deposit() payable",
  "function withdraw(uint256) returns (bool)"
];

const VAULT_ABI = [
  "function deposit(address token, uint256 amount) external",
  "function withdraw(address token, uint256 amount) external",
  "function balances(address user, address token) view returns (uint256)"
];

export function VaultPanel() {
  // ✅ Use WalletContext for Farcaster Frame compatibility
  const { walletAddress, isWalletConnected, connectWallet, getProvider } = useWallet();
  const { toast } = useToast();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // ✅ Use RPC provider for read-only calls (works in Farcaster Frame)
  const rpcProvider = new ethers.JsonRpcProvider(BASE_RPC);

  // Fetch V3 vault balance (universal auto-withdrawal)
  const { data: vaultBalance, refetch: refetchVaultBalance } = useQuery({
    queryKey: ['/api/vault-balance-v3', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return '0';
      
      const vaultContract = new ethers.Contract(EXECUTOR_VAULT_V3_ADDRESS, VAULT_ABI, rpcProvider);
      const balance = await vaultContract.balances(walletAddress, WETH_ADDRESS);
      return ethers.formatEther(balance);
    },
    enabled: !!walletAddress,
    refetchInterval: 10000,
  });

  // Fetch V1 vault balance (legacy, manual withdrawal)
  const { data: vaultBalanceV1, refetch: refetchVaultBalanceV1 } = useQuery({
    queryKey: ['/api/vault-balance-v1', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return '0';
      
      const vaultContract = new ethers.Contract(EXECUTOR_VAULT_V1_ADDRESS, VAULT_ABI, rpcProvider);
      const balance = await vaultContract.balances(walletAddress, WETH_ADDRESS);
      return ethers.formatEther(balance);
    },
    enabled: !!walletAddress,
    refetchInterval: 10000,
  });

  // Fetch wallet WETH balance
  const { data: walletWethBalance, refetch: refetchWalletBalance } = useQuery({
    queryKey: ['/api/weth-balance', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return '0';
      
      const wethContract = new ethers.Contract(WETH_ADDRESS, WETH_ABI, rpcProvider);
      const balance = await wethContract.balanceOf(walletAddress);
      return ethers.formatEther(balance);
    },
    enabled: !!walletAddress,
    refetchInterval: 10000,
  });

  // Fetch WETH allowance
  const { data: wethAllowance, refetch: refetchAllowance } = useQuery({
    queryKey: ['/api/weth-allowance', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return '0';
      
      const wethContract = new ethers.Contract(WETH_ADDRESS, WETH_ABI, rpcProvider);
      const allowance = await wethContract.allowance(walletAddress, EXECUTOR_VAULT_ADDRESS);
      return ethers.formatEther(allowance);
    },
    enabled: !!walletAddress,
    refetchInterval: 10000,
  });

  const handleApprove = async () => {
    if (!walletAddress || !depositAmount) return;

    // Validate amount is valid number
    const amount = parseFloat(depositAmount.trim());
    if (isNaN(amount) || amount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid amount",
        description: "Please enter a valid number greater than 0",
      });
      return;
    }

    // Get provider/signer from WalletContext (works with Farcaster Frame)
    const provider = await getProvider();
    if (!provider) {
      toast({
        variant: "destructive",
        title: "Wallet not connected",
        description: "Please connect your wallet and try again",
      });
      return;
    }

    setIsApproving(true);
    try {
      const signer = await provider.getSigner();
      const wethContract = new ethers.Contract(WETH_ADDRESS, WETH_ABI, signer);

      const amountWei = ethers.parseEther(depositAmount);
      // ✅ Farcaster Frame: Use explicit gasLimit (no estimateGas)
      const tx = await wethContract.approve(EXECUTOR_VAULT_ADDRESS, amountWei, { gasLimit: 60000 });
      
      toast({
        title: "Approval submitted",
        description: `Transaction: ${tx.hash.slice(0, 10)}...`,
      });

      await tx.wait();
      
      toast({
        title: "WETH approved!",
        description: `You can now deposit ${depositAmount} WETH to vault`,
      });

      refetchAllowance();
    } catch (error: any) {
      console.error('Approval error:', error);
      toast({
        variant: "destructive",
        title: "Approval failed",
        description: error.message || "Failed to approve WETH",
      });
    } finally {
      setIsApproving(false);
    }
  };

  const handleDeposit = async () => {
    if (!walletAddress || !depositAmount) return;

    // Validate amount is valid number
    const amount = parseFloat(depositAmount.trim());
    if (isNaN(amount) || amount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid amount",
        description: "Please enter a valid number greater than 0",
      });
      return;
    }

    // Get provider/signer from WalletContext (works with Farcaster Frame)
    const provider = await getProvider();
    if (!provider) {
      toast({
        variant: "destructive",
        title: "Wallet not connected",
        description: "Please connect your wallet and try again",
      });
      return;
    }

    setIsDepositing(true);
    try {
      const signer = await provider.getSigner();
      const vaultContract = new ethers.Contract(EXECUTOR_VAULT_ADDRESS, VAULT_ABI, signer);

      const amountWei = ethers.parseEther(depositAmount);
      // ✅ Farcaster Frame: Use explicit gasLimit (no estimateGas)
      const tx = await vaultContract.deposit(WETH_ADDRESS, amountWei, { gasLimit: 200000 });
      
      toast({
        title: "Deposit submitted",
        description: `Transaction: ${tx.hash.slice(0, 10)}...`,
      });

      await tx.wait();
      
      toast({
        title: "Deposit successful!",
        description: `${depositAmount} WETH deposited to vault`,
      });

      setDepositAmount('');
      refetchVaultBalance();
      refetchWalletBalance();
    } catch (error: any) {
      console.error('Deposit error:', error);
      toast({
        variant: "destructive",
        title: "Deposit failed",
        description: error.message || "Failed to deposit WETH",
      });
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!walletAddress || !withdrawAmount) return;

    // Validate amount is valid number
    const amount = parseFloat(withdrawAmount.trim());
    if (isNaN(amount) || amount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid amount",
        description: "Please enter a valid number greater than 0",
      });
      return;
    }

    // Get provider/signer from WalletContext (works with Farcaster Frame)
    const provider = await getProvider();
    if (!provider) {
      toast({
        variant: "destructive",
        title: "Wallet not connected",
        description: "Please connect your wallet and try again",
      });
      return;
    }

    setIsWithdrawing(true);
    try {
      const signer = await provider.getSigner();
      const vaultContract = new ethers.Contract(EXECUTOR_VAULT_ADDRESS, VAULT_ABI, signer);

      const amountWei = ethers.parseEther(withdrawAmount);
      // ✅ Farcaster Frame: Use explicit gasLimit (no estimateGas)
      const tx = await vaultContract.withdraw(WETH_ADDRESS, amountWei, { gasLimit: 150000 });
      
      toast({
        title: "Withdrawal submitted",
        description: `Transaction: ${tx.hash.slice(0, 10)}...`,
      });

      await tx.wait();
      
      toast({
        title: "Withdrawal successful!",
        description: `${withdrawAmount} WETH withdrawn from vault`,
      });

      setWithdrawAmount('');
      refetchVaultBalance();
      refetchWalletBalance();
    } catch (error: any) {
      console.error('Withdrawal error:', error);
      toast({
        variant: "destructive",
        title: "Withdrawal failed",
        description: error.message || "Failed to withdraw WETH",
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (!isWalletConnected) {
    return (
      <Card data-testid="card-vault">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            ExecutorVault
          </CardTitle>
          <CardDescription>Withdraw WETH from failed orders</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Wallet className="h-4 w-4" />
            <AlertDescription>
              Connect your wallet to manage vault deposits
            </AlertDescription>
          </Alert>
          <Button 
            onClick={() => connectWallet()}
            className="w-full mt-4"
            data-testid="button-connect-wallet"
          >
            Connect Wallet
          </Button>
        </CardContent>
      </Card>
    );
  }

  const needsApproval = parseFloat(wethAllowance || '0') < parseFloat(depositAmount || '0');

  return (
    <Card data-testid="card-vault">
      <CardHeader>
        <CardTitle>ExecutorVault</CardTitle>
        <CardDescription>
          Deposit WETH to enable automatic limit order execution
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Balance Display */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Vault Balance</Label>
            <div className="text-2xl font-bold" data-testid="text-vault-balance">
              {parseFloat(vaultBalance || '0').toFixed(4)} WETH
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Wallet Balance</Label>
            <div className="text-2xl font-bold" data-testid="text-wallet-balance">
              {parseFloat(walletWethBalance || '0').toFixed(4)} WETH
            </div>
          </div>
        </div>

        {/* Quick Withdraw All Button (Prominent) */}
        {parseFloat(vaultBalance || '0') > 0 && (
          <Button
            onClick={async () => {
              setIsWithdrawing(true);
              try {
                // Get provider/signer from WalletContext (works with Farcaster Frame)
                const provider = await getProvider();
                if (!provider) {
                  toast({
                    variant: "destructive",
                    title: "Wallet not connected",
                    description: "Please connect your wallet and try again",
                  });
                  return;
                }

                const signer = await provider.getSigner();
                
                // ✅ Use RPC for read, signer for write (Farcaster Frame pattern)
                const readVaultContract = new ethers.Contract(EXECUTOR_VAULT_ADDRESS, VAULT_ABI, rpcProvider);
                const writeVaultContract = new ethers.Contract(EXECUTOR_VAULT_ADDRESS, VAULT_ABI, signer);

                // Get actual address from signer (critical for Farcaster)
                const signerAddress = await signer.getAddress();
                const balance = await readVaultContract.balances(signerAddress, WETH_ADDRESS);
                
                if (balance === BigInt(0)) {
                  toast({
                    variant: "destructive",
                    title: "No funds to withdraw",
                    description: "Your vault balance is empty",
                  });
                  return;
                }
                
                // ✅ Farcaster Frame: Use explicit gasLimit (no estimateGas)
                const tx = await writeVaultContract.withdraw(WETH_ADDRESS, balance, { gasLimit: 150000 });
                
                toast({
                  title: "Withdrawal submitted",
                  description: `Transaction: ${tx.hash.slice(0, 10)}...`,
                });

                await tx.wait();
                
                toast({
                  title: "Withdrawal successful!",
                  description: `${ethers.formatEther(balance)} WETH withdrawn from vault`,
                });

                refetchVaultBalance();
                refetchWalletBalance();
              } catch (error: any) {
                console.error('Withdrawal error:', error);
                toast({
                  variant: "destructive",
                  title: "Withdrawal failed",
                  description: error.message || "Failed to withdraw WETH",
                });
              } finally {
                setIsWithdrawing(false);
              }
            }}
            disabled={isWithdrawing}
            variant="destructive"
            className="w-full gap-2"
            data-testid="button-withdraw-all"
          >
            <ArrowUpFromLine className="h-4 w-4" />
            {isWithdrawing ? 'Withdrawing...' : `Withdraw All ${parseFloat(vaultBalance || '0').toFixed(4)} WETH`}
          </Button>
        )}

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Deposit WETH before creating limit orders. Backend will automatically execute swaps when price conditions are met.
          </AlertDescription>
        </Alert>

        {/* Deposit Section */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4" />
            Deposit to Vault
          </Label>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Amount (WETH)"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              disabled={isDepositing || isApproving}
              data-testid="input-deposit-amount"
              className="flex-1"
            />
            <Button
              onClick={() => setDepositAmount(walletWethBalance || '0')}
              variant="outline"
              size="sm"
              disabled={isDepositing || isApproving}
              data-testid="button-max-deposit"
            >
              Max
            </Button>
          </div>
          
          {needsApproval ? (
            <Button
              onClick={handleApprove}
              disabled={isApproving || !depositAmount || parseFloat(depositAmount) <= 0}
              className="w-full"
              data-testid="button-approve-weth"
            >
              {isApproving ? 'Approving...' : `Approve ${depositAmount || '0'} WETH`}
            </Button>
          ) : (
            <Button
              onClick={handleDeposit}
              disabled={isDepositing || !depositAmount || parseFloat(depositAmount) <= 0}
              className="w-full"
              data-testid="button-deposit"
            >
              {isDepositing ? 'Depositing...' : `Deposit ${depositAmount || '0'} WETH`}
            </Button>
          )}
        </div>

        {/* Withdraw Section */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold flex items-center gap-2">
            <ArrowUpFromLine className="h-4 w-4" />
            Withdraw from Vault
          </Label>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Amount (WETH)"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              disabled={isWithdrawing}
              data-testid="input-withdraw-amount"
              className="flex-1"
            />
            <Button
              onClick={() => setWithdrawAmount(vaultBalance || '0')}
              variant="outline"
              size="sm"
              disabled={isWithdrawing}
              data-testid="button-max-withdraw"
            >
              Max
            </Button>
          </div>
          <Button
            onClick={handleWithdraw}
            disabled={isWithdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
            className="w-full"
            variant="secondary"
            data-testid="button-withdraw"
          >
            {isWithdrawing ? 'Withdrawing...' : `Withdraw ${withdrawAmount || '0'} WETH`}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground text-center pt-2">
          Vault Address: {EXECUTOR_VAULT_ADDRESS.slice(0, 6)}...{EXECUTOR_VAULT_ADDRESS.slice(-4)}
        </div>
      </CardContent>
    </Card>
  );
}

// Emergency Token Withdraw Component (for tokens stuck in vault)
export function EmergencyTokenWithdraw() {
  const { walletAddress, isWalletConnected, getProvider } = useWallet();
  const { toast } = useToast();
  const [tokenAddress, setTokenAddress] = useState('0x50f88fe97f72cd3e75b9eb4f747f59bceba80d59'); // Default to JESSE
  const [isLoading, setIsLoading] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [vaultBalance, setVaultBalance] = useState<string | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>('');
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);

  const checkVaultBalance = async () => {
    if (!walletAddress || !tokenAddress) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/vault-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, tokenAddress }),
      });
      const data = await response.json();
      
      if (data.error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: data.error,
        });
        return;
      }
      
      setVaultBalance(data.vaultBalance);
      setTokenSymbol(data.symbol);
      setTokenDecimals(data.decimals);
      
      if (parseFloat(data.vaultBalance) > 0) {
        toast({
          title: "Token Found!",
          description: `Found ${data.vaultBalance} ${data.symbol} in vault`,
        });
      } else {
        toast({
          title: "No Balance",
          description: `No ${data.symbol} found in vault for this wallet`,
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to check balance",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmergencyWithdraw = async () => {
    if (!walletAddress || !vaultBalance || parseFloat(vaultBalance) <= 0) return;
    
    const provider = await getProvider();
    if (!provider) {
      toast({
        variant: "destructive",
        title: "Wallet not connected",
        description: "Please connect your wallet",
      });
      return;
    }
    
    setIsWithdrawing(true);
    try {
      const signer = await provider.getSigner();
      
      const VAULT_ABI = ["function withdraw(address token, uint256 amount) external"];
      const vaultContract = new ethers.Contract(
        "0x3905022308C9BdE5581078Ca4A9e413b608F764e", // V3 Vault
        VAULT_ABI,
        signer
      );
      
      const amountWei = ethers.parseUnits(vaultBalance, tokenDecimals);
      
      toast({
        title: "Withdrawing...",
        description: `Please confirm the transaction in your wallet`,
      });
      
      const tx = await vaultContract.withdraw(tokenAddress, amountWei, {
        gasLimit: BigInt(150000), // Safe gas limit for withdraw
      });
      
      toast({
        title: "Transaction Sent",
        description: "Waiting for confirmation...",
      });
      
      await tx.wait(1);
      
      toast({
        title: "Success!",
        description: `Withdrew ${vaultBalance} ${tokenSymbol} from vault`,
      });
      
      setVaultBalance('0');
    } catch (error: any) {
      console.error('Withdraw error:', error);
      toast({
        variant: "destructive",
        title: "Withdraw Failed",
        description: error.message || "Transaction failed",
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (!isWalletConnected) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-yellow-500" />
          Emergency Token Withdraw
        </CardTitle>
        <CardDescription>
          Recover tokens stuck in vault from failed orders
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm">Token Contract Address</Label>
          <div className="flex gap-2">
            <Input
              placeholder="0x..."
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              disabled={isLoading || isWithdrawing}
              data-testid="input-emergency-token-address"
              className="flex-1 font-mono text-xs"
            />
            <Button
              onClick={checkVaultBalance}
              disabled={isLoading || !tokenAddress}
              variant="outline"
              data-testid="button-check-vault-balance"
            >
              {isLoading ? 'Checking...' : 'Check'}
            </Button>
          </div>
        </div>

        {vaultBalance !== null && (
          <div className="p-3 bg-muted rounded-md">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Vault Balance:</span>
              <span className="font-semibold" data-testid="text-vault-token-balance">
                {vaultBalance} {tokenSymbol}
              </span>
            </div>
          </div>
        )}

        {vaultBalance && parseFloat(vaultBalance) > 0 && (
          <Button
            onClick={handleEmergencyWithdraw}
            disabled={isWithdrawing}
            className="w-full"
            variant="destructive"
            data-testid="button-emergency-withdraw"
          >
            {isWithdrawing ? 'Withdrawing...' : `Withdraw All ${tokenSymbol}`}
          </Button>
        )}

        <div className="text-xs text-muted-foreground">
          <p>Common tokens:</p>
          <div className="flex flex-wrap gap-1 mt-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2"
              onClick={() => setTokenAddress('0x50f88fe97f72cd3e75b9eb4f747f59bceba80d59')}
            >
              JESSE
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2"
              onClick={() => setTokenAddress('0x4200000000000000000000000000000000000006')}
            >
              WETH
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
