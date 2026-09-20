const hre = require("hardhat");

async function main() {
  console.log("🎲 Deploying PredictionMarket to Base Mainnet...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.error("❌ Deployer account has no ETH. Please fund the account first.");
    process.exit(1);
  }

  const PredictionMarket = await hre.ethers.getContractFactory("PredictionMarket");
  console.log("📝 Deploying contract...");
  
  const market = await PredictionMarket.deploy();
  await market.waitForDeployment();

  const marketAddress = await market.getAddress();
  console.log("✅ PredictionMarket deployed to:", marketAddress);
  console.log("🔗 View on BaseScan:", `https://basescan.org/address/${marketAddress}`);
  console.log("\n📋 Update this address in: client/src/lib/predictionMarketContract.ts");
  console.log("export const PREDICTION_MARKET_ADDRESS =", `"${marketAddress}";`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
