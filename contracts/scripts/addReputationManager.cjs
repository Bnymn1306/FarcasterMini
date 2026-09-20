const hre = require("hardhat");

const REGISTRY_ADDRESS = "0x365690E340F3e447FC7778f20419A7f83cA30640";
const BACKEND_WALLET   = "0xBE1B5f18cb7E00aE82F00c69a81d052b2DA6C3d6";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Caller:", deployer.address);

  const registry = await hre.ethers.getContractAt("AgentRegistry", REGISTRY_ADDRESS);

  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice * 2n;

  console.log("Adding reputation manager:", BACKEND_WALLET);
  const tx = await registry.addReputationManager(BACKEND_WALLET, { gasPrice });
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("✅ Done");
}

main().catch((err) => { console.error(err); process.exit(1); });
