import { Card } from '@/components/ui/card';
import { Token } from '@/lib/tokens';
import { TrendingUp } from 'lucide-react';

interface TokenChartProps {
  token: Token;
}

export function TokenChart({ token }: TokenChartProps) {
  // DEXScreener embed URL for Base chain
  const chartUrl = `https://dexscreener.com/base/${token.address}?embed=1&theme=dark&trades=0&info=0`;

  return (
    <Card className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-lg">Price Chart</h3>
      </div>

      {/* Chart Embed */}
      <div className="relative w-full bg-muted rounded-lg overflow-hidden" style={{ height: '400px' }}>
        <iframe
          src={chartUrl}
          title={`${token.symbol} Price Chart`}
          className="w-full h-full border-0"
          data-testid="iframe-token-chart"
        />
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground text-center">
        Live data from DEXScreener • Prices may vary across exchanges
      </p>
    </Card>
  );
}
