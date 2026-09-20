import { ethers } from "ethers";
import PredictionMarketJSON from "../../client/src/lib/PredictionMarketABI.json";

const PREDICTION_MARKET_ADDRESS = "0x61fd09DFb9c3F1cFAE416a027a4618466AD39e96";
const PredictionMarketABI = (PredictionMarketJSON as any).abi;

/**
 * Create a new prediction market on blockchain (Backend-only - uses deployer key)
 */
export async function createPredictionMarketOnChain(
  castUrl: string,
  viralThreshold: number,
  deadlineTimestamp: number
): Promise<number> {
  try {
    const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const rpcUrl = process.env.BASE_RPC_URL;

    if (!deployerPrivateKey || !rpcUrl) {
      throw new Error("Missing DEPLOYER_PRIVATE_KEY or BASE_RPC_URL environment variables");
    }

    // Connect to Base mainnet
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(deployerPrivateKey, provider);
    
    // Get contract instance
    const contract = new ethers.Contract(PREDICTION_MARKET_ADDRESS, PredictionMarketABI, wallet);
    
    console.log("🔗 Creating prediction market on blockchain...");
    console.log("   Cast URL:", castUrl);
    console.log("   Threshold:", viralThreshold);
    console.log("   Deadline:", new Date(deadlineTimestamp * 1000).toISOString());
    
    // Call createPrediction (only owner can do this)
    const tx = await contract.createPrediction(
      castUrl,
      viralThreshold,
      deadlineTimestamp
    );
    
    console.log("⏳ Waiting for transaction confirmation...");
    const receipt = await tx.wait();
    
    // Extract market ID from event logs
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = contract.interface.parseLog(log);
        return parsed?.name === "PredictionCreated";
      } catch {
        return false;
      }
    });
    
    if (!event) {
      throw new Error("PredictionCreated event not found in transaction logs");
    }
    
    const parsed = contract.interface.parseLog(event);
    const marketId = Number(parsed?.args?.marketId);
    
    console.log("✅ Prediction market created! Market ID:", marketId);
    console.log("   TX Hash:", receipt.hash);
    
    return marketId;
  } catch (error: any) {
    console.error("Failed to create prediction market on blockchain:", error);
    throw new Error(`Blockchain market creation failed: ${error.message}`);
  }
}
