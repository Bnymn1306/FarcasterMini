import { AlertsList } from "@/components/AlertsList";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { SiFarcaster } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TokenSearch, type SearchToken } from "@/components/TokenSearch";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Bell, Plus, TrendingUp, TrendingDown, ArrowUp, ArrowDown, X, Loader2, RefreshCw, CheckCircle } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AlertWithTokenInfo {
  id: string;
  userId: string;
  tokenId: string | null;
  targetPrice: string;
  condition: string;
  isActive: boolean;
  isTriggered: boolean;
  notifyViaFarcaster: boolean;
  triggeredAt: Date | null;
  createdAt: Date;
  externalTokenAddress?: string | null;
  externalTokenSymbol?: string | null;
  externalTokenName?: string | null;
  externalTokenLogoUrl?: string | null;
  displayName: string;
  displaySymbol: string;
  displayLogoUrl?: string | null;
  tokenAddress?: string | null;
  isExternal: boolean;
  token?: any;
}

export default function Alerts() {
  const { toast } = useToast();
  const { user, isFarcasterConnected, farcasterUsername: walletFarcasterUsername } = useWallet();
  const [selectedToken, setSelectedToken] = useState<SearchToken | null>(null);
  const [targetPrice, setTargetPrice] = useState("");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<'unknown' | 'ready' | 'not_ready'>('unknown');
  const [isSyncingNotifications, setIsSyncingNotifications] = useState(false);

  const userId = user?.id || null;
  const farcasterUsername = walletFarcasterUsername || user?.farcasterUsername || "";
  const isConnected = isFarcasterConnected;
  
  // Price cache for external tokens
  const [tokenPrices, setTokenPrices] = useState<Record<string, string>>({});

  const { data: alerts = [], isLoading: alertsLoading, refetch } = useQuery<AlertWithTokenInfo[]>({
    queryKey: [`/api/alerts?userId=${userId}`],
    enabled: !!userId,
  });
  
  // Fetch current prices for all external tokens in alerts
  useEffect(() => {
    const fetchPrices = async () => {
      if (!alerts.length) return;
      
      const externalAddresses = alerts
        .filter(a => a.externalTokenAddress)
        .map(a => a.externalTokenAddress!)
        .filter((addr, idx, arr) => arr.indexOf(addr) === idx); // unique
      
      if (!externalAddresses.length) return;
      
      const prices: Record<string, string> = {};
      
      for (const address of externalAddresses) {
        try {
          const response = await fetch(
            `https://api.dexscreener.com/latest/dex/tokens/${address}`
          );
          if (response.ok) {
            const data = await response.json();
            const pairs = data.pairs?.filter((p: any) => p.chainId === 'base') || [];
            if (pairs.length > 0) {
              const bestPair = pairs.reduce((best: any, curr: any) => {
                const bestLiq = parseFloat(best.liquidity?.usd || '0');
                const currLiq = parseFloat(curr.liquidity?.usd || '0');
                return currLiq > bestLiq ? curr : best;
              });
              prices[address] = bestPair.priceUsd || '0';
            }
          }
        } catch (err) {
          console.error(`Failed to fetch price for ${address}:`, err);
        }
      }
      
      setTokenPrices(prev => ({ ...prev, ...prices }));
    };
    
    fetchPrices();
    const interval = setInterval(fetchPrices, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [alerts]);

  const createAlertMutation = useMutation({
    mutationFn: async (alertData: any) => {
      const response = await apiRequest('POST', '/api/alerts', alertData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/alerts?userId=${userId}`] });
      toast({
        title: "Alert Created",
        description: `Price alert set for ${selectedToken?.symbol}`,
      });
      setSelectedToken(null);
      setTargetPrice("");
      setShowCreateForm(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create alert",
        variant: "destructive",
      });
    },
  });

  const deleteAlertMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/alerts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/alerts?userId=${userId}`] });
      toast({
        title: "Alert Deleted",
        description: "Price alert successfully removed",
      });
    },
  });

  const toggleAlertMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await apiRequest('PATCH', `/api/alerts/${id}`, { isActive });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/alerts?userId=${userId}`] });
      toast({
        title: data.isActive ? "Alert Enabled" : "Alert Disabled",
        description: data.isActive ? "Notifications turned back on" : "Notifications turned off",
      });
    },
  });


  const handleCreateAlert = () => {
    if (!userId) {
      toast({
        title: "Not Signed In",
        description: "Please connect your wallet to create price alerts",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectedToken || !targetPrice) {
      toast({
        title: "Missing Fields",
        description: "Please select a token and enter a target price",
        variant: "destructive",
      });
      return;
    }

    createAlertMutation.mutate({
      userId,
      externalTokenAddress: selectedToken.address,
      externalTokenSymbol: selectedToken.symbol,
      externalTokenName: selectedToken.name,
      externalTokenLogoUrl: selectedToken.logoUrl,
      targetPrice,
      condition,
      notifyViaFarcaster: isConnected,
    });
  };

  const handleToggleAlert = (id: string, isActive: boolean) => {
    toggleAlertMutation.mutate({ id, isActive });
  };

  const handleDeleteAlert = (id: string) => {
    deleteAlertMutation.mutate(id);
  };

  // Check notification status on mount
  const checkNotificationStatus = async () => {
    if (!userId) return;
    try {
      const response = await fetch(`/api/debug-notifications/${userId}`);
      if (response.ok) {
        const data = await response.json();
        setNotificationStatus(data.readyForNotifications ? 'ready' : 'not_ready');
      }
    } catch (err) {
      console.error("Failed to check notification status:", err);
    }
  };

  // Sync notifications by requesting notification details from Frame SDK
  const handleSyncNotifications = async () => {
    setIsSyncingNotifications(true);
    try {
      const { getSDK } = await import("@/lib/farcasterInit");
      const sdk = getSDK();
      
      console.log("🔄 Attempting to get notification token via SDK...");
      
      // Try multiple approaches to get notification token
      let token: string | null = null;
      let url: string | null = null;
      
      // Approach 1: Try addFrame() which prompts user to add mini app
      try {
        console.log("📱 Trying sdk.actions.addFrame()...");
        const addResult = await Promise.race([
          sdk.actions.addFrame(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("addFrame timeout")), 10000))
        ]) as any;
        
        console.log("📱 addFrame result:", JSON.stringify(addResult, null, 2));
        
        if (addResult?.notificationDetails?.token && addResult?.notificationDetails?.url) {
          token = addResult.notificationDetails.token;
          url = addResult.notificationDetails.url;
          console.log("✅ Got notification token from addFrame!");
        }
      } catch (addErr) {
        console.log("ℹ️ addFrame() failed or timed out:", addErr);
      }
      
      // Approach 2: Try getting from context
      if (!token) {
        try {
          console.log("📱 Trying sdk.context...");
          const context = await Promise.race([
            sdk.context,
            new Promise((_, reject) => setTimeout(() => reject(new Error("context timeout")), 8000))
          ]) as any;
          
          console.log("📱 Context result:", context ? "Available" : "Not available");
          
          if (context?.client?.notificationDetails?.token && context?.client?.notificationDetails?.url) {
            token = context.client.notificationDetails.token;
            url = context.client.notificationDetails.url;
            console.log("✅ Got notification token from context!");
          }
        } catch (ctxErr) {
          console.log("ℹ️ Context fetch failed:", ctxErr);
        }
      }
      
      // Approach 3: Check localStorage
      if (!token) {
        token = localStorage.getItem('basedmem_notification_token');
        url = localStorage.getItem('basedmem_notification_url');
        if (token && url) {
          console.log("✅ Found notification token in localStorage!");
        }
      }
      
      if (token && url) {
        // Save to database
        const response = await fetch(`/api/users/${userId}/farcaster`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            farcasterNotificationToken: token,
            farcasterNotificationUrl: url,
          }),
        });
        
        if (response.ok) {
          // Also save to localStorage as backup
          localStorage.setItem('basedmem_notification_token', token);
          localStorage.setItem('basedmem_notification_url', url);
          
          setNotificationStatus('ready');
          toast({
            title: "Notifications Enabled",
            description: "You will now receive push notifications for price alerts",
          });
          return;
        }
      }
      
      // Fallback: check if user has FID for Neynar-based notifications
      const checkResponse = await fetch(`/api/debug-notifications/${userId}`);
      if (checkResponse.ok) {
        const data = await checkResponse.json();
        if (data.farcasterFid) {
          setNotificationStatus('ready');
          toast({
            title: "FID Found",
            description: "Using Farcaster ID - but paid Neynar plan needed for notifications",
          });
          return;
        }
      }
      
      toast({
        title: "Enable in Warpcast",
        description: "Tap the menu (•••) at top right and turn on Notifications",
        variant: "destructive",
      });
    } catch (error) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed", 
        description: "Please try again or check Warpcast settings",
        variant: "destructive",
      });
    } finally {
      setIsSyncingNotifications(false);
    }
  };

  // Check notification status on mount
  useEffect(() => {
    checkNotificationStatus();
  }, [userId]);

  const formatPrice = (price: string | null) => {
    if (!price) return "$0.00";
    const num = parseFloat(price);
    if (num < 0.00001) return `$${num.toExponential(2)}`;
    if (num < 0.01) return `$${num.toFixed(6)}`;
    if (num < 1) return `$${num.toFixed(4)}`;
    return `$${num.toFixed(2)}`;
  };

  const mappedAlerts = alerts.map(alert => ({
    id: alert.id,
    userId: alert.userId,
    tokenId: alert.tokenId || null,
    targetPrice: alert.targetPrice,
    condition: alert.condition,
    isActive: alert.isActive,
    isTriggered: alert.isTriggered,
    notifyViaFarcaster: alert.notifyViaFarcaster,
    triggeredAt: alert.triggeredAt,
    createdAt: new Date(alert.createdAt),
    externalTokenAddress: alert.externalTokenAddress || null,
    externalTokenSymbol: alert.externalTokenSymbol || null,
    externalTokenName: alert.externalTokenName || null,
    externalTokenLogoUrl: alert.externalTokenLogoUrl || null,
    token: alert.token || {
      id: alert.externalTokenAddress || '',
      creatorId: '',
      name: alert.displayName,
      symbol: alert.displaySymbol,
      description: '',
      logoUrl: alert.displayLogoUrl,
      contractAddress: alert.tokenAddress || alert.externalTokenAddress,
      totalSupply: '0',
      currentPrice: alert.externalTokenAddress 
        ? (tokenPrices[alert.externalTokenAddress] || '0')
        : '0',
      marketCap: '0',
      volume24h: '0',
      priceChange24h: '0',
      holderCount: 0,
      twitterUrl: null,
      telegramUrl: null,
      websiteUrl: null,
      isVerified: false,
      createdAt: new Date(),
    },
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black mb-2">Price Alerts</h1>
          <p className="text-muted-foreground">
            Track any Base token and get notifications when prices hit your targets
          </p>
        </div>
        <div className="flex items-center gap-2">
          {userId && notificationStatus === 'not_ready' && (
            <Button
              variant="outline"
              onClick={handleSyncNotifications}
              disabled={isSyncingNotifications}
              className="gap-2"
              data-testid="button-sync-notifications"
            >
              {isSyncingNotifications ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Enable Notifications
            </Button>
          )}
          {userId && notificationStatus === 'ready' && (
            <Badge variant="secondary" className="gap-1 py-1.5">
              <CheckCircle className="h-3 w-3 text-chart-2" />
              Notifications On
            </Badge>
          )}
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="gap-2"
            data-testid="button-new-alert"
          >
            {showCreateForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showCreateForm ? "Cancel" : "New Alert"}
          </Button>
        </div>
      </div>

      {showCreateForm && (
        <Card className="p-6 mb-8">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Create Price Alert
          </h3>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-semibold">
                  Search Any Base Token
                </Label>
                <TokenSearch 
                  onSelectToken={(token) => setSelectedToken(token)}
                  placeholder="Search by name, symbol, or address..."
                />
              </div>

              {selectedToken && (
                <div className="p-4 bg-muted/50 rounded-lg flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {selectedToken.logoUrl ? (
                      <AvatarImage src={selectedToken.logoUrl} alt={selectedToken.name} />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                      {selectedToken.symbol?.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{selectedToken.name}</span>
                      <Badge variant="secondary">{selectedToken.symbol}</Badge>
                      <Badge variant="outline" className="text-xs">External</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <span>Current: {formatPrice(selectedToken.currentPrice)}</span>
                      {selectedToken.priceChange24h && (
                        <span className={`flex items-center gap-0.5 ${
                          parseFloat(selectedToken.priceChange24h) >= 0 ? 'text-chart-2' : 'text-destructive'
                        }`}>
                          {parseFloat(selectedToken.priceChange24h) >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {Math.abs(parseFloat(selectedToken.priceChange24h)).toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedToken(null)}
                    data-testid="button-clear-token"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-semibold">Condition</Label>
                  <Select value={condition} onValueChange={(v: "above" | "below") => setCondition(v)}>
                    <SelectTrigger data-testid="select-condition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="above">
                        <div className="flex items-center gap-2">
                          <ArrowUp className="h-4 w-4 text-chart-2" />
                          Price goes above
                        </div>
                      </SelectItem>
                      <SelectItem value="below">
                        <div className="flex items-center gap-2">
                          <ArrowDown className="h-4 w-4 text-destructive" />
                          Price goes below
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-semibold">Target Price (USD)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="0.00"
                    data-testid="input-target-price"
                  />
                </div>
              </div>

              <Button
                onClick={handleCreateAlert}
                disabled={!selectedToken || !targetPrice || createAlertMutation.isPending}
                className="w-full gap-2"
                data-testid="button-create-alert"
              >
                {createAlertMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
                Create Alert
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {alertsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : mappedAlerts.length === 0 ? (
            <Card className="p-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-bold text-lg mb-2">No Price Alerts Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first alert to get notified when a token hits your target price
              </p>
              <Button onClick={() => setShowCreateForm(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create First Alert
              </Button>
            </Card>
          ) : (
            <AlertsList 
              alerts={mappedAlerts}
              onToggleAlert={handleToggleAlert}
              onDeleteAlert={handleDeleteAlert}
            />
          )}
        </div>

        <div>
          <Card className="p-6 space-y-6 sticky top-24">
            <div className="space-y-2">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <SiFarcaster className="h-5 w-5 text-primary" />
                Farcaster Notifications
              </h3>
              <p className="text-sm text-muted-foreground">
                Your price alerts will be sent as casts to your Farcaster profile
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="farcaster-username" className="text-xs uppercase font-semibold">
                  Farcaster Username
                </Label>
                <Input
                  id="farcaster-username"
                  value={farcasterUsername || "Not connected"}
                  readOnly
                  placeholder="@yourusername"
                  className={!isConnected ? "opacity-50" : ""}
                  data-testid="input-farcaster-username"
                />
              </div>

              {!isConnected && (
                <p className="text-sm text-muted-foreground text-center">
                  Sign in with Farcaster to receive notifications
                </p>
              )}
            </div>

            {isConnected && (
              <div className="p-4 bg-chart-2/10 border border-chart-2/20 rounded-lg space-y-2">
                <p className="font-semibold text-sm text-chart-2">Connected</p>
                <p className="text-xs text-muted-foreground">
                  Alerts will be sent to @{farcasterUsername} profile
                </p>
              </div>
            )}

            <div className="pt-4 border-t border-border space-y-3">
              <h4 className="font-semibold text-sm">How It Works</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span>1.</span>
                  <span>Search for any token on Base network</span>
                </li>
                <li className="flex gap-2">
                  <span>2.</span>
                  <span>Set your target price and condition</span>
                </li>
                <li className="flex gap-2">
                  <span>3.</span>
                  <span>Get notified via Farcaster when triggered</span>
                </li>
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
