# BasedMem - Meme Coin Launch Platform

## ⚠️ CRITICAL - DO NOT DELETE THESE FILES
The following files are essential for Farcaster Frame functionality:
- `.farcaster/manifest.json` - Farcaster Frame manifest
- `public/.well-known/farcaster.json` - Must be identical copy of above
- `public/icon.png` - App icon (1952KB, copied from icon.jpg)
- `public/splash.png` - Splash screen image (1952KB, copied from splash-icon.jpg)

### Working Configuration (Dec 9, 2025)
- **Browser Mode**: Works perfectly
- **Farcaster Mobile**: Works perfectly with auto-connect
- **Deployment Type**: Reserved VM (0.5 vCPU / 2 GiB RAM) - Required for background limit order executor
- **Domain**: basedmem.xyz

### Important Notes
- Do NOT lazy load Home page or AgentHub page or Fractions page - causes build errors (blank page during Suspense)
- Other pages use lazy loading for bundle optimization
- Solana auto-connect uses polling mechanism (20 attempts x 250ms)
- Frame detection: Mobile webview + iframe = Farcaster Frame

If these files get deleted, restore them with this content:
```json
{
  "accountAssociation": {
    "header": "eyJmaWQiOjM1MTUwMywidHlwZSI6ImF1dGgiLCJrZXkiOiIweDg5ODhDNDU1ZjBjZjREMzE2N2MzMkI5RDY1QjA5MTMwNDU0NTM2YWMifQ",
    "payload": "eyJkb21haW4iOiJiYXNlZG1lbS54eXoifQ",
    "signature": "PMCweYn4IOYWxoLLJx2KME10AZBo2Di9egjMI2TqSXppe3RilKPyRcbXUiCjsHZESjBcTKSJqqELtp/b4AQrwRs="
  },
  "frame": {
    "version": "1",
    "name": "BasedMem",
    "subtitle": "DEX Trading on Base, Solana",
    "tagline": "Smart trading Base and Solana",
    "iconUrl": "https://basedmem.xyz/icon.png",
    "homeUrl": "https://basedmem.xyz",
    "splashImageUrl": "https://basedmem.xyz/splash.png",
    "splashBackgroundColor": "#0a0a0f",
    "webhookUrl": "https://basedmem.xyz/api/farcaster/webhook"
  }
}
```

## Overview
BasedMem is a meme coin launch platform on the Base blockchain for creating, launching, and trading meme tokens. It aims to democratize meme coin creation and trading by offering features like token browsing, portfolio tracking, price alerts with Farcaster integration, and a gamified daily check-in system. The project focuses on combining cryptocurrency reliability with meme culture to provide "playful professionalism."

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript (Vite).
- **UI/UX**: shadcn/ui (Radix UI) for components, Tailwind CSS for styling with a custom dark mode, cyan, and hot pink color palette, responsive and mobile-first design.
- **Routing**: Wouter.
- **State Management**: TanStack Query.

### Backend
- **Server**: Express.js on Node.js with TypeScript.
- **API**: RESTful API.
- **Structure**: Monorepo with shared schema for type safety.
- **Session Management**: `connect-pg-simple` for PostgreSQL sessions.

### Data Storage
- **ORM**: Drizzle ORM.
- **Database**: Neon Serverless PostgreSQL.
- **Schema**: Includes Users, Tokens, Trades, Holdings, Price Alerts, and Daily Check-ins.

### Authentication & Blockchain Integration
- **Wallet Integration**: Farcaster wallet (Mini App) and MetaMask/browser wallets via ethers.js with automatic provider detection.
- **Farcaster SDK**: Smart initialization adapts to runtime environment.
- **Blockchains**: Base (Coinbase L2), Solana, Soneium (Sony L2).
- **Smart Contracts**:
    - `TokenFactory.sol`: Deploys `BondingCurveToken` instances.
    - `BondingCurveToken.sol`: ERC-20 with a linear bonding curve and graduation threshold for Uniswap listing.
    - `PredictionMarket.sol`: On-chain betting with parimutuel payout and ReentrancyGuard.
    - `ExecutorVault.sol` (V3 recommended): Universal auto-withdrawal for ANY Base token.

