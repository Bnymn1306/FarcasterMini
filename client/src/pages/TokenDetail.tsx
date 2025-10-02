import { useRoute } from "wouter";
import { TradingInterface } from "@/components/TradingInterface";
import { PriceAlertDialog } from "@/components/PriceAlertDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Twitter, Send, Globe } from "lucide-react";
import type { Token } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { SiFarcaster } from "react-icons/si";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/contexts/WalletContext";
import { BONDING_CURVE_TOKEN_ABI } from "@/lib/contracts";
import { Contract, parseEther, formatEther, parseUnits } from "ethers";
import { queryClient } from "@/lib/queryClient";

export default function TokenDetail() {
  const [, params] = useRoute("/token/:id");
  const { toast } = useToast();
  const [isTrading, setIsTrading] = useState(false);
  const { walletBalance, walletAddress, isWalletConnected, refreshBalance, getProvider } = useWallet();

  const { data: token, isLoading, isError } = useQuery<Token>({
    queryKey: ["/api/tokens", params?.id],
    queryFn: async () => {
      if (!params?.id) throw new Error("Token ID is required");
      const response = await fetch(`/api/tokens/${params.id}`);
      if (!response.ok) throw new Error("Failed to fetch token");
      return response.json();
    },
    enabled: !!params?.id,
  });

  const { data: userData } = useQuery({
    queryKey: ["/api/users", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      const response = await fetch(`/api/users?walletAddress=${walletAddress}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!walletAddress && isWalletConnected,
  });

  const { data: userHolding } = useQuery({
    queryKey: ["/api/user-token-holding", userData?.id, params?.id],
    queryFn: async () => {
      if (!userData?.id || !params?.id) return null;
      const response = await fetch(`/api/holdings/${userData.id}`);
      if (!response.ok) return null;
      const holdings = await response.json();
      return holdings.find((h: any) => h.tokenId === params.id);
    },
    enabled: !!userData?.id && !!params?.id,
  });

  const { data: contractStats } = useQuery({
    queryKey: ["/api/contract-stats", token?.contractAddress],
    queryFn: async () => {
      if (!token?.contractAddress) return null;
      
      try {
        const { JsonRpcProvider } = await import("ethers");
        const publicProvider = new JsonRpcProvider("https://mainnet.base.org");

        const contract = new Contract(token.contractAddress, BONDING_CURVE_TOKEN_ABI, publicProvider);
        const stats = await contract.getStats();
        
        return {
          price: formatEther(stats.price),
          reserve: formatEther(stats.reserve),
          circulating: stats.circulating.toString(),
          isGraduated: stats.isGraduated,
        };
      } catch (error) {
        console.error("Error fetching contract stats:", error);
        return null;
      }
    },
    enabled: !!token?.contractAddress,
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground" data-testid="text-loading">Loading token details...</p>
        </div>
      </div>
    );
  }

  if (isError || !token) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-center py-20">
          <p className="text-destructive" data-testid="text-error">Token not found</p>
        </div>
      </div>
    );
  }

  const enhancedToken = {
    ...token,
    currentPrice: contractStats?.price || token.currentPrice || "0",
  };

  const handleBuy = async (amount: string) => {
    setIsTrading(true);
    try {
      if (!isWalletConnected || !walletAddress) {
        toast({
          title: "Wallet Not Connected",
          description: "Please connect your wallet first",
          variant: "destructive",
        });
        setIsTrading(false);
        return;
      }

      if (!enhancedToken.contractAddress) {
        throw new Error("Token has no contract address");
      }

      const ethAmount = parseFloat(amount);
      if (isNaN(ethAmount) || ethAmount <= 0) {
        toast({
          title: "Invalid Amount",
          description: "Please enter a valid amount",
          variant: "destructive",
        });
        setIsTrading(false);
        return;
      }

      const realPrice = parseFloat(enhancedToken.currentPrice);
      const estimatedTokenAmount = realPrice > 0 
        ? ethAmount / realPrice
        : 0;

      let provider = getProvider();
      if (!provider) {
        toast({
          title: "Connecting Wallet...",
          description: "Please wait, initializing wallet connection",
        });
        
        try {
          const { default: sdk } = await import("@farcaster/frame-sdk");
          const ethProvider = sdk?.wallet?.ethProvider;
          
          if (!ethProvider) {
            throw new Error("Please open this app in Farcaster to use wallet features");
          }
          
          const { BrowserProvider } = await import("ethers");
          provider = new BrowserProvider(ethProvider);
          
          toast({
            title: "Wallet Connected",
            description: "Please confirm the transaction in your wallet",
          });
        } catch (providerError: any) {
          throw new Error(providerError.message || "Failed to connect wallet. Please open this app in Farcaster.");
        }
      } else {
        toast({
          title: "Confirm Transaction",
          description: "Please approve the transaction in your wallet",
        });
      }

      const signer = await provider.getSigner();
      const contract = new Contract(enhancedToken.contractAddress!, BONDING_CURVE_TOKEN_ABI, signer);

      console.log("Calling BondingCurveToken.buy() on contract:", enhancedToken.contractAddress);
      
      const tx = await contract.buy({ 
        value: parseEther(amount),
        gasLimit: 300000
      });
      
      const txHash = tx.hash;
      console.log("Transaction submitted:", txHash);

      toast({
        title: "Transaction Submitted! 🚀",
        description: `Hash: ${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}`,
      });

      // Wait for transaction without using ethers .wait() (Farcaster doesn't support eth_getTransactionReceipt)
      // Poll manually using Base RPC
      const { JsonRpcProvider } = await import("ethers");
      const baseProvider = new JsonRpcProvider("https://mainnet.base.org");
      
      let receipt = null;
      let attempts = 0;
      while (!receipt && attempts < 30) {
        try {
          receipt = await baseProvider.getTransactionReceipt(txHash);
          if (receipt) break;
        } catch (e) {
          // Transaction not yet mined
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }

      if (!receipt) {
        toast({
          title: "Transaction Pending ⏳",
          description: "Check BaseScan for confirmation",
        });
        return;
      }

      console.log("Transaction confirmed:", receipt.hash);

      const gasFee = "0.00012";

      let userResponse = await fetch(`/api/users?walletAddress=${walletAddress}`);
      let user;

      if (!userResponse.ok) {
        const createUserResponse = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress }),
        });

        if (!createUserResponse.ok) {
          throw new Error("Failed to create user");
        }

        user = await createUserResponse.json();
        await queryClient.invalidateQueries({ queryKey: ["/api/users", walletAddress] });
      } else {
        user = await userResponse.json();
      }

      const tradeResponse = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          tokenId: enhancedToken.id,
          type: "buy",
          amount: estimatedTokenAmount.toString(),
          price: enhancedToken.currentPrice,
          totalValue: amount,
          gasFee,
        }),
      });

      if (!tradeResponse.ok) {
        throw new Error("Failed to record trade");
      }

      const holdingResponse = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          tokenId: enhancedToken.id,
          amount: estimatedTokenAmount.toString(),
          price: enhancedToken.currentPrice,
        }),
      });

      if (!holdingResponse.ok) {
        throw new Error("Failed to update holdings");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/holdings", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/user-token-holding", user.id, params?.id] });
      await refreshBalance();

      toast({
        title: "Trade Executed! 🎉",
        description: `Successfully bought ${estimatedTokenAmount.toFixed(2)} ${enhancedToken.symbol} for ${amount} ETH`,
      });
    } catch (error: any) {
      console.error("Buy error - full details:", {
        message: error.message,
        code: error.code,
        data: error.data,
        reason: error.reason,
        transaction: error.transaction,
        error: error,
      });
      
      let errorMessage = "Failed to send transaction";
      
      if (error.message?.includes("rejected") || error.message?.includes("denied") || error.code === "ACTION_REJECTED") {
        errorMessage = "Transaction rejected by user";
      } else if (error.reason) {
        errorMessage = error.reason;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Transaction Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTrading(false);
    }
  };

  const handleSell = async (amount: string) => {
    setIsTrading(true);
    try {
      if (!isWalletConnected || !walletAddress) {
        toast({
          title: "Wallet Not Connected",
          description: "Please connect your wallet first",
          variant: "destructive",
        });
        setIsTrading(false);
        return;
      }

      if (!userData?.id) {
        throw new Error("User not found");
      }

      if (!enhancedToken.contractAddress) {
        throw new Error("Token has no contract address");
      }

      // Validate amount is a valid number string
      const trimmedAmount = amount.trim();
      const tokenAmountNum = parseFloat(trimmedAmount);
      if (isNaN(tokenAmountNum) || tokenAmountNum <= 0) {
        toast({
          title: "Invalid Amount",
          description: "Please enter a valid amount",
          variant: "destructive",
        });
        setIsTrading(false);
        return;
      }

      const ethValue = tokenAmountNum * parseFloat(enhancedToken.currentPrice);

      let provider = getProvider();
      if (!provider) {
        toast({
          title: "Connecting Wallet...",
          description: "Please wait, initializing wallet connection",
        });
        
        try {
          const { default: sdk } = await import("@farcaster/frame-sdk");
          const ethProvider = sdk?.wallet?.ethProvider;
          
          if (!ethProvider) {
            throw new Error("Please open this app in Farcaster to use wallet features");
          }
          
          const { BrowserProvider } = await import("ethers");
          provider = new BrowserProvider(ethProvider);
          
          toast({
            title: "Wallet Connected",
            description: "Please confirm the transaction in your wallet",
          });
        } catch (providerError: any) {
          throw new Error(providerError.message || "Failed to connect wallet. Please open this app in Farcaster.");
        }
      } else {
        toast({
          title: "Confirm Transaction",
          description: "Please approve the transaction in your wallet",
        });
      }

      const signer = await provider.getSigner();
      const contract = new Contract(enhancedToken.contractAddress!, BONDING_CURVE_TOKEN_ABI, signer);

      console.log("Calling BondingCurveToken.sell() on contract:", enhancedToken.contractAddress);
      
      // Convert token amount to 18 decimals (e.g., 100 SLICE → 100 * 10^18)
      // Use trimmed string directly to avoid scientific notation issues
      const tokenAmountWei = parseUnits(trimmedAmount, 18);
      console.log("Selling token amount (wei):", tokenAmountWei.toString());
      
      const tx = await contract.sell(tokenAmountWei, {
        gasLimit: 300000
      });

      const txHash = tx.hash;
      console.log("Transaction submitted:", txHash);

      toast({
        title: "Transaction Submitted! 🚀",
        description: `Hash: ${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}`,
      });

      // Wait for transaction without using ethers .wait() (Farcaster doesn't support eth_getTransactionReceipt)
      // Poll manually using Base RPC
      const { JsonRpcProvider } = await import("ethers");
      const baseProvider = new JsonRpcProvider("https://mainnet.base.org");
      
      let receipt = null;
      let attempts = 0;
      while (!receipt && attempts < 30) {
        try {
          receipt = await baseProvider.getTransactionReceipt(txHash);
          if (receipt) break;
        } catch (e) {
          // Transaction not yet mined
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }

      if (!receipt) {
        toast({
          title: "Transaction Pending ⏳",
          description: "Check BaseScan for confirmation",
        });
        return;
      }

      console.log("Transaction confirmed:", receipt.hash);

      const gasFee = "0.00012";

      await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userData.id,
          tokenId: enhancedToken.id,
          type: "sell",
          amount: tokenAmountNum.toString(),
          price: enhancedToken.currentPrice,
          totalValue: ethValue.toString(),
          gasFee,
        }),
      });

      const currentHolding = userHolding;
      if (currentHolding) {
        const newAmount = parseFloat(currentHolding.amount) - tokenAmountNum;
        
        if (newAmount <= 0.001) {
          await fetch(`/api/holdings/${currentHolding.id}`, {
            method: "DELETE",
          });
        } else {
          await fetch(`/api/holdings/${currentHolding.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: newAmount.toString(),
            }),
          });
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/holdings", userData.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/user-token-holding", userData.id, params?.id] });
      await refreshBalance();

      toast({
        title: "Trade Executed! 💰",
        description: `Successfully sold ${tokenAmountNum.toFixed(2)} ${enhancedToken.symbol} for ${ethValue.toFixed(4)} ETH`,
      });
    } catch (error: any) {
      console.error("Sell error - full details:", {
        message: error.message,
        code: error.code,
        data: error.data,
        reason: error.reason,
        transaction: error.transaction,
        error: error,
      });
      
      let errorMessage = "Failed to execute trade";
      
      if (error.message?.includes("rejected") || error.message?.includes("denied") || error.code === "ACTION_REJECTED") {
        errorMessage = "Transaction rejected by user";
      } else if (error.reason) {
        errorMessage = error.reason;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Transaction Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTrading(false);
    }
  };

  const handleCreateAlert = (data: any) => {
    console.log('Creating alert:', data);
    toast({
      title: "Uyarı Oluşturuldu! 🔔",
      description: `${enhancedToken.symbol} için fiyat uyarısı başarıyla ayarlandı. Farcaster profilinize bildirim gönderilecek.`,
    });
  };

  const shareToFarcaster = () => {
    const baseUrl = window.location.origin;
    const frameUrl = `${baseUrl}/frame/token/${enhancedToken.id}`;
    const priceChange = parseFloat(enhancedToken.priceChange24h);
    const text = `Check out ${enhancedToken.name} ($${enhancedToken.symbol}) on BasedMem!\n\nPrice: $${enhancedToken.currentPrice}\nMarket Cap: $${(parseFloat(enhancedToken.marketCap) / 1000).toFixed(0)}K\nPrice Change 24h: ${priceChange >= 0 ? '+' : ''}${enhancedToken.priceChange24h}%\n\n#BasedMem #MemeCoins`;
    
    const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(frameUrl)}`;
    window.open(warpcastUrl, '_blank');
  };

  const recentTrades = [
    { type: 'buy', amount: '0.5', price: '0.0042', time: '2 min ago' },
    { type: 'sell', amount: '1.2', price: '0.0041', time: '5 min ago' },
    { type: 'buy', amount: '0.8', price: '0.0040', time: '12 min ago' },
    { type: 'buy', amount: '2.0', price: '0.0039', time: '18 min ago' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 lg:py-8">
      <div className="grid lg:grid-cols-3 gap-4 lg:gap-8">
        {/* Trading Interface - First on mobile, last on desktop */}
        <div className="order-first lg:order-last lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <TradingInterface 
              token={enhancedToken}
              userBalance={walletBalance}
              userTokenBalance={userHolding?.amount || "0"}
              onBuy={handleBuy}
              onSell={handleSell}
              isLoading={isTrading}
            />
          </div>
        </div>

        {/* Token Details */}
        <div className="lg:col-span-2 space-y-4 lg:space-y-6">
          <Card className="p-4 lg:p-6">
            <div className="flex items-start justify-between gap-3 mb-4 lg:mb-6">
              <div className="flex items-center gap-3 lg:gap-4">
                <Avatar className="h-14 w-14 lg:h-20 lg:w-20 ring-2 lg:ring-4 ring-primary/20">
                  <AvatarImage src={enhancedToken.logoUrl || undefined} alt={enhancedToken.name} />
                  <AvatarFallback className="text-xl lg:text-2xl font-bold">
                    {enhancedToken.symbol.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-xl lg:text-3xl font-black">{enhancedToken.name}</h1>
                    {enhancedToken.isVerified && (
                      <Badge className="bg-primary/20 text-primary text-xs">Verified</Badge>
                    )}
                  </div>
                  <p className="text-sm lg:text-lg text-muted-foreground uppercase">${enhancedToken.symbol}</p>
                  
                  <div className="flex items-center gap-1 lg:gap-2 mt-2">
                    {enhancedToken.twitterUrl && (
                      <a href={enhancedToken.twitterUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-7 w-7 lg:h-8 lg:w-8" data-testid="button-twitter">
                          <Twitter className="h-3 w-3 lg:h-4 lg:w-4" />
                        </Button>
                      </a>
                    )}
                    {enhancedToken.telegramUrl && (
                      <a href={enhancedToken.telegramUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-7 w-7 lg:h-8 lg:w-8" data-testid="button-telegram">
                          <Send className="h-3 w-3 lg:h-4 lg:w-4" />
                        </Button>
                      </a>
                    )}
                    {enhancedToken.websiteUrl && (
                      <a href={enhancedToken.websiteUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-7 w-7 lg:h-8 lg:w-8" data-testid="button-website">
                          <Globe className="h-3 w-3 lg:h-4 lg:w-4" />
                        </Button>
                      </a>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="gap-1 h-7 lg:h-8 px-2" 
                      onClick={shareToFarcaster}
                      data-testid="button-share-farcaster"
                    >
                      <SiFarcaster className="h-3 w-3 lg:h-4 lg:w-4" />
                      <span className="text-xs hidden lg:inline">Share</span>
                    </Button>
                    <PriceAlertDialog token={enhancedToken} onCreateAlert={handleCreateAlert} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 lg:gap-4 mb-4 lg:mb-6">
              <div className="p-2 lg:p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Price</p>
                <p className="font-mono font-semibold text-sm lg:text-lg">${enhancedToken.currentPrice}</p>
              </div>
              <div className="p-2 lg:p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Market Cap</p>
                <p className="font-mono font-semibold text-sm lg:text-lg">${(parseFloat(enhancedToken.marketCap) / 1000).toFixed(0)}K</p>
              </div>
              <div className="p-2 lg:p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Volume 24h</p>
                <p className="font-mono font-semibold text-sm lg:text-lg">${(parseFloat(enhancedToken.volume24h) / 1000).toFixed(0)}K</p>
              </div>
              <div className="p-2 lg:p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Holders</p>
                <p className="font-mono font-semibold text-sm lg:text-lg">{enhancedToken.holderCount}</p>
              </div>
            </div>

            <div className="hidden lg:block">
              <h3 className="font-bold text-lg mb-2">About</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {enhancedToken.description}
              </p>
            </div>

            <div className="pt-3 lg:pt-4 border-t border-border hidden lg:block">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Contract Address</span>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs bg-muted/30 px-2 py-1 rounded">
                    {enhancedToken.contractAddress?.slice(0, 10)}...{enhancedToken.contractAddress?.slice(-8)}
                  </code>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4 lg:p-6 hidden lg:block">
            <h3 className="font-bold text-lg mb-4">Recent Trades</h3>
            <div className="space-y-3">
              {recentTrades.map((trade, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={trade.type === 'buy' ? 'secondary' : 'destructive'}
                      className={trade.type === 'buy' ? 'bg-chart-2/20 text-chart-2' : ''}
                    >
                      {trade.type.toUpperCase()}
                    </Badge>
                    <span className="font-mono text-sm">{trade.amount} {enhancedToken.symbol}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm">${trade.price}</p>
                    <p className="text-xs text-muted-foreground">{trade.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
