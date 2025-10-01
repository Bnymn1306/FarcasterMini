import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavigationBar } from "@/components/NavigationBar";
import { BottomNav } from "@/components/BottomNav";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { WalletProvider, useWallet } from "@/contexts/WalletContext";
import Home from "@/pages/Home";
import Browse from "@/pages/Browse";
import Create from "@/pages/Create";
import TokenDetail from "@/pages/TokenDetail";
import Portfolio from "@/pages/Portfolio";
import Alerts from "@/pages/Alerts";
import DailyBasedPage from "@/pages/DailyBasedPage";
import HowToUse from "@/pages/HowToUse";
import NotFound from "@/pages/not-found";
import sdk from "@farcaster/frame-sdk";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/browse" component={Browse} />
      <Route path="/create" component={Create} />
      <Route path="/token/:id" component={TokenDetail} />
      <Route path="/portfolio" component={Portfolio} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/daily" component={DailyBasedPage} />
      <Route path="/how-to-use" component={HowToUse} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const {
    isWalletConnected,
    walletAddress,
    isFarcasterConnected,
    farcasterUsername,
    connectWallet,
    disconnectWallet,
    connectFarcaster,
    disconnectFarcaster,
  } = useWallet();
  const { toast } = useToast();

  useEffect(() => {
    const initFarcasterSDK = async () => {
      try {
        const context = await sdk.context;
        console.log("Farcaster SDK initialized:", context);
        
        // Signal that the app is ready - this hides the splash screen
        await sdk.actions.ready();
        console.log("SDK ready called - splash screen hidden");
        
        // Auto-connect Farcaster if available
        if (context.user) {
          connectFarcaster(context.user.username || "farcaster_user", context.user.fid.toString());
        }
        
        // Show "Add Mini App" prompt on first launch
        const hasShownPrompt = localStorage.getItem('basedmem_add_miniapp_shown');
        if (!hasShownPrompt) {
          try {
            await sdk.actions.addMiniApp();
            localStorage.setItem('basedmem_add_miniapp_shown', 'true');
            console.log("Add Mini App prompt shown");
          } catch (error) {
            console.log("Add Mini App prompt dismissed or error:", error);
          }
        }
      } catch (error) {
        console.log("Farcaster SDK not available (running outside Farcaster):", error);
      }
    };

    initFarcasterSDK();
  }, []);

  const handleConnectWallet = () => {
    if (isWalletConnected) {
      disconnectWallet();
      toast({
        title: "Wallet Disconnected",
        description: "Your wallet has been disconnected",
      });
    } else {
      connectWallet();
      toast({
        title: "Wallet Connected!",
        description: "Successfully connected to your wallet",
      });
    }
  };

  const handleFarcasterLogin = () => {
    if (isFarcasterConnected) {
      disconnectFarcaster();
      toast({
        title: "Signed Out",
        description: "You have been signed out of Farcaster",
      });
    } else {
      connectFarcaster("basedmemer", "123456");
      toast({
        title: "Signed in with Farcaster!",
        description: `Welcome back, @basedmemer!`,
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar 
        onConnectWallet={handleConnectWallet}
        isWalletConnected={isWalletConnected}
        walletAddress={walletAddress}
        onFarcasterLogin={handleFarcasterLogin}
        isFarcasterConnected={isFarcasterConnected}
        farcasterUsername={farcasterUsername}
      />
      <main className="pt-16 pb-20 md:pb-4">
        <Router />
      </main>
      <BottomNav />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WalletProvider>
          <AppContent />
          <Toaster />
        </WalletProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
