const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  const rpcUrl = process.env.BASE_RPC_URL || "https://mainnet.base.org";
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error("DEPLOYER_PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log("Deployer:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  // Load artifact
  const artifactPath = path.join(__dirname, "../artifacts/AgentRegistryV2.sol/AgentRegistryV2.json");
  if (!fs.existsSync(artifactPath)) {
    throw new Error("Artifact not found — run: cd contracts && npx hardhat compile");
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  console.log("Deploying AgentRegistryV2...");
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("✅ AgentRegistryV2 deployed at:", address);

  // Add backend wallet as reputation manager
  const backendWallet = "0xBE1B5f18cb7E00aE82F00c69a81d052b2DA6C3d6";
  const tx = await contract.addReputationManager(backendWallet);
  await tx.wait();
  console.log("✅ Reputation manager added:", backendWallet, "tx:", tx.hash);

  console.log("\n=== UPDATE THIS IN agentRegistry.ts ===");
  console.log("AGENT_REGISTRY_ADDRESS =", `"${address}"`);
}

main().catch(e => { console.error(e); process.exit(1); });
