import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Wallet, 
  Rocket, 
  Grid3x3, 
  TrendingUp, 
  Bell, 
  Flame,
  ArrowDownUp,
  ChevronRight
} from "lucide-react";

export default function HowToUse() {
  const sections = [
    {
      title: "1. Connect Your Wallet",
      icon: Wallet,
      description: "Start your BasedMem journey by simulating a wallet connection.",
      steps: [
        "Click the 'Connect Wallet' button in the top right corner",
        "The demo will simulate a wallet connection (no real wallet needed)",
        "A mock wallet address will be displayed (0x742d...bEb4)",
        "You can disconnect anytime by clicking the wallet address",
        "Note: This is a demo - no real blockchain connection is made"
      ],
      badge: "Demo Feature",
      badgeVariant: "default" as const
    },
    {
      title: "2. Create Your Meme Token",
      icon: Rocket,
      description: "Simulate launching your own meme token with the platform interface.",
      steps: [
        "Navigate to 'Create' from the top menu",
        "Fill in your token details: Name, Symbol, Description",
        "Provide a logo URL for your token",
        "Set total supply (default: 1,000,000,000)",
        "Add social links (Twitter, Telegram, Website) - optional",
        "Click 'Launch Token' to simulate creation",
        "The platform displays simulated gas fee (~0.00015 ETH)",
        "Your demo token is created instantly",
        "Note: Creators don't automatically receive tokens in this simulation"
      ],
      badge: "Demo Feature",
      badgeVariant: "secondary" as const
    },
    {
      title: "3. Browse & Discover Tokens",
      icon: Grid3x3,
      description: "Explore the latest meme tokens launched on BasedMem.",
      steps: [
        "Click 'Browse' to see all available tokens",
        "View key metrics: Price, Market Cap, 24h Volume, Holder Count",
        "Sort by different criteria (newest, trending, etc.)",
        "Click on any token card to see detailed information",
        "Check verified badges for trusted projects"
      ],
      badge: "Everyone",
      badgeVariant: "secondary" as const
    },
    {
      title: "4. Trade Tokens",
      icon: ArrowDownUp,
      description: "Simulate buying and selling meme tokens in the demo trading interface.",
      steps: [
        "Open any token's detail page",
        "View the simulated price chart with multiple timeframes (1H, 24H, 7D, 30D)",
        "Choose 'Buy' or 'Sell' tab in the trading interface",
        "Enter amount manually or use the quick select slider (25%, 50%, 75%, 100%)",
        "Review 'You'll receive' calculated amount and simulated gas fee",
        "Click 'Buy' or 'Sell' button to execute simulated trade",
        "See success confirmation message",
        "Note: Demo balances (2.5 ETH, 500 tokens) are used for calculations"
      ],
      badge: "Demo Feature",
      badgeVariant: "default" as const
    },
    {
      title: "5. Set Price Alerts",
      icon: Bell,
      description: "Create simulated price alerts with Farcaster notification preferences.",
      steps: [
        "Go to any token's detail page",
        "Click the 'Set Alert' button (bell icon) next to social links",
        "Choose alert type: 'Above' or 'Below' target price",
        "Enter your target price",
        "Provide your Farcaster username (@username)",
        "Click 'Create Alert' to simulate alert creation",
        "View confirmation message (actual notifications are not sent in demo)",
        "Browse all simulated alerts in the 'Price Alerts' page"
      ],
      badge: "Demo Feature",
      badgeVariant: "secondary" as const
    },
    {
      title: "6. Daily Based Check-In",
      icon: Flame,
      description: "Simulate earning BMEM tokens through daily check-ins and streak building.",
      steps: [
        "Visit the 'Daily' page from the menu",
        "Click 'Check In Now' button",
        "Simulated gas fee (~0.00003 ETH) is shown",
        "Receive demo BMEM rewards based on simulated streak:",
        "  • 1 day: 10 BMEM",
        "  • 3 days: 30 BMEM",
        "  • 7 days: 100 BMEM",
        "  • 14 days: 250 BMEM",
        "  • 30 days: 1,000 BMEM",
        "Demo streak counter increases with each check-in",
        "Check in daily to see how streaks work"
      ],
      badge: "Demo Feature",
      badgeVariant: "default" as const
    },
    {
      title: "7. Track Your Portfolio",
      icon: TrendingUp,
      description: "View simulated token holdings and portfolio analytics.",
      steps: [
        "Navigate to 'Portfolio' from the menu",
        "View demo portfolio with sample token holdings",
        "See simulated current prices for each token",
        "Check demo 24h profit/loss calculations",
        "Explore total portfolio value display",
        "Click on tokens to navigate to their detail pages"
      ],
      badge: "Demo Feature",
      badgeVariant: "secondary" as const
    }
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="space-y-6 mb-10">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <ChevronRight className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-black">How To Use BasedMem</h1>
            <p className="text-muted-foreground mt-1">
              Complete guide to launching, trading, and earning with meme tokens on Base
            </p>
          </div>
        </div>

        <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-lg">Welcome to BasedMem Demo!</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                BasedMem is a demo platform showcasing meme token launch and trading features inspired by Base blockchain. 
                Explore the interface, simulate token creation, practice trading, earn demo rewards, and experience 
                how a meme token platform works. All operations are simulated for demonstration purposes.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        {sections.map((section, index) => {
          const Icon = section.icon;
          return (
            <Card key={index} className="p-6 hover-elevate" data-testid={`guide-section-${index}`}>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black mb-2">{section.title}</h2>
                      <p className="text-muted-foreground">{section.description}</p>
                    </div>
                  </div>
                  <Badge variant={section.badgeVariant} className="flex-shrink-0">
                    {section.badge}
                  </Badge>
                </div>

                <div className="space-y-2 pl-16">
                  {section.steps.map((step, stepIndex) => (
                    <div key={stepIndex} className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-muted/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {step.startsWith('  •') ? '•' : stepIndex + 1}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed flex-1">
                        {step.replace('  • ', '')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-6 bg-gradient-to-br from-chart-2/10 to-chart-1/10 border-chart-2/20 mt-8">
        <div className="space-y-4">
          <h3 className="font-bold text-xl">Important Notes</h3>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <span className="text-chart-2 font-bold">•</span>
              <span><strong>This is a demonstration platform</strong> - No real blockchain transactions occur</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-chart-2 font-bold">•</span>
              <span>All wallet connections, trades, and transactions are simulated</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-chart-2 font-bold">•</span>
              <span>Gas fees shown are illustrative examples based on Base network estimates</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-chart-2 font-bold">•</span>
              <span>Token data, prices, and charts are generated for demo purposes</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-chart-2 font-bold">•</span>
              <span>No real tokens are created, bought, or sold on any blockchain</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-chart-2 font-bold">•</span>
              <span>Price alerts and Farcaster notifications are not actually delivered</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-chart-2 font-bold">•</span>
              <span>This demo showcases the UI/UX of a meme token platform concept</span>
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
