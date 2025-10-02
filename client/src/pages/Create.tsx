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

      // Send transaction via Farcaster wallet
      const tx = await factoryContract.createToken(data.name, data.symbol);
      
      toast({
        title: "Transaction Submitted",
        description: "Waiting for blockchain confirmation...",
      });

      console.log("Transaction hash:", tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);

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
      
      toast({
        title: "Deployment Failed",
        description: error?.message || "Failed to deploy token",
        variant: "destructive",
      });
    } finally {
      setIsDeploying(false);
    }
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
      
      <CreateTokenForm onSubmit={handleSubmit} disabled={isDeploying} data-testid="form-create-token" />
    </div>
  );
}
