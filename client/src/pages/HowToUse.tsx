import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Wallet,
  ArrowDownUp,
  Lock,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  XCircle,
  ChevronRight,
  AlertTriangle,
  Zap,
  Shield,
  Layers,
  Bot,
  ShoppingBag,
  ImageIcon,
  RefreshCw,
  Sparkles,
  ChartNoAxesCombined,
  BadgeCheck,
} from "lucide-react";

export default function HowToUse() {
  const limitOrderSections = [
    {
      title: "1. Connect Your Wallet",
      icon: Wallet,
      description: "Connect MetaMask or Farcaster wallet to start trading on Base blockchain.",
      steps: [
        "Click 'Connect Wallet' button in the top navigation bar",
        "Choose MetaMask (browser extension) or Farcaster Mini App wallet",
        "Approve the connection in your wallet",
        "Your wallet address will be displayed (shortened format)",
        "Make sure you're connected to Base mainnet (Chain ID: 8453)",
        "You'll need ETH on Base for gas fees (~$0.10-0.50 per transaction)",
      ],
      badge: "Required",
      badgeVariant: "default" as const,
    },
    {
      title: "2. Deposit WETH to Vault (For BUY Orders)",
      icon: Lock,
      description: "Deposit Wrapped ETH (WETH) into ExecutorVault V3 for automatic limit order execution.",
      steps: [
        "Navigate to 'Limit Orders' page from the menu",
        "Find 'Vault Panel' section at the top",
        "Click 'Approve WETH' button (first time only)",
        "Approve WETH spending in your wallet (gas fee: ~$0.20)",
        "Enter WETH amount you want to deposit (e.g., 0.01 WETH)",
        "Click 'Deposit to Vault' button",
        "Confirm transaction in your wallet (gas fee: ~$0.30)",
        "Wait for confirmation (5-10 seconds on Base)",
        "Your vault balance will update automatically",
        "This WETH will be used for all your BUY orders",
      ],
      badge: "BUY Orders",
      badgeVariant: "secondary" as const,
    },
    {
      title: "3. Create a BUY Limit Order",
      icon: TrendingUp,
      description: "Place a buy order that executes automatically when price drops to your target.",
      steps: [
        "Click 'Create New Order' button",
        "Select 'BUY' order type",
        "Enter token address (e.g., AERO, VIRTUAL, USDC, etc.)",
        "System validates token risk score (whitelisted tokens approved instantly)",
        "Enter WETH amount (must be ≤ your vault balance)",
        "Enter target price in USD (e.g., $1.50 for VIRTUAL)",
        "System calculates: WETH amount ÷ target price = tokens you'll receive",
        "Review order details and risk warnings",
        "Click 'Place BUY Order' button",
        "Sign the order message in your wallet (FREE - no gas!)",
        "Order saved to database with status 'fillable'",
        "Backend monitors price every 30 seconds",
        "When price ≤ target: automatic execution starts",
        "WETH swapped for tokens via 0x Protocol on Base",
        "Tokens automatically withdrawn to your wallet (V3 auto-withdrawal)",
        "Order status changes to 'filled'",
      ],
      badge: "WETH Required",
      badgeVariant: "default" as const,
    },
    {
      title: "4. Create a SELL Limit Order",
      icon: TrendingDown,
      description: "Place a sell order that executes automatically when price rises to your target.",
      steps: [
        "Make sure you own the tokens you want to sell",
        "Click 'Create New Order' button",
        "Select 'SELL' order type",
        "Enter token address (ANY Base token supported)",
        "Enter token amount you want to sell",
        "",
        "CRITICAL: You MUST manually approve the token first:",
        "  1. Click 'Approve Token' button in the UI",
        "  2. Confirm approval transaction in wallet (gas fee: ~$0.20)",
        "  3. Wait for confirmation (5-10 seconds)",
        "  4. Backend wallet whitelists token in vault",
        "  5. Only after approval succeeds can you continue",
        "",
        "After token approval is complete:",
        "  • Enter target price in USD (e.g., $0.025 for PING)",
        "  • System calculates: token amount × target price = WETH you'll receive",
        "  • Review order details and risk warnings",
        "  • Click 'Place SELL Order' button",
        "  • Approve token deposit to vault (gas fee: ~$0.30)",
        "  • Wait for vault deposit confirmation",
        "  • Sign the order message in your wallet (FREE - no gas!)",
        "",
        "Order saved to database with status 'fillable'",
        "Backend monitors price every 30 seconds",
        "When price ≥ target: automatic execution starts",
        "Tokens swapped for WETH via 0x Protocol on Base",
        "WETH automatically withdrawn to your wallet (V3 auto-withdrawal only)",
        "Order status changes to 'filled'",
      ],
      badge: "Tokens Required",
      badgeVariant: "secondary" as const,
    },
    {
      title: "5. Monitor Your Orders",
      icon: CheckCircle2,
      description: "Track order status and automatic execution in real-time.",
      steps: [
        "View all your orders in 'My Orders' section",
        "Orders refresh automatically every 30 seconds",
        "'Ready to Execute' panel shows orders meeting price conditions",
        "Status indicators:",
        "  • pending: Waiting for backend validation",
        "  • fillable: Active, monitoring price",
        "  • ready_to_execute: Price condition met, execution queued",
        "  • filled: Successfully executed ✅",
        "  • failed: Execution error (see error message)",
        "  • cancelled: Manually cancelled by you",
        "View current price vs. target price for each order",
        "Risk badges show token safety (Approved/Guarded/High Risk)",
        "See execution transaction hash for filled orders",
        "Check timestamps for order creation and completion",
      ],
      badge: "Real-Time",
      badgeVariant: "default" as const,
    },
    {
      title: "6. Automatic Execution (V3 Vault)",
      icon: Zap,
      description: "Backend automatically executes orders when price conditions are met. 100% automated!",
      steps: [
        "Backend checks all fillable orders every 30 seconds",
        "Fetches real-time prices from DEXScreener/CoinGecko APIs",
        "For BUY orders: executes when current price ≤ target price",
        "For SELL orders: executes when current price ≥ target price",
        "Execution flow:",
        "  1. Backend fetches 0x Protocol quote (Base mainnet)",
        "  2. Calls ExecutorVault.executeSwap() with swap data",
        "  3. Vault uses YOUR deposited WETH/tokens for the swap",
        "  4. Swap executes on-chain via 0x Protocol",
        "  5. Auto-withdrawal behavior (depends on vault version):",
        "     • V3 orders: AUTOMATIC withdrawal to your wallet ✅",
        "     • V2 orders: Auto-withdrawal for whitelisted tokens only",
        "     • V1 orders: MANUAL withdrawal required (legacy)",
        "  6. Order status → 'filled', tx hash saved",
        "",
        "Gas fees paid by backend wallet (YOU DON'T PAY GAS!)",
        "Received tokens appear in your wallet within seconds (V3 only)",
        "Failed executions marked as 'failed' with error message",
        "IMPORTANT: Failed orders require manual withdrawal (see Section 7)",
      ],
      badge: "Fully Automated",
      badgeVariant: "default" as const,
    },
    {
      title: "7. Cancel & Withdraw",
      icon: XCircle,
      description: "Cancel pending orders or withdraw assets from failed/V1 orders.",
      steps: [
        "CANCEL PENDING ORDERS:",
        "  • Click 'Cancel' button on any fillable/pending order",
        "  • Confirm cancellation in your wallet (gas fee: ~$0.20)",
        "  • For BUY orders: WETH automatically withdrawn from vault",
        "  • For SELL orders: Tokens automatically withdrawn from vault",
        "  • Order status changes to 'cancelled'",
        "",
        "WITHDRAW FROM FAILED ORDERS (CRITICAL):",
        "  • Failed orders ALWAYS require manual withdrawal",
        "  • Look for 'Withdraw X WETH' or 'Withdraw X TOKEN' button",
        "  • Click withdraw button",
        "  • System checks vault balance before withdrawal",
        "  • Withdraws minimum of (order amount, actual vault balance)",
        "  • If vault balance = 0: warning displayed, no withdrawal",
        "  • Confirm withdrawal transaction (gas fee: ~$0.20)",
        "  • ⚠️ Multiple failed orders may compete for limited vault balance",
        "  • First to withdraw gets available funds (FIFO basis)",
        "",
        "V1 FILLED ORDERS (Legacy - Manual Withdrawal Required):",
        "  • Old V1 vault orders show 'Withdraw' button even when filled",
        "  • You MUST manually withdraw received tokens from V1 vault",
        "  • Click 'Withdraw' button and confirm transaction",
        "  • Gas fee: ~$0.20",
        "",
        "V2/V3 FILLED ORDERS (Automatic Withdrawal):",
        "  • V2: Auto-withdrawal for whitelisted tokens only",
        "  • V3: Auto-withdrawal for ANY token (universal)",
        "  • NO manual withdrawal needed - tokens already in your wallet",
        "  • No 'Withdraw' button shown for V2/V3 filled orders",
        "",
        "IMPORTANT WARNINGS:",
        "  ⚠️ Failed orders with 0 vault balance cannot be withdrawn",
        "  ⚠️ If multiple orders failed, first withdrawal drains shared balance",
        "  ⚠️ V1 filled orders will NOT auto-transfer - you must withdraw manually",
      ],
      badge: "Asset Recovery",
      badgeVariant: "secondary" as const,
    },
  ];

  const fractionSections = [
    {
      title: "1. Browse & Mint Fractions",
      icon: Layers,
      description: "Collect fractional shares of meme NFT collections on Base mainnet.",
      steps: [
        "Navigate to the 'Fractions' page from the top nav",
        "Browse the 5 seed collections: BasedPepe, WojakGains, ChillGuy, PepeRocket, DogeMem",
        "Each collection has 1,000,000 total fractional shares",
        "Connect your ETH wallet (Base mainnet required)",
        "Click 'Mint' on any collection card",
        "Choose how many fractions to buy",
        "Send ETH to the treasury address (price × amount)",
        "Confirm the transaction in your wallet",
        "Backend verifies the tx on Base mainnet",
        "Fractions credited to your portfolio — your tier updates automatically",
        "Tiers: Bronze (1–999), Silver (1K–9.9K), Gold (10K–99.9K), Legendary (100K–999.9K), Whale (1M)",
      ],
      badge: "ETH Required",
      badgeVariant: "default" as const,
    },
    {
      title: "2. Gamble Mint — Re-roll Rarity",
      icon: Sparkles,
      description: "Spend 100 fractions + 0.0001 ETH to re-roll your rarity score (1–100).",
      steps: [
        "Go to 'My Portfolio' section on the Fractions page",
        "Find a holding with at least 100 fractions",
        "Click the 'Gamble' button on that collection card",
        "Review the rarity odds before confirming:",
        "  • Common (1–50): 60% chance",
        "  • Uncommon (51–75): 25% chance",
        "  • Rare (76–90): 12% chance",
        "  • Legendary (91–100): 3% chance",
        "Send 0.0001 ETH as the gamble fee",
        "Confirm the transaction in your wallet",
        "Backend verifies tx, burns 100 fractions, and assigns new rarity score",
        "Your rarity badge updates immediately",
        "Higher rarity = bragging rights & future utility",
      ],
      badge: "100 Fractions + Fee",
      badgeVariant: "secondary" as const,
    },
    {
      title: "3. P2P Fraction Market — Sell",
      icon: ShoppingBag,
      description: "List your fractions for sale directly to other users on BasedMem.",
      steps: [
        "Go to 'My Portfolio' on the Fractions page",
        "Click the 'Sell' button on any holding card",
        "Enter the number of fractions you want to list",
        "Enter your asking price per fraction (in ETH)",
        "Click 'Create Listing' — no ETH transaction needed from you",
        "Fractions are immediately escrowed (deducted from your balance)",
        "Your listing appears in the 'P2P Fraction Market' section",
        "To cancel: expand the collection in the market and click 'Cancel'",
        "Cancelled listings return fractions to your portfolio instantly",
      ],
      badge: "No Gas to List",
      badgeVariant: "default" as const,
    },
    {
      title: "4. P2P Fraction Market — Buy",
      icon: ShoppingBag,
      description: "Purchase fractions directly from other holders at their listed price.",
      steps: [
        "Scroll to 'P2P Fraction Market' on the Fractions page",
        "Click any collection row to expand and see active listings",
        "Each listing shows: amount, price per fraction, total ETH cost, seller address",
        "Click 'Buy' on a listing you want",
        "Review the total cost in the modal",
        "Confirm — your wallet sends ETH directly to the seller's address",
        "Backend verifies the tx: sender = you, recipient = seller, value ≥ 90% of total",
        "Fractions are transferred to your portfolio instantly after verification",
        "Transaction hash is saved as proof of purchase",
      ],
      badge: "ETH to Seller",
      badgeVariant: "secondary" as const,
    },
    {
      title: "5. Launch Your Own Collection",
      icon: ImageIcon,
      description: "Any user can create a new fraction collection by paying a one-time 0.0005 ETH fee.",
      steps: [
        "Click 'Launch Collection' button on the Fractions page",
        "Upload a custom image for your collection (PNG/JPG/GIF/WEBP, max 4MB)",
        "Or skip the image — choose a color gradient as the background instead",
        "Fill in Collection Name (max 50 chars) and Symbol (auto-derived, max 10 chars)",
        "Add an optional description",
        "Set price per fraction (0.0000001 – 1 ETH)",
        "Set total supply (100K – 100M, default 1M)",
        "Click 'Launch' — wallet will prompt for 0.0005 ETH creation fee",
        "Send ETH to the BasedMem treasury on Base mainnet",
        "After 1 confirmation, backend verifies tx and publishes your collection",
        "Your collection appears alongside seed collections immediately",
        "Anyone can now mint fractions from your collection",
      ],
      badge: "0.0005 ETH Fee",
      badgeVariant: "secondary" as const,
    },
  ];

  const agentSections = [
    {
      title: "1. Mint an Agent — Auto Mode",
      icon: Zap,
      description: "One-click agent creation with randomly generated name, personality, and bio.",
      steps: [
        "Navigate to 'Agent Hub' from the top nav",
        "Connect your ETH wallet (Base mainnet required)",
        "Click 'Mint Agent' button",
        "Select the 'Auto' tab in the modal",
        "A random agent is instantly generated:",
        "  • Name: meme-themed combos (e.g. TurboWhale, BasedSniper)",
        "  • Personality: Analyst, Shiller, Degen, Whale, or Sniper",
        "  • Bio: personality-matched catchphrase",
        "If you don't like it, click 'Generate Another' to re-roll",
        "When satisfied, click 'Quick Mint'",
        "Approve the transaction in your wallet (Base mainnet gas ~$0.50)",
        "Your ERC-8004 agent is registered on-chain and visible on 8004scan.io",
      ],
      badge: "One Click",
      badgeVariant: "default" as const,
    },
    {
      title: "2. Mint an Agent — Manual Mode",
      icon: Bot,
      description: "Build a custom on-chain agent with your own name, personality, and backstory.",
      steps: [
        "Click 'Mint Agent' and select the 'Manual' tab",
        "Enter Agent Name (e.g. Doge-Analyst, PepeWhale)",
        "Choose a Personality:",
        "  • Analyst — data-driven, logical",
        "  • Shiller — hype generator",
        "  • Degen — high risk, high reward",
        "  • Whale — moves markets",
        "  • Sniper — entry/exit precision",
        "Write an optional Bio describing your agent's mission",
        "Click 'Mint Agent' and approve the wallet transaction",
        "ERC-8004 metadata is encoded as a base64 data URI and registered on-chain",
        "Agent receives a sequential tokenId (e.g. #46092) on the official registry",
        "Appears on 8004scan.io — click the green 'On-Chain' badge to view",
        "No per-wallet limit — mint as many agents as you want",
      ],
      badge: "Fully Custom",
      badgeVariant: "secondary" as const,
    },
    {
      title: "3. Agent Identity & Verification",
      icon: Shield,
      description: "Enhance your agent identity with SIWA verification and Basenames.",
      steps: [
        "Go to the 'Identity' tab in Agent Hub",
        "SIWA (Sign In With Anything): click 'Sign In With Passkey'",
        "  • Signs an off-chain message with your wallet",
        "  • Grants a 'Verified' badge on your Agent Hub profile",
        "  • Verification persists across sessions via localStorage",
        "Basename resolution: your .base.eth name appears automatically if registered",
        "  • No registration needed — BasedMem reads Base Name Service on-chain",
        "  • If you don't have one, a 'Get Basename' link is shown",
        "On-Chain Sync: if you minted agents externally, click 'Sync' to import them",
        "All your agents' tokenIds link to 8004scan.io for public proof of ownership",
      ],
      badge: "Identity",
      badgeVariant: "default" as const,
    },
    {
      title: "4. Marketplace & Service Requests",
      icon: RefreshCw,
      description: "Send and receive service requests between on-chain agents.",
      steps: [
        "Go to the 'Marketplace' tab",
        "Browse all registered agents on BasedMem",
        "Click 'Request' on any agent to send a service request",
        "Choose request type: Shill Campaign, Token Analysis, Price Alert, or Collaboration",
        "Describe what you need and optionally set a USDC budget",
        "If both agents are on-chain, the request is emitted as an on-chain event",
        "Completed jobs boost the receiving agent's reputation score automatically",
        "Reputation levels: New → Trusted → Expert → Legendary",
      ],
      badge: "On-Chain",
      badgeVariant: "secondary" as const,
    },
  ];

  const stockSections = [
    {
      title: "1. Start with your goal",
      description: "Use natural language to describe the businesses, risk posture, or time horizon you want to explore.",
      steps: ["Open Stocks from the navigation and connect an ETH wallet.", "Confirm you are on Base mainnet (Chain ID: 8453).", "Write a goal in the planning field or choose an available strategy.", "Select “Generate my transparent plan” to receive a proposed B20 basket."],
    },
    {
      title: "2. Inspect the proposal",
      description: "A plan is a proposal, not an automatic trade instruction.",
      steps: ["Review the allocation percentage and rationale for every listed asset.", "Read all displayed warnings and the strategy disclaimer before taking action.", "Availability is assessed against the official tokenized-stock catalog and eligible execution routes.", "Choose individual assets to purchase only after reviewing the plan."],
    },
    {
      title: "3. Review a fresh Aerodrome quote",
      description: "Quotes are obtained for the exact USDC amount and are intentionally short-lived.",
      steps: ["Enter the USDC amount you want to use for one selected asset.", "Request a fresh quote; the review panel shows the venue, amount paid, expected and minimum amount received.", "Confirm your jurisdiction eligibility, issuer terms, risks, and quote review.", "If a quote expires or details change, discard it and request a new one."],
    },
    {
      title: "4. Approve and sign separately",
      description: "Stock Agents never execute on your behalf. Your wallet keeps control at each onchain step.",
      steps: ["When required, approve exactly the quoted USDC amount for the verified Aerodrome SwapRouter in your wallet.", "After approval, BasedMem fetches a fresh quote and simulates it again before submission.", "Review the separate swap transaction in your wallet and sign only if it matches your intent.", "Once confirmed on Base, refresh your portfolio to view the onchain position."],
    },
  ];

  const limitOrderFeatures = [
    {
      icon: Shield,
      title: "ExecutorVault V3",
      desc: "Universal auto-withdrawal for ANY Base token. Tokens land in your wallet instantly after execution.",
    },
    {
      icon: Zap,
      title: "Zero Gas Execution",
      desc: "Backend pays gas fees for order execution. You only pay for deposits/withdrawals.",
    },
    {
      icon: Lock,
      title: "Token Risk Scoring",
      desc: "Automated risk assessment with 24h caching. Whitelisted tokens (WETH, USDC, AERO, DEGEN, BRETT, VIRTUAL) approved instantly.",
    },
    {
      icon: CheckCircle2,
      title: "Atomic Order Creation",
      desc: "Automatic rollback if signature fails. Your assets are always safe.",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-16">
      <section>
        <div className="overflow-hidden rounded-[2rem] border border-primary/20 bg-[linear-gradient(120deg,hsl(222_48%_14%),hsl(222_55%_22%),hsl(171_42%_25%))] p-6 text-slate-50 md:p-9">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-200/15"><ChartNoAxesCombined className="h-6 w-6 text-cyan-200" /></div>
            <div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-200">Stock Agents</p><h1 className="font-serif text-3xl font-bold">Plan first. Sign only what you approve.</h1></div>
          </div>
          <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-200">Stock Agents translate your natural-language goal into an explainable B20 tokenized-stock basket. They help you inspect allocations; they do not trade autonomously. All execution is on Base and requires your explicit wallet actions.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Official 13-token B20 catalog", "Exact USDC approvals", "Short-lived Aerodrome quotes"].map(item => <div key={item} className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/20 p-3 text-xs font-semibold"><BadgeCheck className="h-4 w-4 shrink-0 text-cyan-200" />{item}</div>)}
          </div>
        </div>
        <div className="mt-6 space-y-4">
          {stockSections.map((section, index) => (
            <Card key={section.title} className="p-5 md:p-6" data-testid={`stock-guide-${index}`}>
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10"><ChartNoAxesCombined className="h-5 w-5 text-primary" /></div>
                <div><h2 className="text-xl font-black">{section.title}</h2><p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                  <ol className="mt-4 space-y-2">{section.steps.map((step, stepIndex) => <li key={step} className="flex gap-3 text-sm leading-6"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] text-muted-foreground">{stepIndex + 1}</span>{step}</li>)}</ol>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Limit Orders ── */}
      <section>
        <div className="space-y-6 mb-10">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black">Limit Orders Guide</h1>
              <p className="text-muted-foreground mt-1">
                Automated trading on Base, Solana, Soneium & INK
              </p>
            </div>
          </div>

          <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <ArrowDownUp className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-lg">What are Limit Orders?</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  BasedMem Limit Orders let you buy or sell ANY Base token automatically when it reaches your target price.
                  Deposit WETH (for BUY) or tokens (for SELL) into ExecutorVault V3, set your target price, and our backend
                  monitors prices 24/7. When conditions are met, your order executes automatically via 0x Protocol and
                  tokens are sent directly to your wallet — no manual intervention needed.
                </p>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {limitOrderFeatures.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card key={idx} className="p-4 hover-elevate">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm mb-1">{feature.title}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">{feature.desc}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          {limitOrderSections.map((section, index) => {
            const Icon = section.icon;
            return (
              <Card key={index} className="p-6 hover-elevate" data-testid={`guide-section-${index}`}>
                <div className="space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black mb-1">{section.title}</h2>
                        <p className="text-muted-foreground text-sm">{section.description}</p>
                      </div>
                    </div>
                    <Badge variant={section.badgeVariant} className="flex-shrink-0 text-xs">{section.badge}</Badge>
                  </div>
                  <div className="space-y-2 pl-0 md:pl-16">
                    {section.steps.map((step, stepIndex) => {
                      const isSubpoint = step.startsWith("  •") || step.startsWith("  1") || step.startsWith("  2") || step.startsWith("  3") || step.startsWith("  4") || step.startsWith("  5") || step.startsWith("     •");
                      const isHeading = step.endsWith(":") && !isSubpoint && step.trim() !== "";
                      const isEmpty = step.trim() === "";
                      if (isEmpty) return <div key={stepIndex} className="h-1" />;
                      if (isHeading) return <div key={stepIndex} className="font-bold text-sm text-primary mt-3">{step}</div>;
                      return (
                        <div key={stepIndex} className="flex items-start gap-2">
                          <div className={`h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isSubpoint ? "bg-muted/20" : "bg-muted/50"}`}>
                            <span className="text-[10px] font-semibold text-muted-foreground">{isSubpoint ? "·" : stepIndex + 1}</span>
                          </div>
                          <p className={`text-sm leading-relaxed flex-1 ${isSubpoint ? "text-muted-foreground" : ""}`}>
                            {step.replace(/^  [•·] /, "").replace(/^  \d+\. /, "").replace(/^     • /, "")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="p-6 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20 mt-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
              <h3 className="font-bold text-xl">Safety Notes</h3>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              {[
                "Real blockchain transactions — All orders execute on Base mainnet with real assets",
                "Gas fees required: Deposits (~$0.30), Approvals (~$0.20), Cancellations (~$0.20), Withdrawals (~$0.20)",
                "Backend pays execution gas — You never pay gas when orders fill automatically",
                "Risk scores are automated — Always DYOR before trading",
                "High-risk tokens tradeable — You take full responsibility for token selection",
                "Failed orders may share vault balance — First to withdraw gets available funds",
                "V3 auto-withdrawal is instant — Tokens sent to your wallet immediately after execution",
                "Always keep ETH on Base for gas — Minimum 0.002 ETH recommended",
              ].map((note, i) => (
                <p key={i} className="flex items-start gap-2">
                  <span className="text-amber-500 font-bold shrink-0">⚠</span>
                  <span>{note}</span>
                </p>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/20 mt-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              <h3 className="font-bold text-xl">Pro Tips</h3>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              {[
                "Start small — Test with 0.001–0.01 WETH before large orders",
                "Use whitelisted tokens — WETH, USDC, AERO, DEGEN, BRETT, VIRTUAL have instant approval",
                "Set realistic target prices — Check DEXScreener for current market conditions",
                "Monitor 'Ready to Execute' panel — Know when your orders are about to fill",
                "Check transaction hashes — Verify executions on BaseScan.org",
                "Withdraw failed orders quickly — Multiple orders may compete for limited vault balance",
              ].map((tip, i) => (
                <p key={i} className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold shrink-0">✓</span>
                  <span>{tip}</span>
                </p>
              ))}
            </div>
          </div>
        </Card>
      </section>

      {/* ── Memetic Fractions ── */}
      <section>
        <div className="flex items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Layers className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black">Memetic Fractions Guide</h2>
            <p className="text-muted-foreground mt-1">
              Collect, trade, and create fractional meme NFTs on Base
            </p>
          </div>
        </div>

        <Card className="p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20 mb-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
              <Layers className="h-5 w-5 text-purple-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-lg">What are Memetic Fractions?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Inspired by DN404/ERC-404, Memetic Fractions are fractional shares of meme NFT collections.
                Each collection has 1,000,000 shares. Accumulate fractions to unlock higher tiers (Bronze → Whale),
                gamble-mint to re-roll your rarity score, trade peer-to-peer with other holders, or launch
                your own custom collection with an uploaded image.
              </p>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          {fractionSections.map((section, index) => {
            const Icon = section.icon;
            return (
              <Card key={index} className="p-6 hover-elevate" data-testid={`fraction-guide-${index}`}>
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-6 w-6 text-purple-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black mb-1">{section.title}</h2>
                        <p className="text-muted-foreground text-sm">{section.description}</p>
                      </div>
                    </div>
                    <Badge variant={section.badgeVariant} className="flex-shrink-0 text-xs">{section.badge}</Badge>
                  </div>
                  <div className="space-y-2 pl-0 md:pl-16">
                    {section.steps.map((step, stepIndex) => {
                      const isSubpoint = step.startsWith("  •") || step.startsWith("  1") || step.startsWith("  2") || step.startsWith("  3") || step.startsWith("  4") || step.startsWith("  5");
                      const isEmpty = step.trim() === "";
                      if (isEmpty) return <div key={stepIndex} className="h-1" />;
                      return (
                        <div key={stepIndex} className="flex items-start gap-2">
                          <div className={`h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isSubpoint ? "bg-muted/20" : "bg-purple-500/10"}`}>
                            <span className="text-[10px] font-semibold text-purple-400">{isSubpoint ? "·" : stepIndex + 1}</span>
                          </div>
                          <p className={`text-sm leading-relaxed flex-1 ${isSubpoint ? "text-muted-foreground" : ""}`}>
                            {step.replace(/^  [•·] /, "").replace(/^  \d+\. /, "")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ── Agent Hub ── */}
      <section>
        <div className="flex items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black">Agent Hub Guide</h2>
            <p className="text-muted-foreground mt-1">
              Mint real ERC-8004 on-chain AI agents on Base mainnet
            </p>
          </div>
        </div>

        <Card className="p-6 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/20 mb-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
              <Bot className="h-5 w-5 text-cyan-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-lg">What is Agent Hub?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Agent Hub (Based Lab) lets you mint real ERC-8004 on-chain agents via the official IdentityRegistry
                at <span className="font-mono text-foreground">0x8004...9432</span> on Base mainnet.
                Each agent is an ERC-721 NFT with a unique tokenId, indexed by 8004scan.io.
                No per-wallet limit — mint as many as you want. Use Auto mode for instant creation
                or Manual mode to craft a custom identity.
              </p>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          {agentSections.map((section, index) => {
            const Icon = section.icon;
            return (
              <Card key={index} className="p-6 hover-elevate" data-testid={`agent-guide-${index}`}>
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-xl bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-6 w-6 text-cyan-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black mb-1">{section.title}</h2>
                        <p className="text-muted-foreground text-sm">{section.description}</p>
                      </div>
                    </div>
                    <Badge variant={section.badgeVariant} className="flex-shrink-0 text-xs">{section.badge}</Badge>
                  </div>
                  <div className="space-y-2 pl-0 md:pl-16">
                    {section.steps.map((step, stepIndex) => {
                      const isSubpoint = step.startsWith("  •") || step.startsWith("  1") || step.startsWith("  2") || step.startsWith("  3") || step.startsWith("  4") || step.startsWith("  5");
                      const isEmpty = step.trim() === "";
                      if (isEmpty) return <div key={stepIndex} className="h-1" />;
                      return (
                        <div key={stepIndex} className="flex items-start gap-2">
                          <div className={`h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isSubpoint ? "bg-muted/20" : "bg-cyan-500/10"}`}>
                            <span className="text-[10px] font-semibold text-cyan-400">{isSubpoint ? "·" : stepIndex + 1}</span>
                          </div>
                          <p className={`text-sm leading-relaxed flex-1 ${isSubpoint ? "text-muted-foreground" : ""}`}>
                            {step.replace(/^  [•·] /, "").replace(/^  \d+\. /, "")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

    </div>
  );
}
