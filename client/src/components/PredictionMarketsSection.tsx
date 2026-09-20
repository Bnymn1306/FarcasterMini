import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, Clock, Flame } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface Prediction {
  id: number;
  castUrl: string;
  castHash: string | null;
  castAuthorFid: number | null;
  viralThreshold: number;
  deadline: string;
  status: string;
  totalPool: number;
  winningOutcome: string | null;
  tokenId: string | null;
}

interface PredictionMarketsSectionProps {
  onViewAllClick?: () => void;
}

function safeParseFloat(value: any, defaultValue: number = 0): number {
  const parsed = parseFloat(value?.toString() || '0');
  return isFinite(parsed) ? parsed : defaultValue;
}

function formatTimeLeft(deadline: string): string {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const diffMs = deadlineDate.getTime() - now.getTime();
  
  if (diffMs <= 0) return "Expired";
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
}

export function PredictionMarketsSection({ onViewAllClick }: PredictionMarketsSectionProps) {
  const { data: predictions, isLoading } = useQuery<Prediction[]>({
    queryKey: ["/api/predictions/active"],
  });

  const featuredPredictions = predictions?.slice(0, 3) || [];

  return (
    <div className="relative py-20 px-4">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-block">
            <Badge className="mb-2 bg-accent/20 text-accent border-accent/30 px-4 py-1.5">
              <Target className="h-3 w-3 mr-1 inline" />
              New Feature
            </Badge>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-black">
            <span className="bg-gradient-to-r from-accent via-primary to-accent bg-clip-text text-transparent">
              Cast Futures
            </span>
          </h2>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Predict which Farcaster casts will go viral. Place your bet and win big if you're right!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 space-y-3 backdrop-blur-lg bg-surface/50 border-accent/20 hover-elevate">
            <div className="h-12 w-12 rounded-full bg-accent/20 flex items-center justify-center">
              <Target className="h-6 w-6 text-accent" />
            </div>
            <h3 className="font-bold text-lg">Predict Virality</h3>
            <p className="text-sm text-muted-foreground">
              Bet on whether a cast will reach viral thresholds before tokenization
            </p>
          </Card>

          <Card className="p-6 space-y-3 backdrop-blur-lg bg-surface/50 border-primary/20 hover-elevate">
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-bold text-lg">Win Rewards</h3>
            <p className="text-sm text-muted-foreground">
              Correct predictions share the pool proportionally - wrong bets forfeit stakes
            </p>
          </Card>

          <Card className="p-6 space-y-3 backdrop-blur-lg bg-surface/50 border-chart-2/20 hover-elevate">
            <div className="h-12 w-12 rounded-full bg-chart-2/20 flex items-center justify-center">
              <Clock className="h-6 w-6 text-chart-2" />
            </div>
            <h3 className="font-bold text-lg">Time Limited</h3>
            <p className="text-sm text-muted-foreground">
              Each prediction has a deadline - place your bet before time runs out
            </p>
          </Card>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading active predictions...</p>
          </div>
        ) : featuredPredictions.length > 0 ? (
          <div className="space-y-4">
            <h3 className="text-2xl font-bold text-center">Active Predictions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {featuredPredictions.map((prediction) => {
                const totalPool = safeParseFloat(prediction.totalPool);
                return (
                  <Card key={prediction.id} className="p-4 space-y-3 hover-elevate" data-testid={`card-prediction-${prediction.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">
                          {prediction.castUrl}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        <Flame className="h-3 w-3 mr-1" />
                        {prediction.viralThreshold}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{formatTimeLeft(prediction.deadline)}</span>
                      </div>
                      <div className="text-primary font-semibold">
                        {totalPool.toFixed(4)} ETH
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant="outline" className="text-xs" data-testid={`button-bet-for-${prediction.id}`}>
                        Bet For
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs" data-testid={`button-bet-against-${prediction.id}`}>
                        Bet Against
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <Flame className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-lg text-muted-foreground mb-2">No active predictions yet</p>
            <p className="text-sm text-muted-foreground">Be the first to create a prediction market!</p>
          </div>
        )}

        <div className="text-center pt-6">
          <Button
            onClick={onViewAllClick}
            size="lg"
            className="gap-2 rounded-full px-8"
            data-testid="button-view-all-predictions"
          >
            <Target className="h-5 w-5" />
            View All Predictions
          </Button>
        </div>
      </div>
    </div>
  );
}
