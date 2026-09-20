const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying AgentRegistry with:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");

  const AgentRegistry = await hre.ethers.getContractFactory("AgentRegistry");
  console.log("Deploying...");

  const registry = await AgentRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("✅ AgentRegistry deployed to:", address);
  console.log("Network:", hre.network.name, "| ChainId:", hre.network.config.chainId);
  console.log("Tx hash:", registry.deploymentTransaction()?.hash);

  // Add backend executor as reputation manager
  const backendWallet = "0xBE1B5f18cb7E00aE82F00c69a81d052b2DA6C3d6";
  const tx = await registry.addReputationManager(backendWallet);
  await tx.wait();
  console.log("✅ Backend wallet added as reputation manager:", backendWallet);

  console.log("\n--- SAVE THIS ---");
  console.log(`AGENT_REGISTRY_ADDRESS=${address}`);
  console.log(`AGENT_REGISTRY_CHAIN=8453`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
