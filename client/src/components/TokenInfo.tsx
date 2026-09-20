import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Copy, CheckCircle2 } from 'lucide-react';
import { Token } from '@/lib/tokens';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface TokenInfoProps {
  token: Token;
}

export function TokenInfo({ token }: TokenInfoProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(token.address);
      setCopied(true);
      toast({
        title: 'Address Copied',
        description: `${token.symbol} contract address copied to clipboard`,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy address to clipboard',
        variant: 'destructive',
      });
    }
  };

  const explorerUrl = `https://basescan.org/token/${token.address}`;

  return (
    <Card className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {token.logoURI ? (
            <img src={token.logoURI} alt={token.symbol} className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">{token.symbol[0]}</span>
            </div>
          )}
          <div>
            <h3 className="font-semibold text-lg" data-testid="text-token-name">{token.name}</h3>
            <Badge variant="secondary" className="text-xs" data-testid="badge-token-symbol">
              {token.symbol}
            </Badge>
          </div>
        </div>
      </div>

      {/* Contract Address */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Contract Address</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-muted rounded-md text-xs font-mono truncate" data-testid="text-contract-address">
            {token.address}
          </code>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleCopyAddress}
            className="flex-shrink-0"
            data-testid="button-copy-address"
          >
            {copied ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => window.open(explorerUrl, '_blank')}
            className="flex-shrink-0"
            data-testid="button-explorer"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Token Metadata */}
      <div className="grid grid-cols-2 gap-4 pt-2">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Chain</p>
          <p className="text-sm font-medium" data-testid="text-chain">Base</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Decimals</p>
          <p className="text-sm font-medium" data-testid="text-decimals">{token.decimals}</p>
        </div>
      </div>

      {/* DEXScreener Link */}
      <Button
        variant="outline"
        className="w-full"
        onClick={() => window.open(`https://dexscreener.com/base/${token.address}`, '_blank')}
        data-testid="button-view-chart"
      >
        <ExternalLink className="h-4 w-4 mr-2" />
        View on DEXScreener
      </Button>
    </Card>
  );
}
