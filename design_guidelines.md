# BasedMem - Meme Coin Launch Platform Design Guidelines

## Design Approach
**Reference-Based Approach** drawing from premium fintech platforms (Stripe, Revolut, Coinbase Pro) fused with contemporary web3 design (Zora, Foundation). Creates an elevated crypto experience that balances sophisticated financial UI with celebratory meme culture energy.

## Core Design Principles
1. **Refined Playfulness**: Elegant design with subtle meme culture celebration
2. **Premium Trading Experience**: Crystal-clear financial data with luxury feel
3. **Trust Through Polish**: Sophisticated aesthetics build platform credibility
4. **Effortless Interaction**: Smooth, intuitive flows for token creation and trading

## Color Palette

**Light Mode (Primary)**
- Background: 0 0% 100%
- Surface: 220 20% 98%
- Surface Elevated: 0 0% 100%
- Border: 220 15% 90%
- Primary (Royal Blue): 220 90% 56%
- Primary Hover: 220 90% 50%
- Accent (Rose Pink): 340 82% 62%
- Accent Hover: 340 82% 56%
- Success: 142 70% 45%
- Danger: 0 70% 58%
- Text Primary: 220 25% 10%
- Text Secondary: 220 15% 40%
- Text Muted: 220 10% 60%

**Dark Mode**
- Background Deep: 220 30% 7%
- Background: 220 25% 10%
- Surface: 220 20% 13%
- Surface Elevated: 220 18% 16%
- Border: 220 15% 22%
- Primary: 220 85% 65%
- Accent: 340 75% 68%
- Text Primary: 0 0% 98%
- Text Secondary: 220 15% 75%
- Text Muted: 220 10% 55%

## Typography
**Font Stack**: Inter via Google Fonts CDN for refined, modern aesthetic

- Hero Headlines: font-bold text-4xl to text-6xl tracking-tight
- Section Headers: font-semibold text-2xl to text-3xl
- Token Names: font-semibold text-xl
- Price Data: font-mono font-medium text-lg to text-2xl
- Body Text: font-normal text-sm to text-base leading-relaxed
- Labels: font-medium text-xs uppercase tracking-wider text-muted

## Layout System
**Spacing Scale**: Tailwind units of 2, 4, 6, 8, 12, 16, 20, 24, 32

**Grid Structure**:
- Desktop token grid: lg:grid-cols-3 gap-6
- Tablet: md:grid-cols-2 gap-4
- Mobile: grid-cols-1 gap-4
- Container: max-w-7xl mx-auto px-6

## Landing Page Architecture

**Hero Section** (min-h-screen with luxury imagery):
- Full-width background: High-quality image of abstract 3D shapes in blue/pink gradients, floating coins, and digital elements creating depth
- Gradient overlay: bg-gradient-to-b from-white/95 via-white/85 to-white/70 (light) or from-background/95 to-background/70 (dark)
- Centered content (max-w-5xl):
  - Headline: "Launch Your Meme Coin With Elegance"
  - Subheading: "Professional-grade token creation on Base blockchain"
  - Primary CTA: "Create Token" (bg-primary shadow-lg shadow-primary/30)
  - Secondary CTA: "Explore Tokens" (border-2 border-border backdrop-blur-sm bg-white/60)
- Floating stat cards: Glassmorphic cards with blur (backdrop-blur-md bg-white/50 border border-border/50) showing live metrics

**Trust Section** (py-24 bg-surface):
- "Why BasedMem?" header
- 3-column feature grid with elegant icon cards:
  - Each card: bg-white rounded-2xl p-8 border border-border hover:shadow-xl transition
  - Icons: h-14 w-14 in gradient circles (bg-gradient-to-br from-primary to-accent)
  - Features: Instant Launch, Secure Trading, Community Driven

**Token Showcase** (py-24):
- "Trending Launches" section
- 3-column grid of premium token cards (featured styling)
- Clean typography, subtle shadows, hover lift effects
- "View All Tokens" link styled as ghost button

**How It Works** (py-24 bg-surface):
- 3-step visual flow with connecting lines
- Step cards: numbered circles + title + description
- Modern, minimal illustrations for each step

