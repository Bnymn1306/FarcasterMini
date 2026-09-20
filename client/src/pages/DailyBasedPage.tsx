import { DailyBased } from "@/components/DailyBased";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/contexts/WalletContext";
import { Flame, Calendar, Award, Sparkles, Shield, Zap, TrendingUp, Rocket, Lock } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User, DailyCheckIn } from "@shared/schema";
import sdk from "@farcaster/frame-sdk";

interface CheckInData {
  user: User;
  todayCheckIn: DailyCheckIn | null;
  recentCheckIns: DailyCheckIn[];
}

// Daily rotating content about BasedMem features
const DAILY_FEATURES = [
  {
    day: 0, // Sunday
    icon: Rocket,
    title: "V3 ExecutorVault: Zero-Click Automation",
    description: "BasedMem's V3 vault automatically executes AND withdraws your limit orders for ANY Base token. No manual withdrawals needed - tokens appear directly in your wallet!",
    highlight: "100% automated from order creation to wallet delivery",
    color: "text-chart-1",
    bgColor: "bg-chart-1/10",
    borderColor: "border-chart-1/20",
  },
  {
    day: 1, // Monday
    icon: Shield,
    title: "Smart Token Risk Scoring",
    description: "Every token gets a real-time risk score (Approved, Guarded, High Risk) using ERC20 validation, liquidity checks, and scam detection. Trade confidently with full transparency.",
    highlight: "Whitelisted tokens: WETH, USDC, AERO, DEGEN, BRETT, VIRTUAL",
    color: "text-chart-2",
    bgColor: "bg-chart-2/10",
    borderColor: "border-chart-2/20",
  },
  {
    day: 2, // Tuesday
    icon: Zap,
    title: "x402 Micropayments: Zero Trading Fees",
    description: "Pay for premium features with USDC micropayments via Coinbase's x402 protocol. No subscription, no gas fees, just pay-as-you-go for what you use.",
    highlight: "Instant USDC payments without wallet confirmations",
    color: "text-chart-3",
    bgColor: "bg-chart-3/10",
    borderColor: "border-chart-3/20",
  },
  {
    day: 3, // Wednesday
    icon: TrendingUp,
    title: "0x Protocol: Best Prices Guaranteed",
    description: "Our DEX aggregator scans all Base liquidity sources (Uniswap, Aerodrome, etc.) to find you the best swap rates. Plus native limit orders with price monitoring.",
    highlight: "Instant swaps + automated limit order execution",
    color: "text-chart-4",
    bgColor: "bg-chart-4/10",
    borderColor: "border-chart-4/20",
  },
  {
    day: 4, // Thursday
    icon: Lock,
    title: "Atomic Order Creation with Rollback",
    description: "If your limit order signature fails, deposited funds automatically return to your wallet. No stuck funds, no manual recovery needed.",
    highlight: "Smart deposit validation prevents failed transactions",
    color: "text-chart-5",
    bgColor: "bg-chart-5/10",
    borderColor: "border-chart-5/20",
  },
  {
    day: 5, // Friday
    icon: Sparkles,
    title: "Trade ANY Base Token with Confidence",
    description: "BasedMem supports 2000+ Base tokens with automatic whitelisting for SELL orders. The system handles token approvals, risk scoring, and vault management for you.",
    highlight: "Universal token support - not just stablecoins",
    color: "text-accent",
    bgColor: "bg-accent/10",
    borderColor: "border-accent/20",
  },
  {
    day: 6, // Saturday
    icon: Flame,
    title: "Real-Time Market Data Integration",
    description: "Live price feeds from DEXScreener and CoinGecko with 24h volume, liquidity tracking, and automatic limit order monitoring. Orders execute within 30 seconds of target price.",
    highlight: "Backend auto-executes orders - zero user interaction",
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/20",
  },
];

