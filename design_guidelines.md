# BasedMem - Meme Coin Launch Platform Design Guidelines

## Design Approach
**Reference-Based Approach** inspired by modern crypto platforms (Pump.fun, Uniswap, Coinbase) blended with playful meme culture aesthetics. Balances trustworthy financial UI with energetic, fun visual elements that celebrate meme culture.

## Core Design Principles
1. **Playful Professionalism**: Fun visuals without sacrificing trading clarity
2. **Instant Recognition**: Bold token cards that showcase personality
3. **Clear Financial Data**: Price charts and stats remain crisp and readable
4. **Mobile-First Trading**: Touch-optimized controls for quick token actions
5. **Viral Energy**: Design encourages sharing and community participation

## Color Palette

**Dark Mode (Primary)**
- Background Deep: 230 25% 8%
- Background: 230 20% 11%
- Surface: 230 18% 15%
- Surface Elevated: 230 15% 19%
- Border: 230 12% 25%
- Primary (Cyan): 190 85% 55% (crypto trustworthy + energetic)
- Primary Hover: 190 85% 50%
- Accent (Hot Pink): 330 85% 60% (meme culture vibrancy)
- Accent Hover: 330 85% 55%
- Success: 142 70% 50%
- Danger: 0 72% 55%
- Warning: 45 90% 60%
- Text Primary: 0 0% 98%
- Text Secondary: 0 0% 70%
- Text Muted: 0 0% 50%

**Light Mode**
- Background: 230 30% 97%
- Surface: 0 0% 100%
- Border: 230 15% 88%
- Primary: 190 85% 45%
- Accent: 330 85% 55%

## Typography
**Font Stack**: System fonts via Tailwind
- Display Headlines: font-black text-3xl to text-5xl (token names, hero)
- Section Headers: font-bold text-xl to text-2xl
- Token Names: font-bold text-lg
- Price/Stats: font-mono font-semibold text-base to text-lg (financial clarity)
- Body Text: font-normal text-sm to text-base
- Captions: font-medium text-xs uppercase tracking-wide (labels)

## Layout System
**Spacing Primitives**: Tailwind units of 2, 3, 4, 6, 8, 12, 16, 20, 24

**Container Widths**:
- Landing hero: Full width with max-w-7xl inner content
- Main app: max-w-7xl mx-auto
- Token grid: 3-column on desktop (lg:grid-cols-3), 2-col tablet (md:grid-cols-2), 1-col mobile
- Trading interface: max-w-md for focused trading cards

## Component Library

### Landing Page Structure
**Hero Section** (h-screen with gradient overlay):
- Full-width background image showing vibrant crypto/meme culture collage
- Gradient overlay: from-background/90 via-background/70 to-background/50
- Centered content with max-w-4xl
- Display headline: "Launch Your Meme Coin in 60 Seconds"
- Subheading: "Join the Base blockchain meme revolution"
- Dual CTA: Primary "Launch Token" (bg-primary) + Secondary "Browse Tokens" (variant outline with backdrop-blur-md bg-surface/30)
- Floating stat cards: "X tokens launched today" with blurred backgrounds

**Features Section** (py-20 bg-surface):
- 3-column grid with icon cards
- Each card: gradient border (border-t-4), icon (h-12 w-12), title, description
- Icons: Rocket (launch), Chart (trade), Users (community)

**Active Tokens Preview** (py-20):
- "Trending Tokens" header with "View All" link
- 3-card grid preview of top tokens
- Each token card: mini version of main token card

**CTA Section** (py-24 bg-gradient-to-br from-primary/20 to-accent/20):
- Centered, bold typography
- "Ready to Launch?" headline
- Primary CTA button (large, px-8 py-4)

### Navigation Bar
- Sticky top with backdrop-blur-xl bg-surface/80
- Height: h-16
- Logo (left): Bold wordmark with gradient text from-primary to-accent
- Nav links (center): Browse, Create, Portfolio
- Connect Wallet button (right): Primary color, rounded-full px-6 py-2.5

### Token Browse Grid
- Grid: gap-6 with responsive columns
- Filter bar above grid: Tabs (All, Hot, New, Top), Sort dropdown
- Pagination or infinite scroll with load trigger

