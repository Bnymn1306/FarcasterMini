import { useState, useRef, useCallback, useEffect } from "react";
import { useSolanaWallet, type SolanaWalletType } from "@/contexts/SolanaWalletContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, ExternalLink, Loader2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SolanaWalletSelectorProps {
  trigger?: React.ReactNode;
  onConnect?: () => void;
}

export function SolanaWalletSelector({ trigger, onConnect }: SolanaWalletSelectorProps) {
  const { connect, isConnected, walletType, availableWallets, disconnect, isConnecting: contextConnecting } = useSolanaWallet();
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState<SolanaWalletType>(null);
  const { toast } = useToast();
  
  // ✅ FIX: Track if user explicitly wants to close
  const closeRequestedByUser = useRef(false);
  const dialogOpenTime = useRef(0);
  
  // ✅ Prevent any close within first 500ms (PC Farcaster iframe issue)
  const handleOpenChange = useCallback((newOpen: boolean) => {
    console.log("🔷 Dialog onOpenChange:", { newOpen, open, connecting, contextConnecting });
    
    if (newOpen) {
      dialogOpenTime.current = Date.now();
      closeRequestedByUser.current = false;
      setOpen(true);
    } else {
      // Block automatic closes within first 500ms
      const timeSinceOpen = Date.now() - dialogOpenTime.current;
      if (timeSinceOpen < 500) {
        console.log("🔷 Blocked premature dialog close (", timeSinceOpen, "ms)");
        return; // Block close
      }
      
      // Only close if user explicitly closed
      if (closeRequestedByUser.current || (!connecting && !contextConnecting)) {
        setOpen(false);
        closeRequestedByUser.current = false;
      }
    }
  }, [connecting, contextConnecting, open]);
  
  // ✅ Explicit close handler for user actions only
  const handleExplicitClose = useCallback(() => {
    closeRequestedByUser.current = true;
    setOpen(false);
  }, []);

  const handleConnect = async (walletId: SolanaWalletType) => {
    if (!walletId) return;
    
    setConnecting(walletId);
    try {
      await connect(walletId);
      toast({
        title: "Wallet Connected",
        description: `Connected to ${availableWallets.find(w => w.id === walletId)?.name || walletId}`,
      });
      setOpen(false);
      onConnect?.();
    } catch (error: any) {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect wallet",
        variant: "destructive",
      });
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    toast({
      title: "Wallet Disconnected",
      description: "Your Solana wallet has been disconnected",
    });
    setOpen(false);
  };

  const walletIcons: Record<string, string> = {
    phantom: "data:image/svg+xml,%3Csvg fill='none' height='128' viewBox='0 0 128 128' width='128' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='64' cy='64' fill='url(%23paint0_linear)' r='64'/%3E%3Cpath d='M110.584 64.9142H99.142C99.142 41.7651 80.173 23 56.7724 23C33.6612 23 14.8716 41.3057 14.4118 64.0583C13.936 87.5923 32.9372 107.378 56.4624 107.378H60.3882C79.7404 107.378 96.8421 94.1228 103.042 77.8171C103.877 75.5765 105.931 74.0032 108.318 74.0032H110.584C113.759 74.0032 116.4 71.3954 116.4 68.2621V70.6513C116.4 67.518 113.759 64.9142 110.584 64.9142Z' fill='url(%23paint1_linear)'/%3E%3Cpath d='M80.4789 58.2432C83.5469 58.2432 86.0342 55.7804 86.0342 52.7432C86.0342 49.706 83.5469 47.2432 80.4789 47.2432C77.411 47.2432 74.9237 49.706 74.9237 52.7432C74.9237 55.7804 77.411 58.2432 80.4789 58.2432Z' fill='%232D3748'/%3E%3Cpath d='M56.3211 58.2432C59.389 58.2432 61.8763 55.7804 61.8763 52.7432C61.8763 49.706 59.389 47.2432 56.3211 47.2432C53.2531 47.2432 50.7658 49.706 50.7658 52.7432C50.7658 55.7804 53.2531 58.2432 56.3211 58.2432Z' fill='%232D3748'/%3E%3Cdefs%3E%3ClinearGradient id='paint0_linear' gradientUnits='userSpaceOnUse' x1='64' x2='64' y1='0' y2='128'%3E%3Cstop stop-color='%23534BB1'/%3E%3Cstop offset='1' stop-color='%23551BF9'/%3E%3C/linearGradient%3E%3ClinearGradient id='paint1_linear' gradientUnits='userSpaceOnUse' x1='65.406' x2='65.406' y1='23' y2='107.378'%3E%3Cstop stop-color='white'/%3E%3Cstop offset='1' stop-color='%23E1E0E7'/%3E%3C/linearGradient%3E%3C/defs%3E%3C/svg%3E",
    okx: "https://cdn.simpleicons.org/okx",
    backpack: "data:image/svg+xml,%3Csvg width='128' height='128' viewBox='0 0 128 128' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='128' height='128' rx='24' fill='%23E33E3F'/%3E%3Cpath d='M96.7 55.6H86.9V44.4c0-6.2-5-11.2-11.2-11.2H52.3c-6.2 0-11.2 5-11.2 11.2v11.2H31.3c-3.6 0-6.5 2.9-6.5 6.5v33.6c0 3.6 2.9 6.5 6.5 6.5h65.4c3.6 0 6.5-2.9 6.5-6.5V62.1c0-3.6-2.9-6.5-6.5-6.5zM51.1 44.4c0-1.2 1-2.2 2.2-2.2h21.4c1.2 0 2.2 1 2.2 2.2v11.2H51.1V44.4zm25.8 36.4H51.1V70.1h25.8v10.7z' fill='white'/%3E%3C/svg%3E",
    solflare: "data:image/svg+xml,%3Csvg width='128' height='128' viewBox='0 0 128 128' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='128' height='128' rx='24' fill='%23FC8E00'/%3E%3Cpath d='M64 28L89.8 60.4L64 92.8L38.2 60.4L64 28Z' fill='white'/%3E%3Cpath d='M64 100L38.2 67.6L64 87.5L89.8 67.6L64 100Z' fill='white'/%3E%3C/svg%3E",
    coinbase: "https://cdn.simpleicons.org/coinbase",
    trust: "data:image/svg+xml,%3Csvg width='128' height='128' viewBox='0 0 128 128' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='128' height='128' rx='24' fill='%230500FF'/%3E%3Cpath d='M64 24C84 24 100 40 100 60V68C100 88 84 104 64 104C44 104 28 88 28 68V60C28 40 44 24 64 24ZM64 36C50.7 36 40 46.7 40 60V68C40 81.3 50.7 92 64 92C77.3 92 88 81.3 88 68V60C88 46.7 77.3 36 64 36Z' fill='white'/%3E%3C/svg%3E",
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2" data-testid="button-solana-wallet">
            <Wallet className="h-4 w-4" />
            {isConnected ? "Connected" : "Connect Solana"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent 
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          // Prevent closing on outside click in PC Farcaster iframe
          const timeSinceOpen = Date.now() - dialogOpenTime.current;
          if (timeSinceOpen < 1000 || connecting || contextConnecting) {
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          // Block all pointer events for first second
          const timeSinceOpen = Date.now() - dialogOpenTime.current;
          if (timeSinceOpen < 1000) {
            e.preventDefault();
          }
        }}
      >
        {/* ✅ Manual close button */}
        <button 
          onClick={handleExplicitClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 focus:outline-none"
          data-testid="button-close-wallet-dialog"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Solana Wallets
          </DialogTitle>
          <DialogDescription>
            Connect your preferred Solana wallet to swap and trade tokens.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {availableWallets.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => wallet.isInstalled ? handleConnect(wallet.id) : window.open(wallet.downloadUrl, "_blank")}
              disabled={connecting !== null}
              className="w-full flex items-center gap-3 p-4 rounded-lg border hover-elevate cursor-pointer disabled:opacity-50"
              data-testid={`wallet-option-${wallet.id}`}
            >
              <img 
                src={walletIcons[wallet.id || ""] || wallet.icon} 
                alt={wallet.name}
                className="h-8 w-8 rounded-lg object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://api.dicebear.com/7.x/identicon/svg?seed=" + wallet.id;
                }}
              />
              <div className="flex-1 text-left">
                <div className="font-semibold flex items-center gap-2">
                  {wallet.name}
                  {isConnected && walletType === wallet.id && (
                    <Check className="h-4 w-4 text-green-500" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {wallet.isInstalled ? "Detected" : "Not installed"}
                </div>
              </div>
              {connecting === wallet.id ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : wallet.isInstalled ? (
                <Badge variant="secondary" className="text-xs">
                  Connect
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs gap-1">
                  <ExternalLink className="h-3 w-3" />
                  Install
                </Badge>
              )}
            </button>
          ))}

          {availableWallets.filter(w => w.isInstalled).length === 0 && (
            <div className="text-center py-4">
              <p className="text-muted-foreground text-sm mb-3">
                No Solana wallets detected. Install one of the wallets above to continue.
              </p>
            </div>
          )}
        </div>

        {isConnected && (
          <div className="border-t pt-4">
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={handleDisconnect}
              data-testid="button-disconnect-solana"
            >
              Disconnect Wallet
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
