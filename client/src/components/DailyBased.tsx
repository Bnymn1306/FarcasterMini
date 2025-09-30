import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, CheckCircle2, Trophy, Zap } from "lucide-react";
import { SiEthereum } from "react-icons/si";

interface DailyBasedProps {
  currentStreak?: number;
  longestStreak?: number;
  totalCheckIns?: number;
  hasCheckedInToday?: boolean;
  onCheckIn?: () => void;
  isLoading?: boolean;
}

export function DailyBased({
  currentStreak = 0,
  longestStreak = 0,
  totalCheckIns = 0,
  hasCheckedInToday = false,
  onCheckIn,
  isLoading = false,
}: DailyBasedProps) {
  const [showGasFee] = useState(true);
  const gasFee = "0.00003";

  const streakRewards = [
    { day: 1, reward: "10 BMEM" },
    { day: 3, reward: "30 BMEM" },
    { day: 7, reward: "100 BMEM" },
    { day: 14, reward: "250 BMEM" },
    { day: 30, reward: "1000 BMEM" },
  ];

  const nextReward = streakRewards.find((r) => r.day > currentStreak);

  return (
    <Card className="p-6 space-y-6 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-black flex items-center gap-2">
            <Flame className="h-6 w-6 text-primary" />
            Daily Based
          </h3>
          <Badge className="bg-primary/20 text-primary border-primary/30">
            Base Network
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Check in günlük olarak gir, streak kazan, ödüller topla!
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-4 bg-background/50 rounded-lg">
          <div className="flex items-center justify-center mb-2">
            <Flame className="h-5 w-5 text-primary" />
          </div>
          <p className="text-3xl font-black font-mono text-primary">{currentStreak}</p>
          <p className="text-xs text-muted-foreground uppercase font-semibold">
            Güncel Streak
          </p>
        </div>

        <div className="text-center p-4 bg-background/50 rounded-lg">
          <div className="flex items-center justify-center mb-2">
            <Trophy className="h-5 w-5 text-accent" />
          </div>
          <p className="text-3xl font-black font-mono text-accent">{longestStreak}</p>
          <p className="text-xs text-muted-foreground uppercase font-semibold">
            En Uzun Streak
          </p>
        </div>

        <div className="text-center p-4 bg-background/50 rounded-lg">
          <div className="flex items-center justify-center mb-2">
            <CheckCircle2 className="h-5 w-5 text-chart-2" />
          </div>
          <p className="text-3xl font-black font-mono text-chart-2">{totalCheckIns}</p>
          <p className="text-xs text-muted-foreground uppercase font-semibold">
            Toplam Check-In
          </p>
        </div>
      </div>

      {nextReward && (
        <div className="p-4 bg-accent/10 border border-accent/20 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-accent" />
                Sonraki Ödül
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {nextReward.day - currentStreak} gün sonra
              </p>
            </div>
            <Badge className="bg-accent/20 text-accent border-accent/30 text-lg px-4 py-2">
              {nextReward.reward}
            </Badge>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Button
          onClick={onCheckIn}
          disabled={hasCheckedInToday || isLoading}
          className="w-full py-6 text-lg gap-2"
          data-testid="button-check-in"
        >
          {hasCheckedInToday ? (
            <>
              <CheckCircle2 className="h-5 w-5" />
              Bugün Check-In Yaptın!
            </>
          ) : (
            <>
              <Flame className="h-5 w-5" />
              {isLoading ? "İşleniyor..." : "Check-In Yap"}
            </>
          )}
        </Button>

        {showGasFee && !hasCheckedInToday && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <SiEthereum className="h-3 w-3" />
            <span>Base Network Gas Fee: {gasFee} ETH</span>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-border space-y-2">
        <p className="font-semibold text-sm">Streak Ödülleri</p>
        <div className="grid grid-cols-5 gap-2">
          {streakRewards.map((reward) => (
            <div
              key={reward.day}
              className={`text-center p-2 rounded-lg border ${
                currentStreak >= reward.day
                  ? "bg-chart-2/20 border-chart-2/30 text-chart-2"
                  : "bg-muted/30 border-border"
              }`}
            >
              <p className="text-xs font-bold">{reward.day}d</p>
              <p className="text-[10px] mt-1">{reward.reward.split(" ")[0]}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
