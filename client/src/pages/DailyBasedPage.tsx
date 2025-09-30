import { useState } from "react";
import { DailyBased } from "@/components/DailyBased";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Flame, Calendar, Award } from "lucide-react";

export default function DailyBasedPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [hasCheckedIn, setHasCheckedIn] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(5);
  const [longestStreak] = useState(12);
  const [totalCheckIns, setTotalCheckIns] = useState(23);

  const handleCheckIn = async () => {
    setIsLoading(true);
    
    setTimeout(() => {
      setIsLoading(false);
      setHasCheckedIn(true);
      const newStreak = currentStreak + 1;
      setCurrentStreak(newStreak);
      setTotalCheckIns(totalCheckIns + 1);
      
      let rewardMessage = "10 BMEM kazandın! 🎉";
      if (newStreak === 3) rewardMessage = "30 BMEM kazandın! 🔥";
      if (newStreak === 7) rewardMessage = "100 BMEM kazandın! 🚀";
      if (newStreak === 14) rewardMessage = "250 BMEM kazandın! 💎";
      if (newStreak === 30) rewardMessage = "1000 BMEM kazandın! 👑";

      toast({
        title: "Check-In Başarılı! 🎯",
        description: `${newStreak} günlük streak! ${rewardMessage}`,
      });
    }, 1500);
  };

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const hasCheckIn = i >= (7 - currentStreak) && i < 7;
    return {
      date,
      hasCheckIn,
    };
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-black mb-2 flex items-center gap-3">
          <Flame className="h-10 w-10 text-primary" />
          Daily Based
        </h1>
        <p className="text-muted-foreground">
          Her gün check-in yap, streak kazan ve BasedMem ekosisteminde ödüller topla!
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <DailyBased
            currentStreak={currentStreak}
            longestStreak={longestStreak}
            totalCheckIns={totalCheckIns}
            hasCheckedInToday={hasCheckedIn}
            onCheckIn={handleCheckIn}
            isLoading={isLoading}
          />

          <Card className="p-6 space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Son 7 Gün
            </h3>
            <div className="grid grid-cols-7 gap-2">
              {last7Days.map((day, i) => (
                <div key={i} className="text-center">
                  <p className="text-xs text-muted-foreground mb-2">
                    {day.date.toLocaleDateString("tr-TR", { weekday: "short" })}
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
              Streak Avantajları
            </h3>
            <div className="space-y-3">
              {[
                { streak: "3 gün", benefit: "Early access to new tokens", icon: "🔓" },
                { streak: "7 gün", benefit: "Reduced trading fees", icon: "💰" },
                { streak: "14 gün", benefit: "VIP badge on profile", icon: "⭐" },
                { streak: "30 gün", benefit: "Exclusive airdrops", icon: "🎁" },
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
            <h3 className="font-bold text-lg">💎 Toplam Kazanç</h3>
            <div className="text-center py-4">
              <p className="text-5xl font-black font-mono text-primary mb-2">
                {totalCheckIns * 10 + Math.floor(currentStreak / 3) * 20}
              </p>
              <p className="text-sm text-muted-foreground">BMEM Tokens</p>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Check-in yapmaya devam et ve daha fazla kazan!
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
