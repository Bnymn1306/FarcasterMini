/**
 * Deploy ExecutorVaultV3 to INK Mainnet
 * Uses LI.FI aggregator as the approved swap target (no Uniswap V3 on INK)
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... node scripts/deployInkVault.cjs
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const INK_RPC_URL = "https://rpc-gel.inkonchain.com";
const INK_CHAIN_ID = 57073;

const LIFI_INK_ROUTER = "0x864b314D4C5a0399368609581d3E8933a63b9232";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const USDC_ADDRESS = "0x2D270e6886d130D724215A266106e6832161EAEd";

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error("❌ DEPLOYER_PRIVATE_KEY env var is required");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(INK_RPC_URL);
  const network = await provider.getNetwork();
  console.log("🔗 Connected to network chainId:", network.chainId.toString());

  if (network.chainId !== BigInt(INK_CHAIN_ID)) {
    console.error(`❌ Wrong network! Expected INK (${INK_CHAIN_ID}), got ${network.chainId}`);
    process.exit(1);
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log("🔑 Deployer:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("💰 Balance:", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.0005")) {
    console.error("❌ Insufficient ETH! Need at least 0.0005 ETH for deployment.");
    console.error(`   Send ETH to ${wallet.address} on INK (chainId: ${INK_CHAIN_ID})`);
    process.exit(1);
  }

  const artifactPath = path.join(__dirname, '../contracts/artifacts/ExecutorVaultV3.sol/ExecutorVaultV3.json');
  if (!fs.existsSync(artifactPath)) {
    console.error("❌ Artifact not found:", artifactPath);
    console.error("   Run: cd contracts && npx hardhat compile");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log("\n📋 Deployment Configuration:");
  console.log("  Network:     INK Mainnet (chainId:", INK_CHAIN_ID, ")");
  console.log("  Executor:   ", wallet.address);
  console.log("  SwapTarget:  LI.FI Router", LIFI_INK_ROUTER);
  console.log("  WETH:       ", WETH_ADDRESS);
  console.log("");

  console.log("🚀 Deploying ExecutorVaultV3...");
  const vault = await factory.deploy(wallet.address, LIFI_INK_ROUTER, WETH_ADDRESS);

  console.log("⏳ Waiting for deployment confirmation...");
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  const deployTx = vault.deploymentTransaction();

  console.log("✅ ExecutorVaultV3 deployed:", vaultAddress);
  if (deployTx) {
    console.log("📝 Deploy TX:", deployTx.hash);
  }

  console.log("\n🔧 Approving USDC as deposit token...");
  const setApprovedTokenAbi = ["function setApprovedToken(address token, bool approved) external"];
  const vaultContract = new ethers.Contract(vaultAddress, setApprovedTokenAbi, wallet);

  const approveUsdcTx = await vaultContract.setApprovedToken(USDC_ADDRESS, true);
  await approveUsdcTx.wait(1);
  console.log("✅ USDC approved:", USDC_ADDRESS);

  console.log("\n========================================");
  console.log("  INK DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("  ExecutorVaultV3:", vaultAddress);
  console.log("  Executor (backend wallet):", wallet.address);
  console.log("  LI.FI Router (swap target):", LIFI_INK_ROUTER);
  console.log("  WETH (auto-approved in constructor):", WETH_ADDRESS);
  console.log("  USDC (approved):", USDC_ADDRESS);
  console.log("\n📌 Set these environment variables:");
  console.log(`  INK_EXECUTOR_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`  INK_USDC_ADDRESS=${USDC_ADDRESS}`);
  console.log("\n🔗 Explorer: https://explorer.inkonchain.com/address/" + vaultAddress);
}

main().catch(err => {
  console.error("❌ Deployment failed:", err.message || err);
  process.exit(1);
});
