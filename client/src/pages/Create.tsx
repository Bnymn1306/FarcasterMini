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
import { Card } from "@/components/ui/card";
import { useChain } from "@/contexts/ChainContext";
import { Badge } from "@/components/ui/badge";
import { Info, ExternalLink, Rocket } from "lucide-react";

export default function Create() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { walletAddress, getProvider } = useWallet();
  const { currentChain, chainInfo, isBase, isSolana } = useChain();
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
        // Cast tokenization metadata
        castHash: data.castHash || null,
        castUrl: data.castUrl || null,
        castAuthorFid: data.castAuthorFid || null,
        castAuthorUsername: data.castAuthorUsername || null,
        castText: data.castText || null,
        castLikes: data.castLikes || null,
        castRecasts: data.castRecasts || null,
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
    // Prevent Base token creation when Solana is selected
    if (isSolana) {
      toast({
        title: "Base Network Required",
        description: "Token creation is only available on Base network. Please switch to Base.",
        variant: "destructive",
      });
      return;
    }

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

      // Token is already deployed on blockchain - show success first
      toast({
        title: "Token Deployed! 🚀",
        description: `${data.name} (${data.symbol}) deployed to Base blockchain!`,
      });

      // Try to save to database (non-blocking - blockchain deployment is the important part)
      try {
        await createTokenMutation.mutateAsync(tokenDataWithContract);
        console.log("✅ Token saved to database");
      } catch (dbError: any) {
        console.error("⚠️ Token deployed but database save failed:", dbError);
        // Don't show error to user - token is already on blockchain
      }

      // Open Warpcast compose
      const baseUrl = window.location.origin;
      const tokenUrl = `${baseUrl}/token/${contractAddress}`;
      
      let castText: string;
      
      // If this is a cast tokenization, create special message
      if (data.castUrl && data.castAuthorUsername) {
        // Cast tokenization message - use username for ENS mentions (e.g., jesse.base.eth)
        castText = `🚀 Just tokenized @${data.castAuthorUsername}'s cast on BasedMem!\n\n${data.castUrl}\n\nToken: $${data.symbol}\nTotal Supply: ${parseInt(data.totalSupply).toLocaleString()}\n\n#BasedMem #Farcaster #Base`;
      } else {
        // Regular token launch message
        castText = `🚀 Just deployed ${data.name} ($${data.symbol}) on Base!\n\n${data.description || 'A new meme token with bonding curve!'}\n\nTotal Supply: ${parseInt(data.totalSupply).toLocaleString()}\n\n#BasedMem #MemeCoins #Base`;
      }
      
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
      } else if (errorMsg.includes("symbol already exists") || errorMsg.includes("symbol") && errorMsg.includes("exists")) {
        errorTitle = "Symbol Already Exists";
        errorDescription = "This token symbol is already taken. Please edit the symbol to make it unique (e.g., add numbers).";
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

  if (isSolana) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Rocket className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-black">Token Launch</h1>
            <Badge variant="outline" className="border-purple-500 text-purple-500">
              {chainInfo.icon} Solana
            </Badge>
          </div>
          <p className="text-muted-foreground">Solana Token Launch Options</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Rocket className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Pump.fun</h3>
                <p className="text-sm text-muted-foreground">Most popular Solana token launcher</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Launch meme tokens on Solana with bonding curve mechanics. Most popular platform for Solana meme coins.
            </p>
            <Button asChild className="w-full gap-2">
              <a href="https://pump.fun" target="_blank" rel="noopener noreferrer">
                Launch on Pump.fun
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-lg bg-accent/10">
                <Info className="h-6 w-6 text-accent" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Metaplex</h3>
                <p className="text-sm text-muted-foreground">Professional token creation</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Create SPL tokens with full metadata support. Best for serious projects with customization needs.
            </p>
            <Button asChild variant="outline" className="w-full gap-2">
              <a href="https://www.metaplex.com/" target="_blank" rel="noopener noreferrer">
                Visit Metaplex
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </Card>
        </div>

        <Card className="mt-6 p-4 bg-muted/30">
          <p className="text-sm text-muted-foreground text-center">
            Solana token creation requires SPL Token Program and Metaplex for metadata. 
            Use Base network for one-click token launches with BasedMem.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <h1 className="text-4xl font-black">Launch Your Meme Token</h1>
          <Badge variant="outline" className="border-primary text-primary">
            {chainInfo.icon} Base
          </Badge>
        </div>
        <p className="text-muted-foreground">Create and deploy your token in under 60 seconds</p>
        {isDeploying && (
          <p className="text-sm text-primary mt-2 font-medium">
            Deploying via Farcaster wallet...
          </p>
        )}
      </div>

      <div className="mb-6 flex justify-center">
        <Button
          type="button"
          onClick={handleQuickLaunch}
          disabled={isDeploying || !walletAddress}
          size="lg"
          className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700"
          data-testid="button-quick-launch"
        >
          5-Second Quick Launch
        </Button>
      </div>
      
      <CreateTokenForm onSubmit={handleSubmit} disabled={isDeploying} data-testid="form-create-token" />
    </div>
  );
}
