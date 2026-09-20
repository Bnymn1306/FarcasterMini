const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying ExecutorVaultV3 to Soneium Mainnet...");
  console.log("⚠️  WARNING: This is a MAINNET deployment with REAL funds!");
  console.log("");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance < hre.ethers.parseEther("0.001")) {
    console.error("❌ Insufficient balance for deployment!");
    process.exit(1);
  }

  const EXECUTOR_ADDRESS = deployer.address;
  const KYO_SWAP_ROUTER = "0x0dC73Fe1341365929Ed8a89Dd47097A9FDD254D0";
  const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

  console.log("\n📋 Deployment Configuration:");
  console.log("- Network: Soneium Mainnet (chainId: 1868)");
  console.log("- Executor:", EXECUTOR_ADDRESS);
  console.log("- KYO SwapRouter:", KYO_SWAP_ROUTER);
  console.log("- WETH:", WETH_ADDRESS);
  console.log("");

  console.log("🔨 Deploying ExecutorVaultV3...");
  const ExecutorVaultV3 = await hre.ethers.getContractFactory("ExecutorVaultV3");
  const vault = await ExecutorVaultV3.deploy(EXECUTOR_ADDRESS, KYO_SWAP_ROUTER, WETH_ADDRESS);
  
  console.log("⏳ Waiting for deployment transaction...");
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  
  console.log("✅ ExecutorVaultV3 deployed to:", vaultAddress);

  const deployTx = vault.deploymentTransaction();
  if (deployTx) {
    console.log("📝 Deployment TX:", deployTx.hash);
    console.log("⛽ Gas used:", deployTx.gasLimit.toString());
  }

  console.log("\n=== SONEIUM DEPLOYMENT SUMMARY ===");
  console.log("Network: Soneium Mainnet");
  console.log("Chain ID: 1868");
  console.log("ExecutorVaultV3:", vaultAddress);
  console.log("Executor:", EXECUTOR_ADDRESS);
  console.log("WETH:", WETH_ADDRESS);
  console.log("KYO SwapRouter:", KYO_SWAP_ROUTER);
  
  console.log("\n=== NEXT STEPS ===");
  console.log("1. Update environment variable:");
  console.log(`   SONEIUM_EXECUTOR_VAULT_ADDRESS=${vaultAddress}`);
  
  console.log("\n2. Approve USDC for deposits:");
  console.log("   USDC: 0x7F5373AE26c3E8FfC4c77b7255DF7eC1A9aF52a6");
  
  console.log("\n🔗 View on Soneium Explorer:");
  console.log(`   https://soneium.blockscout.com/address/${vaultAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
