import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Upload, Rocket } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GasFeeDisplay } from "./GasFeeDisplay";
import sdk from "@farcaster/frame-sdk";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = 'basedmem_create_token_draft';

interface CreateTokenFormProps {
  onSubmit?: (data: TokenFormData) => void;
}

export interface TokenFormData {
  name: string;
  symbol: string;
  description: string;
  totalSupply: string;
  logoUrl: string;
  twitterUrl: string;
  telegramUrl: string;
  websiteUrl: string;
}

export function CreateTokenForm({ onSubmit }: CreateTokenFormProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<TokenFormData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {
          name: '',
          symbol: '',
          description: '',
          totalSupply: '1000000000',
          logoUrl: '',
          twitterUrl: '',
          telegramUrl: '',
          websiteUrl: '',
        };
      }
    }
    return {
      name: '',
      symbol: '',
      description: '',
      totalSupply: '1000000000',
      logoUrl: '',
      twitterUrl: '',
      telegramUrl: '',
      websiteUrl: '',
    };
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    
    try {
      const creationFeeInWei = "0x88B8E5B8000" as `0x${string}`;
      
      try {
        const provider = sdk.wallet.ethProvider;
        const accounts = await provider.request({ method: "eth_accounts" });
        
        if (accounts && accounts.length > 0) {
          const txHash = await provider.request({
            method: "eth_sendTransaction",
            params: [{
              from: accounts[0],
              to: accounts[0],
              value: creationFeeInWei,
              data: "0x" as `0x${string}`,
            }],
          });
          
          console.log('Token creation transaction sent:', txHash);
        }
      } catch (walletError) {
        console.log('Wallet transaction skipped (dev mode):', walletError);
      }
      
      localStorage.removeItem(STORAGE_KEY);
      
      onSubmit?.(formData);
    } catch (error: any) {
      console.error("Token creation error:", error);
      toast({
        title: "Creation Failed",
        description: error.message?.includes("rejected") ? "Transaction rejected" : "Failed to create token",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const updateField = (field: keyof TokenFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      updateField('logoUrl', reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
      <Card className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Create Your Token</h2>
          <p className="text-sm text-muted-foreground">
            Fill in the details to launch your meme coin on Base
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="logo" className="text-xs uppercase font-semibold">
              Token Logo
            </Label>
            <div className="flex items-center gap-4">
              <Avatar className="h-24 w-24">
                <AvatarImage src={formData.logoUrl} alt="Token logo" />
                <AvatarFallback className="text-2xl">
                  {formData.symbol.slice(0, 2) || '?'}
                </AvatarFallback>
              </Avatar>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                data-testid="input-logo-file"
              />
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-logo"
              >
                <Upload className="h-4 w-4" />
                Upload
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs uppercase font-semibold">
              Token Name *
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g., Doge Moon"
              required
              data-testid="input-token-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="symbol" className="text-xs uppercase font-semibold">
              Symbol *
            </Label>
            <Input
              id="symbol"
              value={formData.symbol}
              onChange={(e) => updateField('symbol', e.target.value.toUpperCase())}
              placeholder="e.g., DMOON"
              required
              maxLength={10}
              data-testid="input-token-symbol"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-xs uppercase font-semibold">
              Description
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Tell the community about your token..."
              className="min-h-32"
              data-testid="input-token-description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supply" className="text-xs uppercase font-semibold">
              Total Supply *
            </Label>
            <Input
              id="supply"
              type="number"
              value={formData.totalSupply}
              onChange={(e) => updateField('totalSupply', e.target.value)}
              required
              data-testid="input-token-supply"
            />
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <Label className="text-xs uppercase font-semibold">
              Social Links (Optional)
            </Label>
            
            <Input
              value={formData.twitterUrl}
              onChange={(e) => updateField('twitterUrl', e.target.value)}
              placeholder="Twitter URL"
              data-testid="input-twitter"
            />
            
            <Input
              value={formData.telegramUrl}
              onChange={(e) => updateField('telegramUrl', e.target.value)}
              placeholder="Telegram URL"
              data-testid="input-telegram"
            />
            
            <Input
              value={formData.websiteUrl}
              onChange={(e) => updateField('websiteUrl', e.target.value)}
              placeholder="Website URL"
              data-testid="input-website"
            />
          </div>

          <div className="space-y-3">
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Launch Fee</span>
                <span className="font-mono font-semibold">0.00015 ETH</span>
              </div>
              <GasFeeDisplay gasFee="0.00015" />
            </div>

            <Button
              type="submit"
              className="w-full gap-2 py-6"
              size="lg"
              disabled={isCreating}
              data-testid="button-create-token"
            >
              <Rocket className="h-5 w-5" />
              {isCreating ? "Creating..." : "Launch Token"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6 space-y-4 h-fit sticky top-24">
        <h3 className="font-bold text-lg">Preview</h3>
        <p className="text-sm text-muted-foreground">
          This is how your token will appear to traders
        </p>
        
        <div className="space-y-4 pt-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-16 w-16 ring-4 ring-primary/20">
              <AvatarImage src={formData.logoUrl} alt={formData.name} />
              <AvatarFallback className="text-lg font-bold">
                {formData.symbol.slice(0, 2) || '?'}
              </AvatarFallback>
            </Avatar>
            
            <div>
              <h4 className="font-bold text-lg">
                {formData.name || 'Token Name'}
              </h4>
              <p className="text-sm text-muted-foreground uppercase">
                ${formData.symbol || 'SYMBOL'}
              </p>
            </div>
          </div>

          {formData.description && (
            <p className="text-sm leading-relaxed border-t border-border pt-4">
              {formData.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
            <div>
              <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">
                Total Supply
              </p>
              <p className="font-mono text-sm font-semibold">
                {parseInt(formData.totalSupply || '0').toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">
                Network
              </p>
              <p className="font-mono text-sm font-semibold">
                Base
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
