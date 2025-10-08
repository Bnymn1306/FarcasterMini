import { CreateTokenForm } from "@/components/CreateTokenForm";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useWallet } from "@/contexts/WalletContext";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { FACTORY_CONTRACT_ADDRESS, TOKEN_FACTORY_ABI } from "@/lib/contracts";
import { useState } from "react";
import sdk from "@farcaster/frame-sdk";
import { Contract, Interface } from "ethers";
import { Button } from "@/components/ui/button";

export default function Create() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { walletAddress, getProvider } = useWallet();
  const [isDeploying, setIsDeploying] = useState(false);

  const createTokenMutation = useMutation({
    mutationFn: async (data: any) => {
      const tokenData: any = {
        name: data.name,
        symbol: data.symbol,
        description: data.description || null,
        logoUrl: data.logoUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${data.symbol.toLowerCase()}`,
        totalSupply: data.totalSupply,
        contractAddress: data.contractAddress || null,
        twitterUrl: data.twitterUrl || null,
        telegramUrl: data.telegramUrl || null,
        websiteUrl: data.websiteUrl || null,
        creatorWalletAddress: data.creatorWalletAddress || walletAddress || null,
      };

      const response = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tokenData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tokens"] });
    },
  });

  const handleSubmit = async (data: any) => {
    if (!walletAddress) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your Farcaster wallet to deploy a token",
        variant: "destructive",
      });
      return;
    }

    const provider = getProvider();
    if (!provider) {
      toast({
        title: "Provider Not Available",
        description: "Please ensure Farcaster wallet is connected",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsDeploying(true);
      console.log("Deploying token via TokenFactory (Farcaster wallet)...", data);

      const signer = await provider.getSigner();
      const factoryContract = new Contract(
        FACTORY_CONTRACT_ADDRESS,
        TOKEN_FACTORY_ABI,
        signer
      );

      toast({
        title: "Confirm in Wallet",
        description: "Please approve the transaction in your Farcaster wallet",
      });

      // Convert initial price from ETH to wei
      const { parseEther } = await import("ethers");
      const initialPriceWei = parseEther(data.initialPrice || "0.000001");

      // Send transaction via Farcaster wallet (manual gas limit for Farcaster compatibility)
      const tx = await factoryContract.createToken(
        data.name, 
        data.symbol, 
        initialPriceWei,
        {
          gasLimit: 5000000 // High limit for contract deployment
        }
      );
      
      const txHash = tx.hash;
      console.log("Transaction hash:", txHash);

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
          variant: "destructive",
        });
        setIsDeploying(false);
        return;
      }

      // Check if transaction succeeded or reverted
      if (receipt.status === 0) {
        toast({
          title: "Transaction Failed ❌",
          description: "The deployment was reverted. Check BaseScan for details.",
          variant: "destructive",
        });
        setIsDeploying(false);
        return;
      }

      console.log("Transaction confirmed successfully:", receipt);

      // Extract contract address from TokenCreated event
      const iface = new Interface(TOKEN_FACTORY_ABI);
      let contractAddress = "";

      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({
            topics: log.topics as string[],
            data: log.data
          });
          
          if (parsed && parsed.name === 'TokenCreated') {
            contractAddress = parsed.args.tokenAddress;
            console.log("Contract address from event:", contractAddress);
            break;
          }
        } catch (e) {
          // Not our event, skip
        }
      }

      if (!contractAddress) {
        throw new Error("Failed to extract contract address from transaction");
      }

      // Save to database with contract address
      const tokenDataWithContract = {
        ...data,
        contractAddress,
      };

      await createTokenMutation.mutateAsync(tokenDataWithContract);

      toast({
        title: "Token Deployed! 🚀",
        description: `${data.name} (${data.symbol}) deployed to Base blockchain!`,
      });

      // Open Warpcast compose
      const baseUrl = window.location.origin;
      const tokenUrl = `${baseUrl}/browse`;
      const castText = `🚀 Just deployed ${data.name} ($${data.symbol}) on Base!\n\n${data.description || 'A new meme token with bonding curve!'}\n\nTotal Supply: ${parseInt(data.totalSupply).toLocaleString()}\n\n#BasedMem #MemeCoins #Base`;
      const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(tokenUrl)}`;

      try {
        sdk.actions.openUrl(warpcastUrl);
      } catch (error) {
        console.log("SDK not available, opening in new tab");
        window.open(warpcastUrl, '_blank');
      }

      setTimeout(() => {
        setLocation('/browse');
      }, 2000);

    } catch (error: any) {
      console.error("Error creating token:", error);
      
      // Provide user-friendly error messages
      let errorTitle = "Deployment Failed";
      let errorDescription = "Failed to deploy token";
      
      const errorMsg = error?.message?.toLowerCase() || "";
      const errorCode = error?.code;
      
      if (errorCode === 4001 || errorMsg.includes("user rejected") || errorMsg.includes("user denied")) {
        errorTitle = "Transaction Cancelled";
        errorDescription = "You cancelled the transaction. No funds were spent.";
      } else if (errorMsg.includes("insufficient funds") || errorMsg.includes("insufficient balance")) {
        errorTitle = "Insufficient Funds";
        errorDescription = "You need more ETH in your wallet to cover gas fees. Please add ETH to your Farcaster wallet.";
      } else if (errorMsg.includes("gas") || errorMsg.includes("out of gas")) {
        errorTitle = "Gas Fee Error";
        errorDescription = "Transaction failed due to gas issues. Please try again with more ETH.";
      } else if (errorMsg.includes("network") || errorMsg.includes("connection")) {
        errorTitle = "Network Error";
        errorDescription = "Connection to Base network failed. Please check your internet and try again.";
      } else if (error?.message) {
        errorDescription = error.message.length > 100 
          ? error.message.substring(0, 100) + "..." 
          : error.message;
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive",
      });
    } finally {
      setIsDeploying(false);
    }
  };

  const handleQuickLaunch = async () => {
    const quickData = {
      name: `QuickMeme${Date.now().toString().slice(-4)}`,
      symbol: `QM${Date.now().toString().slice(-3)}`,
      description: "Quick launched meme token on Base!",
      totalSupply: "1000000",
      initialPrice: "0.000001",
      creatorWalletAddress: walletAddress
    };
    
    await handleSubmit(quickData);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black mb-2">Launch Your Meme Token</h1>
        <p className="text-muted-foreground">Create and deploy your token in under 60 seconds</p>
        {isDeploying && (
          <p className="text-sm text-primary mt-2 font-medium">
            ⏳ Deploying via Farcaster wallet...
          </p>
        )}
      </div>

      <div className="mb-6 flex justify-center">
        <Button
          onClick={handleQuickLaunch}
          disabled={isDeploying || !walletAddress}
          size="lg"
          className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700"
          data-testid="button-quick-launch"
        >
          ⚡ 5-Second Quick Launch
        </Button>
      </div>
      
      <CreateTokenForm onSubmit={handleSubmit} disabled={isDeploying} data-testid="form-create-token" />
    </div>
  );
}
