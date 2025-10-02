import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { config } from "./lib/wagmi-config";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavigationBar } from "@/components/NavigationBar";
import { useEffect, lazy, Suspense } from "react";
import { useToast } from "@/hooks/use-toast";
import { WalletProvider, useWallet } from "@/contexts/WalletContext";
import Home from "@/pages/Home";

const Browse = lazy(() => import("@/pages/Browse"));
const Create = lazy(() => import("@/pages/Create"));
const TokenDetail = lazy(() => import("@/pages/TokenDetail"));
const Portfolio = lazy(() => import("@/pages/Portfolio"));
const Alerts = lazy(() => import("@/pages/Alerts"));
const DailyBasedPage = lazy(() => import("@/pages/DailyBasedPage"));
const HowToUse = lazy(() => import("@/pages/HowToUse"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Toaster = lazy(() => import("@/components/ui/toaster").then(m => ({ default: m.Toaster })));
const BottomNav = lazy(() => import("@/components/BottomNav").then(m => ({ default: m.BottomNav })));

function Router() {
  return (
    <Suspense fallback={null}>
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
    </Suspense>
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
    let mounted = true;
    let sdkInstance: any = null;
    
    const initFarcasterSDK = async () => {
      try {
        const sdk = (await import("@farcaster/frame-sdk")).default;
        if (!mounted) return;
        
        sdkInstance = sdk;
        
        // Call ready() immediately to close splash screen
        sdk.actions.ready();
        
        sdk.context.then(context => {
          if (mounted && context.user) {
            connectFarcaster(context.user.username || "farcaster_user", context.user.fid.toString());
          }
        }).catch(() => {});
        
        // Show add mini app prompt after a short delay
        setTimeout(() => {
          if (!mounted) return;
          const hasShownPrompt = localStorage.getItem('basedmem_add_miniapp_shown');
          if (!hasShownPrompt) {
            localStorage.setItem('basedmem_add_miniapp_shown', 'true');
            sdk.actions.addMiniApp().catch(() => {});
          }
        }, 500);
      } catch (error) {
        console.log("SDK not available:", error);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sdkInstance) {
        sdkInstance.actions.ready().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Start SDK init immediately
    initFarcasterSDK();
    
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connectFarcaster]);

  const handleConnectWallet = async () => {
    if (isWalletConnected) {
      disconnectWallet();
      toast({
        title: "Wallet Disconnected",
        description: "Your wallet has been disconnected",
      });
    } else {
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
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <TooltipProvider>
          <WalletProvider>
            <AppContent />
            <Suspense fallback={null}>
              <Toaster />
            </Suspense>
          </WalletProvider>
        </TooltipProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}

export default App;