export default function DailyBasedPage() {
  const { toast } = useToast();
  const { walletAddress, isWalletConnected, getProvider } = useWallet();

  const { data: checkInData, isLoading: isLoadingData } = useQuery<CheckInData>({
    queryKey: ["/api/check-in", walletAddress],
    enabled: isWalletConnected && !!walletAddress,
    queryFn: async () => {
      const response = await fetch(`/api/check-in/${walletAddress}`);
      if (!response.ok) {
        if (response.status === 404) {
          const newUser = await apiRequest("POST", "/api/users", {
            walletAddress,
            username: `User_${walletAddress.slice(0, 6)}`,
          }) as unknown as User;
          return {
            user: newUser,
            todayCheckIn: null,
            recentCheckIns: [],
          };
        }
        throw new Error("Failed to fetch check-in data");
      }
      return response.json();
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!walletAddress) throw new Error("Wallet not connected");
      
      try {
        const gasFeeInWei = "0x1B48EB57E000" as `0x${string}`;
        
        // Try to get ethers provider first (MetaMask/browser wallets)
        let txHash: string;
        const ethersProvider = getProvider();
        
        if (ethersProvider) {
          // MetaMask/browser wallet flow
          console.log("Using browser wallet (MetaMask/etc)");
          const signer = await ethersProvider.getSigner();
          const tx = await signer.sendTransaction({
            to: walletAddress,
            value: gasFeeInWei,
            data: "0x",
          });
          await tx.wait(1);
          txHash = tx.hash;
          console.log("Check-in transaction sent (browser wallet):", txHash);
        } else {
          // Fallback to Farcaster SDK
          console.log("Using Farcaster SDK");
          const provider = sdk.wallet.ethProvider;
          
          // ✅ CRITICAL FIX: Use eth_requestAccounts for Farcaster SDK v2
          const accounts = await provider.request({ method: "eth_requestAccounts" });
          if (!accounts || accounts.length === 0) {
            throw new Error("Wallet not connected");
          }
          
          const fromAddress = accounts[0];
          
          txHash = await provider.request({
            method: "eth_sendTransaction",
            params: [{
              from: fromAddress,
              to: fromAddress,
              value: gasFeeInWei,
              data: "0x" as `0x${string}`,
            }],
          });
          console.log("Check-in transaction sent (Farcaster):", txHash);
        }
        
        const response = await apiRequest("POST", "/api/check-in", {
          walletAddress,
        });
        return await response.json() as { checkIn: DailyCheckIn; user: User; gasFeePaid: string };
      } catch (error: any) {
        if (error.message?.includes("rejected") || error.message?.includes("denied") || error.message?.includes("user rejected")) {
          throw new Error("Transaction rejected");
        }
        throw error;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/check-in", walletAddress] });
      
      const newStreak = data?.user?.currentStreak || 1;
      let rewardMessage = "Earned 10 BMEM! 🎉";
      if (newStreak === 3) rewardMessage = "Earned 30 BMEM! 🔥";
      if (newStreak === 7) rewardMessage = "Earned 100 BMEM! 🚀";
      if (newStreak === 14) rewardMessage = "Earned 250 BMEM! 💎";
      if (newStreak === 30) rewardMessage = "Earned 1000 BMEM! 👑";

      toast({
        title: "Check-In Successful! 🎯",
        description: `${newStreak} day streak! ${rewardMessage} Gas fee paid: 0.00003 ETH`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Check-in failed",
        variant: "destructive",
      });
    },
  });

  const handleCheckIn = () => {
    checkInMutation.mutate();
  };

  const user = checkInData?.user;
  const hasCheckedInToday = !!checkInData?.todayCheckIn;
  const recentCheckIns = checkInData?.recentCheckIns || [];

  // Get today's feature based on day of week
  const todayFeature = DAILY_FEATURES[new Date().getDay()];

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    
    const hasCheckIn = recentCheckIns.some(checkIn => {
      const checkInDate = new Date(checkIn.checkInDate);
      return (
        checkInDate.getFullYear() === date.getFullYear() &&
        checkInDate.getMonth() === date.getMonth() &&
        checkInDate.getDate() === date.getDate()
      );
    });
    
    return {
      date,
      hasCheckIn,
    };
  });

  if (!isWalletConnected) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-20">
          <Flame className="h-20 w-20 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
          <p className="text-muted-foreground">
            Please connect your wallet to access Daily Check-in
          </p>
        </div>
      </div>
    );
  }

  if (isLoadingData) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-20">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-black mb-2 flex items-center gap-3">
          <Flame className="h-10 w-10 text-primary" />
          Daily Based
        </h1>
        <p className="text-muted-foreground">
          Check in daily, build your streak, and earn rewards in the BasedMem ecosystem!
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Daily Feature Spotlight */}
          <Card className={`p-6 space-y-4 border-2 ${todayFeature.borderColor} ${todayFeature.bgColor}`} data-testid="card-daily-feature">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg bg-background/80 ${todayFeature.color}`}>
                <todayFeature.icon className="h-6 w-6" data-testid="icon-feature" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-4 w-4 text-accent" data-testid="icon-sparkles" />
                  <p className="text-xs font-semibold text-accent uppercase tracking-wide">
                    Feature of the Day
                  </p>
                </div>
                <h3 className="font-black text-xl mb-2" data-testid="text-feature-title">
                  {todayFeature.title}
                </h3>
                <p className="text-sm text-foreground/80 leading-relaxed mb-3" data-testid="text-feature-description">
                  {todayFeature.description}
                </p>
                <div className={`p-3 rounded-lg bg-background/60 border ${todayFeature.borderColor}`}>
                  <p className={`text-sm font-semibold ${todayFeature.color}`} data-testid="text-feature-highlight">
                    💡 {todayFeature.highlight}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <DailyBased
            currentStreak={user?.currentStreak || 0}
            longestStreak={user?.longestStreak || 0}
            totalCheckIns={user?.totalCheckIns || 0}
            hasCheckedInToday={hasCheckedInToday}
            onCheckIn={handleCheckIn}
            isLoading={checkInMutation.isPending}
          />

          <Card className="p-6 space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Last 7 Days
            </h3>
            <div className="grid grid-cols-7 gap-2">
              {last7Days.map((day, i) => (
                <div key={i} className="text-center">
                  <p className="text-xs text-muted-foreground mb-2">
                    {day.date.toLocaleDateString("en-US", { weekday: "short" })}
                  </p>
                  <div
                    className={`h-12 rounded-lg flex items-center justify-center ${
                      day.hasCheckIn
                        ? "bg-primary/20 border-2 border-primary"
                        : "bg-muted/30 border border-border"
                    }`}
                  >
                    {day.hasCheckIn && <Flame className="h-5 w-5 text-primary" />}
                  </div>
                  <p className="text-xs mt-1 font-mono">
                    {day.date.getDate()}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Award className="h-5 w-5 text-accent" />
              Streak Benefits
            </h3>
            <div className="space-y-3">
              {[
                { streak: "3 days", benefit: "Early access to new tokens", icon: "🔓" },
                { streak: "7 days", benefit: "Reduced trading fees", icon: "💰" },
                { streak: "14 days", benefit: "VIP badge on profile", icon: "⭐" },
                { streak: "30 days", benefit: "Exclusive airdrops", icon: "🎁" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <p className="font-semibold text-sm">{item.streak}</p>
                    <p className="text-xs text-muted-foreground">{item.benefit}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 space-y-4 bg-gradient-to-br from-chart-2/10 to-primary/10 border-chart-2/20">
            <h3 className="font-bold text-lg">💎 Total Earnings</h3>
            <div className="text-center py-4">
              <p className="text-5xl font-black font-mono text-primary mb-2">
                {(user?.totalCheckIns || 0) * 10 + Math.floor((user?.currentStreak || 0) / 3) * 20}
              </p>
              <p className="text-sm text-muted-foreground">BMEM Tokens</p>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Keep checking in to earn even more!
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
