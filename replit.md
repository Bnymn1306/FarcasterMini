# BasedMem - Meme Coin Launch Platform

## Overview

BasedMem is a meme coin launch platform built on the Base blockchain. It enables users to create, launch, and trade meme tokens in under 60 seconds. The platform features token browsing, portfolio tracking, price alerts with Farcaster integration, and a gamified daily check-in system to encourage user engagement.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript, using Vite as the build tool and development server.

**UI Component Library**: shadcn/ui components built on Radix UI primitives, providing accessible and customizable components. The design system follows a "playful professionalism" approach that balances crypto trustworthiness with meme culture vibrancy.

**Styling**: Tailwind CSS with a custom design system featuring:
- Dark mode as primary theme with light mode support
- Custom color palette: Cyan primary (crypto trustworthiness), Hot Pink accent (meme culture)
- Responsive mobile-first design with touch-optimized controls
- Elevation and hover states for interactive elements

**Routing**: Wouter for client-side routing with pages for:
- Home (hero/landing)
- Browse tokens
- Create token
- Token details
- Portfolio
- Alerts
- Daily check-in

**State Management**: TanStack Query (React Query) for server state management and caching.

### Backend Architecture

**Server Framework**: Express.js running on Node.js with TypeScript.

**API Design**: RESTful API with endpoints for:
- Price alerts (GET, POST, DELETE)
- Token management
- User data and wallet integration
- Trading operations
- Daily check-ins

**Development Pattern**: The application uses a monorepo structure with shared schema definitions between client and server, ensuring type safety across the full stack.

**Session Management**: Uses connect-pg-simple for PostgreSQL-backed session storage.

### Data Storage

**ORM**: Drizzle ORM for type-safe database operations with PostgreSQL.

**Database Schema** includes:
- **Users**: Wallet addresses, Farcaster integration (username, FID), streak tracking for gamification
- **Tokens**: Meme coin metadata (name, symbol, description, logo), contract addresses, market data (price, volume, market cap, holder count), social links (Twitter, Telegram, website)
- **Trades**: Transaction history linking users and tokens
- **Holdings**: User portfolio positions
- **Price Alerts**: User-configured price notifications with Farcaster casting capability
- **Daily Check-ins**: Gamification system tracking user engagement streaks

**Database Provider**: Neon Serverless PostgreSQL (@neondatabase/serverless).

### Authentication & Blockchain Integration

**Wallet Connection**: Mock implementation prepared for Web3 wallet integration (MetaMask, WalletConnect, etc.). The current implementation simulates wallet connectivity for development.

**Blockchain Target**: Base blockchain (Ethereum L2) for low gas fees and fast transactions. Gas fee displays throughout the UI reference Base network.

### External Dependencies

**Farcaster Integration**: Price alerts can be configured to notify users via Farcaster casts. Users connect their Farcaster accounts (username and FID) to receive blockchain-native social notifications.

**Base Blockchain**: The platform is designed specifically for the Base network, with UI elements displaying Base-specific gas fees and network information.

**Image Service**: Uses DiceBear API for generating avatar placeholders (api.dicebear.com/7.x/shapes).

**Icon Libraries**: 
- Lucide React for general UI icons
- React Icons (SiFarcaster, SiEthereum) for brand-specific icons

### Design System

The application follows comprehensive design guidelines defined in `design_guidelines.md`:

**Color Philosophy**: Dark mode primary with carefully calibrated HSL values for backgrounds, surfaces, and semantic colors. Primary cyan conveys crypto trustworthiness while accent hot pink adds meme culture energy.

**Typography**: System font stack with specific weights for different content types (display, headers, financial data in monospace for clarity).

**Component Patterns**: Consistent use of cards for content containers, badges for status indicators, elevation states for interactive feedback.

**Mobile Optimization**: Touch-optimized trading controls, responsive grid layouts, mobile-first design approach.

### Key Features

1. **Token Launch**: Simplified flow to create meme coins with metadata, social links, and instant deployment to Base blockchain
2. **Trading Interface**: Buy/sell functionality with slider controls for amount selection and real-time gas fee display
3. **Price Alerts**: Configurable price notifications (above/below thresholds) with Farcaster integration
4. **Portfolio Tracking**: Holdings overview with PnL calculation and performance metrics
5. **Daily Check-in**: Gamification system with streak tracking and BMEM token rewards for consistent engagement
6. **Token Discovery**: Browse, filter, and sort tokens by volume, market cap, price, and holder count

## Recent Changes

### Phase 1: Real ETH Transfer Implementation (October 1, 2025)
- **WalletContext Upgrade**: Replaced mock wallet with real blockchain integration using ethers.js
  - Supports both Farcaster wallet provider and MetaMask fallback
  - Auto-switches/adds Base network (Chain ID: 8453)
  - Real-time balance fetching from blockchain
  - `sendETH()` function for real ETH transfers
  - `getProvider()` exposes ethers.js BrowserProvider

- **Buy Flow**: Users now send real ETH to platform wallet (0x8988C0418F2D4B0CB8823E330e2e9A7D3bC83C17)
  - Transaction confirmation via blockchain
  - Database token allocation after ETH received
  - Real gas fees applied (no mock fees)

