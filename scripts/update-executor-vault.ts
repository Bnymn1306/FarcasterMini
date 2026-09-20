import { ethers } from "ethers";

const EXECUTOR_VAULT_ADDRESS = "0xC9c0f3596843Babc2F45837c88864B7c98191121";
const ZERO_X_ALLOWANCE_HOLDER = "0x0000000000001ff3684f28c67538d4d072c22734"; // 0x API v2
const AERO_TOKEN = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";

const EXECUTOR_VAULT_ABI = [
  "function setSwapTarget(address target, bool approved) external",
  "function setToken(address token, bool approved) external",
  "function approvedSwapTargets(address) external view returns (bool)",
  "function approvedTokens(address) external view returns (bool)",
  "function owner() external view returns (address)"
];

async function main() {
  // Setup provider and signer
  const rpcUrl = process.env.BASE_RPC_URL;
  if (!rpcUrl) {
    throw new Error("BASE_RPC_URL not set");
  }

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY not set");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  console.log(`\n🔧 Updating ExecutorVault at ${EXECUTOR_VAULT_ADDRESS}`);
  console.log(`📝 Signer address: ${signer.address}`);

  // Connect to ExecutorVault
  const vault = new ethers.Contract(EXECUTOR_VAULT_ADDRESS, EXECUTOR_VAULT_ABI, signer);

  // Check current owner
  const owner = await vault.owner();
  console.log(`👤 Contract owner: ${owner}`);
  
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`❌ Signer ${signer.address} is not the owner ${owner}!`);
  }

  // 1. Add 0x AllowanceHolder to whitelist
  console.log(`\n✅ Step 1: Adding 0x AllowanceHolder to whitelist...`);
  const isAllowanceHolderApproved = await vault.approvedSwapTargets(ZERO_X_ALLOWANCE_HOLDER);
  
  if (isAllowanceHolderApproved) {
    console.log(`✅ 0x AllowanceHolder already approved!`);
  } else {
    const tx1 = await vault.setSwapTarget(ZERO_X_ALLOWANCE_HOLDER, true);
    console.log(`⏳ Transaction sent: ${tx1.hash}`);
    await tx1.wait();
    console.log(`✅ 0x AllowanceHolder approved!`);
  }

  // 2. Add AERO token to whitelist
  console.log(`\n✅ Step 2: Adding AERO token to whitelist...`);
  const isAeroApproved = await vault.approvedTokens(AERO_TOKEN);
  
  if (isAeroApproved) {
    console.log(`✅ AERO token already approved!`);
  } else {
    const tx2 = await vault.setToken(AERO_TOKEN, true);
    console.log(`⏳ Transaction sent: ${tx2.hash}`);
    await tx2.wait();
    console.log(`✅ AERO token approved!`);
  }

  console.log(`\n🎉 ExecutorVault updated successfully!`);
  console.log(`\n📋 Approved addresses:`);
  console.log(`   - Swap Target: ${ZERO_X_ALLOWANCE_HOLDER}`);
  console.log(`   - Token: ${AERO_TOKEN}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
