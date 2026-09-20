const hre = require("hardhat");

async function main() {
  console.log("🔧 Approving tokens for ExecutorVault V2...");

  const VAULT_V2_ADDRESS = process.env.EXECUTOR_VAULT_V2_ADDRESS;
  
  if (!VAULT_V2_ADDRESS) {
    throw new Error("Missing EXECUTOR_VAULT_V2_ADDRESS in .env");
  }

  console.log(`📦 Vault V2 Address: ${VAULT_V2_ADDRESS}`);

  const [owner] = await hre.ethers.getSigners();
  console.log(`👤 Owner: ${owner.address}`);

  const vault = await hre.ethers.getContractAt("ExecutorVault", VAULT_V2_ADDRESS);

  // Tokens to approve
  const tokensToApprove = [
    {
      name: "AERO",
      address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631"
    },
    {
      name: "USDC",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    },
    {
      name: "DEGEN",
      address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed"
    }
  ];

  console.log(`\n📝 Approving ${tokensToApprove.length} tokens...\n`);

  for (const token of tokensToApprove) {
    try {
      const isApproved = await vault.approvedTokens(token.address);
      
      if (isApproved) {
        console.log(`✅ ${token.name} (${token.address}) - Already approved`);
      } else {
        const tx = await vault.approveToken(token.address);
        await tx.wait();
        console.log(`✅ ${token.name} (${token.address}) - Approved!`);
      }
    } catch (error) {
      console.error(`❌ ${token.name} - Failed:`, error.message);
    }
  }

  console.log("\n🎉 Token approval complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Approval failed:", error);
    process.exit(1);
  });
