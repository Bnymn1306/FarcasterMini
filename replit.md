# BasedMem - Meme Coin Launch Platform

## Overview

BasedMem is a meme coin launch platform built on the Base blockchain, enabling users to create, launch, and trade meme tokens in under 60 seconds. Its core purpose is to democratize meme coin creation and trading. Key capabilities include token browsing, portfolio tracking, price alerts with Farcaster integration, and a gamified daily check-in system to foster user engagement. The project aims to blend the trustworthiness of crypto with the vibrant culture of memes, offering a "playful professionalism" to a broad user base.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

*   **Framework**: React with TypeScript, using Vite.
*   **UI Component Library**: shadcn/ui built on Radix UI, emphasizing accessibility and customization with a "playful professionalism" aesthetic.
*   **Styling**: Tailwind CSS with a custom design system featuring a dark mode primary theme, a cyan and hot pink color palette, and a responsive, mobile-first approach.
*   **Routing**: Wouter for client-side navigation.
*   **State Management**: TanStack Query for server state management and caching.

### Backend Architecture

*   **Server Framework**: Express.js on Node.js with TypeScript.
*   **API Design**: RESTful API for price alerts, token management, user data, trading, and daily check-ins.
*   **Development Pattern**: Monorepo structure with shared schema for type safety.
*   **Session Management**: `connect-pg-simple` for PostgreSQL-backed sessions.

### Data Storage

*   **ORM**: Drizzle ORM for type-safe PostgreSQL operations.
*   **Database Schema**: Includes Users, Tokens, Trades, Holdings, Price Alerts, and Daily Check-ins to manage platform data and gamification.
*   **Database Provider**: Neon Serverless PostgreSQL.

### Authentication & Blockchain Integration

*   **Wallet Connection**: Direct ethers.js integration with Farcaster wallet provider, ensuring all transactions leverage the Farcaster ecosystem. No MetaMask fallback is used for Farcaster Frame compatibility.
*   **Blockchain Target**: Base blockchain (Ethereum L2) for efficiency.
*   **Smart Contracts**:
    *   **TokenFactory.sol**: Factory for deploying new `BondingCurveToken` instances.
    *   **BondingCurveToken.sol**: ERC-20 implementation with a linear bonding curve for automated pricing during buy/sell operations, including a graduation threshold for future Uniswap listing. ABIs are extracted directly from Hardhat artifacts.

### Key Features

1.  **Token Launch**: Streamlined creation and deployment of meme coins directly to the Base blockchain via the `TokenFactory` contract.
2.  **Trading Interface**: Buy/sell functionality interacting directly with `BondingCurveToken` smart contracts for real-time, on-chain pricing and execution.
3.  **Price Alerts**: Configurable notifications with Farcaster integration.
4.  **Portfolio Tracking**: Overview of user holdings and performance.
5.  **Daily Check-in**: Gamified system with streak tracking and rewards.
6.  **Token Discovery**: Browse, filter, and sort tokens.

## External Dependencies

*   **Farcaster Integration**: For social notifications (casts) and mandatory wallet interaction.
*   **Base Blockchain**: The sole target blockchain for all platform operations.
*   **DiceBear API**: Used for generating avatar placeholders (`api.dicebear.com/7.x/shapes`).
*   **Icon Libraries**: Lucide React for general UI icons, and React Icons (SiFarcaster, SiEthereum) for brand-specific icons.