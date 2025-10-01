import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Upload, Rocket } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GasFeeDisplay } from "./GasFeeDisplay";

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
  const [formData, setFormData] = useState<TokenFormData>({
    name: '',
    symbol: '',
    description: '',
    totalSupply: '1000000000',
    logoUrl: '',
    twitterUrl: '',
    telegramUrl: '',
    websiteUrl: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Token creation:', formData);
    onSubmit?.(formData);
  };

  const updateField = (field: keyof TokenFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  const url = prompt('Enter image URL:');
                  if (url) updateField('logoUrl', url);
                }}
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
              data-testid="button-create-token"
            >
              <Rocket className="h-5 w-5" />
              Launch Token
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
