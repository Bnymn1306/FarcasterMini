const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying ExecutorVault V2 with auto-withdrawal...");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`📝 Deploying with account: ${deployer.address}`);

  // Backend executor address (same as deployer)
  const executorAddress = deployer.address;
  console.log(`🤖 Backend executor: ${executorAddress}`);

  // 0x AllowanceHolder on Base Mainnet (for v2 compatibility)
  const zeroXAllowanceHolder = "0x0000000000001fF3684f28c67538d4D072C22734";
  console.log(`🔄 0x AllowanceHolder: ${zeroXAllowanceHolder}`);

  // WETH on Base Mainnet
  const weth = "0x4200000000000000000000000000000000000006";
  console.log(`💰 WETH Address: ${weth}`);

  // Deploy ExecutorVault V2
  const ExecutorVault = await hre.ethers.getContractFactory("ExecutorVault");
  const vault = await ExecutorVault.deploy(executorAddress, zeroXAllowanceHolder, weth);
  
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log(`✅ ExecutorVault V2 deployed to: ${vaultAddress}`);
  console.log(`\n📋 Add to .env:\nEXECUTOR_VAULT_V2_ADDRESS=${vaultAddress}\n`);

  // Verify deployment
  const storedExecutor = await vault.executor();
  const owner = await vault.owner();
  const is0xApproved = await vault.approvedSwapTargets(zeroXAllowanceHolder);
  const isWethApproved = await vault.approvedTokens(weth);
  const isPaused = await vault.paused();
  
  console.log(`\n🔍 Verification:`);
  console.log(`   Owner: ${owner}`);
  console.log(`   Executor: ${storedExecutor}`);
  console.log(`   0x AllowanceHolder Approved: ${is0xApproved ? '✅' : '❌'}`);
  console.log(`   WETH Approved: ${isWethApproved ? '✅' : '❌'}`);
  console.log(`   Paused: ${isPaused ? '⚠️ Yes' : '✅ No'}`);

  console.log(`\n🔧 Next Steps:`);
  console.log(`   1. Add EXECUTOR_VAULT_V2_ADDRESS to .env`);
  console.log(`   2. Approve tokens: node scripts/approve-tokens-v2.cjs`);
  console.log(`   3. Update backend to use v2 for new deposits`);
  console.log(`   4. Keep v1 vault (${process.env.EXECUTOR_VAULT_ADDRESS}) for legacy withdrawals`);

  return vaultAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
