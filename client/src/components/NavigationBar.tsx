import { Link, useLocation } from "wouter";
import { Wallet, ArrowLeftRight, Check, Cpu, ChartNoAxesCombined, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./ThemeToggle";
import { ChainSelector } from "./ChainSelector";
import { SolanaWalletSelector } from "./SolanaWalletSelector";
import { WalletSelectorModal } from "./WalletSelectorModal";
import { SiFarcaster, SiCoinbase, SiX } from "react-icons/si";
import { useSolanaWallet } from "@/contexts/SolanaWalletContext";
import { useChain } from "@/contexts/ChainContext";
import { useWallet } from "@/contexts/WalletContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";

interface NavigationBarProps {
  onConnectWallet?: () => void;
  isWalletConnected?: boolean;
  walletAddress?: string;
  onFarcasterLogin?: () => void;
  isFarcasterConnected?: boolean;
  farcasterUsername?: string;
}

export function NavigationBar({ 
  onConnectWallet,
  isWalletConnected = false,
  walletAddress,
  onFarcasterLogin,
  isFarcasterConnected = false,
  farcasterUsername
}: NavigationBarProps) {
  const [location] = useLocation();
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const { isBase, isSolana } = useChain();
  const { walletType } = useWallet();
  const { 
    isConnected: solanaConnected, 
    isConnecting: solanaConnecting,
    publicKey: solanaPublicKey,
    walletType: solanaWalletType,
    balance: solanaBalance,
    isInFarcasterFrame
  } = useSolanaWallet();

  const shortenAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <nav className="sticky top-0 z-50 w-full overflow-x-clip bg-surface/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-7xl mx-auto px-3 2xl:px-4 h-16 flex items-center justify-between gap-2 2xl:gap-4">
        <div className="flex min-w-0 items-center gap-4 2xl:gap-8">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home">
            <svg className="h-8 w-8" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8B5CF6"/>
                  <stop offset="50%" stopColor="#6366F1"/>
                  <stop offset="100%" stopColor="#06B6D4"/>
                </linearGradient>
              </defs>
              <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#logoGradient)"/>
              <text x="32" y="45" fontFamily="Arial, sans-serif" fontSize="36" fontWeight="900" fill="#FFFFFF" textAnchor="middle" dominantBaseline="middle">B</text>
            </svg>
            <span className="text-xl font-black bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              BasedMem
            </span>
          </Link>
          
           <div className="hidden 2xl:flex items-center gap-2">
            <Link href="/swap" data-testid="link-swap">
              <Button 
                variant={location === "/swap" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <ArrowLeftRight className="h-4 w-4" />
                Swap
              </Button>
            </Link>

            <Link href="/limit-orders" data-testid="link-limit-orders">
              <Button 
                variant={location === "/limit-orders" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <Timer className="h-4 w-4" />
                Limit Orders
              </Button>
            </Link>

            <Link href="/agent-hub" data-testid="link-agent-hub">
              <Button
                variant={location === "/agent-hub" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <Cpu className="h-4 w-4" />
                Agent Hub
              </Button>
            </Link>
            <Link href="/tokenized-stocks" data-testid="link-tokenized-stocks">
              <Button variant={location === "/tokenized-stocks" ? "secondary" : "ghost"} size="sm" className={`gap-2 font-bold ${location === "/tokenized-stocks" ? "border border-primary/30" : "border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"}`}>
                <ChartNoAxesCombined className="h-4 w-4" /> Stocks
                <span className="hidden lg:inline rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide">new</span>
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <ChainSelector />
          
          {/* Desktop: Show all buttons */}
          <div className="hidden sm:flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              asChild
              data-testid="link-twitter"
            >
              <a 
                href="https://x.com/BasedMem" 
                target="_blank" 
                rel="noopener noreferrer"
                aria-label="Follow us on X"
              >
                <SiX className="h-4 w-4" />
              </a>
            </Button>
            
            <ThemeToggle />
            
            <Button
              onClick={onFarcasterLogin}
              variant={isFarcasterConnected ? "secondary" : "outline"}
              size="sm"
              className="gap-2"
              data-testid="button-farcaster-login"
            >
              <SiFarcaster className="h-4 w-4" />
              {isFarcasterConnected && farcasterUsername 
                ? `@${farcasterUsername}`
                : "Sign in"
              }
            </Button>
            
            <Button
              onClick={isWalletConnected ? onConnectWallet : () => setWalletSelectorOpen(true)}
              variant={isWalletConnected ? (isBase ? "secondary" : "outline") : "default"}
              size="sm"
              className="gap-2"
              data-testid="button-connect-wallet"
            >
              {walletType === 'smart' ? (
                <SiCoinbase className="h-4 w-4 text-blue-400" />
              ) : (
                <Wallet className="h-4 w-4" />
              )}
              {isWalletConnected && walletAddress
                ? (
                  <>
                    {walletType === 'smart' && (
                      <span className="text-xs text-blue-400 mr-0.5">Smart</span>
                    )}
                    <span className="text-xs text-primary mr-1">ETH</span>
                    {shortenAddress(walletAddress)}
                  </>
                )
                : "Connect ETH"
              }
            </Button>
            <WalletSelectorModal
              open={walletSelectorOpen}
              onClose={() => setWalletSelectorOpen(false)}
            />

            {/* ✅ Solana Wallet - Auto-connects in Farcaster Frame */}
            {solanaConnected && solanaPublicKey ? (
              <Badge 
                variant={isSolana ? "default" : "outline"} 
                className={`text-xs py-1 ${isSolana ? 'bg-purple-600' : 'border-purple-500 text-purple-500'}`}
              >
                <span className="mr-1">SOL</span>
                {shortenAddress(solanaPublicKey)}
              </Badge>
            ) : isInFarcasterFrame ? (
              // ✅ In Farcaster Frame: Show connecting status, no manual button
              <Badge 
                variant="outline" 
                className="text-xs py-1 border-purple-500/50 text-purple-500 animate-pulse"
              >
                <Wallet className="h-3 w-3 mr-1" />
                {solanaConnecting ? "Connecting..." : "SOL Auto"}
              </Badge>
            ) : (
              // ✅ Browser mode: Show connect button
              <SolanaWalletSelector 
                trigger={
                  <Button
                    variant={isSolana ? "default" : "outline"}
                    size="sm"
                    className={`gap-2 ${isSolana ? 'bg-purple-600 hover:bg-purple-700' : 'border-purple-500/50 text-purple-500'}`}
                    data-testid="button-connect-solana-wallet"
                  >
                    <Wallet className="h-4 w-4" />
                    Connect SOL
                  </Button>
                }
              />
            )}
          </div>

          {/* Mobile: Compact dropdown menu */}
          <div className="sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 px-2" data-testid="button-wallet-menu">
                  <Wallet className="h-4 w-4" />
                  {(isWalletConnected || solanaConnected) && (
                    <span className="flex items-center gap-0.5">
                      {isWalletConnected && <Check className="h-3 w-3 text-blue-500" />}
                      {solanaConnected && <Check className="h-3 w-3 text-purple-500" />}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Wallets & Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                {/* Farcaster */}
                <DropdownMenuItem onClick={onFarcasterLogin} className="gap-2 cursor-pointer">
                  <SiFarcaster className="h-4 w-4" />
                  {isFarcasterConnected && farcasterUsername 
                    ? <span className="truncate">@{farcasterUsername}</span>
                    : "Sign in with Farcaster"
                  }
                  {isFarcasterConnected && <Check className="h-4 w-4 text-green-500 ml-auto" />}
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                {/* ETH Wallet */}
                <DropdownMenuItem onClick={onConnectWallet} className="gap-2 cursor-pointer">
                  <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                    <span className="text-[8px] text-white font-bold">E</span>
                  </div>
                  {isWalletConnected && walletAddress 
                    ? <span className="truncate">{shortenAddress(walletAddress)}</span>
                    : "Connect ETH Wallet"
                  }
                  {isWalletConnected && <Check className="h-4 w-4 text-green-500 ml-auto" />}
                </DropdownMenuItem>
                
                {/* SOL Wallet - Auto-connects in Farcaster Frame */}
                {solanaConnected && solanaPublicKey ? (
                  <DropdownMenuItem className="gap-2">
                    <div className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                      <span className="text-[8px] text-white font-bold">S</span>
                    </div>
                    <span className="truncate">{shortenAddress(solanaPublicKey)}</span>
                    <Check className="h-4 w-4 text-green-500 ml-auto" />
                  </DropdownMenuItem>
                ) : isInFarcasterFrame ? (
                  <DropdownMenuItem className="gap-2">
                    <div className="w-4 h-4 rounded-full bg-purple-500/50 flex items-center justify-center animate-pulse">
                      <span className="text-[8px] text-white font-bold">S</span>
                    </div>
                    <span className="text-muted-foreground">{solanaConnecting ? "Connecting..." : "Auto-connecting..."}</span>
                  </DropdownMenuItem>
                ) : (
                  <SolanaWalletSelector 
                    trigger={
                      <DropdownMenuItem className="gap-2 cursor-pointer">
                        <div className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                          <span className="text-[8px] text-white font-bold">S</span>
                        </div>
                        Connect SOL Wallet
                      </DropdownMenuItem>
                    }
                  />
                )}
                
                <DropdownMenuSeparator />
                
                {/* Theme & Social */}
                <DropdownMenuItem asChild>
                  <a 
                    href="https://x.com/BasedMem" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="gap-2 cursor-pointer"
                  >
                    <SiX className="h-4 w-4" />
                    Follow on X
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}
