import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavigationBar } from "@/components/NavigationBar";
import { useEffect, lazy, Suspense, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { WalletProvider, useWallet } from "@/contexts/WalletContext";
import { ChainProvider } from "@/contexts/ChainContext";
import { SolanaWalletProvider } from "@/contexts/SolanaWalletContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Home from "@/pages/Home";
import AgentHub from "@/pages/AgentHub";
import { getSDK } from "@/lib/farcasterInit";
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/lib/wagmiConfig';
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";

const Swap = lazy(() => import("@/pages/Swap"));
const LimitOrders = lazy(() => import("@/pages/LimitOrders"));
const TokenizedStocks = lazy(() => import("@/pages/TokenizedStocks"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Toaster = lazy(() => import("@/components/ui/toaster").then(m => ({ default: m.Toaster })));
const BottomNav = lazy(() => import("@/components/BottomNav").then(m => ({ default: m.BottomNav })));

function Router() {
  return (
    <Suspense fallback={null}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/swap" component={Swap} />
        <Route path="/limit-orders" component={LimitOrders} />
        <Route path="/agent-hub" component={AgentHub} />
        <Route path="/tokenized-stocks" component={TokenizedStocks} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AppContent() {
  const {
    isWalletConnected,
    walletAddress,
    user,
    isFarcasterConnected,
    farcasterUsername,
    connectWallet,
    disconnectWallet,
    connectFarcaster,
    disconnectFarcaster,
  } = useWallet();
  const { toast } = useToast();
  const isSDKLoadedRef = useRef(false);
  const connectFarcasterRef = useRef(connectFarcaster);
  const connectWalletRef = useRef(connectWallet);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showAddMiniApp, setShowAddMiniApp] = useState(false);
  const [isInFarcaster, setIsInFarcaster] = useState(false);
  
  useEffect(() => {
    connectFarcasterRef.current = connectFarcaster;
    connectWalletRef.current = connectWallet;
  }, [connectFarcaster, connectWallet]);

  useEffect(() => {
    if (isSDKLoadedRef.current) return;
    isSDKLoadedRef.current = true;
    
    const sdk = getSDK();
    
    // 🔔 Listen for notification events from Frame SDK
    const handleNotificationsEnabled = async (data: { notificationDetails: { token: string; url: string } }) => {
      console.log("🔔 notificationsEnabled event received!", data);
      try {
        const storedUser = JSON.parse(localStorage.getItem('basedmem_user') || '{}');
        if (storedUser?.id && data.notificationDetails?.token && data.notificationDetails?.url) {
          const response = await fetch(`/api/users/${storedUser.id}/farcaster`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              farcasterNotificationToken: data.notificationDetails.token,
              farcasterNotificationUrl: data.notificationDetails.url,
            }),
          });
          if (response.ok) {
            console.log("✅ Notification token saved from notificationsEnabled event!");
          }
        }
      } catch (err) {
        console.warn("Failed to save notification token from event:", err);
      }
    };
    
    const handleNotificationsDisabled = () => {
      console.log("🔕 notificationsDisabled event received");
    };
    
    const handleFrameAdded = async (data: { notificationDetails?: { token: string; url: string } }) => {
      console.log("📱 frameAdded event received!", data);
      if (data.notificationDetails?.token && data.notificationDetails?.url) {
        try {
          const storedUser = JSON.parse(localStorage.getItem('basedmem_user') || '{}');
          if (storedUser?.id) {
            const response = await fetch(`/api/users/${storedUser.id}/farcaster`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                farcasterNotificationToken: data.notificationDetails.token,
                farcasterNotificationUrl: data.notificationDetails.url,
              }),
            });
            if (response.ok) {
              console.log("✅ Notification token saved from frameAdded event!");
            }
          }
        } catch (err) {
          console.warn("Failed to save notification token from frameAdded:", err);
        }
      }
    };
    
    // Add event listeners
    try {
      sdk.on('notificationsEnabled', handleNotificationsEnabled);
      sdk.on('notificationsDisabled', handleNotificationsDisabled);
      sdk.on('frameAdded', handleFrameAdded);
      console.log("🔔 Registered Frame SDK notification event listeners");
    } catch (err) {
      console.log("ℹ️ Could not register notification event listeners:", err);
    }
    
    const load = async () => {
      // ✅ CRITICAL FIX: Call ready() FIRST with timeout for desktop compatibility
      try {
        console.log("📱 Calling SDK ready()...");
        
        // ✅ FIX: ready() hangs on PC/desktop Farcaster - add 8s timeout for mobile
        const readyPromise = sdk.actions.ready();
        const timeoutPromise = new Promise((resolve) => {
          setTimeout(() => {
            console.log("⚠️ SDK ready() timeout - proceeding anyway");
            resolve('timeout');
          }, 8000); // Increased for slow mobile connections
        });
        
        const result = await Promise.race([readyPromise, timeoutPromise]);
        
        if (result === 'timeout') {
          console.log("🖥️ Desktop mode - SDK ready timed out");
        } else {
          console.log("✅ SDK ready - splash dismissed!");
        }
        
        // ✅ WAIT for wallet provider to initialize (critical for Frame!)
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log("🔍 Wallet provider check:", {
          hasWallet: !!sdk.wallet,
          hasEthProvider: !!sdk.wallet?.ethProvider,
          providerType: typeof sdk.wallet?.ethProvider
        });
      } catch (error) {
        console.log("ℹ️ SDK not available - browser mode");
      }
      
      // Then try to get Farcaster context - extended timeout for mobile
      let timeoutId: NodeJS.Timeout | null = null;
      try {
        console.log("🔍 Fetching SDK context...");
        const contextPromise = sdk.context;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Context timeout")), 12000); // Extended for mobile
        });
        
        const context = await Promise.race([contextPromise, timeoutPromise]) as any;
        
        if (timeoutId) clearTimeout(timeoutId);
        
        if (context?.user) {
          console.log("✅ Farcaster user context available");
          setIsInFarcaster(true);
          connectFarcasterRef.current(
            context.user.username || "farcaster_user",
            context.user.fid.toString()
          );
          
          // ✅ Capture notification details from context if available
          const notifDetails = context.client?.notificationDetails;
          console.log("🔔 Notification details check:", {
            hasToken: !!notifDetails?.token,
            hasUrl: !!notifDetails?.url,
            url: notifDetails?.url || 'none'
          });
          
          if (notifDetails?.token && notifDetails?.url) {
            console.log("🔔 Found notification details in context, saving with retries...");
            
            // Retry saving notification token with exponential backoff
            const saveNotificationToken = async (attempt: number = 1): Promise<void> => {
              const maxAttempts = 5;
              const delay = attempt * 2000; // 2s, 4s, 6s, 8s, 10s
              
              await new Promise(resolve => setTimeout(resolve, delay));
              
              try {
                const storedUser = JSON.parse(localStorage.getItem('basedmem_user') || '{}');
                console.log(`🔔 Attempt ${attempt}: Checking for user...`, storedUser?.id || 'not found');
                
                if (storedUser?.id) {
                  const response = await fetch(`/api/users/${storedUser.id}/farcaster`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      farcasterNotificationToken: notifDetails.token,
                      farcasterNotificationUrl: notifDetails.url,
                    }),
                  });
                  
                  if (response.ok) {
                    console.log("✅ Notification token saved from context!");
                    // Store in localStorage as backup
                    localStorage.setItem('basedmem_notification_token', notifDetails.token);
                    localStorage.setItem('basedmem_notification_url', notifDetails.url);
                    return;
                  } else {
                    console.warn(`❌ Failed to save token: ${response.status}`);
                  }
                }
                
                // Retry if user not found yet
                if (attempt < maxAttempts) {
                  console.log(`🔄 Retrying... (${attempt}/${maxAttempts})`);
                  return saveNotificationToken(attempt + 1);
                } else {
                  console.warn("❌ Max attempts reached, storing in localStorage for later");
                  localStorage.setItem('basedmem_notification_token', notifDetails.token);
                  localStorage.setItem('basedmem_notification_url', notifDetails.url);
                }
              } catch (err) {
                console.warn("Failed to save notification token:", err);
                if (attempt < maxAttempts) {
                  return saveNotificationToken(attempt + 1);
                }
              }
            };
            
            saveNotificationToken();
          } else {
            console.log("ℹ️ No notification details in context - trying addFrame()...");
            
            // ✅ Proactively try to get notification token via addFrame()
            try {
              const addResult = await sdk.actions.addFrame();
              console.log("📱 addFrame() result:", {
                hasToken: !!addResult?.notificationDetails?.token,
                hasUrl: !!addResult?.notificationDetails?.url,
              });
              
              if (addResult?.notificationDetails?.token && addResult?.notificationDetails?.url) {
                const storedUser = JSON.parse(localStorage.getItem('basedmem_user') || '{}');
                if (storedUser?.id) {
                  await fetch(`/api/users/${storedUser.id}/farcaster`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      farcasterNotificationToken: addResult.notificationDetails.token,
                      farcasterNotificationUrl: addResult.notificationDetails.url,
                    }),
                  });
                  console.log("✅ Notification token saved from addFrame()!");
                }
                // Also store in localStorage
                localStorage.setItem('basedmem_notification_token', addResult.notificationDetails.token);
                localStorage.setItem('basedmem_notification_url', addResult.notificationDetails.url);
              }
            } catch (addErr) {
              console.log("ℹ️ addFrame() not available or failed:", addErr);
            }
          }
          
          // ✅ Auto-connect wallet (with provider ready guarantee)
          if (sdk.wallet?.ethProvider) {
            try {
              // ✅ CRITICAL FIX: Use eth_requestAccounts for Farcaster SDK v2
              const accounts = await sdk.wallet.ethProvider.request({ method: "eth_requestAccounts" });
              if (accounts && accounts.length > 0) {
                console.log("✅ Auto-connecting Farcaster wallet:", accounts[0]);
                await connectWalletRef.current();
              } else {
                console.log("⚠️ No accounts returned from Frame wallet");
              }
            } catch (err) {
              console.warn("Could not auto-connect wallet:", err);
            }
          } else {
            console.log("⚠️ SDK wallet provider not available after ready()");
          }
          
          // ✅ Show "Add Mini App" prompt if not already added
          const hasAddedMiniApp = localStorage.getItem('basedmem_mini_app_added');
          if (!hasAddedMiniApp) {
            setTimeout(() => setShowAddMiniApp(true), 2000);
          }
        }
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        console.log("🌐 Browser mode - SDK context not available");
      }
      
      // ✅ Try to sync any localStorage notification tokens to database
      try {
        const savedToken = localStorage.getItem('basedmem_notification_token');
        const savedUrl = localStorage.getItem('basedmem_notification_url');
        const storedUser = JSON.parse(localStorage.getItem('basedmem_user') || '{}');
        
        if (savedToken && savedUrl && storedUser?.id) {
          console.log("🔄 Syncing saved notification token to database...");
          const response = await fetch(`/api/users/${storedUser.id}/farcaster`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              farcasterNotificationToken: savedToken,
              farcasterNotificationUrl: savedUrl,
            }),
          });
          if (response.ok) {
            console.log("✅ Notification token synced from localStorage!");
          }
        }
      } catch (syncErr) {
        console.log("ℹ️ Could not sync notification token:", syncErr);
      }
    };
    
    load()
      .catch(err => console.log("SDK init error:", err))
      .finally(() => {
        // Show content after SDK initialization attempt (success or fail)
        setTimeout(() => setIsInitializing(false), 500);
      });
    
    return () => {
      try {
        sdk.removeAllListeners();
      } catch {}
    };
  }, []);

  // Frontend keepalive - ping health endpoint every 2 minutes
  useEffect(() => {
    const keepaliveInterval = setInterval(async () => {
      try {
        await fetch('/api/health', { 
          method: 'GET',
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
      } catch (error) {
        // Ignore errors - this is just keepalive
      }
    }, 2 * 60 * 1000); // 2 minutes

    return () => clearInterval(keepaliveInterval);
  }, []);

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

  const handleFarcasterLogin = async () => {
    if (isFarcasterConnected) {
      disconnectFarcaster();
      toast({
        title: "Signed Out",
        description: "You have been signed out of Farcaster",
      });
    } else {
      // Get real Farcaster user data from SDK context
      try {
        const sdk = getSDK();
        const context = await sdk.context;
        
        if (context?.user) {
          const username = context.user.username || "farcaster_user";
          const fid = context.user.fid?.toString() || "";
          
          connectFarcaster(username, fid);
          toast({
            title: "Signed in with Farcaster!",
            description: `Welcome back, @${username}!`,
          });
        } else {
          // Fallback if not in Farcaster environment
          toast({
            title: "Farcaster Not Available",
            description: "Please open this app in Warpcast to sign in with Farcaster",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Failed to get Farcaster context:", error);
        toast({
          title: "Sign In Failed",
          description: "Could not connect to Farcaster. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const handleAddMiniApp = async () => {
    try {
      const sdk = getSDK();
      console.log("📱 Calling addFrame()...");
      const result = await sdk.actions.addFrame();
      console.log("📱 addFrame result:", JSON.stringify(result, null, 2));
      
      localStorage.setItem('basedmem_mini_app_added', 'true');
      setShowAddMiniApp(false);
      
      // Save notification token to database for push notifications
      console.log("🔍 Checking notification details:", {
        hasResult: !!result,
        hasNotificationDetails: !!result?.notificationDetails,
        userId: user?.id,
        token: result?.notificationDetails?.token?.substring(0, 20) + "...",
        url: result?.notificationDetails?.url,
      });
      
      if (result?.notificationDetails?.token && result?.notificationDetails?.url) {
        // Get user ID from context or localStorage
        const currentUserId = user?.id || JSON.parse(localStorage.getItem('basedmem_user') || '{}')?.id;
        
        if (currentUserId) {
          console.log("🔔 Saving notification token for user:", currentUserId);
          try {
            const response = await fetch(`/api/users/${currentUserId}/farcaster`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                farcasterNotificationToken: result.notificationDetails.token,
                farcasterNotificationUrl: result.notificationDetails.url,
              }),
            });
            
            if (response.ok) {
              console.log("✅ Notification token saved successfully!");
            } else {
              console.error("❌ Failed to save token:", await response.text());
            }
          } catch (err) {
            console.error("❌ Error saving notification token:", err);
          }
        } else {
          console.warn("⚠️ No user ID available to save notification token");
        }
      } else {
        console.warn("⚠️ No notification details in addFrame result");
      }
      
      toast({
        title: "Added to Mini Apps!",
        description: "You'll receive price alerts as notifications",
      });
    } catch (error: any) {
      console.error("Failed to add mini app:", error);
      // Still mark as shown so we don't keep prompting
      localStorage.setItem('basedmem_mini_app_added', 'true');
      setShowAddMiniApp(false);
    }
  };

  const dismissAddMiniApp = () => {
    localStorage.setItem('basedmem_mini_app_added', 'true');
    setShowAddMiniApp(false);
  };

  // Frame detection helper
  const isFrame = typeof window !== 'undefined' && (
    window.self !== window.top ||
    navigator.userAgent?.includes('Farcaster') ||
    navigator.userAgent?.includes('Warpcast') ||
    'farcasterFrame' in window
  );

  // Show loading state while initializing
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading BasedMem...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <NavigationBar 
        onConnectWallet={handleConnectWallet}
        isWalletConnected={isWalletConnected}
        walletAddress={walletAddress}
        onFarcasterLogin={handleFarcasterLogin}
        isFarcasterConnected={isFarcasterConnected}
        farcasterUsername={farcasterUsername}
      />
      
      {/* Add Mini App Banner - shown for new Farcaster users */}
      {showAddMiniApp && isInFarcaster && (
        <div className="fixed top-20 left-4 right-4 z-50 bg-gradient-to-r from-primary to-accent rounded-xl p-4 shadow-lg animate-in slide-in-from-top duration-300">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <p className="text-white font-semibold text-sm">Add BasedMem to your Mini Apps</p>
              <p className="text-white/80 text-xs">Quick access from your home screen</p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="secondary"
                onClick={handleAddMiniApp}
                className="gap-1"
                data-testid="button-add-mini-app"
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={dismissAddMiniApp}
                className="text-white hover:bg-white/20"
                data-testid="button-dismiss-mini-app"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      
      <main className="pb-20 2xl:pb-4">
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
    <ErrorBoundary>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ChainProvider>
              <WalletProvider>
                <SolanaWalletProvider>
                  <AppContent />
                  <Suspense fallback={null}>
                    <Toaster />
                  </Suspense>
                </SolanaWalletProvider>
              </WalletProvider>
            </ChainProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  );
}

export default App;
