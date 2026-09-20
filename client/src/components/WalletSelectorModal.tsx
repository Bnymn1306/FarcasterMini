import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, Zap, Shield } from "lucide-react";
import { SiCoinbase } from "react-icons/si";
import { useWallet } from "@/contexts/WalletContext";
import { useToast } from "@/hooks/use-toast";

interface WalletSelectorModalProps {
  open: boolean;
  onClose: () => void;
}

export function WalletSelectorModal({ open, onClose }: WalletSelectorModalProps) {
  const { connectWallet, connectSmartWallet, injectedWallets } = useWallet();
  const { toast } = useToast();
  const [connecting, setConnecting] = useState<string | null>(null);

  const handleSmartWallet = async () => {
    setConnecting('smart');
    try {
      await connectSmartWallet();
      toast({ title: "Base Smart Wallet connected", description: "Passkey authentication active." });
      onClose();
    } catch (err: any) {
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    } finally {
      setConnecting(null);
    }
  };

  const handleBrowserWallet = async (providerUuid?: string) => {
    setConnecting(providerUuid || 'browser');
    try {
      await connectWallet(providerUuid);
      toast({ title: "Wallet connected" });
      onClose();
    } catch (err: any) {
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    } finally {
      setConnecting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="modal-wallet-selector">
        <DialogHeader>
          <DialogTitle className="text-lg">Connect Wallet</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-2">
          {/* Base Smart Wallet */}
          <button
            onClick={handleSmartWallet}
            disabled={!!connecting}
            data-testid="button-connect-smart-wallet"
            className="flex items-center gap-4 p-4 rounded-md border border-border bg-card hover-elevate active-elevate-2 text-left disabled:opacity-60 disabled:pointer-events-none transition-colors"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-md bg-blue-600 flex items-center justify-center">
              <SiCoinbase className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">Base Smart Wallet</span>
                <Badge variant="default" className="text-xs bg-blue-600 text-white">
                  <Zap className="h-2.5 w-2.5 mr-1" />
                  Gasless
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Passkey login — Face ID or fingerprint. No seed phrase.
              </p>
            </div>
            {connecting === 'smart' && (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
          </button>

          {injectedWallets.map(wallet => (
            <button
              key={wallet.uuid}
              onClick={() => handleBrowserWallet(wallet.uuid)}
              disabled={!!connecting}
              data-testid={`button-connect-wallet-${wallet.uuid}`}
              className="flex items-center gap-4 p-4 rounded-md border border-border bg-card hover-elevate active-elevate-2 text-left disabled:opacity-60 disabled:pointer-events-none transition-colors"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                {wallet.icon ? <img src={wallet.icon} alt="" className="h-7 w-7 rounded-md" /> : <Wallet className="h-5 w-5 text-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-sm">{wallet.name}</span>
                <p className="text-xs text-muted-foreground mt-0.5">Injected EVM wallet</p>
              </div>
              {connecting === wallet.uuid && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />}
            </button>
          ))}

          {injectedWallets.length === 0 && (
            <button
              onClick={() => handleBrowserWallet()}
              disabled={!!connecting}
              data-testid="button-connect-browser-wallet"
              className="flex items-center gap-4 p-4 rounded-md border border-border bg-card hover-elevate active-elevate-2 text-left disabled:opacity-60 disabled:pointer-events-none transition-colors"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-md bg-muted flex items-center justify-center"><Wallet className="h-5 w-5 text-foreground" /></div>
              <div className="flex-1 min-w-0"><span className="font-semibold text-sm">Browser Wallet</span><p className="text-xs text-muted-foreground mt-0.5">Connect an injected EVM wallet.</p></div>
              {connecting === 'browser' && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />}
            </button>
          )}

          {/* Info row */}
          <div className="flex items-start gap-2 px-1 pt-1">
            <Shield className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Base Smart Wallet uses ERC-4337 account abstraction. Base sponsors gas fees for eligible transactions.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