- **Sell Flow**: Backend `/api/sell` endpoint handles real ETH payouts
  - Validates holdings before processing
  - Updates/deletes holdings in database
  - Records trade history
  - **TODO**: Uncomment ETH transfer code when PLATFORM_PRIVATE_KEY env var is added

- **TypeScript Configuration**: Added `vite-env.d.ts` with window.ethereum type definitions for Web3 compatibility

### Phase 2: Wagmi Integration for Real Transactions (October 2, 2025)
- **Wagmi + Viem Migration**: Replaced ethers.js with Wagmi for proper Farcaster Frame compatibility
  - Installed `wagmi` and `viem` packages (v2.x)
  - Created custom `frameConnector` following Farcaster's official demo pattern
  - Configured Wagmi with Base blockchain (Chain ID: 8453) support
  - Wrapped app in WagmiProvider alongside QueryClientProvider

- **Real Transaction Flow**: Implemented proper blockchain transaction lifecycle
  - `useSendTransaction` hook triggers wallet popup for user approval
  - `useWaitForTransactionReceipt` monitors blockchain confirmation status
  - Database updates ONLY occur after on-chain confirmation (via useEffect)
  - Proper error handling for rejected transactions

- **Buy Flow Improvements**:
  - `handleBuy()` triggers transaction and exits immediately
  - Pending purchase details stored in state (amount, tokenAmount, hash)
  - useEffect watches `isConfirmed` flag
  - Database operations (create user, record trade, update holdings) execute ONLY after blockchain confirms
  - UI shows "Processing..." during transaction and confirmation phases
  - Success toast displays after database successfully updated

- **Transaction Lifecycle States**:
  - User clicks Buy → Wallet popup appears
  - User approves → Transaction broadcasts to blockchain (`isSendingTx`)
  - Blockchain confirms → useWaitForTransactionReceipt detects (`isConfirmed`)
  - Database updates → Success toast shown
  - All failures properly handled with descriptive error messages

### Phase 3: Smart Contract Integration - ERC-20 + Bonding Curve (October 2, 2025)

- **Smart Contract Architecture**: Implemented production-ready Solidity contracts for real DEX functionality
  - **TokenFactory.sol**: Factory pattern for deploying new BondingCurveToken instances
    - `createToken(name, symbol)` deploys new ERC-20 token and returns contract address
    - Emits `TokenCreated(address, name, symbol, creator, timestamp)` event
    - Tracks all deployed tokens via `allTokens` array
  - **BondingCurveToken.sol**: Full ERC-20 implementation with linear bonding curve pricing
    - Linear pricing: `K_MULTIPLIER = 1e15` (price increases with circulating supply)
    - `buy()` payable function - sends ETH, receives tokens based on bonding curve
    - `sell(tokenAmount)` function - burns tokens, returns ETH based on bonding curve
    - `getBuyPrice(tokenAmount)` and `getSellPrice(tokenAmount)` view functions for price quotes
    - Graduation threshold at 10 ETH reserve balance (ready for Uniswap listing)
    - Events: `TokensPurchased`, `TokensSold`, `Graduated`

- **Frontend Integration**: ABIs extracted directly from Hardhat compilation artifacts
  - `client/src/lib/contracts.ts` contains FULL ABIs (521 lines for BondingCurveToken)
  - Complete ERC-20 standard interface: transfer, approve, allowance, balanceOf, totalSupply, etc.
  - All bonding curve custom functions included
  - ABIs match deployed contracts exactly to prevent signature drift

- **Create Token Flow**: Real blockchain deployment via Wagmi hooks
  - User fills form → `useWriteContract` calls `TokenFactory.createToken()`
  - Transaction confirmed → Event logs parsed to extract deployed contract address
  - Contract address saved to database via `useEffect` ONLY after blockchain confirmation
  - Error handling: Toast notification if event parsing fails, prevents null addresses in DB

- **Buy/Sell Flow**: Real bonding curve pricing via smart contract calls
  - **Buy**: `useReadContract` fetches price via `getBuyPrice()` → User approves → `buy()` payable call
  - **Sell**: `useReadContract` fetches price via `getSellPrice()` → User approves → `sell()` call
  - Transaction lifecycle: Wallet popup → Blockchain confirmation → Database update → Success toast
  - All state updates via `useWaitForTransactionReceipt` polling

- **Deployment Instructions**: Documented in DEPLOYMENT.md
  - Requires `BASE_SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY` environment variables
  - Script: `npm run deploy` (deploys TokenFactory to Base Sepolia)
  - Sets `VITE_FACTORY_CONTRACT_ADDRESS` for frontend to interact with factory

### Known Limitations / Future Enhancements
- **Graduation Flow**: Contract has graduation logic, but Uniswap pool creation not yet implemented
- **Platform Sell Transfers**: Backend `/api/sell` ETH payout requires `PLATFORM_PRIVATE_KEY` (currently commented out)
- **Price Discovery**: Database still stores price/volume/market cap for UI display (contracts are source of truth for trades)
- **Token Metadata**: IPFS/on-chain metadata storage not implemented (database stores name/symbol/description)
- **Future Features**: 
  - Automated Uniswap V2/V3 pool creation at graduation threshold
  - On-chain metadata via tokenURI standard
  - LP token locking mechanisms
  - Cross-chain bridging to mainnet Base