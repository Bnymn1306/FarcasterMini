import { CreateTokenForm } from "@/components/CreateTokenForm";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function Create() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleSubmit = async (data: any) => {
    console.log('Creating token:', data);
    
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
