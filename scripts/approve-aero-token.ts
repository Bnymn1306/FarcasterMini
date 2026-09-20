import { ethers } from "ethers";

const EXECUTOR_VAULT_ADDRESS = "0xC9c0f3596843Babc2F45837c88864B7c98191121";
const AERO_TOKEN = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";

const EXECUTOR_VAULT_ABI = [
  "function setToken(address token, bool approved) external",
  "function approvedTokens(address) external view returns (bool)",
  "function owner() external view returns (address)"
];

async function main() {
  const rpcUrl = process.env.BASE_RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    throw new Error("Missing BASE_RPC_URL or DEPLOYER_PRIVATE_KEY");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  console.log(`\n🔧 Approving AERO token in ExecutorVault`);
  console.log(`📝 Vault: ${EXECUTOR_VAULT_ADDRESS}`);
  console.log(`🪙 Token: ${AERO_TOKEN}`);

  const vault = new ethers.Contract(EXECUTOR_VAULT_ADDRESS, EXECUTOR_VAULT_ABI, signer);

  // Check if already approved
  const isApproved = await vault.approvedTokens(AERO_TOKEN);
  
  if (isApproved) {
    console.log(`✅ AERO token already approved!`);
    process.exit(0);
  }

  // Get current gas price and add buffer
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice! * BigInt(150) / BigInt(100); // 50% higher

  console.log(`⛽ Gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);

  // Approve token with higher gas
  const tx = await vault.setToken(AERO_TOKEN, true, {
    gasPrice,
    gasLimit: 100000
  });

  console.log(`⏳ Transaction sent: ${tx.hash}`);
  const receipt = await tx.wait();

  if (receipt && receipt.status === 1) {
    console.log(`✅ AERO token approved! Block: ${receipt.blockNumber}`);
  } else {
    console.error(`❌ Transaction failed!`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
