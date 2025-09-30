import { Link, useLocation } from "wouter";
import { Wallet, Rocket, Grid3x3, TrendingUp, Bell, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";

interface NavigationBarProps {
  onConnectWallet?: () => void;
  isWalletConnected?: boolean;
  walletAddress?: string;
}

export function NavigationBar({ 
  onConnectWallet,
  isWalletConnected = false,
  walletAddress
}: NavigationBarProps) {
  const [location] = useLocation();

  const shortenAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <nav className="sticky top-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home">
            <img src="/logo.svg" alt="BasedMem Logo" className="h-8 w-8" />
            <span className="text-xl font-black bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              BasedMem
            </span>
          </Link>
          
          <div className="hidden md:flex items-center gap-2">
            <Link href="/browse" data-testid="link-browse">
              <Button 
                variant={location === "/browse" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <Grid3x3 className="h-4 w-4" />
                Browse
              </Button>
            </Link>
            
            <Link href="/create" data-testid="link-create">
              <Button 
                variant={location === "/create" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <Rocket className="h-4 w-4" />
                Create
              </Button>
            </Link>

            <Link href="/portfolio" data-testid="link-portfolio">
              <Button 
                variant={location === "/portfolio" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <TrendingUp className="h-4 w-4" />
                Portfolio
              </Button>
            </Link>

            <Link href="/alerts" data-testid="link-alerts">
              <Button 
                variant={location === "/alerts" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <Bell className="h-4 w-4" />
                Uyarılar
              </Button>
            </Link>

            <Link href="/daily" data-testid="link-daily">
              <Button 
                variant={location === "/daily" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <Flame className="h-4 w-4" />
                Daily
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          
          <Button
            onClick={onConnectWallet}
            variant={isWalletConnected ? "secondary" : "default"}
            size="sm"
            className="gap-2 rounded-full px-6"
            data-testid="button-connect-wallet"
          >
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">
              {isWalletConnected && walletAddress 
                ? shortenAddress(walletAddress)
                : "Connect Wallet"
              }
            </span>
          </Button>
        </div>
      </div>
    </nav>
  );
}
