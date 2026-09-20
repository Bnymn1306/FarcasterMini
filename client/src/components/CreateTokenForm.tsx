import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Upload, Rocket, Sparkles, Crown, CheckCircle2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GasFeeDisplay } from "./GasFeeDisplay";
import sdk from "@farcaster/frame-sdk";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useX402Payment } from "@/hooks/useX402Payment";
import { useWallet } from "@/contexts/WalletContext";
import { SiEthereum } from "react-icons/si";
import { apiRequest } from "@/lib/queryClient";

const STORAGE_KEY = 'basedmem_create_token_draft';

interface CreateTokenFormProps {
  onSubmit?: (data: TokenFormData) => void;
  disabled?: boolean;
}

export interface TokenFormData {
  name: string;
  symbol: string;
  description: string;
  totalSupply: string;
  initialPrice: string;
  logoUrl: string;
  twitterUrl: string;
  telegramUrl: string;
  websiteUrl: string;
  castHash?: string;
  castUrl?: string;
  castAuthorFid?: string;
  castAuthorUsername?: string;
  castText?: string;
  castLikes?: number;
  castRecasts?: number;
  creatorWalletAddress?: string;
}

export function CreateTokenForm({ onSubmit, disabled: externalDisabled }: CreateTokenFormProps) {
  const { toast } = useToast();
  const wallet = useWallet();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [castUrl, setCastUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importedCast, setImportedCast] = useState<any>(null);
  const [lastProcessedUrl, setLastProcessedUrl] = useState('');
  const [isPremiumLaunch, setIsPremiumLaunch] = useState(false);
  const { fetchWithPayment, isPending: isPaymentPending } = useX402Payment();
  
  // Clear cast metadata when cast URL is cleared
  useEffect(() => {
    if (!castUrl && importedCast) {
      setImportedCast(null);
      setFormData(prev => ({
        ...prev,
        castHash: undefined,
        castUrl: undefined,
        castAuthorFid: undefined,
        castAuthorUsername: undefined,
        castAuthorDisplayName: undefined,
        castText: undefined,
        castLikes: undefined,
        castRecasts: undefined,
      }));
    }
  }, [castUrl, importedCast]);
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
          initialPrice: '0.000001',
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
      initialPrice: '0.000001',
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
      // If premium launch is selected, use x402 payment
      if (isPremiumLaunch) {
        // Check if wallet is connected before attempting premium launch
        if (!wallet.isWalletConnected || !wallet.walletAddress) {
          console.log("⚠️ Wallet not connected, attempting to connect...");
          
          // Trigger wallet connection
          try {
            await wallet.connectWallet();
            console.log("✅ Wallet connected successfully");
            toast({
              title: "Wallet Connected",
              description: "Processing Premium Launch...",
            });
            // Don't return - continue with premium launch
          } catch (connectError: any) {
            console.error("❌ Wallet connection failed:", connectError);
            toast({
              title: "Wallet Connection Failed",
              description: "Please connect your wallet to use Premium Launch",
              variant: "destructive",
            });
            setIsCreating(false);
            return;
          }
        }

        // Proceed with premium launch
        try {
          console.log("🚀 Starting premium launch with x402 payment...");
          const result = await fetchWithPayment({
            url: "/api/tokens/premium",
            method: "POST",
            body: formData,
          });

          toast({
            title: "Premium Token Launched!",
            description: "Your token has been created with verified badge and featured placement",
          });

          localStorage.removeItem(STORAGE_KEY);
          onSubmit?.(formData);
          return;
        } catch (error: any) {
          console.error("❌ Premium launch error:", error);
          toast({
            title: "Premium Launch Failed",
            description: error.message || "Failed to process premium launch",
            variant: "destructive",
          });
          setIsCreating(false);
          return;
        }
      }

      // Standard launch flow - ensure wallet is connected
      try {
        if (!wallet.isWalletConnected || !wallet.walletAddress) {
          console.log("⚠️ Wallet not connected, attempting to connect...");
          
          try {
            await wallet.connectWallet();
            console.log("✅ Wallet connected successfully");
            toast({
              title: "Wallet Connected",
              description: "Processing token launch...",
            });
          } catch (connectError: any) {
            console.error("❌ Wallet connection failed:", connectError);
            toast({
              title: "Wallet Connection Required",
              description: "Please connect your wallet to launch a token",
              variant: "destructive",
            });
            setIsCreating(false);
            return;
          }
        }

        // Get provider from WalletContext
        const provider = wallet.getProvider();
        if (!provider) {
          throw new Error("No wallet provider available");
        }

        console.log("📝 Passing form data to Create page for blockchain deployment...");
        
        // Pass form data to Create.tsx for blockchain deployment
        // Create.tsx will handle both blockchain deployment AND database save
        localStorage.removeItem(STORAGE_KEY);
        
        onSubmit?.({
          ...formData,
          creatorWalletAddress: wallet.walletAddress,
        });
        return; // Exit here - Create.tsx handles the rest
      } catch (walletError: any) {
        console.error('❌ Token creation error:', walletError);
        throw walletError;
      }
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

  const handleImportCast = async () => {
    if (!castUrl.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a Farcaster cast URL",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    try {
      const response = await fetch(`/api/cast/fetch?url=${encodeURIComponent(castUrl)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to fetch cast");
      }

      setImportedCast(data);

      // Auto-fill form with cast data from API
      const castText = data.text || "";
      const username = data.authorUsername || "unknown";
      const displayName = data.authorDisplayName || username;
      
      // Extract first 1-2 meaningful words from cast (skip common words)
      const commonWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'in', 'for', 'on', 'at', 'by', 'with', 'from', 'as', 'if', 'or', 'and', 'but']);
      const words = castText.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2 && !commonWords.has(w));
      const firstWord = words[0] || 'cast';
      const capitalizedWord = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
      
      // Generate unique token name using cast content
      const tokenName = `${displayName} ${capitalizedWord} Token`;
      
      // Generate unique symbol using hash for uniqueness (6 char suffix for more uniqueness)
      const hashSuffix = data.hash ? data.hash.slice(-6).toUpperCase() : Date.now().toString().slice(-6);
      const baseSymbol = firstWord.substring(0, 4).toUpperCase().replace(/[^A-Z]/g, '');
      const symbol = baseSymbol.length >= 2 ? `${baseSymbol}${hashSuffix}` : `CAST${hashSuffix}`;

      setFormData(prev => ({
        ...prev,
        name: tokenName,
        symbol: symbol,
        description: castText.substring(0, 500), // Use full cast text as description
        logoUrl: data.authorPfp || prev.logoUrl, // Use author's profile picture
        castHash: data.hash,
        castUrl: data.url || castUrl, // Use canonical URL from Neynar API
        castAuthorFid: data.authorFid,
        castAuthorUsername: username,
        castAuthorDisplayName: displayName,
        castText: castText,
        castLikes: data.likes,
        castRecasts: data.recasts,
      }));

      toast({
        title: "Cast Imported! ✨",
        description: `Tokenizing cast by @${username} - Ready to launch!`,
      });
    } catch (error: any) {
      console.error("Cast import error:", error);
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import cast. Check the URL and try again.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
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

        {/* Cast Tokenization - Import from Warpcast */}
        <div className="p-4 border-2 border-primary/20 rounded-lg bg-primary/5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Tokenize a Farcaster Cast</h3>
            {importedCast && (
              <Badge variant="secondary" className="ml-auto">
                ✅ Cast Linked
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Paste a Farcaster cast URL and click import to auto-fill everything! ✨
          </p>
          <div className="flex gap-2">
            <Input
              value={castUrl}
              onChange={(e) => setCastUrl(e.target.value)}
              placeholder="https://warpcast.com/dwr.eth/0x..."
              data-testid="input-cast-url"
            />
            <Button
              type="button"
              onClick={handleImportCast}
              disabled={isImporting || !castUrl.trim()}
              className="gap-2 whitespace-nowrap"
              data-testid="button-quick-tokenize"
            >
              {isImporting ? "Importing..." : "Quick Tokenize"}
            </Button>
          </div>
          {importedCast && (
            <div className="text-xs text-muted-foreground space-y-1 mt-2">
              <p>📝 "{importedCast.text.substring(0, 80)}..."</p>
              <p>👤 by @{importedCast.authorUsername} • 💜 {importedCast.likes} likes • 🔄 {importedCast.recasts} recasts</p>
            </div>
          )}
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

          <div className="space-y-2">
            <Label htmlFor="initialPrice" className="text-xs uppercase font-semibold">
              Initial Price (ETH) *
            </Label>
            <Input
              id="initialPrice"
              type="number"
              step="0.000001"
              min="0.000001"
              value={formData.initialPrice}
              onChange={(e) => updateField('initialPrice', e.target.value)}
              placeholder="0.000001"
              required
              data-testid="input-initial-price"
            />
            <p className="text-xs text-muted-foreground">
              Starting price per token. Recommended: 0.000001 ETH
            </p>
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

          <div className="space-y-4">
            {/* Premium Launch Selection */}
            <div className="space-y-3">
              <Label className="text-xs uppercase font-semibold">
                Launch Type
              </Label>
              
              {/* Standard Launch Card */}
              <Card 
                className={`p-4 cursor-pointer transition-all hover-elevate ${
                  !isPremiumLaunch 
                    ? 'border-primary border-2 bg-primary/5' 
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setIsPremiumLaunch(false)}
                data-testid="card-standard-launch"
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                    !isPremiumLaunch ? 'border-primary bg-primary' : 'border-muted-foreground'
                  }`}>
                    {!isPremiumLaunch && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <SiEthereum className="h-4 w-4" />
                      <h4 className="font-semibold">Standard Launch</h4>
                      <Badge variant="secondary" className="ml-auto">
                        Gas Only
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Standard token deployment on Base blockchain
                    </p>
                    <div className="mt-2 text-sm font-mono">
                      ~0.00003 ETH gas fee
                    </div>
                  </div>
                </div>
              </Card>

              {/* Premium Launch Card */}
              <Card 
                className={`p-4 cursor-pointer transition-all hover-elevate ${
                  isPremiumLaunch 
                    ? 'border-primary border-2 bg-primary/5' 
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setIsPremiumLaunch(true)}
                data-testid="card-premium-launch"
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                    isPremiumLaunch ? 'border-primary bg-primary' : 'border-muted-foreground'
                  }`}>
                    {isPremiumLaunch && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Crown className="h-4 w-4 text-primary" />
                      <h4 className="font-semibold">Premium Launch</h4>
                      <Badge className="ml-auto bg-gradient-to-r from-primary to-accent text-primary-foreground">
                        $0.05 USDC
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Get verified badge, featured placement, and priority support
                    </p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-3 w-3 text-primary" />
                        <span>✓ Verified Badge</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-3 w-3 text-primary" />
                        <span>✓ Featured on Homepage</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-3 w-3 text-primary" />
                        <span>✓ Priority Support</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Fee Display */}
            {!isPremiumLaunch && (
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Launch Fee</span>
                  <span className="font-mono font-semibold">0.00003 ETH</span>
                </div>
                <GasFeeDisplay gasFee="0.00003" />
              </div>
            )}

            {/* Launch Button */}
            <Button
              type="submit"
              className="w-full gap-2 py-6"
              size="lg"
              disabled={isCreating || isPaymentPending || externalDisabled}
              data-testid="button-create-token"
            >
              {isPremiumLaunch ? (
                <>
                  <Crown className="h-5 w-5" />
                  {isCreating || isPaymentPending || externalDisabled 
                    ? "Processing Premium Launch..." 
                    : "Premium Launch ($0.05 USDC)"}
                </>
              ) : (
                <>
                  <Rocket className="h-5 w-5" />
                  {isCreating || externalDisabled ? "Processing..." : "Launch Token"}
                </>
              )}
            </Button>

            {isPremiumLaunch && (
              <p className="text-xs text-center text-muted-foreground">
                Payment processed securely via x402 protocol on Base L2 • Zero fees
              </p>
            )}
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
