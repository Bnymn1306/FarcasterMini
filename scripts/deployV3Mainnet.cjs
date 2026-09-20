const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying ExecutorVaultV3 to Base Mainnet...");
  console.log("⚠️  WARNING: This is a MAINNET deployment with REAL funds!");
  console.log("");

  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  // Get balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance < hre.ethers.parseEther("0.001")) {
    console.error("❌ Insufficient balance for deployment!");
    process.exit(1);
  }

  // Contract addresses (Base Mainnet)
  const EXECUTOR_ADDRESS = deployer.address; // Backend wallet will be executor
  const ZERO_X_PROXY_ADDRESS = "0xDef1C0ded9bec7F1a1670819833240f027b25EfF"; // 0x Exchange Proxy (same on all chains)
  const WETH_ADDRESS = "0x4200000000000000000000000000000000000006"; // Base WETH (canonical)

  console.log("\n📋 Deployment Configuration:");
  console.log("- Network: Base Mainnet (chainId: 8453)");
  console.log("- Executor:", EXECUTOR_ADDRESS);
  console.log("- 0x Proxy:", ZERO_X_PROXY_ADDRESS);
  console.log("- WETH:", WETH_ADDRESS);
  console.log("");

  // Deploy ExecutorVaultV3
  console.log("🔨 Deploying ExecutorVaultV3...");
  const ExecutorVaultV3 = await hre.ethers.getContractFactory("ExecutorVaultV3");
  const vault = await ExecutorVaultV3.deploy(EXECUTOR_ADDRESS, ZERO_X_PROXY_ADDRESS, WETH_ADDRESS);
  
  console.log("⏳ Waiting for deployment transaction...");
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  
  console.log("✅ ExecutorVaultV3 deployed to:", vaultAddress);
  console.log("   (WETH and 0x proxy automatically approved in constructor)");

  // Get deployment transaction
  const deployTx = vault.deploymentTransaction();
  if (deployTx) {
    console.log("📝 Deployment TX:", deployTx.hash);
    console.log("⛽ Gas used:", deployTx.gasLimit.toString());
  }

  // Summary
  console.log("\n=== DEPLOYMENT SUMMARY ===");
  console.log("Network: Base Mainnet");
  console.log("Chain ID: 8453");
  console.log("ExecutorVaultV3:", vaultAddress);
  console.log("Executor:", EXECUTOR_ADDRESS);
  console.log("WETH:", WETH_ADDRESS);
  console.log("0x Proxy:", ZERO_X_PROXY_ADDRESS);
  
  console.log("\n=== CONTRACT FEATURES ===");
  console.log("✅ Universal auto-withdrawal (ANY Base token)");
  console.log("✅ Fee-on-transfer protection (double-fee detection)");
  console.log("✅ Token blacklist system");
  console.log("✅ Partial fill refund");
  console.log("✅ Emergency pause");
  console.log("✅ Approved tokens: WETH (more can be added)");
  
  console.log("\n=== NEXT STEPS ===");
  console.log("1. Verify contract on BaseScan:");
  console.log(`   npx hardhat verify --network base ${vaultAddress} ${EXECUTOR_ADDRESS} ${ZERO_X_PROXY_ADDRESS} ${WETH_ADDRESS}`);
  
  console.log("\n2. Update backend configuration:");
  console.log(`   - EXECUTOR_VAULT_V3_ADDRESS=${vaultAddress}`);
  console.log(`   - Update server/limitOrderExecutor.ts`);
  
  console.log("\n3. Approve additional tokens (if needed):");
  console.log(`   - USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`);
  console.log(`   - AERO: 0x940181a94A35A4569E4529A3CDfB74e38FD98631`);
  console.log(`   - DEGEN: 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed`);
  
  console.log("\n4. Staged rollout (RECOMMENDED):");
  console.log("   Phase 1: Test with deployer wallet only");
  console.log("   Phase 2: Whitelist 5-10 beta users");
  console.log("   Phase 3: Public release");
  
  console.log("\n⚠️  IMPORTANT: Monitor first 10 executions closely!");
  console.log("   - Check auto-withdrawal success");
  console.log("   - Verify fee-on-transfer handling");
  console.log("   - Confirm slippage protection");
  
  console.log("\n🔗 View on BaseScan:");
  console.log(`   https://basescan.org/address/${vaultAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