### Token Card
- Background: bg-surface rounded-xl border border-border
- Structure (p-6 space-y-4):
  - Header: Token logo (h-16 w-16 rounded-full ring-4 ring-primary/20) + Name (font-bold text-lg) + Symbol (uppercase text-sm text-muted)
  - Price display: Large font-mono text-2xl + 24h change badge (success/danger pill)
  - Mini chart: Sparkline showing price trend (h-12)
  - Stats row: Market cap, Volume, Holders (grid-cols-3 text-xs)
  - Action buttons: Trade (primary), View Details (outline)
- Hover: scale-[1.02] shadow-lg shadow-primary/10

### Token Creation Form
- Modal overlay or dedicated page with max-w-2xl
- Sections with clear labels (uppercase text-xs font-semibold mb-2):
  - Token Image: Upload with preview (h-32 w-32 rounded-full)
  - Basic Info: Name, Symbol, Description (textarea min-h-32)
  - Supply: Number input with max supply
  - Social Links: Optional Twitter, Telegram inputs
- Preview panel: Live preview of how token card will look
- Submit: Large primary button "Launch Token - 0.001 ETH"

### Trading Interface
- Card layout: max-w-md bg-surface rounded-2xl p-6
- Token header: Logo + name + current price (large, prominent)
- Price chart: h-64 with time range tabs (1H, 24H, 7D, 30D)
- Trade form:
  - Input group: Amount input + token symbol
  - Balance display: "Balance: X.XX ETH" (text-sm text-muted)
  - Slider: For quick amount selection
  - Price impact warning: If high (text-warning)
  - Action button: "Buy" (success) or "Sell" (danger) with full width
- Recent trades list: Mini cards with timestamp, amount, price

### Token Detail Page
- Two-column layout (lg:grid-cols-3):
  - Left (col-span-2): Price chart + description + activity feed
  - Right (col-span-1): Trading interface card (sticky)
- Token header: Large logo, name, socials, creator info
- Stats grid: 4-column stats (price, mcap, volume, holders)
- Description: Rich text with text-base leading-relaxed

### Portfolio View
- Summary cards: Total value, P&L, token count (grid-cols-3 with gradient backgrounds)
- Holdings table: Token | Amount | Value | P&L | Actions
- Each row: Token logo + name, amounts in font-mono, color-coded P&L
- Actions: Quick trade buttons

## Visual Enhancements

**Gradients**: Use liberally for excitement
- Hero backgrounds: from-primary/20 via-accent/10 to-primary/20
- Button hover: Subtle gradient shift
- Card borders: Gradient borders for featured/trending tokens

**Icons**: Use Heroicons or Lucide
- Financial: chart-bar, trending-up, wallet
- Actions: rocket (launch), fire (trending), sparkles (new)
- Size: h-5 w-5 to h-6 w-6 in buttons, h-12 w-12 for feature cards

**Animations**: Moderate use for delight
- Token card hover: transform transition-transform duration-200
- Price updates: Pulse animation on change
- Chart lines: Smooth line drawing (animate via JS library)

**Badges & Pills**:
- 24h change: Rounded-full px-2.5 py-1 text-xs font-semibold
- "New" label: bg-accent/20 text-accent
- "Hot" label: bg-warning/20 text-warning with fire icon

## Images

**Hero Section**:
- Full-width hero image showing vibrant collage: meme culture + crypto symbols + rocket ships + charts
- High energy, colorful composition
- Applied gradient overlay for text readability

**Token Logos**:
- User-uploaded circular logos throughout
- Fallback: Gradient circle with token symbol letter
- Sizes: Small (h-10 w-10), Medium (h-16 w-16), Large (h-24 w-24)

**Empty States**:
- Illustration for "No tokens in portfolio"
- Illustration for "No results found"
- Style: Simple, playful line art matching brand colors

## Interaction Patterns

**Token Actions**: Instant optimistic updates with loading states
**Price Updates**: Real-time via WebSocket with smooth number transitions
**Form Validation**: Inline errors in danger color below inputs
**Success States**: Toast notifications slide from top-right with success color
**Loading States**: Skeleton screens with shimmer effect for cards

## Data Visualization

**Price Charts**: Use Chart.js or Recharts
- Line color: Primary for gains, danger for losses
- Grid: Subtle border color
- Tooltips: bg-surface with border, shows price + time

**Sparklines**: Mini trend indicators
- Height: h-12 w-full
- Single color: Primary or success/danger based on trend

## Accessibility
- WCAG AA contrast ratios maintained
- All trading actions keyboard accessible
- Price updates announced to screen readers
- Focus indicators: ring-2 ring-primary
- Form labels always present (use sr-only if needed for clean design)