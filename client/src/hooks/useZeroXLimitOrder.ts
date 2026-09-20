import { useMutation } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/contexts/WalletContext';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  buildZeroXLimitOrder,
  signZeroXOrder,
  BASE_CHAIN_ID,
} from '@/lib/zeroX';

// ExecutorVault addresses (mainnet Base) - for BUY orders only
const EXECUTOR_VAULT_V1_ADDRESS = "0xC9c0f3596843Babc2F45837c88864B7c98191121";
const EXECUTOR_VAULT_V2_ADDRESS = "0x830C397739485065513f94a3284ebd54aE638806";
const EXECUTOR_VAULT_V3_ADDRESS = "0x3905022308C9BdE5581078Ca4A9e413b608F764e";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

// ✅ Use official Base RPC for read-only calls (llamarpc lags behind ~460k blocks!)
const BASE_RPC = "https://mainnet.base.org";

// 0x Protocol AllowanceHolder (for SELL orders - vault bypass)
const ALLOWANCE_HOLDER_ADDRESS = "0x0000000000001fF3684f28c67538d4D072C22734";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const VAULT_ABI = [
  "function deposit(address token, uint256 amount) external",
  "function withdraw(address token, uint256 amount) external",
  "function balances(address user, address token) view returns (uint256)"
];

export interface CreateLimitOrderParams {
  userId: string;
  tokenId?: string | null;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number; // ✅ Pass decimals directly to avoid RPC calls in Farcaster
  orderType: 'buy' | 'sell';
  targetPrice: string;
  ethAmount: string;
  tokenAmount: string;
  totalValue: string;
  expiryMinutes?: number;
  vaultVersion: 'v1' | 'v2' | 'v3';
}