**Social Proof** (py-20):
- 2-column layout: testimonials left, stats grid right
- Testimonial cards with avatar, quote, user info
- Stats: Large numbers with labels (Tokens Launched, Total Volume, Active Traders)

**Final CTA** (py-32 bg-gradient-to-br from-primary/10 via-accent/10 to-primary/5):
- Centered content, bold headline
- Large primary button (px-10 py-4 text-lg)

## Navigation
- Sticky header: backdrop-blur-xl bg-white/80 border-b border-border (light) or bg-surface/80 (dark)
- Height: h-20
- Logo: Gradient text "BasedMem" from-primary to-accent font-bold text-2xl
- Nav links: Browse, Create, Docs
- Connect Wallet: Primary button rounded-full

## Token Components

**Token Card** (elevated, premium feel):
- Container: bg-white rounded-3xl p-6 border border-border shadow-sm hover:shadow-xl transition-all
- Header: Token logo (h-20 w-20 rounded-full shadow-md) + name + symbol
- Price: font-mono text-3xl font-semibold + 24h badge
- Mini chart: h-16 sparkline in primary color
- Stats grid: 3-column (Market Cap, Volume, Holders) with dividers
- Actions: Primary "Trade" + outline "Details" buttons
- Hover: translate-y-[-4px] shadow-2xl

**Creation Form** (max-w-3xl centered):
- Clean modal with bg-white rounded-3xl p-10
- Sections with generous spacing (space-y-8):
  - Image upload: Large circular dropzone (h-40 w-40)
  - Text inputs: Tall (h-14), rounded-xl, border-2
  - Description: Textarea rounded-xl min-h-40
  - Supply controls: Number input with elegant steppers
- Live preview panel: Real-time card preview as user types
- Submit: Large gradient button "Launch Token" with cost display

**Trading Interface** (max-w-lg):
- Glassmorphic card: backdrop-blur-xl bg-white/90 rounded-3xl p-8
- Large price display with real-time updates
- Chart: h-80 with elegant time range pills
- Trade inputs: Large, clear amount fields
- Slider: Custom-styled in primary color
- Dual action buttons: Buy (success gradient) / Sell (danger) full width

**Token Detail Page**:
- Grid layout: lg:grid-cols-3 gap-8
- Left column (2/3): Large chart + rich description + activity feed
- Right column (1/3): Sticky trading card
- Header: Hero-sized logo, name, verified badge, social links
- Stats bar: 4-column premium stat cards with subtle backgrounds

## Visual Refinements

**Shadows**: Layered, soft shadows for depth
- Cards: shadow-sm default, shadow-xl hover
- Buttons: shadow-lg with color tint (shadow-primary/20)
- Floating elements: shadow-2xl

**Borders**: Subtle, refined
- Default: border border-border
- Accent: border-2 border-primary/20
- Gradients: border-gradient for premium cards

**Icons**: Lucide React icons
- Size: h-5 w-5 in UI, h-12 w-12 in features
- Style: Rounded, 2px stroke width

**Badges**:
- Rounded-full px-3 py-1 font-medium text-xs
- Success: bg-success/10 text-success border border-success/20
- Trending: bg-accent/10 text-accent with flame icon

**Animations**: Subtle, refined
- Hover transitions: duration-300 ease-out
- Number updates: Smooth counting animation
- Loading: Elegant skeleton shimmer

## Images

**Hero Background**: Premium 3D render featuring floating geometric shapes (spheres, toruses) with glass/chrome materials in blue-to-pink gradient lighting. Subtle particle effects and depth of field. Modern, luxurious, crypto-inspired aesthetic.

**Token Logos**: User uploads, circular with subtle shadow rings

**Empty States**: Minimalist line illustrations in primary color scheme

## Interaction Patterns
- Smooth page transitions with fade
- Toast notifications: Top-right, glassmorphic style
- Form validation: Inline with gentle color shift
- Loading states: Skeleton screens with pulse animation
- Hover states: Subtle lift and shadow increase

## Accessibility
- WCAG AA contrast maintained across all color combinations
- Keyboard navigation with visible focus rings (ring-2 ring-primary/50)
- Labels present for all inputs
- ARIA labels for icon-only buttons
- Screen reader announcements for price updates