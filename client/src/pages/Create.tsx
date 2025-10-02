import { CreateTokenForm } from "@/components/CreateTokenForm";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useWallet } from "@/contexts/WalletContext";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { InsertToken } from "@shared/schema";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { FACTORY_CONTRACT_ADDRESS, TOKEN_FACTORY_ABI } from "@/lib/contracts";
import { parseEther, decodeEventLog } from "viem";
import { useEffect, useState } from "react";

export default function Create() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { walletAddress } = useWallet();
  const [pendingToken, setPendingToken] = useState<any>(null);

  const { data: hash, writeContract, isPending: isSendingTx, error: txError } = useWriteContract();
  
  const { data: receipt, isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (isConfirmed && pendingToken && hash && receipt) {
      console.log("Transaction confirmed, extracting contract address...");
      
      // Extract contract address from TokenCreated event logs
      let contractAddress = "";
      
      try {
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: TOKEN_FACTORY_ABI,
              data: log.data,
              topics: log.topics,
            });
            
            if (decoded.eventName === 'TokenCreated') {
              contractAddress = (decoded.args as any).tokenAddress;
              console.log("Contract address from event:", contractAddress);
              break;
            }
          } catch (e) {
            // Not our event, skip
            continue;
          }
        }
      } catch (error) {
        console.error("Error parsing event logs:", error);
      }
      
      // CRITICAL: Ensure contract address was extracted
      if (!contractAddress) {
        console.error("Failed to extract contract address from event logs");
        toast({
          title: "Deployment Error",
          description: "Could not extract contract address from transaction. Please try again.",
          variant: "destructive",
        });
        setPendingToken(null);
        return;
      }
      
      console.log("Saving token to database with contract address:", contractAddress);
      
      // Add contract address to token data
      const tokenDataWithContract = {
        ...pendingToken,
        contractAddress: contractAddress,
      };
      
      createTokenMutation.mutateAsync(tokenDataWithContract)
        .then(() => {
          toast({
            title: "Token Deployed! 🚀",
            description: `${pendingToken.name} (${pendingToken.symbol}) has been deployed to Base blockchain!`,
          });

          const baseUrl = window.location.origin;
          const tokenUrl = `${baseUrl}/browse`;
          const castText = `🚀 Just deployed ${pendingToken.name} ($${pendingToken.symbol}) on Base!\n\n${pendingToken.description || 'A new meme token with bonding curve!'}\n\nTotal Supply: ${parseInt(pendingToken.totalSupply).toLocaleString()}\n\n#BasedMem #MemeCoins #Base`;

          const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(tokenUrl)}`;

          try {
            import("@farcaster/frame-sdk").then((module) => {
              module.default.actions.openUrl(warpcastUrl);
            });
          } catch (error) {
            console.log("SDK not available, opening in new tab:", error);
            window.open(warpcastUrl, '_blank');
          }

          setTimeout(() => {
            setLocation('/browse');
          }, 3000);
        })
        .catch((error) => {
          console.error("Error saving token:", error);
          toast({
            title: "Database Error",
            description: "Token deployed but failed to save to database.",
            variant: "destructive",
          });
        });
      
      setPendingToken(null);
    }
  }, [isConfirmed, pendingToken, hash, receipt]);

  const createTokenMutation = useMutation({
    mutationFn: async (data: any) => {
      const tokenData: InsertToken = {
        creatorId: walletAddress || null,
        name: data.name,
        symbol: data.symbol,
        description: data.description || null,
        logoUrl: data.logoUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${data.symbol.toLowerCase()}`,
        totalSupply: data.totalSupply,
        twitterUrl: data.twitterUrl || null,
        telegramUrl: data.telegramUrl || null,
        websiteUrl: data.websiteUrl || null,
      };

      let response;
      try {
        response = await fetch("/api/tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tokenData),
        });
      } catch (networkError: any) {
        console.error("Network error:", networkError);
        throw new Error(`Network error: ${networkError.message || 'Unable to reach server'}`);
      }

      if (!response.ok) {
        let errorMessage = `Server error: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      try {
        return await response.json();
      } catch (parseError) {
        console.error("Failed to parse response:", parseError);
        throw new Error("Server returned invalid response");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tokens"] });
    },
  });

  const handleSubmit = async (data: any) => {
    if (!walletAddress) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to create a token.",
        variant: "destructive",
      });
      return;
    }

    if (!FACTORY_CONTRACT_ADDRESS || FACTORY_CONTRACT_ADDRESS === "") {
      console.warn("Factory contract not deployed, saving to database only...");
      
      try {
        const result = await createTokenMutation.mutateAsync(data);
        console.log("Token saved to database:", result);
        
        toast({
          title: "Token Created! ✅",
          description: `${data.name} (${data.symbol}) saved to database. Deploy smart contract to enable trading.`,
        });

        setTimeout(() => {
          setLocation('/browse');
        }, 2000);
      } catch (error: any) {
        console.error("Error saving token:", error);
        toast({
          title: "Save Failed",
          description: error?.message || "Failed to save token",
          variant: "destructive",
        });
      }
      return;
    }

    try {
      console.log("Deploying token contract...", data);
      
      setPendingToken(data);

      writeContract({
        address: FACTORY_CONTRACT_ADDRESS as `0x${string}`,
        abi: TOKEN_FACTORY_ABI,
        functionName: 'createToken',
        args: [
          data.name,
          data.symbol,
        ],
      });

      toast({
        title: "Transaction Sent",
        description: "Please confirm the transaction in your wallet...",
      });
    } catch (error: any) {
      console.error("Error deploying token:", error);
      
      let errorMessage = "Failed to deploy token contract";
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.toString) {
        errorMessage = error.toString();
      }
      
      toast({
        title: "Deployment Failed",
        description: errorMessage,
        variant: "destructive",
      });
      
      setPendingToken(null);
    }
  };

  const isProcessing = isSendingTx || isConfirming || createTokenMutation.isPending;

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black mb-2">Launch Your Meme Token</h1>
        <p className="text-muted-foreground">Create and deploy your token in under 60 seconds</p>
        {isProcessing && (
          <p className="text-sm text-primary mt-2 font-medium">
            {isSendingTx && "⏳ Sending transaction..."}
            {isConfirming && "⏳ Waiting for blockchain confirmation..."}
            {createTokenMutation.isPending && "💾 Saving to database..."}
          </p>
        )}
      </div>
      
      <CreateTokenForm onSubmit={handleSubmit} disabled={isProcessing} />
    </div>
  );
}