### Key Features
- **Token Launch**: Create and deploy meme coins.
- **x402 Micropayments**: Zero-fee USDC payments for premium features.
- **Cast Tokenization (Quick Tokenize)**: One-click tokenization of Farcaster casts.
- **Prediction Markets (Cast Futures)**: Bet on Farcaster cast virality.
- **Trading Interface**: Buy/sell interacting with `BondingCurveToken` contracts.
- **DEX Integration**: Tab-based swap with 0x Protocol (Base) and Rubic API (Soneium) integration for instant swaps and native limit order system.
- **Price Alerts**: (DISABLED - Farcaster notification integration pending)
- **Portfolio Tracking**: User holdings and performance.
- **Badge System**: NFT achievement awards.
- **Daily Check-in**: Gamified streak tracking.
- **Token Discovery**: Browse, filter, and sort tokens.
- **Real-Time Token Prices**: Live 24h market data from DEXScreener API with caching.
- **Fully Automatic Limit Order Execution (V3 Vault)**: 100% automated limit orders with zero user interaction after deposit. Supports universal auto-withdrawal for any Base token.
- **Solana Jupiter Limit Orders**: Trustless on-chain limit orders via Jupiter Limit Order v2 API. Orders are stored on-chain and executed automatically by Jupiter keepers when price targets are hit.
- **Soneium Limit Orders**: Fully deployed. ExecutorVaultV3 at `0xfBCe5D06a4fB74325e2154d2dc6b998AC5e91A5c`.
- **INK Limit Orders**: Fully deployed. ExecutorVaultV3 at `0xfBCe5D06a4fB74325e2154d2dc6b998AC5e91A5c`. Uses LI.FI aggregator (`0x864b314D4C5a0399368609581d3E8933a63b9232`) as swap target (no Uniswap V3 on INK). Executor uses LI.FI for both price monitoring and calldata generation. WETH and USDC approved as deposit tokens.
- **Memetic Fractions**: DN404/ERC-404 inspired hybrid NFT+token system. Each meme collection has 1M fractional shares. Holding fractions unlocks dynamic tiers (Bronze 1–999, Silver 1K–9.9K, Gold 10K–99.9K, Legendary 100K–999.9K, Whale 1M = full NFT). Gamble Mint mechanic: spend 100 fractions + 0.0001 ETH on-chain fee to re-roll rarity score (1–100) with weighted odds. **Open creation**: any user can launch their own fraction collection by paying a 0.0005 ETH on-chain fee (spam protection). 5 seed collections: BasedPepe, WojakGains, ChillGuy, PepeRocket, DogeMem. Tables: `fraction_collections` (+ `creator_wallet_address`, `creation_tx_hash`), `fraction_holdings`, `fraction_listings`. Reference contract: `contracts/FractionalMeme.sol`. All Buy, Gamble, and Create actions require real Base mainnet transactions with wallet approval; backend verifies txHash (sender, recipient=treasury `0x8988C45...`, value) before recording. Treasury: `0x8988C455f0cf4D3167c32B9D65B09130454536ac`. **P2P Secondary Market**: holders can list fractions for sale (amount + price per fraction); fractions are escrowed in DB immediately; buyers send ETH directly to seller's wallet address; backend verifies tx on Base mainnet before transferring fractions; sellers can cancel to reclaim escrowed fractions. Routes: `POST /api/fractions/listings`, `GET /api/fractions/listings/:collectionId`, `GET /api/fractions/my-listings/:wallet`, `DELETE /api/fractions/listings/:id`, `POST /api/fractions/listings/:id/buy`.
- **Token Risk Scoring**: Automated risk assessment for all Base tokens with whitelist/blacklist system, liquidity checks, and caching.
- **Agent Hub (Based Lab)**: Agentic identity & marketplace. Users create **real ERC-8004 on-chain agents** via the **official ERC-8004 IdentityRegistry** at `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` on Base mainnet (ERC-721 based, indexed by 8004scan.io). Each wallet can register **unlimited agents**. Minting calls `register(string agentURI)` — agentURI is an ERC-8004 compliant JSON encoded as a `data:application/json;base64,` URI. Returns a sequential uint256 tokenId (e.g. "46092"). Agents appear on 8004scan.io at `https://8004scan.io/agents/base/{tokenId}`. Agents with numeric IDs display a clickable green "On-Chain" badge linking to 8004scan.io. Old custom AgentRegistryV2 (`0xa11b69790E59b49a0aE4033E1e345EDb3B6f0738`) is DEPRECATED — no longer used for new mints; `isOnChainAgentId()` accepts BOTH numeric strings (official) AND legacy 0x+64-hex bytes32. Tables: `meme_agents` (+ `registration_tx_hash`, `metadata_uri`), `agent_service_requests`. `client/src/lib/agentRegistry.ts` contains official ABI + helpers (`buildAgentURI`, `parseRegisteredEvent`, `isOnChainAgentId`, `get8004scanUrl`). Backend `/api/agents/onchain-check/:address` queries official registry using 9,000-block paginated event scans.
- **SIWA (Sign In With Anything)**: Off-chain signature-based identity verification. Wallet signs a SIWA message; result stored in localStorage `basedmem_siwa_{address}` = "verified". Restored on wallet reconnect (all wallet types). Verified badge shown in Agent Hub Identity tab and My Agent profile.
- **Basename Resolution**: Backend `/api/basename/:address` endpoint resolves Base Name Service names via the L2 Reverse Registrar contract. Agent Hub Identity tab shows Basename or "Get Basename" CTA linking to `https://www.base.org/names`.
- **Base Smart Wallet**: Passkey-based wallet connection via `@coinbase/wallet-sdk`. Modal at "Connect ETH" button shows Smart Wallet vs Browser Wallet options. `walletType` state tracks connection type.

