import { DailyBased } from "@/components/DailyBased";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/contexts/WalletContext";
import { Flame, Calendar, Award } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User, DailyCheckIn } from "@shared/schema";
import sdk from "@farcaster/frame-sdk";

interface CheckInData {
  user: User;
  todayCheckIn: DailyCheckIn | null;
  recentCheckIns: DailyCheckIn[];
}

export default function DailyBasedPage() {
  const { toast } = useToast();
  const { walletAddress, isWalletConnected } = useWallet();

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
        
        const provider = sdk.wallet.ethProvider;
        
        const accounts = await provider.request({ method: "eth_accounts" });
        if (!accounts || accounts.length === 0) {
          throw new Error("Wallet not connected");
        }
        
        const fromAddress = accounts[0];
        
        const txHash = await provider.request({
          method: "eth_sendTransaction",
          params: [{
            from: fromAddress,
            to: fromAddress,
            value: gasFeeInWei,
            data: "0x" as `0x${string}`,
          }],
        });
        
        console.log("Check-in transaction sent:", txHash);
        
        const response = await apiRequest("POST", "/api/check-in", {
          walletAddress,
        });
        return await response.json() as { checkIn: DailyCheckIn; user: User; gasFeePaid: string };
      } catch (error: any) {
        if (error.message?.includes("rejected") || error.message?.includes("denied")) {
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
