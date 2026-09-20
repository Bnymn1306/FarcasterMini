const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("🚀 Deploying PredictionMarket contract to Base...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Deploy PredictionMarket
  const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
  const predictionMarket = await PredictionMarket.deploy();
  
  await predictionMarket.waitForDeployment();
  const address = await predictionMarket.getAddress();

  console.log("✅ PredictionMarket deployed to:", address);
  console.log("Owner:", await predictionMarket.owner());
  console.log("Resolver:", await predictionMarket.resolver());
  console.log("Min Bet:", ethers.formatEther(await predictionMarket.MIN_BET()), "ETH");

  // Save deployment info
  const deploymentInfo = {
    address: address,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    network: "Base",
    minBet: ethers.formatEther(await predictionMarket.MIN_BET()),
  };

  fs.writeFileSync(
    "prediction-market-deployment.json",
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n📝 Deployment info saved to prediction-market-deployment.json");
  console.log("\n🔍 Verify contract on BaseScan:");
  console.log(`npx hardhat verify --network base ${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
