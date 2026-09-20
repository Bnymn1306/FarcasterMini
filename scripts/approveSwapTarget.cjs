const hre = require("hardhat");

async function main() {
  console.log("🔧 Approving correct swap target for V3 vault...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Owner:", deployer.address);
  
  const VAULT_ADDRESS = "0x3905022308C9BdE5581078Ca4A9e413b608F764e";
  const CORRECT_SWAP_TARGET = "0x00000000001fF3684f28C67538D4D072C22734"; // 0x Allowance Holder
  
  const ExecutorVaultV3 = await hre.ethers.getContractFactory("ExecutorVaultV3");
  const vault = ExecutorVaultV3.attach(VAULT_ADDRESS);
  
  console.log("\n📋 Approving swap target:", CORRECT_SWAP_TARGET);
  const tx = await vault.setSwapTarget(CORRECT_SWAP_TARGET, true);
  
  console.log("⏳ Waiting for transaction...");
  await tx.wait();
  
  console.log("✅ Swap target approved!");
  console.log("Transaction:", tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
