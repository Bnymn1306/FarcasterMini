import { Link, useLocation } from "wouter";
import { Wallet, Rocket, Grid3x3, TrendingUp, Bell } from "lucide-react";
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
          <Link href="/">
            <a className="text-xl font-black bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent" data-testid="link-home">
              BasedMem
            </a>
          </Link>
          
          <div className="hidden md:flex items-center gap-2">
            <Link href="/browse">
              <a data-testid="link-browse">
                <Button 
                  variant={location === "/browse" ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <Grid3x3 className="h-4 w-4" />
                  Browse
                </Button>
              </a>
            </Link>
            
            <Link href="/create">
              <a data-testid="link-create">
                <Button 
                  variant={location === "/create" ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <Rocket className="h-4 w-4" />
                  Create
                </Button>
              </a>
            </Link>

            <Link href="/portfolio">
              <a data-testid="link-portfolio">
                <Button 
                  variant={location === "/portfolio" ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <TrendingUp className="h-4 w-4" />
                  Portfolio
                </Button>
              </a>
            </Link>

            <Link href="/alerts">
              <a data-testid="link-alerts">
                <Button 
                  variant={location === "/alerts" ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <Bell className="h-4 w-4" />
                  Uyarılar
                </Button>
              </a>
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
