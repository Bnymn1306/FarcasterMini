import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { ArrowDownUp } from "lucide-react";
import { GasFeeDisplay } from "./GasFeeDisplay";
import type { Token } from "@shared/schema";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface TradingInterfaceProps {
  token: Token;
  userBalance?: string;
  userTokenBalance?: string;
  onBuy?: (amount: string) => void;
  onSell?: (amount: string) => void;
  isLoading?: boolean;
}

export function TradingInterface({ 
  token, 
  userBalance = "1.5",
  userTokenBalance = "0",
  onBuy,
  onSell,
  isLoading = false
}: TradingInterfaceProps) {
  const [buyAmount, setBuyAmount] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [buySliderValue, setBuySliderValue] = useState([50]);
  const [sellSliderValue, setSellSliderValue] = useState([50]);
  const [chartPeriod, setChartPeriod] = useState("24H");
  const [sellPriceETH, setSellPriceETH] = useState("0");

  // Initialize buyAmount based on initial slider value
  useEffect(() => {
    const initialBuyAmount = ((parseFloat(userBalance) * buySliderValue[0]) / 100).toFixed(4);
    setBuyAmount(initialBuyAmount);
    console.log('Initial buyAmount set to:', initialBuyAmount);
  }, [userBalance]);

  // Initialize sellAmount based on initial slider value
  useEffect(() => {
    const initialSellAmount = ((parseFloat(userTokenBalance) * sellSliderValue[0]) / 100).toFixed(2);
    setSellAmount(initialSellAmount);
    console.log('Initial sellAmount set to:', initialSellAmount);
  }, [userTokenBalance]);

  // Memoize provider and contract to avoid recreation on every render
  const { provider: memoizedProvider, contract: memoizedContract } = useMemo(() => {
    if (!token.contractAddress) {
      return { provider: null, contract: null };
    }

    let provider: any = null;
    let contract: any = null;

    (async () => {
      const { JsonRpcProvider, Contract } = await import("ethers");
      const { BONDING_CURVE_TOKEN_ABI } = await import("@/lib/contracts");
      
      provider = new JsonRpcProvider("https://mainnet.base.org");
      contract = new Contract(token.contractAddress!, BONDING_CURVE_TOKEN_ABI, provider);
    })();

    return { provider, contract };
  }, [token.contractAddress]);

  // Calculate sell price using bonding curve getSellPrice() with debounce
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (!sellAmount || parseFloat(sellAmount) <= 0 || !token.contractAddress) {
        setSellPriceETH("0");
        return;
      }

      try {
        const { Contract, parseUnits, formatUnits, JsonRpcProvider } = await import("ethers");
        const { BONDING_CURVE_TOKEN_ABI } = await import("@/lib/contracts");
        
        // Use Base RPC to query contract
        const provider = new JsonRpcProvider("https://mainnet.base.org");
        const contract = new Contract(token.contractAddress, BONDING_CURVE_TOKEN_ABI, provider);
        
        // Convert sell amount to wei and get sell price
        const tokenAmountWei = parseUnits(sellAmount, 18);
        const sellPriceWei = await contract.getSellPrice(tokenAmountWei);
        const sellPriceFormatted = formatUnits(sellPriceWei, 18);
        
        setSellPriceETH(sellPriceFormatted);
      } catch (error) {
        console.error("Error fetching sell price:", error);
        setSellPriceETH("0");
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [sellAmount, token.contractAddress]);

  const handleBuy = () => {
    console.log('=== BUY CLICKED ===');
    console.log('buyAmount:', buyAmount);
    console.log('token.symbol:', token.symbol);
    console.log('onBuy function exists?', !!onBuy);
    
    if (!buyAmount || parseFloat(buyAmount) <= 0) {
      console.error('Invalid buy amount:', buyAmount);
      return;
    }
    
    onBuy?.(buyAmount);
  };

  const handleSell = () => {
    console.log('=== SELL CLICKED ===');
    console.log('sellAmount:', sellAmount);
    console.log('token.symbol:', token.symbol);
    console.log('onSell function exists?', !!onSell);
    
    if (!sellAmount || parseFloat(sellAmount) <= 0) {
      console.error('Invalid sell amount:', sellAmount);
      return;
    }
    
    onSell?.(sellAmount);
  };

  const updateBuyFromSlider = (value: number[]) => {
    setBuySliderValue(value);
    const calculatedAmount = ((parseFloat(userBalance) * value[0]) / 100).toFixed(4);
    setBuyAmount(calculatedAmount);
  };

  const updateSellFromSlider = (value: number[]) => {
    setSellSliderValue(value);
    const calculatedAmount = ((parseFloat(userTokenBalance) * value[0]) / 100).toFixed(2);
    setSellAmount(calculatedAmount);
  };

  const formatPrice = (price: string) => {
    const value = parseFloat(price);
    if (value < 0.01) return `$${value.toFixed(6)}`;
    return `$${value.toFixed(4)}`;
  };

  const generatePriceHistory = (period: string) => {
    const basePrice = parseFloat(token.currentPrice);
    const points = period === "1H" ? 12 : period === "24H" ? 24 : period === "7D" ? 7 : 30;
    const volatility = 0.05;
    
    const data = [];
    for (let i = 0; i < points; i++) {
      const randomChange = (Math.random() - 0.5) * volatility;
      const price = basePrice * (1 + randomChange - 0.1 + (i / points) * 0.2);
      
      let timeLabel = "";
      if (period === "1H") {
        timeLabel = `${i * 5}m`;
      } else if (period === "24H") {
        timeLabel = `${i}h`;
      } else if (period === "7D") {
        timeLabel = `D${i + 1}`;
      } else {
        timeLabel = `D${i + 1}`;
      }
      
      data.push({
        time: timeLabel,
        price: parseFloat(price.toFixed(6)),
      });
    }
    return data;
  };

  const priceHistory = useMemo(() => generatePriceHistory(chartPeriod), [chartPeriod, token.currentPrice]);

  return (
    <Card className="p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-xl">{token.name}</h3>
          <span className="font-mono font-semibold text-2xl text-primary">
            {formatPrice(token.currentPrice)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground uppercase">
          ${token.symbol}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-muted-foreground">Price Chart</p>
          <div className="flex gap-1">
            {['1H', '24H', '7D', '30D'].map((period) => (
              <Button 
                key={period} 
                variant={chartPeriod === period ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setChartPeriod(period)}
                data-testid={`chart-period-${period.toLowerCase()}`}
              >
                {period}
              </Button>
            ))}
          </div>
        </div>
        
        <div className="h-64 bg-muted/30 rounded-lg p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={priceHistory}>
              <XAxis 
                dataKey="time" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value.toFixed(4)}`}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number) => [`$${value.toFixed(6)}`, "Price"]}
              />
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={false}
                animationDuration={300}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <Tabs defaultValue="buy" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="buy" data-testid="tab-buy">Buy</TabsTrigger>
          <TabsTrigger value="sell" data-testid="tab-sell">Sell</TabsTrigger>
        </TabsList>

        <TabsContent value="buy" className="space-y-4 mt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="buy-amount" className="text-xs uppercase font-semibold">
                Amount
              </Label>
              <span className="text-xs text-muted-foreground">
                Balance: {userBalance} ETH
              </span>
            </div>
            <div className="relative">
              <Input
                id="buy-amount"
                type="number"
                value={buyAmount}
                onChange={(e) => {
                  const value = e.target.value;
                  setBuyAmount(value);
                  if (value && userBalance) {
                    const percentage = (parseFloat(value) / parseFloat(userBalance)) * 100;
                    setBuySliderValue([Math.min(100, Math.max(0, percentage))]);
                  }
                }}
                placeholder="0.0"
                className="pr-16"
                data-testid="input-buy-amount"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                ETH
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase font-semibold">Quick Select</Label>
            <Slider
              value={buySliderValue}
              onValueChange={updateBuyFromSlider}
              max={100}
              step={25}
              className="py-4"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">You'll receive</span>
              <span className="font-mono font-semibold">
                ~{buyAmount ? (parseFloat(buyAmount) / parseFloat(token.currentPrice)).toFixed(2) : '0'} {token.symbol}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Price impact</span>
              <span className="font-mono text-chart-2">~0.5%</span>
            </div>
            <div className="pt-2 border-t border-border">
              <GasFeeDisplay gasFee="0.00012" />
            </div>
          </div>

          <Button
            onClick={handleBuy}
            className="w-full py-6 bg-chart-2 hover:bg-chart-2/90"
            size="lg"
            disabled={isLoading || !buyAmount || parseFloat(buyAmount) <= 0}
            data-testid="button-buy"
          >
            <ArrowDownUp className="h-5 w-5 mr-2" />
            {isLoading ? "Processing..." : `Buy ${token.symbol}`}
          </Button>
        </TabsContent>

        <TabsContent value="sell" className="space-y-4 mt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="sell-amount" className="text-xs uppercase font-semibold">
                Amount
              </Label>
              <span className="text-xs text-muted-foreground">
                Balance: {userTokenBalance} {token.symbol}
              </span>
            </div>
            <div className="relative">
              <Input
                id="sell-amount"
                type="number"
                value={sellAmount}
                onChange={(e) => {
                  const value = e.target.value;
                  setSellAmount(value);
                  if (value && userTokenBalance) {
                    const percentage = (parseFloat(value) / parseFloat(userTokenBalance)) * 100;
                    setSellSliderValue([Math.min(100, Math.max(0, percentage))]);
                  }
                }}
                placeholder="0.0"
                className="pr-20"
                data-testid="input-sell-amount"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                {token.symbol}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase font-semibold">Quick Select</Label>
            <Slider
              value={sellSliderValue}
              onValueChange={updateSellFromSlider}
              max={100}
              step={25}
              className="py-4"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">You'll receive</span>
              <span className="font-mono font-semibold">
                ~{parseFloat(sellPriceETH).toFixed(6)} ETH
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Price impact</span>
              <span className="font-mono text-chart-2">~0.5%</span>
            </div>
            <div className="pt-2 border-t border-border">
              <GasFeeDisplay gasFee="0.00012" />
            </div>
          </div>

          <Button
            onClick={handleSell}
            variant="destructive"
            className="w-full py-6"
            size="lg"
            disabled={isLoading || !sellAmount || parseFloat(sellAmount) <= 0}
            data-testid="button-sell"
          >
            <ArrowDownUp className="h-5 w-5 mr-2" />
            {isLoading ? "Processing..." : `Sell ${token.symbol}`}
          </Button>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
