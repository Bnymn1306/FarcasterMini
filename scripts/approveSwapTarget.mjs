import { ethers } from 'ethers';

async function main() {
  console.log("🔧 Approving 0x AllowanceHolder for V3 vault...");
  
  const VAULT_ADDRESS = "0x3905022308C9BdE5581078Ca4A9e413b608F764e";
  const ALLOWANCE_HOLDER = "0x0000000000001fF3684f28c67538d4D072C22734"; // 0x Allowance Holder (Base mainnet)
  
  const VAULT_ABI = [
    "function setSwapTarget(address target, bool approved) external",
    "function approvedSwapTargets(address) external view returns (bool)",
    "function owner() external view returns (address)"
  ];
  
  const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  
  console.log("Owner wallet:", wallet.address);
  console.log("Vault address:", VAULT_ADDRESS);
  console.log("AllowanceHolder:", ALLOWANCE_HOLDER);
  
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);
  
  // Check current owner
  const owner = await vault.owner();
  console.log("\n👤 Vault owner:", owner);
  
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error("❌ ERROR: You are not the owner!");
    console.error("   Vault owner:", owner);
    console.error("   Your address:", wallet.address);
    return;
  }
  
  // Check current approval status
  console.log("\n📋 Checking current approval status...");
  const isApproved = await vault.approvedSwapTargets(ALLOWANCE_HOLDER);
  console.log("Is approved:", isApproved);
  
  if (isApproved) {
    console.log("✅ Already approved!");
    return;
  }
  
  console.log("\n🔄 Approving AllowanceHolder...");
  const tx = await vault.setSwapTarget(ALLOWANCE_HOLDER, true);
  console.log("Transaction hash:", tx.hash);
  
  console.log("⏳ Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("✅ Confirmed in block:", receipt.blockNumber);
  
  // Verify
  const newStatus = await vault.approvedSwapTargets(ALLOWANCE_HOLDER);
  console.log("\n✅ Final status - AllowanceHolder approved:", newStatus);
  console.log("\n🎉 V3 vault is now ready for automatic limit order execution!");
}

main().catch(console.error);
