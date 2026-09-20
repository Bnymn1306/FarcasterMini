import { ethers } from "ethers";
import PredictionMarketJSON from "./PredictionMarketABI.json";

// Contract address - Deployed to Base mainnet
export const PREDICTION_MARKET_ADDRESS = "0x61fd09DFb9c3F1cFAE416a027a4618466AD39e96";

// Minimum bet amount (0.0001 ETH)
export const MIN_BET = "0.0001";

// Extract ABI from JSON artifact
const PredictionMarketABI = (PredictionMarketJSON as any).abi;

export interface PredictionMarketContract {
  address: string;
  placeBet: (marketId: number, betFor: boolean, amount: string) => Promise<ethers.TransactionReceipt>;
  getUserBets: (marketId: number, userAddress: string) => Promise<{ forAmount: bigint; againstAmount: bigint }>;
  getMarket: (marketId: number) => Promise<any>;
  getPotentialPayout: (marketId: number, userAddress: string, assumeOutcome: boolean) => Promise<bigint>;
}

/**
 * Get PredictionMarket contract instance
 */
export async function getPredictionMarketContract(provider: ethers.BrowserProvider): Promise<ethers.Contract> {
  const signer = await provider.getSigner();
  return new ethers.Contract(PREDICTION_MARKET_ADDRESS, PredictionMarketABI, signer);
}

/**
 * Get read-only contract instance (for querying)
 */
export function getPredictionMarketContractReadOnly(provider: ethers.JsonRpcProvider): ethers.Contract {
  return new ethers.Contract(PREDICTION_MARKET_ADDRESS, PredictionMarketABI, provider);
}

/**
 * Place a bet on a prediction market
 */
export async function placeBet(
  provider: ethers.BrowserProvider,
  marketId: number,
  betFor: boolean,
  amountEth: string
): Promise<ethers.TransactionReceipt> {
  try {
    console.log("🔗 placeBet called with:", { marketId, betFor, amountEth });
    
    // Validate amount string
    if (!amountEth || amountEth.trim() === "") {
      throw new Error("Bet amount is empty");
    }
    
    const amountNum = parseFloat(amountEth);
    if (!isFinite(amountNum) || amountNum <= 0) {
      throw new Error(`Invalid bet amount: ${amountEth}`);
    }
    
    const contract = await getPredictionMarketContract(provider);
    
    // Convert ETH to Wei - use cleaned string
    console.log("💱 Converting to Wei:", amountEth);
    const valueWei = ethers.parseEther(amountEth.trim());
    
    // Call placeBet with ETH value
    const tx = await contract.placeBet(marketId, betFor, { value: valueWei });
    
    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    return receipt;
  } catch (error: any) {
    console.error("Failed to place bet:", error);
    
    // Parse user-friendly error messages
    if (error.code === "ACTION_REJECTED") {
      throw new Error("Transaction rejected by user");
    } else if (error.message?.includes("insufficient funds")) {
      throw new Error("Insufficient ETH balance");
    } else if (error.message?.includes("Bet below minimum")) {
      throw new Error(`Minimum bet is ${MIN_BET} ETH`);
    } else if (error.message?.includes("Betting period ended")) {
      throw new Error("Betting period has ended");
    } else if (error.message?.includes("Market already resolved")) {
      throw new Error("Market already resolved");
    }
    
    throw new Error(error.message || "Failed to place bet");
  }
}

/**
 * Get user's bet amounts for a market
 */
export async function getUserBets(
  provider: ethers.BrowserProvider,
  marketId: number,
  userAddress: string
): Promise<{ forAmount: bigint; againstAmount: bigint }> {
  const contract = await getPredictionMarketContract(provider);
  const [forAmount, againstAmount] = await contract.getUserBets(marketId, userAddress);
  return { forAmount, againstAmount };
}

/**
 * Get market details
 */
export async function getMarket(
  provider: ethers.BrowserProvider,
  marketId: number
): Promise<any> {
  const contract = await getPredictionMarketContract(provider);
  return await contract.getMarket(marketId);
}

/**
 * Get potential payout for a user
 */
export async function getPotentialPayout(
  provider: ethers.BrowserProvider,
  marketId: number,
  userAddress: string,
  assumeOutcome: boolean
): Promise<string> {
  const contract = await getPredictionMarketContract(provider);
  const payoutWei = await contract.getPotentialPayout(marketId, userAddress, assumeOutcome);
  return ethers.formatEther(payoutWei);
}

/**
 * Claim winnings after resolution
 */
export async function claimWinnings(
  provider: ethers.BrowserProvider,
  marketId: number
): Promise<ethers.TransactionReceipt> {
  try {
    const contract = await getPredictionMarketContract(provider);
    const tx = await contract.claimWinnings(marketId);
    const receipt = await tx.wait();
    return receipt;
  } catch (error: any) {
    console.error("Failed to claim winnings:", error);
    
    if (error.code === "ACTION_REJECTED") {
      throw new Error("Transaction rejected by user");
    } else if (error.message?.includes("No winning stake")) {
      throw new Error("You have no winnings to claim");
    } else if (error.message?.includes("Already claimed")) {
      throw new Error("Winnings already claimed");
    }
    
    throw new Error(error.message || "Failed to claim winnings");
  }
}
