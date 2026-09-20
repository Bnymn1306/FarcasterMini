const hre = require("hardhat");

async function main() {
  const VAULT_V2_ADDRESS = "0x830C397739485065513f94a3284ebd54aE638806";
  
  console.log("🔧 Approving tokens for ExecutorVault V2...");
  console.log(`📦 Vault V2: ${VAULT_V2_ADDRESS}`);

  const [owner] = await hre.ethers.getSigners();
  console.log(`👤 Owner: ${owner.address}`);

  const vault = await hre.ethers.getContractAt("ExecutorVault", VAULT_V2_ADDRESS);

  const tokens = [
    { name: "AERO", address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" },
    { name: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    { name: "DEGEN", address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed" }
  ];

  for (const token of tokens) {
    const isApproved = await vault.approvedTokens(token.address);
    if (isApproved) {
      console.log(`✅ ${token.name} - Already approved`);
    } else {
      const tx = await vault.setToken(token.address, true);
      await tx.wait();
      console.log(`✅ ${token.name} - Approved!`);
    }
  }
  
  console.log("🎉 Token approvals complete!");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
