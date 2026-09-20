import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ChevronDown } from 'lucide-react';
import type { Token } from '@/lib/tokens';

interface TradeCardProps {
  role: 'from' | 'to';
  label: string;
  token: Token;
  logoUrl?: string;  // Proxied logo URL (for CORS in Farcaster Frame)
  amount: string;
  balance: string;
  isLoading?: boolean;
  riskLevel?: 'approved' | 'guarded' | 'blocked' | null;
  riskWarnings?: string[];
  showMaxButton?: boolean;
  showQuickAmounts?: boolean;
  readOnly?: boolean;
  onTokenClick: () => void;
  onAmountChange: (value: string) => void;
  onMaxClick?: () => void;
}

export function TradeCard({
  role,
  label,
  token,
  logoUrl,
  amount,
  balance,
  isLoading = false,
  riskLevel,
  riskWarnings = [],
  showMaxButton = false,
  showQuickAmounts = false,
  readOnly = false,
  onTokenClick,
  onAmountChange,
  onMaxClick,
}: TradeCardProps) {
  // Parse balance for quick amount calculations
  const balanceNum = parseFloat(balance.replace(/[^0-9.]/g, '')) || 0;
  
  const handleQuickAmount = (percentage: number) => {
    if (balanceNum > 0) {
      const amount = (balanceNum * percentage / 100).toString();
      onAmountChange(amount);
    }
  };
  return (
    <div className="p-3 sm:p-4 rounded-xl border bg-muted/30">
      {/* Header Label */}
      <Label className="text-xs sm:text-sm text-muted-foreground mb-2 block">{label}</Label>

      {/* Token Selector + Amount Input - Side by side on mobile */}
      <div className="flex items-center gap-2">
        {/* Token Selector Button - Compact */}
        <Button
          type="button"
          variant="ghost"
          className="flex items-center gap-2 h-auto py-2 px-3 bg-card hover-elevate active-elevate-2 shrink-0"
          onClick={onTokenClick}
          data-testid={`button-select-${role}-token`}
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={logoUrl || token.logoURI} alt={token.symbol} />
            <AvatarFallback className="text-sm">{token.symbol[0]}</AvatarFallback>
          </Avatar>
          <div className="text-left">
            <div className="font-bold text-base sm:text-lg leading-tight">{token.symbol}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground truncate max-w-[80px] sm:max-w-[100px]">{token.name}</div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </Button>

        {/* Amount Input - Takes remaining space */}
        <div className="flex-1 min-w-0">
          <Input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="0.0"
            className="text-xl sm:text-2xl h-auto py-2 text-right font-semibold border-0 bg-transparent focus-visible:ring-0"
            readOnly={readOnly}
            data-testid={`input-${role}-amount`}
          />
        </div>
      </div>

      {/* Balance Display */}
      <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground mt-2">
        {isLoading ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Loading...</span>
          </>
        ) : (
          <span>Balance: {balance}</span>
        )}
      </div>
      
      {/* Quick Amount Selection Buttons - More compact */}
      {showQuickAmounts && balanceNum > 0 && !readOnly && (
        <div className="flex gap-1.5 mt-2">
          {[
            { label: '25%', value: 25 },
            { label: '50%', value: 50 },
            { label: '75%', value: 75 },
            { label: 'MAX', value: 100 }
          ].map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => option.value === 100 && onMaxClick ? onMaxClick() : handleQuickAmount(option.value)}
              className="flex-1 h-6 text-[10px] sm:text-xs font-semibold px-2"
              data-testid={`button-quick-${option.label.toLowerCase()}-${role}`}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}

      {/* Risk Badge */}
      {riskLevel && riskLevel !== 'approved' && (
        <div className={`mt-3 p-3 rounded-md text-sm ${
          riskLevel === 'blocked' 
            ? 'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400' 
            : 'bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400'
        }`}>
          <div className="font-semibold mb-1">
            {riskLevel === 'blocked' ? 'High Risk Token' : 'Exercise Caution'}
          </div>
          {riskWarnings.length > 0 && (
            <ul className="text-xs space-y-0.5 opacity-90">
              {riskWarnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
