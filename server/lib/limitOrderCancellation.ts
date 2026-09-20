import { ethers } from "ethers";
import type { LimitOrder } from "@shared/schema";

const EXECUTOR_VAULT_V1_ADDRESS = "0xC9c0f3596843Babc2F45837c88864B7c98191121";
const EXECUTOR_VAULT_V2_ADDRESS = "0x830C397739485065513f94a3284ebd54aE638806";
const EXECUTOR_VAULT_V3_ADDRESS = "0x3905022308C9BdE5581078Ca4A9e413b608F764e";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

const VAULT_ABI = [
  "function withdraw(address token, uint256 amount) external",
  "function balances(address user, address token) external view returns (uint256)",
  "function executorWithdraw(address user, address token, uint256 amount) external"
];

interface CancellationResult {
  success: boolean;
  txHash?: string;
  error?: string;
  withdrawnAmount?: string;
}

/**
 * Cancel limit order and withdraw funds from vault
 * This function is idempotent - safe to retry if withdrawal fails
 */
export async function cancelLimitOrderWithWithdrawal(
  order: LimitOrder
): Promise<CancellationResult> {
  try {
    // Determine which vault version to use
    const vaultAddress = order.vaultVersion === 'v3'
      ? EXECUTOR_VAULT_V3_ADDRESS
      : order.vaultVersion === 'v1'
      ? EXECUTOR_VAULT_V1_ADDRESS
      : EXECUTOR_VAULT_V2_ADDRESS;

    // Get backend wallet (executor)
    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const rpcUrl = process.env.BASE_RPC_URL;

    if (!deployerPrivateKey || !rpcUrl) {
      return {
        success: false,
        error: "Missing DEPLOYER_PRIVATE_KEY or BASE_RPC_URL environment variables"
      };
    }

    // Connect to Base mainnet
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(deployerPrivateKey, provider);
    const vaultContract = new ethers.Contract(vaultAddress, VAULT_ABI, wallet);

    // Determine which token to withdraw based on order type
    // BUY orders: withdraw WETH (makerToken)
    // SELL orders: withdraw the token being sold (makerToken)
    const tokenToWithdraw = order.orderType === 'buy' 
      ? WETH_ADDRESS 
      : order.tokenAddress;

    const tokenSymbol = order.orderType === 'buy' 
      ? 'WETH' 
      : order.tokenSymbol;

    if (!order.userWalletAddress) {
      return {
        success: false,
        error: "Order missing userWalletAddress - cannot determine vault owner"
      };
    }

    // Determine order-specific withdrawal amount
    // BUY orders: withdraw makerAmount (WETH deposited)
    // SELL orders: withdraw makerAmount (token deposited)
    if (!order.makerAmount) {
      return {
        success: false,
        error: "Order missing makerAmount - cannot determine withdrawal amount"
      };
    }

    const orderAmount = order.makerAmount;
    
    // Check vault balance before withdrawal (idempotency check)
    console.log(`🔍 Checking vault balance for ${order.userWalletAddress} - Token: ${tokenSymbol}`);
    const vaultBalance = await vaultContract.balances(order.userWalletAddress, tokenToWithdraw);
    
    if (vaultBalance === BigInt(0)) {
      console.log(`✅ Vault balance already zero for ${tokenSymbol} - withdrawal not needed`);
      return {
        success: true,
        withdrawnAmount: "0",
        txHash: undefined
      };
    }

    console.log(`💰 Vault balance: ${ethers.formatEther(vaultBalance)} ${tokenSymbol}`);
    console.log(`📊 Order amount: ${ethers.formatEther(orderAmount)} ${tokenSymbol}`);

    // CRITICAL: Only withdraw THIS order's amount, not entire vault balance
    // This prevents draining funds from other active orders using the same token
    const withdrawAmount = vaultBalance < orderAmount 
      ? vaultBalance 
      : orderAmount;

    // Execute withdrawal based on vault version
    let withdrawTx;
    
    if (order.vaultVersion === 'v2' || order.vaultVersion === 'v3') {
      // V2/V3: Use executorWithdraw (backend-controlled)
      console.log(`🔄 Withdrawing ${ethers.formatEther(withdrawAmount)} ${tokenSymbol} from ${order.vaultVersion} vault...`);
      withdrawTx = await vaultContract.executorWithdraw(
        order.userWalletAddress,
        tokenToWithdraw,
        withdrawAmount
      );
    } else {
      // V1: Direct withdraw (requires user signature)
      // For V1, we cannot auto-withdraw - user must do it manually
      return {
        success: false,
        error: `V1 vault requires user to manually withdraw ${tokenSymbol}. Please use the Withdraw button in the UI.`
      };
    }

    console.log(`⏳ Waiting for withdrawal confirmation: ${withdrawTx.hash}`);
    const receipt = await withdrawTx.wait();

    if (receipt && receipt.status === 1) {
      console.log(`✅ Withdrawal successful! ${ethers.formatEther(withdrawAmount)} ${tokenSymbol} sent to ${order.userWalletAddress}`);
      return {
        success: true,
        txHash: withdrawTx.hash,
        withdrawnAmount: ethers.formatEther(withdrawAmount)
      };
    } else {
      return {
        success: false,
        error: "Withdrawal transaction failed (receipt status !== 1)"
      };
    }

  } catch (error: any) {
    console.error("Error withdrawing from vault:", error);
    return {
      success: false,
      error: error.message || "Unknown withdrawal error"
    };
  }
}
