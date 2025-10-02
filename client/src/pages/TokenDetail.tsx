import { useRoute } from "wouter";
import { TradingInterface } from "@/components/TradingInterface";
import { PriceAlertDialog } from "@/components/PriceAlertDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Twitter, Send, Globe, Share2 } from "lucide-react";
import type { Token } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { SiFarcaster } from "react-icons/si";
import sdk from "@farcaster/frame-sdk";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/contexts/WalletContext";
import { useSendTransaction, useWaitForTransactionReceipt, useAccount, useWriteContract } from "wagmi";
import { parseEther } from "viem";
import { useEffect } from "react";
import { BONDING_CURVE_TOKEN_ABI } from "@/lib/contracts";

export default function TokenDetail() {
  const [, params] = useRoute("/token/:id");
  const { toast } = useToast();
  const [isTrading, setIsTrading] = useState(false);
  const [pendingPurchase, setPendingPurchase] = useState<{
    amount: string;
    tokenAmount: number;
    hash: `0x${string}`;
  } | null>(null);
  
  const [pendingSale, setPendingSale] = useState<{
    tokenAmount: number;
    hash: `0x${string}`;
  } | null>(null);
  const { walletBalance, walletAddress, isWalletConnected, sendETH, refreshBalance } = useWallet();
  
  const { sendTransactionAsync, data: txHash, isPending: isSendingTx } = useSendTransaction();
  const { writeContractAsync, data: contractTxHash, isPending: isWritingContract } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash || contractTxHash,
  });

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

  // Handle post-confirmation database updates
  useEffect(() => {
    const processPurchase = async () => {
      if (!isConfirmed || !pendingPurchase || !walletAddress || !token) return;

      try {
        const { amount, tokenAmount } = pendingPurchase;
        const gasFee = "0.00012";
        const { queryClient } = await import("@/lib/queryClient");

        // Ensure user exists
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

        // Record trade
        const tradeResponse = await fetch("/api/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            tokenId: token.id,
            type: "buy",
            amount: tokenAmount.toString(),
            price: token.currentPrice,
            totalValue: amount,
            gasFee,
          }),
        });

        if (!tradeResponse.ok) {
          throw new Error("Failed to record trade");
        }

        // Update holdings
        const holdingResponse = await fetch("/api/holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            tokenId: token.id,
            amount: tokenAmount.toString(),
            price: token.currentPrice,
          }),
        });

        if (!holdingResponse.ok) {
          throw new Error("Failed to update holdings");
        }

        await queryClient.invalidateQueries({ queryKey: ["/api/holdings", user.id] });
        await refreshBalance();

        toast({
          title: "Trade Executed! 🎉",
          description: `Successfully bought ${tokenAmount.toFixed(2)} ${token.symbol} for ${amount} ETH`,
        });

        // Clear pending purchase
        setPendingPurchase(null);
      } catch (error: any) {
        console.error("Post-confirmation error:", error);
        toast({
          title: "Database Update Failed",
          description: "Transaction confirmed but failed to update records. Please contact support.",
          variant: "destructive",
        });
        setPendingPurchase(null);
      }
    };

    processPurchase();
  }, [isConfirmed, pendingPurchase, walletAddress, token, toast, refreshBalance]);

  // Handle post-confirmation database updates for SELL
  useEffect(() => {
    const processSale = async () => {
      if (!isConfirmed || !pendingSale || !walletAddress || !token || !userData) return;

      try {
        const { tokenAmount } = pendingSale;
        const ethValue = tokenAmount * parseFloat(token.currentPrice);
        const gasFee = "0.00012";
        const { queryClient } = await import("@/lib/queryClient");

        // Record trade
        await fetch("/api/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: userData.id,
            tokenId: token.id,
            type: "sell",
            amount: tokenAmount.toString(),
            price: token.currentPrice,
            totalValue: ethValue.toString(),
            gasFee,
          }),
        });

        // Update holdings (reduce or delete)
        const currentHolding = userHolding;
        if (currentHolding) {
          const newAmount = parseFloat(currentHolding.amount) - tokenAmount;
          
          if (newAmount <= 0.001) {
            // Delete holding if sold all
            await fetch(`/api/holdings/${currentHolding.id}`, {
              method: "DELETE",
            });
          } else {
            // Update holding amount
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
          description: `Successfully sold ${tokenAmount.toFixed(2)} ${token.symbol} for ${ethValue.toFixed(4)} ETH`,
        });

        setPendingSale(null);
      } catch (error: any) {
        console.error("Post-sale confirmation error:", error);
        toast({
          title: "Database Update Failed",
          description: "Transaction confirmed but failed to update records. Please contact support.",
          variant: "destructive",
        });
        setPendingSale(null);
      }
    };

    processSale();
  }, [isConfirmed, pendingSale, walletAddress, token, userData, userHolding, toast, refreshBalance, params?.id]);

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

  const handleBuy = async (amount: string) => {
    try {
      if (!isWalletConnected || !walletAddress) {
        toast({
          title: "Wallet Not Connected",
          description: "Please connect your wallet first",
          variant: "destructive",
        });
        return;
      }

      if (!token || parseFloat(token.currentPrice) === 0) {
        toast({
          title: "Invalid Price",
          description: "Token price is not set yet. Please try again later.",
          variant: "destructive",
        });
        return;
      }

      const ethAmount = parseFloat(amount);
      if (isNaN(ethAmount) || ethAmount <= 0) {
        toast({
          title: "Invalid Amount",
          description: "Please enter a valid amount",
          variant: "destructive",
        });
        return;
      }

      const tokenAmount = ethAmount / parseFloat(token.currentPrice);
      
      toast({
        title: "Confirm Transaction",
        description: "Please approve the transaction in your wallet",
      });

      let hash: `0x${string}`;

      // Call BondingCurveToken.buy() on the token's contract
      if (!token.contractAddress) {
        throw new Error("Token has no contract address");
      }

      console.log("Calling BondingCurveToken.buy() on contract:", token.contractAddress);
      
      hash = await writeContractAsync({
        address: token.contractAddress as `0x${string}`,
        abi: BONDING_CURVE_TOKEN_ABI,
        functionName: 'buy',
        value: parseEther(amount),
      });
      
      // Store pending purchase details for useEffect to process after confirmation
      setPendingPurchase({
        amount,
        tokenAmount,
        hash,
      });
      
      toast({
        title: "Transaction Broadcasted! ⏳",
        description: "Waiting for blockchain confirmation...",
      });
    } catch (error: any) {
      console.error("Buy error:", error);
      toast({
        title: "Transaction Failed",
        description: error.message?.includes("rejected") || error.message?.includes("denied") 
          ? "Transaction rejected by user" 
          : "Failed to send transaction",
        variant: "destructive",
      });
    }
  };

  const handleSell = async (amount: string) => {
    setIsTrading(true);
    try {
      if (!isWalletConnected || !walletAddress) {
        throw new Error("Wallet not connected");
      }

      if (!userData?.id) {
        throw new Error("User not found");
      }

      const tokenAmount = parseFloat(amount);
      if (isNaN(tokenAmount) || tokenAmount <= 0) {
        throw new Error("Invalid amount");
      }

      const ethValue = tokenAmount * parseFloat(token.currentPrice);

      toast({
        title: "Confirm Transaction",
        description: "Please approve the transaction in your wallet",
      });

      // Call BondingCurveToken.sell() on the token's contract
      if (!token.contractAddress) {
        throw new Error("Token has no contract address");
      }

      console.log("Calling BondingCurveToken.sell() on contract:", token.contractAddress);
      
      const hash = await writeContractAsync({
        address: token.contractAddress as `0x${string}`,
        abi: BONDING_CURVE_TOKEN_ABI,
        functionName: 'sell',
        args: [BigInt(Math.floor(tokenAmount))],
      });

      // Store pending sale for useEffect to process after confirmation
      setPendingSale({
        tokenAmount,
        hash,
      });

      toast({
        title: "Transaction Broadcasted! ⏳",
        description: "Waiting for blockchain confirmation...",
      });
    } catch (error: any) {
      console.error("Sell error:", error);
      toast({
        title: "Transaction Failed",
        description: error.message?.includes("rejected") || error.message?.includes("denied") 
          ? "Transaction rejected by user" 
          : error.message || "Failed to execute trade",
        variant: "destructive",
      });
      setPendingSale(null);
    } finally {
      setIsTrading(false);
    }
  };

  const handleCreateAlert = (data: any) => {
    console.log('Creating alert:', data);
    toast({
      title: "Uyarı Oluşturuldu! 🔔",
      description: `${token.symbol} için fiyat uyarısı başarıyla ayarlandı. Farcaster profilinize bildirim gönderilecek.`,
    });
  };

  const shareToFarcaster = () => {
    const baseUrl = window.location.origin;
    const frameUrl = `${baseUrl}/frame/token/${token.id}`;
    const priceChange = parseFloat(token.priceChange24h);
    const text = `Check out ${token.name} ($${token.symbol}) on BasedMem!\n\nPrice: $${token.currentPrice}\nMarket Cap: $${(parseFloat(token.marketCap) / 1000).toFixed(0)}K\nPrice Change 24h: ${priceChange >= 0 ? '+' : ''}${token.priceChange24h}%\n\n#BasedMem #MemeCoins`;
    
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
              token={token}
              userBalance={walletBalance}
              userTokenBalance={userHolding?.amount || "0"}
              onBuy={handleBuy}
              onSell={handleSell}
              isLoading={isSendingTx || isConfirming}
            />
          </div>
        </div>

        {/* Token Details */}
        <div className="lg:col-span-2 space-y-4 lg:space-y-6">
          <Card className="p-4 lg:p-6">
            <div className="flex items-start justify-between gap-3 mb-4 lg:mb-6">
              <div className="flex items-center gap-3 lg:gap-4">
                <Avatar className="h-14 w-14 lg:h-20 lg:w-20 ring-2 lg:ring-4 ring-primary/20">
                  <AvatarImage src={token.logoUrl || undefined} alt={token.name} />
                  <AvatarFallback className="text-xl lg:text-2xl font-bold">
                    {token.symbol.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-xl lg:text-3xl font-black">{token.name}</h1>
                    {token.isVerified && (
                      <Badge className="bg-primary/20 text-primary text-xs">Verified</Badge>
                    )}
                  </div>
                  <p className="text-sm lg:text-lg text-muted-foreground uppercase">${token.symbol}</p>
                  
                  <div className="flex items-center gap-1 lg:gap-2 mt-2">
                    {token.twitterUrl && (
                      <a href={token.twitterUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-7 w-7 lg:h-8 lg:w-8" data-testid="button-twitter">
                          <Twitter className="h-3 w-3 lg:h-4 lg:w-4" />
                        </Button>
                      </a>
                    )}
                    {token.telegramUrl && (
                      <a href={token.telegramUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-7 w-7 lg:h-8 lg:w-8" data-testid="button-telegram">
                          <Send className="h-3 w-3 lg:h-4 lg:w-4" />
                        </Button>
                      </a>
                    )}
                    {token.websiteUrl && (
                      <a href={token.websiteUrl} target="_blank" rel="noopener noreferrer">
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
                    <PriceAlertDialog token={token} onCreateAlert={handleCreateAlert} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 lg:gap-4 mb-4 lg:mb-6">
              <div className="p-2 lg:p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Price</p>
                <p className="font-mono font-semibold text-sm lg:text-lg">${token.currentPrice}</p>
              </div>
              <div className="p-2 lg:p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Market Cap</p>
                <p className="font-mono font-semibold text-sm lg:text-lg">${(parseFloat(token.marketCap) / 1000).toFixed(0)}K</p>
              </div>
              <div className="p-2 lg:p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Volume 24h</p>
                <p className="font-mono font-semibold text-sm lg:text-lg">${(parseFloat(token.volume24h) / 1000).toFixed(0)}K</p>
              </div>
              <div className="p-2 lg:p-4 bg-muted/30 rounded-lg">
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Holders</p>
                <p className="font-mono font-semibold text-sm lg:text-lg">{token.holderCount}</p>
              </div>
            </div>

            <div className="hidden lg:block">
              <h3 className="font-bold text-lg mb-2">About</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {token.description}
              </p>
            </div>

            <div className="pt-3 lg:pt-4 border-t border-border hidden lg:block">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Contract Address</span>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs bg-muted/30 px-2 py-1 rounded">
                    {token.contractAddress?.slice(0, 10)}...{token.contractAddress?.slice(-8)}
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
                    <span className="font-mono text-sm">{trade.amount} {token.symbol}</span>
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
