const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying TokenFactory to Base...");

  const TokenFactory = await hre.ethers.getContractFactory("contracts/TokenFactory.sol:TokenFactory");
  const factory = await TokenFactory.deploy();

  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log(`✅ TokenFactory deployed to: ${factoryAddress}`);
  console.log(`📝 Save this address to your .env as FACTORY_CONTRACT_ADDRESS`);
  
  // Verify on Basescan
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("⏳ Waiting for block confirmations...");
    await factory.deploymentTransaction().wait(6);
    
    console.log("🔍 Verifying contract on Basescan...");
    await hre.run("verify:verify", {
      address: factoryAddress,
      constructorArguments: [],
    });
  }

  return factoryAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