### Automatic Execution Architecture
- **V3 Vault Architecture**: Universal auto-withdrawal for ANY Base token.
- **Limit Order Flow**:
    - **User Actions**: Atomic order creation with pre-checks, WETH/token approval and deposit to ExecutorVault V3. Automatic rollback on signature/API failure.
    - **Backend Automation**: Token risk validation, automatic token whitelisting, price monitoring, and automatic execution via 0x API v2, including V3 auto-withdrawal.
    - **Order Management**: Server-side validated cancellation with automatic vault withdrawal and dedicated withdrawal buttons for failed or V1 filled orders.

### Security Features
- **ExecutorVault Contracts**: Utilizes SafeERC20, ReentrancyGuard, token whitelisting, fee-on-transfer detection, and per-user balance tracking.
- **Backend Validation**: Input sanitization, provider guards, connection state revalidation.
- **Rollback Protection**: Automatic WETH withdrawal on signature rejection or API failure.
- **Cancel Validation**: Server-side status checks to prevent invalid operations.

### Token Risk Scoring System
- **Overview**: Automated system for evaluating Base tokens and displaying risk warnings.
- **Risk Levels**: Approved (0-29), Guarded (30-79), High Risk (80-100).
- **Whitelisted Tokens**: Specific tokens (WETH, USDC, AERO, DEGEN, BRETT, VIRTUAL) bypass validation.
- **Validation Checks**: ERC20 validation, decimals check, liquidity check, blacklist check.
- **Performance Optimizations**: Early return for whitelisted tokens, hardcoded metadata, 24-hour caching.
- **User Experience**: Color-coded risk badges, clear warnings, user responsibility for high-risk trades.

### Price Alert Notification System (DISABLED)
- Feature temporarily disabled pending Farcaster Frame Notification API integration fixes
- Code exists but is not active in production

## External Dependencies
- **Farcaster**: Social notifications and wallet interaction.
- **Neynar API**: Fetches Farcaster cast metadata.
- **Base Blockchain**: Primary blockchain (Coinbase L2).
- **Soneium Blockchain**: Sony's Ethereum L2 (Chain ID 1868, OP Stack). DEX via KYO Finance (Uniswap V3).
- **KYO Finance**: Direct Uniswap V3 integration on Soneium. SwapRouter: `0x0dC73Fe1341365929Ed8a89Dd47097A9FDD254D0`, Quoter V2: `0x60eb4B04932797374a291380349008dc8cc40426`. Zero protocol fees!
- **Coinbase x402**: Micropayment facilitator.
- **0x Protocol API**: DEX aggregator for token swaps and quotes.
- **CoinGecko API**: Real-time price data for limit order monitoring.
- **Zerion API**: DeFi protocol positions tracking.
- **DiceBear API**: Generates avatar placeholders.
- **DEXScreener API**: Real-time token price data and liquidity checks.
- **Jupiter Limit Order v2 API**: On-chain Solana limit orders with automatic keeper execution.
- **Icon Libraries**: Lucide React and React Icons.