# Smart Contract Deployment Guide

## Prerequisites

1. **Get Test ETH** from Base Sepolia faucet:
   - Visit: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
   - Connect your wallet and claim test ETH

2. **Set Environment Variables**:
   ```bash
   # Required for deployment
   DEPLOYER_PRIVATE_KEY=your_private_key_here
   
   # Optional (uses public RPC if not set)
   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
   ```

## Deploy TokenFactory Contract

```bash
# Compile contracts
npm run compile

# Deploy to Base Sepolia
npx hardhat run scripts/deploy.ts --network baseSepolia
```

The script will output the deployed contract address. Add it to your `.env`:

```bash
FACTORY_CONTRACT_ADDRESS=0x...
```

## Verify Contract on BaseScan

After deployment, verify your contract:

```bash
npx hardhat verify --network baseSepolia <FACTORY_ADDRESS>
```

## Testing Locally

For local testing with Hardhat Network:

```bash
# Start local Hardhat node
npx hardhat node

# Deploy to local network (in another terminal)
npx hardhat run scripts/deploy.ts --network localhost
```

## Contract Addresses (Base Sepolia)

Once deployed, update these in your application:

- **TokenFactory**: `[To be deployed]`

## Security Notes

- **Never commit** your `DEPLOYER_PRIVATE_KEY` to version control
- Use a separate wallet for testnet deployments
- The private key is only needed for initial contract deployment
- After deployment, users interact with contracts using their own wallets
