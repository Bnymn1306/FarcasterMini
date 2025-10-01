import { CreateTokenForm } from "@/components/CreateTokenForm";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useWallet } from "@/contexts/WalletContext";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { InsertToken } from "@shared/schema";

export default function Create() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { walletAddress } = useWallet();

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
    try {
      console.log("Submitting token to API:", data);
      const result = await createTokenMutation.mutateAsync(data);
      console.log("Token saved successfully:", result);
      
      toast({
        title: "Token Launched! 🚀",
        description: `${data.name} (${data.symbol}) has been successfully created on Base.`,
      });

      const baseUrl = window.location.origin;
      const tokenUrl = `${baseUrl}/browse`;
      const castText = `🚀 Just launched ${data.name} ($${data.symbol}) on Base!\n\n${data.description || 'A new meme token is born!'}\n\nTotal Supply: ${parseInt(data.totalSupply).toLocaleString()}\n\n#BasedMem #MemeCoins #Base`;

      const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(tokenUrl)}`;

      try {
        const sdk = (await import("@farcaster/frame-sdk")).default;
        await sdk.actions.openUrl(warpcastUrl);
      } catch (error) {
        console.log("SDK not available, opening in new tab:", error);
        window.open(warpcastUrl, '_blank');
      }

      setTimeout(() => {
        setLocation('/browse');
      }, 3000);
    } catch (error: any) {
      console.error("Error saving token:", error);
      
      let errorMessage = "Failed to save token to database";
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.toString) {
        errorMessage = error.toString();
      }
      
      toast({
        title: "Save Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black mb-2">Launch Your Meme Token</h1>
        <p className="text-muted-foreground">Create and deploy your token in under 60 seconds</p>
      </div>
      
      <CreateTokenForm onSubmit={handleSubmit} />
    </div>
  );
}
