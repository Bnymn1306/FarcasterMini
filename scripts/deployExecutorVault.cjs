const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying ExecutorVault contract...");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`📝 Deploying with account: ${deployer.address}`);

  // Backend executor address (same as deployer)
  const executorAddress = deployer.address;
  console.log(`🤖 Backend executor: ${executorAddress}`);

  // 0x Exchange Proxy on Base Mainnet
  const zeroXProxy = "0xDef1C0ded9bec7F1a1670819833240f027b25EfF";
  console.log(`🔄 0x Exchange Proxy: ${zeroXProxy}`);

  // WETH on Base Mainnet
  const weth = "0x4200000000000000000000000000000000000006";
  console.log(`💰 WETH Address: ${weth}`);

  // Deploy ExecutorVault
  const ExecutorVault = await hre.ethers.getContractFactory("ExecutorVault");
  const vault = await ExecutorVault.deploy(executorAddress, zeroXProxy, weth);
  
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  console.log(`✅ ExecutorVault deployed to: ${vaultAddress}`);
  console.log(`\n📋 Add to .env:\nEXECUTOR_VAULT_ADDRESS=${vaultAddress}\n`);

  // Verify deployment
  const storedExecutor = await vault.executor();
  const owner = await vault.owner();
  const is0xApproved = await vault.approvedSwapTargets(zeroXProxy);
  const isWethApproved = await vault.approvedTokens(weth);
  const isPaused = await vault.paused();
  
  console.log(`\n🔍 Verification:`);
  console.log(`   Owner: ${owner}`);
  console.log(`   Executor: ${storedExecutor}`);
  console.log(`   0x Proxy Approved: ${is0xApproved ? '✅' : '❌'}`);
  console.log(`   WETH Approved: ${isWethApproved ? '✅' : '❌'}`);
  console.log(`   Paused: ${isPaused ? '⚠️ Yes' : '✅ No'}`);

  return vaultAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