export function useZeroXLimitOrder() {
  const { toast } = useToast();
  const { walletAddress, getProvider } = useWallet();

  const createAndSubmitOrderMutation = useMutation({
    mutationFn: async (params: CreateLimitOrderParams) => {
      if (!walletAddress) {
        throw new Error('Wallet not connected');
      }

      // ✅ Use WalletContext provider (works with Farcaster Frame + MetaMask)
      const provider = getProvider();
      if (!provider) {
        throw new Error('Wallet provider not available. Please connect your wallet first.');
      }
      
      // ✅ ROBUST: Handle wallet authorization errors gracefully
      let signer;
      let signerAddress: string;
      try {
        // First, request accounts to ensure site is authorized
        await provider.send('eth_requestAccounts', []);
        signer = await provider.getSigner();
        signerAddress = await signer.getAddress();
        console.log('🔐 Wallet addresses:', { contextAddress: walletAddress, signerAddress });
      } catch (signerError: any) {
        console.error('❌ Wallet signer error:', signerError);
        
        // Check for common wallet authorization errors
        const errorMessage = signerError?.message || signerError?.toString() || '';
        const errorCode = signerError?.code || signerError?.error?.code;
        
        if (errorMessage.includes('not been authorized') || 
            errorMessage.includes('User rejected') ||
            errorCode === 4001 || errorCode === 4100) {
          throw new Error('Please authorize this site in your wallet extension. Click the wallet icon in your browser and approve the connection.');
        }
        
        if (errorMessage.includes('eth_accounts') || errorMessage.includes('Cannot read properties')) {
          throw new Error('Wallet connection issue. Please disconnect and reconnect your wallet, or try refreshing the page.');
        }
        
        // Re-throw with better message
        throw new Error(`Wallet error: ${errorMessage.slice(0, 100)}`);
      }
      
      let network;
      try {
        network = await provider.getNetwork();
      } catch (networkError: any) {
        console.error('❌ Network check error:', networkError);
        throw new Error('Could not detect network. Please ensure your wallet is connected to Base network.');
      }
      if (Number(network.chainId) !== BASE_CHAIN_ID) {
        throw new Error(`Please switch to Base network (Chain ID: ${BASE_CHAIN_ID})`);
      }

      if (!params.vaultVersion || !['v1', 'v2', 'v3'].includes(params.vaultVersion)) {
        throw new Error(`Invalid vault version: ${params.vaultVersion}. Must be v1, v2, or v3.`);
      }
      
      const vaultVersion = params.vaultVersion;
      const EXECUTOR_VAULT_ADDRESS = vaultVersion === 'v3' 
        ? EXECUTOR_VAULT_V3_ADDRESS 
        : vaultVersion === 'v1'
        ? EXECUTOR_VAULT_V1_ADDRESS
        : EXECUTOR_VAULT_V2_ADDRESS;

      const totalSteps = params.orderType === 'sell' ? 6 : 5;
      
      // ✅ CRITICAL: Create RPC provider for read operations (Farcaster cannot do contract reads!)
      const rpcProvider = new ethers.JsonRpcProvider(BASE_RPC);
      
      // ✅ Use token decimals passed from UI (no RPC call needed - works in Farcaster!)
      const tokenDecimals = params.tokenDecimals;
      console.log('📊 Using token decimals:', tokenDecimals, 'for', params.tokenSymbol);
      
      toast({
        title: `Step 1/${totalSteps}: Preparing Order`,
        description: `Creating ${params.orderType} order... (${vaultVersion} vault)`,
      });

      let ethAmountWei: bigint;
      let tokenAmountWei: bigint;
      let truncatedTokenAmount: string;
      
      if (params.orderType === 'buy') {
        ethAmountWei = ethers.parseEther(params.ethAmount);
        
        const parts = params.tokenAmount.split('.');
        const truncatedFraction = parts[1] ? parts[1].slice(0, tokenDecimals) : '';
        truncatedTokenAmount = truncatedFraction ? parts[0] + '.' + truncatedFraction : parts[0];
        tokenAmountWei = ethers.parseUnits(truncatedTokenAmount, tokenDecimals);
      } else {
        // SELL: ethAmount contains token amount (user input)
        const parts = params.ethAmount.split('.');
        const truncatedFraction = parts[1] ? parts[1].slice(0, tokenDecimals) : '';
        truncatedTokenAmount = truncatedFraction ? parts[0] + '.' + truncatedFraction : parts[0];
        tokenAmountWei = ethers.parseUnits(truncatedTokenAmount, tokenDecimals);
        
        // SELL: tokenAmount is WETH to receive (must truncate to 18 decimals!)
        const wethParts = params.tokenAmount.split('.');
        const wethTruncatedFraction = wethParts[1] ? wethParts[1].slice(0, 18) : '';
        const truncatedWethAmount = wethTruncatedFraction ? wethParts[0] + '.' + wethTruncatedFraction : wethParts[0];
        ethAmountWei = ethers.parseEther(truncatedWethAmount);
      }

      const totalValue = params.orderType === 'buy'
        ? (parseFloat(params.ethAmount) * parseFloat(params.targetPrice)).toFixed(2) 
        : (parseFloat(params.ethAmount) * parseFloat(params.targetPrice)).toFixed(2);

      const makerAmount = params.orderType === 'buy' 
        ? ethAmountWei.toString()
        : tokenAmountWei.toString();
      
      const takerAmount = params.orderType === 'buy'
        ? tokenAmountWei.toString()
        : ethAmountWei.toString();

      let depositedAmount: bigint = BigInt(0);
      let vaultContract: ethers.Contract | null = null;
      const depositToken = params.orderType === 'buy' ? WETH_ADDRESS : params.tokenAddress;
      const depositAmount = params.orderType === 'buy' ? ethAmountWei : tokenAmountWei;
      const depositSymbol = params.orderType === 'buy' ? 'WETH' : params.tokenSymbol;

      try {
        // rpcProvider already created above for decimals() call
        
        if (params.orderType === 'buy') {
          toast({
            title: 'Step 2/5: Check Balances',
            description: 'Checking vault and wallet balances...',
          });

          // ✅ Use RPC for reads, signer for writes
          const wethContractRead = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, rpcProvider);
          const wethContractWrite = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, signer);
          const vaultContractRead = new ethers.Contract(EXECUTOR_VAULT_ADDRESS, VAULT_ABI, rpcProvider);
          
          // ✅ Use signerAddress (not walletAddress) for accurate balance checks
          console.log('💰 Checking balances for signer:', signerAddress);
          const ethBalance = await rpcProvider.getBalance(signerAddress);
          console.log('💰 ETH Balance:', ethers.formatEther(ethBalance));
          
          // ✅ CRITICAL: Check vault balance FIRST - if enough, skip deposit entirely!
          const vaultBalance = await vaultContractRead.balances(signerAddress, WETH_ADDRESS);
          console.log('🏦 Vault WETH Balance:', ethers.formatEther(vaultBalance));
          
          // Calculate how much more we need to deposit (if any)
          const neededFromWallet = vaultBalance >= ethAmountWei ? BigInt(0) : ethAmountWei - vaultBalance;
          console.log('📊 Need to deposit:', ethers.formatEther(neededFromWallet), 'WETH');
          
          if (neededFromWallet > BigInt(0)) {
            // Need to deposit more - check wallet balance
            if (ethBalance < ethers.parseEther('0.001')) {
              throw new Error(
                `Insufficient ETH for gas fees. Your Farcaster wallet (${signerAddress.slice(0,6)}...${signerAddress.slice(-4)}) has ${ethers.formatEther(ethBalance)} ETH. ` +
                `Please add at least 0.001 ETH (~$3-4) to your Farcaster wallet for gas fees.`
              );
            }
            
            const wethBalance = await wethContractRead.balanceOf(signerAddress);
            console.log('💰 WETH Balance:', ethers.formatEther(wethBalance));
            
            if (wethBalance < neededFromWallet) {
              const balanceFormatted = ethers.formatEther(wethBalance);
              const neededFormatted = ethers.formatEther(neededFromWallet);
              const vaultFormatted = ethers.formatEther(vaultBalance);
              throw new Error(
                `Insufficient WETH. Vault has ${vaultFormatted} WETH, need ${ethers.formatEther(ethAmountWei)} total. ` +
                `Your wallet has ${balanceFormatted} WETH but needs ${neededFormatted} more. ` +
                `Please wrap ETH to WETH first using the Swap tab.`
              );
            }
            
            toast({
              title: 'Step 2/5: Approve WETH',
              description: 'Checking WETH allowance...',
            });
            
            const allowance = await wethContractRead.allowance(signerAddress, EXECUTOR_VAULT_ADDRESS);
            
            if (allowance < neededFromWallet) {
              toast({
                title: 'Step 2/5: Approve WETH',
                description: 'Approving unlimited WETH (one-time only)...',
              });

              const approveTx = await wethContractWrite.approve(EXECUTOR_VAULT_ADDRESS, ethers.MaxUint256, {
                gasLimit: BigInt(60000) // Safe gas limit for ERC20 approve
              });
              
              toast({
                title: 'Step 2/5: Confirming Approval',
                description: 'Waiting for approval confirmation...',
              });
              
              await approveTx.wait(1); // Fast confirmation (1 block ~2s on Base)
            }

            toast({
              title: 'Step 3/5: Deposit WETH to Vault',
              description: `Depositing ${ethers.formatEther(neededFromWallet)} WETH...`,
            });

            vaultContract = new ethers.Contract(EXECUTOR_VAULT_ADDRESS, VAULT_ABI, signer);
            
            // ✅ Skip staticCall - Farcaster doesn't support read operations via signer
            const depositTx = await vaultContract.deposit(WETH_ADDRESS, neededFromWallet, {
              gasLimit: BigInt(150000) // Safe gas limit for deposit
            });
            
            toast({
              title: 'Step 3/5: Confirming Deposit',
              description: 'Waiting for deposit confirmation...',
            });
            
            await depositTx.wait(1); // Fast confirmation (1 block ~2s on Base)
            depositedAmount = neededFromWallet;
          } else {
            // ✅ Vault already has enough - skip deposit entirely!
            console.log('✅ Vault already has sufficient WETH, skipping deposit');
            toast({
              title: 'Step 3/5: Vault Ready',
              description: `Using existing ${ethers.formatEther(vaultBalance)} WETH in vault`,
            });
            depositedAmount = BigInt(0); // No new deposit needed
            vaultContract = new ethers.Contract(EXECUTOR_VAULT_ADDRESS, VAULT_ABI, signer);
          }
        } else {
          // SELL ORDER - Deposit tokens to vault (same flow as BUY)
          toast({
            title: `Step 2/6: Check ${params.tokenSymbol} Balance`,
            description: `Verifying you have enough ${params.tokenSymbol}...`,
          });

          // ✅ CRITICAL: Use backend API for balance checks (Farcaster cannot do client-side RPC!)
          const tokenContractWrite = new ethers.Contract(params.tokenAddress, ERC20_ABI, signer);
          
          console.log('💰 Fetching balances via backend API for:', signerAddress);
          const balanceResponse = await apiRequest('POST', '/api/token-balance', {
            walletAddress: signerAddress,
            tokenAddress: params.tokenAddress,
            decimals: tokenDecimals
          });
          const balanceData = await balanceResponse.json();
          
          if (balanceData.error) {
            throw new Error(`Failed to check balance: ${balanceData.error}`);
          }
          
          console.log('💰 ETH Balance:', balanceData.ethBalance);
          console.log(`💰 ${params.tokenSymbol} Balance:`, balanceData.tokenBalance);
          
          if (parseFloat(balanceData.ethBalance) < 0.001) {
            throw new Error(
              `Insufficient ETH for gas fees. Your Farcaster wallet (${signerAddress.slice(0,6)}...${signerAddress.slice(-4)}) has ${balanceData.ethBalance} ETH. ` +
              `Please add at least 0.001 ETH (~$3-4) to your Farcaster wallet for gas fees.`
            );
          }
          
          const tokenBalance = BigInt(balanceData.tokenBalanceWei);
          
          if (tokenBalance < tokenAmountWei) {
            throw new Error(
              `Insufficient ${params.tokenSymbol} balance. Your Farcaster wallet (${signerAddress.slice(0,6)}...${signerAddress.slice(-4)}) has ${balanceData.tokenBalance} ${params.tokenSymbol} but needs ${ethers.formatUnits(tokenAmountWei, tokenDecimals)} ${params.tokenSymbol}.`
            );
          }
          
          // ✅ FARCASTER-SAFE: Backend whitelists token FIRST (before user approval)
          toast({
            title: `Step 2/6: Preparing Vault`,
            description: `Ensuring ${params.tokenSymbol} is whitelisted...`,
          });

          try {
            const approvalResponse = await apiRequest('POST', '/api/limit-orders/approve-token', {
              tokenAddress: params.tokenAddress
            });
            const approvalData = await approvalResponse.json();
            
            if (!approvalData.success) {
              throw new Error('Backend token approval failed');
            }
            
            if (approvalData.alreadyApproved) {
              console.log(`✅ Token ${params.tokenSymbol} already whitelisted`);
            } else {
              console.log(`✅ Token ${params.tokenSymbol} whitelisted (tx: ${approvalData.txHash})`);
            }
          } catch (approvalError: any) {
            throw new Error(`Failed to whitelist ${params.tokenSymbol} in vault: ${approvalError.message || 'Unknown error'}. Please try again.`);
          }

          toast({
            title: `Step 3/6: Approve ${params.tokenSymbol}`,
            description: `Please approve ${params.tokenSymbol} for vault deposit...`,
          });
          
          // ✅ Single user approval: Token → Vault
          const approveTx = await tokenContractWrite.approve(EXECUTOR_VAULT_ADDRESS, ethers.MaxUint256, {
            gasLimit: BigInt(60000)
          });
          
          toast({
            title: 'Step 3/6: Confirming Approval',
            description: 'Backend is confirming transaction...',
          });
          
          // ✅ FARCASTER-SAFE: Use backend to wait for confirmation (no client-side eth_getTransactionReceipt)
          const approveWaitResponse = await apiRequest('POST', '/api/wait-for-tx', {
            txHash: approveTx.hash,
            maxWaitMs: 20000
          });
          const approveWaitData = await approveWaitResponse.json();
          
          if (!approveWaitData.success || (approveWaitData.confirmed && approveWaitData.error)) {
            throw new Error(`Approval failed: ${approveWaitData.error || 'Transaction reverted'}`);
          }
          console.log('✅ Approval confirmed via backend');

          toast({
            title: `Step 4/6: Deposit ${params.tokenSymbol}`,
            description: `Please confirm deposit to vault...`,
          });

          vaultContract = new ethers.Contract(EXECUTOR_VAULT_ADDRESS, VAULT_ABI, signer);
          
          const depositTx = await vaultContract.deposit(params.tokenAddress, tokenAmountWei, {
            gasLimit: BigInt(200000)
          });
          
          toast({
            title: 'Step 4/6: Confirming Deposit',
            description: 'Backend is confirming transaction...',
          });
          
          // ✅ FARCASTER-SAFE: Use backend to wait for deposit confirmation
          const depositWaitResponse = await apiRequest('POST', '/api/wait-for-tx', {
            txHash: depositTx.hash,
            maxWaitMs: 20000
          });
          const depositWaitData = await depositWaitResponse.json();
          
          if (!depositWaitData.success || (depositWaitData.confirmed && depositWaitData.error)) {
            throw new Error(`Deposit failed: ${depositWaitData.error || 'Transaction reverted'}`);
          }
          console.log('✅ Deposit confirmed via backend');
          
          depositedAmount = tokenAmountWei;
        }
      } catch (depositError: any) {
        console.error('Deposit error details:', depositError);
        
        let errorMessage = 'Deposit failed: ';
        
        if (depositError.message?.includes('insufficient funds')) {
          errorMessage += 'Insufficient ETH for gas fees. Please add more ETH to your wallet.';
        } else if (depositError.message?.includes('Contract is paused')) {
          errorMessage += 'ExecutorVault is currently paused. Please try again later.';
        } else if (depositError.message?.includes('Token not approved')) {
          errorMessage += `${depositSymbol} is not whitelisted in the vault. Please contact support.`;
        } else if (depositError.message?.includes('user rejected')) {
          errorMessage += 'Transaction rejected. Please approve the transaction in your wallet.';
        } else if (depositError.code === 'ACTION_REJECTED') {
          errorMessage += 'Transaction rejected. Please approve the transaction in your wallet.';
        } else {
          errorMessage += depositError.message || 'Unknown error. Please check your wallet connection and try again.';
        }
        
        throw new Error(errorMessage);
      }

      toast({
        title: `Step ${params.orderType === 'sell' ? 5 : 4}/${totalSteps}: Sign Order`,
        description: 'Please sign the order in MetaMask...',
      });

      const { order, domain, types } = buildZeroXLimitOrder({
        walletAddress,
        tokenAddress: params.tokenAddress,
        orderType: params.orderType,
        makerAmount,
        takerAmount,
        expiryMinutes: params.expiryMinutes,
      });

      let signature: string;
      try {
        signature = await signZeroXOrder(order, domain, types, signer);
      } catch (signError: any) {
        if (depositedAmount > BigInt(0) && vaultContract) {
          toast({
            title: 'Rolling Back Deposit',
            description: `Signature failed, withdrawing your ${depositSymbol}...`,
            variant: 'destructive',
          });
          try {
            const withdrawTx = await vaultContract.withdraw(depositToken, depositedAmount);
            await withdrawTx.wait(1); // Fast confirmation (1 block ~2s on Base)
          } catch (withdrawError) {
            console.error('Rollback withdraw failed:', withdrawError);
            toast({
              title: 'Rollback Failed',
              description: `Your ${depositSymbol} is still in the vault. Please withdraw manually via VaultPanel.`,
              variant: 'destructive',
            });
          }
        }
        
        if (signError.code === 'ACTION_REJECTED') {
          throw new Error(`Signature rejected. Your ${depositSymbol} has been withdrawn.`);
        }
        throw signError;
      }

      toast({
        title: `Step ${params.orderType === 'sell' ? 6 : 5}/${totalSteps}: Creating Order`,
        description: 'Saving order to database...',
      });

      const orderData = {
        userId: params.userId,
        tokenId: params.tokenId,
        tokenAddress: params.tokenAddress,
        tokenSymbol: params.tokenSymbol,
        orderType: params.orderType,
        targetPrice: params.targetPrice,
        ethAmount: params.ethAmount,
        tokenAmount: truncatedTokenAmount,
        totalValue: totalValue,
        signature: signature,
        order: order,
        domain: domain,
        vaultVersion: params.vaultVersion || 'v2',
        vaultAddress: EXECUTOR_VAULT_ADDRESS, // Both BUY and SELL use vault now
      };

      let createdOrder;
      try {
        const createResponse = await apiRequest('POST', '/api/limit-orders', orderData);
        createdOrder = await createResponse.json();
      } catch (apiError: any) {
        if (depositedAmount > BigInt(0) && vaultContract) {
          toast({
            title: 'Rolling Back Deposit',
            description: `Order creation failed, withdrawing your ${depositSymbol}...`,
            variant: 'destructive',
          });
          try {
            const withdrawTx = await vaultContract.withdraw(depositToken, depositedAmount);
            await withdrawTx.wait(1); // Fast confirmation (1 block ~2s on Base)
          } catch (withdrawError) {
            console.error('Rollback withdraw failed:', withdrawError);
            toast({
              title: 'Rollback Failed',
              description: `Your ${depositSymbol} is still in the vault. Please withdraw manually via VaultPanel.`,
              variant: 'destructive',
            });
          }
        }
        throw new Error(`Order creation failed: ${apiError.message || 'Unknown error'}`);
      }

      if (params.orderType === 'buy') {
        toast({
          title: '✅ BUY Order Created!',
          description: `Your WETH is deposited in vault. Order will execute automatically when price is reached. Cancel anytime to withdraw.`,
        });
      } else {
        toast({
          title: '✅ SELL Order Created!',
          description: `Your ${params.tokenSymbol} is deposited in vault. Order will execute automatically when price is reached. Cancel anytime to withdraw.`,
        });
      }

      return createdOrder;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/limit-orders/user', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['/api/limit-orders/ready', variables.userId] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Create Order',
        description: error.message || 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    },
  });

  return {
    createAndSubmitOrder: createAndSubmitOrderMutation.mutate,
    createAndSubmitOrderAsync: createAndSubmitOrderMutation.mutateAsync,
    isCreating: createAndSubmitOrderMutation.isPending,
    error: createAndSubmitOrderMutation.error,
    reset: createAndSubmitOrderMutation.reset,
  };
}
