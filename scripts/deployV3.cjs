const hre = require("hardhat");

async function main() {
  console.log("Deploying ExecutorVaultV3 to Base Sepolia...");

  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  // Get balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // Contract addresses (Base Sepolia)
  const EXECUTOR_ADDRESS = deployer.address; // Backend wallet will be executor
  const ZERO_X_PROXY_ADDRESS = "0xDef1C0ded9bec7F1a1670819833240f027b25EfF"; // 0x Exchange Proxy (same on all chains)
  const WETH_ADDRESS = "0x4200000000000000000000000000000000000006"; // Base WETH

  // Deploy ExecutorVaultV3
  console.log("\nDeploying ExecutorVaultV3...");
  const ExecutorVaultV3 = await hre.ethers.getContractFactory("ExecutorVaultV3");
  const vault = await ExecutorVaultV3.deploy(EXECUTOR_ADDRESS, ZERO_X_PROXY_ADDRESS, WETH_ADDRESS);
  
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  
  console.log("✅ ExecutorVaultV3 deployed to:", vaultAddress);
  console.log("   (WETH and 0x proxy automatically approved in constructor)");

  // Summary
  console.log("\n=== DEPLOYMENT SUMMARY ===");
  console.log("Network:", hre.network.name);
  console.log("Chain ID:", (await hre.ethers.provider.getNetwork()).chainId);
  console.log("ExecutorVaultV3:", vaultAddress);
  console.log("Executor:", EXECUTOR_ADDRESS);
  console.log("WETH:", WETH_ADDRESS);
  console.log("0x Proxy:", ZERO_X_PROXY_ADDRESS);
  console.log("\n=== NEXT STEPS ===");
  console.log("1. Verify contract on BaseScan:");
  console.log(`   npx hardhat verify --network baseSepolia ${vaultAddress} ${EXECUTOR_ADDRESS} ${ZERO_X_PROXY_ADDRESS} ${WETH_ADDRESS}`);
  console.log("\n2. Update backend with new vault address");
  console.log("\n3. Test with real limit order execution");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
