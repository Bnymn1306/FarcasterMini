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