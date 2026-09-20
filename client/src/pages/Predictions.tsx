import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TrendingUp, Flame, Clock, Users, ExternalLink } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { Prediction, Bet } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { placeBet as placeBetOnChain, MIN_BET } from "@/lib/predictionMarketContract";

function safeParseFloat(value: any, defaultValue: number = 0): number {
  const parsed = parseFloat(value?.toString() || '0');
  return isFinite(parsed) ? parsed : defaultValue;
}

function formatTimeRemaining(deadline: string): string {
  const now = new Date();
  const end = new Date(deadline);
  const diff = end.getTime() - now.getTime();
  
  if (diff <= 0) return "Ended";
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }
  
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
}

export default function Predictions() {
  const { toast } = useToast();
  const { user, isUserReady, walletAddress, isWalletConnected, connectWallet, getProvider } = useWallet();
  const [castUrl, setCastUrl] = useState("");
  const [viralThreshold, setViralThreshold] = useState("100");
  const [deadlineHours, setDeadlineHours] = useState("24");
  const [selectedPrediction, setSelectedPrediction] = useState<Prediction | null>(null);
  const [betAmount, setBetAmount] = useState(MIN_BET);
  const [betOutcome, setBetOutcome] = useState<'for' | 'against'>('for');

  const { data: predictions = [], isLoading } = useQuery<Prediction[]>({
    queryKey: ["/api/predictions/active"],
  });

  const { data: userBets = [] } = useQuery<Bet[]>({
    queryKey: ["/api/bets/user", user?.id],
    enabled: !!user?.id && isUserReady,
  });

  const createPredictionMutation = useMutation({
    mutationFn: async (data: { castUrl: string; viralThreshold: number; deadlineHours: number; userId: string }) => {
      const response = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create prediction");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/predictions/active"] });
      setCastUrl("");
      setViralThreshold("100");
      setDeadlineHours("24");
      toast({
        title: "🎯 Prediction Created!",
        description: "Other users can now bet on this cast's viral potential",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create prediction",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const placeBetMutation = useMutation({
    mutationFn: async (data: { predictionId: string; marketId: number; userId: string; betAmount: string; predictedOutcome: 'for' | 'against' }) => {
      console.log("🎲 Starting bet placement:", data);
      
      // Step 1: Get provider - try context first, then Farcaster SDK
      let provider = getProvider();
      console.log("📡 Provider from context:", !!provider);
      
      if (!provider) {
        console.log("⚠️ No provider in context, attempting Farcaster SDK...");
        try {
          const { default: sdk } = await import("@farcaster/frame-sdk");
          const ethProvider = sdk?.wallet?.ethProvider;
          
          if (!ethProvider) {
            throw new Error("Please open this app in Farcaster to use wallet features");
          }
          
          const { BrowserProvider } = await import("ethers");
          provider = new BrowserProvider(ethProvider);
          console.log("✅ Provider created from Farcaster SDK");
        } catch (providerError: any) {
          console.error("Failed to get Farcaster provider:", providerError);
          throw new Error(providerError.message || "Failed to connect wallet. Please open this app in Farcaster.");
        }
      }

      // Check network - MUST be Base mainnet (8453)
      let network;
      try {
        network = await provider.getNetwork();
        console.log("🌐 Network:", network.chainId, network.name);
      } catch (err) {
        console.error("Failed to get network:", err);
        throw new Error("Failed to verify network. Please check your wallet connection.");
      }

      const BASE_CHAIN_ID = BigInt(8453);
      if (network.chainId !== BASE_CHAIN_ID) {
        throw new Error(
          `Wrong network! Please switch to Base mainnet in your wallet. ` +
          `Current network: ${network.name} (Chain ID: ${network.chainId})`
        );
      }

      // Step 2: Validate bet amount
      const betAmountNum = parseFloat(data.betAmount);
      const minBetNum = parseFloat(MIN_BET);
      console.log("💰 Bet amount:", betAmountNum, "ETH (min:", minBetNum, "ETH)");
      
      if (betAmountNum < minBetNum) {
        throw new Error(`Minimum bet is ${MIN_BET} ETH`);
      }

      // Step 3: Validate market ID exists
      if (!data.marketId || data.marketId <= 0) {
        throw new Error("This prediction doesn't have a blockchain market yet. Please try creating a new prediction.");
      }

      // Step 4: Place bet on blockchain (this will trigger wallet approval!)
      const marketId = data.marketId;
      const betFor = data.predictedOutcome === 'for';
      console.log("🔗 Calling blockchain - Market ID:", marketId, "Bet FOR:", betFor);
      
      const receipt = await placeBetOnChain(provider, marketId, betFor, data.betAmount);
      console.log("✅ Blockchain transaction confirmed:", receipt.hash);
      
      // Step 4: After blockchain confirmation, record in database
      const response = await fetch(`/api/predictions/${data.predictionId}/bet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.userId,
          betAmount: data.betAmount,
          predictedOutcome: data.predictedOutcome,
          txHash: receipt.hash,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("Blockchain bet placed but database recording failed:", error);
        // Blockchain succeeded but database failed - throw error with tx hash for manual resolution
        throw new Error(
          `Bet confirmed on blockchain (TX: ${receipt.hash}) but failed to record in database. ` +
          `Please contact support with your transaction hash: ${receipt.hash}`
        );
      }

      return { receipt, betAmount: data.betAmount, txHash: receipt.hash };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/predictions/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bets/user", user?.id] });
      setSelectedPrediction(null);
      setBetAmount(MIN_BET);
      toast({
        title: "✅ Bet Placed!",
        description: (
          <div className="space-y-1">
            <p>{result.betAmount} ETH bet confirmed on blockchain</p>
            <p className="text-xs text-muted-foreground">TX: {result.txHash?.slice(0, 10)}...{result.txHash?.slice(-8)}</p>
          </div>
        ),
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to place bet",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreatePrediction = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      toast({
        title: "Wallet Required",
        description: "Connect your wallet to create predictions",
        variant: "destructive",
      });
      return;
    }

    if (!castUrl || !viralThreshold || !deadlineHours) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    const parsedThreshold = parseInt(viralThreshold);
    const parsedDeadline = parseInt(deadlineHours);

    if (!isFinite(parsedThreshold) || parsedThreshold <= 0) {
      toast({
        title: "Invalid Threshold",
        description: "Viral threshold must be a positive number",
        variant: "destructive",
      });
      return;
    }

    if (!isFinite(parsedDeadline) || parsedDeadline <= 0 || parsedDeadline > 168) {
      toast({
        title: "Invalid Deadline",
        description: "Deadline must be between 1 and 168 hours",
        variant: "destructive",
      });
      return;
    }

    createPredictionMutation.mutate({
      castUrl,
      viralThreshold: parsedThreshold,
      deadlineHours: parsedDeadline,
      userId: user.id,
    });
  };

  const handlePlaceBet = async (prediction: Prediction, outcome: 'for' | 'against') => {
    if (!user?.id) {
      toast({
        title: "Wallet Required",
        description: "Connect your wallet to place bets",
        variant: "destructive",
      });
      return;
    }

    // Use betAmount from state, fallback to MIN_BET if empty/invalid
    const effectiveBetAmount = (betAmount && betAmount.trim() !== "") ? betAmount.trim() : MIN_BET;
    
    console.log("🎯 handlePlaceBet called with betAmount:", betAmount, "effective:", effectiveBetAmount);
    
    const betAmountNum = parseFloat(effectiveBetAmount);
    const minBetNum = parseFloat(MIN_BET);
    
    if (!isFinite(betAmountNum) || betAmountNum <= 0) {
      toast({
        title: "Invalid Bet Amount",
        description: "Please enter a valid number",
        variant: "destructive",
      });
      return;
    }

    if (betAmountNum < minBetNum) {
      toast({
        title: "Bet Too Small",
        description: `Minimum bet is ${MIN_BET} ETH`,
        variant: "destructive",
      });
      return;
    }

    // Validate prediction has a blockchain market ID
    if (!prediction.marketId || prediction.marketId <= 0) {
      toast({
        title: "Market Not Ready",
        description: "This prediction doesn't have a blockchain market yet. Try creating a new prediction.",
        variant: "destructive",
      });
      return;
    }

    placeBetMutation.mutate({
      predictionId: prediction.id,
      marketId: prediction.marketId,
      userId: user.id,
      betAmount: effectiveBetAmount,
      predictedOutcome: outcome,
    });
  };

  if (!isWalletConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center py-20">
          <Flame className="h-16 w-16 mb-4 text-primary" />
          <h2 className="text-2xl font-bold mb-2">Cast Futures</h2>
          <p className="text-muted-foreground mb-6">Connect your wallet to start predicting</p>
          <Button onClick={async () => {
            try {
              await connectWallet();
              toast({
                title: "Wallet Connected!",
                description: "Successfully connected to your wallet",
              });
            } catch (error: any) {
              toast({
                title: "Connection Failed",
                description: error.message || "Failed to connect wallet",
                variant: "destructive",
              });
            }
          }} data-testid="button-connect-wallet">
            Connect Wallet
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Flame className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-black">Cast Futures</h1>
        </div>
        <p className="text-muted-foreground">
          Bet on whether casts will go viral before tokenization
        </p>
      </div>

      {/* Create Prediction Form */}
      <Card className="p-6 mb-8" data-testid="card-create-prediction">
        <h2 className="text-xl font-bold mb-4">Create Prediction Market</h2>
        <form onSubmit={handleCreatePrediction} className="space-y-4">
          <div>
            <Label htmlFor="castUrl" data-testid="label-cast-url">
              Farcaster Cast URL
            </Label>
            <Input
              id="castUrl"
              data-testid="input-cast-url"
              type="text"
              placeholder="https://warpcast.com/username/0x..."
              value={castUrl}
              onChange={(e) => setCastUrl(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="viralThreshold" data-testid="label-viral-threshold">
                Viral Threshold (Engagement Growth)
              </Label>
              <Input
                id="viralThreshold"
                data-testid="input-viral-threshold"
                type="number"
                min="1"
                placeholder="100"
                value={viralThreshold}
                onChange={(e) => setViralThreshold(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="deadlineHours" data-testid="label-deadline-hours">
                Deadline (Hours)
              </Label>
              <Input
                id="deadlineHours"
                data-testid="input-deadline-hours"
                type="number"
                min="1"
                max="168"
                placeholder="24"
                value={deadlineHours}
                onChange={(e) => setDeadlineHours(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <Button
            type="submit"
            data-testid="button-create-prediction"
            disabled={createPredictionMutation.isPending}
            className="w-full"
          >
            {createPredictionMutation.isPending ? "Creating..." : "Create Prediction Market"}
          </Button>
        </form>
      </Card>

      {/* Active Predictions */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Active Predictions</h2>
        
        {isLoading ? (
          <Card className="p-6">
            <p className="text-muted-foreground">Loading predictions...</p>
          </Card>
        ) : predictions.length === 0 ? (
          <Card className="p-6">
            <p className="text-muted-foreground text-center py-8">
              No active predictions yet. Create the first one!
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {predictions.map((prediction) => {
              const totalPool = safeParseFloat(prediction.totalPool);
              const forBets = safeParseFloat(prediction.totalBetsFor);
              const againstBets = safeParseFloat(prediction.totalBetsAgainst);
              const forPercentage = totalPool > 0 ? (forBets / totalPool) * 100 : 50;
              const againstPercentage = totalPool > 0 ? (againstBets / totalPool) * 100 : 50;

              return (
                <Card key={prediction.id} className="p-6 hover-elevate" data-testid={`card-prediction-${prediction.id}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {prediction.castAuthorUsername && (
                          <Badge variant="outline" data-testid={`badge-author-${prediction.id}`}>
                            @{prediction.castAuthorUsername}
                          </Badge>
                        )}
                        <Badge variant="secondary" data-testid={`badge-threshold-${prediction.id}`}>
                          +{prediction.viralThreshold} engagement
                        </Badge>
                      </div>
                      
                      {prediction.castText && (
                        <p className="text-sm mb-3 line-clamp-2" data-testid={`text-cast-${prediction.id}`}>
                          "{prediction.castText}"
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1" data-testid={`time-remaining-${prediction.id}`}>
                          <Clock className="h-4 w-4" />
                          {formatTimeRemaining(prediction.deadline.toString())}
                        </span>
                        <span className="flex items-center gap-1" data-testid={`pool-size-${prediction.id}`}>
                          <TrendingUp className="h-4 w-4" />
                          {totalPool.toFixed(4)} ETH pool
                        </span>
                      </div>
                    </div>

                    {prediction.castUrl && (
                      <a
                        href={prediction.castUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                        data-testid={`link-cast-${prediction.id}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>

                  {/* Betting Odds */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-green-500 font-semibold" data-testid={`odds-for-${prediction.id}`}>
                        Will go viral: {forPercentage.toFixed(0)}%
                      </span>
                      <span className="text-red-500 font-semibold" data-testid={`odds-against-${prediction.id}`}>
                        Won't go viral: {againstPercentage.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                      <div 
                        className="bg-green-500"
                        style={{ width: `${forPercentage}%` }}
                        data-testid={`bar-for-${prediction.id}`}
                      />
                      <div 
                        className="bg-red-500"
                        style={{ width: `${againstPercentage}%` }}
                        data-testid={`bar-against-${prediction.id}`}
                      />
                    </div>
                  </div>

                  {/* Bet Buttons */}
                  {selectedPrediction?.id === prediction.id ? (
                    <div className="space-y-2">
                      <div className="flex-1">
                        <Input
                          type="number"
                          step="0.0001"
                          min={MIN_BET}
                          placeholder={MIN_BET}
                          value={betAmount || MIN_BET}
                          onChange={(e) => setBetAmount(e.target.value || MIN_BET)}
                          data-testid={`input-bet-amount-${prediction.id}`}
                        />
                        <p className="text-xs text-muted-foreground mt-1">Min: {MIN_BET} ETH</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handlePlaceBet(prediction, 'for')}
                          disabled={placeBetMutation.isPending}
                          variant="default"
                          className="flex-1"
                          data-testid={`button-bet-for-${prediction.id}`}
                        >
                          {placeBetMutation.isPending ? "Processing..." : "Bet FOR"}
                        </Button>
                        <Button
                          onClick={() => handlePlaceBet(prediction, 'against')}
                          disabled={placeBetMutation.isPending}
                          variant="destructive"
                          className="flex-1"
                          data-testid={`button-bet-against-${prediction.id}`}
                        >
                          {placeBetMutation.isPending ? "Processing..." : "Bet AGAINST"}
                        </Button>
                        <Button
                          onClick={() => setSelectedPrediction(null)}
                          variant="ghost"
                          disabled={placeBetMutation.isPending}
                          data-testid={`button-cancel-bet-${prediction.id}`}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => {
                        setSelectedPrediction(prediction);
                        setBetAmount(MIN_BET); // Reset to default when opening bet form
                      }}
                      className="w-full"
                      data-testid={`button-show-bet-${prediction.id}`}
                    >
                      Place Bet
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* User's Bets */}
      {userBets.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold mb-4">Your Bets</h2>
          <Card className="p-6" data-testid="card-user-bets">
            <div className="space-y-3">
              {userBets.map((bet) => (
                <div
                  key={bet.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-md"
                  data-testid={`bet-item-${bet.id}`}
                >
                  <div>
                    <Badge variant={bet.predictedOutcome === 'for' ? 'default' : 'destructive'}>
                      {bet.predictedOutcome === 'for' ? 'WILL GO VIRAL' : "WON'T GO VIRAL"}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold" data-testid={`bet-amount-${bet.id}`}>
                      {parseFloat(bet.betAmount).toFixed(4)} ETH
                    </p>
                    {bet.payout && parseFloat(bet.payout) > 0 && (
                      <p className="text-sm text-green-500" data-testid={`bet-payout-${bet.id}`}>
                        Won: {parseFloat(bet.payout).toFixed(4)} ETH
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
