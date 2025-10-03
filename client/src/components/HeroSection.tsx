import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Rocket, TrendingUp, Users, Zap } from "lucide-react";

interface HeroSectionProps {
  onLaunchClick?: () => void;
  onBrowseClick?: () => void;
}

export function HeroSection({ onLaunchClick, onBrowseClick }: HeroSectionProps) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div 
        className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-accent/20"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, rgba(190, 85, 255, 0.1) 0%, transparent 50%),
                           radial-gradient(circle at 80% 80%, rgba(0, 255, 255, 0.1) 0%, transparent 50%)`
        }}
      />
      
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-20 text-center space-y-8">
        <div className="inline-block">
          <Badge className="mb-4 bg-primary/20 text-primary border-primary/30 px-4 py-1.5">
            <Zap className="h-3 w-3 mr-1 inline" />
            Powered by Base Blockchain
          </Badge>
        </div>

        <h1 className="text-5xl md:text-7xl font-black leading-tight">
          <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            Launch Your Meme Coin
          </span>
          <br />
          <span className="text-foreground">in 60 Seconds</span>
        </h1>

        <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
          Join the Base blockchain meme revolution. Create, trade, and grow your community with BasedMem.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
          <Button
            onClick={onLaunchClick}
            size="lg"
            className="px-8 py-6 text-lg gap-2 rounded-full"
            data-testid="button-launch-token"
          >
            <Rocket className="h-5 w-5" />
            Launch Token
          </Button>
          
          <Button
            onClick={onBrowseClick}
            variant="outline"
            size="lg"
            className="px-8 py-6 text-lg gap-2 rounded-full backdrop-blur-md bg-surface/30"
            data-testid="button-browse-tokens"
          >
            <TrendingUp className="h-5 w-5" />
            Browse Tokens
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 max-w-3xl mx-auto">
          <Card className="p-6 space-y-3 backdrop-blur-lg bg-surface/50 border-primary/20">
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
              <Rocket className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-bold text-lg">Instant Launch</h3>
            <p className="text-sm text-muted-foreground">
              Deploy your meme coin in under a minute. No coding required.
            </p>
          </Card>

          <Card className="p-6 space-y-3 backdrop-blur-lg bg-surface/50 border-accent/20">
            <div className="h-12 w-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
              <TrendingUp className="h-6 w-6 text-accent" />
            </div>
            <h3 className="font-bold text-lg">Trade Instantly</h3>
            <p className="text-sm text-muted-foreground">
              Buy and sell tokens with built-in trading interface.
            </p>
          </Card>

          <Card className="p-6 space-y-3 backdrop-blur-lg bg-surface/50 border-chart-2/20">
            <div className="h-12 w-12 rounded-full bg-chart-2/20 flex items-center justify-center mx-auto">
              <Users className="h-6 w-6 text-chart-2" />
            </div>
            <h3 className="font-bold text-lg">Grow Community</h3>
            <p className="text-sm text-muted-foreground">
              Connect with holders and build your meme empire.
            </p>
          </Card>
        </div>

        <div className="pt-8">
          <p className="text-sm text-muted-foreground mb-2">LIVE STATS</p>
          <div className="flex flex-wrap justify-center gap-8">
            <div>
              <p className="text-3xl font-black font-mono text-primary">1,337</p>
              <p className="text-sm text-muted-foreground">Tokens Launched</p>
            </div>
            <div>
              <p className="text-3xl font-black font-mono text-accent">$42M</p>
              <p className="text-sm text-muted-foreground">Total Volume</p>
            </div>
            <div>
              <p className="text-3xl font-black font-mono text-chart-2">69K</p>
              <p className="text-sm text-muted-foreground">Active Traders</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
