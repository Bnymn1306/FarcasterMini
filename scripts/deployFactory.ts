import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";
import TokenFactoryArtifact from "../artifacts/contracts/TokenFactory.sol/TokenFactory.json" assert { type: "json" };

async function main() {
  const rpcUrl = process.env.BASE_RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  
  if (!rpcUrl || !privateKey) {
    throw new Error("Missing BASE_RPC_URL or DEPLOYER_PRIVATE_KEY");
  }
  
  console.log("Deploying TokenFactory with initialPrice support to Base...");
  
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  
  console.log("Deployer address:", wallet.address);
  
  const TokenFactory = new ContractFactory(
    TokenFactoryArtifact.abi,
    TokenFactoryArtifact.bytecode,
    wallet
  );
  
  const factory = await TokenFactory.deploy();
  await factory.waitForDeployment();
  
  const address = await factory.getAddress();
  
  console.log("✅ TokenFactory deployed to:", address);
  console.log("\nUpdate FACTORY_CONTRACT_ADDRESS in client/src/lib/contracts.ts");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
