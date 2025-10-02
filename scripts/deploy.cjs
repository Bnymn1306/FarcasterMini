const hre = require("hardhat");

async function main() {
  console.log("Deploying TokenFactory to Base Sepolia...");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");
  
  if (balance === 0n) {
    throw new Error("Deployer account has no ETH! Get testnet ETH from https://www.coinbase.com/faucets/base-ethereum-goerli-faucet");
  }

  const TokenFactory = await hre.ethers.getContractFactory("TokenFactory");
  console.log("Deploying TokenFactory contract...");
  
  const factory = await TokenFactory.deploy();
  await factory.waitForDeployment();
  
  const address = await factory.getAddress();
  console.log("TokenFactory deployed to:", address);
  console.log("\n🎉 Deployment successful!");
  console.log("\nAdd this to your .env file:");
  console.log(`FACTORY_CONTRACT_ADDRESS=${address}`);
  console.log("\nVerify contract on BaseScan:");
  console.log(`npx hardhat verify --network baseSepolia ${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
