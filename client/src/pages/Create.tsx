import { CreateTokenForm } from "@/components/CreateTokenForm";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function Create() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleSubmit = (data: any) => {
    console.log('Creating token:', data);
    toast({
      title: "Token Launched! 🚀",
      description: `${data.name} (${data.symbol}) has been successfully created on Base.`,
    });
    setTimeout(() => {
      setLocation('/browse');
    }, 2000);
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
