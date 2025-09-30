import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavigationBar } from "@/components/NavigationBar";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import Home from "@/pages/Home";
import Browse from "@/pages/Browse";
import Create from "@/pages/Create";
import TokenDetail from "@/pages/TokenDetail";
import Portfolio from "@/pages/Portfolio";
import Alerts from "@/pages/Alerts";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/browse" component={Browse} />
      <Route path="/create" component={Create} />
      <Route path="/token/:id" component={TokenDetail} />
      <Route path="/portfolio" component={Portfolio} />
      <Route path="/alerts" component={Alerts} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const { toast } = useToast();

  const handleConnectWallet = () => {
    if (isWalletConnected) {
      setIsWalletConnected(false);
      setWalletAddress("");
      toast({
        title: "Wallet Disconnected",
        description: "Your wallet has been disconnected",
      });
    } else {
      const mockAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4";
      setIsWalletConnected(true);
      setWalletAddress(mockAddress);
      toast({
        title: "Wallet Connected! 🎉",
        description: "Successfully connected to your wallet",
      });
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <NavigationBar 
            onConnectWallet={handleConnectWallet}
            isWalletConnected={isWalletConnected}
            walletAddress={walletAddress}
          />
          <main className="pt-16">
            <Router />
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
