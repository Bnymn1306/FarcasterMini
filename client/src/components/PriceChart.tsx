import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown } from 'lucide-react';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Line
} from 'recharts';

interface PriceChartProps {
  tokenAddress: string;
  tokenSymbol?: string;
}

interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: string;
  color: string;
}

interface ChartData {
  tokenAddress: string;
  poolAddress: string;
  baseToken: {
    symbol: string;
    name: string;
  };
  quoteToken: {
    symbol: string;
    name: string;
  };
  timeframe: string;
  candles: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

const TIMEFRAMES = [
  { value: 'minute', label: '1H', aggregate: 1, limit: 60 },
  { value: 'hour', label: '24H', aggregate: 1, limit: 24 },
  { value: 'hour', label: '7D', aggregate: 4, limit: 42 }, // 4h candles
  { value: 'day', label: '30D', aggregate: 1, limit: 30 },
];

// Candlestick shape component - Uses actual data values not coordinates
const Candlestick = (props: any) => {
  const { x, y, width, payload, xAxisMap, yAxisMap } = props;
  
  if (!payload || !xAxisMap || !yAxisMap) return null;
  
  const { open, high, low, close } = payload;
  const isGreen = close >= open;
  const color = isGreen ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))';
  
  // Get Y-axis scale to convert data values to pixel coordinates
  const yAxis = yAxisMap[0];
  const yScale = yAxis.scale;
  
  // Convert OHLC values to pixel Y coordinates
  const highY = yScale(high);
  const lowY = yScale(low);
  const openY = yScale(open);
  const closeY = yScale(close);
  
  // Body dimensions
  const bodyTop = Math.min(openY, closeY);
  const bodyBottom = Math.max(openY, closeY);
  const bodyHeight = Math.max(Math.abs(closeY - openY), 1); // Min 1px for doji candles
  
  const candleWidth = Math.min(width * 0.6, 8); // Max 8px width
  const wickX = x + width / 2;
  
  return (
    <g>
      {/* High-Low Wick */}
      <line
        x1={wickX}
        y1={highY}
        x2={wickX}
        y2={lowY}
        stroke={color}
        strokeWidth={1.5}
      />
      {/* Open-Close Body */}
      <rect
        x={x + (width - candleWidth) / 2}
        y={bodyTop}
        width={candleWidth}
        height={bodyHeight}
        fill={isGreen ? color : 'hsl(var(--background))'}
        stroke={color}
        strokeWidth={1.5}
      />
    </g>
  );
};

export function PriceChart({ tokenAddress, tokenSymbol }: PriceChartProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState(TIMEFRAMES[1]); // 24H default

  const { data, isLoading, error } = useQuery<ChartData>({
    queryKey: ['/api/chart', tokenAddress, selectedTimeframe.value, selectedTimeframe.limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        timeframe: selectedTimeframe.value,
        limit: selectedTimeframe.limit.toString()
      });
      const response = await fetch(`/api/chart/${tokenAddress}/ohlcv?${params}`);
      if (!response.ok) throw new Error('Failed to fetch chart data');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30s
    enabled: !!tokenAddress,
  });

  const chartData: CandleData[] = data?.candles.map(candle => {
    const date = new Date(candle.timestamp * 1000);
    let timeLabel = '';
    
    if (selectedTimeframe.label === '1H') {
      timeLabel = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (selectedTimeframe.label === '24H') {
      timeLabel = date.toLocaleTimeString('en-US', { hour: '2-digit' });
    } else if (selectedTimeframe.label === '7D') {
      timeLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      timeLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    return {
      ...candle,
      time: timeLabel,
      color: candle.close >= candle.open ? 'green' : 'red'
    };
  }) || [];

  // Calculate stats with safety checks
  const hasData = chartData.length > 0;
  const currentPrice = hasData ? chartData[chartData.length - 1]?.close : 0;
  const previousPrice = hasData ? chartData[0]?.open : 0;
  const priceChange = currentPrice - previousPrice;
  const priceChangePercent = previousPrice > 0 
    ? ((priceChange / previousPrice) * 100).toFixed(2)
    : '0.00';
  
  const periodHigh = hasData ? Math.max(...chartData.map(c => c.high)) : 0;
  const periodLow = hasData ? Math.min(...chartData.map(c => c.low)) : 0;
  const periodVolume = hasData ? chartData.reduce((sum, c) => sum + c.volume, 0) : 0;
  
  // Dynamic labels based on selected timeframe
  const periodLabel = selectedTimeframe.label === '1H' ? '1H'
    : selectedTimeframe.label === '24H' ? '24H'
    : selectedTimeframe.label === '7D' ? '7D'
    : '30D';

  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-[400px] w-full" />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-6">
        <div className="text-center py-12">
          <div className="mb-4">
            <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <h3 className="text-lg font-semibold mb-2">Chart Data Unavailable</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {tokenSymbol ? (
              <>This token ({tokenSymbol}) doesn't have enough trading history or liquidity pools on Base network to display a chart.</>
            ) : (
              <>Unable to load chart data. This token may not have active trading pairs on Base.</>
            )}
          </p>
        </div>
      </Card>
    );
  }
  
  if (!hasData || chartData.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center py-12">
          <div className="mb-4">
            <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <h3 className="text-lg font-semibold mb-2">No Chart Data</h3>
          <p className="text-sm text-muted-foreground">
            No OHLCV data available for the selected timeframe
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Header with Price Stats */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-2xl font-bold" data-testid="text-chart-price">
                ${currentPrice.toFixed(6)}
              </h3>
              <div className={`flex items-center gap-1 ${parseFloat(priceChangePercent) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {parseFloat(priceChangePercent) >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span className="text-sm font-semibold">
                  {priceChangePercent}%
                </span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {data.baseToken.symbol}/{data.quoteToken.symbol}
            </p>
          </div>

          {/* Timeframe Selector */}
          <div className="flex gap-1">
            {TIMEFRAMES.map((tf) => (
              <Button
                key={tf.label}
                variant={selectedTimeframe.label === tf.label ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setSelectedTimeframe(tf)}
                data-testid={`button-timeframe-${tf.label.toLowerCase()}`}
              >
                {tf.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground mb-1">{periodLabel} High</p>
            <p className="font-semibold">${periodHigh.toFixed(6)}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">{periodLabel} Low</p>
            <p className="font-semibold">${periodLow.toFixed(6)}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">{periodLabel} Volume</p>
            <p className="font-semibold">
              {periodVolume >= 1000000 
                ? `$${(periodVolume / 1000000).toFixed(2)}M`
                : `$${(periodVolume / 1000).toFixed(1)}K`}
            </p>
          </div>
        </div>

        {/* Candlestick Chart */}
        <div className="h-[350px] bg-muted/30 rounded-lg p-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <XAxis
                dataKey="time"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={['dataMin', 'dataMax']}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value.toFixed(4)}`}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number, name: string) => {
                  if (name === 'volume') return [`$${(value / 1000).toFixed(1)}K`, 'Volume'];
                  return [`$${value.toFixed(6)}`, name];
                }}
              />
              
              {/* Candlesticks */}
              <Bar
                dataKey="high"
                shape={<Candlestick />}
                isAnimationActive={false}
              />
              
              {/* Volume bars at bottom */}
              <Bar
                dataKey="volume"
                yAxisId="volume"
                opacity={0.3}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color === 'green' ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))'}
                  />
                ))}
              </Bar>
              
              <YAxis
                yAxisId="volume"
                orientation="right"
                hide
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Live data from DEXScreener & GeckoTerminal
        </p>
      </div>
    </Card>
  );
}
